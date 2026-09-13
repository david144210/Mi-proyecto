'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

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

export default function ProduccionPage() {
  const [usuario, setUsuario] = useState<any>(null)
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [loading, setLoading] = useState(true)
  const [actualizando, setActualizando] = useState<number | null>(null)

  useEffect(() => {
    const verificarUsuario = async () => {
      const carnetGuardado = localStorage.getItem('carnet')
      if (!carnetGuardado) {
        window.location.replace('/')
        return
      }

      const { data, error } = await supabase
        .from('personal')
        .select(`*, cargos(*)`)
        .eq('carnet', carnetGuardado)
        .eq('estado', true)
        .single()

      if (error || !data) {
        window.location.replace('/')
        return
      }

      const esProduccion = data.cargos?.puede_ver_produccion === true
      const esAdmin = data.cargos?.es_admin === true
      if (!esProduccion && !esAdmin) {
        alert('Acceso denegado.')
        window.location.replace('/sistema')
        return
      }

      setUsuario(data)
      cargarPedidos()
    }

    verificarUsuario()
  }, [])

  useEffect(() => {
    const intervalo = setInterval(() => {
      cargarPedidos()
    }, 30000)
    return () => clearInterval(intervalo)
  }, [])

  const cargarPedidos = async () => {
    try {
      setLoading(true)
      const { data: ventasData, error } = await supabase
        .from('ventas')
        .select('*')
        .in('estado', [1, 2, 3])
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

      const { data: clientesData } = clientesIds.length > 0
        ? await supabase.from('clientes').select('id, nombre, celular, direccion').in('id', clientesIds)
        : { data: [] }

      const clientesMap = Object.fromEntries((clientesData || []).map(c => [c.id, c]))

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
      alert('Error cargando pedidos de producción')
    } finally {
      setLoading(false)
    }
  }

  const cambiarEstado = async (pedido: Pedido, nuevoEstado: number) => {
    const nombresEstados: Record<number, string> = { 1: 'Pendiente', 2: 'En Fabricación', 3: 'Terminado' }
    if (!confirm(`¿Cambiar pedido #${pedido.cod_venta} a estado: ${nombresEstados[nuevoEstado]}?`)) return

    try {
      setActualizando(pedido.id)
      const { error } = await supabase.from('ventas').update({ estado: nuevoEstado }).eq('id', pedido.id)
      if (error) throw error
      await cargarPedidos()
    } catch (error) {
      console.error(error)
      alert('Error actualizando estado del pedido')
    } finally {
      setActualizando(null)
    }
  }

  if (loading) {
    return <div style={{ minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>Cargando panel de producción...</div>
  }

  const pedidosPendientes = pedidos.filter(p => p.estado === 1)
  const pedidosEnProceso = pedidos.filter(p => p.estado === 2)
  const pedidosTerminados = pedidos.filter(p => p.estado === 3)

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f5f5f5', fontFamily: 'Arial, sans-serif' }}>
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 25px', backgroundColor: '#0B1E36', color: 'white', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
          <a href="/sistema" style={{ color: 'white', textDecoration: 'none', fontWeight: 'bold' }}>← Sistema</a>
          <a href="/planificacion" style={{ color: '#C5A059', textDecoration: 'none', fontSize: '14px', fontWeight: 'bold' }}>🗂️ Ir a Planificación</a>
        </div>
        <div style={{ fontWeight: 'bold', color: '#C5A059' }}>🏭 Control de Producción</div>
        <div style={{ fontSize: '14px' }}>{usuario?.usuario || usuario?.nombre || 'Usuario'}</div>
      </nav>

      <div style={{ padding: '25px', maxWidth: '1400px', margin: '0 auto' }}>
        <h1 style={{ margin: '0 0 8px 0', fontSize: '22px' }}>Seguimiento en Planta</h1>
        <p style={{ color: '#666', margin: '0 0 25px 0' }}>Visualiza y avanza el estado de fabricación de los pedidos</p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '20px', alignItems: 'start' }}>
          {/* Pendientes */}
          <div style={{ backgroundColor: 'white', borderRadius: '16px', padding: '16px', boxShadow: '0 2px 10px rgba(0,0,0,0.06)' }}>
            <h2 style={{ fontSize: '15px', margin: '0 0 15px 0', color: '#e65100', borderBottom: '3px solid #ff9800', paddingBottom: '8px' }}>
              ⏳ Pendientes de Iniciar ({pedidosPendientes.length})
            </h2>
            <div style={{ display: 'grid', gap: '12px' }}>
              {pedidosPendientes.map(p => <PedidoCard key={p.id} pedido={p} actualizando={actualizando} onCambiarEstado={cambiarEstado} />)}
              {pedidosPendientes.length === 0 && <p style={{ color: '#888', textAlign: 'center', fontSize: '13px' }}>Sin pendientes</p>}
            </div>
          </div>

          {/* En Fabricación */}
          <div style={{ backgroundColor: 'white', borderRadius: '16px', padding: '16px', boxShadow: '0 2px 10px rgba(0,0,0,0.06)' }}>
            <h2 style={{ fontSize: '15px', margin: '0 0 15px 0', color: '#0d47a1', borderBottom: '3px solid #2196f3', paddingBottom: '8px' }}>
              🛠️ En Fabricación ({pedidosEnProceso.length})
            </h2>
            <div style={{ display: 'grid', gap: '12px' }}>
              {pedidosEnProceso.map(p => <PedidoCard key={p.id} pedido={p} actualizando={actualizando} onCambiarEstado={cambiarEstado} />)}
              {pedidosEnProceso.length === 0 && <p style={{ color: '#888', textAlign: 'center', fontSize: '13px' }}>Sin pedidos en proceso</p>}
            </div>
          </div>

          {/* Terminados */}
          <div style={{ backgroundColor: 'white', borderRadius: '16px', padding: '16px', boxShadow: '0 2px 10px rgba(0,0,0,0.06)' }}>
            <h2 style={{ fontSize: '15px', margin: '0 0 15px 0', color: '#1b5e20', borderBottom: '3px solid #4caf50', paddingBottom: '8px' }}>
              ✅ Terminados ({pedidosTerminados.length})
            </h2>
            <div style={{ display: 'grid', gap: '12px' }}>
              {pedidosTerminados.map(p => <PedidoCard key={p.id} pedido={p} actualizando={actualizando} onCambiarEstado={cambiarEstado} />)}
              {pedidosTerminados.length === 0 && <p style={{ color: '#888', textAlign: 'center', fontSize: '13px' }}>Sin pedidos terminados</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function PedidoCard({ pedido, actualizando, onCambiarEstado }: { pedido: Pedido; actualizando: number | null; onCambiarEstado: (p: Pedido, e: number) => void }) {
  return (
    <div style={{ backgroundColor: '#fafafa', borderRadius: '12px', padding: '12px', border: '1px solid #eee' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
        <strong style={{ fontSize: '14px' }}>Pedido #{pedido.cod_venta}</strong>
        {pedido.ubicacion_pedido && <span style={{ backgroundColor: '#e3f2fd', color: '#1565c0', padding: '2px 6px', borderRadius: '999px', fontSize: '11px', fontWeight: 'bold' }}>📍 {pedido.ubicacion_pedido}</span>}
      </div>
      <div style={{ fontSize: '13px', color: '#333', marginBottom: '4px' }}>👤 <strong>{pedido.cliente}</strong></div>
      <div style={{ fontSize: '12px', color: '#666', marginBottom: '8px' }}>📅 Entrega: {pedido.fecha_entrega || 'Sin fecha'}</div>

      {pedido.detalles_especificos && (
        <div style={{ marginBottom: '8px', color: '#8a6d00', backgroundColor: '#fff8e1', border: '1px solid #ffe082', borderRadius: '6px', padding: '6px', fontSize: '11px' }}>
          ⚠️ {pedido.detalles_especificos}
        </div>
      )}

      <div style={{ display: 'grid', gap: '6px', marginBottom: '10px' }}>
        {pedido.lineas.map((linea, i) => (
          <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'center', backgroundColor: '#fff', border: '1px solid #e0e0e0', borderRadius: '6px', padding: '6px' }}>
            {linea.foto_producto ? (
              <img src={linea.foto_producto} alt="" style={{ width: '34px', height: '34px', objectFit: 'cover', borderRadius: '4px', flexShrink: 0 }} />
            ) : (
              <div style={{ width: '34px', height: '34px', borderRadius: '4px', backgroundColor: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px' }}>🛋️</div>
            )}
            <div style={{ fontSize: '11px', color: '#333', flex: 1 }}>
              <div style={{ fontWeight: 'bold' }}>{linea.nombre_producto} × {linea.cantidad}</div>
              <div style={{ color: '#666' }}>
                {linea.dimensiones && `📐 ${linea.dimensiones} · `}
                {linea.color_estructura && `Est: ${linea.color_estructura} · `}
                {linea.color_melamina && `Mel: ${linea.color_melamina}`}
              </div>
            </div>
            {linea.foto_melamina && <img src={linea.foto_melamina} alt="" style={{ width: '22px', height: '22px', objectFit: 'cover', borderRadius: '3px', border: '1px solid #ddd' }} />}
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '6px' }}>
        {pedido.estado === 1 && (
          <button onClick={() => onCambiarEstado(pedido, 2)} disabled={actualizando === pedido.id} style={{ width: '100%', background: '#2196f3', color: 'white', border: 'none', padding: '7px', borderRadius: '6px', fontWeight: 'bold', fontSize: '11px', cursor: 'pointer' }}>
            🛠️ Iniciar Fabricación
          </button>
        )}
        {pedido.estado === 2 && (
          <>
            <button onClick={() => onCambiarEstado(pedido, 1)} disabled={actualizando === pedido.id} style={{ flex: 1, background: '#757575', color: 'white', border: 'none', padding: '7px', borderRadius: '6px', fontWeight: 'bold', fontSize: '11px', cursor: 'pointer' }}>
              ← Pendiente
            </button>
            <button onClick={() => onCambiarEstado(pedido, 3)} disabled={actualizando === pedido.id} style={{ flex: 2, background: '#4caf50', color: 'white', border: 'none', padding: '7px', borderRadius: '6px', fontWeight: 'bold', fontSize: '11px', cursor: 'pointer' }}>
              ✅ Terminar
            </button>
          </>
        )}
        {pedido.estado === 3 && (
          <button onClick={() => onCambiarEstado(pedido, 2)} disabled={actualizando === pedido.id} style={{ width: '100%', background: '#ff9800', color: 'white', border: 'none', padding: '7px', borderRadius: '6px', fontWeight: 'bold', fontSize: '11px', cursor: 'pointer' }}>
            ↩️ Regresar a En Proceso
          </button>
        )}
      </div>
    </div>
  )
}