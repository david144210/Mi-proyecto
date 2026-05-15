'use client'
import React, { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

export default function ComprasAceroResponsive() {
  // --- ESTADOS (Se mantienen iguales) ---
  const [usuario, setUsuario] = useState<any>(null)
  const [esAdmin, setEsAdmin] = useState(false)
  const [puedeComprar, setPuedeComprar] = useState(false)
  const [loading, setLoading] = useState(true)
  const [pedidos, setPedidos] = useState<any[]>([])
  const [aceros, setAceros] = useState<any[]>([])
  const [pedidoAbierto, setPedidoAbierto] = useState<any>(null)
  const [detalles, setDetalles] = useState<any[]>([])
  const [loadingDetalles, setLoadingDetalles] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [modalNuevo, setModalNuevo] = useState(false)
  const [modalEditar, setModalEditar] = useState(false)
  const [modalPreview, setModalPreview] = useState(false)
  const [pedidoEditando, setPedidoEditando] = useState<any>(null)
  const [formFecha, setFormFecha] = useState(new Date().toISOString().split('T')[0])
  const [formProveedor, setFormProveedor] = useState('')
  const [formObservaciones, setFormObservaciones] = useState('')
  const [lineas, setLineas] = useState<any[]>([])
  const [lineaActual, setLineaActual] = useState({ codigo_acero: '', precio: '', cantidad: '', proveedor: '' })
  const [guardando, setGuardando] = useState(false)
  const [errorForm, setErrorForm] = useState('')

  useEffect(() => {
    const carnetGuardado = localStorage.getItem('carnet')
    if (!carnetGuardado) { window.location.replace('/'); return }
    supabase.from('personal').select('*, cargos(*)')
      .eq('carnet', carnetGuardado).eq('estado', true).single()
      .then(({ data }) => {
        if (!data) { window.location.replace('/'); return }
        setUsuario(data)
        const admin = data.cargos?.es_admin === true
        const compras = data.cargos?.puede_ver_compras === true || admin
        setEsAdmin(admin)
        setPuedeComprar(compras)
        cargarDatos()
      })
  }, [])

  const cargarDatos = async () => {
    const [{ data: p }, { data: a }] = await Promise.all([
      supabase.from('pedidos_acero').select('*').order('codigo_pedido', { ascending: false }),
      supabase.from('aceros').select('*').order('codigo_acero'),
    ])
    setPedidos(p || [])
    setAceros(a || [])
    setLoading(false)
  }

  const handleSeleccionarAcero = (codigo: string) => {
    const aceroEncontrado = aceros.find(a => a.codigo_acero === codigo)
    if (aceroEncontrado) {
      setLineaActual({
        ...lineaActual,
        codigo_acero: codigo,
        precio: aceroEncontrado.precio_compra || '',
        proveedor: aceroEncontrado.proveedor || formProveedor
      })
    } else {
      setLineaActual({ ...lineaActual, codigo_acero: codigo })
    }
  }

  const verDetalle = async (pedido: any) => {
    if (pedidoAbierto?.id === pedido.id) { setPedidoAbierto(null); setDetalles([]); return }
    setPedidoAbierto(pedido)
    setLoadingDetalles(true)
    const { data } = await supabase.from('pedidos_acero_detalle').select('*').eq('pedido_id', pedido.id).order('id')
    setDetalles(data || [])
    setLoadingDetalles(false)
  }

  const handleConfirmar = async () => {
    setGuardando(true)
    try {
      let pId = pedidoEditando?.id
      let cPed = pedidoEditando?.codigo_pedido
      const total = lineas.reduce((acc, l) => acc + l.subtotal, 0)

      if (modalEditar) {
        await supabase.from('pedidos_acero').update({ fecha: formFecha, proveedor: formProveedor, observaciones: formObservaciones, total }).eq('id', pId)
        await supabase.from('pedidos_acero_detalle').delete().eq('pedido_id', pId)
      } else {
        const { data: max } = await supabase.from('pedidos_acero').select('codigo_pedido').order('codigo_pedido', { ascending: false }).limit(1).single()
        cPed = (max?.codigo_pedido || 0) + 1
        const { data: nPed } = await supabase.from('pedidos_acero').insert({
          codigo_pedido: cPed, fecha: formFecha, proveedor: formProveedor, total, personal_id: usuario.id, observaciones: formObservaciones
        }).select().single()
        pId = nPed.id
      }

      const dets = lineas.map(l => ({ pedido_id: pId, codigo_pedido: cPed, codigo_acero: l.codigo_acero, precio: l.precio, cantidad: l.cantidad, proveedor: l.proveedor }))
      await supabase.from('pedidos_acero_detalle').insert(dets)
      
      setModalPreview(false); setModalNuevo(false); setModalEditar(false); resetForm(); await cargarDatos()
    } catch (e) { setErrorForm('Error al guardar') }
    setGuardando(false)
  }

  const resetForm = () => {
    setFormFecha(new Date().toISOString().split('T')[0]); setFormProveedor(''); setFormObservaciones(''); setLineas([]); setPedidoEditando(null); setLineaActual({ codigo_acero: '', precio: '', cantidad: '', proveedor: '' })
  }

  const pedidosFiltrados = pedidos.filter(p => String(p.codigo_pedido).includes(busqueda) || (p.proveedor || '').toLowerCase().includes(busqueda.toLowerCase()))

  // --- ESTILOS RESPONSIVE ---
  const inputStyle: any = { padding: '10px', borderRadius: '8px', border: '1px solid #ddd', width: '100%', fontSize: '16px' } // 16px evita zoom en iOS

  if (loading) return <p style={{ textAlign: 'center', marginTop: '50px' }}>Cargando...</p>

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', backgroundColor: '#f5f5f5', minHeight: '100vh' }}>
      {/* NAVBAR RESPONSIVE */}
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 20px', backgroundColor: '#222', color: 'white' }}>
        <span style={{ fontWeight: 'bold', fontSize: '14px' }}>Better</span>
        <a href="/sistema" style={{ color: '#a3c47d', textDecoration: 'none', fontSize: '14px' }}>← Volver</a>
      </nav>

      <div style={{ padding: '15px', maxWidth: '1100px', margin: '0 auto' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
          <h2 style={{ margin: 0, fontSize: '20px' }}>Compras de Acero</h2>
          {puedeComprar && (
            <button onClick={() => setModalNuevo(true)} style={{ width: '100%', padding: '12px', backgroundColor: '#087e0b', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold' }}>
              + Nuevo Pedido
            </button>
          )}
        </div>

        <input 
          type="text" 
          placeholder="Buscar por # o proveedor..." 
          value={busqueda} 
          onChange={(e) => setBusqueda(e.target.value)} 
          style={{ ...inputStyle, marginBottom: '20px' }} 
        />

        {/* CONTENEDOR DE TABLA CON SCROLL HORIZONTAL */}
        <div style={{ backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
            <thead>
              <tr style={{ backgroundColor: '#f9f9f9', borderBottom: '2px solid #eee' }}>
                <th style={{ padding: '12px', textAlign: 'left', fontSize: '13px' }}>Pedido</th>
                <th style={{ padding: '12px', textAlign: 'left', fontSize: '13px' }}>Fecha</th>
                <th style={{ padding: '12px', textAlign: 'left', fontSize: '13px' }}>Proveedor</th>
                <th style={{ padding: '12px', textAlign: 'right', fontSize: '13px' }}>Total</th>
                <th style={{ padding: '12px', textAlign: 'center', fontSize: '13px' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {pedidosFiltrados.map((p, i) => (
                <React.Fragment key={p.id}>
                  <tr onClick={() => verDetalle(p)} style={{ borderBottom: '1px solid #eee', cursor: 'pointer' }}>
                    <td style={{ padding: '12px', fontWeight: 'bold', color: '#087e0b' }}>#{p.codigo_pedido}</td>
                    <td style={{ padding: '12px', fontSize: '13px' }}>{p.fecha}</td>
                    <td style={{ padding: '12px', fontSize: '13px' }}>{p.proveedor || '—'}</td>
                    <td style={{ padding: '12px', textAlign: 'right', fontWeight: 'bold', fontSize: '13px' }}>Bs.{Number(p.total).toFixed(1)}</td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      <button style={{ fontSize: '12px' }}>Ver</button>
                    </td>
                  </tr>
                  {pedidoAbierto?.id === p.id && (
                    <tr>
                      <td colSpan={5} style={{ backgroundColor: '#f9fff9', padding: '10px' }}>
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', fontSize: '12px' }}>
                            <tr style={{ color: '#666' }}>
                              <th>Código</th>
                              <th style={{ textAlign: 'right' }}>P. Unit</th>
                              <th style={{ textAlign: 'right' }}>Cant</th>
                              <th style={{ textAlign: 'right' }}>Subt</th>
                            </tr>
                            {detalles.map(d => (
                              <tr key={d.id}>
                                <td>{d.codigo_acero}</td>
                                <td style={{ textAlign: 'right' }}>{d.precio}</td>
                                <td style={{ textAlign: 'right' }}>{d.cantidad}</td>
                                <td style={{ textAlign: 'right', fontWeight: 'bold' }}>{(d.precio * d.cantidad).toFixed(1)}</td>
                              </tr>
                            ))}
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL RESPONSIVE (OCUPA MÁS ANCHO EN MÓVIL) */}
      {(modalNuevo || modalEditar) && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: '10px' }}>
          <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '15px', width: '100%', maxWidth: '600px', maxHeight: '95vh', overflowY: 'auto' }}>
            <h3 style={{ marginTop: 0 }}>{modalEditar ? 'Editar' : 'Nuevo Pedido'}</h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '15px' }}>
              <input type="date" value={formFecha} onChange={e => setFormFecha(e.target.value)} style={inputStyle} />
              <input type="text" placeholder="Proveedor General" value={formProveedor} onChange={e => setFormProveedor(e.target.value)} style={inputStyle} />
            </div>

            <div style={{ backgroundColor: '#f0f0f0', padding: '15px', borderRadius: '10px', marginBottom: '15px' }}>
              <p style={{ margin: '0 0 10px 0', fontWeight: 'bold' }}>Agregar ítem</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <select value={lineaActual.codigo_acero} onChange={e => handleSeleccionarAcero(e.target.value)} style={inputStyle}>
                  <option value="">Seleccionar Acero</option>
                  {aceros.map(a => <option key={a.id} value={a.codigo_acero}>{a.codigo_acero}</option>)}
                </select>
                <div style={{ display: 'flex', gap: '5px' }}>
                  <input type="number" placeholder="Precio" value={lineaActual.precio} onChange={e => setLineaActual({...lineaActual, precio: e.target.value})} style={inputStyle} />
                  <input type="number" placeholder="Cant" value={lineaActual.cantidad} onChange={e => setLineaActual({...lineaActual, cantidad: e.target.value})} style={inputStyle} />
                </div>
                <input type="text" placeholder="Proveedor específico" value={lineaActual.proveedor} onChange={e => setLineaActual({...lineaActual, proveedor: e.target.value})} style={inputStyle} />
                <button onClick={() => {
                  if (!lineaActual.codigo_acero || !lineaActual.precio || !lineaActual.cantidad) return;
                  const p = parseFloat(lineaActual.precio); const c = parseFloat(lineaActual.cantidad);
                  setLineas([...lineas, { ...lineaActual, precio: p, cantidad: c, subtotal: p * c }]);
                  setLineaActual({ codigo_acero: '', precio: '', cantidad: '', proveedor: '' });
                }} style={{ padding: '12px', backgroundColor: '#087e0b', color: 'white', border: 'none', borderRadius: '8px' }}>+ Agregar a la lista</button>
              </div>
            </div>

            {/* LISTA DE ÍTEMS EN MODAL */}
            {lineas.map((l, idx) => (
              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #eee' }}>
                <div style={{ fontSize: '13px' }}>
                  <b>{l.codigo_acero}</b> <br />
                  <small>{l.cantidad} un. x Bs.{l.precio}</small>
                </div>
                <button onClick={() => setLineas(lineas.filter((_, i) => i !== idx))} style={{ color: 'red', border: 'none', background: 'none' }}>Eliminar</button>
              </div>
            ))}

            <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ fontSize: '18px', fontWeight: 'bold', textAlign: 'right' }}>Total: Bs. {lineas.reduce((acc, l) => acc + l.subtotal, 0).toFixed(1)}</div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={() => { setModalNuevo(false); setModalEditar(false); resetForm() }} style={{ flex: 1, padding: '12px' }}>Cerrar</button>
                <button onClick={() => setModalPreview(true)} style={{ flex: 1, padding: '12px', backgroundColor: '#087e0b', color: 'white', border: 'none', borderRadius: '8px' }}>Guardar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE CONFIRMACIÓN */}
      {modalPreview && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000, padding: '20px' }}>
          <div style={{ backgroundColor: 'white', padding: '25px', borderRadius: '15px', width: '100%', maxWidth: '350px', textAlign: 'center' }}>
            <h3>¿Confirmar?</h3>
            <p>Total: <b>Bs. {lineas.reduce((acc, l) => acc + l.subtotal, 0).toFixed(1)}</b></p>
            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button onClick={() => setModalPreview(false)} style={{ flex: 1, padding: '10px' }}>No</button>
              <button onClick={handleConfirmar} style={{ flex: 1, padding: '10px', backgroundColor: '#087e0b', color: 'white', border: 'none', borderRadius: '8px' }}>Sí, Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}