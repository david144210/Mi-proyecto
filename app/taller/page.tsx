'use client'
import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'

// ── Tipos ─────────────────────────────────────────────────────────────────────
// Mismo shape que ItemPlanificacion en planificacion.tsx (misma columna en Supabase:
// lotes_produccion.materiales_planificados). No se declaran campos de costo aquí:
// aunque los objetos reales de piezas_desglose puedan traer costo_unitario/costo_total
// (vienen de un spread de las tablas variante_*), esta página nunca los lee ni los pinta.
interface PiezaDesglose {
  tipo: string
  descripcion: string
  cantidad: number
  largo_cm?: number
  ancho_cm?: number
  longitud_cm?: number
  [extra: string]: any // pueden venir campos de costo que deliberadamente ignoramos
}

interface ItemPlanificacion {
  id_temp: string
  tipo_origen: 'venta' | 'stock' | 'especial'
  referencia_id: string | number
  titulo: string
  cliente_o_destino: string
  cantidad: number
  taller_destino: string
  detalles: any[]
  piezas_desglose: PiezaDesglose[]
}

interface TrabajoTaller extends ItemPlanificacion {
  nombre_lote: string
  estado_workflow: string
}

interface VarianteConPlano {
  id: number
  nombre_variante: string
  plano_pdf_url: string | null
  etiqueta: string // texto para mostrar en el botón (nombre del producto)
}

