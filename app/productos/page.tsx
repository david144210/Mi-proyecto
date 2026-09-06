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
  cargos?: {
    puede_editar_productos?: boolean
  }
}

export default function Productos() {
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [productos, setProductos] = useState<Producto[]>([])
  const [filtro, setFiltro] = useState('')
  const [loading, setLoading] = useState(true)
  const [esAdmin, setEsAdmin] = useState(false)

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

  // Sugerencia de código (MLB-<LETRA><NNN>, ver siguiente_codigo_producto en Supabase)
  const [letraCodigo, setLetraCodigo] = useState('')
  const [sugiriendoCodigo, setSugiriendoCodigo] = useState(false)

  // Verificar sesión
  useEffect(() => {
    const carnetGuardado = localStorage.getItem('carnet')
    if (!carnetGuardado) {
      window.location.href = '/'
      return
    }
    supabase
      .from('personal')
      .select('*, cargos(*)')
      .eq('carnet', carnetGuardado)
      .eq('estado', true)
      .single()
      .then(({ data }) => {
        if (!data) { window.location.href = '/'; return }
        setUsuario(data)
        // Si es admin por rol o tiene permiso en cargo, activar esAdmin
        if (data.cargos?.puede_editar_productos === true) {
          setEsAdmin(true)
        }
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

  // Acceso controlado por cargos.puede_editar_productos (se evalúa al cargar sesión)

  // EDITAR
  const abrirEditar = (p: Producto) => {
    if (!esAdmin) return
    setEditando(p)
    setEditForm({ ...p })
    setSaveMsg('')
    setShowEditModal(true)
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
    if (!esAdmin) return
    setDeletingCodigo(codigo)
    setShowDeleteModal(true)
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
    if (!esAdmin) return
    setNuevoForm({})
    setNuevoMsg('')
    setLetraCodigo('')
    setShowNuevoModal(true)
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

  // Deriva una letra sugerida a partir de la categoría escrita, mientras el
  // admin no haya tocado el campo de letra a mano.
  useEffect(() => {
    if (!letraCodigo && nuevoForm.categoria?.trim()) {
      setLetraCodigo(nuevoForm.categoria.trim().charAt(0).toUpperCase())
    }
  }, [nuevoForm.categoria]) // eslint-disable-line react-hooks/exhaustive-deps

  const sugerirCodigo = async () => {
    const letra = (letraCodigo || nuevoForm.categoria?.charAt(0) || '').toUpperCase().slice(0, 1)
    if (!letra) { setNuevoMsg('Escribe una categoría o una letra de prefijo primero'); return }
    setSugiriendoCodigo(true)
    setNuevoMsg('')
    const { data, error } = await supabase.rpc('siguiente_codigo_producto', { p_letra: letra })
    setSugiriendoCodigo(false)
    if (error || !data) {
      setNuevoMsg('No se pudo generar el código: ' + (error?.message || 'error desconocido'))
      return
    }
    setNuevoForm(prev => ({ ...prev, codigo: data }))
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
    <div style={{ minHeight: '100vh', background: '#0f1117', color: '#FFD700', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter, sans-serif' }}>
      Verificando sesión...
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#0f1117', color: 'white', fontFamily: 'Inter, sans-serif', paddingBottom: '60px' }}>

      <style>{`
        * { box-sizing: border-box; }
        .prod-card { background: #161726; border: 1px solid rgba(255,215,0,0.15); border-radius: 16px; overflow: hidden; display: flex; flex-direction: column; transition: border-color .15s, transform .15s; }
        .prod-card:hover { border-color: rgba(255,215,0,0.45); }
        .prod-foto { width: 100%; aspect-ratio: 1 / 1; object-fit: cover; background: #0d0d1f; display: block; }
        .prod-foto-placeholder { width: 100%; aspect-ratio: 1 / 1; background: #0d0d1f; display: flex; align-items: center; justify-content: center; font-size: 30px; color: #333; }
        .badge-cat { display: inline-block; padding: 3px 10px; border-radius: 20px; font-size: 10.5px; font-weight: 700; background: rgba(255,215,0,0.1); color: #FFD700; border: 1px solid rgba(255,215,0,0.25); }
        .btn { border: none; border-radius: 8px; padding: 8px 14px; font-size: 12px; cursor: pointer; font-weight: 600; transition: opacity .15s; }
        .btn:hover { opacity: .85; }
        .btn-gold { background: linear-gradient(135deg, #FFD700, #FFA500); color: #0a0a1a; }
        .btn-edit { background: rgba(255,255,255,0.08); color: white; border: 1px solid rgba(255,255,255,0.15); }
        .btn-del { background: rgba(255,107,107,0.1); color: #ff6b6b; border: 1px solid rgba(255,107,107,0.3); }
        .form-label { font-size: 12px; color: #ccc; margin-bottom: 5px; display: block; }
        .form-input { width: 100%; padding: 12px 16px; border-radius: 10px; border: 1px solid rgba(255,215,0,0.3); font-size: 14px; outline: none; background: #0d0d1f; color: white; box-sizing: border-box; }
        .form-input:focus { border-color: #FFD700; }
        .form-row { margin-bottom: 16px; }
        .modal-bg { position: fixed; inset: 0; background: rgba(0,0,0,.65); display: flex; align-items: center; justify-content: center; z-index: 2000; padding: 20px; }
        .modal { background: #161726; border: 1px solid rgba(255,215,0,0.2); border-radius: 16px; padding: 32px; width: 100%; max-width: 520px; max-height: 90vh; overflow-y: auto; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
        .prod-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 18px; }
        @media (max-width: 600px) {
          .top-bar { flex-direction: column; gap: 12px; align-items: flex-start !important; }
          .modal { padding: 20px; }
        }
      `}</style>

      {/* NAVBAR — mismo lenguaje visual que /registro y /comprar */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 40px', background: '#161726', borderBottom: '1px solid rgba(255,215,0,0.2)', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <img src="/logo.jpg" alt="Logo" style={{ width: '35px', height: '35px', borderRadius: '8px' }} />
          <span style={{ fontWeight: '800', color: '#FFD700', fontSize: '16px' }}>Muebles is Better</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          {esAdmin && (
            <span style={{ background: 'rgba(8,126,11,0.15)', color: '#4caf50', border: '1px solid rgba(76,175,80,0.4)', padding: '4px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: '700' }}>
              EDICIÓN ACTIVA
            </span>
          )}
          <span style={{ color: '#aaa', fontSize: '13px' }}>{usuario.nombre}</span>
          <a href="/sistema" style={{ color: '#ccc', textDecoration: 'none', fontSize: '14px' }}>← Sistema</a>
        </div>
      </header>

      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '28px 20px' }}>

        {/* BARRA TOP */}
        <div className="top-bar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', gap: '12px' }}>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: '700', color: '#FFD700', margin: 0 }}>Catálogo de Productos</h1>
            <p style={{ fontSize: '13px', color: '#888', marginTop: '4px' }}>{productosFiltrados.length} productos encontrados</p>
          </div>
          {esAdmin && (
            <button className="btn btn-gold" style={{ padding: '10px 20px', fontSize: '13px' }} onClick={abrirNuevo}>
              + Agregar Producto
            </button>
          )}
        </div>

        {/* BUSCADOR */}
        <div style={{ marginBottom: '24px' }}>
          <input
            className="form-input"
            placeholder="🔍 Buscar por nombre, código, categoría..."
            value={filtro}
            onChange={e => setFiltro(e.target.value)}
            style={{ maxWidth: '420px' }}
          />
        </div>

        {/* GRILLA DE PRODUCTOS */}
        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center', color: '#888' }}>Cargando productos...</div>
        ) : productosFiltrados.length === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center', color: '#555', background: '#161726', borderRadius: '16px', border: '1px solid rgba(255,215,0,0.1)' }}>
            Sin resultados
          </div>
        ) : (
          <div className="prod-grid">
            {productosFiltrados.map(p => (
              <div className="prod-card" key={p.codigo}>
                {p.foto_url
                  ? <img src={p.foto_url} alt={p.nombre || ''} className="prod-foto" />
                  : <div className="prod-foto-placeholder">📦</div>
                }
                <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
                  <span style={{ fontFamily: 'monospace', fontWeight: '700', color: '#FFD700', fontSize: '11px' }}>{p.codigo}</span>
                  <span style={{ fontWeight: '600', fontSize: '14px', lineHeight: '1.3' }}>{p.nombre || '—'}</span>
                  {p.categoria && <span className="badge-cat" style={{ width: 'fit-content' }}>{p.categoria}</span>}
                  {p.medidas && <span style={{ fontSize: '12px', color: '#888' }}>📐 {p.medidas}</span>}

                  <div style={{ marginTop: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ fontSize: '11px', color: '#888' }}>
                      {p.precio_minimo != null ? `mín. ${fmt(p.precio_minimo)}` : ''}
                    </span>
                    <span style={{ fontWeight: '700', color: '#FFD700', fontSize: '15px' }}>{fmt(p.precio_tienda)}</span>
                  </div>

                  {esAdmin && (
                    <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
                      <button className="btn btn-edit" style={{ flex: 1 }} onClick={() => abrirEditar(p)}>Editar</button>
                      <button className="btn btn-del" style={{ flex: 1 }} onClick={() => abrirEliminar(p.codigo)}>Eliminar</button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {!esAdmin && (
          <p style={{ textAlign: 'center', color: '#555', fontSize: '12px', marginTop: '20px' }}>
            Solo administradores o usuarios con permiso pueden editar productos
          </p>
        )}
      </div>

      {/* ── MODAL: EDITAR PRODUCTO ── */}
      {showEditModal && editando && (
        <div className="modal-bg" onClick={() => setShowEditModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#FFD700', margin: 0 }}>Editar Producto</h2>
                <p style={{ fontSize: '12px', color: '#888', marginTop: '4px', fontFamily: 'monospace' }}>{editando.codigo}</p>
              </div>
              <button onClick={() => setShowEditModal(false)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#888' }}>✕</button>
            </div>

            {/* FOTO */}
            <div className="form-row">
              <label className="form-label">Foto del producto</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                {editForm.foto_url
                  ? <img src={editForm.foto_url} alt="" style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '10px', border: '1px solid rgba(255,215,0,0.3)' }} />
                  : <div style={{ width: '80px', height: '80px', background: '#0d0d1f', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', color: '#333' }}>📦</div>
                }
                <div>
                  <button className="btn btn-edit" style={{ marginBottom: '6px', display: 'block' }}
                    onClick={() => fileInputRef.current?.click()}>
                    {uploadingFoto ? 'Subiendo...' : editForm.foto_url ? 'Cambiar foto' : 'Subir foto'}
                  </button>
                  {editForm.foto_url && (
                    <button className="btn btn-del" style={{ fontSize: '11px' }}
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
              <p style={{ color: saveMsg.startsWith('✓') ? '#4caf50' : '#ff6b6b', fontSize: '13px', marginBottom: '12px', textAlign: 'center', fontWeight: '600' }}>{saveMsg}</p>
            )}

            <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
              <button className="btn" style={{ flex: 1, background: 'rgba(255,255,255,0.06)', color: '#ccc', padding: '12px' }}
                onClick={() => setShowEditModal(false)}>Cancelar</button>
              <button className="btn btn-gold" style={{ flex: 1, padding: '12px', fontSize: '14px', opacity: saveLoading || uploadingFoto ? .6 : 1 }}
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
              <h2 style={{ fontSize: '18px', fontWeight: '700', color: 'white' }}>¿Eliminar producto?</h2>
              <p style={{ fontSize: '13px', color: '#888', marginTop: '8px' }}>
                Esta acción no se puede deshacer. El producto <strong style={{ fontFamily: 'monospace', color: '#FFD700' }}>{deletingCodigo}</strong> será eliminado permanentemente.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button className="btn" style={{ flex: 1, background: 'rgba(255,255,255,0.06)', color: '#ccc', padding: '12px' }}
                onClick={() => setShowDeleteModal(false)}>Cancelar</button>
              <button className="btn" style={{ flex: 1, background: '#ff6b6b', color: '#0a0a1a', padding: '12px', fontSize: '14px', fontWeight: 700 }}
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
                <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#FFD700', margin: 0 }}>Nuevo Producto</h2>
                <p style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>Completa los campos y guarda</p>
              </div>
              <button onClick={() => setShowNuevoModal(false)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#888' }}>✕</button>
            </div>

            {/* CATEGORÍA primero, así ya está lista para sugerir la letra del código */}
            <div className="form-row">
              <label className="form-label">Categoría</label>
              <input className="form-input" placeholder="Ej: Mesas, Escritorios..." value={nuevoForm.categoria || ''}
                onChange={e => setNuevoForm(prev => ({ ...prev, categoria: e.target.value }))} />
            </div>

            {/* CÓDIGO — obligatorio, con sugerencia automática sin duplicados */}
            <div className="form-row">
              <label className="form-label">Código <span style={{ color: '#ff6b6b' }}>*</span></label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input className="form-input" style={{ width: '54px', textAlign: 'center', flex: '0 0 54px', textTransform: 'uppercase' }}
                  maxLength={1} placeholder="M"
                  value={letraCodigo}
                  onChange={e => setLetraCodigo(e.target.value.toUpperCase().slice(0, 1))} />
                <input className="form-input" placeholder="MLB-M001" value={nuevoForm.codigo || ''}
                  onChange={e => setNuevoForm(prev => ({ ...prev, codigo: e.target.value }))} />
                <button type="button" className="btn btn-gold" style={{ whiteSpace: 'nowrap', flex: '0 0 auto' }}
                  onClick={sugerirCodigo} disabled={sugiriendoCodigo}>
                  {sugiriendoCodigo ? '...' : '✨ Sugerir'}
                </button>
              </div>
              <p style={{ fontSize: '11px', color: '#666', marginTop: '6px' }}>
                La letra es el prefijo (M de Mesas, E de Escritorios...). "Sugerir" genera el siguiente número disponible para esa letra — nunca repite uno ya usado.
              </p>
            </div>

            {/* FOTO */}
            <div className="form-row">
              <label className="form-label">Foto del producto</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                {nuevoForm.foto_url
                  ? <img src={nuevoForm.foto_url} alt="" style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '10px', border: '1px solid rgba(255,215,0,0.3)' }} />
                  : <div style={{ width: '80px', height: '80px', background: '#0d0d1f', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', color: '#333' }}>📦</div>
                }
                <div>
                  <button className="btn btn-edit" style={{ marginBottom: '6px', display: 'block' }}
                    onClick={() => fileInputNuevoRef.current?.click()}>
                    {uploadingFotoNuevo ? 'Subiendo...' : nuevoForm.foto_url ? 'Cambiar foto' : 'Subir foto'}
                  </button>
                  {nuevoForm.foto_url && (
                    <button className="btn btn-del" style={{ fontSize: '11px' }}
                      onClick={() => setNuevoForm(prev => ({ ...prev, foto_url: undefined }))}>
                      Quitar foto
                    </button>
                  )}
                  <input ref={fileInputNuevoRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFotoNuevoUpload} />
                </div>
              </div>
              <p style={{ fontSize: '11px', color: '#666', marginTop: '6px' }}>Ingresa el código antes de subir la foto</p>
            </div>

            {/* CAMPOS TEXTO */}
            {[
              { key: 'nombre', label: 'Nombre', req: true },
              { key: 'medidas', label: 'Medidas', req: false },
            ].map(({ key, label, req }) => (
              <div className="form-row" key={key}>
                <label className="form-label">{label} {req && <span style={{ color: '#ff6b6b' }}>*</span>}</label>
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
              <p style={{ color: nuevoMsg.startsWith('✓') ? '#4caf50' : '#ff6b6b', fontSize: '13px', marginBottom: '12px', textAlign: 'center', fontWeight: '600' }}>{nuevoMsg}</p>
            )}

            <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
              <button className="btn" style={{ flex: 1, background: 'rgba(255,255,255,0.06)', color: '#ccc', padding: '12px' }}
                onClick={() => setShowNuevoModal(false)}>Cancelar</button>
              <button className="btn btn-gold" style={{ flex: 1, padding: '12px', fontSize: '14px', opacity: nuevoLoading || uploadingFotoNuevo ? .6 : 1 }}
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
