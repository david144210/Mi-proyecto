'use client'

import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import ProgresoWidget from '../../components/ProgresoWidget'

// Utilidades de fechas basadas en las políticas del dashboard financiero
const getMesAnterior = (mesStr: string) => {
  const [anio, mes] = mesStr.split('-').map(Number)
  const fecha = new Date(anio, mes - 2, 1)
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`
}

const getRangoFechas = (mesStr: string) => {
  const [anio, mes] = mesStr.split('-')
  const inicio = `${mesStr}-01`
  const fin = new Date(parseInt(anio), parseInt(mes), 0).toISOString().split('T')[0]
  return { inicio, fin }
}

export default function Sistema() {
  const [usuario, setUsuario] = useState<any>(null)
  const [esVendedorAsignado, setEsVendedorAsignado] = useState(false)
  const [podioVentas, setPodioVentas] = useState<{ primero: any, segundo: any }>({ primero: null, segundo: null })
  const [loading, setLoading] = useState(true)
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  useEffect(() => {
    const carnetGuardado = localStorage.getItem('carnet')
    if (!carnetGuardado) { window.location.replace('/'); return }

    // 1. Cargar datos del usuario actual
    supabase.from('personal').select('*, cargos(*)')
      .eq('carnet', carnetGuardado)
      .eq('estado', true)
      .single()
      .then(async ({ data: userData }) => {
        if (!userData) {
          window.location.replace('/')
          return
        }
        setUsuario(userData)

        const esAdminUser = userData?.cargos?.es_admin === true

        // 2. Verificar si el usuario es un vendedor activo asignado
        const { data: vendedorData } = await supabase.from('vendedores')
          .select('id')
          .or(`personal_id.eq.${userData.id},ci.eq.${userData.carnet}`)
          .eq('activo', true)
          .maybeSingle()

        const tieneVentasAsignadas = esAdminUser || !!vendedorData
        setEsVendedorAsignado(tieneVentasAsignadas)
        setLoading(false)

        // 3. Si tiene permisos o ventas asignadas, calcular métricas y podio
        if (tieneVentasAsignadas) {
          calcularMetricasYPodio()
        }
      })

    const calcularMetricasYPodio = async () => {
      try {
        const hoy = new Date()
        const mesActualStr = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`
        const mesAnteriorStr = getMesAnterior(mesActualStr)
        const { inicio: iniAnt, fin: finAnt } = getRangoFechas(mesAnteriorStr)

        // Cargar vendedores activos y registros de personal en paralelo
        const [{ data: vends }, { data: personalList }] = await Promise.all([
          supabase.from('vendedores').select('id, nombre, personal_id, ci').eq('activo', true),
          supabase.from('personal').select('id, carnet, foto_url')
        ])

        const personalMap = new Map()
        personalList?.forEach((p: any) => {
          if (p.id) personalMap.set(String(p.id), p.foto_url)
          if (p.carnet) personalMap.set(String(p.carnet), p.foto_url)
        })

        const mapaVendedores: Record<number, any> = {}
        vends?.forEach((v: any) => {
          const foto = (v.personal_id && personalMap.get(String(v.personal_id))) || 
                       (v.ci && personalMap.get(String(v.ci))) || 
                       null
          mapaVendedores[v.id] = { id: v.id, nombre: v.nombre, foto, vendido: 0, cobrado: 0, pedidos: 0 }
        })

        // Obtener ventas del mes anterior con estado activo (> 0)
        const { data: ventasAnterior } = await supabase.from('ventas')
          .select('id, cod_venta, cod_vendedor, total_venta, anticipo, fecha_pedido')
          .gte('fecha_pedido', iniAnt)
          .lte('fecha_pedido', finAnt)
          .gt('estado', 0)

        // Obtener cobranzas del mes anterior vinculadas a los vendedores
        const { data: cobrosAnterior } = await supabase.from('cobranzas')
          .select('cod_venta, total_cobrado, ventas!inner(cod_vendedor)')
          .gte('created_at', `${iniAnt}T00:00:00`)
          .lte('created_at', `${finAnt}T23:59:59`)

        ventasAnterior?.forEach((v: any) => {
          const totalVenta = Number(v.total_venta) || 0
          const anticipo = Number(v.anticipo) || 0
          if (v.cod_vendedor && mapaVendedores[v.cod_vendedor]) {
            mapaVendedores[v.cod_vendedor].vendido += totalVenta
            mapaVendedores[v.cod_vendedor].cobrado += anticipo
            mapaVendedores[v.cod_vendedor].pedidos += 1
          }
        })

        cobrosAnterior?.forEach((c: any) => {
          const monto = Number(c.total_cobrado) || 0
          const codVendedor = c.ventas?.cod_vendedor
          if (codVendedor && mapaVendedores[codVendedor]) {
            mapaVendedores[codVendedor].cobrado += monto
          }
        })

        const ranking = Object.values(mapaVendedores)
          .filter((r: any) => r.vendido > 0 || r.cobrado > 0)
          .sort((a: any, b: any) => b.vendido - a.vendido)

        setPodioVentas({
          primero: ranking[0] || null,
          segundo: ranking[1] || null
        })
      } catch (error) {
        console.error("Error calculando podio comercial:", error)
      }
    }
  }, [])

  // Estilo mejorado para las tarjetas de opciones con bordes dorados sutiles y fondo traslúcido
  const cardStyle: React.CSSProperties = { 
    backgroundColor: 'rgba(255, 255, 255, 0.95)', 
    borderRadius: '16px', 
    padding: '24px 20px', 
    boxShadow: '0 6px 16px rgba(0, 31, 63, 0.06)', 
    textDecoration: 'none', 
    color: '#001f3f', 
    textAlign: 'center',
    border: '1px solid rgba(212, 175, 55, 0.25)',
    backdropFilter: 'blur(6px)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.25s ease-in-out',
  }

  if (loading) return <p style={{ textAlign: 'center', marginTop: '100px', color: '#001f3f', fontWeight: 'bold' }}>Cargando sistema...</p>

  const nombreMostrar = usuario?.usuario || usuario?.nombre || usuario?.carnet || 'Usuario'
  const esAdmin = usuario?.cargos?.es_admin === true

  return (
    <div style={{ 
      fontFamily: 'Arial, sans-serif', 
      minHeight: '100vh', 
      backgroundColor: '#f4f6f9',
      backgroundImage: 'linear-gradient(rgba(244, 246, 249, 0.93), rgba(244, 246, 249, 0.75)), url("/mascota.png")',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
      backgroundSize: '450px',
      backgroundAttachment: 'fixed'
    }}>
      
      {/* NAVBAR */}
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 30px', backgroundColor: '#001f3f', color: 'white', position: 'sticky', top: 0, zIndex: 1000, boxShadow: '0 2px 10px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <button onClick={() => setIsMenuOpen(!isMenuOpen)} style={{ background: 'none', border: 'none', color: '#D4AF37', fontSize: '24px', cursor: 'pointer' }}>☰</button>
          <img src="/mascota.png" alt="Logo" style={{ height: '40px', width: '40px', objectFit: 'contain' }} />
          <a href="/" style={{ fontWeight: 'bold', fontSize: '20px', color: 'white', textDecoration: 'none', letterSpacing: '0.5px' }}>Muebles is Better</a>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <span style={{ color: '#D4AF37', fontSize: '14px', fontWeight: '600' }}>{nombreMostrar} 👤</span>
          <a href="/" style={{ backgroundColor: '#D4AF37', color: '#001f3f', padding: '6px 15px', borderRadius: '20px', fontSize: '12px', textDecoration: 'none', fontWeight: 'bold' }}>Salir</a>
        </div>
      </nav>

      {/* MENÚ HAMBURGUESA LATERAL */}
      <div style={{ position: 'fixed', top: 0, left: isMenuOpen ? 0 : '-250px', height: '100%', width: '250px', backgroundColor: '#001f3f', transition: '0.3s', padding: '80px 20px', zIndex: 900, boxShadow: '2px 0 10px rgba(0,0,0,0.3)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <a href="/cotizador" style={{ color: '#D4AF37', textDecoration: 'none', fontSize: '18px', borderBottom: '1px solid rgba(212, 175, 55, 0.3)', paddingBottom: '10px' }}>⚡ Cotizador</a>
          <a href="/productos" style={{ color: '#D4AF37', textDecoration: 'none', fontSize: '18px', borderBottom: '1px solid rgba(212, 175, 55, 0.3)', paddingBottom: '10px' }}>📦 Productos</a>
          {(esAdmin || !!usuario?.cargos?.puede_ver_entregas || !!usuario?.cargos?.puede_gestionar_encargado_delivery) && (
            <a href="/deliverys" style={{ color: '#D4AF37', textDecoration: 'none', fontSize: '18px', borderBottom: '1px solid rgba(212, 175, 55, 0.3)', paddingBottom: '10px' }}>🚚 Deliverys</a>
          )}
        </div>
      </div>

      <div style={{ padding: '40px', maxWidth: '1200px', margin: '0 auto' }}>
        <h1 style={{ marginBottom: '8px', color: '#001f3f', fontWeight: '700' }}>Bienvenido de vuelta, {nombreMostrar.split(' ')[0]} 👋</h1>
        <p style={{ color: '#555', marginBottom: '30px', fontWeight: '500' }}>{usuario?.cargos?.nombre}</p>

        {/* WIDGET DE PROGRESIÓN PERSONAL */}
        {esVendedorAsignado && <ProgresoWidget />}

        {/* ── SECCIÓN PODIO COMERCIAL ── */}
        {esVendedorAsignado && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginBottom: '40px' }}>
            
            {/* 1ER LUGAR (ORO) */}
            <div style={{
              background: 'linear-gradient(135deg, #001f3f 0%, #003366 100%)',
              borderRadius: '16px',
              padding: '24px',
              color: 'white',
              border: '3px solid #D4AF37',
              boxShadow: '0 8px 24px rgba(212, 175, 55, 0.25)',
              display: 'flex',
              alignItems: 'center',
              gap: '20px'
            }}>
              <div style={{ 
                width: '70px', height: '70px', borderRadius: '50%', 
                backgroundColor: '#222', border: '2px solid #D4AF37', 
                display: 'flex', alignItems: 'center', justifyContent: 'center', 
                overflow: 'hidden', flexShrink: '0', position: 'relative' 
              }}>
                {podioVentas.primero?.foto ? (
                  <img src={podioVentas.primero.foto} alt="1er Lugar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <span style={{ fontSize: '32px' }}>👑</span>
                )}
              </div>
              <div style={{ overflow: 'hidden' }}>
                <span style={{ backgroundColor: '#D4AF37', color: '#001f3f', padding: '3px 10px', borderRadius: '10px', fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px' }}>
                  1er Lugar — Mes Anterior
                </span>
                <h2 style={{ margin: '6px 0 2px 0', fontSize: '20px', color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {podioVentas.primero ? podioVentas.primero.nombre : 'Por definir'}
                </h2>
                <p style={{ margin: 0, color: '#D4AF37', fontSize: '13px', fontWeight: 'bold' }}>
                  ⭐ Excelencia en Ventas ⭐
                </p>
              </div>
            </div>

            {/* 2DO LUGAR (PLATA) */}
            <div style={{
              background: 'linear-gradient(135deg, #001f3f 0%, #1c2a38 100%)',
              borderRadius: '16px',
              padding: '24px',
              color: 'white',
              border: '2px solid #94a3b8',
              boxShadow: '0 8px 24px rgba(148, 163, 184, 0.2)',
              display: 'flex',
              alignItems: 'center',
              gap: '20px'
            }}>
              <div style={{ 
                width: '70px', height: '70px', borderRadius: '50%', 
                backgroundColor: '#222', border: '2px solid #94a3b8', 
                display: 'flex', alignItems: 'center', justifyContent: 'center', 
                overflow: 'hidden', flexShrink: '0', position: 'relative' 
              }}>
                {podioVentas.segundo?.foto ? (
                  <img src={podioVentas.segundo.foto} alt="2do Lugar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <span style={{ fontSize: '32px' }}>🥈</span>
                )}
              </div>
              <div style={{ overflow: 'hidden' }}>
                <span style={{ backgroundColor: '#94a3b8', color: '#001f3f', padding: '3px 10px', borderRadius: '10px', fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px' }}>
                  2do Lugar — Mes Anterior
                </span>
                <h2 style={{ margin: '6px 0 2px 0', fontSize: '20px', color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {podioVentas.segundo ? podioVentas.segundo.nombre : 'Por definir'}
                </h2>
                <p style={{ margin: 0, color: '#cbd5e1', fontSize: '13px', fontWeight: 'bold' }}>
                  🥈 Destacado Comercial 🥈
                </p>
              </div>
            </div>

          </div>
        )}

        {/* GRILLA DE OPCIONES DEL SISTEMA (Botones estilizados) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
          <a href="/perfil" style={cardStyle}><div style={{ fontSize: '38px', marginBottom: '10px' }}>👤</div><h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>Mi Perfil</h3></a>
          <a href="/clientes" style={cardStyle}><div style={{ fontSize: '38px', marginBottom: '10px' }}>👥</div><h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>Clientes</h3></a>
          <a href="/stock" style={cardStyle}><div style={{ fontSize: '38px', marginBottom: '10px' }}>🏪</div><h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>Tiendas</h3></a>

          {(esAdmin || !!usuario?.cargos?.puede_ver_cotizador) && (
            <a href="/ventas" style={cardStyle}><div style={{ fontSize: '38px', marginBottom: '10px' }}>💰</div><h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>Ventas</h3></a>
          )}
          {(esAdmin || !!usuario?.cargos?.puede_ver_caja_chica) && (
            <a href="/cajas" style={cardStyle}><div style={{ fontSize: '38px', marginBottom: '10px' }}>🧾</div><h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>Caja Chica</h3></a>
          )}
          {(esAdmin || !!usuario?.cargos?.puede_ver_entregas || !!usuario?.cargos?.puede_gestionar_encargado_delivery) && (
            <a href="/deliverys" style={cardStyle}><div style={{ fontSize: '38px', marginBottom: '10px' }}>🚚</div><h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>Deliverys</h3></a>
          )}
          {esAdmin && (
            <a href="/personal" style={cardStyle}><div style={{ fontSize: '38px', marginBottom: '10px' }}>🏢</div><h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>Personal</h3></a>
          )}
          {esAdmin && (
            <a href="/ventas/anular" style={cardStyle}><div style={{ fontSize: '38px', marginBottom: '10px' }}>🏢</div><h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>Anular Ventas</h3></a>
          )}
          {(esAdmin || !!usuario?.cargos?.puede_ver_compras) && (
            <>
              <a href="/melaminas" style={cardStyle}><div style={{ fontSize: '38px', marginBottom: '10px' }}>🧱</div><h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>Registro de Melaminas</h3></a>
              <a href="/compra-melaminas" style={cardStyle}><div style={{ fontSize: '38px', marginBottom: '10px' }}>🛒</div><h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>Compra de Melaminas</h3></a>
              <a href="/aceros" style={cardStyle}><div style={{ fontSize: '38px', marginBottom: '10px' }}>⛓</div><h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>Registro Acero</h3></a>
              <a href="/compras-acero" style={cardStyle}><div style={{ fontSize: '38px', marginBottom: '10px' }}>💰⛓</div><h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>Compra Acero</h3></a>
              <a href="/accesorios" style={cardStyle}><div style={{ fontSize: '38px', marginBottom: '10px' }}>⚙️</div><h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>Registro Accesorios</h3></a>
              <a href="/compras-accesorios" style={cardStyle}><div style={{ fontSize: '38px', marginBottom: '10px' }}>💰⚙️</div><h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>Compra Accesorios</h3></a>
              <a href="/insumos" style={cardStyle}><div style={{ fontSize: '38px', marginBottom: '10px' }}>🧪</div><h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>Registro Insumos</h3></a>
              <a href="/compras-insumos" style={cardStyle}><div style={{ fontSize: '38px', marginBottom: '10px' }}>💰🧪</div><h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>Compra Insumos</h3></a>
              <a href="/proveedores" style={cardStyle}><div style={{ fontSize: '38px', marginBottom: '10px' }}>👩‍🚒</div><h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>Proveedores</h3></a>
            </>
          )}
          {(esAdmin || !!usuario?.cargos?.puede_ver_produccion) && (
            <>
              <a href="/produccion" style={cardStyle}><div style={{ fontSize: '38px', marginBottom: '10px' }}>🏭</div><h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>Producción</h3></a>
              <a href="/presupuestos_prod" style={cardStyle}><div style={{ fontSize: '38px', marginBottom: '10px' }}>🧮</div><h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>Presupuestos de Producción</h3></a>
              <a href="/construccion" style={cardStyle}><div style={{ fontSize: '38px', marginBottom: '10px' }}>🚧</div><h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>Construcción</h3></a>
            </>
          )}
          {(esAdmin || !!usuario) && (
             <a href="/calendario" style={cardStyle}><div style={{ fontSize: '38px', marginBottom: '10px' }}>📅</div><h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>Calendario</h3></a>
          )}
          {(esAdmin || !!usuario?.cargos?.puede_ver_entregas) && (
            <>
              <a href="/entregas" style={cardStyle}><div style={{ fontSize: '38px', marginBottom: '10px' }}>📦</div><h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>Despachos</h3></a>
              <a href="/cobros" style={cardStyle}><div style={{ fontSize: '38px', marginBottom: '10px' }}>💲</div><h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>Cobros</h3></a>
            </>
          )}
          {(esAdmin || !!usuario?.cargos?.puede_ver_entregas || !!usuario?.cargos?.puede_ver_mk) && (
            <>
              <a href="/consulta" style={cardStyle}><div style={{ fontSize: '38px', marginBottom: '10px' }}>📈</div><h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>Informe Ventas</h3></a>
              <a href="/ventas/smart" style={cardStyle}><div style={{ fontSize: '38px', marginBottom: '10px' }}>🤯</div><h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>Business Intelligence</h3></a>
            </>
          )}
          {esAdmin && (
            <a href="/contabilidad" style={cardStyle}><div style={{ fontSize: '38px', marginBottom: '10px' }}>📊</div><h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>Contabilidad</h3></a>
          )}
          {(esAdmin || !!usuario?.cargos?.puede_ver_mk) && (
            <>
              <a href="/marketing" style={cardStyle}><div style={{ fontSize: '38px', marginBottom: '10px' }}>🎁</div><h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>Editar Portada</h3></a>
              <a href="/admin-promociones" style={cardStyle}><div style={{ fontSize: '38px', marginBottom: '10px' }}>🎁</div><h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>Editar Promociones</h3></a>
            </>
          )}
          {(esAdmin || !!usuario?.cargos?.puede_ver_rrhh || !!usuario?.cargos?.puede_gestionar_rrhh) && (
            <>
              <a href="/entrada" style={cardStyle}><div style={{ fontSize: '38px', marginBottom: '10px' }}>🕐</div><h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>Mi Asistencia</h3></a>
              <a href="/rrhh" style={cardStyle}><div style={{ fontSize: '38px', marginBottom: '10px' }}>👩‍🎓</div><h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>Recursos Humanos</h3></a>
            </>
          )}
          {(esAdmin || !!usuario) && (
            <a href="/kiosco" style={cardStyle}><div style={{ fontSize: '38px', marginBottom: '10px' }}>👥</div><h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>Codigo de personal</h3></a>
          )}
        </div>
      </div>
    </div>
  )
}