'use client'

// app/entrada/kiosco/page.tsx
// PC fija de cada sucursal. El encargado presiona "Generar Código"
// → PIN de 5 dígitos aparece en pantalla → dura 2 minutos → se invalida tras primer uso.

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../lib/supabase'

type Sucursal = { id: number; nombre: string }

export default function KioscoPIN() {
  const [sucursalId,   setSucursalId]   = useState<number | null>(null)
  const [sucursales,   setSucursales]   = useState<Sucursal[]>([])
  const [pin,          setPin]          = useState('')
  const [segundos,     setSegundos]     = useState(0)
  const [generando,    setGenerando]    = useState(false)
  const [configurando, setConfigurando] = useState(false)
  const [hora,         setHora]         = useState('')
  const [fecha,        setFecha]        = useState('')
  const [ultimoUso,    setUltimoUso]    = useState('')

  // ── Sucursal guardada ─────────────────────────────────────────────────────
  useEffect(() => {
    const id = localStorage.getItem('kiosco_sucursal_id')
    if (id) setSucursalId(Number(id))
    else setConfigurando(true)
  }, [])

  useEffect(() => {
    supabase.from('sucursales').select('id, nombre').eq('activo', true).lte('id', 9)
      .then(({ data }) => setSucursales(data || []))
  }, [])

  // ── Reloj ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const tick = () => {
      const n = new Date()
      setHora(n.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
      setFecha(n.toLocaleDateString('es-BO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  // ── Cuenta regresiva ──────────────────────────────────────────────────────
  useEffect(() => {
    if (segundos <= 0) return
    const id = setInterval(() => {
      setSegundos(s => {
        if (s <= 1) { setPin(''); return 0 }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [segundos])

  // ── Escuchar registro exitoso en tiempo real ──────────────────────────────
  useEffect(() => {
    if (!sucursalId) return
    const canal = supabase.channel('kiosco-live')
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'registros_asistencia',
        filter: `sucursal_id=eq.${sucursalId}`,
      }, payload => {
        const hora = new Date((payload.new as any).created_at)
          .toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })
        setUltimoUso(`✓ Registro exitoso — ${hora}`)
        setPin('')
        setSegundos(0)
      })
      .subscribe()
    return () => { supabase.removeChannel(canal) }
  }, [sucursalId])

  // ── Generar PIN ───────────────────────────────────────────────────────────
  const generarPin = async () => {
    if (!sucursalId || generando) return
    setGenerando(true)
    try {
      const codigo  = `${sucursalId}${Math.floor(1000 + Math.random() * 9000)}`
      const ahora   = new Date()
      const expira  = new Date(ahora.getTime() + 2 * 60 * 1000)

      await supabase.from('codigos_acceso')
        .update({ activo: false })
        .eq('sucursal_id', sucursalId).eq('activo', true)

      const { error } = await supabase.from('codigos_acceso').insert({
        sucursal_id: sucursalId, codigo,
        generado_at: ahora.toISOString(),
        expira_at:   expira.toISOString(),
        activo:      true,
      })

      if (!error) { setPin(codigo); setSegundos(120); setUltimoUso('') }
    } catch (e) { console.error(e) }
    finally { setGenerando(false) }
  }

  const guardarSucursal = (id: number) => {
    localStorage.setItem('kiosco_sucursal_id', String(id))
    setSucursalId(id); setConfigurando(false)
  }

  const nombreSuc = sucursales.find(s => s.id === sucursalId)?.nombre || ''
  const minutos   = String(Math.floor(segundos / 60)).padStart(2, '0')
  const segs      = String(segundos % 60).padStart(2, '0')
  const pinActivo = pin && segundos > 0

  // ── Config ────────────────────────────────────────────────────────────────
  if (configurando) return (
    <div style={{
      minHeight: '100vh', backgroundColor: '#0a0a0a',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'Georgia, serif',
    }}>
      <div style={{
        backgroundColor: '#111', border: '1px solid #1e1e1e',
        borderRadius: '24px', padding: '48px', maxWidth: '380px', width: '100%', textAlign: 'center',
      }}>
        <div style={{ fontSize: '36px', marginBottom: '16px' }}>⚙️</div>
        <h2 style={{ color: 'white', margin: '0 0 8px', fontSize: '18px' }}>Configurar Kiosco</h2>
        <p style={{ color: '#444', fontSize: '13px', marginBottom: '28px' }}>
          Selecciona la sucursal de esta PC.<br />Solo se configura una vez.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {sucursales.map(s => (
            <button key={s.id} onClick={() => guardarSucursal(s.id)} style={{
              backgroundColor: '#1a1a1a', border: '1px solid #252525',
              borderRadius: '14px', padding: '16px', color: 'white',
              fontSize: '15px', fontWeight: 'bold', cursor: 'pointer',
            }}>
              {s.nombre}
            </button>
          ))}
        </div>
      </div>
    </div>
  )

  // ── Kiosco principal ──────────────────────────────────────────────────────
  return (
    <div style={{
      minHeight: '100vh', backgroundColor: '#0a0a0a',
      display: 'flex', flexDirection: 'column',
      fontFamily: 'Georgia, serif', userSelect: 'none',
    }}>

      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '20px 48px', borderBottom: '1px solid #111',
      }}>
        <div>
          <p style={{ color: '#2a2a2a', fontSize: '10px', letterSpacing: '0.25em', textTransform: 'uppercase', margin: 0 }}>Muebless is Better</p>
          <p style={{ color: '#555', fontSize: '13px', margin: '4px 0 0', fontWeight: 'bold' }}>📍 {nombreSuc}</p>
        </div>
        <div style={{ textAlign: 'center' }}>
          <p style={{ color: 'white', fontSize: '30px', fontWeight: 'bold', margin: 0, fontFamily: 'monospace' }}>{hora}</p>
          <p style={{ color: '#2a2a2a', fontSize: '11px', margin: '4px 0 0', textTransform: 'capitalize' }}>{fecha}</p>
        </div>
        <button onClick={() => setConfigurando(true)} style={{
          backgroundColor: 'transparent', border: '1px solid #1e1e1e',
          borderRadius: '10px', padding: '8px 16px', color: '#333',
          fontSize: '11px', cursor: 'pointer', letterSpacing: '0.1em',
        }}>⚙ CAMBIAR</button>
      </div>

      {/* Cuerpo */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', padding: '40px', gap: '0',
      }}>

        {pinActivo ? (
          <>
            <p style={{ color: '#2a2a2a', fontSize: '11px', letterSpacing: '0.3em', textTransform: 'uppercase', margin: '0 0 36px' }}>
              Código de Asistencia
            </p>

            {/* Dígitos PIN */}
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '44px' }}>
              {pin.split('').map((d, i) => (
                <div key={i} style={{
                  width: i === 0 ? '70px' : '100px',
                  height: i === 0 ? '70px' : '120px',
                  backgroundColor: '#111',
                  border: `1px solid ${i === 0 ? '#1e1e1e' : '#252525'}`,
                  borderRadius: '18px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: i === 0 ? '26px' : '60px',
                  fontWeight: 'bold', fontFamily: 'monospace',
                  color: i === 0 ? '#333' : 'white',
                }}>
                  {d}
                </div>
              ))}
            </div>

            {/* Countdown bar */}
            <div style={{ width: '260px' }}>
              <div style={{ width: '100%', height: '3px', backgroundColor: '#141414', borderRadius: '2px', overflow: 'hidden' }}>
                <div style={{
                  width: `${(segundos / 120) * 100}%`, height: '100%',
                  backgroundColor: segundos > 40 ? '#22c55e' : '#ef4444',
                  transition: 'width 1s linear, background-color 0.5s',
                }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px' }}>
                <span style={{ color: '#2a2a2a', fontSize: '10px', letterSpacing: '0.15em' }}>EXPIRA EN</span>
                <span style={{ color: segundos > 40 ? '#22c55e' : '#ef4444', fontSize: '13px', fontWeight: 'bold', fontFamily: 'monospace' }}>
                  {minutos}:{segs}
                </span>
              </div>
            </div>
          </>
        ) : (
          <>
            <div style={{
              width: '100px', height: '100px', borderRadius: '50%',
              backgroundColor: '#111', border: '1px solid #141414',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '42px', marginBottom: '24px',
            }}>🔐</div>
            <p style={{ color: '#222', fontSize: '12px', letterSpacing: '0.2em', textTransform: 'uppercase', margin: '0 0 6px' }}>
              Sin código activo
            </p>
            <p style={{ color: '#1a1a1a', fontSize: '12px', marginBottom: '36px', textAlign: 'center', lineHeight: 1.8 }}>
              Presiona el botón cuando el trabajador<br />esté listo para registrarse
            </p>
          </>
        )}

        {/* Botón principal */}
        <button
          onClick={generarPin}
          disabled={generando}
          style={{
            backgroundColor: generando ? '#111' : 'white',
            border: 'none', borderRadius: '20px',
            padding: '20px 60px', marginTop: pinActivo ? '36px' : '0',
            color: generando ? '#333' : '#0a0a0a',
            fontSize: '14px', fontWeight: 'bold', cursor: generando ? 'not-allowed' : 'pointer',
            letterSpacing: '0.2em', textTransform: 'uppercase',
            boxShadow: generando ? 'none' : '0 0 48px rgba(255,255,255,0.08)',
            transition: 'all 0.2s',
          }}
        >
          {generando ? 'Generando...' : pinActivo ? '↻ Nuevo Código' : '⚡ Generar Código'}
        </button>

        {/* Último uso */}
        {ultimoUso && (
          <div style={{
            marginTop: '28px', backgroundColor: '#0a1a0f',
            border: '1px solid #14532d', borderRadius: '12px', padding: '10px 24px',
          }}>
            <p style={{ color: '#22c55e', fontSize: '12px', margin: 0, letterSpacing: '0.1em' }}>{ultimoUso}</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ padding: '16px', borderTop: '1px solid #0f0f0f', textAlign: 'center' }}>
        <p style={{ color: '#141414', fontSize: '10px', letterSpacing: '0.2em', margin: 0 }}>
          EL CÓDIGO EXPIRA EN 2 MINUTOS Y SE INVALIDA TRAS EL PRIMER USO
        </p>
      </div>
    </div>
  )
}
