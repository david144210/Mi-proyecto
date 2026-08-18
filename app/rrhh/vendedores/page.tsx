'use client'

// app/rrhh/vendedores/page.tsx
// Asignar código de vendedor a trabajadores de personal y gestión de canales/cuentas con contraseñas.

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

type CuentaSocial = {
  id: number; vendedor_id: number; canal: string; nombre_cuenta: string
  correo: string | null; contrasena: string | null; celular_corporativo: string | null
  celular_asignado: string | null; activo: boolean
}

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

const CANALES_CFG: Record<string, { label: string; color: string; bg: string }> = {
  facebook_marketplace: { label: 'FB Marketplace', color: '#1877f2', bg: '#e7f3ff' },
  instagram:            { label: 'Instagram',      color: '#e1306c', bg: '#fdf2f8' },
  tiktok:               { label: 'TikTok',         color: '#000000', bg: '#f1f5f9' },
  telegram:             { label: 'Telegram',       color: '#229ed9', bg: '#e0f2fe' },
  otro:                 { label: 'Otro Canal',     color: '#475569', bg: '#f8fafc' },
}

const getTipoCfg = (tipo: string) => TIPO_CFG[TIPO_NORMALIZADO[tipo] || tipo] || { label: tipo, bg: '#f1f5f9', color: '#475569' }

