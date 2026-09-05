'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

// ── Tipos ─────────────────────────────────────────────────────
interface DetalleLinea {
  cod_producto: string
  nombre_producto: string
  foto_producto: string | null
  cantidad: number
  dimensiones: string | null
  color_estructura: string | null
  color_melamina: string | null
  foto_melamina: string | null
}

interface Pedido {
  id: number
  cod_venta: number
  cliente: string
  celular: string | null
  direccion: string | null
  ubicacion_pedido: string | null
  fecha_entrega: string | null
  hora_entrega: string | null
  detalles_especificos: string | null
  estado: number
  total_venta?: number
  lineas: DetalleLinea[]
}

// ── Página ────────────────────────────────────────────────────
export default function EntregasPage() {

  const [usuario, setUsuario] = useState<any>(null)
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [loading, setLoading] = useState(true)
  const [actualizando, setActualizando] = useState<number | null>(null)

  // ── Seguridad ───────────────────────────────────────────────
  useEffect(() => {

    const verificarUsuario = async () => {

      const carnetGuardado = localStorage.getItem('carnet')

      if (!carnetGuardado) {
        window.location.replace('/')
        return
      }

      const { data, error } = await supabase
        .from('personal')
        .select(`
          *,
          cargos(*)
        `)
        .eq('carnet', carnetGuardado)
        .eq('estado', true)
        .single()

      if (error || !data) {
        window.location.replace('/')
        return
      }

      // VALIDAR PERMISO
      const puedeVer =
        data?.cargos?.puede_ver_entregas === true ||
        data?.cargos?.puede_ver_entregas === 1

      if (!puedeVer) {
        alert('No tienes permisos para acceder')
        window.location.replace('/sistema')
        return
      }

      setUsuario(data)

      cargarPedidos()
    }

    verificarUsuario()

  }, [])

  // ── Auto refresh ────────────────────────────────────────────
  useEffect(() => {

    const intervalo = setInterval(() => {
      cargarPedidos()
    }, 30000)

    return () => clearInterval(intervalo)

  }, [])

  // ── Cargar pedidos (con producto, color y ciudad) ───────────
  const cargarPedidos = async () => {

    try {

      setLoading(true)

      // SOLO ESTADO 3 (terminado, pendiente de despacho)
      const { data: ventasData, error } = await supabase
        .from('ventas')
        .select('*')
        .eq('estado', 3)
        .order('fecha_entrega', { ascending: true })

      if (error) throw error

      const ventas = ventasData || []

      if (ventas.length === 0) {
        setPedidos([])
        setLoading(false)
        return
      }

      const codVentas = [...new Set(ventas.map(v => v.cod_venta).filter(Boolean))]
      const clientesIds = [...new Set(ventas.map(v => v.cod_cliente).filter(Boolean))]

      // CLIENTES (nombre, celular, direccion → lo que necesita el repartidor)
      const { data: clientesData } = clientesIds.length > 0
        ? await supabase.from('clientes').select('id, nombre, celular, direccion').in('id', clientesIds)
        : { data: [] }

      const clientesMap = Object.fromEntries(
        (clientesData || []).map(c => [c.id, c])
      )

      // DETALLE DE CADA VENTA (productos, cantidades, colores)
      const { data: detalleData } = codVentas.length > 0
        ? await supabase
            .from('detalle_venta')
            .select('cod_venta, item, cod_producto, cantidad, dimensiones, color_estructura, color_melamina')
            .in('cod_venta', codVentas)
            .order('item')
        : { data: [] }

      const detalles = detalleData || []

      const codigosProductos = [...new Set(detalles.map(d => d.cod_producto).filter(Boolean))]
      const codigosColorEst = [...new Set(detalles.map(d => d.color_estructura).filter(Boolean))]
      const codigosColorMel = [...new Set(detalles.map(d => d.color_melamina).filter(Boolean))]

      const [{ data: productosData }, { data: coloresEstData }, { data: coloresMelData }] = await Promise.all([
        codigosProductos.length > 0
          ? supabase.from('productos').select('codigo, nombre, foto_url').in('codigo', codigosProductos)
          : Promise.resolve({ data: [] }),
        codigosColorEst.length > 0
          ? supabase.from('colores').select('codigo_color, detalle').in('codigo_color', codigosColorEst)
          : Promise.resolve({ data: [] }),
        codigosColorMel.length > 0
          ? supabase.from('melaminas').select('codigo_melamina, detalle, foto_url').in('codigo_melamina', codigosColorMel)
          : Promise.resolve({ data: [] }),
      ])

      const productosMap = Object.fromEntries((productosData || []).map(p => [p.codigo, p]))
      const coloresEstMap = Object.fromEntries((coloresEstData || []).map(c => [c.codigo_color, c]))
      const coloresMelMap = Object.fromEntries((coloresMelData || []).map(c => [c.codigo_melamina, c]))

      // Agrupar líneas de detalle por cod_venta
      const lineasPorVenta: Record<number, DetalleLinea[]> = {}
      detalles.forEach((d: any) => {
        const prod = productosMap[d.cod_producto]
        const est = coloresEstMap[d.color_estructura]
        const mel = coloresMelMap[d.color_melamina]
        const linea: DetalleLinea = {
          cod_producto: d.cod_producto,
          nombre_producto: prod?.nombre || d.cod_producto || 'Producto sin nombre',
          foto_producto: prod?.foto_url || null,
          cantidad: d.cantidad || 0,
          dimensiones: d.dimensiones,
          color_estructura: est?.detalle || d.color_estructura,
          color_melamina: mel?.detalle || d.color_melamina,
          foto_melamina: mel?.foto_url || null,
        }
        if (!lineasPorVenta[d.cod_venta]) lineasPorVenta[d.cod_venta] = []
        lineasPorVenta[d.cod_venta].push(linea)
      })

      // PEDIDOS
      const pedidosProcesados: Pedido[] = ventas.map((venta: any) => {
        const cliente = clientesMap[venta.cod_cliente]
        return {
          id: venta.id,
          cod_venta: venta.cod_venta,
          cliente: cliente?.nombre || 'Sin cliente',
          celular: cliente?.celular || null,
          direccion: cliente?.direccion || null,
          ubicacion_pedido: venta.ubicacion_pedido || null,
          fecha_entrega: venta.fecha_entrega,
          hora_entrega: venta.hora_entrega,
          detalles_especificos: venta.detalles_especificos || null,
          estado: venta.estado,
          total_venta: venta.total_venta,
          lineas: lineasPorVenta[venta.cod_venta] || [],
        }
      })

      setPedidos(pedidosProcesados)

    } catch (error) {

      console.error(error)
      alert('Error cargando pedidos')

    } finally {

      setLoading(false)

    }
  }

  // ── Cambiar estado ──────────────────────────────────────────
  const marcarDespachado = async (pedido: Pedido) => {

    const confirmar = confirm(
      `¿Marcar pedido #${pedido.cod_venta} como DESPACHADO?`
    )

    if (!confirmar) return

    try {

      setActualizando(pedido.id)

      const { error } = await supabase
        .from('ventas')
        .update({
          estado: 4
        })
        .eq('id', pedido.id)

      if (error) throw error

      // REFRESH
      await cargarPedidos()

    } catch (error) {

      console.error(error)
      alert('Error actualizando pedido')

    } finally {

      setActualizando(null)

    }
  }

  // ── Loading ─────────────────────────────────────────────────
  if (loading) {

    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          fontFamily: 'Arial'
        }}
      >
        Cargando entregas...
      </div>
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
          padding: '15px 25px',
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
            fontSize: '18px'
          }}
        >
          ← Sistema
        </a>

        <div
          style={{
            fontWeight: 'bold',
            color: '#90caf9'
          }}
        >
          🚚 Panel de Entregas
        </div>

        <div style={{ fontSize: '14px' }}>
          {usuario?.usuario || usuario?.nombre || 'Usuario'}
        </div>

      </nav>

      {/* CONTENIDO */}
      <div
        style={{
          padding: '25px',
          maxWidth: '1200px',
          margin: '0 auto'
        }}
      >

        {/* HEADER */}
        <div
          style={{
            marginBottom: '25px'
          }}
        >

          <h1
            style={{
              margin: 0,
              marginBottom: '8px'
            }}
          >
            Pedidos Terminados
          </h1>

          <p
            style={{
              color: '#666',
              margin: 0
            }}
          >
            Aquí puedes ver el detalle completo y marcar pedidos como despachados
          </p>

        </div>

        {/* SIN PEDIDOS */}
        {pedidos.length === 0 && (

          <div
            style={{
              backgroundColor: 'white',
              padding: '40px',
              borderRadius: '20px',
              textAlign: 'center',
              color: '#777'
            }}
          >
            No hay pedidos pendientes para despacho
          </div>

        )}

        {/* LISTADO */}
        <div
          style={{
            display: 'grid',
            gap: '18px'
          }}
        >

          {pedidos.map((pedido) => (

            <div
              key={pedido.id}
              style={{
                backgroundColor: 'white',
                borderRadius: '20px',
                padding: '20px',
                boxShadow: '0 2px 10px rgba(0,0,0,0.06)'
              }}
            >

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: '20px',
                  flexWrap: 'wrap'
                }}
              >

                {/* INFO */}
                <div
                  style={{
                    flex: 1,
                    minWidth: '280px'
                  }}
                >

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      flexWrap: 'wrap',
                      marginBottom: '10px'
                    }}
                  >
                    <span style={{ fontSize: '20px', fontWeight: 'bold' }}>
                      Pedido #{pedido.cod_venta}
                    </span>
                    {pedido.ubicacion_pedido && (
                      <span
                        style={{
                          backgroundColor: '#e3f2fd',
                          color: '#1565c0',
                          padding: '3px 10px',
                          borderRadius: '999px',
                          fontSize: '12px',
                          fontWeight: 'bold'
                        }}
                      >
                        📍 {pedido.ubicacion_pedido}
                      </span>
                    )}
                  </div>

                  <div style={{ marginBottom: '6px', color: '#444' }}>
                    👤 <strong>{pedido.cliente}</strong>
                  </div>

                  {pedido.celular && (
                    <div style={{ marginBottom: '6px', color: '#444' }}>
                      📞{' '}
                      <a href={`tel:${pedido.celular}`} style={{ color: '#1565c0', textDecoration: 'none' }}>
                        {pedido.celular}
                      </a>
                    </div>
                  )}

                  {pedido.direccion && (
                    <div style={{ marginBottom: '6px', color: '#444' }}>
                      🏠 {pedido.direccion}
                    </div>
                  )}

                  <div style={{ marginBottom: '6px', color: '#444' }}>
                    📅 {pedido.fecha_entrega || 'Sin fecha'}
                    {pedido.hora_entrega && ` — ${pedido.hora_entrega}`}
                  </div>

                  {pedido.detalles_especificos && (
                    <div
                      style={{
                        marginBottom: '10px',
                        color: '#8a6d00',
                        backgroundColor: '#fff8e1',
                        border: '1px solid #ffe082',
                        borderRadius: '8px',
                        padding: '8px 12px',
                        fontSize: '13px'
                      }}
                    >
                      ⚠️ {pedido.detalles_especificos}
                    </div>
                  )}

                  <div
                    style={{
                      color: '#2e7d32',
                      fontWeight: 'bold',
                      marginBottom: '4px'
                    }}
                  >
                    ✅ Terminado
                  </div>

                  {/* PRODUCTOS DEL PEDIDO */}
                  {pedido.lineas.length > 0 && (
                    <div
                      style={{
                        marginTop: '14px',
                        display: 'grid',
                        gap: '10px'
                      }}
                    >
                      {pedido.lineas.map((linea, i) => (
                        <div
                          key={i}
                          style={{
                            display: 'flex',
                            gap: '10px',
                            alignItems: 'center',
                            backgroundColor: '#f9f9f9',
                            border: '1px solid #eee',
                            borderRadius: '10px',
                            padding: '8px 10px'
                          }}
                        >
                          {linea.foto_producto ? (
                            <img
                              src={linea.foto_producto}
                              alt={linea.nombre_producto}
                              style={{ width: '44px', height: '44px', objectFit: 'cover', borderRadius: '8px', flexShrink: 0 }}
                            />
                          ) : (
                            <div
                              style={{
                                width: '44px', height: '44px', borderRadius: '8px', flexShrink: 0,
                                border: '1px dashed #ddd', backgroundColor: '#fafafa',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', color: '#ccc'
                              }}
                            >
                              🛋️
                            </div>
                          )}
                          <div style={{ fontSize: '13px', color: '#333', lineHeight: 1.5 }}>
                            <div style={{ fontWeight: 'bold' }}>
                              {linea.nombre_producto} <span style={{ color: '#888', fontWeight: 'normal' }}>× {linea.cantidad}</span>
                            </div>
                            <div style={{ color: '#666' }}>
                              {linea.dimensiones && <>📐 {linea.dimensiones} · </>}
                              {linea.color_estructura && <>🎨 Estructura: {linea.color_estructura} · </>}
                              {linea.color_melamina && <>🪵 Melamina: {linea.color_melamina}</>}
                            </div>
                          </div>
                          {linea.foto_melamina && (
                            <img
                              src={linea.foto_melamina}
                              alt={linea.color_melamina || 'melamina'}
                              title={`Melamina: ${linea.color_melamina}`}
                              style={{ width: '30px', height: '30px', objectFit: 'cover', borderRadius: '6px', marginLeft: 'auto', flexShrink: 0, border: '1px solid #ddd' }}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                </div>

                {/* BOTÓN */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start'
                  }}
                >

                  <button
                    onClick={() => marcarDespachado(pedido)}
                    disabled={actualizando === pedido.id}
                    style={{
                      border: 'none',
                      backgroundColor:
                        actualizando === pedido.id
                          ? '#999'
                          : '#1976d2',
                      color: 'white',
                      padding: '14px 22px',
                      borderRadius: '12px',
                      cursor: 'pointer',
                      fontWeight: 'bold',
                      minWidth: '180px'
                    }}
                  >

                    {actualizando === pedido.id
                      ? 'Actualizando...'
                      : '🚚 Marcar Despachado'}

                  </button>

                </div>

              </div>

            </div>

          ))}

        </div>

      </div>

    </div>
  )
}
