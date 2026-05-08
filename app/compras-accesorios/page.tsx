'use client'
import React, { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

export default function ComprasAccesorios() {
  const [usuario, setUsuario] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const [pedidos, setPedidos] = useState<any[]>([])
  const [accesorios, setAccesorios] = useState<any[]>([])

  const [pedidoAbierto, setPedidoAbierto] = useState<any>(null)
  const [detalles, setDetalles] = useState<any[]>([])

  const [modalNuevo, setModalNuevo] = useState(false)
  const [modalPreview, setModalPreview] = useState(false)

  const [formFecha, setFormFecha] = useState(new Date().toISOString().split('T')[0])
  const [formTransporte, setFormTransporte] = useState('')
  const [formProveedor, setFormProveedor] = useState('')
  const [formObservaciones, setFormObservaciones] = useState('')

  const [lineas, setLineas] = useState<any[]>([])

  const [lineaActual, setLineaActual] = useState({
    codigo_accesorio: '',
    precio: '',
    cantidad: '',
    medida: '',
    proveedor: ''
  })

  const [errorForm, setErrorForm] = useState('')
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    cargarDatos()
  }, [])

  const cargarDatos = async () => {

    const [{ data: pedidosData }, { data: accesoriosData }] = await Promise.all([
      supabase
        .from('pedidos_accesorios')
        .select('*')
        .order('codigo_pedido', { ascending: false }),

      supabase
        .from('accesorios')
        .select('*')
        .order('codigo_accesorio')
    ])

    setPedidos(pedidosData || [])
    setAccesorios(accesoriosData || [])

    setLoading(false)
  }

  const agregarLinea = () => {

    if (!lineaActual.codigo_accesorio || !lineaActual.precio || !lineaActual.cantidad) {
      setErrorForm('Completa código, precio y cantidad')
      return
    }

    const precio = parseFloat(lineaActual.precio)
    const cantidad = parseFloat(lineaActual.cantidad)

    const accesorio = accesorios.find(
      a => a.codigo_accesorio === lineaActual.codigo_accesorio
    )

    setLineas([
      ...lineas,
      {
        codigo_accesorio: lineaActual.codigo_accesorio,
        detalle: accesorio?.detalle || '',
        precio,
        cantidad,
        medida: lineaActual.medida,
        proveedor: lineaActual.proveedor,
        subtotal: precio * cantidad
      }
    ])

    setLineaActual({
      codigo_accesorio: '',
      precio: '',
      cantidad: '',
      medida: '',
      proveedor: ''
    })

    setErrorForm('')
  }

  const eliminarLinea = (index: number) => {
    setLineas(lineas.filter((_, i) => i !== index))
  }

  const totalLineas = lineas.reduce((acc, l) => acc + l.subtotal, 0)
  const transporte = parseFloat(formTransporte) || 0
  const totalPedido = totalLineas + transporte

  const guardarPedido = async () => {

    if (lineas.length === 0) {
      setErrorForm('Debes agregar al menos un ítem')
      return
    }

    setGuardando(true)

    try {

      const { data: ultimoPedido } = await supabase
        .from('pedidos_accesorios')
        .select('codigo_pedido')
        .order('codigo_pedido', { ascending: false })
        .limit(1)
        .single()

      const nuevoCodigo = (ultimoPedido?.codigo_pedido || 0) + 1

      const { data: pedidoCreado, error: errCabecera } = await supabase
        .from('pedidos_accesorios')
        .insert({
          codigo_pedido: nuevoCodigo,
          fecha: formFecha,
          proveedor: formProveedor || null,
          transporte: transporte,
          total: totalPedido,
          observaciones: formObservaciones || null,
          personal_id: usuario?.id || null
        })
        .select()
        .single()

      if (errCabecera) {
        setErrorForm(errCabecera.message)
        setGuardando(false)
        return
      }

      const detalleInsert = lineas.map(l => ({
        pedido_id: pedidoCreado.id,
        codigo_pedido: nuevoCodigo,
        codigo_accesorio: l.codigo_accesorio,
        precio: l.precio,
        cantidad: l.cantidad,
        medida: l.medida,
        proveedor: l.proveedor || null
      }))

      const { error: errDetalle } = await supabase
        .from('pedidos_accesorios_detalle')
        .insert(detalleInsert)

      if (errDetalle) {
        setErrorForm(errDetalle.message)
        setGuardando(false)
        return
      }

      resetForm()
      setModalNuevo(false)

      await cargarDatos()

    } catch (error: any) {
      setErrorForm(error.message)
    }

    setGuardando(false)
  }

  const verDetalle = async (pedido: any) => {

    if (pedidoAbierto?.id === pedido.id) {
      setPedidoAbierto(null)
      setDetalles([])
      return
    }

    setPedidoAbierto(pedido)

    const { data } = await supabase
      .from('pedidos_accesorios_detalle')
      .select('*')
      .eq('pedido_id', pedido.id)
      .order('id')

    setDetalles(data || [])
  }

  const resetForm = () => {

    setFormFecha(new Date().toISOString().split('T')[0])
    setFormTransporte('')
    setFormProveedor('')
    setFormObservaciones('')

    setLineas([])

    setLineaActual({
      codigo_accesorio: '',
      precio: '',
      cantidad: '',
      medida: '',
      proveedor: ''
    })

    setErrorForm('')
  }

  const inputStyle: any = {
    padding: '10px 12px',
    borderRadius: '8px',
    border: '1px solid #ddd',
    width: '100%',
    fontSize: '14px'
  }

  if (loading) {
    return <p style={{ textAlign: 'center', marginTop: '100px' }}>Cargando...</p>
  }

  return (
    <div style={{ background: '#f5f5f5', minHeight: '100vh', padding: '40px', fontFamily: 'Arial' }}>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
        <h1>Compras de Accesorios</h1>

        <button
          onClick={() => setModalNuevo(true)}
          style={{
            background: '#111827',
            color: 'white',
            border: 'none',
            padding: '12px 18px',
            borderRadius: '10px',
            cursor: 'pointer'
          }}
        >
          + Nuevo Pedido
        </button>
      </div>

      <div style={{ background: 'white', borderRadius: '16px', overflow: 'hidden' }}>

        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ background: '#111827', color: 'white' }}>
            <tr>
              <th style={{ padding: '14px', textAlign: 'left' }}>Pedido</th>
              <th style={{ padding: '14px', textAlign: 'left' }}>Fecha</th>
              <th style={{ padding: '14px', textAlign: 'left' }}>Proveedor</th>
              <th style={{ padding: '14px', textAlign: 'left' }}>Transporte</th>
              <th style={{ padding: '14px', textAlign: 'left' }}>Total</th>
              <th style={{ padding: '14px', textAlign: 'center' }}>Acciones</th>
            </tr>
          </thead>

          <tbody>
            {pedidos.map((pedido, index) => (
              <React.Fragment key={pedido.id}>

                <tr style={{ background: index % 2 === 0 ? 'white' : '#fafafa' }}>
                  <td style={{ padding: '14px' }}>#{pedido.codigo_pedido}</td>
                  <td style={{ padding: '14px' }}>{pedido.fecha}</td>
                  <td style={{ padding: '14px' }}>{pedido.proveedor || '-'}</td>
                  <td style={{ padding: '14px' }}>Bs. {pedido.transporte || 0}</td>
                  <td style={{ padding: '14px', fontWeight: 'bold', color: '#15803d' }}>
                    Bs. {pedido.total || 0}
                  </td>

                  <td style={{ padding: '14px', textAlign: 'center' }}>
                    <button
                      onClick={() => verDetalle(pedido)}
                      style={{
                        background: '#2563eb',
                        color: 'white',
                        border: 'none',
                        padding: '8px 12px',
                        borderRadius: '8px',
                        cursor: 'pointer'
                      }}
                    >
                      Ver detalle
                    </button>
                  </td>
                </tr>

                {pedidoAbierto?.id === pedido.id && (
                  <tr>
                    <td colSpan={6} style={{ padding: '20px', background: '#f9fafb' }}>

                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr>
                            <th style={{ padding: '10px', textAlign: 'left' }}>Código</th>
                            <th style={{ padding: '10px', textAlign: 'left' }}>Precio</th>
                            <th style={{ padding: '10px', textAlign: 'left' }}>Cantidad</th>
                            <th style={{ padding: '10px', textAlign: 'left' }}>Medida</th>
                            <th style={{ padding: '10px', textAlign: 'left' }}>Subtotal</th>
                          </tr>
                        </thead>

                        <tbody>
                          {detalles.map((d: any) => (
                            <tr key={d.id}>
                              <td style={{ padding: '10px' }}>{d.codigo_accesorio}</td>
                              <td style={{ padding: '10px' }}>{d.precio}</td>
                              <td style={{ padding: '10px' }}>{d.cantidad}</td>
                              <td style={{ padding: '10px' }}>{d.medida || '-'}</td>
                              <td style={{ padding: '10px' }}>{d.subtotal}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {modalNuevo && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000,
          padding: '20px'
        }}>

          <div style={{
            background: 'white',
            width: '1000px',
            maxWidth: '100%',
            borderRadius: '16px',
            padding: '30px'
          }}>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
              <h2>Nuevo Pedido de Accesorios</h2>

              <button
                onClick={() => {
                  setModalNuevo(false)
                  resetForm()
                }}
                style={{ background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '14px', marginBottom: '20px' }}>

              <div>
                <label>Fecha</label>
                <input type="date" value={formFecha} onChange={(e) => setFormFecha(e.target.value)} style={inputStyle} />
              </div>

              <div>
                <label>Proveedor</label>
                <input type="text" value={formProveedor} onChange={(e) => setFormProveedor(e.target.value)} style={inputStyle} />
              </div>

              <div>
                <label>Transporte</label>
                <input type="number" value={formTransporte} onChange={(e) => setFormTransporte(e.target.value)} style={inputStyle} />
              </div>

              <div>
                <label>Observaciones</label>
                <input type="text" value={formObservaciones} onChange={(e) => setFormObservaciones(e.target.value)} style={inputStyle} />
              </div>
            </div>

            <div style={{ background: '#f9fafb', padding: '20px', borderRadius: '12px', marginBottom: '20px' }}>

              <h3 style={{ marginTop: 0 }}>Agregar línea</h3>

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr auto', gap: '10px', alignItems: 'end' }}>

                <div>
                  <label>Código accesorio</label>

                  <select
                    value={lineaActual.codigo_accesorio}
                    onChange={(e) => setLineaActual({ ...lineaActual, codigo_accesorio: e.target.value })}
                    style={inputStyle}
                  >
                    <option value="">Seleccionar</option>

                    {accesorios.map(acc => (
                      <option key={acc.id} value={acc.codigo_accesorio}>
                        {acc.codigo_accesorio} - {acc.detalle}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label>Precio</label>
                  <input type="number" value={lineaActual.precio} onChange={(e) => setLineaActual({ ...lineaActual, precio: e.target.value })} style={inputStyle} />
                </div>

                <div>
                  <label>Cantidad</label>
                  <input type="number" value={lineaActual.cantidad} onChange={(e) => setLineaActual({ ...lineaActual, cantidad: e.target.value })} style={inputStyle} />
                </div>

                <div>
                  <label>Medida</label>
                  <input type="text" value={lineaActual.medida} onChange={(e) => setLineaActual({ ...lineaActual, medida: e.target.value })} style={inputStyle} />
                </div>

                <div>
                  <label>Proveedor</label>
                  <input type="text" value={lineaActual.proveedor} onChange={(e) => setLineaActual({ ...lineaActual, proveedor: e.target.value })} style={inputStyle} />
                </div>

                <button
                  onClick={agregarLinea}
                  style={{
                    background: '#16a34a',
                    color: 'white',
                    border: 'none',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    cursor: 'pointer'
                  }}
                >
                  Agregar
                </button>
              </div>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px' }}>
              <thead style={{ background: '#111827', color: 'white' }}>
                <tr>
                  <th style={{ padding: '12px', textAlign: 'left' }}>Código</th>
                  <th style={{ padding: '12px', textAlign: 'left' }}>Detalle</th>
                  <th style={{ padding: '12px', textAlign: 'left' }}>Precio</th>
                  <th style={{ padding: '12px', textAlign: 'left' }}>Cantidad</th>
                  <th style={{ padding: '12px', textAlign: 'left' }}>Subtotal</th>
                  <th style={{ padding: '12px' }}></th>
                </tr>
              </thead>

              <tbody>
                {lineas.map((l, i) => (
                  <tr key={i}>
                    <td style={{ padding: '12px' }}>{l.codigo_accesorio}</td>
                    <td style={{ padding: '12px' }}>{l.detalle}</td>
                    <td style={{ padding: '12px' }}>{l.precio}</td>
                    <td style={{ padding: '12px' }}>{l.cantidad}</td>
                    <td style={{ padding: '12px', fontWeight: 'bold', color: '#15803d' }}>
                      {l.subtotal.toFixed(2)}
                    </td>
                    <td style={{ padding: '12px' }}>
                      <button
                        onClick={() => eliminarLinea(i)}
                        style={{
                          background: '#dc2626',
                          color: 'white',
                          border: 'none',
                          padding: '8px 12px',
                          borderRadius: '8px',
                          cursor: 'pointer'
                        }}
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>

              <div>
                {errorForm && (
                  <p style={{ color: 'red', margin: 0 }}>{errorForm}</p>
                )}
              </div>

              <div style={{ textAlign: 'right' }}>
                <p><strong>Subtotal:</strong> Bs. {totalLineas.toFixed(2)}</p>
                <p><strong>Transporte:</strong> Bs. {transporte.toFixed(2)}</p>
                <h2 style={{ color: '#15803d' }}>
                  TOTAL: Bs. {totalPedido.toFixed(2)}
                </h2>

                <button
                  onClick={guardarPedido}
                  disabled={guardando}
                  style={{
                    background: '#2563eb',
                    color: 'white',
                    border: 'none',
                    padding: '14px 24px',
                    borderRadius: '10px',
                    cursor: 'pointer',
                    fontWeight: 'bold'
                  }}
                >
                  {guardando ? 'Guardando...' : 'Guardar Pedido'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}