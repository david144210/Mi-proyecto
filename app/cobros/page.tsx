'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

interface VentaCobro {
  id: number
  cod_venta: number | null
  cod_cliente?: number | null
  cod_vendedor?: number | null
  fecha_pedido?: string | null
  total_venta: number | null
  fecha_entrega: string | null
  hora_entrega?: string | null
  delivery_cotizado?: number | null
  delivery_pagado?: number | null
  anticipo?: number | null
  forma_pago?: string | null
  cod_transaccion?: string | null
  estado: number | null
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

const ESTADOS_VENTA: Record<number, string> = {
  1: 'En cola de produccion',
  2: 'Produciendo',
  3: 'Terminado',
  4: 'Despachado',
  5: 'Cobrado',
}

const fmtMonto = (valor: number | null | undefined) =>
  valor != null
    ? `Bs. ${Number(valor).toLocaleString('es-BO', { minimumFractionDigits: 2 })}`
    : '-'

const fmtFecha = (valor: string | null | undefined) => {
  if (!valor) return '-'
  try {
    return new Date(`${valor}T00:00:00`).toLocaleDateString('es-BO', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  } catch {
    return valor
  }
}

export default function CobrosPage() {
  const [usuario, setUsuario] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [accesoDenegado, setAccesoDenegado] = useState(false)
  const [ventas, setVentas] = useState<VentaCobro[]>([])
  const [loadingVentas, setLoadingVentas] = useState(false)
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(20)
  const [ventaSel, setVentaSel] = useState<VentaCobro | null>(null)
  const [detalle, setDetalle] = useState<DetalleVenta[]>([])
  const [loadingDetalle, setLoadingDetalle] = useState(false)
  const [clienteNombre, setClienteNombre] = useState('')
  const [vendedorNombre, setVendedorNombre] = useState('')
  const [estadoOriginalModal, setEstadoOriginalModal] = useState<number | null>(null)
  const [filtros, setFiltros] = useState({
    estado: '4',
    fechaDesde: '',
    fechaHasta: '',
  })

  useEffect(() => {
    const verificarUsuario = async () => {
      const carnetGuardado = localStorage.getItem('carnet')

      if (!carnetGuardado) {
        window.location.replace('/')
        return
      }

      const { data, error } = await supabase
        .from('personal')
        .select('*, cargos(*)')
        .eq('carnet', carnetGuardado)
        .eq('estado', true)
        .single()

      if (error || !data) {
        window.location.replace('/')
        return
      }

      const puedeVer =
        data?.cargos?.puede_ver_entregas === true ||
        data?.cargos?.puede_ver_entregas === 1 ||
        data?.cargos?.es_admin === true ||
        data?.cargos?.es_admin === 1

      setUsuario(data)
      setAccesoDenegado(!puedeVer)
      setLoading(false)
    }

    verificarUsuario()
  }, [])

  useEffect(() => {
    if (loading || accesoDenegado) return
    cargarVentas()
  }, [loading, accesoDenegado, filtros.estado, filtros.fechaDesde, filtros.fechaHasta, page, pageSize])

  const cargarVentas = async () => {
    setLoadingVentas(true)

    try {
      const from = page * pageSize
      const to = from + pageSize - 1

      let query = supabase
        .from('ventas')
        .select('id, cod_venta, total_venta, fecha_entrega, estado', { count: 'exact' })
        .order('fecha_entrega', { ascending: false })
        .order('cod_venta', { ascending: false })
        .range(from, to)

      if (filtros.estado !== '') {
        query = query.eq('estado', Number(filtros.estado))
      }

      if (filtros.fechaDesde) {
        query = query.gte('fecha_entrega', filtros.fechaDesde)
      }

      if (filtros.fechaHasta) {
        query = query.lte('fecha_entrega', filtros.fechaHasta)
      }

      const { data, count, error } = await query

      if (error) throw error
      setVentas(data || [])
      setTotalCount(count || 0)
    } catch (error) {
      console.error(error)
      alert('Error cargando ventas')
    } finally {
      setLoadingVentas(false)
    }
  }

  const limpiarFiltros = () => {
    setPage(0)
    setFiltros({
      estado: '4',
      fechaDesde: '',
      fechaHasta: '',
    })
  }

  const actualizarFiltro = (campo: keyof typeof filtros, valor: string) => {
    setPage(0)
    setFiltros({ ...filtros, [campo]: valor })
  }

  const abrirDetalle = async (venta: VentaCobro) => {
    if (!venta.cod_venta) return

    setVentaSel(venta)
    setDetalle([])
    setClienteNombre('')
    setVendedorNombre('')
    setLoadingDetalle(true)

    try {
      const [{ data: ventaData, error: ventaError }, { data: detalleData, error: detalleError }] = await Promise.all([
        supabase.from('ventas').select('*').eq('id', venta.id).single(),
        supabase.from('detalle_venta').select('*').eq('cod_venta', venta.cod_venta).order('item'),
      ])

      if (ventaError) throw ventaError
      if (detalleError) throw detalleError

      const ventaCompleta = (ventaData || venta) as VentaCobro
      setVentaSel(ventaCompleta)
      setEstadoOriginalModal(ventaCompleta.estado ?? null)
      setDetalle(detalleData || [])

      if (ventaCompleta.cod_cliente) {
        const { data: cliente } = await supabase
          .from('clientes')
          .select('nombre')
          .eq('id', ventaCompleta.cod_cliente)
          .single()
        setClienteNombre(cliente?.nombre || `ID ${ventaCompleta.cod_cliente}`)
      }

      if (ventaCompleta.cod_vendedor) {
        const { data: vendedor } = await supabase
          .from('vendedores')
          .select('nombre')
          .eq('id', ventaCompleta.cod_vendedor)
          .single()
        setVendedorNombre(vendedor?.nombre || `ID ${ventaCompleta.cod_vendedor}`)
      }
    } catch (error) {
      console.error(error)
      alert('Error cargando detalle de la venta')
      setVentaSel(null)
    } finally {
      setLoadingDetalle(false)
    }
  }

  const cerrarDetalle = () => {
    setVentaSel(null)
    setDetalle([])
    setClienteNombre('')
    setVendedorNombre('')
    setEstadoOriginalModal(null)
  }

  const cambiarEstadoModal = (estado: string) => {
    if (!ventaSel) return
    setVentaSel({
      ...ventaSel,
      estado: estado === '' ? null : Number(estado),
    })
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
  const fromResult = totalCount === 0 ? 0 : page * pageSize + 1
  const toResult = Math.min((page + 1) * pageSize, totalCount)

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', fontFamily: 'Arial, sans-serif' }}>
        Cargando cobros...
      </div>
    )
  }

  if (accesoDenegado) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f5f5f5', fontFamily: 'Arial, sans-serif' }}>
        <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 25px', backgroundColor: '#222', color: 'white' }}>
          <a href="/sistema" style={{ color: 'white', textDecoration: 'none', fontWeight: 'bold', fontSize: '18px' }}>Volver al sistema</a>
          <div style={{ fontWeight: 'bold', color: '#ffb3b3' }}>Acceso denegado</div>
          <div style={{ fontSize: '14px' }}>{usuario?.usuario || usuario?.nombre || 'Usuario'}</div>
        </nav>

        <div style={{ padding: '40px', maxWidth: '760px', margin: '0 auto' }}>
          <div style={{ backgroundColor: 'white', borderRadius: '16px', padding: '32px', boxShadow: '0 2px 12px rgba(0,0,0,0.08)', textAlign: 'center' }}>
            <h1 style={{ marginTop: 0 }}>No tienes permisos para acceder</h1>
            <p style={{ color: '#666', marginBottom: '24px' }}>
              Esta pagina requiere que tu cargo tenga habilitado puede_ver_entregas.
            </p>
            <a href="/sistema" style={{ display: 'inline-block', backgroundColor: '#222', color: 'white', textDecoration: 'none', padding: '12px 18px', borderRadius: '10px', fontWeight: 'bold' }}>
              Ir al sistema
            </a>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f5f5f5', fontFamily: 'Arial, sans-serif' }}>
      <style>{`
        .cobros-page {
          padding: 32px 40px;
          max-width: 1200px;
          margin: 0 auto;
        }

        .ventas-mobile {
          display: none;
        }

        .fila-venta:hover {
          background-color: #f8fbff;
        }

        .detalle-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
          margin-bottom: 22px;
        }

        .modal-cobro {
          background: white;
          border-radius: 16px;
          box-shadow: 0 8px 40px rgba(0,0,0,0.22);
          margin: 20px;
          max-width: 920px;
          padding: 28px;
          width: 100%;
        }

        @media (max-width: 700px) {
          .cobros-page {
            padding: 20px 14px;
          }

          .ventas-table-wrap {
            display: none;
          }

          .ventas-mobile {
            display: grid;
            gap: 12px;
            padding: 14px;
          }

          .detalle-grid {
            grid-template-columns: 1fr;
          }

          .modal-cobro {
            border-radius: 12px;
            margin: 10px;
            padding: 18px;
          }
        }
      `}</style>

      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 25px', backgroundColor: '#222', color: 'white', flexWrap: 'wrap', gap: '10px' }}>
        <a href="/sistema" style={{ color: 'white', textDecoration: 'none', fontWeight: 'bold', fontSize: '18px' }}>
          Volver al sistema
        </a>

        <div style={{ fontWeight: 'bold', color: '#90caf9' }}>
          Registro de Cobros
        </div>

        <div style={{ fontSize: '14px' }}>
          {usuario?.usuario || usuario?.nombre || 'Usuario'}
        </div>
      </nav>

      <div className="cobros-page">
        <div style={{ marginBottom: '24px' }}>
          <h1 style={{ margin: 0, marginBottom: '8px' }}>Cobros de pedidos</h1>
          <p style={{ color: '#666', margin: 0 }}>
            Consulta las ventas por estado o fecha de entrega.
          </p>
        </div>

        <div style={{ backgroundColor: 'white', borderRadius: '16px', padding: '24px', boxShadow: '0 2px 12px rgba(0,0,0,0.08)', marginBottom: '20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px', alignItems: 'end' }}>
            <label style={{ display: 'grid', gap: '6px', fontWeight: 'bold', color: '#333' }}>
              Estado
              <select
                value={filtros.estado}
                onChange={(e) => actualizarFiltro('estado', e.target.value)}
                style={{ padding: '10px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px' }}
              >
                <option value="">Todos</option>
                <option value="1">1 - En cola de produccion</option>
                <option value="2">2 - Produciendo</option>
                <option value="3">3 - Terminado</option>
                <option value="4">4 - Despachado</option>
                <option value="5">5 - Cobrado</option>
              </select>
            </label>

            <label style={{ display: 'grid', gap: '6px', fontWeight: 'bold', color: '#333' }}>
              Desde
              <input
                type="date"
                value={filtros.fechaDesde}
                onChange={(e) => actualizarFiltro('fechaDesde', e.target.value)}
                style={{ padding: '10px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px' }}
              />
            </label>

            <label style={{ display: 'grid', gap: '6px', fontWeight: 'bold', color: '#333' }}>
              Hasta
              <input
                type="date"
                value={filtros.fechaHasta}
                onChange={(e) => actualizarFiltro('fechaHasta', e.target.value)}
                style={{ padding: '10px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px' }}
              />
            </label>

            <label style={{ display: 'grid', gap: '6px', fontWeight: 'bold', color: '#333' }}>
              Ver
              <select
                value={pageSize}
                onChange={(e) => {
                  setPage(0)
                  setPageSize(Number(e.target.value))
                }}
                style={{ padding: '10px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px' }}
              >
                <option value={10}>10 registros</option>
                <option value={20}>20 registros</option>
              </select>
            </label>

            <button
              onClick={limpiarFiltros}
              style={{ border: 'none', backgroundColor: '#222', color: 'white', padding: '11px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
            >
              Limpiar filtros
            </button>
          </div>
        </div>

        <div style={{ backgroundColor: 'white', borderRadius: '16px', padding: '0', boxShadow: '0 2px 12px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
          <div style={{ padding: '20px 24px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontSize: '20px' }}>Ventas</h2>
            <span style={{ color: '#666', fontSize: '14px' }}>
              {loadingVentas ? 'Cargando...' : `${fromResult}-${toResult} de ${totalCount} resultado(s)`}
            </span>
          </div>

          {loadingVentas ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
              Cargando ventas...
            </div>
          ) : ventas.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
              No hay ventas con esos filtros.
            </div>
          ) : (
            <>
            <div className="ventas-table-wrap" style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '680px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f7f7f7', color: '#333', textAlign: 'left' }}>
                    <th style={{ padding: '14px 18px', borderBottom: '1px solid #eee' }}>Codigo venta</th>
                    <th style={{ padding: '14px 18px', borderBottom: '1px solid #eee' }}>Monto total</th>
                    <th style={{ padding: '14px 18px', borderBottom: '1px solid #eee' }}>Fecha entrega</th>
                    <th style={{ padding: '14px 18px', borderBottom: '1px solid #eee' }}>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {ventas.map((venta) => (
                    <tr
                      key={venta.id}
                      className="fila-venta"
                      onClick={() => abrirDetalle(venta)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td style={{ padding: '14px 18px', borderBottom: '1px solid #f0f0f0', fontWeight: 'bold' }}>
                        #{venta.cod_venta || '-'}
                      </td>
                      <td style={{ padding: '14px 18px', borderBottom: '1px solid #f0f0f0', color: '#2e7d32', fontWeight: 'bold' }}>
                        {fmtMonto(venta.total_venta)}
                      </td>
                      <td style={{ padding: '14px 18px', borderBottom: '1px solid #f0f0f0' }}>
                        {fmtFecha(venta.fecha_entrega)}
                      </td>
                      <td style={{ padding: '14px 18px', borderBottom: '1px solid #f0f0f0' }}>
                        <span style={{ display: 'inline-block', backgroundColor: '#eef3ff', color: '#1b4d89', padding: '5px 10px', borderRadius: '999px', fontWeight: 'bold', fontSize: '13px' }}>
                          {venta.estado != null ? `${venta.estado} - ${ESTADOS_VENTA[venta.estado] || 'Sin nombre'}` : '-'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="ventas-mobile">
              {ventas.map((venta) => (
                <div
                  key={venta.id}
                  onClick={() => abrirDetalle(venta)}
                  style={{ border: '1px solid #eee', borderRadius: '12px', padding: '14px', backgroundColor: '#fff', cursor: 'pointer' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'flex-start', marginBottom: '12px' }}>
                    <div style={{ fontWeight: 'bold', fontSize: '18px' }}>#{venta.cod_venta || '-'}</div>
                    <span style={{ display: 'inline-block', backgroundColor: '#eef3ff', color: '#1b4d89', padding: '5px 9px', borderRadius: '999px', fontWeight: 'bold', fontSize: '12px', textAlign: 'center' }}>
                      {venta.estado != null ? `${venta.estado} - ${ESTADOS_VENTA[venta.estado] || 'Sin nombre'}` : '-'}
                    </span>
                  </div>

                  <div style={{ display: 'grid', gap: '8px', color: '#444' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                      <span>Monto total</span>
                      <strong style={{ color: '#2e7d32' }}>{fmtMonto(venta.total_venta)}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                      <span>Fecha entrega</span>
                      <strong>{fmtFecha(venta.fecha_entrega)}</strong>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            </>
          )}

          {!loadingVentas && totalCount > 0 && (
            <div style={{ padding: '16px 20px', borderTop: '1px solid #eee', display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={() => setPage(Math.max(0, page - 1))}
                disabled={page === 0}
                style={{ border: 'none', backgroundColor: page === 0 ? '#ddd' : '#222', color: page === 0 ? '#777' : 'white', padding: '10px 14px', borderRadius: '8px', cursor: page === 0 ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}
              >
                Anterior
              </button>

              <span style={{ color: '#555', fontWeight: 'bold' }}>
                Pagina {page + 1} de {totalPages}
              </span>

              <button
                onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                disabled={page >= totalPages - 1}
                style={{ border: 'none', backgroundColor: page >= totalPages - 1 ? '#ddd' : '#222', color: page >= totalPages - 1 ? '#777' : 'white', padding: '10px 14px', borderRadius: '8px', cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}
              >
                Siguiente
              </button>
            </div>
          )}
        </div>
      </div>

      {ventaSel && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, overflowY: 'auto', display: 'flex', alignItems: 'flex-start', justifyContent: 'center' }}>
          <div className="modal-cobro">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '14px', alignItems: 'flex-start', marginBottom: '22px', flexWrap: 'wrap' }}>
              <div>
                <h2 style={{ margin: '0 0 6px', fontSize: '22px' }}>Venta #{ventaSel.cod_venta}</h2>
                <p style={{ margin: 0, color: '#666' }}>
                  {clienteNombre || 'Cliente no cargado'}
                </p>
              </div>

              <button
                onClick={cerrarDetalle}
                style={{ border: '1px solid #ddd', backgroundColor: 'white', color: '#333', padding: '9px 14px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
              >
                Cerrar
              </button>
            </div>

            {loadingDetalle ? (
              <div style={{ padding: '36px', textAlign: 'center', color: '#666' }}>
                Cargando detalle...
              </div>
            ) : (
              <>
                <div style={{ backgroundColor: '#f7f7f7', borderRadius: '12px', padding: '16px', marginBottom: '18px', display: 'grid', gap: '8px' }}>
                  <label style={{ display: 'grid', gap: '6px', fontWeight: 'bold', color: '#333' }}>
                    Estado del pedido
                    <select
                      value={ventaSel.estado ?? ''}
                      onChange={(e) => cambiarEstadoModal(e.target.value)}
                      disabled={estadoOriginalModal !== 4 && estadoOriginalModal !== 5}
                      style={{ padding: '10px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px', backgroundColor: 'white' }}
                    >
                      <option value="4">4 - Despachado</option>
                      <option value="5">5 - Cobrado</option>
                    </select>
                  </label>

                  {ventaSel.estado !== estadoOriginalModal && (
                    <div style={{ color: '#8a5a00', backgroundColor: '#fff8e1', border: '1px solid #ffe082', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', fontWeight: 'bold' }}>
                      Cambio local pendiente. Todavia no se guarda en la base de datos.
                    </div>
                  )}
                </div>

                <div className="detalle-grid">
                  {([
                    ['Cliente', clienteNombre || (ventaSel.cod_cliente ? `ID ${ventaSel.cod_cliente}` : '-')],
                    ['Vendedor', vendedorNombre || (ventaSel.cod_vendedor ? `ID ${ventaSel.cod_vendedor}` : '-')],
                    ['Estado', ventaSel.estado != null ? `${ventaSel.estado} - ${ESTADOS_VENTA[ventaSel.estado] || 'Sin nombre'}` : '-'],
                    ['Fecha pedido', fmtFecha(ventaSel.fecha_pedido)],
                    ['Fecha entrega', fmtFecha(ventaSel.fecha_entrega)],
                    ['Hora entrega', ventaSel.hora_entrega || '-'],
                    ['Forma de pago', ventaSel.forma_pago?.replace('_', ' ') || '-'],
                    ['Anticipo', fmtMonto(ventaSel.anticipo)],
                    ['Total venta', fmtMonto(ventaSel.total_venta)],
                    ['Delivery cotizado', fmtMonto(ventaSel.delivery_cotizado)],
                    ['Delivery pagado', fmtMonto(ventaSel.delivery_pagado)],
                    ['Codigo transaccion', ventaSel.cod_transaccion || '-'],
                  ] as [string, string][]).map(([label, value]) => (
                    <div key={label} style={{ backgroundColor: '#f7f7f7', borderRadius: '10px', padding: '12px 14px' }}>
                      <div style={{ color: '#777', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px', textTransform: 'uppercase' }}>{label}</div>
                      <div style={{ color: '#222', fontWeight: 'bold', wordBreak: 'break-word' }}>{value}</div>
                    </div>
                  ))}
                </div>

                <h3 style={{ margin: '0 0 12px', fontSize: '18px' }}>Productos ({detalle.length})</h3>

                {detalle.length === 0 ? (
                  <div style={{ padding: '24px', textAlign: 'center', color: '#666', border: '1px solid #eee', borderRadius: '12px' }}>
                    Esta venta no tiene productos registrados.
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto', border: '1px solid #eee', borderRadius: '12px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '760px' }}>
                      <thead>
                        <tr style={{ backgroundColor: '#f7f7f7', textAlign: 'left' }}>
                          <th style={{ padding: '12px', borderBottom: '1px solid #eee' }}>Item</th>
                          <th style={{ padding: '12px', borderBottom: '1px solid #eee' }}>Producto</th>
                          <th style={{ padding: '12px', borderBottom: '1px solid #eee' }}>Cantidad</th>
                          <th style={{ padding: '12px', borderBottom: '1px solid #eee' }}>Precio vendido</th>
                          <th style={{ padding: '12px', borderBottom: '1px solid #eee' }}>Subtotal</th>
                          <th style={{ padding: '12px', borderBottom: '1px solid #eee' }}>Detalle</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detalle.map((linea) => (
                          <tr key={linea.id}>
                            <td style={{ padding: '12px', borderBottom: '1px solid #f0f0f0' }}>{linea.item ?? '-'}</td>
                            <td style={{ padding: '12px', borderBottom: '1px solid #f0f0f0', fontWeight: 'bold' }}>{linea.cod_producto || '-'}</td>
                            <td style={{ padding: '12px', borderBottom: '1px solid #f0f0f0' }}>{linea.cantidad ?? '-'}</td>
                            <td style={{ padding: '12px', borderBottom: '1px solid #f0f0f0' }}>{fmtMonto(linea.precio_vendido)}</td>
                            <td style={{ padding: '12px', borderBottom: '1px solid #f0f0f0', fontWeight: 'bold', color: '#2e7d32' }}>{fmtMonto(linea.subtotal)}</td>
                            <td style={{ padding: '12px', borderBottom: '1px solid #f0f0f0', color: '#555' }}>
                              {[linea.dimensiones, linea.color_estructura, linea.color_melamina].filter(Boolean).join(' / ') || '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
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
