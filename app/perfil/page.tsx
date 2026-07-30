'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

// Utilidades de formato y fechas
const fmt = (v: number) => `Bs. ${(Number(v) || 0).toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const getRangoMesActual = () => {
  const hoy = new Date()
  const anio = hoy.getFullYear()
  const mes = String(hoy.getMonth() + 1).padStart(2, '0')
  const inicio = `${anio}-${mes}-01`
  const fin = new Date(anio, hoy.getMonth() + 1, 0).toISOString().split('T')[0]
  return { inicio, fin, mesNombre: hoy.toLocaleString('es-ES', { month: 'long', year: 'numeric' }) }
}

export default function Perfil() {
  const [inputCarnet, setInputCarnet] = useState('')
  const [usuario, setUsuario] = useState<any>(null)
  const [desempenio, setDesempenio] = useState<any>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [subiendoFoto, setSubiendoFoto] = useState(false)

  useEffect(() => {
    const carnetGuardado = localStorage.getItem('carnet')
    if (carnetGuardado) {
      setInputCarnet(carnetGuardado)
      cargarDatosPerfil(carnetGuardado)
    }
  }, [])

  const cargarDatosPerfil = async (carnet: string) => {
    setLoading(true)
    setError('')

    const { data: persona, error: errPersona } = await supabase
      .from('personal')
      .select('*')
      .eq('carnet', carnet)
      .eq('estado', true)
      .single()

    if (errPersona || !persona) {
      setError('Carnet no encontrado o usuario inactivo.')
      setUsuario(null)
      setDesempenio(null)
      setLoading(false)
      return
    }

    setUsuario(persona)
    localStorage.setItem('carnet', carnet)

    // Buscar si el personal tiene un registro de vendedor asignado
    const { data: vendedor } = await supabase
      .from('vendedores')
      .select('*')
      .eq('activo', true)
      .or(`personal_id.eq.${persona.id},ci.eq.${persona.carnet}`)
      .maybeSingle()

    if (vendedor) {
      const { inicio, fin, mesNombre } = getRangoMesActual()
      const codVendedor = vendedor.id

      const [{ data: cobros }, { data: esc }] = await Promise.all([
        supabase.from('cobranzas').select('total_cobrado, ventas!inner(cod_vendedor)').eq('ventas.cod_vendedor', codVendedor).gte('created_at', `${inicio}T00:00:00`).lte('created_at', `${fin}T23:59:59`),
        supabase.from('escalas_vendedor').select('*').eq('activa', true).order('venta_min', { ascending: true })
      ])

      let totalCobradoMes = 0
      cobros?.forEach((c: any) => {
        totalCobradoMes += Number(c.total_cobrado) || 0
      })

      const tipoVendedor = (vendedor.tipo || '').toString().trim().toLowerCase()
      const escalasDelTipo = (esc || []).filter((e: any) => (e.tipo || '').toString().trim().toLowerCase() === tipoVendedor)

      let escalaAlcanzada = escalasDelTipo[0]
      for (const e of escalasDelTipo) {
        if (totalCobradoMes >= e.venta_min) {
          escalaAlcanzada = e
        } else {
          break
        }
      }

      const pctBase = escalaAlcanzada?.comision_pct || 0
      const pctBono = vendedor.bono_digital ? 0.5 : 0
      const pctTotal = pctBase + pctBono
      const comisionEst = totalCobradoMes * (pctTotal / 100)

      setDesempenio({
        totalCobradoMes,
        escalaNombre: escalaAlcanzada ? `Nivel ${escalaAlcanzada.nivel} (${escalaAlcanzada.categoria})` : 'Base',
        pctTotal,
        comisionEst,
        mesNombre
      })
    } else {
      setDesempenio(null)
    }

    setLoading(false)
  }

  // Manejo de Subida / Cambio de Foto
  const handleCambiarFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0]
    if (!archivo || !usuario) return

    setSubiendoFoto(true)
    setError('')

    const fileExt = archivo.name.split('.').pop()
    const fileName = `${usuario.id}-${Math.random()}.${fileExt}`
    const filePath = `${fileName}`

    // 1. Subir archivo al bucket 'avatars'
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, archivo, { upsert: true })

    if (uploadError) {
      setError('Error al subir la imagen: ' + uploadError.message)
      setSubiendoFoto(false)
      return
    }

    // 2. Obtener URL pública
    const { data: publicUrlData } = supabase.storage
      .from('avatars')
      .getPublicUrl(filePath)

    const fotoUrl = publicUrlData.publicUrl

    // 3. Actualizar la tabla personal con la nueva URL
    const { error: updateError } = await supabase
      .from('personal')
      .update({ foto_url: fotoUrl })
      .eq('id', usuario.id)

    if (updateError) {
      setError('Error al guardar la foto en el perfil: ' + updateError.message)
    } else {
      setUsuario({ ...usuario, foto_url: fotoUrl })
    }

    setSubiendoFoto(false)
  }

  // Manejo de Eliminación de Foto
  const handleEliminarFoto = async () => {
    if (!usuario || !usuario.foto_url) return

    setSubiendoFoto(true)
    setError('')

    const { error: updateError } = await supabase
      .from('personal')
      .update({ foto_url: null })
      .eq('id', usuario.id)

    if (updateError) {
      setError('Error al eliminar la foto: ' + updateError.message)
    } else {
      setUsuario({ ...usuario, foto_url: null })
    }

    setSubiendoFoto(false)
  }

  const handleLogin = async () => {
    if (!inputCarnet.trim()) return
    await cargarDatosPerfil(inputCarnet.trim())
  }

  const handleKeyDown = (e: any) => {
    if (e.key === 'Enter') handleLogin()
  }

  const handleCerrarSesion = () => {
    localStorage.removeItem('carnet')
    setUsuario(null)
    setDesempenio(null)
    setInputCarnet('')
  }

  const formatDate = (dateStr: any) => {
    if (!dateStr) return '—'
    const d = new Date(dateStr)
    return d.toLocaleDateString('es-BO', { day: '2-digit', month: 'long', year: 'numeric' })
  }

  const campos = usuario ? [
    { label: 'Carnet', value: usuario.carnet, icon: '🪪' },
    { label: 'Cargo', value: usuario.cargo || '—', icon: '💼' },
    { label: 'Distrito', value: usuario.distrito || '—', icon: '📍' },
    { label: 'Estado de Contratación', value: usuario.tipo_contrato || '—', icon: '📝' },
    { label: 'Fecha de Ingreso', value: formatDate(usuario.fecha_ingreso), icon: '📅' },
    { label: 'Fecha de Nacimiento', value: formatDate(usuario.fecha_nacimiento), icon: '🎂' },
    { label: 'Estado', value: usuario.estado ? 'Activo' : 'Inactivo', icon: '✅', highlight: usuario.estado },
  ] : []

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#0f0f0f',
      fontFamily: "'Georgia', serif",
      color: '#f0ece4',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px 16px',
    }}>

      <style>{`
        @media (max-width: 768px) {
          .perfil-card { padding: 20px !important; }
          .perfil-campo { padding: 14px 16px !important; }
          .perfil-valor { max-width: 140px !important; font-size: 13px !important; }
          .perfil-label { font-size: 13px !important; }
          .perfil-avatar { width: 64px !important; height: 64px !important; }
          .perfil-titulo { font-size: 18px !important; }
          .perfil-max { max-width: 100% !important; }
        }
      `}</style>

      {/* HEADER */}
      <div style={{ textAlign: 'center', marginBottom: '40px' }}>
        <a href="/" style={{
          color: '#a3c47d',
          textDecoration: 'none',
          fontSize: '13px',
          letterSpacing: '2px',
          textTransform: 'uppercase',
          display: 'block',
          marginBottom: '16px'
        }}>
          Volver al inicio
        </a>
        <h1 style={{ fontSize: '32px', fontWeight: 'normal', margin: '0 0 8px 0', color: '#ffffff' }}>
          Mi Perfil
        </h1>
        <p style={{ color: '#888', fontSize: '14px', margin: 0 }}>Muebles is Better</p>
      </div>

      {/* LOGIN CARD */}
      {!usuario && (
        <div style={{
          backgroundColor: '#1a1a1a',
          border: '1px solid #2a2a2a',
          borderRadius: '16px',
          padding: '40px',
          width: '100%',
          maxWidth: '380px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          boxSizing: 'border-box',
        }}>
          <p style={{ color: '#aaa', fontSize: '14px', marginBottom: '24px', textAlign: 'center' }}>
            Ingresa tu carnet para ver tus datos
          </p>
          <input
            type="password"
            placeholder="Numero de carnet"
            value={inputCarnet}
            onChange={(e) => setInputCarnet(e.target.value)}
            onKeyDown={handleKeyDown}
            style={{
              width: '100%',
              padding: '14px 16px',
              borderRadius: '10px',
              border: '1px solid #333',
              backgroundColor: '#111',
              color: '#f0ece4',
              fontSize: '15px',
              marginBottom: '14px',
              boxSizing: 'border-box',
              outline: 'none',
            }}
          />
          <button
            onClick={handleLogin}
            disabled={loading}
            style={{
              width: '100%',
              padding: '14px',
              backgroundColor: '#087e0b',
              color: 'white',
              border: 'none',
              borderRadius: '10px',
              fontSize: '15px',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? 'Buscando...' : 'Ver mis datos'}
          </button>
          {error && (
            <p style={{ color: '#ff6b6b', marginTop: '14px', fontSize: '13px', textAlign: 'center' }}>{error}</p>
          )}
        </div>
      )}

      {/* PERFIL CARD */}
      {usuario && (
        <div className="perfil-max" style={{ width: '100%', maxWidth: '560px' }}>

          <div className="perfil-card" style={{
            backgroundColor: '#1a1a1a',
            border: '1px solid #2a2a2a',
            borderRadius: '16px',
            padding: '32px',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '20px',
            boxShadow: '0 10px 40px rgba(0,0,0,0.4)',
          }}>
            {/* AVATAR / FOTO CON OPCIÓN DE CAMBIO */}
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <div className="perfil-avatar" style={{
                width: '76px',
                height: '76px',
                borderRadius: '50%',
                backgroundColor: '#222',
                border: '2px solid #087e0b',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                fontSize: '32px',
              }}>
                {usuario.foto_url ? (
                  <img src={usuario.foto_url} alt="Foto de perfil" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  '👤'
                )}
              </div>

              {/* Botón flotante para cambiar foto */}
              <label style={{
                position: 'absolute', bottom: 0, right: 0,
                backgroundColor: '#087e0b', color: 'white',
                borderRadius: '50%', width: '26px', height: '26px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', fontSize: '12px', border: '2px solid #1a1a1a',
                boxShadow: '0 2px 5px rgba(0,0,0,0.3)'
              }} title="Cambiar foto de perfil">
                📷
                <input type="file" accept="image/*" onChange={handleCambiarFoto} style={{ display: 'none' }} disabled={subiendoFoto} />
              </label>
            </div>

            <div style={{ flexGrow: 1 }}>
              <h2 className="perfil-titulo" style={{ margin: '0 0 4px 0', fontSize: '22px', fontWeight: 'normal' }}>
                {usuario.usuario || 'Personal'}
              </h2>
              <p style={{ margin: '0 0 8px 0', color: '#888', fontSize: '14px' }}>{usuario.cargo || '—'} · Carnet: {usuario.carnet}</p>
              
              {usuario.foto_url && !subiendoFoto && (
                <button
                  onClick={handleEliminarFoto}
                  style={{ background: 'none', border: 'none', color: '#ff6b6b', fontSize: '11px', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
                >
                  Eliminar foto
                </button>
              )}
              {subiendoFoto && <span style={{ fontSize: '11px', color: '#a3c47d' }}>Actualizando foto...</span>}
            </div>
          </div>

          {error && (
            <div style={{ backgroundColor: '#2c1515', border: '1px solid #ff6b6b', borderRadius: '10px', padding: '10px 16px', marginBottom: '16px', color: '#ff6b6b', fontSize: '13px', textAlign: 'center' }}>
              {error}
            </div>
          )}

          <div style={{
            backgroundColor: '#1a1a1a',
            border: '1px solid #2a2a2a',
            borderRadius: '16px',
            overflow: 'hidden',
            boxShadow: '0 10px 40px rgba(0,0,0,0.4)',
            marginBottom: '16px',
          }}>
            {campos.map((campo, i) => (
              <div key={i} className="perfil-campo" style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '18px 28px',
                borderBottom: i < campos.length - 1 ? '1px solid #222' : 'none',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '18px' }}>{campo.icon}</span>
                  <span className="perfil-label" style={{ color: '#888', fontSize: '14px' }}>{campo.label}</span>
                </div>
                <span className="perfil-valor" style={{
                  fontSize: '14px',
                  fontWeight: '500',
                  color: campo.highlight === true ? '#a3c47d' : '#f0ece4',
                  textAlign: 'right',
                  maxWidth: '200px',
                }}>
                  {campo.value}
                </span>
              </div>
            ))}
          </div>

          {/* SEGUIMIENTO COMERCIAL DEL MES */}
          {desempenio && (
            <div style={{
              backgroundColor: '#1a1a1a',
              border: '1px solid #2a2a2a',
              borderRadius: '16px',
              padding: '24px 28px',
              marginBottom: '16px',
              boxShadow: '0 10px 40px rgba(0,0,0,0.4)',
            }}>
              <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 'normal', color: '#a3c47d', borderBottom: '1px solid #222', paddingBottom: '10px', textTransform: 'capitalize' }}>
                Seguimiento de Cobranzas y Entregas — {desempenio.mesNombre}
              </h3>
              <div style={{ marginBottom: '16px' }}>
                <div style={{ backgroundColor: '#111', padding: '14px 16px', borderRadius: '10px', border: '1px solid #222', textAlign: 'center' }}>
                  <span style={{ color: '#888', fontSize: '12px', display: 'block', marginBottom: '4px' }}>Total Cobrado / Entregado este Mes</span>
                  <span style={{ color: '#a3c47d', fontSize: '20px', fontWeight: 'bold' }}>{fmt(desempenio.totalCobradoMes)}</span>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#111', padding: '12px 16px', borderRadius: '10px', border: '1px solid #222', fontSize: '14px' }}>
                <div>
                  <span style={{ color: '#888', display: 'block', fontSize: '12px' }}>Escala Actual</span>
                  <span style={{ fontWeight: '500' }}>{desempenio.escalaNombre} ({desempenio.pctTotal}%)</span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ color: '#888', display: 'block', fontSize: '12px' }}>Comisión Est.</span>
                  <span style={{ color: '#a3c47d', fontWeight: 'bold' }}>{fmt(desempenio.comisionEst)}</span>
                </div>
              </div>
            </div>
          )}

          <button
            onClick={handleCerrarSesion}
            style={{
              width: '100%',
              padding: '12px',
              backgroundColor: 'transparent',
              color: '#ff6b6b',
              border: '1px solid #ff6b6b',
              borderRadius: '10px',
              fontSize: '14px',
              cursor: 'pointer',
            }}
          >
            Cerrar Sesion
          </button>
        </div>
      )}
    </div>
  )
}