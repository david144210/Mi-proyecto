'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'

// ── Tipos ─────────────────────────────────────────────────────────────────────
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
  costo_uniones: number
  costo_total: number
}

interface VarAcero {
  id: number
  variante_id: number
  codigo_acero: string
  descripcion: string | null
  longitud_cm: number
  cantidad: number
  costo_unitario: number
  costo_total: number
  aceros?: { detalle?: string; precio_cotizador?: number }
}

interface VarMelamina {
  id: number
  variante_id: number
  codigo_melamina: string
  descripcion: string | null
  largo_cm: number
  ancho_cm: number
  cantidad: number
  costo_unitario: number
  costo_total: number
  melaminas?: { detalle?: string; precio_cotizador?: number }
}

interface VarAccesorio {
  id: number
  variante_id: number
  codigo_accesorio: string
  descripcion: string | null
  cantidad: number
  costo_unitario: number
  costo_total: number
  accesorios?: { detalle?: string; precio_cotizador?: number }
}

interface VarInsumo {
  id: number
  variante_id: number
  codigo_insumo: string
  descripcion: string | null
  cantidad: number
  costo_unitario: number
  costo_total: number
  insumos?: { detalle?: string; precio_cotizador?: number }
}

interface VarUnion {
  id: number
  variante_id: number
  codigo_union: string
  descripcion: string | null
  cantidad: number
  costo_unitario: number
  costo_total: number
  uniones?: { detalle?: string; precio?: number }
}

interface Producto {
  codigo: string
  nombre: string
  categoria: string | null
  precio_minimo: number | null
  precio_tienda: number | null
}

type TabActiva = 'acero' | 'melamina' | 'accesorios_insumos' | 'uniones' | 'resumen'

const fmt = (v: number | null | undefined) =>
  v != null ? `Bs. ${Number(v).toLocaleString('es-BO', { minimumFractionDigits: 2 })}` : '—'

const fmtNum = (v: number | null | undefined) =>
  v != null ? Number(v).toLocaleString('es-BO', { minimumFractionDigits: 2 }) : '—'

