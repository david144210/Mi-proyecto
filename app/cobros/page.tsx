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
  destino: string | null
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

interface CobranzaForm {
  saldo: string
  fecha_pago: string
  comprobante: string
  observaciones: string
  tipo_pago: string
  valoracion: string
  descuentos: string
  total_cobrado: string
  delivery: string
}

interface ReprogramacionForm {
  fecha_entrega: string
}

interface ResumenPedidos {
  estado1: number
  estado2: number
  estado3: number
  estado4: number
  reprogramados: number
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

const getFechaEntregaStyle = (fecha: string | null | undefined, estado: number | null | undefined) => {
  if (!fecha) return {}

  if (estado === 4) {
    return {
      backgroundColor: '#e3f2fd',
      color: '#0d47a1',
      border: '1px solid #90caf9',
    }
  }

  const hoy = new Date()
  const hoyStr = [
    hoy.getFullYear(),
    String(hoy.getMonth() + 1).padStart(2, '0'),
    String(hoy.getDate()).padStart(2, '0'),
  ].join('-')

  if (fecha === hoyStr) {
    return {
      backgroundColor: '#e8f5e9',
      color: '#1b5e20',
      border: '1px solid #a5d6a7',
    }
  }

  if (fecha > hoyStr) {
    return {
      backgroundColor: '#fff8e1',
      color: '#8a5a00',
      border: '1px solid #ffe082',
    }
  }

  if (fecha < hoyStr && (estado ?? 0) < 4) {
    return {
      backgroundColor: '#ffebee',
      color: '#b71c1c',
      border: '1px solid #ef9a9a',
    }
  }

  return {}
}

const FechaEntregaBadge = ({ fecha, estado }: { fecha: string | null | undefined; estado: number | null | undefined }) => (
  <span
    style={{
      display: 'inline-block',
      padding: '5px 9px',
      borderRadius: '8px',
      fontWeight: 'bold',
      ...getFechaEntregaStyle(fecha, estado),
    }}
  >
    {fmtFecha(fecha)}
  </span>
)

const fechaLocalHoy = () => {
  const hoy = new Date()
  return [
    hoy.getFullYear(),
    String(hoy.getMonth() + 1).padStart(2, '0'),
    String(hoy.getDate()).padStart(2, '0'),
  ].join('-')
}

export default function CobrosPage() {
  const [usuario, setUsuario] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [accesoDenegado, setAccesoDenegado] = useState(false)
  const [ventas, setVentas] = useState<VentaCobro[]>([])
  const [loadingVentas, setLoadingVentas] = useState(false)
  const [loadingResumen, setLoadingResumen] = useState(false)
  const [resumenPedidos, setResumenPedidos] = useState<ResumenPedidos>({
    estado1: 0,
    estado2: 0,
    estado3: 0,
    estado4: 0,
    reprogramados: 0,
  })
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(20)
  const [ventaSel, setVentaSel] = useState<VentaCobro | null>(null)
  const [detalle, setDetalle] = useState<DetalleVenta[]>([])
  const [loadingDetalle, setLoadingDetalle] = useState(false)
  const [clienteNombre, setClienteNombre] = useState('')
  const [vendedorNombre, setVendedorNombre] = useState('')
  const [mostrarFormularioCobro, setMostrarFormularioCobro] = useState(false)
  const [mostrarFormularioReprogramacion, setMostrarFormularioReprogramacion] = useState(false)
  const [guardandoCobro, setGuardandoCobro] = useState(false)
  const [guardandoReprogramacion, setGuardandoReprogramacion] = useState(false)
  const [formCobro, setFormCobro] = useState<CobranzaForm>({
    saldo: '',
    fecha_pago: fechaLocalHoy(),
    comprobante: '',
    observaciones: '',
    tipo_pago: '',
    valoracion: '',
    descuentos: '0',
    total_cobrado: '',
    delivery: '',
  })
  const [formReprogramacion, setFormReprogramacion] = useState<ReprogramacionForm>({
    fecha_entrega: '',
  })
  const [filtros, setFiltros] = useState({
    estado: '4',
    fechaDesde: '',
    fechaHasta: '',
  })

  const cargarResumenPedidos = async () => {
    setLoadingResumen(true)

    try {
      const [
        estado1Result,
        estado2Result,
        estado3Result,
        estado4Result,
        reprogramadosResult,
      ] = await Promise.all([
        supabase.from('ventas').select('id', { count: 'exact', head: true }).eq('estado', 1),
        supabase.from('ventas').select('id', { count: 'exact', head: true }).eq('estado', 2),
        supabase.from('ventas').select('id', { count: 'exact', head: true }).eq('estado', 3),
        supabase.from('ventas').select('id', { count: 'exact', head: true }).eq('estado', 4),
        supabase
          .from('progreso_produccion')
          .select('id', { count: 'exact', head: true })
          .eq('reprogramado', true)
          .in('estado', [1, 2, 3, 4]),
      ])

      const error =
        estado1Result.error ||
        estado2Result.error ||
        estado3Result.error ||
        estado4Result.error ||
        reprogramadosResult.error

      if (error) throw error

      setResumenPedidos({
        estado1: estado1Result.count || 0,
        estado2: estado2Result.count || 0,
        estado3: estado3Result.count || 0,
        estado4: estado4Result.count || 0,
        reprogramados: reprogramadosResult.count || 0,
      })
    } catch (error) {
      console.error(error)
      alert('Error cargando resumen de pedidos')
    } finally {
      setLoadingResumen(false)
    }
  }

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
    cargarResumenPedidos()
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
    setMostrarFormularioCobro(false)
    setMostrarFormularioReprogramacion(false)
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
      setDetalle(detalleData || [])
      prepararFormularioCobro(ventaCompleta)
      prepararFormularioReprogramacion(ventaCompleta)

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
    setMostrarFormularioCobro(false)
    setMostrarFormularioReprogramacion(false)
  }

