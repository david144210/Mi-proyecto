'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

// ── Tipos ─────────────────────────────────────────────────────
interface DetalleVenta {
  id: number
  cod_producto: string
  cantidad: number
  color_estructura: string
  color_melamina: string
  producto_nombre?: string
  variante_id?: number
}

interface Pedido {
  id: number
  cod_venta: number
  cliente: string
  fecha_entrega: string
  estado: number
  taller_destino?: string
  detalles: DetalleVenta[]
}

interface MaterialPresupuesto {
  id_fila: string
  cod_venta: number 
  codigo: string
  detalle: string
  cantidadReq: number
  stockActual: number
  cantidadComprar: number
  precioUnitario: number
  gastoReal: number
  tipo: 'variante' | 'manual'
  taller_destino?: string
  id_planificado?: string // Identificador para rastrear de qué item planificado proviene
}

type EstadoWorkflow = 'creado' | 'revision_taller' | 'en_compras' | 'aprobado'

// Longitud comercial fija de todo tubo/perfil de acero (cm)
const LONGITUD_BARRA_CM = 600
// Las filas generadas automáticamente desde Planificación llevan este prefijo en id_planificado
const PREFIJO_AUTO = 'AUTO|'

interface RequerimientoPlanificado {
  tipo: 'acero' | 'melamina' | 'accesorio' | 'insumo'
  taller: string
  codigo: string
  descripcion: string
  cantidad: number   // acero: barras comerciales; melamina: piezas; accesorio/insumo: unidades
  totalCm?: number   // solo acero
  sinMedida?: number // acero: piezas sin longitud registrada (lotes viejos)
  largo?: number     // solo melamina
  ancho?: number     // solo melamina
}

// Suma TODO lo planificado del lote por taller:
//  - Tubos: suma los cortes de un mismo código (de todos los items) y calcula barras = ceil(cm_totales / 600)
//  - Melaminas: suma piezas iguales (mismo código y mismas medidas)
//  - Accesorios e insumos: suma por código
// Las uniones se ignoran: son un costo por punto del cotizador, no un material.
const consolidarPiezasPlanificadas = (planificados: any[]): RequerimientoPlanificado[] => {
  const mapa = new Map<string, RequerimientoPlanificado>()

  for (const item of planificados || []) {
    const taller = item.taller_destino || 'SIN-TALLER'
    for (const p of item.piezas_desglose || []) {
      const cant = Number(p.cantidad) || 0
      if (cant <= 0) continue

      if (p.tipo === 'Acero') {
        const codigo = p.codigo_acero || p.codigo || p.descripcion || 'SIN-CODIGO'
        const key = `acero|${taller}|${codigo}`
        const largo = Number(p.longitud_cm ?? p.largo_cm) || 0
        const g = mapa.get(key) || { tipo: 'acero' as const, taller, codigo, descripcion: p.descripcion || codigo, cantidad: 0, totalCm: 0, sinMedida: 0 }
        if (largo > 0) g.totalCm = (g.totalCm || 0) + largo * cant
        else g.sinMedida = (g.sinMedida || 0) + cant
        mapa.set(key, g)
      } else if (p.tipo === 'Melamina') {
        const codigo = p.codigo_melamina || p.color || p.codigo || p.descripcion || 'SIN-CODIGO'
        const largo = Number(p.largo_cm) || 0
        const ancho = Number(p.ancho_cm) || 0
        const key = `melamina|${taller}|${codigo}|${largo}|${ancho}`
        const g = mapa.get(key) || { tipo: 'melamina' as const, taller, codigo, descripcion: p.descripcion || codigo, cantidad: 0, largo, ancho }
        g.cantidad += cant
        mapa.set(key, g)
      } else if (p.tipo === 'Accesorio' || p.tipo === 'Insumo') {
        const tipo = p.tipo === 'Accesorio' ? 'accesorio' as const : 'insumo' as const
        const codigo = (tipo === 'accesorio' ? p.codigo_accesorio : p.codigo_insumo) || p.codigo || p.descripcion || 'SIN-CODIGO'
        const key = `${tipo}|${taller}|${codigo}`
        const g = mapa.get(key) || { tipo, taller, codigo, descripcion: p.descripcion || codigo, cantidad: 0 }
        g.cantidad += cant
        mapa.set(key, g)
      }
    }
  }

  const orden = { acero: 0, melamina: 1, accesorio: 2, insumo: 3 }
  const lista = [...mapa.values()]
  for (const g of lista) {
    if (g.tipo === 'acero') {
      const barras = (g.totalCm || 0) > 0 ? Math.ceil((g.totalCm || 0) / LONGITUD_BARRA_CM - 1e-9) : 0
      g.cantidad = barras + (g.sinMedida || 0)
    }
  }
  return lista.sort((a, b) => a.taller.localeCompare(b.taller) || orden[a.tipo] - orden[b.tipo] || a.codigo.localeCompare(b.codigo))
}

