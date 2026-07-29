'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase' // Ajusta tu ruta si es necesario
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts'

// ── Utilidades ───────────────────────────────────────────────────────────────
const fmt = (v: number) => `Bs. ${v.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const getMesAnterior = (mesStr: string) => {
  const [anio, mes] = mesStr.split('-').map(Number)
  const fecha = new Date(anio, mes - 2, 1)
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`
}

const getRangoFechas = (mesStr: string) => {
  const [anio, mes] = mesStr.split('-')
  const inicio = `${mesStr}-01`
  const fin = new Date(parseInt(anio), parseInt(mes), 0).toISOString().split('T')[0]
  return { inicio, fin }
}

// ── Estilos (Muebless is Better) ──────────────────────────────────────────────
const COLORS = {
  bg: '#ffffff',
  bgApp: '#f4f7f6',
  primary: '#0a192f', // Azul oscuro
  accent: '#d4af37',  // Dorado
  danger: '#e53935',
  success: '#4caf50',
  text: '#333333',
  textLight: '#666666',
  border: '#e2e8f0'
}

const PIE_COLORS = ['#0a192f', '#d4af37', '#172a45', '#f3d55b', '#303C55', '#e6c84c']

export default function ReporteVentasMensual() {
  const [loading, setLoading] = useState(true)
  const [mesSeleccionado, setMesSeleccionado] = useState(() => {
    const hoy = new Date()
    return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`
  })

  // Estado de Datos
  const [reporteVendedores, setReporteVendedores] = useState<any[]>([])
  const [ventasConDiscrepancia, setVentasConDiscrepancia] = useState<any[]>([])
  const [kpis, setKpis] = useState({
    vendidoActual: 0, cobradoActual: 0, 
    vendidoAnterior: 0, cobradoAnterior: 0,
    pedidosActual: 0
  })

  // ── Cargar Datos ───────────────────────────────────────────────────────────
  const cargarReporte = useCallback(async (mesStr: string) => {
    setLoading(true)
    
    const mesAnterior = getMesAnterior(mesStr)
    const { inicio: iniActual, fin: finActual } = getRangoFechas(mesStr)
    const { inicio: iniAnt, fin: finAnt } = getRangoFechas(mesAnterior)

    try {
      // 1. Obtener vendedores activos
      const { data: vends } = await supabase.from('vendedores').select('id, nombre').eq('activo', true)
      const mapaNombresVendedores: Record<number, string> = {}
      vends?.forEach((v: any) => { mapaNombresVendedores[v.id] = v.nombre })
      
      // 2. Obtener Ventas del mes actual
      const { data: ventasActual } = await supabase.from('ventas')
        .select('cod_venta, cod_vendedor, cod_cliente, total_venta, anticipo, fecha_pedido')
        .gte('fecha_pedido', iniActual).lte('fecha_pedido', finActual).gt('estado', 0)
        
      const { data: ventasAnterior } = await supabase.from('ventas')
        .select('total_venta, anticipo')
        .gte('fecha_pedido', iniAnt).lte('fecha_pedido', finAnt).gt('estado', 0)

      // 3. Cobranzas del mes actual (para flujos de caja y KPIs de ingresos del periodo)
      const { data: cobrosActual } = await supabase.from('cobranzas')
        .select('cod_venta, total_cobrado, observaciones, created_at, ventas!inner(cod_vendedor)')
        .gte('created_at', `${iniActual}T00:00:00`).lte('created_at', `${finActual}T23:59:59`)

      const { data: cobrosAnterior } = await supabase.from('cobranzas')
        .select('total_cobrado')
        .gte('created_at', `${iniAnt}T00:00:00`).lte('created_at', `${finAnt}T23:59:59`)

      // ── 4. CONSULTA HISTÓRICA PARA AUDITORÍA ──
      const codsVentasActuales = ventasActual?.map(v => v.cod_venta) || []
      let historialCobrosVentas: any[] = []
      
      if (codsVentasActuales.length > 0) {
        const { data: todosCobros } = await supabase.from('cobranzas')
          .select('cod_venta, total_cobrado, observaciones, created_at')
          .in('cod_venta', codsVentasActuales)
        historialCobrosVentas = todosCobros || []
      }

      // ── PROCESAMIENTO MES ANTERIOR ──
      let vendidoAnt = 0, cobradoAnt = 0
      ventasAnterior?.forEach(v => {
        vendidoAnt += Number(v.total_venta) || 0
        cobradoAnt += Number(v.anticipo) || 0
      })
      cobrosAnterior?.forEach(c => {
        cobradoAnt += Number(c.total_cobrado) || 0
      })

      // ── PROCESAMIENTO MES ACTUAL ──
      let vendidoAct = 0, cobradoAct = 0
      const rendimientos: Record<number, any> = {}

      if (vends) {
        vends.forEach((v: any) => {
          rendimientos[v.id] = { id: v.id, nombre: v.nombre, vendido: 0, cobrado: 0, pedidos: 0 }
        })
      }

      const controlVentas: Record<number, { 
        cod_venta: number, 
        vendedor: string, 
        totalVenta: number, 
        anticipo: number, 
        cobradoEnMes: number,
        cobradoHistoricoTotal: number,
        observacionesMes: string[],
        observacionesHistoricas: string[]
      }> = {}

      ventasActual?.forEach(v => {
        const totalVenta = Number(v.total_venta) || 0
        const anticipo = Number(v.anticipo) || 0
        vendidoAct += totalVenta
        cobradoAct += anticipo

        if (v.cod_vendedor && rendimientos[v.cod_vendedor]) {
          rendimientos[v.cod_vendedor].vendido += totalVenta
          rendimientos[v.cod_vendedor].cobrado += anticipo
          rendimientos[v.cod_vendedor].pedidos += 1
        }

        controlVentas[v.cod_venta] = {
          cod_venta: v.cod_venta,
          vendedor: mapaNombresVendedores[v.cod_vendedor] || 'Desconocido',
          totalVenta,
          anticipo,
          cobradoEnMes: 0,
          cobradoHistoricoTotal: anticipo,
          observacionesMes: [],
          observacionesHistoricas: []
        }
      })

      cobrosActual?.forEach((c: any) => {
        const monto = Number(c.total_cobrado) || 0
        cobradoAct += monto
        const codVendedor = c.ventas?.cod_vendedor
        if (codVendedor && rendimientos[codVendedor]) {
          rendimientos[codVendedor].cobrado += monto
        }

        if (controlVentas[c.cod_venta]) {
          controlVentas[c.cod_venta].cobradoEnMes += monto
          if (c.observaciones) {
            controlVentas[c.cod_venta].observacionesMes.push(c.observaciones)
          }
        }
      })

      historialCobrosVentas.forEach((c: any) => {
        if (controlVentas[c.cod_venta]) {
          controlVentas[c.cod_venta].cobradoHistoricoTotal += Number(c.total_cobrado) || 0
          if (c.observaciones) {
            controlVentas[c.cod_venta].observacionesHistoricas.push(c.observaciones)
          }
        }
      })

      // Auditoría: Ventas donde el saldo histórico real sigue pendiente
      const discrepancias = Object.values(controlVentas).filter(item => {
        return Math.abs(item.totalVenta - item.cobradoHistoricoTotal) > 1
      }).map(item => ({
        ...item,
        saldoPendienteReal: item.totalVenta - item.cobradoHistoricoTotal,
        estaSaldadoDespues: item.cobradoHistoricoTotal >= item.totalVenta
      }))

      setVentasConDiscrepancia(discrepancias)
      setKpis({
        vendidoActual: vendidoAct,
        cobradoActual: cobradoAct,
        vendidoAnterior: vendidoAnt,
        cobradoAnterior: cobradoAnt,
        pedidosActual: ventasActual?.length || 0
      })

      const arrReporte = Object.values(rendimientos)
        .filter(r => r.vendido > 0 || r.cobrado > 0)
        .sort((a, b) => b.vendido - a.vendido)
      
      setReporteVendedores(arrReporte)

    } catch (error) {
      console.error("Error cargando reporte:", error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    cargarReporte(mesSeleccionado)
  }, [mesSeleccionado, cargarReporte])

  const calcVariacion = (actual: number, anterior: number) => {
    if (anterior === 0) return actual > 0 ? '+100%' : '0%'
    const pct = ((actual - anterior) / anterior) * 100
    const signo = pct > 0 ? '+' : ''
    return `${signo}${pct.toFixed(1)}%`
  }

  const getVariacionColor = (actual: number, anterior: number) => {
    if (actual > anterior) return COLORS.success
    if (actual < anterior) return COLORS.danger
    return COLORS.textLight
  }

  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif', minHeight: '100vh', backgroundColor: COLORS.bgApp, paddingBottom: '40px' }}>
      
      {/* NAVBAR */}
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 5%', backgroundColor: COLORS.primary, color: 'white' }}>
        <div>
          <a href="/sistema" style={{ fontWeight: 'bold', fontSize: '20px', color: 'white', textDecoration: 'none', display: 'block' }}>
            Muebless is Better
          </a>
          <span style={{ fontSize: '11px', color: '#8892b0', letterSpacing: '1px', textTransform: 'uppercase' }}>
            Ingeniería de Interiores
          </span>
        </div>
        <span style={{ color: COLORS.accent, fontWeight: 'bold', letterSpacing: '1px', fontSize: '14px' }}>DASHBOARD FINANCIERO</span>
      </nav>

      <div style={{ padding: '30px 5%', maxWidth: '1400px', margin: '0 auto' }}>
        
        {/* CABECERA Y FILTRO */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '32px' }}>
          <div>
            <h1 style={{ margin: '0 0 8px', fontSize: '28px', color: COLORS.primary }}>Rendimiento Comercial</h1>
            <p style={{ margin: 0, color: COLORS.textLight, fontSize: '14px' }}>
              Análisis financiero de ventas, recaudación y control de saldos históricos.
            </p>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', color: COLORS.textLight, marginBottom: '6px', fontWeight: 'bold' }}>
              Mes de Evaluación
            </label>
            <input 
              type="month" 
              value={mesSeleccionado}
              onChange={(e) => setMesSeleccionado(e.target.value)}
              style={{
                padding: '10px 16px', borderRadius: '6px', border: `1px solid ${COLORS.border}`,
                fontSize: '15px', outline: 'none', cursor: 'pointer',
                backgroundColor: 'white', color: COLORS.primary, fontWeight: 'bold'
              }}
            />
          </div>
        </div>

        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center', color: COLORS.textLight }}>Procesando información financiera...</div>
        ) : (
          <>
            {/* ── KPIs PRINCIPALES ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px', marginBottom: '32px' }}>
              
              <div style={{ backgroundColor: COLORS.bg, borderRadius: '8px', padding: '24px', border: `1px solid ${COLORS.border}`, borderTop: `4px solid ${COLORS.primary}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '12px', color: COLORS.textLight, textTransform: 'uppercase', letterSpacing: '1px' }}>Ventas Cerradas (Mes)</span>
                  <span style={{ fontSize: '12px', fontWeight: 'bold', color: getVariacionColor(kpis.vendidoActual, kpis.vendidoAnterior) }}>
                    {calcVariacion(kpis.vendidoActual, kpis.vendidoAnterior)} vs mes ant.
                  </span>
                </div>
                <div style={{ fontSize: '32px', fontWeight: 'bold', color: COLORS.primary, marginTop: '12px' }}>
                  {fmt(kpis.vendidoActual)}
                </div>
                <div style={{ fontSize: '13px', color: '#888', marginTop: '8px' }}>En {kpis.pedidosActual} pedidos procesados</div>
              </div>

              <div style={{ backgroundColor: COLORS.bg, borderRadius: '8px', padding: '24px', border: `1px solid ${COLORS.border}`, borderTop: `4px solid ${COLORS.accent}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '12px', color: COLORS.textLight, textTransform: 'uppercase', letterSpacing: '1px' }}>Ingresos Reales (Cobrado)</span>
                  <span style={{ fontSize: '12px', fontWeight: 'bold', color: getVariacionColor(kpis.cobradoActual, kpis.cobradoAnterior) }}>
                    {calcVariacion(kpis.cobradoActual, kpis.cobradoAnterior)} vs mes ant.
                  </span>
                </div>
                <div style={{ fontSize: '32px', fontWeight: 'bold', color: COLORS.accent, marginTop: '12px' }}>
                  {fmt(kpis.cobradoActual)}
                </div>
                <div style={{ fontSize: '13px', color: '#888', marginTop: '8px' }}>Anticipos + Cobranzas del mes</div>
              </div>

              <div style={{ backgroundColor: COLORS.bg, borderRadius: '8px', padding: '24px', border: `1px solid ${COLORS.border}`, borderTop: `4px solid ${COLORS.danger}` }}>
                <span style={{ fontSize: '12px', color: COLORS.textLight, textTransform: 'uppercase', letterSpacing: '1px' }}>Déficit / Pendiente de Cobro</span>
                <div style={{ fontSize: '32px', fontWeight: 'bold', color: COLORS.danger, marginTop: '12px' }}>
                  {fmt(Math.max(0, kpis.vendidoActual - kpis.cobradoActual))}
                </div>
                <div style={{ fontSize: '13px', color: '#888', marginTop: '8px' }}>Respecto a las ventas del periodo</div>
              </div>
            </div>

            {/* ── GRÁFICOS (RESPONSIVOS) ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '24px', marginBottom: '32px' }}>
              
              <div style={{ backgroundColor: COLORS.bg, borderRadius: '8px', padding: '24px', border: `1px solid ${COLORS.border}` }}>
                <h3 style={{ marginTop: 0, color: COLORS.primary, fontSize: '16px', marginBottom: '24px' }}>Comparativa: Ventas vs Cobros por Vendedor</h3>
                <div style={{ width: '100%', height: '300px' }}>
                  <ResponsiveContainer>
                    <BarChart data={reporteVendedores} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                      <XAxis dataKey="nombre" axisLine={false} tickLine={false} tick={{fill: COLORS.textLight, fontSize: 12}} />
                      <YAxis axisLine={false} tickLine={false} tick={{fill: COLORS.textLight, fontSize: 12}} width={80} tickFormatter={(v) => `Bs ${(v/1000)}k`} />
                      <Tooltip formatter={(value: any) => fmt(Number(value) || 0)} cursor={{fill: '#f4f7f6'}} />
                      <Legend iconType="circle" wrapperStyle={{ fontSize: '13px' }}/>
                      <Bar dataKey="vendido" name="Total Vendido" fill={COLORS.primary} radius={[4, 4, 0, 0]} />
                      <Bar dataKey="cobrado" name="Total Cobrado" fill={COLORS.accent} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div style={{ backgroundColor: COLORS.bg, borderRadius: '8px', padding: '24px', border: `1px solid ${COLORS.border}` }}>
                <h3 style={{ marginTop: 0, color: COLORS.primary, fontSize: '16px', marginBottom: '24px' }}>Participación de Ventas (Share)</h3>
                <div style={{ width: '100%', height: '300px' }}>
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie
                        data={reporteVendedores}
                        cx="50%" cy="50%"
                        innerRadius={80} outerRadius={110}
                        paddingAngle={2}
                        dataKey="vendido"
                        nameKey="nombre"
                        label={({ nombre, percent }: any) => percent > 0.05 ? `${nombre} (${(percent * 100).toFixed(0)}%)` : ''}
                      >
                        {reporteVendedores.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: any) => fmt(Number(value) || 0)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* ── TABLA DE DETALLES POR VENDEDOR ── */}
            <div style={{ backgroundColor: COLORS.bg, borderRadius: '8px', border: `1px solid ${COLORS.border}`, overflowX: 'auto', marginBottom: '32px' }}>
              <div style={{ padding: '20px 24px', borderBottom: `1px solid ${COLORS.border}`, backgroundColor: '#fcfcfc' }}>
                <h3 style={{ margin: 0, fontSize: '16px', color: COLORS.primary }}>Desglose por Asesor</h3>
              </div>
              <table style={{ width: '100%', minWidth: '600px', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ padding: '16px', textAlign: 'left', borderBottom: `2px solid ${COLORS.primary}`, color: COLORS.primary, fontSize: '13px', textTransform: 'uppercase' }}>Vendedor</th>
                    <th style={{ padding: '16px', textAlign: 'center', borderBottom: `2px solid ${COLORS.primary}`, color: COLORS.primary, fontSize: '13px', textTransform: 'uppercase' }}>Pedidos</th>
                    <th style={{ padding: '16px', textAlign: 'right', borderBottom: `2px solid ${COLORS.primary}`, color: COLORS.primary, fontSize: '13px', textTransform: 'uppercase' }}>Monto Vendido</th>
                    <th style={{ padding: '16px', textAlign: 'right', borderBottom: `2px solid ${COLORS.primary}`, color: COLORS.primary, fontSize: '13px', textTransform: 'uppercase' }}>Monto Cobrado</th>
                    <th style={{ padding: '16px', textAlign: 'right', borderBottom: `2px solid ${COLORS.primary}`, color: COLORS.primary, fontSize: '13px', textTransform: 'uppercase' }}>Eficiencia</th>
                  </tr>
                </thead>
                <tbody>
                  {reporteVendedores.map((v) => {
                    const eficiencia = v.vendido > 0 ? (v.cobrado / v.vendido) * 100 : (v.cobrado > 0 ? 100 : 0)
                    return (
                      <tr key={v.id} style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                        <td style={{ padding: '16px', fontWeight: 'bold', color: COLORS.primary }}>{v.nombre}</td>
                        <td style={{ padding: '16px', textAlign: 'center', color: COLORS.text }}>{v.pedidos}</td>
                        <td style={{ padding: '16px', textAlign: 'right', fontWeight: '600', color: COLORS.text }}>{fmt(v.vendido)}</td>
                        <td style={{ padding: '16px', textAlign: 'right', fontWeight: '600', color: COLORS.accent }}>{fmt(v.cobrado)}</td>
                        <td style={{ padding: '16px', textAlign: 'right' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '12px' }}>
                            <span style={{ fontSize: '13px', fontWeight: '600', width: '45px' }}>{eficiencia.toFixed(1)}%</span>
                            <div style={{ width: '80px', height: '6px', backgroundColor: '#f0f0f0', borderRadius: '3px', overflow: 'hidden' }}>
                              <div style={{ width: `${Math.min(eficiencia, 100)}%`, height: '100%', backgroundColor: eficiencia >= 90 ? COLORS.success : COLORS.accent }}></div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* ── SECCIÓN INFERIOR: AUDITORÍA DE SALDOS REALES ── */}
            <div style={{ backgroundColor: COLORS.bg, borderRadius: '8px', border: `1px solid ${COLORS.border}`, overflowX: 'auto' }}>
              <div style={{ padding: '20px 24px', borderBottom: `1px solid ${COLORS.border}`, backgroundColor: '#fff5f5' }}>
                <h3 style={{ margin: '0 0 4px', fontSize: '16px', color: COLORS.danger }}>⚠️ Auditoría de Saldos: Ventas del Mes con Deuda Histórica Pendiente</h3>
                <p style={{ margin: 0, fontSize: '13px', color: COLORS.textLight }}>
                  Muestra las ventas de este periodo que aún acumulan un saldo pendiente considerando pagos posteriores. Los pedidos ya regularizados en meses siguientes se omiten automáticamente.
                </p>
              </div>

              {ventasConDiscrepancia.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', color: COLORS.success, fontWeight: 'bold', fontSize: '14px' }}>
                  ¡Excelente! Todas las ventas generadas en este mes se encuentran 100% saldadas (ya sea por anticipo total o por pagos complementarios posteriores).
                </div>
              ) : (
                <table style={{ width: '100%', minWidth: '750px', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ padding: '14px 16px', textAlign: 'left', borderBottom: `2px solid ${COLORS.danger}`, color: COLORS.danger, fontSize: '12px', textTransform: 'uppercase' }}>N° Venta</th>
                      <th style={{ padding: '14px 16px', textAlign: 'left', borderBottom: `2px solid ${COLORS.danger}`, color: COLORS.danger, fontSize: '12px', textTransform: 'uppercase' }}>Vendedor</th>
                      <th style={{ padding: '14px 16px', textAlign: 'right', borderBottom: `2px solid ${COLORS.danger}`, color: COLORS.danger, fontSize: '12px', textTransform: 'uppercase' }}>Total Venta</th>
                      <th style={{ padding: '14px 16px', textAlign: 'right', borderBottom: `2px solid ${COLORS.danger}`, color: COLORS.danger, fontSize: '12px', textTransform: 'uppercase' }}>Cobrado Histórico</th>
                      <th style={{ padding: '14px 16px', textAlign: 'right', borderBottom: `2px solid ${COLORS.danger}`, color: COLORS.danger, fontSize: '12px', textTransform: 'uppercase' }}>Saldo Real Pendiente</th>
                      <th style={{ padding: '14px 16px', textAlign: 'left', borderBottom: `2px solid ${COLORS.danger}`, color: COLORS.danger, fontSize: '12px', textTransform: 'uppercase' }}>Observaciones de Caja</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ventasConDiscrepancia.map((item, idx) => (
                      <tr key={idx} style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                        <td style={{ padding: '14px 16px', fontWeight: 'bold', color: COLORS.primary }}>#{item.cod_venta}</td>
                        <td style={{ padding: '14px 16px', color: COLORS.text }}>{item.vendedor}</td>
                        <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: '600' }}>{fmt(item.totalVenta)}</td>
                        <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: '600', color: COLORS.success }}>{fmt(item.cobradoHistoricoTotal)}</td>
                        <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: 'bold', color: COLORS.danger }}>{fmt(item.saldoPendienteReal)}</td>
                        <td style={{ padding: '14px 16px', color: COLORS.textLight, fontSize: '13px' }}>
                          {item.observacionesHistoricas.length > 0 ? item.observacionesHistoricas.join(' | ') : <span style={{ fontStyle: 'italic', color: '#aaa' }}>Sin observaciones registradas</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

          </>
        )}
      </div>
    </div>
  )
}