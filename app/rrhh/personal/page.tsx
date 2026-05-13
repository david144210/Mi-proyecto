'use client'

// app/rrhh/personal/page.tsx
// Gestión de personal: ver, editar datos, cargo, sucursal y sueldo base.
// NO toca password_hash bajo ninguna circunstancia.

import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../../../lib/supabase'

type Persona  = { id: number; carnet: string; usuario: string; cargo: string; cargo_id: number | null; sucursal: string; sucursal_id: number | null; haber_basico: number | null; fecha_ingreso: string | null; fecha_nacimiento: string | null; distrito: string | null; rol: string; estado: boolean; cargos?: { nombre: string }; sucursales?: { nombre: string } }
type Cargo    = { id: number; nombre: string }
type Sucursal = { id: number; nombre: string }

export default function GestionPersonal() {
  const [personal,   setPersonal]   = useState<Persona[]>([])
  const [cargos,     setCargos]     = useState<Cargo[]>([])
  const [sucursales, setSucursales] = useState<Sucursal[]>([])
  const [loading,    setLoading]    = useState(true)
  const [busqueda,   setBusqueda]   = useState('')
  const [filtroEstado, setFiltroEstado] = useState<'todos' | 'activo' | 'inactivo'>('todos')
  const [modal,      setModal]      = useState(false)
  const [editando,   setEditando]   = useState<Persona | null>(null)
  const [form,       setForm]       = useState<any>({})
  const [guardando,  setGuardando]  = useState(false)
  const [error,      setError]      = useState('')

  useEffect(() => {
    const carnet = localStorage.getItem('carnet')
    if (!carnet) return void (window.location.replace('/'))
    supabase.from('personal').select('*, cargos(*)').eq('carnet', carnet).eq('estado', true).single()
      .then(({ data }) => {
        if (!data) return window.location.replace('/')
        const c = data.cargos
        if (!c?.es_admin && !c?.puede_gestionar_rrhh) return window.location.replace('/sistema')
        Promise.all([loadPersonal(), loadCargos(), loadSucursales()]).finally(() => setLoading(false))
      })
  }, [])

  const loadPersonal = async () => {
    const { data } = await supabase
      .from('personal')
      // Nunca seleccionamos password_hash
      .select('id, carnet, usuario, cargo, cargo_id, sucursal, sucursal_id, haber_basico, fecha_ingreso, fecha_nacimiento, distrito, rol, estado, cargos(nombre), sucursales(nombre)')
      .order('usuario')
    setPersonal(data || [])
  }

  const loadCargos    = async () => { const { data } = await supabase.from('cargos').select('id, nombre').eq('activo', true).order('nombre'); setCargos(data || []) }
  const loadSucursales= async () => { const { data } = await supabase.from('sucursales').select('id, nombre').eq('activo', true); setSucursales(data || []) }

  const personalFiltrado = useMemo(() => {
    return personal.filter(p => {
      const matchBusqueda = !busqueda || [p.usuario, p.carnet, p.cargo].some(v => v?.toLowerCase().includes(busqueda.toLowerCase()))
      const matchEstado   = filtroEstado === 'todos' || (filtroEstado === 'activo' ? p.estado : !p.estado)
      return matchBusqueda && matchEstado
    })
  }, [personal, busqueda, filtroEstado])

  const abrirEditar = (p: Persona) => {
    setEditando(p)
    setForm({
      usuario:         p.usuario || '',
      carnet:          p.carnet  || '',
      cargo_id:        p.cargo_id   ? String(p.cargo_id)   : '',
      sucursal_id:     p.sucursal_id? String(p.sucursal_id): '',
      haber_basico:    p.haber_basico ?? '',
      fecha_ingreso:   p.fecha_ingreso   || '',
      fecha_nacimiento:p.fecha_nacimiento|| '',
      distrito:        p.distrito || '',
      rol:             p.rol || 'vendedor',
      estado:          p.estado,
    })
    setError(''); setModal(true)
  }

  const guardar = async () => {
    if (!form.usuario?.trim()) return setError('El nombre es obligatorio')
    if (!form.carnet?.trim())  return setError('El carnet es obligatorio')
    setGuardando(true); setError('')
    try {
      // Buscar nombre de cargo y sucursal para los campos texto legacy
      const cargoObj    = cargos.find(c => c.id === Number(form.cargo_id))
      const sucursalObj = sucursales.find(s => s.id === Number(form.sucursal_id))

      // NUNCA incluir password_hash en el update
      const payload: any = {
        usuario:          form.usuario.trim(),
        carnet:           form.carnet.trim(),
        cargo_id:         form.cargo_id    ? Number(form.cargo_id)    : null,
        sucursal_id:      form.sucursal_id ? Number(form.sucursal_id) : null,
        cargo:            cargoObj?.nombre    || form.cargo    || '',
        sucursal:         sucursalObj?.nombre || form.sucursal || '',
        haber_basico:     form.haber_basico   ? Number(form.haber_basico) : null,
        fecha_ingreso:    form.fecha_ingreso   || null,
        fecha_nacimiento: form.fecha_nacimiento|| null,
        distrito:         form.distrito        || null,
        rol:              form.rol,
        estado:           form.estado,
      }

      const { error: err } = await supabase.from('personal').update(payload).eq('id', editando!.id)
      if (err) throw err
      await loadPersonal(); setModal(false)
    } catch (e: any) {
      setError('Error al guardar: ' + (e.message || ''))
    } finally {
      setGuardando(false)
    }
  }

  if (loading) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Arial, sans-serif' }}><p style={{ color: '#999' }}>Cargando...</p></div>

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', minHeight: '100vh', backgroundColor: '#f5f5f5' }}>
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 40px', backgroundColor: '#222', color: 'white', boxSizing: 'border-box' as const }}>
        <a href="/rrhh" style={{ fontWeight: 'bold', fontSize: '16px', color: 'white', textDecoration: 'none' }}>← RRHH</a>
        <span style={{ color: '#a3c47d', fontWeight: 'bold' }}>Personal</span>
        <span style={{ color: '#666', fontSize: '13px' }}>{personal.length} registros</span>
      </nav>

      <div style={{ padding: '32px 40px', maxWidth: '1100px', margin: '0 auto' }}>
        <h2 style={{ marginBottom: '20px', fontSize: '20px' }}>Gestión de Personal</h2>

        {/* Filtros */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' as const }}>
          <input
            value={busqueda} onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, carnet o cargo..."
            style={{ flex: 1, minWidth: '220px', padding: '10px 16px', border: '1px solid #e5e5e5', borderRadius: '10px', fontSize: '14px', outline: 'none', backgroundColor: 'white' }}
          />
          <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value as any)} style={{ padding: '10px 14px', border: '1px solid #e5e5e5', borderRadius: '10px', fontSize: '14px', outline: 'none', backgroundColor: 'white' }}>
            <option value="todos">Todos</option>
            <option value="activo">Activos</option>
            <option value="inactivo">Inactivos</option>
          </select>
        </div>

        {/* Tabla */}
        <div style={{ backgroundColor: 'white', borderRadius: '16px', boxShadow: '0 2px 12px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f9f9f9', borderBottom: '2px solid #eee' }}>
                {['Nombre', 'Carnet', 'Cargo', 'Sucursal', 'Sueldo base', 'Estado', ''].map(h => (
                  <th key={h} style={{ padding: '14px 16px', textAlign: 'left' as const, fontSize: '11px', fontWeight: 'bold', color: '#888', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {personalFiltrado.length === 0 && (
                <tr><td colSpan={7} style={{ padding: '40px', textAlign: 'center' as const, color: '#bbb', fontSize: '14px' }}>Sin resultados</td></tr>
              )}
              {personalFiltrado.map((p, i) => (
                <tr key={p.id} style={{ borderBottom: '1px solid #f0f0f0', backgroundColor: i % 2 === 0 ? 'white' : '#fafafa' }}>
                  <td style={{ padding: '14px 16px', fontSize: '14px', fontWeight: 'bold' }}>{p.usuario}</td>
                  <td style={{ padding: '14px 16px', fontSize: '13px', fontFamily: 'monospace', color: '#555' }}>{p.carnet}</td>
                  <td style={{ padding: '14px 16px', fontSize: '13px', color: '#555' }}>{(p.cargos as any)?.nombre || p.cargo || '—'}</td>
                  <td style={{ padding: '14px 16px', fontSize: '13px', color: '#555' }}>{(p.sucursales as any)?.nombre || p.sucursal || '—'}</td>
                  <td style={{ padding: '14px 16px', fontSize: '14px', fontWeight: 'bold', color: '#166534' }}>
                    {p.haber_basico ? `Bs. ${Number(p.haber_basico).toLocaleString('es-BO')}` : <span style={{ color: '#ccc' }}>—</span>}
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <span style={{ backgroundColor: p.estado ? '#dcfce7' : '#fee2e2', color: p.estado ? '#166534' : '#991b1b', borderRadius: '20px', padding: '3px 12px', fontSize: '11px', fontWeight: 'bold' }}>
                      {p.estado ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <button onClick={() => abrirEditar(p)} style={{ backgroundColor: '#f0f0f0', border: 'none', borderRadius: '8px', padding: '6px 16px', fontSize: '12px', cursor: 'pointer', fontWeight: 'bold' }}>Editar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal edición */}
      {modal && editando && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', zIndex: 50, overflowY: 'auto' }}>
          <div style={{ backgroundColor: 'white', borderRadius: '20px', padding: '36px', width: '100%', maxWidth: '520px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', margin: 'auto' }}>
            <h3 style={{ margin: '0 0 6px', fontSize: '18px' }}>Editar Personal</h3>
            <p style={{ margin: '0 0 24px', color: '#888', fontSize: '13px' }}>La contraseña no se puede modificar desde aquí.</p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Nombre completo</label>
                <input value={form.usuario} onChange={e => setForm((f: any) => ({ ...f, usuario: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Carnet</label>
                <input value={form.carnet} onChange={e => setForm((f: any) => ({ ...f, carnet: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Rol</label>
                <select value={form.rol} onChange={e => setForm((f: any) => ({ ...f, rol: e.target.value }))} style={inputStyle}>
                  <option value="vendedor">Vendedor</option>
                  <option value="administrativo">Administrativo</option>
                  <option value="produccion">Producción</option>
                  <option value="rrhh">RRHH</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Cargo</label>
                <select value={form.cargo_id} onChange={e => setForm((f: any) => ({ ...f, cargo_id: e.target.value }))} style={inputStyle}>
                  <option value="">Sin cargo</option>
                  {cargos.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Sucursal</label>
                <select value={form.sucursal_id} onChange={e => setForm((f: any) => ({ ...f, sucursal_id: e.target.value }))} style={inputStyle}>
                  <option value="">Sin sucursal</option>
                  {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Sueldo base (Bs.)</label>
                <input type="number" min="0" value={form.haber_basico} onChange={e => setForm((f: any) => ({ ...f, haber_basico: e.target.value }))} style={inputStyle} placeholder="Ej: 2500" />
              </div>
              <div>
                <label style={labelStyle}>Fecha ingreso</label>
                <input type="date" value={form.fecha_ingreso} onChange={e => setForm((f: any) => ({ ...f, fecha_ingreso: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Fecha nacimiento</label>
                <input type="date" value={form.fecha_nacimiento} onChange={e => setForm((f: any) => ({ ...f, fecha_nacimiento: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Distrito</label>
                <input value={form.distrito || ''} onChange={e => setForm((f: any) => ({ ...f, distrito: e.target.value }))} style={inputStyle} placeholder="Ej: Zona Sur" />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', paddingTop: '20px' }}>
                <input type="checkbox" id="estado" checked={form.estado} onChange={e => setForm((f: any) => ({ ...f, estado: e.target.checked }))} style={{ width: '16px', height: '16px', cursor: 'pointer' }} />
                <label htmlFor="estado" style={{ fontSize: '14px', fontWeight: 'bold', cursor: 'pointer', color: form.estado ? '#166534' : '#991b1b' }}>
                  {form.estado ? 'Activo' : 'Inactivo'}
                </label>
              </div>
            </div>

            {error && <p style={{ color: '#ef4444', fontSize: '13px', marginTop: '14px', marginBottom: 0 }}>⚠ {error}</p>}

            <div style={{ display: 'flex', gap: '12px', marginTop: '28px' }}>
              <button onClick={() => setModal(false)} style={{ flex: 1, padding: '12px', backgroundColor: '#f5f5f5', border: 'none', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer', color: '#666' }}>Cancelar</button>
              <button onClick={guardar} disabled={guardando} style={{ flex: 2, padding: '12px', backgroundColor: '#222', border: 'none', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer', color: 'white' }}>
                {guardando ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const labelStyle: React.CSSProperties = { display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#666', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }
const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', border: '1px solid #e5e5e5', borderRadius: '10px', fontSize: '14px', outline: 'none', backgroundColor: '#fafafa', boxSizing: 'border-box' }