  const prepararFormularioCobro = (venta: VentaCobro) => {
    const saldo = Math.max(0, Number(venta.total_venta || 0) - Number(venta.anticipo || 0))
    const delivery = Number(venta.delivery_pagado ?? venta.delivery_cotizado ?? 0)

    setFormCobro({
      saldo: saldo.toFixed(2),
      fecha_pago: fechaLocalHoy(),
      comprobante: '',
      observaciones: '',
      tipo_pago: venta.forma_pago || '',
      valoracion: '',
      descuentos: '0',
      total_cobrado: saldo.toFixed(2),
      delivery: Number.isFinite(delivery) ? String(Math.round(delivery)) : '0',
    })
  }

  const actualizarFormCobro = (campo: keyof CobranzaForm, valor: string) => {
    setFormCobro(prev => ({ ...prev, [campo]: valor }))
  }

  const prepararFormularioReprogramacion = (venta: VentaCobro) => {
    setFormReprogramacion({
      fecha_entrega: venta.fecha_entrega || fechaLocalHoy(),
    })
  }

  const abrirFormularioCobro = () => {
    setMostrarFormularioCobro(prev => !prev)
    setMostrarFormularioReprogramacion(false)
  }

  const abrirFormularioReprogramacion = () => {
    setMostrarFormularioReprogramacion(prev => !prev)
    setMostrarFormularioCobro(false)
  }

