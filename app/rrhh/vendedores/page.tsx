'use client'

// app/rrhh/vendedores/page.tsx
// Asignar código de vendedor a trabajadores de personal.
// Un trabajador puede tener múltiples registros en vendedores (historial),
// pero solo uno activo a la vez para el cálculo de planilla.

import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../../../lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────
type Vendedor = {
  id: number; nombre: string; ci: string; alias: string | null
  tipo: string; activo: boolean; personal_id: number | null
  celular: string | null; banco: string | null; nro_cuenta: string | null
  created_at: string
  personal?: { id: number; usuario: string; carnet: string; cargo: string }
}
type Persona = { id: number; usuario: string; carnet: string; cargo: string; sucursal: string }

// Tipos normalizados
const TIPO_NORMALIZADO: Record<string, string> = {
  'planta':        'planta',
  'Planta':        'planta',
  'tienda':        'tienda',
  'Tienda fisica': 'tienda',
  'digital':       'digital',
  'externo':       'externo',
  'freelancer':    'freelancer',
}

const TIPO_CFG: Record<string, { label: string; bg: string; color: string }> = {
  planta:     { label: 'Planta',     bg: '#eff6ff', color: '#1e40af' },
  tienda:     { label: 'Tienda',     bg: '#f0fdf4', color: '#166534' },
  digital:    { label: 'Digital',    bg: '#fdf4ff', color: '#7e22ce' },
  externo:    { label: 'Externo',    bg: '#fff7ed', color: '#9a3412' },
  freelancer: { label: 'Freelancer', bg: '#f0fdf4', color: '#065f46' },
}

const getTipoCfg = (tipo: string) => TIPO_CFG[TIPO_NORMALIZADO[tipo] || tipo] || { label: tipo, bg: '#f1f5f9', color: '#475569' }

