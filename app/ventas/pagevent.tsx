'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import FormularioNuevaVenta from '../../components/ventas/FormularioNuevaVenta'
import ComprobantesVenta from '../../components/ventas/ComprobantesVenta'

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
  ubicacion_pedido: string | null
  detalles_especificos: string | null
  nombre_cliente?: string
  nombre_vendedor?: string
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
  nombre_producto?: string
  nombre_color_estructura?: string
  nombre_color_melamina?: string
}

interface NuevaLinea {
  tempId: number
  cod_producto: string
  precio_cotizado: string
  precio_vendido: string
  cantidad: string
  dimensiones: string
  color_estructura: string
  color_melamina: string
}

interface ErroresLinea {
  cod_producto?: string
  precio_vendido?: string
  cantidad?: string
  color_estructura?: string
  color_melamina?: string
}

interface FiltrosState {
  busqueda: string
  fecha_desde: string
  fecha_hasta: string
  forma_pago: string
  vendedor: string
}

const FORMAS_PAGO = ['ANTICIPO', 'CONTRA_ENTREGA', 'EFECTIVO', 'TRANSFERENCIA']
const UBICACIONES_PEDIDO = ['La Paz', 'El Alto', 'Cochabamba', 'Santa Cruz']
const PAGE_SIZE = 30

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

const obtenerColorUbicacion = (ubicacion: string | null | undefined) => {
  switch (ubicacion) {
    case 'La Paz': return '#1565c0'
    case 'El Alto': return '#ef6c00'
    case 'Cochabamba': return '#2e7d32'
    case 'Santa Cruz': return '#8e24aa'
    default: return '#64748b'
  }
}

const LINEA_VACIA = (tempId: number): NuevaLinea => ({
  tempId, cod_producto: '', precio_cotizado: '', precio_vendido: '',
  cantidad: '', dimensiones: '', color_estructura: '', color_melamina: '',
})