  const registrarCobro = async () => {
    if (!ventaSel?.cod_venta) return

    if (ventaSel.estado !== 4) {
      alert('Solo se puede registrar cobro de ventas en estado 4 - Despachado')
      return
    }

    const saldo = Number(formCobro.saldo || 0)
    const descuentos = Number(formCobro.descuentos || 0)
    const totalCobrado = Number(formCobro.total_cobrado || 0)
    const delivery = Number(formCobro.delivery || 0)
    const valoracion = formCobro.valoracion ? Number(formCobro.valoracion) : null

    if (!formCobro.fecha_pago) {
      alert('La fecha de pago es obligatoria')
      return
    }

    if (!Number.isFinite(totalCobrado) || totalCobrado < 0) {
      alert('El total cobrado no es valido')
      return
    }

    if (valoracion != null && (valoracion < 1 || valoracion > 10)) {
      alert('La valoracion debe estar entre 1 y 10')
      return
    }

    const confirmar = confirm(`Registrar cobro de la venta #${ventaSel.cod_venta} y cambiar estado a COBRADO?`)
    if (!confirmar) return

    try {
      setGuardandoCobro(true)

      const { error: insertError } = await supabase
        .from('cobranzas')
        .insert({
          cod_venta: ventaSel.cod_venta,
          saldo: Number.isFinite(saldo) ? saldo : 0,
          fecha_pago: formCobro.fecha_pago,
          comprobante: formCobro.comprobante || null,
          observaciones: formCobro.observaciones || null,
          tipo_pago: formCobro.tipo_pago || null,
          valoracion,
          descuentos: Number.isFinite(descuentos) ? descuentos : 0,
          total_cobrado: Number.isFinite(totalCobrado) ? totalCobrado : 0,
          delivery: Number.isFinite(delivery) ? Math.round(delivery) : 0,
        })

      if (insertError) throw insertError

      const { error: updateError } = await supabase
        .from('ventas')
        .update({ estado: 5 })
        .eq('cod_venta', ventaSel.cod_venta)
        .eq('estado', 4)

      if (updateError) throw updateError

      const { error: progresoError } = await supabase
        .from('progreso_produccion')
        .update({
          estado: 5,
          fecha_entregado: formCobro.fecha_pago,
          updated_at: new Date().toISOString(),
        })
        .eq('codigo_pedido', ventaSel.cod_venta)

      if (progresoError) throw progresoError

      const ventaActualizada = { ...ventaSel, estado: 5 }
      setVentaSel(ventaActualizada)
      setVentas(prev => prev.map(v => v.cod_venta === ventaSel.cod_venta ? { ...v, estado: 5 } : v))
      setMostrarFormularioCobro(false)
      await cargarVentas()
      await cargarResumenPedidos()
      alert('Cobro registrado correctamente')
    } catch (error) {
      console.error(error)
      alert('Error registrando el cobro')
    } finally {
      setGuardandoCobro(false)
    }
  }

