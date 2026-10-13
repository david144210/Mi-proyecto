'use client'

import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

// Longitud comercial fija de todo tubo/perfil de acero (cm)
const LONGITUD_BARRA_CM = 600

// Cada pieza conserva los valores reales de la variante (códigos y medidas),
// no solo el texto descriptivo, para que Presupuestos pueda sumar tubos,
// centralizar melaminas y descontar de almacén por código.
interface PiezaDesglose {
  tipo: string // 'Melamina' | 'Acero' | 'Accesorio' | 'Insumo'
  descripcion: string
  color?: string // código de melamina (lo usa el selector de la tabla)
  cantidad: number
  costo_unitario?: number
  codigo?: string // código genérico del catálogo (según el tipo)
  codigo_acero?: string
  longitud_cm?: number
  codigo_melamina?: string
  largo_cm?: number
  ancho_cm?: number
  codigo_accesorio?: string
  codigo_insumo?: string
  variante_id?: number
}

// Convierte las filas crudas de una variante en piezas separadas por tipo.
// Las uniones NO se incluyen: son un valor de costo por punto del cotizador,
// no un material que se compre o se descuente de almacén.
const piezasDesdeVariante = (
  rows: { m: any[] | null; a: any[] | null; ac: any[] | null; i: any[] | null },
  mult: number,
  catalogoMelaminas: any[],
  varianteId: number
): PiezaDesglose[] => {
  const costo = (x: any) => Number(x.costo_unitario ?? x.costo) || 0

  const melaminas: PiezaDesglose[] = (rows.m || []).map(x => {
    const codigoMel = x.codigo_melamina || ''
    const nombreMel = catalogoMelaminas.find(cat => cat.codigo_melamina === codigoMel)?.detalle || codigoMel
    const descBase = x.descripcion || 'Melamina'
    const descripcion = descBase && descBase !== codigoMel && !descBase.includes(nombreMel) ? `${descBase} - ${nombreMel}` : nombreMel
    return {
      tipo: 'Melamina', descripcion, color: codigoMel, codigo: codigoMel, codigo_melamina: codigoMel,
      largo_cm: Number(x.largo_cm) || 0, ancho_cm: Number(x.ancho_cm) || 0,
      cantidad: (Number(x.cantidad) || 1) * mult, costo_unitario: costo(x), variante_id: varianteId
    }
  })

  const aceros: PiezaDesglose[] = (rows.a || []).map(x => ({
    tipo: 'Acero', descripcion: x.descripcion || x.codigo_acero, codigo: x.codigo_acero, codigo_acero: x.codigo_acero,
    longitud_cm: Number(x.longitud_cm ?? x.largo_cm) || 0,
    cantidad: (Number(x.cantidad) || 1) * mult, costo_unitario: costo(x), variante_id: varianteId
  }))

  const accesorios: PiezaDesglose[] = (rows.ac || []).map(x => ({
    tipo: 'Accesorio', descripcion: x.descripcion || x.codigo_accesorio, codigo: x.codigo_accesorio, codigo_accesorio: x.codigo_accesorio,
    cantidad: (Number(x.cantidad) || 1) * mult, costo_unitario: costo(x), variante_id: varianteId
  }))

  const insumos: PiezaDesglose[] = (rows.i || []).map(x => ({
    tipo: 'Insumo', descripcion: x.descripcion || x.codigo_insumo, codigo: x.codigo_insumo, codigo_insumo: x.codigo_insumo,
    cantidad: (Number(x.cantidad) || 1) * mult, costo_unitario: costo(x), variante_id: varianteId
  }))

  return [...melaminas, ...aceros, ...accesorios, ...insumos]
}

