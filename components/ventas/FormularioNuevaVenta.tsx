'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
// Nota: el comprobante adjuntado al REGISTRAR la venta se sube inline (más abajo,
// subirComprobante). Para adjuntar/ver comprobantes de ventas YA EXISTENTES,
// usa el componente ComprobantesVenta.tsx desde el modal de detalle en page.tsx.

// ── Tipos exportados (reutilizables desde donde se importe el componente) ────
export interface NuevaLinea {
  tempId: number
  cod_producto: string
  precio_cotizado: string
  precio_vendido: string
  cantidad: string
  dimensiones: string
  color_estructura: string
  color_melamina: string
}

export interface ErroresLinea {
  cod_producto?: string
  precio_vendido?: string
  cantidad?: string
  color_estructura?: string
  color_melamina?: string
}

export interface VendedorActual {
  id: number
  nombre: string
}

export interface ClienteFijo {
  id: number
  codigo?: number | null
  nombre: string
  celular?: string | null
  direccion?: string | null
}

interface FormularioNuevaVentaProps {
  /** 'vendedor': lo usa el personal de ventas (comportamiento actual).
   *  'cliente': lo usará un cliente registrando su propio pedido (futuro). */
  modo?: 'vendedor' | 'cliente'
  /** Vendedor logueado. Solo se usa en modo 'vendedor' para precargar el select. */
  vendedorActual?: VendedorActual | null
  /** Cliente logueado. Solo se usa en modo 'cliente': la venta queda fija a este cliente,
   *  sin mostrar buscador ni alta de cliente nuevo. */
  clienteFijo?: ClienteFijo | null
  /** 'modal' (por defecto) dibuja el overlay fijo de pantalla completa, igual que antes.
   *  'pagina' dibuja solo la tarjeta, para embeber en una página propia (ej. /mi-pedido). */
  contenedor?: 'modal' | 'pagina'
  /** Se llama al cerrar/cancelar. */
  onCerrar?: () => void
  /** Se llama luego de grabar la venta con éxito, con el cod_venta creado. */
  onVentaCreada?: (codVenta: number) => void
}

const FORMAS_PAGO = ['ANTICIPO', 'CONTRA_ENTREGA', 'EFECTIVO', 'TRANSFERENCIA']
const UBICACIONES_PEDIDO = ['La Paz', 'El Alto', 'Cochabamba', 'Santa Cruz']

// Bucket de Supabase Storage donde se guardan los comprobantes de depósito.
// Ver sql/comprobantes_venta.sql para el script que crea el bucket y la tabla.
const BUCKET_COMPROBANTES = 'comprobantes-pago'
const COMPROBANTE_MAX_MB = 8

const fmtFecha = (v: string | null | undefined) => {
  if (!v) return '—'
  try { return new Date(v + 'T00:00:00').toLocaleDateString('es-BO', { day: '2-digit', month: '2-digit', year: 'numeric' }) }
  catch { return v }
}

const LINEA_VACIA = (tempId: number): NuevaLinea => ({
  tempId, cod_producto: '', precio_cotizado: '', precio_vendido: '',
  cantidad: '', dimensiones: '', color_estructura: '', color_melamina: '',
})

// ── Estilos compartidos ──────────────────────────────────────────────────────
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

