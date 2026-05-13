'use client'

// app/rrhh/turnos/page.tsx
// Gestión de turnos: hora entrada/salida y tolerancia por cargo + sucursal

import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'

type Turno    = { id: number; cargo_id: number; sucursal_id: number; hora_entrada: string; hora_salida: string; tolerancia_min: number; dias_laborales: number[]; activo: boolean; cargos?: { nombre: string }; sucursales?: { nombre: string } }
type Cargo    = { id: number; nombre: string }
type Sucursal = { id: number; nombre: string }

const DIAS = ['', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

const formVacio = { cargo_id: '', sucursal_id: '', hora_entrada: '08:30', hora_salida: '17:00', tolerancia_min: '15', dias_laborales: [1,2,3,4,5] }

export default function GestionTurnos() {
  const [usuario,   setUsuario]   = useState<any>(null)
  const [turnos,    setTurnos]    = useState<Turno[]>([])
  const [cargos,    setCargos]    = useState<Cargo[]>([])
  const [sucursales,setSucursales]= useState<Sucursal[]>([])
  const [loading,   setLoading]   = useState(true)
  const [modal,     setModal]     = useState(false)
  const [editando,  setEditando]  = useState<Turno | null>(null)
  const [form,      setForm]      = useState(formVacio)
  const [guardando, setGuardando] = useState(false)
  const [error,     setError]     = useState('')

  useEffect(() => {
    const carnet = localStorage.getItem('carnet')
    if (!carnet) return void (window.location.replace('/'))
    supabase.from('personal').select('*, cargos(*)').eq('carnet', carnet).eq('estado', true).single()
      .then(({ data }) => {
        if (!data) return window.location.replace('/')
        const c = data.cargos
        if (!c?.es_admin && !c?.puede_gestionar_rrhh) return window.location.replace('/sistema')
        setUsuario(data)
        Promise.all([loadTurnos(), loadCargos(), loadSucursales()]).finally(() => setLoading(false))
      })
  }, [])

  const loadTurnos = async () => {
    const { data } = await supabase.from('turnos')
      .select('*, cargos(nombre), sucursales(nombre)')
      .order('sucursal_id').order('cargo_id')
    setTurnos(data || [])
  }

  const loadCargos = async () => {
    const { data } = await supabase.from('cargos').select('id, nombre').eq('activo', true).order('nombre')
    setCargos(data || [])
  }

  const loadSucursales = async () => {
    const { data } = await supabase.from('sucursales').select('id, nombre').eq('activo', true)
    setSucursales(data || [])
  }

  const abrirNuevo = () => {
    setEditando(null)
    setForm(formVacio)
    setError('')
    setModal(true)
  }

  const abrirEditar = (t: Turno) => {
    setEditando(t)
    setForm({
      cargo_id:      String(t.cargo_id),
      sucursal_id:   String(t.sucursal_id),
      hora_entrada:  t.hora_entrada.slice(0, 5),
      hora_salida:   t.hora_salida.slice(0, 5),
      tolerancia_min:String(t.tolerancia_min),
      dias_laborales: t.dias_laborales,
    })
    setError('')
    setModal(true)
  }

  const toggleDia = (dia: number) => {
    setForm(f => ({
      ...f,
      dias_laborales: f.dias_laborales.includes(dia)
        ? f.dias_laborales.filter(d => d !== dia)
        : [...f.dias_laborales, dia].sort(),
    }))
  }

  const guardar = async () => {
    setError('')
    if (!form.cargo_id || !form.sucursal_id) return setError('Selecciona cargo y sucursal')
    if (!form.hora_entrada || !form.hora_salida) return setError('Completa los horarios')
    if (form.dias_laborales.length === 0) return setError('Selecciona al menos un día')

    setGuardando(true)
    try {
      const payload = {
        cargo_id:       Number(form.cargo_id),
        sucursal_id:    Number(form.sucursal_id),
        hora_entrada:   form.hora_entrada,
        hora_salida:    form.hora_salida,
        tolerancia_min: Number(form.tolerancia_min),
        dias_laborales: form.dias_laborales,
      }

      if (editando) {
        await supabase.from('turnos').update(payload).eq('id', editando.id)
      } else {
        await supabase.from('turnos').insert(payload)
      }

      await loadTurnos()
      setModal(false)
    } catch (e: any) {
      setError('Error al guardar. Verifica que no exista un turno para ese cargo y sucursal.')
    } finally {
      setGuardando(false)
    }
  }

  const toggleActivo = async (t: Turno) => {
    await supabase.from('turnos').update({ activo: !t.activo }).eq('id', t.id)
    await loadTurnos()
  }

  if (loading) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Arial, sans-serif' }}><p style={{ color: '#999' }}>Cargando...</p></div>

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', minHeight: '100vh', backgroundColor: '#f5f5f5' }}>
      {/* Nav */}
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 40px', backgroundColor: '#222', color: 'white', boxSizing: 'border-box' as const }}>
        <a href="/rrhh" style={{ fontWeight: 'bold', fontSize: '16px', color: 'white', textDecoration: 'none' }}>← RRHH</a>
        <span style={{ color: '#a3c47d', fontWeight: 'bold' }}>Turnos</span>
        <button onClick={abrirNuevo} style={{ backgroundColor: '#a3c47d', color: '#222', border: 'none', borderRadius: '20px', padding: '8px 20px', fontWeight: 'bold', fontSize: '13px', cursor: 'pointer' }}>
          + Nuevo Turno
        </button>
      </nav>

      <div style={{ padding: '32px 40px', maxWidth: '1000px', margin: '0 auto' }}>
        <h2 style={{ marginBottom: '24px', fontSize: '20px' }}>Turnos por cargo y sucursal</h2>

        {/* Tabla */}
        <div style={{ backgroundColor: 'white', borderRadius: '16px', boxShadow: '0 2px 12px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f9f9f9', borderBottom: '2px solid #eee' }}>
                {['Cargo', 'Sucursal', 'Entrada', 'Salida', 'Tolerancia', 'Días', 'Estado', ''].map(h => (
                  <th key={h} style={{ padding: '14px 16px', textAlign: 'left' as const, fontSize: '12px', fontWeight: 'bold', color: '#666', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {turnos.length === 0 && (
                <tr><td colSpan={8} style={{ padding: '40px', textAlign: 'center' as const, color: '#bbb', fontSize: '14px' }}>Sin turnos registrados</td></tr>
              )}
              {turnos.map((t, i) => (
                <tr key={t.id} style={{ borderBottom: '1px solid #f0f0f0', backgroundColor: i % 2 === 0 ? 'white' : '#fafafa' }}>
                  <td style={{ padding: '14px 16px', fontSize: '14px', fontWeight: 'bold' }}>{(t.cargos as any)?.nombre}</td>
                  <td style={{ padding: '14px 16px', fontSize: '13px', color: '#555' }}>{(t.sucursales as any)?.nombre}</td>
                  <td style={{ padding: '14px 16px', fontSize: '14px', fontFamily: 'monospace', fontWeight: 'bold', color: '#2563eb' }}>{t.hora_entrada?.slice(0,5)}</td>
                  <td style={{ padding: '14px 16px', fontSize: '14px', fontFamily: 'monospace', fontWeight: 'bold', color: '#7c3aed' }}>{t.hora_salida?.slice(0,5)}</td>
                  <td style={{ padding: '14px 16px', fontSize: '13px', color: '#555' }}>{t.tolerancia_min} min</td>
                  <td style={{ padding: '14px 16px', fontSize: '12px', color: '#555' }}>
                    {(t.dias_laborales || []).map(d => DIAS[d]).join(', ')}
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <span style={{
                      backgroundColor: t.activo ? '#dcfce7' : '#fee2e2',
                      color: t.activo ? '#166534' : '#991b1b',
                      borderRadius: '20px', padding: '3px 12px', fontSize: '11px', fontWeight: 'bold',
                    }}>
                      {t.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button onClick={() => abrirEditar(t)} style={{ backgroundColor: '#f0f0f0', border: 'none', borderRadius: '8px', padding: '6px 14px', fontSize: '12px', cursor: 'pointer', fontWeight: 'bold' }}>Editar</button>
                      <button onClick={() => toggleActivo(t)} style={{ backgroundColor: t.activo ? '#fee2e2' : '#dcfce7', border: 'none', borderRadius: '8px', padding: '6px 14px', fontSize: '12px', cursor: 'pointer', fontWeight: 'bold', color: t.activo ? '#991b1b' : '#166534' }}>
                        {t.activo ? 'Desactivar' : 'Activar'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', zIndex: 50 }}>
          <div style={{ backgroundColor: 'white', borderRadius: '20px', padding: '36px', width: '100%', maxWidth: '480px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <h3 style={{ margin: '0 0 24px', fontSize: '18px' }}>{editando ? 'Editar Turno' : 'Nuevo Turno'}</h3>

            <div style={{ display: 'grid', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>Cargo</label>
                  <select value={form.cargo_id} onChange={e => setForm(f => ({ ...f, cargo_id: e.target.value }))} style={inputStyle} disabled={!!editando}>
                    <option value="">Seleccionar...</option>
                    {cargos.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Sucursal</label>
                  <select value={form.sucursal_id} onChange={e => setForm(f => ({ ...f, sucursal_id: e.target.value }))} style={inputStyle} disabled={!!editando}>
                    <option value="">Seleccionar...</option>
                    {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>Entrada</label>
                  <input type="time" value={form.hora_entrada} onChange={e => setForm(f => ({ ...f, hora_entrada: e.target.value }))} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Salida</label>
                  <input type="time" value={form.hora_salida} onChange={e => setForm(f => ({ ...f, hora_salida: e.target.value }))} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Tolerancia (min)</label>
                  <input type="number" min="0" max="60" value={form.tolerancia_min} onChange={e => setForm(f => ({ ...f, tolerancia_min: e.target.value }))} style={inputStyle} />
                </div>
              </div>

              <div>
                <label style={labelStyle}>Días laborales</label>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' as const }}>
                  {[1,2,3,4,5,6,7].map(d => (
                    <button key={d} onClick={() => toggleDia(d)} style={{
                      padding: '6px 14px', borderRadius: '20px', border: 'none',
                      backgroundColor: form.dias_laborales.includes(d) ? '#222' : '#f0f0f0',
                      color: form.dias_laborales.includes(d) ? 'white' : '#666',
                      fontSize: '12px', fontWeight: 'bold', cursor: 'pointer',
                    }}>
                      {DIAS[d]}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {error && <p style={{ color: '#ef4444', fontSize: '13px', marginTop: '16px', marginBottom: 0 }}>⚠ {error}</p>}

            <div style={{ display: 'flex', gap: '12px', marginTop: '28px' }}>
              <button onClick={() => setModal(false)} style={{ flex: 1, padding: '12px', backgroundColor: '#f5f5f5', border: 'none', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer', color: '#666' }}>Cancelar</button>
              <button onClick={guardar} disabled={guardando} style={{ flex: 2, padding: '12px', backgroundColor: '#222', border: 'none', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer', color: 'white' }}>
                {guardando ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const labelStyle: React.CSSProperties = { display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#666', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }
const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', border: '1px solid #e5e5e5', borderRadius: '10px', fontSize: '14px', outline: 'none', boxSizing: 'border-box', backgroundColor: '#fafafa' }