// Agrupa las piezas en tubos / melaminas / accesorios / insumos por separado.
// - Tubos: suma los cortes del mismo código (ej. varias piezas de 120cm) y calcula
//   las barras comerciales = ceil(total_cm / 600).
// - Melaminas: se envían pieza por pieza (con largo y ancho); la centralización
//   se hace en Presupuestos.
// - Accesorios e insumos: suma simple por código.
const agruparMateriales = (piezas: PiezaDesglose[]) => {
  const aceros = new Map<string, { codigo_acero: string; descripcion: string; cortes: Map<number, number>; total_cm: number }>()
  const melaminas: any[] = []
  const accesorios = new Map<string, { codigo_accesorio: string; descripcion: string; cantidad: number }>()
  const insumos = new Map<string, { codigo_insumo: string; descripcion: string; cantidad: number }>()

  for (const p of piezas || []) {
    const cant = Number(p.cantidad) || 0
    if (p.tipo === 'Acero') {
      const codigo = p.codigo_acero || p.codigo || ''
      const key = codigo || `SIN-CODIGO|${p.descripcion}`
      const largo = Number(p.longitud_cm) || 0
      const g = aceros.get(key) || { codigo_acero: codigo, descripcion: p.descripcion, cortes: new Map<number, number>(), total_cm: 0 }
      g.cortes.set(largo, (g.cortes.get(largo) || 0) + cant)
      g.total_cm += largo * cant
      aceros.set(key, g)
    } else if (p.tipo === 'Melamina') {
      melaminas.push({
        codigo_melamina: p.codigo_melamina || p.color || p.codigo || '',
        descripcion: p.descripcion,
        largo_cm: Number(p.largo_cm) || 0,
        ancho_cm: Number(p.ancho_cm) || 0,
        cantidad: cant
      })
    } else if (p.tipo === 'Accesorio') {
      const codigo = p.codigo_accesorio || p.codigo || ''
      const key = codigo || `SIN-CODIGO|${p.descripcion}`
      const g = accesorios.get(key) || { codigo_accesorio: codigo, descripcion: p.descripcion, cantidad: 0 }
      g.cantidad += cant
      accesorios.set(key, g)
    } else if (p.tipo === 'Insumo') {
      const codigo = p.codigo_insumo || p.codigo || ''
      const key = codigo || `SIN-CODIGO|${p.descripcion}`
      const g = insumos.get(key) || { codigo_insumo: codigo, descripcion: p.descripcion, cantidad: 0 }
      g.cantidad += cant
      insumos.set(key, g)
    }
    // tipo 'Unión' u otros: se ignoran a propósito
  }

  return {
    aceros: [...aceros.values()].map(g => ({
      codigo_acero: g.codigo_acero,
      descripcion: g.descripcion,
      cortes: [...g.cortes.entries()].map(([longitud_cm, cantidad]) => ({ longitud_cm, cantidad })),
      total_cm: g.total_cm,
      barras_necesarias: Math.ceil(g.total_cm / LONGITUD_BARRA_CM - 1e-9)
    })),
    melaminas,
    accesorios: [...accesorios.values()],
    insumos: [...insumos.values()]
  }
}

