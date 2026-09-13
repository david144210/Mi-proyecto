'use client'

import { useState, useEffect } from 'react'
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

interface ItemConfigVenta {
  cod_producto: string
  nombre_producto: string
  cantidad: number
  variantesDisponibles: any[]
  varianteSeleccionadaId: string
  modoManual: boolean
  piezasManuales: PiezaDesglose[]
}

export default function PlanificacionPage() {
  const [usuario, setUsuario] = useState<any>(null)
  const [loading, setLoading] = useState(true)

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
  const [piezasVarianteActual, setPiezasVarianteActual] = useState<PiezaDesglose[]>([])
  const [cantidadStock, setCantidadStock] = useState('1')

  const [especialNombre, setEspecialNombre] = useState('')
  const [especialCantidad, setEspecialCantidad] = useState('1')
  const [especialDetalles, setEspecialDetalles] = useState('')

  const [itemsPlanificados, setItemsPlanificados] = useState<ItemPlanificacion[]>([])
  const [procesandoPlan, setProcesandoPlan] = useState(false)

  // Estado para controlar qué items del lote muestran el desglose expandido
  const [itemsExpandidos, setItemsExpandidos] = useState<Record<string, boolean>>({})

  // Estado para el Modal de Configuración de Venta
  const [ventaEnConfiguracion, setVentaEnConfiguracion] = useState<any | null>(null)
  const [itemsConfigVenta, setItemsConfigVenta] = useState<ItemConfigVenta[]>([])

  useEffect(() => {
    const carnetGuardado = localStorage.getItem('carnet')
    if (!carnetGuardado) { window.location.replace('/'); return }
    supabase.from('personal').select('*, cargos(*)')
      .eq('carnet', carnetGuardado)
      .eq('estado', true)
      .single()
      .then(({ data }) => {
        if (!data) { window.location.replace('/'); return }
        setUsuario(data)
        setLoading(false)
        inicializarPlanificacion()
      })
  }, [])

  const inicializarPlanificacion = async () => {
    const { data: sucData } = await supabase.from('sucursales').select('nombre')
    if (sucData && sucData.length > 0) {
      setTalleres(sucData.map(s => s.nombre))
      setTallerSeleccionado(sucData[0].nombre)
    }
    const { data: prodData } = await supabase.from('productos').select('codigo, nombre')
    if (prodData) setCatalogoProductos(prodData)
    cargarVentasPorFecha(fechaBusquedaVentas)
  }

  useEffect(() => {
    if (usuario) cargarVentasPorFecha(fechaBusquedaVentas)
  }, [fechaBusquedaVentas])

  useEffect(() => {
    const cargarVariantes = async () => {
      if (!productoStockCod) {
        setVariantesProducto([])
        setVarianteIdSeleccionada('')
        setPiezasVarianteActual([])
        return
      }
      const { data } = await supabase.from('producto_variantes').select('*').eq('codigo_producto', productoStockCod)
      if (data) {
        setVariantesProducto(data)
        setVarianteIdSeleccionada(data.length > 0 ? String(data[0].id) : '')
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

      setPiezasVarianteActual([
        ...(melres.data || []).map(m => ({ tipo: 'Melamina', ...m, descripcion: m.descripcion || m.codigo_melamina })),
        ...(acerres.data || []).map(a => ({ tipo: 'Acero', ...a, descripcion: a.descripcion || a.codigo_acero })),
        ...(accres.data || []).map(ac => ({ tipo: 'Accesorio', ...ac, descripcion: ac.descripcion || ac.codigo_accesorio })),
        ...(insres.data || []).map(i => ({ tipo: 'Insumo', ...i, descripcion: i.descripcion || i.codigo_insumo })),
        ...(unires.data || []).map(u => ({ tipo: 'Unión', ...u, descripcion: u.descripcion || u.codigo_union }))
      ])
    }
    cargarPiezasVariante()
  }, [varianteIdSeleccionada])

  const cambiarDiaBusqueda = (dias: number) => {
    const [anio, mes, dia] = fechaBusquedaVentas.split('-').map(Number)
    const fechaObj = new Date(anio, mes - 1, dia)
    fechaObj.setDate(fechaObj.getDate() + dias)
    const nuevoAnio = fechaObj.getFullYear()
    const nuevoMes = String(fechaObj.getMonth() + 1).padStart(2, '0')
    const nuevoDia = String(fechaObj.getDate()).padStart(2, '0')
    setFechaBusquedaVentas(`${nuevoAnio}-${nuevoMes}-${nuevoDia}`)
  }

  const cargarVentasPorFecha = async (fec: string) => {
    const { data: ventasFecha } = await supabase
      .from('ventas')
      .select('id, cod_venta, cod_cliente, fecha_entrega, estado')
      .eq('fecha_entrega', fec)
      .in('estado', [1, 2])

    if (!ventasFecha || ventasFecha.length === 0) { setPedidosVenta([]); return }

    const clientesIds = [...new Set(ventasFecha.map(v => v.cod_cliente))]
    const { data: clientes } = await supabase.from('clientes').select('id, nombre').in('id', clientesIds)
    const cMap = Object.fromEntries(clientes?.map(c => [c.id, c.nombre]) || [])

    const codsVenta = ventasFecha.map(v => v.cod_venta)
    const { data: detallesVenta } = await supabase.from('detalle_venta').select('*').in('cod_venta', codsVenta)

    setPedidosVenta(ventasFecha.map(v => ({
      ...v,
      cliente_nombre: cMap[v.cod_cliente] || 'Cliente General',
      detalles: (detallesVenta || []).filter(d => d.cod_venta === v.cod_venta)
    })))
  }

  const abrirConfiguracionVenta = async (venta: any) => {
    setProcesandoPlan(true)
    try {
      const detallesVenta = venta.detalles || []
      const productosMap = Object.fromEntries(catalogoProductos.map(p => [p.codigo, p.nombre]))
      const itemsConfig: ItemConfigVenta[] = []

      for (const det of detallesVenta) {
        const codProd = det.cod_producto || det.producto_codigo || det.codigo
        if (codProd) {
          const { data: variantesDb } = await supabase
            .from('producto_variantes')
            .select('*')
            .eq('codigo_producto', codProd)

          const listaVars = variantesDb || []
          const sinVars = listaVars.length === 0

          itemsConfig.push({
            cod_producto: codProd,
            nombre_producto: productosMap[codProd] || det.nombre_producto || codProd,
            cantidad: det.cantidad || 1,
            variantesDisponibles: listaVars,
            varianteSeleccionadaId: sinVars ? '' : String(listaVars[0].id),
            modoManual: sinVars,
            piezasManuales: []
          })
        }
      }

      setVentaEnConfiguracion(venta)
      setItemsConfigVenta(itemsConfig)
    } catch (err) {
      console.error(err)
      alert('Error al cargar las variantes del producto.')
    } finally {
      setProcesandoPlan(false)
    }
  }

  const actualizarVarianteItemConfig = (index: number, nuevaVarId: string) => {
    const actualizado = [...itemsConfigVenta]
    actualizado[index].varianteSeleccionadaId = nuevaVarId
    setItemsConfigVenta(actualizado)
  }

  const toggleModoManualItemConfig = (index: number) => {
    const actualizado = [...itemsConfigVenta]
    actualizado[index].modoManual = !actualizado[index].modoManual
    setItemsConfigVenta(actualizado)
  }

  const agregarPiezaManualItem = (index: number) => {
    const actualizado = [...itemsConfigVenta]
    actualizado[index].piezasManuales.push({
      tipo: 'Melamina',
      descripcion: '',
      cantidad: 1,
      largo_cm: 0,
      ancho_cm: 0
    })
    setItemsConfigVenta(actualizado)
  }

  const actualizarPiezaManualItem = (itemIndex: number, piezaIndex: number, campo: string, valor: any) => {
    const actualizado = [...itemsConfigVenta]
    actualizado[itemIndex].piezasManuales[piezaIndex] = {
      ...actualizado[itemIndex].piezasManuales[piezaIndex],
      [campo]: valor
    }
    setItemsConfigVenta(actualizado)
  }

  const eliminarPiezaManualItem = (itemIndex: number, piezaIndex: number) => {
    const actualizado = [...itemsConfigVenta]
    actualizado[itemIndex].piezasManuales.splice(piezaIndex, 1)
    setItemsConfigVenta(actualizado)
  }

  const confirmarAgregarVentaConVariantes = async () => {
    if (!ventaEnConfiguracion) return
    setProcesandoPlan(true)

    try {
      let piezasDesgloseVenta: PiezaDesglose[] = []

      for (const itemConf of itemsConfigVenta) {
        const mult = itemConf.cantidad || 1
        if (itemConf.modoManual) {
          const manualesEscaladas = itemConf.piezasManuales.map(p => ({
            ...p,
            cantidad: (Number(p.cantidad) || 1) * mult
          }))
          piezasDesgloseVenta = [...piezasDesgloseVenta, ...manualesEscaladas]
        } else {
          const vId = itemConf.varianteSeleccionadaId ? parseInt(itemConf.varianteSeleccionadaId) : null
          if (vId) {
            const [m, a, ac, i, u] = await Promise.all([
              supabase.from('variante_melamina').select('*').eq('variante_id', vId),
              supabase.from('variante_acero').select('*').eq('variante_id', vId),
              supabase.from('variante_accesorios').select('*').eq('variante_id', vId),
              supabase.from('variante_insumos').select('*').eq('variante_id', vId),
              supabase.from('variante_uniones').select('*').eq('variante_id', vId)
            ])

            piezasDesgloseVenta = [
              ...piezasDesgloseVenta,
              ...(m.data || []).map(x => ({ tipo: 'Melamina', ...x, cantidad: (x.cantidad || 1) * mult, descripcion: x.descripcion || x.codigo_melamina })),
              ...(a.data || []).map(x => ({ tipo: 'Acero', ...x, cantidad: (x.cantidad || 1) * mult, descripcion: x.descripcion || x.codigo_acero })),
              ...(ac.data || []).map(x => ({ tipo: 'Accesorio', ...x, cantidad: (x.cantidad || 1) * mult, descripcion: x.descripcion || x.codigo_accesorio })),
              ...(i.data || []).map(x => ({ tipo: 'Insumo', ...x, cantidad: (x.cantidad || 1) * mult, descripcion: x.descripcion || x.codigo_insumo })),
              ...(u.data || []).map(x => ({ tipo: 'Unión', ...x, cantidad: (x.cantidad || 1) * mult, descripcion: x.descripcion || x.codigo_union }))
            ]
          }
        }
      }

      setItemsPlanificados(prev => [...prev, {
        id_temp: Math.random().toString(36).substr(2, 9),
        tipo_origen: 'venta',
        referencia_id: ventaEnConfiguracion.cod_venta,
        titulo: `Venta #${ventaEnConfiguracion.cod_venta} (Entrega: ${ventaEnConfiguracion.fecha_entrega})`,
        cliente_o_destino: ventaEnConfiguracion.cliente_nombre,
        cantidad: 1,
        taller_destino: tallerSeleccionado,
        detalles: ventaEnConfiguracion.detalles || [],
        piezas_desglose: piezasDesgloseVenta
      }])

      setVentaEnConfiguracion(null)
      setItemsConfigVenta([])
    } catch (err) {
      console.error(err)
      alert('Error procesando los detalles constructivos.')
    } finally {
      setProcesandoPlan(false)
    }
  }

  const agregarStockAlLote = () => {
    if (!productoStockCod || !varianteIdSeleccionada) return
    const prod = catalogoProductos.find(p => String(p.codigo) === productoStockCod)
    const variante = variantesProducto.find(v => String(v.id) === varianteIdSeleccionada)

    setItemsPlanificados(prev => [...prev, {
      id_temp: Math.random().toString(36).substr(2, 9),
      tipo_origen: 'stock',
      referencia_id: productoStockCod,
      titulo: `[STOCK] ${prod?.nombre || productoStockCod} - ${variante?.nombre_variante || 'Estándar'}`,
      cliente_o_destino: 'Inventario Interno',
      cantidad: parseInt(cantidadStock) || 1,
      taller_destino: tallerSeleccionado,
      detalles: [{ cod_producto: productoStockCod, variante_id: varianteIdSeleccionada, cantidad: parseInt(cantidadStock) || 1 }],
      piezas_desglose: [...piezasVarianteActual]
    }])
    setProductoStockCod('')
    setVarianteIdSeleccionada('')
    setPiezasVarianteActual([])
  }

  const agregarEspecialAlLote = () => {
    if (!especialNombre) return
    setItemsPlanificados(prev => [...prev, {
      id_temp: Math.random().toString(36).substr(2, 9),
      tipo_origen: 'especial',
      referencia_id: 'ESP-' + Date.now(),
      titulo: `[ESPECIAL] ${especialNombre}`,
      cliente_o_destino: 'Pedido Especial',
      cantidad: parseInt(especialCantidad) || 1,
      taller_destino: tallerSeleccionado,
      detalles: [{ descripcion: especialDetalles, cantidad: parseInt(especialCantidad) || 1 }],
      piezas_desglose: []
    }])
    setEspecialNombre('')
    setEspecialDetalles('')
  }

  const guardarLoteEnSupabase = async () => {
    setProcesandoPlan(true)
    try {
      const { data: existing } = await supabase
        .from('lotes_produccion')
        .select('id')
        .eq('fecha', fechaLote)
        .eq('nombre_lote', nombreLote)
        .maybeSingle()

      let error;
      if (existing) {
        const { error: err } = await supabase
          .from('lotes_produccion')
          .update({
            estado_workflow: 'creado',
            pedidos_seleccionados: itemsPlanificados,
            updated_at: new Date().toISOString()
          })
          .eq('id', existing.id)
        error = err;
      } else {
        const { error: err } = await supabase
          .from('lotes_produccion')
          .insert({
            fecha: fechaLote,
            nombre_lote: nombreLote,
            estado_workflow: 'creado',
            pedidos_seleccionados: itemsPlanificados,
            updated_at: new Date().toISOString()
          })
        error = err;
      }

      if (error) throw error
      alert('¡Lote y desglose guardados correctamente!')
    } catch (err) {
      console.error(err)
      alert('Error al guardar la planificación.')
    } finally {
      setProcesandoPlan(false)
    }
  }

  const toggleExpandItem = (id_temp: string) => {
    setItemsExpandidos(prev => ({ ...prev, [id_temp]: !prev[id_temp] }))
  }

  if (loading) return <p style={{ textAlign: 'center', marginTop: '100px' }}>Cargando planificación...</p>

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', minHeight: '100vh', backgroundColor: '#f5f5f5' }}>
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 40px', backgroundColor: '#0B1E36', color: 'white' }}>
        <a href="/produccion" style={{ color: '#C5A059', fontWeight: 'bold', textDecoration: 'none' }}>← Volver a Producción</a>
        <span style={{ color: '#C5A059', fontWeight: 'bold' }}>🗂️ Planificación de Lotes</span>
        <span style={{ fontSize: '14px' }}>{usuario?.usuario || usuario?.nombre}</span>
      </nav>

      <div style={{ padding: '30px 40px', maxWidth: '1400px', margin: '0 auto' }}>
        <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
          <h1 style={{ color: '#0B1E36', borderBottom: '2px solid #C5A059', paddingBottom: '10px', fontSize: '20px', margin: '0 0 20px 0' }}>
            Generador de Lotes y Presupuestos
          </h1>

          <div style={{ display: 'flex', gap: '20px', alignItems: 'center', marginBottom: '20px', background: '#f8fafc', padding: '15px', borderRadius: '8px', flexWrap: 'wrap' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold' }}>Fecha del Lote:</label>
              <input type="date" value={fechaLote} onChange={e => setFechaLote(e.target.value)} style={{ padding: '6px', borderRadius: '4px', border: '1px solid #ccc', marginTop: '4px' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold' }}>Nombre del Lote:</label>
              <input type="text" value={nombreLote} onChange={e => setNombreLote(e.target.value)} style={{ padding: '6px', borderRadius: '4px', border: '1px solid #ccc', width: '220px', marginTop: '4px' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold' }}>Taller Asignado:</label>
              <select value={tallerSeleccionado} onChange={e => setTallerSeleccionado(e.target.value)} style={{ padding: '6px', borderRadius: '4px', border: '1px solid #ccc', marginTop: '4px' }}>
                {talleres.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
            {/* Panel Izquierdo: Inputs */}
            <div style={{ flex: '1.2', minWidth: '300px', background: '#f8fafc', padding: '20px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                <button onClick={() => setTipoIngreso('venta')} style={{ flex: 1, padding: '8px', background: tipoIngreso === 'venta' ? '#0B1E36' : '#e2e8f0', color: tipoIngreso === 'venta' ? '#C5A059' : '#333', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}>Ventas</button>
                <button onClick={() => setTipoIngreso('stock')} style={{ flex: 1, padding: '8px', background: tipoIngreso === 'stock' ? '#0B1E36' : '#e2e8f0', color: tipoIngreso === 'stock' ? '#C5A059' : '#333', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}>Stock</button>
                <button onClick={() => setTipoIngreso('especial')} style={{ flex: 1, padding: '8px', background: tipoIngreso === 'especial' ? '#0B1E36' : '#e2e8f0', color: tipoIngreso === 'especial' ? '#C5A059' : '#333', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}>Especial</button>
              </div>

              {tipoIngreso === 'venta' && (
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '5px' }}>Fecha de Entrega (Pendientes / En Proceso):</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '15px' }}>
                    <button onClick={() => cambiarDiaBusqueda(-1)} style={{ background: '#0B1E36', color: '#C5A059', border: 'none', padding: '6px 10px', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', fontSize: '12px' }}>
                      ← Día Anterior
                    </button>
                    <div style={{ flex: 1, textAlign: 'center', background: 'white', padding: '6px', borderRadius: '4px', border: '1px solid #ccc', fontSize: '13px', fontWeight: 'bold' }}>
                      {fechaBusquedaVentas}
                    </div>
                    <button onClick={() => cambiarDiaBusqueda(1)} style={{ background: '#0B1E36', color: '#C5A059', border: 'none', padding: '6px 10px', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', fontSize: '12px' }}>
                      Día Siguiente →
                    </button>
                  </div>

                  {pedidosVenta.map(v => (
                    <div key={v.cod_venta} style={{ border: '1px solid #eee', background: 'white', padding: '10px', borderRadius: '6px', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <strong>#{v.cod_venta} - {v.cliente_nombre}</strong>
                        <div style={{ fontSize: '11px', color: '#666' }}>Estado: {v.estado === 1 ? '⏳ Pendiente' : '🛠️ En Fabricación'}</div>
                      </div>
                      <button disabled={procesandoPlan} onClick={() => abrirConfiguracionVenta(v)} style={{ background: '#C5A059', color: '#0B1E36', border: 'none', padding: '5px 10px', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', fontSize: '12px' }}>+ Añadir</button>
                    </div>
                  ))}
                  {pedidosVenta.length === 0 && <p style={{ color: '#888', fontSize: '12px', textAlign: 'center', padding: '10px' }}>No hay pedidos pendientes o en proceso para esta fecha.</p>}
                </div>
              )}

              {tipoIngreso === 'stock' && (
                <div>
                  <label style={{ fontSize: '12px' }}>Producto:</label>
                  <select value={productoStockCod} onChange={e => setProductoStockCod(e.target.value)} style={{ width: '100%', padding: '6px', margin: '5px 0 10px 0', borderRadius: '4px', border: '1px solid #ccc' }}>
                    <option value="">-- Seleccionar --</option>
                    {catalogoProductos.map(p => <option key={p.codigo} value={p.codigo}>{p.codigo} - {p.nombre}</option>)}
                  </select>
                  <label style={{ fontSize: '12px' }}>Variante:</label>
                  <select value={varianteIdSeleccionada} onChange={e => setVarianteIdSeleccionada(e.target.value)} style={{ width: '100%', padding: '6px', margin: '5px 0 10px 0', borderRadius: '4px', border: '1px solid #ccc' }}>
                    {variantesProducto.map(v => <option key={v.id} value={v.id}>{v.nombre_variante}</option>)}
                  </select>
                  <label style={{ fontSize: '12px' }}>Cantidad:</label>
                  <input type="number" value={cantidadStock} onChange={e => setCantidadStock(e.target.value)} style={{ width: '100%', padding: '6px', margin: '5px 0 15px 0', borderRadius: '4px', border: '1px solid #ccc' }} />
                  <button onClick={agregarStockAlLote} style={{ width: '100%', background: '#0B1E36', color: '#C5A059', border: 'none', padding: '8px', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}>Añadir Stock</button>
                </div>
              )}

              {tipoIngreso === 'especial' && (
                <div>
                  <input type="text" placeholder="Nombre" value={especialNombre} onChange={e => setEspecialNombre(e.target.value)} style={{ width: '100%', padding: '6px', margin: '5px 0 10px 0', borderRadius: '4px', border: '1px solid #ccc' }} />
                  <input type="number" placeholder="Cantidad" value={especialCantidad} onChange={e => setEspecialCantidad(e.target.value)} style={{ width: '100%', padding: '6px', margin: '5px 0 10px 0', borderRadius: '4px', border: '1px solid #ccc' }} />
                  <textarea placeholder="Detalles..." value={especialDetalles} onChange={e => setEspecialDetalles(e.target.value)} style={{ width: '100%', padding: '6px', margin: '5px 0 15px 0', borderRadius: '4px', border: '1px solid #ccc', height: '60px' }} />
                  <button onClick={agregarEspecialAlLote} style={{ width: '100%', background: '#0B1E36', color: '#C5A059', border: 'none', padding: '8px', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}>Añadir Especial</button>
                </div>
              )}
            </div>

            {/* Panel Derecho: Items Planificados */}
            <div style={{ flex: '1.5', minWidth: '320px', background: '#f8fafc', padding: '20px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <h3 style={{ fontSize: '15px', color: '#0B1E36', borderBottom: '2px solid #C5A059', paddingBottom: '8px', marginBottom: '15px' }}>Items en el Lote ({itemsPlanificados.length})</h3>
              {itemsPlanificados.length === 0 ? (
                <p style={{ color: '#888', fontSize: '13px' }}>Aún no hay elementos agregados al lote.</p>
              ) : (
                <div>
                  {itemsPlanificados.map(item => {
                    const expandido = itemsExpandidos[item.id_temp] || false
                    return (
                      <div key={item.id_temp} style={{ background: 'white', padding: '12px', borderRadius: '6px', marginBottom: '10px', border: '1px solid #e2e8f0' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <strong style={{ fontSize: '13px', color: '#0B1E36' }}>{item.titulo}</strong>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <button
                              onClick={() => toggleExpandItem(item.id_temp)}
                              style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', color: '#0B1E36', fontSize: '11px', padding: '3px 8px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                            >
                              {expandido ? 'Ocultar componentes ▲' : `Ver componentes (${item.piezas_desglose?.length || 0}) ▼`}
                            </button>
                            <button onClick={() => setItemsPlanificados(prev => prev.filter(i => i.id_temp !== item.id_temp))} style={{ background: 'none', border: 'none', color: '#ef4444', fontWeight: 'bold', cursor: 'pointer', fontSize: '14px' }}>✕</button>
                          </div>
                        </div>
                        <div style={{ fontSize: '11px', color: '#555', marginTop: '4px' }}>Destino: {item.taller_destino}</div>

                        {/* Desglose desplegable para verificación de componentes */}
                        {expandido && (
                          <div style={{ marginTop: '10px', borderTop: '1px dashed #cbd5e1', paddingTop: '8px' }}>
                            <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#0B1E36', marginBottom: '6px' }}>📋 Desglose de Componentes / Piezas:</div>
                            {item.piezas_desglose && item.piezas_desglose.length > 0 ? (
                              <div style={{ maxHeight: '180px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '4px', background: '#f8fafc' }}>
                                <table style={{ width: '100%', fontSize: '10px', borderCollapse: 'collapse' }}>
                                  <thead>
                                    <tr style={{ background: '#e2e8f0', textAlign: 'left', color: '#0B1E36' }}>
                                      <th style={{ padding: '4px 6px' }}>Tipo</th>
                                      <th style={{ padding: '4px 6px' }}>Descripción</th>
                                      <th style={{ padding: '4px 6px' }}>Cant.</th>
                                      <th style={{ padding: '4px 6px' }}>Medidas</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {item.piezas_desglose.map((pieza, pIdx) => (
                                      <tr key={pIdx} style={{ borderBottom: '1px solid #eee' }}>
                                        <td style={{ padding: '4px 6px', fontWeight: 'bold' }}>{pieza.tipo}</td>
                                        <td style={{ padding: '4px 6px' }}>{pieza.descripcion || '-'}</td>
                                        <td style={{ padding: '4px 6px' }}>{pieza.cantidad}</td>
                                        <td style={{ padding: '4px 6px' }}>
                                          {[
                                            pieza.largo_cm && `L: ${pieza.largo_cm}cm`, 
                                            pieza.ancho_cm && `A: ${pieza.ancho_cm}cm`, 
                                            pieza.longitud_cm && `Long: ${pieza.longitud_cm}cm`
                                          ].filter(Boolean).join(' | ') || '-'}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            ) : (
                              <p style={{ fontSize: '11px', color: '#888', fontStyle: 'italic', margin: '4px 0' }}>No hay piezas constructivas registradas para este item.</p>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                  <button onClick={guardarLoteEnSupabase} disabled={procesandoPlan} style={{ width: '100%', background: '#16a34a', color: 'white', border: 'none', padding: '10px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', marginTop: '15px' }}>
                    💾 Sincronizar Lote en Base de Datos
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modal para selección de variantes o registro manual de piezas */}
      {ventaEnConfiguracion && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '24px', maxWidth: '700px', width: '100%', boxShadow: '0 4px 20px rgba(0,0,0,0.15)', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ color: '#0B1E36', fontSize: '18px', margin: '0 0 10px 0', borderBottom: '2px solid #C5A059', paddingBottom: '8px' }}>
              Configurar Componentes para Venta #{ventaEnConfiguracion.cod_venta}
            </h2>
            <p style={{ fontSize: '12px', color: '#666', marginBottom: '20px' }}>
              Cliente: <strong>{ventaEnConfiguracion.cliente_nombre}</strong>. Selecciona una variante existente o registra las piezas de forma manual / créala en <a href="/construccion" target="_blank" style={{ color: '#0B1E36', fontWeight: 'bold' }}>/construccion</a>.
            </p>

            {itemsConfigVenta.map((item, idx) => (
              <div key={idx} style={{ background: '#f8fafc', padding: '14px', borderRadius: '8px', marginBottom: '14px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <div style={{ fontWeight: 'bold', fontSize: '13px' }}>
                    {item.nombre_producto} <span style={{ color: '#666', fontWeight: 'normal' }}>(Cant: {item.cantidad})</span>
                  </div>
                  {item.variantesDisponibles.length > 0 && (
                    <button
                      onClick={() => toggleModoManualItemConfig(idx)}
                      style={{ background: 'none', border: 'none', color: '#0B1E36', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', textDecoration: 'underline' }}
                    >
                      {item.modoManual ? '← Usar variante existente' : '✍️ Registrar piezas manualmente'}
                    </button>
                  )}
                </div>

                {!item.modoManual ? (
                  <div>
                    {item.variantesDisponibles.length === 0 ? (
                      <div style={{ background: '#fff1f2', border: '1px solid #fecdd3', padding: '10px', borderRadius: '6px', marginBottom: '6px' }}>
                        <div style={{ fontSize: '11px', color: '#9f1239', fontWeight: 'bold', marginBottom: '4px' }}>⚠️ No existen variantes para este producto.</div>
                        <div style={{ fontSize: '11px', color: '#666', display: 'flex', gap: '10px', alignItems: 'center' }}>
                          <span>Puedes crearlas en <a href="/construccion" target="_blank" style={{ color: '#0B1E36', fontWeight: 'bold' }}>/construccion</a> o:</span>
                          <button onClick={() => toggleModoManualItemConfig(idx)} style={{ background: '#0B1E36', color: '#C5A059', border: 'none', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}>
                            Añadir piezas manualmente aquí
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '4px' }}>Seleccionar Variante:</label>
                        <select
                          value={item.varianteSeleccionadaId}
                          onChange={e => actualizarVarianteItemConfig(idx, e.target.value)}
                          style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #ccc', fontSize: '12px' }}
                        >
                          {item.variantesDisponibles.map(v => (
                            <option key={v.id} value={v.id}>
                              {v.nombre_variante || `Variante #${v.id}`}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ background: 'white', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#0B1E36' }}>Desglose Manual de Piezas:</span>
                      <button onClick={() => agregarPiezaManualItem(idx)} style={{ background: '#C5A059', color: '#0B1E36', border: 'none', padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}>
                        + Agregar Pieza
                      </button>
                    </div>

                    {item.piezasManuales.length === 0 && (
                      <p style={{ fontSize: '11px', color: '#888', fontStyle: 'italic', margin: '5px 0' }}>No hay piezas manuales añadidas todavía.</p>
                    )}

                    {item.piezasManuales.map((pieza, pIdx) => (
                      <div key={pIdx} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 60px 70px 30px', gap: '6px', alignItems: 'center', marginBottom: '6px' }}>
                        <select
                          value={pieza.tipo}
                          onChange={e => actualizarPiezaManualItem(idx, pIdx, 'tipo', e.target.value)}
                          style={{ padding: '4px', fontSize: '11px', borderRadius: '4px', border: '1px solid #ccc' }}
                        >
                          <option value="Melamina">Melamina</option>
                          <option value="Acero">Acero</option>
                          <option value="Accesorio">Accesorio</option>
                          <option value="Insumo">Insumo</option>
                          <option value="Unión">Unión</option>
                        </select>
                        <input
                          type="text"
                          placeholder="Descripción (ej. Lateral izquierdo)"
                          value={pieza.descripcion}
                          onChange={e => actualizarPiezaManualItem(idx, pIdx, 'descripcion', e.target.value)}
                          style={{ padding: '4px', fontSize: '11px', borderRadius: '4px', border: '1px solid #ccc' }}
                        />
                        <input
                          type="number"
                          placeholder="Cant"
                          value={pieza.cantidad}
                          onChange={e => actualizarPiezaManualItem(idx, pIdx, 'cantidad', e.target.value)}
                          style={{ padding: '4px', fontSize: '11px', borderRadius: '4px', border: '1px solid #ccc' }}
                        />
                        <input
                          type="text"
                          placeholder="Medidas"
                          value={pieza.largo_cm || ''}
                          onChange={e => actualizarPiezaManualItem(idx, pIdx, 'largo_cm', e.target.value)}
                          style={{ padding: '4px', fontSize: '11px', borderRadius: '4px', border: '1px solid #ccc' }}
                        />
                        <button onClick={() => eliminarPiezaManualItem(idx, pIdx)} style={{ background: 'none', border: 'none', color: '#ef4444', fontWeight: 'bold', cursor: 'pointer', fontSize: '14px' }}>✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}

            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button
                onClick={() => setVentaEnConfiguracion(null)}
                style={{ flex: 1, background: '#e2e8f0', color: '#333', border: 'none', padding: '10px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}
              >
                Cancelar
              </button>
              <button
                onClick={confirmarAgregarVentaConVariantes}
                disabled={procesandoPlan}
                style={{ flex: 2, background: '#0B1E36', color: '#C5A059', border: 'none', padding: '10px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}
              >
                Confirmar y Añadir al Lote
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}