// ── Visor de PDF (mismo motor que en la página de Detalles Constructivos) ──────
const BUCKET_PLANOS = 'planos-constructivos'
const PDFJS_VERSION = '3.11.174'
const PDFJS_BASE = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}`

let pdfjsCargaPromise: Promise<any> | null = null
function cargarPdfJs(): Promise<any> {
  if (typeof window === 'undefined') return Promise.reject('no-window')
  const w = window as any
  if (w['pdfjs-dist/build/pdf']) return Promise.resolve(w['pdfjs-dist/build/pdf'])
  if (pdfjsCargaPromise) return pdfjsCargaPromise
  pdfjsCargaPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = `${PDFJS_BASE}/pdf.min.js`
    script.onload = () => {
      const pdfjsLib = (window as any)['pdfjs-dist/build/pdf']
      if (!pdfjsLib) { reject(new Error('pdfjsLib no se cargó correctamente')); return }
      pdfjsLib.GlobalWorkerOptions.workerSrc = `${PDFJS_BASE}/pdf.worker.min.js`
      resolve(pdfjsLib)
    }
    script.onerror = () => reject(new Error('No se pudo cargar PDF.js desde el CDN'))
    document.head.appendChild(script)
  })
  return pdfjsCargaPromise
}

const iconoTipo = (t: ItemPlanificacion['tipo_origen']) =>
  t === 'venta' ? '🛒' : t === 'stock' ? '📦' : '✨'

const colorEstado = (estado: string) => {
  if (estado === 'aprobado') return { bg: '#e8f5e9', fg: '#2e7d32' }
  if (estado === 'en_compras' || estado === 'revision_taller') return { bg: '#fff8e1', fg: '#f57f17' }
  return { bg: '#eef2f7', fg: '#455a64' }
}

export default function TallerPage() {
  const [usuario, setUsuario] = useState<any>(null)
  const [esAdmin, setEsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)

  const [talleres, setTalleres] = useState<string[]>([])
  const [tallerSeleccionado, setTallerSeleccionado] = useState('')
  const [fecha, setFecha] = useState(() => new Date().toISOString().split('T')[0])

  const [trabajos, setTrabajos] = useState<TrabajoTaller[]>([])
  const [cargandoTrabajos, setCargandoTrabajos] = useState(false)
  const [expandido, setExpandido] = useState<Record<string, boolean>>({})
  const [variantesPorTrabajo, setVariantesPorTrabajo] = useState<Record<string, VarianteConPlano[]>>({})
  const [buscandoVariantes, setBuscandoVariantes] = useState<Record<string, boolean>>({})

  // Visor de plano
  const [modalPlano, setModalPlano] = useState(false)
  const [cargandoPlano, setCargandoPlano] = useState(false)
  const [errorPlano, setErrorPlano] = useState('')
  const [tituloPlano, setTituloPlano] = useState('')
  const planoContainerRef = useRef<HTMLDivElement>(null)

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
        // Ajusta esta condición si tienes un permiso específico para taller
        // (ej. data.cargos?.puede_ver_taller). Por defecto reutiliza el mismo
        // permiso que ya usas para Detalles Constructivos.
        if (!admin && !produccion) { window.location.replace('/sistema'); return }
        cargarTalleres()
      })
  }, [])

  const cargarTalleres = async () => {
    const { data } = await supabase.from('sucursales').select('nombre').order('nombre')
    const lista = (data || []).map((s: any) => s.nombre).filter(Boolean)
    setTalleres(lista)
    // El dispositivo suele ser compartido en el taller: recordamos la última
    // selección en este navegador para no tener que elegirla cada vez.
    const guardado = typeof window !== 'undefined' ? localStorage.getItem('taller_seleccionado_kiosko') : null
    setTallerSeleccionado(guardado && lista.includes(guardado) ? guardado : (lista[0] || ''))
    setLoading(false)
  }

  useEffect(() => {
    if (tallerSeleccionado) localStorage.setItem('taller_seleccionado_kiosko', tallerSeleccionado)
  }, [tallerSeleccionado])

  useEffect(() => {
    if (usuario && tallerSeleccionado) cargarTrabajosDelDia()
  }, [usuario, tallerSeleccionado, fecha])

  const cargarTrabajosDelDia = async () => {
    setCargandoTrabajos(true)
    setExpandido({})
    try {
      const { data, error } = await supabase
        .from('lotes_produccion')
        .select('nombre_lote, estado_workflow, materiales_planificados')
        .eq('fecha', fecha)
      if (error) throw error

      const items: TrabajoTaller[] = []
      for (const lote of data || []) {
        for (const item of (lote.materiales_planificados || []) as ItemPlanificacion[]) {
          if (item.taller_destino === tallerSeleccionado) {
            items.push({ ...item, nombre_lote: lote.nombre_lote, estado_workflow: lote.estado_workflow })
          }
        }
      }
      setTrabajos(items)
    } catch (err) {
      console.error(err)
      setTrabajos([])
    } finally {
      setCargandoTrabajos(false)
    }
  }

  const toggleExpandir = (id: string) => setExpandido(prev => ({ ...prev, [id]: !prev[id] }))

  // Encuentra qué variante(s) de producto corresponden a un trabajo, para poder
  // ofrecer el botón de plano. Se resuelve bajo demanda (al expandir la tarjeta),
  // no de una vez por todos los trabajos, para no disparar consultas de más.
  const resolverVariantes = async (trabajo: TrabajoTaller) => {
    if (variantesPorTrabajo[trabajo.id_temp] || buscandoVariantes[trabajo.id_temp]) return
    setBuscandoVariantes(prev => ({ ...prev, [trabajo.id_temp]: true }))
    const resultado: VarianteConPlano[] = []
    try {
      if (trabajo.tipo_origen === 'stock' && trabajo.detalles?.[0]?.variante_id) {
        const { data } = await supabase
          .from('producto_variantes')
          .select('id, nombre_variante, plano_pdf_url, codigo_producto, productos(nombre)')
          .eq('id', trabajo.detalles[0].variante_id)
          .maybeSingle()
        if (data) resultado.push({
          id: data.id, nombre_variante: data.nombre_variante, plano_pdf_url: data.plano_pdf_url,
          etiqueta: `${(data as any).productos?.nombre || data.codigo_producto} — ${data.nombre_variante}`
        })
      } else if (trabajo.tipo_origen === 'venta' && trabajo.detalles?.length) {
        const codigos = [...new Set(trabajo.detalles.map((d: any) => d.cod_producto).filter(Boolean))]
        for (const cod of codigos) {
          const { data } = await supabase
            .from('producto_variantes')
            .select('id, nombre_variante, plano_pdf_url, codigo_producto, productos(nombre)')
            .eq('codigo_producto', cod).eq('es_estandar', true).eq('activo', true)
            .limit(1).maybeSingle()
          if (data) resultado.push({
            id: data.id, nombre_variante: data.nombre_variante, plano_pdf_url: data.plano_pdf_url,
            etiqueta: `${(data as any).productos?.nombre || data.codigo_producto} — ${data.nombre_variante}`
          })
        }
      }
    } catch (err) {
      console.error(err)
    } finally {
      setVariantesPorTrabajo(prev => ({ ...prev, [trabajo.id_temp]: resultado }))
      setBuscandoVariantes(prev => ({ ...prev, [trabajo.id_temp]: false }))
    }
  }

  const expandirTrabajo = (trabajo: TrabajoTaller) => {
    toggleExpandir(trabajo.id_temp)
    if (!expandido[trabajo.id_temp]) resolverVariantes(trabajo)
  }

  // ── Visor de plano (idéntico en espíritu al de Detalles Constructivos: se
  // pinta a canvas, sin capa de texto ni controles nativos de descarga/impresión) ──
  const abrirPlano = async (variante: VarianteConPlano) => {
    if (!variante.plano_pdf_url) {
      alert('Esta variante todavía no tiene un plano cargado.')
      return
    }
    setTituloPlano(variante.etiqueta)
    setErrorPlano('')
    setCargandoPlano(true)
    setModalPlano(true)
    try {
      const { data, error } = await supabase.storage
        .from(BUCKET_PLANOS)
        .createSignedUrl(variante.plano_pdf_url, 300)
      if (error || !data?.signedUrl) throw error || new Error('No se pudo generar el link del plano')

      const pdfjsLib = await cargarPdfJs()
      const pdf = await pdfjsLib.getDocument(data.signedUrl).promise

      const contenedor = planoContainerRef.current
      if (!contenedor) return
      contenedor.innerHTML = ''

      for (let numPagina = 1; numPagina <= pdf.numPages; numPagina++) {
        const pagina = await pdf.getPage(numPagina)
        const anchoDisponible = Math.min(contenedor.clientWidth || 360, 900)
        const viewportBase = pagina.getViewport({ scale: 1 })
        const escala = anchoDisponible / viewportBase.width
        const viewport = pagina.getViewport({ scale: escala })

        const canvas = document.createElement('canvas')
        canvas.width = viewport.width
        canvas.height = viewport.height
        canvas.style.display = 'block'
        canvas.style.margin = '0 auto 16px'
        canvas.style.boxShadow = '0 2px 10px rgba(0,0,0,0.25)'
        canvas.style.borderRadius = '4px'
        const ctx = canvas.getContext('2d')
        if (ctx) await pagina.render({ canvasContext: ctx, viewport }).promise
        contenedor.appendChild(canvas)
      }
    } catch (err: any) {
      console.error(err)
      setErrorPlano('No se pudo cargar el plano. ' + (err?.message || ''))
    } finally {
      setCargandoPlano(false)
    }
  }

  const cerrarPlano = () => {
    setModalPlano(false)
    setErrorPlano('')
    if (planoContainerRef.current) planoContainerRef.current.innerHTML = ''
  }

  // Bloqueo best-effort de impresión mientras el plano está abierto (no-admin).
  useEffect(() => {
    if (!modalPlano || esAdmin) return
    const bloquear = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P')) e.preventDefault()
    }
    window.addEventListener('keydown', bloquear)
    return () => window.removeEventListener('keydown', bloquear)
  }, [modalPlano, esAdmin])

  if (loading) return <p style={{ textAlign: 'center', marginTop: '100px', fontFamily: 'Arial' }}>Cargando...</p>

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', minHeight: '100vh', backgroundColor: '#f5f5f5', paddingBottom: '40px' }}>
      <style>{`
        @media print { .plano-modal-overlay { display: none !important; } }
        .trabajo-card { transition: box-shadow 0.15s; }
        .trabajo-card:active { box-shadow: 0 1px 4px rgba(0,0,0,0.15) !important; }
        input[type="date"] { font-family: Arial, sans-serif; }
      `}</style>

      {/* NAVBAR — compacta para celular */}
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', backgroundColor: '#222', color: 'white', position: 'sticky', top: 0, zIndex: 100 }}>
        <a href="/" style={{ fontWeight: 'bold', fontSize: '15px', color: 'white', textDecoration: 'none' }}>Muebles is Better</a>
        <a href="/sistema" style={{ color: '#a3c47d', fontSize: '12px', textDecoration: 'none' }}>← Sistema</a>
      </nav>

      {/* Selector de taller + fecha — grande, pensado para dedos */}
      <div style={{ padding: '16px', backgroundColor: 'white', borderBottom: '1px solid #eee', position: 'sticky', top: '48px', zIndex: 90 }}>
        <label style={{ display: 'block', fontSize: '11px', color: '#888', marginBottom: '4px', fontWeight: 'bold', textTransform: 'uppercase' }}>Taller</label>
        <select
          value={tallerSeleccionado}
          onChange={e => setTallerSeleccionado(e.target.value)}
          style={{ width: '100%', padding: '14px', fontSize: '17px', fontWeight: 'bold', borderRadius: '10px', border: '2px solid #087e0b', color: '#087e0b', backgroundColor: '#f0fff0', marginBottom: '10px' }}
        >
          {talleres.map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button onClick={() => {
            const d = new Date(fecha); d.setDate(d.getDate() - 1); setFecha(d.toISOString().split('T')[0])
          }} style={{ padding: '12px 14px', fontSize: '16px', border: '1px solid #ddd', borderRadius: '10px', background: 'white' }}>◀</button>
          <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
            style={{ flex: 1, padding: '12px', fontSize: '15px', borderRadius: '10px', border: '1px solid #ddd', textAlign: 'center' }} />
          <button onClick={() => {
            const d = new Date(fecha); d.setDate(d.getDate() + 1); setFecha(d.toISOString().split('T')[0])
          }} style={{ padding: '12px 14px', fontSize: '16px', border: '1px solid #ddd', borderRadius: '10px', background: 'white' }}>▶</button>
        </div>
        <button onClick={() => setFecha(new Date().toISOString().split('T')[0])}
          style={{ marginTop: '8px', width: '100%', padding: '8px', fontSize: '13px', border: 'none', borderRadius: '8px', background: '#eef2f7', color: '#455a64' }}>
          📅 Hoy
        </button>
      </div>

      {/* Lista de trabajos del día */}
      <div style={{ padding: '16px' }}>
        <p style={{ margin: '0 0 12px', fontSize: '13px', color: '#666', fontWeight: 'bold' }}>
          {cargandoTrabajos ? 'Cargando...' : `${trabajos.length} trabajo${trabajos.length === 1 ? '' : 's'} para ${tallerSeleccionado || '—'}`}
        </p>

        {!cargandoTrabajos && trabajos.length === 0 && (
          <div style={{ textAlign: 'center', padding: '50px 20px', color: '#bbb', border: '2px dashed #ddd', borderRadius: '14px' }}>
            <p style={{ fontSize: '32px', margin: '0 0 8px' }}>🗓️</p>
            <p style={{ margin: 0 }}>No hay trabajos planificados para este taller en esta fecha.</p>
          </div>
        )}

        {trabajos.map(trabajo => {
          const abierto = !!expandido[trabajo.id_temp]
          const estadoColor = colorEstado(trabajo.estado_workflow)
          const variantesTrabajo = variantesPorTrabajo[trabajo.id_temp] || []
          return (
            <div key={trabajo.id_temp} className="trabajo-card"
              style={{ backgroundColor: 'white', borderRadius: '14px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflow: 'hidden' }}>

              <div onClick={() => expandirTrabajo(trabajo)}
                style={{ padding: '16px', cursor: 'pointer', display: 'flex', gap: '12px', alignItems: 'center' }}>
                <div style={{ fontSize: '26px', flexShrink: 0 }}>{iconoTipo(trabajo.tipo_origen)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: '0 0 3px', fontSize: '15px', fontWeight: 'bold', color: '#222', lineHeight: 1.25 }}>{trabajo.titulo}</p>
                  <p style={{ margin: 0, fontSize: '12px', color: '#888' }}>{trabajo.cliente_o_destino} · Cant: {trabajo.cantidad}</p>
                  <div style={{ display: 'flex', gap: '6px', marginTop: '6px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '10px', backgroundColor: estadoColor.bg, color: estadoColor.fg, fontWeight: 'bold' }}>
                      {trabajo.estado_workflow}
                    </span>
                    <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '10px', backgroundColor: '#f0f0f0', color: '#777' }}>
                      Lote: {trabajo.nombre_lote}
                    </span>
                  </div>
                </div>
                <div style={{ fontSize: '18px', color: '#bbb', flexShrink: 0 }}>{abierto ? '▲' : '▼'}</div>
              </div>

              {abierto && (
                <div style={{ borderTop: '1px solid #f0f0f0', padding: '14px 16px 18px' }}>

                  {/* Planos disponibles */}
                  <p style={{ margin: '0 0 8px', fontSize: '12px', fontWeight: 'bold', color: '#555', textTransform: 'uppercase' }}>📐 Planos</p>
                  {buscandoVariantes[trabajo.id_temp] && <p style={{ fontSize: '12px', color: '#999' }}>Buscando planos...</p>}
                  {!buscandoVariantes[trabajo.id_temp] && variantesTrabajo.length === 0 && trabajo.tipo_origen !== 'especial' && (
                    <p style={{ fontSize: '12px', color: '#bbb', fontStyle: 'italic' }}>Sin producto/variante identificable para este ítem.</p>
                  )}
                  {trabajo.tipo_origen === 'especial' && (
                    <p style={{ fontSize: '12px', color: '#bbb', fontStyle: 'italic' }}>Pedido especial: sin plano de catálogo.</p>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                    {variantesTrabajo.map(v => (
                      <button key={v.id} onClick={() => abrirPlano(v)}
                        disabled={!v.plano_pdf_url}
                        style={{
                          padding: '12px 14px', borderRadius: '10px', border: 'none', textAlign: 'left',
                          backgroundColor: v.plano_pdf_url ? '#0B1E36' : '#eee',
                          color: v.plano_pdf_url ? '#C5A059' : '#999',
                          fontSize: '13px', fontWeight: 'bold', cursor: v.plano_pdf_url ? 'pointer' : 'not-allowed'
                        }}>
                        {v.plano_pdf_url ? '📐 Ver plano' : '📐 Sin plano'} — {v.etiqueta}
                      </button>
                    ))}
                  </div>

                  {/* Detalles constructivos (piezas) — sin ningún monto */}
                  <p style={{ margin: '0 0 8px', fontSize: '12px', fontWeight: 'bold', color: '#555', textTransform: 'uppercase' }}>🔧 Detalles constructivos</p>
                  {(!trabajo.piezas_desglose || trabajo.piezas_desglose.length === 0) ? (
                    <p style={{ fontSize: '12px', color: '#bbb', fontStyle: 'italic' }}>Sin piezas registradas.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {trabajo.piezas_desglose.map((pieza, i) => {
                        const medida = pieza.largo_cm && pieza.ancho_cm
                          ? `${pieza.largo_cm} × ${pieza.ancho_cm} cm`
                          : pieza.longitud_cm ? `${pieza.longitud_cm} cm` : null
                        return (
                          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', padding: '8px 10px', backgroundColor: '#fafafa', borderRadius: '8px', fontSize: '13px' }}>
                            <div style={{ minWidth: 0 }}>
                              <span style={{ fontWeight: 'bold', color: '#087e0b' }}>{pieza.tipo}</span>
                              <span style={{ color: '#555' }}> — {pieza.descripcion || '—'}</span>
                              {medida && <div style={{ fontSize: '11px', color: '#999' }}>{medida}</div>}
                            </div>
                            <div style={{ fontWeight: 'bold', color: '#333', flexShrink: 0 }}>× {pieza.cantidad}</div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* MODAL VISOR DE PLANO — pantalla completa, pensado para celular */}
      {modalPlano && (
        <div className="plano-modal-overlay" onContextMenu={e => e.preventDefault()}
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(10,10,10,0.95)', zIndex: 3000, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', backgroundColor: '#111', color: 'white', flexShrink: 0 }}>
            <h3 style={{ margin: 0, fontSize: '14px', paddingRight: '10px' }}>📐 {tituloPlano}</h3>
            <button onClick={cerrarPlano} style={{ background: 'none', border: 'none', fontSize: '26px', cursor: 'pointer', color: 'white', flexShrink: 0 }}>✕</button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px', userSelect: 'none', WebkitUserSelect: 'none' }}>
            {cargandoPlano && <p style={{ color: 'white', textAlign: 'center', marginTop: '60px' }}>Cargando plano...</p>}
            {errorPlano && <p style={{ color: '#ff8080', textAlign: 'center', marginTop: '60px' }}>{errorPlano}</p>}
            <div ref={planoContainerRef} />
          </div>
          <p style={{ textAlign: 'center', color: '#888', fontSize: '10px', padding: '8px', margin: 0, backgroundColor: '#111' }}>
            Vista de solo lectura — descarga, copia e impresión deshabilitadas.
          </p>
        </div>
      )}
    </div>
  )
}
