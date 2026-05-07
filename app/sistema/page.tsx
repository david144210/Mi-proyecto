'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

export default function Sistema() {
  const [usuario, setUsuario] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const carnetGuardado = localStorage.getItem('carnet')
    if (!carnetGuardado) { window.location.replace('/'); return }
    supabase.from('personal').select('*, cargos(*)')
      .eq('carnet', carnetGuardado)
      .eq('estado', true)
      .single()
      .then(({ data }) => {
        if (!data) window.location.replace('/')
        else {
          setUsuario(data)
          setLoading(false)
        }
      })
  }, [])

  if (loading) return <p style={{ textAlign: 'center', marginTop: '100px' }}>Cargando...</p>

  const nombreMostrar = usuario?.usuario || usuario?.nombre || usuario?.carnet || 'Usuario'
  const esAdmin = usuario?.cargos?.es_admin === true

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', minHeight: '100vh', backgroundColor: '#f5f5f5' }}>
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 40px', backgroundColor: '#222', color: 'white', boxSizing: 'border-box' as const }}>
        <a href="/" style={{ fontWeight: 'bold', fontSize: '20px', color: 'white', textDecoration: 'none' }}>Muebles is Better</a>
        <span style={{ color: '#a3c47d', fontWeight: 'bold' }}>Sistema Interno</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ color: 'white', fontSize: '14px' }}>{nombreMostrar} 👤</span>
          <a href="/" style={{ backgroundColor: 'transparent', color: '#ff6b6b', border: '1px solid #ff6b6b', padding: '5px 12px', borderRadius: '20px', fontSize: '12px', textDecoration: 'none' }}>
            Salir
          </a>
        </div>
      </nav>

      <div style={{ padding: '40px', maxWidth: '1200px', margin: '0 auto' }}>
        <h1 style={{ marginBottom: '8px' }}>Bienvenido de vuelta, {nombreMostrar.split(' ')[0]} 👋</h1>
        <p style={{ color: '#666', marginBottom: '40px' }}>{usuario?.cargos?.nombre}</p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>

          <a href="/perfil" style={{ backgroundColor: 'white', borderRadius: '16px', padding: '28px', boxShadow: '0 2px 12px rgba(0,0,0,0.08)', textDecoration: 'none', color: '#222', textAlign: 'center' as const }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>👤</div>
            <h3 style={{ margin: 0 }}>Mi Perfil</h3>
          </a>

          <a href="/clientes" style={{ backgroundColor: 'white', borderRadius: '16px', padding: '28px', boxShadow: '0 2px 12px rgba(0,0,0,0.08)', textDecoration: 'none', color: '#222', textAlign: 'center' as const }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>👥</div>
            <h3 style={{ margin: 0 }}>Clientes</h3>
          </a>

          <a href="/compras-acero" style={{ backgroundColor: 'white', borderRadius: '16px', padding: '28px', boxShadow: '0 2px 12px rgba(0,0,0,0.08)', textDecoration: 'none', color: '#222', textAlign: 'center' as const }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>🔩</div>
            <h3 style={{ margin: 0 }}>Compras Acero</h3>
          </a>

            {(esAdmin || !!usuario?.cargos?.puede_ver_cotizador) && (
              <a href="/ventas" style={{ backgroundColor: 'white', borderRadius: '16px', padding: '28px', boxShadow: '0 2px 12px rgba(0,0,0,0.08)', textDecoration: 'none', color: '#222', textAlign: 'center' as const }}>
                <div style={{ fontSize: '40px', marginBottom: '12px' }}>💰</div>
                <h3 style={{ margin: 0 }}>Ventas</h3>
              </a>
            )}


          {esAdmin && (
            <a href="/personal" style={{ backgroundColor: 'white', borderRadius: '16px', padding: '28px', boxShadow: '0 2px 12px rgba(0,0,0,0.08)', textDecoration: 'none', color: '#222', textAlign: 'center' as const }}>
              <div style={{ fontSize: '40px', marginBottom: '12px' }}>🏢</div>
              <h3 style={{ margin: 0 }}>Personal</h3>
            </a>
          )}
          {/* TARJETA ACCESORIOS */}
          {(esAdmin || !!usuario?.cargos?.puede_ver_cotizador) && (
          <a href="/accesorios" style={{ backgroundColor: 'white', borderRadius: '16px', padding: '28px', boxShadow: '0 2px 12px rgba(0,0,0,0.08)', textDecoration: 'none', color: '#222', textAlign: 'center' as const, display: 'block' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>⚙️</div>
            <h3 style={{ margin: 0 }}>Registro Accesorios</h3>
          </a>
          )}

          {/* TARJETA INSUMOS */}
          {(esAdmin || !!usuario?.cargos?.puede_ver_cotizador) && (
          <a href="/insumos" style={{ backgroundColor: 'white', borderRadius: '16px', padding: '28px', boxShadow: '0 2px 12px rgba(0,0,0,0.08)', textDecoration: 'none', color: '#222', textAlign: 'center' as const, display: 'block' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>🧪</div>
            <h3 style={{ margin: 0 }}>Registro Insumos</h3>
          </a>
          )}

          {/* TARJETA PRODUCCIÓN */}
          {(esAdmin || !!usuario?.cargos?.puede_ver_produccion) && (
          <a href="/produccion" style={{ backgroundColor: 'white', borderRadius: '16px', padding: '28px', boxShadow: '0 2px 12px rgba(0,0,0,0.08)', textDecoration: 'none', color: '#222', textAlign: 'center' as const }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>🏭</div>
            <h3 style={{ margin: 0 }}>Producción</h3>
          </a>
          )}

          {/* Aqui agregaras mas aplicaciones */}

        </div>
      </div>
    </div>
  )
}
