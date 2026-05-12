'use client'

// app/entrada/page.tsx
// Celular del trabajador: ingresa carnet + PIN de 5 dígitos.
// El primer dígito del PIN identifica la sucursal.
// El PIN se invalida tras el primer uso.

import { useState } from 'react'
import { supabase } from '../../lib/supabase'

type Resultado = {
  tipo:           'entrada' | 'salida'
  nombre:         string
  sucursal:       string
  hora:           string
  tipoAsistencia: string
  minutosRetraso: number
}

const TIPO_LABEL: Record<string, { texto: string; color: string }> = {
  puntual:      { texto: 'Puntual ✓',        color: '#22c55e' },
  retraso_leve: { texto: 'Retraso leve ⚠',   color: '#f59e0b' },
  retraso_grave:{ texto: 'Retraso grave ⚠',  color: '#f97316' },
  media_falta:  { texto: 'Media falta ✗',    color: '#ef4444' },
}

export default function EntradaPersonal() {
  const [carnet,    setCarnet]    = useState('')
  const [pin,       setPin]       = useState('')
  const [cargando,  setCargando]  = useState(false)
  const [error,     setError]     = useState('')
  const [resultado, setResultado] = useState<Resultado | null>(null)

  const limpiar = () => {
    setCarnet(''); setPin(''); setError(''); setResultado(null)
  }

  const registrar = async () => {
    setError('')
    if (!carnet.trim())     return setError('Ingresa tu carnet')
    if (pin.length !== 5)   return setError('El código tiene 5 dígitos')
    if (!/^\d+$/.test(pin)) return setError('Solo números')

    const sucursalId = Number(pin[0])
    if (sucursalId < 1 || sucursalId > 9) return setError('Código inválido')

    setCargando(true)
    try {
      // 1. Validar PIN activo, de esa sucursal, no expirado
      const { data: pinData } = await supabase
        .from('codigos_acceso')
        .select('id, sucursal_id, expira_at')
        .eq('codigo',      pin)
        .eq('sucursal_id', sucursalId)
        .eq('activo',      true)
        .gt('expira_at',   new Date().toISOString())
        .single()

      if (!pinData) {
        setCargando(false)
        return setError('Código incorrecto o expirado. Pide un nuevo código al encargado.')
      }

      // 2. Buscar trabajador
      const { data: persona } = await supabase
        .from('personal')
        .select('id, usuario, carnet, cargo_id')
        .eq('carnet', carnet.trim())
        .eq('estado', true)
        .single()

      if (!persona) {
        setCargando(false)
        return setError('Carnet no encontrado o trabajador inactivo.')
      }

      // 3. Nombre de sucursal
      const { data: suc } = await supabase
        .from('sucursales')
        .select('nombre')
        .eq('id', sucursalId)
        .single()

      const hoy   = new Date().toISOString().split('T')[0]
      const ahora = new Date()
      const horaStr = ahora.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })

      // 4. ¿Ya tiene registro hoy?
      const { data: registroHoy } = await supabase
        .from('registros_asistencia')
        .select('id, hora_entrada, hora_salida')
        .eq('personal_id', persona.id)
        .eq('fecha', hoy)
        .single()

      // ── INVALIDAR PIN tras uso ─────────────────────────────────────────
      await supabase.from('codigos_acceso')
        .update({ activo: false })
        .eq('id', pinData.id)

      if (!registroHoy) {
        // ── ENTRADA ───────────────────────────────────────────────────────
        const { data: turno } = await supabase
          .from('turnos')
          .select('hora_entrada, tolerancia_min')
          .eq('cargo_id',    persona.cargo_id)
          .eq('sucursal_id', sucursalId)
          .maybeSingle()

        let minutosRetraso  = 0
        let tipoAsistencia  = 'puntual'

        if (turno) {
          const [h, m]     = turno.hora_entrada.split(':').map(Number)
          const esperada   = new Date(ahora)
          esperada.setHours(h, m, 0, 0)
          const tolerancia = turno.tolerancia_min || 15
          const diff       = Math.floor((ahora.getTime() - esperada.getTime()) / 60000)

          if      (diff <= 0)           tipoAsistencia = 'puntual'
          else if (diff <= tolerancia)  { tipoAsistencia = 'retraso_leve';  minutosRetraso = diff }
          else if (diff <= 30)          { tipoAsistencia = 'retraso_grave'; minutosRetraso = diff }
          else                          { tipoAsistencia = 'media_falta';   minutosRetraso = diff }
        }

        await supabase.from('registros_asistencia').insert({
          personal_id:     persona.id,
          sucursal_id:     sucursalId,
          fecha:           hoy,
          hora_entrada:    ahora.toISOString(),
          tipo:            tipoAsistencia,
          minutos_retraso: minutosRetraso,
          es_sabado:       ahora.getDay() === 6,
        })

        setResultado({ tipo: 'entrada', nombre: persona.usuario || persona.carnet, sucursal: suc?.nombre || '', hora: horaStr, tipoAsistencia, minutosRetraso })

      } else if (!registroHoy.hora_salida) {
        // ── SALIDA ────────────────────────────────────────────────────────
        const { data: turno } = await supabase
          .from('turnos')
          .select('hora_salida')
          .eq('cargo_id',    persona.cargo_id)
          .eq('sucursal_id', sucursalId)
          .maybeSingle()

        let minutosExtra = 0
        if (turno) {
          const [h, m]       = turno.hora_salida.split(':').map(Number)
          const salidaNormal = new Date(ahora)
          salidaNormal.setHours(h, m, 0, 0)
          const extra        = Math.floor((ahora.getTime() - salidaNormal.getTime()) / 60000)
          if (extra > 15) minutosExtra = extra
        }

        await supabase.from('registros_asistencia')
          .update({ hora_salida: ahora.toISOString(), minutos_extra: minutosExtra })
          .eq('id', registroHoy.id)

        setResultado({ tipo: 'salida', nombre: persona.usuario || persona.carnet, sucursal: suc?.nombre || '', hora: horaStr, tipoAsistencia: 'puntual', minutosRetraso: 0 })

      } else {
        setCargando(false)
        return setError('Ya registraste entrada y salida hoy. Contacta a RRHH si hay un error.')
      }

    } catch (e: any) {
      console.error(e)
      setError('Error de conexión. Intenta nuevamente.')
    } finally {
      setCargando(false)
    }
  }

  // ── Pantalla éxito ────────────────────────────────────────────────────────
  if (resultado) {
    const esEntrada  = resultado.tipo === 'entrada'
    const estadoInfo = TIPO_LABEL[resultado.tipoAsistencia] || TIPO_LABEL['puntual']
    const colorAcc   = esEntrada ? '#22c55e' : '#3b82f6'
    const bgAcc      = esEntrada ? '#0a1a0f' : '#0a0f1a'
    const borderAcc  = esEntrada ? '#14532d' : '#1e3a5f'

    return (
      <div style={{
        minHeight: '100vh', backgroundColor: bgAcc,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '32px', fontFamily: 'Georgia, serif', textAlign: 'center',
      }}>
        {/* Check */}
        <div style={{
          width: '88px', height: '88px', borderRadius: '50%',
          backgroundColor: '#111', border: `2px solid ${colorAcc}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '36px', marginBottom: '28px',
          boxShadow: `0 0 48px ${colorAcc}22`,
          color: colorAcc, fontWeight: 'bold',
        }}>✓</div>

        <p style={{ color: colorAcc, fontSize: '10px', letterSpacing: '0.3em', textTransform: 'uppercase', margin: '0 0 8px' }}>
          {esEntrada ? 'Entrada registrada' : 'Salida registrada'}
        </p>
        <h1 style={{ color: 'white', fontSize: '26px', margin: '0 0 4px', fontWeight: 'bold' }}>
          {resultado.nombre}
        </h1>
        <p style={{ color: '#444', fontSize: '13px', margin: '0 0 28px' }}>📍 {resultado.sucursal}</p>

        {/* Hora */}
        <div style={{
          backgroundColor: '#111', border: '1px solid #1e1e1e',
          borderRadius: '20px', padding: '20px 48px', marginBottom: '20px',
        }}>
          <p style={{ color: '#333', fontSize: '10px', letterSpacing: '0.2em', margin: '0 0 4px', textTransform: 'uppercase' }}>
            {esEntrada ? 'Hora de entrada' : 'Hora de salida'}
          </p>
          <p style={{ color: 'white', fontSize: '40px', fontWeight: 'bold', margin: 0, fontFamily: 'monospace' }}>
            {resultado.hora}
          </p>
        </div>

        {/* Estado asistencia */}
        {esEntrada && (
          <div style={{
            backgroundColor: '#111', border: `1px solid ${borderAcc}`,
            borderRadius: '14px', padding: '10px 24px', marginBottom: '28px',
          }}>
            <p style={{ color: estadoInfo.color, fontSize: '13px', margin: 0, fontWeight: 'bold' }}>
              {estadoInfo.texto}
              {resultado.minutosRetraso > 0 && ` — ${resultado.minutosRetraso} min`}
            </p>
          </div>
        )}

        <button onClick={limpiar} style={{
          backgroundColor: 'transparent', border: `1px solid #1e1e1e`,
          borderRadius: '14px', padding: '14px 40px',
          color: '#333', fontSize: '13px', cursor: 'pointer', letterSpacing: '0.1em',
        }}>
          Registrar otro →
        </button>
      </div>
    )
  }

  // ── Formulario ────────────────────────────────────────────────────────────
  return (
    <div style={{
      minHeight: '100vh', backgroundColor: '#0a0a0a',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '32px', fontFamily: 'Georgia, serif',
    }}>
      {/* Logo */}
      <div style={{ textAlign: 'center', marginBottom: '44px' }}>
        <p style={{ color: '#222', fontSize: '10px', letterSpacing: '0.3em', textTransform: 'uppercase', margin: '0 0 6px' }}>
          Muebless is Better
        </p>
        <h1 style={{ color: 'white', fontSize: '20px', margin: 0, fontWeight: 'bold' }}>
          Registro de Asistencia
        </h1>
      </div>

      {/* Card */}
      <div style={{
        backgroundColor: '#111', border: '1px solid #1a1a1a',
        borderRadius: '28px', padding: '36px 28px',
        width: '100%', maxWidth: '340px',
      }}>

        {/* Carnet */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ color: '#333', fontSize: '10px', letterSpacing: '0.2em', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>
            Carnet de Identidad
          </label>
          <input
            type="text" inputMode="numeric"
            value={carnet}
            onChange={e => { setCarnet(e.target.value); setError('') }}
            placeholder="Ej: 7654321"
            onKeyDown={e => e.key === 'Enter' && registrar()}
            style={{
              width: '100%', backgroundColor: '#0d0d0d',
              border: '1px solid #1e1e1e', borderRadius: '14px',
              padding: '14px 16px', color: 'white', fontSize: '18px',
              fontFamily: 'monospace', fontWeight: 'bold', outline: 'none',
              boxSizing: 'border-box', letterSpacing: '0.08em',
            }}
          />
        </div>

        {/* PIN */}
        <div style={{ marginBottom: '24px' }}>
          <label style={{ color: '#333', fontSize: '10px', letterSpacing: '0.2em', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>
            Código de la pantalla
          </label>
          <input
            type="text" inputMode="numeric" maxLength={5}
            value={pin}
            onChange={e => { setPin(e.target.value.replace(/\D/g, '')); setError('') }}
            placeholder="_ _ _ _ _"
            onKeyDown={e => e.key === 'Enter' && registrar()}
            style={{
              width: '100%', backgroundColor: '#0d0d0d',
              border: `1px solid ${error ? '#7f1d1d' : '#1e1e1e'}`,
              borderRadius: '14px', padding: '14px 16px',
              color: 'white', fontSize: '34px', fontFamily: 'monospace',
              fontWeight: 'bold', outline: 'none', boxSizing: 'border-box',
              textAlign: 'center', letterSpacing: '0.4em',
            }}
          />
        </div>

        {/* Error */}
        {error && (
          <div style={{
            backgroundColor: '#0f0505', border: '1px solid #7f1d1d',
            borderRadius: '12px', padding: '11px 16px', marginBottom: '18px',
          }}>
            <p style={{ color: '#ef4444', fontSize: '13px', margin: 0 }}>⚠ {error}</p>
          </div>
        )}

        {/* Botón */}
        <button
          onClick={registrar} disabled={cargando}
          style={{
            width: '100%',
            backgroundColor: cargando ? '#141414' : 'white',
            border: 'none', borderRadius: '16px', padding: '16px',
            color: cargando ? '#333' : '#0a0a0a',
            fontSize: '13px', fontWeight: 'bold',
            cursor: cargando ? 'not-allowed' : 'pointer',
            letterSpacing: '0.2em', textTransform: 'uppercase',
            transition: 'all 0.2s', fontFamily: 'Georgia, serif',
          }}
        >
          {cargando ? 'Verificando...' : 'Registrar →'}
        </button>
      </div>

      <p style={{ color: '#1a1a1a', fontSize: '11px', textAlign: 'center', marginTop: '28px', letterSpacing: '0.1em', lineHeight: 1.9 }}>
        El código está en la pantalla<br />de la entrada de tu sucursal.
      </p>
    </div>
  )
}
