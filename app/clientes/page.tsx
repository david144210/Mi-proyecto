'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

const camposVacios = {
  codigo: '',
  nombre: '',
  direccion: '',
  celular: '',
  activo: true,
}

export default function Clientes() {
  const [usuario, setUsuario] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [esAdmin, setEsAdmin] = useState(false)
  const [clientes, setClientes] = useState<any[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [pagina, setPagina] = useState(1)
  const [totalClientes, setTotalClientes] = useState(0)
  const [loadingTabla, setLoadingTabla] = useState(false)
  const POR_PAGINA = 30

  // Modal
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
    supabase.from('personal').select('*, cargos(*)')
      .eq('carnet', carnetGuardado).eq('estado', true).single()
      .then(({ data }) => {
        if (!data) { window.location.replace('/'); return }
        setUsuario(data)
        const admin = data?.cargos?.es_admin || data?.rol === 'admin'
        setEsAdmin(admin)
        cargarClientes(1, '')
      })
  }, [])

  // Paginacion y busqueda 100% en servidor — sin limite de 1000 filas
  const cargarClientes = async (pag: number, busq: string) => {
    setLoadingTabla(true)
    const from = (pag - 1) * POR_PAGINA
    const to   = from + POR_PAGINA - 1

    let query = supabase
      .from('clientes')
      .select('*', { count: 'exact' })
      .order('codigo', { ascending: true })
      .range(from, to)

    if (busq.trim()) {
      const esNumero = /^\d+$/.test(busq.trim())
      if (esNumero) {
        query = query.or(`codigo.eq.${busq.trim()},nombre.ilike.%${busq.trim()}%,celular.ilike.%${busq.trim()}%`)
      } else {
        query = query.or(`nombre.ilike.%${busq.trim()}%,direccion.ilike.%${busq.trim()}%,celular.ilike.%${busq.trim()}%`)
      }
    }

    const { data, count } = await query
    setClientes(data || [])
    setTotalClientes(count || 0)
    setLoadingTabla(false)
    setLoading(false)
  }

  const totalPaginas = Math.ceil(totalClientes / POR_PAGINA)
  const clientesPagina = clientes  // ya vienen paginados del servidor

  const abrirNuevo = () => {
    if (!esAdmin) return
    setForm(camposVacios)
    setModoEditar(false)
    setIdEditando(null)
    setErrorModal('')
    setExito('')
    setModalAbierto(true)
  }

  const abrirEditar = (cliente: any) => {
    if (!esAdmin) return
    setForm({
      codigo: cliente.codigo || '',
      nombre: cliente.nombre || '',
      direccion: cliente.direccion || '',
      celular: cliente.celular || '',
      activo: cliente.activo ?? true,
    })
    setModoEditar(true)
    setIdEditando(cliente.id)
    setErrorModal('')
    setExito('')
    setModalAbierto(true)
  }

  const cerrarModal = () => {
    setModalAbierto(false)
    setErrorModal('')
    setExito('')
  }

  const handleGuardar = async () => {
    if (!esAdmin) return
    if (!form.codigo || !form.nombre) {
      setErrorModal('El codigo y nombre son obligatorios')
      return
    }
    setGuardando(true)
    setErrorModal('')

    const datos = {
      codigo: parseInt(form.codigo),
      nombre: form.nombre.trim(),
      direccion: form.direccion?.trim() || null,
      celular: form.celular?.trim() || null,
      activo: form.activo,
    }

    if (modoEditar && idEditando) {
      const { error } = await supabase.from('clientes').update(datos).eq('id', idEditando)
      if (error) {
        setErrorModal(error.message.includes('unique') ? 'El codigo ya existe' : 'Error al actualizar: ' + error.message)
        setGuardando(false)
        return
      }
      setExito('Cliente actualizado correctamente')
    } else {
      const { error } = await supabase.from('clientes').insert(datos)
      if (error) {
        setErrorModal(error.message.includes('unique') ? 'El codigo ya existe' : 'Error al crear: ' + error.message)
        setGuardando(false)
        return
      }
      setExito('Cliente creado correctamente')
    }

    await cargarClientes(pagina, busqueda)
    setGuardando(false)
    setTimeout(() => cerrarModal(), 1200)
  }

  const inputStyle: any = {
    padding: '10px 12px', borderRadius: '8px', border: '1px solid #ddd',
    fontSize: '14px', width: '100%', boxSizing: 'border-box',
    outline: 'none', backgroundColor: 'white',
  }
  const labelStyle: any = {
    fontSize: '13px', color: '#555', display: 'block',
    marginBottom: '5px', fontWeight: '500',
  }

  if (loading) return <p style={{ textAlign: 'center', marginTop: '100px', fontFamily: 'Arial' }}>Cargando...</p>

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', minHeight: '100vh', backgroundColor: '#f5f5f5' }}>

      <style>{`
        @media (max-width: 768px) {
          .cli-container { padding: 80px 16px 40px 16px !important; }
          .cli-header { flex-direction: column !important; gap: 12px !important; }
          .cli-tabla-wrap { font-size: 12px !important; }
          .cli-tabla th, .cli-tabla td { padding: 8px 10px !important; }
          .cli-col-dir { display: none !important; }
        }
      `}</style>

      {/* MODAL - solo admin */}
      {modalAbierto && esAdmin && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', boxSizing: 'border-box' }}>
          <div style={{ backgroundColor: 'white', borderRadius: '16px', padding: '32px', width: '500px', maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ margin: 0, fontSize: '20px' }}>{modoEditar ? 'Editar Cliente' : 'Nuevo Cliente'}</h2>
              <button onClick={cerrarModal} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#999' }}>✕</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '16px', marginBottom: '16px' }}>
              <div>
                <label style={labelStyle}>Codigo *</label>
                <input type="number" value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} style={inputStyle} placeholder="Ej: 2084" />
              </div>
              <div>
                <label style={labelStyle}>Nombre completo *</label>
                <input type="text" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} style={inputStyle} placeholder="Nombre del cliente" />
              </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={labelStyle}>Direccion</label>
              <input type="text" value={form.direccion} onChange={(e) => setForm({ ...form, direccion: e.target.value })} style={inputStyle} placeholder="Direccion o referencia" />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={labelStyle}>Celular</label>
              <input type="text" value={form.celular} onChange={(e) => setForm({ ...form, celular: e.target.value })} style={inputStyle} placeholder="Numero de celular" />
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '14px' }}>
                <input type="checkbox" checked={form.activo} onChange={(e) => setForm({ ...form, activo: e.target.checked })} style={{ width: '18px', height: '18px', cursor: 'pointer' }} />
                <span>Cliente activo</span>
              </label>
            </div>

            {errorModal && (
              <div style={{ backgroundColor: '#ffebee', border: '1px solid #ffcdd2', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', color: '#c62828', fontSize: '13px' }}>
                {errorModal}
              </div>
            )}
            {exito && (
              <div style={{ backgroundColor: '#e8f5e9', border: '1px solid #c8e6c9', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', color: '#2e7d32', fontSize: '13px' }}>
                {exito}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button onClick={cerrarModal} style={{ padding: '10px 20px', backgroundColor: 'transparent', border: '1px solid #ccc', borderRadius: '8px', cursor: 'pointer', fontSize: '14px' }}>
                Cancelar
              </button>
              <button onClick={handleGuardar} disabled={guardando}
                style={{ padding: '10px 24px', backgroundColor: guardando ? '#ccc' : '#087e0b', color: 'white', border: 'none', borderRadius: '8px', cursor: guardando ? 'not-allowed' : 'pointer', fontSize: '14px', fontWeight: 'bold' }}>
                {guardando ? 'Guardando...' : modoEditar ? 'Actualizar' : 'Crear Cliente'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* NAVBAR */}
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 40px', backgroundColor: '#222', color: 'white', position: 'fixed', top: 0, width: '100%', zIndex: 1000, boxSizing: 'border-box' }}>
        <a href="/" style={{ fontWeight: 'bold', fontSize: '20px', color: 'white', textDecoration: 'none' }}>Muebles is Better</a>
        <span style={{ color: '#a3c47d', fontWeight: 'bold' }}>Clientes</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <a href="/sistema" style={{ color: '#a3c47d', fontSize: '14px', textDecoration: 'none' }}>Sistema</a>

        </div>
      </nav>

      {/* CONTENIDO */}
      <div className="cli-container" style={{ padding: '100px 40px 60px 40px', maxWidth: '1100px', margin: '0 auto' }}>

        {/* HEADER */}
        <div className="cli-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div>
            <h1 style={{ margin: '0 0 4px 0', fontSize: '24px' }}>Clientes</h1>
            <p style={{ margin: 0, color: '#666', fontSize: '14px' }}>
              {totalClientes.toLocaleString()} clientes en total
              {busqueda && ` · Buscando: "${busqueda}"`}
              {esAdmin && <span style={{ marginLeft: '10px', color: '#1565c0', fontSize: '12px' }}>● Modo administrador</span>}
            </p>
          </div>
          {/* Boton nuevo solo para admin */}
          {esAdmin && (
            <button onClick={abrirNuevo}
              style={{ padding: '10px 20px', backgroundColor: '#087e0b', color: 'white', border: 'none', borderRadius: '20px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
              + Nuevo cliente
            </button>
          )}
        </div>

        {/* BUSCADOR */}
        <input
          type="text"
          placeholder="Buscar por nombre, codigo, celular o direccion..."
          value={busqueda}
          onChange={(e) => {
            const v = e.target.value
            setBusqueda(v)
            setPagina(1)
            cargarClientes(1, v)
          }}
          style={{ padding: '12px 16px', borderRadius: '10px', border: '1px solid #ddd', fontSize: '14px', width: '100%', boxSizing: 'border-box', marginBottom: '16px', backgroundColor: 'white' }}
        />

        {/* BANNER solo lectura para no admin */}
        {!esAdmin && (
          <div style={{ backgroundColor: '#e3f2fd', border: '1px solid #90caf9', borderRadius: '10px', padding: '10px 16px', marginBottom: '16px', fontSize: '13px', color: '#1565c0' }}>
            Solo tienes acceso de consulta. Contacta a un administrador para hacer cambios.
          </div>
        )}

        {/* TABLA */}
        <div style={{ backgroundColor: 'white', borderRadius: '16px', boxShadow: '0 2px 12px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
          <div className="cli-tabla-wrap" style={{ overflowX: 'auto' }}>
            <table className="cli-tabla" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f9f9f9' }}>
                  <th style={{ padding: '14px 16px', textAlign: 'left', borderBottom: '2px solid #eee', color: '#555', whiteSpace: 'nowrap' }}>Codigo</th>
                  <th style={{ padding: '14px 16px', textAlign: 'left', borderBottom: '2px solid #eee', color: '#555' }}>Nombre</th>
                  <th className="cli-col-dir" style={{ padding: '14px 16px', textAlign: 'left', borderBottom: '2px solid #eee', color: '#555' }}>Direccion</th>
                  <th style={{ padding: '14px 16px', textAlign: 'left', borderBottom: '2px solid #eee', color: '#555', whiteSpace: 'nowrap' }}>Celular</th>
                  <th style={{ padding: '14px 16px', textAlign: 'center', borderBottom: '2px solid #eee', color: '#555' }}>Estado</th>
                  {/* Columna acciones solo si es admin */}
                  {esAdmin && (
                    <th style={{ padding: '14px 16px', textAlign: 'center', borderBottom: '2px solid #eee', color: '#555' }}>Acciones</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {loadingTabla ? (
                  <tr>
                    <td colSpan={esAdmin ? 6 : 5} style={{ padding: '40px', textAlign: 'center', color: '#aaa', fontSize: '14px' }}>
                      Buscando...
                    </td>
                  </tr>
                ) : clientesPagina.length === 0 ? (
                  <tr>
                    <td colSpan={esAdmin ? 6 : 5} style={{ padding: '40px', textAlign: 'center', color: '#bbb' }}>
                      {busqueda ? 'No se encontraron clientes con esa busqueda' : 'No hay clientes registrados'}
                    </td>
                  </tr>
                ) : (
                  clientesPagina.map((c, i) => (
                    <tr key={c.id} style={{ backgroundColor: i % 2 === 0 ? 'white' : '#fafafa' }}>
                      <td style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0', fontWeight: 'bold', color: '#444' }}>{c.codigo}</td>
                      <td style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0' }}>{c.nombre}</td>
                      <td className="cli-col-dir" style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0', color: '#666' }}>{c.direccion || '—'}</td>
                      <td style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0', color: '#666' }}>{c.celular || '—'}</td>
                      <td style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0', textAlign: 'center' }}>
                        <span style={{ backgroundColor: c.activo ? '#e8f5e9' : '#ffebee', color: c.activo ? '#2e7d32' : '#c62828', padding: '3px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 'bold' }}>
                          {c.activo ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      {/* Boton editar solo para admin */}
                      {esAdmin && (
                        <td style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0', textAlign: 'center' }}>
                          <button onClick={() => abrirEditar(c)}
                            style={{ backgroundColor: '#087e0b', color: 'white', border: 'none', padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>
                            Editar
                          </button>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* PAGINACION */}
          {totalPaginas > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', padding: '16px', borderTop: '1px solid #f0f0f0' }}>
              <button onClick={() => { const p = Math.max(1, pagina - 1); setPagina(p); cargarClientes(p, busqueda) }} disabled={pagina === 1}
                style={{ padding: '6px 14px', borderRadius: '8px', border: '1px solid #ddd', backgroundColor: pagina === 1 ? '#f5f5f5' : 'white', cursor: pagina === 1 ? 'not-allowed' : 'pointer', fontSize: '13px' }}>
                Anterior
              </button>
              <span style={{ fontSize: '13px', color: '#666' }}>Pagina {pagina} de {totalPaginas} · {totalClientes.toLocaleString()} clientes</span>
              <button onClick={() => { const p = Math.min(totalPaginas, pagina + 1); setPagina(p); cargarClientes(p, busqueda) }} disabled={pagina === totalPaginas}
                style={{ padding: '6px 14px', borderRadius: '8px', border: '1px solid #ddd', backgroundColor: pagina === totalPaginas ? '#f5f5f5' : 'white', cursor: pagina === totalPaginas ? 'not-allowed' : 'pointer', fontSize: '13px' }}>
                Siguiente
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
