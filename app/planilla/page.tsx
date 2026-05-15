'use client'

// app/planilla/page.tsx
// Planilla mensual: calcular, revisar, cerrar y generar boleta PDF por trabajador

import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../../lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────
type Planilla = {
  id: number; personal_id: number; mes: string; tipo_trabajador: string
  sueldo_base: number; bono: number; comisiones: number; total_ventas_mes: number
  monto_horas_extra: number; dias_trabajados: number; dias_falta: number
  medias_faltas: number; minutos_retraso_total: number; horas_extra_min: number
  nivel_vendedor: number | null; descuento_faltas: number; descuento_retrasos: number
  descuento_seguro: number; total_haberes: number; total_descuentos: number
  sueldo_neto: number; estado: string; observacion: string | null
  personal?: any
}
type Persona  = { id: number; usuario: string; carnet: string; cargo: string; tipo_trabajador: string; haber_basico: number | null; sucursal: string }
type Config   = { tolerancia_min: number; retrasos_descuento: number; retrasos_memorandum: number; mult_hora_extra: number; mult_hora_sabado: number; aporte_empleado_pct: number; dias_laborales_mes: number }
type Escala   = { nivel: number; venta_min: number; venta_max: number | null; sueldo_base: number; bono: number; comision_pct: number }

const fmt    = (n: number) => new Intl.NumberFormat('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
const fmtMes = (s: string) => new Date(s + '-02').toLocaleDateString('es-BO', { month: 'long', year: 'numeric' })
const mesStr = (d: Date)   => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

const ESTADO_CFG: Record<string, { label: string; bg: string; color: string }> = {
  borrador: { label: 'Borrador', bg: '#f1f5f9', color: '#64748b' },
  revisado: { label: 'Revisado', bg: '#eff6ff', color: '#1e40af' },
  cerrado:  { label: 'Cerrado',  bg: '#f0fdf4', color: '#166534' },
  pagado:   { label: 'Pagado',   bg: '#fdf4ff', color: '#7e22ce' },
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function PlanillaMensual() {
  const [usuario,    setUsuario]    = useState<any>(null)
  const [loading,    setLoading]    = useState(true)
  const [mes,        setMes]        = useState(mesStr(new Date()))
  const [planillas,  setPlanillas]  = useState<Planilla[]>([])
  const [calculando, setCalculando] = useState(false)
  const [procesando, setProcesando] = useState<number | null>(null)
  const [detalle,    setDetalle]    = useState<Planilla | null>(null)
  const [obs,        setObs]        = useState('')
  const [error,      setError]      = useState('')
  const [config,     setConfig]     = useState<Config | null>(null)
  const [escalas,    setEscalas]    = useState<Escala[]>([])
  const [filtroEstado, setFiltroEstado] = useState('')

  useEffect(() => {
    const carnet = localStorage.getItem('carnet')
    if (!carnet) return void (window.location.replace('/'))
    supabase.from('personal').select('*, cargos(*)').eq('carnet', carnet).eq('estado', true).single()
      .then(({ data }) => {
        if (!data) return window.location.replace('/')
        const c = data.cargos
        if (!c?.es_admin && !c?.puede_gestionar_rrhh) return window.location.replace('/sistema')
        setUsuario(data)
        Promise.all([loadConfig(), loadEscalas(), loadPlanillas(mes)]).finally(() => setLoading(false))
      })
  }, [])

  useEffect(() => { if (!loading) loadPlanillas(mes) }, [mes])

  // ── Loaders ────────────────────────────────────────────────────────────────
  const loadConfig = async () => {
    const { data } = await supabase.from('configuracion_planilla').select('*').single()
    if (data) setConfig(data)
  }

  const loadEscalas = async () => {
    const { data } = await supabase.from('escalas_vendedor').select('*').eq('activa', true).order('nivel')
    setEscalas(data || [])
  }

  const loadPlanillas = async (m: string) => {
    const mesDate = `${m}-01`
    const { data } = await supabase.from('planillas')
      .select('*, personal!planillas_personal_id_fkey(id, usuario, carnet, cargo, sucursal, tipo_trabajador, haber_basico)')
      .eq('mes', mesDate)
      .order('personal_id')
    setPlanillas((data as any) || [])
  }

  // ── Calcular planilla del mes ──────────────────────────────────────────────
  const calcularPlanilla = async () => {
    if (!config) return alert('Carga la configuración primero')
    setCalculando(true); setError('')
    try {
      const mesDate  = `${mes}-01`
      const mesInicio = `${mes}-01`
      const mesFin    = `${mes}-31`

      // 1. Personal activo
      const { data: personal } = await supabase.from('personal')
        .select('id, usuario, carnet, cargo, sucursal, tipo_trabajador, haber_basico')
        .eq('estado', true)

      if (!personal?.length) throw new Error('Sin personal activo')

      // 2. Registros de asistencia del mes
      const { data: registros } = await supabase.from('registros_asistencia')
        .select('personal_id, tipo, minutos_retraso, minutos_extra, es_sabado, hora_entrada')
        .gte('fecha', mesInicio).lte('fecha', mesFin)

      // 3. Ventas del mes por vendedor
      const { data: ventasMes } = await supabase.from('ventas_mes_vendedor')
        .select('cod_vendedor, total_ventas')
        .eq('mes', mesDate)

      const ventasMap: Record<number, number> = {}
      ;(ventasMes || []).forEach((v: any) => { ventasMap[v.cod_vendedor] = Number(v.total_ventas) })

      // 4. Calcular por persona
      const upserts: any[] = []

      for (const p of personal) {
        const regsPersona = (registros || []).filter(r => r.personal_id === p.id)

        // Asistencia
        const diasTrabajados     = regsPersona.filter(r => r.hora_entrada).length
        const diasFalta          = regsPersona.filter(r => r.tipo === 'falta').length
        const mediasFaltas       = regsPersona.filter(r => r.tipo === 'media_falta').length
        const minRetrasoTotal    = regsPersona.reduce((s, r) => s + (r.minutos_retraso || 0), 0)
        const minExtra           = regsPersona.reduce((s, r) => s + (r.minutos_extra || 0), 0)
        const minExtraSabado     = regsPersona.filter(r => r.es_sabado).reduce((s, r) => s + (r.minutos_extra || 0), 0)

        // Valor día y minuto
        const sueldoBase         = Number(p.haber_basico || 0)
        const valorDia           = sueldoBase / (config.dias_laborales_mes || 26)
        const valorMinuto        = valorDia / 480 // 8 horas

        // Descuentos (solo para fijos)
        let descFaltas    = 0
        let descRetrasos  = 0
        if (p.tipo_trabajador === 'fijo' || p.tipo_trabajador === 'medio_tiempo') {
          descFaltas   = (diasFalta * valorDia) + (mediasFaltas * valorDia * 0.5)
          const retrasos = regsPersona.filter(r => r.tipo.startsWith('retraso')).length
          if (retrasos >= config.retrasos_descuento) descRetrasos = minRetrasoTotal * valorMinuto
        }

        // Horas extra
        const minExtraNormal = minExtra - minExtraSabado
        const valorHora      = sueldoBase / (config.dias_laborales_mes * 8)
        const montoExtra     = (minExtraNormal / 60 * valorHora * config.mult_hora_extra) + (minExtraSabado / 60 * valorHora * config.mult_hora_sabado)

        // Vendedor: escala + comisión + bono
        let bonoPlanilla   = 0
        let comisiones     = 0
        let totalVentas    = 0
        let nivelAlcanzado = null
        let sueldoEscala   = sueldoBase

        if (p.tipo_trabajador === 'vendedor' && escalas.length > 0) {
          totalVentas = ventasMap[p.id] || 0
          const nivel = escalas.slice().reverse().find(e => totalVentas >= e.venta_min)
          if (nivel) {
            sueldoEscala   = nivel.sueldo_base
            bonoPlanilla   = nivel.bono
            comisiones     = totalVentas * (nivel.comision_pct / 100)
            nivelAlcanzado = nivel.nivel
          }
        }

        const sueldoFinal   = p.tipo_trabajador === 'vendedor' ? sueldoEscala : sueldoBase
        const descSeguro    = sueldoFinal * (config.aporte_empleado_pct / 100)
        const totalHaberes  = sueldoFinal + bonoPlanilla + comisiones + montoExtra
        const totalDescuentos = descFaltas + descRetrasos + descSeguro
        const sueldoNeto    = Math.max(0, totalHaberes - totalDescuentos)

        upserts.push({
          personal_id:          p.id,
          mes:                  mesDate,
          tipo_trabajador:      p.tipo_trabajador || 'fijo',
          sueldo_base:          sueldoFinal,
          bono:                 bonoPlanilla,
          comisiones,
          total_ventas_mes:     totalVentas,
          monto_horas_extra:    montoExtra,
          dias_trabajados:      diasTrabajados,
          dias_falta:           diasFalta,
          medias_faltas:        mediasFaltas,
          minutos_retraso_total:minRetrasoTotal,
          horas_extra_min:      minExtra,
          nivel_vendedor:       nivelAlcanzado,
          descuento_faltas:     descFaltas,
          descuento_retrasos:   descRetrasos,
          descuento_seguro:     descSeguro,
          total_haberes:        totalHaberes,
          total_descuentos:     totalDescuentos,
          sueldo_neto:          sueldoNeto,
          estado:               'borrador',
          generado_por:         usuario.id,
          generado_at:          new Date().toISOString(),
        })
      }

      const { error: err } = await supabase.from('planillas')
        .upsert(upserts, { onConflict: 'personal_id,mes', ignoreDuplicates: false })
      if (err) throw err

      await loadPlanillas(mes)
    } catch (e: any) {
      setError('Error al calcular: ' + e.message)
    } finally {
      setCalculando(false)
    }
  }

  // ── Cambiar estado ─────────────────────────────────────────────────────────
  const cambiarEstado = async (id: number, estado: string) => {
    setProcesando(id)
    try {
      const update: any = { estado }
      if (estado === 'cerrado') { update.cerrado_por = usuario.id; update.cerrado_at = new Date().toISOString() }
      if (obs.trim()) update.observacion = obs.trim()
      await supabase.from('planillas').update(update).eq('id', id)
      setDetalle(null); setObs('')
      await loadPlanillas(mes)
    } catch (e: any) { setError('Error: ' + e.message) }
    finally { setProcesando(null) }
  }

  // ── Cerrar mes completo ────────────────────────────────────────────────────
  const cerrarMesCompleto = async () => {
    if (!confirm('¿Cerrar todas las planillas revisadas? Esta acción no se puede deshacer.')) return
    setProcesando(-1)
    try {
      const revisadas = planillas.filter(p => p.estado === 'revisado').map(p => p.id)
      if (!revisadas.length) { alert('No hay planillas en estado "Revisado"'); return }
      await supabase.from('planillas').update({ estado: 'cerrado', cerrado_por: usuario.id, cerrado_at: new Date().toISOString() }).in('id', revisadas)
      await loadPlanillas(mes)
    } catch (e: any) { setError('Error: ' + e.message) }
    finally { setProcesando(null) }
  }

  // ── Generar boleta PDF ─────────────────────────────────────────────────────
  const generarPDF = (p: Planilla) => {
    const persona  = p.personal
    const mesLabel = fmtMes(mes)
    const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Boleta ${persona?.usuario} — ${mesLabel}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; color: #1a1a1a; background: white; }
  .page { max-width: 680px; margin: 0 auto; padding: 40px 48px; }
  .header { border-bottom: 3px solid #1a1a1a; padding-bottom: 20px; margin-bottom: 24px; }
  .empresa { font-size: 22px; font-weight: 900; letter-spacing: -0.5px; text-transform: uppercase; }
  .subtitulo { font-size: 12px; color: #888; letter-spacing: 0.15em; text-transform: uppercase; margin-top: 4px; }
  .boleta-titulo { font-size: 14px; font-weight: bold; text-align: right; color: #444; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 32px; margin-bottom: 24px; padding: 16px; background: #f9f9f9; border-radius: 8px; }
  .info-row { display: flex; flex-direction: column; }
  .info-label { font-size: 9px; font-weight: bold; color: #aaa; text-transform: uppercase; letter-spacing: 0.1em; }
  .info-val { font-size: 13px; font-weight: bold; color: #222; }
  .seccion { margin-bottom: 20px; }
  .seccion-titulo { font-size: 10px; font-weight: bold; color: #888; text-transform: uppercase; letter-spacing: 0.15em; border-bottom: 1px solid #eee; padding-bottom: 6px; margin-bottom: 10px; }
  .fila { display: flex; justify-content: space-between; align-items: center; padding: 5px 0; border-bottom: 1px dashed #f0f0f0; }
  .fila:last-child { border-bottom: none; }
  .fila-label { font-size: 13px; color: #444; }
  .fila-val { font-size: 13px; font-weight: bold; }
  .fila-val.positivo { color: #166534; }
  .fila-val.negativo { color: #991b1b; }
  .fila-sub { font-size: 11px; color: #aaa; margin-top: 1px; }
  .total-box { background: #1a1a1a; color: white; border-radius: 10px; padding: 16px 20px; display: flex; justify-content: space-between; align-items: center; margin-top: 20px; }
  .total-label { font-size: 12px; font-weight: bold; letter-spacing: 0.1em; text-transform: uppercase; opacity: 0.7; }
  .total-monto { font-size: 28px; font-weight: 900; }
  .estado-badge { display: inline-block; padding: 3px 12px; border-radius: 20px; font-size: 10px; font-weight: bold; background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0; }
  .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #eee; display: flex; justify-content: space-between; }
  .firma-box { text-align: center; }
  .firma-line { width: 160px; border-top: 1px solid #aaa; margin: 0 auto 6px; }
  .firma-label { font-size: 10px; color: #888; }
  @media print { .no-print { display: none; } body { print-color-adjust: exact; } }
</style>
</head>
<body>
<div class="page">
  <div class="header" style="display:flex;justify-content:space-between;align-items:flex-start;">
    <div>
      <div class="empresa">Muebless is Better</div>
      <div class="subtitulo">Boleta de Pago</div>
    </div>
    <div class="boleta-titulo">
      <div style="font-size:16px;font-weight:900;">${mesLabel.toUpperCase()}</div>
      <div style="font-size:11px;color:#888;margin-top:2px;">${new Date().toLocaleDateString('es-BO')}</div>
      <span class="estado-badge" style="margin-top:6px;display:inline-block;">${ESTADO_CFG[p.estado]?.label}</span>
    </div>
  </div>

  <div class="info-grid">
    <div class="info-row"><span class="info-label">Trabajador</span><span class="info-val">${persona?.usuario || '—'}</span></div>
    <div class="info-row"><span class="info-label">Carnet</span><span class="info-val">${persona?.carnet || '—'}</span></div>
    <div class="info-row"><span class="info-label">Cargo</span><span class="info-val">${persona?.cargo || '—'}</span></div>
    <div class="info-row"><span class="info-label">Sucursal</span><span class="info-val">${persona?.sucursal || '—'}</span></div>
    <div class="info-row"><span class="info-label">Tipo</span><span class="info-val">${p.tipo_trabajador === 'fijo' ? 'Planta' : p.tipo_trabajador === 'vendedor' ? 'Vendedor' : 'Medio tiempo'}</span></div>
    <div class="info-row"><span class="info-label">Días trabajados</span><span class="info-val">${p.dias_trabajados}</span></div>
  </div>

  <div class="seccion">
    <div class="seccion-titulo">Haberes</div>
    <div class="fila"><span class="fila-label">Sueldo base${p.nivel_vendedor ? ` (Nivel ${p.nivel_vendedor})` : ''}</span><span class="fila-val positivo">Bs. ${fmt(p.sueldo_base)}</span></div>
    ${p.bono > 0 ? `<div class="fila"><span class="fila-label">Bono por nivel</span><span class="fila-val positivo">Bs. ${fmt(p.bono)}</span></div>` : ''}
    ${p.comisiones > 0 ? `<div class="fila"><span class="fila-label">Comisiones<div class="fila-sub">Ventas del mes: Bs. ${fmt(p.total_ventas_mes)}</div></span><span class="fila-val positivo">Bs. ${fmt(p.comisiones)}</span></div>` : ''}
    ${p.monto_horas_extra > 0 ? `<div class="fila"><span class="fila-label">Horas extra<div class="fila-sub">${Math.floor(p.horas_extra_min/60)}h ${p.horas_extra_min%60}m</div></span><span class="fila-val positivo">Bs. ${fmt(p.monto_horas_extra)}</span></div>` : ''}
    <div class="fila" style="border-top:1px solid #ddd;margin-top:4px;padding-top:8px;"><span class="fila-label" style="font-weight:bold;">Total haberes</span><span class="fila-val positivo" style="font-size:15px;">Bs. ${fmt(p.total_haberes)}</span></div>
  </div>

  <div class="seccion">
    <div class="seccion-titulo">Descuentos</div>
    ${p.descuento_faltas > 0 ? `<div class="fila"><span class="fila-label">Faltas (${p.dias_falta} día${p.dias_falta !== 1 ? 's' : ''}${p.medias_faltas > 0 ? ` · ${p.medias_faltas} media${p.medias_faltas !== 1 ? 's' : ''}` : ''})</span><span class="fila-val negativo">- Bs. ${fmt(p.descuento_faltas)}</span></div>` : ''}
    ${p.descuento_retrasos > 0 ? `<div class="fila"><span class="fila-label">Retrasos (${p.minutos_retraso_total} min acumulados)</span><span class="fila-val negativo">- Bs. ${fmt(p.descuento_retrasos)}</span></div>` : ''}
    <div class="fila"><span class="fila-label">Seguro de salud CNS (${config?.aporte_empleado_pct || 3}%)</span><span class="fila-val negativo">- Bs. ${fmt(p.descuento_seguro)}</span></div>
    <div class="fila" style="border-top:1px solid #ddd;margin-top:4px;padding-top:8px;"><span class="fila-label" style="font-weight:bold;">Total descuentos</span><span class="fila-val negativo" style="font-size:15px;">- Bs. ${fmt(p.total_descuentos)}</span></div>
  </div>

  ${p.observacion ? `<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px 14px;margin-bottom:16px;font-size:12px;color:#92400e;"><strong>Nota:</strong> ${p.observacion}</div>` : ''}

  <div class="total-box">
    <div><div class="total-label">Sueldo Neto a Cobrar</div><div style="font-size:11px;opacity:0.5;margin-top:2px;">${mesLabel}</div></div>
    <div class="total-monto">Bs. ${fmt(p.sueldo_neto)}</div>
  </div>

  <div class="footer">
    <div class="firma-box"><div class="firma-line"></div><div class="firma-label">Firma del trabajador</div></div>
    <div class="firma-box"><div class="firma-line"></div><div class="firma-label">RRHH / Administración</div></div>
  </div>
</div>
<script>window.onload = () => window.print()</script>
</body>
</html>`

    const win = window.open('', '_blank')
    if (win) { win.document.write(html); win.document.close() }
  }

  // ── Filtros ────────────────────────────────────────────────────────────────
  const planillasFiltradas = useMemo(() =>
    planillas.filter(p => !filtroEstado || p.estado === filtroEstado),
    [planillas, filtroEstado]
  )

  const stats = useMemo(() => ({
    total:    planillas.length,
    borrador: planillas.filter(p => p.estado === 'borrador').length,
    revisado: planillas.filter(p => p.estado === 'revisado').length,
    cerrado:  planillas.filter(p => p.estado === 'cerrado').length,
    sumaTotal:planillas.reduce((s, p) => s + p.sueldo_neto, 0),
  }), [planillas])

  if (loading) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Arial, sans-serif' }}><p style={{ color: '#999' }}>Cargando...</p></div>

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', minHeight: '100vh', backgroundColor: '#f5f5f5' }}>
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 40px', backgroundColor: '#222', color: 'white', boxSizing: 'border-box' as const, flexWrap: 'wrap' as const, gap: '10px' }}>
        <a href="/sistema" style={{ fontWeight: 'bold', fontSize: '16px', color: 'white', textDecoration: 'none' }}>← Sistema</a>
        <span style={{ color: '#a3c47d', fontWeight: 'bold' }}>Planilla Mensual</span>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <a href="/rrhh/escalas" style={{ color: '#a3c47d', fontSize: '12px', fontWeight: 'bold', textDecoration: 'none' }}>⚙ Escalas</a>
          {stats.revisado > 0 && (
            <button onClick={cerrarMesCompleto} disabled={procesando !== null} style={{ backgroundColor: '#166534', color: 'white', border: 'none', borderRadius: '20px', padding: '7px 16px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}>
              🔒 Cerrar {stats.revisado} planilla{stats.revisado !== 1 ? 's' : ''}
            </button>
          )}
        </div>
      </nav>

      <div style={{ padding: '28px 40px', maxWidth: '1200px', margin: '0 auto' }}>

        {/* Controles */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', alignItems: 'center', flexWrap: 'wrap' as const }}>
          <input type="month" value={mes} onChange={e => setMes(e.target.value)}
            style={{ padding: '9px 14px', border: '1px solid #e5e5e5', borderRadius: '10px', fontSize: '14px', outline: 'none', backgroundColor: 'white' }} />
          <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}
            style={{ padding: '9px 14px', border: '1px solid #e5e5e5', borderRadius: '10px', fontSize: '13px', outline: 'none', backgroundColor: 'white' }}>
            <option value="">Todos los estados</option>
            {Object.entries(ESTADO_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <button onClick={calcularPlanilla} disabled={calculando}
            style={{ backgroundColor: calculando ? '#ccc' : '#222', color: 'white', border: 'none', borderRadius: '10px', padding: '9px 24px', fontWeight: 'bold', fontSize: '13px', cursor: calculando ? 'not-allowed' : 'pointer' }}>
            {calculando ? '⚡ Calculando...' : '⚡ Calcular planilla'}
          </button>
        </div>

        {/* Stats */}
        {planillas.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '24px' }}>
            {[
              { label: 'Total personal', val: stats.total,    color: '#475569', bg: '#f8fafc' },
              { label: 'Borrador',       val: stats.borrador, color: '#64748b', bg: '#f1f5f9' },
              { label: 'Revisados',      val: stats.revisado, color: '#1e40af', bg: '#eff6ff' },
              { label: 'Cerrados',       val: stats.cerrado,  color: '#166534', bg: '#f0fdf4' },
            ].map(s => (
              <div key={s.label} style={{ backgroundColor: s.bg, borderRadius: '12px', padding: '14px 18px' }}>
                <p style={{ margin: 0, fontSize: '10px', fontWeight: 'bold', color: s.color, textTransform: 'uppercase' as const }}>{s.label}</p>
                <p style={{ margin: '4px 0 0', fontSize: '24px', fontWeight: 'bold', color: s.color }}>{s.val}</p>
              </div>
            ))}
            <div style={{ backgroundColor: '#1a1a1a', borderRadius: '12px', padding: '14px 18px' }}>
              <p style={{ margin: 0, fontSize: '10px', fontWeight: 'bold', color: '#aaa', textTransform: 'uppercase' as const }}>Total neto</p>
              <p style={{ margin: '4px 0 0', fontSize: '16px', fontWeight: 'bold', color: 'white' }}>Bs. {fmt(stats.sumaTotal)}</p>
            </div>
          </div>
        )}

        {error && <p style={{ color: '#ef4444', fontSize: '13px', marginBottom: '16px' }}>⚠ {error}</p>}

        {/* Tabla */}
        {planillasFiltradas.length === 0
          ? <div style={{ textAlign: 'center', padding: '60px', color: '#bbb' }}><p style={{ fontSize: '40px', margin: '0 0 12px' }}>📋</p><p style={{ fontWeight: 'bold', fontSize: '14px' }}>Sin planillas. Presiona "Calcular planilla" para generar.</p></div>
          : (
          <div style={{ backgroundColor: 'white', borderRadius: '16px', boxShadow: '0 2px 12px rgba(0,0,0,0.07)', overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '900px' }}>
              <thead>
                <tr style={{ backgroundColor: '#f9f9f9', borderBottom: '2px solid #eee' }}>
                  {['Trabajador','Tipo','Haberes','Descuentos','Neto','Asistencia','Estado',''].map(h => (
                    <th key={h} style={{ padding: '13px 16px', textAlign: 'left' as const, fontSize: '11px', fontWeight: 'bold', color: '#888', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {planillasFiltradas.map((p, i) => {
                  const persona = p.personal
                  const estadoCfg = ESTADO_CFG[p.estado]
                  return (
                    <tr key={p.id} style={{ borderBottom: '1px solid #f0f0f0', backgroundColor: i % 2 === 0 ? 'white' : '#fafafa' }}>
                      <td style={{ padding: '13px 16px' }}>
                        <span style={{ fontWeight: 'bold', fontSize: '14px' }}>{persona?.usuario}</span><br />
                        <span style={{ color: '#aaa', fontSize: '11px', fontFamily: 'monospace' }}>{persona?.carnet}</span>
                      </td>
                      <td style={{ padding: '13px 16px', fontSize: '12px', color: '#666' }}>
                        {p.tipo_trabajador === 'fijo' ? '🏢 Planta' : p.tipo_trabajador === 'vendedor' ? `💼 Vendedor${p.nivel_vendedor ? ` N${p.nivel_vendedor}` : ''}` : '⏰ Medio tiempo'}
                      </td>
                      <td style={{ padding: '13px 16px', fontWeight: 'bold', color: '#166534', fontSize: '14px' }}>Bs. {fmt(p.total_haberes)}</td>
                      <td style={{ padding: '13px 16px', fontWeight: 'bold', color: '#991b1b', fontSize: '14px' }}>- Bs. {fmt(p.total_descuentos)}</td>
                      <td style={{ padding: '13px 16px', fontWeight: 'bold', color: '#1a1a1a', fontSize: '16px' }}>Bs. {fmt(p.sueldo_neto)}</td>
                      <td style={{ padding: '13px 16px', fontSize: '12px', color: '#666' }}>
                        {p.dias_trabajados}d · {p.dias_falta > 0 && <span style={{ color: '#ef4444' }}>{p.dias_falta}F </span>}{p.minutos_retraso_total > 0 && <span style={{ color: '#f59e0b' }}>{p.minutos_retraso_total}m</span>}
                      </td>
                      <td style={{ padding: '13px 16px' }}>
                        <span style={{ backgroundColor: estadoCfg.bg, color: estadoCfg.color, borderRadius: '20px', padding: '3px 12px', fontSize: '11px', fontWeight: 'bold' }}>
                          {estadoCfg.label}
                        </span>
                      </td>
                      <td style={{ padding: '13px 16px' }}>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'nowrap' as const }}>
                          <button onClick={() => { setDetalle(p); setObs(p.observacion || '') }} style={{ backgroundColor: '#f0f0f0', border: 'none', borderRadius: '8px', padding: '6px 12px', fontSize: '11px', cursor: 'pointer', fontWeight: 'bold', whiteSpace: 'nowrap' as const }}>Ver</button>
                          <button onClick={() => generarPDF(p)} style={{ backgroundColor: '#eff6ff', color: '#1e40af', border: 'none', borderRadius: '8px', padding: '6px 12px', fontSize: '11px', cursor: 'pointer', fontWeight: 'bold', whiteSpace: 'nowrap' as const }}>PDF</button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal detalle */}
      {detalle && (() => {
        const persona   = detalle.personal
        const estadoCfg = ESTADO_CFG[detalle.estado]
        return (
          <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', zIndex: 50, overflowY: 'auto' }}>
            <div style={{ backgroundColor: 'white', borderRadius: '20px', padding: '32px', width: '100%', maxWidth: '520px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', margin: 'auto' }}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                <div>
                  <h3 style={{ margin: '0 0 4px', fontSize: '17px' }}>{persona?.usuario}</h3>
                  <p style={{ margin: 0, color: '#888', fontSize: '13px' }}>{persona?.cargo} · {fmtMes(mes)}</p>
                </div>
                <span style={{ backgroundColor: estadoCfg.bg, color: estadoCfg.color, borderRadius: '20px', padding: '4px 14px', fontSize: '11px', fontWeight: 'bold' }}>{estadoCfg.label}</span>
              </div>

              {/* Haberes */}
              <div style={{ backgroundColor: '#f9f9f9', borderRadius: '12px', padding: '16px', marginBottom: '12px' }}>
                <p style={secTit}>Haberes</p>
                <FilaD label="Sueldo base" val={`Bs. ${fmt(detalle.sueldo_base)}`} color="#166534" />
                {detalle.bono > 0       && <FilaD label="Bono de nivel"  val={`Bs. ${fmt(detalle.bono)}`}            color="#166534" />}
                {detalle.comisiones > 0 && <FilaD label={`Comisiones (ventas Bs. ${fmt(detalle.total_ventas_mes)})`} val={`Bs. ${fmt(detalle.comisiones)}`} color="#166534" />}
                {detalle.monto_horas_extra > 0 && <FilaD label={`Hrs extra (${Math.floor(detalle.horas_extra_min/60)}h ${detalle.horas_extra_min%60}m)`} val={`Bs. ${fmt(detalle.monto_horas_extra)}`} color="#166534" />}
                <FilaD label="Total haberes" val={`Bs. ${fmt(detalle.total_haberes)}`} color="#166534" bold />
              </div>

              {/* Descuentos */}
              <div style={{ backgroundColor: '#fef2f2', borderRadius: '12px', padding: '16px', marginBottom: '12px' }}>
                <p style={secTit}>Descuentos</p>
                {detalle.descuento_faltas > 0    && <FilaD label={`Faltas (${detalle.dias_falta}d · ${detalle.medias_faltas} medias)`} val={`- Bs. ${fmt(detalle.descuento_faltas)}`} color="#991b1b" />}
                {detalle.descuento_retrasos > 0  && <FilaD label={`Retrasos (${detalle.minutos_retraso_total} min)`}                  val={`- Bs. ${fmt(detalle.descuento_retrasos)}`} color="#991b1b" />}
                <FilaD label={`Seguro salud CNS (${config?.aporte_empleado_pct || 3}%)`} val={`- Bs. ${fmt(detalle.descuento_seguro)}`} color="#991b1b" />
                <FilaD label="Total descuentos" val={`- Bs. ${fmt(detalle.total_descuentos)}`} color="#991b1b" bold />
              </div>

              {/* Neto */}
              <div style={{ backgroundColor: '#1a1a1a', borderRadius: '12px', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <span style={{ color: '#aaa', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase' as const }}>Sueldo Neto</span>
                <span style={{ color: 'white', fontSize: '24px', fontWeight: 'bold' }}>Bs. {fmt(detalle.sueldo_neto)}</span>
              </div>

              {/* Observación */}
              <label style={labelSt}>Observación</label>
              <textarea value={obs} onChange={e => setObs(e.target.value)} rows={2} placeholder="Notas para la boleta..." disabled={detalle.estado === 'cerrado' || detalle.estado === 'pagado'}
                style={{ width: '100%', padding: '10px 14px', border: '1px solid #e5e5e5', borderRadius: '10px', fontSize: '13px', outline: 'none', resize: 'none' as const, boxSizing: 'border-box' as const, marginBottom: '16px', backgroundColor: detalle.estado === 'cerrado' ? '#f9f9f9' : 'white' }} />

              {/* Acciones */}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' as const }}>
                <button onClick={() => setDetalle(null)} style={{ flex: 1, padding: '10px', backgroundColor: '#f5f5f5', border: 'none', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer', color: '#666', fontSize: '13px' }}>Cerrar</button>
                <button onClick={() => generarPDF(detalle)} style={{ flex: 1, padding: '10px', backgroundColor: '#eff6ff', color: '#1e40af', border: 'none', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer', fontSize: '13px' }}>📄 PDF</button>
                {detalle.estado === 'borrador' && (
                  <button onClick={() => cambiarEstado(detalle.id, 'revisado')} disabled={procesando !== null}
                    style={{ flex: 2, padding: '10px', backgroundColor: '#1e40af', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer', fontSize: '13px' }}>
                    ✓ Marcar revisado
                  </button>
                )}
                {detalle.estado === 'revisado' && (
                  <button onClick={() => cambiarEstado(detalle.id, 'cerrado')} disabled={procesando !== null}
                    style={{ flex: 2, padding: '10px', backgroundColor: '#166534', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer', fontSize: '13px' }}>
                    🔒 Cerrar planilla
                  </button>
                )}
                {detalle.estado === 'cerrado' && (
                  <button onClick={() => cambiarEstado(detalle.id, 'pagado')} disabled={procesando !== null}
                    style={{ flex: 2, padding: '10px', backgroundColor: '#7e22ce', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer', fontSize: '13px' }}>
                    💸 Marcar pagado
                  </button>
                )}
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

function FilaD({ label, val, color, bold }: { label: string; val: string; color: string; bold?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '1px dashed #eee' }}>
      <span style={{ fontSize: '12px', color: '#555' }}>{label}</span>
      <span style={{ fontSize: bold ? '14px' : '13px', fontWeight: bold ? 'bold' : 'normal', color }}>{val}</span>
    </div>
  )
}

const secTit:   React.CSSProperties = { margin: '0 0 8px', fontSize: '10px', fontWeight: 'bold', color: '#888', textTransform: 'uppercase', letterSpacing: '0.1em' }
const labelSt:  React.CSSProperties = { display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#666', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }
