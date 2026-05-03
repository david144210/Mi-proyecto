'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'

// ── Tipos ────────────────────────────────────────────────────────────────────
interface Venta {
  id: number
  cod_venta: number
  cod_cliente: number | null
  cod_vendedor: number | null
  fecha_pedido: string | null
  fecha_entrega: string | null
  hora_entrega: string | null
  delivery_cotizado: number | null
  delivery_pagado: number | null
  total_venta: number | null
  anticipo: number | null
  forma_pago: string | null
  cod_transaccion: string | null
  personal_cliente?: { nombre: string } | null
  personal_vendedor?: { nombre: string } | null
}

interface DetalleVenta {
  id: number
  cod_venta: number
  item: number | null
  cod_producto: string | null
  precio_cotizado: number | null
  precio_vendido: number | null
  cantidad: number | null
  subtotal: number | null
  dimensiones: string | null
  color_estructura: string | null
  color_melamina: string | null
}

interface FiltrosState {
  busqueda: string
  fecha_desde: string
  fecha_hasta: string
  forma_pago: string
  vendedor: string
}

const FORMAS_PAGO = ['', 'ANTICIPO', 'CONTRA_ENTREGA', 'EFECTIVO', 'TRANSFERENCIA']
const PAGE_SIZE = 30

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (v: number | null | undefined) =>
  v != null ? `Bs. ${Number(v).toLocaleString('es-BO', { minimumFractionDigits: 2 })}` : '—'

const fmtFecha = (v: string | null | undefined) => {
  if (!v) return '—'
  try { return new Date(v + 'T00:00:00').toLocaleDateString('es-BO', { day: '2-digit', month: '2-digit', year: 'numeric' }) }
  catch { return v }
}

const badgePago: Record<string, { bg: string; color: string }> = {
  ANTICIPO:       { bg: '#e8f5e9', color: '#2e7d32' },
  CONTRA_ENTREGA: { bg: '#fff8e1', color: '#f57f17' },
  EFECTIVO:       { bg: '#e3f2fd', color: '#1565c0' },
  TRANSFERENCIA:  { bg: '#f3e5f5', color: '#6a1b9a' },
}

