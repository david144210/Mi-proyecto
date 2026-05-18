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

          <a href="/stock" style={{ backgroundColor: 'white', borderRadius: '16px', padding: '28px', boxShadow: '0 2px 12px rgba(0,0,0,0.08)', textDecoration: 'none', color: '#222', textAlign: 'center' as const }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>🏪</div>
            <h3 style={{ margin: 0 }}>Tiendas</h3>
          </a>

            {(esAdmin || !!usuario?.cargos?.puede_ver_cotizador) && (
              <a href="/ventas" style={{ backgroundColor: 'white', borderRadius: '16px', padding: '28px', boxShadow: '0 2px 12px rgba(0,0,0,0.08)', textDecoration: 'none', color: '#222', textAlign: 'center' as const }}>
                <div style={{ fontSize: '40px', marginBottom: '12px' }}>💰</div>
                <h3 style={{ margin: 0 }}>Ventas</h3>
              </a>
            )}

            {(esAdmin || !!usuario?.cargos?.puede_ver_caja_chica) && (
              <a href="/cajas" style={{ backgroundColor: 'white', borderRadius: '16px', padding: '28px', boxShadow: '0 2px 12px rgba(0,0,0,0.08)', textDecoration: 'none', color: '#222', textAlign: 'center' as const }}>
                <div style={{ fontSize: '40px', marginBottom: '12px' }}>🧾</div>
                <h3 style={{ margin: 0 }}>Caja Chica</h3>
              </a>
            )}

          {esAdmin && (
            <a href="/personal" style={{ backgroundColor: 'white', borderRadius: '16px', padding: '28px', boxShadow: '0 2px 12px rgba(0,0,0,0.08)', textDecoration: 'none', color: '#222', textAlign: 'center' as const }}>
              <div style={{ fontSize: '40px', marginBottom: '12px' }}>🏢</div>
              <h3 style={{ margin: 0 }}>Personal</h3>
            </a>
          )}

          {esAdmin && (
            <a href="/ventas/anular" style={{ backgroundColor: 'white', borderRadius: '16px', padding: '28px', boxShadow: '0 2px 12px rgba(0,0,0,0.08)', textDecoration: 'none', color: '#222', textAlign: 'center' as const }}>
              <div style={{ fontSize: '40px', marginBottom: '12px' }}>🏢</div>
              <h3 style={{ margin: 0 }}>Anular Ventas</h3>
            </a>
          )}

          {/* TARJETA MELAMINAS */}
          {(esAdmin || !!usuario?.cargos?.puede_ver_compras) && (
          <a href="/melaminas" style={{ backgroundColor: 'white', borderRadius: '16px', padding: '28px', boxShadow: '0 2px 12px rgba(0,0,0,0.08)', textDecoration: 'none', color: '#222', textAlign: 'center' as const, display: 'block' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>🧱</div>
            <h3 style={{ margin: 0 }}>Registro de Melaminas</h3>
          </a>
          )}

          {/* TARJETA compra-MELAMINAS */}
          {(esAdmin || !!usuario?.cargos?.puede_ver_compras) && (
          <a href="/compra-melaminas" style={{ backgroundColor: 'white', borderRadius: '16px', padding: '28px', boxShadow: '0 2px 12px rgba(0,0,0,0.08)', textDecoration: 'none', color: '#222', textAlign: 'center' as const, display: 'block' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>🛒</div>
            <h3 style={{ margin: 0 }}>Compra de Melaminas</h3>
          </a>
          )}

          {/* TARJETA compra tubos */}
          {(esAdmin || !!usuario?.cargos?.puede_ver_compras) && (
          <a href="/compras-acero" style={{ backgroundColor: 'white', borderRadius: '16px', padding: '28px', boxShadow: '0 2px 12px rgba(0,0,0,0.08)', textDecoration: 'none', color: '#222', textAlign: 'center' as const, display: 'block' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>💰⛓</div>
            <h3 style={{ margin: 0 }}>Compra Acero</h3>
          </a>
          )}

          {/* TARJETA ACCESORIOS */}
          {(esAdmin || !!usuario?.cargos?.puede_ver_compras) && (
          <a href="/accesorios" style={{ backgroundColor: 'white', borderRadius: '16px', padding: '28px', boxShadow: '0 2px 12px rgba(0,0,0,0.08)', textDecoration: 'none', color: '#222', textAlign: 'center' as const, display: 'block' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>⚙️</div>
            <h3 style={{ margin: 0 }}>Registro Accesorios</h3>
          </a>
          )}
        {/* TARJETA compra de ACCESORIOS */}
          {(esAdmin || !!usuario?.cargos?.puede_ver_compras) && (
          <a href="/compras-accesorios" style={{ backgroundColor: 'white', borderRadius: '16px', padding: '28px', boxShadow: '0 2px 12px rgba(0,0,0,0.08)', textDecoration: 'none', color: '#222', textAlign: 'center' as const, display: 'block' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>💰⚙️</div>
            <h3 style={{ margin: 0 }}>Compra Accesorios</h3>
          </a>
          )}

          {/* TARJETA INSUMOS */}
          {(esAdmin || !!usuario?.cargos?.puede_ver_compras) && (
          <a href="/insumos" style={{ backgroundColor: 'white', borderRadius: '16px', padding: '28px', boxShadow: '0 2px 12px rgba(0,0,0,0.08)', textDecoration: 'none', color: '#222', textAlign: 'center' as const, display: 'block' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>🧪</div>
            <h3 style={{ margin: 0 }}>Registro Insumos</h3>
          </a>
          )}

          {/* TARJETA compra de INSUMOS */}
          {(esAdmin || !!usuario?.cargos?.puede_ver_compras) && (
          <a href="/compras-insumos" style={{ backgroundColor: 'white', borderRadius: '16px', padding: '28px', boxShadow: '0 2px 12px rgba(0,0,0,0.08)', textDecoration: 'none', color: '#222', textAlign: 'center' as const, display: 'block' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>💰🧪</div>
            <h3 style={{ margin: 0 }}>Compra Insumos</h3>
          </a>
          )}

          {/* TARJETA PRODUCCIÓN */}
          {(esAdmin || !!usuario?.cargos?.puede_ver_produccion) && (
          <a href="/produccion" style={{ backgroundColor: 'white', borderRadius: '16px', padding: '28px', boxShadow: '0 2px 12px rgba(0,0,0,0.08)', textDecoration: 'none', color: '#222', textAlign: 'center' as const }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>🏭</div>
            <h3 style={{ margin: 0 }}>Producción</h3>
          </a>
          
          )}

          {/* TARJETA construccion */}
          {(esAdmin || !!usuario?.cargos?.puede_ver_produccion) && (
          <a href="/construccion" style={{ backgroundColor: 'white', borderRadius: '16px', padding: '28px', boxShadow: '0 2px 12px rgba(0,0,0,0.08)', textDecoration: 'none', color: '#222', textAlign: 'center' as const }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>🚧</div>
            <h3 style={{ margin: 0 }}>Construcción</h3>
          </a>
          
          )}

{/* TARJETA CALENDARIO */}
          {(esAdmin || !!usuario) && (
          <a href="/calendario" style={{ backgroundColor: 'white', borderRadius: '16px', padding: '28px', boxShadow: '0 2px 12px rgba(0,0,0,0.08)', textDecoration: 'none', color: '#222', textAlign: 'center' as const }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>📅</div>
            <h3 style={{ margin: 0 }}>Calendario </h3>
          </a>
          )}

{/* TARJETA DESPACHOS */}
          {(esAdmin || !!usuario?.cargos?.puede_ver_entregas) && (
          <a href="/entregas" style={{ backgroundColor: 'white', borderRadius: '16px', padding: '28px', boxShadow: '0 2px 12px rgba(0,0,0,0.08)', textDecoration: 'none', color: '#222', textAlign: 'center' as const }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>📦</div>
            <h3 style={{ margin: 0 }}>Despachos </h3>
          </a>
          )}

{/* TARJETA COBROS */}
          {(esAdmin || !!usuario?.cargos?.puede_ver_entregas) && (
          <a href="/cobros" style={{ backgroundColor: 'white', borderRadius: '16px', padding: '28px', boxShadow: '0 2px 12px rgba(0,0,0,0.08)', textDecoration: 'none', color: '#222', textAlign: 'center' as const }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>💲</div>
            <h3 style={{ margin: 0 }}>Cobros</h3>
          </a>
          )}

{/* TARJETA BUI */}
          {(esAdmin || !!usuario?.cargos?.puede_ver_entregas || !!usuario?.cargos?.puede_ver_mk) && (
          <a href="/ventas/smart" style={{ backgroundColor: 'white', borderRadius: '16px', padding: '28px', boxShadow: '0 2px 12px rgba(0,0,0,0.08)', textDecoration: 'none', color: '#222', textAlign: 'center' as const }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>🤯</div>
            <h3 style={{ margin: 0 }}>Businees Inteligence</h3>
          </a>
          )}

{/* TARJETA CONTABILIDAD - Solo visible para Administradores */}
{esAdmin && (
  <a href="/contabilidad" style={{ backgroundColor: 'white', borderRadius: '16px', padding: '28px', boxShadow: '0 2px 12px rgba(0,0,0,0.08)', textDecoration: 'none', color: '#222', textAlign: 'center' as const, display: 'block' }}>
    <div style={{ fontSize: '40px', marginBottom: '12px' }}>📊</div>
    <h3 style={{ margin: 0 }}>Contabilidad</h3>
  </a>
)}

{/* TARJETA Marketing */}
          {(esAdmin || !!usuario?.cargos?.puede_ver_mk) && (
          <a href="/marketing" style={{ backgroundColor: 'white', borderRadius: '16px', padding: '28px', boxShadow: '0 2px 12px rgba(0,0,0,0.08)', textDecoration: 'none', color: '#222', textAlign: 'center' as const }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>🎁</div>
            <h3 style={{ margin: 0 }}>Editar Portada</h3>
          </a>
          )}

{/* TARJETA promociones */}
          {(esAdmin || !!usuario?.cargos?.puede_ver_mk) && (
          <a href="/admin-promociones" style={{ backgroundColor: 'white', borderRadius: '16px', padding: '28px', boxShadow: '0 2px 12px rgba(0,0,0,0.08)', textDecoration: 'none', color: '#222', textAlign: 'center' as const }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>🎁</div>
            <h3 style={{ margin: 0 }}>Editar Promociones</h3>
          </a>
          )}

          {/* TARJETA ASISTENCIA */}
          {(esAdmin || !!usuario?.cargos?.puede_ver_rrhh || !!usuario?.cargos?.puede_gestionar_rrhh) && (
          <a href="/entrada" style={{ backgroundColor: 'white', borderRadius: '16px', padding: '28px', boxShadow: '0 2px 12px rgba(0,0,0,0.08)', textDecoration: 'none', color: '#222', textAlign: 'center' as const, display: 'block' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>🕐</div>
            <h3 style={{ margin: 0 }}>Mi Asistencia</h3>
          </a>
          )}

          {/* TARJETA RRHH - solo admin y gestores RRHH */}
          {(esAdmin || !!usuario) && (
          <a href="/kiosco" style={{ backgroundColor: 'white', borderRadius: '16px', padding: '28px', boxShadow: '0 2px 12px rgba(0,0,0,0.08)', textDecoration: 'none', color: '#222', textAlign: 'center' as const, display: 'block' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>👥</div>
            <h3 style={{ margin: 0 }}>Codigo de personal</h3>
          </a>
          )}
          {/* TARJETA ASISTENCIA */}
          {(esAdmin || !!usuario?.cargos?.puede_ver_rrhh || !!usuario?.cargos?.puede_gestionar_rrhh) && (
          <a href="/rrhh" style={{ backgroundColor: 'white', borderRadius: '16px', padding: '28px', boxShadow: '0 2px 12px rgba(0,0,0,0.08)', textDecoration: 'none', color: '#222', textAlign: 'center' as const, display: 'block' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>👩‍🎓</div>
            <h3 style={{ margin: 0 }}>Recursos Humanos</h3>
          </a>
          )}
          {/* Aqui agregaras mas aplicaciones */}

        </div>
      </div>
    </div>
  )
}