// Miniatura de foto para producto / melamina. Si no hay foto_url, muestra un
// placeholder — así no rompe nada si la columna está vacía.
function Miniatura({ url, label }: { url?: string | null; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
      {url ? (
        <img src={url} alt={label} style={{ width: '44px', height: '44px', objectFit: 'cover', borderRadius: '8px', border: '1px solid #eee' }} />
      ) : (
        <div style={{ width: '44px', height: '44px', borderRadius: '8px', border: '1px dashed #ddd', backgroundColor: '#fafafa', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', color: '#ccc' }}>🖼️</div>
      )}
      <span style={{ fontSize: '11px', color: '#888' }}>{label}</span>
    </div>
  )
}

export default function FormularioNuevaVenta({
  modo = 'vendedor',
  vendedorActual = null,
  clienteFijo = null,
  contenedor = 'modal',
  onCerrar,
  onVentaCreada,
}: FormularioNuevaVentaProps) {
  const [paso, setPaso] = useState<'form' | 'preview'>('form')
  const [loadingMaestros, setLoadingMaestros] = useState(true)

  // Datos maestros
  const [productos, setProductos] = useState<any[]>([])
  const [coloresEst, setColoresEst] = useState<any[]>([])
  const [coloresMel, setColoresMel] = useState<any[]>([])
  const [vendedores, setVendedores] = useState<{ id: number; nombre: string }[]>([])
  const [nextCodVenta, setNextCodVenta] = useState<number>(0)

  // Cliente (solo aplica en modo 'vendedor')
  const [modoCliente, setModoCliente] = useState<'existente' | 'nuevo'>('existente')
  const [clienteBusqueda, setClienteBusqueda] = useState('')
  const [clientesFiltrados, setClientesFiltrados] = useState<any[]>([])
  const [clienteSeleccionado, setClienteSeleccionado] = useState<any>(null)
  const [nuevoClienteNombre, setNuevoClienteNombre] = useState('')
  const [nuevoClienteCodigo, setNuevoClienteCodigo] = useState('')
  const [nuevoClienteDireccion, setNuevoClienteDireccion] = useState('')
  const [nuevoClienteCelular, setNuevoClienteCelular] = useState('')
  const [loadingNextCodCliente, setLoadingNextCodCliente] = useState(false)
  const [errorCliente, setErrorCliente] = useState('')

  // Cabecera — NOTA: ya no se registra "delivery pagado", solo "delivery cotizado".
  const [nv, setNv] = useState({
    cod_vendedor: vendedorActual ? String(vendedorActual.id) : '',
    fecha_pedido: new Date().toISOString().split('T')[0],
    fecha_entrega: '', hora_entrega: '', ubicacion_pedido: '', detalles_especificos: '',
    delivery_cotizado: '', anticipo: '', forma_pago: '', cod_transaccion: '',
  })
  const [erroresCab, setErroresCab] = useState<Record<string, string>>({})

  // Líneas de productos
  const [lineas, setLineas] = useState<NuevaLinea[]>([LINEA_VACIA(1)])
  const [nextTempId, setNextTempId] = useState(2)
  const [erroresLineas, setErroresLineas] = useState<ErroresLinea[]>([{}])

  // Comprobante de depósito (imagen o PDF). El "modo de pago"/banco queda
  // pendiente hasta que exista el catálogo de bancos — por ahora el código de
  // transacción se ingresa manualmente y el comprobante es opcional.
  const [comprobanteFile, setComprobanteFile] = useState<File | null>(null)
  const [errorComprobante, setErrorComprobante] = useState('')
  const [subiendoComprobante, setSubiendoComprobante] = useState(false)
  const [avisoComprobante, setAvisoComprobante] = useState('')

  const [guardandoNueva, setGuardandoNueva] = useState(false)
  const [errorGuardado, setErrorGuardado] = useState('')
  const [textoWhatsApp, setTextoWhatsApp] = useState('')
  const [mostrarTextoWA, setMostrarTextoWA] = useState(false)

  // ── Cargar datos maestros al montar ─────────────────────────────────────
  useEffect(() => {
    (async () => {
      setLoadingMaestros(true)
      const promesas: any[] = [
        supabase.from('productos').select('codigo, nombre, precio_tienda, precio_minimo, medidas, foto_url').order('nombre'),
        supabase.from('colores').select('id, codigo_color, detalle').order('detalle'),
        // NOTA: la tabla "colores" (estructura) todavía no tiene columna foto_url.
        // Cuando la agregues, súmala al select de arriba y a <Miniatura> más abajo.
        supabase.from('melaminas').select('id, codigo_melamina, detalle, foto_url').order('detalle'),
        supabase.from('ventas').select('cod_venta').order('cod_venta', { ascending: false }).limit(1),
      ]
      if (modo === 'vendedor') {
        promesas.push(supabase.from('vendedores').select('id, nombre').eq('activo', true).order('nombre'))
      }
      const [pRes, ceRes, cmRes, maxRes, vRes] = await Promise.all(promesas)

      setProductos(pRes.data || [])
      setColoresEst(ceRes.data || [])
      setColoresMel(cmRes.data || [])
      setNextCodVenta((maxRes.data?.[0]?.cod_venta || 0) + 1)
      if (modo === 'vendedor') setVendedores((vRes?.data || []).map((v: any) => ({ id: v.id, nombre: v.nombre })))
      setLoadingMaestros(false)
    })()
  }, [modo])

  // ── Búsqueda de clientes en tiempo real (solo modo vendedor) ────────────
  useEffect(() => {
    if (modo !== 'vendedor') return
    if (!clienteBusqueda.trim() || clienteBusqueda.trim().length < 2) { setClientesFiltrados([]); return }
    const timer = setTimeout(async () => {
      const q = clienteBusqueda.trim()
      const esNumero = /^\d+$/.test(q)
      let query = supabase.from('clientes').select('id, codigo, nombre, direccion, celular').limit(8).order('nombre')
      query = esNumero
        ? query.or(`codigo.eq.${q},nombre.ilike.%${q}%,celular.ilike.%${q}%`)
        : query.or(`nombre.ilike.%${q}%,celular.ilike.%${q}%`)
      const { data } = await query
      setClientesFiltrados(data || [])
    }, 300)
    return () => clearTimeout(timer)
  }, [clienteBusqueda, modo])

  const activarClienteNuevo = async () => {
    setModoCliente('nuevo'); setErrorCliente('')
    setLoadingNextCodCliente(true)
    const { data } = await supabase.from('clientes').select('codigo').order('codigo', { ascending: false }).limit(1)
    setNuevoClienteCodigo(String((data?.[0]?.codigo || 0) + 1))
    setLoadingNextCodCliente(false)
  }

  const seleccionarProducto = (idx: number, codProducto: string) => {
    const prod = productos.find((p: any) => p.codigo === codProducto)
    setLineas(prev => prev.map((l, i) => i === idx ? {
      ...l,
      cod_producto: codProducto,
      precio_cotizado: prod?.precio_minimo ? String(prod.precio_minimo) : l.precio_cotizado,
      precio_vendido: prod?.precio_tienda ? String(prod.precio_tienda) : l.precio_vendido,
      dimensiones: prod?.medidas ? prod.medidas : l.dimensiones,
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

  const onSeleccionarComprobante = (file: File | null) => {
    setErrorComprobante('')
    if (!file) { setComprobanteFile(null); return }
    const esImagen = file.type.startsWith('image/')
    const esPdf = file.type === 'application/pdf'
    if (!esImagen && !esPdf) { setErrorComprobante('Solo se aceptan imágenes o archivos PDF.'); return }
    if (file.size > COMPROBANTE_MAX_MB * 1024 * 1024) { setErrorComprobante(`El archivo supera los ${COMPROBANTE_MAX_MB}MB.`); return }
    setComprobanteFile(file)
  }

  // ── Validación ────────────────────────────────────────────────────────
  const validar = (): boolean => {
    let ok = true
    const ec: Record<string, string> = {}
    const ecl = lineas.map(() => ({} as ErroresLinea))

    if (modo === 'vendedor') {
      let eclienteMsg = ''
      if (modoCliente === 'existente' && !clienteSeleccionado) { eclienteMsg = 'Selecciona un cliente existente'; ok = false }
      if (modoCliente === 'nuevo') {
        if (!nuevoClienteNombre.trim()) { eclienteMsg = 'Ingresa el nombre del nuevo cliente'; ok = false }
        else if (!nuevoClienteCodigo.trim()) { eclienteMsg = 'El codigo del cliente es obligatorio'; ok = false }
      }
      setErrorCliente(eclienteMsg)
      if (!nv.cod_vendedor) { ec.cod_vendedor = 'Selecciona un vendedor'; ok = false }
    } else {
      if (!clienteFijo) { setErrorCliente('No se pudo identificar tu cuenta de cliente. Vuelve a iniciar sesión.'); ok = false }
      else setErrorCliente('')
    }

    if (!nv.fecha_pedido) { ec.fecha_pedido = 'Ingresa la fecha de pedido'; ok = false }
    if (!nv.fecha_entrega) { ec.fecha_entrega = 'Ingresa la fecha de entrega'; ok = false }
    if (!nv.ubicacion_pedido) { ec.ubicacion_pedido = 'Selecciona la ubicación del pedido'; ok = false }
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

    if (errorComprobante) ok = false

    setErroresCab(ec)
    setErroresLineas(ecl)
    return ok
  }

  const irAPreview = () => { if (validar()) setPaso('preview') }

  const totalNuevaVenta = lineas.reduce((acc, l) =>
    acc + (parseFloat(l.precio_vendido || '0') * parseInt(l.cantidad || '0')), 0)

  const vendedorNombre = modo === 'vendedor'
    ? (vendedores.find(v => String(v.id) === nv.cod_vendedor)?.nombre || '')
    : '' // venta web autoservicio, sin vendedor
  const clienteNombre = modo === 'cliente'
    ? (clienteFijo?.nombre || '')
    : (modoCliente === 'nuevo' ? `${nuevoClienteNombre} (Cód: ${nuevoClienteCodigo})` : (clienteSeleccionado?.nombre || ''))

  // ── Subir comprobante a Storage + registrar en comprobantes_venta ───────
  const subirComprobante = async (codVenta: number) => {
    if (!comprobanteFile) return
    setSubiendoComprobante(true)
    try {
      const extension = comprobanteFile.name.split('.').pop() || 'bin'
      const ruta = `${codVenta}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`
      const { error: eUpload } = await supabase.storage
        .from(BUCKET_COMPROBANTES)
        .upload(ruta, comprobanteFile, { contentType: comprobanteFile.type, upsert: false })
      if (eUpload) throw eUpload

      const { data: pub } = supabase.storage.from(BUCKET_COMPROBANTES).getPublicUrl(ruta)

      const { error: eInsert } = await supabase.from('comprobantes_venta').insert({
        cod_venta: codVenta,
        url: pub.publicUrl,
        tipo_archivo: comprobanteFile.type === 'application/pdf' ? 'pdf' : 'imagen',
        nombre_archivo: comprobanteFile.name,
        origen: modo,
        subido_por: modo === 'vendedor' ? (vendedorNombre || null) : (clienteFijo?.nombre || null),
        concepto: 'venta',
      })
      if (eInsert) throw eInsert
    } catch (err: any) {
      // La venta ya quedó guardada — el comprobante se puede volver a subir
      // después desde el detalle de la venta. No revertimos nada acá.
      setAvisoComprobante('La venta se guardó, pero el comprobante no se pudo subir: ' + (err?.message || 'error desconocido'))
    } finally {
      setSubiendoComprobante(false)
    }
  }

  // ── Guardar ──────────────────────────────────────────────────────────
  const confirmarNuevaVenta = async () => {
    setGuardandoNueva(true); setErrorGuardado(''); setAvisoComprobante('')

    const { data: codData, error: codError } = await supabase.rpc('siguiente_cod_venta')
    if (codError || !codData) {
      setErrorGuardado('Error al generar codigo de venta: ' + (codError?.message || ''))
      setGuardandoNueva(false); return
    }
    const codVentaFinal: number = codData

    let cod_cliente_final: number

    if (modo === 'cliente') {
      if (!clienteFijo) { setErrorGuardado('No se identificó tu cuenta de cliente.'); setGuardandoNueva(false); return }
      cod_cliente_final = clienteFijo.id
    } else if (modoCliente === 'nuevo') {
      const { data: cNuevo, error: eCli } = await supabase
        .from('clientes')
        .insert({
          codigo: parseInt(nuevoClienteCodigo),
          nombre: nuevoClienteNombre.trim(),
          celular: nuevoClienteCelular.trim() || null,
          direccion: nuevoClienteDireccion.trim() || null,
          activo: true,
        })
        .select('id').single()
      if (eCli || !cNuevo) {
        setErrorGuardado('Error al crear el cliente: ' + (eCli?.message || 'desconocido'))
        setGuardandoNueva(false); setPaso('form'); return
      }
      cod_cliente_final = cNuevo.id
    } else {
      cod_cliente_final = clienteSeleccionado.id
    }

    const totalVenta = totalNuevaVenta

    const { error: eVenta } = await supabase.from('ventas').insert({
      cod_venta: codVentaFinal,
      cod_cliente: cod_cliente_final,
      cod_vendedor: modo === 'vendedor' ? parseInt(nv.cod_vendedor) : null,
      fecha_pedido: nv.fecha_pedido,
      fecha_entrega: nv.fecha_entrega || null,
      hora_entrega: nv.hora_entrega || null,
      delivery_cotizado: nv.delivery_cotizado ? parseFloat(nv.delivery_cotizado) : null,
      total_venta: totalVenta,
      anticipo: nv.anticipo ? parseFloat(nv.anticipo) : null,
      forma_pago: nv.forma_pago,
      cod_transaccion: nv.cod_transaccion || null,
      ubicacion_pedido: nv.ubicacion_pedido || null,
      detalles_especificos: nv.detalles_especificos || null,
      estado: 1,
      origen: modo === 'cliente' ? 'web' : 'vendedor',
      estado_pago: modo === 'cliente' ? 'pendiente' : 'confirmado',
    })

    if (eVenta) {
      setErrorGuardado('Error al registrar la venta: ' + eVenta.message)
      setGuardandoNueva(false); setPaso('form'); return
    }

    const detallesToInsert = lineas.map((l, i) => ({
      cod_venta: codVentaFinal,
      item: i + 1,
      cod_producto: l.cod_producto,
      precio_cotizado: l.precio_cotizado ? parseFloat(l.precio_cotizado) : null,
      precio_vendido: parseFloat(l.precio_vendido),
      cantidad: parseInt(l.cantidad),
      subtotal: parseFloat(l.precio_vendido) * parseInt(l.cantidad),
      dimensiones: l.dimensiones || null,
      color_estructura: l.color_estructura,
      color_melamina: l.color_melamina,
    }))

    const { error: eDet } = await supabase.from('detalle_venta').insert(detallesToInsert)
    if (eDet) {
      await supabase.from('ventas').delete().eq('cod_venta', codVentaFinal)
      setErrorGuardado('Error al registrar los productos: ' + eDet.message)
      setGuardandoNueva(false); setPaso('form'); return
    }

    // Producción solo arranca automáticamente para ventas ya confirmadas
    // (staff). Las de cliente ('web'/'pendiente') se agregan a progreso una
    // vez el equipo confirme el pago — ajusta esto si prefieres otro flujo.
    if (modo === 'vendedor') {
      const { error: insertProgreso } = await supabase
        .from('progreso_produccion')
        .insert({ codigo_pedido: codVentaFinal, estado: 1, fecha_ingreso: nv.fecha_pedido })
      if (insertProgreso) console.error('Error al insertar progreso:', insertProgreso)
    }

    if (comprobanteFile) await subirComprobante(codVentaFinal)

    setGuardandoNueva(false)
    onVentaCreada?.(codVentaFinal)

    if (modo === 'vendedor') {
      await generarNotaVenta({
        codVenta: codVentaFinal,
        cliente: modoCliente === 'nuevo'
          ? { nombre: nuevoClienteNombre, codigo: nuevoClienteCodigo, celular: nuevoClienteCelular, direccion: nuevoClienteDireccion }
          : clienteSeleccionado,
        vendedor: vendedorNombre,
        fechaPedido: nv.fecha_pedido,
        fechaEntrega: nv.fecha_entrega,
        horaEntrega: nv.hora_entrega,
        ubicacionPedido: nv.ubicacion_pedido,
        deliveryCotizado: nv.delivery_cotizado ? parseFloat(nv.delivery_cotizado) : 0,
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
          colorMelamina: coloresMel.find(c => c.codigo_melamina === l.color_melamina)?.detalle || l.color_melamina,
        })),
        total: totalVenta,
      })
    }
  }

  // ── Texto WhatsApp (solo tiene sentido para el equipo de ventas) ───────
  const generarTextoWhatsApp = () => {
    const saldo = totalNuevaVenta - (nv.anticipo ? parseFloat(nv.anticipo) : 0)
    const productosNombres = lineas.map(l => productos.find(p => p.codigo === l.cod_producto)?.nombre || l.cod_producto).join(', ')
    const productosCodigos = lineas.map(l => l.cod_producto).join(', ')
    const cantidades = lineas.map(l => l.cantidad).join('-')
    const medidas = lineas.map(l => l.dimensiones || '—').join(' / ')
    const colorEst = coloresEst.find(c => c.codigo_color === lineas[0]?.color_estructura)?.detalle || lineas[0]?.color_estructura || '—'
    const colorMel = lineas.map(l => coloresMel.find(m => m.codigo_melamina === l.color_melamina)?.detalle || l.color_melamina).join(', ')
    const nombreCli = modo === 'cliente' ? clienteFijo?.nombre : (modoCliente === 'nuevo' ? nuevoClienteNombre : clienteSeleccionado?.nombre)
    const celularCli = modo === 'cliente' ? clienteFijo?.celular : (modoCliente === 'nuevo' ? nuevoClienteCelular : clienteSeleccionado?.celular)
    const direccionCli = modo === 'cliente' ? clienteFijo?.direccion : (modoCliente === 'nuevo' ? nuevoClienteDireccion : clienteSeleccionado?.direccion)

    const texto = `*N. PEDIDO:* ${nextCodVenta}
*1. Ejecutivo de ventas:* ${vendedorNombre || '—'}
*2. Cuenta facebook:* 
*3. Mueble:* ${productosNombres}
*3.1. Cantidad:* ${cantidades}
*4. Código:* ${productosCodigos}
*5. Medidas:* ${medidas}
*6. Color melamina:* ${colorMel}
*7. Color acero:* ${colorEst}
*7.1. Medida del acero:* ${medidas}
*8. Detalles específicos:* ${nv.detalles_especificos?.trim() || '—'}
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
*17. Nombre cliente:* ${nombreCli || '—'}
*18. Celular cliente:* ${celularCli || '—'}
*19. Ubicación:* ${nv.ubicacion_pedido || '—'}
*20. Dirección del cliente:* ${direccionCli || '—'}
*21. Número y color de puerta:* 
*22. Foto pedido especial:* `

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

  // ── Contenido del formulario (compartido entre modal y página) ─────────
  const contenido = (
    <div className="modal-inner" style={{ backgroundColor: 'white', borderRadius: '16px', padding: '32px', width: '100%', maxWidth: '860px', boxShadow: contenedor === 'modal' ? '0 8px 40px rgba(0,0,0,0.2)' : 'none', height: 'fit-content', marginTop: contenedor === 'modal' ? '10px' : 0, marginBottom: contenedor === 'modal' ? '20px' : 0 }}>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h2 style={{ margin: '0 0 4px', fontSize: '20px' }}>
            {paso === 'form' ? '➕ Registrar nueva venta' : '👁 Previsualizar venta'}
          </h2>
          <p style={{ margin: 0, fontSize: '12px', color: '#888' }}>
            Código asignado: <strong style={{ color: '#087e0b' }}>#{nextCodVenta}</strong>
            {paso === 'preview' && ' — Revisa los datos antes de confirmar'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <span style={{ fontSize: '12px', color: paso === 'form' ? '#087e0b' : '#bbb', fontWeight: 'bold' }}>① Formulario</span>
          <span style={{ color: '#ddd', fontSize: '16px' }}>→</span>
          <span style={{ fontSize: '12px', color: paso === 'preview' ? '#087e0b' : '#bbb', fontWeight: 'bold' }}>② Preview</span>
          <span style={{ color: '#ddd', fontSize: '16px' }}>→</span>
          <span style={{ fontSize: '12px', color: '#bbb', fontWeight: 'bold' }}>③ Guardado</span>
        </div>
        {onCerrar && <button className="btn-secondary" style={{ padding: '7px 14px', fontSize: '12px' }} onClick={onCerrar}>✕ Cerrar</button>}
      </div>

      {loadingMaestros ? (
        <p style={{ textAlign: 'center', color: '#888', padding: '40px' }}>Cargando datos...</p>
      ) : paso === 'form' ? (
        <>
          {errorGuardado && (
            <div style={{ backgroundColor: '#ffebee', border: '1px solid #ef9a9a', borderRadius: '8px', padding: '12px 16px', marginBottom: '20px', fontSize: '13px', color: '#c62828' }}>
              ❌ {errorGuardado}
            </div>
          )}

          {/* CLIENTE — en modo cliente la venta queda fija a la cuenta logueada */}
          {modo === 'vendedor' ? (
            <div style={{ backgroundColor: '#f9f9f9', borderRadius: '12px', padding: '20px', marginBottom: '20px', border: '1px solid #eee' }}>
              <h3 style={{ margin: '0 0 14px', fontSize: '15px', color: '#333' }}>👥 Cliente</h3>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
                <button className={`tab-btn ${modoCliente === 'existente' ? 'tab-active' : 'tab-inactive'}`}
                  onClick={() => { setModoCliente('existente'); setErrorCliente('') }}>
                  Cliente existente
                </button>
                <button className={`tab-btn ${modoCliente === 'nuevo' ? 'tab-active' : 'tab-inactive'}`} onClick={activarClienteNuevo}>
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
                    <input type="number" style={inputStyle} value={nuevoClienteCodigo}
                      placeholder={loadingNextCodCliente ? 'Calculando...' : 'Ej: 2085'}
                      onChange={e => setNuevoClienteCodigo(e.target.value)} />
                    <p style={{ fontSize: '10px', color: '#aaa', margin: '3px 0 0' }}>Auto-generado, puedes cambiar</p>
                  </div>
                  <div>
                    <label style={labelStyle}>Nombre completo *</label>
                    <input style={errorCliente ? inputErr : inputStyle} placeholder="Nombre del cliente"
                      value={nuevoClienteNombre} onChange={e => { setNuevoClienteNombre(e.target.value); setErrorCliente('') }} />
                    {errorCliente && <p style={errMsg}>{errorCliente}</p>}
                  </div>
                  <div>
                    <label style={labelStyle}>Celular</label>
                    <input type="text" style={inputStyle} placeholder="Numero de celular"
                      value={nuevoClienteCelular} onChange={e => setNuevoClienteCelular(e.target.value)} />
                  </div>
                  <div>
                    <label style={labelStyle}>Dirección</label>
                    <input type="text" style={inputStyle} placeholder="Dirección o referencia"
                      value={nuevoClienteDireccion} onChange={e => setNuevoClienteDireccion(e.target.value)} />
                  </div>
                  <div style={{ gridColumn: 'span 2' }}>
                    <div style={{ backgroundColor: '#e3f2fd', border: '1px solid #90caf9', borderRadius: '8px', padding: '8px 12px', fontSize: '12px', color: '#1565c0' }}>
                      💡 El cliente se creará en la base de datos al confirmar la venta.
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ backgroundColor: '#f9f9f9', borderRadius: '12px', padding: '20px', marginBottom: '20px', border: '1px solid #eee' }}>
              <h3 style={{ margin: '0 0 8px', fontSize: '15px', color: '#333' }}>👥 Tus datos</h3>
              <p style={{ margin: 0, fontSize: '13px' }}><strong>{clienteFijo?.nombre || '—'}</strong>{clienteFijo?.codigo ? ` · Cód: ${clienteFijo.codigo}` : ''}</p>
              {clienteFijo?.celular && <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#666' }}>📞 {clienteFijo.celular}</p>}
              {errorCliente && <p style={errMsg}>{errorCliente}</p>}
            </div>
          )}

          {/* DATOS VENTA */}
          <div style={{ backgroundColor: '#f9f9f9', borderRadius: '12px', padding: '20px', marginBottom: '20px', border: '1px solid #eee' }}>
            <h3 style={{ margin: '0 0 14px', fontSize: '15px', color: '#333' }}>📋 Datos de la venta</h3>
            <div className="detalle-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
              {modo === 'vendedor' && (
                <div>
                  <label style={labelStyle}>Vendedor *</label>
                  <select style={erroresCab.cod_vendedor ? inputErr : inputStyle} value={nv.cod_vendedor}
                    onChange={e => { setNv(p => ({ ...p, cod_vendedor: e.target.value })); setErroresCab(p => ({ ...p, cod_vendedor: '' })) }}>
                    <option value="">— Selecciona —</option>
                    {vendedores.map(v => <option key={v.id} value={String(v.id)}>{v.nombre}</option>)}
                  </select>
                  {erroresCab.cod_vendedor && <p style={errMsg}>{erroresCab.cod_vendedor}</p>}
                </div>
              )}
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
                <label style={labelStyle}>Ubicación del pedido *</label>
                <select style={erroresCab.ubicacion_pedido ? inputErr : inputStyle} value={nv.ubicacion_pedido}
                  onChange={e => { setNv(p => ({ ...p, ubicacion_pedido: e.target.value })); setErroresCab(p => ({ ...p, ubicacion_pedido: '' })) }}>
                  <option value="">— Selecciona —</option>
                  {UBICACIONES_PEDIDO.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
                {erroresCab.ubicacion_pedido && <p style={errMsg}>{erroresCab.ubicacion_pedido}</p>}
              </div>
              <div style={{ gridColumn: 'span 3' }}>
                <label style={labelStyle}>Detalles específicos del pedido</label>
                <textarea rows={3} placeholder="Ej. Puerta de color blanco, entrega en edificio con ascensor, etc."
                  style={{ ...inputStyle, resize: 'vertical', minHeight: '90px' }}
                  value={nv.detalles_especificos} onChange={e => setNv(p => ({ ...p, detalles_especificos: e.target.value }))} />
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
                <label style={labelStyle}>Código de transacción (manual)</label>
                <input type="text" placeholder="Nro. transferencia / recibo" style={inputStyle} value={nv.cod_transaccion}
                  onChange={e => setNv(p => ({ ...p, cod_transaccion: e.target.value }))} />
                {/* TODO (pendiente): cuando tengas el catálogo de bancos, agregar aquí un
                    select "Banco / modo de pago" ligado al código de transacción. */}
              </div>
              <div style={{ gridColumn: 'span 3' }}>
                <label style={labelStyle}>Comprobante de depósito (imagen o PDF, opcional)</label>
                <input type="file" accept="image/*,.pdf,application/pdf" style={inputStyle}
                  onChange={e => onSeleccionarComprobante(e.target.files?.[0] || null)} />
                {comprobanteFile && (
                  <p style={{ fontSize: '11px', color: '#087e0b', margin: '4px 0 0' }}>
                    📎 {comprobanteFile.name} ({(comprobanteFile.size / 1024).toFixed(0)} KB)
                  </p>
                )}
                {errorComprobante && <p style={errMsg}>{errorComprobante}</p>}
                <p style={{ fontSize: '10px', color: '#aaa', margin: '3px 0 0' }}>
                  Se sube al confirmar la venta. Puedes agregarlo o cambiarlo después desde el detalle de la venta.
                </p>
              </div>
            </div>
          </div>

          {/* LINEAS PRODUCTOS */}
          <div style={{ marginBottom: '20px' }}>
            <h3 style={{ margin: '0 0 14px', fontSize: '15px', color: '#333' }}>📦 Productos</h3>

            {lineas.map((linea, idx) => {
              const prodSel = productos.find((p: any) => p.codigo === linea.cod_producto)
              const melSel = coloresMel.find((m: any) => m.codigo_melamina === linea.color_melamina)
              return (
                <div key={linea.tempId} style={{ backgroundColor: '#f9f9f9', borderRadius: '12px', padding: '16px', marginBottom: '12px', border: erroresLineas[idx] && Object.keys(erroresLineas[idx]).length > 0 ? '1px solid #ffcdd2' : '1px solid #eee' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#087e0b' }}>ÍTEM {idx + 1}</span>
                    {lineas.length > 1 && (
                      <button onClick={() => eliminarLinea(idx)} style={{ background: 'none', border: 'none', color: '#e53935', cursor: 'pointer', fontSize: '13px' }}>
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
                        {productos.map((p: any) => <option key={p.codigo} value={p.codigo}>{p.nombre}</option>)}
                      </select>
                      {erroresLineas[idx]?.cod_producto && <p style={errMsg}>{erroresLineas[idx].cod_producto}</p>}
                      {prodSel && <Miniatura url={prodSel.foto_url} label={prodSel.nombre} />}
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
                        {coloresEst.map((c: any) => <option key={c.id} value={c.codigo_color}>{c.detalle}</option>)}
                      </select>
                      {erroresLineas[idx]?.color_estructura && <p style={errMsg}>{erroresLineas[idx].color_estructura}</p>}
                    </div>
                    <div>
                      <label style={labelStyle}>Color melamina *</label>
                      <select style={erroresLineas[idx]?.color_melamina ? inputErr : inputStyle}
                        value={linea.color_melamina}
                        onChange={e => { setLineas(prev => prev.map((l, i) => i === idx ? { ...l, color_melamina: e.target.value } : l)); setErroresLineas(prev => prev.map((x, i) => i === idx ? { ...x, color_melamina: '' } : x)) }}>
                        <option value="">— Selecciona melamina —</option>
                        {coloresMel.map((m: any) => <option key={m.id} value={m.codigo_melamina}>{m.detalle}</option>)}
                      </select>
                      {erroresLineas[idx]?.color_melamina && <p style={errMsg}>{erroresLineas[idx].color_melamina}</p>}
                      {melSel && <Miniatura url={melSel.foto_url} label={melSel.detalle} />}
                    </div>
                  </div>
                  {linea.precio_vendido && linea.cantidad && (
                    <div style={{ marginTop: '10px', textAlign: 'right', fontSize: '13px', color: '#087e0b', fontWeight: 'bold' }}>
                      Subtotal: Bs. {(parseFloat(linea.precio_vendido) * parseInt(linea.cantidad)).toLocaleString('es-BO', { minimumFractionDigits: 2 })}
                    </div>
                  )}
                </div>
              )
            })}

            <button className="btn-add-linea" onClick={agregarLinea}>＋ Agregar otro producto</button>
          </div>

          <div style={{ borderTop: '2px solid #eee', paddingTop: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ margin: '0', fontSize: '13px', color: '#888' }}>Total estimado</p>
              <p style={{ margin: '4px 0 0', fontSize: '22px', fontWeight: 'bold', color: '#087e0b' }}>
                Bs. {totalNuevaVenta.toLocaleString('es-BO', { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              {onCerrar && <button className="btn-secondary" onClick={onCerrar}>Cancelar</button>}
              <button className="btn-primary" onClick={irAPreview} style={{ padding: '10px 28px', fontSize: '14px' }}>
                Revisar y confirmar →
              </button>
            </div>
          </div>
        </>
      ) : (
        <>
          {errorGuardado && (
            <div style={{ backgroundColor: '#ffebee', border: '1px solid #ef9a9a', borderRadius: '8px', padding: '12px 16px', marginBottom: '20px', fontSize: '13px', color: '#c62828' }}>
              ❌ {errorGuardado}
            </div>
          )}
          {avisoComprobante && (
            <div style={{ backgroundColor: '#fff8e1', border: '1px solid #ffe082', borderRadius: '8px', padding: '12px 16px', marginBottom: '20px', fontSize: '13px', color: '#8d6e00' }}>
              ⚠️ {avisoComprobante}
            </div>
          )}

          <div style={{ backgroundColor: '#e8f5e9', border: '1px solid #a5d6a7', borderRadius: '10px', padding: '14px 20px', marginBottom: '24px', fontSize: '13px', color: '#2e7d32' }}>
            ✅ Todo listo. Revisa los datos a continuacion y confirma para grabar en la base de datos.
          </div>

          <div style={{ backgroundColor: '#f9f9f9', borderRadius: '12px', padding: '20px', marginBottom: '20px', border: '1px solid #eee' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '14px', color: '#555', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Datos de la venta</h3>
            <div className="detalle-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
              {[
                ['# Venta', `#${nextCodVenta}`],
                ['Cliente', clienteNombre + (modo === 'vendedor' && modoCliente === 'nuevo' ? ' (NUEVO)' : '')],
                ...(modo === 'vendedor' ? [['Vendedor', vendedorNombre]] : []),
                ['Fecha pedido', fmtFecha(nv.fecha_pedido)],
                ['Fecha entrega', fmtFecha(nv.fecha_entrega)],
                ['Hora entrega', nv.hora_entrega || '—'],
                ['Ubicación', nv.ubicacion_pedido || '—'],
                ['Detalles', nv.detalles_especificos || '—'],
                ['Forma de pago', nv.forma_pago.replace('_', ' ')],
                ['Anticipo', nv.anticipo ? `Bs. ${parseFloat(nv.anticipo).toLocaleString('es-BO', { minimumFractionDigits: 2 })}` : '—'],
                ['Delivery cotizado', nv.delivery_cotizado ? `Bs. ${parseFloat(nv.delivery_cotizado).toLocaleString('es-BO', { minimumFractionDigits: 2 })}` : '—'],
                ['Codigo transaccion', nv.cod_transaccion || '—'],
                ['Comprobante', comprobanteFile ? `📎 ${comprobanteFile.name}` : 'No adjuntado'],
              ].map(([lbl, val]) => (
                <div key={lbl} style={{ backgroundColor: 'white', borderRadius: '8px', padding: '10px 14px', border: '1px solid #eee' }}>
                  <p style={{ margin: '0 0 3px', fontSize: '10px', color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{lbl}</p>
                  <p style={{ margin: 0, fontSize: '13px', fontWeight: '600', color: lbl === '# Venta' ? '#087e0b' : '#222' }}>{val}</p>
                </div>
              ))}
            </div>
          </div>

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
                  const prod = productos.find(p => p.codigo === l.cod_producto)
                  const sub = parseFloat(l.precio_vendido) * parseInt(l.cantidad)
                  return (
                    <tr key={l.tempId} style={{ backgroundColor: i % 2 === 0 ? 'white' : '#fafafa' }}>
                      <td style={{ ...tdStyle, color: '#087e0b', fontWeight: 'bold' }}>{i + 1}</td>
                      <td style={{ ...tdStyle, fontWeight: '500' }}>{prod?.nombre || l.cod_producto}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{l.precio_cotizado ? `Bs. ${parseFloat(l.precio_cotizado).toLocaleString('es-BO', { minimumFractionDigits: 2 })}` : '—'}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>Bs. {parseFloat(l.precio_vendido).toLocaleString('es-BO', { minimumFractionDigits: 2 })}</td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>{l.cantidad}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 'bold', color: '#087e0b' }}>Bs. {sub.toLocaleString('es-BO', { minimumFractionDigits: 2 })}</td>
                      <td style={{ ...tdStyle, fontSize: '12px', color: '#666' }}>{l.dimensiones || '—'}</td>
                      <td style={{ ...tdStyle, fontSize: '12px' }}>{coloresEst.find((c: any) => c.codigo_color === l.color_estructura)?.detalle || l.color_estructura}</td>
                      <td style={{ ...tdStyle, fontSize: '12px' }}>{coloresMel.find((m: any) => m.codigo_melamina === l.color_melamina)?.detalle || l.color_melamina}</td>
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

          {modo === 'vendedor' && (
            <div style={{ marginBottom: '20px' }}>
              <button onClick={generarTextoWhatsApp} style={{ background: '#25D366', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px', width: '100%', justifyContent: 'center' }}>
                💬 Generar texto para WhatsApp
              </button>
            </div>
          )}

          {mostrarTextoWA && (
            <div style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <label style={{ fontSize: '13px', fontWeight: 'bold', color: '#555' }}>Texto para WhatsApp</label>
                <button onClick={copiarAlPortapapeles} style={{ background: '#25D366', color: 'white', border: 'none', padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>
                  📋 Copiar
                </button>
              </div>
              <textarea value={textoWhatsApp} readOnly style={{ width: '100%', minHeight: '300px', padding: '12px', borderRadius: '8px', border: '2px solid #25D366', fontFamily: 'monospace', fontSize: '12px', backgroundColor: '#f0f9f6', color: '#222', boxSizing: 'border-box' }} />
            </div>
          )}

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'space-between', alignItems: 'center' }}>
            <button className="btn-secondary" onClick={() => setPaso('form')} disabled={guardandoNueva}>← Volver y editar</button>
            <button className="btn-primary" onClick={confirmarNuevaVenta} disabled={guardandoNueva || subiendoComprobante} style={{ padding: '12px 32px', fontSize: '15px' }}>
              {guardandoNueva ? 'Guardando...' : subiendoComprobante ? 'Subiendo comprobante...' : '✅ Confirmar y grabar venta'}
            </button>
          </div>
        </>
      )}
    </div>
  )

  if (contenedor === 'pagina') return contenido

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)', zIndex: 1000, overflowY: 'auto', display: 'flex', justifyContent: 'center', padding: '20px' }}>
      {contenido}
    </div>
  )
}

// ── Generación de nota de venta imprimible (idéntica a la del page.tsx original,
//    sin "delivery pagado" porque ya no se registra) ──────────────────────────
async function generarNotaVenta(datos: any) {
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
        @page { size: A4; margin: 10mm; }
        @media print { body { margin: 0; background: white; } .no-print { display: none; } #nota-container { box-shadow: none; padding: 0; } }
        * { box-sizing: border-box; }
        body { font-family: 'Arial', sans-serif; margin: 0; padding: 20px; background: #f5f5f5; color: #333; line-height: 1.4; }
        #nota-container { background: white; max-width: 850px; margin: 0 auto; padding: 35px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
        .header { text-align: center; border-bottom: 3px solid #FFD700; padding-bottom: 25px; margin-bottom: 35px; display: flex; flex-direction: column; align-items: center; }
        .company-name { font-size: 28px; font-weight: bold; color: #0d0d1f; margin: 0 0 5px 0; }
        .company-tagline { font-size: 13px; color: #666; margin: 0; }
        .nota-title { font-size: 22px; font-weight: bold; margin: 25px 0 10px 0; text-align: center; color: #222; }
        .nota-number { text-align: center; font-size: 16px; color: #0d0d1f; font-weight: bold; margin-bottom: 30px; }
        .info-section { display: grid; grid-template-columns: 1fr 1fr; gap: 25px; margin-bottom: 35px; }
        .info-box { border: 2px solid #087e0b; padding: 18px; border-radius: 8px; background: #f9f9f9; }
        .productos-table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
        .info-title { font-weight: bold; margin-bottom: 12px; color: #0d0d1f; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; }
        .info-item { margin-bottom: 6px; font-size: 13px; }
        .info-item strong { color: #222; }
        .productos-table { width: 100%; border-collapse: collapse; margin: 25px 0; font-size: 12px; table-layout: fixed; }
        .productos-table th, .productos-table td { word-break: break-word; overflow-wrap: anywhere; white-space: normal; }
        .productos-table th { background: #0d0d1f; color: white; font-weight: bold; padding: 10px; text-align: left; border: 1px solid #0d0d1f; }
        .productos-table td { border: 1px solid #ddd; padding: 10px; text-align: left; }
        .productos-table tbody tr:nth-child(odd) { background: #f9f9f9; }
        .text-right { text-align: right !important; }
        .total-section { text-align: right; margin-top: 25px; padding-top: 20px; border-top: 2px solid #FFD700; }
        .total-row { display: flex; justify-content: flex-end; margin-bottom: 8px; font-size: 13px; padding: 4px 0; }
        .total-row span:first-child { min-width: 200px; text-align: right; padding-right: 20px; }
        .total-final { font-size: 16px; font-weight: bold; color: #0d0d1f; border-top: 1px solid #FFD700; padding-top: 8px; margin-top: 8px; }
        .footer { margin-top: 40px; text-align: center; font-size: 11px; color: #888; border-top: 1px solid #ddd; padding-top: 15px; }
        .contact-section { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 15px; text-align: left; }
        .contact-item { background: #f9f9f9; padding: 8px 12px; border-radius: 6px; border: 1px solid #eee; }
        .contact-title { font-weight: bold; color: #0d0d1f; font-size: 11px; margin-bottom: 4px; }
        .button-container { text-align: center; margin-top: 20px; display: flex; gap: 10px; justify-content: center; }
        .btn-print, .btn-download { padding: 10px 24px; border: none; border-radius: 8px; cursor: pointer; font-weight: bold; font-size: 13px; }
        .btn-print { background: #0d0d1f; color: white; }
        .btn-download { background: #087e0b; color: white; }
      </style>
    </head>
    <body>
      <div id="nota-container">
        <div class="header">
          <div class="company-name">Muebles is Better</div>
          <div class="company-tagline">Más que muebles, ingeniería de interiores</div>
        </div>
        <div class="nota-title">NOTA DE VENTA</div>
        <div class="nota-number">N° ${datos.codVenta}</div>

        <div class="info-section">
          <div class="info-box">
            <div class="info-title">Datos del cliente</div>
            <div class="info-item"><strong>Nombre:</strong> ${datos.cliente?.nombre || '—'}</div>
            <div class="info-item"><strong>Código:</strong> ${datos.cliente?.codigo || '—'}</div>
            <div class="info-item"><strong>Celular:</strong> ${datos.cliente?.celular || '—'}</div>
            <div class="info-item"><strong>Dirección:</strong> ${datos.cliente?.direccion || '—'}</div>
          </div>
          <div class="info-box">
            <div class="info-title">Datos del pedido</div>
            <div class="info-item"><strong>Vendedor:</strong> ${datos.vendedor || '—'}</div>
            <div class="info-item"><strong>Fecha pedido:</strong> ${datos.fechaPedido || '—'}</div>
            <div class="info-item"><strong>Fecha entrega:</strong> ${datos.fechaEntrega || '—'}</div>
            <div class="info-item"><strong>Hora entrega:</strong> ${datos.horaEntrega || '—'}</div>
            <div class="info-item"><strong>Ubicación:</strong> ${datos.ubicacionPedido || '—'}</div>
            <div class="info-item"><strong>Forma de pago:</strong> ${datos.formaPago || '—'}</div>
          </div>
        </div>

        <div class="productos-table-wrap">
          <table class="productos-table">
            <thead>
              <tr>
                <th>Producto</th><th>Dimensiones</th><th>Color Estructura</th><th>Color Melamina</th>
                <th>Cant.</th><th class="text-right">P. Unit.</th><th class="text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              ${datos.lineas.map((linea: any) => `
                <tr>
                  <td>${linea.producto}</td>
                  <td>${linea.dimensiones || '—'}</td>
                  <td>${linea.colorEstructura || '—'}</td>
                  <td>${linea.colorMelamina || '—'}</td>
                  <td>${linea.cantidad}</td>
                  <td class="text-right">Bs. ${Number(linea.precioVendido).toLocaleString('es-BO', { minimumFractionDigits: 2 })}</td>
                  <td class="text-right">Bs. ${Number(linea.subtotal).toLocaleString('es-BO', { minimumFractionDigits: 2 })}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <div class="total-section">
          <div class="total-row"><span>Delivery cotizado:</span><span>Bs. ${Number(datos.deliveryCotizado || 0).toLocaleString('es-BO', { minimumFractionDigits: 2 })}</span></div>
          <div class="total-row"><span>Anticipo:</span><span>Bs. ${Number(datos.anticipo || 0).toLocaleString('es-BO', { minimumFractionDigits: 2 })}</span></div>
          <div class="total-row total-final"><span>TOTAL VENTA:</span><span>Bs. ${Number(datos.total).toLocaleString('es-BO', { minimumFractionDigits: 2 })}</span></div>
        </div>

        <div class="footer">
          <div class="contact-section">
            <div class="contact-item"><div class="contact-title">📍 El Alto</div>C. L. de la Vega 3623<br>+591 65572015</div>
            <div class="contact-item"><div class="contact-title">📍 La Paz</div>Zona Bella Vista, C. Ignacio Sanjines<br>+591 60633283</div>
            <div class="contact-item"><div class="contact-title">📍 Santa Cruz</div>Av. Napoleon Gomez Landivar, Radial 21<br>+591 60044821</div>
            <div class="contact-item"><div class="contact-title">📍 Cochabamba</div>Av. Segunda Circunvalacion<br>+591 61211195</div>
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
            btn.disabled = true; btn.textContent = 'Generando PDF...';
            const element = document.getElementById('nota-container');
            const canvas = await html2canvas(element, { scale: 1.2, backgroundColor: '#ffffff', useCORS: true, logging: false, width: element.scrollWidth, height: element.scrollHeight, windowWidth: element.scrollWidth, windowHeight: element.scrollHeight, scrollX: 0, scrollY: 0 });
            const { jsPDF } = window.jspdf;
            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF('p', 'mm', 'a4');
            const imgWidth = 210; const pageHeight = 297;
            const imgHeight = (canvas.height * imgWidth) / canvas.width;
            let heightLeft = imgHeight; let position = 0;
            pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
            heightLeft -= pageHeight;
            while (heightLeft >= 0) { position = heightLeft - imgHeight; pdf.addPage(); pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight); heightLeft -= pageHeight; }
            pdf.save('Nota-Venta-${datos.codVenta}.pdf');
            btn.disabled = false; btn.textContent = '📄 Descargar PDF';
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