export default function Ventas() {
  const [usuario, setUsuario] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  // Lista
  const [ventas, setVentas] = useState<Venta[]>([])
  const [loadingVentas, setLoadingVentas] = useState(false)
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(0)
  const [vendedores, setVendedores] = useState<{ id: number; nombre: string }[]>([])

  // Filtros
  const [filtros, setFiltros] = useState<FiltrosState>({
    busqueda: '', fecha_desde: '', fecha_hasta: '', forma_pago: '', vendedor: '',
  })

  // Modal detalle / edición
  const [ventaSel, setVentaSel] = useState<Venta | null>(null)
  const [detalle, setDetalle] = useState<DetalleVenta[]>([])
  const [loadingDetalle, setLoadingDetalle] = useState(false)
  const [modoEdicion, setModoEdicion] = useState(false)
  const [formVenta, setFormVenta] = useState<Partial<Venta>>({})
  const [formDetalle, setFormDetalle] = useState<DetalleVenta[]>([])
  const [guardando, setGuardando] = useState(false)
  const [mensajeGuardado, setMensajeGuardado] = useState('')

  // ── Auth ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const carnet = localStorage.getItem('carnet')
    if (!carnet) { window.location.replace('/'); return }
    supabase.from('personal').select('*, cargos(*)')
      .eq('carnet', carnet).eq('estado', true).single()
      .then(({ data }) => {
        if (!data) window.location.replace('/')
        else {
          setUsuario(data)
          setLoading(false)
        }
      })
  }, [])

  // ── Cargar vendedores para filtro ─────────────────────────────────────────
  useEffect(() => {
    supabase.from('personal').select('id, nombre').eq('estado', true)
      .then(({ data }) => setVendedores(data || []))
  }, [])

  // ── Permisos ──────────────────────────────────────────────────────────────
  const puedeVerVentas = usuario?.cargos?.puede_ver_cotizador || usuario?.cargos?.es_admin
  const puedeEditar    = usuario?.cargos?.es_admin

  // ── Cargar ventas ─────────────────────────────────────────────────────────
  const cargarVentas = useCallback(async (p: number, f: FiltrosState) => {
    setLoadingVentas(true)
    const from = p * PAGE_SIZE
    const to   = from + PAGE_SIZE - 1

    let query = supabase
      .from('ventas')
      .select(`
        *,
        personal_cliente:personal!ventas_cod_cliente_fkey(nombre),
        personal_vendedor:personal!ventas_cod_vendedor_fkey(nombre)
      `, { count: 'exact' })
      .order('cod_venta', { ascending: false })
      .range(from, to)

    if (f.busqueda) {
      const num = parseInt(f.busqueda)
      if (!isNaN(num)) query = query.eq('cod_venta', num)
    }
    if (f.fecha_desde) query = query.gte('fecha_pedido', f.fecha_desde)
    if (f.fecha_hasta) query = query.lte('fecha_pedido', f.fecha_hasta)
    if (f.forma_pago)  query = query.eq('forma_pago', f.forma_pago)
    if (f.vendedor)    query = query.eq('cod_vendedor', parseInt(f.vendedor))

    const { data, count, error } = await query
    if (!error) {
      setVentas(data || [])
      setTotalCount(count || 0)
    }
    setLoadingVentas(false)
  }, [])

  useEffect(() => {
    if (!loading && puedeVerVentas) cargarVentas(page, filtros)
  }, [loading, page, filtros, puedeVerVentas, cargarVentas])

  // ── Abrir detalle ─────────────────────────────────────────────────────────
  const abrirDetalle = async (v: Venta) => {
    setVentaSel(v)
    setModoEdicion(false)
    setMensajeGuardado('')
    setLoadingDetalle(true)
    const { data } = await supabase
      .from('detalle_venta')
      .select('*')
      .eq('cod_venta', v.cod_venta)
      .order('item')
    setDetalle(data || [])
    setLoadingDetalle(false)
  }

  // ── Activar edición ───────────────────────────────────────────────────────
  const activarEdicion = () => {
    if (!ventaSel) return
    setFormVenta({ ...ventaSel })
    setFormDetalle(detalle.map(d => ({ ...d })))
    setModoEdicion(true)
  }

  // ── Guardar cambios ───────────────────────────────────────────────────────
  const guardarCambios = async () => {
    if (!ventaSel || !formVenta) return
    setGuardando(true)
    setMensajeGuardado('')

    // Update cabecera venta
    const { error: eVenta } = await supabase
      .from('ventas')
      .update({
        cod_cliente:      formVenta.cod_cliente,
        cod_vendedor:     formVenta.cod_vendedor,
        fecha_pedido:     formVenta.fecha_pedido || null,
        fecha_entrega:    formVenta.fecha_entrega || null,
        hora_entrega:     formVenta.hora_entrega || null,
        delivery_cotizado: formVenta.delivery_cotizado,
        delivery_pagado:  formVenta.delivery_pagado,
        total_venta:      formVenta.total_venta,
        anticipo:         formVenta.anticipo,
        forma_pago:       formVenta.forma_pago || null,
        cod_transaccion:  formVenta.cod_transaccion || null,
      })
      .eq('cod_venta', ventaSel.cod_venta)

    if (eVenta) {
      setMensajeGuardado('❌ Error al guardar la venta: ' + eVenta.message)
      setGuardando(false)
      return
    }

    // Update cada línea de detalle
    for (const d of formDetalle) {
      const subtotal = (d.precio_vendido || 0) * (d.cantidad || 0)
      await supabase.from('detalle_venta').update({
        cod_producto:    d.cod_producto,
        precio_cotizado: d.precio_cotizado,
        precio_vendido:  d.precio_vendido,
        cantidad:        d.cantidad,
        subtotal,
        dimensiones:     d.dimensiones,
        color_estructura: d.color_estructura,
        color_melamina:  d.color_melamina,
      }).eq('id', d.id)
    }

    // Refrescar
    const { data: ventaActualizada } = await supabase
      .from('ventas')
      .select(`*, personal_cliente:personal!ventas_cod_cliente_fkey(nombre), personal_vendedor:personal!ventas_cod_vendedor_fkey(nombre)`)
      .eq('cod_venta', ventaSel.cod_venta)
      .single()

    const { data: detalleActualizado } = await supabase
      .from('detalle_venta').select('*').eq('cod_venta', ventaSel.cod_venta).order('item')

    if (ventaActualizada) {
      setVentaSel(ventaActualizada)
      setVentas(prev => prev.map(v => v.cod_venta === ventaSel.cod_venta ? ventaActualizada : v))
    }
    setDetalle(detalleActualizado || [])
    setModoEdicion(false)
    setMensajeGuardado('✅ Cambios guardados correctamente')
    setGuardando(false)
  }

  // ── Estilos reutilizables ─────────────────────────────────────────────────
  const inputStyle: React.CSSProperties = {
    padding: '8px 12px', borderRadius: '8px', border: '1px solid #ddd',
    fontSize: '13px', width: '100%', boxSizing: 'border-box', backgroundColor: 'white',
  }
  const labelStyle: React.CSSProperties = {
    fontSize: '12px', color: '#666', display: 'block', marginBottom: '4px',
  }
  const thStyle: React.CSSProperties = {
    padding: '12px 14px', textAlign: 'left', borderBottom: '2px solid #eee',
    color: '#555', fontSize: '12px', whiteSpace: 'nowrap', backgroundColor: '#f9f9f9',
  }
  const tdStyle: React.CSSProperties = {
    padding: '12px 14px', borderBottom: '1px solid #f0f0f0', fontSize: '13px',
  }

  // ── Guards ────────────────────────────────────────────────────────────────
  if (loading) return <p style={{ textAlign: 'center', marginTop: '100px' }}>Cargando...</p>

  if (!puedeVerVentas) return (
    <div style={{ fontFamily: 'Arial, sans-serif', minHeight: '100vh', backgroundColor: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', backgroundColor: 'white', borderRadius: '16px', padding: '48px', boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔒</div>
        <h2 style={{ margin: '0 0 8px' }}>Acceso restringido</h2>
        <p style={{ color: '#888', margin: '0 0 24px' }}>No tienes permisos para ver esta sección.</p>
        <a href="/sistema" style={{ backgroundColor: '#087e0b', color: 'white', padding: '10px 24px', borderRadius: '8px', textDecoration: 'none', fontSize: '14px' }}>
          Volver al sistema
        </a>
      </div>
    </div>
  )

  const totalPages = Math.ceil(totalCount / PAGE_SIZE)
  const nombreMostrar = usuario?.nombre || usuario?.carnet || 'Usuario'

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', minHeight: '100vh', backgroundColor: '#f5f5f5' }}>

      <style>{`
        @media (max-width: 768px) {
          .ventas-container { padding: 16px !important; }
          .filtros-grid { grid-template-columns: 1fr 1fr !important; }
          .tabla-wrap { font-size: 11px !important; }
          .modal-inner { margin: 16px !important; padding: 20px !important; }
          .detalle-grid { grid-template-columns: 1fr 1fr !important; }
        }
        .fila-venta:hover { background-color: #f0fff0 !important; cursor: pointer; }
        .btn-primary { background-color: #087e0b; color: white; border: none; border-radius: 8px; padding: 9px 20px; font-size: 13px; font-weight: bold; cursor: pointer; }
        .btn-primary:hover { background-color: #065e08; }
        .btn-secondary { background-color: white; color: #555; border: 1px solid #ddd; border-radius: 8px; padding: 9px 20px; font-size: 13px; cursor: pointer; }
        .btn-secondary:hover { background-color: #f5f5f5; }
        .btn-danger { background-color: transparent; color: #e53935; border: 1px solid #e53935; border-radius: 8px; padding: 9px 20px; font-size: 13px; cursor: pointer; }
        .btn-edit { background-color: #1565c0; color: white; border: none; border-radius: 8px; padding: 9px 20px; font-size: 13px; font-weight: bold; cursor: pointer; }
        .btn-edit:hover { background-color: #0d47a1; }
        input:focus, select:focus, textarea:focus { outline: 2px solid #087e0b; border-color: #087e0b; }
      `}</style>

      {/* NAVBAR */}
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 40px', backgroundColor: '#222', color: 'white', boxSizing: 'border-box', position: 'sticky', top: 0, zIndex: 100 }}>
        <a href="/sistema" style={{ fontWeight: 'bold', fontSize: '20px', color: 'white', textDecoration: 'none' }}>Muebles is Better</a>
        <span style={{ color: '#a3c47d', fontWeight: 'bold' }}>📦 Ventas</span>
        <span style={{ color: '#a3c47d', fontSize: '14px' }}>{nombreMostrar} 👤</span>
      </nav>

      <div className="ventas-container" style={{ padding: '32px 40px', maxWidth: '1300px', margin: '0 auto' }}>

        {/* CABECERA */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h1 style={{ margin: '0 0 4px', fontSize: '24px' }}>Ventas</h1>
            <p style={{ margin: 0, color: '#888', fontSize: '13px' }}>
              {totalCount.toLocaleString()} registros encontrados
              {puedeEditar && <span style={{ marginLeft: '10px', color: '#1565c0', fontSize: '12px' }}>● Modo administrador — edición habilitada</span>}
            </p>
          </div>
        </div>

        {/* FILTROS */}
        <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: '20px' }}>
          <div className="filtros-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px', alignItems: 'end' }}>
            <div>
              <label style={labelStyle}>Buscar por # venta</label>
              <input
                type="number" placeholder="Ej: 26250"
                value={filtros.busqueda}
                onChange={e => { setPage(0); setFiltros(f => ({ ...f, busqueda: e.target.value })) }}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Fecha desde</label>
              <input type="date" value={filtros.fecha_desde}
                onChange={e => { setPage(0); setFiltros(f => ({ ...f, fecha_desde: e.target.value })) }}
                style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Fecha hasta</label>
              <input type="date" value={filtros.fecha_hasta}
                onChange={e => { setPage(0); setFiltros(f => ({ ...f, fecha_hasta: e.target.value })) }}
                style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Forma de pago</label>
              <select value={filtros.forma_pago}
                onChange={e => { setPage(0); setFiltros(f => ({ ...f, forma_pago: e.target.value })) }}
                style={inputStyle}>
                <option value="">Todas</option>
                {FORMAS_PAGO.filter(Boolean).map(fp => (
                  <option key={fp} value={fp}>{fp.replace('_', ' ')}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Vendedor</label>
              <select value={filtros.vendedor}
                onChange={e => { setPage(0); setFiltros(f => ({ ...f, vendedor: e.target.value })) }}
                style={inputStyle}>
                <option value="">Todos</option>
                {vendedores.map(v => (
                  <option key={v.id} value={String(v.id)}>{v.nombre}</option>
                ))}
              </select>
            </div>
          </div>
          {(filtros.busqueda || filtros.fecha_desde || filtros.fecha_hasta || filtros.forma_pago || filtros.vendedor) && (
            <div style={{ marginTop: '12px' }}>
              <button className="btn-secondary" style={{ fontSize: '12px', padding: '6px 14px' }}
                onClick={() => { setPage(0); setFiltros({ busqueda: '', fecha_desde: '', fecha_hasta: '', forma_pago: '', vendedor: '' }) }}>
                ✕ Limpiar filtros
              </button>
            </div>
          )}
        </div>

        {/* TABLA */}
        <div style={{ backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
          {loadingVentas ? (
            <div style={{ padding: '60px', textAlign: 'center', color: '#888' }}>Cargando ventas...</div>
          ) : ventas.length === 0 ? (
            <div style={{ padding: '60px', textAlign: 'center', color: '#bbb' }}>
              <div style={{ fontSize: '40px', marginBottom: '12px' }}>📭</div>
              <p style={{ margin: 0 }}>No se encontraron ventas con los filtros aplicados.</p>
            </div>
          ) : (
            <div className="tabla-wrap" style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={thStyle}># Venta</th>
                    <th style={thStyle}>Cliente</th>
                    <th style={thStyle}>Vendedor</th>
                    <th style={thStyle}>F. Pedido</th>
                    <th style={thStyle}>F. Entrega</th>
                    <th style={thStyle}>Hora</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Anticipo</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Total</th>
                    <th style={thStyle}>Pago</th>
                    <th style={thStyle}>Transacción</th>
                  </tr>
                </thead>
                <tbody>
                  {ventas.map((v, i) => {
                    const bp = badgePago[v.forma_pago || ''] || { bg: '#f5f5f5', color: '#666' }
                    const esTruncado = v.cod_transaccion?.startsWith('TRUNCADO_')
                    return (
                      <tr key={v.id} className="fila-venta"
                        style={{ backgroundColor: i % 2 === 0 ? 'white' : '#fafafa' }}
                        onClick={() => abrirDetalle(v)}>
                        <td style={{ ...tdStyle, fontWeight: 'bold', color: '#087e0b' }}>#{v.cod_venta}</td>
                        <td style={tdStyle}>{v.personal_cliente?.nombre || <span style={{ color: '#bbb' }}>ID {v.cod_cliente}</span>}</td>
                        <td style={tdStyle}>{v.personal_vendedor?.nombre || <span style={{ color: '#bbb' }}>—</span>}</td>
                        <td style={tdStyle}>{fmtFecha(v.fecha_pedido)}</td>
                        <td style={tdStyle}>{fmtFecha(v.fecha_entrega)}</td>
                        <td style={tdStyle}>{v.hora_entrega || '—'}</td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>{fmt(v.anticipo)}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 'bold' }}>{fmt(v.total_venta)}</td>
                        <td style={tdStyle}>
                          {v.forma_pago ? (
                            <span style={{ backgroundColor: bp.bg, color: bp.color, padding: '3px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                              {v.forma_pago.replace('_', ' ')}
                            </span>
                          ) : <span style={{ color: '#bbb' }}>—</span>}
                        </td>
                        <td style={{ ...tdStyle, fontSize: '11px', color: esTruncado ? '#e65100' : '#555', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {esTruncado
                            ? <span title="Dato truncado por Excel — valor original irrecuperable">⚠️ {v.cod_transaccion?.replace('TRUNCADO_', '')}</span>
                            : (v.cod_transaccion || '—')}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* PAGINACION */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderTop: '1px solid #f0f0f0' }}>
              <span style={{ fontSize: '13px', color: '#888' }}>
                Página {page + 1} de {totalPages} — {totalCount.toLocaleString()} registros
              </span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn-secondary" style={{ padding: '7px 16px', fontSize: '12px' }}
                  disabled={page === 0} onClick={() => setPage(0)}>« Primera</button>
                <button className="btn-secondary" style={{ padding: '7px 16px', fontSize: '12px' }}
                  disabled={page === 0} onClick={() => setPage(p => p - 1)}>‹ Anterior</button>
                <button className="btn-secondary" style={{ padding: '7px 16px', fontSize: '12px' }}
                  disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Siguiente ›</button>
                <button className="btn-secondary" style={{ padding: '7px 16px', fontSize: '12px' }}
                  disabled={page >= totalPages - 1} onClick={() => setPage(totalPages - 1)}>Última »</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* MODAL DETALLE / EDICION                                             */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {ventaSel && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, overflowY: 'auto', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '20px' }}>
          <div className="modal-inner" style={{ backgroundColor: 'white', borderRadius: '16px', padding: '32px', width: '100%', maxWidth: '820px', boxShadow: '0 8px 40px rgba(0,0,0,0.2)', marginTop: '20px', marginBottom: '20px' }}>

            {/* Header modal */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <div>
                <h2 style={{ margin: '0 0 4px', fontSize: '20px' }}>
                  Venta #{ventaSel.cod_venta}
                  {modoEdicion && <span style={{ marginLeft: '10px', fontSize: '13px', color: '#1565c0', fontWeight: 'normal' }}>— Modo edición</span>}
                </h2>
                <p style={{ margin: 0, color: '#888', fontSize: '13px' }}>
                  {ventaSel.personal_cliente?.nombre || `Cliente ID ${ventaSel.cod_cliente}`}
                </p>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                {puedeEditar && !modoEdicion && (
                  <button className="btn-edit" onClick={activarEdicion}>✏️ Editar</button>
                )}
                <button className="btn-secondary" onClick={() => { setVentaSel(null); setModoEdicion(false); setMensajeGuardado('') }}>✕ Cerrar</button>
              </div>
            </div>

            {mensajeGuardado && (
              <div style={{ backgroundColor: mensajeGuardado.startsWith('✅') ? '#e8f5e9' : '#ffebee', border: `1px solid ${mensajeGuardado.startsWith('✅') ? '#a5d6a7' : '#ef9a9a'}`, borderRadius: '8px', padding: '10px 16px', marginBottom: '20px', fontSize: '13px', color: mensajeGuardado.startsWith('✅') ? '#2e7d32' : '#c62828' }}>
                {mensajeGuardado}
              </div>
            )}

            {/* ── CAMPOS CABECERA ────────────────────────────────────────── */}
            {modoEdicion ? (
              <>
                <h3 style={{ margin: '0 0 16px', fontSize: '15px', color: '#444', borderBottom: '1px solid #eee', paddingBottom: '8px' }}>Datos de la venta</h3>
                <div className="detalle-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px', marginBottom: '24px' }}>
                  <div>
                    <label style={labelStyle}>Cliente (ID)</label>
                    <input type="number" value={formVenta.cod_cliente || ''} style={inputStyle}
                      onChange={e => setFormVenta(f => ({ ...f, cod_cliente: parseInt(e.target.value) || null }))} />
                  </div>
                  <div>
                    <label style={labelStyle}>Vendedor</label>
                    <select value={formVenta.cod_vendedor || ''} style={inputStyle}
                      onChange={e => setFormVenta(f => ({ ...f, cod_vendedor: parseInt(e.target.value) || null }))}>
                      <option value="">— Sin asignar —</option>
                      {vendedores.map(v => <option key={v.id} value={v.id}>{v.nombre}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Forma de pago</label>
                    <select value={formVenta.forma_pago || ''} style={inputStyle}
                      onChange={e => setFormVenta(f => ({ ...f, forma_pago: e.target.value || null }))}>
                      <option value="">— Sin especificar —</option>
                      {FORMAS_PAGO.filter(Boolean).map(fp => <option key={fp} value={fp}>{fp.replace('_', ' ')}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Fecha pedido</label>
                    <input type="date" value={formVenta.fecha_pedido || ''} style={inputStyle}
                      onChange={e => setFormVenta(f => ({ ...f, fecha_pedido: e.target.value || null }))} />
                  </div>
                  <div>
                    <label style={labelStyle}>Fecha entrega</label>
                    <input type="date" value={formVenta.fecha_entrega || ''} style={inputStyle}
                      onChange={e => setFormVenta(f => ({ ...f, fecha_entrega: e.target.value || null }))} />
                  </div>
                  <div>
                    <label style={labelStyle}>Hora entrega</label>
                    <input type="time" value={formVenta.hora_entrega || ''} style={inputStyle}
                      onChange={e => setFormVenta(f => ({ ...f, hora_entrega: e.target.value || null }))} />
                  </div>
                  <div>
                    <label style={labelStyle}>Delivery cotizado (Bs.)</label>
                    <input type="number" step="0.01" value={formVenta.delivery_cotizado ?? ''} style={inputStyle}
                      onChange={e => setFormVenta(f => ({ ...f, delivery_cotizado: parseFloat(e.target.value) || null }))} />
                  </div>
                  <div>
                    <label style={labelStyle}>Delivery pagado (Bs.)</label>
                    <input type="number" step="0.01" value={formVenta.delivery_pagado ?? ''} style={inputStyle}
                      onChange={e => setFormVenta(f => ({ ...f, delivery_pagado: parseFloat(e.target.value) || null }))} />
                  </div>
                  <div>
                    <label style={labelStyle}>Anticipo (Bs.)</label>
                    <input type="number" step="0.01" value={formVenta.anticipo ?? ''} style={inputStyle}
                      onChange={e => setFormVenta(f => ({ ...f, anticipo: parseFloat(e.target.value) || null }))} />
                  </div>
                  <div>
                    <label style={labelStyle}>Total venta (Bs.)</label>
                    <input type="number" step="0.01" value={formVenta.total_venta ?? ''} style={inputStyle}
                      onChange={e => setFormVenta(f => ({ ...f, total_venta: parseFloat(e.target.value) || null }))} />
                  </div>
                  <div style={{ gridColumn: 'span 2' }}>
                    <label style={labelStyle}>Código transacción</label>
                    <input type="text" value={formVenta.cod_transaccion || ''} style={inputStyle}
                      placeholder="Número de transferencia / recibo"
                      onChange={e => setFormVenta(f => ({ ...f, cod_transaccion: e.target.value || null }))} />
                  </div>
                </div>

                {/* Detalle productos editable */}
                <h3 style={{ margin: '0 0 14px', fontSize: '15px', color: '#444', borderBottom: '1px solid #eee', paddingBottom: '8px' }}>Productos</h3>
                {formDetalle.map((d, idx) => (
                  <div key={d.id} style={{ backgroundColor: '#f9f9f9', borderRadius: '10px', padding: '16px', marginBottom: '12px', border: '1px solid #eee' }}>
                    <p style={{ margin: '0 0 12px', fontSize: '12px', color: '#888', fontWeight: 'bold' }}>ÍTEM {d.item ?? idx + 1}</p>
                    <div className="detalle-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                      <div>
                        <label style={labelStyle}>Código producto</label>
                        <input type="text" value={d.cod_producto || ''} style={inputStyle}
                          onChange={e => setFormDetalle(prev => prev.map((x, i) => i === idx ? { ...x, cod_producto: e.target.value || null } : x))} />
                      </div>
                      <div>
                        <label style={labelStyle}>Precio cotizado</label>
                        <input type="number" step="0.01" value={d.precio_cotizado ?? ''} style={inputStyle}
                          onChange={e => setFormDetalle(prev => prev.map((x, i) => i === idx ? { ...x, precio_cotizado: parseFloat(e.target.value) || null } : x))} />
                      </div>
                      <div>
                        <label style={labelStyle}>Precio vendido</label>
                        <input type="number" step="0.01" value={d.precio_vendido ?? ''} style={inputStyle}
                          onChange={e => setFormDetalle(prev => prev.map((x, i) => i === idx ? { ...x, precio_vendido: parseFloat(e.target.value) || null } : x))} />
                      </div>
                      <div>
                        <label style={labelStyle}>Cantidad</label>
                        <input type="number" value={d.cantidad ?? ''} style={inputStyle}
                          onChange={e => setFormDetalle(prev => prev.map((x, i) => i === idx ? { ...x, cantidad: parseInt(e.target.value) || null } : x))} />
                      </div>
                      <div>
                        <label style={labelStyle}>Dimensiones</label>
                        <input type="text" value={d.dimensiones || ''} style={inputStyle}
                          onChange={e => setFormDetalle(prev => prev.map((x, i) => i === idx ? { ...x, dimensiones: e.target.value || null } : x))} />
                      </div>
                      <div>
                        <label style={labelStyle}>Color estructura</label>
                        <input type="text" value={d.color_estructura || ''} style={inputStyle}
                          onChange={e => setFormDetalle(prev => prev.map((x, i) => i === idx ? { ...x, color_estructura: e.target.value || null } : x))} />
                      </div>
                      <div style={{ gridColumn: 'span 3' }}>
                        <label style={labelStyle}>Color melamina</label>
                        <input type="text" value={d.color_melamina || ''} style={inputStyle}
                          onChange={e => setFormDetalle(prev => prev.map((x, i) => i === idx ? { ...x, color_melamina: e.target.value || null } : x))} />
                      </div>
                    </div>
                  </div>
                ))}

                {/* Botones edición */}
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '8px' }}>
                  <button className="btn-danger" onClick={() => setModoEdicion(false)} disabled={guardando}>Cancelar</button>
                  <button className="btn-primary" onClick={guardarCambios} disabled={guardando}>
                    {guardando ? 'Guardando...' : '💾 Guardar cambios'}
                  </button>
                </div>
              </>
            ) : (
              <>
                {/* ── VISTA SOLO LECTURA ─────────────────────────────────── */}
                <div className="detalle-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
                  {[
                    ['Cliente', ventaSel.personal_cliente?.nombre || `ID ${ventaSel.cod_cliente}`],
                    ['Vendedor', ventaSel.personal_vendedor?.nombre || '—'],
                    ['Forma de pago', ventaSel.forma_pago?.replace('_', ' ') || '—'],
                    ['Fecha pedido', fmtFecha(ventaSel.fecha_pedido)],
                    ['Fecha entrega', fmtFecha(ventaSel.fecha_entrega)],
                    ['Hora entrega', ventaSel.hora_entrega || '—'],
                    ['Delivery cotizado', fmt(ventaSel.delivery_cotizado)],
                    ['Delivery pagado', fmt(ventaSel.delivery_pagado)],
                    ['Anticipo', fmt(ventaSel.anticipo)],
                    ['Total venta', fmt(ventaSel.total_venta)],
                  ].map(([label, val]) => (
                    <div key={label as string} style={{ backgroundColor: '#f9f9f9', borderRadius: '8px', padding: '12px 16px' }}>
                      <p style={{ margin: '0 0 4px', fontSize: '11px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</p>
                      <p style={{ margin: 0, fontSize: '14px', fontWeight: '500' }}>{val}</p>
                    </div>
                  ))}
                  <div style={{ backgroundColor: '#f9f9f9', borderRadius: '8px', padding: '12px 16px', gridColumn: 'span 3' }}>
                    <p style={{ margin: '0 0 4px', fontSize: '11px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Código transacción</p>
                    <p style={{ margin: 0, fontSize: '13px', fontFamily: 'monospace', color: ventaSel.cod_transaccion?.startsWith('TRUNCADO_') ? '#e65100' : '#222' }}>
                      {ventaSel.cod_transaccion?.startsWith('TRUNCADO_')
                        ? `⚠️ Truncado por Excel: ${ventaSel.cod_transaccion.replace('TRUNCADO_', '')}`
                        : (ventaSel.cod_transaccion || '—')}
                    </p>
                  </div>
                </div>

                {/* Detalle productos */}
                <h3 style={{ margin: '0 0 14px', fontSize: '15px', color: '#444', borderBottom: '1px solid #eee', paddingBottom: '8px' }}>
                  Productos ({detalle.length})
                </h3>
                {loadingDetalle ? (
                  <p style={{ color: '#888', textAlign: 'center', padding: '20px' }}>Cargando detalle...</p>
                ) : detalle.length === 0 ? (
                  <p style={{ color: '#bbb', textAlign: 'center', padding: '20px' }}>Sin líneas de detalle registradas.</p>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          {['#', 'Producto', 'P. Cotizado', 'P. Vendido', 'Cant.', 'Subtotal', 'Dimensiones', 'Est.', 'Melamina'].map(h => (
                            <th key={h} style={{ ...thStyle, fontSize: '11px' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {detalle.map((d, i) => (
                          <tr key={d.id} style={{ backgroundColor: i % 2 === 0 ? 'white' : '#fafafa' }}>
                            <td style={{ ...tdStyle, color: '#087e0b', fontWeight: 'bold' }}>{d.item ?? i + 1}</td>
                            <td style={{ ...tdStyle, fontWeight: '500' }}>{d.cod_producto || '—'}</td>
                            <td style={{ ...tdStyle, textAlign: 'right' }}>{fmt(d.precio_cotizado)}</td>
                            <td style={{ ...tdStyle, textAlign: 'right' }}>{fmt(d.precio_vendido)}</td>
                            <td style={{ ...tdStyle, textAlign: 'center' }}>{d.cantidad ?? '—'}</td>
                            <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 'bold', color: '#087e0b' }}>{fmt(d.subtotal)}</td>
                            <td style={{ ...tdStyle, fontSize: '12px', color: '#666' }}>{d.dimensiones || '—'}</td>
                            <td style={{ ...tdStyle, fontSize: '12px' }}>{d.color_estructura || '—'}</td>
                            <td style={{ ...tdStyle, fontSize: '12px', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                              title={d.color_melamina || ''}>{d.color_melamina || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr style={{ backgroundColor: '#f0fff0' }}>
                          <td colSpan={5} style={{ padding: '10px 14px', fontWeight: 'bold', fontSize: '13px', borderTop: '2px solid #087e0b' }}>Total</td>
                          <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 'bold', fontSize: '15px', color: '#087e0b', borderTop: '2px solid #087e0b' }}>
                            {fmt(detalle.reduce((acc, d) => acc + (d.subtotal || 0), 0))}
                          </td>
                          <td colSpan={3} style={{ borderTop: '2px solid #087e0b' }}></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
