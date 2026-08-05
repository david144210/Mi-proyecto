'use client'

// app/planilla/vendedores/page.tsx
// Planilla de Comisiones de Vendedores conectada al Sistema de Ventas de Supabase

import { useEffect, useState, useMemo, useCallback } from 'react'
import { supabase } from '../../../lib/supabase'

// ── Utilidades de Fechas ──────────────────────────────────────────────────────
const getRangoFechas = (mesStr: string) => {
  const [anio, mes] = mesStr.split('-')
  const inicio = `${mesStr}-01`
  const fin = new Date(parseInt(anio), parseInt(mes), 0).toISOString().split('T')[0]
  return { inicio, fin }
}

const getMesAnterior = (mesStr: string) => {
  const [anioStr, mesStr2] = mesStr.split('-')
  const d = new Date(parseInt(anioStr), parseInt(mesStr2) - 2, 1) // -2: un mes antes del mes seleccionado
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const fmt = (n: number) => n.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// ── Tipos ────────────────────────────────────────────────────────────────────
type TipoVendedor = 'Planta' | 'Digital' | 'Virtual' | string

type Vendedor = {
  id: number
  nombre: string
  ci: string
  alias: string | null
  tipo: TipoVendedor
  activo: boolean
  bono_digital: boolean
  personal_id: number | null
  personal?: { id: number; usuario: string; carnet: string; cargo: string }
}

type Escala = {
  id: number
  nombre?: string
  temporada?: string
  activa: boolean
  nivel: number
  tipo: TipoVendedor
  categoria: string
  venta_min: number
  sueldo_base: number
  comision_pct: number
}

type DetalleVentaCobro = {
  cod_venta: number
  total_venta: number
  fecha_pedido: string
  fecha_cobro: string | null
}

type DetallePendiente = {
  cod_venta: number
  total_venta: number
  fecha_pedido: string
}

type DetalleVendedor = {
  cobradasMes: DetalleVentaCobro[]
  cobradasHistorico: DetalleVentaCobro[]
  pendientes: DetallePendiente[]
  pendientesMesAnterior: DetallePendiente[]
}

// Mapa de colores por nivel de escala
const NIVEL_COLOR: Record<number, string> = {
  1: '#64748b', // Gris
  2: '#2563eb', // Azul
  3: '#0891b2', // Cyan
  4: '#059669', // Verde
  5: '#d97706', // Naranja
  6: '#7c3aed', // Púrpura
}

export default function PlanillaVendedores() {
  const [vendedores, setVendedores] = useState<Vendedor[]>([])
  const [escalas, setEscalas] = useState<Escala[]>([])
  const [temporadaSel, setTemporadaSel] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [filtroTipo, setFiltroTipo] = useState<string>('')

  // Selección de Mes libre (AAAA-MM)
  const [mesSeleccionado, setMesSeleccionado] = useState(() => {
    const hoy = new Date()
    return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`
  })

  // Ventas comisionables calculadas según cobranza: { [cod_vendedor]: montoTotalComisionable }
  const [mapaVentas, setMapaVentas] = useState<Record<number, number>>({})
  // Detalle de ventas por vendedor: cobradas este mes, cobradas de meses anteriores, y pendientes de cobro
  const [detalleVentasPorVendedor, setDetalleVentasPorVendedor] = useState<Record<number, DetalleVendedor>>({})
  const [cargandoVentas, setCargandoVentas] = useState(false)
  const [filaExpandida, setFilaExpandida] = useState<number | null>(null)

  useEffect(() => {
    const carnet = localStorage.getItem('carnet')
    if (!carnet) return void (window.location.replace('/'))

    supabase.from('personal').select('*, cargos(*)').eq('carnet', carnet).eq('estado', true).single()
      .then(({ data }) => {
        if (!data) return window.location.replace('/')
        const c = data.cargos
        if (!c?.es_admin && !c?.puede_gestionar_rrhh && !c?.puede_ver_planillas) {
          return window.location.replace('/sistema')
        }
        Promise.all([loadVendedores(), loadEscalas()]).finally(() => setLoading(false))
      })
  }, [])

  const loadVendedores = async () => {
    const { data } = await supabase
      .from('vendedores')
      .select('id, nombre, ci, alias, tipo, activo, bono_digital, personal_id, personal(id, usuario, carnet, cargo)')
      .eq('activo', true)
      .order('nombre')
    setVendedores((data as any) || [])
  }

  const loadEscalas = async () => {
    const { data } = await supabase
      .from('escalas_vendedor')
      .select('*')
      .eq('activa', true)
      .order('nivel', { ascending: true })
    
    const listaEscalas = (data as any) || []
    setEscalas(listaEscalas)

    const temporadas = Array.from(new Set(listaEscalas.map((e: Escala) => e.temporada).filter(Boolean)))
    if (temporadas.length > 0) {
      const temporada2026 = temporadas.find(t => String(t).includes('2026')) || temporadas[0]
      setTemporadaSel(String(temporada2026))
    }
  }

  // ── Cargar Ventas Comisionables según Cobranza (Cash Basis) ─────────────────
  // Regla de negocio confirmada:
  // - Si existe UN registro en `cobranzas` para un cod_venta, esa venta se considera
  //   CERRADA (pagada por completo). No se valida saldo ni se suma monto cobrado contra
  //   total_venta: la sola existencia del registro cierra la venta.
  // 1) Cada venta se atribuye SIEMPRE al mes de su PRIMER registro de cobro en `cobranzas`
  //    (si hubiera más de un registro para la misma venta, se usa el más antiguo como
  //    fecha de cierre, para no duplicar el monto en dos meses distintos).
  // 2) Si esa fecha de cierre cae dentro del mes evaluado, la venta se suma a ese mes,
  //    sin importar si el pedido (fecha_pedido) es de este mes ("cobrada este mes") o de un
  //    mes anterior ("histórico cobrado este mes").
  // 3) Las ventas hechas en el mes evaluado que aún NO tengan ningún registro de cobro
  //    (venta abierta) no se suman a este mes; quedan como "pendientes de cobro" y se
  //    arrastrarán automáticamente al mes en que se registre su cierre.
  const cargarVentasMes = useCallback(async (mesStr: string) => {
    const { inicio, fin } = getRangoFechas(mesStr)
    setCargandoVentas(true)

    try {
      // 1. Cobros registrados dentro del mes evaluado
      const { data: cobrosDelMes, error: errCobrosMes } = await supabase
        .from('cobranzas')
        .select('cod_venta, fecha_pago')
        .gte('fecha_pago', inicio)
        .lte('fecha_pago', fin)

      if (errCobrosMes) throw errCobrosMes

      const codVentaCandidatos = Array.from(new Set((cobrosDelMes || []).map((c: any) => c.cod_venta)))

      // Fecha del primer cobro dentro del mes (por si hay más de un pago en el mismo mes)
      const fechaPrimerCobroDelMes: Record<number, string> = {}
      ;(cobrosDelMes || []).forEach((c: any) => {
        if (!c.fecha_pago) return
        if (!fechaPrimerCobroDelMes[c.cod_venta] || c.fecha_pago < fechaPrimerCobroDelMes[c.cod_venta]) {
          fechaPrimerCobroDelMes[c.cod_venta] = c.fecha_pago
        }
      })

      // 2. De esos candidatos, cuáles YA tenían un cobro ANTES del mes evaluado
      //    (esas ya fueron atribuidas a un mes anterior, no se vuelven a contar aquí)
      let yaCobradosAntes = new Set<number>()
      if (codVentaCandidatos.length > 0) {
        const { data: cobrosAnteriores, error: errAnt } = await supabase
          .from('cobranzas')
          .select('cod_venta')
          .lt('fecha_pago', inicio)
          .in('cod_venta', codVentaCandidatos)

        if (errAnt) throw errAnt
        yaCobradosAntes = new Set((cobrosAnteriores || []).map((c: any) => c.cod_venta))
      }

      // Ventas cuyo PRIMER cobro histórico cae dentro de este mes
      const codVentaAtribuibles = codVentaCandidatos.filter(cv => !yaCobradosAntes.has(cv))

      // 3. Info de las ventas atribuibles a este mes
      let ventasAtribuibles: any[] = []
      if (codVentaAtribuibles.length > 0) {
        const { data, error: errVentas } = await supabase
          .from('ventas')
          .select('cod_venta, cod_vendedor, total_venta, fecha_pedido')
          .in('cod_venta', codVentaAtribuibles)
          .gt('estado', 0)
        if (errVentas) throw errVentas
        ventasAtribuibles = data || []
      }

      // 4. Ventas hechas EN el mes evaluado (para detectar pendientes de cobro)
      const { data: ventasDelMes, error: errVDM } = await supabase
        .from('ventas')
        .select('cod_venta, cod_vendedor, total_venta, fecha_pedido')
        .gte('fecha_pedido', inicio)
        .lte('fecha_pedido', fin)
        .gt('estado', 0)

      if (errVDM) throw errVDM

      const codVentasDelMes = (ventasDelMes || []).map((v: any) => v.cod_venta)

      // 5. De las ventas del mes, cuáles tienen ALGÚN registro de cobro (en cualquier fecha)
      let codVentasConAlgunCobro = new Set<number>()
      if (codVentasDelMes.length > 0) {
        const { data: cobrosExistentes, error: errCE } = await supabase
          .from('cobranzas')
          .select('cod_venta')
          .in('cod_venta', codVentasDelMes)
        if (errCE) throw errCE
        codVentasConAlgunCobro = new Set((cobrosExistentes || []).map((c: any) => c.cod_venta))
      }

      const ventasPendientes = (ventasDelMes || []).filter((v: any) => !codVentasConAlgunCobro.has(v.cod_venta))

      // 6. Ventas del MES ANTERIOR que a la fecha siguen SIN cobro (venta hecha antes, aún abierta)
      const mesAnteriorStr = getMesAnterior(mesStr)
      const { inicio: inicioAnt, fin: finAnt } = getRangoFechas(mesAnteriorStr)

      const { data: ventasMesAnterior, error: errVMA } = await supabase
        .from('ventas')
        .select('cod_venta, cod_vendedor, total_venta, fecha_pedido')
        .gte('fecha_pedido', inicioAnt)
        .lte('fecha_pedido', finAnt)
        .gt('estado', 0)

      if (errVMA) throw errVMA

      const codVentasMesAnterior = (ventasMesAnterior || []).map((v: any) => v.cod_venta)
      let codVentasMesAnteriorConCobro = new Set<number>()
      if (codVentasMesAnterior.length > 0) {
        const { data: cobrosMA, error: errCMA } = await supabase
          .from('cobranzas')
          .select('cod_venta')
          .in('cod_venta', codVentasMesAnterior)
        if (errCMA) throw errCMA
        codVentasMesAnteriorConCobro = new Set((cobrosMA || []).map((c: any) => c.cod_venta))
      }
      const pendientesMesAnterior = (ventasMesAnterior || []).filter((v: any) => !codVentasMesAnteriorConCobro.has(v.cod_venta))

      // ── Construir mapa de montos comisionables y detalle por vendedor ──────
      const mapaTotales: Record<number, number> = {}
      const detalle: Record<number, DetalleVendedor> = {}

      const asegurarVendedor = (id: number) => {
        if (!detalle[id]) detalle[id] = { cobradasMes: [], cobradasHistorico: [], pendientes: [], pendientesMesAnterior: [] }
      }

      ventasAtribuibles.forEach((v: any) => {
        const codVendedor = v.cod_vendedor
        if (!codVendedor) return
        const monto = Number(v.total_venta) || 0
        mapaTotales[codVendedor] = (mapaTotales[codVendedor] || 0) + monto
        asegurarVendedor(codVendedor)

        const esDelPropioMes = v.fecha_pedido >= inicio && v.fecha_pedido <= fin
        const item: DetalleVentaCobro = {
          cod_venta: v.cod_venta,
          total_venta: monto,
          fecha_pedido: v.fecha_pedido,
          fecha_cobro: fechaPrimerCobroDelMes[v.cod_venta] || null,
        }

        if (esDelPropioMes) {
          detalle[codVendedor].cobradasMes.push(item)
        } else {
          detalle[codVendedor].cobradasHistorico.push(item)
        }
      })

      ventasPendientes.forEach((v: any) => {
        const codVendedor = v.cod_vendedor
        if (!codVendedor) return
        asegurarVendedor(codVendedor)
        detalle[codVendedor].pendientes.push({
          cod_venta: v.cod_venta,
          total_venta: Number(v.total_venta) || 0,
          fecha_pedido: v.fecha_pedido,
        })
      })

      pendientesMesAnterior.forEach((v: any) => {
        const codVendedor = v.cod_vendedor
        if (!codVendedor) return
        asegurarVendedor(codVendedor)
        detalle[codVendedor].pendientesMesAnterior.push({
          cod_venta: v.cod_venta,
          total_venta: Number(v.total_venta) || 0,
          fecha_pedido: v.fecha_pedido,
        })
      })

      setMapaVentas(mapaTotales)
      setDetalleVentasPorVendedor(detalle)
    } catch (error) {
      console.error('Error cargando ventas por cobranza:', error)
    } finally {
      setCargandoVentas(false)
    }
  }, [])

  useEffect(() => {
    cargarVentasMes(mesSeleccionado)
  }, [mesSeleccionado, cargarVentasMes])

  // ── Temporadas disponibles ──────────────────────────────────────────────────
  const temporadasDisponibles = useMemo(() => {
    const set = new Set<string>()
    escalas.forEach(e => {
      if (e.temporada) set.add(e.temporada)
    })
    return Array.from(set)
  }, [escalas])

  // ── Escalas filtradas por temporada ─────────────────────────────────────────
  const escalasActuales = useMemo(() => {
    if (!temporadaSel) return escalas
    return escalas.filter(e => e.temporada === temporadaSel)
  }, [escalas, temporadaSel])

  const escalasPlanta = useMemo(() => {
    return escalasActuales.filter(e => (e.tipo || '').toString().trim().toLowerCase() === 'planta')
  }, [escalasActuales])

  // Digital y Virtual comparten la misma lógica y escalas de sueldo base + comisión
  const escalasDigitalVirtual = useMemo(() => {
    return escalasActuales.filter(e => {
      const t = (e.tipo || '').toString().trim().toLowerCase()
      return t === 'digital' || t === 'virtual'
    })
  }, [escalasActuales])

  // ── Función de cálculo individual unificada (Digital y Virtual comparten la misma lógica) ──
  const calcularComision = (v: Vendedor, ventaMonto: number) => {
    const tipoVendedor = (v.tipo || '').toString().trim().toLowerCase()
    const esPlanta = tipoVendedor === 'planta'

    const escalasDelTipo = escalasActuales
      .filter(e => {
        const tEscala = (e.tipo || '').toString().trim().toLowerCase()
        if (esPlanta) return tEscala === 'planta'
        return tEscala === 'digital' || tEscala === 'virtual'
      })
      .sort((a, b) => a.venta_min - b.venta_min)
    
    if (escalasDelTipo.length === 0) {
      return { escalaAlcanzada: null, sueldoBase: 0, pctBase: 0, pctBono: 0, pctTotal: 0, montoComision: 0, totalNeto: 0 }
    }

    let escalaAlcanzada = escalasDelTipo[0]
    for (const esc of escalasDelTipo) {
      if (ventaMonto >= esc.venta_min) {
        escalaAlcanzada = esc
      } else {
        break
      }
    }

    const pctBase = escalaAlcanzada.comision_pct || 0
    const pctBono = v.bono_digital ? 0.5 : 0.0
    const pctTotal = pctBase + pctBono
    const montoComision = ventaMonto * (pctTotal / 100)

    // Planta: 0 de Sueldo Base en esta planilla.
    // Digital / Virtual: Sueldo Base asignado en la escala + comisión.
    const sueldoBase = esPlanta ? 0 : (escalaAlcanzada.sueldo_base || 0)
    const totalNeto = sueldoBase + montoComision

    return { escalaAlcanzada, sueldoBase, pctBase, pctBono, pctTotal, montoComision, totalNeto }
  }

  // ── Lista procesada con Ventas Automáticas ──────────────────────────────
  const calculosPlanilla = useMemo(() => {
    return vendedores.map(v => {
      const vNum = mapaVentas[v.id] || 0
      const calc = calcularComision(v, vNum)
      return { vendedor: v, ventaMonto: vNum, ...calc }
    })
  }, [vendedores, escalasActuales, mapaVentas])

  const planillaFiltrada = useMemo(() => {
    return calculosPlanilla.filter(item => {
      const tipo = (item.vendedor.tipo || '').toString().trim().toLowerCase()
      if (filtroTipo) {
        const f = filtroTipo.toLowerCase()
        if (f === 'digital' || f === 'virtual') {
          if (tipo !== 'digital' && tipo !== 'virtual') return false
        } else if (tipo !== f) {
          return false
        }
      }
      if (busqueda) {
        const q = busqueda.toLowerCase()
        const v = item.vendedor
        const match = [v.nombre, v.ci, v.alias, v.personal?.usuario].some(s => s?.toLowerCase().includes(q))
        if (!match) return false
      }
      return true
    })
  }, [calculosPlanilla, filtroTipo, busqueda])

  // Totales acumulados
  const totales = useMemo(() => {
    return calculosPlanilla.reduce((acc, curr) => ({
      totalVentas: acc.totalVentas + curr.ventaMonto,
      totalSueldosDigital: acc.totalSueldosDigital + curr.sueldoBase,
      totalComisiones: acc.totalComisiones + curr.montoComision,
      totalNetoPagar: acc.totalNetoPagar + curr.totalNeto,
    }), { totalVentas: 0, totalSueldosDigital: 0, totalComisiones: 0, totalNetoPagar: 0 })
  }, [calculosPlanilla])

  // Total de ventas del mes que aún no tienen cobro registrado (se trasladan al mes siguiente)
  const totalPendienteCobro = useMemo(() => {
    return Object.values(detalleVentasPorVendedor).reduce(
      (acc, d) => acc + d.pendientes.reduce((s, p) => s + p.total_venta, 0),
      0
    )
  }, [detalleVentasPorVendedor])

  const cantidadPendientesCobro = useMemo(() => {
    return Object.values(detalleVentasPorVendedor).reduce((acc, d) => acc + d.pendientes.length, 0)
  }, [detalleVentasPorVendedor])

  // ── Generación de PDF (Ver PDF por vendedor) ────────────────────────────────
  const generarPDFVendedor = useCallback((item: (typeof calculosPlanilla)[number]) => {
    const v = item.vendedor
    const det = detalleVentasPorVendedor[v.id] || { cobradasMes: [], cobradasHistorico: [], pendientes: [], pendientesMesAnterior: [] }
    const esPlanta = (v.tipo || '').toString().trim().toLowerCase() === 'planta'

    const filaVenta = (label: string, cod: number, fecha: string, monto: number, fechaCobro?: string | null) => `
      <tr>
        <td>${label}</td>
        <td>${cod}</td>
        <td>${fecha || '-'}</td>
        <td>${fechaCobro || '-'}</td>
        <td style="text-align:right;">Bs. ${fmt(monto)}</td>
      </tr>`

    const filasCobradasMes = det.cobradasMes.map(d => filaVenta('Venta del mes', d.cod_venta, d.fecha_pedido, d.total_venta, d.fecha_cobro)).join('')
    const filasHistorico = det.cobradasHistorico.map(d => filaVenta('Histórico cobrado este mes', d.cod_venta, d.fecha_pedido, d.total_venta, d.fecha_cobro)).join('')
    const filasPendientes = det.pendientes.map(d => `
      <tr>
        <td>Pendiente de cobro</td>
        <td>${d.cod_venta}</td>
        <td>${d.fecha_pedido || '-'}</td>
        <td>-</td>
        <td style="text-align:right;">Bs. ${fmt(d.total_venta)}</td>
      </tr>`).join('')

    const filasPendientesMesAnterior = det.pendientesMesAnterior.map(d => `
      <tr>
        <td>Pendiente mes anterior</td>
        <td>${d.cod_venta}</td>
        <td>${d.fecha_pedido || '-'}</td>
        <td>-</td>
        <td style="text-align:right;">Bs. ${fmt(d.total_venta)}</td>
      </tr>`).join('')

    const totalPendienteVendedor = det.pendientes.reduce((s, p) => s + p.total_venta, 0)
    const totalPendienteMesAnteriorVendedor = det.pendientesMesAnterior.reduce((s, p) => s + p.total_venta, 0)

    const html = `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="utf-8" />
        <title>Comisión ${v.nombre} - ${mesSeleccionado}</title>
        <style>
          body { font-family: Arial, sans-serif; color: #1e293b; padding: 30px; }
          h1 { color: #002855; font-size: 20px; margin-bottom: 2px; }
          .subt { color: #d4af37; font-weight: bold; font-size: 12px; letter-spacing: 0.05em; margin-bottom: 18px; }
          .info { display: flex; justify-content: space-between; margin-bottom: 18px; font-size: 13px; }
          .info div { line-height: 1.6; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 18px; font-size: 12px; }
          th { background: #f1f5f9; color: #002855; text-align: left; padding: 8px 10px; border-bottom: 2px solid #cbd5e1; }
          td { padding: 7px 10px; border-bottom: 1px solid #f1f5f9; }
          h3 { color: #002855; font-size: 13px; border-bottom: 2px solid #002855; padding-bottom: 4px; margin-top: 24px; }
          .resumen { width: 340px; margin-left: auto; font-size: 13px; }
          .resumen td { padding: 6px 10px; }
          .resumen tr.total td { font-weight: bold; font-size: 15px; background: #002855; color: white; }
          .pendiente-box { background: #fef9e7; border-left: 4px solid #d4af37; padding: 10px 14px; margin-top: 10px; font-size: 12px; color: #8a6d0b; }
          @media print { .no-print { display: none; } }
        </style>
      </head>
      <body>
        <h1>MUEBLESS IS BETTER — Recibo de Comisión</h1>
        <div class="subt">Periodo evaluado: ${mesSeleccionado}</div>

        <div class="info">
          <div>
            <strong>Vendedor:</strong> ${v.nombre}<br/>
            <strong>CI:</strong> ${v.ci || '-'}<br/>
            <strong>Tipo:</strong> ${v.tipo}
          </div>
          <div>
            <strong>Nivel alcanzado:</strong> ${item.escalaAlcanzada ? `Niv ${item.escalaAlcanzada.nivel} - ${item.escalaAlcanzada.categoria}` : 'Sin escala'}<br/>
            <strong>% Comisión:</strong> ${item.pctTotal.toFixed(1)}%<br/>
            <strong>Venta comisionable:</strong> Bs. ${fmt(item.ventaMonto)}
          </div>
        </div>

        <h3>Detalle de ventas cobradas este mes (fecha de pedido dentro del periodo)</h3>
        <table>
          <thead><tr><th>Origen</th><th>Cód. Pedido</th><th>Fecha Pedido</th><th>Fecha Cobro</th><th style="text-align:right;">Monto</th></tr></thead>
          <tbody>${filasCobradasMes || '<tr><td colspan="5" style="text-align:center;color:#94a3b8;">Sin ventas cobradas de este periodo</td></tr>'}</tbody>
        </table>

        <h3>Ventas de meses anteriores cobradas en este periodo</h3>
        <table>
          <thead><tr><th>Origen</th><th>Cód. Pedido</th><th>Fecha Pedido</th><th>Fecha Cobro</th><th style="text-align:right;">Monto</th></tr></thead>
          <tbody>${filasHistorico || '<tr><td colspan="5" style="text-align:center;color:#94a3b8;">Sin ventas históricas cobradas este periodo</td></tr>'}</tbody>
        </table>

        ${det.pendientesMesAnterior.length > 0 ? `
        <h3>Ventas del mes anterior que aún no se cobran</h3>
        <table>
          <thead><tr><th>Origen</th><th>Cód. Pedido</th><th>Fecha Pedido</th><th>Fecha Cobro</th><th style="text-align:right;">Monto</th></tr></thead>
          <tbody>${filasPendientesMesAnterior}</tbody>
        </table>
        <div class="pendiente-box">🔶 Bs. ${fmt(totalPendienteMesAnteriorVendedor)} en ventas del mes anterior que siguen sin cobro registrado.</div>
        ` : ''}

        ${det.pendientes.length > 0 ? `
        <h3>Ventas de este mes pendientes de cobro (se trasladan al próximo mes)</h3>
        <table>
          <thead><tr><th>Origen</th><th>Cód. Pedido</th><th>Fecha Pedido</th><th>Fecha Cobro</th><th style="text-align:right;">Monto</th></tr></thead>
          <tbody>${filasPendientes}</tbody>
        </table>
        <div class="pendiente-box">⏳ Bs. ${fmt(totalPendienteVendedor)} en ventas de este mes aún no cobradas. No se incluyen en esta comisión y se evaluarán en el mes en que se registre su cobro.</div>
        ` : ''}

        <h3>Resumen de Pago</h3>
        <table class="resumen">
          <tbody>
            <tr><td>Venta comisionable</td><td style="text-align:right;">Bs. ${fmt(item.ventaMonto)}</td></tr>
            ${!esPlanta ? `<tr><td>Sueldo base</td><td style="text-align:right;">Bs. ${fmt(item.sueldoBase)}</td></tr>` : ''}
            <tr><td>Comisión (${item.pctTotal.toFixed(1)}%)</td><td style="text-align:right;">Bs. ${fmt(item.montoComision)}</td></tr>
            <tr class="total"><td>NETO A PAGAR</td><td style="text-align:right;">Bs. ${fmt(item.totalNeto)}</td></tr>
          </tbody>
        </table>

        <script>window.onload = () => window.print();</script>
      </body>
      </html>`

    const ventana = window.open('', '_blank')
    if (ventana) {
      ventana.document.write(html)
      ventana.document.close()
    }
  }, [detalleVentasPorVendedor, mesSeleccionado])

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Arial, sans-serif' }}>
      <p style={{ color: '#002855', fontWeight: 'bold' }}>Cargando datos de comisiones...</p>
    </div>
  )

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', minHeight: '100vh', backgroundColor: '#f8fafc', paddingBottom: '60px' }}>
      
      {/* Navbar Superior */}
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 40px', backgroundColor: '#002855', color: 'white', flexWrap: 'wrap', gap: '15px' }}>
        <a href="/rrhh" style={{ fontWeight: 'bold', fontSize: '15px', color: 'white', textDecoration: 'none' }}>← Volver a RRHH</a>
        
        <span style={{ color: '#d4af37', fontWeight: 'bold', letterSpacing: '0.05em', fontSize: '16px' }}>
          MUEBLESS IS BETTER — Planilla de Comisiones
        </span>
        
        {/* Selectores de Mes Libre y Temporada */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: 'rgba(255,255,255,0.08)', padding: '4px 10px', borderRadius: '6px' }}>
            <span style={{ fontSize: '11px', color: '#d4af37', textTransform: 'uppercase', fontWeight: 'bold' }}>📅 Mes de Evaluación:</span>
            <input 
              type="month" 
              value={mesSeleccionado}
              onChange={(e) => setMesSeleccionado(e.target.value)}
              style={{
                padding: '4px 8px', borderRadius: '4px', border: '1px solid #d4af37',
                backgroundColor: '#ffffff', color: '#002855', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer', outline: 'none'
              }}
            />
          </div>

          {temporadasDisponibles.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: 'rgba(255,255,255,0.08)', padding: '4px 10px', borderRadius: '6px' }}>
              <span style={{ fontSize: '11px', color: '#d4af37', textTransform: 'uppercase', fontWeight: 'bold' }}>🏆 Temporada:</span>
              <select 
                value={temporadaSel} 
                onChange={e => setTemporadaSel(e.target.value)}
                style={{ padding: '5px 10px', borderRadius: '4px', border: '1px solid #d4af37', backgroundColor: '#ffffff', color: '#002855', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer', outline: 'none' }}
              >
                {temporadasDisponibles.map(temp => (
                  <option key={temp} value={temp}>{temp}</option>
                ))}
              </select>
            </div>
          )}

        </div>
      </nav>

      <div style={{ padding: '28px 40px', maxWidth: '1280px', margin: '0 auto' }}>

        {/* Banner Informativo */}
        <div style={{ backgroundColor: '#e0f2fe', borderLeft: '4px solid #0284c7', padding: '12px 18px', borderRadius: '6px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <span style={{ color: '#0369a1', fontWeight: 'bold', fontSize: '14px' }}>
            Periodo seleccionado: <u style={{ textUnderlineOffset: '3px' }}>{mesSeleccionado}</u>
          </span>
          <span style={{ fontSize: '12px', color: '#0284c7', fontWeight: 'bold' }}>
            ⚡ {cargandoVentas ? 'Recalculando según cobranza...' : 'Comisión calculada según cobro (cash basis): incluye ventas cobradas este mes + histórico cobrado este mes'}
          </span>
        </div>

        {cantidadPendientesCobro > 0 && (
          <div style={{ backgroundColor: '#fef9e7', borderLeft: '4px solid #d4af37', padding: '12px 18px', borderRadius: '6px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            <span style={{ color: '#8a6d0b', fontWeight: 'bold', fontSize: '13px' }}>
              ⏳ {cantidadPendientesCobro} venta(s) de este mes aún sin cobro registrado, por Bs. {fmt(totalPendienteCobro)} — se trasladarán al mes siguiente cuando se registre su cobro.
            </span>
          </div>
        )}

        {/* Sección de Escalas */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h2 style={{ margin: 0, color: '#002855', fontSize: '20px' }}>
              Escalas Salariales — B2C Planta y Digital / Virtual
            </h2>
            <span style={{ fontSize: '12px', color: '#64748b', fontStyle: 'italic' }}>
              * Personal Planta cobra solo comisión. Digital y Virtual comparten la misma lógica de sueldo base + comisión.
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(480px, 1fr))', gap: '20px' }}>
            
            {/* Escalas Planta */}
            <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '18px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <h4 style={{ margin: '0 0 12px', color: '#002855', fontSize: '14px', borderBottom: '2px solid #002855', paddingBottom: '6px' }}>
                🏢 Personal de Planta (Sólo Comisión)
              </h4>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' as const }}>
                {escalasPlanta.map(e => (
                  <div key={e.id} style={{ flex: '1 1 130px', backgroundColor: (NIVEL_COLOR[e.nivel] || '#64748b') + '10', border: `1px solid ${NIVEL_COLOR[e.nivel] || '#64748b'}`, borderRadius: '6px', padding: '10px' }}>
                    <p style={{ margin: 0, fontSize: '10px', fontWeight: 'bold', color: NIVEL_COLOR[e.nivel], textTransform: 'uppercase' }}>
                      Niv {e.nivel} · {e.categoria}
                    </p>
                    <p style={{ margin: '4px 0 2px', fontSize: '11px', color: '#475569' }}>
                      Desde Bs. {fmt(e.venta_min)}
                    </p>
                    <p style={{ margin: 0, fontSize: '13px', fontWeight: 'bold', color: '#0f172a' }}>
                      {e.comision_pct}% com.
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Escalas Digital / Virtual */}
            <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '18px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <h4 style={{ margin: '0 0 12px', color: '#8a6d0b', fontSize: '14px', borderBottom: '2px solid #d4af37', paddingBottom: '6px' }}>
                💻 Personal Digital / Virtual (Sueldo + Comisión)
              </h4>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' as const }}>
                {escalasDigitalVirtual.map(e => (
                  <div key={e.id} style={{ flex: '1 1 130px', backgroundColor: (NIVEL_COLOR[e.nivel] || '#64748b') + '10', border: `1px solid ${NIVEL_COLOR[e.nivel] || '#64748b'}`, borderRadius: '6px', padding: '10px' }}>
                    <p style={{ margin: 0, fontSize: '10px', fontWeight: 'bold', color: NIVEL_COLOR[e.nivel], textTransform: 'uppercase' }}>
                      Niv {e.nivel} · {e.categoria}
                    </p>
                    <p style={{ margin: '4px 0 2px', fontSize: '11px', color: '#475569' }}>
                      Desde Bs. {fmt(e.venta_min)}
                    </p>
                    <p style={{ margin: 0, fontSize: '12px', fontWeight: 'bold', color: '#0f172a' }}>
                      Bs. {fmt(e.sueldo_base)} + {e.comision_pct}%
                    </p>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>

        {/* Tarjetas de Resumen */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px', marginBottom: '24px' }}>
          <div style={cardStatSt}>
            <p style={cardLabelSt}>Total Ventas Cobradas (Comisionable)</p>
            <p style={{ ...cardValSt, color: '#002855' }}>Bs. {fmt(totales.totalVentas)}</p>
          </div>
          <div style={cardStatSt}>
            <p style={cardLabelSt}>Sueldos Base (Digital/Virtual)</p>
            <p style={{ ...cardValSt, color: '#334155' }}>Bs. {fmt(totales.totalSueldosDigital)}</p>
          </div>
          <div style={cardStatSt}>
            <p style={cardLabelSt}>Total Comisiones</p>
            <p style={{ ...cardValSt, color: '#15803d' }}>Bs. {fmt(totales.totalComisiones)}</p>
          </div>
          <div style={cardStatSt}>
            <p style={cardLabelSt}>Pendiente de Cobro (Mes Siguiente)</p>
            <p style={{ ...cardValSt, color: '#d97706' }}>Bs. {fmt(totalPendienteCobro)}</p>
          </div>
          <div style={{ ...cardStatSt, backgroundColor: '#002855', color: 'white' }}>
            <p style={{ ...cardLabelSt, color: '#d4af37' }}>NETO A PAGAR</p>
            <p style={{ ...cardValSt, color: '#ffffff' }}>Bs. {fmt(totales.totalNetoPagar)}</p>
          </div>
        </div>

        {/* Filtros */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' as const }}>
          <input 
            value={busqueda} 
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, CI o usuario..."
            style={{ flex: 1, minWidth: '240px', padding: '10px 14px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', outline: 'none' }} 
          />
          <select 
            value={filtroTipo} 
            onChange={e => setFiltroTipo(e.target.value)}
            style={{ padding: '10px 14px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', outline: 'none', backgroundColor: 'white' }}
          >
            <option value="">Todos los tipos</option>
            <option value="Planta">Planta</option>
            <option value="Digital">Digital / Virtual</option>
          </select>
        </div>

        {/* Tabla de Planilla */}
        <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0', overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '950px' }}>
            <thead>
              <tr style={{ backgroundColor: '#f1f5f9', borderBottom: '2px solid #cbd5e1' }}>
                <th style={thSt}>Vendedor</th>
                <th style={thSt}>Tipo</th>
                <th style={{ ...thSt, width: '170px', textAlign: 'right' }}>Venta Sistema (Bs.)</th>
                <th style={{ ...thSt, width: '150px', textAlign: 'right', color: '#b45309' }}>Pend. Mes Anterior</th>
                <th style={{ ...thSt, width: '150px', textAlign: 'right', color: '#b45309' }}>Pend. Este Mes</th>
                <th style={thSt}>Nivel</th>
                <th style={thSt}>Sueldo Base</th>
                <th style={thSt}>% Comisión</th>
                <th style={thSt}>Monto Comisión</th>
                <th style={{ ...thSt, backgroundColor: '#002855', color: '#d4af37' }}>Neto a Pagar</th>
                <th style={{ ...thSt, textAlign: 'center' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {planillaFiltrada.length === 0 && (
                <tr>
                  <td colSpan={11} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8', fontSize: '14px' }}>
                    No se encontraron vendedores registrados.
                  </td>
                </tr>
              )}
              {planillaFiltrada.map((item, i) => {
                const v = item.vendedor
                const esc = item.escalaAlcanzada
                const colorNivel = esc ? (NIVEL_COLOR[esc.nivel] || '#64748b') : '#94a3b8'
                const esPlanta = (v.tipo || '').toString().trim().toLowerCase() === 'planta'

                return (
                  <tr key={v.id} style={{ borderBottom: '1px solid #f1f5f9', backgroundColor: i % 2 === 0 ? 'white' : '#fafafa' }}>
                    
                    <td style={tdSt}>
                      <button
                        onClick={() => setFilaExpandida(filaExpandida === v.id ? null : v.id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left', width: '100%' }}
                      >
                        <span style={{ fontWeight: 'bold', color: '#002855', fontSize: '14px' }}>
                          {filaExpandida === v.id ? '▾' : '▸'} {v.nombre}
                        </span>
                        <span style={{ display: 'block', fontSize: '11px', color: '#64748b' }}>
                          {v.personal?.cargo || 'Vendedor'} · CI: {v.ci}
                        </span>
                        {(() => {
                          const det = detalleVentasPorVendedor[v.id]
                          const nPend = det?.pendientes.length || 0
                          if (nPend === 0) return null
                          return (
                            <span style={{ display: 'inline-block', marginTop: '4px', backgroundColor: '#fef9e7', color: '#8a6d0b', border: '1px solid #f3e3b3', borderRadius: '4px', padding: '2px 6px', fontSize: '10px', fontWeight: 'bold' }}>
                              ⏳ {nPend} pendiente(s) de cobro
                            </span>
                          )
                        })()}
                      </button>
                    </td>

                    <td style={tdSt}>
                      <span style={{ backgroundColor: esPlanta ? '#e6f0fa' : '#fef9e7', color: esPlanta ? '#002855' : '#8a6d0b', borderRadius: '4px', padding: '3px 8px', fontSize: '11px', fontWeight: 'bold' }}>
                        {v.tipo}
                      </span>
                      {v.bono_digital && (
                        <span style={{ display: 'inline-block', marginLeft: '6px', backgroundColor: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', borderRadius: '4px', padding: '2px 6px', fontSize: '10px', fontWeight: 'bold' }}>
                          +0.5%
                        </span>
                      )}
                    </td>

                    <td style={{ ...tdSt, textAlign: 'right', fontWeight: 'bold', color: item.ventaMonto > 0 ? '#002855' : '#94a3b8', fontSize: '14px' }}>
                      Bs. {fmt(item.ventaMonto)}
                    </td>

                    <td style={{ ...tdSt, textAlign: 'right', color: '#b45309', fontWeight: 'bold' }}>
                      {(() => {
                        const monto = (detalleVentasPorVendedor[v.id]?.pendientesMesAnterior || []).reduce((s, p) => s + p.total_venta, 0)
                        return monto > 0 ? `Bs. ${fmt(monto)}` : <span style={{ color: '#cbd5e1', fontWeight: 'normal' }}>—</span>
                      })()}
                    </td>

                    <td style={{ ...tdSt, textAlign: 'right', color: '#b45309', fontWeight: 'bold' }}>
                      {(() => {
                        const monto = (detalleVentasPorVendedor[v.id]?.pendientes || []).reduce((s, p) => s + p.total_venta, 0)
                        return monto > 0 ? `Bs. ${fmt(monto)}` : <span style={{ color: '#cbd5e1', fontWeight: 'normal' }}>—</span>
                      })()}
                    </td>

                    <td style={tdSt}>
                      {esc ? (
                        <span style={{ backgroundColor: colorNivel + '15', color: colorNivel, border: `1px solid ${colorNivel}`, borderRadius: '4px', padding: '3px 8px', fontSize: '11px', fontWeight: 'bold' }}>
                          Niv {esc.nivel} - {esc.categoria}
                        </span>
                      ) : (
                        <span style={{ color: '#94a3b8', fontSize: '12px' }}>Sin escala</span>
                      )}
                    </td>

                    <td style={{ ...tdSt, fontSize: '12px' }}>
                      {esPlanta ? (
                        <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>En Planilla General</span>
                      ) : (
                        <span style={{ fontWeight: 'bold', color: '#334155' }}>Bs. {fmt(item.sueldoBase)}</span>
                      )}
                    </td>

                    <td style={tdSt}>
                      <span style={{ fontWeight: 'bold', color: '#0f172a' }}>{item.pctTotal.toFixed(1)}%</span>
                      {v.bono_digital && (
                        <span style={{ fontSize: '10px', color: '#166534', display: 'block' }}>
                          ({item.pctBase}% + 0.5%)
                        </span>
                      )}
                    </td>

                    <td style={{ ...tdSt, fontWeight: 'bold', color: '#15803d' }}>
                      Bs. {fmt(item.montoComision)}
                    </td>

                    <td style={{ ...tdSt, fontWeight: 'bold', fontSize: '14px', backgroundColor: '#f8fafc', color: '#002855' }}>
                      Bs. {fmt(item.totalNeto)}
                    </td>

                    <td style={{ ...tdSt, textAlign: 'center' }}>
                      <button 
                        onClick={() => generarPDFVendedor(item)}
                        style={{ padding: '4px 8px', fontSize: '11px', backgroundColor: '#e2e8f0', border: '1px solid #cbd5e1', borderRadius: '4px', cursor: 'pointer', color: '#334155', fontWeight: 'bold' }}
                      >
                        Ver PDF
                      </button>
                    </td>

                  </tr>
                )
              })}

              {filaExpandida !== null && (() => {
                const item = planillaFiltrada.find(it => it.vendedor.id === filaExpandida)
                if (!item) return null
                const det = detalleVentasPorVendedor[filaExpandida] || { cobradasMes: [], cobradasHistorico: [], pendientes: [], pendientesMesAnterior: [] }
                const colDetSt: React.CSSProperties = { padding: '5px 8px', fontSize: '11px' }
                const thDetSt: React.CSSProperties = { padding: '5px 8px', fontSize: '10px', textAlign: 'left', color: '#64748b', textTransform: 'uppercase' }
                const bloque = (titulo: string, color: string, filas: { cod_venta: number; fecha_pedido: string; total_venta: number; fecha_cobro?: string | null }[], nota?: string) => (
                  <div style={{ flex: '1 1 260px', minWidth: '260px' }}>
                    <p style={{ margin: '0 0 6px', fontSize: '11px', fontWeight: 'bold', color }}>{titulo} ({filas.length})</p>
                    {filas.length === 0 ? (
                      <p style={{ fontSize: '11px', color: '#94a3b8', fontStyle: 'italic' }}>Sin registros</p>
                    ) : (
                      <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: 'white', borderRadius: '4px', overflow: 'hidden' }}>
                        <thead>
                          <tr style={{ backgroundColor: '#f8fafc' }}>
                            <th style={thDetSt}>Pedido</th>
                            <th style={thDetSt}>F. Pedido</th>
                            {nota !== 'pendiente' && <th style={thDetSt}>F. Cobro</th>}
                            <th style={{ ...thDetSt, textAlign: 'right' }}>Monto</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filas.map(f => (
                            <tr key={f.cod_venta} style={{ borderTop: '1px solid #f1f5f9' }}>
                              <td style={colDetSt}>{f.cod_venta}</td>
                              <td style={colDetSt}>{f.fecha_pedido}</td>
                              {nota !== 'pendiente' && <td style={colDetSt}>{f.fecha_cobro || '-'}</td>}
                              <td style={{ ...colDetSt, textAlign: 'right', fontWeight: 'bold' }}>Bs. {fmt(f.total_venta)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )
                return (
                  <tr>
                    <td colSpan={11} style={{ backgroundColor: '#f8fafc', padding: '16px 20px', borderBottom: '1px solid #e2e8f0' }}>
                      <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' as const }}>
                        {bloque('✅ Cobradas este mes', '#15803d', det.cobradasMes)}
                        {bloque('🕓 Histórico cobrado este mes', '#0369a1', det.cobradasHistorico)}
                        {bloque('⏳ Pendientes de este mes (→ próximo mes)', '#b45309', det.pendientes, 'pendiente')}
                        {bloque('🔶 Pendientes del mes anterior (aún sin cerrar)', '#b45309', det.pendientesMesAnterior, 'pendiente')}
                      </div>
                    </td>
                  </tr>
                )
              })()}
            </tbody>
          </table>
        </div>

      </div>
    </div>
  )
}

const thSt: React.CSSProperties = { padding: '12px 14px', textAlign: 'left', fontSize: '11px', fontWeight: 'bold', color: '#002855', textTransform: 'uppercase', letterSpacing: '0.05em' }
const tdSt: React.CSSProperties = { padding: '12px 14px', fontSize: '13px' }
const cardStatSt: React.CSSProperties = { backgroundColor: 'white', borderRadius: '8px', padding: '16px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }
const cardLabelSt: React.CSSProperties = { margin: 0, fontSize: '10px', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }
const cardValSt: React.CSSProperties = { margin: '4px 0 0', fontSize: '20px', fontWeight: 'bold' }