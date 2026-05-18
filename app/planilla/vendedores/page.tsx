'use client'

// app/planilla/vendedores/page.tsx
// Planilla específica para vendedores:
// muestra ventas del mes, nivel de escala alcanzado y cálculo de pago

import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../../../lib/supabase'

type VendedorPlanilla = {
  personal_id: number; vendedor_id: number; nombre: string; carnet: string
  cargo: string; sucursal: string; alias: string | null; tipo_vendedor: string
  total_ventas: number; num_ventas: number; nivel: number | null
  sueldo_base: number; bono: number; comision_pct: number
  monto_comision: number; total_pago: number; descuento_seguro: number; pago_neto: number
}
type Escala = { nivel: number; venta_min: number; venta_max: number | null; sueldo_base: number; bono: number; comision_pct: number }
type DetalleVenta = { cod_venta: number; fecha_pedido: string; total_venta: number; cliente: string }

const fmt    = (n: number) => new Intl.NumberFormat('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
const fmtMes = (s: string) => new Date(s + '-02').toLocaleDateString('es-BO', { month: 'long', year: 'numeric' })
const mesStr = (d: Date)   => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
const NIVEL_COLOR = ['', '#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899']
const TIPO_CFG: Record<string, { label: string; bg: string; color: string }> = {
  planta:     { label: 'Planta',     bg: '#eff6ff', color: '#1e40af' },
  tienda:     { label: 'Tienda',     bg: '#f0fdf4', color: '#166534' },
  digital:    { label: 'Digital',    bg: '#fdf4ff', color: '#7e22ce' },
  externo:    { label: 'Externo',    bg: '#fff7ed', color: '#9a3412' },
  freelancer: { label: 'Freelancer', bg: '#f0fdf4', color: '#065f46' },
}

function FilaD({ label, val, color, bold }: { label: string; val: string; color: string; bold?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px dashed #eee' }}>
      <span style={{ fontSize: '12px', color: '#555' }}>{label}</span>
      <span style={{ fontSize: bold ? '14px' : '13px', fontWeight: bold ? 'bold' : 'normal', color }}>{val}</span>
    </div>
  )
}

const thSt:   React.CSSProperties = { padding: '13px 16px', textAlign: 'left', fontSize: '11px', fontWeight: 'bold', color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em' }
const tdSt:   React.CSSProperties = { padding: '13px 16px', fontSize: '13px' }
const secTit: React.CSSProperties = { margin: '0 0 8px', fontSize: '10px', fontWeight: 'bold', color: '#888', textTransform: 'uppercase', letterSpacing: '0.1em' }
const btnP:   React.CSSProperties = { flex: 2, padding: '12px', backgroundColor: '#222', border: 'none', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer', color: 'white', fontSize: '14px' }
const btnS:   React.CSSProperties = { flex: 1, padding: '12px', backgroundColor: '#f5f5f5', border: 'none', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer', color: '#666', fontSize: '14px' }

export default function PlanillaVendedores() {
  const [loading,    setLoading]    = useState(true)
  const [mes,        setMes]        = useState(mesStr(new Date()))
  const [escalas,    setEscalas]    = useState<Escala[]>([])
  const [vendedores, setVendedores] = useState<VendedorPlanilla[]>([])
  const [calculando, setCalculando] = useState(false)
  const [error,      setError]      = useState('')
  const [detalle,    setDetalle]    = useState<VendedorPlanilla | null>(null)
  const [ventas,     setVentas]     = useState<DetalleVenta[]>([])
  const [cargandoV,  setCargandoV]  = useState(false)
  const [config,     setConfig]     = useState<any>(null)
  const [filtroTipo, setFiltroTipo] = useState('')

  useEffect(() => {
    const carnet = localStorage.getItem('carnet')
    if (!carnet) return void (window.location.replace('/'))
    supabase.from('personal').select('*, cargos(*)').eq('carnet', carnet).eq('estado', true).single()
      .then(({ data }) => {
        if (!data) return window.location.replace('/')
        const c = data.cargos
        if (!c?.es_admin && !c?.puede_gestionar_rrhh) return window.location.replace('/sistema')
        Promise.all([
          supabase.from('escalas_vendedor').select('*').eq('activa', true).order('nivel').then(({ data: d }) => setEscalas(d || [])),
          supabase.from('configuracion_planilla').select('*').single().then(({ data: d }) => { if (d) setConfig(d) }),
        ]).finally(() => setLoading(false))
      })
  }, [])

  const calcular = async () => {
    if (!escalas.length) return setError('No hay escala activa. Configura una en RRHH → Escalas.')
    setCalculando(true); setError('')
    try {
      const mesDate = `${mes}-01`

      // Paso 1: vendedores activos con personal_id
      const { data: vends, error: errVends } = await supabase.from('vendedores')
        .select('id, nombre, ci, alias, tipo, personal_id')
        .eq('activo', true)
        .not('personal_id', 'is', null)

      console.log('Vendedores encontrados:', vends?.length, 'Error:', errVends)
      if (errVends) throw new Error('Error al cargar vendedores: ' + errVends.message)
      if (!vends?.length) throw new Error('Sin vendedores activos con trabajador asignado')

      // Paso 2: resolver datos de personal por ids únicos
      const personalIds = [...new Set(vends.map((v: any) => v.personal_id))]
      const { data: personalData } = await supabase.from('personal')
        .select('id, usuario, carnet, cargo, sucursal')
        .in('id', personalIds)

      const personalMap: Record<number, any> = {}
      ;(personalData || []).forEach((p: any) => { personalMap[p.id] = p })

      // Paso 3: ventas del mes por vendedor
      const { data: ventasMes } = await supabase.from('ventas_mes_vendedor')
        .select('cod_vendedor, total_ventas, num_ventas').eq('mes', mesDate)

      const ventasMap: Record<number, { total: number; num: number }> = {}
      ;(ventasMes || []).forEach((v: any) => { ventasMap[v.cod_vendedor] = { total: Number(v.total_ventas), num: Number(v.num_ventas) } })

      // Paso 4: calcular por vendedor
      const resultado: VendedorPlanilla[] = (vends as any[]).map(v => {
        const persona     = personalMap[v.personal_id]
        const totalVentas = ventasMap[v.id]?.total || 0
        const numVentas   = ventasMap[v.id]?.num   || 0
        const nivelEscala = escalas.slice().reverse().find(e => totalVentas >= e.venta_min)
        const sueldoBase  = nivelEscala?.sueldo_base  || 0
        const bono        = nivelEscala?.bono         || 0
        const comisionPct = nivelEscala?.comision_pct || 0
        const mtoComision = totalVentas * (comisionPct / 100)
        const totalPago   = sueldoBase + bono + mtoComision
        const descSeguro  = totalPago * ((config?.aporte_empleado_pct || 3) / 100)
        return {
          personal_id: v.personal_id, vendedor_id: v.id,
          nombre: persona?.usuario || v.nombre, carnet: persona?.carnet || v.ci,
          cargo: persona?.cargo || '—', sucursal: persona?.sucursal || '—',
          alias: v.alias, tipo_vendedor: v.tipo,
          total_ventas: totalVentas, num_ventas: numVentas,
          nivel: nivelEscala?.nivel || null,
          sueldo_base: sueldoBase, bono, comision_pct: comisionPct,
          monto_comision: mtoComision, total_pago: totalPago,
          descuento_seguro: descSeguro, pago_neto: Math.max(0, totalPago - descSeguro),
        }
      }).sort((a, b) => b.total_ventas - a.total_ventas)

      setVendedores(resultado)
    } catch (e: any) { setError('Error: ' + e.message) }
    finally { setCalculando(false) }
  }

  const verDetalle = async (v: VendedorPlanilla) => {
    setDetalle(v); setVentas([]); setCargandoV(true)
    try {
      // Mismo rango que ventas_mes_vendedor: usa creado_en con DATE_TRUNC
      const [anio, mesNum] = mes.split('-').map(Number)
      const inicio = new Date(anio, mesNum - 1, 1).toISOString()
      const fin    = new Date(anio, mesNum, 0, 23, 59, 59).toISOString()
      const { data, error: errV } = await supabase.from('ventas')
        .select('cod_venta, fecha_pedido, total_venta, creado_en, clientes(nombre)')
        .eq('cod_vendedor', v.vendedor_id)   // id del vendedor, no cod_venta
        .gte('creado_en', inicio)
        .lte('creado_en', fin)
        .not('estado', 'in', '(0,99)')
        .order('creado_en', { ascending: false })
      if (errV) console.error('Error ventas:', JSON.stringify(errV))
      setVentas((data || []).map((d: any) => ({
        cod_venta:    d.cod_venta,
        fecha_pedido: d.fecha_pedido || d.creado_en?.split('T')[0],
        total_venta:  Number(d.total_venta),
        cliente:      d.clientes?.nombre || '—',
      })))
    } catch (e) { console.error(e) }
    finally { setCargandoV(false) }
  }

  const generarPDF = (v: VendedorPlanilla, vts: DetalleVenta[]) => {
    const nc = v.nivel ? NIVEL_COLOR[v.nivel] || '#666' : '#666'
    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Boleta ${v.nombre}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;color:#1a1a1a}.page{max-width:680px;margin:0 auto;padding:40px 48px}.header{border-bottom:3px solid #1a1a1a;padding-bottom:20px;margin-bottom:24px;display:flex;justify-content:space-between}.empresa{font-size:22px;font-weight:900;text-transform:uppercase}.info-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 32px;margin-bottom:24px;padding:16px;background:#f9f9f9;border-radius:8px}.il{font-size:9px;font-weight:bold;color:#aaa;text-transform:uppercase;letter-spacing:.1em}.iv{font-size:13px;font-weight:bold}.fila{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px dashed #f0f0f0;font-size:13px}.pos{color:#166534;font-weight:bold}.neg{color:#991b1b;font-weight:bold}.total-box{background:#1a1a1a;color:white;border-radius:10px;padding:16px 20px;display:flex;justify-content:space-between;align-items:center;margin:20px 0}.vt{width:100%;border-collapse:collapse;font-size:12px;margin-top:8px}.vt th{background:#f9f9f9;padding:8px 12px;text-align:left;font-size:10px;text-transform:uppercase;color:#888}.vt td{padding:8px 12px;border-bottom:1px solid #f5f5f5}.footer{margin-top:40px;padding-top:16px;border-top:1px solid #eee;display:flex;justify-content:space-between}.fl{width:160px;border-top:1px solid #aaa;margin:0 auto 6px}.flab{font-size:10px;color:#888;text-align:center}@media print{body{print-color-adjust:exact}}</style></head>
<body><div class="page">
<div class="header"><div><div class="empresa">Muebless is Better</div><div style="font-size:12px;color:#888;letter-spacing:.15em;text-transform:uppercase;margin-top:4px">Boleta de Comisiones</div></div><div style="text-align:right"><div style="font-size:16px;font-weight:900">${fmtMes(mes).toUpperCase()}</div><div style="font-size:11px;color:#888;margin-top:2px">${new Date().toLocaleDateString('es-BO')}</div></div></div>
<div class="info-grid"><div><div class="il">Vendedor</div><div class="iv">${v.nombre}</div></div><div><div class="il">Carnet</div><div class="iv">${v.carnet}</div></div><div><div class="il">Cargo</div><div class="iv">${v.cargo}</div></div><div><div class="il">Sucursal</div><div class="iv">${v.sucursal}</div></div><div><div class="il">Tipo</div><div class="iv">${TIPO_CFG[v.tipo_vendedor]?.label || v.tipo_vendedor}</div></div><div><div class="il">ID Vendedor</div><div class="iv">#${v.vendedor_id}</div></div></div>
${v.nivel ? `<div style="display:inline-block;padding:4px 16px;border-radius:20px;font-size:12px;font-weight:bold;color:white;background:${nc};margin-bottom:20px">NIVEL ${v.nivel} — ${v.comision_pct}% comisión</div>` : ''}
<div style="margin-bottom:20px"><div style="font-size:10px;font-weight:bold;color:#888;text-transform:uppercase;letter-spacing:.15em;border-bottom:1px solid #eee;padding-bottom:6px;margin-bottom:10px">Haberes</div>
<div class="fila"><span>Sueldo base${v.nivel ? ` (Nivel ${v.nivel})` : ''}</span><span class="pos">Bs. ${fmt(v.sueldo_base)}</span></div>
${v.bono > 0 ? `<div class="fila"><span>Bono de nivel</span><span class="pos">Bs. ${fmt(v.bono)}</span></div>` : ''}
<div class="fila"><span>Comisiones (${v.comision_pct}% sobre Bs. ${fmt(v.total_ventas)}) — ${v.num_ventas} ventas</span><span class="pos">Bs. ${fmt(v.monto_comision)}</span></div>
<div class="fila" style="border-top:1px solid #ddd;margin-top:4px;padding-top:8px"><strong>Total bruto</strong><span class="pos" style="font-size:15px">Bs. ${fmt(v.total_pago)}</span></div></div>
<div style="margin-bottom:20px"><div style="font-size:10px;font-weight:bold;color:#888;text-transform:uppercase;letter-spacing:.15em;border-bottom:1px solid #eee;padding-bottom:6px;margin-bottom:10px">Descuentos</div>
<div class="fila"><span>Seguro salud CNS (${config?.aporte_empleado_pct || 3}%)</span><span class="neg">- Bs. ${fmt(v.descuento_seguro)}</span></div></div>
<div class="total-box"><div><div style="font-size:11px;opacity:.6;text-transform:uppercase;letter-spacing:.1em">Pago Neto</div><div style="font-size:11px;opacity:.4;margin-top:2px">${fmtMes(mes)}</div></div><div style="font-size:28px;font-weight:900">Bs. ${fmt(v.pago_neto)}</div></div>
${vts.length > 0 ? `<div><div style="font-size:10px;font-weight:bold;color:#888;text-transform:uppercase;letter-spacing:.15em;border-bottom:1px solid #eee;padding-bottom:6px;margin-bottom:8px">Detalle de ventas</div>
<table class="vt"><thead><tr><th>#Venta</th><th>Fecha</th><th>Cliente</th><th style="text-align:right">Monto</th></tr></thead><tbody>
${vts.map(vt => `<tr><td style="font-family:monospace;color:#666">#${vt.cod_venta}</td><td>${new Date(vt.fecha_pedido+'T00:00:00').toLocaleDateString('es-BO',{day:'2-digit',month:'short'})}</td><td>${vt.cliente}</td><td style="text-align:right;font-weight:bold;color:#166534">Bs. ${fmt(vt.total_venta)}</td></tr>`).join('')}
<tr style="border-top:2px solid #ddd"><td colspan="3" style="font-weight:bold;padding-top:8px">Total</td><td style="text-align:right;font-weight:bold;font-size:14px;padding-top:8px">Bs. ${fmt(v.total_ventas)}</td></tr>
</tbody></table></div>` : ''}
<div class="footer"><div><div class="fl"></div><div class="flab">Firma del vendedor</div></div><div><div class="fl"></div><div class="flab">RRHH / Administración</div></div></div>
</div><script>window.onload=()=>window.print()</script></body></html>`
    const win = window.open('', '_blank')
    if (win) { win.document.write(html); win.document.close() }
  }

  const exportarCSV = () => {
    const h = ['Vendedor','Carnet','Cargo','Sucursal','Tipo','Nro Ventas','Total Ventas','Nivel','Sueldo','Bono','Comisión %','Monto Comisión','Total Bruto','Desc. CNS','Pago Neto']
    const r = vf.map(v => [v.nombre,v.carnet,v.cargo,v.sucursal,v.tipo_vendedor,v.num_ventas,v.total_ventas,v.nivel||'—',v.sueldo_base,v.bono,v.comision_pct,v.monto_comision,v.total_pago,v.descuento_seguro,v.pago_neto])
    const csv = [h,...r].map(row => row.map(c=>`"${c}"`).join(',')).join('\n')
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}))
    a.download = `planilla_vendedores_${mes}.csv`; a.click()
  }

  const vf = useMemo(() => vendedores.filter(v => !filtroTipo || v.tipo_vendedor === filtroTipo), [vendedores, filtroTipo])
  const totales = useMemo(() => ({ ventas: vf.reduce((s,v)=>s+v.total_ventas,0), neto: vf.reduce((s,v)=>s+v.pago_neto,0), comisiones: vf.reduce((s,v)=>s+v.monto_comision,0), bruto: vf.reduce((s,v)=>s+v.total_pago,0) }), [vf])

  if (loading) return <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'Arial,sans-serif'}}><p style={{color:'#999'}}>Cargando...</p></div>

  return (
    <div style={{fontFamily:'Arial,sans-serif',minHeight:'100vh',backgroundColor:'#f5f5f5'}}>
      <nav style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'15px 40px',backgroundColor:'#222',color:'white',boxSizing:'border-box' as const,flexWrap:'wrap' as const,gap:'10px'}}>
        <a href="/planilla" style={{fontWeight:'bold',fontSize:'16px',color:'white',textDecoration:'none'}}>← Planilla</a>
        <span style={{color:'#a3c47d',fontWeight:'bold'}}>Planilla Vendedores</span>
        <div style={{display:'flex',gap:'10px'}}>
          {vf.length > 0 && <button onClick={exportarCSV} style={{backgroundColor:'transparent',color:'#a3c47d',border:'1px solid #a3c47d',borderRadius:'20px',padding:'7px 14px',fontWeight:'bold',fontSize:'11px',cursor:'pointer'}}>📥 CSV</button>}
        </div>
      </nav>

      <div style={{padding:'28px 40px',maxWidth:'1200px',margin:'0 auto'}}>
        {/* Controles */}
        <div style={{display:'flex',gap:'12px',marginBottom:'24px',alignItems:'center',flexWrap:'wrap' as const}}>
          <input type="month" value={mes} onChange={e=>setMes(e.target.value)} style={{padding:'9px 14px',border:'1px solid #e5e5e5',borderRadius:'10px',fontSize:'14px',outline:'none',backgroundColor:'white'}} />
          <select value={filtroTipo} onChange={e=>setFiltroTipo(e.target.value)} style={{padding:'9px 14px',border:'1px solid #e5e5e5',borderRadius:'10px',fontSize:'13px',outline:'none',backgroundColor:'white'}}>
            <option value="">Todos los tipos</option>
            {Object.entries(TIPO_CFG).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
          </select>
          <button onClick={calcular} disabled={calculando} style={{backgroundColor:calculando?'#ccc':'#222',color:'white',border:'none',borderRadius:'10px',padding:'9px 24px',fontWeight:'bold',fontSize:'13px',cursor:calculando?'not-allowed':'pointer'}}>
            {calculando ? '⚡ Calculando...' : '⚡ Calcular'}
          </button>
          <a href="/rrhh/escalas" style={{color:'#888',fontSize:'12px',textDecoration:'none',fontWeight:'bold'}}>⚙ Escala activa →</a>
        </div>

        {/* Escala preview */}
        {escalas.length > 0 && (
          <div style={{backgroundColor:'white',borderRadius:'14px',padding:'16px 20px',marginBottom:'24px',boxShadow:'0 1px 6px rgba(0,0,0,0.06)'}}>
            <p style={{margin:'0 0 10px',fontSize:'11px',fontWeight:'bold',color:'#888',textTransform:'uppercase' as const,letterSpacing:'0.08em'}}>Escala activa</p>
            <div style={{display:'flex',gap:'8px',flexWrap:'wrap' as const}}>
              {escalas.map(e=>(
                <div key={e.nivel} style={{backgroundColor:NIVEL_COLOR[e.nivel]+'15',border:`1px solid ${NIVEL_COLOR[e.nivel]}33`,borderRadius:'10px',padding:'8px 14px',minWidth:'150px'}}>
                  <p style={{margin:0,fontSize:'10px',fontWeight:'bold',color:NIVEL_COLOR[e.nivel],textTransform:'uppercase' as const}}>Nivel {e.nivel}</p>
                  <p style={{margin:'2px 0',fontSize:'11px',color:'#555'}}>Bs. {fmt(e.venta_min)} — {e.venta_max?`Bs. ${fmt(e.venta_max)}`:'∞'}</p>
                  <p style={{margin:0,fontSize:'13px',fontWeight:'bold',color:'#222'}}>Bs. {fmt(e.sueldo_base)} + {e.comision_pct}%</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {error && <p style={{color:'#ef4444',fontSize:'13px',marginBottom:'16px'}}>⚠ {error}</p>}

        {/* Totales */}
        {vf.length > 0 && (
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:'12px',marginBottom:'20px'}}>
            {[
              {label:'Total vendido',  val:`Bs. ${fmt(totales.ventas)}`,     color:'#1e40af',bg:'#eff6ff'},
              {label:'Comisiones',     val:`Bs. ${fmt(totales.comisiones)}`, color:'#166534',bg:'#f0fdf4'},
              {label:'Total bruto',    val:`Bs. ${fmt(totales.bruto)}`,      color:'#92400e',bg:'#fffbeb'},
              {label:'Total neto',     val:`Bs. ${fmt(totales.neto)}`,       color:'#1a1a1a',bg:'#f8fafc'},
            ].map(s=>(
              <div key={s.label} style={{backgroundColor:s.bg,borderRadius:'12px',padding:'14px 18px'}}>
                <p style={{margin:0,fontSize:'10px',fontWeight:'bold',color:s.color,textTransform:'uppercase' as const}}>{s.label}</p>
                <p style={{margin:'4px 0 0',fontSize:'15px',fontWeight:'bold',color:s.color}}>{s.val}</p>
              </div>
            ))}
          </div>
        )}

        {/* Tabla */}
        {vf.length === 0
          ? <div style={{textAlign:'center',padding:'60px',color:'#bbb'}}><p style={{fontSize:'40px',margin:'0 0 12px'}}>💼</p><p style={{fontWeight:'bold',fontSize:'14px'}}>Selecciona el mes y presiona Calcular</p></div>
          : <div style={{backgroundColor:'white',borderRadius:'16px',boxShadow:'0 2px 12px rgba(0,0,0,0.07)',overflow:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse',minWidth:'900px'}}>
                <thead>
                  <tr style={{backgroundColor:'#f9f9f9',borderBottom:'2px solid #eee'}}>
                    {['Vendedor','Tipo','Ventas','Nro.','Nivel','Sueldo+Bono','Comisión','CNS','Neto',''].map(h=><th key={h} style={thSt}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {vf.map((v,i)=>{
                    const tc = TIPO_CFG[v.tipo_vendedor]||{label:v.tipo_vendedor,bg:'#f1f5f9',color:'#475569'}
                    const nc = v.nivel?NIVEL_COLOR[v.nivel]:'#cbd5e1'
                    return (
                      <tr key={v.personal_id} style={{borderBottom:'1px solid #f0f0f0',backgroundColor:i%2===0?'white':'#fafafa'}}>
                        <td style={tdSt}><span style={{fontWeight:'bold',fontSize:'14px'}}>{v.nombre}</span><span style={{color:'#aaa',fontSize:'11px',display:'block'}}>{v.cargo} · #{v.vendedor_id}</span></td>
                        <td style={tdSt}><span style={{backgroundColor:tc.bg,color:tc.color,borderRadius:'20px',padding:'3px 10px',fontSize:'11px',fontWeight:'bold'}}>{tc.label}</span></td>
                        <td style={{...tdSt,fontWeight:'bold',color:'#1e40af'}}>Bs. {fmt(v.total_ventas)}</td>
                        <td style={{...tdSt,color:'#888',textAlign:'center' as const}}>{v.num_ventas}</td>
                        <td style={{...tdSt,textAlign:'center' as const}}>
                          {v.nivel?<span style={{backgroundColor:nc+'20',color:nc,borderRadius:'20px',padding:'3px 12px',fontSize:'12px',fontWeight:'bold'}}>N{v.nivel}</span>:<span style={{color:'#ddd',fontSize:'12px'}}>—</span>}
                        </td>
                        <td style={{...tdSt,fontWeight:'bold',color:'#166534'}}>Bs. {fmt(v.sueldo_base+v.bono)}</td>
                        <td style={tdSt}><span style={{fontWeight:'bold',color:'#166534'}}>Bs. {fmt(v.monto_comision)}</span><span style={{color:'#aaa',fontSize:'11px',display:'block'}}>{v.comision_pct}%</span></td>
                        <td style={{...tdSt,color:'#991b1b'}}>- Bs. {fmt(v.descuento_seguro)}</td>
                        <td style={{...tdSt,fontWeight:'bold',fontSize:'16px'}}>Bs. {fmt(v.pago_neto)}</td>
                        <td style={tdSt}>
                          <div style={{display:'flex',gap:'6px'}}>
                            <button onClick={()=>verDetalle(v)} style={{backgroundColor:'#f0f0f0',border:'none',borderRadius:'8px',padding:'6px 12px',fontSize:'11px',cursor:'pointer',fontWeight:'bold'}}>Ver</button>
                            <button onClick={async()=>{await verDetalle(v);}} style={{backgroundColor:'#eff6ff',color:'#1e40af',border:'none',borderRadius:'8px',padding:'6px 12px',fontSize:'11px',cursor:'pointer',fontWeight:'bold'}}>PDF</button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
        }
      </div>

      {/* Modal detalle */}
      {detalle && (
        <div style={{position:'fixed',inset:0,backgroundColor:'rgba(0,0,0,0.5)',display:'flex',alignItems:'center',justifyContent:'center',padding:'20px',zIndex:50,overflowY:'auto'}}>
          <div style={{backgroundColor:'white',borderRadius:'20px',padding:'32px',width:'100%',maxWidth:'560px',boxShadow:'0 20px 60px rgba(0,0,0,0.2)',margin:'auto'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'20px'}}>
              <div>
                <h3 style={{margin:'0 0 4px',fontSize:'17px'}}>{detalle.nombre}</h3>
                <p style={{margin:0,color:'#888',fontSize:'12px'}}>{detalle.cargo} · {detalle.sucursal} · #{detalle.vendedor_id}</p>
              </div>
              <button onClick={()=>setDetalle(null)} style={{backgroundColor:'transparent',border:'none',fontSize:'22px',cursor:'pointer',color:'#aaa'}}>×</button>
            </div>

            {detalle.nivel && (
              <div style={{backgroundColor:NIVEL_COLOR[detalle.nivel]+'15',border:`1px solid ${NIVEL_COLOR[detalle.nivel]}33`,borderRadius:'12px',padding:'10px 16px',marginBottom:'16px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <span style={{fontWeight:'bold',color:NIVEL_COLOR[detalle.nivel]}}>Nivel {detalle.nivel}</span>
                <span style={{color:'#555',fontSize:'13px'}}>Bs. {fmt(detalle.total_ventas)} · {detalle.num_ventas} ventas</span>
              </div>
            )}

            <div style={{backgroundColor:'#f9f9f9',borderRadius:'12px',padding:'16px',marginBottom:'12px'}}>
              <p style={secTit}>Haberes</p>
              <FilaD label="Sueldo base" val={`Bs. ${fmt(detalle.sueldo_base)}`} color="#166534" />
              {detalle.bono>0 && <FilaD label="Bono de nivel" val={`Bs. ${fmt(detalle.bono)}`} color="#166534" />}
              <FilaD label={`Comisiones (${detalle.comision_pct}% sobre Bs. ${fmt(detalle.total_ventas)})`} val={`Bs. ${fmt(detalle.monto_comision)}`} color="#166534" />
              <FilaD label="Total bruto" val={`Bs. ${fmt(detalle.total_pago)}`} color="#166534" bold />
            </div>

            <div style={{backgroundColor:'#fef2f2',borderRadius:'12px',padding:'16px',marginBottom:'12px'}}>
              <p style={secTit}>Descuentos</p>
              <FilaD label={`Seguro salud CNS (${config?.aporte_empleado_pct||3}%)`} val={`- Bs. ${fmt(detalle.descuento_seguro)}`} color="#991b1b" />
            </div>

            <div style={{backgroundColor:'#1a1a1a',borderRadius:'12px',padding:'14px 20px',display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'20px'}}>
              <span style={{color:'#aaa',fontSize:'11px',fontWeight:'bold',textTransform:'uppercase' as const}}>Pago Neto</span>
              <span style={{color:'white',fontSize:'22px',fontWeight:'bold'}}>Bs. {fmt(detalle.pago_neto)}</span>
            </div>

            <p style={secTit}>Ventas del mes</p>
            {cargandoV
              ? <p style={{color:'#aaa',fontSize:'13px',textAlign:'center' as const,padding:'20px'}}>Cargando...</p>
              : ventas.length===0
                ? <p style={{color:'#ccc',fontSize:'13px',textAlign:'center' as const,padding:'16px'}}>Sin ventas registradas</p>
                : <div style={{maxHeight:'200px',overflowY:'auto' as const,border:'1px solid #f0f0f0',borderRadius:'10px',marginBottom:'8px'}}>
                    <table style={{width:'100%',borderCollapse:'collapse'}}>
                      <thead style={{position:'sticky' as const,top:0,backgroundColor:'#f9f9f9'}}>
                        <tr>{['#Venta','Fecha','Cliente','Monto'].map(h=><th key={h} style={{padding:'8px 12px',fontSize:'10px',fontWeight:'bold',color:'#888',textAlign:'left' as const,textTransform:'uppercase' as const}}>{h}</th>)}</tr>
                      </thead>
                      <tbody>
                        {ventas.map(vt=>(
                          <tr key={vt.cod_venta} style={{borderTop:'1px solid #f5f5f5'}}>
                            <td style={{padding:'8px 12px',fontFamily:'monospace',fontSize:'12px',color:'#666'}}>#{vt.cod_venta}</td>
                            <td style={{padding:'8px 12px',fontSize:'12px',color:'#555'}}>{new Date(vt.fecha_pedido+'T00:00:00').toLocaleDateString('es-BO',{day:'2-digit',month:'short'})}</td>
                            <td style={{padding:'8px 12px',fontSize:'12px'}}>{vt.cliente}</td>
                            <td style={{padding:'8px 12px',fontSize:'12px',fontWeight:'bold',color:'#166534'}}>Bs. {fmt(vt.total_venta)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
            }

            <div style={{display:'flex',gap:'10px',marginTop:'16px'}}>
              <button onClick={()=>setDetalle(null)} style={btnS}>Cerrar</button>
              <button onClick={()=>generarPDF(detalle,ventas)} style={btnP}>📄 Generar PDF</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
