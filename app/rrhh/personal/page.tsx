'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'

export default function GestionPersonal() {
  const [usuario, setUsuario] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  
  // Cambiamos el nombre de 'personal' a 'listaUsuarios' para evitar conflictos con interfaces globales
  const [listaUsuarios, setListaUsuarios] = useState<any[]>([])
  const [cargos, setCargos] = useState<any[]>([])
  const [busqueda, setBusqueda] = useState('')

  const [modalAbierto, setModalAbierto] = useState(false)
  const [modoEditar, setModoEditar] = useState(false)
  const [idEditando, setIdEditando] = useState<number | null>(null)
  const [form, setForm] = useState<any>({
    carnet: '', usuario: '', fecha_ingreso: '', fecha_nacimiento: '',
    estado: true, haber_basico: '', cargo: '', cargo_id: '',
    distrito: '', sucursal: '', rol: 'vendedor',
  })
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
    // Usamos Record<string, any> para que TypeScript no busque una interfaz predefinida
    const { data: p }: { data: any[] | null } = await supabase.from('personal').select('*, cargos(*)').order('carnet')
    const { data: c } = await supabase.from('cargos').select('*').eq('activo', true).order('nombre')
    
    setListaUsuarios(p || [])
    setCargos(c || [])
    setLoading(false)
  }

  const abrirModalNuevo = () => {
    setForm({ carnet: '', usuario: '', fecha_ingreso: '', fecha_nacimiento: '', estado: true, haber_basico: '', cargo: '', cargo_id: '', distrito: '', sucursal: '', rol: 'vendedor' })
    setModoEditar(false)
    setIdEditando(null)
    setErrorModal(''); setExito(''); setModalAbierto(true)
  }

  const abrirModalEditar = (item: any) => {
    setForm({
      carnet: item.carnet || '',
      usuario: item.usuario || '',
      fecha_ingreso: item.fecha_ingreso || '',
      fecha_nacimiento: item.fecha_nacimiento || '',
      estado: item.estado ?? true,
      haber_basico: item.haber_basico || '',
      cargo: item.cargo || '',
      cargo_id: item.cargo_id || '',
      distrito: item.distrito || '',
      sucursal: item.sucursal || '',
      rol: item.rol || 'vendedor',
    })
    setModoEditar(true); setIdEditando(item.id); setErrorModal(''); setExito(''); setModalAbierto(true)
  }

  const cerrarModal = () => { setModalAbierto(false); setErrorModal(''); setExito('') }

  const handleChange = (campo: string, valor: any) => { setForm({ ...form, [campo]: valor }) }

  const handleGuardar = async () => {
    if (!form.carnet || !form.usuario) { setErrorModal('Carnet y usuario son obligatorios'); return }
    setGuardando(true); setErrorModal('')

    try {
      const datosBase = {
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
        await supabase.from('personal').update(datosBase).eq('id', idEditando)
        setExito('Actualizado correctamente')
      } else {
        await supabase.from('personal').insert(datosBase)
        setExito('Creado correctamente')
      }

      await cargarDatos()
      setTimeout(() => cerrarModal(), 1500)
    } catch (e) { setErrorModal('Error inesperado') } finally { setGuardando(false) }
  }

  const filtrados = listaUsuarios.filter((u: any) =>
    (u.carnet || '').toLowerCase().includes(busqueda.toLowerCase()) ||
    (u.usuario || '').toLowerCase().includes(busqueda.toLowerCase())
  )

  if (loading) return <p style={{ textAlign: 'center', marginTop: '100px', fontFamily: 'Arial' }}>Cargando...</p>
  if (!usuario) return null

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', minHeight: '100vh', backgroundColor: '#f5f5f5' }}>
      <nav style={{ display: 'flex', justifyContent: 'space-between', padding: '15px 40px', backgroundColor: '#222', color: 'white', position: 'fixed', top: 0, width: '100%', zIndex: 1000 }}>
        <a href="/sistema" style={{ fontWeight: 'bold', color: 'white', textDecoration: 'none' }}>Muebles is Better</a>
        <span style={{ color: '#a3c47d' }}>Gestión de Personal</span>
      </nav>

      <div style={{ padding: '100px 40px 60px 40px', maxWidth: '1100px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h1 style={{ fontSize: '24px', margin: 0 }}>Personal ({listaUsuarios.length})</h1>
          <div style={{ display: 'flex', gap: '12px' }}>
            <input type="text" placeholder="Buscar..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} style={{ padding: '10px', borderRadius: '8px', border: '1px solid #ddd' }} />
            <button onClick={abrirModalNuevo} style={{ padding: '10px 20px', backgroundColor: '#087e0b', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>+ Nuevo</button>
          </div>
        </div>

        <div style={{ backgroundColor: 'white', borderRadius: '16px', boxShadow: '0 2px 12px rgba(0,0,0,0.08)', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
            <thead>
              <tr style={{ backgroundColor: '#f9f9f9' }}>
                <th style={{ padding: '14px', textAlign: 'left', borderBottom: '2px solid #eee' }}>CI</th>
                <th style={{ padding: '14px', textAlign: 'left', borderBottom: '2px solid #eee' }}>Usuario</th>
                <th style={{ padding: '14px', textAlign: 'left', borderBottom: '2px solid #eee' }}>Cargo</th>
                <th style={{ padding: '14px', textAlign: 'center', borderBottom: '2px solid #eee' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((item: any) => (
                <tr key={item.id}>
                  <td style={{ padding: '12px', borderBottom: '1px solid #f0f0f0' }}>{item.carnet}</td>
                  <td style={{ padding: '12px', borderBottom: '1px solid #f0f0f0' }}>{item.usuario}</td>
                  <td style={{ padding: '12px', borderBottom: '1px solid #f0f0f0' }}>
                    {Array.isArray(item.cargos) ? item.cargos[0]?.nombre : item.cargos?.nombre || item.cargo || '—'}
                  </td>
                  <td style={{ padding: '12px', borderBottom: '1px solid #f0f0f0', textAlign: 'center' }}>
                    <button onClick={() => abrirModalEditar(item)} style={{ backgroundColor: '#087e0b', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer' }}>Editar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modalAbierto && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
          <div style={{ backgroundColor: 'white', borderRadius: '16px', padding: '32px', width: '500px', maxWidth: '95%' }}>
            <h2>{modoEditar ? 'Editar' : 'Nuevo'} Usuario</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
              <div><label>CI</label><input type="text" value={form.carnet} onChange={(e) => handleChange('carnet', e.target.value)} style={{ width: '100%', padding: '8px' }} /></div>
              <div><label>Usuario</label><input type="text" value={form.usuario} onChange={(e) => handleChange('usuario', e.target.value)} style={{ width: '100%', padding: '8px' }} /></div>
            </div>
            <div style={{ marginBottom: '20px' }}>
              <label>Cargo</label>
              <select value={form.cargo_id} onChange={(e) => handleChange('cargo_id', e.target.value)} style={{ width: '100%', padding: '8px' }}>
                <option value="">-- Seleccionar --</option>
                {cargos.map((c: any) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
            {errorModal && <p style={{ color: 'red' }}>{errorModal}</p>}
            {exito && <p style={{ color: 'green' }}>{exito}</p>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button onClick={cerrarModal} style={{ padding: '10px 20px' }}>Cancelar</button>
              <button onClick={handleGuardar} disabled={guardando} style={{ padding: '10px 20px', backgroundColor: '#087e0b', color: 'white', border: 'none', borderRadius: '8px' }}>{guardando ? 'Guardando...' : 'Guardar'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}