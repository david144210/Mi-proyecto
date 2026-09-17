'use client'

import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

interface PiezaDesglose {
  tipo: string
  descripcion: string
  color?: string
  cantidad: number
  costo_unitario?: number
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
  const [catalogoMelaminas, setCatalogoMelaminas] = useState<any[]>([])

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

  const [loteIdActual, setLoteIdActual] = useState<number | null>(null)
  const [estadoWorkflowLote, setEstadoWorkflowLote] = useState<string>('creado')
  const [cargandoLote, setCargandoLote] = useState(false)
  const [lotesGuardados, setLotesGuardados] = useState<any[]>([])

  const [itemsExpandidos, setItemsExpandidos] = useState<Record<string, boolean>>({})

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

    const [prodRes, melRes] = await Promise.all([
      supabase.from('productos').select('codigo, nombre'),
      supabase.from('melaminas').select('*')
    ])

    if (prodRes.data) setCatalogoProductos(prodRes.data)
    if (melRes.data) setCatalogoMelaminas(melRes.data)

    cargarVentasPorFecha(fechaBusquedaVentas)
  }

  useEffect(() => {
    if (usuario) cargarVentasPorFecha(fechaBusquedaVentas)
  }, [fechaBusquedaVentas])

  const [autoDeteccionHecha, setAutoDeteccionHecha] = useState(false)
  useEffect(() => {
    if (!usuario || autoDeteccionHecha) return
    const detectarLoteActivo = async () => {
      const { data } = await supabase
        .from('lotes_produccion')
        .select('fecha, nombre_lote')
        .neq('estado_workflow', 'aprobado')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (data) {
        setFechaLote(data.fecha)
        setNombreLote(data.nombre_lote)
      }
      setAutoDeteccionHecha(true)
    }
    detectarLoteActivo()
  }, [usuario])

  useEffect(() => {
    if (!usuario) return
    cargarLoteExistente(fechaLote, nombreLote)
  }, [usuario, fechaLote, nombreLote])

  useEffect(() => {
    if (!usuario) return
    cargarListaDeLotes()
  }, [usuario])

  const cargarListaDeLotes = async () => {
    const { data } = await supabase
      .from('lotes_produccion')
      .select('id, fecha, nombre_lote, estado_workflow, updated_at')
      .order('updated_at', { ascending: false })
      .limit(30)
    setLotesGuardados(data || [])
  }

  const cargarLoteExistente = async (fec: string, nombre: string) => {
    const nombreLimpio = nombre.trim()
    if (!nombreLimpio) return
    setCargandoLote(true)
    try {
      const { data, error } = await supabase
        .from('lotes_produccion')
        .select('id, estado_workflow, materiales_planificados')
        .eq('fecha', fec)
        .eq('nombre_lote', nombreLimpio)
        .maybeSingle()

      if (error) throw error

      if (data) {
        setLoteIdActual(data.id)
        setEstadoWorkflowLote(data.estado_workflow || 'creado')
        const itemsRecuperados = (data.materiales_planificados || []).map((item: any, idx: number) => ({
          ...item,
          id_temp: item.id_temp || `rec-${idx}-${Math.random().toString(36).substr(2, 6)}`
        }))
        setItemsPlanificados(itemsRecuperados)
      } else {
        setLoteIdActual(null)
        setEstadoWorkflowLote('creado')
        setItemsPlanificados([])
      }
    } catch (err: any) {
      console.error('Error al recuperar el lote guardado:', err?.message || err)
    } finally {
      setCargandoLote(false)
    }
  }

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
        ...(melres.data || []).map(m => ({
          tipo: 'Melamina',
          descripcion: m.descripcion || '',
          color: m.codigo_melamina || '',
          cantidad: Number(m.cantidad) || 1,
          costo_unitario: Number(m.costo_unitario ?? m.costo) || 0
        })),
        ...(acerres.data || []).map(a => ({
          tipo: 'Acero',
          descripcion: a.descripcion || a.codigo_acero,
          cantidad: Number(a.cantidad) || 1,
          costo_unitario: Number(a.costo_unitario ?? a.costo) || 0
        })),
        ...(accres.data || []).map(ac => ({
          tipo: 'Accesorio',
          descripcion: ac.descripcion || ac.codigo_accesorio,
          cantidad: Number(ac.cantidad) || 1,
          costo_unitario: Number(ac.costo_unitario ?? ac.costo) || 0
        })),
        ...(insres.data || []).map(i => ({
          tipo: 'Insumo',
          descripcion: i.descripcion || i.codigo_insumo,
          cantidad: Number(i.cantidad) || 1,
          costo_unitario: Number(i.costo_unitario ?? i.costo) || 0
        })),
        ...(unires.data || []).map(u => ({
          tipo: 'Unión',
          descripcion: u.descripcion || u.codigo_union,
          cantidad: Number(u.cantidad) || 1,
          costo_unitario: Number(u.costo_unitario ?? u.costo) || 0
        }))
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
      color: '',
      cantidad: 1,
      costo_unitario: 0
    })
    setItemsConfigVenta(actualizado)
  }

  const actualizarPiezaManualItem = (itemIndex: number, piezaIndex: number, campo: string, valor: any) => {
    const actualizado = [...itemsConfigVenta]
    actualizado[itemIndex].piezasManuales[piezaIndex] = {
      ...actualizado[itemIndex].piezasManuales[piezaIndex],
      [campo]: campo === 'cantidad' || campo === 'costo_unitario' ? (valor === '' ? 0 : Number(valor)) : valor
    }
    setItemsConfigVenta(actualizado)
  }

  const eliminarPiezaManualItem = (itemIndex: number, piezaIndex: number) => {
    const actualizado = [...itemsConfigVenta]
    actualizado[itemIndex].piezasManuales.splice(piezaIndex, 1)
    setItemsConfigVenta(actualizado)
  }

  const actualizarPiezaItemPlanificado = (idTemp: string, piezaIdx: number, campo: string, valor: any) => {
    setItemsPlanificados(prev => prev.map(item => {
      if (item.id_temp !== idTemp) return item
      const nuevasPiezas = [...item.piezas_desglose]
      nuevasPiezas[piezaIdx] = {
        ...nuevasPiezas[piezaIdx],
        [campo]: campo === 'cantidad' || campo === 'costo_unitario' ? (valor === '' ? 0 : Number(valor)) : valor
      }
      return { ...item, piezas_desglose: nuevasPiezas }
    }))
  }

  const eliminarPiezaItemPlanificado = (idTemp: string, piezaIdx: number) => {
    setItemsPlanificados(prev => prev.map(item => {
      if (item.id_temp !== idTemp) return item
      const nuevasPiezas = [...item.piezas_desglose]
      nuevasPiezas.splice(piezaIdx, 1)
      return { ...item, piezas_desglose: nuevasPiezas }
    }))
  }

  const agregarPiezaItemPlanificado = (idTemp: string) => {
    setItemsPlanificados(prev => prev.map(item => {
      if (item.id_temp !== idTemp) return item
      return {
        ...item,
        piezas_desglose: [
          ...item.piezas_desglose,
          { tipo: 'Melamina', descripcion: '', color: '', cantidad: 1, costo_unitario: 0 }
        ]
      }
    }))
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

            const mapMelamina = (rows: any[] | null) => (rows || []).map(x => ({
              tipo: 'Melamina',
              cantidad: (Number(x.cantidad) || 1) * mult,
              descripcion: x.descripcion || '',
              color: x.codigo_melamina || '',
              costo_unitario: Number(x.costo_unitario ?? x.costo) || 0
            }))

            const mapPiezas = (rows: any[] | null, tipo: string) => (rows || []).map(x => {
              let codigoCampo = `codigo_${tipo.toLowerCase()}`
              if (tipo === 'Unión') codigoCampo = 'codigo_union'
              return {
                tipo,
                cantidad: (Number(x.cantidad) || 1) * mult,
                descripcion: x.descripcion || x[codigoCampo],
                costo_unitario: Number(x.costo_unitario ?? x.costo) || 0
              }
            })

            piezasDesgloseVenta = [
              ...piezasDesgloseVenta,
              ...mapMelamina(m.data),
              ...mapPiezas(a.data, 'Acero'),
              ...mapPiezas(ac.data, 'Accesorio'),
              ...mapPiezas(i.data, 'Insumo'),
              ...mapPiezas(u.data, 'Unión')
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
    const nombreLimpio = nombreLote.trim()
    if (!nombreLimpio) {
      alert('Ponle un nombre al lote antes de guardar.')
      return
    }
    if (nombreLimpio !== nombreLote) setNombreLote(nombreLimpio)

    const costoTotalLote = itemsPlanificados.reduce((acc, item) => {
      const piezas = item.piezas_desglose || []
      const subtotalItem = piezas.reduce((sum, p) => sum + ((Number(p.cantidad) || 1) * (Number(p.costo_unitario) || 0)), 0)
      return acc + subtotalItem
    }, 0)

    setProcesandoPlan(true)
    try {
      const { data: existing } = await supabase
        .from('lotes_produccion')
        .select('id, estado_workflow')
        .eq('fecha', fechaLote)
        .eq('nombre_lote', nombreLimpio)
        .maybeSingle()

      let error;
      let idResultante = existing?.id ?? null
      if (existing) {
        const { error: err } = await supabase
          .from('lotes_produccion')
          .update({
            estado_workflow: existing.estado_workflow || 'creado',
            materiales_planificados: itemsPlanificados,
            updated_at: new Date().toISOString()
          })
          .eq('id', existing.id)
        error = err;
      } else {
        const { data: inserted, error: err } = await supabase
          .from('lotes_produccion')
          .insert({
            fecha: fechaLote,
            nombre_lote: nombreLimpio,
            estado_workflow: 'creado',
            materiales_planificados: itemsPlanificados,
            updated_at: new Date().toISOString()
          })
          .select('id')
          .single()
        error = err;
        idResultante = inserted?.id ?? null
      }

      if (error) throw error
      setLoteIdActual(idResultante)
      cargarListaDeLotes()
      alert(`¡Lote guardado correctamente!\nCosto Total calculado: $${costoTotalLote.toFixed(2)}`)
    } catch (err: any) {
      console.error(err)
      alert('Error al guardar la planificación: ' + (err?.message || 'revisa la consola.'))
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
            {lotesGuardados.length > 0 && (
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold' }}>Abrir lote existente:</label>
                <select
                  value=""
                  onChange={e => {
                    const sel = lotesGuardados.find(l => String(l.id) === e.target.value)
                    if (sel) { setFechaLote(sel.fecha); setNombreLote(sel.nombre_lote) }
                  }}
                  style={{ padding: '6px', borderRadius: '4px', border: '1px solid #ccc', marginTop: '4px', width: '260px' }}
                >
                  <option value="">-- Seleccionar de Supabase --</option>
                  {lotesGuardados.map(l => (
                    <option key={l.id} value={l.id}>
                      {l.fecha} · {l.nombre_lote} ({l.estado_workflow})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {cargandoLote && (
            <p style={{ fontSize: '12px', color: '#666', margin: '0 0 10px 0' }}>Recuperando lote guardado desde Supabase...</p>
          )}
          {!cargandoLote && loteIdActual && (
            <p style={{ fontSize: '12px', color: '#16a34a', margin: '0 0 10px 0' }}>
              ✓ Lote existente recuperado ({itemsPlanificados.length} items) · Estado: <strong>{estadoWorkflowLote}</strong>
            </p>
          )}

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
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '5px' }}>Fecha de Entrega:</label>
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
                              {expandido ? 'Ocultar componentes ▲' : `Ver y Editar componentes (${item.piezas_desglose?.length || 0}) ▼`}
                            </button>
                            <button onClick={() => setItemsPlanificados(prev => prev.filter(i => i.id_temp !== item.id_temp))} style={{ background: 'none', border: 'none', color: '#ef4444', fontWeight: 'bold', cursor: 'pointer', fontSize: '14px' }}>✕</button>
                          </div>
                        </div>
                        <div style={{ fontSize: '11px', color: '#555', marginTop: '4px' }}>Destino: {item.taller_destino}</div>

                        {expandido && (
                          <div style={{ marginTop: '10px', borderTop: '1px dashed #cbd5e1', paddingTop: '8px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                              <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#0B1E36' }}>✏️ Editar Componentes / Piezas:</div>
                              <button
                                onClick={() => agregarPiezaItemPlanificado(item.id_temp)}
                                style={{ background: '#C5A059', color: '#0B1E36', border: 'none', padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}
                              >
                                + Añadir Pieza
                              </button>
                            </div>

                            {item.piezas_desglose && item.piezas_desglose.length > 0 ? (
                              <div style={{ maxHeight: '240px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '4px', background: '#f8fafc', padding: '4px' }}>
                                <table style={{ width: '100%', fontSize: '10px', borderCollapse: 'collapse' }}>
                                  <thead>
                                    <tr style={{ background: '#e2e8f0', textAlign: 'left', color: '#0B1E36' }}>
                                      <th style={{ padding: '4px 6px', width: '75px' }}>Tipo</th>
                                      <th style={{ padding: '4px 6px' }}>Detalle de Pieza</th>
                                      <th style={{ padding: '4px 6px' }}>Código Melamina</th>
                                      <th style={{ padding: '4px 6px', width: '40px' }}>Cant.</th>
                                      <th style={{ padding: '4px 6px', width: '55px' }}>Costo Unit.</th>
                                      <th style={{ padding: '4px 6px', width: '25px' }}></th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {item.piezas_desglose.map((pieza, pIdx) => (
                                      <tr key={pIdx} style={{ borderBottom: '1px solid #eee' }}>
                                        <td style={{ padding: '4px 6px' }}>
                                          <select
                                            value={pieza.tipo}
                                            onChange={e => actualizarPiezaItemPlanificado(item.id_temp, pIdx, 'tipo', e.target.value)}
                                            style={{ fontSize: '10px', padding: '2px', borderRadius: '4px', border: '1px solid #ccc', backgroundColor: '#ffffff', color: '#000000' }}
                                          >
                                            <option value="Melamina">Melamina</option>
                                            <option value="Acero">Acero</option>
                                            <option value="Accesorio">Accesorio</option>
                                            <option value="Insumo">Insumo</option>
                                            <option value="Unión">Unión</option>
                                          </select>
                                        </td>
                                        <td style={{ padding: '4px 6px' }}>
                                          <input
                                            type="text"
                                            value={pieza.descripcion || ''}
                                            onChange={e => actualizarPiezaItemPlanificado(item.id_temp, pIdx, 'descripcion', e.target.value)}
                                            placeholder="Ej. Lateral, Puerta..."
                                            style={{ width: '100%', fontSize: '10px', padding: '2px 4px', borderRadius: '4px', border: '1px solid #ccc', backgroundColor: '#ffffff', color: '#000000' }}
                                          />
                                        </td>
                                        <td style={{ padding: '4px 6px' }}>
                                          {pieza.tipo === 'Melamina' ? (
                                            <select
                                              value={pieza.color || ''}
                                              onChange={e => actualizarPiezaItemPlanificado(item.id_temp, pIdx, 'color', e.target.value)}
                                              style={{ width: '100%', fontSize: '10px', padding: '2px 4px', borderRadius: '4px', border: '1px solid #ccc', backgroundColor: '#ffffff', color: '#000000' }}
                                            >
                                              <option value="" style={{ color: '#000', background: '#fff' }}>-- Seleccionar Melamina --</option>
                                              {catalogoMelaminas.map((mel, mIdx) => {
                                                const codigoMel = mel.codigo_melamina || ''
                                                const descMel = mel.detalle || codigoMel || `Melamina #${mIdx + 1}`
                                                return (
                                                  <option key={mIdx} value={codigoMel} style={{ color: '#000', background: '#fff' }}>
                                                    {codigoMel} - {descMel}
                                                  </option>
                                                )
                                              })}
                                            </select>
                                          ) : (
                                            <span style={{ fontSize: '10px', color: '#888', fontStyle: 'italic' }}>N/A</span>
                                          )}
                                        </td>
                                        <td style={{ padding: '4px 6px' }}>
                                          <input
                                            type="number"
                                            value={pieza.cantidad ?? 1}
                                            onChange={e => actualizarPiezaItemPlanificado(item.id_temp, pIdx, 'cantidad', e.target.value)}
                                            style={{ width: '38px', fontSize: '10px', padding: '2px 4px', borderRadius: '4px', border: '1px solid #ccc', backgroundColor: '#ffffff', color: '#000000' }}
                                          />
                                        </td>
                                        <td style={{ padding: '4px 6px' }}>
                                          <input
                                            type="number"
                                            value={pieza.costo_unitario ?? 0}
                                            onChange={e => actualizarPiezaItemPlanificado(item.id_temp, pIdx, 'costo_unitario', e.target.value)}
                                            style={{ width: '52px', fontSize: '10px', padding: '2px 4px', borderRadius: '4px', border: '1px solid #ccc', backgroundColor: '#ffffff', color: '#000000' }}
                                          />
                                        </td>
                                        <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                                          <button
                                            onClick={() => eliminarPiezaItemPlanificado(item.id_temp, pIdx)}
                                            style={{ background: 'none', border: 'none', color: '#ef4444', fontWeight: 'bold', cursor: 'pointer', fontSize: '12px' }}
                                          >
                                            ✕
                                          </button>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            ) : (
                              <p style={{ fontSize: '11px', color: '#888', fontStyle: 'italic', margin: '4px 0' }}>No hay piezas constructivas registradas.</p>
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

      {/* Modal para selección de variantes */}
      {ventaEnConfiguracion && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '24px', maxWidth: '800px', width: '100%', boxShadow: '0 4px 20px rgba(0,0,0,0.15)', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ color: '#0B1E36', fontSize: '18px', margin: '0 0 10px 0', borderBottom: '2px solid #C5A059', paddingBottom: '8px' }}>
              Configurar Componentes para Venta #{ventaEnConfiguracion.cod_venta}
            </h2>
            <p style={{ fontSize: '12px', color: '#666', marginBottom: '20px' }}>
              Cliente: <strong>{ventaEnConfiguracion.cliente_nombre}</strong>. Selecciona una variante o registra las piezas manualmente.
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
                        <button onClick={() => toggleModoManualItemConfig(idx)} style={{ background: '#0B1E36', color: '#C5A059', border: 'none', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}>
                          Añadir piezas manualmente aquí
                        </button>
                      </div>
                    ) : (
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', marginBottom: '4px' }}>Seleccionar Variante:</label>
                        <select
                          value={item.varianteSeleccionadaId}
                          onChange={e => actualizarVarianteItemConfig(idx, e.target.value)}
                          style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #ccc', fontSize: '12px', backgroundColor: '#ffffff', color: '#000000' }}
                        >
                          {item.variantesDisponibles.map(v => (
                            <option key={v.id} value={v.id} style={{ color: '#000', background: '#fff' }}>
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
                      <div key={pIdx} style={{ display: 'grid', gridTemplateColumns: '80px 1fr 1fr 45px 55px 20px', gap: '6px', alignItems: 'center', marginBottom: '6px' }}>
                        <select
                          value={pieza.tipo}
                          onChange={e => actualizarPiezaManualItem(idx, pIdx, 'tipo', e.target.value)}
                          style={{ padding: '4px', fontSize: '10px', borderRadius: '4px', border: '1px solid #ccc', backgroundColor: '#ffffff', color: '#000000' }}
                        >
                          <option value="Melamina">Melamina</option>
                          <option value="Acero">Acero</option>
                          <option value="Accesorio">Accesorio</option>
                          <option value="Insumo">Insumo</option>
                          <option value="Unión">Unión</option>
                        </select>
                        
                        <input
                          type="text"
                          placeholder="Detalle (Ej. Lateral)"
                          value={pieza.descripcion}
                          onChange={e => actualizarPiezaManualItem(idx, pIdx, 'descripcion', e.target.value)}
                          style={{ padding: '4px', fontSize: '10px', borderRadius: '4px', border: '1px solid #ccc', backgroundColor: '#ffffff', color: '#000000' }}
                        />

                        {pieza.tipo === 'Melamina' ? (
                          <select
                            value={pieza.color || ''}
                            onChange={e => actualizarPiezaManualItem(idx, pIdx, 'color', e.target.value)}
                            style={{ padding: '4px', fontSize: '10px', borderRadius: '4px', border: '1px solid #ccc', backgroundColor: '#ffffff', color: '#000000' }}
                          >
                            <option value="" style={{ color: '#000', background: '#fff' }}>-- Melamina --</option>
                            {catalogoMelaminas.map((mel, mIdx) => {
                              const codigoMel = mel.codigo_melamina || ''
                              const descMel = mel.detalle || codigoMel || `Melamina #${mIdx + 1}`
                              return (
                                <option key={mIdx} value={codigoMel} style={{ color: '#000', background: '#fff' }}>
                                  {codigoMel} - {descMel}
                                </option>
                              )
                            })}
                          </select>
                        ) : (
                          <span style={{ fontSize: '10px', color: '#888', fontStyle: 'italic', textAlign: 'center' }}>N/A</span>
                        )}

                        <input
                          type="number"
                          placeholder="Cant"
                          value={pieza.cantidad}
                          onChange={e => actualizarPiezaManualItem(idx, pIdx, 'cantidad', e.target.value)}
                          style={{ padding: '4px', fontSize: '10px', borderRadius: '4px', border: '1px solid #ccc', backgroundColor: '#ffffff', color: '#000000' }}
                        />
                        <input
                          type="number"
                          placeholder="Costo"
                          value={pieza.costo_unitario ?? 0}
                          onChange={e => actualizarPiezaManualItem(idx, pIdx, 'costo_unitario', e.target.value)}
                          style={{ padding: '4px', fontSize: '10px', borderRadius: '4px', border: '1px solid #ccc', backgroundColor: '#ffffff', color: '#000000' }}
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