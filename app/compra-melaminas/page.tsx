'use client'
import React, { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface Linea {
  cod_venta: string
  cod_mel: string
  color: string
  proveedor: string
  largo: string
  ancho: string
  cantidad: string
  precio_compra: string
  sup: boolean
  inf: boolean
  izquierda: boolean
  derecha: boolean
  precio_comprado: string
}

const lineaVacia = (): Linea => ({
  cod_venta: '', cod_mel: '', color: '', proveedor: '',
  largo: '', ancho: '', cantidad: '1', precio_compra: '',
  sup: false, inf: false, izquierda: false, derecha: false,
  precio_comprado: '',
})

// ── Fórmulas ──────────────────────────────────────────────────────────────────
const calcTapacanto = (l: Linea, precioTapa: number): number => {
  const largo = parseFloat(l.largo) || 0
  const ancho = parseFloat(l.ancho) || 0
  return ((largo * (l.sup ? 1 : 0) + largo * (l.inf ? 1 : 0) + (l.izquierda ? 1 : 0) * ancho + (l.derecha ? 1 : 0) * ancho) / 100) * precioTapa
}

const calcTotal = (l: Linea, precioTapa: number): number => {
  const largo = parseFloat(l.largo) || 0
  const ancho = parseFloat(l.ancho) || 0
  const cant = parseFloat(l.cantidad) || 0
  const precio = parseFloat(l.precio_compra) || 0
  const tapa = calcTapacanto(l, precioTapa)
  return (largo / 100) * (ancho / 100) * cant * precio + (tapa * cant)
}

const fmt = (v: number | null | undefined) =>
  v != null ? `Bs. ${Number(v).toFixed(2)}` : '—'

export default function ComprasMelamina() {
  const [usuario, setUsuario] = useState<any>(null)
  const [esAdmin, setEsAdmin] = useState(false)
  const [puedeComprar, setPuedeComprar] = useState(false)
  const [loading, setLoading] = useState(true)

  // Datos maestros
  const [melaminas, setMelaminas] = useState<any[]>([])

  // Lista pedidos
  const [pedidos, setPedidos] = useState<any[]>([])
  const [pedidoAbierto, setPedidoAbierto] = useState<any>(null)
  const [detalles, setDetalles] = useState<any[]>([])
  const [loadingDetalles, setLoadingDetalles] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [pagina, setPagina] = useState(1)
  const POR_PAGINA = 15

  // Modal nuevo pedido
  const [modalNuevo, setModalNuevo] = useState(false)
  const [modalPreview, setModalPreview] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [errorForm, setErrorForm] = useState('')
  const [exito, setExito] = useState('')

  // Form cabecera
  const [fNumeroPedido, setFNumeroPedido] = useState('')
  const [fFecha, setFFecha] = useState(new Date().toISOString().split('T')[0])
  const [fProveedor, setFProveedor] = useState('')
  const [fPrecioTapa, setFPrecioTapa] = useState('3.5')

  // Líneas del pedido
  const [lineas, setLineas] = useState<Linea[]>([lineaVacia()])

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
        const compras = data.cargos?.puede_editar_productos === true || admin
        setEsAdmin(admin)
        setPuedeComprar(compras)
        if (!admin && !compras) { window.location.replace('/sistema'); return }
        cargarDatos()
      })
  }, [])

  const cargarDatos = async () => {
    const [{ data: p }, { data: m }] = await Promise.all([
      supabase.from('pedidos_melamina').select('*').order('numero_pedido', { ascending: false }),
      supabase.from('melaminas').select('*').order('detalle'),
    ])
    setPedidos(p || [])
    setMelaminas(m || [])
    setLoading(false)
  }

  const verDetalle = async (pedido: any) => {
    if (pedidoAbierto?.id === pedido.id) { setPedidoAbierto(null); setDetalles([]); return }
    setPedidoAbierto(pedido)
    setLoadingDetalles(true)
    const { data } = await supabase.from('pedidos_melamina_detalle')
      .select('*').eq('pedido_id', pedido.id).order('id')
    setDetalles(data || [])
    setLoadingDetalles(false)
  }

  // ── Manejo de líneas ───────────────────────────────────────────────────────
  const actualizarLinea = (idx: number, campo: keyof Linea, valor: any) => {
    setLineas(prev => prev.map((l, i) => i === idx ? { ...l, [campo]: valor } : l))
  }

  const agregarLinea = () => setLineas(prev => [...prev, lineaVacia()])

  const eliminarLinea = (idx: number) => {
    if (lineas.length === 1) return
    setLineas(prev => prev.filter((_, i) => i !== idx))
  }

  const duplicarLinea = (idx: number) => {
    const copia = { ...lineas[idx] }
    setLineas(prev => [...prev.slice(0, idx + 1), copia, ...prev.slice(idx + 1)])
  }

  const precioTapa = parseFloat(fPrecioTapa) || 3.5
  const totalGeneral = lineas.reduce((acc, l) => acc + calcTotal(l, precioTapa), 0)

  // ── Confirmar pedido ───────────────────────────────────────────────────────
  const irAPreview = () => {
    if (!fNumeroPedido) { setErrorForm('El número de pedido es obligatorio'); return }
    const lineasValidas = lineas.filter(l => l.cod_mel && l.largo && l.ancho && l.precio_compra)
    if (lineasValidas.length === 0) { setErrorForm('Agrega al menos una línea completa'); return }
    setErrorForm('')
    setModalPreview(true)
  }

  const handleConfirmar = async () => {
    setGuardando(true); setErrorForm('')
    try {
      // Cabecera
      const { data: cab, error: errCab } = await supabase.from('pedidos_melamina').insert({
        numero_pedido: parseInt(fNumeroPedido),
        fecha: fFecha,
        proveedor: fProveedor || null,
        precio_tapacanto: precioTapa,
        total: totalGeneral,
        personal_id: usuario?.id || null,
      }).select().single()

      if (errCab) { setErrorForm('Error al crear pedido: ' + errCab.message); setGuardando(false); return }

      // Detalle
      const lineasValidas = lineas.filter(l => l.cod_mel && l.largo && l.ancho && l.precio_compra)
      const detalleInsert = lineasValidas.map(l => {
        const tapa = calcTapacanto(l, precioTapa)
        const totalCalc = calcTotal(l, precioTapa)
        const comprado = parseFloat(l.precio_comprado) || null
        return {
          pedido_id: cab.id,
          numero_pedido: parseInt(fNumeroPedido),
          cod_venta: l.cod_venta ? parseInt(l.cod_venta) : null,
          cod_mel: l.cod_mel,
          color: l.color || null,
          proveedor: l.proveedor || fProveedor || null,
          largo: parseFloat(l.largo),
          ancho: parseFloat(l.ancho),
          cantidad: parseFloat(l.cantidad) || 1,
          precio_compra: parseFloat(l.precio_compra),
          sup: l.sup, inf: l.inf, izquierda: l.izquierda, derecha: l.derecha,
          tapacanto: tapa,
          total_calculado: totalCalc,
          precio_comprado: comprado,
          variacion: comprado != null ? comprado - totalCalc : null,
        }
      })

      const { error: errDet } = await supabase.from('pedidos_melamina_detalle').insert(detalleInsert)
      if (errDet) { setErrorForm('Error en detalle: ' + errDet.message); setGuardando(false); return }

      setExito(`Pedido #${fNumeroPedido} registrado correctamente`)
      setModalPreview(false)
      setModalNuevo(false)
      resetForm()
      await cargarDatos()
    } catch (e: any) {
      setErrorForm('Error inesperado: ' + e.message)
    }
    setGuardando(false)
  }

  const resetForm = () => {
    setFNumeroPedido(''); setFFecha(new Date().toISOString().split('T')[0])
    setFProveedor(''); setFPrecioTapa('3.5')
    setLineas([lineaVacia()])
    setErrorForm(''); setExito('')
  }

  const handleEliminar = async (pedido: any) => {
    if (!confirm(`¿Eliminar pedido #${pedido.numero_pedido}?`)) return
    await supabase.from('pedidos_melamina_detalle').delete().eq('pedido_id', pedido.id)
    await supabase.from('pedidos_melamina').delete().eq('id', pedido.id)
    if (pedidoAbierto?.id === pedido.id) { setPedidoAbierto(null); setDetalles([]) }
    await cargarDatos()
  }

  // ── Filtros y paginación ───────────────────────────────────────────────────
  const pedidosFiltrados = pedidos.filter(p =>
    String(p.numero_pedido).includes(busqueda) ||
    (p.proveedor || '').toLowerCase().includes(busqueda.toLowerCase()) ||
    (p.fecha || '').includes(busqueda)
  )
  const totalPaginas = Math.ceil(pedidosFiltrados.length / POR_PAGINA)
  const pedidosPagina = pedidosFiltrados.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA)

  // ── Estilos ────────────────────────────────────────────────────────────────
  const thStyle: any = { padding: '10px 12px', textAlign: 'left', borderBottom: '2px solid #eee', color: '#555', fontSize: '12px', whiteSpace: 'nowrap', backgroundColor: '#f9f9f9' }
  const tdStyle = (i: number): any => ({ padding: '10px 12px', borderBottom: '1px solid #f0f0f0', backgroundColor: i % 2 === 0 ? 'white' : '#fafafa', fontSize: '13px' })
  const inputStyle: any = { padding: '8px 10px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '13px', width: '100%', boxSizing: 'border-box', backgroundColor: 'white' }
  const labelStyle: any = { fontSize: '11px', color: '#666', display: 'block', marginBottom: '3px', fontWeight: '500' }

  if (loading) return <p style={{ textAlign: 'center', marginTop: '100px', fontFamily: 'Arial' }}>Cargando...</p>

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', minHeight: '100vh', backgroundColor: '#f5f5f5' }}>

      <style>{`
        @media (max-width: 768px) {
          .comp-container { padding: 80px 12px 40px 12px !important; }
          .comp-header { flex-direction: column !important; gap: 12px !important; }
          .col-extra { display: none !important; }
          .linea-grid { grid-template-columns: 1fr 1fr !important; }
        }
        .check-tap { width: 16px; height: 16px; cursor: pointer; accent-color: #087e0b; }
      `}</style>

      {/* MODAL VISTA PREVIA */}
      {modalPreview && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', boxSizing: 'border-box' }}>
          <div style={{ backgroundColor: 'white', borderRadius: '16px', padding: '32px', width: '700px', maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}>
            <h2 style={{ margin: '0 0 4px', fontSize: '20px' }}>Confirmar Pedido de Melamina</h2>
            <p style={{ color: '#888', fontSize: '13px', margin: '0 0 20px' }}>Revisa antes de confirmar</p>

            <div style={{ backgroundColor: '#f9f9f9', borderRadius: '10px', padding: '14px 16px', marginBottom: '20px', fontSize: '14px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
              <div><span style={{ color: '#888' }}>Pedido lote #:</span> <strong>{fNumeroPedido}</strong></div>
              <div><span style={{ color: '#888' }}>Fecha:</span> <strong>{fFecha}</strong></div>
              <div><span style={{ color: '#888' }}>Proveedor:</span> <strong>{fProveedor || '—'}</strong></div>
              <div><span style={{ color: '#888' }}>Precio tapacanto:</span> <strong>Bs. {fPrecioTapa}/m</strong></div>
              <div><span style={{ color: '#888' }}>Líneas:</span> <strong>{lineas.filter(l => l.cod_mel).length}</strong></div>
              <div><span style={{ color: '#888' }}>Total:</span> <strong style={{ color: '#087e0b' }}>{fmt(totalGeneral)}</strong></div>
            </div>

            <div style={{ overflowX: 'auto', marginBottom: '20px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Venta</th>
                    <th style={thStyle}>Melamina</th>
                    <th style={thStyle}>Largo</th>
                    <th style={thStyle}>Ancho</th>
                    <th style={thStyle}>Cant.</th>
                    <th style={thStyle}>P.Compra</th>
                    <th style={thStyle}>Tapacanto</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Total calc.</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>P.Comprado</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Variación</th>
                  </tr>
                </thead>
                <tbody>
                  {lineas.filter(l => l.cod_mel && l.largo && l.ancho && l.precio_compra).map((l, i) => {
                    const tapa = calcTapacanto(l, precioTapa)
                    const total = calcTotal(l, precioTapa)
                    const comprado = parseFloat(l.precio_comprado) || null
                    const variacion = comprado != null ? comprado - total : null
                    return (
                      <tr key={i}>
                        <td style={tdStyle(i)}>{l.cod_venta || '—'}</td>
                        <td style={tdStyle(i)}><span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#087e0b' }}>{l.cod_mel}</span></td>
                        <td style={tdStyle(i)}>{l.largo}</td>
                        <td style={tdStyle(i)}>{l.ancho}</td>
                        <td style={tdStyle(i)}>{l.cantidad}</td>
                        <td style={tdStyle(i)}>Bs. {l.precio_compra}</td>
                        <td style={tdStyle(i)}>Bs. {tapa.toFixed(2)}</td>
                        <td style={{ ...tdStyle(i), textAlign: 'right', fontWeight: 'bold', color: '#087e0b' }}>{fmt(total)}</td>
                        <td style={{ ...tdStyle(i), textAlign: 'right' }}>{comprado != null ? fmt(comprado) : '—'}</td>
                        <td style={{ ...tdStyle(i), textAlign: 'right', color: variacion != null ? (variacion > 0 ? '#c62828' : '#2e7d32') : '#aaa', fontWeight: 'bold' }}>
                          {variacion != null ? (variacion > 0 ? '+' : '') + fmt(variacion) : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ backgroundColor: '#f0fff0' }}>
                    <td colSpan={7} style={{ padding: '12px 16px', fontWeight: 'bold', borderTop: '2px solid #087e0b' }}>Total General</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 'bold', fontSize: '16px', color: '#087e0b', borderTop: '2px solid #087e0b' }}>{fmt(totalGeneral)}</td>
                    <td colSpan={2} style={{ borderTop: '2px solid #087e0b' }}></td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {errorForm && <div style={{ backgroundColor: '#ffebee', border: '1px solid #ffcdd2', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', color: '#c62828', fontSize: '13px' }}>{errorForm}</div>}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button onClick={() => setModalPreview(false)} style={{ padding: '10px 20px', background: 'transparent', border: '1px solid #ccc', borderRadius: '8px', cursor: 'pointer', fontSize: '14px' }}>← Editar</button>
              <button onClick={handleConfirmar} disabled={guardando}
                style={{ padding: '10px 24px', backgroundColor: guardando ? '#ccc' : '#087e0b', color: 'white', border: 'none', borderRadius: '8px', cursor: guardando ? 'not-allowed' : 'pointer', fontSize: '14px', fontWeight: 'bold' }}>
                {guardando ? 'Guardando...' : '✓ Confirmar Pedido'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL NUEVO PEDIDO */}
      {modalNuevo && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '20px', boxSizing: 'border-box', overflowY: 'auto' }}>
          <div style={{ backgroundColor: 'white', borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '1100px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', margin: 'auto' }}>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ margin: 0, fontSize: '20px' }}>Nuevo Pedido de Melamina</h2>
              <button onClick={() => { setModalNuevo(false); resetForm() }} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#999' }}>✕</button>
            </div>

            {/* Cabecera */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', marginBottom: '20px', backgroundColor: '#f9f9f9', padding: '16px', borderRadius: '10px' }}>
              <div>
                <label style={labelStyle}>Nº Lote de pedido *</label>
                <input type="number" value={fNumeroPedido} onChange={e => setFNumeroPedido(e.target.value)} style={inputStyle} placeholder="Ej: 330" />
              </div>
              <div>
                <label style={labelStyle}>Fecha</label>
                <input type="date" value={fFecha} onChange={e => setFFecha(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Proveedor principal</label>
                <input type="text" value={fProveedor} onChange={e => setFProveedor(e.target.value)} style={inputStyle} placeholder="Ej: ARIAS" />
              </div>
              <div>
                <label style={labelStyle}>Precio tapacanto (Bs./m)</label>
                <input type="number" value={fPrecioTapa} onChange={e => setFPrecioTapa(e.target.value)} style={inputStyle} step="0.1" />
              </div>
            </div>

            {/* Tabla de líneas */}
            <div style={{ overflowX: 'auto', marginBottom: '16px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1000px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f0fff0' }}>
                    <th style={{ ...thStyle, width: '70px' }}>Venta</th>
                    <th style={{ ...thStyle, width: '160px' }}>Melamina *</th>
                    <th style={{ ...thStyle, width: '80px' }}>Largo*</th>
                    <th style={{ ...thStyle, width: '80px' }}>Ancho*</th>
                    <th style={{ ...thStyle, width: '60px' }}>Cant.</th>
                    <th style={{ ...thStyle, width: '90px' }}>P.Compra*</th>
                    <th style={{ ...thStyle, textAlign: 'center', width: '120px' }}>Tapacanto (S/I/Iz/D)</th>
                    <th style={{ ...thStyle, width: '90px' }}>P.Comprado</th>
                    <th style={{ ...thStyle, textAlign: 'right', width: '100px' }}>Total calc.</th>
                    <th style={{ ...thStyle, width: '60px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {lineas.map((l, i) => {
                    const tapa = calcTapacanto(l, precioTapa)
                    const total = calcTotal(l, precioTapa)
                    return (
                      <tr key={i} style={{ backgroundColor: i % 2 === 0 ? 'white' : '#fafafa' }}>
                        <td style={{ padding: '6px 8px' }}>
                          <input type="number" value={l.cod_venta} onChange={e => actualizarLinea(i, 'cod_venta', e.target.value)} style={{ ...inputStyle, fontSize: '12px' }} placeholder="26313" />
                        </td>
                        <td style={{ padding: '6px 8px' }}>
                          <select value={l.cod_mel} onChange={e => {
                            const sel = melaminas.find(m => m.codigo_melamina === e.target.value)
                            actualizarLinea(i, 'cod_mel', e.target.value)
                            if (sel) actualizarLinea(i, 'color', sel.detalle)
                          }} style={{ ...inputStyle, fontSize: '12px' }}>
                            <option value="">-- Selecciona --</option>
                            {melaminas.map(m => <option key={m.id} value={m.codigo_melamina}>{m.codigo_melamina} — {m.detalle}</option>)}
                          </select>
                        </td>
                        <td style={{ padding: '6px 8px' }}>
                          <input type="number" value={l.largo} onChange={e => actualizarLinea(i, 'largo', e.target.value)} style={{ ...inputStyle, fontSize: '12px' }} placeholder="200" min="0" step="0.5" />
                        </td>
                        <td style={{ padding: '6px 8px' }}>
                          <input type="number" value={l.ancho} onChange={e => actualizarLinea(i, 'ancho', e.target.value)} style={{ ...inputStyle, fontSize: '12px' }} placeholder="100" min="0" step="0.5" />
                        </td>
                        <td style={{ padding: '6px 8px' }}>
                          <input type="number" value={l.cantidad} onChange={e => actualizarLinea(i, 'cantidad', e.target.value)} style={{ ...inputStyle, fontSize: '12px' }} min="1" step="1" />
                        </td>
                        <td style={{ padding: '6px 8px' }}>
                          <input type="number" value={l.precio_compra} onChange={e => actualizarLinea(i, 'precio_compra', e.target.value)} style={{ ...inputStyle, fontSize: '12px' }} placeholder="340" min="0" step="0.01" />
                        </td>
                        <td style={{ padding: '6px 8px' }}>
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', alignItems: 'center' }}>
                            {(['sup', 'inf', 'izquierda', 'derecha'] as const).map(lado => (
                              <label key={lado} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', cursor: 'pointer', fontSize: '9px', color: l[lado] ? '#087e0b' : '#aaa' }}>
                                <input type="checkbox" checked={l[lado]} onChange={e => actualizarLinea(i, lado, e.target.checked)} className="check-tap" />
                                {lado === 'sup' ? 'S' : lado === 'inf' ? 'I' : lado === 'izquierda' ? 'Iz' : 'D'}
                              </label>
                            ))}
                            {tapa > 0 && <span style={{ fontSize: '10px', color: '#087e0b', marginLeft: '4px' }}>Bs.{tapa.toFixed(1)}</span>}
                          </div>
                        </td>
                        <td style={{ padding: '6px 8px' }}>
                          <input type="number" value={l.precio_comprado} onChange={e => actualizarLinea(i, 'precio_comprado', e.target.value)} style={{ ...inputStyle, fontSize: '12px' }} placeholder="Opcional" min="0" step="0.01" />
                        </td>
                        <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                          {total > 0 ? (
                            <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#087e0b' }}>{fmt(total)}</span>
                          ) : <span style={{ color: '#ccc', fontSize: '12px' }}>—</span>}
                        </td>
                        <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                            <button onClick={() => duplicarLinea(i)} title="Duplicar" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', color: '#087e0b' }}>⊕</button>
                            <button onClick={() => eliminarLinea(i)} disabled={lineas.length === 1} title="Eliminar" style={{ background: 'none', border: 'none', cursor: lineas.length === 1 ? 'not-allowed' : 'pointer', fontSize: '14px', color: lineas.length === 1 ? '#ddd' : '#ff4444' }}>🗑</button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ backgroundColor: '#f0fff0' }}>
                    <td colSpan={8} style={{ padding: '12px 16px', fontWeight: 'bold', fontSize: '14px', borderTop: '2px solid #087e0b' }}>Total General</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 'bold', fontSize: '16px', color: '#087e0b', borderTop: '2px solid #087e0b' }}>{fmt(totalGeneral)}</td>
                    <td style={{ borderTop: '2px solid #087e0b' }}></td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Botón agregar línea */}
            <button onClick={agregarLinea}
              style={{ padding: '8px 20px', backgroundColor: 'white', border: '1px dashed #087e0b', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', color: '#087e0b', marginBottom: '20px' }}>
              + Agregar fila
            </button>

            {errorForm && <div style={{ backgroundColor: '#ffebee', border: '1px solid #ffcdd2', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', color: '#c62828', fontSize: '13px' }}>{errorForm}</div>}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button onClick={() => { setModalNuevo(false); resetForm() }} style={{ padding: '10px 20px', background: 'transparent', border: '1px solid #ccc', borderRadius: '8px', cursor: 'pointer', fontSize: '14px' }}>Cancelar</button>
              <button onClick={irAPreview}
                style={{ padding: '10px 24px', backgroundColor: '#087e0b', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold' }}>
                Vista Previa →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* NAVBAR */}
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 40px', backgroundColor: '#222', color: 'white', position: 'fixed', top: 0, width: '100%', zIndex: 1000, boxSizing: 'border-box' }}>
        <a href="/" style={{ fontWeight: 'bold', fontSize: '20px', color: 'white', textDecoration: 'none' }}>Muebles is Better</a>
        <span style={{ color: '#a3c47d', fontWeight: 'bold' }}>Compras — Melamina</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <a href="/sistema" style={{ color: '#a3c47d', fontSize: '14px', textDecoration: 'none' }}>← Sistema</a>
          <a href="/" onClick={() => localStorage.removeItem('carnet')} style={{ backgroundColor: 'transparent', color: '#ff6b6b', border: '1px solid #ff6b6b', padding: '5px 12px', borderRadius: '20px', fontSize: '12px', textDecoration: 'none' }}>Salir</a>
        </div>
      </nav>

      {/* CONTENIDO */}
      <div className="comp-container" style={{ padding: '100px 40px 60px 40px', maxWidth: '1200px', margin: '0 auto' }}>

        {/* HEADER */}
        <div className="comp-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div>
            <h1 style={{ margin: '0 0 4px', fontSize: '24px' }}>Compras de Melamina</h1>
            <p style={{ margin: 0, color: '#666', fontSize: '14px' }}>{pedidos.length} lotes registrados</p>
          </div>
          {puedeComprar && (
            <button onClick={() => setModalNuevo(true)}
              style={{ padding: '10px 20px', backgroundColor: '#087e0b', color: 'white', border: 'none', borderRadius: '20px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
              + Nuevo Pedido
            </button>
          )}
        </div>

        {exito && <div style={{ backgroundColor: '#e8f5e9', border: '1px solid #c8e6c9', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px', color: '#2e7d32', fontSize: '14px' }}>{exito}</div>}

        {/* BUSCADOR */}
        <input type="text" placeholder="Buscar por nº lote, proveedor o fecha..."
          value={busqueda} onChange={e => { setBusqueda(e.target.value); setPagina(1) }}
          style={{ padding: '12px 16px', borderRadius: '10px', border: '1px solid #ddd', fontSize: '14px', width: '100%', boxSizing: 'border-box', marginBottom: '16px', backgroundColor: 'white' }} />

        {/* TABLA PEDIDOS */}
        <div style={{ backgroundColor: 'white', borderRadius: '16px', boxShadow: '0 2px 12px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f9f9f9' }}>
                  <th style={thStyle}>Lote #</th>
                  <th style={thStyle}>Fecha</th>
                  <th className="col-extra" style={thStyle}>Proveedor</th>
                  <th className="col-extra" style={thStyle}>P.Tapacanto</th>
                  <th className="col-extra" style={{ ...thStyle, textAlign: 'right' }}>Total</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {pedidosPagina.length === 0 ? (
                  <tr><td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: '#bbb' }}>No se encontraron pedidos</td></tr>
                ) : (
                  pedidosPagina.map((p, i) => (
                    <React.Fragment key={p.id}>
                      <tr style={{ backgroundColor: pedidoAbierto?.id === p.id ? '#f0fff0' : i % 2 === 0 ? 'white' : '#fafafa', cursor: 'pointer' }}
                        onClick={() => verDetalle(p)}>
                        <td style={{ ...tdStyle(i), fontWeight: 'bold', color: '#087e0b' }}>#{p.numero_pedido}</td>
                        <td style={tdStyle(i)}>{p.fecha}</td>
                        <td className="col-extra" style={tdStyle(i)}>{p.proveedor || '—'}</td>
                        <td className="col-extra" style={tdStyle(i)}>Bs. {Number(p.precio_tapacanto).toFixed(2)}/m</td>
                        <td className="col-extra" style={{ ...tdStyle(i), textAlign: 'right', fontWeight: 'bold' }}>{fmt(p.total)}</td>
                        <td style={{ ...tdStyle(i), textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                            <button onClick={e => { e.stopPropagation(); verDetalle(p) }}
                              style={{ padding: '5px 12px', backgroundColor: '#e8f5e9', color: '#2e7d32', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>
                              {pedidoAbierto?.id === p.id ? '▲ Cerrar' : '▼ Ver'}
                            </button>
                            {esAdmin && (
                              <button onClick={e => { e.stopPropagation(); handleEliminar(p) }}
                                style={{ padding: '5px 12px', backgroundColor: '#ffebee', color: '#c62828', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>
                                Eliminar
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* DETALLE EXPANDIBLE */}
                      {pedidoAbierto?.id === p.id && (
                        <tr>
                          <td colSpan={6} style={{ padding: 0, backgroundColor: '#f9fff9', borderBottom: '2px solid #087e0b' }}>
                            {loadingDetalles ? (
                              <p style={{ padding: '20px', textAlign: 'center', color: '#666' }}>Cargando...</p>
                            ) : (
                              <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '900px' }}>
                                  <thead>
                                    <tr style={{ backgroundColor: '#e8f5e9' }}>
                                      <th style={{ ...thStyle, fontSize: '11px' }}>Venta</th>
                                      <th style={{ ...thStyle, fontSize: '11px' }}>Melamina</th>
                                      <th style={{ ...thStyle, fontSize: '11px' }}>Color</th>
                                      <th style={{ ...thStyle, fontSize: '11px', textAlign: 'right' }}>Largo</th>
                                      <th style={{ ...thStyle, fontSize: '11px', textAlign: 'right' }}>Ancho</th>
                                      <th style={{ ...thStyle, fontSize: '11px', textAlign: 'right' }}>Cant.</th>
                                      <th style={{ ...thStyle, fontSize: '11px', textAlign: 'right' }}>P.Compra</th>
                                      <th style={{ ...thStyle, fontSize: '11px', textAlign: 'right' }}>Tapacanto</th>
                                      <th style={{ ...thStyle, fontSize: '11px', textAlign: 'right' }}>Total calc.</th>
                                      <th style={{ ...thStyle, fontSize: '11px', textAlign: 'right' }}>P.Comprado</th>
                                      <th style={{ ...thStyle, fontSize: '11px', textAlign: 'right' }}>Variación</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {detalles.map((d, di) => (
                                      <tr key={d.id} style={{ backgroundColor: di % 2 === 0 ? 'white' : '#f9fff9' }}>
                                        <td style={{ ...tdStyle(di), fontSize: '12px' }}>{d.cod_venta || '—'}</td>
                                        <td style={{ ...tdStyle(di), fontSize: '11px', fontFamily: 'monospace', color: '#087e0b' }}>{d.cod_mel}</td>
                                        <td style={{ ...tdStyle(di), fontSize: '11px', color: '#666' }}>{d.color || '—'}</td>
                                        <td style={{ ...tdStyle(di), fontSize: '12px', textAlign: 'right' }}>{d.largo}</td>
                                        <td style={{ ...tdStyle(di), fontSize: '12px', textAlign: 'right' }}>{d.ancho}</td>
                                        <td style={{ ...tdStyle(di), fontSize: '12px', textAlign: 'right' }}>{d.cantidad}</td>
                                        <td style={{ ...tdStyle(di), fontSize: '12px', textAlign: 'right' }}>Bs. {Number(d.precio_compra).toFixed(2)}</td>
                                        <td style={{ ...tdStyle(di), fontSize: '12px', textAlign: 'right' }}>Bs. {Number(d.tapacanto).toFixed(2)}</td>
                                        <td style={{ ...tdStyle(di), fontSize: '12px', textAlign: 'right', fontWeight: 'bold', color: '#087e0b' }}>{fmt(d.total_calculado)}</td>
                                        <td style={{ ...tdStyle(di), fontSize: '12px', textAlign: 'right' }}>{d.precio_comprado != null ? fmt(d.precio_comprado) : '—'}</td>
                                        <td style={{ ...tdStyle(di), fontSize: '12px', textAlign: 'right', fontWeight: 'bold', color: d.variacion > 0 ? '#c62828' : d.variacion < 0 ? '#2e7d32' : '#aaa' }}>
                                          {d.variacion != null ? (d.variacion > 0 ? '+' : '') + fmt(d.variacion) : '—'}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                  <tfoot>
                                    <tr style={{ backgroundColor: '#f0fff0' }}>
                                      <td colSpan={8} style={{ padding: '10px 12px', fontWeight: 'bold', fontSize: '12px', borderTop: '1px solid #a3c47d' }}>Total lote #{p.numero_pedido}</td>
                                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 'bold', color: '#087e0b', borderTop: '1px solid #a3c47d' }}>{fmt(p.total)}</td>
                                      <td colSpan={2} style={{ borderTop: '1px solid #a3c47d' }}></td>
                                    </tr>
                                  </tfoot>
                                </table>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* PAGINACIÓN */}
          {totalPaginas > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', padding: '16px', borderTop: '1px solid #f0f0f0' }}>
              <button onClick={() => setPagina(p => Math.max(1, p - 1))} disabled={pagina === 1}
                style={{ padding: '6px 14px', borderRadius: '8px', border: '1px solid #ddd', backgroundColor: pagina === 1 ? '#f5f5f5' : 'white', cursor: pagina === 1 ? 'not-allowed' : 'pointer', fontSize: '13px' }}>
                ← Anterior
              </button>
              <span style={{ fontSize: '13px', color: '#666' }}>Página {pagina} de {totalPaginas}</span>
              <button onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))} disabled={pagina === totalPaginas}
                style={{ padding: '6px 14px', borderRadius: '8px', border: '1px solid #ddd', backgroundColor: pagina === totalPaginas ? '#f5f5f5' : 'white', cursor: pagina === totalPaginas ? 'not-allowed' : 'pointer', fontSize: '13px' }}>
                Siguiente →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
