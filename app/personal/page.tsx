'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

const camposVacios = {
  carnet: '',
  usuario: '',
  fecha_ingreso: '',
  fecha_nacimiento: '',
  estado: true,
  haber_basico: '',
  cargo: '',
  cargo_id: '',
  distrito: '',
  sucursal: '',
  rol: 'vendedor',
}

export default function GestionPersonal() {
  const [usuario, setUsuario] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [personal, setPersonal] = useState<any>([]) // Tipado flexible
  const [cargos, setCargos] = useState<any[]>([])
  const [busqueda, setBusqueda] = useState('')

  const [modalAbierto, setModalAbierto] = useState(false)
  const [modoEditar, setModoEditar] = useState(false)
  const [idEditando, setIdEditando] = useState<number | null>(null)
  const [form, setForm] = useState<any>(camposVacios)
  const [guardando, setGuardando] = useState(false)
  const [errorModal, setErrorModal] = useState('')
  const [exito, setExito] = useState('')

  useEffect(() => {
    const carnetGuardado = localStorage.getItem('carnet')
    if (!carnetGuardado) { window.location.replace('/'); return }

    supabase.from('personal').select('*, cargos(*)').eq('carnet', carnetGuardado).eq('estado', true).single()
      .then(({ data }) => {
        if (!data || (!data.cargos?.es_admin && data.rol !== 'admin')) {
          window.location.replace('/')
          return
        }
        setUsuario(data)
        cargarDatos()
      })
  }, [])

  const cargarDatos = async () => {
    const [{ data: p }, { data: c }] = await Promise.all([
      supabase.from('personal').select('*, cargos(*)').order('carnet'),
      supabase.from('cargos').select('*').eq('activo', true).order('nombre'),
    ])
    // Forzado de tipo para evitar el error de Persona[] en Vercel
    setPersonal((p as unknown as any) || [])
    setCargos(c || [])
    setLoading(false)
  }

  const abrirModalNuevo = () => {
    setForm(camposVacios)
    setModoEditar(false)
    setIdEditando(null)
    setErrorModal('')
    setExito('')
    setModalAbierto(true)
  }

  const abrirModalEditar = (persona: any) => {
    setForm({
      carnet: persona.carnet || '',
      usuario: persona.usuario || '',
      fecha_ingreso: persona.fecha_ingreso || '',
      fecha_nacimiento: persona.fecha_nacimiento || '',
      estado: persona.estado ?? true,
      haber_basico: persona.haber_basico || '',
      cargo: persona.cargo || '',
      cargo_id: persona.cargo_id || '',
      distrito: persona.distrito || '',
      sucursal: persona.sucursal || '',
      rol: persona.rol || 'vendedor',
    })
    setModoEditar(true)
    setIdEditando(persona.id)
    setErrorModal('')
    setExito('')
    setModalAbierto(true)
  }

  const cerrarModal = () => {
    setModalAbierto(false)
    setErrorModal('')
    setExito('')
  }

  const handleChange = (campo: string, valor: any) => {
    setForm({ ...form, [campo]: valor })
  }

  const handleGuardar = async () => {
    if (!form.carnet) { setErrorModal('El carnet es obligatorio'); return }
    if (!form.usuario) { setErrorModal('El usuario es obligatorio'); return }

    setGuardando(true)
    setErrorModal('')

    try {
      const datosBase: any = {
        carnet: form.carnet,
        usuario: form.usuario,
        fecha_ingreso: form.fecha_ingreso || null,
        fecha_nacimiento: form.fecha_nacimiento || null,
        estado: form.estado,
        haber_basico: form.haber_basico ? parseFloat(form.haber_basico) : null,
        cargo: form.cargo || null,
        cargo_id: form.cargo_id ? parseInt(form.cargo_id) : null,
        distrito: form.distrito || null,
        sucursal: form.sucursal || null,
        rol: form.rol || 'vendedor',
      }

      if (modoEditar && idEditando) {
        const { error } = await supabase.from('personal').update(datosBase).eq('id', idEditando)
        if (error) { setErrorModal('Error al actualizar: ' + error.message); setGuardando(false); return }
        setExito('Usuario actualizado correctamente')
      } else {
        const { error } = await supabase.from('personal').insert(datosBase)
        if (error) { setErrorModal('Error al crear: ' + error.message); setGuardando(false); return }
        setExito('Usuario creado correctamente')
      }

      await cargarDatos()
      setGuardando(false)
      setTimeout(() => cerrarModal(), 1500)
    } catch (e) {
      setErrorModal('Error inesperado')
      setGuardando(false)
    }
  }

  const personalFiltrado = Array.isArray(personal) ? personal.filter((p: any) =>
    (p.carnet || '').toLowerCase().includes(busqueda.toLowerCase()) ||
    (p.usuario || '').toLowerCase().includes(busqueda.toLowerCase()) ||
    (p.cargo || '').toLowerCase().includes(busqueda.toLowerCase()) ||
    (p.distrito || '').toLowerCase().includes(busqueda.toLowerCase())
  ) : []

  const inputStyle: any = {
    padding: '10px 12px', borderRadius: '8px', border: '1px solid #ddd',
    fontSize: '14px', width: '100%', boxSizing: 'border-box', outline: 'none',
    backgroundColor: 'white',
  }
  const labelStyle: any = { fontSize: '13px', color: '#555', display: 'block', marginBottom: '5px', fontWeight: '500' }
  const gridDos: any = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }

  if (loading) return <p style={{ textAlign: 'center', marginTop: '100px', fontFamily: 'Arial' }}>Cargando...</p>
  if (!usuario) return null

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', minHeight: '100vh', backgroundColor: '#f5f5f5' }}>
      <style>{`
        @media (max-width: 768px) {
          .gp-container { padding: 80px 16px 40px 16px !important; }
          .gp-header { flex-direction: column !important; align-items: flex-start !important; gap: 12px !important; }
          .gp-grid-dos { grid-template-columns: 1fr !important; }
          .gp-tabla th, .gp-tabla td { padding: 8px 10px !important; font-size: 12px !important; }
          .gp-modal-inner { padding: 24px 16px !important; width: 95vw !important; }
        }
      `}</style>

      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 40px', backgroundColor: '#222', color: 'white', position: 'fixed', top: 0, width: '100%', zIndex: 1000, boxSizing: 'border-box' }}>
        <a href="/sistema" style={{ fontWeight: 'bold', fontSize: '18px', color: 'white', textDecoration: 'none' }}>
          Muebles is Better
        </a>
        <span style={{ color: '#a3c47d', fontWeight: 'bold' }}>Gestion de Personal</span>
        <span style={{ color: '#2c6d2e', fontSize: '14px' }}>{usuario.usuario} 👤</span>
      </nav>

      <div className="gp-container" style={{ padding: '100px 40px 60px 40px', maxWidth: '1100px', margin: '0 auto' }}>
        <div className="gp-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div>
            <h1 style={{ margin: '0 0 4px 0', fontSize: '24px' }}>Personal</h1>
            <p style={{ margin: 0, color: '#888', fontSize: '14px' }}>{personal.length} usuarios registrados</p>
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder="Buscar por CI, usuario..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              style={{ ...inputStyle, width: '220px', marginBottom: 0 }}
            />
            <button
              onClick={abrirModalNuevo}
              style={{ padding: '10px 20px', backgroundColor: '#087e0b', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold' }}
            >
              + Nuevo Usuario
            </button>
          </div>
        </div>

        <div style={{ backgroundColor: 'white', borderRadius: '16px', boxShadow: '0 2px 12px rgba(0,0,0,0.08)', overflowX: 'auto' }}>
          <table className="gp-tabla" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
            <thead>
              <tr style={{ backgroundColor: '#f9f9f9' }}>
                <th style={{ padding: '14px 16px', textAlign: 'left', borderBottom: '2px solid #eee' }}>CI</th>
                <th style={{ padding: '14px 16px', textAlign: 'left', borderBottom: '2px solid #eee' }}>Usuario</th>
                <th style={{ padding: '14px 16px', textAlign: 'left', borderBottom: '2px solid #eee' }}>Cargo</th>
                <th style={{ padding: '14px 16px', textAlign: 'left', borderBottom: '2px solid #eee' }}>Sucursal</th>
                <th style={{ padding: '14px 16px', textAlign: 'center', borderBottom: '2px solid #eee' }}>Estado</th>
                <th style={{ padding: '14px 16px', textAlign: 'center', borderBottom: '2px solid #eee' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {personalFiltrado.map((p: any, i: number) => (
                <tr key={p.id} style={{ backgroundColor: i % 2 === 0 ? 'white' : '#fafafa' }}>
                  <td style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0', fontWeight: 'bold' }}>{p.carnet}</td>
                  <td style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0' }}>{p.usuario || '—'}</td>
                  <td style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0' }}>
                    {Array.isArray(p.cargos) ? p.cargos[0]?.nombre : p.cargos?.nombre || p.cargo || '—'}
                  </td>
                  <td style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0' }}>{p.sucursal || '—'}</td>
                  <td style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0', textAlign: 'center' }}>
                    <span style={{
                      backgroundColor: p.estado ? '#e8f5e9' : '#ffebee',
                      color: p.estado ? '#2e7d32' : '#c62828',
                      padding: '3px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 'bold'
                    }}>
                      {p.estado ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0', textAlign: 'center' }}>
                    <button onClick={() => abrirModalEditar(p)} style={{ backgroundColor: '#087e0b', color: 'white', border: 'none', padding: '6px 14px', borderRadius: '6px', cursor: 'pointer' }}>Editar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modalAbierto && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div className="gp-modal-inner" style={{ backgroundColor: 'white', borderRadius: '16px', padding: '32px', width: '600px', maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
              <h2 style={{ margin: 0 }}>{modoEditar ? 'Editar Usuario' : 'Nuevo Usuario'}</h2>
              <button onClick={cerrarModal} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer' }}>✕</button>
            </div>

            <div className="gp-grid-dos" style={gridDos}>
              <div><label style={labelStyle}>CI *</label><input type="text" value={form.carnet} onChange={(e) => handleChange('carnet', e.target.value)} style={inputStyle} /></div>
              <div><label style={labelStyle}>Usuario *</label><input type="text" value={form.usuario} onChange={(e) => handleChange('usuario', e.target.value)} style={inputStyle} /></div>
            </div>

            <div className="gp-grid-dos" style={gridDos}>
              <div><label style={labelStyle}>Cargo (sistema)</label>
                <select value={form.cargo_id} onChange={(e) => handleChange('cargo_id', e.target.value)} style={inputStyle}>
                  <option value="">-- Sin cargo --</option>
                  {cargos.map(c => <option key={c.id} value={String(c.id)}>{c.nombre}</option>)}
                </select>
              </div>
              <div><label style={labelStyle}>Sucursal</label>
                <select value={form.sucursal} onChange={(e) => handleChange('sucursal', e.target.value)} style={inputStyle}>
                  <option value="">-- Selecciona --</option>
                  <option value="El Alto">El Alto</option><option value="La Paz">La Paz</option><option value="Santa Cruz">Santa Cruz</option><option value="Cochabamba">Cochabamba</option>
                </select>
              </div>
            </div>

            <div className="gp-grid-dos" style={gridDos}>
              <div><label style={labelStyle}>Rol</label>
                <select value={form.rol} onChange={(e) => handleChange('rol', e.target.value)} style={inputStyle}>
                  <option value="vendedor">Vendedor</option><option value="admin">Admin</option><option value="supervisor">Supervisor</option>
                </select>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: '10px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.estado} onChange={(e) => handleChange('estado', e.target.checked)} /> Activo
                </label>
              </div>
            </div>

            {errorModal && <div style={{ color: '#c62828', marginBottom: '10px' }}>{errorModal}</div>}
            {exito && <div style={{ color: '#2e7d32', marginBottom: '10px' }}>{exito}</div>}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button onClick={cerrarModal} style={{ padding: '10px 20px', borderRadius: '8px', border: '1px solid #ccc' }}>Cancelar</button>
              <button onClick={handleGuardar} disabled={guardando} style={{ padding: '10px 24px', backgroundColor: guardando ? '#ccc' : '#087e0b', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold' }}>
                {guardando ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}