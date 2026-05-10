'use client'
import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface Producto {
  codigo: string
  nombre: string | null
  categoria: string | null
  precio_minimo: number | null
  precio_tienda: number | null
  foto_url: string | null
}

interface Variante {
  id: number
  codigo_producto: string
  nombre_variante: string
  codigo_color: string | null
  codigo_melamina: string | null
  es_estandar: boolean
  activo: boolean
  costo_acero: number
  costo_melamina: number
  costo_accesorios: number
  costo_insumos: number
  costo_total: number
}

interface PiezaAcero {
  id: number
  variante_id: number
  codigo_acero: string
  descripcion: string | null
  longitud_cm: number
  cantidad: number
  costo_unitario: number
  costo_total: number
}

interface PiezaMelamina {
  id: number
  variante_id: number
  codigo_melamina: string
  descripcion: string | null
  largo_cm: number
  ancho_cm: number
  cantidad: number
  costo_unitario: number
  costo_total: number
}

interface PiezaAccesorio {
  id: number
  variante_id: number
  codigo_accesorio: string
  descripcion: string | null
  cantidad: number
  costo_unitario: number
  costo_total: number
}

interface PiezaInsumo {
  id: number
  variante_id: number
  codigo_insumo: string
  descripcion: string | null
  cantidad: number
  costo_unitario: number
  costo_total: number
}

type TabActiva = 'acero' | 'melamina' | 'accesorios' | 'insumos'

const fmt = (v: number | null | undefined) =>
  v != null ? `Bs. ${Number(v).toLocaleString('es-BO', { minimumFractionDigits: 2 })}` : '—'

const pct = (costo: number, precio: number | null) =>
  precio && costo > 0 ? `${(((precio - costo) / costo) * 100).toFixed(1)}%` : '—'

