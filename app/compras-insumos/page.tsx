'use client'
import React, { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

export default function ComprasInsumos() {
  const [usuario, setUsuario] = useState<any>(null)
  const [esAdmin, setEsAdmin] = useState(false)
  const [puedeComprar, setPuedeComprar] = useState(false)
  const [loading, setLoading] = useState(true)

  // Datos
  const [pedidos, setPedidos] = useState<any[]>([])
  const [insumos, setInsumos] = useState<any[]>([])
  const [pedidoAbierto, setPedidoAbierto] = useState<any>(null)
  const [detalles, setDetalles] = useState<any[]>([])
  const [loadingDetalles, setLoadingDetalles] = useState(false)

  // Filtros
  const [busqueda, setBusqueda] = useState('')
  const [pagina, setPagina] = useState(1)
  const POR_PAGINA = 15

  // Modales
  const [modalNuevo, setModalNuevo] = useState(false)
  const [modalPreview, setModalPreview] = useState(false)

  // Form
  const [formFecha, setFormFecha] = useState(new Date().toISOString().split('T')[0])
  const [formTransporte, setFormTransporte] = useState('')
  const [formObservaciones, setFormObservaciones] = useState('')
  const [lineas, setLineas] = useState<any[]>([])
  const [lineaActual, setLineaActual] = useState({ codigo_insumo: '', precio: '', cantidad: '', proveedor: '' })
  const [guardando, setGuardando] = useState(false)
  const [errorForm, setErrorForm] = useState('')
  const [exito, setExito] = useState('')

  useEffect(() => {
    const carnetGuardado = localStorage.getItem('carnet')
    if (!carnetGuardado) { window.location.replace('/'); return }
    supabase.from('personal').select('*, cargos(*)')
      .eq('carnet', carnetGuardado).eq('estado', true).single()
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
    const [{ data: p }, { data: i }] = await Promise.all([
      supabase.from('pedidos_insumos').select('*').order('codigo_pedido', { ascending: false }),
      supabase.from('insumos').select('*').order('codigo_insumos'),
    ])
    setPedidos(p || [])
    setInsumos(i || [])
    setLoading(false)
  }

  const verDetalle = async (pedido: any) => {
    if (pedidoAbierto?.id === pedido.id) { setPedidoAbierto(null); setDetalles([]); return }
    setPedidoAbierto(pedido)
    setLoadingDetalles(true)
    const { data } = await supabase.from('pedidos_insumos_detalle')
      .select('*').eq('pedido_id', pedido.id).order('id')
    setDetalles(data || [])
    setLoadingDetalles(false)
  }

  const agregarLinea = () => {
    if (!lineaActual.codigo_insumo || !lineaActual.precio || !lineaActual.cantidad) {
      setErrorForm('Completa código, precio y cantidad')
      return
    }
    const precio = parseFloat(lineaActual.precio)
    const cantidad = parseFloat(lineaActual.cantidad)
    if (isNaN(precio) || isNaN(cantidad) || precio <= 0 || cantidad <= 0) {
      setErrorForm('Precio y cantidad deben ser números positivos')
      return
    }
    const insumo = insumos.find(i => i.codigo_insumos === lineaActual.codigo_insumo)
    setLineas([...lineas, {
      codigo_insumo: lineaActual.codigo_insumo,
      detalle: insumo?.detalle || lineaActual.codigo_insumo,
      precio,
      cantidad,
      proveedor: lineaActual.proveedor,
      subtotal: precio * cantidad,
    }])
    setLineaActual({ codigo_insumo: '', precio: '', cantidad: '', proveedor: '' })
    setErrorForm('')
  }

  const eliminarLinea = (idx: number) => setLineas(lineas.filter((_, i) => i !== idx))

  const totalLineas = lineas.reduce((acc, l) => acc + l.subtotal, 0)
  const transporte = parseFloat(formTransporte) || 0
  const totalPedido = totalLineas + transporte

  const handleConfirmar = async () => {
    setGuardando(true)
    setErrorForm('')
    try {
      const { data: maxPedido } = await supabase
        .from('pedidos_insumos').select('codigo_pedido').order('codigo_pedido', { ascending: false }).limit(1).single()
      const nuevoCodigo = (maxPedido?.codigo_pedido || 0) + 1

      const { data: cabecera, error: errCab } = await supabase.from('pedidos_insumos').insert({
        codigo_pedido: nuevoCodigo,
        fecha: formFecha,
        transporte: transporte,
        total: totalPedido,
        observaciones: formObservaciones || null,
        personal_id: usuario?.id || null,
      }).select().single()

      if (errCab) { setErrorForm('Error al crear pedido: ' + errCab.message); setGuardando(false); return }

      const detallesInsert = lineas.map(l => ({
        pedido_id: cabecera.id,
        codigo_pedido: nuevoCodigo,
        codigo_insumo: l.codigo_insumo,
        precio: l.precio,
        cantidad: l.cantidad,
        proveedor: l.proveedor || null,
      }))
      const { error: errDet } = await supabase.from('pedidos_insumos_detalle').insert(detallesInsert)
      if (errDet) { setErrorForm('Error al guardar detalle: ' + errDet.message); setGuardando(false); return }

      setExito(`Pedido #${nuevoCodigo} registrado correctamente`)
      setModalPreview(false)
      setModalNuevo(false)
      resetForm()
      await cargarDatos()
    } catch (e: any) {
      setErrorForm('Error inesperado: ' + e.message)
    }
    setGuardando(false)
  }

  const handleEliminar = async (pedido: any) => {
    if (!confirm(`¿Eliminar pedido #${pedido.codigo_pedido}?`)) return
    await supabase.from('pedidos_insumos_detalle').delete().eq('pedido_id', pedido.id)
    await supabase.from('pedidos_insumos').delete().eq('id', pedido.id)
    if (pedidoAbierto?.id === pedido.id) { setPedidoAbierto(null); setDetalles([]) }
    await cargarDatos()
  }

  const resetForm = () => {
    setFormFecha(new Date().toISOString().split('T')[0])
    setFormTransporte('')
    setFormObservaciones('')
    setLineas([])
    setLineaActual({ codigo_insumo: '', precio: '', cantidad: '', proveedor: '' })
    setErrorForm('')
    setExito('')
  }

  const pedidosFiltrados = pedidos.filter(p =>
    String(p.codigo_pedido).includes(busqueda) ||
    (p.fecha || '').includes(busqueda)
  )
  const totalPaginas = Math.ceil(pedidosFiltrados.length / POR_PAGINA)
  const pedidosPagina = pedidosFiltrados.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA)

  const inputStyle: any = { padding: '10px 12px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '14px', width: '100%', boxSizing: 'border-box', backgroundColor: 'white' }
  const labelStyle: any = { fontSize: '13px', color: '#555', display: 'block', marginBottom: '4px', fontWeight: '500' }
  const thStyle: any = { padding: '12px 16px', textAlign: 'left', borderBottom: '2px solid #eee', color: '#555', whiteSpace: 'nowrap', fontSize: '13px' }
  const tdStyle = (i: number): any => ({ padding: '11px 16px', borderBottom: '1px solid #f0f0f0', backgroundColor: i % 2 === 0 ? 'white' : '#fafafa', fontSize: '14px' })

  if (loading) return <p style={{ textAlign: 'center', marginTop: '100px', fontFamily: 'Arial' }}>Cargando...</p>

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', minHeight: '100vh', backgroundColor: '#f5f5f5' }}>

      <style>{`
        @media (max-width: 768px) {
          .comp-container { padding: 80px 16px 40px 16px !important; }
          .comp-header { flex-direction: column !important; gap: 12px !important; }
          .comp-col-extra { display: none !important; }
        }
      `}</style>

      {/* MODAL NUEVO PEDIDO */}
      {modalNuevo && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '20px', boxSizing: 'border-box', overflowY: 'auto' }}>
          <div style={{ backgroundColor: 'white', borderRadius: '16px', padding: '32px', width: '720px', maxWidth: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', margin: 'auto' }}>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ margin: 0, fontSize: '20px' }}>Nuevo Pedido de Insumos</h2>
              <button onClick={() => { setModalNuevo(false); resetForm() }} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#999' }}>✕</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '20px' }}>
              <div>
                <label style={labelStyle}>Fecha *</label>
                <input type="date" value={formFecha} onChange={(e) => setFormFecha(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Transporte (Bs.)</label>
                <input type="number" value={formTransporte} onChange={(e) => setFormTransporte(e.target.value)} style={inputStyle} placeholder="0" min="0" step="0.01" />
              </div>
              <div>
                <label style={labelStyle}>Observaciones</label>
                <input type="text" value={formObservaciones} onChange={(e) => setFormObservaciones(e.target.value)} style={inputStyle} placeholder="Opcional" />
              </div>
            </div>

            {/* Agregar línea */}
            <div style={{ backgroundColor: '#f9f9f9', borderRadius: '12px', padding: '20px', marginBottom: '20px' }}>
              <p style={{ margin: '0 0 12px 0', fontWeight: 'bold', fontSize: '14px', color: '#333' }}>Agregar ítem</p>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr auto', gap: '10px', alignItems: 'end' }}>
                <div>
                  <label style={labelStyle}>Código insumo *</label>
                  <select value={lineaActual.codigo_insumo} onChange={(e) => setLineaActual({ ...lineaActual, codigo_insumo: e.target.value })} style={inputStyle}>
                    <option value="">-- Selecciona --</option>
                    {insumos.map(i => <option key={i.id} value={i.codigo_insumos}>{i.codigo_insumos} — {i.detalle}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Precio *</label>
                  <input type="number" value={lineaActual.precio} onChange={(e) => setLineaActual({ ...lineaActual, precio: e.target.value })} style={inputStyle} placeholder="0.00" min="0" step="0.0001" />
                </div>
                <div>
                  <label style={labelStyle}>Cantidad *</label>
                  <input type="number" value={lineaActual.cantidad} onChange={(e) => setLineaActual({ ...lineaActual, cantidad: e.target.value })} style={inputStyle} placeholder="0" min="0" step="0.01" />
                </div>
                <div>
                  <label style={labelStyle}>Proveedor</label>
                  <input type="text" value={lineaActual.proveedor} onChange={(e) => setLineaActual({ ...lineaActual, proveedor: e.target.value })} style={inputStyle} placeholder="Opcional" />
                </div>
                <div style={{ paddingBottom: '1px' }}>
                  <button onClick={agregarLinea} style={{ padding: '10px 16px', backgroundColor: '#087e0b', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                    + Agregar
                  </button>
                </div>
              </div>
              {errorForm && <p style={{ color: '#c62828', fontSize: '13px', margin: '8px 0 0 0' }}>{errorForm}</p>}
            </div>

            {/* Lista líneas */}
            {lineas.length > 0 && (
              <div style={{ marginBottom: '20px', overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f9f9f9' }}>
                      <th style={thStyle}>Código</th>
                      <th style={thStyle}>Detalle</th>
                      <th style={thStyle}>Proveedor</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Precio</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Cant.</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Subtotal</th>
                      <th style={{ ...thStyle, textAlign: 'center' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineas.map((l, i) => (
                      <tr key={i}>
                        <td style={tdStyle(i)}>{l.codigo_insumo}</td>
                        <td style={tdStyle(i)}>{l.detalle}</td>
                        <td style={tdStyle(i)}>{l.proveedor || '—'}</td>
                        <td style={{ ...tdStyle(i), textAlign: 'right' }}>Bs. {l.precio.toFixed(2)}</td>
                        <td style={{ ...tdStyle(i), textAlign: 'right' }}>{l.cantidad}</td>
                        <td style={{ ...tdStyle(i), textAlign: 'right', fontWeight: 'bold', color: '#087e0b' }}>Bs. {l.subtotal.toFixed(2)}</td>
                        <td style={{ ...tdStyle(i), textAlign: 'center' }}>
                          <button onClick={() => eliminarLinea(i)} style={{ background: 'none', border: 'none', color: '#ff4444', cursor: 'pointer', fontSize: '18px' }}>🗑</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ backgroundColor: '#f0fff0' }}>
                      <td colSpan={5} style={{ padding: '10px 16px', fontSize: '13px', color: '#666', borderTop: '1px solid #a3c47d' }}>Subtotal productos</td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', color: '#087e0b', borderTop: '1px solid #a3c47d' }}>Bs. {totalLineas.toFixed(2)}</td>
                      <td style={{ borderTop: '1px solid #a3c47d' }}></td>
                    </tr>
                    {transporte > 0 && (
                      <tr style={{ backgroundColor: '#f0fff0' }}>
                        <td colSpan={5} style={{ padding: '6px 16px', fontSize: '13px', color: '#666' }}>Transporte</td>
                        <td style={{ padding: '6px 16px', textAlign: 'right', color: '#666' }}>Bs. {transporte.toFixed(2)}</td>
                        <td></td>
                      </tr>
                    )}
                    <tr style={{ backgroundColor: '#f0fff0' }}>
                      <td colSpan={5} style={{ padding: '12px 16px', fontWeight: 'bold', fontSize: '15px', borderTop: '2px solid #087e0b' }}>Total</td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 'bold', fontSize: '18px', color: '#087e0b', borderTop: '2px solid #087e0b' }}>Bs. {totalPedido.toFixed(2)}</td>
                      <td style={{ borderTop: '2px solid #087e0b' }}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button onClick={() => { setModalNuevo(false); resetForm() }} style={{ padding: '10px 20px', backgroundColor: 'transparent', border: '1px solid #ccc', borderRadius: '8px', cursor: 'pointer', fontSize: '14px' }}>Cancelar</button>
              <button onClick={() => { if (lineas.length === 0) { setErrorForm('Agrega al menos un ítem'); return } setErrorForm(''); setModalPreview(true) }}
                disabled={lineas.length === 0}
                style={{ padding: '10px 24px', backgroundColor: lineas.length === 0 ? '#ccc' : '#087e0b', color: 'white', border: 'none', borderRadius: '8px', cursor: lineas.length === 0 ? 'not-allowed' : 'pointer', fontSize: '14px', fontWeight: 'bold' }}>
                Vista Previa →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL VISTA PREVIA */}
      {modalPreview && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', boxSizing: 'border-box' }}>
          <div style={{ backgroundColor: 'white', borderRadius: '16px', padding: '32px', width: '620px', maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}>
            <h2 style={{ margin: '0 0 4px 0', fontSize: '20px' }}>Confirmar Pedido</h2>
            <p style={{ color: '#888', fontSize: '13px', margin: '0 0 24px 0' }}>Revisa los datos antes de confirmar</p>

            <div style={{ backgroundColor: '#f9f9f9', borderRadius: '10px', padding: '16px', marginBottom: '20px', fontSize: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div><span style={{ color: '#888' }}>Fecha:</span> <strong>{formFecha}</strong></div>
                <div><span style={{ color: '#888' }}>Transporte:</span> <strong>Bs. {transporte.toFixed(2)}</strong></div>
                <div><span style={{ color: '#888' }}>Ítems:</span> <strong>{lineas.length}</strong></div>
                <div><span style={{ color: '#888' }}>Total:</span> <strong style={{ color: '#087e0b' }}>Bs. {totalPedido.toFixed(2)}</strong></div>
                {formObservaciones && <div style={{ gridColumn: '1/-1' }}><span style={{ color: '#888' }}>Obs:</span> <strong>{formObservaciones}</strong></div>}
              </div>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '24px' }}>
              <thead>
                <tr style={{ backgroundColor: '#f9f9f9' }}>
                  <th style={thStyle}>Código</th>
                  <th style={thStyle}>Detalle</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Precio</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Cant.</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {lineas.map((l, i) => (
                  <tr key={i}>
                    <td style={tdStyle(i)}>{l.codigo_insumo}</td>
                    <td style={tdStyle(i)}>{l.detalle}</td>
                    <td style={{ ...tdStyle(i), textAlign: 'right' }}>Bs. {l.precio.toFixed(2)}</td>
                    <td style={{ ...tdStyle(i), textAlign: 'right' }}>{l.cantidad}</td>
                    <td style={{ ...tdStyle(i), textAlign: 'right', fontWeight: 'bold', color: '#087e0b' }}>Bs. {l.subtotal.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                {transporte > 0 && (
                  <tr style={{ backgroundColor: '#f0fff0' }}>
                    <td colSpan={4} style={{ padding: '10px 16px', fontSize: '13px', color: '#666', borderTop: '1px solid #a3c47d' }}>Transporte</td>
                    <td style={{ padding: '10px 16px', textAlign: 'right', color: '#666', borderTop: '1px solid #a3c47d' }}>Bs. {transporte.toFixed(2)}</td>
                  </tr>
                )}
                <tr style={{ backgroundColor: '#f0fff0' }}>
                  <td colSpan={4} style={{ padding: '12px 16px', fontWeight: 'bold', borderTop: '2px solid #087e0b' }}>Total</td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 'bold', fontSize: '18px', color: '#087e0b', borderTop: '2px solid #087e0b' }}>Bs. {totalPedido.toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>

            {errorForm && <div style={{ backgroundColor: '#ffebee', border: '1px solid #ffcdd2', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', color: '#c62828', fontSize: '13px' }}>{errorForm}</div>}
            {exito && <div style={{ backgroundColor: '#e8f5e9', border: '1px solid #c8e6c9', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', color: '#2e7d32', fontSize: '13px' }}>{exito}</div>}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button onClick={() => setModalPreview(false)} style={{ padding: '10px 20px', backgroundColor: 'transparent', border: '1px solid #ccc', borderRadius: '8px', cursor: 'pointer', fontSize: '14px' }}>← Editar</button>
              <button onClick={handleConfirmar} disabled={guardando}
                style={{ padding: '10px 24px', backgroundColor: guardando ? '#ccc' : '#087e0b', color: 'white', border: 'none', borderRadius: '8px', cursor: guardando ? 'not-allowed' : 'pointer', fontSize: '14px', fontWeight: 'bold' }}>
                {guardando ? 'Guardando...' : '✓ Confirmar Pedido'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* NAVBAR */}
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 40px', backgroundColor: '#222', color: 'white', position: 'fixed', top: 0, width: '100%', zIndex: 1000, boxSizing: 'border-box' }}>
        <a href="/" style={{ fontWeight: 'bold', fontSize: '20px', color: 'white', textDecoration: 'none' }}>Muebles is Better</a>
        <span style={{ color: '#a3c47d', fontWeight: 'bold' }}>Compras — Insumos</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <a href="/sistema" style={{ color: '#a3c47d', fontSize: '14px', textDecoration: 'none' }}>← Sistema</a>
          <a href="/" onClick={() => localStorage.removeItem('carnet')} style={{ backgroundColor: 'transparent', color: '#ff6b6b', border: '1px solid #ff6b6b', padding: '5px 12px', borderRadius: '20px', fontSize: '12px', textDecoration: 'none' }}>Salir</a>
        </div>
      </nav>

      <div className="comp-container" style={{ padding: '100px 40px 60px 40px', maxWidth: '1100px', margin: '0 auto' }}>

        <div className="comp-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div>
            <h1 style={{ margin: '0 0 4px 0', fontSize: '24px' }}>Compras de Insumos</h1>
            <p style={{ margin: 0, color: '#666', fontSize: '14px' }}>{pedidos.length} pedidos registrados</p>
          </div>
          {puedeComprar && (
            <button onClick={() => setModalNuevo(true)}
              style={{ padding: '10px 20px', backgroundColor: '#087e0b', color: 'white', border: 'none', borderRadius: '20px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
              + Nuevo Pedido
            </button>
          )}
        </div>

        <input type="text" placeholder="Buscar por número de pedido o fecha..."
          value={busqueda} onChange={(e) => { setBusqueda(e.target.value); setPagina(1) }}
          style={{ padding: '12px 16px', borderRadius: '10px', border: '1px solid #ddd', fontSize: '14px', width: '100%', boxSizing: 'border-box', marginBottom: '16px', backgroundColor: 'white' }} />

        <div style={{ backgroundColor: 'white', borderRadius: '16px', boxShadow: '0 2px 12px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f9f9f9' }}>
                  <th style={thStyle}>Pedido #</th>
                  <th style={thStyle}>Fecha</th>
                  <th className="comp-col-extra" style={{ ...thStyle, textAlign: 'right' }}>Transporte</th>
                  <th className="comp-col-extra" style={{ ...thStyle, textAlign: 'right' }}>Total</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {pedidosPagina.length === 0 ? (
                  <tr><td colSpan={5} style={{ padding: '40px', textAlign: 'center', color: '#bbb' }}>No se encontraron pedidos</td></tr>
                ) : (
                  pedidosPagina.map((p, i) => (
                    <React.Fragment key={p.id}>
                      <tr style={{ backgroundColor: pedidoAbierto?.id === p.id ? '#f0fff0' : i % 2 === 0 ? 'white' : '#fafafa', cursor: 'pointer' }}
                        onClick={() => verDetalle(p)}>
                        <td style={{ ...tdStyle(i), fontWeight: 'bold', color: '#087e0b' }}>#{p.codigo_pedido}</td>
                        <td style={tdStyle(i)}>{p.fecha}</td>
                        <td className="comp-col-extra" style={{ ...tdStyle(i), textAlign: 'right' }}>Bs. {Number(p.transporte || 0).toFixed(2)}</td>
                        <td className="comp-col-extra" style={{ ...tdStyle(i), textAlign: 'right', fontWeight: 'bold' }}>Bs. {Number(p.total || 0).toFixed(2)}</td>
                        <td style={{ ...tdStyle(i), textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                            <button onClick={(e) => { e.stopPropagation(); verDetalle(p) }}
                              style={{ padding: '5px 12px', backgroundColor: '#e8f5e9', color: '#2e7d32', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>
                              {pedidoAbierto?.id === p.id ? '▲ Cerrar' : '▼ Ver'}
                            </button>
                            {esAdmin && (
                              <button onClick={(e) => { e.stopPropagation(); handleEliminar(p) }}
                                style={{ padding: '5px 12px', backgroundColor: '#ffebee', color: '#c62828', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>
                                Eliminar
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>

                      {pedidoAbierto?.id === p.id && (
                        <tr>
                          <td colSpan={5} style={{ padding: 0, backgroundColor: '#f9fff9', borderBottom: '2px solid #087e0b' }}>
                            {loadingDetalles ? (
                              <p style={{ padding: '20px', textAlign: 'center', color: '#666' }}>Cargando detalle...</p>
                            ) : (
                              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                  <tr style={{ backgroundColor: '#e8f5e9' }}>
                                    <th style={{ ...thStyle, fontSize: '12px', padding: '10px 16px' }}>Código</th>
                                    <th style={{ ...thStyle, fontSize: '12px', padding: '10px 16px' }}>Proveedor</th>
                                    <th style={{ ...thStyle, textAlign: 'right', fontSize: '12px', padding: '10px 16px' }}>Precio</th>
                                    <th style={{ ...thStyle, textAlign: 'right', fontSize: '12px', padding: '10px 16px' }}>Cantidad</th>
                                    <th style={{ ...thStyle, textAlign: 'right', fontSize: '12px', padding: '10px 16px' }}>Subtotal</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {detalles.map((d, di) => (
                                    <tr key={d.id}>
                                      <td style={{ ...tdStyle(di), fontSize: '13px', padding: '9px 16px', fontWeight: 'bold' }}>{d.codigo_insumo}</td>
                                      <td style={{ ...tdStyle(di), fontSize: '13px', padding: '9px 16px', color: '#666' }}>{d.proveedor || '—'}</td>
                                      <td style={{ ...tdStyle(di), fontSize: '13px', padding: '9px 16px', textAlign: 'right' }}>Bs. {Number(d.precio).toFixed(2)}</td>
                                      <td style={{ ...tdStyle(di), fontSize: '13px', padding: '9px 16px', textAlign: 'right' }}>{d.cantidad}</td>
                                      <td style={{ ...tdStyle(di), fontSize: '13px', padding: '9px 16px', textAlign: 'right', fontWeight: 'bold', color: '#087e0b' }}>
                                        Bs. {(Number(d.precio) * Number(d.cantidad)).toFixed(2)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                                <tfoot>
                                  <tr style={{ backgroundColor: '#f0fff0' }}>
                                    <td colSpan={4} style={{ padding: '10px 16px', fontWeight: 'bold', fontSize: '13px', borderTop: '1px solid #a3c47d' }}>Total pedido #{p.codigo_pedido}</td>
                                    <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 'bold', color: '#087e0b', borderTop: '1px solid #a3c47d' }}>
                                      Bs. {Number(p.total || 0).toFixed(2)}
                                    </td>
                                  </tr>
                                </tfoot>
                              </table>
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
