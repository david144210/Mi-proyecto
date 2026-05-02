'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

export default function Perfil() {
  const [inputCarnet, setInputCarnet] = useState('')
  const [usuario, setUsuario] = useState<any>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const carnetGuardado = localStorage.getItem('carnet')
    if (carnetGuardado) {
      setInputCarnet(carnetGuardado)
      supabase
        .from('personal')
        .select('carnet, fecha_ingreso, estado, haber_basico, cargo, fecha_nacimiento, distrito')
        .eq('carnet', carnetGuardado)
        .eq('estado', true)
        .single()
        .then(({ data }) => {
          if (data) setUsuario(data)
        })
    }
  }, [])

  const handleLogin = async () => {
    if (!inputCarnet.trim()) return
    setLoading(true)
    setError('')
    const { data, error } = await supabase
      .from('personal')
      .select('carnet, fecha_ingreso, estado, haber_basico, cargo, fecha_nacimiento, distrito')
      .eq('carnet', inputCarnet.trim())
      .eq('estado', true)
      .single()

    setLoading(false)
    if (error || !data) {
      setError('Carnet no encontrado o usuario inactivo.')
      setUsuario(null)
    } else {
      setUsuario(data)
      localStorage.setItem('carnet', inputCarnet.trim())
    }
  }

  const handleKeyDown = (e: any) => {
    if (e.key === 'Enter') handleLogin()
  }

  const handleCerrarSesion = () => {
    localStorage.removeItem('carnet')
    window.location.replace('/')
  }

  const formatDate = (dateStr: any) => {
    if (!dateStr) return '—'
    const d = new Date(dateStr)
    return d.toLocaleDateString('es-BO', { day: '2-digit', month: 'long', year: 'numeric' })
  }

  const formatMoney = (amount: any) => {
    if (amount === null || amount === undefined) return '—'
    return 'Bs. ' + Number(amount).toLocaleString('es-BO', { minimumFractionDigits: 2 })
  }

  const campos = usuario ? [
    { label: 'Carnet', value: usuario.carnet, icon: '🪪' },
    { label: 'Cargo', value: usuario.cargo || '—', icon: '💼' },
    { label: 'Distrito', value: usuario.distrito || '—', icon: '📍' },
    { label: 'Haber Basico', value: formatMoney(usuario.haber_basico), icon: '💰' },
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
          .perfil-avatar { width: 48px !important; height: 48px !important; font-size: 22px !important; }
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
            <div className="perfil-avatar" style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              backgroundColor: '#087e0b',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '28px',
              flexShrink: 0,
            }}>
              👤
            </div>
            <div>
              <h2 className="perfil-titulo" style={{ margin: '0 0 4px 0', fontSize: '22px', fontWeight: 'normal' }}>
                {usuario.cargo || 'Personal'}
              </h2>
              <p style={{ margin: 0, color: '#888', fontSize: '14px' }}>Carnet: {usuario.carnet}</p>
            </div>
          </div>

          <div style={{
            backgroundColor: '#1a1a1a',
            border: '1px solid #2a2a2a',
            borderRadius: '16px',
            overflow: 'hidden',
            boxShadow: '0 10px 40px rgba(0,0,0,0.4)',
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

          <button
            onClick={handleCerrarSesion}
            style={{
              marginTop: '20px',
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
