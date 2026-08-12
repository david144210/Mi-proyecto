'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

export default function Sistema() {
  const [usuario, setUsuario] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [isMenuOpen, setIsMenuOpen] = useState(false)

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

  // Estilo reutilizable para todas las tarjetas
  const cardStyle: React.CSSProperties = { 
    backgroundColor: 'white', 
    borderRadius: '16px', 
    padding: '28px', 
    boxShadow: '0 4px 12px rgba(0,0,0,0.08)', 
    textDecoration: 'none', 
    color: '#222', 
    textAlign: 'center',
    transition: 'transform 0.2s, box-shadow 0.2s',
    display: 'block'
  }

  if (loading) return <p style={{ textAlign: 'center', marginTop: '100px' }}>Cargando...</p>

  const nombreMostrar = usuario?.usuario || usuario?.nombre || usuario?.carnet || 'Usuario'
  const esAdmin = usuario?.cargos?.es_admin === true

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', minHeight: '100vh', backgroundColor: '#f5f5f5' }}>
      
      {/* NAVBAR */}
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 30px', backgroundColor: '#001f3f', color: 'white', position: 'sticky', top: 0, zIndex: 1000 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <button onClick={() => setIsMenuOpen(!isMenuOpen)} style={{ background: 'none', border: 'none', color: '#D4AF37', fontSize: '24px', cursor: 'pointer' }}>☰</button>
          <img src="/mascota.png" alt="Logo" style={{ height: '40px', width: '40px', objectFit: 'contain' }} />
          <a href="/" style={{ fontWeight: 'bold', fontSize: '20px', color: 'white', textDecoration: 'none' }}>Muebles is Better</a>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <span style={{ color: '#D4AF37', fontSize: '14px' }}>{nombreMostrar} 👤</span>
          <a href="/" style={{ backgroundColor: '#D4AF37', color: '#001f3f', padding: '6px 15px', borderRadius: '20px', fontSize: '12px', textDecoration: 'none', fontWeight: 'bold' }}>Salir</a>
        </div>
      </nav>

      {/* MENÚ HAMBURGUESA LATERAL */}
      <div style={{ position: 'fixed', top: 0, left: isMenuOpen ? 0 : '-250px', height: '100%', width: '250px', backgroundColor: '#001f3f', transition: '0.3s', padding: '80px 20px', zIndex: 900, boxShadow: '2px 0 10px rgba(0,0,0,0.3)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <a href="/cotizador" style={{ color: '#D4AF37', textDecoration: 'none', fontSize: '18px', borderBottom: '1px solid #D4AF37', paddingBottom: '10px' }}>⚡ Cotizador</a>
          <a href="/productos" style={{ color: '#D4AF37', textDecoration: 'none', fontSize: '18px', borderBottom: '1px solid #D4AF37', paddingBottom: '10px' }}>📦 Productos</a>
        </div>
      </div>

      <div style={{ padding: '40px', maxWidth: '1200px', margin: '0 auto' }}>
        <h1 style={{ marginBottom: '8px', color: '#001f3f' }}>Bienvenido de vuelta, {nombreMostrar.split(' ')[0]} 👋</h1>
        <p style={{ color: '#666', marginBottom: '40px' }}>{usuario?.cargos?.nombre}</p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
          
          <a href="/perfil" style={cardStyle}><div style={{ fontSize: '40px', marginBottom: '12px' }}>👤</div><h3 style={{ margin: 0 }}>Mi Perfil</h3></a>
          <a href="/clientes" style={cardStyle}><div style={{ fontSize: '40px', marginBottom: '12px' }}>👥</div><h3 style={{ margin: 0 }}>Clientes</h3></a>
          <a href="/stock" style={cardStyle}><div style={{ fontSize: '40px', marginBottom: '12px' }}>🏪</div><h3 style={{ margin: 0 }}>Tiendas</h3></a>

          {(esAdmin || !!usuario?.cargos?.puede_ver_cotizador) && (
            <a href="/ventas" style={cardStyle}><div style={{ fontSize: '40px', marginBottom: '12px' }}>💰</div><h3 style={{ margin: 0 }}>Ventas</h3></a>
          )}
          {(esAdmin || !!usuario?.cargos?.puede_ver_caja_chica) && (
            <a href="/cajas" style={cardStyle}><div style={{ fontSize: '40px', marginBottom: '12px' }}>🧾</div><h3 style={{ margin: 0 }}>Caja Chica</h3></a>
          )}
          {esAdmin && (
            <a href="/personal" style={cardStyle}><div style={{ fontSize: '40px', marginBottom: '12px' }}>🏢</div><h3 style={{ margin: 0 }}>Personal</h3></a>
          )}
          {esAdmin && (
            <a href="/ventas/anular" style={cardStyle}><div style={{ fontSize: '40px', marginBottom: '12px' }}>🏢</div><h3 style={{ margin: 0 }}>Anular Ventas</h3></a>
          )}
          {(esAdmin || !!usuario?.cargos?.puede_ver_compras) && (
            <>
              <a href="/melaminas" style={cardStyle}><div style={{ fontSize: '40px', marginBottom: '12px' }}>🧱</div><h3 style={{ margin: 0 }}>Registro de Melaminas</h3></a>
              <a href="/compra-melaminas" style={cardStyle}><div style={{ fontSize: '40px', marginBottom: '12px' }}>🛒</div><h3 style={{ margin: 0 }}>Compra de Melaminas</h3></a>
              <a href="/aceros" style={cardStyle}><div style={{ fontSize: '40px', marginBottom: '12px' }}>⛓</div><h3 style={{ margin: 0 }}>Registro Acero</h3></a>
              <a href="/compras-acero" style={cardStyle}><div style={{ fontSize: '40px', marginBottom: '12px' }}>💰⛓</div><h3 style={{ margin: 0 }}>Compra Acero</h3></a>
              <a href="/accesorios" style={cardStyle}><div style={{ fontSize: '40px', marginBottom: '12px' }}>⚙️</div><h3 style={{ margin: 0 }}>Registro Accesorios</h3></a>
              <a href="/compras-accesorios" style={cardStyle}><div style={{ fontSize: '40px', marginBottom: '12px' }}>💰⚙️</div><h3 style={{ margin: 0 }}>Compra Accesorios</h3></a>
              <a href="/insumos" style={cardStyle}><div style={{ fontSize: '40px', marginBottom: '12px' }}>🧪</div><h3 style={{ margin: 0 }}>Registro Insumos</h3></a>
              <a href="/compras-insumos" style={cardStyle}><div style={{ fontSize: '40px', marginBottom: '12px' }}>💰🧪</div><h3 style={{ margin: 0 }}>Compra Insumos</h3></a>
              <a href="/proveedores" style={cardStyle}><div style={{ fontSize: '40px', marginBottom: '12px' }}>👩‍🚒</div><h3 style={{ margin: 0 }}>Proveedores</h3></a>
                  
            </>
          )}

          
          {(esAdmin || !!usuario?.cargos?.puede_ver_produccion) && (
            <>
              <a href="/produccion" style={cardStyle}><div style={{ fontSize: '40px', marginBottom: '12px' }}>🏭</div><h3 style={{ margin: 0 }}>Producción</h3></a>
              <a href="/presupuestos_prod" style={cardStyle}><div style={{ fontSize: '40px', marginBottom: '12px' }}>🧮</div><h3 style={{ margin: 0 }}>Presupuestos de Producción</h3></a>
              <a href="/construccion" style={cardStyle}><div style={{ fontSize: '40px', marginBottom: '12px' }}>🚧</div><h3 style={{ margin: 0 }}>Construcción</h3></a>
            </>
          )}
          {(esAdmin || !!usuario) && (
             <a href="/calendario" style={cardStyle}><div style={{ fontSize: '40px', marginBottom: '12px' }}>📅</div><h3 style={{ margin: 0 }}>Calendario</h3></a>
          )}
          {(esAdmin || !!usuario?.cargos?.puede_ver_entregas) && (
            <>
              <a href="/entregas" style={cardStyle}><div style={{ fontSize: '40px', marginBottom: '12px' }}>📦</div><h3 style={{ margin: 0 }}>Despachos</h3></a>
              <a href="/cobros" style={cardStyle}><div style={{ fontSize: '40px', marginBottom: '12px' }}>💲</div><h3 style={{ margin: 0 }}>Cobros</h3></a>
            </>
          )}
          {(esAdmin || !!usuario?.cargos?.puede_ver_entregas || !!usuario?.cargos?.puede_ver_mk) && (
            <>
              <a href="/consulta" style={cardStyle}><div style={{ fontSize: '40px', marginBottom: '12px' }}>📈</div><h3 style={{ margin: 0 }}>Informe Ventas</h3></a>
              <a href="/ventas/smart" style={cardStyle}><div style={{ fontSize: '40px', marginBottom: '12px' }}>🤯</div><h3 style={{ margin: 0 }}>Business Intelligence</h3></a>
            </>
          )}
          {esAdmin && (
            <a href="/contabilidad" style={cardStyle}><div style={{ fontSize: '40px', marginBottom: '12px' }}>📊</div><h3 style={{ margin: 0 }}>Contabilidad</h3></a>
          )}
          {(esAdmin || !!usuario?.cargos?.puede_ver_mk) && (
            <>
              <a href="/marketing" style={cardStyle}><div style={{ fontSize: '40px', marginBottom: '12px' }}>🎁</div><h3 style={{ margin: 0 }}>Editar Portada</h3></a>
              <a href="/admin-promociones" style={cardStyle}><div style={{ fontSize: '40px', marginBottom: '12px' }}>🎁</div><h3 style={{ margin: 0 }}>Editar Promociones</h3></a>
            </>
          )}
          {(esAdmin || !!usuario?.cargos?.puede_ver_rrhh || !!usuario?.cargos?.puede_gestionar_rrhh) && (
            <>
              <a href="/entrada" style={cardStyle}><div style={{ fontSize: '40px', marginBottom: '12px' }}>🕐</div><h3 style={{ margin: 0 }}>Mi Asistencia</h3></a>
              <a href="/rrhh" style={cardStyle}><div style={{ fontSize: '40px', marginBottom: '12px' }}>👩‍🎓</div><h3 style={{ margin: 0 }}>Recursos Humanos</h3></a>
            </>
          )}
          {(esAdmin || !!usuario) && (
            <a href="/kiosco" style={cardStyle}><div style={{ fontSize: '40px', marginBottom: '12px' }}>👥</div><h3 style={{ margin: 0 }}>Codigo de personal</h3></a>
          )}
        </div>
      </div>
    </div>
  )
}