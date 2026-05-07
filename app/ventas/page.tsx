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

  // ── MODAL NUEVA VENTA ─────────────────────────────────────────────────────
  const [modalNueva, setModalNueva] = useState(false)
  const [pasoNueva, setPasoNueva] = useState<'form' | 'preview'>('form')

  // Datos maestros para nueva venta
  const [productos, setProductos] = useState<any[]>([])
  const [coloresEst, setColoresEst] = useState<any[]>([])
  const [coloresMel, setColoresMel] = useState<any[]>([])
  const [clientes, setClientes] = useState<any[]>([])
  const [nextCodVenta, setNextCodVenta] = useState<number>(0)
  const [loadingMaestros, setLoadingMaestros] = useState(false)

  // Modo cliente
  const [modoCliente, setModoCliente] = useState<'existente' | 'nuevo'>('existente')
  const [clienteBusqueda, setClienteBusqueda] = useState('')
  const [clientesFiltrados, setClientesFiltrados] = useState<any[]>([])
  const [clienteSeleccionado, setClienteSeleccionado] = useState<any>(null)
  const [nuevoClienteNombre, setNuevoClienteNombre] = useState('')
  const [nuevoClienteCodigo, setNuevoClienteCodigo] = useState('')
  const [nuevoClienteDireccion, setNuevoClienteDireccion] = useState('')
  const [nuevoClienteCelular, setNuevoClienteCelular] = useState('')
  const [loadingNextCodCliente, setLoadingNextCodCliente] = useState(false)

  // Campos cabecera nueva venta
  const [nv, setNv] = useState({
    cod_vendedor: '',
    fecha_pedido: new Date().toISOString().split('T')[0],
    fecha_entrega: '',
    hora_entrega: '',
    delivery_cotizado: '',
    delivery_pagado: '',
    anticipo: '',
    forma_pago: '',
    cod_transaccion: '',
  })

  // Lineas de productos nueva venta
  const [lineas, setLineas] = useState<NuevaLinea[]>([LINEA_VACIA(1)])
  const [nextTempId, setNextTempId] = useState(2)

  // Errores validacion
  const [erroresCab, setErroresCab] = useState<Record<string, string>>({})
  const [erroresLineas, setErroresLineas] = useState<ErroresLinea[]>([{}])
  const [errorCliente, setErrorCliente] = useState('')
  const [guardandoNueva, setGuardandoNueva] = useState(false)
  const [errorGuardado, setErrorGuardado] = useState('')
  const [textoWhatsApp, setTextoWhatsApp] = useState('')
  const [mostrarTextoWA, setMostrarTextoWA] = useState(false)

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

  const puedeEditar   = usuario?.cargos?.es_admin
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
    setDetalle(data || [])
    setLoadingDetalle(false)
  }

  const activarEdicion = () => {
    if (!ventaSel) return
    setFormVenta({ ...ventaSel })
    setFormDetalle(detalle.map(d => ({ ...d })))
    setModoEdicion(true)
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
    setDetalle(da || []); setModoEdicion(false); setMensajeGuardado('Cambios guardados correctamente')
    setGuardando(false)
  }

  // ── Abrir modal nueva venta ───────────────────────────────────────────────
  const abrirModalNueva = async () => {
    setLoadingMaestros(true)
    setModalNueva(true)
    setPasoNueva('form')
    setErrorGuardado('')
    setLineas([LINEA_VACIA(1)])
    setNextTempId(2)
    setErroresCab({})
    setErroresLineas([{}])
    setErrorCliente('')
    setClienteSeleccionado(null)
    setClienteBusqueda('')
    setClientesFiltrados([])
    setNuevoClienteNombre('')
    setNuevoClienteCodigo('')
    setNuevoClienteDireccion('')
    setNuevoClienteCelular('')
    setModoCliente('existente')
    setNv({
      cod_vendedor: String(usuario?.id || ''),
      fecha_pedido: new Date().toISOString().split('T')[0],
      fecha_entrega: '', hora_entrega: '', delivery_cotizado: '',
      delivery_pagado: '', anticipo: '', forma_pago: '', cod_transaccion: '',
    })

    // vendedores → tabla vendedores (id, nombre, activo)
    // productos  → tabla productos  (codigo PK, nombre, precio_tienda, precio_minimo)
    // colores    → tabla colores    (id, codigo_color, detalle)
    // melaminas  → tabla melaminas  (id, codigo_melamina, detalle)
    // cod_venta siguiente = MAX + 1
    const [vRes, pRes, ceRes, cmRes, maxRes] = await Promise.all([
      supabase.from('vendedores').select('id, nombre').eq('activo', true).order('nombre'),
      supabase.from('productos').select('codigo, nombre, precio_tienda, precio_minimo, medidas').order('nombre'),
      supabase.from('colores').select('id, codigo_color, detalle').order('detalle'),
      supabase.from('melaminas').select('id, codigo_melamina, detalle').order('detalle'),
      supabase.from('ventas').select('cod_venta').order('cod_venta', { ascending: false }).limit(1),
    ])

    // Usar tabla vendedores en lugar de personal para el select de vendedor
    setVendedores((vRes.data || []).map((v: any) => ({ id: v.id, nombre: v.nombre })))
    setProductos(pRes.data || [])
    setColoresEst(ceRes.data || [])
    setColoresMel(cmRes.data || [])
    const ultimo = maxRes.data?.[0]?.cod_venta || 0
    setNextCodVenta(ultimo + 1)
    setLoadingMaestros(false)
  }

  const cerrarModalNueva = () => {
    setModalNueva(false); setPasoNueva('form'); setErrorGuardado('')
  }

  // Busqueda de clientes EN TIEMPO REAL contra Supabase con debounce 300ms
  useEffect(() => {
    if (!clienteBusqueda.trim() || clienteBusqueda.trim().length < 2) {
      setClientesFiltrados([])
      return
    }
    const timer = setTimeout(async () => {
      const q = clienteBusqueda.trim()
      const esNumero = /^\d+$/.test(q)
      // Busca activos primero; busca por nombre, celular o codigo
      let query = supabase
        .from('clientes')
        .select('id, codigo, nombre, direccion, celular')
        .limit(8)
        .order('nombre')

      if (esNumero) {
        query = query.or(`codigo.eq.${q},nombre.ilike.%${q}%,celular.ilike.%${q}%`)
      } else {
        query = query.or(`nombre.ilike.%${q}%,celular.ilike.%${q}%`)
      }
      const { data } = await query
      setClientesFiltrados(data || [])
    }, 300)
    return () => clearTimeout(timer)
  }, [clienteBusqueda])

  // Seleccionar producto en linea — autocompleta precios con campos reales de la tabla
  // productos: codigo (PK), nombre, precio_tienda, precio_minimo
  const seleccionarProducto = (idx: number, codProducto: string) => {
    const prod = productos.find((p: any) => p.codigo === codProducto)
    setLineas(prev => prev.map((l, i) => i === idx ? {
      ...l,
      cod_producto:    codProducto,
      precio_cotizado: prod?.precio_minimo ? String(prod.precio_minimo) : l.precio_cotizado,
      precio_vendido:  prod?.precio_tienda ? String(prod.precio_tienda) : l.precio_vendido,
      dimensiones:     prod?.medidas       ? prod.medidas               : l.dimensiones,
    } : l))
  }

  const agregarLinea = () => {
    setLineas(prev => [...prev, LINEA_VACIA(nextTempId)])
    setErroresLineas(prev => [...prev, {}])
    setNextTempId(n => n + 1)
  }

  const eliminarLinea = (idx: number) => {
    if (lineas.length === 1) return
    setLineas(prev => prev.filter((_, i) => i !== idx))
    setErroresLineas(prev => prev.filter((_, i) => i !== idx))
  }

  // ── Validacion ────────────────────────────────────────────────────────────
  const validar = (): boolean => {
    let ok = true
    const ec: Record<string, string> = {}
    const ecl = lineas.map(() => ({} as ErroresLinea))

    // Cliente
    let eclienteMsg = ''
    if (modoCliente === 'existente' && !clienteSeleccionado) {
      eclienteMsg = 'Selecciona un cliente existente'; ok = false
    }
    if (modoCliente === 'nuevo') {
      if (!nuevoClienteNombre.trim()) { eclienteMsg = 'Ingresa el nombre del nuevo cliente'; ok = false }
      else if (!nuevoClienteCodigo.trim()) { eclienteMsg = 'El codigo del cliente es obligatorio'; ok = false }
    }
    setErrorCliente(eclienteMsg)

    if (!nv.cod_vendedor) { ec.cod_vendedor = 'Selecciona un vendedor'; ok = false }
    if (!nv.fecha_pedido) { ec.fecha_pedido = 'Ingresa la fecha de pedido'; ok = false }
    if (!nv.fecha_entrega) { ec.fecha_entrega = 'Ingresa la fecha de entrega'; ok = false }
    if (!nv.forma_pago) { ec.forma_pago = 'Selecciona la forma de pago'; ok = false }

    lineas.forEach((l, i) => {
      if (!l.cod_producto.trim()) { ecl[i].cod_producto = 'Selecciona un producto'; ok = false }
      if (!l.precio_vendido || isNaN(parseFloat(l.precio_vendido)) || parseFloat(l.precio_vendido) <= 0)
        { ecl[i].precio_vendido = 'Ingresa precio vendido'; ok = false }
      if (!l.cantidad || isNaN(parseInt(l.cantidad)) || parseInt(l.cantidad) <= 0)
        { ecl[i].cantidad = 'Ingresa cantidad'; ok = false }
      if (!l.color_estructura.trim()) { ecl[i].color_estructura = 'Selecciona color estructura'; ok = false }
      if (!l.color_melamina.trim()) { ecl[i].color_melamina = 'Selecciona color melamina'; ok = false }
    })

    setErroresCab(ec)
    setErroresLineas(ecl)
    return ok
  }

  const irAPreview = () => {
    if (validar()) setPasoNueva('preview')
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
          @media print {
            body { margin: 0; background: white; }
            .no-print { display: none; }
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
          }
          .logo-container {
            position: absolute;
            left: 0;
            top: 0;
            width: 120px;
            height: auto;
          }
          .logo {
            width: 100%;
            height: auto;
            object-fit: contain;
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
              <div class="info-item"><strong>Forma de Pago:</strong> ${datos.formaPago || '—'}</div>
              ${datos.codTransaccion ? `<div class="info-item"><strong>Cód. Transacción:</strong> ${datos.codTransaccion}</div>` : ''}
            </div>
          </div>

          <h3 style="font-size: 14px; color: #555; margin: 20px 0 10px 0; text-transform: uppercase;">📦 Productos</h3>
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
                scale: 2, 
                backgroundColor: '#ffffff',
                useCORS: true,
                logging: false
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

  // ── Generar texto para WhatsApp ────────────────────────────────────────────
  const generarTextoWhatsApp = (codVentaParam: number) => {
    const saldo = totalNuevaVenta - (nv.anticipo ? parseFloat(nv.anticipo) : 0)
    const productosNombres = lineas.map(l => productos.find(p => p.codigo === l.cod_producto)?.nombre || l.cod_producto).join(', ')
    const productosCodigos = lineas.map(l => l.cod_producto).join(', ')
    const cantidades = lineas.map(l => l.cantidad).join('-')
    const medidas = lineas.map(l => l.dimensiones || '—').join(' / ')
    const colorEst = coloresEst.find(c => c.codigo_color === lineas[0]?.color_estructura)?.detalle || lineas[0]?.color_estructura || '—'
    const colorMel = lineas.map(l => coloresMel.find(m => m.id === parseInt(l.color_melamina))?.detalle || l.color_melamina).join(', ')

    const texto = `*N. PEDIDO:* ${codVentaParam}
*1. Ejecutivo de ventas:* ${vendedorNombre}
*2. Cuenta facebook:* 
*3. Mueble:* ${productosNombres}
*3.1. Cantidad:* ${cantidades}
*4. Código:* ${productosCodigos}
*5. Medidas:* ${medidas}
*6. Color melamina:* ${colorMel}
*7. Color acero:* ${colorEst}
*7.1. Medida del acero:* ${medidas}
*8. Detalles especificos:* 
*8.1. Pedido para envio:* 
*9. Fecha pedido:* ${nv.fecha_pedido}
*9.1. Hora:* ${nv.hora_entrega || '—'}
*10. Fecha entrega:* ${nv.fecha_entrega}
*11. Precio:* ${lineas.map(l => parseFloat(l.precio_vendido).toLocaleString('es-BO', { minimumFractionDigits: 0 })).join(' / ')} bs
*11.1. Embalaje:* 
*12. Recibo:* ${nv.cod_transaccion || 'No especificado'}
*13. Total:* ${totalNuevaVenta.toLocaleString('es-BO', { minimumFractionDigits: 0 })}
*14. Adelanto:* ${nv.anticipo ? parseFloat(nv.anticipo).toLocaleString('es-BO', { minimumFractionDigits: 0 }) : '0'}
*15. Saldo:* ${saldo.toLocaleString('es-BO', { minimumFractionDigits: 0 })}
*16. Delivery cotizado:* ${nv.delivery_cotizado ? parseFloat(nv.delivery_cotizado).toLocaleString('es-BO', { minimumFractionDigits: 0 }) : '0'}
*17. Nombre cliente:* ${modoCliente === 'nuevo' ? nuevoClienteNombre : clienteSeleccionado?.nombre || '—'}
*18. Celular cliente:* ${modoCliente === 'nuevo' ? nuevoClienteCelular : clienteSeleccionado?.celular || '—'}
*19. Ubicacion:* ${modoCliente === 'nuevo' ? nuevoClienteDireccion : clienteSeleccionado?.direccion || '—'}
*20. Número y color de puerta:* 
*21. Foto pedido especial:* `
    
    setTextoWhatsApp(texto)
    setMostrarTextoWA(true)
  }

  const copiarAlPortapapeles = () => {
    navigator.clipboard.writeText(textoWhatsApp).then(() => {
      alert('✅ Texto copiado al portapapeles. Abre WhatsApp y pega.')
    }).catch(() => {
      alert('❌ Error al copiar. Copia manualmente desde el cuadro de texto.')
    })
  }

  // ── Guardar nueva venta ───────────────────────────────────────────────────
  const confirmarNuevaVenta = async () => {
    setGuardandoNueva(true); setErrorGuardado('')

    // Obtener codigo de venta seguro desde la secuencia de Supabase
    const { data: codData, error: codError } = await supabase.rpc('siguiente_cod_venta')
    if (codError || !codData) {
      setErrorGuardado('Error al generar codigo de venta: ' + (codError?.message || ''))
      setGuardandoNueva(false); return
    }
    const codVentaFinal: number = codData

    let cod_cliente_final: number

    // Crear cliente nuevo si aplica
    if (modoCliente === 'nuevo') {
      const { data: cNuevo, error: eCli } = await supabase
        .from('clientes')
        .insert({
          codigo:    parseInt(nuevoClienteCodigo),
          nombre:    nuevoClienteNombre.trim(),
          celular:   nuevoClienteCelular.trim() || null,
          direccion: nuevoClienteDireccion.trim() || null,
          activo:    true,
        })
        .select('id').single()
      if (eCli || !cNuevo) {
        setErrorGuardado('Error al crear el cliente: ' + (eCli?.message || 'desconocido'))
        setGuardandoNueva(false); setPasoNueva('form'); return
      }
      cod_cliente_final = cNuevo.id
    } else {
      cod_cliente_final = clienteSeleccionado.id
    }

    const totalVenta = lineas.reduce((acc, l) =>
      acc + parseFloat(l.precio_vendido || '0') * parseInt(l.cantidad || '0'), 0)

    // Insertar cabecera venta
    const { error: eVenta } = await supabase.from('ventas').insert({
      cod_venta:         codVentaFinal,
      cod_cliente:       cod_cliente_final,
      cod_vendedor:      parseInt(nv.cod_vendedor),
      fecha_pedido:      nv.fecha_pedido,
      fecha_entrega:     nv.fecha_entrega || null,
      hora_entrega:      nv.hora_entrega || null,
      delivery_cotizado: nv.delivery_cotizado ? parseFloat(nv.delivery_cotizado) : null,
      delivery_pagado:   nv.delivery_pagado   ? parseFloat(nv.delivery_pagado)   : null,
      total_venta:       totalVenta,
      anticipo:          nv.anticipo          ? parseFloat(nv.anticipo)          : null,
      forma_pago:        nv.forma_pago,
      cod_transaccion:   nv.cod_transaccion || null,
      estado:            1,
    })

    if (eVenta) {
      setErrorGuardado('Error al registrar la venta: ' + eVenta.message)
      setGuardandoNueva(false); setPasoNueva('form'); return
    }

    // Insertar lineas
    const detallesToInsert = lineas.map((l, i) => ({
      cod_venta: codVentaFinal,
      item:             i + 1,
      cod_producto:     l.cod_producto,
      precio_cotizado:  l.precio_cotizado ? parseFloat(l.precio_cotizado) : null,
      precio_vendido:   parseFloat(l.precio_vendido),
      cantidad:         parseInt(l.cantidad),
      subtotal:         parseFloat(l.precio_vendido) * parseInt(l.cantidad),
      dimensiones:      l.dimensiones || null,
      color_estructura: l.color_estructura,
      color_melamina:   l.color_melamina,
    }))

    const { error: eDet } = await supabase.from('detalle_venta').insert(detallesToInsert)

    if (eDet) {
      // Revertir la venta si fallo el detalle
      await supabase.from('ventas').delete().eq('cod_venta', codVentaFinal)
      setErrorGuardado('Error al registrar los productos: ' + eDet.message)
      setGuardandoNueva(false); setPasoNueva('form'); return
    }

    // Insertar en progreso_produccion
    const { error: insertProgreso } = await supabase
      .from('progreso_produccion')
      .insert({
        codigo_pedido: codVentaFinal,
        estado: 1,
        fecha_ingreso: nv.fecha_pedido
      })

    if (insertProgreso) {
      console.error('Error al insertar progreso:', insertProgreso)
      // No revertir, solo loggear
    }

    // Exito — cerrar y recargar
    setGuardandoNueva(false)
    cerrarModalNueva()
    cargarVentas(0, filtros)
    setPage(0)

    // Generar nota de venta
    await generarNotaVenta({
      codVenta: codVentaFinal,
      cliente: modoCliente === 'nuevo' ? {
        nombre: nuevoClienteNombre,
        codigo: nuevoClienteCodigo,
        celular: nuevoClienteCelular,
        direccion: nuevoClienteDireccion
      } : clienteSeleccionado,
      vendedor: vendedorNombre,
      fechaPedido: nv.fecha_pedido,
      fechaEntrega: nv.fecha_entrega,
      horaEntrega: nv.hora_entrega,
      deliveryCotizado: nv.delivery_cotizado ? parseFloat(nv.delivery_cotizado) : 0,
      deliveryPagado: nv.delivery_pagado ? parseFloat(nv.delivery_pagado) : 0,
      anticipo: nv.anticipo ? parseFloat(nv.anticipo) : 0,
      formaPago: nv.forma_pago,
      codTransaccion: nv.cod_transaccion,
      lineas: lineas.map(l => ({
        producto: productos.find(p => p.codigo === l.cod_producto)?.nombre || l.cod_producto,
        precioVendido: parseFloat(l.precio_vendido),
        cantidad: parseInt(l.cantidad),
        subtotal: parseFloat(l.precio_vendido) * parseInt(l.cantidad),
        dimensiones: l.dimensiones,
        colorEstructura: coloresEst.find(c => c.codigo_color === l.color_estructura)?.detalle || l.color_estructura,
        colorMelamina: coloresMel.find(c => c.codigo_color === l.color_melamina)?.detalle || l.color_melamina,
      })),
      total: totalVenta
    })
  }

  // ── Calculos preview ──────────────────────────────────────────────────────
  const totalNuevaVenta = lineas.reduce((acc, l) =>
    acc + (parseFloat(l.precio_vendido || '0') * parseInt(l.cantidad || '0')), 0)

  const vendedorNombre = vendedores.find(v => String(v.id) === nv.cod_vendedor)?.nombre || ''
  const clienteNombre  = modoCliente === 'nuevo' ? `${nuevoClienteNombre} (Cód: ${nuevoClienteCodigo})` : (clienteSeleccionado?.nombre || '')

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
          {puedeRegistrar && (
            <button className="btn-nueva" onClick={abrirModalNueva}>
              ＋ Registrar venta
            </button>
          )}
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
                    <th style={thStyle}>F. Pedido</th>
                    <th style={thStyle}>F. Entrega</th>
                    <th style={thStyle}>Hora</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Anticipo</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Total</th>
                    <th style={thStyle}>Pago</th>
                    <th style={thStyle}>Transaccion</th>
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
      {/* MODAL NUEVA VENTA                                                   */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {modalNueva && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)', zIndex: 1000, overflowY: 'auto', display: 'flex', justifyContent: 'center', padding: '20px' }}>
          <div className="modal-inner" style={{ backgroundColor: 'white', borderRadius: '16px', padding: '32px', width: '100%', maxWidth: '860px', boxShadow: '0 8px 40px rgba(0,0,0,0.2)', height: 'fit-content', marginTop: '10px', marginBottom: '20px' }}>

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <div>
                <h2 style={{ margin: '0 0 4px', fontSize: '20px' }}>
                  {pasoNueva === 'form' ? '➕ Registrar nueva venta' : '👁 Previsualizar venta'}
                </h2>
                <p style={{ margin: 0, fontSize: '12px', color: '#888' }}>
                  Código asignado: <strong style={{ color: '#087e0b' }}>#{nextCodVenta}</strong>
                  {pasoNueva === 'preview' && ' — Revisa los datos antes de confirmar'}
                </p>
              </div>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', color: pasoNueva === 'form' ? '#087e0b' : '#bbb', fontWeight: 'bold' }}>① Formulario</span>
                <span style={{ color: '#ddd', fontSize: '16px' }}>→</span>
                <span style={{ fontSize: '12px', color: pasoNueva === 'preview' ? '#087e0b' : '#bbb', fontWeight: 'bold' }}>② Preview</span>
                <span style={{ color: '#ddd', fontSize: '16px' }}>→</span>
                <span style={{ fontSize: '12px', color: '#bbb', fontWeight: 'bold' }}>③ Guardado</span>
              </div>
              <button className="btn-secondary" style={{ padding: '7px 14px', fontSize: '12px' }} onClick={cerrarModalNueva}>✕ Cerrar</button>
            </div>

            {loadingMaestros ? (
              <p style={{ textAlign: 'center', color: '#888', padding: '40px' }}>Cargando datos...</p>
            ) : pasoNueva === 'form' ? (
              // ══════════════════ PASO 1: FORMULARIO ══════════════════
              <>
                {errorGuardado && (
                  <div style={{ backgroundColor: '#ffebee', border: '1px solid #ef9a9a', borderRadius: '8px', padding: '12px 16px', marginBottom: '20px', fontSize: '13px', color: '#c62828' }}>
                    ❌ {errorGuardado}
                  </div>
                )}

                {/* CLIENTE */}
                <div style={{ backgroundColor: '#f9f9f9', borderRadius: '12px', padding: '20px', marginBottom: '20px', border: '1px solid #eee' }}>
                  <h3 style={{ margin: '0 0 14px', fontSize: '15px', color: '#333' }}>👥 Cliente</h3>
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
                    <button className={`tab-btn ${modoCliente === 'existente' ? 'tab-active' : 'tab-inactive'}`}
                      onClick={() => { setModoCliente('existente'); setErrorCliente('') }}>
                      Cliente existente
                    </button>
                    <button className={`tab-btn ${modoCliente === 'nuevo' ? 'tab-active' : 'tab-inactive'}`}
                      onClick={async () => {
        setModoCliente('nuevo'); setErrorCliente('')
        // Cargar el siguiente codigo correlativo de clientes
        setLoadingNextCodCliente(true)
        const { data } = await supabase.from('clientes').select('codigo').order('codigo', { ascending: false }).limit(1)
        const ultimo = data?.[0]?.codigo || 0
        setNuevoClienteCodigo(String(ultimo + 1))
        setLoadingNextCodCliente(false)
      }}>
                      + Nuevo cliente
                    </button>
                  </div>

                  {modoCliente === 'existente' ? (
                    <div style={{ position: 'relative' }}>
                      <label style={labelStyle}>Buscar por nombre, código o celular (mínimo 2 caracteres)</label>
                      {clienteSeleccionado ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', backgroundColor: '#e8f5e9', border: '1px solid #a5d6a7', borderRadius: '8px', padding: '10px 14px' }}>
                          <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#2e7d32' }}>✓ {clienteSeleccionado.nombre}</span>
                          {clienteSeleccionado.codigo && <span style={{ fontSize: '11px', color: '#555' }}>Cód: {clienteSeleccionado.codigo}</span>}
                          <button onClick={() => { setClienteSeleccionado(null); setClienteBusqueda('') }}
                            style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#e53935', cursor: 'pointer', fontSize: '16px' }}>✕</button>
                        </div>
                      ) : (
                        <>
                          <input style={errorCliente ? inputErr : inputStyle} placeholder="Escribe el nombre del cliente..."
                            value={clienteBusqueda} onChange={e => setClienteBusqueda(e.target.value)} />
                          {clientesFiltrados.length > 0 && (
                            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: 'white', border: '1px solid #ddd', borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', zIndex: 10 }}>
                              {clientesFiltrados.map(c => (
                                <div key={c.id} className="cliente-sugerencia"
                                  onClick={() => { setClienteSeleccionado(c); setClienteBusqueda(''); setErrorCliente('') }}>
                                  <strong>{c.nombre}</strong>
                                  {c.codigo && <span style={{ color: '#888', marginLeft: '8px', fontSize: '11px' }}>Cód: {c.codigo}</span>}
                                  {c.celular && <span style={{ color: '#aaa', marginLeft: '8px', fontSize: '11px' }}>📞 {c.celular}</span>}
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                      {errorCliente && <p style={errMsg}>{errorCliente}</p>}
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px' }}>
                      <div>
                        <label style={labelStyle}>Código *</label>
                        <input
                          type="number"
                          style={inputStyle}
                          value={nuevoClienteCodigo}
                          placeholder={loadingNextCodCliente ? 'Calculando...' : 'Ej: 2085'}
                          onChange={e => setNuevoClienteCodigo(e.target.value)}
                        />
                        <p style={{ fontSize: '10px', color: '#aaa', margin: '3px 0 0' }}>Auto-generado, puedes cambiar</p>
                      </div>
                      <div>
                        <label style={labelStyle}>Nombre completo *</label>
                        <input
                          style={errorCliente ? inputErr : inputStyle}
                          placeholder="Nombre del cliente"
                          value={nuevoClienteNombre}
                          onChange={e => { setNuevoClienteNombre(e.target.value); setErrorCliente('') }}
                        />
                        {errorCliente && <p style={errMsg}>{errorCliente}</p>}
                      </div>
                      <div>
                        <label style={labelStyle}>Celular</label>
                        <input
                          type="text"
                          style={inputStyle}
                          placeholder="Numero de celular"
                          value={nuevoClienteCelular}
                          onChange={e => setNuevoClienteCelular(e.target.value)}
                        />
                      </div>
                      <div>
                        <label style={labelStyle}>Dirección</label>
                        <input
                          type="text"
                          style={inputStyle}
                          placeholder="Dirección o referencia"
                          value={nuevoClienteDireccion}
                          onChange={e => setNuevoClienteDireccion(e.target.value)}
                        />
                      </div>
                      <div style={{ gridColumn: 'span 2' }}>
                        <div style={{ backgroundColor: '#e3f2fd', border: '1px solid #90caf9', borderRadius: '8px', padding: '8px 12px', fontSize: '12px', color: '#1565c0' }}>
                          💡 El cliente se creará en la base de datos al confirmar la venta. Puedes editarlo después desde la sección <strong>Clientes</strong>.
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* DATOS VENTA */}
                <div style={{ backgroundColor: '#f9f9f9', borderRadius: '12px', padding: '20px', marginBottom: '20px', border: '1px solid #eee' }}>
                  <h3 style={{ margin: '0 0 14px', fontSize: '15px', color: '#333' }}>📋 Datos de la venta</h3>
                  <div className="detalle-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
                    <div>
                      <label style={labelStyle}>Vendedor *</label>
                      <select style={erroresCab.cod_vendedor ? inputErr : inputStyle} value={nv.cod_vendedor}
                        onChange={e => { setNv(p => ({ ...p, cod_vendedor: e.target.value })); setErroresCab(p => ({ ...p, cod_vendedor: '' })) }}>
                        <option value="">— Selecciona —</option>
                        {vendedores.map(v => <option key={v.id} value={String(v.id)}>{v.nombre}</option>)}
                      </select>
                      {erroresCab.cod_vendedor && <p style={errMsg}>{erroresCab.cod_vendedor}</p>}
                    </div>
                    <div>
                      <label style={labelStyle}>Fecha pedido *</label>
                      <input type="date" style={erroresCab.fecha_pedido ? inputErr : inputStyle} value={nv.fecha_pedido}
                        onChange={e => { setNv(p => ({ ...p, fecha_pedido: e.target.value })); setErroresCab(p => ({ ...p, fecha_pedido: '' })) }} />
                      {erroresCab.fecha_pedido && <p style={errMsg}>{erroresCab.fecha_pedido}</p>}
                    </div>
                    <div>
                      <label style={labelStyle}>Fecha entrega *</label>
                      <input type="date" style={erroresCab.fecha_entrega ? inputErr : inputStyle} value={nv.fecha_entrega}
                        onChange={e => { setNv(p => ({ ...p, fecha_entrega: e.target.value })); setErroresCab(p => ({ ...p, fecha_entrega: '' })) }} />
                      {erroresCab.fecha_entrega && <p style={errMsg}>{erroresCab.fecha_entrega}</p>}
                    </div>
                    <div>
                      <label style={labelStyle}>Hora entrega</label>
                      <input type="time" style={inputStyle} value={nv.hora_entrega}
                        onChange={e => setNv(p => ({ ...p, hora_entrega: e.target.value }))} />
                    </div>
                    <div>
                      <label style={labelStyle}>Forma de pago *</label>
                      <select style={erroresCab.forma_pago ? inputErr : inputStyle} value={nv.forma_pago}
                        onChange={e => { setNv(p => ({ ...p, forma_pago: e.target.value })); setErroresCab(p => ({ ...p, forma_pago: '' })) }}>
                        <option value="">— Selecciona —</option>
                        {FORMAS_PAGO.map(fp => <option key={fp} value={fp}>{fp.replace('_', ' ')}</option>)}
                      </select>
                      {erroresCab.forma_pago && <p style={errMsg}>{erroresCab.forma_pago}</p>}
                    </div>
                    <div>
                      <label style={labelStyle}>Anticipo (Bs.)</label>
                      <input type="number" step="0.01" placeholder="0.00" style={inputStyle} value={nv.anticipo}
                        onChange={e => setNv(p => ({ ...p, anticipo: e.target.value }))} />
                    </div>
                    <div>
                      <label style={labelStyle}>Delivery cotizado (Bs.)</label>
                      <input type="number" step="0.01" placeholder="0.00" style={inputStyle} value={nv.delivery_cotizado}
                        onChange={e => setNv(p => ({ ...p, delivery_cotizado: e.target.value }))} />
                    </div>
                    <div>
                      <label style={labelStyle}>Delivery pagado (Bs.)</label>
                      <input type="number" step="0.01" placeholder="0.00" style={inputStyle} value={nv.delivery_pagado}
                        onChange={e => setNv(p => ({ ...p, delivery_pagado: e.target.value }))} />
                    </div>
                    <div>
                      <label style={labelStyle}>Codigo transaccion</label>
                      <input type="text" placeholder="Nro. transferencia / recibo" style={inputStyle} value={nv.cod_transaccion}
                        onChange={e => setNv(p => ({ ...p, cod_transaccion: e.target.value }))} />
                    </div>
                  </div>
                </div>

                {/* LINEAS PRODUCTOS */}
                <div style={{ marginBottom: '20px' }}>
                  <h3 style={{ margin: '0 0 14px', fontSize: '15px', color: '#333' }}>📦 Productos</h3>

                  {lineas.map((linea, idx) => (
                    <div key={linea.tempId} style={{ backgroundColor: '#f9f9f9', borderRadius: '12px', padding: '16px', marginBottom: '12px', border: erroresLineas[idx] && Object.keys(erroresLineas[idx]).length > 0 ? '1px solid #ffcdd2' : '1px solid #eee' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#087e0b' }}>ÍTEM {idx + 1}</span>
                        {lineas.length > 1 && (
                          <button onClick={() => eliminarLinea(idx)}
                            style={{ background: 'none', border: 'none', color: '#e53935', cursor: 'pointer', fontSize: '13px' }}>
                            🗑 Eliminar
                          </button>
                        )}
                      </div>
                      <div className="linea-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                        <div style={{ gridColumn: 'span 3' }}>
                          <label style={labelStyle}>Producto *</label>
                          <select style={erroresLineas[idx]?.cod_producto ? inputErr : inputStyle}
                            value={linea.cod_producto}
                            onChange={e => { seleccionarProducto(idx, e.target.value); setErroresLineas(prev => prev.map((x, i) => i === idx ? { ...x, cod_producto: '' } : x)) }}>
                            <option value="">— Selecciona un producto —</option>
                            {productos.map((p: any) => (
                              <option key={p.codigo} value={p.codigo}>
                                {p.codigo} — {p.nombre}
                              </option>
                            ))}
                          </select>
                          {erroresLineas[idx]?.cod_producto && <p style={errMsg}>{erroresLineas[idx].cod_producto}</p>}
                        </div>
                        <div>
                          <label style={labelStyle}>Precio cotizado (Bs.)</label>
                          <input type="number" step="0.01" placeholder="0.00" style={inputStyle}
                            value={linea.precio_cotizado}
                            onChange={e => setLineas(prev => prev.map((l, i) => i === idx ? { ...l, precio_cotizado: e.target.value } : l))} />
                        </div>
                        <div>
                          <label style={labelStyle}>Precio vendido (Bs.) *</label>
                          <input type="number" step="0.01" placeholder="0.00"
                            style={erroresLineas[idx]?.precio_vendido ? inputErr : inputStyle}
                            value={linea.precio_vendido}
                            onChange={e => { setLineas(prev => prev.map((l, i) => i === idx ? { ...l, precio_vendido: e.target.value } : l)); setErroresLineas(prev => prev.map((x, i) => i === idx ? { ...x, precio_vendido: '' } : x)) }} />
                          {erroresLineas[idx]?.precio_vendido && <p style={errMsg}>{erroresLineas[idx].precio_vendido}</p>}
                        </div>
                        <div>
                          <label style={labelStyle}>Cantidad *</label>
                          <input type="number" placeholder="1"
                            style={erroresLineas[idx]?.cantidad ? inputErr : inputStyle}
                            value={linea.cantidad}
                            onChange={e => { setLineas(prev => prev.map((l, i) => i === idx ? { ...l, cantidad: e.target.value } : l)); setErroresLineas(prev => prev.map((x, i) => i === idx ? { ...x, cantidad: '' } : x)) }} />
                          {erroresLineas[idx]?.cantidad && <p style={errMsg}>{erroresLineas[idx].cantidad}</p>}
                        </div>
                        <div>
                          <label style={labelStyle}>Dimensiones</label>
                          <input type="text" placeholder="Ej: 180x60x90" style={inputStyle}
                            value={linea.dimensiones}
                            onChange={e => setLineas(prev => prev.map((l, i) => i === idx ? { ...l, dimensiones: e.target.value } : l))} />
                        </div>
                        <div>
                          <label style={labelStyle}>Color estructura *</label>
                          <select style={erroresLineas[idx]?.color_estructura ? inputErr : inputStyle}
                            value={linea.color_estructura}
                            onChange={e => { setLineas(prev => prev.map((l, i) => i === idx ? { ...l, color_estructura: e.target.value } : l)); setErroresLineas(prev => prev.map((x, i) => i === idx ? { ...x, color_estructura: '' } : x)) }}>
                            <option value="">— Selecciona color —</option>
                            {coloresEst.map((c: any) => (
                              <option key={c.id} value={c.codigo_color}>
                                {c.codigo_color} — {c.detalle}
                              </option>
                            ))}
                          </select>
                          {erroresLineas[idx]?.color_estructura && <p style={errMsg}>{erroresLineas[idx].color_estructura}</p>}
                        </div>
                        <div>
                          <label style={labelStyle}>Color melamina *</label>
                          <select style={erroresLineas[idx]?.color_melamina ? inputErr : inputStyle}
                            value={linea.color_melamina}
                            onChange={e => { setLineas(prev => prev.map((l, i) => i === idx ? { ...l, color_melamina: e.target.value } : l)); setErroresLineas(prev => prev.map((x, i) => i === idx ? { ...x, color_melamina: '' } : x)) }}>
                            <option value="">— Selecciona melamina —</option>
                            {coloresMel.map((m: any) => (
                              <option key={m.id} value={m.codigo_melamina}>
                                {m.codigo_melamina} — {m.detalle}
                              </option>
                            ))}
                          </select>
                          {erroresLineas[idx]?.color_melamina && <p style={errMsg}>{erroresLineas[idx].color_melamina}</p>}
                        </div>
                      </div>
                      {/* Subtotal por linea */}
                      {linea.precio_vendido && linea.cantidad && (
                        <div style={{ marginTop: '10px', textAlign: 'right', fontSize: '13px', color: '#087e0b', fontWeight: 'bold' }}>
                          Subtotal: Bs. {(parseFloat(linea.precio_vendido) * parseInt(linea.cantidad)).toLocaleString('es-BO', { minimumFractionDigits: 2 })}
                        </div>
                      )}
                    </div>
                  ))}

                  <button className="btn-add-linea" onClick={agregarLinea}>
                    ＋ Agregar otro producto
                  </button>
                </div>

                {/* Total y boton siguiente */}
                <div style={{ borderTop: '2px solid #eee', paddingTop: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <p style={{ margin: '0', fontSize: '13px', color: '#888' }}>Total estimado</p>
                    <p style={{ margin: '4px 0 0', fontSize: '22px', fontWeight: 'bold', color: '#087e0b' }}>
                      Bs. {totalNuevaVenta.toLocaleString('es-BO', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button className="btn-secondary" onClick={cerrarModalNueva}>Cancelar</button>
                    <button className="btn-primary" onClick={irAPreview} style={{ padding: '10px 28px', fontSize: '14px' }}>
                      Revisar y confirmar →
                    </button>
                  </div>
                </div>
              </>
            ) : (
              // ══════════════════ PASO 2: PREVIEW ══════════════════
              <>
                {errorGuardado && (
                  <div style={{ backgroundColor: '#ffebee', border: '1px solid #ef9a9a', borderRadius: '8px', padding: '12px 16px', marginBottom: '20px', fontSize: '13px', color: '#c62828' }}>
                    ❌ {errorGuardado}
                  </div>
                )}

                <div style={{ backgroundColor: '#e8f5e9', border: '1px solid #a5d6a7', borderRadius: '10px', padding: '14px 20px', marginBottom: '24px', fontSize: '13px', color: '#2e7d32' }}>
                  ✅ Todo listo. Revisa los datos a continuacion y confirma para grabar en la base de datos.
                </div>

                {/* Cabecera preview */}
                <div style={{ backgroundColor: '#f9f9f9', borderRadius: '12px', padding: '20px', marginBottom: '20px', border: '1px solid #eee' }}>
                  <h3 style={{ margin: '0 0 16px', fontSize: '14px', color: '#555', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Datos de la venta</h3>
                  <div className="detalle-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                    {[
                      ['# Venta', `#${nextCodVenta}`],
                      ['Cliente', clienteNombre + (modoCliente === 'nuevo' ? ' (NUEVO)' : '')],
                      ['Vendedor', vendedorNombre],
                      ['Fecha pedido', fmtFecha(nv.fecha_pedido)],
                      ['Fecha entrega', fmtFecha(nv.fecha_entrega)],
                      ['Hora entrega', nv.hora_entrega || '—'],
                      ['Forma de pago', nv.forma_pago.replace('_', ' ')],
                      ['Anticipo', nv.anticipo ? `Bs. ${parseFloat(nv.anticipo).toLocaleString('es-BO', { minimumFractionDigits: 2 })}` : '—'],
                      ['Delivery cotizado', nv.delivery_cotizado ? `Bs. ${parseFloat(nv.delivery_cotizado).toLocaleString('es-BO', { minimumFractionDigits: 2 })}` : '—'],
                      ['Delivery pagado', nv.delivery_pagado ? `Bs. ${parseFloat(nv.delivery_pagado).toLocaleString('es-BO', { minimumFractionDigits: 2 })}` : '—'],
                      ['Codigo transaccion', nv.cod_transaccion || '—'],
                    ].map(([lbl, val]) => (
                      <div key={lbl} style={{ backgroundColor: 'white', borderRadius: '8px', padding: '10px 14px', border: '1px solid #eee' }}>
                        <p style={{ margin: '0 0 3px', fontSize: '10px', color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{lbl}</p>
                        <p style={{ margin: 0, fontSize: '13px', fontWeight: '600', color: lbl === '# Venta' ? '#087e0b' : '#222' }}>{val}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Lineas preview */}
                <h3 style={{ margin: '0 0 12px', fontSize: '14px', color: '#555', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Productos ({lineas.length})
                </h3>
                <div style={{ overflowX: 'auto', marginBottom: '24px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#f9f9f9' }}>
                        {['#', 'Producto', 'P. Cotizado', 'P. Vendido', 'Cant.', 'Subtotal', 'Dimensiones', 'Estructura', 'Melamina'].map(h => (
                          <th key={h} style={{ ...thStyle, fontSize: '11px' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {lineas.map((l, i) => {
                        const prod = productos.find(p => (p.codigo || String(p.id)) === l.cod_producto)
                        const sub  = parseFloat(l.precio_vendido) * parseInt(l.cantidad)
                        return (
                          <tr key={l.tempId} style={{ backgroundColor: i % 2 === 0 ? 'white' : '#fafafa' }}>
                            <td style={{ ...tdStyle, color: '#087e0b', fontWeight: 'bold' }}>{i + 1}</td>
                            <td style={{ ...tdStyle, fontWeight: '500' }}>{prod?.nombre || l.cod_producto}</td>
                            <td style={{ ...tdStyle, textAlign: 'right' }}>{l.precio_cotizado ? `Bs. ${parseFloat(l.precio_cotizado).toLocaleString('es-BO', { minimumFractionDigits: 2 })}` : '—'}</td>
                            <td style={{ ...tdStyle, textAlign: 'right' }}>Bs. {parseFloat(l.precio_vendido).toLocaleString('es-BO', { minimumFractionDigits: 2 })}</td>
                            <td style={{ ...tdStyle, textAlign: 'center' }}>{l.cantidad}</td>
                            <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 'bold', color: '#087e0b' }}>Bs. {sub.toLocaleString('es-BO', { minimumFractionDigits: 2 })}</td>
                            <td style={{ ...tdStyle, fontSize: '12px', color: '#666' }}>{l.dimensiones || '—'}</td>
                            <td style={{ ...tdStyle, fontSize: '12px' }}>{l.color_estructura}</td>
                            <td style={{ ...tdStyle, fontSize: '12px' }}>
                              {coloresMel.find((m: any) => m.codigo_melamina === l.color_melamina)?.detalle || l.color_melamina}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{ backgroundColor: '#f0fff0' }}>
                        <td colSpan={5} style={{ padding: '12px 14px', fontWeight: 'bold', fontSize: '14px', borderTop: '2px solid #087e0b' }}>TOTAL VENTA</td>
                        <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 'bold', fontSize: '18px', color: '#087e0b', borderTop: '2px solid #087e0b' }}>
                          Bs. {totalNuevaVenta.toLocaleString('es-BO', { minimumFractionDigits: 2 })}
                        </td>
                        <td colSpan={3} style={{ borderTop: '2px solid #087e0b' }}></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Botón WhatsApp */}
                <div style={{ marginBottom: '20px' }}>
                  <button 
                    onClick={() => generarTextoWhatsApp(nextCodVenta)}
                    style={{
                      background: '#25D366',
                      color: 'white',
                      border: 'none',
                      padding: '10px 20px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontWeight: 'bold',
                      fontSize: '14px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      width: '100%',
                      justifyContent: 'center'
                    }}
                  >
                    💬 Generar texto para WhatsApp
                  </button>
                </div>

                {/* Textarea WhatsApp */}
                {mostrarTextoWA && (
                  <div style={{ marginBottom: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <label style={{ fontSize: '13px', fontWeight: 'bold', color: '#555' }}>Texto para WhatsApp</label>
                      <button
                        onClick={copiarAlPortapapeles}
                        style={{
                          background: '#25D366',
                          color: 'white',
                          border: 'none',
                          padding: '6px 14px',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontSize: '12px',
                          fontWeight: 'bold'
                        }}
                      >
                        📋 Copiar
                      </button>
                    </div>
                    <textarea
                      value={textoWhatsApp}
                      readOnly
                      style={{
                        width: '100%',
                        minHeight: '300px',
                        padding: '12px',
                        borderRadius: '8px',
                        border: '2px solid #25D366',
                        fontFamily: 'monospace',
                        fontSize: '12px',
                        backgroundColor: '#f0f9f6',
                        color: '#222',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                )}

                {/* Botones confirmacion */}
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'space-between', alignItems: 'center' }}>
                  <button className="btn-secondary" onClick={() => setPasoNueva('form')} disabled={guardandoNueva}>
                    ← Volver y editar
                  </button>
                  <button className="btn-primary" onClick={confirmarNuevaVenta} disabled={guardandoNueva}
                    style={{ padding: '12px 32px', fontSize: '15px' }}>
                    {guardandoNueva ? 'Guardando...' : '✅ Confirmar y grabar venta'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
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