export default function GestionVendedores() {
  const [vendedores,  setVendedores]  = useState<Vendedor[]>([])
  const [personal,    setPersonal]    = useState<Persona[]>([])
  const [loading,     setLoading]     = useState(true)
  const [busqueda,    setBusqueda]    = useState('')
  const [filtroTipo,  setFiltroTipo]  = useState('')
  const [filtroAsig,  setFiltroAsig]  = useState<'todos' | 'asignados' | 'sin_asignar'>('todos')
  const [modal,       setModal]       = useState<'asignar' | 'nuevo' | 'detalle' | null>(null)
  const [vendSel,     setVendSel]     = useState<Vendedor | null>(null)
  const [personaSel,  setPersonaSel]  = useState('')
  const [guardando,   setGuardando]   = useState(false)
  const [error,       setError]       = useState('')
  const [formNuevo,   setFormNuevo]   = useState({
    nombre: '', ci: '', ci_exp: '', celular: '', alias: '',
    tipo: 'planta', banco: '', nro_cuenta: '', personal_id: '',
  })

  useEffect(() => {
    const carnet = localStorage.getItem('carnet')
    if (!carnet) return void (window.location.replace('/'))
    supabase.from('personal').select('*, cargos(*)').eq('carnet', carnet).eq('estado', true).single()
      .then(({ data }) => {
        if (!data) return window.location.replace('/')
        const c = data.cargos
        if (!c?.es_admin && !c?.puede_gestionar_rrhh) return window.location.replace('/sistema')
        Promise.all([loadVendedores(), loadPersonal()]).finally(() => setLoading(false))
      })
  }, [])

  // ── Loaders ────────────────────────────────────────────────────────────────
  const loadVendedores = async () => {
    const { data, error } = await supabase.from('vendedores')
      .select('id, nombre, ci, alias, tipo, activo, personal_id, celular, banco, nro_cuenta, created_at, personal!vendedores_personal_id_fkey(id, usuario, carnet, cargo)')
      .order('nombre')
    if (error) {
      // Si el FK no existe aún, cargar sin join
      const { data: simple } = await supabase.from('vendedores')
        .select('id, nombre, ci, alias, tipo, activo, personal_id, celular, banco, nro_cuenta, created_at')
        .order('nombre')
      setVendedores((simple as any) || [])
    } else {
      setVendedores((data as any) || [])
    }
  }

  const loadPersonal = async () => {
    const { data } = await supabase.from('personal')
      .select('id, usuario, carnet, cargo, sucursal')
      .eq('estado', true).order('usuario')
    setPersonal(data || [])
  }

  // ── Filtros ────────────────────────────────────────────────────────────────
  const vendedoresFiltrados = useMemo(() => {
    return vendedores.filter(v => {
      const tipoNorm = TIPO_NORMALIZADO[v.tipo] || v.tipo
      if (filtroTipo && tipoNorm !== filtroTipo) return false
      if (filtroAsig === 'asignados'   && !v.personal_id) return false
      if (filtroAsig === 'sin_asignar' &&  v.personal_id) return false
      if (busqueda) {
        const q = busqueda.toLowerCase()
        const match = [v.nombre, v.ci, v.alias, (v.personal as any)?.usuario].some(s => s?.toLowerCase().includes(q))
        if (!match) return false
      }
      return true
    })
  }, [vendedores, filtroTipo, filtroAsig, busqueda])

  const stats = useMemo(() => ({
    total:       vendedores.length,
    asignados:   vendedores.filter(v => v.personal_id).length,
    sinAsignar:  vendedores.filter(v => !v.personal_id).length,
    activos:     vendedores.filter(v => v.activo).length,
  }), [vendedores])

  // ── Asignar personal a vendedor ────────────────────────────────────────────
  const asignarPersonal = async () => {
    if (!vendSel) return
    setGuardando(true); setError('')
    try {
      const pid = personaSel ? Number(personaSel) : null

      // Si se asigna un personal, desactivar otros vendedores activos de esa persona
      if (pid) {
        await supabase.from('vendedores')
          .update({ activo: false })
          .eq('personal_id', pid)
          .eq('activo', true)
          .neq('id', vendSel.id)
      }

      const { error: err } = await supabase.from('vendedores')
        .update({ personal_id: pid, activo: pid ? true : vendSel.activo })
        .eq('id', vendSel.id)

      if (err) throw err
      await loadVendedores()
      setModal(null); setVendSel(null); setPersonaSel('')
    } catch (e: any) {
      setError('Error al asignar: ' + e.message)
    } finally {
      setGuardando(false)
    }
  }

  // ── Crear nuevo vendedor ───────────────────────────────────────────────────
  const crearVendedor = async () => {
    if (!formNuevo.nombre.trim() || !formNuevo.ci.trim())
      return setError('Nombre y CI son obligatorios')
    setGuardando(true); setError('')
    try {
      const payload: any = {
        nombre:      formNuevo.nombre.trim(),
        ci:          formNuevo.ci.trim(),
        ci_exp:      formNuevo.ci_exp.trim() || null,
        celular:     formNuevo.celular.trim() || null,
        alias:       formNuevo.alias.trim() || null,
        tipo:        formNuevo.tipo,
        banco:       formNuevo.banco.trim() || null,
        nro_cuenta:  formNuevo.nro_cuenta.trim() || null,
        activo:      true,
        personal_id: formNuevo.personal_id ? Number(formNuevo.personal_id) : null,
      }

      // Si se asigna personal, desactivar otros vendedores activos de esa persona
      if (payload.personal_id) {
        await supabase.from('vendedores')
          .update({ activo: false })
          .eq('personal_id', payload.personal_id)
          .eq('activo', true)
      }

      const { error: err } = await supabase.from('vendedores').insert(payload)
      if (err) throw err
      await loadVendedores()
      setModal(null)
      setFormNuevo({ nombre: '', ci: '', ci_exp: '', celular: '', alias: '', tipo: 'planta', banco: '', nro_cuenta: '', personal_id: '' })
    } catch (e: any) {
      setError('Error al crear: ' + e.message)
    } finally {
      setGuardando(false)
    }
  }

  // ── Normalizar tipo (limpieza de datos) ────────────────────────────────────
  const normalizarTipos = async () => {
    if (!confirm('Esto normalizará los tipos duplicados (ej: "Planta" → "planta"). ¿Continuar?')) return
    setGuardando(true)
    try {
      for (const [original, normalizado] of Object.entries(TIPO_NORMALIZADO)) {
        if (original !== normalizado) {
          await supabase.from('vendedores').update({ tipo: normalizado }).eq('tipo', original)
        }
      }
      await loadVendedores()
    } catch (e: any) { setError('Error: ' + e.message) }
    finally { setGuardando(false) }
  }

  // ── Toggle activo ──────────────────────────────────────────────────────────
  const toggleActivo = async (v: Vendedor) => {
    await supabase.from('vendedores').update({ activo: !v.activo }).eq('id', v.id)
    await loadVendedores()
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Arial, sans-serif' }}>
      <p style={{ color: '#999' }}>Cargando...</p>
    </div>
  )

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: 'Arial, sans-serif', minHeight: '100vh', backgroundColor: '#f5f5f5' }}>

      {/* Nav */}
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 40px', backgroundColor: '#222', color: 'white', boxSizing: 'border-box' as const, flexWrap: 'wrap' as const, gap: '10px' }}>
        <a href="/rrhh" style={{ fontWeight: 'bold', fontSize: '16px', color: 'white', textDecoration: 'none' }}>← RRHH</a>
        <span style={{ color: '#a3c47d', fontWeight: 'bold' }}>Gestión de Vendedores</span>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={normalizarTipos} disabled={guardando} style={{ backgroundColor: 'transparent', color: '#a3c47d', border: '1px solid #a3c47d', borderRadius: '20px', padding: '7px 14px', fontWeight: 'bold', fontSize: '11px', cursor: 'pointer' }}>
            🔧 Normalizar tipos
          </button>
          <button onClick={() => { setModal('nuevo'); setError('') }} style={{ backgroundColor: '#a3c47d', color: '#222', border: 'none', borderRadius: '20px', padding: '7px 16px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}>
            + Nuevo vendedor
          </button>
        </div>
      </nav>

      <div style={{ padding: '28px 40px', maxWidth: '1200px', margin: '0 auto' }}>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px', marginBottom: '24px' }}>
          {[
            { label: 'Total',       val: stats.total,      color: '#475569', bg: '#f8fafc' },
            { label: 'Activos',     val: stats.activos,    color: '#166534', bg: '#f0fdf4' },
            { label: 'Asignados',   val: stats.asignados,  color: '#1e40af', bg: '#eff6ff' },
            { label: 'Sin asignar', val: stats.sinAsignar, color: '#92400e', bg: '#fffbeb' },
          ].map(s => (
            <div key={s.label} style={{ backgroundColor: s.bg, borderRadius: '12px', padding: '14px 18px' }}>
              <p style={{ margin: 0, fontSize: '10px', fontWeight: 'bold', color: s.color, textTransform: 'uppercase' as const, letterSpacing: '0.08em' }}>{s.label}</p>
              <p style={{ margin: '4px 0 0', fontSize: '26px', fontWeight: 'bold', color: s.color }}>{s.val}</p>
            </div>
          ))}
        </div>

        {/* Filtros */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' as const }}>
          <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, CI, alias o trabajador..."
            style={{ flex: 1, minWidth: '220px', padding: '9px 16px', border: '1px solid #e5e5e5', borderRadius: '10px', fontSize: '13px', outline: 'none', backgroundColor: 'white' }} />
          <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}
            style={filterSt}>
            <option value="">Todos los tipos</option>
            {Object.entries(TIPO_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select value={filtroAsig} onChange={e => setFiltroAsig(e.target.value as any)}
            style={filterSt}>
            <option value="todos">Todos</option>
            <option value="asignados">Con trabajador asignado</option>
            <option value="sin_asignar">Sin asignar</option>
          </select>
        </div>

        <p style={{ color: '#aaa', fontSize: '12px', marginBottom: '16px' }}>
          {vendedoresFiltrados.length} vendedor{vendedoresFiltrados.length !== 1 ? 'es' : ''}
        </p>

        {/* Tabla */}
        <div style={{ backgroundColor: 'white', borderRadius: '16px', boxShadow: '0 2px 12px rgba(0,0,0,0.07)', overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '750px' }}>
            <thead>
              <tr style={{ backgroundColor: '#f9f9f9', borderBottom: '2px solid #eee' }}>
                {['ID', 'Vendedor', 'CI', 'Tipo', 'Trabajador asignado', 'Estado', ''].map(h => (
                  <th key={h} style={thSt}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {vendedoresFiltrados.length === 0 && (
                <tr><td colSpan={7} style={{ padding: '40px', textAlign: 'center' as const, color: '#bbb', fontSize: '14px' }}>Sin resultados</td></tr>
              )}
              {vendedoresFiltrados.map((v, i) => {
                const tipoCfg  = getTipoCfg(v.tipo)
                const persona  = v.personal as any
                return (
                  <tr key={v.id} style={{ borderBottom: '1px solid #f0f0f0', backgroundColor: i % 2 === 0 ? 'white' : '#fafafa', opacity: v.activo ? 1 : 0.55 }}>
                    <td style={{ ...tdSt, fontFamily: 'monospace', fontWeight: 'bold', color: '#888', fontSize: '13px' }}>#{v.id}</td>
                    <td style={tdSt}>
                      <span style={{ fontWeight: 'bold', fontSize: '14px' }}>{v.nombre}</span>
                      {v.alias && <span style={{ color: '#aaa', fontSize: '11px', display: 'block' }}>@{v.alias}</span>}
                    </td>
                    <td style={{ ...tdSt, fontFamily: 'monospace', fontSize: '13px', color: '#555' }}>{v.ci}</td>
                    <td style={tdSt}>
                      <span style={{ backgroundColor: tipoCfg.bg, color: tipoCfg.color, borderRadius: '20px', padding: '3px 12px', fontSize: '11px', fontWeight: 'bold' }}>
                        {tipoCfg.label}
                      </span>
                    </td>
                    <td style={tdSt}>
                      {persona
                        ? <div>
                            <span style={{ fontWeight: 'bold', fontSize: '13px', color: '#1e40af' }}>{persona.usuario}</span>
                            <span style={{ color: '#aaa', fontSize: '11px', display: 'block' }}>{persona.cargo}</span>
                          </div>
                        : <span style={{ color: '#ddd', fontSize: '12px', fontStyle: 'italic' }}>Sin asignar</span>
                      }
                    </td>
                    <td style={tdSt}>
                      <span style={{ backgroundColor: v.activo ? '#f0fdf4' : '#f1f5f9', color: v.activo ? '#166534' : '#94a3b8', borderRadius: '20px', padding: '3px 12px', fontSize: '11px', fontWeight: 'bold' }}>
                        {v.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td style={tdSt}>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button onClick={() => { setVendSel(v); setPersonaSel(String(v.personal_id || '')); setModal('asignar'); setError('') }}
                          style={{ backgroundColor: '#eff6ff', color: '#1e40af', border: 'none', borderRadius: '8px', padding: '6px 12px', fontSize: '11px', cursor: 'pointer', fontWeight: 'bold', whiteSpace: 'nowrap' as const }}>
                          {persona ? 'Reasignar' : 'Asignar'}
                        </button>
                        <button onClick={() => toggleActivo(v)}
                          style={{ backgroundColor: v.activo ? '#fef2f2' : '#f0fdf4', color: v.activo ? '#991b1b' : '#166534', border: 'none', borderRadius: '8px', padding: '6px 12px', fontSize: '11px', cursor: 'pointer', fontWeight: 'bold' }}>
                          {v.activo ? 'Desact.' : 'Activar'}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Modal asignar trabajador ─────────────────────────────────────────── */}
      {modal === 'asignar' && vendSel && (
        <Modal titulo="Asignar Trabajador" onClose={() => setModal(null)}>
          {/* Info vendedor */}
          <div style={{ backgroundColor: '#f8fafc', borderRadius: '12px', padding: '14px 18px', marginBottom: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ margin: 0, fontWeight: 'bold', fontSize: '15px' }}>{vendSel.nombre}</p>
                <p style={{ margin: '3px 0 0', color: '#888', fontSize: '12px' }}>CI: {vendSel.ci} · ID vendedor: #{vendSel.id}</p>
              </div>
              <span style={{ backgroundColor: getTipoCfg(vendSel.tipo).bg, color: getTipoCfg(vendSel.tipo).color, borderRadius: '20px', padding: '3px 12px', fontSize: '11px', fontWeight: 'bold' }}>
                {getTipoCfg(vendSel.tipo).label}
              </span>
            </div>
          </div>

          <label style={labelSt}>Trabajador de personal</label>
          <select value={personaSel} onChange={e => setPersonaSel(e.target.value)} style={{ ...inputSt, marginBottom: '8px' }}>
            <option value="">— Sin asignar —</option>
            {personal.map(p => (
              <option key={p.id} value={p.id}>
                {p.usuario} · {p.cargo} · {p.sucursal}
              </option>
            ))}
          </select>
          <p style={{ color: '#aaa', fontSize: '11px', margin: '0 0 20px' }}>
            Si el trabajador ya tiene otro vendedor activo, se desactivará automáticamente.
          </p>

          {error && <p style={{ color: '#ef4444', fontSize: '13px', margin: '0 0 12px' }}>⚠ {error}</p>}

          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={() => setModal(null)} style={btnS}>Cancelar</button>
            <button onClick={asignarPersonal} disabled={guardando} style={btnP}>
              {guardando ? 'Guardando...' : 'Confirmar asignación'}
            </button>
          </div>
        </Modal>
      )}

      {/* ── Modal nuevo vendedor ─────────────────────────────────────────────── */}
      {modal === 'nuevo' && (
        <Modal titulo="Nuevo Vendedor" onClose={() => setModal(null)}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelSt}>Nombre completo *</label>
              <input value={formNuevo.nombre} onChange={e => setFormNuevo(f => ({ ...f, nombre: e.target.value }))} style={inputSt} placeholder="Nombre del vendedor" />
            </div>
            <div>
              <label style={labelSt}>CI *</label>
              <input value={formNuevo.ci} onChange={e => setFormNuevo(f => ({ ...f, ci: e.target.value }))} style={inputSt} placeholder="12345678" />
            </div>
            <div>
              <label style={labelSt}>Exp.</label>
              <input value={formNuevo.ci_exp} onChange={e => setFormNuevo(f => ({ ...f, ci_exp: e.target.value }))} style={inputSt} placeholder="LP, CB, SC..." />
            </div>
            <div>
              <label style={labelSt}>Alias</label>
              <input value={formNuevo.alias} onChange={e => setFormNuevo(f => ({ ...f, alias: e.target.value }))} style={inputSt} placeholder="@alias" />
            </div>
            <div>
              <label style={labelSt}>Celular</label>
              <input value={formNuevo.celular} onChange={e => setFormNuevo(f => ({ ...f, celular: e.target.value }))} style={inputSt} placeholder="7xxxxxxx" />
            </div>
            <div>
              <label style={labelSt}>Tipo</label>
              <select value={formNuevo.tipo} onChange={e => setFormNuevo(f => ({ ...f, tipo: e.target.value }))} style={inputSt}>
                {Object.entries(TIPO_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label style={labelSt}>Banco</label>
              <input value={formNuevo.banco} onChange={e => setFormNuevo(f => ({ ...f, banco: e.target.value }))} style={inputSt} placeholder="BNB, Tigo..." />
            </div>
            <div>
              <label style={labelSt}>Nro. cuenta</label>
              <input value={formNuevo.nro_cuenta} onChange={e => setFormNuevo(f => ({ ...f, nro_cuenta: e.target.value }))} style={inputSt} placeholder="Cuenta bancaria" />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelSt}>Asignar a trabajador (opcional)</label>
              <select value={formNuevo.personal_id} onChange={e => setFormNuevo(f => ({ ...f, personal_id: e.target.value }))} style={inputSt}>
                <option value="">— Sin asignar por ahora —</option>
                {personal.map(p => (
                  <option key={p.id} value={p.id}>{p.usuario} · {p.cargo} · {p.sucursal}</option>
                ))}
              </select>
            </div>
          </div>

          {error && <p style={{ color: '#ef4444', fontSize: '13px', margin: '12px 0 0' }}>⚠ {error}</p>}

          <div style={{ display: 'flex', gap: '10px', marginTop: '24px' }}>
            <button onClick={() => setModal(null)} style={btnS}>Cancelar</button>
            <button onClick={crearVendedor} disabled={guardando} style={btnP}>
              {guardando ? 'Guardando...' : 'Crear vendedor'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────
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

// ─── Estilos ──────────────────────────────────────────────────────────────────
const thSt:    React.CSSProperties = { padding: '13px 16px', textAlign: 'left', fontSize: '11px', fontWeight: 'bold', color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em' }
const tdSt:    React.CSSProperties = { padding: '13px 16px', fontSize: '13px' }
const filterSt:React.CSSProperties = { padding: '9px 14px', border: '1px solid #e5e5e5', borderRadius: '10px', fontSize: '13px', outline: 'none', backgroundColor: 'white' }
const labelSt: React.CSSProperties = { display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#666', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }
const inputSt: React.CSSProperties = { width: '100%', padding: '10px 12px', border: '1px solid #e5e5e5', borderRadius: '10px', fontSize: '14px', outline: 'none', backgroundColor: '#fafafa', boxSizing: 'border-box' }
const btnP:    React.CSSProperties = { flex: 2, padding: '12px', backgroundColor: '#222', border: 'none', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer', color: 'white', fontSize: '14px' }
const btnS:    React.CSSProperties = { flex: 1, padding: '12px', backgroundColor: '#f5f5f5', border: 'none', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer', color: '#666', fontSize: '14px' }