export default function Ventas() {
  const [usuario, setUsuario] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [accesoDenegado, setAccesoDenegado] = useState(false)

  // Lista
  const [ventas, setVentas] = useState<Venta[]>([])
  const [loadingVentas, setLoadingVentas] = useState(false)
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(0)
  const [vendedores, setVendedores] = useState<{ id: number; nombre: string }[]>([])

  const [filtros, setFiltros] = useState<FiltrosState>({
    busqueda: '', fecha_desde: '', fecha_hasta: '', forma_pago: '', vendedor: '',
  })

  // Modal detalle / edicion
  const [ventaSel, setVentaSel] = useState<Venta | null>(null)
  const [detalle, setDetalle] = useState<DetalleVenta[]>([])
  const [loadingDetalle, setLoadingDetalle] = useState(false)
  const [modoEdicion, setModoEdicion] = useState(false)
  const [formVenta, setFormVenta] = useState<Partial<Venta>>({})
  const [formDetalle, setFormDetalle] = useState<DetalleVenta[]>([])
  const [guardando, setGuardando] = useState(false)
  const [mensajeGuardado, setMensajeGuardado] = useState('')

  // ── Modal nueva venta (formulario extraído a components/ventas/FormularioNuevaVenta) ─
  const [mostrarNuevaVenta, setMostrarNuevaVenta] = useState(false)


  // ── Auth ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const carnet = localStorage.getItem('carnet')
    if (!carnet) { window.location.replace('/'); return }
    supabase.from('personal').select('*, cargos(*)')
      .eq('carnet', carnet).eq('estado', true).single()
      .then(({ data }) => {
        if (!data) { window.location.replace('/'); return }
        setUsuario(data)
        const puedeVer = data?.cargos?.puede_ver_cotizador || data?.cargos?.es_admin
        if (!puedeVer) setAccesoDenegado(true)
        setLoading(false)
      })
  }, [])

  // ── Vendedores para filtro de lista ───────────────────────────────────────
  useEffect(() => {
    supabase.from('vendedores').select('id, nombre').eq('activo', true).order('nombre')
      .then(({ data }) => setVendedores(
        (data || []).map((v: any) => ({ id: v.id, nombre: v.nombre || `ID ${v.id}` }))
      ))
  }, [])

  const puedeEditar   = usuario?.cargos?.es_admin ||usuario?.cargos?.puede_editar_productos
  const puedeRegistrar = usuario?.cargos?.puede_ver_cotizador || usuario?.cargos?.es_admin

  // ── Cargar ventas ─────────────────────────────────────────────────────────
  const cargarVentas = useCallback(async (p: number, f: FiltrosState) => {
    setLoadingVentas(true)
    const from = p * PAGE_SIZE
    const to   = from + PAGE_SIZE - 1

    let query = supabase
      .from('ventas').select('*', { count: 'exact' })
      .order('cod_venta', { ascending: false }).range(from, to)

    if (f.busqueda) { const n = parseInt(f.busqueda); if (!isNaN(n)) query = query.eq('cod_venta', n) }
    if (f.fecha_desde) query = query.gte('fecha_pedido', f.fecha_desde)
    if (f.fecha_hasta) query = query.lte('fecha_pedido', f.fecha_hasta)
    if (f.forma_pago)  query = query.eq('forma_pago', f.forma_pago)
    if (f.vendedor)    query = query.eq('cod_vendedor', parseInt(f.vendedor))

    const { data, count, error } = await query
    if (!error && data) {
      // clientes → tabla clientes; vendedores → tabla vendedores
      const idsClientes   = [...new Set(data.map((v: any) => v.cod_cliente).filter(Boolean))]
      const idsVendedores = [...new Set(data.map((v: any) => v.cod_vendedor).filter(Boolean))]
      let clientesMap:  Record<number, string> = {}
      let vendedoresMap: Record<number, string> = {}
      if (idsClientes.length > 0) {
        const { data: cls } = await supabase.from('clientes').select('id, nombre').in('id', idsClientes)
        if (cls) cls.forEach((c: any) => { clientesMap[c.id] = c.nombre || `ID ${c.id}` })
      }
      if (idsVendedores.length > 0) {
        const { data: vds } = await supabase.from('vendedores').select('id, nombre').in('id', idsVendedores)
        if (vds) vds.forEach((v: any) => { vendedoresMap[v.id] = v.nombre || `ID ${v.id}` })
      }
      setVentas(data.map((v: any) => ({
        ...v,
        nombre_cliente:  v.cod_cliente  ? (clientesMap[v.cod_cliente]   || `ID ${v.cod_cliente}`)  : '—',
        nombre_vendedor: v.cod_vendedor ? (vendedoresMap[v.cod_vendedor] || `ID ${v.cod_vendedor}`) : '—',
      })))
      setTotalCount(count || 0)
    }
    setLoadingVentas(false)
  }, [])

  useEffect(() => {
    if (!loading && !accesoDenegado) cargarVentas(page, filtros)
  }, [loading, page, filtros, accesoDenegado, cargarVentas])

  
  // ── Abrir detalle ─────────────────────────────────────────────────────────
  const abrirDetalle = async (v: Venta) => {
    setVentaSel(v); setModoEdicion(false); setMensajeGuardado('')
    setLoadingDetalle(true)
    const { data } = await supabase.from('detalle_venta').select('*').eq('cod_venta', v.cod_venta).order('item')
    setDetalle(await enriquecerDetalles(data || []))
    setLoadingDetalle(false)
  }

  const activarEdicion = () => {
    if (!ventaSel) return
    setFormVenta({ ...ventaSel })
    setFormDetalle(detalle.map(d => ({ ...d })))
    setModoEdicion(true)
  }

  const enriquecerDetalles = async (detalles: DetalleVenta[]) => {
    const codigosProductos = [...new Set(detalles.map(d => d.cod_producto).filter(Boolean))]
    const codigosColores = [...new Set(detalles.map(d => d.color_estructura).filter(Boolean))]
    const codigosMelaminas = [...new Set(detalles.map(d => d.color_melamina).filter(Boolean))]

    const [{ data: productosData }, { data: coloresData }, { data: melaminasData }] = await Promise.all([
      codigosProductos.length > 0
        ? supabase.from('productos').select('codigo, nombre').in('codigo', codigosProductos)
        : Promise.resolve({ data: [] }),
      codigosColores.length > 0
        ? supabase.from('colores').select('codigo_color, detalle').in('codigo_color', codigosColores)
        : Promise.resolve({ data: [] }),
      codigosMelaminas.length > 0
        ? supabase.from('melaminas').select('codigo_melamina, detalle').in('codigo_melamina', codigosMelaminas)
        : Promise.resolve({ data: [] }),
    ])

    const productosMap = Object.fromEntries((productosData || []).map((p: any) => [p.codigo, p.nombre]))
    const coloresMap = Object.fromEntries((coloresData || []).map((c: any) => [c.codigo_color, c.detalle]))
    const melaminasMap = Object.fromEntries((melaminasData || []).map((m: any) => [m.codigo_melamina, m.detalle]))

    return detalles.map(detalle => ({
      ...detalle,
      nombre_producto: productosMap[detalle.cod_producto || ''] || undefined,
      nombre_color_estructura: coloresMap[detalle.color_estructura || ''] || undefined,
      nombre_color_melamina: melaminasMap[detalle.color_melamina || ''] || undefined,
    }))
  }

  // ── Guardar edicion ───────────────────────────────────────────────────────
  const guardarCambios = async () => {
    if (!ventaSel || !formVenta) return
    setGuardando(true); setMensajeGuardado('')
    const { error: eVenta } = await supabase.from('ventas').update({
      cod_cliente: formVenta.cod_cliente, cod_vendedor: formVenta.cod_vendedor,
      fecha_pedido: formVenta.fecha_pedido || null, fecha_entrega: formVenta.fecha_entrega || null,
      hora_entrega: formVenta.hora_entrega || null, delivery_cotizado: formVenta.delivery_cotizado,
      delivery_pagado: formVenta.delivery_pagado, total_venta: formVenta.total_venta,
      anticipo: formVenta.anticipo, forma_pago: formVenta.forma_pago || null,
      cod_transaccion: formVenta.cod_transaccion || null,
      ubicacion_pedido: formVenta.ubicacion_pedido || null,
      detalles_especificos: formVenta.detalles_especificos || null,
    }).eq('cod_venta', ventaSel.cod_venta)

    if (eVenta) { setMensajeGuardado('Error: ' + eVenta.message); setGuardando(false); return }

    for (const d of formDetalle) {
      await supabase.from('detalle_venta').update({
        cod_producto: d.cod_producto, precio_cotizado: d.precio_cotizado,
        precio_vendido: d.precio_vendido, cantidad: d.cantidad,
        subtotal: (d.precio_vendido || 0) * (d.cantidad || 0),
        dimensiones: d.dimensiones, color_estructura: d.color_estructura, color_melamina: d.color_melamina,
      }).eq('id', d.id)
    }
    const { data: va } = await supabase.from('ventas').select('*').eq('cod_venta', ventaSel.cod_venta).single()
    const { data: da } = await supabase.from('detalle_venta').select('*').eq('cod_venta', ventaSel.cod_venta).order('item')
    if (va) {
      const vActual = { ...va, nombre_cliente: ventaSel.nombre_cliente, nombre_vendedor: ventaSel.nombre_vendedor }
      setVentaSel(vActual)
      setVentas(prev => prev.map(v => v.cod_venta === ventaSel.cod_venta ? vActual : v))
    }
    setDetalle(await enriquecerDetalles(da || [])); setModoEdicion(false); setMensajeGuardado('Cambios guardados correctamente')
    setGuardando(false)
  }

  const generarNotaVentaDesdeVenta = async (venta: Venta) => {
    try {
      const [{ data: detalleData }, { data: clienteData }] = await Promise.all([
        supabase.from('detalle_venta').select('*').eq('cod_venta', venta.cod_venta).order('item'),
        venta.cod_cliente
          ? supabase.from('clientes').select('codigo, nombre, celular, direccion').eq('id', venta.cod_cliente).maybeSingle()
          : Promise.resolve({ data: null })
      ])

      const codigosProductos = [...new Set((detalleData || []).map(d => d.cod_producto).filter(Boolean))]
      const codigosColores = [...new Set((detalleData || []).map(d => d.color_estructura).filter(Boolean))]
      const codigosMelaminas = [...new Set((detalleData || []).map(d => d.color_melamina).filter(Boolean))]

      const [{ data: productosData }, { data: coloresData }, { data: melaminasData }] = await Promise.all([
        codigosProductos.length > 0
          ? supabase.from('productos').select('codigo, nombre').in('codigo', codigosProductos)
          : Promise.resolve({ data: [] }),
        codigosColores.length > 0
          ? supabase.from('colores').select('codigo_color, detalle').in('codigo_color', codigosColores)
          : Promise.resolve({ data: [] }),
        codigosMelaminas.length > 0
          ? supabase.from('melaminas').select('codigo_melamina, detalle').in('codigo_melamina', codigosMelaminas)
          : Promise.resolve({ data: [] })
      ])

      const productosMap = Object.fromEntries((productosData || []).map((p: any) => [p.codigo, p.nombre]))
      const coloresMap = Object.fromEntries((coloresData || []).map((c: any) => [c.codigo_color, c.detalle]))
      const melaminasMap = Object.fromEntries((melaminasData || []).map((m: any) => [m.codigo_melamina, m.detalle]))

      const lineas = (detalleData || []).map((detalle: any) => ({
        producto: productosMap[detalle.cod_producto] || detalle.cod_producto || '—',
        dimensiones: detalle.dimensiones || '—',
        colorEstructura: coloresMap[detalle.color_estructura] || detalle.color_estructura || '—',
        colorMelamina: melaminasMap[detalle.color_melamina] || detalle.color_melamina || '—',
        cantidad: detalle.cantidad ?? 0,
        precioVendido: Number(detalle.precio_vendido ?? 0),
        subtotal: Number((detalle.precio_vendido ?? 0) * (detalle.cantidad ?? 0))
      }))

      generarNotaVenta({
        codVenta: venta.cod_venta,
        cliente: {
          nombre: clienteData?.nombre || '—',
          codigo: clienteData?.codigo || '—',
          celular: clienteData?.celular || '',
          direccion: clienteData?.direccion || ''
        },
        vendedor: venta.nombre_vendedor || '—',
        fechaPedido: fmtFecha(venta.fecha_pedido),
        fechaEntrega: fmtFecha(venta.fecha_entrega),
        horaEntrega: venta.hora_entrega || '',
        ubicacionPedido: venta.ubicacion_pedido || '—',
        formaPago: venta.forma_pago?.replace('_', ' ') || '—',
        codTransaccion: venta.cod_transaccion || '',
        deliveryCotizado: Number(venta.delivery_cotizado || 0),
        deliveryPagado: Number(venta.delivery_pagado || 0),
        anticipo: Number(venta.anticipo || 0),
        total: Number(venta.total_venta || 0),
        lineas,
      })
    } catch (error) {
      console.error(error)
      alert('No se pudo generar la nota de venta para esta venta.')
    }
  }

  // ── Generar nota de venta ─────────────────────────────────────────────────
  const generarNotaVenta = (datos: any) => {
    const ventana = window.open('', '_blank', 'width=950,height=900')
    if (!ventana) return

    const htmlContent = `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Nota de Venta - ${datos.codVenta}</title>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
        <style>
          @page {
            size: A4;
            margin: 10mm;
          }
          @media print {
            body { margin: 0; background: white; }
            .no-print { display: none; }
            #nota-container { box-shadow: none; padding: 0; }
          }
          * {
            box-sizing: border-box;
          }
          body {
            font-family: 'Arial', sans-serif;
            margin: 0;
            padding: 20px;
            background: #f5f5f5;
            color: #333;
            line-height: 1.4;
          }
          #nota-container {
            background: white;
            max-width: 850px;
            margin: 0 auto;
            padding: 35px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
          }
          .header {
            text-align: center;
            border-bottom: 3px solid #FFD700;
            padding-bottom: 25px;
            margin-bottom: 35px;
            position: relative;
            display: flex;
            flex-direction: column;
            align-items: center;
          }
          .logo-container {
            width: 110px;
            height: auto;
            margin-bottom: 10px;
          }
          .logo {
            width: 100%;
            height: auto;
            object-fit: contain;
            display: block;
          }
          .company-name {
            font-size: 28px;
            font-weight: bold;
            color: #0d0d1f;
            margin: 0 0 5px 0;
          }
          .company-tagline {
            font-size: 13px;
            color: #666;
            margin: 0;
          }
          .nota-title {
            font-size: 22px;
            font-weight: bold;
            margin: 25px 0 10px 0;
            text-align: center;
            color: #222;
          }
          .nota-number {
            text-align: center;
            font-size: 16px;
            color: #0d0d1f;
            font-weight: bold;
            margin-bottom: 30px;
          }
          .info-section {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 25px;
            margin-bottom: 35px;
          }
          .info-box {
            border: 2px solid #087e0b;
            padding: 18px;
            border-radius: 8px;
            background: #f9f9f9;
          }
          .productos-table-wrap {
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
          }
          .info-title {
            font-weight: bold;
            margin-bottom: 12px;
            color: #0d0d1f;
            font-size: 13px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .info-item {
            margin-bottom: 6px;
            font-size: 13px;
          }
          .info-item strong {
            color: #222;
          }
          .productos-table {
            width: 100%;
            border-collapse: collapse;
            margin: 25px 0;
            font-size: 12px;
            table-layout: fixed;
          }
          .productos-table th,
          .productos-table td {
            word-break: break-word;
            overflow-wrap: anywhere;
            white-space: normal;
          }
          .productos-table th {
            background: #0d0d1f;
            color: white;
            font-weight: bold;
            padding: 10px;
            text-align: left;
            border: 1px solid #0d0d1f;
          }
          .productos-table td {
            border: 1px solid #ddd;
            padding: 10px;
            text-align: left;
          }
          .productos-table tbody tr:nth-child(odd) {
            background: #f9f9f9;
          }
          .text-right {
            text-align: right !important;
          }
          .total-section {
            text-align: right;
            margin-top: 25px;
            padding-top: 20px;
            border-top: 2px solid #FFD700;
          }
          .total-row {
            display: flex;
            justify-content: flex-end;
            margin-bottom: 8px;
            font-size: 13px;
            padding: 4px 0;
          }
          .total-row span:first-child {
            min-width: 200px;
            text-align: right;
            padding-right: 20px;
          }
          .total-final {
            font-size: 16px;
            font-weight: bold;
            color: #0d0d1f;
            border-top: 1px solid #FFD700;
            padding-top: 8px;
            margin-top: 8px;
          }
          .footer {
            margin-top: 40px;
            text-align: center;
            font-size: 11px;
            color: #888;
            border-top: 1px solid #ddd;
            padding-top: 15px;
          }
          .contact-section {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin-bottom: 15px;
            text-align: left;
          }
          .contact-item {
            background: #f9f9f9;
            padding: 8px 12px;
            border-radius: 6px;
            border: 1px solid #eee;
          }
          .contact-title {
            font-weight: bold;
            color: #0d0d1f;
            font-size: 11px;
            margin-bottom: 4px;
          }
          .contact-info {
            font-size: 10px;
            color: #666;
            line-height: 1.3;
          }
          .button-container {
            text-align: center;
            margin-top: 30px;
            gap: 10px;
            display: flex;
            justify-content: center;
            flex-wrap: wrap;
          }
          .btn-print {
            background: #0d0d1f;
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            font-weight: bold;
            transition: background 0.3s;
          }
          .btn-print:hover {
            background: #1a1a2e;
          }
          .btn-download {
            background: #FFD700;
            color: #0d0d1f;
            border: none;
            padding: 12px 24px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            font-weight: bold;
            transition: background 0.3s;
          }
          .btn-download:hover {
            background: #FFE55C;
          }
          .btn-download:disabled {
            background: #ccc;
            cursor: not-allowed;
          }
          @media (max-width: 700px) {
            body {
              padding: 8px;
            }
            #nota-container {
              padding: 14px;
            }
            .header {
              padding-bottom: 16px;
              margin-bottom: 20px;
            }
            .company-name {
              font-size: 22px;
            }
            .company-tagline {
              font-size: 12px;
            }
            .nota-title {
              font-size: 18px;
              margin: 18px 0 8px 0;
            }
            .nota-number {
              font-size: 14px;
              margin-bottom: 18px;
            }
            .info-section {
              grid-template-columns: 1fr;
              gap: 12px;
              margin-bottom: 20px;
            }
            .info-box {
              padding: 12px;
            }
            .productos-table {
              font-size: 10px;
              min-width: 620px;
            }
            .productos-table th,
            .productos-table td {
              padding: 8px;
            }
            .total-row {
              flex-direction: column;
              align-items: flex-end;
              gap: 2px;
            }
            .total-row span:first-child {
              min-width: 0;
              padding-right: 0;
            }
            .contact-section {
              grid-template-columns: 1fr;
            }
            .button-container {
              flex-direction: column;
            }
            .btn-print,
            .btn-download {
              width: 100%;
            }
          }
        </style>
      </head>
      <body>
        <div id="nota-container">
          <div class="header">
            <div class="logo-container">
              <img src="/logo.jpg" alt="Logo Muebles is Better" class="logo">
            </div>
            <h1 class="company-name">Muebles is Better</h1>
            <p class="company-tagline">Más que muebles, ingeniería de interiores</p>
          </div>

          <h2 class="nota-title">NOTA DE VENTA</h2>
          <p class="nota-number">N° <strong>${datos.codVenta}</strong></p>

          <div class="info-section">
            <div class="info-box">
              <div class="info-title">📋 Datos del Cliente</div>
              <div class="info-item"><strong>Nombre:</strong> ${datos.cliente.nombre || '—'}</div>
              <div class="info-item"><strong>Código:</strong> ${datos.cliente.codigo || '—'}</div>
              ${datos.cliente.celular ? `<div class="info-item"><strong>Celular:</strong> ${datos.cliente.celular}</div>` : ''}
              ${datos.cliente.direccion ? `<div class="info-item"><strong>Dirección:</strong> ${datos.cliente.direccion}</div>` : ''}
            </div>

            <div class="info-box">
              <div class="info-title">📅 Datos de la Venta</div>
              <div class="info-item"><strong>Vendedor:</strong> ${datos.vendedor || '—'}</div>
              <div class="info-item"><strong>Fecha Pedido:</strong> ${datos.fechaPedido || '—'}</div>
              <div class="info-item"><strong>Fecha Entrega:</strong> ${datos.fechaEntrega || '—'}${datos.horaEntrega ? ` ${datos.horaEntrega}` : ''}</div>
              <div class="info-item"><strong>Ubicación:</strong> ${datos.ubicacionPedido || '—'}</div>
              <div class="info-item"><strong>Forma de Pago:</strong> ${datos.formaPago || '—'}</div>
              ${datos.codTransaccion ? `<div class="info-item"><strong>Cód. Transacción:</strong> ${datos.codTransaccion}</div>` : ''}
            </div>
          </div>

          <h3 style="font-size: 14px; color: #555; margin: 20px 0 10px 0; text-transform: uppercase;">📦 Productos</h3>
          <div class="productos-table-wrap">
            <table class="productos-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Producto</th>
                  <th>Dimensiones</th>
                  <th>Color Estructura</th>
                  <th>Color Melamina</th>
                  <th>Cantidad</th>
                  <th class="text-right">Precio Unit.</th>
                  <th class="text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                ${datos.lineas.map((linea: any, idx: number) => `
                  <tr>
                    <td>${idx + 1}</td>
                    <td>${linea.producto || '—'}</td>
                    <td>${linea.dimensiones || '—'}</td>
                    <td>${linea.colorEstructura || '—'}</td>
                    <td>${linea.colorMelamina || '—'}</td>
                    <td>${linea.cantidad}</td>
                    <td class="text-right">Bs. ${Number(linea.precioVendido).toLocaleString('es-BO', { minimumFractionDigits: 2 })}</td>
                    <td class="text-right"><strong>Bs. ${Number(linea.subtotal).toLocaleString('es-BO', { minimumFractionDigits: 2 })}</strong></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>

          <div class="total-section">
            ${datos.deliveryCotizado > 0 ? `<div class="total-row"><span>Delivery Cotizado:</span><span>Bs. ${Number(datos.deliveryCotizado).toLocaleString('es-BO', { minimumFractionDigits: 2 })}</span></div>` : ''}
            ${datos.deliveryPagado > 0 ? `<div class="total-row"><span>Delivery Pagado:</span><span>Bs. ${Number(datos.deliveryPagado).toLocaleString('es-BO', { minimumFractionDigits: 2 })}</span></div>` : ''}
            ${datos.anticipo > 0 ? `<div class="total-row"><span>Anticipo:</span><span>Bs. ${Number(datos.anticipo).toLocaleString('es-BO', { minimumFractionDigits: 2 })}</span></div>` : ''}
            <div class="total-row total-final">
              <span>TOTAL VENTA:</span>
              <span>Bs. ${Number(datos.total).toLocaleString('es-BO', { minimumFractionDigits: 2 })}</span>
            </div>
          </div>

          <div class="footer">
            <div class="contact-section">
              <div class="contact-item">
                <div class="contact-title">📍 El Alto</div>
                <div class="contact-info">C. L. de la Vega 3623<br>+591 65572015</div>
              </div>
              <div class="contact-item">
                <div class="contact-title">📍 La Paz</div>
                <div class="contact-info">Zona Bella Vista, C. Ignacio Sanjines<br>+591 60633283</div>
              </div>
              <div class="contact-item">
                <div class="contact-title">📍 Santa Cruz</div>
                <div class="contact-info">Av. Napoleon Gomez Landivar, Radial 21<br>+591 60044821</div>
              </div>
              <div class="contact-item">
                <div class="contact-title">📍 Cochabamba</div>
                <div class="contact-info">Av. Segunda Circunvalacion<br>+591 61211195</div>
              </div>
            </div>
            <p>Gracias por su preferencia en Muebles is Better</p>
            <p>Más que muebles, ingeniería de interiores — Bolivia ${new Date().getFullYear()}</p>
          </div>
        </div>

        <div class="button-container">
          <button class="btn-print" onclick="window.print()">🖨️ Imprimir</button>
          <button class="btn-download" id="btnDownload" onclick="downloadPDF()">📄 Descargar PDF</button>
        </div>

        <script>
          async function downloadPDF() {
            try {
              const btn = document.getElementById('btnDownload');
              btn.disabled = true;
              btn.textContent = 'Generando PDF...';

              const element = document.getElementById('nota-container');
              const canvas = await html2canvas(element, { 
                scale: 1.2,
                backgroundColor: '#ffffff',
                useCORS: true,
                logging: false,
                width: element.scrollWidth,
                height: element.scrollHeight,
                windowWidth: element.scrollWidth,
                windowHeight: element.scrollHeight,
                scrollX: 0,
                scrollY: 0
              });
              
              const { jsPDF } = window.jspdf;
              const imgData = canvas.toDataURL('image/png');
              const pdf = new jsPDF('p', 'mm', 'a4');
              const imgWidth = 210; // ancho A4 en mm
              const pageHeight = 297;
              const imgHeight = (canvas.height * imgWidth) / canvas.width;
              let heightLeft = imgHeight;
              let position = 0;

              pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
              heightLeft -= pageHeight;

              while (heightLeft >= 0) {
                position = heightLeft - imgHeight;
                pdf.addPage();
                pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
                heightLeft -= pageHeight;
              }

              pdf.save('Nota-Venta-${datos.codVenta}.pdf');
              
              btn.disabled = false;
              btn.textContent = '📄 Descargar PDF';
            } catch (error) {
              alert('Error al generar PDF: ' + error.message);
              document.getElementById('btnDownload').disabled = false;
              document.getElementById('btnDownload').textContent = '📄 Descargar PDF';
            }
          }
        </script>
      </body>
      </html>
    `

    ventana.document.write(htmlContent)
    ventana.document.close()
  }

  // ── Estilos ───────────────────────────────────────────────────────────────
  const inputStyle: React.CSSProperties = {
    padding: '8px 12px', borderRadius: '8px', border: '1px solid #ddd',
    fontSize: '13px', width: '100%', boxSizing: 'border-box', backgroundColor: 'white',
  }
  const inputErr: React.CSSProperties = { ...inputStyle, border: '1px solid #e53935', backgroundColor: '#fff8f8' }
  const labelStyle: React.CSSProperties = { fontSize: '12px', color: '#666', display: 'block', marginBottom: '4px' }
  const errMsg: React.CSSProperties = { fontSize: '11px', color: '#e53935', marginTop: '3px' }
  const thStyle: React.CSSProperties = {
    padding: '12px 14px', textAlign: 'left', borderBottom: '2px solid #eee',
    color: '#555', fontSize: '12px', whiteSpace: 'nowrap', backgroundColor: '#f9f9f9',
  }
  const tdStyle: React.CSSProperties = { padding: '12px 14px', borderBottom: '1px solid #f0f0f0', fontSize: '13px' }

  if (loading) return <p style={{ textAlign: 'center', marginTop: '100px', fontFamily: 'Arial' }}>Cargando...</p>

  if (accesoDenegado) return (
    <div style={{ fontFamily: 'Arial, sans-serif', minHeight: '100vh', backgroundColor: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', backgroundColor: 'white', borderRadius: '16px', padding: '48px', boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔒</div>
        <h2 style={{ margin: '0 0 8px' }}>Acceso restringido</h2>
        <p style={{ color: '#888', margin: '0 0 24px' }}>No tienes permisos para ver esta seccion.</p>
        <a href="/sistema" style={{ backgroundColor: '#087e0b', color: 'white', padding: '10px 24px', borderRadius: '8px', textDecoration: 'none', fontSize: '14px' }}>
          Volver al sistema
        </a>
      </div>
    </div>
  )

  const totalPages    = Math.ceil(totalCount / PAGE_SIZE)
  const nombreMostrar = usuario?.nombre || usuario?.usuario || usuario?.carnet || 'Usuario'

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', minHeight: '100vh', backgroundColor: '#f5f5f5' }}>

      <style>{`
        @media (max-width: 768px) {
          .ventas-container { padding: 16px !important; }
          .filtros-grid { grid-template-columns: 1fr 1fr !important; }
          .tabla-wrap { font-size: 11px !important; }
          .modal-inner { margin: 8px !important; padding: 16px !important; max-width: 100% !important; }
          .detalle-grid { grid-template-columns: 1fr 1fr !important; }
          .linea-grid { grid-template-columns: 1fr 1fr !important; }
        }
        .fila-venta:hover { background-color: #f0fff0 !important; cursor: pointer; }
        .btn-primary { background-color: #087e0b; color: white; border: none; border-radius: 8px; padding: 9px 20px; font-size: 13px; font-weight: bold; cursor: pointer; }
        .btn-primary:hover { background-color: #065e08; }
        .btn-primary:disabled { background-color: #aaa; cursor: not-allowed; }
        .btn-secondary { background-color: white; color: #555; border: 1px solid #ddd; border-radius: 8px; padding: 9px 20px; font-size: 13px; cursor: pointer; }
        .btn-secondary:hover { background-color: #f5f5f5; }
        .btn-danger { background-color: transparent; color: #e53935; border: 1px solid #e53935; border-radius: 8px; padding: 9px 20px; font-size: 13px; cursor: pointer; }
        .btn-edit { background-color: #1565c0; color: white; border: none; border-radius: 8px; padding: 9px 20px; font-size: 13px; font-weight: bold; cursor: pointer; }
        .btn-edit:hover { background-color: #0d47a1; }
        .btn-nueva { background-color: #087e0b; color: white; border: none; border-radius: 10px; padding: 11px 24px; font-size: 14px; font-weight: bold; cursor: pointer; display: flex; align-items: center; gap: 8px; }
        .btn-nueva:hover { background-color: #065e08; }
        .btn-add-linea { background-color: #e8f5e9; color: #087e0b; border: 1px dashed #087e0b; border-radius: 8px; padding: 8px 18px; font-size: 13px; cursor: pointer; width: 100%; }
        .btn-add-linea:hover { background-color: #c8e6c9; }
        input:focus, select:focus { outline: 2px solid #087e0b; border-color: #087e0b; }
        .cliente-sugerencia { padding: 10px 14px; cursor: pointer; border-bottom: 1px solid #f0f0f0; font-size: 13px; }
        .cliente-sugerencia:hover { background: #f0fff0; }
        .tab-btn { padding: 7px 16px; border: none; border-radius: 8px; font-size: 13px; cursor: pointer; transition: all 0.15s; }
        .tab-active { background: #087e0b; color: white; font-weight: bold; }
        .tab-inactive { background: #f0f0f0; color: #555; }
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
      {totalCount.toLocaleString()} registros
      {puedeEditar && <span style={{ marginLeft: '10px', color: '#1565c0', fontSize: '12px' }}>● Administrador</span>}
    </p>
  </div>
  
  {/* GRUPO DE ACCIONES (No altera el layout gracias al flexbox externo) */}
  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
    
    {/* Botón original de registro */}
    {puedeRegistrar && (
      <button className="btn-nueva" onClick={() => setMostrarNuevaVenta(true)}>
        ＋ Registrar venta
      </button>
    )}
  </div>
</div>

        {/* FILTROS */}
        <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: '20px' }}>
          <div className="filtros-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px', alignItems: 'end' }}>
            <div>
              <label style={labelStyle}>Buscar # venta</label>
              <input type="number" placeholder="Ej: 26250" value={filtros.busqueda}
                onChange={e => { setPage(0); setFiltros(f => ({ ...f, busqueda: e.target.value })) }} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Fecha desde</label>
              <input type="date" value={filtros.fecha_desde}
                onChange={e => { setPage(0); setFiltros(f => ({ ...f, fecha_desde: e.target.value })) }} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Fecha hasta</label>
              <input type="date" value={filtros.fecha_hasta}
                onChange={e => { setPage(0); setFiltros(f => ({ ...f, fecha_hasta: e.target.value })) }} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Forma de pago</label>
              <select value={filtros.forma_pago}
                onChange={e => { setPage(0); setFiltros(f => ({ ...f, forma_pago: e.target.value })) }} style={inputStyle}>
                <option value="">Todas</option>
                {FORMAS_PAGO.map(fp => <option key={fp} value={fp}>{fp.replace('_', ' ')}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Vendedor</label>
              <select value={filtros.vendedor}
                onChange={e => { setPage(0); setFiltros(f => ({ ...f, vendedor: e.target.value })) }} style={inputStyle}>
                <option value="">Todos</option>
                {vendedores.map(v => <option key={v.id} value={String(v.id)}>{v.nombre}</option>)}
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
              <p style={{ margin: 0 }}>No se encontraron ventas.</p>
            </div>
          ) : (
            <div className="tabla-wrap" style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={thStyle}># Venta</th>
                    <th style={thStyle}>Cliente</th>
                    <th style={thStyle}>Vendedor</th>
                    <th style={thStyle}>Ubicación</th>
                    <th style={thStyle}>F. Pedido</th>
                    <th style={thStyle}>F. Entrega</th>
                    <th style={thStyle}>Hora</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Anticipo</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Total</th>
                    <th style={thStyle}>Pago</th>
                    <th style={thStyle}>Transaccion</th>
                    <th style={thStyle}>Nota</th>
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
                        <td style={tdStyle}>{v.nombre_cliente}</td>
                        <td style={tdStyle}>{v.nombre_vendedor}</td>
                        <td style={tdStyle}>{v.ubicacion_pedido || '—'}</td>
                        <td style={tdStyle}>{fmtFecha(v.fecha_pedido)}</td>
                        <td style={tdStyle}>{fmtFecha(v.fecha_entrega)}</td>
                        <td style={tdStyle}>{v.hora_entrega || '—'}</td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>{fmt(v.anticipo)}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 'bold' }}>{fmt(v.total_venta)}</td>
                        <td style={tdStyle}>
                          {v.forma_pago
                            ? <span style={{ backgroundColor: bp.bg, color: bp.color, padding: '3px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>{v.forma_pago.replace('_', ' ')}</span>
                            : <span style={{ color: '#bbb' }}>—</span>}
                        </td>
                        <td style={{ ...tdStyle, fontSize: '11px', color: esTruncado ? '#e65100' : '#555', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {esTruncado ? <span title="Dato truncado por Excel">⚠️ {v.cod_transaccion?.replace('TRUNCADO_', '')}</span> : (v.cod_transaccion || '—')}
                        </td>
                        <td style={tdStyle} onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); void generarNotaVentaDesdeVenta(v) }}
                            style={{ backgroundColor: '#0d47a1', color: 'white', border: 'none', borderRadius: '8px', padding: '6px 10px', fontSize: '12px', cursor: 'pointer', fontWeight: 'bold' }}
                          >
                            🧾 Nota
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderTop: '1px solid #f0f0f0' }}>
              <span style={{ fontSize: '13px', color: '#888' }}>Pagina {page + 1} de {totalPages}</span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn-secondary" style={{ padding: '7px 14px', fontSize: '12px' }} disabled={page === 0} onClick={() => setPage(0)}>« Primera</button>
                <button className="btn-secondary" style={{ padding: '7px 14px', fontSize: '12px' }} disabled={page === 0} onClick={() => setPage(p => p - 1)}>‹ Ant.</button>
                <button className="btn-secondary" style={{ padding: '7px 14px', fontSize: '12px' }} disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Sig. ›</button>
                <button className="btn-secondary" style={{ padding: '7px 14px', fontSize: '12px' }} disabled={page >= totalPages - 1} onClick={() => setPage(totalPages - 1)}>Ultima »</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* MODAL NUEVA VENTA (ahora componente compartido, ver FormularioNuevaVenta.tsx) */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {mostrarNuevaVenta && (
        <FormularioNuevaVenta
          modo="vendedor"
          vendedorActual={usuario ? { id: usuario.id, nombre: usuario.nombre || usuario.usuario || '' } : null}
          onCerrar={() => setMostrarNuevaVenta(false)}
          onVentaCreada={() => {
            setMostrarNuevaVenta(false)
            cargarVentas(0, filtros)
            setPage(0)
          }}
        />
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* MODAL DETALLE / EDICION VENTA EXISTENTE                             */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {ventaSel && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, overflowY: 'auto', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '20px' }}>
          <div className="modal-inner" style={{ backgroundColor: 'white', borderRadius: '16px', padding: '32px', width: '100%', maxWidth: '820px', boxShadow: '0 8px 40px rgba(0,0,0,0.2)', marginTop: '20px', marginBottom: '20px' }}>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <div>
                <h2 style={{ margin: '0 0 4px', fontSize: '20px' }}>
                  Venta #{ventaSel.cod_venta}
                  {modoEdicion && <span style={{ marginLeft: '10px', fontSize: '13px', color: '#1565c0', fontWeight: 'normal' }}>— Editando</span>}
                </h2>
                <p style={{ margin: 0, color: '#888', fontSize: '13px' }}>{ventaSel.nombre_cliente}</p>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                {puedeEditar && !modoEdicion && (
                  <button className="btn-edit" onClick={activarEdicion}>✏️ Editar</button>
                )}
                <button className="btn-secondary" onClick={() => { setVentaSel(null); setModoEdicion(false); setMensajeGuardado('') }}>✕ Cerrar</button>
              </div>
            </div>

            {mensajeGuardado && (
              <div style={{ backgroundColor: mensajeGuardado.startsWith('Error') ? '#ffebee' : '#e8f5e9', border: `1px solid ${mensajeGuardado.startsWith('Error') ? '#ef9a9a' : '#a5d6a7'}`, borderRadius: '8px', padding: '10px 16px', marginBottom: '20px', fontSize: '13px', color: mensajeGuardado.startsWith('Error') ? '#c62828' : '#2e7d32' }}>
                {mensajeGuardado}
              </div>
            )}

            {/* Solo se puede subir/eliminar comprobantes en modo edición */}
            <ComprobantesVenta codVenta={ventaSel.cod_venta} origen="vendedor" subidoPor={usuario?.nombre || null} soloLectura={!modoEdicion} />

            {modoEdicion ? (
              <>
                <h3 style={{ margin: '0 0 16px', fontSize: '15px', color: '#444', borderBottom: '1px solid #eee', paddingBottom: '8px' }}>Datos de la venta</h3>
                <div className="detalle-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px', marginBottom: '24px' }}>
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
                      {FORMAS_PAGO.map(fp => <option key={fp} value={fp}>{fp.replace('_', ' ')}</option>)}
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
                    <label style={labelStyle}>Ubicación del pedido</label>
                    <select value={formVenta.ubicacion_pedido || ''} style={inputStyle}
                      onChange={e => setFormVenta(f => ({ ...f, ubicacion_pedido: e.target.value || null }))}>
                      <option value="">— Sin especificar —</option>
                      {UBICACIONES_PEDIDO.map(ubicacion => <option key={ubicacion} value={ubicacion}>{ubicacion}</option>)}
                    </select>
                  </div>
                  <div style={{ gridColumn: 'span 3' }}>
                    <label style={labelStyle}>Detalles específicos del pedido</label>
                    <textarea rows={3} value={formVenta.detalles_especificos || ''} style={{ ...inputStyle, resize: 'vertical', minHeight: '90px' }}
                      placeholder="Ej. Puerta de color blanco, entrega en edificio con ascensor, etc."
                      onChange={e => setFormVenta(f => ({ ...f, detalles_especificos: e.target.value || null }))} />
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
                    <label style={labelStyle}>Codigo transaccion</label>
                    <input type="text" value={formVenta.cod_transaccion || ''} style={inputStyle}
                      placeholder="Numero de transferencia / recibo"
                      onChange={e => setFormVenta(f => ({ ...f, cod_transaccion: e.target.value || null }))} />
                  </div>
                </div>

                <h3 style={{ margin: '0 0 14px', fontSize: '15px', color: '#444', borderBottom: '1px solid #eee', paddingBottom: '8px' }}>Productos</h3>
                {formDetalle.map((d, idx) => (
                  <div key={d.id} style={{ backgroundColor: '#f9f9f9', borderRadius: '10px', padding: '16px', marginBottom: '12px', border: '1px solid #eee' }}>
                    <p style={{ margin: '0 0 12px', fontSize: '12px', color: '#888', fontWeight: 'bold' }}>ITEM {d.item ?? idx + 1}</p>
                    <div className="detalle-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                      <div>
                        <label style={labelStyle}>Codigo producto</label>
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
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '8px' }}>
                  <button className="btn-danger" onClick={() => setModoEdicion(false)} disabled={guardando}>Cancelar</button>
                  <button className="btn-primary" onClick={guardarCambios} disabled={guardando}>
                    {guardando ? 'Guardando...' : '💾 Guardar cambios'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="detalle-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
                  {([
                    ['Cliente', ventaSel.nombre_cliente || `ID ${ventaSel.cod_cliente}`],
                    ['Vendedor', ventaSel.nombre_vendedor || '—'],
                    ['Forma de pago', ventaSel.forma_pago?.replace('_', ' ') || '—'],
                    ['Fecha pedido', fmtFecha(ventaSel.fecha_pedido)],
                    ['Fecha entrega', fmtFecha(ventaSel.fecha_entrega)],
                    ['Hora entrega', ventaSel.hora_entrega || '—'],
                    ['Ubicación', ventaSel.ubicacion_pedido || '—'],
                    ['Detalles', ventaSel.detalles_especificos || '—'],
                    ['Delivery cotizado', fmt(ventaSel.delivery_cotizado)],
                    ['Delivery pagado', fmt(ventaSel.delivery_pagado)],
                    ['Anticipo', fmt(ventaSel.anticipo)],
                    ['Total venta', fmt(ventaSel.total_venta)],
                  ] as [string, string][]).map(([label, val]) => (
                    <div key={label} style={{ backgroundColor: '#f9f9f9', borderRadius: '8px', padding: '12px 16px' }}>
                      <p style={{ margin: '0 0 4px', fontSize: '11px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</p>
                      <p style={{ margin: 0, fontSize: '14px', fontWeight: '500' }}>{val}</p>
                    </div>
                  ))}
                  <div style={{ backgroundColor: '#f9f9f9', borderRadius: '8px', padding: '12px 16px', gridColumn: 'span 3' }}>
                    <p style={{ margin: '0 0 4px', fontSize: '11px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Codigo transaccion</p>
                    <p style={{ margin: 0, fontSize: '13px', fontFamily: 'monospace', color: ventaSel.cod_transaccion?.startsWith('TRUNCADO_') ? '#e65100' : '#222' }}>
                      {ventaSel.cod_transaccion?.startsWith('TRUNCADO_')
                        ? `Truncado por Excel: ${ventaSel.cod_transaccion.replace('TRUNCADO_', '')}`
                        : (ventaSel.cod_transaccion || '—')}
                    </p>
                  </div>
                </div>

                <h3 style={{ margin: '0 0 14px', fontSize: '15px', color: '#444', borderBottom: '1px solid #eee', paddingBottom: '8px' }}>
                  Productos ({detalle.length})
                </h3>
                {loadingDetalle ? (
                  <p style={{ color: '#888', textAlign: 'center', padding: '20px' }}>Cargando detalle...</p>
                ) : detalle.length === 0 ? (
                  <p style={{ color: '#bbb', textAlign: 'center', padding: '20px' }}>Sin lineas de detalle registradas.</p>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          {['#', 'Producto', 'P. Cotizado', 'P. Vendido', 'Cant.', 'Subtotal', 'Dimensiones', 'Estructura', 'Melamina'].map(h => (
                            <th key={h} style={{ ...thStyle, fontSize: '11px' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {detalle.map((d, i) => (
                          <tr key={d.id} style={{ backgroundColor: i % 2 === 0 ? 'white' : '#fafafa' }}>
                            <td style={{ ...tdStyle, color: '#087e0b', fontWeight: 'bold' }}>{d.item ?? i + 1}</td>
                            <td style={{ ...tdStyle, fontWeight: '500' }}>{d.nombre_producto || d.cod_producto || '—'}</td>
                            <td style={{ ...tdStyle, textAlign: 'right' }}>{fmt(d.precio_cotizado)}</td>
                            <td style={{ ...tdStyle, textAlign: 'right' }}>{fmt(d.precio_vendido)}</td>
                            <td style={{ ...tdStyle, textAlign: 'center' }}>{d.cantidad ?? '—'}</td>
                            <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 'bold', color: '#087e0b' }}>{fmt(d.subtotal)}</td>
                            <td style={{ ...tdStyle, fontSize: '12px', color: '#666' }}>{d.dimensiones || '—'}</td>
                            <td style={{ ...tdStyle, fontSize: '12px' }}>{d.nombre_color_estructura || d.color_estructura || '—'}</td>
                            <td style={{ ...tdStyle, fontSize: '12px', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                              title={d.nombre_color_melamina || d.color_melamina || ''}>{d.nombre_color_melamina || d.color_melamina || '—'}</td>
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