export default function ProduccionDetalle({ params }: { params: { codigo: string } }) {
  const codigo = decodeURIComponent(params.codigo)

  const [usuario, setUsuario] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [accesoDenegado, setAccesoDenegado] = useState(false)

  const [producto, setProducto] = useState<Producto | null>(null)
  const [variantes, setVariantes] = useState<Variante[]>([])
  const [varianteActiva, setVarianteActiva] = useState<Variante | null>(null)
  const [tabActiva, setTabActiva] = useState<TabActiva>('acero')
  const [loadingDatos, setLoadingDatos] = useState(false)

  // Datos por variante
  const [aceros, setAceros] = useState<VarAcero[]>([])
  const [melaminas, setMelaminas] = useState<VarMelamina[]>([])
  const [accesorios, setAccesorios] = useState<VarAccesorio[]>([])
  const [insumos, setInsumos] = useState<VarInsumo[]>([])
  const [uniones, setUniones] = useState<VarUnion[]>([])

  // Maestros para selects
  const [masterAceros, setMasterAceros] = useState<any[]>([])
  const [masterMelaminas, setMasterMelaminas] = useState<any[]>([])
  const [masterAccesorios, setMasterAccesorios] = useState<any[]>([])
  const [masterInsumos, setMasterInsumos] = useState<any[]>([])
  const [masterUniones, setMasterUniones] = useState<any[]>([])

  // Modales agregar
  const [modalAcero, setModalAcero] = useState(false)
  const [modalMelamina, setModalMelamina] = useState(false)
  const [modalAccesorio, setModalAccesorio] = useState(false)
  const [modalInsumo, setModalInsumo] = useState(false)
  const [modalUnion, setModalUnion] = useState(false)
  const [modalVariante, setModalVariante] = useState(false)

  // Formularios nuevos items
  const [fAcero, setFAcero] = useState({ codigo_acero: '', descripcion: '', longitud_cm: '', cantidad: '1' })
  const [fMelamina, setFMelamina] = useState({ codigo_melamina: '', descripcion: '', largo_cm: '', ancho_cm: '', cantidad: '1' })
  const [fAccesorio, setFAccesorio] = useState({ codigo_accesorio: '', descripcion: '', cantidad: '1' })
  const [fInsumo, setFInsumo] = useState({ codigo_insumo: '', descripcion: '', cantidad: '1' })
  const [fUnion, setFUnion] = useState({ codigo_union: '', descripcion: '', cantidad: '1' })
  const [fVariante, setFVariante] = useState({ nombre_variante: '', codigo_color: '', codigo_melamina: '', es_estandar: false })

  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const [tipoMensaje, setTipoMensaje] = useState<'ok' | 'err'>('ok')

  // ── Auth ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const carnet = localStorage.getItem('carnet')
    if (!carnet) { window.location.replace('/'); return }
    supabase.from('personal').select('*, cargos(*)')
      .eq('carnet', carnet).eq('estado', true).single()
      .then(({ data }) => {
        if (!data) { window.location.replace('/'); return }
        setUsuario(data)
        const puedeVer = data?.cargos?.puede_ver_produccion || data?.cargos?.es_admin
        if (!puedeVer) setAccesoDenegado(true)
        setLoading(false)
      })
  }, [])

  // ── Cargar producto + variantes ───────────────────────────────────────────
  useEffect(() => {
    if (loading || accesoDenegado) return
    Promise.all([
      supabase.from('productos').select('codigo, nombre, categoria, precio_minimo, precio_tienda').eq('codigo', codigo).single(),
      supabase.from('producto_variantes').select('*').eq('codigo_producto', codigo).eq('activo', true).order('es_estandar', { ascending: false }),
    ]).then(([pRes, vRes]) => {
      setProducto(pRes.data || null)
      const vars = vRes.data || []
      setVariantes(vars)
      if (vars.length > 0) setVarianteActiva(vars[0])
    })
  }, [loading, accesoDenegado, codigo])

  // ── Cargar maestros ───────────────────────────────────────────────────────
  useEffect(() => {
    if (loading || accesoDenegado) return
    Promise.all([
      supabase.from('aceros').select('codigo_acero, detalle, precio_cotizador').order('detalle'),
      supabase.from('melaminas').select('codigo_melamina, detalle, precio_cotizador').order('detalle'),
      supabase.from('accesorios').select('codigo_accesorio, detalle, precio_cotizador').order('detalle'),
      supabase.from('insumos').select('codigo_insumos, detalle, precio_cotizador').order('detalle'),
      supabase.from('uniones').select('codigo_union, detalle, precio').order('detalle'),
    ]).then(([a, m, ac, i, u]) => {
      setMasterAceros(a.data || [])
      setMasterMelaminas(m.data || [])
      setMasterAccesorios(ac.data || [])
      setMasterInsumos(i.data || [])
      setMasterUniones(u.data || [])
    })
  }, [loading, accesoDenegado])

  // ── Cargar detalles de variante activa ────────────────────────────────────
  const cargarDetalleVariante = useCallback(async (vid: number) => {
    setLoadingDatos(true)
    const [a, m, ac, i, u] = await Promise.all([
      supabase.from('variante_acero').select('*, aceros(detalle, precio_cotizador)').eq('variante_id', vid),
      supabase.from('variante_melamina').select('*, melaminas(detalle, precio_cotizador)').eq('variante_id', vid),
      supabase.from('variante_accesorios').select('*, accesorios(detalle, precio_cotizador)').eq('variante_id', vid),
      supabase.from('variante_insumos').select('*, insumos(detalle, precio_cotizador)').eq('variante_id', vid),
      supabase.from('variante_uniones').select('*, uniones(detalle, precio)').eq('variante_id', vid),
    ])
    setAceros(a.data || [])
    setMelaminas(m.data || [])
    setAccesorios(ac.data || [])
    setInsumos(i.data || [])
    setUniones(u.data || [])
    setLoadingDatos(false)
  }, [])

  useEffect(() => {
    if (varianteActiva) cargarDetalleVariante(varianteActiva.id)
  }, [varianteActiva, cargarDetalleVariante])

  // ── Recalcular costos ─────────────────────────────────────────────────────
  const recalcular = async (vid: number) => {
    await supabase.rpc('recalcular_costos_variante', { p_variante_id: vid })
    const { data } = await supabase.from('producto_variantes').select('*').eq('id', vid).single()
    if (data) {
      setVariantes(prev => prev.map(v => v.id === vid ? data : v))
      setVarianteActiva(data)
    }
  }

  const mostrarMensaje = (txt: string, tipo: 'ok' | 'err') => {
    setMensaje(txt); setTipoMensaje(tipo)
    setTimeout(() => setMensaje(''), 3500)
  }

  // ── Agregar acero ─────────────────────────────────────────────────────────
  const agregarAcero = async () => {
    if (!varianteActiva || !fAcero.codigo_acero || !fAcero.longitud_cm) return
    setGuardando(true)
    const { error } = await supabase.from('variante_acero').insert({
      variante_id: varianteActiva.id,
      codigo_acero: fAcero.codigo_acero,
      descripcion: fAcero.descripcion || null,
      longitud_cm: parseFloat(fAcero.longitud_cm),
      cantidad: parseFloat(fAcero.cantidad) || 1,
    })
    if (!error) {
      await recalcular(varianteActiva.id)
      await cargarDetalleVariante(varianteActiva.id)
      setModalAcero(false)
      setFAcero({ codigo_acero: '', descripcion: '', longitud_cm: '', cantidad: '1' })
      mostrarMensaje('Corte de acero agregado', 'ok')
    } else mostrarMensaje('Error: ' + error.message, 'err')
    setGuardando(false)
  }

  // ── Agregar melamina ──────────────────────────────────────────────────────
  const agregarMelamina = async () => {
    if (!varianteActiva || !fMelamina.codigo_melamina || !fMelamina.largo_cm || !fMelamina.ancho_cm) return
    setGuardando(true)
    const { error } = await supabase.from('variante_melamina').insert({
      variante_id: varianteActiva.id,
      codigo_melamina: fMelamina.codigo_melamina,
      descripcion: fMelamina.descripcion || null,
      largo_cm: parseFloat(fMelamina.largo_cm),
      ancho_cm: parseFloat(fMelamina.ancho_cm),
      cantidad: parseFloat(fMelamina.cantidad) || 1,
    })
    if (!error) {
      await recalcular(varianteActiva.id)
      await cargarDetalleVariante(varianteActiva.id)
      setModalMelamina(false)
      setFMelamina({ codigo_melamina: '', descripcion: '', largo_cm: '', ancho_cm: '', cantidad: '1' })
      mostrarMensaje('Corte de melamina agregado', 'ok')
    } else mostrarMensaje('Error: ' + error.message, 'err')
    setGuardando(false)
  }

  // ── Agregar accesorio ─────────────────────────────────────────────────────
  const agregarAccesorio = async () => {
    if (!varianteActiva || !fAccesorio.codigo_accesorio) return
    setGuardando(true)
    const { error } = await supabase.from('variante_accesorios').insert({
      variante_id: varianteActiva.id,
      codigo_accesorio: fAccesorio.codigo_accesorio,
      descripcion: fAccesorio.descripcion || null,
      cantidad: parseFloat(fAccesorio.cantidad) || 1,
    })
    if (!error) {
      await recalcular(varianteActiva.id)
      await cargarDetalleVariante(varianteActiva.id)
      setModalAccesorio(false)
      setFAccesorio({ codigo_accesorio: '', descripcion: '', cantidad: '1' })
      mostrarMensaje('Accesorio agregado', 'ok')
    } else mostrarMensaje('Error: ' + error.message, 'err')
    setGuardando(false)
  }

  // ── Agregar insumo ────────────────────────────────────────────────────────
  const agregarInsumo = async () => {
    if (!varianteActiva || !fInsumo.codigo_insumo) return
    setGuardando(true)
    const { error } = await supabase.from('variante_insumos').insert({
      variante_id: varianteActiva.id,
      codigo_insumo: fInsumo.codigo_insumo,
      descripcion: fInsumo.descripcion || null,
      cantidad: parseFloat(fInsumo.cantidad) || 1,
    })
    if (!error) {
      await recalcular(varianteActiva.id)
      await cargarDetalleVariante(varianteActiva.id)
      setModalInsumo(false)
      setFInsumo({ codigo_insumo: '', descripcion: '', cantidad: '1' })
      mostrarMensaje('Insumo agregado', 'ok')
    } else mostrarMensaje('Error: ' + error.message, 'err')
    setGuardando(false)
  }

  // ── Agregar union ─────────────────────────────────────────────────────────
  const agregarUnion = async () => {
    if (!varianteActiva || !fUnion.codigo_union) return
    setGuardando(true)
    const { error } = await supabase.from('variante_uniones').insert({
      variante_id: varianteActiva.id,
      codigo_union: fUnion.codigo_union,
      descripcion: fUnion.descripcion || null,
      cantidad: parseFloat(fUnion.cantidad) || 1,
    })
    if (!error) {
      await recalcular(varianteActiva.id)
      await cargarDetalleVariante(varianteActiva.id)
      setModalUnion(false)
      setFUnion({ codigo_union: '', descripcion: '', cantidad: '1' })
      mostrarMensaje('Unión agregada', 'ok')
    } else mostrarMensaje('Error: ' + error.message, 'err')
    setGuardando(false)
  }

  // ── Agregar variante ──────────────────────────────────────────────────────
  const agregarVariante = async () => {
    if (!fVariante.nombre_variante.trim()) return
    setGuardando(true)
    const { error } = await supabase.from('producto_variantes').insert({
      codigo_producto: codigo,
      nombre_variante: fVariante.nombre_variante,
      codigo_color: fVariante.codigo_color || null,
      codigo_melamina: fVariante.codigo_melamina || null,
      es_estandar: fVariante.es_estandar,
    })
    if (!error) {
      const { data } = await supabase.from('producto_variantes').select('*').eq('codigo_producto', codigo).eq('activo', true).order('es_estandar', { ascending: false })
      setVariantes(data || [])
      setModalVariante(false)
      setFVariante({ nombre_variante: '', codigo_color: '', codigo_melamina: '', es_estandar: false })
      mostrarMensaje('Variante creada', 'ok')
    } else mostrarMensaje('Error: ' + error.message, 'err')
    setGuardando(false)
  }

  // ── Eliminar fila ─────────────────────────────────────────────────────────
  const eliminarFila = async (tabla: string, id: number) => {
    if (!varianteActiva) return
    if (!confirm('¿Eliminar este registro?')) return
    await supabase.from(tabla).delete().eq('id', id)
    await recalcular(varianteActiva.id)
    await cargarDetalleVariante(varianteActiva.id)
    mostrarMensaje('Eliminado correctamente', 'ok')
  }

  // ── Estilos ───────────────────────────────────────────────────────────────
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: '11px', color: '#666', marginBottom: '4px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.4px' }
  const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '13px', boxSizing: 'border-box', backgroundColor: 'white' }
  const thStyle: React.CSSProperties = { padding: '10px 14px', backgroundColor: '#f5f5f5', textAlign: 'left', fontSize: '11px', fontWeight: '600', color: '#555', borderBottom: '2px solid #e8e8e8', whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: '0.4px' }
  const tdStyle: React.CSSProperties = { padding: '9px 14px', fontSize: '13px', borderBottom: '1px solid #f0f0f0' }

  const nombreMostrar = usuario?.nombre || usuario?.usuario || usuario?.carnet || 'Usuario'

  if (loading) return (
    <div style={{ fontFamily: 'Arial, sans-serif', minHeight: '100vh', backgroundColor: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: '#888' }}>Cargando...</p>
    </div>
  )

  if (accesoDenegado) return (
    <div style={{ fontFamily: 'Arial, sans-serif', minHeight: '100vh', backgroundColor: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ backgroundColor: 'white', borderRadius: '16px', padding: '40px', textAlign: 'center', boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>
        <div style={{ fontSize: '40px', marginBottom: '12px' }}>🔒</div>
        <h2 style={{ margin: '0 0 8px' }}>Acceso denegado</h2>
        <p style={{ color: '#888', margin: 0 }}>No tienes permisos para ver esta página.</p>
      </div>
    </div>
  )

  const esAdmin = usuario?.cargos?.es_admin
  const totalVariante = varianteActiva?.costo_total || 0

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', minHeight: '100vh', backgroundColor: '#f5f5f5' }}>
      <style>{`
        .btn-primary { background-color: #087e0b; color: white; border: none; border-radius: 8px; padding: 9px 20px; font-size: 13px; font-weight: bold; cursor: pointer; }
        .btn-primary:hover { background-color: #065e08; }
        .btn-primary:disabled { background-color: #aaa; cursor: not-allowed; }
        .btn-secondary { background-color: white; color: #555; border: 1px solid #ddd; border-radius: 8px; padding: 9px 20px; font-size: 13px; cursor: pointer; }
        .btn-secondary:hover { background-color: #f5f5f5; }
        .btn-danger { background-color: transparent; color: #e53935; border: 1px solid #e53935; border-radius: 8px; padding: 6px 12px; font-size: 12px; cursor: pointer; }
        .btn-danger:hover { background-color: #ffebee; }
        .btn-nueva { background-color: #087e0b; color: white; border: none; border-radius: 10px; padding: 9px 20px; font-size: 13px; font-weight: bold; cursor: pointer; display: flex; align-items: center; gap: 6px; }
        .btn-nueva:hover { background-color: #065e08; }
        .tab-seccion { padding: 9px 18px; border: none; border-radius: 8px; font-size: 13px; cursor: pointer; transition: all 0.15s; white-space: nowrap; }
        .tab-seccion-active { background: #087e0b; color: white; font-weight: bold; }
        .tab-seccion-inactive { background: #f0f0f0; color: #555; }
        .tab-seccion-inactive:hover { background: #e0e0e0; }
        .variante-chip { padding: 7px 16px; border-radius: 20px; font-size: 12px; cursor: pointer; border: 1.5px solid transparent; font-weight: 500; white-space: nowrap; transition: all 0.15s; }
        .fila-tabla:hover { background-color: #f5fff5 !important; }
        input:focus, select:focus { outline: 2px solid #087e0b; border-color: #087e0b; }
        @media (max-width: 768px) {
          .prod-container { padding: 16px !important; }
          .tabs-scroll { overflow-x: auto; }
          .grid-modal { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* NAVBAR */}
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 40px', backgroundColor: '#222', color: 'white', position: 'sticky', top: 0, zIndex: 100 }}>
        <a href="/sistema" style={{ fontWeight: 'bold', fontSize: '20px', color: 'white', textDecoration: 'none' }}>Muebles is Better</a>
        <span style={{ color: '#a3c47d', fontWeight: 'bold' }}>🔧 Detalles Constructivos</span>
        <span style={{ color: '#a3c47d', fontSize: '14px' }}>{nombreMostrar} 👤</span>
      </nav>

      <div className="prod-container" style={{ padding: '32px 40px', maxWidth: '1300px', margin: '0 auto' }}>

        {/* TOAST */}
        {mensaje && (
          <div style={{ position: 'fixed', top: '80px', right: '24px', zIndex: 9999, backgroundColor: tipoMensaje === 'ok' ? '#e8f5e9' : '#ffebee', border: `1px solid ${tipoMensaje === 'ok' ? '#a5d6a7' : '#ef9a9a'}`, borderRadius: '10px', padding: '12px 20px', fontSize: '13px', color: tipoMensaje === 'ok' ? '#2e7d32' : '#c62828', boxShadow: '0 4px 16px rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            {tipoMensaje === 'ok' ? '✅' : '❌'} {mensaje}
          </div>
        )}

        {/* BREADCRUMB */}
        <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#888' }}>
          <a href="/sistema/produccion" style={{ color: '#087e0b', textDecoration: 'none', fontWeight: '500' }}>← Producción</a>
          <span>/</span>
          <span style={{ color: '#333' }}>{producto?.nombre || codigo}</span>
        </div>

        {/* CABECERA PRODUCTO */}
        {producto && (
          <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
                  <h1 style={{ margin: 0, fontSize: '22px' }}>{producto.nombre}</h1>
                  {producto.categoria && (
                    <span style={{ backgroundColor: '#e8f5e9', color: '#2e7d32', padding: '3px 12px', borderRadius: '12px', fontSize: '12px', fontWeight: '600' }}>{producto.categoria}</span>
                  )}
                </div>
                <p style={{ margin: 0, color: '#888', fontSize: '13px' }}>Código: <strong style={{ color: '#333' }}>{producto.codigo}</strong></p>
              </div>
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                {producto.precio_minimo != null && (
                  <div style={{ backgroundColor: '#f9f9f9', borderRadius: '10px', padding: '10px 18px', textAlign: 'center' }}>
                    <p style={{ margin: '0 0 2px', fontSize: '10px', color: '#888', textTransform: 'uppercase' }}>Precio mínimo</p>
                    <p style={{ margin: 0, fontSize: '15px', fontWeight: 'bold', color: '#e65100' }}>{fmt(producto.precio_minimo)}</p>
                  </div>
                )}
                {producto.precio_tienda != null && (
                  <div style={{ backgroundColor: '#f9f9f9', borderRadius: '10px', padding: '10px 18px', textAlign: 'center' }}>
                    <p style={{ margin: '0 0 2px', fontSize: '10px', color: '#888', textTransform: 'uppercase' }}>Precio tienda</p>
                    <p style={{ margin: 0, fontSize: '15px', fontWeight: 'bold', color: '#087e0b' }}>{fmt(producto.precio_tienda)}</p>
                  </div>
                )}
                {varianteActiva && (
                  <div style={{ backgroundColor: '#e8f5e9', borderRadius: '10px', padding: '10px 18px', textAlign: 'center' }}>
                    <p style={{ margin: '0 0 2px', fontSize: '10px', color: '#555', textTransform: 'uppercase' }}>Costo variante</p>
                    <p style={{ margin: 0, fontSize: '15px', fontWeight: 'bold', color: '#087e0b' }}>{fmt(varianteActiva.costo_total)}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* VARIANTES */}
        <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <h3 style={{ margin: 0, fontSize: '15px', color: '#333' }}>🎨 Variantes del producto</h3>
            {esAdmin && (
              <button className="btn-nueva" onClick={() => setModalVariante(true)}>＋ Nueva variante</button>
            )}
          </div>
          <div className="tabs-scroll" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {variantes.map(v => (
              <button key={v.id}
                className="variante-chip"
                onClick={() => setVarianteActiva(v)}
                style={{
                  backgroundColor: varianteActiva?.id === v.id ? '#087e0b' : '#f5f5f5',
                  color: varianteActiva?.id === v.id ? 'white' : '#444',
                  borderColor: varianteActiva?.id === v.id ? '#087e0b' : '#e0e0e0',
                }}>
                {v.es_estandar && '⭐ '}{v.nombre_variante}
                <span style={{ marginLeft: '8px', opacity: 0.8, fontSize: '11px' }}>{fmt(v.costo_total)}</span>
              </button>
            ))}
            {variantes.length === 0 && (
              <p style={{ margin: 0, color: '#bbb', fontSize: '13px' }}>Sin variantes registradas. Agrega una para comenzar.</p>
            )}
          </div>
        </div>

        {/* CONTENIDO VARIANTE ACTIVA */}
        {varianteActiva && (
          <>
            {/* TABS DE SECCIONES */}
            <div className="tabs-scroll" style={{ display: 'flex', gap: '8px', marginBottom: '16px', overflowX: 'auto', paddingBottom: '4px' }}>
              {([
                ['acero', '🔩 Cortes de Acero', aceros.length],
                ['melamina', '🪵 Cortes de Melamina', melaminas.length],
                ['accesorios_insumos', '🔧 Accesorios e Insumos', accesorios.length + insumos.length],
                ['uniones', '⚙️ Uniones', uniones.length],
                ['resumen', '📊 Resumen de Costos', null],
              ] as [TabActiva, string, number | null][]).map(([id, label, count]) => (
                <button key={id}
                  className={`tab-seccion ${tabActiva === id ? 'tab-seccion-active' : 'tab-seccion-inactive'}`}
                  onClick={() => setTabActiva(id)}>
                  {label}{count !== null ? ` (${count})` : ''}
                </button>
              ))}
            </div>

            {loadingDatos ? (
              <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '60px', textAlign: 'center', color: '#888', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                Cargando datos...
              </div>
            ) : (
              <div style={{ backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflow: 'hidden' }}>

                {/* ── TAB: ACERO ─────────────────────────────────────────── */}
                {tabActiva === 'acero' && (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', borderBottom: '1px solid #f0f0f0' }}>
                      <div>
                        <h3 style={{ margin: '0 0 2px', fontSize: '16px' }}>🔩 Cortes de Acero</h3>
                        <p style={{ margin: 0, fontSize: '12px', color: '#888' }}>Tubos y perfiles. Costo: longitud × cant / 600 × precio</p>
                      </div>
                      {esAdmin && <button className="btn-nueva" onClick={() => setModalAcero(true)}>＋ Agregar corte</button>}
                    </div>
                    {aceros.length === 0 ? (
                      <div style={{ padding: '50px', textAlign: 'center', color: '#bbb' }}>
                        <div style={{ fontSize: '32px', marginBottom: '8px' }}>🔩</div>
                        <p style={{ margin: 0 }}>Sin cortes de acero registrados.</p>
                      </div>
                    ) : (
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr>
                              {['Código', 'Descripción', 'Longitud (cm)', 'Cantidad', 'Costo Unit.', 'Costo Total', ''].map(h => (
                                <th key={h} style={thStyle}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {aceros.map((a, i) => (
                              <tr key={a.id} className="fila-tabla" style={{ backgroundColor: i % 2 === 0 ? 'white' : '#fafafa' }}>
                                <td style={{ ...tdStyle, fontWeight: '600', color: '#087e0b' }}>{a.codigo_acero}</td>
                                <td style={tdStyle}>{a.descripcion || <span style={{ color: '#bbb' }}>—</span>}</td>
                                <td style={{ ...tdStyle, textAlign: 'right' }}>{fmtNum(a.longitud_cm)}</td>
                                <td style={{ ...tdStyle, textAlign: 'center' }}>{a.cantidad}</td>
                                <td style={{ ...tdStyle, textAlign: 'right', color: '#555' }}>{fmt(a.costo_unitario)}</td>
                                <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 'bold', color: '#087e0b' }}>{fmt(a.costo_total)}</td>
                                <td style={{ ...tdStyle, textAlign: 'center' }}>
                                  {esAdmin && <button className="btn-danger" onClick={() => eliminarFila('variante_acero', a.id)}>✕</button>}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr style={{ backgroundColor: '#f0fff0' }}>
                              <td colSpan={5} style={{ padding: '10px 14px', fontWeight: 'bold', fontSize: '13px', borderTop: '2px solid #087e0b' }}>Total acero</td>
                              <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 'bold', fontSize: '15px', color: '#087e0b', borderTop: '2px solid #087e0b' }}>
                                {fmt(aceros.reduce((s, a) => s + (a.costo_total || 0), 0))}
                              </td>
                              <td style={{ borderTop: '2px solid #087e0b' }}></td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}
                  </>
                )}

                {/* ── TAB: MELAMINA ──────────────────────────────────────── */}
                {tabActiva === 'melamina' && (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', borderBottom: '1px solid #f0f0f0' }}>
                      <div>
                        <h3 style={{ margin: '0 0 2px', fontSize: '16px' }}>🪵 Cortes de Melamina</h3>
                        <p style={{ margin: 0, fontSize: '12px', color: '#888' }}>Tableros. Costo: (largo/100) × (ancho/100) × cant × precio</p>
                      </div>
                      {esAdmin && <button className="btn-nueva" onClick={() => setModalMelamina(true)}>＋ Agregar corte</button>}
                    </div>
                    {melaminas.length === 0 ? (
                      <div style={{ padding: '50px', textAlign: 'center', color: '#bbb' }}>
                        <div style={{ fontSize: '32px', marginBottom: '8px' }}>🪵</div>
                        <p style={{ margin: 0 }}>Sin cortes de melamina registrados.</p>
                      </div>
                    ) : (
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr>
                              {['Código', 'Descripción', 'Largo (cm)', 'Ancho (cm)', 'Cantidad', 'Área m²', 'Costo Unit.', 'Costo Total', ''].map(h => (
                                <th key={h} style={thStyle}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {melaminas.map((m, i) => (
                              <tr key={m.id} className="fila-tabla" style={{ backgroundColor: i % 2 === 0 ? 'white' : '#fafafa' }}>
                                <td style={{ ...tdStyle, fontWeight: '600', color: '#087e0b' }}>{m.codigo_melamina}</td>
                                <td style={tdStyle}>{m.descripcion || <span style={{ color: '#bbb' }}>—</span>}</td>
                                <td style={{ ...tdStyle, textAlign: 'right' }}>{fmtNum(m.largo_cm)}</td>
                                <td style={{ ...tdStyle, textAlign: 'right' }}>{fmtNum(m.ancho_cm)}</td>
                                <td style={{ ...tdStyle, textAlign: 'center' }}>{m.cantidad}</td>
                                <td style={{ ...tdStyle, textAlign: 'right', color: '#666', fontSize: '12px' }}>
                                  {((m.largo_cm / 100) * (m.ancho_cm / 100) * m.cantidad).toFixed(4)}
                                </td>
                                <td style={{ ...tdStyle, textAlign: 'right', color: '#555' }}>{fmt(m.costo_unitario)}</td>
                                <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 'bold', color: '#087e0b' }}>{fmt(m.costo_total)}</td>
                                <td style={{ ...tdStyle, textAlign: 'center' }}>
                                  {esAdmin && <button className="btn-danger" onClick={() => eliminarFila('variante_melamina', m.id)}>✕</button>}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr style={{ backgroundColor: '#f0fff0' }}>
                              <td colSpan={7} style={{ padding: '10px 14px', fontWeight: 'bold', fontSize: '13px', borderTop: '2px solid #087e0b' }}>Total melamina</td>
                              <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 'bold', fontSize: '15px', color: '#087e0b', borderTop: '2px solid #087e0b' }}>
                                {fmt(melaminas.reduce((s, m) => s + (m.costo_total || 0), 0))}
                              </td>
                              <td style={{ borderTop: '2px solid #087e0b' }}></td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}
                  </>
                )}

                {/* ── TAB: ACCESORIOS E INSUMOS ──────────────────────────── */}
                {tabActiva === 'accesorios_insumos' && (
                  <>
                    {/* ACCESORIOS */}
                    <div style={{ borderBottom: '1px solid #f0f0f0' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', borderBottom: '1px solid #f5f5f5' }}>
                        <div>
                          <h3 style={{ margin: '0 0 2px', fontSize: '16px' }}>🔧 Accesorios</h3>
                          <p style={{ margin: 0, fontSize: '12px', color: '#888' }}>Tornillos, patas, ruedas, bisagras, etc.</p>
                        </div>
                        {esAdmin && <button className="btn-nueva" onClick={() => setModalAccesorio(true)}>＋ Agregar accesorio</button>}
                      </div>
                      {accesorios.length === 0 ? (
                        <div style={{ padding: '30px', textAlign: 'center', color: '#bbb' }}>Sin accesorios registrados.</div>
                      ) : (
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                              <tr>{['Código', 'Descripción', 'Cantidad', 'Costo Unit.', 'Costo Total', ''].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr>
                            </thead>
                            <tbody>
                              {accesorios.map((a, i) => (
                                <tr key={a.id} className="fila-tabla" style={{ backgroundColor: i % 2 === 0 ? 'white' : '#fafafa' }}>
                                  <td style={{ ...tdStyle, fontWeight: '600', color: '#087e0b' }}>{a.codigo_accesorio}</td>
                                  <td style={tdStyle}>{a.descripcion || <span style={{ color: '#bbb' }}>—</span>}</td>
                                  <td style={{ ...tdStyle, textAlign: 'center' }}>{a.cantidad}</td>
                                  <td style={{ ...tdStyle, textAlign: 'right', color: '#555' }}>{fmt(a.costo_unitario)}</td>
                                  <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 'bold', color: '#087e0b' }}>{fmt(a.costo_total)}</td>
                                  <td style={{ ...tdStyle, textAlign: 'center' }}>
                                    {esAdmin && <button className="btn-danger" onClick={() => eliminarFila('variante_accesorios', a.id)}>✕</button>}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    {/* INSUMOS */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', borderBottom: '1px solid #f5f5f5' }}>
                        <div>
                          <h3 style={{ margin: '0 0 2px', fontSize: '16px' }}>🧴 Insumos</h3>
                          <p style={{ margin: 0, fontSize: '12px', color: '#888' }}>Pintura, thinner, soldadura, etc.</p>
                        </div>
                        {esAdmin && <button className="btn-nueva" onClick={() => setModalInsumo(true)}>＋ Agregar insumo</button>}
                      </div>
                      {insumos.length === 0 ? (
                        <div style={{ padding: '30px', textAlign: 'center', color: '#bbb' }}>Sin insumos registrados.</div>
                      ) : (
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                              <tr>{['Código', 'Descripción', 'Cantidad', 'Costo Unit.', 'Costo Total', ''].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr>
                            </thead>
                            <tbody>
                              {insumos.map((ins, i) => (
                                <tr key={ins.id} className="fila-tabla" style={{ backgroundColor: i % 2 === 0 ? 'white' : '#fafafa' }}>
                                  <td style={{ ...tdStyle, fontWeight: '600', color: '#087e0b' }}>{ins.codigo_insumo}</td>
                                  <td style={tdStyle}>{ins.descripcion || <span style={{ color: '#bbb' }}>—</span>}</td>
                                  <td style={{ ...tdStyle, textAlign: 'center' }}>{ins.cantidad}</td>
                                  <td style={{ ...tdStyle, textAlign: 'right', color: '#555' }}>{fmt(ins.costo_unitario)}</td>
                                  <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 'bold', color: '#087e0b' }}>{fmt(ins.costo_total)}</td>
                                  <td style={{ ...tdStyle, textAlign: 'center' }}>
                                    {esAdmin && <button className="btn-danger" onClick={() => eliminarFila('variante_insumos', ins.id)}>✕</button>}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    {/* TOTAL COMBINADO */}
                    <div style={{ backgroundColor: '#f0fff0', padding: '14px 24px', borderTop: '2px solid #087e0b', display: 'flex', justifyContent: 'flex-end', gap: '32px' }}>
                      <span style={{ fontSize: '13px', color: '#555' }}>Accesorios: <strong style={{ color: '#087e0b' }}>{fmt(accesorios.reduce((s, a) => s + (a.costo_total || 0), 0))}</strong></span>
                      <span style={{ fontSize: '13px', color: '#555' }}>Insumos: <strong style={{ color: '#087e0b' }}>{fmt(insumos.reduce((s, i) => s + (i.costo_total || 0), 0))}</strong></span>
                    </div>
                  </>
                )}

                {/* ── TAB: UNIONES ──────────────────────────────────────── */}
                {tabActiva === 'uniones' && (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', borderBottom: '1px solid #f0f0f0' }}>
                      <div>
                        <h3 style={{ margin: '0 0 2px', fontSize: '16px' }}>⚙️ Uniones / Soldadura</h3>
                        <p style={{ margin: 0, fontSize: '12px', color: '#888' }}>Puntos de soldadura, uniones especiales.</p>
                      </div>
                      {esAdmin && <button className="btn-nueva" onClick={() => setModalUnion(true)}>＋ Agregar unión</button>}
                    </div>
                    {uniones.length === 0 ? (
                      <div style={{ padding: '50px', textAlign: 'center', color: '#bbb' }}>
                        <div style={{ fontSize: '32px', marginBottom: '8px' }}>⚙️</div>
                        <p style={{ margin: 0 }}>Sin uniones registradas.</p>
                      </div>
                    ) : (
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr>{['Código', 'Descripción', 'Cantidad', 'Costo Unit.', 'Costo Total', ''].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr>
                          </thead>
                          <tbody>
                            {uniones.map((u, i) => (
                              <tr key={u.id} className="fila-tabla" style={{ backgroundColor: i % 2 === 0 ? 'white' : '#fafafa' }}>
                                <td style={{ ...tdStyle, fontWeight: '600', color: '#087e0b' }}>{u.codigo_union}</td>
                                <td style={tdStyle}>{u.descripcion || <span style={{ color: '#bbb' }}>—</span>}</td>
                                <td style={{ ...tdStyle, textAlign: 'center' }}>{u.cantidad}</td>
                                <td style={{ ...tdStyle, textAlign: 'right', color: '#555' }}>{fmt(u.costo_unitario)}</td>
                                <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 'bold', color: '#087e0b' }}>{fmt(u.costo_total)}</td>
                                <td style={{ ...tdStyle, textAlign: 'center' }}>
                                  {esAdmin && <button className="btn-danger" onClick={() => eliminarFila('variante_uniones', u.id)}>✕</button>}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr style={{ backgroundColor: '#f0fff0' }}>
                              <td colSpan={4} style={{ padding: '10px 14px', fontWeight: 'bold', fontSize: '13px', borderTop: '2px solid #087e0b' }}>Total uniones</td>
                              <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 'bold', fontSize: '15px', color: '#087e0b', borderTop: '2px solid #087e0b' }}>
                                {fmt(uniones.reduce((s, u) => s + (u.costo_total || 0), 0))}
                              </td>
                              <td style={{ borderTop: '2px solid #087e0b' }}></td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}
                  </>
                )}

                {/* ── TAB: RESUMEN ──────────────────────────────────────── */}
                {tabActiva === 'resumen' && varianteActiva && (
                  <div style={{ padding: '28px' }}>
                    <h3 style={{ margin: '0 0 20px', fontSize: '16px', color: '#333' }}>📊 Resumen de Costos — {varianteActiva.nombre_variante}</h3>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '14px', marginBottom: '24px' }}>
                      {([
                        ['🔩 Acero', varianteActiva.costo_acero, '#e3f2fd', '#1565c0'],
                        ['🪵 Melamina', varianteActiva.costo_melamina, '#f3e5f5', '#6a1b9a'],
                        ['🔧 Accesorios', varianteActiva.costo_accesorios, '#fff8e1', '#f57f17'],
                        ['🧴 Insumos', varianteActiva.costo_insumos, '#fce4ec', '#c62828'],
                        ['⚙️ Uniones', varianteActiva.costo_uniones, '#e8f5e9', '#2e7d32'],
                      ] as [string, number, string, string][]).map(([label, val, bg, color]) => (
                        <div key={label} style={{ backgroundColor: bg, borderRadius: '12px', padding: '16px 20px' }}>
                          <p style={{ margin: '0 0 4px', fontSize: '13px', color: '#555' }}>{label}</p>
                          <p style={{ margin: 0, fontSize: '18px', fontWeight: 'bold', color }}>{fmt(val)}</p>
                          {totalVariante > 0 && (
                            <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#888' }}>
                              {((val / totalVariante) * 100).toFixed(1)}% del total
                            </p>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Barra de composición */}
                    {totalVariante > 0 && (
                      <div style={{ marginBottom: '24px' }}>
                        <p style={{ margin: '0 0 8px', fontSize: '12px', color: '#888', fontWeight: '600', textTransform: 'uppercase' }}>Composición del costo</p>
                        <div style={{ display: 'flex', height: '20px', borderRadius: '10px', overflow: 'hidden', gap: '2px' }}>
                          {([
                            [varianteActiva.costo_acero, '#1565c0'],
                            [varianteActiva.costo_melamina, '#6a1b9a'],
                            [varianteActiva.costo_accesorios, '#f57f17'],
                            [varianteActiva.costo_insumos, '#c62828'],
                            [varianteActiva.costo_uniones, '#2e7d32'],
                          ] as [number, string][]).map(([val, color], i) => (
                            val > 0 && <div key={i} style={{ flex: val / totalVariante, backgroundColor: color, minWidth: '4px' }} title={fmt(val)} />
                          ))}
                        </div>
                        <div style={{ display: 'flex', gap: '16px', marginTop: '8px', flexWrap: 'wrap' }}>
                          {(['Acero', 'Melamina', 'Accesorios', 'Insumos', 'Uniones'] as const).map((label, i) => {
                            const colors = ['#1565c0', '#6a1b9a', '#f57f17', '#c62828', '#2e7d32']
                            return <span key={label} style={{ fontSize: '11px', color: '#666', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: colors[i], display: 'inline-block' }}></span>
                              {label}
                            </span>
                          })}
                        </div>
                      </div>
                    )}

                    {/* Costo total y margen */}
                    <div style={{ backgroundColor: '#f0fff0', border: '2px solid #087e0b', borderRadius: '12px', padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                      <div>
                        <p style={{ margin: '0 0 4px', fontSize: '12px', color: '#555', textTransform: 'uppercase', fontWeight: '600' }}>Costo total de producción</p>
                        <p style={{ margin: 0, fontSize: '28px', fontWeight: 'bold', color: '#087e0b' }}>{fmt(varianteActiva.costo_total)}</p>
                      </div>
                      {producto?.precio_tienda && varianteActiva.costo_total > 0 && (
                        <div style={{ textAlign: 'right' }}>
                          <p style={{ margin: '0 0 4px', fontSize: '12px', color: '#555', textTransform: 'uppercase', fontWeight: '600' }}>Margen sobre precio tienda</p>
                          <p style={{ margin: 0, fontSize: '22px', fontWeight: 'bold', color: '#1565c0' }}>
                            {(((producto.precio_tienda - varianteActiva.costo_total) / varianteActiva.costo_total) * 100).toFixed(1)}%
                          </p>
                          <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#888' }}>Ganancia: {fmt(producto.precio_tienda - varianteActiva.costo_total)}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

              </div>
            )}
          </>
        )}
      </div>

      {/* ════════════════════ MODALES ════════════════════════════════════════ */}

      {/* Modal Agregar Acero */}
      {modalAcero && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ backgroundColor: 'white', borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '480px', boxShadow: '0 8px 40px rgba(0,0,0,0.2)' }}>
            <h3 style={{ margin: '0 0 20px', fontSize: '17px' }}>🔩 Agregar corte de acero</h3>
            <div className="grid-modal" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={labelStyle}>Tipo de acero *</label>
                <select value={fAcero.codigo_acero} onChange={e => setFAcero(f => ({ ...f, codigo_acero: e.target.value }))} style={inputStyle}>
                  <option value="">Seleccionar...</option>
                  {masterAceros.map(a => <option key={a.codigo_acero} value={a.codigo_acero}>{a.codigo_acero} — {a.detalle}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={labelStyle}>Descripción (pieza)</label>
                <input type="text" placeholder="Ej: Pata delantera izquierda" value={fAcero.descripcion} onChange={e => setFAcero(f => ({ ...f, descripcion: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Longitud (cm) *</label>
                <input type="number" step="0.01" value={fAcero.longitud_cm} onChange={e => setFAcero(f => ({ ...f, longitud_cm: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Cantidad *</label>
                <input type="number" step="0.01" value={fAcero.cantidad} onChange={e => setFAcero(f => ({ ...f, cantidad: e.target.value }))} style={inputStyle} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button className="btn-secondary" onClick={() => setModalAcero(false)}>Cancelar</button>
              <button className="btn-primary" onClick={agregarAcero} disabled={guardando}>{guardando ? 'Guardando...' : 'Agregar'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Agregar Melamina */}
      {modalMelamina && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ backgroundColor: 'white', borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '500px', boxShadow: '0 8px 40px rgba(0,0,0,0.2)' }}>
            <h3 style={{ margin: '0 0 20px', fontSize: '17px' }}>🪵 Agregar corte de melamina</h3>
            <div className="grid-modal" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={labelStyle}>Tipo de melamina *</label>
                <select value={fMelamina.codigo_melamina} onChange={e => setFMelamina(f => ({ ...f, codigo_melamina: e.target.value }))} style={inputStyle}>
                  <option value="">Seleccionar...</option>
                  {masterMelaminas.map(m => <option key={m.codigo_melamina} value={m.codigo_melamina}>{m.codigo_melamina} — {m.detalle}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={labelStyle}>Descripción (pieza)</label>
                <input type="text" placeholder="Ej: Tabla superior" value={fMelamina.descripcion} onChange={e => setFMelamina(f => ({ ...f, descripcion: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Largo (cm) *</label>
                <input type="number" step="0.01" value={fMelamina.largo_cm} onChange={e => setFMelamina(f => ({ ...f, largo_cm: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Ancho (cm) *</label>
                <input type="number" step="0.01" value={fMelamina.ancho_cm} onChange={e => setFMelamina(f => ({ ...f, ancho_cm: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Cantidad *</label>
                <input type="number" step="0.01" value={fMelamina.cantidad} onChange={e => setFMelamina(f => ({ ...f, cantidad: e.target.value }))} style={inputStyle} />
              </div>
              {fMelamina.largo_cm && fMelamina.ancho_cm && fMelamina.cantidad && (
                <div style={{ backgroundColor: '#e8f5e9', borderRadius: '8px', padding: '10px', display: 'flex', alignItems: 'center' }}>
                  <p style={{ margin: 0, fontSize: '12px', color: '#2e7d32' }}>
                    Área: <strong>{((parseFloat(fMelamina.largo_cm) / 100) * (parseFloat(fMelamina.ancho_cm) / 100) * parseFloat(fMelamina.cantidad)).toFixed(4)} m²</strong>
                  </p>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button className="btn-secondary" onClick={() => setModalMelamina(false)}>Cancelar</button>
              <button className="btn-primary" onClick={agregarMelamina} disabled={guardando}>{guardando ? 'Guardando...' : 'Agregar'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Agregar Accesorio */}
      {modalAccesorio && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ backgroundColor: 'white', borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '460px', boxShadow: '0 8px 40px rgba(0,0,0,0.2)' }}>
            <h3 style={{ margin: '0 0 20px', fontSize: '17px' }}>🔧 Agregar accesorio</h3>
            <div style={{ display: 'grid', gap: '14px' }}>
              <div>
                <label style={labelStyle}>Accesorio *</label>
                <select value={fAccesorio.codigo_accesorio} onChange={e => setFAccesorio(f => ({ ...f, codigo_accesorio: e.target.value }))} style={inputStyle}>
                  <option value="">Seleccionar...</option>
                  {masterAccesorios.map(a => <option key={a.codigo_accesorio} value={a.codigo_accesorio}>{a.codigo_accesorio} — {a.detalle}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Descripción</label>
                <input type="text" placeholder="Ej: Tornillo 1/4 pulgada" value={fAccesorio.descripcion} onChange={e => setFAccesorio(f => ({ ...f, descripcion: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Cantidad *</label>
                <input type="number" step="0.01" value={fAccesorio.cantidad} onChange={e => setFAccesorio(f => ({ ...f, cantidad: e.target.value }))} style={inputStyle} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button className="btn-secondary" onClick={() => setModalAccesorio(false)}>Cancelar</button>
              <button className="btn-primary" onClick={agregarAccesorio} disabled={guardando}>{guardando ? 'Guardando...' : 'Agregar'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Agregar Insumo */}
      {modalInsumo && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ backgroundColor: 'white', borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '460px', boxShadow: '0 8px 40px rgba(0,0,0,0.2)' }}>
            <h3 style={{ margin: '0 0 20px', fontSize: '17px' }}>🧴 Agregar insumo</h3>
            <div style={{ display: 'grid', gap: '14px' }}>
              <div>
                <label style={labelStyle}>Insumo *</label>
                <select value={fInsumo.codigo_insumo} onChange={e => setFInsumo(f => ({ ...f, codigo_insumo: e.target.value }))} style={inputStyle}>
                  <option value="">Seleccionar...</option>
                  {masterInsumos.map(i => <option key={i.codigo_insumos} value={i.codigo_insumos}>{i.codigo_insumos} — {i.detalle}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Descripción</label>
                <input type="text" placeholder="Ej: Pintura base gris" value={fInsumo.descripcion} onChange={e => setFInsumo(f => ({ ...f, descripcion: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Cantidad *</label>
                <input type="number" step="0.01" value={fInsumo.cantidad} onChange={e => setFInsumo(f => ({ ...f, cantidad: e.target.value }))} style={inputStyle} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button className="btn-secondary" onClick={() => setModalInsumo(false)}>Cancelar</button>
              <button className="btn-primary" onClick={agregarInsumo} disabled={guardando}>{guardando ? 'Guardando...' : 'Agregar'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Agregar Union */}
      {modalUnion && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ backgroundColor: 'white', borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '460px', boxShadow: '0 8px 40px rgba(0,0,0,0.2)' }}>
            <h3 style={{ margin: '0 0 20px', fontSize: '17px' }}>⚙️ Agregar unión / soldadura</h3>
            <div style={{ display: 'grid', gap: '14px' }}>
              <div>
                <label style={labelStyle}>Tipo de unión *</label>
                <select value={fUnion.codigo_union} onChange={e => setFUnion(f => ({ ...f, codigo_union: e.target.value }))} style={inputStyle}>
                  <option value="">Seleccionar...</option>
                  {masterUniones.map(u => <option key={u.codigo_union} value={u.codigo_union}>{u.codigo_union} — {u.detalle}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Descripción</label>
                <input type="text" placeholder="Ej: Punto de soldadura esquina" value={fUnion.descripcion} onChange={e => setFUnion(f => ({ ...f, descripcion: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Cantidad *</label>
                <input type="number" step="0.01" value={fUnion.cantidad} onChange={e => setFUnion(f => ({ ...f, cantidad: e.target.value }))} style={inputStyle} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button className="btn-secondary" onClick={() => setModalUnion(false)}>Cancelar</button>
              <button className="btn-primary" onClick={agregarUnion} disabled={guardando}>{guardando ? 'Guardando...' : 'Agregar'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Nueva Variante */}
      {modalVariante && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ backgroundColor: 'white', borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '460px', boxShadow: '0 8px 40px rgba(0,0,0,0.2)' }}>
            <h3 style={{ margin: '0 0 20px', fontSize: '17px' }}>🎨 Nueva variante</h3>
            <div style={{ display: 'grid', gap: '14px' }}>
              <div>
                <label style={labelStyle}>Nombre de la variante *</label>
                <input type="text" placeholder="Ej: Negro / Blanco" value={fVariante.nombre_variante} onChange={e => setFVariante(f => ({ ...f, nombre_variante: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Color estructura</label>
                <select value={fVariante.codigo_color} onChange={e => setFVariante(f => ({ ...f, codigo_color: e.target.value }))} style={inputStyle}>
                  <option value="">Sin especificar</option>
                  {masterAceros.map(a => <option key={a.codigo_acero} value={a.codigo_acero}>{a.codigo_acero}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Color melamina</label>
                <select value={fVariante.codigo_melamina} onChange={e => setFVariante(f => ({ ...f, codigo_melamina: e.target.value }))} style={inputStyle}>
                  <option value="">Sin especificar</option>
                  {masterMelaminas.map(m => <option key={m.codigo_melamina} value={m.codigo_melamina}>{m.codigo_melamina} — {m.detalle}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <input type="checkbox" id="es_estandar" checked={fVariante.es_estandar} onChange={e => setFVariante(f => ({ ...f, es_estandar: e.target.checked }))} />
                <label htmlFor="es_estandar" style={{ fontSize: '13px', color: '#444', cursor: 'pointer' }}>⭐ Variante estándar del producto</label>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button className="btn-secondary" onClick={() => setModalVariante(false)}>Cancelar</button>
              <button className="btn-primary" onClick={agregarVariante} disabled={guardando}>{guardando ? 'Guardando...' : 'Crear variante'}</button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
