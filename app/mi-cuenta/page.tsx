'use client'
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'

// TODO: Sube tu catálogo en PDF a un bucket público de Supabase Storage
// (Storage > tu bucket > "..." sobre el archivo > "Get URL") y pega la URL pública aquí.
// Mientras esto esté vacío, el botón de descarga no se muestra.
const CATALOGO_PDF_URL = ''

export default function MiCuentaPage() {
  const [cliente, setCliente] = useState<any>(null)
  const [ventas, setVentas] = useState<any[]>([])
  const [productos, setProductos] = useState<any[]>([])
  const [cargando, setCargando] = useState(true)
  const [tab, setTab] = useState<'pedidos' | 'catalogo'>('pedidos')

  // Filtros del catálogo
  const [categoriaFiltro, setCategoriaFiltro] = useState('Todas')
  const [busquedaCatalogo, setBusquedaCatalogo] = useState('')
  const [productoModal, setProductoModal] = useState<any>(null)

  useEffect(() => {
    const carnetGuardado = localStorage.getItem('carnet')
    const tipoGuardado = localStorage.getItem('tipoUsuario')

    if (!carnetGuardado || tipoGuardado !== 'cliente') {
      window.location.href = '/'
      return
    }

    const fetchDatos = async () => {
      try {
        const { data: clienteData, error: clienteError } = await supabase
          .from('clientes')
          .select('*')
          .eq('carnet', carnetGuardado)
          .single()

        if (clienteError || !clienteData) {
          window.location.href = '/'
          return
        }

        setCliente(clienteData)

        const [ventasRes, productosRes] = await Promise.all([
          supabase
            .from('ventas')
            .select(`*, detalle_venta (*), progreso_produccion (*)`)
            .eq('cod_cliente', clienteData.id)
            .order('fecha_pedido', { ascending: false }),
          supabase
            .from('productos')
            .select('*')
            .order('categoria', { ascending: true }),
        ])

        const { data: ventasData, error: ventasError } = ventasRes
        if (ventasError) console.error('Error al cargar ventas:', ventasError)

        if (!ventasError && ventasData) {
          const codigosProducto = Array.from(
            new Set(
              ventasData.flatMap((v: any) => v.detalle_venta || []).map((d: any) => d.cod_producto).filter(Boolean)
            )
          )

          let productosMap: Record<string, any> = {}
          if (codigosProducto.length > 0) {
            const { data: prodData } = await supabase.from('productos').select('*').in('codigo', codigosProducto)
            if (prodData) productosMap = Object.fromEntries(prodData.map((p: any) => [p.codigo, p]))
          }

          setVentas(
            ventasData.map((v: any) => ({
              ...v,
              detalle_venta: (v.detalle_venta || []).map((d: any) => ({
                ...d,
                productos: productosMap[d.cod_producto] || null,
              })),
            }))
          )
        }

        const { data: productosData, error: productosError } = productosRes
        if (productosError) console.error('Error al cargar catálogo:', productosError)
        if (productosData) setProductos(productosData)
      } catch (err) {
        console.error('Error al cargar datos:', err)
      } finally {
        setCargando(false)
      }
    }

    fetchDatos()
  }, [])

  const categorias = useMemo(() => {
    const unicas = Array.from(new Set(productos.map((p) => p.categoria).filter(Boolean)))
    return ['Todas', ...unicas]
  }, [productos])

  const productosFiltrados = useMemo(() => {
    return productos.filter((p) => {
      const coincideCategoria = categoriaFiltro === 'Todas' || p.categoria === categoriaFiltro
      const coincideBusqueda = (p.nombre || '').toLowerCase().includes(busquedaCatalogo.trim().toLowerCase())
      return coincideCategoria && coincideBusqueda
    })
  }, [productos, categoriaFiltro, busquedaCatalogo])

  const handleCerrarSesion = () => {
    localStorage.removeItem('carnet')
    localStorage.removeItem('tipoUsuario')
    window.location.href = '/'
  }

  if (cargando) {
    return (
      <div style={{ minHeight: '100vh', background: '#0f1117', color: '#FFD700', display: 'flex', justifyContent: 'center', alignItems: 'center', fontFamily: 'Inter, sans-serif' }}>
        <p>Cargando tu panel VIP...</p>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0f1117', color: 'white', fontFamily: 'Inter, sans-serif', paddingBottom: '60px' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 40px', background: '#161726', borderBottom: '1px solid rgba(255,215,0,0.2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <img src="/logo.jpg" alt="Logo" style={{ width: '35px', height: '35px', borderRadius: '8px' }} />
          <span style={{ fontWeight: '800', color: '#FFD700', fontSize: '16px' }}>Muebles is Better</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <a href="/" style={{ color: '#ccc', textDecoration: 'none', fontSize: '14px' }}>Inicio</a>
          <button onClick={handleCerrarSesion} style={{ background: 'none', border: '1px solid #ff6b6b', color: '#ff6b6b', padding: '6px 16px', borderRadius: '20px', cursor: 'pointer', fontSize: '13px' }}>Cerrar Sesión</button>
        </div>
      </header>

      <main style={{ maxWidth: '1100px', margin: '40px auto', padding: '0 20px' }}>
        <div style={{ background: '#161726', border: '1px solid rgba(255,215,0,0.3)', borderRadius: '16px', padding: '30px', marginBottom: '30px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '20px' }}>
          <div>
            <span style={{ color: '#FFD700', fontSize: '12px', letterSpacing: '1px', textTransform: 'uppercase' }}>Portal de Cliente VIP</span>
            <h1 style={{ margin: '5px 0 0 0', fontSize: '26px' }}>¡Hola, {cliente?.nombre}!</h1>
            <p style={{ margin: '5px 0 0 0', color: '#aaa', fontSize: '14px' }}>Código de Cliente: <strong>{cliente?.codigo}</strong> | Carnet: {cliente?.carnet}</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span style={{ fontSize: '13px', color: '#aaa', display: 'block' }}>Celular de contacto</span>
            <strong style={{ color: 'white' }}>{cliente?.celular || 'No registrado'}</strong>
          </div>
        </div>

        {/* PESTAÑAS */}
        <div style={{ display: 'flex', gap: '8px', background: '#161726', padding: '6px', borderRadius: '14px', marginBottom: '30px', border: '1px solid rgba(255,255,255,0.05)', width: 'fit-content' }}>
          <button
            onClick={() => setTab('pedidos')}
            style={{
              padding: '10px 22px', borderRadius: '10px', border: 'none', cursor: 'pointer',
              fontWeight: 'bold', fontSize: '14px', transition: '0.2s',
              background: tab === 'pedidos' ? 'linear-gradient(135deg, #FFD700, #FFA500)' : 'transparent',
              color: tab === 'pedidos' ? '#0a0a1a' : '#ccc',
            }}
          >
            Mis Pedidos
          </button>
          <button
            onClick={() => setTab('catalogo')}
            style={{
              padding: '10px 22px', borderRadius: '10px', border: 'none', cursor: 'pointer',
              fontWeight: 'bold', fontSize: '14px', transition: '0.2s',
              background: tab === 'catalogo' ? 'linear-gradient(135deg, #FFD700, #FFA500)' : 'transparent',
              color: tab === 'catalogo' ? '#0a0a1a' : '#ccc',
            }}
          >
            Catálogo
          </button>
        </div>

        {/* ===================== TAB: PEDIDOS ===================== */}
        {tab === 'pedidos' && (
          <>
            <h2 style={{ fontSize: '20px', color: '#FFD700', marginBottom: '20px' }}>Mis Pedidos y Estado de Producción</h2>

            {ventas.length === 0 ? (
              <div style={{ background: '#161726', padding: '40px', borderRadius: '16px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.05)' }}>
                <p style={{ color: '#aaa', fontSize: '15px', margin: '0 0 15px 0' }}>Aún no tienes pedidos registrados en el sistema.</p>
                <a href="/cotizador" style={{ background: 'linear-gradient(135deg, #FFD700, #FFA500)', color: '#0a0a1a', padding: '10px 24px', borderRadius: '25px', fontWeight: 'bold', textDecoration: 'none', display: 'inline-block' }}>Crear Cotización</a>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {ventas.map((venta, index) => {
                  const progreso = Array.isArray(venta.progreso_produccion) ? venta.progreso_produccion[0] : venta.progreso_produccion
                  const estadoActual = progreso?.estado || 1

                  const estadosTexto = [
                    '1. Diseño y Planificación',
                    '2. Corte de Acero y Melamina',
                    '3. Ensamblaje y Estructura',
                    '4. Acabados y Detalles',
                    '5. Listo para Entrega / Envío'
                  ]

                  return (
                    <div key={index} style={{ background: '#161726', border: '1px solid rgba(255,215,0,0.2)', borderRadius: '16px', padding: '25px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '15px', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
                        <div>
                          <span style={{ fontSize: '12px', color: '#FFD700', fontWeight: 'bold' }}>PEDIDO #{venta.cod_venta || venta.id}</span>
                          <span style={{ fontSize: '12px', color: '#aaa', marginLeft: '15px' }}>Fecha: {venta.fecha_pedido ? new Date(venta.fecha_pedido).toLocaleDateString() : (venta.creado_en ? new Date(venta.creado_en).toLocaleDateString() : 'Sin fecha')}</span>
                        </div>
                        <div style={{ background: 'rgba(255,215,0,0.1)', color: '#FFD700', padding: '5px 12px', borderRadius: '12px', fontSize: '12px', fontWeight: 'bold' }}>
                          Estado: {estadosTexto[estadoActual - 1] || 'En Proceso'}
                        </div>
                      </div>

                      <div style={{ marginBottom: '25px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '11px', color: '#aaa' }}>
                          <span>Progreso de Fabricación</span>
                          <span style={{ color: '#FFD700', fontWeight: 'bold' }}>Fase {estadoActual} de 5</span>
                        </div>
                        <div style={{ display: 'flex', gap: '6px', height: '8px', background: '#0d0d1f', borderRadius: '4px', overflow: 'hidden' }}>
                          {[1, 2, 3, 4, 5].map((paso) => (
                            <div key={paso} style={{ flex: 1, background: paso <= estadoActual ? 'linear-gradient(135deg, #FFD700, #FFA500)' : 'rgba(255,255,255,0.1)', transition: 'background 0.3s' }} />
                          ))}
                        </div>
                      </div>

                      <div>
                        <h4 style={{ fontSize: '14px', color: '#ccc', margin: '0 0 10px 0' }}>Artículos del Pedido:</h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {venta.detalle_venta?.map((item: any, idx: number) => (
                            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', background: '#0d0d1f', padding: '10px 15px', borderRadius: '8px', fontSize: '13px' }}>
                              <span>{item.productos?.nombre || item.descripcion || `Producto #${item.cod_producto}`} (Cant: {item.cantidad})</span>
                              <span style={{ color: '#FFD700' }}>Bs. {item.subtotal || item.precio}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '15px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '15px' }}>
                        <span style={{ fontSize: '14px', color: '#aaa' }}>Total Inversión:</span>
                        <span style={{ fontSize: '18px', fontWeight: 'bold', color: '#FFD700' }}>Bs. {venta.total_venta ?? '0.00'}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}

        {/* ===================== TAB: CATÁLOGO ===================== */}
        {tab === 'catalogo' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '20px', color: '#FFD700', margin: 0 }}>Catálogo de Productos</h2>
              {CATALOGO_PDF_URL ? (
                <a
                  href={CATALOGO_PDF_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ background: 'rgba(255,215,0,0.1)', border: '1px solid #FFD700', color: '#FFD700', padding: '8px 18px', borderRadius: '20px', fontSize: '13px', fontWeight: 'bold', textDecoration: 'none' }}
                >
                  📄 Descargar Catálogo PDF
                </a>
              ) : null}
            </div>

            {/* Buscador + filtro de categoría */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginBottom: '25px' }}>
              <input
                type="text"
                placeholder="Buscar producto por nombre..."
                value={busquedaCatalogo}
                onChange={(e) => setBusquedaCatalogo(e.target.value)}
                style={{
                  padding: '12px 16px', borderRadius: '10px', border: '1px solid rgba(255,215,0,0.3)',
                  fontSize: '14px', width: '100%', boxSizing: 'border-box', backgroundColor: '#0d0d1f', color: 'white', outline: 'none',
                }}
              />
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {categorias.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setCategoriaFiltro(cat)}
                    style={{
                      padding: '7px 16px', borderRadius: '20px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer',
                      border: categoriaFiltro === cat ? 'none' : '1px solid rgba(255,255,255,0.15)',
                      background: categoriaFiltro === cat ? 'linear-gradient(135deg, #FFD700, #FFA500)' : 'transparent',
                      color: categoriaFiltro === cat ? '#0a0a1a' : '#ccc',
                      transition: '0.2s',
                    }}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Grid de productos */}
            {productosFiltrados.length === 0 ? (
              <div style={{ background: '#161726', padding: '40px', borderRadius: '16px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.05)' }}>
                <p style={{ color: '#aaa', fontSize: '15px', margin: 0 }}>No se encontraron productos con ese filtro.</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '20px' }}>
                {productosFiltrados.map((p) => (
                  <div
                    key={p.codigo}
                    onClick={() => setProductoModal(p)}
                    style={{
                      background: '#161726', border: '1px solid rgba(255,215,0,0.15)', borderRadius: '16px',
                      overflow: 'hidden', cursor: 'pointer', transition: 'transform 0.2s, border-color 0.2s',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.borderColor = '#FFD700' }}
                    onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.borderColor = 'rgba(255,215,0,0.15)' }}
                  >
                    <div style={{ width: '100%', height: '160px', background: '#0d0d1f', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {p.foto_url ? (
                        <img src={p.foto_url} alt={p.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <span style={{ color: '#444', fontSize: '13px' }}>Sin imagen</span>
                      )}
                    </div>
                    <div style={{ padding: '15px' }}>
                      <span style={{ fontSize: '10px', color: '#FFD700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{p.categoria || 'General'}</span>
                      <h3 style={{ margin: '4px 0 6px 0', fontSize: '15px' }}>{p.nombre}</h3>
                      {p.medidas && <p style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#aaa' }}>{p.medidas}</p>}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                        <div style={{ color: '#FFD700', fontWeight: 'bold', fontSize: '16px' }}>
                          {p.precio_tienda ? `Bs. ${p.precio_tienda}` : 'Consultar precio'}
                        </div>
                        <a
                          href={`/mi-cuenta/comprar?producto=${p.codigo}`}
                          onClick={(e) => e.stopPropagation()}
                          style={{ background: 'linear-gradient(135deg, #FFD700, #FFA500)', color: '#0a0a1a', padding: '6px 14px', borderRadius: '16px', fontWeight: 'bold', textDecoration: 'none', fontSize: '12px', whiteSpace: 'nowrap' }}
                        >
                          🛒 Comprar
                        </a>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {/* MODAL DE DETALLE DE PRODUCTO */}
      {productoModal && (
        <div
          onClick={() => setProductoModal(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#161726', borderRadius: '20px', maxWidth: '480px', width: '100%',
              overflow: 'hidden', border: '1px solid rgba(255,215,0,0.3)', boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
            }}
          >
            <div style={{ width: '100%', height: '260px', background: '#0d0d1f', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {productoModal.foto_url ? (
                <img src={productoModal.foto_url} alt={productoModal.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <span style={{ color: '#444', fontSize: '14px' }}>Sin imagen</span>
              )}
            </div>
            <div style={{ padding: '25px' }}>
              <span style={{ fontSize: '11px', color: '#FFD700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{productoModal.categoria || 'General'}</span>
              <h2 style={{ margin: '6px 0 10px 0', fontSize: '22px' }}>{productoModal.nombre}</h2>
              {productoModal.medidas && (
                <p style={{ margin: '0 0 15px 0', color: '#ccc', fontSize: '14px' }}>Medidas: {productoModal.medidas}</p>
              )}
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#FFD700', marginBottom: '20px' }}>
                {productoModal.precio_tienda ? `Bs. ${productoModal.precio_tienda}` : 'Consultar precio'}
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={() => setProductoModal(null)}
                  style={{ flex: 1, background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: '#ccc', padding: '12px', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer', fontSize: '14px' }}
                >
                  Cerrar
                </button>
                <a
                  href={`/mi-cuenta/comprar?producto=${productoModal.codigo}`}
                  style={{ flex: 2, background: 'linear-gradient(135deg, #FFD700, #FFA500)', color: '#0a0a1a', padding: '12px', borderRadius: '10px', fontWeight: 'bold', textAlign: 'center', textDecoration: 'none', fontSize: '14px' }}
                >
                  🛒 Comprar
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