  const reprogramarPedido = async () => {
    if (!ventaSel?.cod_venta) return

    if (!formReprogramacion.fecha_entrega) {
      alert('Debes colocar la nueva fecha de entrega')
      return
    }

    const confirmar = confirm(`Reprogramar la venta #${ventaSel.cod_venta} para ${formReprogramacion.fecha_entrega}?`)
    if (!confirmar) return

    try {
      setGuardandoReprogramacion(true)

      const { error: ventaError } = await supabase
        .from('ventas')
        .update({ fecha_entrega: formReprogramacion.fecha_entrega })
        .eq('cod_venta', ventaSel.cod_venta)

      if (ventaError) throw ventaError

      const { error: progresoError } = await supabase
        .from('progreso_produccion')
        .update({
          reprogramado: true,
          updated_at: new Date().toISOString(),
        })
        .eq('codigo_pedido', ventaSel.cod_venta)

      if (progresoError) throw progresoError

      const ventaActualizada = { ...ventaSel, fecha_entrega: formReprogramacion.fecha_entrega }
      setVentaSel(ventaActualizada)
      setVentas(prev => prev.map(v => v.cod_venta === ventaSel.cod_venta ? { ...v, fecha_entrega: formReprogramacion.fecha_entrega } : v))
      setMostrarFormularioReprogramacion(false)
      await cargarVentas()
      await cargarResumenPedidos()
      alert('Pedido reprogramado correctamente')
    } catch (error) {
      console.error(error)
      alert('Error reprogramando el pedido')
    } finally {
      setGuardandoReprogramacion(false)
    }
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

        .resumen-cobros {
          display: grid;
          grid-template-columns: repeat(5, minmax(140px, 1fr));
          gap: 12px;
          margin-bottom: 20px;
        }

        .resumen-cobros-card {
          border: 1px solid #e0e0e0;
          border-radius: 12px;
          box-shadow: 0 2px 12px rgba(0,0,0,0.08);
          padding: 16px;
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

          .resumen-cobros {
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

        <div className="resumen-cobros">
          {([
            ['Estado 1', ESTADOS_VENTA[1], resumenPedidos.estado1, '#eef7ee', '#1b5e20'],
            ['Estado 2', ESTADOS_VENTA[2], resumenPedidos.estado2, '#fff8e1', '#8a5a00'],
            ['Estado 3', ESTADOS_VENTA[3], resumenPedidos.estado3, '#e3f2fd', '#0d47a1'],
            ['Estado 4', ESTADOS_VENTA[4], resumenPedidos.estado4, '#eef3ff', '#1b4d89'],
            ['Reprogramados', 'Total activo', resumenPedidos.reprogramados, '#ffebee', '#b71c1c'],
          ] as [string, string, number, string, string][]).map(([titulo, subtitulo, total, fondo, color]) => (
            <div
              key={titulo}
              className="resumen-cobros-card"
              style={{
                backgroundColor: fondo,
                borderColor: color === '#b71c1c' ? '#ef9a9a' : '#e0e0e0',
              }}
            >
              <div style={{ color, fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '8px' }}>
                {titulo}
              </div>
              <div style={{ color, fontSize: '30px', lineHeight: 1, fontWeight: 'bold', marginBottom: '8px' }}>
                {loadingResumen ? '-' : total}
              </div>
              <div style={{ color: '#555', fontSize: '13px', fontWeight: 'bold' }}>
                {subtitulo}
              </div>
            </div>
          ))}
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
              style={{ border: 'none', backgroundColor: '#11a10c', color: 'white', padding: '11px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
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
                        <FechaEntregaBadge fecha={venta.fecha_entrega} estado={venta.estado} />
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
                      <FechaEntregaBadge fecha={venta.fecha_entrega} estado={venta.estado} />
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
                <div style={{ backgroundColor: '#f7f7f7', borderRadius: '12px', padding: '16px', marginBottom: '18px', display: 'grid', gap: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ color: '#777', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px', textTransform: 'uppercase' }}>Estado actual</div>
                      <div style={{ color: '#222', fontWeight: 'bold' }}>
                        {ventaSel.estado != null ? `${ventaSel.estado} - ${ESTADOS_VENTA[ventaSel.estado] || 'Sin nombre'}` : '-'}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                      {ventaSel.estado === 4 && (
                        <button
                          onClick={abrirFormularioCobro}
                          style={{ border: 'none', backgroundColor: '#0d47a1', color: 'white', padding: '11px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
                        >
                          {mostrarFormularioCobro ? 'Ocultar cobro' : 'Registrar cobro'}
                        </button>
                      )}

                      {ventaSel.estado !== 5 && (
                        <button
                          onClick={abrirFormularioReprogramacion}
                          style={{ border: 'none', backgroundColor: '#8a5a00', color: 'white', padding: '11px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
                        >
                          {mostrarFormularioReprogramacion ? 'Ocultar reprogramacion' : 'Reprogramar pedido'}
                        </button>
                      )}
                    </div>
                  </div>

                  {ventaSel.estado !== 4 && (
                    <div style={{ color: '#555', backgroundColor: '#eef3ff', border: '1px solid #c5d8ff', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', fontWeight: 'bold' }}>
                      El registro de cobro se habilita solamente para pedidos despachados.
                    </div>
                  )}

                  {mostrarFormularioCobro && (
                    <div style={{ backgroundColor: 'white', border: '1px solid #e5e5e5', borderRadius: '12px', padding: '16px', display: 'grid', gap: '14px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
                        <label style={{ display: 'grid', gap: '6px', fontWeight: 'bold', color: '#333' }}>
                          Fecha pago
                          <input
                            type="date"
                            value={formCobro.fecha_pago}
                            onChange={(e) => actualizarFormCobro('fecha_pago', e.target.value)}
                            style={{ padding: '10px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px' }}
                          />
                        </label>

                        <label style={{ display: 'grid', gap: '6px', fontWeight: 'bold', color: '#333' }}>
                          Saldo
                          <input
                            type="number"
                            step="0.01"
                            value={formCobro.saldo}
                            onChange={(e) => actualizarFormCobro('saldo', e.target.value)}
                            style={{ padding: '10px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px' }}
                          />
                        </label>

                        <label style={{ display: 'grid', gap: '6px', fontWeight: 'bold', color: '#333' }}>
                          Total cobrado
                          <input
                            type="number"
                            step="0.01"
                            value={formCobro.total_cobrado}
                            onChange={(e) => actualizarFormCobro('total_cobrado', e.target.value)}
                            style={{ padding: '10px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px' }}
                          />
                        </label>

                        <label style={{ display: 'grid', gap: '6px', fontWeight: 'bold', color: '#333' }}>
                          Delivery
                          <input
                            type="number"
                            value={formCobro.delivery}
                            onChange={(e) => actualizarFormCobro('delivery', e.target.value)}
                            style={{ padding: '10px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px' }}
                          />
                        </label>

                        <label style={{ display: 'grid', gap: '6px', fontWeight: 'bold', color: '#333' }}>
                          Descuentos
                          <input
                            type="number"
                            step="0.01"
                            value={formCobro.descuentos}
                            onChange={(e) => actualizarFormCobro('descuentos', e.target.value)}
                            style={{ padding: '10px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px' }}
                          />
                        </label>

                        <label style={{ display: 'grid', gap: '6px', fontWeight: 'bold', color: '#333' }}>
                          Tipo pago
                          <input
                            value={formCobro.tipo_pago}
                            onChange={(e) => actualizarFormCobro('tipo_pago', e.target.value)}
                            placeholder="EFECTIVO, TRANSFERENCIA..."
                            style={{ padding: '10px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px' }}
                          />
                        </label>

                        <label style={{ display: 'grid', gap: '6px', fontWeight: 'bold', color: '#333' }}>
                          Comprobante
                          <input
                            value={formCobro.comprobante}
                            onChange={(e) => actualizarFormCobro('comprobante', e.target.value)}
                            style={{ padding: '10px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px' }}
                          />
                        </label>

                        <label style={{ display: 'grid', gap: '6px', fontWeight: 'bold', color: '#333' }}>
                          Valoracion 1-10
                          <input
                            type="number"
                            min="1"
                            max="10"
                            value={formCobro.valoracion}
                            onChange={(e) => actualizarFormCobro('valoracion', e.target.value)}
                            style={{ padding: '10px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px' }}
                          />
                        </label>
                      </div>

                      <label style={{ display: 'grid', gap: '6px', fontWeight: 'bold', color: '#333' }}>
                        Observaciones
                        <textarea
                          value={formCobro.observaciones}
                          onChange={(e) => actualizarFormCobro('observaciones', e.target.value)}
                          rows={3}
                          style={{ padding: '10px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px', resize: 'vertical' }}
                        />
                      </label>

                      <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: '10px',
                        flexWrap: 'wrap',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          gap: '10px',
                          flexWrap: 'wrap',
                        }}
                      >
                        <button
                          onClick={async () => {
                          if (!ventaSel) return

                          const saldo = Number(formCobro.total_cobrado || 0)

                          const mensaje = `*N° PEDIDO:* ${ventaSel.cod_venta}
*1. Responsable de Entrega:* ${
                            usuario?.usuario || usuario?.nombre || 'Usuario'
                          }
*2. Anticipo:* ${fmtMonto(ventaSel.anticipo)}
*3. Saldo cobrado:* ${fmtMonto(saldo)}
  *3.1. Comprobante:* ${formCobro.comprobante || '-'}
*4. Descuento:* ${fmtMonto(
                            Number(formCobro.descuentos || 0)
                          )}
*5. Fecha Entrega:* ${fmtFecha(ventaSel.fecha_entrega)}
*6. Aceptación (1/10):* ${formCobro.valoracion || '-'}
*7. Delivery Cancelado:* ${fmtMonto(
                            Number(formCobro.delivery || 0)
                          )}
*8. Tipo de Pago:* ${formCobro.tipo_pago || '-'}
*9. Destino/Ref:* ${ventaSel.destino || '-' }
*10. Observaciones:* ${
                            formCobro.observaciones || '-'
                          }`

                          const esMovil =
                            /Android|iPhone|iPad|iPod/i.test(
                              navigator.userAgent
                            )

                          if (esMovil) {
                            const url = `https://wa.me/?text=${encodeURIComponent(
                              mensaje
                            )}`

                            window.open(url, '_blank')
                          } else {
                            try {
                              await navigator.clipboard.writeText(mensaje)
                              alert('Mensaje copiado al portapapeles')
                            } catch (error) {
                              console.error(error)
                              alert('No se pudo copiar el mensaje')
                            }
                          }
                        }}
                        >
                          WhatsApp
                        </button>

                        <a
                          href={`/recibo/${ventaSel.cod_venta}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            textDecoration: 'none',
                            border: 'none',
                            backgroundColor: '#1565c0',
                            color: 'white',
                            padding: '10px 14px',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontWeight: 'bold',
                            display: 'inline-flex',
                            alignItems: 'center',
                          }}
                        >
                          Recibo
                        </a>
                      </div>

                      <div
                        style={{
                          display: 'flex',
                          gap: '10px',
                          flexWrap: 'wrap',
                        }}
                      >
                        <button
                          onClick={() => setMostrarFormularioCobro(false)}
                          disabled={guardandoCobro}
                          style={{
                            border: '1px solid #ddd',
                            backgroundColor: 'white',
                            color: '#333',
                            padding: '10px 14px',
                            borderRadius: '8px',
                            cursor: guardandoCobro
                              ? 'not-allowed'
                              : 'pointer',
                            fontWeight: 'bold',
                          }}
                        >
                          Cancelar
                        </button>

                        <button
                          onClick={registrarCobro}
                          disabled={guardandoCobro}
                          style={{
                            border: 'none',
                            backgroundColor: guardandoCobro
                              ? '#999'
                              : '#087e0b',
                            color: 'white',
                            padding: '10px 16px',
                            borderRadius: '8px',
                            cursor: guardandoCobro
                              ? 'not-allowed'
                              : 'pointer',
                            fontWeight: 'bold',
                          }}
                        >
                          {guardandoCobro
                            ? 'Guardando...'
                            : 'Guardar cobro y marcar cobrado'}
                        </button>
                      </div>
                    </div>

                    </div>
                  )}

                  {mostrarFormularioReprogramacion && (
                    <div style={{ backgroundColor: 'white', border: '1px solid #e5e5e5', borderRadius: '12px', padding: '16px', display: 'grid', gap: '14px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', alignItems: 'end' }}>
                        <label style={{ display: 'grid', gap: '6px', fontWeight: 'bold', color: '#333' }}>
                          Nueva fecha de entrega
                          <input
                            type="date"
                            value={formReprogramacion.fecha_entrega}
                            onChange={(e) => setFormReprogramacion({ fecha_entrega: e.target.value })}
                            style={{ padding: '10px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px' }}
                          />
                        </label>

                        <div style={{ color: '#666', fontSize: '13px' }}>
                          Fecha actual: <strong>{fmtFecha(ventaSel.fecha_entrega)}</strong>
                        </div>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', flexWrap: 'wrap' }}>
                        <button
                          onClick={() => setMostrarFormularioReprogramacion(false)}
                          disabled={guardandoReprogramacion}
                          style={{ border: '1px solid #ddd', backgroundColor: 'white', color: '#333', padding: '10px 14px', borderRadius: '8px', cursor: guardandoReprogramacion ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}
                        >
                          Cancelar
                        </button>

                        <button
                          onClick={reprogramarPedido}
                          disabled={guardandoReprogramacion}
                          style={{ border: 'none', backgroundColor: guardandoReprogramacion ? '#999' : '#8a5a00', color: 'white', padding: '10px 16px', borderRadius: '8px', cursor: guardandoReprogramacion ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}
                        >
                          {guardandoReprogramacion ? 'Guardando...' : 'Guardar reprogramacion'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="detalle-grid">
                  {([
                    ['Cliente', clienteNombre || (ventaSel.cod_cliente ? `ID ${ventaSel.cod_cliente}` : '-')],
                    ['Vendedor', vendedorNombre || (ventaSel.cod_vendedor ? `ID ${ventaSel.cod_vendedor}` : '-')],
                    ['Estado', ventaSel.estado != null ? `${ventaSel.estado} - ${ESTADOS_VENTA[ventaSel.estado] || 'Sin nombre'}` : '-'],
                    ['Fecha pedido', fmtFecha(ventaSel.fecha_pedido)],
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
                  <div style={{ backgroundColor: '#f7f7f7', borderRadius: '10px', padding: '12px 14px' }}>
                    <div style={{ color: '#777', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px', textTransform: 'uppercase' }}>Fecha entrega</div>
                    <FechaEntregaBadge fecha={ventaSel.fecha_entrega} estado={ventaSel.estado} />
                  </div>
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