// Aplica un cambio de la tabla de edición a una pieza, manteniendo sincronizados
// los campos de código/medida según el tipo.
const aplicarCambioPieza = (pieza: PiezaDesglose, campo: keyof PiezaDesglose, valor: string, catalogoMelaminas: any[]): PiezaDesglose => {
  const p: any = { ...pieza }
  const numericos = ['cantidad', 'costo_unitario', 'longitud_cm', 'largo_cm', 'ancho_cm']
  if (numericos.includes(campo as string)) {
    p[campo] = valor === '' ? 0 : Number(valor)
  } else {
    p[campo] = valor
  }

  if (campo === 'color' && p.tipo === 'Melamina') {
    p.codigo = valor
    p.codigo_melamina = valor
    const nombreMel = catalogoMelaminas.find(cat => cat.codigo_melamina === valor)?.detalle || valor
    p.descripcion = nombreMel ? `Melamina - ${nombreMel}` : p.descripcion
  }

  if (campo === 'tipo' || campo === 'codigo') {
    const cod = p.codigo || p.color || ''
    p.codigo_acero = p.tipo === 'Acero' ? cod : undefined
    p.codigo_melamina = p.tipo === 'Melamina' ? cod : undefined
    p.codigo_accesorio = p.tipo === 'Accesorio' ? cod : undefined
    p.codigo_insumo = p.tipo === 'Insumo' ? cod : undefined
    if (p.tipo === 'Melamina') p.color = cod
  }
  return p
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
  detalle_id?: number          // id de la fila en detalle_venta (identifica el mueble dentro del pedido)
  detalle?: any                // fila original de detalle_venta
  incluir: boolean             // ¿entra en este lote?
  bloqueadoEn?: string         // si ya fue planificado en otro lote/día
  bloqueadoLote?: { fecha: string; lote: string } // lote donde está planificado (si no es el actual)
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
  const [pedidosPendientesGlobal, setPedidosPendientesGlobal] = useState<any[]>([])
  const [mostrarPendientes, setMostrarPendientes] = useState(true)
  const [avanceDisponible, setAvanceDisponible] = useState(true)
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
  const [errorLotes, setErrorLotes] = useState('')

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
    cargarPedidosPendientes()
  }, [usuario])

  // Lista de todos los lotes guardados en Supabase (de cualquier fecha y estado), con el avance
  // por mueble de cada pedido. Se vuelve a leer al abrir el selector.
  const cargarListaDeLotes = async () => {
    const consulta = (cols: string): any => supabase
      .from('lotes_produccion')
      .select(cols)
      .order('fecha', { ascending: false })
      .order('updated_at', { ascending: false })
      .limit(300)
    let res: any = await consulta('id, fecha, nombre_lote, estado_workflow, updated_at, avance_ventas')
    if (res.error && (res.error.code === '42703' || (res.error.message || '').includes('avance_ventas'))) {
      setAvanceDisponible(false) // falta correr el SQL del avance por mueble
      res = await consulta('id, fecha, nombre_lote, estado_workflow, updated_at')
    } else if (!res.error) {
      setAvanceDisponible(true)
    }
    if (res.error) {
      console.error('No se pudo leer la lista de lotes:', res.error.message)
      setErrorLotes('No se pudo leer la lista de lotes: ' + res.error.message)
      return
    }
    setErrorLotes('')
    setLotesGuardados(res.data || [])
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
      const [melres, acerres, accres, insres] = await Promise.all([
        supabase.from('variante_melamina').select('*').eq('variante_id', vId),
        supabase.from('variante_acero').select('*').eq('variante_id', vId),
        supabase.from('variante_accesorios').select('*').eq('variante_id', vId),
        supabase.from('variante_insumos').select('*').eq('variante_id', vId)
      ])

      setPiezasVarianteActual(piezasDesdeVariante(
        { m: melres.data, a: acerres.data, ac: accres.data, i: insres.data },
        1, catalogoMelaminas, vId
      ))
    }
    cargarPiezasVariante()
  }, [varianteIdSeleccionada, catalogoMelaminas])

  const cambiarDiaBusqueda = (dias: number) => {
    const [anio, mes, dia] = fechaBusquedaVentas.split('-').map(Number)
    const fechaObj = new Date(anio, mes - 1, dia)
    fechaObj.setDate(fechaObj.getDate() + dias)
    const nuevoAnio = fechaObj.getFullYear()
    const nuevoMes = String(fechaObj.getMonth() + 1).padStart(2, '0')
    const nuevoDia = String(fechaObj.getDate()).padStart(2, '0')
    setFechaBusquedaVentas(`${nuevoAnio}-${nuevoMes}-${nuevoDia}`)
  }

  // Arma ventas con nombre de cliente y sus muebles (filas de detalle_venta)
  const armarVentasConDetalle = async (ventasBase: any[]) => {
    if (!ventasBase || ventasBase.length === 0) return []
    const clientesIds = [...new Set(ventasBase.map(v => v.cod_cliente))]
    const { data: clientes } = await supabase.from('clientes').select('id, nombre').in('id', clientesIds)
    const cMap = Object.fromEntries(clientes?.map(c => [c.id, c.nombre]) || [])
    const codsVenta = ventasBase.map(v => v.cod_venta)
    const { data: detallesVenta } = await supabase.from('detalle_venta').select('*').in('cod_venta', codsVenta)
    return ventasBase.map(v => ({
      ...v,
      cliente_nombre: cMap[v.cod_cliente] || 'Cliente General',
      detalles: (detallesVenta || []).filter(d => d.cod_venta === v.cod_venta)
    }))
  }

  const cargarVentasPorFecha = async (fec: string) => {
    const { data: ventasFecha } = await supabase
      .from('ventas')
      .select('id, cod_venta, cod_cliente, fecha_entrega, estado')
      .eq('fecha_entrega', fec)
      .in('estado', [1, 2])
    setPedidosVenta(await armarVentasConDetalle(ventasFecha || []))
  }

  // Pedidos de los últimos 30 días en adelante (pendientes o en fabricación) para controlar
  // cuáles muebles todavía no se planificaron, sin importar la fecha de entrega.
  const cargarPedidosPendientes = async () => {
    const desde = new Date()
    desde.setDate(desde.getDate() - 30)
    const { data } = await supabase
      .from('ventas')
      .select('id, cod_venta, cod_cliente, fecha_entrega, estado')
      .in('estado', [1, 2])
      .gte('fecha_entrega', desde.toISOString().split('T')[0])
      .order('fecha_entrega', { ascending: true })
      .limit(300)
    setPedidosPendientesGlobal(await armarVentasConDetalle(data || []))
  }

  // Qué muebles (detalle_venta) ya están planificados: en otros lotes (guardados en Supabase)
  // y en el lote que se está editando ahora (en pantalla, aunque no se haya guardado).
  const mapaAvance = () => {
    const mapa = new Map<string, { fecha: string; lote: string; enEsteLote: boolean }>()
    for (const l of lotesGuardados) {
      if (l.fecha === fechaLote && l.nombre_lote === nombreLote.trim()) continue
      for (const a of (l.avance_ventas || [])) {
        for (const did of (a.detalle_ids || [])) mapa.set(`${a.cod_venta}:${did}`, { fecha: l.fecha, lote: l.nombre_lote, enEsteLote: false })
      }
    }
    for (const it of itemsPlanificados) {
      if (it.tipo_origen !== 'venta') continue
      for (const d of (it.detalles || [])) mapa.set(`${it.referencia_id}:${d.id}`, { fecha: fechaLote, lote: nombreLote.trim(), enEsteLote: true })
    }
    return mapa
  }

  const progresoVenta = (v: any, mapa: Map<string, any>) => {
    const muebles = (v.detalles || []).filter((d: any) => d.cod_producto || d.producto_codigo || d.codigo)
    const hechos = muebles.filter((d: any) => mapa.has(`${v.cod_venta}:${d.id}`)).length
    return { total: muebles.length, hechos }
  }

  const abrirConfiguracionVenta = async (venta: any) => {
    setProcesandoPlan(true)
    try {
      const detallesVenta = venta.detalles || []
      const productosMap = Object.fromEntries(catalogoProductos.map(p => [p.codigo, p.nombre]))
      const itemsConfig: ItemConfigVenta[] = []
      const mapa = mapaAvance()

      for (const det of detallesVenta) {
        const codProd = det.cod_producto || det.producto_codigo || det.codigo
        if (codProd) {
          const { data: variantesDb } = await supabase
            .from('producto_variantes')
            .select('*')
            .eq('codigo_producto', codProd)

          const listaVars = variantesDb || []
          const sinVars = listaVars.length === 0

          const previo = mapa.get(`${venta.cod_venta}:${det.id}`)
          itemsConfig.push({
            detalle_id: det.id,
            detalle: det,
            incluir: !previo,
            bloqueadoEn: previo ? (previo.enEsteLote ? 'ya está en este lote' : `${previo.fecha} · ${previo.lote}`) : undefined,
            bloqueadoLote: previo && !previo.enEsteLote ? { fecha: previo.fecha, lote: previo.lote } : undefined,
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

  // Muebles (detalle_venta) de cada pedido que contiene una lista de items planificados
  const construirAvanceVentas = (items: any[]) => {
    const avanceMap = new Map<number, any[]>()
    for (const it of items) {
      if (it.tipo_origen !== 'venta') continue
      const cod = Number(it.referencia_id)
      const ids = (it.detalles || []).map((d: any) => d.id).filter((x: any) => x !== undefined && x !== null)
      avanceMap.set(cod, [...(avanceMap.get(cod) || []), ...ids])
    }
    return [...avanceMap.entries()].map(([cod_venta, detalle_ids]) => ({ cod_venta, detalle_ids }))
  }

  // Corrige un pedido planificado por error o en pruebas: lo quita del lote donde quedó
  // (solo si ese lote sigue en fase de Creación) y deja los muebles libres para volver a planificar.
  const liberarMuebleDeOtroLote = async (index: number) => {
    const mueble = itemsConfigVenta[index]
    if (!mueble.bloqueadoLote || !ventaEnConfiguracion) return
    const { fecha: fechaOtro, lote: loteOtro } = mueble.bloqueadoLote
    const codVenta = String(ventaEnConfiguracion.cod_venta)

    if (!confirm(`Se quitará de "${loteOtro}" (${fechaOtro}) el trabajo de la Venta #${codVenta} que incluye este mueble (y los demás muebles de ese mismo trabajo). Úsalo solo si todavía no se ejecutó. ¿Continuar?`)) return

    setProcesandoPlan(true)
    try {
      const { data: loteDb, error } = await supabase
        .from('lotes_produccion')
        .select('id, estado_workflow, materiales_planificados')
        .eq('fecha', fechaOtro)
        .eq('nombre_lote', loteOtro)
        .maybeSingle()
      if (error) throw error
      if (!loteDb) { alert('No se encontró ese lote en Supabase.'); return }
      if (loteDb.estado_workflow !== 'creado') {
        alert(`Ese lote ya avanzó (estado: ${loteDb.estado_workflow}) y se está trabajando en Presupuestos, por eso no se puede quitar desde aquí.`)
        return
      }

      const itemsLote: any[] = loteDb.materiales_planificados || []
      const itemQuitado = itemsLote.find(i =>
        i.tipo_origen === 'venta' && String(i.referencia_id) === codVenta &&
        (i.detalles || []).some((d: any) => d.id === mueble.detalle_id))
      const restantes = itemsLote.filter(i => i !== itemQuitado)
      if (!itemQuitado) { alert('Ese mueble ya no figura en ese lote.'); return }

      const cambios: Record<string, any> = { materiales_planificados: restantes, updated_at: new Date().toISOString() }
      const nuevoAvance = construirAvanceVentas(restantes)
      if (avanceDisponible) cambios.avance_ventas = nuevoAvance

      const { error: errUpd } = await supabase.from('lotes_produccion').update(cambios).eq('id', loteDb.id)
      if (errUpd) throw errUpd

      // Desbloquea en pantalla los muebles que venían de ese trabajo y refresca la lista de lotes
      const idsLiberados = (itemQuitado.detalles || []).map((d: any) => d.id)
      setItemsConfigVenta(prev => prev.map(m => (
        m.bloqueadoLote && m.bloqueadoLote.fecha === fechaOtro && m.bloqueadoLote.lote === loteOtro && idsLiberados.includes(m.detalle_id)
          ? { ...m, bloqueadoEn: undefined, bloqueadoLote: undefined, incluir: true }
          : m
      )))
      setLotesGuardados(prev => prev.map(l => l.id === loteDb.id ? { ...l, avance_ventas: nuevoAvance } : l))
      cargarListaDeLotes()
      cargarPedidosPendientes()
      alert('Listo: el trabajo se quitó de ese lote. Si estás viendo ese lote en esta pantalla, vuelve a abrirlo desde "Abrir lote existente" para ver el cambio.')
    } catch (err: any) {
      console.error(err)
      alert('No se pudo quitar del lote: ' + (err?.message || 'revisa la consola.'))
    } finally {
      setProcesandoPlan(false)
    }
  }

  const toggleIncluirItemConfig = (index: number) => {
    const actualizado = [...itemsConfigVenta]
    if (actualizado[index].bloqueadoEn) return
    actualizado[index] = { ...actualizado[index], incluir: !actualizado[index].incluir }
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

  const actualizarPiezaManualItem = (itemIndex: number, piezaIndex: number, campo: keyof PiezaDesglose, valor: string) => {
    const actualizado = [...itemsConfigVenta]
    const piezaActual = aplicarCambioPieza(actualizado[itemIndex].piezasManuales[piezaIndex], campo, valor, catalogoMelaminas)
    actualizado[itemIndex].piezasManuales[piezaIndex] = piezaActual
    setItemsConfigVenta(actualizado)
  }

  const eliminarPiezaManualItem = (itemIndex: number, piezaIndex: number) => {
    const actualizado = [...itemsConfigVenta]
    actualizado[itemIndex].piezasManuales.splice(piezaIndex, 1)
    setItemsConfigVenta(actualizado)
  }

  const actualizarPiezaItemPlanificado = (idTemp: string, piezaIdx: number, campo: keyof PiezaDesglose, valor: string) => {
    setItemsPlanificados(prev => prev.map(item => {
      if (item.id_temp !== idTemp) return item
      const nuevasPiezas = [...item.piezas_desglose]
      nuevasPiezas[piezaIdx] = aplicarCambioPieza(nuevasPiezas[piezaIdx], campo, valor, catalogoMelaminas)
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
      const itemsIncluidos = itemsConfigVenta.filter(i => i.incluir)
      if (itemsIncluidos.length === 0) {
        alert('Marca al menos un mueble para incluir en este lote.')
        return
      }

      let piezasDesgloseVenta: PiezaDesglose[] = []

      for (const itemConf of itemsIncluidos) {
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
            const [m, a, ac, i] = await Promise.all([
              supabase.from('variante_melamina').select('*').eq('variante_id', vId),
              supabase.from('variante_acero').select('*').eq('variante_id', vId),
              supabase.from('variante_accesorios').select('*').eq('variante_id', vId),
              supabase.from('variante_insumos').select('*').eq('variante_id', vId)
            ])

            piezasDesgloseVenta = [
              ...piezasDesgloseVenta,
              ...piezasDesdeVariante(
                { m: m.data, a: a.data, ac: ac.data, i: i.data },
                mult, catalogoMelaminas, vId
              )
            ]
          }
        }
      }

      setItemsPlanificados(prev => [...prev, {
        id_temp: Math.random().toString(36).substr(2, 9),
        tipo_origen: 'venta',
        referencia_id: ventaEnConfiguracion.cod_venta,
        titulo: `Venta #${ventaEnConfiguracion.cod_venta} (Entrega: ${ventaEnConfiguracion.fecha_entrega})${itemsIncluidos.length < itemsConfigVenta.length ? ` · ${itemsIncluidos.map(i => i.nombre_producto).join(', ')}` : ''}`,
        cliente_o_destino: ventaEnConfiguracion.cliente_nombre,
        cantidad: 1,
        taller_destino: tallerSeleccionado,
        detalles: itemsIncluidos.map(i => i.detalle).filter(Boolean),
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

    if (itemsPlanificados.length === 0) {
      if (!loteIdActual) {
        alert('No hay nada que guardar: el lote está vacío y todavía no existe en Supabase.')
        return
      }
      if (!confirm('El lote quedará vacío: se quitará de Supabase todo lo que tenía planificado y esos pedidos quedarán libres para volver a planificarse. ¿Continuar?')) return
    }

    const costoTotalLote = itemsPlanificados.reduce((acc, item) => {
      const piezas = (item.piezas_desglose || []).filter(p => p.tipo !== 'Unión')
      const subtotalItem = piezas.reduce((sum, p) => sum + ((Number(p.cantidad) || 1) * (Number(p.costo_unitario) || 0)), 0)
      return acc + subtotalItem
    }, 0)

    // Lo que se envía a Presupuestos: piezas con sus valores reales de variante y,
    // además, los materiales ya separados (tubos con barras calculadas, melaminas,
    // accesorios e insumos). Se recalcula siempre desde las piezas para no desfasarse.
    const itemsParaGuardar = itemsPlanificados.map(item => {
      const piezasSinUniones = (item.piezas_desglose || []).filter(p => p.tipo !== 'Unión')
      return { ...item, piezas_desglose: piezasSinUniones, materiales: agruparMateriales(piezasSinUniones) }
    })

    setProcesandoPlan(true)
    try {
      const { data: existing } = await supabase
        .from('lotes_produccion')
        .select('id, estado_workflow')
        .eq('fecha', fechaLote)
        .eq('nombre_lote', nombreLimpio)
        .maybeSingle()

      // Qué muebles de cada pedido quedan planificados en este lote (para controlar el avance por días)
      const avance_ventas = construirAvanceVentas(itemsParaGuardar)

      const escribir = async (extra: Record<string, any>) => {
        if (existing) {
          const { error } = await supabase
            .from('lotes_produccion')
            .update({
              estado_workflow: existing.estado_workflow || 'creado',
              materiales_planificados: itemsParaGuardar,
              updated_at: new Date().toISOString(),
              ...extra
            })
            .eq('id', existing.id)
          return { error, id: existing.id as number | null }
        }
        const { data: inserted, error } = await supabase
          .from('lotes_produccion')
          .insert({
            fecha: fechaLote,
            nombre_lote: nombreLimpio,
            estado_workflow: 'creado',
            materiales_planificados: itemsParaGuardar,
            updated_at: new Date().toISOString(),
            ...extra
          })
          .select('id')
          .single()
        return { error, id: (inserted?.id ?? null) as number | null }
      }

      let resultado = await escribir({ avance_ventas })
      if (resultado.error && (resultado.error.code === '42703' || (resultado.error.message || '').includes('avance_ventas'))) {
        setAvanceDisponible(false) // falta el SQL: se guarda igual, sin el control de avance
        resultado = await escribir({})
      }
      if (resultado.error) throw resultado.error
      const idResultante = resultado.id
      setLoteIdActual(idResultante)
      cargarListaDeLotes()
      cargarPedidosPendientes()
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
            <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold' }}>Abrir lote existente:</label>
            <div style={{ display: 'flex', gap: '4px', alignItems: 'center', marginTop: '4px' }}>
              <select
                value={String(lotesGuardados.find(l => l.fecha === fechaLote && l.nombre_lote === nombreLote.trim())?.id ?? '')}
                onFocus={cargarListaDeLotes}
                onChange={(e) => {
                  const sel = lotesGuardados.find(l => String(l.id) === e.target.value)
                  if (sel) { setFechaLote(sel.fecha); setNombreLote(sel.nombre_lote) }
                }}
                style={{ padding: '6px', borderRadius: '4px', border: '1px solid #ccc', width: '260px' }}
              >
                <option value="">{lotesGuardados.length === 0 ? '-- Sin lotes guardados --' : '-- Seleccionar de Supabase --'}</option>
                {lotesGuardados.map(l => (
                  <option key={l.id} value={String(l.id)}>
                    {l.fecha} · {l.nombre_lote} ({l.estado_workflow})
                  </option>
                ))}
              </select>
              <button type="button" onClick={cargarListaDeLotes} title="Actualizar lista de lotes"
                style={{ padding: '6px 8px', borderRadius: '6px', border: 'none', cursor: 'pointer', backgroundColor: '#C5A059', color: '#0B1E36', fontWeight: 'bold' }}>
                ↻
              </button>
            </div>
            {errorLotes && <p style={{ margin: '4px 0 0', fontSize: '10px', color: '#ef4444' }}>{errorLotes}</p>}
          </div>
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
                  {(() => {
                    const mapa = mapaAvance()
                    const hoy = new Date().toISOString().split('T')[0]
                    const pendientes = pedidosPendientesGlobal
                      .map(v => ({ v, ...progresoVenta(v, mapa) }))
                      .filter(x => x.total > 0 && x.hechos < x.total)
                    return (
                      <div style={{ marginBottom: '15px', border: '1px solid #fcd34d', background: '#fffbeb', borderRadius: '6px' }}>
                        <div onClick={() => setMostrarPendientes(!mostrarPendientes)} style={{ cursor: 'pointer', padding: '8px 10px', fontSize: '12px', fontWeight: 'bold', color: '#92400e', display: 'flex', justifyContent: 'space-between' }}>
                          <span>⚠️ Pedidos pendientes de planificar ({pendientes.length})</span>
                          <span>{mostrarPendientes ? '▲' : '▼'}</span>
                        </div>
                        {mostrarPendientes && (
                          <div style={{ padding: '0 10px 10px', maxHeight: '220px', overflowY: 'auto' }}>
                            {!avanceDisponible && (
                              <p style={{ fontSize: '10px', color: '#b91c1c', margin: '0 0 6px' }}>
                                Falta correr el SQL de avance por mueble en Supabase: sin él, solo se controla lo que está en este lote.
                              </p>
                            )}
                            {pendientes.length === 0 && <p style={{ fontSize: '11px', color: '#888', margin: 0 }}>No hay muebles pendientes de planificar.</p>}
                            {pendientes.map(({ v, total, hechos }) => {
                              const vencido = v.fecha_entrega < hoy
                              return (
                                <div key={v.cod_venta} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', padding: '6px 0', borderTop: '1px solid #fde68a' }}>
                                  <div style={{ fontSize: '11px' }}>
                                    <strong>#{v.cod_venta} - {v.cliente_nombre}</strong>
                                    <div style={{ color: vencido ? '#dc2626' : '#666', fontWeight: vencido ? 'bold' : 'normal' }}>
                                      Entrega: {v.fecha_entrega}{vencido ? ' (vencido)' : ''} · 🪑 {hechos} de {total} planificados
                                    </div>
                                  </div>
                                  <button disabled={procesandoPlan} onClick={() => abrirConfiguracionVenta(v)} style={{ background: '#C5A059', color: '#0B1E36', border: 'none', padding: '4px 8px', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', fontSize: '11px', flexShrink: 0 }}>
                                    Planificar
                                  </button>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })()}

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

                  {(() => {
                    const mapa = mapaAvance()
                    return pedidosVenta.map(v => {
                      const { total, hechos } = progresoVenta(v, mapa)
                      const completo = total > 0 && hechos >= total
                      return (
                        <div key={v.cod_venta} style={{ border: '1px solid #eee', background: completo ? '#f0fdf4' : 'white', padding: '10px', borderRadius: '6px', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <strong>#{v.cod_venta} - {v.cliente_nombre}</strong>
                            <div style={{ fontSize: '11px', color: '#666' }}>Estado: {v.estado === 1 ? '⏳ Pendiente' : '🛠️ En Fabricación'}</div>
                            {total > 0 && (
                              <div style={{ fontSize: '11px', fontWeight: 'bold', color: completo ? '#16a34a' : hechos > 0 ? '#d97706' : '#888' }}>
                                {completo ? '✅ Todos los muebles planificados' : `🪑 ${hechos} de ${total} muebles planificados`}
                              </div>
                            )}
                          </div>
                          <button disabled={procesandoPlan} onClick={() => abrirConfiguracionVenta(v)} style={{ background: completo ? '#e0e7ff' : '#C5A059', color: '#0B1E36', border: 'none', padding: '5px 10px', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', fontSize: '12px' }}>
                            {completo ? '↩ Revisar / quitar' : hechos > 0 ? '+ Añadir resto' : '+ Añadir'}
                          </button>
                        </div>
                      )
                    })
                  })()}
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
                <p style={{ color: '#888', fontSize: '13px' }}>
                  Aún no hay elementos agregados al lote.
                  {loteIdActual ? ' Este lote existe en Supabase: si quitaste items, presiona "Guardar lote vacío" para que los pedidos queden libres.' : ''}
                </p>
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
                                      <th style={{ padding: '4px 6px' }}>Código / Medida</th>
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
                                            {pieza.tipo === 'Unión' && <option value="Unión">Unión (no se envía)</option>}
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
                                          ) : pieza.tipo === 'Unión' ? (
                                            <span style={{ fontSize: '10px', color: '#888', fontStyle: 'italic' }}>N/A</span>
                                          ) : (
                                            <div style={{ display: 'flex', gap: '3px' }}>
                                              <input
                                                type="text"
                                                value={pieza.codigo || ''}
                                                onChange={e => actualizarPiezaItemPlanificado(item.id_temp, pIdx, 'codigo', e.target.value)}
                                                placeholder="Código"
                                                style={{ width: '100%', fontSize: '10px', padding: '2px 4px', borderRadius: '4px', border: '1px solid #ccc', backgroundColor: '#ffffff', color: '#000000' }}
                                              />
                                              {pieza.tipo === 'Acero' && (
                                                <input
                                                  type="number"
                                                  value={pieza.longitud_cm ?? 0}
                                                  onChange={e => actualizarPiezaItemPlanificado(item.id_temp, pIdx, 'longitud_cm', e.target.value)}
                                                  title="Longitud del corte en cm"
                                                  placeholder="cm"
                                                  style={{ width: '46px', fontSize: '10px', padding: '2px 4px', borderRadius: '4px', border: '1px solid #ccc', backgroundColor: '#ffffff', color: '#000000' }}
                                                />
                                              )}
                                            </div>
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

                            {(() => {
                              const resumen = agruparMateriales(item.piezas_desglose || [])
                              if (resumen.aceros.length === 0) return null
                              return (
                                <div style={{ marginTop: '8px', padding: '6px 8px', background: '#eef2f7', borderRadius: '4px', fontSize: '10px', color: '#0B1E36' }}>
                                  <strong>🔩 Tubos a utilizar (barras de {LONGITUD_BARRA_CM}cm):</strong>
                                  {resumen.aceros.map((g, gi) => (
                                    <div key={gi} style={{ marginTop: '2px' }}>
                                      {g.codigo_acero || g.descripcion}: {g.cortes.map(c => `${c.cantidad}×${c.longitud_cm}cm`).join(' + ')} = {g.total_cm}cm → <strong>{g.barras_necesarias} barra(s)</strong>
                                    </div>
                                  ))}
                                </div>
                              )
                            })()}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
              {(itemsPlanificados.length > 0 || loteIdActual) && (
                <button onClick={guardarLoteEnSupabase} disabled={procesandoPlan} style={{ width: '100%', background: itemsPlanificados.length === 0 ? '#dc2626' : '#16a34a', color: 'white', border: 'none', padding: '10px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', marginTop: '15px' }}>
                  {itemsPlanificados.length === 0 ? '💾 Guardar lote vacío (quita lo planificado en Supabase)' : '💾 Sincronizar Lote en Base de Datos'}
                </button>
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
              Cliente: <strong>{ventaEnConfiguracion.cliente_nombre}</strong>. Marca los muebles que se fabrican en este lote (el resto queda pendiente para otro día), y selecciona una variante o registra las piezas manualmente.
            </p>

            {itemsConfigVenta.map((item, idx) => (
              <div key={idx} style={{ background: '#f8fafc', padding: '14px', borderRadius: '8px', marginBottom: '14px', border: '1px solid #e2e8f0', opacity: item.incluir ? 1 : 0.55 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', fontWeight: 'bold', marginBottom: '8px', color: item.bloqueadoEn ? '#9ca3af' : '#0B1E36', cursor: item.bloqueadoEn ? 'not-allowed' : 'pointer' }}>
                  <input type="checkbox" checked={item.incluir} disabled={!!item.bloqueadoEn} onChange={() => toggleIncluirItemConfig(idx)} />
                  {item.bloqueadoEn ? `Ya planificado: ${item.bloqueadoEn}` : 'Incluir este mueble en este lote'}
                </label>
                {item.bloqueadoLote && (
                  <button
                    onClick={() => liberarMuebleDeOtroLote(idx)}
                    disabled={procesandoPlan}
                    style={{ marginBottom: '8px', background: '#fff1f2', color: '#b91c1c', border: '1px solid #fecdd3', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}
                  >
                    ↩ Quitar de ese lote (si fue una prueba o error)
                  </button>
                )}
                {item.bloqueadoEn === 'ya está en este lote' && (
                  <p style={{ margin: '0 0 8px', fontSize: '11px', color: '#6b7280' }}>
                    Para quitarlo: cierra esta ventana, presiona ✕ en el item de la lista del lote y luego "Guardar".
                  </p>
                )}
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
                          <div style={{ display: 'flex', gap: '3px' }}>
                            <input
                              type="text"
                              placeholder="Código"
                              value={pieza.codigo || ''}
                              onChange={e => actualizarPiezaManualItem(idx, pIdx, 'codigo', e.target.value)}
                              style={{ width: '100%', padding: '4px', fontSize: '10px', borderRadius: '4px', border: '1px solid #ccc', backgroundColor: '#ffffff', color: '#000000' }}
                            />
                            {pieza.tipo === 'Acero' && (
                              <input
                                type="number"
                                placeholder="cm"
                                title="Longitud del corte en cm"
                                value={pieza.longitud_cm ?? 0}
                                onChange={e => actualizarPiezaManualItem(idx, pIdx, 'longitud_cm', e.target.value)}
                                style={{ width: '46px', padding: '4px', fontSize: '10px', borderRadius: '4px', border: '1px solid #ccc', backgroundColor: '#ffffff', color: '#000000' }}
                              />
                            )}
                          </div>
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
                disabled={procesandoPlan || itemsConfigVenta.every(i => !i.incluir)}
                style={{ flex: 2, background: '#0B1E36', color: '#C5A059', border: 'none', padding: '10px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}
              >
                Confirmar y Añadir al Lote ({itemsConfigVenta.filter(i => i.incluir).length} de {itemsConfigVenta.length} muebles)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}