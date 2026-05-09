'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'

// ── Tipos ─────────────────────────────────────────────────────
interface Pedido {
  id: number
  cod_venta: number
  cliente: string
  vendedor: string
  fecha_entrega: string | null
  estado: number | null
  total?: number | null
  reprogramado: boolean
}

// ── Estados ───────────────────────────────────────────────────
const ESTADOS = [
  { value: 1, label: 'En cola', color: '#ffa726' },
  { value: 2, label: 'Produciendo', color: '#42a5f5' },
  { value: 3, label: 'Terminado', color: '#66bb6a' },
  { value: 4, label: 'Despachado', color: '#ab47bc' }
]

// ── Helpers ───────────────────────────────────────────────────
const obtenerColorEstado = (estado: number | null) => {
  return ESTADOS.find(e => e.value === estado)?.color || '#999'
}

const obtenerNombreEstado = (estado: number | null) => {
  return ESTADOS.find(e => e.value === estado)?.label || 'Sin estado'
}

// ── Página ────────────────────────────────────────────────────
export default function CalendarioPedidos() {

  const [usuario, setUsuario] = useState<any>(null)
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [loading, setLoading] = useState(true)

  // MODAL
  const [pedidoSeleccionado, setPedidoSeleccionado] = useState<any>(null)
  const [mostrarModal, setMostrarModal] = useState(false)

  // Evitar hydration error
  const [mesActual, setMesActual] = useState(0)
  const [anioActual, setAnioActual] = useState(2026)

  // ── Fecha inicial ───────────────────────────────────────────
  useEffect(() => {

    const hoy = new Date()

    setMesActual(hoy.getMonth())
    setAnioActual(hoy.getFullYear())

  }, [])

  // ── Seguridad ───────────────────────────────────────────────
  useEffect(() => {

    const carnetGuardado = localStorage.getItem('carnet')

    if (!carnetGuardado) {
      window.location.replace('/')
      return
    }

    supabase
      .from('personal')
      .select('*, cargos(*)')
      .eq('carnet', carnetGuardado)
      .eq('estado', true)
      .single()
      .then(({ data }) => {

        if (!data) {
          window.location.replace('/')
          return
        }

        setUsuario(data)
        cargarPedidos()

      })

  }, [])

// AUTO REFRESH
useEffect(() => {

  const intervalo = setInterval(() => {
    cargarPedidos()
  }, 60000)

  return () => clearInterval(intervalo)

}, [])

  // ── Cargar pedidos ──────────────────────────────────────────
  const cargarPedidos = async () => {

    setLoading(true)

    try {

      const { data: ventasData, error } = await supabase
        .from('ventas')
        .select('*')
        .not('fecha_entrega', 'is', null)
        .in('estado', [1, 2, 3, 4])
        .order('fecha_entrega', { ascending: true })

      if (error) throw error

      // CLIENTES
      const clientesIds = ventasData
        .map(v => v.cod_cliente)
        .filter(Boolean)

      const { data: clientesData } = await supabase
        .from('clientes')
        .select('id, nombre')
        .in('id', clientesIds)

      const clientesMap = Object.fromEntries(
        clientesData?.map(c => [c.id, c.nombre]) || []
      )

      // VENDEDORES
      const vendedoresIds = ventasData
        .map(v => v.cod_vendedor)
        .filter(Boolean)

      const { data: vendedoresData } = await supabase
        .from('vendedores')
        .select('id, nombre')
        .in('id', vendedoresIds)

      const vendedoresMap = Object.fromEntries(
        vendedoresData?.map(v => [v.id, v.nombre]) || []
      )

      // PROGRESO
      const codigosPedidos = ventasData
        .map(v => v.cod_venta)
        .filter(Boolean)

      const { data: progresoData } = await supabase
        .from('progreso_produccion')
        .select('codigo_pedido, reprogramado')
        .in('codigo_pedido', codigosPedidos)

      const progresoMap = Object.fromEntries(
        progresoData?.map(p => [p.codigo_pedido, p.reprogramado === true]) || []
      )

      // PEDIDOS
      const pedidosProcesados = ventasData.map((v: any) => ({
        id: v.id,
        cod_venta: v.cod_venta,
        cliente: clientesMap[v.cod_cliente] || 'Sin cliente',
        vendedor: vendedoresMap[v.cod_vendedor] || 'Sin vendedor',
        fecha_entrega: v.fecha_entrega,
        estado: v.estado,
        total: v.total_venta,
        reprogramado: progresoMap[v.cod_venta] || false
      }))

      setPedidos(pedidosProcesados)

    } catch (error) {

      console.error(error)
      alert('Error cargando pedidos')

    } finally {

      setLoading(false)

    }
  }

  // ── Abrir detalle ───────────────────────────────────────────
  const abrirDetallePedido = async (codVenta: number) => {

    try {

      const { data: ventaData, error } = await supabase
        .from('ventas')
        .select('*')
        .eq('cod_venta', codVenta)
        .single()

      if (error) throw error

      // CLIENTE
      let clienteNombre = 'Sin cliente'
      let vendedorNombre = 'Sin vendedor'
      let reprogramado = false

      if (ventaData.cod_cliente) {

        const { data: clienteData } = await supabase
          .from('clientes')
          .select('nombre')
          .eq('id', ventaData.cod_cliente)
          .single()

        clienteNombre = clienteData?.nombre || 'Sin cliente'
      }

      if (ventaData.cod_vendedor) {

        const { data: vendedorData } = await supabase
          .from('vendedores')
          .select('nombre')
          .eq('id', ventaData.cod_vendedor)
          .single()

        vendedorNombre = vendedorData?.nombre || 'Sin vendedor'
      }

      const { data: progresoData } = await supabase
        .from('progreso_produccion')
        .select('reprogramado')
        .eq('codigo_pedido', codVenta)
        .single()

      reprogramado = progresoData?.reprogramado === true

      // DETALLES
      const { data: detallesData } = await supabase
        .from('detalle_venta')
        .select('*')
        .eq('cod_venta', codVenta)

      const codigosProductos = [
        ...new Set((detallesData || []).map(d => d.cod_producto).filter(Boolean))
      ]

      const codigosColores = [
        ...new Set(
          (detallesData || [])
            .map(d => d.color_estructura)
            .filter(Boolean)
        )
      ]

      const codigosMelaminas = [
        ...new Set((detallesData || []).map(d => d.color_melamina).filter(Boolean))
      ]

      const [{ data: productosData }, { data: coloresData }, { data: melaminasData }] = await Promise.all([
        codigosProductos.length > 0
          ? supabase.from('productos').select('codigo, nombre').in('codigo', codigosProductos)
          : Promise.resolve({ data: [] }),
        codigosColores.length > 0
          ? supabase.from('colores').select('codigo_color, detalle').in('codigo_color', codigosColores)
          : Promise.resolve({ data: [] }),
        codigosMelaminas.length > 0
          ? supabase.from('melaminas').select('codigo_melamina, detalle').in('codigo_melamina', codigosMelaminas)
          : Promise.resolve({ data: [] })
      ])

      const productosMap = Object.fromEntries(
        productosData?.map(p => [p.codigo, p.nombre]) || []
      )

      const coloresMap = Object.fromEntries(
        coloresData?.map(c => [c.codigo_color, c.detalle]) || []
      )

      const melaminasMap = Object.fromEntries(
        melaminasData?.map(m => [m.codigo_melamina, m.detalle]) || []
      )

      const detallesConNombres = (detallesData || []).map(detalle => ({
        ...detalle,
        producto_nombre: productosMap[detalle.cod_producto] || detalle.cod_producto,
        color_estructura_detalle: coloresMap[detalle.color_estructura] || detalle.color_estructura,
        color_melamina_detalle: melaminasMap[detalle.color_melamina] || detalle.color_melamina
      }))

      setPedidoSeleccionado({
        ...ventaData,
        cliente: clienteNombre,
        vendedor: vendedorNombre,
        reprogramado,
        detalles: detallesConNombres
      })

      setMostrarModal(true)

    } catch (error) {

      console.error(error)
      alert('Error cargando detalle')

    }
  }

  // ── Calendario ──────────────────────────────────────────────
  const diasCalendario = useMemo(() => {

    const primerDia = new Date(anioActual, mesActual, 1).getDay()
    const diasMes = new Date(anioActual, mesActual + 1, 0).getDate()

    const dias = []

    for (let i = 0; i < primerDia; i++) {
      dias.push(null)
    }

    for (let d = 1; d <= diasMes; d++) {
      dias.push(d)
    }

    return dias

  }, [mesActual, anioActual])

  // ── Pedidos por día ─────────────────────────────────────────
  const pedidosPorDia = (dia: number) => {

    const fecha = `${anioActual}-${String(mesActual + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`

    return pedidos.filter(p => p.fecha_entrega === fecha)
  }

  // ── Cambiar mes ─────────────────────────────────────────────
  const cambiarMes = (direccion: number) => {

    let nuevoMes = mesActual + direccion
    let nuevoAnio = anioActual

    if (nuevoMes < 0) {
      nuevoMes = 11
      nuevoAnio--
    }

    if (nuevoMes > 11) {
      nuevoMes = 0
      nuevoAnio++
    }

    setMesActual(nuevoMes)
    setAnioActual(nuevoAnio)
  }

  const nombreMes = new Date(
    anioActual,
    mesActual
  ).toLocaleDateString('es-BO', {
    month: 'long',
    year: 'numeric'
  })

  // ── Loading ─────────────────────────────────────────────────
  if (loading) {

    return (
      <p
        style={{
          textAlign: 'center',
          marginTop: '100px',
          fontFamily: 'Arial'
        }}
      >
        Cargando calendario...
      </p>
    )
  }

  // ── Render ──────────────────────────────────────────────────
  return (

    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#f5f5f5',
        fontFamily: 'Arial, sans-serif'
      }}
    >

      {/* NAVBAR */}
      <nav
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '15px 40px',
          backgroundColor: '#222',
          color: 'white',
          flexWrap: 'wrap',
          gap: '10px'
        }}
      >

        <a
          href="/sistema"
          style={{
            color: 'white',
            textDecoration: 'none',
            fontWeight: 'bold',
            fontSize: '20px'
          }}
        >
          ← Sistema
        </a>

        <span
          style={{
            color: '#90caf9',
            fontWeight: 'bold'
          }}
        >
          Calendario de Pedidos
        </span>

        <span style={{ fontSize: '14px' }}>
          {usuario?.usuario || usuario?.nombre || 'Usuario'} 👤
        </span>

      </nav>

      {/* CONTENIDO */}
      <div
        style={{
          padding: '25px',
          maxWidth: '1600px',
          margin: '0 auto'
        }}
      >

        {/* HEADER */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '25px',
            flexWrap: 'wrap',
            gap: '10px'
          }}
        >

          <div>
            <h1 style={{ margin: 0 }}>
              📅 Pedidos
            </h1>

            <p style={{ color: '#666' }}>
              Calendario de entregas y producción
            </p>
          </div>

          {/* MES */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}
          >

            <button
              onClick={() => cambiarMes(-1)}
              style={{
                border: 'none',
                backgroundColor: '#222',
                color: 'white',
                padding: '10px 15px',
                borderRadius: '10px',
                cursor: 'pointer'
              }}
            >
              ←
            </button>

            <div
              style={{
                fontWeight: 'bold',
                textTransform: 'capitalize'
              }}
            >
              {nombreMes}
            </div>

            <button
              onClick={() => cambiarMes(1)}
              style={{
                border: 'none',
                backgroundColor: '#222',
                color: 'white',
                padding: '10px 15px',
                borderRadius: '10px',
                cursor: 'pointer'
              }}
            >
              →
            </button>

          </div>

        </div>

        {/* CALENDARIO */}
        <div
          style={{
            backgroundColor: 'white',
            borderRadius: '20px',
            overflowX: 'auto',
            boxShadow: '0 2px 12px rgba(0,0,0,0.08)'
          }}
        >

          {/* DÍAS */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(7, minmax(140px, 1fr))',
              backgroundColor: '#222',
              color: 'white',
              minWidth: '980px'
            }}
          >

            {['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map(dia => (

              <div
                key={dia}
                style={{
                  padding: '14px',
                  textAlign: 'center',
                  fontWeight: 'bold',
                  borderRight: '1px solid #444'
                }}
              >
                {dia}
              </div>

            ))}

          </div>

          {/* GRID */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(7, minmax(140px, 1fr))',
              minWidth: '980px'
            }}
          >

            {diasCalendario.map((dia, index) => {

              const pedidosDia = dia ? pedidosPorDia(dia) : []

              return (

                <div
                  key={index}
                  style={{
                    minHeight: '160px',
                    border: '1px solid #eee',
                    padding: '8px',
                    backgroundColor: dia ? 'white' : '#fafafa'
                  }}
                >

                  {dia && (
                    <>

                      {/* NÚMERO */}
                      <div
                        style={{
                          fontWeight: 'bold',
                          marginBottom: '10px',
                          color: '#222'
                        }}
                      >
                        {dia}
                      </div>

                      {/* PEDIDOS */}
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '6px'
                        }}
                      >

                        {pedidosDia.map(pedido => (

                          <div
                            key={pedido.id}
                            onClick={() => abrirDetallePedido(pedido.cod_venta)}
                            style={{
                              backgroundColor: obtenerColorEstado(pedido.estado),
                              color: 'white',
                              borderRadius: '10px',
                              padding: '8px',
                              fontSize: '12px',
                              cursor: 'pointer'
                            }}
                          >

                            <div
                              style={{
                                fontWeight: 'bold',
                                marginBottom: '4px'
                              }}
                            >
                              #{pedido.cod_venta}
                            </div>

                            <div>
                              {pedido.cliente}
                            </div>

                            <div
                              style={{
                                marginTop: '4px',
                                fontSize: '11px',
                                opacity: 0.95
                              }}
                            >
                              Vendedor: {pedido.vendedor}
                            </div>

                            {pedido.reprogramado && (
                              <div
                                style={{
                                  marginTop: '5px',
                                  backgroundColor: 'white',
                                  color: '#c62828',
                                  borderRadius: '6px',
                                  padding: '3px 6px',
                                  fontSize: '11px',
                                  fontWeight: 'bold',
                                  display: 'inline-block'
                                }}
                              >
                                Reprogramado
                              </div>
                            )}

                            <div
                              style={{
                                marginTop: '5px',
                                fontSize: '11px'
                              }}
                            >
                              {obtenerNombreEstado(pedido.estado)}
                            </div>

                          </div>

                        ))}

                      </div>

                    </>
                  )}

                </div>

              )
            })}

          </div>

        </div>

      </div>

      {/* MODAL */}
      {mostrarModal && pedidoSeleccionado && (

        <div
          onClick={() => setMostrarModal(false)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.6)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 9999,
            padding: '20px'
          }}
        >

          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: 'white',
              borderRadius: '20px',
              width: '100%',
              maxWidth: '700px',
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: '25px'
            }}
          >

            {/* HEADER */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '20px'
              }}
            >

              <h2 style={{ margin: 0 }}>
                Pedido #{pedidoSeleccionado.cod_venta}
              </h2>

              <button
                onClick={() => setMostrarModal(false)}
                style={{
                  border: 'none',
                  backgroundColor: '#eee',
                  borderRadius: '50%',
                  width: '35px',
                  height: '35px',
                  cursor: 'pointer',
                  fontWeight: 'bold'
                }}
              >
                ✕
              </button>

            </div>

            {/* INFO */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '15px',
                marginBottom: '25px'
              }}
            >

              <div>
                <strong>Cliente:</strong>
                <div>{pedidoSeleccionado.cliente}</div>
              </div>

              <div>
                <strong>Vendedor:</strong>
                <div>{pedidoSeleccionado.vendedor}</div>
              </div>

              <div>
                <strong>Estado:</strong>

                <div
                  style={{
                    color: obtenerColorEstado(pedidoSeleccionado.estado),
                    fontWeight: 'bold'
                  }}
                >
                  {obtenerNombreEstado(pedidoSeleccionado.estado)}
                </div>
              </div>

              <div>
                <strong>Fecha entrega:</strong>
                <div>{pedidoSeleccionado.fecha_entrega}</div>
              </div>

              {pedidoSeleccionado.reprogramado && (
                <div>
                  <strong>Reprogramacion:</strong>
                  <div
                    style={{
                      color: '#c62828',
                      fontWeight: 'bold'
                    }}
                  >
                    Reprogramado
                  </div>
                </div>
              )}

              <div>
                <strong>Total:</strong>
                <div>
                  Bs. {pedidoSeleccionado.total_venta || 0}
                </div>
              </div>

            </div>

            {/* PRODUCTOS */}
            <div>

              <h3>
                Productos
              </h3>

              <div
                style={{
                  display: 'grid',
                  gap: '12px'
                }}
              >

                {pedidoSeleccionado.detalles?.map((detalle: any) => (

                  <div
                    key={detalle.id}
                    style={{
                      border: '1px solid #eee',
                      borderRadius: '12px',
                      padding: '15px',
                      backgroundColor: '#fafafa'
                    }}
                  >

                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: '10px',
                        flexWrap: 'wrap'
                      }}
                    >

                      <div>
                        <strong>
                          {detalle.producto_nombre || 'Sin producto'}
                        </strong>

                        <div>
                          Cantidad: {detalle.cantidad}
                        </div>
                      </div>

                      <div>
                        {detalle.dimensiones || 'Sin dimensiones'}
                      </div>

                    </div>

                    <div
                      style={{
                        marginTop: '8px',
                        fontSize: '14px',
                        color: '#666'
                      }}
                    >
                      Estructura: {detalle.color_estructura_detalle || 'N/A'} | Melamina: {detalle.color_melamina_detalle || 'N/A'}
                    </div>

                  </div>

                ))}

              </div>

            </div>

          </div>

        </div>

      )}

    </div>
  )
}
