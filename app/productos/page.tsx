'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'

type Producto = {
  codigo: string
  categoria: string | null
  nombre: string | null
  medidas: string | null
  precio_minimo: number | null
  precio_tienda: number | null
  foto_url: string | null
}

type Usuario = {
  carnet: string
  nombre: string
  rol: string
  estado: boolean
}

export default function Productos() {
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [productos, setProductos] = useState<Producto[]>([])
  const [filtro, setFiltro] = useState('')
  const [loading, setLoading] = useState(true)
  const [esAdmin, setEsAdmin] = useState(false)

  // Modal admin unlock
  const [showAdminModal, setShowAdminModal] = useState(false)
  const [adminPass, setAdminPass] = useState('')
  const [adminError, setAdminError] = useState('')
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null)

  // Modal editar
  const [showEditModal, setShowEditModal] = useState(false)
  const [editando, setEditando] = useState<Producto | null>(null)
  const [editForm, setEditForm] = useState<Partial<Producto>>({})
  const [uploadingFoto, setUploadingFoto] = useState(false)
  const [saveLoading, setSaveLoading] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Modal eliminar
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deletingCodigo, setDeletingCodigo] = useState<string | null>(null)

  // Modal nuevo producto
  const [showNuevoModal, setShowNuevoModal] = useState(false)
  const [nuevoForm, setNuevoForm] = useState<Partial<Producto>>({})
  const [nuevoLoading, setNuevoLoading] = useState(false)
  const [nuevoMsg, setNuevoMsg] = useState('')
  const [uploadingFotoNuevo, setUploadingFotoNuevo] = useState(false)
  const fileInputNuevoRef = useRef<HTMLInputElement>(null)

  // Verificar sesión
  useEffect(() => {
    const carnetGuardado = localStorage.getItem('carnet')
    if (!carnetGuardado) {
      window.location.href = '/'
      return
    }
    supabase
      .from('personal')
      .select('*')
      .eq('carnet', carnetGuardado)
      .eq('estado', true)
      .single()
      .then(({ data }) => {
        if (!data) { window.location.href = '/'; return }
        setUsuario(data)
      })
  }, [])

  // Cargar productos
  useEffect(() => {
    if (!usuario) return
    cargarProductos()
  }, [usuario])

  const cargarProductos = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('productos')
      .select('*')
      .order('categoria', { ascending: true })
    setProductos(data || [])
    setLoading(false)
  }

  // Verificar admin en Supabase
  const verificarAdmin = async () => {
    if (!usuario) return
    const { data } = await supabase
      .from('personal')
      .select('rol')
      .eq('carnet', usuario.carnet)
      .eq('estado', true)
      .single()
    if (data?.rol === 'admin') {
      setEsAdmin(true)
      setShowAdminModal(false)
      setAdminError('')
      setAdminPass('')
      if (pendingAction) { pendingAction(); setPendingAction(null) }
    } else {
      setAdminError('No tienes permisos de administrador')
    }
  }

  const requerirAdmin = (accion: () => void) => {
    if (esAdmin) { accion(); return }
    setPendingAction(() => accion)
    setShowAdminModal(true)
  }

  // EDITAR
  const abrirEditar = (p: Producto) => {
    requerirAdmin(() => {
      setEditando(p)
      setEditForm({ ...p })
      setSaveMsg('')
      setShowEditModal(true)
    })
  }

  const handleFotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !editando) return
    setUploadingFoto(true)
    const ext = file.name.split('.').pop()
    const path = `${editando.codigo}.${ext}`
    const { error } = await supabase.storage
      .from('producto-fotos')
      .upload(path, file, { upsert: true })
    if (!error) {
      const { data: urlData } = supabase.storage
        .from('producto-fotos')
        .getPublicUrl(path)
      setEditForm(prev => ({ ...prev, foto_url: urlData.publicUrl }))
    }
    setUploadingFoto(false)
  }

  const guardarEdicion = async () => {
    if (!editando) return
    setSaveLoading(true)
    const { error } = await supabase
      .from('productos')
      .update({
        categoria: editForm.categoria,
        nombre: editForm.nombre,
        medidas: editForm.medidas,
        precio_minimo: editForm.precio_minimo,
        precio_tienda: editForm.precio_tienda,
        foto_url: editForm.foto_url,
      })
      .eq('codigo', editando.codigo)
    setSaveLoading(false)
    if (!error) {
      setSaveMsg('✓ Guardado correctamente')
      cargarProductos()
      setTimeout(() => { setShowEditModal(false); setSaveMsg('') }, 1200)
    } else {
      setSaveMsg('Error al guardar')
    }
  }

  // ELIMINAR
  const abrirEliminar = (codigo: string) => {
    requerirAdmin(() => {
      setDeletingCodigo(codigo)
      setShowDeleteModal(true)
    })
  }

  const confirmarEliminar = async () => {
    if (!deletingCodigo) return
    await supabase.from('productos').delete().eq('codigo', deletingCodigo)
    setShowDeleteModal(false)
    setDeletingCodigo(null)
    cargarProductos()
  }

  // NUEVO PRODUCTO
  const abrirNuevo = () => {
    requerirAdmin(() => {
      setNuevoForm({})
      setNuevoMsg('')
      setShowNuevoModal(true)
    })
  }

  const handleFotoNuevoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const codigo = nuevoForm.codigo?.trim()
    if (!codigo) { setNuevoMsg('Ingresa el código primero para subir la foto'); return }
    setUploadingFotoNuevo(true)
    const ext = file.name.split('.').pop()
    const path = `${codigo}.${ext}`
    const { error } = await supabase.storage
      .from('producto-fotos')
      .upload(path, file, { upsert: true })
    if (!error) {
      const { data: urlData } = supabase.storage
        .from('producto-fotos')
        .getPublicUrl(path)
      setNuevoForm(prev => ({ ...prev, foto_url: urlData.publicUrl }))
    }
    setUploadingFotoNuevo(false)
  }

  const guardarNuevo = async () => {
    if (!nuevoForm.codigo?.trim()) { setNuevoMsg('El código es obligatorio'); return }
    if (!nuevoForm.nombre?.trim()) { setNuevoMsg('El nombre es obligatorio'); return }
    setNuevoLoading(true)
    const { error } = await supabase.from('productos').insert({
      codigo: nuevoForm.codigo.trim(),
      categoria: nuevoForm.categoria || null,
      nombre: nuevoForm.nombre.trim(),
      medidas: nuevoForm.medidas || null,
      precio_minimo: nuevoForm.precio_minimo ?? null,
      precio_tienda: nuevoForm.precio_tienda ?? null,
      foto_url: nuevoForm.foto_url || null,
    })
    setNuevoLoading(false)
    if (!error) {
      setNuevoMsg('✓ Producto agregado correctamente')
      cargarProductos()
      setTimeout(() => { setShowNuevoModal(false); setNuevoMsg('') }, 1200)
    } else {
      setNuevoMsg(error.message.includes('duplicate') ? 'Ya existe un producto con ese código' : 'Error al guardar')
    }
  }

  const productosFiltrados = productos.filter(p =>
    [p.codigo, p.nombre, p.categoria, p.medidas]
      .join(' ').toLowerCase().includes(filtro.toLowerCase())
  )

  const fmt = (n: number | null) => n != null ? `Bs. ${n.toLocaleString()}` : '—'

  if (!usuario) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'system-ui' }}>
      <p style={{ color: '#666' }}>Verificando sesión...</p>
    </div>
  )

  return (
    <div style={{ fontFamily: "'Segoe UI', system-ui, sans-serif", backgroundColor: '#f4f6f8', minHeight: '100vh' }}>

      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .tabla-wrap { overflow-x: auto; }
        table { width: 100%; border-collapse: collapse; min-width: 780px; }
        th { background: #1a1a2e; color: white; padding: 12px 14px; text-align: left; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; white-space: nowrap; }
        td { padding: 11px 14px; border-bottom: 1px solid #eee; font-size: 13px; color: #333; vertical-align: middle; }
        tr:hover td { background: #f0f7ff; }
        .badge { display: inline-block; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; }
        .btn { border: none; border-radius: 8px; padding: 7px 14px; font-size: 12px; cursor: pointer; font-weight: 500; transition: opacity .15s; }
        .btn:hover { opacity: .85; }
        .btn-edit { background: #1a1a2e; color: white; }
        .btn-del { background: #fff0f0; color: #d63031; border: 1px solid #ffcdd2; }
        .modal-bg { position: fixed; inset: 0; background: rgba(0,0,0,.5); display: flex; align-items: center; justify-content: center; z-index: 2000; padding: 20px; }
        .modal { background: white; border-radius: 16px; padding: 32px; width: 100%; max-width: 520px; max-height: 90vh; overflow-y: auto; }
        .form-label { font-size: 12px; font-weight: 600; color: #555; margin-bottom: 5px; display: block; text-transform: uppercase; letter-spacing: .4px; }
        .form-input { width: 100%; padding: 10px 12px; border: 1.5px solid #e0e0e0; border-radius: 8px; font-size: 14px; outline: none; transition: border-color .2s; }
        .form-input:focus { border-color: #1a1a2e; }
        .form-row { margin-bottom: 16px; }
        .foto-thumb { width: 64px; height: 64px; object-fit: cover; border-radius: 8px; border: 1px solid #eee; }
        .foto-placeholder { width: 64px; height: 64px; background: #f0f0f0; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #bbb; font-size: 22px; }
        @media (max-width: 600px) {
          .top-bar { flex-direction: column; gap: 12px; align-items: flex-start !important; }
          .modal { padding: 20px; }
        }
      `}</style>

      {/* NAVBAR */}
      <nav style={{ backgroundColor: '#1a1a2e', padding: '14px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <a href="/" style={{ color: '#aaa', fontSize: '13px', textDecoration: 'none' }}>← Inicio</a>
          <span style={{ color: 'white', fontWeight: '700', fontSize: '16px' }}>Gestión de Productos</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {esAdmin && (
            <span style={{ background: '#087e0b', color: 'white', padding: '4px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: '700' }}>
              ADMIN ACTIVO
            </span>
          )}
          <span style={{ color: '#aaa', fontSize: '13px' }}>{usuario.nombre}</span>
        </div>
      </nav>

      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '28px 20px' }}>

        {/* BARRA TOP */}
        <div className="top-bar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', gap: '12px' }}>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: '700', color: '#1a1a2e' }}>Catálogo de Productos</h1>
            <p style={{ fontSize: '13px', color: '#888', marginTop: '2px' }}>{productosFiltrados.length} productos encontrados</p>
          </div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {!esAdmin && (
              <button className="btn" style={{ background: '#fff3cd', color: '#856404', border: '1px solid #ffc107' }}
                onClick={() => setShowAdminModal(true)}>
                🔑 Modo Admin
              </button>
            )}
            {esAdmin && (
              <button className="btn" style={{ background: '#087e0b', color: 'white', padding: '8px 18px', fontSize: '13px' }}
                onClick={abrirNuevo}>
                + Agregar Producto
              </button>
            )}
          </div>
        </div>

        {/* BUSCADOR */}
        <div style={{ marginBottom: '20px' }}>
          <input
            className="form-input"
            placeholder="🔍 Buscar por nombre, código, categoría..."
            value={filtro}
            onChange={e => setFiltro(e.target.value)}
            style={{ maxWidth: '420px', background: 'white' }}
          />
        </div>

        {/* TABLA */}
        <div style={{ background: 'white', borderRadius: '14px', boxShadow: '0 2px 12px rgba(0,0,0,.07)', overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: '60px', textAlign: 'center', color: '#999' }}>Cargando productos...</div>
          ) : (
            <div className="tabla-wrap">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: '70px' }}>Foto</th>
                    <th>Código</th>
                    <th>Categoría</th>
                    <th>Nombre</th>
                    <th>Medidas</th>
                    <th>Precio mín.</th>
                    <th>Precio tienda</th>
                    {esAdmin && <th style={{ width: '120px' }}>Acciones</th>}
                  </tr>
                </thead>
                <tbody>
                  {productosFiltrados.length === 0 ? (
                    <tr><td colSpan={8} style={{ textAlign: 'center', padding: '40px', color: '#bbb' }}>Sin resultados</td></tr>
                  ) : productosFiltrados.map(p => (
                    <tr key={p.codigo}>
                      <td>
                        {p.foto_url
                          ? <img src={p.foto_url} alt={p.nombre || ''} className="foto-thumb" />
                          : <div className="foto-placeholder">📦</div>
                        }
                      </td>
                      <td><span style={{ fontFamily: 'monospace', fontWeight: '600', color: '#1a1a2e', fontSize: '12px' }}>{p.codigo}</span></td>
                      <td>
                        {p.categoria
                          ? <span className="badge" style={{ background: '#e8f0fe', color: '#1a1a2e' }}>{p.categoria}</span>
                          : <span style={{ color: '#ccc' }}>—</span>}
                      </td>
                      <td style={{ fontWeight: '500' }}>{p.nombre || '—'}</td>
                      <td style={{ color: '#666', fontSize: '12px' }}>{p.medidas || '—'}</td>
                      <td>
                        {p.precio_minimo != null
                          ? <span style={{ color: '#087e0b', fontWeight: '600' }}>{fmt(p.precio_minimo)}</span>
                          : <span style={{ color: '#ccc' }}>—</span>}
                      </td>
                      <td>
                        {p.precio_tienda != null
                          ? <span style={{ fontWeight: '600' }}>{fmt(p.precio_tienda)}</span>
                          : <span style={{ color: '#ccc' }}>—</span>}
                      </td>
                      {esAdmin && (
                        <td>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button className="btn btn-edit" onClick={() => abrirEditar(p)}>Editar</button>
                            <button className="btn btn-del" onClick={() => abrirEliminar(p.codigo)}>Eliminar</button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {!esAdmin && (
          <p style={{ textAlign: 'center', color: '#bbb', fontSize: '12px', marginTop: '16px' }}>
            Activa el modo admin para editar o eliminar productos
          </p>
        )}
      </div>

      {/* ── MODAL: VERIFICAR ADMIN ── */}
      {showAdminModal && (
        <div className="modal-bg" onClick={() => { setShowAdminModal(false); setAdminError(''); setAdminPass('') }}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
              <div style={{ fontSize: '40px', marginBottom: '8px' }}>🔑</div>
              <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#1a1a2e' }}>Acceso Administrador</h2>
              <p style={{ fontSize: '13px', color: '#888', marginTop: '6px' }}>
                Tu cuenta necesita el rol de <strong>admin</strong> en Supabase para continuar
              </p>
            </div>
            <div className="form-row">
              <label className="form-label">Confirma tu código de acceso</label>
              <input
                className="form-input"
                type="password"
                placeholder="Código de acceso"
                value={adminPass}
                onChange={e => setAdminPass(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && verificarAdmin()}
                autoFocus
              />
              {adminError && <p style={{ color: '#d63031', fontSize: '13px', marginTop: '8px' }}>{adminError}</p>}
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button className="btn" style={{ flex: 1, background: '#f0f0f0', color: '#333', padding: '12px' }}
                onClick={() => { setShowAdminModal(false); setAdminError(''); setAdminPass('') }}>
                Cancelar
              </button>
              <button className="btn btn-edit" style={{ flex: 1, padding: '12px', fontSize: '14px' }}
                onClick={verificarAdmin}>
                Verificar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: EDITAR PRODUCTO ── */}
      {showEditModal && editando && (
        <div className="modal-bg" onClick={() => setShowEditModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#1a1a2e' }}>Editar Producto</h2>
                <p style={{ fontSize: '12px', color: '#888', marginTop: '2px', fontFamily: 'monospace' }}>{editando.codigo}</p>
              </div>
              <button onClick={() => setShowEditModal(false)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#999' }}>✕</button>
            </div>

            {/* FOTO */}
            <div className="form-row">
              <label className="form-label">Foto del producto</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                {editForm.foto_url
                  ? <img src={editForm.foto_url} alt="" className="foto-thumb" style={{ width: '80px', height: '80px' }} />
                  : <div className="foto-placeholder" style={{ width: '80px', height: '80px', fontSize: '28px' }}>📦</div>
                }
                <div>
                  <button className="btn" style={{ background: '#f0f4ff', color: '#1a1a2e', border: '1.5px solid #c7d2fe', marginBottom: '6px', display: 'block' }}
                    onClick={() => fileInputRef.current?.click()}>
                    {uploadingFoto ? 'Subiendo...' : editForm.foto_url ? 'Cambiar foto' : 'Subir foto'}
                  </button>
                  {editForm.foto_url && (
                    <button className="btn" style={{ background: '#fff0f0', color: '#d63031', border: '1px solid #ffcdd2', fontSize: '11px' }}
                      onClick={() => setEditForm(prev => ({ ...prev, foto_url: null }))}>
                      Quitar foto
                    </button>
                  )}
                  <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFotoUpload} />
                </div>
              </div>
            </div>

            {/* CAMPOS */}
            {[
              { key: 'categoria', label: 'Categoría' },
              { key: 'nombre', label: 'Nombre' },
              { key: 'medidas', label: 'Medidas' },
            ].map(({ key, label }) => (
              <div className="form-row" key={key}>
                <label className="form-label">{label}</label>
                <input className="form-input" value={(editForm as any)[key] || ''} onChange={e => setEditForm(prev => ({ ...prev, [key]: e.target.value }))} />
              </div>
            ))}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="form-row">
                <label className="form-label">Precio mínimo (Bs.)</label>
                <input className="form-input" type="number" value={editForm.precio_minimo ?? ''} onChange={e => setEditForm(prev => ({ ...prev, precio_minimo: e.target.value ? Number(e.target.value) : null }))} />
              </div>
              <div className="form-row">
                <label className="form-label">Precio tienda (Bs.)</label>
                <input className="form-input" type="number" value={editForm.precio_tienda ?? ''} onChange={e => setEditForm(prev => ({ ...prev, precio_tienda: e.target.value ? Number(e.target.value) : null }))} />
              </div>
            </div>

            {saveMsg && (
              <p style={{ color: saveMsg.startsWith('✓') ? '#087e0b' : '#d63031', fontSize: '13px', marginBottom: '12px', textAlign: 'center', fontWeight: '600' }}>{saveMsg}</p>
            )}

            <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
              <button className="btn" style={{ flex: 1, background: '#f0f0f0', color: '#333', padding: '12px' }}
                onClick={() => setShowEditModal(false)}>Cancelar</button>
              <button className="btn btn-edit" style={{ flex: 1, padding: '12px', fontSize: '14px', opacity: saveLoading || uploadingFoto ? .6 : 1 }}
                onClick={guardarEdicion} disabled={saveLoading || uploadingFoto}>
                {saveLoading ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: CONFIRMAR ELIMINAR ── */}
      {showDeleteModal && (
        <div className="modal-bg" onClick={() => setShowDeleteModal(false)}>
          <div className="modal" style={{ maxWidth: '380px' }} onClick={e => e.stopPropagation()}>
            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              <div style={{ fontSize: '44px', marginBottom: '12px' }}>⚠️</div>
              <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#1a1a2e' }}>¿Eliminar producto?</h2>
              <p style={{ fontSize: '13px', color: '#888', marginTop: '8px' }}>
                Esta acción no se puede deshacer. El producto <strong style={{ fontFamily: 'monospace' }}>{deletingCodigo}</strong> será eliminado permanentemente.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button className="btn" style={{ flex: 1, background: '#f0f0f0', color: '#333', padding: '12px' }}
                onClick={() => setShowDeleteModal(false)}>Cancelar</button>
              <button className="btn" style={{ flex: 1, background: '#d63031', color: 'white', padding: '12px', fontSize: '14px' }}
                onClick={confirmarEliminar}>Eliminar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: NUEVO PRODUCTO ── */}
      {showNuevoModal && (
        <div className="modal-bg" onClick={() => setShowNuevoModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#1a1a2e' }}>Nuevo Producto</h2>
                <p style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>Completa los campos y guarda</p>
              </div>
              <button onClick={() => setShowNuevoModal(false)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#999' }}>✕</button>
            </div>

            {/* CÓDIGO — obligatorio */}
            <div className="form-row">
              <label className="form-label">Código <span style={{ color: '#d63031' }}>*</span></label>
              <input className="form-input" placeholder="Ej: MLB-M99" value={nuevoForm.codigo || ''}
                onChange={e => setNuevoForm(prev => ({ ...prev, codigo: e.target.value }))} />
            </div>

            {/* FOTO */}
            <div className="form-row">
              <label className="form-label">Foto del producto</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                {nuevoForm.foto_url
                  ? <img src={nuevoForm.foto_url} alt="" className="foto-thumb" style={{ width: '80px', height: '80px' }} />
                  : <div className="foto-placeholder" style={{ width: '80px', height: '80px', fontSize: '28px' }}>📦</div>
                }
                <div>
                  <button className="btn" style={{ background: '#f0f4ff', color: '#1a1a2e', border: '1.5px solid #c7d2fe', marginBottom: '6px', display: 'block' }}
                    onClick={() => fileInputNuevoRef.current?.click()}>
                    {uploadingFotoNuevo ? 'Subiendo...' : nuevoForm.foto_url ? 'Cambiar foto' : 'Subir foto'}
                  </button>
                  {nuevoForm.foto_url && (
                    <button className="btn" style={{ background: '#fff0f0', color: '#d63031', border: '1px solid #ffcdd2', fontSize: '11px' }}
                      onClick={() => setNuevoForm(prev => ({ ...prev, foto_url: undefined }))}>
                      Quitar foto
                    </button>
                  )}
                  <input ref={fileInputNuevoRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFotoNuevoUpload} />
                </div>
              </div>
              <p style={{ fontSize: '11px', color: '#aaa', marginTop: '6px' }}>Ingresa el código antes de subir la foto</p>
            </div>

            {/* CAMPOS TEXTO */}
            {[
              { key: 'categoria', label: 'Categoría', req: false },
              { key: 'nombre', label: 'Nombre', req: true },
              { key: 'medidas', label: 'Medidas', req: false },
            ].map(({ key, label, req }) => (
              <div className="form-row" key={key}>
                <label className="form-label">{label} {req && <span style={{ color: '#d63031' }}>*</span>}</label>
                <input className="form-input" value={(nuevoForm as any)[key] || ''}
                  onChange={e => setNuevoForm(prev => ({ ...prev, [key]: e.target.value }))} />
              </div>
            ))}

            {/* PRECIOS */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="form-row">
                <label className="form-label">Precio mínimo (Bs.)</label>
                <input className="form-input" type="number" value={nuevoForm.precio_minimo ?? ''}
                  onChange={e => setNuevoForm(prev => ({ ...prev, precio_minimo: e.target.value ? Number(e.target.value) : null }))} />
              </div>
              <div className="form-row">
                <label className="form-label">Precio tienda (Bs.)</label>
                <input className="form-input" type="number" value={nuevoForm.precio_tienda ?? ''}
                  onChange={e => setNuevoForm(prev => ({ ...prev, precio_tienda: e.target.value ? Number(e.target.value) : null }))} />
              </div>
            </div>

            {nuevoMsg && (
              <p style={{ color: nuevoMsg.startsWith('✓') ? '#087e0b' : '#d63031', fontSize: '13px', marginBottom: '12px', textAlign: 'center', fontWeight: '600' }}>{nuevoMsg}</p>
            )}

            <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
              <button className="btn" style={{ flex: 1, background: '#f0f0f0', color: '#333', padding: '12px' }}
                onClick={() => setShowNuevoModal(false)}>Cancelar</button>
              <button className="btn" style={{ flex: 1, padding: '12px', fontSize: '14px', background: '#087e0b', color: 'white', opacity: nuevoLoading || uploadingFotoNuevo ? .6 : 1 }}
                onClick={guardarNuevo} disabled={nuevoLoading || uploadingFotoNuevo}>
                {nuevoLoading ? 'Guardando...' : 'Agregar producto'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
