'use client'

// app/asistencia/page.tsx
// Panel de asistencia para admin/RRHH
// Tabs: Hoy | Mensual | Pendientes
// Acciones: justificar falta, agregar registro manual, exportar CSV

import { useEffect, useState, useMemo, useCallback } from 'react'
import { supabase } from '../../lib/supabase'

type Registro = {
  id: number; personal_id: number; sucursal_id: number; fecha: string
  hora_entrada: string | null; hora_salida: string | null; tipo: string
  minutos_retraso: number; minutos_extra: number; es_sabado: boolean
  observacion: string | null; validado: boolean; validado_por: number | null
  created_at: string
  personal?: any; sucursales?: any
}
type Persona  = { id: number; usuario: string; carnet: string; cargo_id: number | null; cargos?: any }
type Sucursal = { id: number; nombre: string }
type Cargo    = { id: number; nombre: string }

const TIPO_CFG: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  puntual:      { label: 'Puntual',       bg: '#f0fdf4', text: '#166534', dot: '#22c55e' },
  retraso_leve: { label: 'Retraso leve',  bg: '#fffbeb', text: '#92400e', dot: '#f59e0b' },
  retraso_grave:{ label: 'Retraso grave', bg: '#fff7ed', text: '#9a3412', dot: '#f97316' },
  media_falta:  { label: 'Media falta',   bg: '#fef2f2', text: '#991b1b', dot: '#ef4444' },
  falta:        { label: 'Falta',         bg: '#fef2f2', text: '#991b1b', dot: '#dc2626' },
  permiso:      { label: 'Permiso',       bg: '#eff6ff', text: '#1e40af', dot: '#3b82f6' },
  feriado:      { label: 'Feriado',       bg: '#f5f3ff', text: '#5b21b6', dot: '#8b5cf6' },
}

const fmt  = (s: string) => new Date(s).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })
const fmtF = (s: string) => new Date(s + 'T00:00:00').toLocaleDateString('es-BO', { day: '2-digit', month: 'short', year: 'numeric' })
const mesStr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