export default function GestionVendedores() {
  const [vendedores,  setVendedores]  = useState<Vendedor[]>([])
  const [personal,    setPersonal]    = useState<Persona[]>([])
  const [cuentas,     setCuentas]     = useState<CuentaSocial[]>([])
  const [loading,     setLoading]     = useState(true)
  const [busqueda,    setBusqueda]    = useState('')
  const [filtroTipo,  setFiltroTipo]  = useState('')
  const [filtroAsig,  setFiltroAsig]  = useState<'todos' | 'asignados' | 'sin_asignar'>('todos')
  
  // Menús desplegables
  const [menuAbiertoId, setMenuAbiertoId] = useState<number | null>(null)
  const [menuHeaderAbierto, setMenuHeaderAbierto] = useState(false)
  
  // Modales
  const [modal,       setModal]       = useState<'asignar' | 'nuevo' | 'cuentas' | 'gestion_cuentas' | null>(null)
  const [vendSel,     setVendSel]     = useState<Vendedor | null>(null)
  const [personaSel,  setPersonaSel]  = useState('')
  const [guardando,   setGuardando]   = useState(false)
  const [error,       setError]       = useState('')

  // Formulario nuevo vendedor
  const [formNuevo,   setFormNuevo]   = useState({
    nombre: '', ci: '', ci_exp: '', celular: '', alias: '',
    tipo: 'planta', banco: '', nro_cuenta: '', personal_id: '',
  })

  // Formulario nueva/editar cuenta social
  const [cuentaEditId, setCuentaEditId] = useState<number | null>(null)
  const [formCuenta, setFormCuenta] = useState({
    vendedor_id: '', canal: 'facebook_marketplace', nombre_cuenta: '', correo: '',
    contrasena: '', celular_corporativo: '', celular_asignado: '',
  })

  useEffect(() => {
    const carnet = localStorage.getItem('carnet')
    if (!carnet) return void (window.location.replace('/'))
    
    const handleOutsideClick = () => {
      setMenuAbiertoId(null)
      setMenuHeaderAbierto(false)
    }
    window.addEventListener('click', handleOutsideClick)

    supabase.from('personal').select('*, cargos(*)').eq('carnet', carnet).eq('estado', true).single()
      .then(({ data }) => {
        if (!data) return window.location.replace('/')
        const c = data.cargos
        if (!c?.es_admin && !c?.puede_gestionar_rrhh) return window.location.replace('/sistema')
        Promise.all([loadVendedores(), loadPersonal(), loadCuentas()]).finally(() => setLoading(false))
      })

    return () => window.removeEventListener('click', handleOutsideClick)
  }, [])

  // ── Loaders ────────────────────────────────────────────────────────────────
  const loadVendedores = async () => {
    const { data, error } = await supabase.from('vendedores')
      .select('id, nombre, ci, alias, tipo, activo, personal_id, celular, banco, nro_cuenta, created_at, personal!vendedores_personal_id_fkey(id, usuario, carnet, cargo)')
      .order('nombre')
    if (error) {
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

  const loadCuentas = async () => {
    const { data } = await supabase.from('vendedor_cuentas_sociales').select('*')
    setCuentas((data as any) || [])
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
      const payload = {
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

      if (payload.personal_id) {
        await supabase.from('vendedores')
          .update({ activo: false })
          .eq('personal_id', payload.personal_id)
          .eq('activo', true)
      }

      const { error: err } = await supabase.from('vendedores').insert([payload])
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

  // ── Cuentas sociales / marketplace y contraseñas (CRUD Global/Modal) ────────
  const guardarCuentaSocial = async () => {
    if (!formCuenta.vendedor_id || !formCuenta.nombre_cuenta.trim()) 
      return setError('Debe seleccionar un vendedor y colocar el nombre de la cuenta.')
    setGuardando(true); setError('')
    try {
      const payload = {
        vendedor_id: Number(formCuenta.vendedor_id),
        canal: formCuenta.canal,
        nombre_cuenta: formCuenta.nombre_cuenta.trim(),
        correo: formCuenta.correo.trim() || null,
        contrasena: formCuenta.contrasena.trim() || null,
        celular_corporativo: formCuenta.celular_corporativo.trim() || null,
        celular_asignado: formCuenta.celular_asignado.trim() || null,
        activo: true,
      }

      if (cuentaEditId) {
        const { error: err } = await supabase.from('vendedor_cuentas_sociales').update(payload).eq('id', cuentaEditId)
        if (err) throw err
      } else {
        const { error: err } = await supabase.from('vendedor_cuentas_sociales').insert([payload])
        if (err) throw err
      }

      await loadCuentas()
      setCuentaEditId(null)
      setFormCuenta({ vendedor_id: '', canal: 'facebook_marketplace', nombre_cuenta: '', correo: '', contrasena: '', celular_corporativo: '', celular_asignado: '' })
    } catch (e: any) { setError('Error: ' + e.message) }
    finally { setGuardando(false) }
  }

  const editarCuentaSocialClick = (c: CuentaSocial) => {
    setCuentaEditId(c.id)
    setFormCuenta({
      vendedor_id: String(c.vendedor_id),
      canal: c.canal,
      nombre_cuenta: c.nombre_cuenta,
      correo: c.correo || '',
      contrasena: c.contrasena || '',
      celular_corporativo: c.celular_corporativo || '',
      celular_asignado: c.celular_asignado || '',
    })
  }

  const eliminarCuentaSocial = async (id: number) => {
    if (!confirm('¿Eliminar esta cuenta o canal?')) return
    await supabase.from('vendedor_cuentas_sociales').delete().eq('id', id)
    await loadCuentas()
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
        <span style={{ color: '#a3c47d', fontWeight: 'bold' }}>Gestión de Vendedores y Canales</span>
        
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {/* Botón para ingresar a la tabla de gestión de cuentas */}
          <button onClick={() => { setModal('gestion_cuentas'); setError(''); setCuentaEditId(null); setFormCuenta({ vendedor_id: '', canal: 'facebook_marketplace', nombre_cuenta: '', correo: '', contrasena: '', celular_corporativo: '', celular_asignado: '' }) }} 
            style={{ backgroundColor: '#a3c47d', color: '#222', border: 'none', borderRadius: '20px', padding: '8px 16px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}>
            📁 Gestionar Cuentas
          </button>

          {/* Menú hamburguesa en la cabecera */}
          <div style={{ position: 'relative' }}>
            <button onClick={(e) => { e.stopPropagation(); setMenuHeaderAbierto(!menuHeaderAbierto) }}
              style={{ backgroundColor: 'transparent', color: 'white', border: '1px solid #a3c47d', borderRadius: '10px', padding: '7px 12px', fontSize: '16px', cursor: 'pointer', fontWeight: 'bold' }}>
              ☰
            </button>

            {menuHeaderAbierto && (
              <div style={{ position: 'absolute', right: 0, top: '42px', backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 4px 20px rgba(0,0,0,0.15)', zIndex: 40, minWidth: '180px', overflow: 'hidden', border: '1px solid #e2e8f0' }}>
                <button onClick={() => { setModal('nuevo'); setError(''); setMenuHeaderAbierto(false) }}
                  style={{ width: '100%', textAlign: 'left', padding: '12px 16px', backgroundColor: 'transparent', border: 'none', fontSize: '12px', cursor: 'pointer', color: '#222', fontWeight: 'bold' }}>
                  + Nuevo vendedor
                </button>
              </div>
            )}
          </div>
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
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '850px' }}>
            <thead>
              <tr style={{ backgroundColor: '#f9f9f9', borderBottom: '2px solid #eee' }}>
                {['ID', 'Vendedor', 'CI', 'Tipo', 'Canales / Cuentas', 'Trabajador asignado', 'Estado', 'Acciones'].map(h => (
                  <th key={h} style={thSt}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {vendedoresFiltrados.length === 0 && (
                <tr><td colSpan={8} style={{ padding: '40px', textAlign: 'center' as const, color: '#bbb', fontSize: '14px' }}>Sin resultados</td></tr>
              )}
              {vendedoresFiltrados.map((v, i) => {
                const tipoCfg  = getTipoCfg(v.tipo)
                const persona  = v.personal as any
                const cuentasVend = cuentas.filter(c => c.vendedor_id === v.id)
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
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                        {cuentasVend.length === 0 ? (
                          <span style={{ color: '#ccc', fontSize: '11px', fontStyle: 'italic' }}>Sin cuentas</span>
                        ) : (
                          cuentasVend.map(c => {
                            const cfg = CANALES_CFG[c.canal] || CANALES_CFG['otro']
                            return (
                              <span key={c.id} title={`${c.nombre_cuenta} (${c.correo || 'Sin correo'})`} style={{ backgroundColor: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}33`, borderRadius: '6px', padding: '2px 8px', fontSize: '10px', fontWeight: 'bold' }}>
                                {cfg.label}: {c.nombre_cuenta}
                              </span>
                            )
                          })
                        )}
                      </div>
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
                    
                    {/* Menú Hamburguesa de Acciones por fila */}
                    <td style={{ ...tdSt, position: 'relative' }}>
                      <button 
                        onClick={(e) => { e.stopPropagation(); setMenuAbiertoId(menuAbiertoId === v.id ? null : v.id) }}
                        style={{ backgroundColor: '#f1f5f9', color: '#334155', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '6px 12px', fontSize: '14px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        title="Opciones"
                      >
                        ☰
                      </button>

                      {menuAbiertoId === v.id && (
                        <div style={{ position: 'absolute', right: '16px', top: '45px', backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 4px 20px rgba(0,0,0,0.15)', zIndex: 30, minWidth: '180px', overflow: 'hidden', border: '1px solid #e2e8f0' }}>
                          <button onClick={() => { setVendSel(v); setModal('cuentas'); setError(''); setMenuAbiertoId(null) }}
                            style={{ width: '100%', textAlign: 'left', padding: '11px 14px', backgroundColor: 'transparent', border: 'none', borderBottom: '1px solid #f1f5f9', fontSize: '12px', cursor: 'pointer', color: '#166534', fontWeight: 'bold' }}>
                            📁 Cuentas & Contraseñas ({cuentasVend.length})
                          </button>
                          <button onClick={() => { setVendSel(v); setPersonaSel(String(v.personal_id || '')); setModal('asignar'); setError(''); setMenuAbiertoId(null) }}
                            style={{ width: '100%', textAlign: 'left', padding: '11px 14px', backgroundColor: 'transparent', border: 'none', borderBottom: '1px solid #f1f5f9', fontSize: '12px', cursor: 'pointer', color: '#1e40af', fontWeight: 'bold' }}>
                            👤 {persona ? 'Reasignar trabajador' : 'Asignar trabajador'}
                          </button>
                          <button onClick={() => { toggleActivo(v); setMenuAbiertoId(null) }}
                            style={{ width: '100%', textAlign: 'left', padding: '11px 14px', backgroundColor: 'transparent', border: 'none', fontSize: '12px', cursor: 'pointer', color: v.activo ? '#991b1b' : '#166534', fontWeight: 'bold' }}>
                            {v.activo ? '🔴 Desactivar vendedor' : '🟢 Activar vendedor'}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Modal Cuentas Sociales (Por Vendedor) ─────────────────────────────── */}
      {modal === 'cuentas' && vendSel && (
        <Modal titulo={`Canales, Cuentas y Contraseñas de: ${vendSel.nombre}`} onClose={() => setModal(null)}>
          <div style={{ backgroundColor: '#f8fafc', borderRadius: '12px', padding: '14px', marginBottom: '16px' }}>
            <p style={{ fontSize: '12px', color: '#666', margin: '0 0 10px' }}>Para agregar o editar de manera global todas las cuentas, usa el botón "Gestionar Cuentas" en la cabecera.</p>
          </div>

          <p style={{ fontSize: '12px', fontWeight: 'bold', color: '#666', margin: '16px 0 8px' }}>Cuentas y credenciales sincronizadas en Supabase:</p>
          <div style={{ maxHeight: '280px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {cuentas.filter(c => c.vendedor_id === vendSel.id).length === 0 && (
              <p style={{ color: '#aaa', fontSize: '12px', fontStyle: 'italic', textAlign: 'center', margin: '10px 0' }}>No hay cuentas registradas para este vendedor.</p>
            )}
            {cuentas.filter(c => c.vendedor_id === vendSel.id).map(c => {
              const cfg = CANALES_CFG[c.canal] || CANALES_CFG['otro']
              return (
                <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', backgroundColor: 'white', border: '1px solid #eee', borderRadius: '10px' }}>
                  <div>
                    <span style={{ backgroundColor: cfg.bg, color: cfg.color, borderRadius: '6px', padding: '2px 8px', fontSize: '10px', fontWeight: 'bold' }}>{cfg.label}</span>
                    <span style={{ fontWeight: 'bold', fontSize: '13px', marginLeft: '8px' }}>{c.nombre_cuenta}</span>
                    <div style={{ fontSize: '11px', color: '#777', marginTop: '3px' }}>
                      {c.correo && <span>📧 {c.correo} </span>}
                      {c.contrasena && <span style={{ marginLeft: '6px', color: '#d97706', fontWeight: 'bold' }}>🔑 {c.contrasena}</span>}
                    </div>
                    <div style={{ fontSize: '11px', color: '#888', marginTop: '2px' }}>
                      {c.celular_corporativo && <span>Corp: {c.celular_corporativo} · </span>}
                      {c.celular_asignado && <span>Asignado: {c.celular_asignado}</span>}
                    </div>
                  </div>
                  <button onClick={() => eliminarCuentaSocial(c.id)} style={{ backgroundColor: '#fef2f2', color: '#991b1b', border: 'none', borderRadius: '6px', padding: '5px 8px', fontSize: '11px', cursor: 'pointer', fontWeight: 'bold' }}>
                    ✕
                  </button>
                </div>
              )
            })}
          </div>
        </Modal>
      )}

      {/* ── Modal Tabla Global de Gestión de Cuentas (Adicionar, Editar, Eliminar) ── */}
      {modal === 'gestion_cuentas' && (
        <ModalAncho titulo="Tabla de Gestión de Cuentas y Contraseñas de Redes Sociales" onClose={() => setModal(null)}>
          <div style={{ backgroundColor: '#f8fafc', borderRadius: '12px', padding: '16px', marginBottom: '20px', border: '1px solid #e2e8f0' }}>
            <p style={{ margin: '0 0 12px', fontSize: '13px', fontWeight: 'bold', color: '#1e293b' }}>
              {cuentaEditId ? '✏️ Editando cuenta seleccionada' : '➕ Adicionar nueva cuenta o contraseña'}
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
              <div>
                <label style={labelSt}>Vendedor Propietario *</label>
                <select value={formCuenta.vendedor_id} onChange={e => setFormCuenta(f => ({ ...f, vendedor_id: e.target.value }))} style={inputSt}>
                  <option value="">— Seleccionar Vendedor —</option>
                  {vendedores.map(v => <option key={v.id} value={v.id}>{v.nombre} ({v.ci})</option>)}
                </select>
              </div>
              <div>
                <label style={labelSt}>Canal / Red</label>
                <select value={formCuenta.canal} onChange={e => setFormCuenta(f => ({ ...f, canal: e.target.value }))} style={inputSt}>
                  <option value="facebook_marketplace">Facebook Marketplace</option>
                  <option value="instagram">Instagram</option>
                  <option value="tiktok">TikTok</option>
                  <option value="telegram">Telegram</option>
                  <option value="otro">Otro canal</option>
                </select>
              </div>
              <div>
                <label style={labelSt}>Nombre de cuenta *</label>
                <input value={formCuenta.nombre_cuenta} onChange={e => setFormCuenta(f => ({ ...f, nombre_cuenta: e.target.value }))} placeholder="Ej. Tienda Oficial" style={inputSt} />
              </div>
              <div>
                <label style={labelSt}>Correo electrónico</label>
                <input value={formCuenta.correo} onChange={e => setFormCuenta(f => ({ ...f, correo: e.target.value }))} placeholder="correo@ejemplo.com" style={inputSt} />
              </div>
              <div>
                <label style={labelSt}>Contraseña</label>
                <input type="text" value={formCuenta.contrasena} onChange={e => setFormCuenta(f => ({ ...f, contrasena: e.target.value }))} placeholder="Contraseña" style={inputSt} />
              </div>
              <div>
                <label style={labelSt}>Celular corporativo</label>
                <input value={formCuenta.celular_corporativo} onChange={e => setFormCuenta(f => ({ ...f, celular_corporativo: e.target.value }))} placeholder="7xxxxxxx" style={inputSt} />
              </div>
              <div>
                <label style={labelSt}>Celular asignado</label>
                <input value={formCuenta.celular_asignado} onChange={e => setFormCuenta(f => ({ ...f, celular_asignado: e.target.value }))} placeholder="Dispositivo" style={inputSt} />
              </div>
            </div>

            {error && <p style={{ color: '#ef4444', fontSize: '12px', margin: '10px 0 0' }}>⚠ {error}</p>}

            <div style={{ display: 'flex', gap: '10px', marginTop: '14px' }}>
              {cuentaEditId && (
                <button onClick={() => { setCuentaEditId(null); setFormCuenta({ vendedor_id: '', canal: 'facebook_marketplace', nombre_cuenta: '', correo: '', contrasena: '', celular_corporativo: '', celular_asignado: '' }) }}
                  style={{ padding: '10px 16px', backgroundColor: '#e2e8f0', color: '#334155', border: 'none', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer', fontSize: '13px' }}>
                  Cancelar edición
                </button>
              )}
              <button onClick={guardarCuentaSocial} disabled={guardando} style={{ flex: 1, padding: '10px', backgroundColor: '#222', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer', fontSize: '13px' }}>
                {guardando ? 'Guardando en Supabase...' : (cuentaEditId ? '💾 Actualizar Cuenta y Contraseña' : '+ Guardar Cuenta y Contraseña')}
              </button>
            </div>
          </div>

          <p style={{ fontSize: '13px', fontWeight: 'bold', color: '#334155', marginBottom: '10px' }}>Listado general de cuentas registradas ({cuentas.length}):</p>
          <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '12px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '700px' }}>
              <thead>
                <tr style={{ backgroundColor: '#f1f5f9', borderBottom: '1px solid #cbd5e1' }}>
                  {['Vendedor', 'Canal', 'Cuenta / Correo', 'Contraseña', 'Celulares', 'Acciones'].map(h => (
                    <th key={h} style={thSt}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cuentas.length === 0 && (
                  <tr><td colSpan={6} style={{ padding: '30px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>No hay cuentas registradas en el sistema.</td></tr>
                )}
                {cuentas.map((c, idx) => {
                  const vend = vendedores.find(v => v.id === c.vendedor_id)
                  const cfg = CANALES_CFG[c.canal] || CANALES_CFG['otro']
                  return (
                    <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9', backgroundColor: idx % 2 === 0 ? 'white' : '#fafafa' }}>
                      <td style={tdSt}>
                        <span style={{ fontWeight: 'bold', color: '#1e293b' }}>{vend?.name || vend?.nombre || `ID: ${c.vendedor_id}`}</span>
                      </td>
                      <td style={tdSt}>
                        <span style={{ backgroundColor: cfg.bg, color: cfg.color, borderRadius: '6px', padding: '3px 8px', fontSize: '11px', fontWeight: 'bold' }}>
                          {cfg.label}
                        </span>
                      </td>
                      <td style={tdSt}>
                        <div style={{ fontWeight: 'bold', fontSize: '13px' }}>{c.nombre_cuenta}</div>
                        {c.correo && <div style={{ fontSize: '11px', color: '#64748b' }}>📧 {c.correo}</div>}
                      </td>
                      <td style={{ ...tdSt, fontFamily: 'monospace', color: '#d97706', fontWeight: 'bold' }}>
                        {c.contrasena || <span style={{ color: '#cbd5e1', fontWeight: 'normal' }}>—</span>}
                      </td>
                      <td style={{ ...tdSt, fontSize: '11px', color: '#64748b' }}>
                        {c.celular_corporativo && <div>Corp: {c.celular_corporativo}</div>}
                        {c.celular_asignado && <div>Asig: {c.celular_asignado}</div>}
                      </td>
                      <td style={tdSt}>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button onClick={() => editarCuentaSocialClick(c)} style={{ backgroundColor: '#eff6ff', color: '#1e40af', border: 'none', borderRadius: '6px', padding: '6px 10px', fontSize: '11px', cursor: 'pointer', fontWeight: 'bold' }}>
                            Editar
                          </button>
                          <button onClick={() => eliminarCuentaSocial(c.id)} style={{ backgroundColor: '#fef2f2', color: '#991b1b', border: 'none', borderRadius: '6px', padding: '6px 10px', fontSize: '11px', cursor: 'pointer', fontWeight: 'bold' }}>
                            Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </ModalAncho>
      )}

      {/* ── Modal asignar trabajador ─────────────────────────────────────────── */}
      {modal === 'asignar' && vendSel && (
        <Modal titulo="Asignar Trabajador" onClose={() => setModal(null)}>
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
      <div style={{ backgroundColor: 'white', borderRadius: '20px', padding: '32px', width: '100%', maxWidth: '580px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', margin: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ margin: 0, fontSize: '17px' }}>{titulo}</h3>
          <button onClick={onClose} style={{ backgroundColor: 'transparent', border: 'none', fontSize: '22px', cursor: 'pointer', color: '#aaa' }}>×</button>
        </div>
        {children}
      </div>
    </div>
  )
}

function ModalAncho({ titulo, onClose, children }: { titulo: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', zIndex: 50, overflowY: 'auto' }}>
      <div style={{ backgroundColor: 'white', borderRadius: '20px', padding: '32px', width: '100%', maxWidth: '850px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', margin: 'auto' }}>
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