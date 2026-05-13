'use client'
import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'

const BUCKET = 'promociones'

interface Promo {
  id: number
  titulo: string
  descripcion: string
  imagen_url: string
  video_url: string
  link_whatsapp: string
  link_facebook: string
  link_tiktok: string
  orden: number
  activa: boolean
}

const promoVacia = (): Omit<Promo, 'id'> => ({
  titulo: '', descripcion: '', imagen_url: '', video_url: '',
  link_whatsapp: '', link_facebook: '', link_tiktok: '',
  orden: 0, activa: true,
})

export default function AdminPromociones() {
  const [usuario, setUsuario] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [promociones, setPromociones] = useState<Promo[]>([])
  const [promoSel, setPromoSel] = useState<Promo | null>(null)
  const [form, setForm] = useState<Omit<Promo, 'id'>>(promoVacia())
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [exito, setExito] = useState('')
  const [subiendo, setSubiendo] = useState<'imagen' | 'video' | null>(null)
  const [modalConfirmar, setModalConfirmar] = useState(false)
  const [idEliminar, setIdEliminar] = useState<number | null>(null)

  const refImagen = useRef<HTMLInputElement>(null)
  const refVideo = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const carnet = localStorage.getItem('carnet')
    if (!carnet) { window.location.replace('/'); return }
    supabase.from('personal').select('*, cargos(*)')
      .eq('carnet', carnet).eq('estado', true).single()
      .then(({ data }) => {
        if (!data) { window.location.replace('/'); return }
        const admin = data.cargos?.es_admin === true
        const mk = data.cargos?.puede_editar_productos === true || admin
        if (!admin && !mk) { window.location.replace('/sistema'); return }
        setUsuario(data)
        cargarPromociones()
      })
  }, [])

  const cargarPromociones = async () => {
    const { data } = await supabase.from('promociones').select('*').order('orden', { ascending: true })
    setPromociones(data || [])
    setLoading(false)
  }

  const seleccionar = (p: Promo) => {
    setPromoSel(p)
    setForm({
      titulo: p.titulo || '', descripcion: p.descripcion || '',
      imagen_url: p.imagen_url || '', video_url: p.video_url || '',
      link_whatsapp: p.link_whatsapp || '', link_facebook: p.link_facebook || '',
      link_tiktok: p.link_tiktok || '', orden: p.orden || 0, activa: p.activa ?? true,
    })
    setError(''); setExito('')
  }

  const nuevaPromo = () => {
    setPromoSel(null)
    setForm({ ...promoVacia(), orden: promociones.length })
    setError(''); setExito('')
  }

  // Subir archivo a Supabase Storage
  const subirArchivo = async (file: File, tipo: 'imagen' | 'video') => {
    setSubiendo(tipo)
    setError('')
    const ext = file.name.split('.').pop()
    const nombre = `${tipo}_${Date.now()}.${ext}`
    const { data, error } = await supabase.storage.from(BUCKET).upload(nombre, file, { upsert: true })
    if (error) { setError('Error al subir: ' + error.message); setSubiendo(null); return }
    const { data: url } = supabase.storage.from(BUCKET).getPublicUrl(data.path)
    if (tipo === 'imagen') setForm(f => ({ ...f, imagen_url: url.publicUrl }))
    else setForm(f => ({ ...f, video_url: url.publicUrl }))
    setSubiendo(null)
  }

  const guardar = async () => {
    if (!form.titulo.trim()) { setError('El título es obligatorio'); return }
    setGuardando(true); setError('')
    if (promoSel) {
      const { error } = await supabase.from('promociones').update({ ...form, updated_at: new Date() }).eq('id', promoSel.id)
      if (error) { setError('Error: ' + error.message); setGuardando(false); return }
      setExito('Promoción actualizada ✓')
    } else {
      const { error } = await supabase.from('promociones').insert(form)
      if (error) { setError('Error: ' + error.message); setGuardando(false); return }
      setExito('Promoción creada ✓')
      setPromoSel(null)
      setForm(promoVacia())
    }
    await cargarPromociones()
    setGuardando(false)
    setTimeout(() => setExito(''), 2500)
  }

  const toggleActiva = async (p: Promo) => {
    await supabase.from('promociones').update({ activa: !p.activa }).eq('id', p.id)
    await cargarPromociones()
    if (promoSel?.id === p.id) setPromoSel(prev => prev ? { ...prev, activa: !prev.activa } : null)
  }

  const moverOrden = async (p: Promo, dir: 'up' | 'down') => {
    const idx = promociones.findIndex(x => x.id === p.id)
    const otro = dir === 'up' ? promociones[idx - 1] : promociones[idx + 1]
    if (!otro) return
    await Promise.all([
      supabase.from('promociones').update({ orden: otro.orden }).eq('id', p.id),
      supabase.from('promociones').update({ orden: p.orden }).eq('id', otro.id),
    ])
    await cargarPromociones()
  }

  const confirmarEliminar = (id: number) => { setIdEliminar(id); setModalConfirmar(true) }

  const eliminar = async () => {
    if (!idEliminar) return
    await supabase.from('promociones').delete().eq('id', idEliminar)
    if (promoSel?.id === idEliminar) { setPromoSel(null); setForm(promoVacia()) }
    setModalConfirmar(false); setIdEliminar(null)
    await cargarPromociones()
  }

  const inp: any = { padding: '10px 12px', borderRadius: '8px', border: '1px solid #333', fontSize: '14px', width: '100%', boxSizing: 'border-box', backgroundColor: '#1a1a1a', color: 'white' }
  const lbl: any = { fontSize: '12px', color: '#888', display: 'block', marginBottom: '5px', fontWeight: '500' }

  if (loading) return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0f0f0f', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontFamily: 'sans-serif' }}>
      Cargando...
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0f0f0f', color: 'white', fontFamily: 'sans-serif' }}>

      <style>{`
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: #111; }
        ::-webkit-scrollbar-thumb { background: #333; border-radius: 3px; }
        .promo-item { padding: 14px 16px; border-radius: 10px; border: 1px solid #222; cursor: pointer; transition: all 0.15s; background: #1a1a1a; }
        .promo-item:hover { border-color: #444; }
        .promo-item.sel { border-color: #a3c47d; background: #1a2a1a; }
        .upload-btn { display: flex; align-items: center; gap: 8px; padding: 10px 16px; border-radius: 8px; border: 1px dashed #444; background: #111; color: #888; cursor: pointer; font-size: 13px; transition: all 0.2s; width: 100%; justify-content: center; }
        .upload-btn:hover { border-color: #a3c47d; color: #a3c47d; }
        .tag-activa { padding: 2px 8px; borderRadius: 10px; fontSize: 11px; fontWeight: bold; }
        @media (max-width: 900px) {
          .admin-layout { flex-direction: column !important; }
          .admin-sidebar { width: 100% !important; border-right: none !important; border-bottom: 1px solid #222; max-height: 300px; }
        }
      `}</style>

      {/* Modal confirmar eliminar */}
      {modalConfirmar && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ backgroundColor: '#1a1a1a', borderRadius: '16px', padding: '32px', width: '400px', maxWidth: '100%', border: '1px solid #333', textAlign: 'center' }}>
            <p style={{ fontSize: '18px', marginBottom: '8px' }}>¿Eliminar esta promoción?</p>
            <p style={{ color: '#888', fontSize: '14px', marginBottom: '24px' }}>Esta acción no se puede deshacer.</p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button onClick={() => setModalConfirmar(false)} style={{ padding: '10px 24px', background: 'transparent', border: '1px solid #444', borderRadius: '8px', color: 'white', cursor: 'pointer', fontSize: '14px' }}>Cancelar</button>
              <button onClick={eliminar} style={{ padding: '10px 24px', backgroundColor: '#c62828', border: 'none', borderRadius: '8px', color: 'white', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold' }}>Eliminar</button>
            </div>
          </div>
        </div>
      )}

      {/* NAVBAR */}
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 32px', backgroundColor: '#111', borderBottom: '1px solid #222' }}>
        <a href="/" style={{ fontWeight: 'bold', fontSize: '18px', color: 'white', textDecoration: 'none' }}>Muebles is Better</a>
        <span style={{ color: '#a3c47d', fontWeight: 'bold', fontSize: '14px' }}>Panel de Promociones</span>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <a href="/promociones" target="_blank" style={{ color: '#a3c47d', fontSize: '13px', textDecoration: 'none' }}>Ver página pública ↗</a>
          <a href="/sistema" style={{ color: '#888', fontSize: '13px', textDecoration: 'none' }}>← Sistema</a>
        </div>
      </nav>

      {/* LAYOUT */}
      <div className="admin-layout" style={{ display: 'flex', height: 'calc(100vh - 57px)' }}>

        {/* SIDEBAR — Lista de promociones */}
        <div className="admin-sidebar" style={{ width: '320px', borderRight: '1px solid #1a1a1a', overflowY: 'auto', padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ margin: 0, fontSize: '15px', color: '#ccc' }}>Promociones ({promociones.length})</h3>
            <button onClick={nuevaPromo}
              style={{ padding: '6px 14px', backgroundColor: '#a3c47d', color: '#0f0f0f', border: 'none', borderRadius: '20px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>
              + Nueva
            </button>
          </div>

          {promociones.length === 0 && (
            <p style={{ color: '#555', fontSize: '13px', textAlign: 'center', padding: '20px 0' }}>Sin promociones aún</p>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {promociones.map((p, i) => (
              <div key={p.id} className={`promo-item${promoSel?.id === p.id ? ' sel' : ''}`} onClick={() => seleccionar(p)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: '0 0 4px', fontSize: '14px', fontWeight: 'bold', color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.titulo || '(Sin título)'}
                    </p>
                    <p style={{ margin: 0, fontSize: '12px', color: '#666' }}>Orden: {p.orden}</p>
                  </div>
                  <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 'bold', backgroundColor: p.activa ? '#1a2a1a' : '#2a1a1a', color: p.activa ? '#a3c47d' : '#888', flexShrink: 0 }}>
                    {p.activa ? 'Activa' : 'Oculta'}
                  </span>
                </div>

                {/* Miniaturas acciones */}
                <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }} onClick={e => e.stopPropagation()}>
                  <button onClick={() => toggleActiva(p)}
                    style={{ flex: 1, padding: '5px', backgroundColor: '#222', border: '1px solid #333', borderRadius: '6px', color: '#888', cursor: 'pointer', fontSize: '11px' }}>
                    {p.activa ? 'Ocultar' : 'Mostrar'}
                  </button>
                  <button onClick={() => moverOrden(p, 'up')} disabled={i === 0}
                    style={{ padding: '5px 8px', backgroundColor: '#222', border: '1px solid #333', borderRadius: '6px', color: i === 0 ? '#444' : '#888', cursor: i === 0 ? 'not-allowed' : 'pointer', fontSize: '11px' }}>↑</button>
                  <button onClick={() => moverOrden(p, 'down')} disabled={i === promociones.length - 1}
                    style={{ padding: '5px 8px', backgroundColor: '#222', border: '1px solid #333', borderRadius: '6px', color: i === promociones.length - 1 ? '#444' : '#888', cursor: i === promociones.length - 1 ? 'not-allowed' : 'pointer', fontSize: '11px' }}>↓</button>
                  <button onClick={() => confirmarEliminar(p.id)}
                    style={{ padding: '5px 8px', backgroundColor: '#2a1a1a', border: '1px solid #3a1a1a', borderRadius: '6px', color: '#c62828', cursor: 'pointer', fontSize: '11px' }}>🗑</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* PANEL EDITOR */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px' }}>
          <div style={{ maxWidth: '680px', margin: '0 auto' }}>

            <h2 style={{ margin: '0 0 24px', fontSize: '20px', color: 'white' }}>
              {promoSel ? `Editando: ${promoSel.titulo || '(Sin título)'}` : '➕ Nueva Promoción'}
            </h2>

            {/* Título y descripción */}
            <div style={{ marginBottom: '20px' }}>
              <label style={lbl}>Título *</label>
              <input type="text" value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))} style={inp} placeholder="Ej: Oferta de temporada" />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={lbl}>Descripción / Texto</label>
              <textarea value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
                style={{ ...inp, minHeight: '100px', resize: 'vertical' }} placeholder="Describe la promoción..." />
            </div>

            {/* Imagen */}
            <div style={{ marginBottom: '20px' }}>
              <label style={lbl}>Imagen de la promoción</label>
              <input ref={refImagen} type="file" accept="image/*" style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) subirArchivo(f, 'imagen') }} />
              <button className="upload-btn" onClick={() => refImagen.current?.click()} disabled={subiendo === 'imagen'}>
                {subiendo === 'imagen' ? '⏳ Subiendo imagen...' : '📷 Subir imagen desde PC'}
              </button>
              {form.imagen_url && (
                <div style={{ marginTop: '12px', position: 'relative' }}>
                  <img src={form.imagen_url} alt="Preview" style={{ width: '100%', maxHeight: '200px', objectFit: 'cover', borderRadius: '10px', border: '1px solid #333' }} />
                  <button onClick={() => setForm(f => ({ ...f, imagen_url: '' }))}
                    style={{ position: 'absolute', top: '8px', right: '8px', backgroundColor: 'rgba(0,0,0,0.7)', border: 'none', color: 'white', borderRadius: '50%', width: '28px', height: '28px', cursor: 'pointer', fontSize: '14px' }}>✕</button>
                </div>
              )}
            </div>

            {/* Video */}
            <div style={{ marginBottom: '20px' }}>
              <label style={lbl}>Video (opcional — reemplaza la imagen si ambos están)</label>
              <input ref={refVideo} type="file" accept="video/*" style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) subirArchivo(f, 'video') }} />
              <button className="upload-btn" onClick={() => refVideo.current?.click()} disabled={subiendo === 'video'}>
                {subiendo === 'video' ? '⏳ Subiendo video...' : '🎥 Subir video desde PC'}
              </button>
              {form.video_url && (
                <div style={{ marginTop: '12px', position: 'relative' }}>
                  <video src={form.video_url} controls style={{ width: '100%', maxHeight: '180px', borderRadius: '10px', border: '1px solid #333' }} />
                  <button onClick={() => setForm(f => ({ ...f, video_url: '' }))}
                    style={{ position: 'absolute', top: '8px', right: '8px', backgroundColor: 'rgba(0,0,0,0.7)', border: 'none', color: 'white', borderRadius: '50%', width: '28px', height: '28px', cursor: 'pointer', fontSize: '14px' }}>✕</button>
                </div>
              )}
            </div>

            {/* Redes sociales */}
            <div style={{ backgroundColor: '#1a1a1a', borderRadius: '12px', padding: '20px', marginBottom: '20px', border: '1px solid #222' }}>
              <p style={{ margin: '0 0 16px', fontSize: '13px', color: '#a3c47d', fontWeight: 'bold' }}>🔗 Enlaces de redes sociales</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label style={lbl}>WhatsApp (número o enlace wa.me)</label>
                  <input type="text" value={form.link_whatsapp} onChange={e => setForm(f => ({ ...f, link_whatsapp: e.target.value }))}
                    style={inp} placeholder="https://wa.me/59171234567?text=Hola" />
                </div>
                <div>
                  <label style={lbl}>Facebook (perfil o página)</label>
                  <input type="text" value={form.link_facebook} onChange={e => setForm(f => ({ ...f, link_facebook: e.target.value }))}
                    style={inp} placeholder="https://facebook.com/mueblessisbetter" />
                </div>
                <div>
                  <label style={lbl}>TikTok (perfil)</label>
                  <input type="text" value={form.link_tiktok} onChange={e => setForm(f => ({ ...f, link_tiktok: e.target.value }))}
                    style={inp} placeholder="https://tiktok.com/@mueblessisbetter" />
                </div>
              </div>
            </div>

            {/* Orden y estado */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
              <div>
                <label style={lbl}>Orden de aparición</label>
                <input type="number" value={form.orden} onChange={e => setForm(f => ({ ...f, orden: parseInt(e.target.value) || 0 }))}
                  style={inp} min="0" />
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: '2px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '14px', color: '#ccc' }}>
                  <input type="checkbox" checked={form.activa} onChange={e => setForm(f => ({ ...f, activa: e.target.checked }))}
                    style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#a3c47d' }} />
                  Mostrar en la página pública
                </label>
              </div>
            </div>

            {error && <div style={{ backgroundColor: '#2a1a1a', border: '1px solid #c62828', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px', color: '#ff6b6b', fontSize: '14px' }}>{error}</div>}
            {exito && <div style={{ backgroundColor: '#1a2a1a', border: '1px solid #a3c47d', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px', color: '#a3c47d', fontSize: '14px' }}>{exito}</div>}

            <button onClick={guardar} disabled={guardando || subiendo !== null}
              style={{ width: '100%', padding: '14px', backgroundColor: guardando ? '#333' : '#a3c47d', color: guardando ? '#888' : '#0f0f0f', border: 'none', borderRadius: '10px', cursor: guardando ? 'not-allowed' : 'pointer', fontSize: '15px', fontWeight: 'bold' }}>
              {guardando ? 'Guardando...' : promoSel ? '✓ Guardar cambios' : '✓ Crear promoción'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
