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
}

type EstadoWorkflow = 'creado' | 'revision_taller' | 'en_compras' | 'aprobado'

// ── Página ────────────────────────────────────────────────────
export default function GestorPresupuestosWorkflow() {
  const [usuario, setUsuario] = useState<any>(null)
  const [fecha, setFecha] = useState(() => new Date().toISOString().split('T')[0])
  const [nombreLote, setNombreLote] = useState('Lote Mañana')
  const [loading, setLoading] = useState(true)
  const [sincronizando, setSincronizando] = useState(false)
  const [lotesGuardados, setLotesGuardados] = useState<any[]>([])

  const [estadoWorkflow, setEstadoWorkflow] = useState<EstadoWorkflow>('creado')

  const [pedidosPendientes, setPedidosPendientes] = useState<Pedido[]>([])
  const [pedidosSeleccionados, setPedidosSeleccionados] = useState<Pedido[]>([])
  const [materialesLote, setMaterialesLote] = useState<MaterialPresupuesto[]>([])
  // Materiales/piezas armados en la pantalla de Planificación para este mismo lote
  // (columna materiales_planificados). Se muestran aparte y se pueden incorporar al presupuesto.
  const [materialesPlanificados, setMaterialesPlanificados] = useState<any[]>([])
  const [itemsPlanificadosExpandidos, setItemsPlanificadosExpandidos] = useState<Record<string, boolean>>({})

  const [talleresDisponibles, setTalleresDisponibles] = useState<string[]>([])
  const [tallerFiltroActivo, setTallerFiltroActivo] = useState<string>('TODOS')
  const [tallerAsignacionTemp, setTallerAsignacionTemp] = useState<string>('')

  // Catálogo y adición manual
  const [manualTipo, setManualTipo] = useState<'acero' | 'melamina' | 'accesorio' | 'insumo'>('acero')
  const [catalogoItems, setCatalogoItems] = useState<any[]>([])
  const [manualCodigoSeleccionado, setManualCodigoSeleccionado] = useState('')
  const [manualDetalle, setManualDetalle] = useState('')
  const [manualCantidad, setManualCantidad] = useState('')
  const [manualPrecio, setManualPrecio] = useState('')

  // Selección de variantes
  const [variantesDisponiblesMap, setVariantesDisponiblesMap] = useState<Record<string, any[]>>({})
  const [variantesSeleccionadas, setVariantesSeleccionadas] = useState<Record<number, number>>({})

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

  // Al abrir la página, buscamos en Supabase el lote "activo" más reciente (el que sigue
  // en proceso, no aprobado todavía) y lo cargamos automáticamente. Esto es lo que permite
  // que el usuario de Presupuestos, en otra PC, recupere el trabajo que Planificación
  // guardó, sin depender de un link ni de escribir la fecha/nombre exactos.
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

  // Lista de lotes ya guardados en Supabase, para poder elegir uno exacto
  // en vez de depender de escribir la fecha/nombre idénticos a mano.
  useEffect(() => {
    if (!usuario) return
    const cargarListaDeLotes = async () => {
      const { data } = await supabase
        .from('lotes_produccion')
        .select('id, fecha, nombre_lote, estado_workflow, updated_at')
        .order('updated_at', { ascending: false })
        .limit(30)
      setLotesGuardados(data || [])
    }
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

  const obtenerPrecioBase = async (codigo: string): Promise<number> => {
    try {
      const [acero, melamina, accesorio, insumo, union] = await Promise.all([
        supabase.from('aceros').select('precio_compra').eq('codigo_acero', codigo).maybeSingle(),
        supabase.from('melaminas').select('precio_compra').eq('codigo_melamina', codigo).maybeSingle(),
        supabase.from('accesorios').select('precio_compra').eq('codigo_accesorio', codigo).maybeSingle(),
        supabase.from('insumos').select('precio_compra').eq('codigo_insumos', codigo).maybeSingle(),
        supabase.from('uniones').select('precio').eq('codigo_union', codigo).maybeSingle()
      ])

      return Number(
        acero.data?.precio_compra ||
        melamina.data?.precio_compra ||
        accesorio.data?.precio_compra ||
        insumo.data?.precio_compra ||
        union.data?.precio || 0
      )
    } catch {
      return 0
    }
  }

  // ➔ CARGAR VALORES DE costo_unitario DESDE UN JSON
  const handleCargarJsonCostos = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = async (event) => {
      try {
        const jsonContent = event.target?.result as string
        const data = JSON.parse(jsonContent)

        const itemsArray = Array.isArray(data) ? data : (data.materiales || data.items || [])
        if (!Array.isArray(itemsArray) || itemsArray.length === 0) {
          alert('El archivo JSON no tiene un formato válido (debe ser un arreglo de objetos con codigo y costo_unitario).')
          return
        }

        const costosMap: Record<string, number> = {}
        itemsArray.forEach((item: any) => {
          const cod = item.codigo || item.codigo_acero || item.codigo_melamina || item.codigo_accesorio || item.codigo_insumos || item.codigo_union
          const costo = Number(item.costo_unitario ?? item.precio_unitario ?? item.precio ?? item.precio_compra ?? 0)
          if (cod) {
            costosMap[String(cod).trim()] = costo
          }
        })

        let actualizadosCount = 0
        const nuevosMateriales = materialesLote.map(m => {
          const costoJson = costosMap[String(m.codigo).trim()]
          if (costoJson !== undefined) {
            actualizadosCount++
            const precioUnitario = costoJson
            const gastoReal = Number((m.cantidadComprar * precioUnitario).toFixed(2))
            return {
              ...m,
              precioUnitario,
              gastoReal
            }
          }
          return m
        })

        setMaterialesLote(nuevosMateriales)
        await persistirLoteEnBD(estadoWorkflow, pedidosSeleccionados, nuevosMateriales)
        alert(`Se actualizaron los costos unitarios de ${actualizadosCount} materiales desde el JSON.`)
      } catch (err) {
        console.error(err)
        alert('Error al leer o parsear el archivo JSON.')
      } finally {
        e.target.value = ''
      }
    }
    reader.readAsText(file)
  }

  // ➔ DESCUENTO AUTOMÁTICO DE INVENTARIO Y RETAZOS EN ALMACENES AL APROBAR
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

        // Si es melamina, descontar de retazos_melaminas basándose en stockActual
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
          // Para aceros, accesorios, insumos, etc.
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

      const { data: ventasData, error } = await supabase
        .from('ventas')
        .select('id, cod_venta, cod_cliente, fecha_entrega, estado')
        .eq('fecha_entrega', fecha)
        .in('estado', [1, 2])

      if (error) throw error
      if (!ventasData || ventasData.length === 0) {
        setPedidosPendientes([])
        setLoading(false)
        return
      }

      const clientesIds = [...new Set(ventasData.map(v => v.cod_cliente))]
      const { data: clientesData } = await supabase.from('clientes').select('id, nombre').in('id', clientesIds)
      const clientesMap = Object.fromEntries(clientesData?.map(c => [c.id, c.nombre]) || [])

      const codigosVenta = ventasData.map(v => v.cod_venta)
      const { data: detallesData } = await supabase.from('detalle_venta').select('*').in('cod_venta', codigosVenta)
      const codigosProd = [...new Set((detallesData || []).map(d => d.cod_producto).filter(Boolean))]

      const { data: prodData } = codigosProd.length > 0
        ? await supabase.from('productos').select('codigo, nombre').in('codigo', codigosProd)
        : { data: [] }

      const prodMap = Object.fromEntries(prodData?.map(p => [String(p.codigo), p.nombre]) || [])

      const { data: variantesProdData } = codigosProd.length > 0
        ? await supabase.from('producto_variantes').select('id, codigo_producto, es_estandar, descripcion, nombre').in('codigo_producto', codigosProd).eq('activo', true)
        : { data: [] }

      const varMap: Record<string, any[]> = {}
      const defaultVarSelected: Record<number, number> = {}
      ;(variantesProdData || []).forEach(v => {
        if (!varMap[v.codigo_producto]) varMap[v.codigo_producto] = []
        varMap[v.codigo_producto].push(v)
      })

      const pedidosProcesados = ventasData.map(v => {
        const detalles = (detallesData || [])
          .filter(d => d.cod_venta === v.cod_venta)
          .map(d => {
            const vars = varMap[String(d.cod_producto)] || []
            const estandar = vars.find(val => val.es_estandar) || vars[0]
            if (estandar && !d.variante_id) {
              defaultVarSelected[d.id] = estandar.id
            }
            return {
              ...d,
              producto_nombre: prodMap[String(d.cod_producto)] || d.cod_producto,
            }
          })
        return {
          id: v.id,
          cod_venta: v.cod_venta,
          cliente: clientesMap[v.cod_cliente] || 'Sin cliente',
          fecha_entrega: v.fecha_entrega,
          estado: v.estado,
          taller_destino: talleresDisponibles[0] || '',
          detalles
        }
      })

      setVariantesDisponiblesMap(varMap)
      setVariantesSeleccionadas(prev => ({ ...defaultVarSelected, ...prev }))

      const seleccionadosIds = seleccionados.map(s => s.cod_venta)
      setPedidosPendientes(pedidosProcesados.filter(p => !seleccionadosIds.includes(p.cod_venta)))
    } catch (error) {
      console.error(error)
      alert('Error cargando el lote multi-usuario')
    } finally {
      setLoading(false)
    }
  }

  const persistirLoteEnBD = async (nuevoEstado: EstadoWorkflow, nuevosPedidos: Pedido[], nuevosMateriales: MaterialPresupuesto[]) => {
    setSincronizando(true)
    try {
      const { error } = await supabase
        .from('lotes_produccion')
        .upsert({
          fecha,
          nombre_lote: nombreLote.trim(),
          estado_workflow: nuevoEstado,
          pedidos_seleccionados: nuevosPedidos,
          materiales: nuevosMateriales,
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

  const buscarVariantesAutomaticas = async (det: DetalleVenta, cod_venta: number, tallerDestino: string, varianteIdOverride?: number) => {
    let varianteId = varianteIdOverride
    if (!varianteId) {
      const { data: variantesData } = await supabase
        .from('producto_variantes')
        .select('id')
        .eq('codigo_producto', det.cod_producto)
        .eq('es_estandar', true)
        .eq('activo', true)
        .limit(1)

      if (!variantesData || variantesData.length === 0) return null
      varianteId = variantesData[0].id
    }

    const multPedido = det.cantidad || 1

    const [resAceros, resMelaminas, resAccesorios, resInsumos, resUniones] = await Promise.all([
      supabase.from('variante_acero').select('*, aceros(detalle)').eq('variante_id', varianteId),
      supabase.from('variante_melamina').select('*, melaminas(detalle, precio_cotizador)').eq('variante_id', varianteId),
      supabase.from('variante_accesorios').select('*, accesorios(detalle)').eq('variante_id', varianteId),
      supabase.from('variante_insumos').select('*, insumos(detalle)').eq('variante_id', varianteId),
      supabase.from('variante_uniones').select('*, uniones(tipo)').eq('variante_id', varianteId),
    ])

    const materiales: MaterialPresupuesto[] = []

    const { data: sucursalData } = await supabase
      .from('sucursales')
      .select('id')
      .eq('nombre', tallerDestino)
      .maybeSingle()
    const sucursalId = sucursalData?.id

    if (resAceros.data) {
      for (const item of resAceros.data) {
        const codigo = item.codigo_acero
        const cantidadPiezas = Number(item.cantidad) || 0
        const largoCm = Number(item.largo_cm || item.longitud_cm || 0)
        const longitudTotalMetros = (cantidadPiezas * largoCm * multPedido) / 100
        
        const precioTubo = await obtenerPrecioBase(codigo)
        const precioMetroLineal = Number((precioTubo / 6).toFixed(2))
        const subtotalEst = Number((longitudTotalMetros * precioMetroLineal).toFixed(2))

        materiales.push({
          id_fila: Math.random().toString(36).substr(2, 9),
          cod_venta,
          codigo,
          detalle: `[Acero] ${item.aceros?.detalle || item.descripcion || codigo} (${cantidadPiezas} pzas de ${(largoCm / 100).toFixed(2)}m c/u)`,
          cantidadReq: Number(longitudTotalMetros.toFixed(2)),
          stockActual: 0,
          cantidadComprar: Number(longitudTotalMetros.toFixed(2)),
          precioUnitario: precioMetroLineal,
          gastoReal: subtotalEst,
          tipo: 'variante',
          taller_destino: tallerDestino
        })
      }
    }

    if (resMelaminas.data) {
      for (const item of resMelaminas.data) {
        const codigo = item.codigo_melamina
        const cantidadPiezas = Number(item.cantidad) || 0
        const reqTotal = cantidadPiezas * multPedido
        const largo = Number(item.largo_cm || 0)
        const ancho = Number(item.ancho_cm || 0)
        const precioCotizador = Number(item.melaminas?.precio_cotizador || 0)

        let stockEnAlmacen = 0
        if (sucursalId) {
          const { data: retazos } = await supabase
            .from('retazos_melaminas')
            .select('id, cantidad, largo_cm, ancho_cm')
            .eq('sucursal_id', sucursalId)
            .eq('codigo_melamina', codigo)
            .gte('largo_cm', largo)
            .gte('ancho_cm', ancho)
            .order('largo_cm', { ascending: true })

          if (retazos) {
            let acumuladoStock = 0
            for (const ret of retazos) {
              if (acumuladoStock < reqTotal) {
                const tomar = Math.min(ret.cantidad, reqTotal - acumuladoStock)
                acumuladoStock += tomar
              }
            }
            stockEnAlmacen = acumuladoStock
          }
        }

        const cantidadComprar = Math.max(0, reqTotal - stockEnAlmacen)
        const precioUnitarioMelamina = Number(((largo / 100) * (ancho / 100) * precioCotizador).toFixed(2))
        const subtotalEst = Number((cantidadComprar * precioUnitarioMelamina).toFixed(2))

        materiales.push({
          id_fila: Math.random().toString(36).substr(2, 9),
          cod_venta,
          codigo,
          detalle: `[Melamina] ${item.melaminas?.detalle || item.descripcion || codigo} - Medidas: ${largo} x ${ancho} cm`,
          cantidadReq: reqTotal,
          stockActual: stockEnAlmacen,
          cantidadComprar,
          precioUnitario: precioUnitarioMelamina,
          gastoReal: subtotalEst,
          tipo: 'variante',
          taller_destino: tallerDestino
        })
      }
    }

    const procesarGenericos = async (items: any[], codigoKey: string, descKey: string, tipoPrefix: string) => {
      for (const item of items) {
        const codigo = item[codigoKey]
        const req = Number(item.cantidad) * multPedido
        const precioUnitario = await obtenerPrecioBase(codigo)
        const subtotalEst = Number((req * precioUnitario).toFixed(2))

        materiales.push({
          id_fila: Math.random().toString(36).substr(2, 9),
          cod_venta,
          codigo,
          detalle: `[${tipoPrefix}] ${item[descKey]?.detalle || item[descKey]?.tipo || item.descripcion || codigo}`,
          cantidadReq: req,
          stockActual: 0,
          cantidadComprar: req,
          precioUnitario,
          gastoReal: subtotalEst,
          tipo: 'variante',
          taller_destino: tallerDestino
        })
      }
    }

    await Promise.all([
      procesarGenericos(resAccesorios.data || [], 'codigo_accesorio', 'accesorios', 'Accesorio'),
      procesarGenericos(resInsumos.data || [], 'codigo_insumo', 'insumos', 'Insumo'),
      procesarGenericos(resUniones.data || [], 'codigo_union', 'uniones', 'Unión'),
    ])

    return materiales.length > 0 ? materiales : null
  }

  const agregarOConsolidarMateriales = async (nuevosMateriales: MaterialPresupuesto[]) => {
    const actualizada = [...materialesLote]
    for (const nuevo of nuevosMateriales) {
      const index = actualizada.findIndex(m => m.codigo === nuevo.codigo && m.detalle === nuevo.detalle && m.taller_destino === nuevo.taller_destino)
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
    await persistirLoteEnBD(estadoWorkflow, pedidosSeleccionados, actualizada)
  }

  const incorporarItemPlanificadoAlPresupuesto = async (item: any) => {
    if (estadoWorkflow !== 'creado') {
      alert('Solo se pueden incorporar materiales cuando el lote está en fase de Creación.')
      return
    }
    const piezas = item.piezas_desglose || []
    if (piezas.length === 0) {
      alert('Este item no tiene piezas registradas en Planificación.')
      return
    }

    const nuevosMateriales: MaterialPresupuesto[] = []

    for (const p of piezas) {
      const codigo = p.codigo_melamina || p.codigo_acero || p.codigo_accesorio || p.codigo_insumo || p.codigo_union || p.descripcion || 'SIN-CODIGO'
      const cantidad = Number(p.cantidad) || 0

      // Buscamos el precio unitario automáticamente en la base de datos
      const precioUnitario = await obtenerPrecioBase(codigo)
      const gastoReal = Number((cantidad * precioUnitario).toFixed(2))

      nuevosMateriales.push({
        id_fila: Math.random().toString(36).substr(2, 9),
        cod_venta: 0,
        codigo,
        detalle: `[Planificado] ${item.titulo} - ${p.descripcion || p.tipo}`,
        cantidadReq: cantidad,
        stockActual: 0,
        cantidadComprar: cantidad,
        precioUnitario,
        gastoReal,
        tipo: 'manual',
        taller_destino: item.taller_destino || tallerAsignacionTemp
      })
    }

    await agregarOConsolidarMateriales(nuevosMateriales)
    alert(`Se incorporaron ${nuevosMateriales.length} piezas de "${item.titulo}" al presupuesto con sus costos unitarios calculados automáticamente.`)
  }

  const toggleExpandPlanificado = (id_temp: string) => {
    setItemsPlanificadosExpandidos(prev => ({ ...prev, [id_temp]: !prev[id_temp] }))
  }

  const moverAPresupuesto = async (pedido: Pedido) => {
    if (estadoWorkflow !== 'creado') {
      alert('Solo se pueden agregar o quitar pedidos cuando el lote está en fase de Creación.')
      return
    }
    setLoading(true)
    let materialesAgregados: MaterialPresupuesto[] = []
    let productosSinVariante: string[] = []

    const detallesConVariante = pedido.detalles.map(d => ({
      ...d,
      variante_id: variantesSeleccionadas[d.id]
    }))
    const pedidoConTaller: Pedido = { ...pedido, taller_destino: tallerAsignacionTemp, detalles: detallesConVariante }

    for (const det of detallesConVariante) {
      const componentes = await buscarVariantesAutomaticas(det, pedido.cod_venta, tallerAsignacionTemp, det.variante_id)
      if (componentes) {
        materialesAgregados.push(...componentes)
      } else {
        productosSinVariante.push(det.producto_nombre || det.cod_producto)
      }
    }

    const nuevosSeleccionados = [...pedidosSeleccionados, pedidoConTaller]
    setPedidosSeleccionados(nuevosSeleccionados)
    setPedidosPendientes(pedidosPendientes.filter(p => p.cod_venta !== pedido.cod_venta))
    
    await agregarOConsolidarMateriales(materialesAgregados)

    if (productosSinVariante.length > 0) {
      alert(`Aviso: Los productos [${productosSinVariante.join(', ')}] no tienen variante seleccionada y deben registrarse manualmente.`)
    }
    setLoading(false)
  }

  const devolverAPendientes = async (pedido: Pedido) => {
    if (estadoWorkflow !== 'creado') {
      alert('Solo se pueden modificar los pedidos del lote en fase de Creación.')
      return
    }
    const nuevosSeleccionados = pedidosSeleccionados.filter(p => p.cod_venta !== pedido.cod_venta)
    setPedidosPendientes([...pedidosPendientes, pedido])
    setPedidosSeleccionados(nuevosSeleccionados)
    await reconstruirLoteDesdePedidos(nuevosSeleccionados)
  }

  const reconstruirLoteDesdePedidos = async (pedidosRestantes: Pedido[]) => {
    setLoading(true)
    let nuevosMateriales: MaterialPresupuesto[] = []
    for (const ped of pedidosRestantes) {
      const tallerDestino = ped.taller_destino || talleresDisponibles[0]
      for (const det of ped.detalles) {
        const varId = det.variante_id || variantesSeleccionadas[det.id]
        const componentes = await buscarVariantesAutomaticas(det, ped.cod_venta, tallerDestino, varId)
        if (componentes) nuevosMateriales.push(...componentes)
      }
    }
    let loteConsolidado: MaterialPresupuesto[] = []
    for (const nuevo of nuevosMateriales) {
      const index = loteConsolidado.findIndex(m => m.codigo === nuevo.codigo && m.detalle === nuevo.detalle && m.taller_destino === nuevo.taller_destino)
      if (index >= 0) {
        const nuevaReq = Number((loteConsolidado[index].cantidadReq + nuevo.cantidadReq).toFixed(2))
        loteConsolidado[index].cantidadReq = nuevaReq
        loteConsolidado[index].cantidadComprar = Math.max(0, Number((nuevaReq - loteConsolidado[index].stockActual).toFixed(2)))
        loteConsolidado[index].gastoReal = Number((loteConsolidado[index].cantidadComprar * loteConsolidado[index].precioUnitario).toFixed(2))
      } else {
        loteConsolidado.push(nuevo)
      }
    }
    setMaterialesLote(loteConsolidado)
    await persistirLoteEnBD(estadoWorkflow, pedidosRestantes, loteConsolidado)
    setLoading(false)
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
    await persistirLoteEnBD(estadoWorkflow, pedidosSeleccionados, nuevosMateriales)
  }

  const eliminarFilaMaterial = async (id_fila: string) => {
    if (estadoWorkflow !== 'creado') {
      alert('Solo se pueden eliminar filas en fase de Creación.')
      return
    }
    const nuevos = materialesLote.filter(m => m.id_fila !== id_fila)
    setMaterialesLote(nuevos)
    await persistirLoteEnBD(estadoWorkflow, pedidosSeleccionados, nuevos)
  }

  const cambiarEstadoWorkflow = async (nuevoEstado: EstadoWorkflow) => {
    if (nuevoEstado === 'aprobado') {
      setLoading(true)
      await descontarStockAlmacenes()
      setLoading(false)
    }

    setEstadoWorkflow(nuevoEstado)
    await persistirLoteEnBD(nuevoEstado, pedidosSeleccionados, materialesLote)
  }

  const materialesFiltrados = tallerFiltroActivo === 'TODOS' 
    ? materialesLote 
    : materialesLote.filter(m => m.taller_destino === tallerFiltroActivo)

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
          <h1>Resumen Consolidado - ${tallerFiltroActivo}</h1>
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

  const granTotal = materialesFiltrados.reduce((acc, m) => acc + (Number(m.cantidadComprar) * Number(m.precioUnitario)), 0)
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

          {lotesGuardados.length > 0 && (
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#C5A059' }}>Abrir lote guardado</label>
              <select
                value=""
                onChange={(e) => {
                  const sel = lotesGuardados.find(l => String(l.id) === e.target.value)
                  if (sel) { setFecha(sel.fecha); setNombreLote(sel.nombre_lote) }
                }}
                style={{ padding: '8px', borderRadius: '6px', border: 'none', width: '260px' }}
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

          {/* ➔ CARGAR COSTOS DESDE JSON */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', color: '#C5A059' }}>Cargar Costos (JSON)</label>
            <input 
              type="file" 
              accept=".json"
              onChange={handleCargarJsonCostos}
              style={{ fontSize: '11px', color: 'white', padding: '4px' }}
            />
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '12px' }}>
            <span style={{ padding: '6px 10px', borderRadius: '4px', backgroundColor: estadoWorkflow === 'creado' ? '#C5A059' : '#333', color: estadoWorkflow === 'creado' ? '#0B1E36' : 'white', fontWeight: 'bold' }}>1. Creación</span> →
            <span style={{ padding: '6px 10px', borderRadius: '4px', backgroundColor: estadoWorkflow === 'revision_taller' ? '#C5A059' : '#333', color: estadoWorkflow === 'revision_taller' ? '#0B1E36' : 'white', fontWeight: 'bold' }}>2. Talleres</span> →
            <span style={{ padding: '6px 10px', borderRadius: '4px', backgroundColor: estadoWorkflow === 'en_compras' ? '#C5A059' : '#333', color: estadoWorkflow === 'en_compras' ? '#0B1E36' : 'white', fontWeight: 'bold' }}>3. Compras</span> →
            <span style={{ padding: '6px 10px', borderRadius: '4px', backgroundColor: estadoWorkflow === 'aprobado' ? '#22c55e' : '#333', color: 'white', fontWeight: 'bold' }}>4. Aprobado</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '25px', alignItems: 'flex-start' }}>
          
          {/* IZQUIERDA: Pedidos Pendientes con Selector de Taller */}
          <div style={{ flex: '1', backgroundColor: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 12px rgba(0,0,0,0.05)' }}>
            <h2 style={{ fontSize: '18px', color: '#0B1E36', borderBottom: '2px solid #C5A059', paddingBottom: '10px' }}>Pedidos para el {fecha}</h2>
            
            {estadoWorkflow === 'creado' && (
              <div style={{ margin: '15px 0', padding: '10px', backgroundColor: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#0B1E36', marginBottom: '5px' }}>Asignar Sucursal / Taller de Destino:</label>
                <select 
                  value={tallerAsignacionTemp} 
                  onChange={(e) => setTallerAsignacionTemp(e.target.value)}
                  style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #ccc', fontSize: '12px', backgroundColor: 'white' }}
                >
                  {talleresDisponibles.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
            )}

            {loading && <p>Cargando datos...</p>}
            {!loading && pedidosPendientes.length === 0 && <p style={{ fontSize: '14px', color: '#666' }}>No hay pedidos pendientes.</p>}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              {pedidosPendientes.map((pedido, idxPend) => (
                <div key={pedido.cod_venta ?? pedido.id ?? idxPend} style={{ border: '1px solid #eee', borderRadius: '8px', padding: '12px', backgroundColor: '#fafafa' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <strong>#{pedido.cod_venta} - {pedido.cliente}</strong>
                    {estadoWorkflow === 'creado' && (
                      <button onClick={() => moverAPresupuesto(pedido)} style={{ backgroundColor: '#C5A059', color: '#0B1E36', border: 'none', padding: '6px 12px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>+ Consolidar</button>
                    )}
                  </div>
                  <div style={{ fontSize: '12px', color: '#555' }}>
                    {pedido.detalles.map(d => {
                      const vars = variantesDisponiblesMap[String(d.cod_producto)] || []
                      return (
                        <div key={d.id} style={{ margin: '8px 0', padding: '6px', backgroundColor: '#fff', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                            <span>• {d.cantidad}x {d.producto_nombre}</span>
                          </div>
                          {estadoWorkflow === 'creado' && vars.length > 0 && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                              <span style={{ fontSize: '10px', fontWeight: 'bold', color: '#0B1E36' }}>Variante:</span>
                              <select
                                value={variantesSeleccionadas[d.id] || ''}
                                onChange={(e) => setVariantesSeleccionadas({ ...variantesSeleccionadas, [d.id]: Number(e.target.value) })}
                                style={{ flex: 1, padding: '4px', fontSize: '11px', borderRadius: '4px', border: '1px solid #ccc', backgroundColor: 'white' }}
                              >
                                {vars.map(v => (
                                  <option key={v.id} value={v.id}>
                                    {v.nombre || v.descripcion || `Variante #${v.id}`} {v.es_estandar ? '(Estándar)' : ''}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* DERECHA: Gestión de Lote y Lista Centralizada */}
          <div style={{ flex: '1.7', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {/* Pestañas de Filtro por Sucursal / Taller */}
            <div style={{ display: 'flex', gap: '8px', backgroundColor: 'white', padding: '12px', borderRadius: '12px', boxShadow: '0 2px 12px rgba(0,0,0,0.05)', alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#0B1E36', marginRight: '10px' }}>Ver lista de:</span>
              <button 
                onClick={() => setTallerFiltroActivo('TODOS')}
                style={{ padding: '6px 14px', borderRadius: '6px', border: 'none', fontWeight: 'bold', fontSize: '12px', backgroundColor: tallerFiltroActivo === 'TODOS' ? '#0B1E36' : '#e2e8f0', color: tallerFiltroActivo === 'TODOS' ? '#C5A059' : '#333', cursor: 'pointer' }}
              >
                🌐 Todos los Talleres (Consolidado Global)
              </button>
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

            {/* Pedidos Seleccionados */}
            <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 12px rgba(0,0,0,0.05)' }}>
              <h2 style={{ fontSize: '18px', color: '#0B1E36', borderBottom: '2px solid #C5A059', paddingBottom: '10px' }}>Pedidos Incluidos en el Lote</h2>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {pedidosSeleccionados.length === 0 && <span style={{ fontSize: '13px', fontStyle: 'italic', color: '#999' }}>Ningún pedido seleccionado.</span>}
                {pedidosSeleccionados.map((p, idxSel) => (
                  <span key={p.cod_venta ?? p.id ?? idxSel} style={{ backgroundColor: '#0B1E36', color: 'white', padding: '6px 12px', borderRadius: '12px', fontSize: '12px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <strong>#{p.cod_venta}</strong> - {p.cliente} <span style={{ color: '#C5A059', fontSize: '10px' }}>({p.taller_destino})</span>
                    {estadoWorkflow === 'creado' && (
                      <button onClick={() => devolverAPendientes(p)} style={{ background: 'none', border: 'none', color: '#C5A059', cursor: 'pointer', fontWeight: 'bold' }}>✕</button>
                    )}
                  </span>
                ))}
              </div>
            </div>

            {/* Materiales planificados desde la pantalla de Planificación (mismo lote: fecha + nombre) */}
            {materialesPlanificados.length > 0 && (
              <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 12px rgba(0,0,0,0.05)' }}>
                <h2 style={{ fontSize: '18px', color: '#0B1E36', borderBottom: '2px solid #C5A059', paddingBottom: '10px', marginBottom: '10px' }}>
                  📋 Materiales Planificados ({materialesPlanificados.length})
                </h2>
                <p style={{ fontSize: '11px', color: '#666', marginBottom: '10px' }}>
                  Piezas armadas desde la pantalla de Planificación para este mismo lote (incluye stock y pedidos especiales, no solo ventas). Incorpóralas al presupuesto para poder descontar almacén y aprobar la compra.
                </p>
                {materialesPlanificados.map((item: any, idx: number) => {
                  const idTemp = item.id_temp || `plan-${idx}`
                  const expandido = itemsPlanificadosExpandidos[idTemp] || false
                  return (
                    <div key={idTemp} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px', marginBottom: '10px', background: '#f8fafc' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <strong style={{ fontSize: '13px' }}>{item.titulo}</strong>
                          <div style={{ fontSize: '11px', color: '#666' }}>
                            Destino: {item.taller_destino} · {(item.piezas_desglose || []).length} piezas
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            onClick={() => toggleExpandPlanificado(idTemp)}
                            style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', color: '#0B1E36', fontSize: '11px', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                          >
                            {expandido ? 'Ocultar ▲' : 'Ver piezas ▼'}
                          </button>
                          {estadoWorkflow === 'creado' && (
                            <button
                              onClick={() => incorporarItemPlanificadoAlPresupuesto(item)}
                              style={{ background: '#C5A059', color: '#0B1E36', border: 'none', fontSize: '11px', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                            >
                              + Incorporar al presupuesto
                            </button>
                          )}
                        </div>
                      </div>
                      {expandido && (
                        <div style={{ marginTop: '8px', maxHeight: '160px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '4px' }}>
                          <table style={{ width: '100%', fontSize: '10px', borderCollapse: 'collapse' }}>
                            <thead>
                              <tr style={{ background: '#e2e8f0', textAlign: 'left' }}>
                                <th style={{ padding: '4px 6px' }}>Tipo</th>
                                <th style={{ padding: '4px 6px' }}>Descripción</th>
                                <th style={{ padding: '4px 6px' }}>Cant.</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(item.piezas_desglose || []).map((pieza: any, pIdx: number) => (
                                <tr key={pIdx} style={{ borderBottom: '1px solid #eee' }}>
                                  <td style={{ padding: '4px 6px', fontWeight: 'bold' }}>{pieza.tipo}</td>
                                  <td style={{ padding: '4px 6px' }}>{pieza.descripcion || '-'}</td>
                                  <td style={{ padding: '4px 6px' }}>{pieza.cantidad}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

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