const thStyle:     React.CSSProperties = { padding: '13px 16px', textAlign: 'left', fontSize: '11px', fontWeight: 'bold', color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em' }
const tdStyle:     React.CSSProperties = { padding: '13px 16px', fontSize: '13px' }
const labelStyle:  React.CSSProperties = { display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#666', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }
const inputSt:     React.CSSProperties = { width: '100%', padding: '10px 12px', border: '1px solid #e5e5e5', borderRadius: '10px', fontSize: '14px', outline: 'none', backgroundColor: '#fafafa', boxSizing: 'border-box' }
const btnP:        React.CSSProperties = { flex: 2, padding: '12px', backgroundColor: '#222', border: 'none', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer', color: 'white', fontSize: '14px' }
const btnS:        React.CSSProperties = { flex: 1, padding: '12px', backgroundColor: '#f5f5f5', border: 'none', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer', color: '#666', fontSize: '14px' }
const filterSt:    React.CSSProperties = { padding: '9px 14px', border: '1px solid #e5e5e5', borderRadius: '10px', fontSize: '13px', outline: 'none', backgroundColor: 'white' }

function Badge({ val, color, bg }: { val: number; color: string; bg: string }) {
  return <span style={{ backgroundColor: val > 0 ? bg : '#f9f9f9', color: val > 0 ? color : '#ccc', borderRadius: '20px', padding: '3px 12px', fontSize: '13px', fontWeight: 'bold' }}>{val}</span>
}

function Modal({ titulo, onClose, children }: { titulo: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', zIndex: 50, overflowY: 'auto' }}>
      <div style={{ backgroundColor: 'white', borderRadius: '20px', padding: '32px', width: '100%', maxWidth: '520px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', margin: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ margin: 0, fontSize: '17px' }}>{titulo}</h3>
          <button onClick={onClose} style={{ backgroundColor: 'transparent', border: 'none', fontSize: '22px', cursor: 'pointer', color: '#aaa' }}>×</button>
        </div>
        {children}
      </div>
    </div>
  )
}

function TablaRegistros({ registros, onJustificar, mostrarFecha }: { registros: Registro[]; onJustificar: (r: Registro) => void; mostrarFecha: boolean }) {
  if (registros.length === 0)
    return <div style={{ textAlign: 'center', padding: '60px', color: '#bbb', fontSize: '14px' }}>Sin registros</div>
  return (
    <div style={{ backgroundColor: 'white', borderRadius: '16px', boxShadow: '0 2px 12px rgba(0,0,0,0.07)', overflow: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '700px' }}>
        <thead>
          <tr style={{ backgroundColor: '#f9f9f9', borderBottom: '2px solid #eee' }}>
            {[mostrarFecha && 'Fecha', 'Persona', 'Cargo', 'Sucursal', 'Entrada', 'Salida', 'Estado', 'Retraso', ''].filter(Boolean).map(h => (
              <th key={String(h)} style={thStyle}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {registros.map((r, i) => {
            const p   = r.personal
            const cfg = TIPO_CFG[r.tipo] || TIPO_CFG['puntual']
            const esFalta = r.tipo === 'falta' || r.tipo === 'media_falta'
            return (
              <tr key={r.id} style={{ borderBottom: '1px solid #f0f0f0', backgroundColor: i % 2 === 0 ? 'white' : '#fafafa' }}>
                {mostrarFecha && <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: '12px', color: '#666' }}>{fmtF(r.fecha)}</td>}
                <td style={tdStyle}><span style={{ fontWeight: 'bold' }}>{p?.usuario}</span><br /><span style={{ color: '#aaa', fontSize: '11px', fontFamily: 'monospace' }}>{p?.carnet}</span></td>
                <td style={{ ...tdStyle, color: '#777', fontSize: '12px' }}>{p?.cargos?.nombre || '—'}</td>
                <td style={{ ...tdStyle, color: '#777', fontSize: '12px' }}>{r.sucursales?.nombre || '—'}</td>
                <td style={{ ...tdStyle, fontFamily: 'monospace', fontWeight: 'bold', color: '#2563eb', fontSize: '13px' }}>{r.hora_entrada ? fmt(r.hora_entrada) : <span style={{ color: '#ddd' }}>—</span>}</td>
                <td style={{ ...tdStyle, fontFamily: 'monospace', fontWeight: 'bold', color: '#7c3aed', fontSize: '13px' }}>{r.hora_salida ? fmt(r.hora_salida) : <span style={{ color: '#ddd' }}>—</span>}</td>
                <td style={tdStyle}>
                  <span style={{ backgroundColor: cfg.bg, color: cfg.text, borderRadius: '20px', padding: '3px 10px', fontSize: '11px', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: cfg.dot, display: 'inline-block' }} />{cfg.label}
                  </span>
                </td>
                <td style={{ ...tdStyle, textAlign: 'center', fontFamily: 'monospace', fontSize: '13px', color: r.minutos_retraso > 0 ? '#f59e0b' : '#ccc' }}>
                  {r.minutos_retraso > 0 ? `${r.minutos_retraso}m` : '—'}
                </td>
                <td style={tdStyle}>
                  {esFalta && !r.validado
                    ? <button onClick={() => onJustificar(r)} style={{ backgroundColor: '#eff6ff', color: '#1e40af', border: 'none', borderRadius: '8px', padding: '6px 12px', fontSize: '11px', cursor: 'pointer', fontWeight: 'bold', whiteSpace: 'nowrap' }}>Justificar</button>
                    : r.validado ? <span style={{ color: '#aaa', fontSize: '11px' }}>✓ Validado</span> : null}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default function PanelAsistencia() {
  const [usuario,    setUsuario]    = useState<any>(null)
  const [loading,    setLoading]    = useState(true)
  const [tab,        setTab]        = useState<'hoy' | 'mensual' | 'pendientes'>('hoy')
  const [registros,  setRegistros]  = useState<Registro[]>([])
  const [personal,   setPersonal]   = useState<Persona[]>([])
  const [sucursales, setSucursales] = useState<Sucursal[]>([])
  const [cargos,     setCargos]     = useState<Cargo[]>([])
  const [filtroSuc,  setFiltroSuc]  = useState<number | ''>('')
  const [filtroCargo,setFiltroCargo]= useState<number | ''>('')
  const [filtroPerso,setFiltroPerso]= useState<number | ''>('')
  const [mes,        setMes]        = useState(mesStr(new Date()))
  const [modalJust,  setModalJust]  = useState<Registro | null>(null)
  const [modalMan,   setModalMan]   = useState(false)
  const [obsJust,    setObsJust]    = useState('')
  const [fMan,       setFMan]       = useState({ personal_id: '', sucursal_id: '', fecha: new Date().toISOString().split('T')[0], hora_entrada: '', hora_salida: '', tipo: 'puntual', observacion: '' })
  const [procesando, setProcesando] = useState(false)
  const [errModal,   setErrModal]   = useState('')

  useEffect(() => {
    const carnet = localStorage.getItem('carnet')
    if (!carnet) return void (window.location.replace('/'))
    supabase.from('personal').select('*, cargos(*)').eq('carnet', carnet).eq('estado', true).single()
      .then(({ data }) => {
        if (!data) return window.location.replace('/')
        const c = data.cargos
        if (!c?.es_admin && !c?.puede_gestionar_rrhh) return window.location.replace('/sistema')
        setUsuario(data)
        Promise.all([
          supabase.from('personal').select('id, usuario, carnet, cargo_id, cargos(nombre)').eq('estado', true).order('usuario').then(({ data: d }) => setPersonal(d || [])),
          supabase.from('sucursales').select('id, nombre').eq('activo', true).then(({ data: d }) => setSucursales(d || [])),
          supabase.from('cargos').select('id, nombre').eq('activo', true).order('nombre').then(({ data: d }) => setCargos(d || [])),
        ]).finally(() => setLoading(false))
      })
  }, [])

  const loadRegistros = useCallback(async () => {
    const hoy = new Date().toISOString().split('T')[0]
    let q = supabase.from('registros_asistencia')
      .select('id,personal_id,sucursal_id,fecha,hora_entrada,hora_salida,tipo,minutos_retraso,minutos_extra,es_sabado,observacion,validado,validado_por,created_at,personal!registros_asistencia_personal_id_fkey(id,usuario,carnet,cargo_id,cargos(nombre)),sucursales(nombre)')
      .order('fecha', { ascending: false }).order('created_at', { ascending: false })

    if (tab === 'hoy')           q = q.eq('fecha', hoy)
    else if (tab === 'mensual')  q = q.gte('fecha', `${mes}-01`).lte('fecha', `${mes}-31`)
    else                         q = q.in('tipo', ['falta', 'media_falta']).eq('validado', false).gte('fecha', `${mes}-01`)

    const { data, error } = await q
    if (error) console.error('Error registros:', JSON.stringify(error))
    setRegistros((data as any) || [])
  }, [tab, mes])

  useEffect(() => { if (!loading) loadRegistros() }, [tab, mes, loading])

  const filtrados = useMemo(() => registros.filter(r => {
    if (filtroSuc   && r.sucursal_id !== filtroSuc)   return false
    if (filtroPerso && r.personal_id !== filtroPerso) return false
    if (filtroCargo && r.personal?.cargo_id !== filtroCargo) return false
    return true
  }), [registros, filtroSuc, filtroPerso, filtroCargo])

  const statsHoy = useMemo(() => ({
    puntuales: filtrados.filter(r => r.tipo === 'puntual').length,
    retrasos:  filtrados.filter(r => r.tipo.startsWith('retraso')).length,
    faltas:    filtrados.filter(r => r.tipo === 'falta' || r.tipo === 'media_falta').length,
    sinSalida: filtrados.filter(r => r.hora_entrada && !r.hora_salida).length,
  }), [filtrados])

  const resumenMensual = useMemo(() => {
    const mapa: Record<number, any> = {}
    filtrados.forEach(r => {
      const p = r.personal
      if (!p) return
      if (!mapa[r.personal_id]) mapa[r.personal_id] = { persona: p, dias: 0, retrasos: 0, minRet: 0, faltas: 0, medias: 0, permisos: 0, extra: 0 }
      const m = mapa[r.personal_id]
      if (r.hora_entrada) m.dias++
      if (r.tipo.startsWith('retraso')) { m.retrasos++; m.minRet += r.minutos_retraso }
      if (r.tipo === 'falta')       m.faltas++
      if (r.tipo === 'media_falta') m.medias++
      if (r.tipo === 'permiso')     m.permisos++
      m.extra += r.minutos_extra
    })
    return Object.values(mapa).sort((a, b) => a.persona.usuario.localeCompare(b.persona.usuario))
  }, [filtrados])

  const justificar = async () => {
    if (!modalJust) return
    setProcesando(true); setErrModal('')
    try {
      const { error } = await supabase.from('registros_asistencia')
        .update({ tipo: 'permiso', validado: true, validado_por: usuario.id, observacion: obsJust || 'Permiso justificado por admin' })
        .eq('id', modalJust.id)
      if (error) throw error
      setModalJust(null); setObsJust(''); await loadRegistros()
    } catch (e: any) { setErrModal('Error: ' + e.message) }
    finally { setProcesando(false) }
  }

  const guardarManual = async () => {
    if (!fMan.personal_id || !fMan.sucursal_id || !fMan.fecha) return setErrModal('Completa persona, sucursal y fecha')
    setProcesando(true); setErrModal('')
    try {
      const payload: any = { personal_id: Number(fMan.personal_id), sucursal_id: Number(fMan.sucursal_id), fecha: fMan.fecha, tipo: fMan.tipo, minutos_retraso: 0, minutos_extra: 0, es_sabado: false, validado: true, validado_por: usuario.id, observacion: fMan.observacion || 'Registro manual por admin' }
      if (fMan.hora_entrada) payload.hora_entrada = `${fMan.fecha}T${fMan.hora_entrada}:00`
      if (fMan.hora_salida)  payload.hora_salida  = `${fMan.fecha}T${fMan.hora_salida}:00`
      const { error } = await supabase.from('registros_asistencia').upsert(payload, { onConflict: 'personal_id,fecha' })
      if (error) throw error
      setModalMan(false); setFMan({ personal_id: '', sucursal_id: '', fecha: new Date().toISOString().split('T')[0], hora_entrada: '', hora_salida: '', tipo: 'puntual', observacion: '' })
      await loadRegistros()
    } catch (e: any) { setErrModal('Error: ' + e.message) }
    finally { setProcesando(false) }
  }

  const exportarCSV = () => {
    const headers = ['Fecha','Persona','Carnet','Cargo','Sucursal','Entrada','Salida','Tipo','Min.Retraso','Min.Extra','Validado']
    const rows = filtrados.map(r => [r.fecha, r.personal?.usuario || '', r.personal?.carnet || '', r.personal?.cargos?.nombre || '', r.sucursales?.nombre || '', r.hora_entrada ? fmt(r.hora_entrada) : '', r.hora_salida ? fmt(r.hora_salida) : '', TIPO_CFG[r.tipo]?.label || r.tipo, r.minutos_retraso, r.minutos_extra, r.validado ? 'Sí' : 'No'])
    const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n')
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
    a.download = `asistencia_${tab}_${mes}.csv`; a.click()
  }

  if (loading) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Arial, sans-serif' }}><p style={{ color: '#999' }}>Cargando...</p></div>

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', minHeight: '100vh', backgroundColor: '#f5f5f5' }}>
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 40px', backgroundColor: '#222', color: 'white', boxSizing: 'border-box' as const, flexWrap: 'wrap' as const, gap: '10px' }}>
        <a href="/sistema" style={{ fontWeight: 'bold', fontSize: '16px', color: 'white', textDecoration: 'none' }}>← Sistema</a>
        <span style={{ color: '#a3c47d', fontWeight: 'bold' }}>Control de Asistencia</span>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={() => { setErrModal(''); setModalMan(true) }} style={{ backgroundColor: '#a3c47d', color: '#222', border: 'none', borderRadius: '20px', padding: '7px 16px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}>+ Registro manual</button>
          <button onClick={exportarCSV} style={{ backgroundColor: 'transparent', color: '#a3c47d', border: '1px solid #a3c47d', borderRadius: '20px', padding: '7px 16px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}>📥 CSV</button>
        </div>
      </nav>

      <div style={{ padding: '28px 40px', maxWidth: '1200px', margin: '0 auto' }}>
        {/* Tabs */}
        <div style={{ display: 'flex', gap: '4px', backgroundColor: 'white', borderRadius: '14px', padding: '4px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', width: 'fit-content', marginBottom: '24px' }}>
          {(['hoy', 'mensual', 'pendientes'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ padding: '10px 24px', borderRadius: '10px', border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px', backgroundColor: tab === t ? '#222' : 'transparent', color: tab === t ? 'white' : '#888', transition: 'all 0.15s' }}>
              {t === 'hoy' ? '📅 Hoy' : t === 'mensual' ? '📊 Mensual' : '⚠ Pendientes'}
            </button>
          ))}
        </div>

        {/* Filtros */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' as const }}>
          {tab !== 'hoy' && <input type="month" value={mes} onChange={e => setMes(e.target.value)} style={filterSt} />}
          <select value={filtroSuc}    onChange={e => setFiltroSuc(e.target.value ? Number(e.target.value) : '')}    style={filterSt}><option value="">Todas las sucursales</option>{sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}</select>
          <select value={filtroCargo}  onChange={e => setFiltroCargo(e.target.value ? Number(e.target.value) : '')}  style={filterSt}><option value="">Todos los cargos</option>{cargos.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select>
          <select value={filtroPerso}  onChange={e => setFiltroPerso(e.target.value ? Number(e.target.value) : '')}  style={filterSt}><option value="">Todo el personal</option>{personal.map(p => <option key={p.id} value={p.id}>{p.usuario}</option>)}</select>
        </div>

        {/* Tab: Hoy */}
        {tab === 'hoy' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px', marginBottom: '24px' }}>
              {[
                { label: 'Puntuales',  val: statsHoy.puntuales, color: '#22c55e', bg: '#f0fdf4' },
                { label: 'Retrasos',   val: statsHoy.retrasos,  color: '#f59e0b', bg: '#fffbeb' },
                { label: 'Faltas',     val: statsHoy.faltas,    color: '#ef4444', bg: '#fef2f2' },
                { label: 'Sin salida', val: statsHoy.sinSalida, color: '#3b82f6', bg: '#eff6ff' },
              ].map(s => (
                <div key={s.label} style={{ backgroundColor: s.bg, borderRadius: '14px', padding: '16px 20px', border: `1px solid ${s.color}22` }}>
                  <p style={{ margin: 0, fontSize: '10px', fontWeight: 'bold', color: s.color, textTransform: 'uppercase' as const, letterSpacing: '0.08em' }}>{s.label}</p>
                  <p style={{ margin: '4px 0 0', fontSize: '28px', fontWeight: 'bold', color: s.color }}>{s.val}</p>
                </div>
              ))}
            </div>
            <TablaRegistros registros={filtrados} onJustificar={r => { setModalJust(r); setObsJust('') }} mostrarFecha={false} />
          </>
        )}

        {/* Tab: Mensual */}
        {tab === 'mensual' && (
          <div style={{ backgroundColor: 'white', borderRadius: '16px', boxShadow: '0 2px 12px rgba(0,0,0,0.07)', overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '750px' }}>
              <thead>
                <tr style={{ backgroundColor: '#f9f9f9', borderBottom: '2px solid #eee' }}>
                  {['Persona','Cargo','Días trabajados','Retrasos','Min. retraso','Faltas','½ Faltas','Permisos','Hrs extra'].map(h => <th key={h} style={thStyle}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {resumenMensual.length === 0
                  ? <tr><td colSpan={9} style={{ padding: '40px', textAlign: 'center' as const, color: '#bbb', fontSize: '14px' }}>Sin registros para este mes</td></tr>
                  : resumenMensual.map((m, i) => (
                    <tr key={m.persona.id} style={{ borderBottom: '1px solid #f0f0f0', backgroundColor: i % 2 === 0 ? 'white' : '#fafafa' }}>
                      <td style={tdStyle}><span style={{ fontWeight: 'bold' }}>{m.persona.usuario}</span><br /><span style={{ color: '#aaa', fontSize: '11px', fontFamily: 'monospace' }}>{m.persona.carnet}</span></td>
                      <td style={{ ...tdStyle, color: '#666', fontSize: '12px' }}>{m.persona.cargos?.nombre || '—'}</td>
                      <td style={{ ...tdStyle, textAlign: 'center' as const }}><Badge val={m.dias}     color="#166534" bg="#f0fdf4" /></td>
                      <td style={{ ...tdStyle, textAlign: 'center' as const }}><Badge val={m.retrasos} color={m.retrasos >= 7 ? '#991b1b' : m.retrasos >= 4 ? '#9a3412' : '#92400e'} bg={m.retrasos >= 4 ? '#fef2f2' : '#fffbeb'} /></td>
                      <td style={{ ...tdStyle, textAlign: 'center' as const, fontFamily: 'monospace', fontSize: '13px', color: '#555' }}>{m.minRet} min</td>
                      <td style={{ ...tdStyle, textAlign: 'center' as const }}><Badge val={m.faltas}   color="#991b1b" bg="#fef2f2" /></td>
                      <td style={{ ...tdStyle, textAlign: 'center' as const }}><Badge val={m.medias}   color="#9a3412" bg="#fff7ed" /></td>
                      <td style={{ ...tdStyle, textAlign: 'center' as const }}><Badge val={m.permisos} color="#1e40af" bg="#eff6ff" /></td>
                      <td style={{ ...tdStyle, textAlign: 'center' as const, fontFamily: 'monospace', fontSize: '13px', color: '#166534' }}>{m.extra > 0 ? `${Math.floor(m.extra/60)}h ${m.extra%60}m` : '—'}</td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>
        )}

        {/* Tab: Pendientes */}
        {tab === 'pendientes' && (
          filtrados.length === 0
            ? <div style={{ textAlign: 'center', padding: '60px', color: '#bbb' }}><p style={{ fontSize: '40px', margin: '0 0 12px' }}>✓</p><p style={{ fontSize: '14px', fontWeight: 'bold' }}>Sin faltas pendientes de justificar</p></div>
            : <TablaRegistros registros={filtrados} onJustificar={r => { setModalJust(r); setObsJust('') }} mostrarFecha />
        )}
      </div>

      {/* Modal justificar */}
      {modalJust && (
        <Modal titulo="Justificar Falta" onClose={() => setModalJust(null)}>
          <div style={{ backgroundColor: '#fef2f2', borderRadius: '12px', padding: '14px 18px', marginBottom: '20px' }}>
            <p style={{ margin: 0, fontWeight: 'bold', fontSize: '14px' }}>{modalJust.personal?.usuario}</p>
            <p style={{ margin: '4px 0 0', color: '#666', fontSize: '13px' }}>{fmtF(modalJust.fecha)} · {TIPO_CFG[modalJust.tipo]?.label}</p>
          </div>
          <label style={labelStyle}>Motivo del permiso</label>
          <textarea value={obsJust} onChange={e => setObsJust(e.target.value)} rows={3} placeholder="Ej: Cita médica, trámite personal..." style={{ width: '100%', padding: '10px 14px', border: '1px solid #e5e5e5', borderRadius: '10px', fontSize: '14px', outline: 'none', resize: 'none' as const, boxSizing: 'border-box' as const }} />
          {errModal && <p style={{ color: '#ef4444', fontSize: '13px', margin: '8px 0' }}>⚠ {errModal}</p>}
          <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
            <button onClick={() => setModalJust(null)} style={btnS}>Cancelar</button>
            <button onClick={justificar} disabled={procesando} style={btnP}>{procesando ? 'Guardando...' : 'Convertir a permiso'}</button>
          </div>
        </Modal>
      )}

      {/* Modal registro manual */}
      {modalMan && (
        <Modal titulo="Registro Manual" onClose={() => setModalMan(false)}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Persona</label>
              <select value={fMan.personal_id} onChange={e => setFMan(f => ({ ...f, personal_id: e.target.value }))} style={inputSt}>
                <option value="">Seleccionar...</option>
                {personal.map(p => <option key={p.id} value={p.id}>{p.usuario}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Sucursal</label>
              <select value={fMan.sucursal_id} onChange={e => setFMan(f => ({ ...f, sucursal_id: e.target.value }))} style={inputSt}>
                <option value="">Seleccionar...</option>
                {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Fecha</label>
              <input type="date" value={fMan.fecha} onChange={e => setFMan(f => ({ ...f, fecha: e.target.value }))} style={inputSt} />
            </div>
            <div>
              <label style={labelStyle}>Hora entrada</label>
              <input type="time" value={fMan.hora_entrada} onChange={e => setFMan(f => ({ ...f, hora_entrada: e.target.value }))} style={inputSt} />
            </div>
            <div>
              <label style={labelStyle}>Hora salida</label>
              <input type="time" value={fMan.hora_salida} onChange={e => setFMan(f => ({ ...f, hora_salida: e.target.value }))} style={inputSt} />
            </div>
            <div>
              <label style={labelStyle}>Tipo</label>
              <select value={fMan.tipo} onChange={e => setFMan(f => ({ ...f, tipo: e.target.value }))} style={inputSt}>
                {Object.entries(TIPO_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Observación</label>
              <input value={fMan.observacion} onChange={e => setFMan(f => ({ ...f, observacion: e.target.value }))} placeholder="Motivo del registro manual..." style={inputSt} />
            </div>
          </div>
          {errModal && <p style={{ color: '#ef4444', fontSize: '13px', margin: '10px 0 0' }}>⚠ {errModal}</p>}
          <div style={{ display: 'flex', gap: '10px', marginTop: '24px' }}>
            <button onClick={() => setModalMan(false)} style={btnS}>Cancelar</button>
            <button onClick={guardarManual} disabled={procesando} style={btnP}>{procesando ? 'Guardando...' : 'Guardar registro'}</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
