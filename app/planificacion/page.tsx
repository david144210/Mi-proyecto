'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

interface PiezaDesglose {
  tipo: string
  descripcion: string
  cantidad: number
  largo_cm?: number
  ancho_cm?: number
  longitud_cm?: number
}

interface ItemPlanificacion {
  id_temp: string
  tipo_origen: 'venta' | 'stock' | 'especial'
  referencia_id: string | number
  titulo: string
  cliente_o_destino: string
  cantidad: number
  taller_destino: string
  detalles: any[]
  piezas_desglose: PiezaDesglose[]
}

export default function PaginaPlanificacionLote() {
  const [fechaLote, setFechaLote] = useState(() => new Date().toISOString().split('T')[0])
  const [fechaBusquedaVentas, setFechaBusquedaVentas] = useState(() => new Date().toISOString().split('T')[0])
  
  const [nombreLote, setNombreLote] = useState('Lote Planificado General')
  const [talleres, setTalleres] = useState<string[]>([])
  const [tallerSeleccionado, setTallerSeleccionado] = useState('')
  
  const [tipoIngreso, setTipoIngreso] = useState<'venta' | 'stock' | 'especial'>('venta')
  const [pedidosVenta, setPedidosVenta] = useState<any[]>([])
  const [catalogoProductos, setCatalogoProductos] = useState<any[]>([])
  
  const [productoStockCod, setProductoStockCod] = useState('')
  const [variantesProducto, setVariantesProducto] = useState<any[]>([])
  const [varianteIdSeleccionada, setVarianteIdSeleccionada] = useState('')
  const [cantidadStock, setCantidadStock] = useState('1')
  const [piezasVarianteActual, setPiezasVarianteActual] = useState<PiezaDesglose[]>([])

  const [especialNombre, setEspecialNombre] = useState('')
  const [especialCantidad, setEspecialCantidad] = useState('1')
  const [especialDetalles, setEspecialDetalles] = useState('')

  const [itemsPlanificados, setItemsPlanificados] = useState<ItemPlanificacion[]>([])
  const [loading, setLoading] = useState(false)

  const [itemEditandoPiezasId, setItemEditandoPiezasId] = useState<string | null>(null)
  const [nuevaPiezaTipo, setNuevaPiezaTipo] = useState('Melamina')
  const [nuevaPiezaDesc, setNuevaPiezaDesc] = useState('')
  const [nuevaPiezaCant, setNuevaPiezaCant] = useState('1')

  useEffect(() => {
    const inicializar = async () => {
      const { data: sucData } = await supabase.from('sucursales').select('nombre')
      if (sucData && sucData.length > 0) {
        setTalleres(sucData.map(s => s.nombre))
        setTallerSeleccionado(sucData[0].nombre)
      }

      const { data: prodData } = await supabase.from('productos').select('codigo, nombre')
      if (prodData) setCatalogoProductos(prodData)
    }
    inicializar()
  }, [])

  useEffect(() => {
    cargarVentasPorFecha(fechaBusquedaVentas)
  }, [fechaBusquedaVentas])

  useEffect(() => {
    const cargarVariantes = async () => {
      if (!productoStockCod) {
        setVariantesProducto([])
        setVarianteIdSeleccionada('')
        setPiezasVarianteActual([])
        return
      }
      const { data } = await supabase
        .from('producto_variantes')
        .select('*')
        .eq('codigo_producto', productoStockCod)

      if (data) {
        setVariantesProducto(data)
        if (data.length > 0) {
          setVarianteIdSeleccionada(String(data[0].id))
        } else {
          setVarianteIdSeleccionada('')
        }
      }
    }
    cargarVariantes()
  }, [productoStockCod])

  useEffect(() => {
    const cargarPiezasVariante = async () => {
      if (!varianteIdSeleccionada) {
        setPiezasVarianteActual([])
        return
      }
      const vId = parseInt(varianteIdSeleccionada)

      const [melres, acerres, accres, insres, unires] = await Promise.all([
        supabase.from('variante_melamina').select('*').eq('variante_id', vId),
        supabase.from('variante_acero').select('*').eq('variante_id', vId),
        supabase.from('variante_accesorios').select('*').eq('variante_id', vId),
        supabase.from('variante_insumos').select('*').eq('variante_id', vId),
        supabase.from('variante_uniones').select('*').eq('variante_id', vId)
      ])

      const melaminas = (melres.data || []).map(m => ({ tipo: 'Melamina', ...m, descripcion: m.descripcion || m.codigo_melamina }))
      const aceros = (acerres.data || []).map(a => ({ tipo: 'Acero', ...a, descripcion: a.descripcion || a.codigo_acero }))
      const accesorios = (accres.data || []).map(ac => ({ tipo: 'Accesorio', ...ac, descripcion: ac.descripcion || ac.codigo_accesorio }))
      const insumos = (insres.data || []).map(i => ({ tipo: 'Insumo', ...i, descripcion: i.descripcion || i.codigo_insumo }))
      const uniones = (unires.data || []).map(u => ({ tipo: 'Unión', ...u, descripcion: u.descripcion || u.codigo_union }))

      setPiezasVarianteActual([...melaminas, ...aceros, ...accesorios, ...insumos, ...uniones])
    }
    cargarPiezasVariante()
  }, [varianteIdSeleccionada])

  const cargarVentasPorFecha = async (fec: string) => {
    const { data: ventas } = await supabase
      .from('ventas')
      .select('id, cod_venta, cod_cliente, fecha_entrega')
      .eq('fecha_entrega', fec)

    if (!ventas || ventas.length === 0) {
      setPedidosVenta([])
      return
    }

    const clientesIds = [...new Set(ventas.map(v => v.cod_cliente))]
    const { data: clientes } = await supabase.from('clientes').select('id, nombre').in('id', clientesIds)
    const cMap = Object.fromEntries(clientes?.map(c => [c.id, c.nombre]) || [])

    const codsVenta = ventas.map(v => v.cod_venta)
    const { data: detalles } = await supabase.from('detalle_venta').select('*').in('cod_venta', codsVenta)

    const procesados = ventas.map(v => ({
      ...v,
      cliente_nombre: cMap[v.cod_cliente] || 'Cliente General',
      detalles: (detalles || []).filter(d => d.cod_venta === v.cod_venta)
    }))
    setPedidosVenta(procesados)
  }

  const cambiarFechaBusquedaDias = (dias: number) => {
    const d = new Date(fechaBusquedaVentas)
    d.setDate(d.getDate() + dias)
    setFechaBusquedaVentas(d.toISOString().split('T')[0])
  }

  // Algoritmo optimizado para buscar producto/variante, rescatar piezas por código y permitir llenado manual si no existen
  const agregarVentaAlLote = async (venta: any) => {
    setLoading(true)
    try {
      let piezasDesgloseVenta: PiezaDesglose[] = []

      if (venta.detalles && venta.detalles.length > 0) {
        for (const det of venta.detalles) {
          const codProd = det.cod_producto || det.producto_codigo || det.codigo
          if (codProd) {
            const { data: variantesDb } = await supabase
              .from('producto_variantes')
              .select('id')
              .eq('codigo_producto', codProd)

            if (variantesDb && variantesDb.length > 0) {
              const vId = variantesDb[0].id
              const [melres, acerres, accres, insres, unires] = await Promise.all([
                supabase.from('variante_melamina').select('*').eq('variante_id', vId),
                supabase.from('variante_acero').select('*').eq('variante_id', vId),
                supabase.from('variante_accesorios').select('*').eq('variante_id', vId),
                supabase.from('variante_insumos').select('*').eq('variante_id', vId),
                supabase.from('variante_uniones').select('*').eq('variante_id', vId)
              ])

              const melaminas = (melres.data || []).map(m => ({ tipo: 'Melamina', ...m, descripcion: m.descripcion || m.codigo_melamina }))
              const aceros = (acerres.data || []).map(a => ({ tipo: 'Acero', ...a, descripcion: a.descripcion || a.codigo_acero }))
              const accesorios = (accres.data || []).map(ac => ({ tipo: 'Accesorio', ...ac, descripcion: ac.descripcion || ac.codigo_accesorio }))
              const insumos = (insres.data || []).map(i => ({ tipo: 'Insumo', ...i, descripcion: i.descripcion || i.codigo_insumo }))
              const uniones = (unires.data || []).map(u => ({ tipo: 'Unión', ...u, descripcion: u.descripcion || u.codigo_union }))

              piezasDesgloseVenta = [...piezasDesgloseVenta, ...melaminas, ...aceros, ...accesorios, ...insumos, ...uniones]
            }
          }
        }
      }

      const nuevoItem: ItemPlanificacion = {
        id_temp: Math.random().toString(36).substr(2, 9),
        tipo_origen: 'venta',
        referencia_id: venta.cod_venta,
        titulo: `Venta #${venta.cod_venta} (Entrega: ${venta.fecha_entrega})`,
        cliente_o_destino: venta.cliente_nombre,
        cantidad: 1,
        taller_destino: tallerSeleccionado,
        detalles: venta.detalles || [],
        piezas_desglose: piezasDesgloseVenta
      }

      setItemsPlanificados(prev => [...(prev || []), nuevoItem])
    } catch (err) {
      console.error('Error al rescatar piezas de la venta:', err)
      alert('Se agregó la venta, pero hubo un problema al buscar las piezas automáticas. Puedes ingresarlas manualmente.')
    } finally {
      setLoading(false)
    }
  }

  const agregarStockAlLote = () => {
    if (!productoStockCod || !varianteIdSeleccionada) return
    const prod = catalogoProductos.find(p => String(p.codigo) === productoStockCod)
    const variante = variantesProducto.find(v => String(v.id) === varianteIdSeleccionada)
    
    const nombreVar = variante ? variante.nombre_variante : 'Estándar'
    
    const nuevoItem: ItemPlanificacion = {
      id_temp: Math.random().toString(36).substr(2, 9),
      tipo_origen: 'stock',
      referencia_id: productoStockCod,
      titulo: `[STOCK] ${prod?.nombre || productoStockCod} - ${nombreVar}`,
      cliente_o_destino: 'Inventario Interno',
      cantidad: parseInt(cantidadStock) || 1,
      taller_destino: tallerSeleccionado,
      detalles: [{ cod_producto: productoStockCod, variante_id: varianteIdSeleccionada, cantidad: parseInt(cantidadStock) || 1 }],
      piezas_desglose: [...piezasVarianteActual]
    }
    setItemsPlanificados(prev => [...(prev || []), nuevoItem])
    setProductoStockCod('')
    setVarianteIdSeleccionada('')
    setPiezasVarianteActual([])
  }

  const agregarEspecialAlLote = () => {
    if (!especialNombre) return
    const nuevoItem: ItemPlanificacion = {
      id_temp: Math.random().toString(36).substr(2, 9),
      tipo_origen: 'especial',
      referencia_id: 'ESP-' + Date.now(),
      titulo: `[ESPECIAL] ${especialNombre}`,
      cliente_o_destino: 'Pedido Especial',
      cantidad: parseInt(especialCantidad) || 1,
      taller_destino: tallerSeleccionado,
      detalles: [{ descripcion: especialDetalles, cantidad: parseInt(especialCantidad) || 1 }],
      piezas_desglose: []
    }
    setItemsPlanificados(prev => [...(prev || []), nuevoItem])
    setEspecialNombre('')
    setEspecialDetalles('')
  }

  const eliminarItemPlanificado = (id_temp: string) => {
    setItemsPlanificados(prev => (prev || []).filter(i => i.id_temp !== id_temp))
  }

  const agregarPiezaManualAItem = (id_temp: string) => {
    if (!nuevaPiezaDesc) return
    setItemsPlanificados(prev => (prev || []).map(item => {
      if (item.id_temp === id_temp) {
        return {
          ...item,
          piezas_desglose: [
            ...(item.piezas_desglose || []),
            { tipo: nuevaPiezaTipo, descripcion: nuevaPiezaDesc, cantidad: parseInt(nuevaPiezaCant) || 1 }
          ]
        }
      }
      return item
    }))
    setNuevaPiezaDesc('')
    setNuevaPiezaCant('1')
    setItemEditandoPiezasId(null)
  }

  const eliminarPiezaDeItem = (id_temp: string, indexPieza: number) => {
    setItemsPlanificados(prev => (prev || []).map(item => {
      if (item.id_temp === id_temp) {
        const nuevasPiezas = [...(item.piezas_desglose || [])]
        nuevasPiezas.splice(indexPieza, 1)
        return { ...item, piezas_desglose: nuevasPiezas }
      }
      return item
    }))
  }

  const guardarLoteEnSupabase = async () => {
    setLoading(true)
    try {
      const { error } = await supabase.from('lotes_produccion').upsert({
        fecha: fechaLote,
        nombre_lote: nombreLote,
        estado_workflow: 'creado',
        pedidos_seleccionados: itemsPlanificados,
        updated_at: new Date().toISOString()
      }, { onConflict: 'fecha,nombre_lote' })

      if (error) throw error
      alert('¡Lote y desglose de piezas guardados correctamente!')
    } catch (err) {
      console.error(err)
      alert('Error al guardar la planificación.')
    } finally {
      setLoading(false)
    }
  }

  const guardarPresupuesto = async () => {
    if (itemsPlanificados.length === 0) {
      alert('No hay elementos en la lista para guardar como presupuesto.')
      return
    }

    setLoading(true)
    try {
      const { data: userData } = await supabase.from('personal').select('id').limit(1).single()
      const usuarioId = userData ? userData.id : 1

      let costoTotalGeneral = 0

      const piezasJson = await Promise.all(itemsPlanificados.map(async (item) => {
        let varianteIdVinculada = null
        let costoUnitarioRef = 0
        let subtotalItem = 0

        if (item.tipo_origen === 'stock' && item.detalles[0]?.variante_id) {
          const vId = parseInt(item.detalles[0].variante_id)
          const { data: varianteDb } = await supabase
            .from('producto_variantes')
            .select('id, costo_total, codigo_color, codigo_melamina')
            .eq('id', vId)
            .single()

          if (varianteDb) {
            varianteIdVinculada = varianteDb.id
            costoUnitarioRef = varianteDb.costo_total || 0
            subtotalItem = costoUnitarioRef * item.cantidad
          }
        } else {
          subtotalItem = item.cantidad * 120
        }

        costoTotalGeneral += subtotalItem

        return {
          id_temp: item.id_temp,
          tipo_origen: item.tipo_origen,
          referencia_id: item.referencia_id,
          titulo: item.titulo,
          cantidad: item.cantidad,
          taller_destino: item.taller_destino,
          variante_id: varianteIdVinculada,
          costo_unitario: costoUnitarioRef,
          subtotal: subtotalItem,
          desglose_componentes: item.piezas_desglose || item.detalles
        }
      }))

      const totalesJson = {
        subtotal: costoTotalGeneral,
        total_general: costoTotalGeneral,
        items_count: itemsPlanificados.length
      }

      const { error } = await supabase.from('presupuestos').insert([
        {
          usuario_id: usuarioId,
          cliente: itemsPlanificados[0]?.cliente_o_destino || 'Cliente General',
          piezas: piezasJson,
          totales: totalesJson
        }
      ])

      if (error) throw error
      alert('¡Presupuesto guardado y vinculado correctamente en la tabla presupuestos!')
    } catch (err) {
      console.error(err)
      alert('Error al guardar el presupuesto.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ padding: '30px', fontFamily: 'Arial, sans-serif', backgroundColor: '#f8fafc', minHeight: '100vh' }}>
      <h1 style={{ color: '#0B1E36', borderBottom: '2px solid #C5A059', paddingBottom: '10px' }}>Planificación de Lotes y Presupuestos</h1>
      
      <div style={{ display: 'flex', gap: '20px', alignItems: 'center', margin: '20px 0', background: 'white', padding: '15px', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', flexWrap: 'wrap' }}>
        <div>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#0B1E36' }}>Fecha del Lote / Presupuesto (Destino):</label>
          <input type="date" value={fechaLote} onChange={e => setFechaLote(e.target.value)} style={{ padding: '6px', borderRadius: '4px', border: '1px solid #ccc', marginTop: '4px' }} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#0B1E36' }}>Nombre del Lote:</label>
          <input type="text" value={nombreLote} onChange={e => setNombreLote(e.target.value)} style={{ padding: '6px', borderRadius: '4px', border: '1px solid #ccc', width: '220px', marginTop: '4px' }} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#0B1E36' }}>Taller Asignado:</label>
          <select value={tallerSeleccionado} onChange={e => setTallerSeleccionado(e.target.value)} style={{ padding: '6px', borderRadius: '4px', border: '1px solid #ccc', marginTop: '4px' }}>
            {talleres.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '20px' }}>
        <div style={{ flex: '1.2', background: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
            <button onClick={() => setTipoIngreso('venta')} style={{ flex: 1, padding: '8px', background: tipoIngreso === 'venta' ? '#0B1E36' : '#e2e8f0', color: tipoIngreso === 'venta' ? '#C5A059' : '#333', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}>Ventas</button>
            <button onClick={() => setTipoIngreso('stock')} style={{ flex: 1, padding: '8px', background: tipoIngreso === 'stock' ? '#0B1E36' : '#e2e8f0', color: tipoIngreso === 'stock' ? '#C5A059' : '#333', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}>Stock</button>
            <button onClick={() => setTipoIngreso('especial')} style={{ flex: 1, padding: '8px', background: tipoIngreso === 'especial' ? '#0B1E36' : '#e2e8f0', color: tipoIngreso === 'especial' ? '#C5A059' : '#333', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}>Especial</button>
          </div>

          {tipoIngreso === 'venta' && (
            <div>
              <div style={{ marginBottom: '12px', background: '#f8fafc', padding: '10px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#0B1E36', marginBottom: '4px' }}>Buscar Ventas por Fecha de Entrega (Adelantar / Otras fechas):</label>
                <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                  <button onClick={() => cambiarFechaBusquedaDias(-1)} style={{ background: '#0B1E36', color: '#C5A059', border: 'none', padding: '5px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}>◀ Día Ant.</button>
                  <input type="date" value={fechaBusquedaVentas} onChange={e => setFechaBusquedaVentas(e.target.value)} style={{ padding: '5px', borderRadius: '4px', border: '1px solid #ccc', fontSize: '12px', flex: 1 }} />
                  <button onClick={() => cambiarFechaBusquedaDias(1)} style={{ background: '#0B1E36', color: '#C5A059', border: 'none', padding: '5px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}>Día Sig. ▶</button>
                </div>
              </div>

              <h3 style={{ fontSize: '14px', color: '#0B1E36', marginBottom: '10px' }}>Ventas encontradas para el: {fechaBusquedaVentas}</h3>
              {pedidosVenta.length === 0 ? (
                <p style={{ color: '#888', fontSize: '12px' }}>No hay ventas registradas en esta fecha para agregar al lote actual.</p>
              ) : (
                pedidosVenta.map(v => (
                  <div key={v.cod_venta} style={{ border: '1px solid #eee', padding: '10px', borderRadius: '6px', marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <strong>#{v.cod_venta} - {v.cliente_nombre}</strong>
                      <div style={{ fontSize: '11px', color: '#666' }}>Entrega original: {v.fecha_entrega}</div>
                    </div>
                    <button disabled={loading} onClick={() => agregarVentaAlLote(v)} style={{ background: '#C5A059', color: '#0B1E36', border: 'none', padding: '6px 10px', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}>
                      {loading ? 'Cargando...' : '+ Añadir al Lote'}
                    </button>
                  </div>
                ))
              )}
            </div>
          )}

          {tipoIngreso === 'stock' && (
            <div>
              <h3 style={{ fontSize: '14px', color: '#0B1E36', marginBottom: '10px' }}>Stock y Desglose de Piezas por Variante</h3>
              <label style={{ fontSize: '12px' }}>Producto:</label>
              <select value={productoStockCod} onChange={e => setProductoStockCod(e.target.value)} style={{ width: '100%', padding: '6px', margin: '5px 0 10px 0', borderRadius: '4px', border: '1px solid #ccc' }}>
                <option value="">-- Seleccionar producto --</option>
                {catalogoProductos.map(p => <option key={p.codigo} value={p.codigo}>{p.codigo} - {p.nombre}</option>)}
              </select>

              <label style={{ fontSize: '12px' }}>Variante:</label>
              <select value={varianteIdSeleccionada} onChange={e => setVarianteIdSeleccionada(e.target.value)} disabled={variantesProducto.length === 0} style={{ width: '100%', padding: '6px', margin: '5px 0 10px 0', borderRadius: '4px', border: '1px solid #ccc' }}>
                {variantesProducto.length === 0 ? (
                  <option value="">Seleccione un producto primero</option>
                ) : (
                  variantesProducto.map(v => <option key={v.id} value={v.id}>{v.nombre_variante}</option>)
                )}
              </select>

              <label style={{ fontSize: '12px' }}>Cantidad a Producir:</label>
              <input type="number" value={cantidadStock} onChange={e => setCantidadStock(e.target.value)} style={{ width: '100%', padding: '6px', margin: '5px 0 15px 0', borderRadius: '4px', border: '1px solid #ccc' }} />

              {piezasVarianteActual.length > 0 && (
                <div style={{ marginBottom: '15px', background: '#f1f5f9', padding: '10px', borderRadius: '6px', maxHeight: '180px', overflowY: 'auto' }}>
                  <h4 style={{ fontSize: '12px', color: '#0B1E36', marginBottom: '6px' }}>Piezas / Materiales Asociados ({piezasVarianteActual.length}):</h4>
                  {piezasVarianteActual.map((pieza, idx) => (
                    <div key={idx} style={{ fontSize: '11px', color: '#334155', borderBottom: '1px solid #e2e8f0', paddingBottom: '4px', marginBottom: '4px' }}>
                      <strong>[{pieza.tipo}]</strong> {pieza.descripcion} — Cant: {pieza.cantidad}
                      {pieza.largo_cm && ` | ${pieza.largo_cm}x${pieza.ancho_cm} cm`}
                      {pieza.longitud_cm && ` | ${pieza.longitud_cm} cm`}
                    </div>
                  ))}
                </div>
              )}
              
              <button onClick={agregarStockAlLote} style={{ width: '100%', background: '#0B1E36', color: '#C5A059', border: 'none', padding: '8px', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}>Añadir Stock al Lote</button>
            </div>
          )}

          {tipoIngreso === 'especial' && (
            <div>
              <h3 style={{ fontSize: '14px', color: '#0B1E36', marginBottom: '10px' }}>Pedido Especial</h3>
              <input type="text" placeholder="Nombre del mueble" value={especialNombre} onChange={e => setEspecialNombre(e.target.value)} style={{ width: '100%', padding: '6px', margin: '5px 0 10px 0', borderRadius: '4px', border: '1px solid #ccc' }} />
              <input type="number" placeholder="Cantidad" value={especialCantidad} onChange={e => setEspecialCantidad(e.target.value)} style={{ width: '100%', padding: '6px', margin: '5px 0 10px 0', borderRadius: '4px', border: '1px solid #ccc' }} />
              <textarea placeholder="Especificaciones..." value={especialDetalles} onChange={e => setEspecialDetalles(e.target.value)} style={{ width: '100%', padding: '6px', margin: '5px 0 15px 0', borderRadius: '4px', border: '1px solid #ccc', height: '60px' }} />
              <button onClick={agregarEspecialAlLote} style={{ width: '100%', background: '#0B1E36', color: '#C5A059', border: 'none', padding: '8px', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}>Añadir Especial</button>
            </div>
          )}
        </div>

        <div style={{ flex: '1.5', background: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <h3 style={{ fontSize: '16px', color: '#0B1E36', borderBottom: '2px solid #C5A059', paddingBottom: '8px', marginBottom: '15px' }}>Items Planificados en el Lote ({fechaLote})</h3>
          
          {itemsPlanificados.length === 0 ? (
            <p style={{ color: '#888', fontSize: '13px' }}>Aún no hay elementos agregados al lote.</p>
          ) : (
            <div>
              {itemsPlanificados.map(item => (
                <div key={item.id_temp} style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px', marginBottom: '10px', border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <span style={{ fontSize: '10px', background: '#0B1E36', color: '#C5A059', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>{item.tipo_origen.toUpperCase()}</span>
                      <strong style={{ marginLeft: '8px', fontSize: '13px' }}>{item.titulo}</strong>
                    </div>
                    <button onClick={() => eliminarItemPlanificado(item.id_temp)} style={{ background: 'none', border: 'none', color: '#ef4444', fontWeight: 'bold', cursor: 'pointer' }}>✕</button>
                  </div>
                  <div style={{ fontSize: '11px', color: '#555', marginTop: '6px' }}>Destino: {item.taller_destino} | Cantidad: {item.cantidad}</div>
                  
                  <div style={{ marginTop: '8px', fontSize: '11px', background: '#fff', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <strong>Piezas / Materiales ({item.piezas_desglose?.length || 0}):</strong>
                      <button 
                        onClick={() => setItemEditandoPiezasId(itemEditandoPiezasId === item.id_temp ? null : item.id_temp)} 
                        style={{ background: '#0B1E36', color: '#C5A059', border: 'none', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', cursor: 'pointer', fontWeight: 'bold' }}
                      >
                        {itemEditandoPiezasId === item.id_temp ? 'Cerrar' : '+ Añadir Pieza Manual'}
                      </button>
                    </div>

                    {item.piezas_desglose && item.piezas_desglose.length > 0 ? (
                      item.piezas_desglose.map((p: any, idx: number) => (
                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#475569', borderBottom: '1px solid #f1f5f9', paddingBottom: '2px', marginTop: '2px' }}>
                          <span>- [{p.tipo}] {p.descripcion} (Cant: {p.cantidad})</span>
                          <button onClick={() => eliminarPiezaDeItem(item.id_temp, idx)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '10px' }}>🗑️</button>
                        </div>
                      ))
                    ) : (
                      <p style={{ color: '#94a3b8', fontStyle: 'italic', margin: '4px 0' }}>No hay piezas registradas automáticamente. Agregalas manualmente abajo si es necesario.</p>
                    )}

                    {itemEditandoPiezasId === item.id_temp && (
                      <div style={{ marginTop: '8px', background: '#f8fafc', padding: '8px', borderRadius: '4px', border: '1px dashed #cbd5e1' }}>
                        <div style={{ fontSize: '10px', fontWeight: 'bold', marginBottom: '4px', color: '#0B1E36' }}>Agregar pieza manual:</div>
                        <div style={{ display: 'flex', gap: '4px', marginBottom: '4px' }}>
                          <select value={nuevaPiezaTipo} onChange={e => setNuevaPiezaTipo(e.target.value)} style={{ padding: '4px', fontSize: '10px', borderRadius: '4px', border: '1px solid #ccc' }}>
                            <option value="Melamina">Melamina</option>
                            <option value="Acero">Acero</option>
                            <option value="Accesorio">Accesorio</option>
                            <option value="Insumo">Insumo</option>
                            <option value="Unión">Unión</option>
                          </select>
                          <input type="text" placeholder="Descripción / Medida" value={nuevaPiezaDesc} onChange={e => setNuevaPiezaDesc(e.target.value)} style={{ flex: 1, padding: '4px', fontSize: '10px', borderRadius: '4px', border: '1px solid #ccc' }} />
                          <input type="number" placeholder="Cant" value={nuevaPiezaCant} onChange={e => setNuevaPiezaCant(e.target.value)} style={{ width: '40px', padding: '4px', fontSize: '10px', borderRadius: '4px', border: '1px solid #ccc' }} />
                        </div>
                        <button onClick={() => agregarPiezaManualAItem(item.id_temp)} style={{ background: '#16a34a', color: 'white', border: 'none', padding: '4px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}>Guardar Pieza</button>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                <button 
                  onClick={guardarLoteEnSupabase} 
                  disabled={loading} 
                  style={{ flex: 1, background: '#16a34a', color: 'white', border: 'none', padding: '10px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}
                >
                  {loading ? 'Guardando...' : '💾 Sincronizar Lote'}
                </button>

                <button 
                  onClick={guardarPresupuesto} 
                  disabled={loading} 
                  style={{ flex: 1, background: '#0B1E36', color: '#C5A059', border: 'none', padding: '10px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}
                >
                  {loading ? 'Guardando...' : '📋 Guardar en Presupuestos'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}