// ── Página ────────────────────────────────────────────────────
export default function GestorPresupuestosWorkflow() {
  const [usuario, setUsuario] = useState<any>(null)
  const [fecha, setFecha] = useState(() => new Date().toISOString().split('T')[0])
  const [nombreLote, setNombreLote] = useState('Lote Mañana')
  const [loading, setLoading] = useState(true)
  const [sincronizando, setSincronizando] = useState(false)
  const [lotesGuardados, setLotesGuardados] = useState<any[]>([])
  const [errorLotes, setErrorLotes] = useState('')

  const [estadoWorkflow, setEstadoWorkflow] = useState<EstadoWorkflow>('creado')

  const [pedidosSeleccionados, setPedidosSeleccionados] = useState<Pedido[]>([])
  const [materialesLote, setMaterialesLote] = useState<MaterialPresupuesto[]>([])
  // Materiales/piezas armados en la pantalla de Planificación para este mismo lote
  const [materialesPlanificados, setMaterialesPlanificados] = useState<any[]>([])
  const [itemsPlanificadosExpandidos, setItemsPlanificadosExpandidos] = useState<Record<string, boolean>>({})

  const [talleresDisponibles, setTalleresDisponibles] = useState<string[]>([])
  const [tallerFiltroActivo, setTallerFiltroActivo] = useState<string>('')
  const [tallerAsignacionTemp, setTallerAsignacionTemp] = useState<string>('')
  useEffect(() => {
    if (tallerFiltroActivo) setTallerAsignacionTemp(tallerFiltroActivo)
  }, [tallerFiltroActivo])

  // Catálogo y adición manual
  const [manualTipo, setManualTipo] = useState<'acero' | 'melamina' | 'accesorio' | 'insumo'>('acero')
  const [catalogoItems, setCatalogoItems] = useState<any[]>([])
  const [manualCodigoSeleccionado, setManualCodigoSeleccionado] = useState('')
  const [manualDetalle, setManualDetalle] = useState('')
  const [manualCantidad, setManualCantidad] = useState('')
  const [manualPrecio, setManualPrecio] = useState('')

  // Selección de variantes

  useEffect(() => {
    const carnetGuardado = localStorage.getItem('carnet')
    if (!carnetGuardado) {
      window.location.replace('/')
      return
    }

    const inicializarDatos = async () => {
      const { data: sucData } = await supabase.from('sucursales').select('nombre')
      if (sucData && sucData.length > 0) {
        const nombres = sucData.map(s => s.nombre)
        setTalleresDisponibles(nombres)
        setTallerAsignacionTemp(nombres[0])
        setTallerFiltroActivo(nombres[0])
      }

      const { data: userData } = await supabase
        .from('personal')
        .select('*, cargos(*)')
        .eq('carnet', carnetGuardado)
        .eq('estado', true)
        .single()

      if (!userData) {
        window.location.replace('/')
        return
      }
      setUsuario(userData)
    }

    inicializarDatos()
  }, [])

  useEffect(() => {
    if (usuario && talleresDisponibles.length > 0) {
      cargarDatosLoteYPedidos()
    }
  }, [fecha, nombreLote, usuario, talleresDisponibles])

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
        setFecha(data.fecha)
        setNombreLote(data.nombre_lote)
      }
      setAutoDeteccionHecha(true)
    }
    detectarLoteActivo()
  }, [usuario])

  // Lista de todos los lotes guardados en Supabase (de cualquier fecha y estado).
  // Se vuelve a leer al abrir el selector para ver lo que otros usuarios crearon después.
  const cargarListaDeLotes = async () => {
    const { data, error } = await supabase
      .from('lotes_produccion')
      .select('id, fecha, nombre_lote, estado_workflow, updated_at')
      .order('fecha', { ascending: false })
      .order('updated_at', { ascending: false })
      .limit(300)
    if (error) {
      console.error('No se pudo leer la lista de lotes:', error.message)
      setErrorLotes('No se pudo leer la lista de lotes: ' + error.message)
      return
    }
    setErrorLotes('')
    setLotesGuardados(data || [])
  }

  useEffect(() => {
    if (!usuario) return
    cargarListaDeLotes()
  }, [usuario])

  useEffect(() => {
    const cargarCatalogo = async () => {
      let tabla = ''
      let colCodigo = ''
      if (manualTipo === 'acero') { tabla = 'aceros'; colCodigo = 'codigo_acero'; }
      else if (manualTipo === 'melamina') { tabla = 'melaminas'; colCodigo = 'codigo_melamina'; }
      else if (manualTipo === 'accesorio') { tabla = 'accesorios'; colCodigo = 'codigo_accesorio'; }
      else if (manualTipo === 'insumo') { tabla = 'insumos'; colCodigo = 'codigo_insumos'; }

      const { data } = await supabase.from(tabla).select('*')
      if (data) {
        setCatalogoItems(data.map(item => ({
          codigo: item[colCodigo],
          detalle: item.detalle || item.descripcion || item.tipo || item[colCodigo],
          precio_compra: item.precio_compra || item.precio || 0,
          precio_cotizador: item.precio_cotizador || 0
        })))
      } else {
        setCatalogoItems([])
      }
      setManualCodigoSeleccionado('')
      setManualDetalle('')
      setManualPrecio('')
    }
    cargarCatalogo()
  }, [manualTipo])

  const descontarStockAlmacenes = async () => {
    try {
      for (const m of materialesLote) {
        const { data: sucData } = await supabase
          .from('sucursales')
          .select('id')
          .eq('nombre', m.taller_destino || talleresDisponibles[0])
          .maybeSingle()

        if (!sucData) continue
        const sucursalId = sucData.id

        if (m.detalle.startsWith('[Melamina]')) {
          let cantidadADescontar = m.stockActual
          if (cantidadADescontar > 0) {
            const matchMedidas = m.detalle.match(/Medidas:\s*([\d.]+)\s*x\s*([\d.]+)\s*cm/)
            if (matchMedidas) {
              const largoReq = parseFloat(matchMedidas[1])
              const anchoReq = parseFloat(matchMedidas[2])

              const { data: retazos } = await supabase
                .from('retazos_melaminas')
                .select('id, cantidad')
                .eq('sucursal_id', sucursalId)
                .eq('codigo_melamina', m.codigo)
                .gte('largo_cm', largoReq)
                .gte('ancho_cm', anchoReq)
                .order('largo_cm', { ascending: true })

              if (retazos) {
                let restanteADescontar = cantidadADescontar
                for (const ret of retazos) {
                  if (restanteADescontar <= 0) break
                  const tomar = Math.min(ret.cantidad, restanteADescontar)
                  const nuevaCantidad = ret.cantidad - tomar
                  restanteADescontar -= tomar

                  if (nuevaCantidad <= 0) {
                    await supabase.from('retazos_melaminas').delete().eq('id', ret.id)
                  } else {
                    await supabase.from('retazos_melaminas').update({ cantidad: nuevaCantidad }).eq('id', ret.id)
                  }
                }
              }
            }
          }
        } else {
          const cantidadADescontar = m.stockActual
          if (cantidadADescontar <= 0) continue

          const tablasStock = [
            { tabla: 'stock_accesorios', col: 'codigo_accesorio' },
            { tabla: 'stock_aceros', col: 'codigo_acero' },
            { tabla: 'stock_insumos', col: 'codigo_insumos' }
          ]

          for (const t of tablasStock) {
            const { data: registro } = await supabase
              .from(t.tabla)
              .select('id, cantidad')
              .eq('sucursal_id', sucursalId)
              .eq(t.col, m.codigo)
              .maybeSingle()

            if (registro) {
              const nuevaCantidad = Math.max(0, Number(registro.cantidad) - Number(cantidadADescontar))
              await supabase
                .from(t.tabla)
                .update({ cantidad: nuevaCantidad })
                .eq('id', registro.id)
              break
            }
          }
        }
      }
    } catch (error) {
      console.error('Error al descontar stock de almacenes:', error)
    }
  }

  // Construye la lista de materiales del lote DIRECTAMENTE desde lo planificado
  // (que a su vez sale de las variantes seleccionadas): tubos, melaminas, accesorios
  // e insumos ya sumados, con precio de catálogo y stock sugerido del almacén del taller.
  // Conserva lo que el usuario ya editó (stock, precio) y las filas manuales/de pedidos.
  const sincronizarDesdePlanificados = async (
    planificados: any[],
    actuales: MaterialPresupuesto[],
    reiniciarStock = false
  ): Promise<MaterialPresupuesto[]> => {
    const requeridos = consolidarPiezasPlanificadas(planificados)
    // Se descartan filas auto previas y las del antiguo flujo "Incorporar" (id_planificado con id de item)
    const filasManualesYPedidos = actuales.filter(m => !m.id_planificado)
    if (requeridos.length === 0) return filasManualesYPedidos

    const previos = new Map<string, MaterialPresupuesto>()
    actuales.forEach(m => { if (m.id_planificado?.startsWith(PREFIJO_AUTO)) previos.set(m.id_planificado, m) })

    const codigosDe = (t: string) => [...new Set(requeridos.filter(r => r.tipo === t).map(r => r.codigo))]
    const consulta = (tabla: string, cols: string, col: string, codigos: string[]): any =>
      codigos.length > 0 ? supabase.from(tabla).select(cols).in(col, codigos) : Promise.resolve({ data: [] as any[] })

    const [cA, cM, cAc, cI, sucs] = await Promise.all([
      consulta('aceros', 'codigo_acero, detalle, precio_compra', 'codigo_acero', codigosDe('acero')),
      consulta('melaminas', 'codigo_melamina, detalle, precio_cotizador', 'codigo_melamina', codigosDe('melamina')),
      consulta('accesorios', 'codigo_accesorio, detalle, precio_compra', 'codigo_accesorio', codigosDe('accesorio')),
      consulta('insumos', 'codigo_insumos, detalle, precio_compra', 'codigo_insumos', codigosDe('insumo')),
      supabase.from('sucursales').select('id, nombre')
    ])

    const catAcero = new Map<string, any>((cA.data || []).map((x: any) => [x.codigo_acero, x]))
    const catMel = new Map<string, any>((cM.data || []).map((x: any) => [x.codigo_melamina, x]))
    const catAcc = new Map<string, any>((cAc.data || []).map((x: any) => [x.codigo_accesorio, x]))
    const catIns = new Map<string, any>((cI.data || []).map((x: any) => [x.codigo_insumos, x]))
    const sucPorNombre = new Map<string, number>((sucs.data || []).map((x: any) => [x.nombre, x.id]))

    const stockSugerido = async (r: RequerimientoPlanificado): Promise<number> => {
      const sucId = sucPorNombre.get(r.taller)
      if (!sucId) return 0
      if (r.tipo === 'melamina') {
        const { data: retazos } = await supabase
          .from('retazos_melaminas')
          .select('cantidad')
          .eq('sucursal_id', sucId)
          .eq('codigo_melamina', r.codigo)
          .gte('largo_cm', r.largo || 0)
          .gte('ancho_cm', r.ancho || 0)
          .order('largo_cm', { ascending: true })
        let acumulado = 0
        for (const ret of retazos || []) {
          if (acumulado >= r.cantidad) break
          acumulado += Math.min(Number(ret.cantidad) || 0, r.cantidad - acumulado)
        }
        return acumulado
      }
      const cfg = r.tipo === 'acero' ? { t: 'stock_aceros', c: 'codigo_acero' }
        : r.tipo === 'accesorio' ? { t: 'stock_accesorios', c: 'codigo_accesorio' }
        : { t: 'stock_insumos', c: 'codigo_insumos' }
      const { data } = await supabase.from(cfg.t).select('cantidad').eq('sucursal_id', sucId).eq(cfg.c, r.codigo).maybeSingle()
      return Math.min(r.cantidad, Math.max(0, Number(data?.cantidad) || 0))
    }

    const nuevasFilas: MaterialPresupuesto[] = []
    for (const r of requeridos) {
      const idAuto = `${PREFIJO_AUTO}${r.tipo}|${r.taller}|${r.codigo}|${r.largo ?? ''}x${r.ancho ?? ''}`
      const previo = previos.get(idAuto)

      let nombre = r.descripcion
      let precioCalculado = 0
      let detalle = ''
      if (r.tipo === 'acero') {
        const cat = catAcero.get(r.codigo)
        nombre = cat?.detalle || r.descripcion
        precioCalculado = Number(cat?.precio_compra) || 0 // precio por barra completa
        detalle = (r.totalCm || 0) > 0
          ? `[Acero] ${nombre} — ${Number((r.totalCm || 0).toFixed(1))}cm totales → ${Math.ceil((r.totalCm || 0) / LONGITUD_BARRA_CM - 1e-9)} barra(s) de ${LONGITUD_BARRA_CM}cm`
          : `[Acero] ${nombre} — ⚠️ sin medidas en Planificación`
        if ((r.totalCm || 0) > 0 && (r.sinMedida || 0) > 0) detalle += ` (+${r.sinMedida} pza(s) sin medida)`
      } else if (r.tipo === 'melamina') {
        const cat = catMel.get(r.codigo)
        nombre = cat?.detalle || r.descripcion
        precioCalculado = Number((((r.largo || 0) / 100) * ((r.ancho || 0) / 100) * (Number(cat?.precio_cotizador) || 0)).toFixed(2))
        detalle = `[Melamina] ${nombre} - Medidas: ${r.largo} x ${r.ancho} cm`
      } else if (r.tipo === 'accesorio') {
        const cat = catAcc.get(r.codigo)
        nombre = cat?.detalle || r.descripcion
        precioCalculado = Number(cat?.precio_compra) || 0
        detalle = `[Accesorio] ${nombre}`
      } else {
        const cat = catIns.get(r.codigo)
        nombre = cat?.detalle || r.descripcion
        precioCalculado = Number(cat?.precio_compra) || 0
        detalle = `[Insumo] ${nombre}`
      }

      const stock = previo && !reiniciarStock
        ? Math.min(Number(previo.stockActual) || 0, r.cantidad)
        : await stockSugerido(r)
      const precio = previo ? Number(previo.precioUnitario) : precioCalculado
      const comprar = Math.max(0, Number((r.cantidad - stock).toFixed(2)))

      nuevasFilas.push({
        id_fila: idAuto,
        cod_venta: 0,
        codigo: r.codigo,
        detalle,
        cantidadReq: r.cantidad,
        stockActual: Number(stock.toFixed(2)),
        cantidadComprar: comprar,
        precioUnitario: precio,
        gastoReal: Number((comprar * precio).toFixed(2)),
        tipo: 'variante',
        taller_destino: r.taller,
        id_planificado: idAuto
      })
    }
    return [...filasManualesYPedidos, ...nuevasFilas]
  }

  const recalcularDesdePlanificacion = async (reiniciarStock: boolean) => {
    if (estadoWorkflow !== 'creado') {
      alert('Solo se puede recalcular en fase de Creación.')
      return
    }
    if (reiniciarStock && !confirm('Esto reemplaza el stock de todas las filas planificadas por lo que hay hoy en el almacén de cada taller. ¿Continuar?')) return
    setLoading(true)
    try {
      const { data } = await supabase
        .from('lotes_produccion')
        .select('materiales_planificados')
        .eq('fecha', fecha)
        .eq('nombre_lote', nombreLote.trim())
        .maybeSingle()
      const planificados = data?.materiales_planificados || materialesPlanificados
      setMaterialesPlanificados(planificados)
      const nuevos = await sincronizarDesdePlanificados(planificados, materialesLote, reiniciarStock)
      setMaterialesLote(nuevos)
      await persistirLoteEnBD(estadoWorkflow, pedidosSeleccionados, nuevos, planificados)
    } finally {
      setLoading(false)
    }
  }

  const cargarDatosLoteYPedidos = async () => {
    setLoading(true)
    try {
      const { data: loteData } = await supabase
        .from('lotes_produccion')
        .select('*')
        .eq('fecha', fecha)
        .eq('nombre_lote', nombreLote.trim())
        .maybeSingle()

      let estadoActual: EstadoWorkflow = 'creado'
      let seleccionados: Pedido[] = []
      let materialesGuardados: MaterialPresupuesto[] = []
      let planificadosGuardados: any[] = []

      if (loteData) {
        estadoActual = loteData.estado_workflow as EstadoWorkflow
        seleccionados = ((loteData.pedidos_seleccionados || []) as any[]).filter(
          (p) => p && typeof p.cod_venta !== 'undefined'
        )
        materialesGuardados = loteData.materiales || []
        planificadosGuardados = loteData.materiales_planificados || []
      }

      setEstadoWorkflow(estadoActual)
      setPedidosSeleccionados(seleccionados)
      setMaterialesLote(materialesGuardados)
      setMaterialesPlanificados(planificadosGuardados)

      // Lo planificado aparece directo en la lista de materiales (solo en fase de Creación,
      // después las filas quedan congeladas con lo que se editó en cada fase).
      if (estadoActual === 'creado' && (planificadosGuardados.length > 0 || materialesGuardados.some((m: any) => m.id_planificado))) {
        const materialesSync = await sincronizarDesdePlanificados(planificadosGuardados, materialesGuardados)
        setMaterialesLote(materialesSync)
        if (JSON.stringify(materialesSync) !== JSON.stringify(materialesGuardados)) {
          await persistirLoteEnBD(estadoActual, seleccionados, materialesSync, planificadosGuardados)
        }
      }

    } catch (error) {
      console.error(error)
      alert('Error cargando el lote multi-usuario')
    } finally {
      setLoading(false)
    }
  }

  const persistirLoteEnBD = async (nuevoEstado: EstadoWorkflow, nuevosPedidos: Pedido[], nuevosMateriales: MaterialPresupuesto[], nuevosPlanificados?: any[]) => {
    setSincronizando(true)
    try {
      const planificadosAGUARDAR = nuevosPlanificados !== undefined ? nuevosPlanificados : materialesPlanificados
      const { error } = await supabase
        .from('lotes_produccion')
        .upsert({
          fecha,
          nombre_lote: nombreLote.trim(),
          estado_workflow: nuevoEstado,
          pedidos_seleccionados: nuevosPedidos,
          materiales: nuevosMateriales,
          materiales_planificados: planificadosAGUARDAR,
          updated_at: new Date().toISOString()
        }, { onConflict: 'fecha,nombre_lote' })

      if (error) throw error
    } catch (err) {
      console.error(err)
      alert('Error al sincronizar los cambios con la base de datos.')
    } finally {
      setSincronizando(false)
    }
  }

  const agregarOConsolidarMateriales = async (nuevosMateriales: MaterialPresupuesto[]) => {
    const actualizada = [...materialesLote]
    for (const nuevo of nuevosMateriales) {
      const index = actualizada.findIndex(m => m.codigo === nuevo.codigo && m.detalle === nuevo.detalle && m.taller_destino === nuevo.taller_destino && m.id_planificado === nuevo.id_planificado)
      if (index >= 0) {
        const nuevaReq = Number((actualizada[index].cantidadReq + nuevo.cantidadReq).toFixed(2))
        const stockActual = actualizada[index].stockActual
        const nuevaAComprar = Math.max(0, Number((nuevaReq - stockActual).toFixed(2)))
        const nuevoGasto = Number((nuevaAComprar * actualizada[index].precioUnitario).toFixed(2))
        
        actualizada[index] = {
          ...actualizada[index],
          cantidadReq: nuevaReq,
          cantidadComprar: nuevaAComprar,
          gastoReal: nuevoGasto
        }
      } else {
        actualizada.push(nuevo)
      }
    }
    setMaterialesLote(actualizada)
    await persistirLoteEnBD(estadoWorkflow, pedidosSeleccionados, actualizada, materialesPlanificados)
  }

  const toggleExpandPlanificado = (id_temp: string) => {
    setItemsPlanificadosExpandidos(prev => ({ ...prev, [id_temp]: !prev[id_temp] }))
  }

  const handleSeleccionarItemCatalogo = (codigo: string) => {
    setManualCodigoSeleccionado(codigo)
    const encontrado = catalogoItems.find(i => i.codigo === codigo)
    if (encontrado) {
      setManualDetalle(`[${manualTipo.toUpperCase()}] ${encontrado.detalle}`)
      const precioBase = Number(encontrado.precio_compra || 0)
      const precioFinal = manualTipo === 'acero' ? Number((precioBase / 6).toFixed(2)) : precioBase
      setManualPrecio(precioFinal.toString())
    }
  }

  const agregarPiezaAMedida = async () => {
    if (estadoWorkflow !== 'creado') {
      alert('Solo se pueden agregar materiales manuales en fase de Creación.')
      return
    }
    if (!manualCodigoSeleccionado || !manualCantidad) {
      alert('Selecciona un material del catálogo y completa la cantidad.')
      return
    }
    const cant = parseFloat(manualCantidad) || 0
    const precioUnit = parseFloat(manualPrecio) || 0
    const subtotalEst = Number((cant * precioUnit).toFixed(2))

    await agregarOConsolidarMateriales([{
      id_fila: Math.random().toString(36).substr(2, 9),
      cod_venta: 0,
      codigo: manualCodigoSeleccionado,
      detalle: manualDetalle || `[Manual ${manualTipo}] ${manualCodigoSeleccionado}`,
      cantidadReq: cant,
      stockActual: 0,
      cantidadComprar: cant,
      precioUnitario: precioUnit,
      gastoReal: subtotalEst,
      tipo: 'manual',
      taller_destino: tallerAsignacionTemp
    }])

    setManualCodigoSeleccionado('')
    setManualDetalle('')
    setManualCantidad('')
    setManualPrecio('')
  }

  const actualizarFilaMaterial = async (id_fila: string, campo: keyof MaterialPresupuesto, valor: any) => {
    if (estadoWorkflow === 'aprobado' && campo !== 'gastoReal') {
      alert('El lote está aprobado. Solo se permite actualizar el Gasto Real.')
      return
    }
    if (estadoWorkflow === 'revision_taller' && campo !== 'stockActual') {
      alert('En fase de Talleres solo se modifica el Stock Disponible (-).')
      return
    }
    if (estadoWorkflow === 'en_compras' && campo !== 'precioUnitario' && campo !== 'cantidadComprar') {
      alert('En fase de Compras solo se modifican Precios Unitarios y cantidad a comprar.')
      return
    }

    const nuevosMateriales = materialesLote.map(m => {
      if (m.id_fila === id_fila) {
        const actualizado = { ...m, [campo]: valor }
        if (campo === 'cantidadReq' || campo === 'stockActual') {
          const req = campo === 'cantidadReq' ? Number(valor) || 0 : m.cantidadReq
          const stock = campo === 'stockActual' ? Number(valor) || 0 : m.stockActual
          actualizado.cantidadComprar = Math.max(0, Number((req - stock).toFixed(2)))
          actualizado.gastoReal = Number((actualizado.cantidadComprar * actualizado.precioUnitario).toFixed(2))
        } else if (campo === 'cantidadComprar' || campo === 'precioUnitario') {
          const comp = campo === 'cantidadComprar' ? Number(valor) || 0 : m.cantidadComprar
          const prec = campo === 'precioUnitario' ? Number(valor) || 0 : m.precioUnitario
          actualizado.gastoReal = Number((comp * prec).toFixed(2))
        }
        return actualizado
      }
      return m
    })

    setMaterialesLote(nuevosMateriales)
    await persistirLoteEnBD(estadoWorkflow, pedidosSeleccionados, nuevosMateriales, materialesPlanificados)
  }

  const eliminarFilaMaterial = async (id_fila: string) => {
    if (estadoWorkflow !== 'creado') {
      alert('Solo se pueden eliminar filas en fase de Creación.')
      return
    }
    const nuevos = materialesLote.filter(m => m.id_fila !== id_fila)
    setMaterialesLote(nuevos)
    await persistirLoteEnBD(estadoWorkflow, pedidosSeleccionados, nuevos, materialesPlanificados)
  }

  const cambiarEstadoWorkflow = async (nuevoEstado: EstadoWorkflow) => {
    if (nuevoEstado === 'aprobado') {
      setLoading(true)
      await descontarStockAlmacenes()
      setLoading(false)
    }

    setEstadoWorkflow(nuevoEstado)
    await persistirLoteEnBD(nuevoEstado, pedidosSeleccionados, materialesLote, materialesPlanificados)
  }

  // Todo se ve y se totaliza por sucursal: no hay vista global para no mezclar almacenes ni montos
  const materialesFiltrados = materialesLote.filter(m => m.taller_destino === tallerFiltroActivo)

  const exportarAPDF = () => {
    if (materialesFiltrados.length === 0) {
      alert('No hay materiales en el filtro seleccionado para exportar.')
      return
    }

    const ventanaPrint = window.open('', '_blank')
    if (!ventanaPrint) {
      alert('Por favor habilita las ventanas emergentes (pop-ups) para generar el PDF.')
      return
    }

    const granTotalEst = materialesFiltrados.reduce((acc, m) => acc + (Number(m.cantidadComprar) * Number(m.precioUnitario)), 0)
    const granTotalReal = materialesFiltrados.reduce((acc, m) => acc + Number(m.gastoReal || 0), 0)

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Lote - ${nombreLote} - ${tallerFiltroActivo}</title>
          <style>
            body { font-family: Arial, sans-serif; color: #222; margin: 20px; }
            h1 { color: #0B1E36; font-size: 20px; border-bottom: 2px solid #C5A059; padding-bottom: 8px; }
            .info { margin-bottom: 15px; font-size: 13px; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 11px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #0B1E36; color: white; }
            .text-right { text-align: right; }
            .text-center { text-align: center; }
            .totales { margin-top: 20px; font-size: 13px; float: right; font-weight: bold; }
          </style>
        </head>
        <body>
          <h1>Lista de Materiales - ${tallerFiltroActivo}</h1>
          <div class="info">
            <p><strong>Lote:</strong> ${nombreLote} | <strong>Fecha:</strong> ${fecha} | <strong>Taller:</strong> ${tallerFiltroActivo}</p>
            <p><strong>Estado:</strong> ${estadoWorkflow.toUpperCase()}</p>
          </div>
          <table>
            <thead>
              <tr>
                <th>Código</th>
                <th>Componente y Medidas</th>
                <th class="text-center">Cant. Req.</th>
                <th class="text-center">Stock Retazos (-)</th>
                <th class="text-center">A Comprar</th>
                <th class="text-right">P. Unit. (Bs)</th>
                <th class="text-right">Subtotal (Bs)</th>
                ${estadoWorkflow === 'aprobado' ? '<th class="text-right">Gasto Real (Bs)</th>' : ''}
              </tr>
            </thead>
            <tbody>
              ${materialesFiltrados.map(m => `
                <tr>
                  <td>${m.codigo}</td>
                  <td>${m.detalle}</td>
                  <td class="text-center">${m.cantidadReq}</td>
                  <td class="text-center">${m.stockActual}</td>
                  <td class="text-center">${m.cantidadComprar}</td>
                  <td class="text-right">${Number(m.precioUnitario).toFixed(2)}</td>
                  <td class="text-right">${(m.cantidadComprar * m.precioUnitario).toFixed(2)}</td>
                  ${estadoWorkflow === 'aprobado' ? `<td class="text-right"><strong>${Number(m.gastoReal || 0).toFixed(2)}</strong></td>` : ''}
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div class="totales">
            <p>Total Estimado: Bs. ${granTotalEst.toFixed(2)}</p>
            ${estadoWorkflow === 'aprobado' ? `<p style="color: #16a34a; font-size: 15px;">Total Gasto Real: Bs. ${granTotalReal.toFixed(2)}</p>` : ''}
          </div>
          <script>
            window.onload = function() { window.print(); }
          </script>
        </body>
      </html>
    `

    ventanaPrint.document.write(htmlContent)
    ventanaPrint.document.close()
  }

  const planificadosTaller = materialesPlanificados
    .map((item: any, idx: number) => ({ item, idx }))
    .filter(({ item }: { item: any }) => item.taller_destino === tallerFiltroActivo)

  const granTotal = materialesFiltrados.reduce((acc, m) => acc + (Number(m.cantidadComprar) * Number(m.precioUnitario)), 0)

  // Totales por categoría. Las filas de acero que NO vienen de Planificación están en metros
  // lineales (flujo de pedidos / manual), por eso se convierten a barras dividiendo entre 6.
  const resumenTotales = [
    { k: 'acero', label: '🔩 Tubos (barras de 600cm)', prefijo: '[ACERO]' },
    { k: 'melamina', label: '🪵 Melaminas (piezas)', prefijo: '[MELAMINA]' },
    { k: 'accesorio', label: '🔧 Accesorios (unid.)', prefijo: '[ACCESORIO]' },
    { k: 'insumo', label: '🧪 Insumos (unid.)', prefijo: '[INSUMO]' },
  ].map(c => {
    const filas = materialesFiltrados.filter(m => (m.detalle || '').toUpperCase().startsWith(c.prefijo))
    const f = (m: MaterialPresupuesto) => (c.k === 'acero' && !m.id_planificado?.startsWith(PREFIJO_AUTO)) ? 1 / 6 : 1
    return {
      ...c,
      items: filas.length,
      req: filas.reduce((a, m) => a + Number(m.cantidadReq) * f(m), 0),
      stock: filas.reduce((a, m) => a + Number(m.stockActual) * f(m), 0),
      comprar: filas.reduce((a, m) => a + Number(m.cantidadComprar) * f(m), 0),
      subtotal: filas.reduce((a, m) => a + Number(m.cantidadComprar) * Number(m.precioUnitario), 0),
    }
  }).filter(c => c.items > 0)
  const granTotalReal = materialesFiltrados.reduce((acc, m) => acc + Number(m.gastoReal || 0), 0)

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f5f5f5', fontFamily: 'Arial, sans-serif' }}>
      
      {/* NAVBAR */}
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 40px', backgroundColor: '#222', color: 'white' }}>
        <a href="/sistema" style={{ color: 'white', textDecoration: 'none', fontWeight: 'bold' }}>← Sistema</a>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <span style={{ color: '#C5A059', fontWeight: 'bold' }}>Gestión Multi-Taller por Sucursal</span>
          {sincronizando && <span style={{ fontSize: '11px', color: '#10b981' }}>Sincronizando... 🔄</span>}
        </div>
        <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
          <button onClick={exportarAPDF} style={{ backgroundColor: '#dc2626', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', fontSize: '13px' }}>
            📄 Exportar PDF ({tallerFiltroActivo})
          </button>
          <span>{usuario?.usuario || usuario?.nombre || 'Usuario'} 👤</span>
        </div>
      </nav>

      <div style={{ padding: '25px', maxWidth: '1700px', margin: '0 auto' }}>
        
        {/* BARRA DE FLUJO / WORKFLOW */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#0B1E36', padding: '20px', borderRadius: '12px', color: 'white', marginBottom: '25px', flexWrap: 'wrap', gap: '15px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', color: '#C5A059' }}>Fecha de Producción</label>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} style={{ padding: '8px', borderRadius: '6px', border: 'none' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', color: '#C5A059' }}>Identificador del Lote</label>
            <input type="text" value={nombreLote} onChange={(e) => setNombreLote(e.target.value)} style={{ padding: '8px', borderRadius: '6px', border: 'none', width: '220px' }} />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', color: '#C5A059' }}>Abrir lote guardado</label>
            <div style={{ display: 'flex', gap: '4px', alignItems: 'center', marginTop: '0' }}>
              <select
                value={String(lotesGuardados.find(l => l.fecha === fecha && l.nombre_lote === nombreLote.trim())?.id ?? '')}
                onFocus={cargarListaDeLotes}
                onChange={(e) => {
                  const sel = lotesGuardados.find(l => String(l.id) === e.target.value)
                  if (sel) { setFecha(sel.fecha); setNombreLote(sel.nombre_lote) }
                }}
                style={{ padding: '8px', borderRadius: '6px', border: 'none', width: '260px', backgroundColor: 'white', color: '#333' }}
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

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '12px' }}>
            <span style={{ padding: '6px 10px', borderRadius: '4px', backgroundColor: estadoWorkflow === 'creado' ? '#C5A059' : '#333', color: estadoWorkflow === 'creado' ? '#0B1E36' : 'white', fontWeight: 'bold' }}>1. Creación</span> →
            <span style={{ padding: '6px 10px', borderRadius: '4px', backgroundColor: estadoWorkflow === 'revision_taller' ? '#C5A059' : '#333', color: estadoWorkflow === 'revision_taller' ? '#0B1E36' : 'white', fontWeight: 'bold' }}>2. Talleres</span> →
            <span style={{ padding: '6px 10px', borderRadius: '4px', backgroundColor: estadoWorkflow === 'en_compras' ? '#C5A059' : '#333', color: estadoWorkflow === 'en_compras' ? '#0B1E36' : 'white', fontWeight: 'bold' }}>3. Compras</span> →
            <span style={{ padding: '6px 10px', borderRadius: '4px', backgroundColor: estadoWorkflow === 'aprobado' ? '#22c55e' : '#333', color: 'white', fontWeight: 'bold' }}>4. Aprobado</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '25px', alignItems: 'flex-start' }}>
          
          {/* DERECHA: Gestión de Lote y Lista Centralizada */}
          <div style={{ flex: '1', minWidth: 0, display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {/* Pestañas de Filtro por Sucursal / Taller */}
            <div style={{ display: 'flex', gap: '8px', backgroundColor: 'white', padding: '12px', borderRadius: '12px', boxShadow: '0 2px 12px rgba(0,0,0,0.05)', alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#0B1E36', marginRight: '10px' }}>Sucursal:</span>
              {talleresDisponibles.map(taller => (
                <button 
                  key={taller}
                  onClick={() => setTallerFiltroActivo(taller)}
                  style={{ padding: '6px 14px', borderRadius: '6px', border: 'none', fontWeight: 'bold', fontSize: '12px', backgroundColor: tallerFiltroActivo === taller ? '#0B1E36' : '#e2e8f0', color: tallerFiltroActivo === taller ? '#C5A059' : '#333', cursor: 'pointer' }}
                >
                  🏭 {taller}
                </button>
              ))}
            </div>

            {loading && <p style={{ fontSize: '13px', color: '#666', margin: 0 }}>Cargando datos...</p>}

            {/* Trabajos planificados del día: sus materiales entran solos a la lista */}
            <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 12px rgba(0,0,0,0.05)' }}>
              <h2 style={{ fontSize: '18px', color: '#0B1E36', borderBottom: '2px solid #C5A059', paddingBottom: '10px', marginBottom: '10px' }}>
                📋 Pedidos Planificados — {tallerFiltroActivo} ({planificadosTaller.length})
              </h2>
              <p style={{ fontSize: '11px', color: '#666', marginBottom: '10px' }}>
                Pedidos planificados para esta sucursal en este lote. Sus materiales ya están en la Lista de Materiales,
                con tubos, melaminas, accesorios e insumos sumados. Puedes editar cantidades, stock y precios directamente en la tabla.
              </p>
              {estadoWorkflow === 'creado' && materialesPlanificados.length > 0 && (
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
                  <button onClick={() => recalcularDesdePlanificacion(false)} disabled={loading}
                    style={{ background: '#0B1E36', color: '#C5A059', border: 'none', fontSize: '11px', padding: '6px 10px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                    🔄 Recalcular desde Planificación
                  </button>
                  <button onClick={() => recalcularDesdePlanificacion(true)} disabled={loading}
                    style={{ background: '#eff6ff', color: '#2563eb', border: '1px solid #93c5fd', fontSize: '11px', padding: '6px 10px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                    📦 Actualizar stock desde almacén
                  </button>
                </div>
              )}
              {planificadosTaller.length === 0 && (
                <p style={{ fontSize: '13px', fontStyle: 'italic', color: '#999' }}>No hay pedidos planificados para esta sucursal en este lote.</p>
              )}
              {planificadosTaller.map(({ item, idx }: { item: any, idx: number }) => {
                const idTemp = item.id_temp || `plan-${idx}`
                const expandido = itemsPlanificadosExpandidos[idTemp] || false
                return (
                  <div key={idTemp} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px', marginBottom: '8px', background: '#f8fafc' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                      <div>
                        <strong style={{ fontSize: '13px' }}>{item.titulo}</strong>
                        <div style={{ fontSize: '11px', color: '#666' }}>
                          {item.cliente_o_destino} · Cant: {item.cantidad ?? 1} · {(item.piezas_desglose || []).filter((p: any) => p.tipo !== 'Unión').length} piezas
                          <span style={{ marginLeft: '8px', color: '#16a34a', fontWeight: 'bold' }}>✓ En la lista</span>
                        </div>
                      </div>
                      <button
                        onClick={() => toggleExpandPlanificado(idTemp)}
                        style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', color: '#0B1E36', fontSize: '11px', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', flexShrink: 0 }}
                      >
                        {expandido ? 'Ocultar ▲' : 'Ver piezas ▼'}
                      </button>
                    </div>
                    {expandido && (
                      <div style={{ marginTop: '8px', maxHeight: '180px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '4px' }}>
                        <table style={{ width: '100%', fontSize: '10px', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr style={{ background: '#e2e8f0', textAlign: 'left' }}>
                              <th style={{ padding: '4px 6px' }}>Tipo</th>
                              <th style={{ padding: '4px 6px' }}>Descripción</th>
                              <th style={{ padding: '4px 6px' }}>Medida</th>
                              <th style={{ padding: '4px 6px', textAlign: 'center' }}>Cant.</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(item.piezas_desglose || []).filter((p: any) => p.tipo !== 'Unión').map((pieza: any, pIdx: number) => {
                              const medida = pieza.longitud_cm ? `${pieza.longitud_cm} cm`
                                : (pieza.largo_cm && pieza.ancho_cm) ? `${pieza.largo_cm} x ${pieza.ancho_cm} cm` : '-'
                              return (
                                <tr key={pIdx} style={{ borderBottom: '1px solid #eee' }}>
                                  <td style={{ padding: '4px 6px', fontWeight: 'bold' }}>{pieza.tipo || '-'}</td>
                                  <td style={{ padding: '4px 6px' }}>{pieza.descripcion || pieza.codigo || '-'}</td>
                                  <td style={{ padding: '4px 6px' }}>{medida}</td>
                                  <td style={{ padding: '4px 6px', textAlign: 'center' }}>{Number(pieza.cantidad) || 0}</td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Adición Manual */}
            {estadoWorkflow === 'creado' && (
              <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 12px rgba(0,0,0,0.05)' }}>
                <h2 style={{ fontSize: '18px', color: '#0B1E36', borderBottom: '2px solid #C5A059', paddingBottom: '10px', marginBottom: '15px' }}>Agregar Material Manual para ({tallerAsignacionTemp})</h2>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <select 
                    value={manualTipo} 
                    onChange={(e) => setManualTipo(e.target.value as any)}
                    style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '13px', backgroundColor: 'white' }}
                  >
                    <option value="acero">Acero (Metros)</option>
                    <option value="melamina">Melamina</option>
                    <option value="accesorio">Accesorio</option>
                    <option value="insumo">Insumo</option>
                  </select>

                  <select 
                    value={manualCodigoSeleccionado} 
                    onChange={(e) => handleSeleccionarItemCatalogo(e.target.value)}
                    style={{ flex: 1.2, minWidth: '150px', padding: '8px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '13px', backgroundColor: 'white' }}
                  >
                    <option value="">-- Seleccionar producto --</option>
                    {catalogoItems.map((item) => (
                      <option key={item.codigo} value={item.codigo}>
                        {item.codigo} - {item.detalle}
                      </option>
                    ))}
                  </select>

                  <input 
                    type="text" 
                    placeholder="Detalles / Medidas" 
                    value={manualDetalle} 
                    onChange={(e) => setManualDetalle(e.target.value)} 
                    style={{ flex: 1.5, minWidth: '150px', padding: '8px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '13px' }} 
                  />

                  <input 
                    type="number" 
                    placeholder="Cant." 
                    value={manualCantidad} 
                    onChange={(e) => setManualCantidad(e.target.value)} 
                    style={{ width: '65px', padding: '8px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '13px' }} 
                  />
                  
                  <input 
                    type="number" 
                    placeholder="P. Unit" 
                    value={manualPrecio} 
                    onChange={(e) => setManualPrecio(e.target.value)} 
                    style={{ width: '65px', padding: '8px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '13px' }} 
                  />

                  <button 
                    onClick={agregarPiezaAMedida} 
                    style={{ backgroundColor: '#0B1E36', color: '#C5A059', border: 'none', padding: '8px 14px', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}
                  >
                    + Agregar
                  </button>
                </div>
              </div>
            )}

            {/* TABLA CENTRALIZADA */}
            <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 12px rgba(0,0,0,0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #C5A059', paddingBottom: '10px', marginBottom: '15px' }}>
                <h2 style={{ fontSize: '18px', color: '#0B1E36', margin: 0 }}>Lista de Materiales ({tallerFiltroActivo})</h2>
                <span style={{ fontSize: '12px', backgroundColor: '#f1f5f9', padding: '4px 8px', borderRadius: '4px', color: '#333' }}>
                  Fase: {estadoWorkflow.toUpperCase()}
                </span>
              </div>

              {resumenTotales.length > 0 && (
                <div style={{ marginBottom: '16px', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                  <div style={{ background: '#0B1E36', color: '#C5A059', fontSize: '12px', fontWeight: 'bold', padding: '6px 10px' }}>
                    Totales de la sucursal {tallerFiltroActivo}
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', color: '#0B1E36' }}>
                        <th style={{ padding: '6px 10px', textAlign: 'left' }}>Categoría</th>
                        <th style={{ padding: '6px 10px', textAlign: 'center' }}>Ítems</th>
                        <th style={{ padding: '6px 10px', textAlign: 'center' }}>Requerido</th>
                        <th style={{ padding: '6px 10px', textAlign: 'center', color: '#2563eb' }}>En almacén (-)</th>
                        <th style={{ padding: '6px 10px', textAlign: 'center', color: '#16a34a' }}>A comprar</th>
                        <th style={{ padding: '6px 10px', textAlign: 'right' }}>Subtotal (Bs)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resumenTotales.map(c => (
                        <tr key={c.k} style={{ borderTop: '1px solid #eee' }}>
                          <td style={{ padding: '6px 10px', fontWeight: 'bold' }}>{c.label}</td>
                          <td style={{ padding: '6px 10px', textAlign: 'center' }}>{c.items}</td>
                          <td style={{ padding: '6px 10px', textAlign: 'center' }}>{Number(c.req.toFixed(2))}</td>
                          <td style={{ padding: '6px 10px', textAlign: 'center' }}>{Number(c.stock.toFixed(2))}</td>
                          <td style={{ padding: '6px 10px', textAlign: 'center', fontWeight: 'bold', color: '#16a34a' }}>{Number(c.comprar.toFixed(2))}</td>
                          <td style={{ padding: '6px 10px', textAlign: 'right' }}>{c.subtotal.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f1f5f9', color: '#0B1E36' }}>
                      <th style={{ padding: '8px', textAlign: 'left' }}>Taller / Código y Detalle</th>
                      <th style={{ padding: '8px', textAlign: 'center' }}>Cant. Req.</th>
                      <th style={{ padding: '8px', textAlign: 'center', color: '#2563eb' }}>Stock / Retazos (-)</th>
                      <th style={{ padding: '8px', textAlign: 'center', color: '#16a34a' }}>A Comprar</th>
                      <th style={{ padding: '8px', textAlign: 'right' }}>P. Unit. (Bs)</th>
                      <th style={{ padding: '8px', textAlign: 'right' }}>Subtotal</th>
                      {estadoWorkflow === 'aprobado' && (
                        <th style={{ padding: '8px', textAlign: 'right', color: '#16a34a' }}>Gasto Real</th>
                      )}
                      <th style={{ padding: '8px', textAlign: 'center' }}>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {materialesFiltrados.length === 0 && (
                      <tr><td colSpan={estadoWorkflow === 'aprobado' ? 8 : 7} style={{ padding: '20px', textAlign: 'center', color: '#999' }}>No hay materiales registrados para este taller.</td></tr>
                    )}
                    {materialesFiltrados.map((item) => (
                      <tr key={item.id_fila} style={{ borderBottom: '1px solid #eee' }}>
                        <td style={{ padding: '8px' }}>
                          <span style={{ fontSize: '10px', backgroundColor: '#e2e8f0', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>{item.taller_destino}</span><br/>
                          <strong>{item.codigo}</strong><br/>
                          {estadoWorkflow === 'creado' ? (
                            <input 
                              type="text" 
                              value={item.detalle} 
                              onChange={(e) => actualizarFilaMaterial(item.id_fila, 'detalle', e.target.value)}
                              style={{ width: '100%', padding: '4px', fontSize: '11px', border: '1px solid #ccc', borderRadius: '4px', marginTop: '4px' }}
                            />
                          ) : (
                            <span style={{ color: '#555', fontSize: '11px' }}>{item.detalle}</span>
                          )}
                        </td>
                        <td style={{ padding: '8px', textAlign: 'center' }}>
                          <input 
                            type="number" 
                            value={item.cantidadReq} 
                            disabled={estadoWorkflow !== 'creado'}
                            onChange={(e) => actualizarFilaMaterial(item.id_fila, 'cantidadReq', e.target.value)}
                            style={{ width: '55px', padding: '4px', textAlign: 'center', border: '1px solid #ccc', borderRadius: '4px', backgroundColor: estadoWorkflow !== 'creado' ? '#f3f4f6' : 'white' }}
                          />
                        </td>
                        <td style={{ padding: '8px', textAlign: 'center' }}>
                          <input 
                            type="number" 
                            value={item.stockActual} 
                            disabled={estadoWorkflow !== 'revision_taller' && estadoWorkflow !== 'creado'}
                            onChange={(e) => actualizarFilaMaterial(item.id_fila, 'stockActual', e.target.value)}
                            style={{ width: '55px', padding: '4px', textAlign: 'center', border: '1px solid #2563eb', borderRadius: '4px', backgroundColor: (estadoWorkflow !== 'revision_taller' && estadoWorkflow !== 'creado') ? '#f3f4f6' : 'white' }}
                          />
                        </td>
                        <td style={{ padding: '8px', textAlign: 'center' }}>
                          <input 
                            type="number" 
                            value={item.cantidadComprar} 
                            disabled={estadoWorkflow !== 'en_compras' && estadoWorkflow !== 'creado'}
                            onChange={(e) => actualizarFilaMaterial(item.id_fila, 'cantidadComprar', e.target.value)}
                            style={{ width: '55px', padding: '4px', textAlign: 'center', border: '1px solid #16a34a', fontWeight: 'bold', borderRadius: '4px', backgroundColor: (estadoWorkflow !== 'en_compras' && estadoWorkflow !== 'creado') ? '#f3f4f6' : 'white' }}
                          />
                        </td>
                        <td style={{ padding: '8px', textAlign: 'right' }}>
                          <input 
                            type="number" 
                            value={item.precioUnitario} 
                            disabled={estadoWorkflow !== 'en_compras' && estadoWorkflow !== 'creado'}
                            onChange={(e) => actualizarFilaMaterial(item.id_fila, 'precioUnitario', e.target.value)}
                            style={{ width: '65px', padding: '4px', textAlign: 'right', border: '1px solid #ccc', borderRadius: '4px', backgroundColor: (estadoWorkflow !== 'en_compras' && estadoWorkflow !== 'creado') ? '#f3f4f6' : 'white' }}
                          />
                        </td>
                        <td style={{ padding: '8px', textAlign: 'right', fontWeight: 'bold' }}>
                          {(item.cantidadComprar * item.precioUnitario).toFixed(2)}
                        </td>
                        {estadoWorkflow === 'aprobado' && (
                          <td style={{ padding: '8px', textAlign: 'right' }}>
                            <input 
                              type="number" 
                              value={item.gastoReal || 0} 
                              onChange={(e) => actualizarFilaMaterial(item.id_fila, 'gastoReal', e.target.value)}
                              style={{ width: '75px', padding: '4px', textAlign: 'right', border: '1px solid #16a34a', fontWeight: 'bold', color: '#16a34a', borderRadius: '4px', backgroundColor: 'white' }}
                            />
                          </td>
                        )}
                        <td style={{ padding: '8px', textAlign: 'center' }}>
                          {estadoWorkflow === 'creado' && (
                            <button onClick={() => eliminarFilaMaterial(item.id_fila)} style={{ background: 'none', border: 'none', color: '#ef4444', fontWeight: 'bold', cursor: 'pointer', fontSize: '15px' }}>✕</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      {estadoWorkflow === 'aprobado' ? (
                        <>
                          <td colSpan={5} style={{ padding: '12px', textAlign: 'right', fontWeight: 'bold', fontSize: '13px', color: '#0B1E36' }}>TOTALES ({tallerFiltroActivo}):</td>
                          <td style={{ padding: '12px', textAlign: 'right', fontWeight: 'bold', fontSize: '13px', color: '#0B1E36' }}>
                            Bs. {granTotal.toFixed(2)}
                          </td>
                          <td colSpan={2} style={{ padding: '12px', textAlign: 'right', fontWeight: 'bold', fontSize: '14px', color: '#16a34a', backgroundColor: '#ecfdf5' }}>
                            Bs. {granTotalReal.toFixed(2)}
                          </td>
                        </>
                      ) : (
                        <>
                          <td colSpan={5} style={{ padding: '12px', textAlign: 'right', fontWeight: 'bold', fontSize: '13px', color: '#0B1E36' }}>TOTAL ESTIMADO ({tallerFiltroActivo}):</td>
                          <td colSpan={2} style={{ padding: '12px', textAlign: 'right', fontWeight: 'bold', fontSize: '13px', color: '#0B1E36' }}>
                            Bs. {granTotal.toFixed(2)}
                          </td>
                        </>
                      )}
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* CONTROLES DE FLUJO */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px', flexWrap: 'wrap', gap: '10px' }}>
                <div>
                  {estadoWorkflow === 'revision_taller' && (
                    <button onClick={() => cambiarEstadoWorkflow('creado')} style={{ backgroundColor: '#4b5563', color: 'white', border: 'none', padding: '10px 18px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>← Volver a Creación</button>
                  )}
                  {estadoWorkflow === 'en_compras' && (
                    <button onClick={() => cambiarEstadoWorkflow('revision_taller')} style={{ backgroundColor: '#4b5563', color: 'white', border: 'none', padding: '10px 18px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>← Regresar a Talleres</button>
                  )}
                  {estadoWorkflow === 'aprobado' && (
                    <button onClick={() => cambiarEstadoWorkflow('en_compras')} style={{ backgroundColor: '#4b5563', color: 'white', border: 'none', padding: '10px 18px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>← Desaprobar</button>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  {estadoWorkflow === 'creado' && (
                    <button onClick={() => cambiarEstadoWorkflow('revision_taller')} style={{ backgroundColor: '#2563eb', color: 'white', border: 'none', padding: '10px 18px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>✓ Pasar a Talleres</button>
                  )}
                  {estadoWorkflow === 'revision_taller' && (
                    <button onClick={() => cambiarEstadoWorkflow('en_compras')} style={{ backgroundColor: '#d97706', color: 'white', border: 'none', padding: '10px 18px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>➔ Enviar a Compras</button>
                  )}
                  {estadoWorkflow === 'en_compras' && (
                    <button onClick={() => cambiarEstadoWorkflow('aprobado')} style={{ backgroundColor: '#16a34a', color: 'white', border: 'none', padding: '10px 18px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>💰 Aprobar Lote (Descontar Retazos y Stock)</button>
                  )}
                </div>
              </div>

            </div>

          </div>
        </div>
      </div>
    </div>
  )
}