export default function ProductosConstructivos() {
  const [usuario, setUsuario] = useState<any>(null)
  const [esAdmin, setEsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)

  // Lista productos
  const [productos, setProductos] = useState<Producto[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [filtroCategoria, setFiltroCategoria] = useState('')
  const [categorias, setCategorias] = useState<string[]>([])

  // Panel lateral
  const [productoSel, setProductoSel] = useState<Producto | null>(null)
  const [variantes, setVariantes] = useState<Variante[]>([])
  const [varianteSel, setVarianteSel] = useState<Variante | null>(null)
  const [tabActiva, setTabActiva] = useState<TabActiva>('acero')
  const [loadingPanel, setLoadingPanel] = useState(false)

  // Materiales de la variante seleccionada
  const [piezasAcero, setPiezasAcero] = useState<PiezaAcero[]>([])
  const [piezasMelamina, setPiezasMelamina] = useState<PiezaMelamina[]>([])
  const [piezasAccesorios, setPiezasAccesorios] = useState<PiezaAccesorio[]>([])
  const [piezasInsumos, setPiezasInsumos] = useState<PiezaInsumo[]>([])

  // Datos maestros
  const [aceros, setAceros] = useState<any[]>([])
  const [melaminas, setMelaminas] = useState<any[]>([])
  const [accesorios, setAccesorios] = useState<any[]>([])
  const [insumos, setInsumos] = useState<any[]>([])
  const [colores, setColores] = useState<any[]>([])

  // Modales
  const [modalVariante, setModalVariante] = useState(false)
  const [modalPieza, setModalPieza] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [errorModal, setErrorModal] = useState('')
  const [exito, setExito] = useState('')

  // Form nueva variante
  const [fvNombre, setFvNombre] = useState('')
  const [fvColor, setFvColor] = useState('')
  const [fvMelamina, setFvMelamina] = useState('')
  const [fvEstandar, setFvEstandar] = useState(true)
  const [fvClonarDe, setFvClonarDe] = useState('')

  // Form nueva pieza
  const [fpCodigo, setFpCodigo] = useState('')
  const [fpDescripcion, setFpDescripcion] = useState('')
  const [fpLongitud, setFpLongitud] = useState('')
  const [fpLargo, setFpLargo] = useState('')
  const [fpAncho, setFpAncho] = useState('')
  const [fpCantidad, setFpCantidad] = useState('')

  // ── Auth ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    const carnet = localStorage.getItem('carnet')
    if (!carnet) { window.location.replace('/'); return }
    supabase.from('personal').select('*, cargos(*)')
      .eq('carnet', carnet).eq('estado', true).single()
      .then(({ data }) => {
        if (!data) { window.location.replace('/'); return }
        setUsuario(data)
        const admin = data.cargos?.es_admin === true
        const produccion = data.cargos?.puede_ver_produccion === true
        setEsAdmin(admin)
        if (!admin && !produccion) { window.location.replace('/sistema'); return }
        cargarDatos()
      })
  }, [])

  const cargarDatos = async () => {
    const [{ data: p }, { data: a }, { data: m }, { data: ac }, { data: i }, { data: c }] = await Promise.all([
      supabase.from('productos').select('codigo,nombre,categoria,precio_minimo,precio_tienda,foto_url').order('codigo'),
      supabase.from('aceros').select('*').order('codigo_acero'),
      supabase.from('melaminas').select('*').order('codigo_melamina'),
      supabase.from('accesorios').select('*').order('codigo_accesorio'),
      supabase.from('insumos').select('*').order('codigo_insumos'),
      supabase.from('colores').select('*').order('detalle'),
    ])
    setProductos(p || [])
    setAceros(a || [])
    setMelaminas(m || [])
    setAccesorios(ac || [])
    setInsumos(i || [])
    setColores(c || [])
    const cats = [...new Set((p || []).map(x => x.categoria).filter(Boolean))] as string[]
    setCategorias(cats)
    setLoading(false)
  }

  const seleccionarProducto = async (producto: Producto) => {
    if (productoSel?.codigo === producto.codigo) {
      setProductoSel(null); setVariantes([]); setVarianteSel(null); return
    }
    setProductoSel(producto)
    setVarianteSel(null)
    setLoadingPanel(true)
    const { data } = await supabase.from('producto_variantes')
      .select('*').eq('codigo_producto', producto.codigo).eq('activo', true).order('es_estandar', { ascending: false })
    setVariantes(data || [])
    setLoadingPanel(false)
  }

  const seleccionarVariante = useCallback(async (v: Variante) => {
    setVarianteSel(v)
    setTabActiva('acero')
    setLoadingPanel(true)
    const [{ data: a }, { data: m }, { data: ac }, { data: i }] = await Promise.all([
      supabase.from('variante_acero').select('*').eq('variante_id', v.id).order('id'),
      supabase.from('variante_melamina').select('*').eq('variante_id', v.id).order('id'),
      supabase.from('variante_accesorios').select('*').eq('variante_id', v.id).order('id'),
      supabase.from('variante_insumos').select('*').eq('variante_id', v.id).order('id'),
    ])
    setPiezasAcero(a || [])
    setPiezasMelamina(m || [])
    setPiezasAccesorios(ac || [])
    setPiezasInsumos(i || [])
    setLoadingPanel(false)
  }, [])

  const recalcularVariante = async (varianteId: number) => {
    await supabase.rpc('recalcular_costos_variante', { p_variante_id: varianteId })
    const { data } = await supabase.from('producto_variantes').select('*').eq('id', varianteId).single()
    if (data) {
      setVariantes(prev => prev.map(v => v.id === varianteId ? data : v))
      setVarianteSel(data)
    }
  }

  // ── Nueva variante ─────────────────────────────────────────────────────────
  const abrirModalVariante = () => {
    setFvNombre(''); setFvColor(''); setFvMelamina(''); setFvEstandar(true); setFvClonarDe('')
    setErrorModal(''); setExito(''); setModalVariante(true)
  }

  const guardarVariante = async () => {
    if (!fvNombre.trim()) { setErrorModal('El nombre es obligatorio'); return }
    setGuardando(true); setErrorModal('')
    const { data: nueva, error } = await supabase.from('producto_variantes').insert({
      codigo_producto: productoSel!.codigo,
      nombre_variante: fvNombre.trim(),
      codigo_color: fvColor || null,
      codigo_melamina: fvMelamina || null,
      es_estandar: fvEstandar,
    }).select().single()

    if (error) { setErrorModal('Error al crear: ' + error.message); setGuardando(false); return }

    // Clonar materiales si se eligió una variante base
    if (fvClonarDe && nueva) {
      const baseId = parseInt(fvClonarDe)
      const [{ data: ca }, { data: cm }, { data: cac }, { data: ci }] = await Promise.all([
        supabase.from('variante_acero').select('*').eq('variante_id', baseId),
        supabase.from('variante_melamina').select('*').eq('variante_id', baseId),
        supabase.from('variante_accesorios').select('*').eq('variante_id', baseId),
        supabase.from('variante_insumos').select('*').eq('variante_id', baseId),
      ])
      const clonar = async (tabla: string, rows: any[]) => {
        if (!rows?.length) return
        const clean = rows.map(({ id, variante_id, costo_unitario, costo_total, created_at, subtotal, ...rest }) => ({ ...rest, variante_id: nueva.id }))
        await supabase.from(tabla).insert(clean)
      }
      await Promise.all([
        clonar('variante_acero', ca || []),
        clonar('variante_melamina', cm || []),
        clonar('variante_accesorios', cac || []),
        clonar('variante_insumos', ci || []),
      ])
      await recalcularVariante(nueva.id)
    }

    setExito('Variante creada correctamente')
    const { data } = await supabase.from('producto_variantes').select('*').eq('codigo_producto', productoSel!.codigo).eq('activo', true).order('es_estandar', { ascending: false })
    setVariantes(data || [])
    setGuardando(false)
    setTimeout(() => { setModalVariante(false); setExito('') }, 1200)
  }

  // ── Nueva pieza ────────────────────────────────────────────────────────────
  const abrirModalPieza = () => {
    setFpCodigo(''); setFpDescripcion(''); setFpLongitud(''); setFpLargo(''); setFpAncho(''); setFpCantidad('')
    setErrorModal(''); setExito(''); setModalPieza(true)
  }

  const guardarPieza = async () => {
    if (!fpCodigo || !fpCantidad) { setErrorModal('Código y cantidad son obligatorios'); return }
    const cant = parseFloat(fpCantidad)
    if (isNaN(cant) || cant <= 0) { setErrorModal('Cantidad inválida'); return }
    setGuardando(true); setErrorModal('')

    let error: any = null

    if (tabActiva === 'acero') {
      const lon = parseFloat(fpLongitud)
      if (isNaN(lon) || lon <= 0) { setErrorModal('Longitud inválida'); setGuardando(false); return }
      const res = await supabase.from('variante_acero').insert({
        variante_id: varianteSel!.id, codigo_acero: fpCodigo,
        descripcion: fpDescripcion || null, longitud_cm: lon, cantidad: cant,
      })
      error = res.error
      if (!error) { const { data } = await supabase.from('variante_acero').select('*').eq('variante_id', varianteSel!.id).order('id'); setPiezasAcero(data || []) }
    }

    if (tabActiva === 'melamina') {
      const lar = parseFloat(fpLargo); const anc = parseFloat(fpAncho)
      if (isNaN(lar) || isNaN(anc) || lar <= 0 || anc <= 0) { setErrorModal('Largo y ancho inválidos'); setGuardando(false); return }
      const res = await supabase.from('variante_melamina').insert({
        variante_id: varianteSel!.id, codigo_melamina: fpCodigo,
        descripcion: fpDescripcion || null, largo_cm: lar, ancho_cm: anc, cantidad: cant,
      })
      error = res.error
      if (!error) { const { data } = await supabase.from('variante_melamina').select('*').eq('variante_id', varianteSel!.id).order('id'); setPiezasMelamina(data || []) }
    }

    if (tabActiva === 'accesorios') {
      const res = await supabase.from('variante_accesorios').insert({
        variante_id: varianteSel!.id, codigo_accesorio: fpCodigo,
        descripcion: fpDescripcion || null, cantidad: cant,
      })
      error = res.error
      if (!error) { const { data } = await supabase.from('variante_accesorios').select('*').eq('variante_id', varianteSel!.id).order('id'); setPiezasAccesorios(data || []) }
    }

    if (tabActiva === 'insumos') {
      // TODO: implementar fórmula de consumo por insumo
      // Por ahora se registra la cantidad directamente
      // La fórmula dependerá del tipo de insumo (ej: pintura = longitud_total_tubo / consumo)
      const res = await supabase.from('variante_insumos').insert({
        variante_id: varianteSel!.id, codigo_insumo: fpCodigo,
        descripcion: fpDescripcion || null, cantidad: cant,
      })
      error = res.error
      if (!error) { const { data } = await supabase.from('variante_insumos').select('*').eq('variante_id', varianteSel!.id).order('id'); setPiezasInsumos(data || []) }
    }

    if (error) { setErrorModal('Error al guardar: ' + error.message); setGuardando(false); return }

    await recalcularVariante(varianteSel!.id)
    setExito('Pieza agregada correctamente')
    setGuardando(false)
    setTimeout(() => { setModalPieza(false); setExito('') }, 1000)
  }

  const eliminarPieza = async (tabla: string, id: number) => {
    if (!confirm('¿Eliminar esta pieza?')) return
    await supabase.from(tabla).delete().eq('id', id)
    await recalcularVariante(varianteSel!.id)
    await seleccionarVariante(varianteSel!)
  }

  // ── Estilos compartidos ────────────────────────────────────────────────────
  const thStyle: any = { padding: '10px 12px', textAlign: 'left', borderBottom: '2px solid #eee', color: '#555', fontSize: '12px', whiteSpace: 'nowrap', backgroundColor: '#f9f9f9' }
  const tdStyle: any = { padding: '10px 12px', borderBottom: '1px solid #f0f0f0', fontSize: '13px' }
  const inputStyle: any = { padding: '9px 12px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '14px', width: '100%', boxSizing: 'border-box', backgroundColor: 'white' }
  const labelStyle: any = { fontSize: '12px', color: '#555', display: 'block', marginBottom: '4px', fontWeight: '500' }

  const productosFiltrados = productos.filter(p =>
    (!filtroCategoria || p.categoria === filtroCategoria) &&
    (!busqueda || (p.nombre || '').toLowerCase().includes(busqueda.toLowerCase()) || p.codigo.toLowerCase().includes(busqueda.toLowerCase()))
  )

  // ── Preview costo pieza ────────────────────────────────────────────────────
  const previewCosto = () => {
    const cant = parseFloat(fpCantidad) || 0
    if (tabActiva === 'acero') {
      const lon = parseFloat(fpLongitud) || 0
      const acero = aceros.find(a => a.codigo_acero === fpCodigo)
      if (!acero || !lon || !cant) return null
      const costo = (lon * cant / 600) * acero.precio_cotizador
      return `Preview: (${lon}cm × ${cant} / 600) × Bs.${acero.precio_cotizador} = ${fmt(costo)}`
    }
    if (tabActiva === 'melamina') {
      const lar = parseFloat(fpLargo) || 0; const anc = parseFloat(fpAncho) || 0
      const mel = melaminas.find(m => m.codigo_melamina === fpCodigo)
      if (!mel || !lar || !anc || !cant) return null
      const costo = (lar / 100) * (anc / 100) * cant * mel.precio_cotizador
      return `Preview: (${lar}/100 × ${anc}/100) × ${cant} × Bs.${mel.precio_cotizador} = ${fmt(costo)}`
    }
    if (tabActiva === 'accesorios') {
      const acc = accesorios.find(a => a.codigo_accesorio === fpCodigo)
      if (!acc || !cant) return null
      return `Preview: ${cant} × Bs.${acc.precio_cotizador} = ${fmt(cant * acc.precio_cotizador)}`
    }
    if (tabActiva === 'insumos') {
      const ins = insumos.find(i => i.codigo_insumos === fpCodigo)
      if (!ins || !cant) return null
      // TODO: usar fórmula de consumo cuando esté implementada
      return `Preview: ${cant} × Bs.${ins.precio_cotizador} = ${fmt(cant * ins.precio_cotizador)} (fórmula pendiente)`
    }
    return null
  }

  if (loading) return <p style={{ textAlign: 'center', marginTop: '100px', fontFamily: 'Arial' }}>Cargando...</p>

  const preview = previewCosto()

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', minHeight: '100vh', backgroundColor: '#f5f5f5' }}>

      <style>{`
        @media (max-width: 900px) {
          .layout-split { flex-direction: column !important; }
          .panel-lateral { width: 100% !important; border-left: none !important; border-top: 2px solid #eee; }
        }
        .tab-btn { background: none; border: none; padding: 10px 16px; cursor: pointer; font-size: 13px; font-weight: 500; color: #888; border-bottom: 2px solid transparent; transition: all 0.15s; }
        .tab-btn.activa { color: #087e0b; border-bottom-color: #087e0b; }
        .tab-btn:hover { color: #087e0b; }
        .prod-row { cursor: pointer; transition: background 0.1s; }
        .prod-row:hover { background: #f0fff0 !important; }
        .prod-row.seleccionado { background: #e8f5e9 !important; }
      `}</style>

      {/* MODAL NUEVA VARIANTE */}
      {modalVariante && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', boxSizing: 'border-box' }}>
          <div style={{ backgroundColor: 'white', borderRadius: '16px', padding: '32px', width: '500px', maxWidth: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ margin: 0, fontSize: '18px' }}>Nueva Variante — {productoSel?.nombre}</h2>
              <button onClick={() => setModalVariante(false)} style={{ background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer', color: '#999' }}>✕</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '14px' }}>
              <div>
                <label style={labelStyle}>Nombre de la variante *</label>
                <input type="text" value={fvNombre} onChange={e => setFvNombre(e.target.value)} style={inputStyle} placeholder="Ej: Negro / Blanco" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>Color estructura</label>
                  <select value={fvColor} onChange={e => setFvColor(e.target.value)} style={inputStyle}>
                    <option value="">-- Sin color --</option>
                    {colores.map(c => <option key={c.id} value={c.codigo_color}>{c.detalle}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Melamina</label>
                  <select value={fvMelamina} onChange={e => setFvMelamina(e.target.value)} style={inputStyle}>
                    <option value="">-- Sin melamina --</option>
                    {melaminas.map(m => <option key={m.id} value={m.codigo_melamina}>{m.detalle}</option>)}
                  </select>
                </div>
              </div>
              {variantes.length > 0 && (
                <div>
                  <label style={labelStyle}>Clonar materiales desde variante existente</label>
                  <select value={fvClonarDe} onChange={e => setFvClonarDe(e.target.value)} style={inputStyle}>
                    <option value="">-- No clonar, empezar vacía --</option>
                    {variantes.map(v => <option key={v.id} value={v.id}>{v.nombre_variante}{v.es_estandar ? ' ★' : ''}</option>)}
                  </select>
                </div>
              )}
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px', cursor: 'pointer' }}>
                <input type="checkbox" checked={fvEstandar} onChange={e => setFvEstandar(e.target.checked)} style={{ width: '16px', height: '16px' }} />
                Variante estándar del producto
              </label>
            </div>

            {errorModal && <div style={{ marginTop: '16px', backgroundColor: '#ffebee', border: '1px solid #ffcdd2', borderRadius: '8px', padding: '10px 14px', color: '#c62828', fontSize: '13px' }}>{errorModal}</div>}
            {exito && <div style={{ marginTop: '16px', backgroundColor: '#e8f5e9', border: '1px solid #c8e6c9', borderRadius: '8px', padding: '10px 14px', color: '#2e7d32', fontSize: '13px' }}>{exito}</div>}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '24px' }}>
              <button onClick={() => setModalVariante(false)} style={{ padding: '10px 20px', background: 'transparent', border: '1px solid #ddd', borderRadius: '8px', cursor: 'pointer', fontSize: '14px' }}>Cancelar</button>
              <button onClick={guardarVariante} disabled={guardando} style={{ padding: '10px 24px', backgroundColor: guardando ? '#ccc' : '#087e0b', color: 'white', border: 'none', borderRadius: '8px', cursor: guardando ? 'not-allowed' : 'pointer', fontSize: '14px', fontWeight: 'bold' }}>
                {guardando ? 'Guardando...' : 'Crear Variante'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL NUEVA PIEZA */}
      {modalPieza && varianteSel && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', boxSizing: 'border-box' }}>
          <div style={{ backgroundColor: 'white', borderRadius: '16px', padding: '32px', width: '500px', maxWidth: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ margin: 0, fontSize: '18px' }}>
                Agregar {tabActiva === 'acero' ? '🔩 Acero' : tabActiva === 'melamina' ? '🪵 Melamina' : tabActiva === 'accesorios' ? '🔧 Accesorio' : '🧪 Insumo'}
              </h2>
              <button onClick={() => setModalPieza(false)} style={{ background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer', color: '#999' }}>✕</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '14px' }}>

              {/* Selector de código */}
              <div>
                <label style={labelStyle}>
                  {tabActiva === 'acero' ? 'Código acero' : tabActiva === 'melamina' ? 'Código melamina' : tabActiva === 'accesorios' ? 'Código accesorio' : 'Código insumo'} *
                </label>
                <select value={fpCodigo} onChange={e => setFpCodigo(e.target.value)} style={inputStyle}>
                  <option value="">-- Selecciona --</option>
                  {tabActiva === 'acero' && aceros.map(a => <option key={a.id} value={a.codigo_acero}>{a.codigo_acero} — {a.detalle}</option>)}
                  {tabActiva === 'melamina' && melaminas.map(m => <option key={m.id} value={m.codigo_melamina}>{m.codigo_melamina} — {m.detalle}</option>)}
                  {tabActiva === 'accesorios' && accesorios.map(a => <option key={a.id} value={a.codigo_accesorio}>{a.codigo_accesorio} — {a.detalle}</option>)}
                  {tabActiva === 'insumos' && insumos.map(i => <option key={i.id} value={i.codigo_insumos}>{i.codigo_insumos} — {i.detalle}</option>)}
                </select>
              </div>

              <div>
                <label style={labelStyle}>Descripción / Referencia</label>
                <input type="text" value={fpDescripcion} onChange={e => setFpDescripcion(e.target.value)} style={inputStyle} placeholder="Ej: Pata delantera izquierda" />
              </div>

              {/* Campos según tab */}
              {tabActiva === 'acero' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={labelStyle}>Longitud (cm) *</label>
                    <input type="number" value={fpLongitud} onChange={e => setFpLongitud(e.target.value)} style={inputStyle} placeholder="Ej: 120" min="0" step="0.1" />
                  </div>
                  <div>
                    <label style={labelStyle}>Cantidad *</label>
                    <input type="number" value={fpCantidad} onChange={e => setFpCantidad(e.target.value)} style={inputStyle} placeholder="Ej: 4" min="0" step="1" />
                  </div>
                </div>
              )}

              {tabActiva === 'melamina' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={labelStyle}>Largo (cm) *</label>
                    <input type="number" value={fpLargo} onChange={e => setFpLargo(e.target.value)} style={inputStyle} placeholder="Ej: 80" min="0" step="0.1" />
                  </div>
                  <div>
                    <label style={labelStyle}>Ancho (cm) *</label>
                    <input type="number" value={fpAncho} onChange={e => setFpAncho(e.target.value)} style={inputStyle} placeholder="Ej: 40" min="0" step="0.1" />
                  </div>
                  <div>
                    <label style={labelStyle}>Cantidad *</label>
                    <input type="number" value={fpCantidad} onChange={e => setFpCantidad(e.target.value)} style={inputStyle} placeholder="Ej: 2" min="0" step="1" />
                  </div>
                </div>
              )}

              {(tabActiva === 'accesorios' || tabActiva === 'insumos') && (
                <div>
                  <label style={labelStyle}>Cantidad *</label>
                  <input type="number" value={fpCantidad} onChange={e => setFpCantidad(e.target.value)} style={inputStyle} placeholder="Ej: 4" min="0" step="0.01" />
                  {tabActiva === 'insumos' && (
                    <p style={{ margin: '6px 0 0', fontSize: '11px', color: '#f57f17', fontStyle: 'italic' }}>
                      ⚠️ Fórmula de consumo pendiente — se registra cantidad directamente
                    </p>
                  )}
                </div>
              )}

              {/* Preview costo */}
              {preview && (
                <div style={{ backgroundColor: '#f0fff0', border: '1px solid #a3c47d', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#2c6d2e' }}>
                  {preview}
                </div>
              )}
            </div>

            {errorModal && <div style={{ marginTop: '14px', backgroundColor: '#ffebee', border: '1px solid #ffcdd2', borderRadius: '8px', padding: '10px 14px', color: '#c62828', fontSize: '13px' }}>{errorModal}</div>}
            {exito && <div style={{ marginTop: '14px', backgroundColor: '#e8f5e9', border: '1px solid #c8e6c9', borderRadius: '8px', padding: '10px 14px', color: '#2e7d32', fontSize: '13px' }}>{exito}</div>}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '24px' }}>
              <button onClick={() => setModalPieza(false)} style={{ padding: '10px 20px', background: 'transparent', border: '1px solid #ddd', borderRadius: '8px', cursor: 'pointer', fontSize: '14px' }}>Cancelar</button>
              <button onClick={guardarPieza} disabled={guardando} style={{ padding: '10px 24px', backgroundColor: guardando ? '#ccc' : '#087e0b', color: 'white', border: 'none', borderRadius: '8px', cursor: guardando ? 'not-allowed' : 'pointer', fontSize: '14px', fontWeight: 'bold' }}>
                {guardando ? 'Guardando...' : 'Agregar Pieza'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* NAVBAR */}
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 40px', backgroundColor: '#222', color: 'white', position: 'fixed', top: 0, width: '100%', zIndex: 1000, boxSizing: 'border-box' }}>
        <a href="/" style={{ fontWeight: 'bold', fontSize: '20px', color: 'white', textDecoration: 'none' }}>Muebles is Better</a>
        <span style={{ color: '#a3c47d', fontWeight: 'bold' }}>Detalles Constructivos</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <a href="/sistema" style={{ color: '#a3c47d', fontSize: '14px', textDecoration: 'none' }}>← Sistema</a>
          <a href="/" onClick={() => localStorage.removeItem('carnet')} style={{ backgroundColor: 'transparent', color: '#ff6b6b', border: '1px solid #ff6b6b', padding: '5px 12px', borderRadius: '20px', fontSize: '12px', textDecoration: 'none' }}>Salir</a>
        </div>
      </nav>

      {/* LAYOUT PRINCIPAL */}
      <div style={{ paddingTop: '60px', display: 'flex', height: 'calc(100vh - 60px)' }}>

        {/* COLUMNA IZQUIERDA — Lista productos */}
        <div style={{ width: productoSel ? '40%' : '100%', transition: 'width 0.3s', overflowY: 'auto', borderRight: '1px solid #e0e0e0', backgroundColor: 'white' }}>

          {/* Filtros */}
          <div style={{ padding: '20px', borderBottom: '1px solid #eee', position: 'sticky', top: 0, backgroundColor: 'white', zIndex: 10 }}>
            <h2 style={{ margin: '0 0 14px', fontSize: '18px' }}>Productos</h2>
            <div style={{ display: 'flex', gap: '10px' }}>
              <input type="text" placeholder="Buscar por código o nombre..." value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                style={{ ...inputStyle, flex: 1 }} />
              <select value={filtroCategoria} onChange={e => setFiltroCategoria(e.target.value)}
                style={{ ...inputStyle, width: 'auto', minWidth: '140px' }}>
                <option value="">Todas las categorías</option>
                {categorias.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <p style={{ margin: '10px 0 0', fontSize: '12px', color: '#888' }}>{productosFiltrados.length} productos</p>
          </div>

          {/* Tabla productos */}
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>Código</th>
                <th style={thStyle}>Nombre</th>
                <th style={thStyle}>Categoría</th>
                {!productoSel && <th style={{ ...thStyle, textAlign: 'right' }}>P. Mínimo</th>}
                {!productoSel && <th style={{ ...thStyle, textAlign: 'right' }}>P. Tienda</th>}
              </tr>
            </thead>
            <tbody>
              {productosFiltrados.map((p, i) => (
                <tr key={p.codigo}
                  className={`prod-row${productoSel?.codigo === p.codigo ? ' seleccionado' : ''}`}
                  style={{ backgroundColor: i % 2 === 0 ? 'white' : '#fafafa' }}
                  onClick={() => seleccionarProducto(p)}>
                  <td style={{ ...tdStyle, fontWeight: 'bold', color: '#087e0b', fontFamily: 'monospace' }}>{p.codigo}</td>
                  <td style={tdStyle}>{p.nombre || '—'}</td>
                  <td style={{ ...tdStyle, color: '#888', fontSize: '12px' }}>{p.categoria || '—'}</td>
                  {!productoSel && <td style={{ ...tdStyle, textAlign: 'right' }}>{fmt(p.precio_minimo)}</td>}
                  {!productoSel && <td style={{ ...tdStyle, textAlign: 'right' }}>{fmt(p.precio_tienda)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* PANEL LATERAL — Variantes y materiales */}
        {productoSel && (
          <div className="panel-lateral" style={{ width: '60%', overflowY: 'auto', backgroundColor: '#f9f9f9' }}>

            {/* Header producto */}
            <div style={{ padding: '20px 24px', backgroundColor: 'white', borderBottom: '1px solid #eee', position: 'sticky', top: 0, zIndex: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <p style={{ margin: '0 0 2px', fontSize: '11px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{productoSel.categoria}</p>
                  <h2 style={{ margin: '0 0 4px', fontSize: '18px' }}>{productoSel.nombre}</h2>
                  <p style={{ margin: 0, fontSize: '12px', color: '#087e0b', fontFamily: 'monospace' }}>{productoSel.codigo}</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ margin: '0 0 2px', fontSize: '11px', color: '#888' }}>P. Mínimo / P. Tienda</p>
                  <p style={{ margin: 0, fontSize: '14px', fontWeight: 'bold' }}>{fmt(productoSel.precio_minimo)} / {fmt(productoSel.precio_tienda)}</p>
                  <button onClick={() => setProductoSel(null)} style={{ marginTop: '8px', background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '12px' }}>✕ Cerrar</button>
                </div>
              </div>
            </div>

            <div style={{ padding: '20px 24px' }}>

              {/* Selector variantes */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h3 style={{ margin: 0, fontSize: '15px', color: '#333' }}>Variantes ({variantes.length})</h3>
                {esAdmin && (
                  <button onClick={abrirModalVariante}
                    style={{ padding: '7px 14px', backgroundColor: '#087e0b', color: 'white', border: 'none', borderRadius: '20px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>
                    + Nueva variante
                  </button>
                )}
              </div>

              {loadingPanel && !varianteSel ? (
                <p style={{ color: '#888', textAlign: 'center', padding: '20px' }}>Cargando...</p>
              ) : variantes.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px', color: '#bbb', border: '2px dashed #eee', borderRadius: '12px', marginBottom: '20px' }}>
                  <p style={{ margin: 0 }}>Sin variantes — crea la primera</p>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '20px' }}>
                  {variantes.map(v => (
                    <button key={v.id} onClick={() => seleccionarVariante(v)}
                      style={{ padding: '8px 16px', borderRadius: '20px', border: `2px solid ${varianteSel?.id === v.id ? '#087e0b' : '#ddd'}`, backgroundColor: varianteSel?.id === v.id ? '#087e0b' : 'white', color: varianteSel?.id === v.id ? 'white' : '#333', cursor: 'pointer', fontSize: '13px', fontWeight: varianteSel?.id === v.id ? 'bold' : 'normal' }}>
                      {v.es_estandar ? '★ ' : ''}{v.nombre_variante}
                    </button>
                  ))}
                </div>
              )}

              {/* Panel variante seleccionada */}
              {varianteSel && (
                <div style={{ backgroundColor: 'white', borderRadius: '16px', boxShadow: '0 2px 12px rgba(0,0,0,0.08)', overflow: 'hidden' }}>

                  {/* Tabs */}
                  <div style={{ display: 'flex', borderBottom: '1px solid #eee', padding: '0 8px' }}>
                    {(['acero', 'melamina', 'accesorios', 'insumos'] as TabActiva[]).map(tab => (
                      <button key={tab} className={`tab-btn${tabActiva === tab ? ' activa' : ''}`}
                        onClick={() => setTabActiva(tab)}>
                        {tab === 'acero' ? '🔩 Acero' : tab === 'melamina' ? '🪵 Melamina' : tab === 'accesorios' ? '🔧 Accesorios' : '🧪 Insumos'}
                        <span style={{ marginLeft: '6px', fontSize: '11px', backgroundColor: tabActiva === tab ? '#087e0b' : '#eee', color: tabActiva === tab ? 'white' : '#666', borderRadius: '10px', padding: '1px 7px' }}>
                          {tab === 'acero' ? piezasAcero.length : tab === 'melamina' ? piezasMelamina.length : tab === 'accesorios' ? piezasAccesorios.length : piezasInsumos.length}
                        </span>
                      </button>
                    ))}
                    <div style={{ flex: 1 }} />
                    {esAdmin && (
                      <button onClick={abrirModalPieza}
                        style={{ margin: '8px 0', padding: '4px 12px', backgroundColor: '#087e0b', color: 'white', border: 'none', borderRadius: '20px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>
                        + Agregar
                      </button>
                    )}
                  </div>

                  {/* Contenido tab */}
                  <div style={{ overflowX: 'auto' }}>
                    {loadingPanel ? (
                      <p style={{ padding: '20px', textAlign: 'center', color: '#888' }}>Cargando...</p>
                    ) : (
                      <>
                        {/* ACERO */}
                        {tabActiva === 'acero' && (
                          piezasAcero.length === 0 ? (
                            <p style={{ padding: '24px', textAlign: 'center', color: '#bbb' }}>Sin cortes de acero registrados</p>
                          ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                              <thead><tr>
                                <th style={thStyle}>Código</th>
                                <th style={thStyle}>Descripción</th>
                                <th style={{ ...thStyle, textAlign: 'right' }}>Long.(cm)</th>
                                <th style={{ ...thStyle, textAlign: 'right' }}>Cant.</th>
                                <th style={{ ...thStyle, textAlign: 'right' }}>Costo</th>
                                {esAdmin && <th style={{ ...thStyle, textAlign: 'center' }}></th>}
                              </tr></thead>
                              <tbody>
                                {piezasAcero.map((p, i) => (
                                  <tr key={p.id} style={{ backgroundColor: i % 2 === 0 ? 'white' : '#fafafa' }}>
                                    <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: '12px', color: '#087e0b' }}>{p.codigo_acero}</td>
                                    <td style={{ ...tdStyle, color: '#666' }}>{p.descripcion || '—'}</td>
                                    <td style={{ ...tdStyle, textAlign: 'right' }}>{p.longitud_cm}</td>
                                    <td style={{ ...tdStyle, textAlign: 'right' }}>{p.cantidad}</td>
                                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 'bold', color: '#087e0b' }}>{fmt(p.costo_total)}</td>
                                    {esAdmin && <td style={{ ...tdStyle, textAlign: 'center' }}>
                                      <button onClick={() => eliminarPieza('variante_acero', p.id)} style={{ background: 'none', border: 'none', color: '#ff4444', cursor: 'pointer', fontSize: '16px' }}>🗑</button>
                                    </td>}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )
                        )}

                        {/* MELAMINA */}
                        {tabActiva === 'melamina' && (
                          piezasMelamina.length === 0 ? (
                            <p style={{ padding: '24px', textAlign: 'center', color: '#bbb' }}>Sin cortes de melamina registrados</p>
                          ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                              <thead><tr>
                                <th style={thStyle}>Código</th>
                                <th style={thStyle}>Descripción</th>
                                <th style={{ ...thStyle, textAlign: 'right' }}>Largo</th>
                                <th style={{ ...thStyle, textAlign: 'right' }}>Ancho</th>
                                <th style={{ ...thStyle, textAlign: 'right' }}>Cant.</th>
                                <th style={{ ...thStyle, textAlign: 'right' }}>Costo</th>
                                {esAdmin && <th style={{ ...thStyle, textAlign: 'center' }}></th>}
                              </tr></thead>
                              <tbody>
                                {piezasMelamina.map((p, i) => (
                                  <tr key={p.id} style={{ backgroundColor: i % 2 === 0 ? 'white' : '#fafafa' }}>
                                    <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: '12px', color: '#087e0b' }}>{p.codigo_melamina}</td>
                                    <td style={{ ...tdStyle, color: '#666' }}>{p.descripcion || '—'}</td>
                                    <td style={{ ...tdStyle, textAlign: 'right' }}>{p.largo_cm}</td>
                                    <td style={{ ...tdStyle, textAlign: 'right' }}>{p.ancho_cm}</td>
                                    <td style={{ ...tdStyle, textAlign: 'right' }}>{p.cantidad}</td>
                                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 'bold', color: '#087e0b' }}>{fmt(p.costo_total)}</td>
                                    {esAdmin && <td style={{ ...tdStyle, textAlign: 'center' }}>
                                      <button onClick={() => eliminarPieza('variante_melamina', p.id)} style={{ background: 'none', border: 'none', color: '#ff4444', cursor: 'pointer', fontSize: '16px' }}>🗑</button>
                                    </td>}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )
                        )}

                        {/* ACCESORIOS */}
                        {tabActiva === 'accesorios' && (
                          piezasAccesorios.length === 0 ? (
                            <p style={{ padding: '24px', textAlign: 'center', color: '#bbb' }}>Sin accesorios registrados</p>
                          ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                              <thead><tr>
                                <th style={thStyle}>Código</th>
                                <th style={thStyle}>Descripción</th>
                                <th style={{ ...thStyle, textAlign: 'right' }}>Cant.</th>
                                <th style={{ ...thStyle, textAlign: 'right' }}>P. Unit.</th>
                                <th style={{ ...thStyle, textAlign: 'right' }}>Costo</th>
                                {esAdmin && <th style={{ ...thStyle, textAlign: 'center' }}></th>}
                              </tr></thead>
                              <tbody>
                                {piezasAccesorios.map((p, i) => (
                                  <tr key={p.id} style={{ backgroundColor: i % 2 === 0 ? 'white' : '#fafafa' }}>
                                    <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: '12px', color: '#087e0b' }}>{p.codigo_accesorio}</td>
                                    <td style={{ ...tdStyle, color: '#666' }}>{p.descripcion || '—'}</td>
                                    <td style={{ ...tdStyle, textAlign: 'right' }}>{p.cantidad}</td>
                                    <td style={{ ...tdStyle, textAlign: 'right' }}>{fmt(p.costo_unitario)}</td>
                                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 'bold', color: '#087e0b' }}>{fmt(p.costo_total)}</td>
                                    {esAdmin && <td style={{ ...tdStyle, textAlign: 'center' }}>
                                      <button onClick={() => eliminarPieza('variante_accesorios', p.id)} style={{ background: 'none', border: 'none', color: '#ff4444', cursor: 'pointer', fontSize: '16px' }}>🗑</button>
                                    </td>}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )
                        )}

                        {/* INSUMOS */}
                        {tabActiva === 'insumos' && (
                          piezasInsumos.length === 0 ? (
                            <p style={{ padding: '24px', textAlign: 'center', color: '#bbb' }}>Sin insumos registrados</p>
                          ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                              <thead><tr>
                                <th style={thStyle}>Código</th>
                                <th style={thStyle}>Descripción</th>
                                <th style={{ ...thStyle, textAlign: 'right' }}>Cant.</th>
                                <th style={{ ...thStyle, textAlign: 'right' }}>P. Unit.</th>
                                <th style={{ ...thStyle, textAlign: 'right' }}>Costo</th>
                                {esAdmin && <th style={{ ...thStyle, textAlign: 'center' }}></th>}
                              </tr></thead>
                              <tbody>
                                {piezasInsumos.map((p, i) => (
                                  <tr key={p.id} style={{ backgroundColor: i % 2 === 0 ? 'white' : '#fafafa' }}>
                                    <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: '12px', color: '#087e0b' }}>{p.codigo_insumo}</td>
                                    <td style={{ ...tdStyle, color: '#666' }}>{p.descripcion || '—'}</td>
                                    <td style={{ ...tdStyle, textAlign: 'right' }}>{p.cantidad}</td>
                                    <td style={{ ...tdStyle, textAlign: 'right' }}>{fmt(p.costo_unitario)}</td>
                                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 'bold', color: '#087e0b' }}>{fmt(p.costo_total)}</td>
                                    {esAdmin && <td style={{ ...tdStyle, textAlign: 'center' }}>
                                      <button onClick={() => eliminarPieza('variante_insumos', p.id)} style={{ background: 'none', border: 'none', color: '#ff4444', cursor: 'pointer', fontSize: '16px' }}>🗑</button>
                                    </td>}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )
                        )}
                      </>
                    )}
                  </div>

                  {/* Resumen costos */}
                  <div style={{ backgroundColor: '#222', padding: '16px 20px', display: 'flex', flexWrap: 'wrap', gap: '20px', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                      {[
                        ['🔩 Acero', varianteSel.costo_acero],
                        ['🪵 Melamina', varianteSel.costo_melamina],
                        ['🔧 Accesorios', varianteSel.costo_accesorios],
                        ['🧪 Insumos', varianteSel.costo_insumos],
                      ].map(([label, val]) => (
                        <div key={label as string}>
                          <p style={{ margin: 0, fontSize: '10px', color: '#aaa' }}>{label as string}</p>
                          <p style={{ margin: 0, fontSize: '14px', color: '#a3c47d', fontWeight: 'bold' }}>{fmt(val as number)}</p>
                        </div>
                      ))}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ margin: '0 0 2px', fontSize: '10px', color: '#aaa' }}>Costo total / Margen mínimo / Margen tienda</p>
                      <p style={{ margin: 0, fontSize: '16px', color: 'white', fontWeight: 'bold' }}>
                        {fmt(varianteSel.costo_total)}
                        <span style={{ color: '#a3c47d', fontSize: '13px', marginLeft: '10px' }}>
                          {pct(varianteSel.costo_total, productoSel.precio_minimo)} / {pct(varianteSel.costo_total, productoSel.precio_tienda)}
                        </span>
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
