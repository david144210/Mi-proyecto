'use client'
import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface Producto {
  codigo: string
  nombre: string | null
  categoria: string | null
  precio_minimo: number | null
  precio_tienda: number | null
  foto_url: string | null
}

interface Variante {
  id: number
  codigo_producto: string
  nombre_variante: string
  codigo_color: string | null
  codigo_melamina: string | null
  es_estandar: boolean
  activo: boolean
  costo_acero: number
  costo_melamina: number
  costo_accesorios: number
  costo_insumos: number
  costo_total: number
  plano_pdf_url: string | null
}

interface PiezaAcero {
  id: number
  variante_id: number
  codigo_acero: string
  descripcion: string | null
  longitud_cm: number
  cantidad: number
  costo_unitario: number
  costo_total: number
}

interface PiezaMelamina {
  id: number
  variante_id: number
  codigo_melamina: string
  descripcion: string | null
  largo_cm: number
  ancho_cm: number
  cantidad: number
  costo_unitario: number
  costo_total: number
}

interface PiezaAccesorio {
  id: number
  variante_id: number
  codigo_accesorio: string
  descripcion: string | null
  cantidad: number
  costo_unitario: number
  costo_total: number
}

interface PiezaInsumo {
  id: number
  variante_id: number
  codigo_insumo: string
  descripcion: string | null
  cantidad: number
  costo_unitario: number
  costo_total: number
}

type TabActiva = 'acero' | 'melamina' | 'accesorios' | 'insumos'

// Bucket privado de Supabase Storage donde se suben los PDF de planos constructivos.
// Debe crearse como bucket PRIVADO (no público) para que solo se pueda acceder
// mediante URLs firmadas de corta duración generadas desde el servidor/cliente autenticado.
const BUCKET_PLANOS = 'planos-constructivos'

// Versión fija de PDF.js cargada desde CDN (no requiere instalar dependencias ni
// configurar el worker en el bundler de Next.js).
const PDFJS_VERSION = '3.11.174'
const PDFJS_BASE = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}`

let pdfjsCargaPromise: Promise<any> | null = null
function cargarPdfJs(): Promise<any> {
  if (typeof window === 'undefined') return Promise.reject('no-window')
  const w = window as any
  if (w['pdfjs-dist/build/pdf']) return Promise.resolve(w['pdfjs-dist/build/pdf'])
  if (pdfjsCargaPromise) return pdfjsCargaPromise
  pdfjsCargaPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = `${PDFJS_BASE}/pdf.min.js`
    script.onload = () => {
      const pdfjsLib = (window as any)['pdfjs-dist/build/pdf']
      if (!pdfjsLib) { reject(new Error('pdfjsLib no se cargó correctamente')); return }
      pdfjsLib.GlobalWorkerOptions.workerSrc = `${PDFJS_BASE}/pdf.worker.min.js`
      resolve(pdfjsLib)
    }
    script.onerror = () => reject(new Error('No se pudo cargar PDF.js desde el CDN'))
    document.head.appendChild(script)
  })
  return pdfjsCargaPromise
}

const fmt = (v: number | null | undefined) =>
  v != null ? `Bs. ${Number(v).toLocaleString('es-BO', { minimumFractionDigits: 2 })}` : '—'

const pct = (costo: number, precio: number | null) =>
  precio && costo > 0 ? `${(((precio - costo) / costo) * 100).toFixed(1)}%` : '—'

// ── Fórmula de melamina + tapacanto ─────────────────────────────────────────
// El precio de la melamina usado aquí es el de COMPRA (precio_compra), no el de
// cotizador — esta parte alimenta las tablas de planificación de presupuestos y
// talleres, que trabajan con costo real de compra. El precio es por m², así que
// largo/ancho
// se convierten de cm a m para sacar el área. El tapacanto se cobra por metro
// lineal de canteado: se suma el perímetro solo de los lados marcados
// (arriba/abajo usan el largo, izquierda/derecha usan el ancho), multiplicado
// por la cantidad de piezas, y esa longitud total se multiplica por el precio
// de tapacanto por metro que se ingresa a mano.
function calcularMelamina(params: {
  largoCm: number
  anchoCm: number
  cantidad: number
  precioM2: number
  sup: boolean
  inf: boolean
  izq: boolean
  der: boolean
  precioTapacantoM: number
}) {
  const { largoCm, anchoCm, cantidad, precioM2, sup, inf, izq, der, precioTapacantoM } = params
  const largoM = largoCm / 100
  const anchoM = anchoCm / 100

  const areaCostoUnit = largoM * anchoM * precioM2
  const longCanteadoUnit = (sup ? largoM : 0) + (inf ? largoM : 0) + (izq ? anchoM : 0) + (der ? anchoM : 0)
  const tapacantoCostoUnit = longCanteadoUnit * precioTapacantoM

  const costoUnitario = areaCostoUnit + tapacantoCostoUnit
  const costoTotal = costoUnitario * cantidad
  const longitudCanteadoTotal = longCanteadoUnit * cantidad

  const lados = [sup && 'arriba', inf && 'abajo', izq && 'izquierda', der && 'derecha'].filter(Boolean) as string[]
  const notaCanteado =
    lados.length === 4 ? 'Todo canteado' :
    lados.length === 0 ? 'Sin canteado' :
    `Canteado: ${lados.join(', ')}`

  return { areaCostoUnit, longCanteadoUnit, tapacantoCostoUnit, costoUnitario, costoTotal, longitudCanteadoTotal, notaCanteado }
}

// Reconstruye, a partir del texto ya guardado en `descripcion`, qué lados estaban
// marcados como canteado y cuál es el texto libre que escribió el usuario. Así se
// puede pre-llenar el formulario al editar sin necesitar columnas nuevas en la BD.
// Es "best effort": si alguien reescribió la descripción a mano y ya no coincide
// con el formato generado, simplemente no detecta canteado y deja todo el texto
// como descripción libre.
function parseDetalleMelamina(desc: string | null) {
  const vacio = { sup: false, inf: false, izq: false, der: false, resto: '' }
  if (!desc) return vacio

  const sepIdx = desc.indexOf(' — ')
  const prefijoCrudo = sepIdx >= 0 ? desc.slice(0, sepIdx) : desc
  const resto = sepIdx >= 0 ? desc.slice(sepIdx + 3) : ''
  const prefijo = prefijoCrudo.replace(/\s*\([^)]*\)\s*$/, '').trim() // quita "(1.20m/pza · Bs.3.50/m)" si está

  if (/^todo canteado$/i.test(prefijo)) return { sup: true, inf: true, izq: true, der: true, resto }
  if (/^sin canteado$/i.test(prefijo)) return { ...vacio, resto }
  const m = prefijo.match(/^canteado:\s*(.+)$/i)
  if (m) {
    const partes = m[1].split(',').map(s => s.trim().toLowerCase())
    return {
      sup: partes.includes('arriba'), inf: partes.includes('abajo'),
      izq: partes.includes('izquierda'), der: partes.includes('derecha'),
      resto,
    }
  }
  // No se reconoce ningún prefijo de canteado: todo el texto es descripción libre
  return { ...vacio, resto: desc }
}

export default function ProductosConstructivos() {
  const [usuario, setUsuario] = useState<any>(null)
  const [esAdmin, setEsAdmin] = useState(false)
  const [puedeEditar, setPuedeEditar] = useState(false)
  const [loading, setLoading] = useState(true)

  // Lista productos
  const [productos, setProductos] = useState<Producto[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [filtroCategoria, setFiltroCategoria] = useState('')
  const [categorias, setCategorias] = useState<string[]>([])

  // Panel lateral
  const [productoSel, setProductoSel] = useState<Producto | null>(null)
  const [variantes, setVariantes] = useState<Variante[]>([])
  const [varianteSel, setVarianteSel] = useState<Variante | null>(null)
  const [tabActiva, setTabActiva] = useState<TabActiva>('acero')
  const [loadingPanel, setLoadingPanel] = useState(false)

  // Materiales de la variante seleccionada
  const [piezasAcero, setPiezasAcero] = useState<PiezaAcero[]>([])
  const [piezasMelamina, setPiezasMelamina] = useState<PiezaMelamina[]>([])
  const [piezasAccesorios, setPiezasAccesorios] = useState<PiezaAccesorio[]>([])
  const [piezasInsumos, setPiezasInsumos] = useState<PiezaInsumo[]>([])

  // Datos maestros
  const [aceros, setAceros] = useState<any[]>([])
  const [melaminas, setMelaminas] = useState<any[]>([])
  const [accesorios, setAccesorios] = useState<any[]>([])
  const [insumos, setInsumos] = useState<any[]>([])
  const [colores, setColores] = useState<any[]>([])

  // Modales
  const [modalVariante, setModalVariante] = useState(false)
  const [modalPieza, setModalPieza] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [errorModal, setErrorModal] = useState('')
  const [exito, setExito] = useState('')

  // Visor de planos (PDF)
  const [modalPlano, setModalPlano] = useState(false)
  const [cargandoPlano, setCargandoPlano] = useState(false)
  const [errorPlano, setErrorPlano] = useState('')
  const [subiendoPlano, setSubiendoPlano] = useState(false)
  const planoContainerRef = React.useRef<HTMLDivElement>(null)
  const planoInputRef = React.useRef<HTMLInputElement>(null)

  // Catálogo: alternar entre tarjetas (default) y tabla clásica
  const [vistaCatalogo, setVistaCatalogo] = useState<'tarjetas' | 'tabla'>('tarjetas')
  // Al seleccionar un producto, la lista se contrae para dar más espacio al despiece
  // (importante sobre todo en pantallas angostas / responsive).
  const [listaColapsada, setListaColapsada] = useState(false)

  // Form nueva variante
  const [fvNombre, setFvNombre] = useState('')
  const [fvColor, setFvColor] = useState('')
  const [fvMelamina, setFvMelamina] = useState('')
  const [fvEstandar, setFvEstandar] = useState(true)
  const [fvClonarDe, setFvClonarDe] = useState('')

  // Form nueva/editar pieza
  const [piezaEditando, setPiezaEditando] = useState<any>(null)
  const [fpCodigo, setFpCodigo] = useState('')
  const [fpDescripcion, setFpDescripcion] = useState('')
  const [fpLongitud, setFpLongitud] = useState('')
  const [fpLargo, setFpLargo] = useState('')
  const [fpAncho, setFpAncho] = useState('')
  const [fpCantidad, setFpCantidad] = useState('')
  // Canteado (tapacanto) — solo aplica a melamina
  const [fpCanteadoSup, setFpCanteadoSup] = useState(false)
  const [fpCanteadoInf, setFpCanteadoInf] = useState(false)
  const [fpCanteadoIzq, setFpCanteadoIzq] = useState(false)
  const [fpCanteadoDer, setFpCanteadoDer] = useState(false)
  const [fpPrecioTapacanto, setFpPrecioTapacanto] = useState('')

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
        const produccion = data.cargos?.puede_ver_produccion === true
        const editarProductos = data.cargos?.puede_editar_productos === true
        setEsAdmin(admin)
        setPuedeEditar(admin || editarProductos)
        if (!admin && !produccion && !editarProductos) { window.location.replace('/sistema'); return }
        cargarDatos()
      })
  }, [])

  const cargarDatos = async () => {
    const [{ data: p }, { data: a }, { data: m }, { data: ac }, { data: i }, { data: c }] = await Promise.all([
      supabase.from('productos').select('codigo,nombre,categoria,precio_minimo,precio_tienda,foto_url').order('codigo'),
      supabase.from('aceros').select('*').order('codigo_acero'),
      supabase.from('melaminas').select('*').order('codigo_melamina'),
      supabase.from('accesorios').select('*').order('codigo_accesorio'),
      supabase.from('insumos').select('*').order('codigo_insumos'),
      supabase.from('colores').select('*').order('detalle'),
    ])
    setProductos(p || [])
    setAceros(a || [])
    setMelaminas(m || [])
    setAccesorios(ac || [])
    setInsumos(i || [])
    setColores(c || [])
    const cats = [...new Set((p || []).map(x => x.categoria).filter(Boolean))] as string[]
    setCategorias(cats)
    setLoading(false)
  }

  const seleccionarProducto = async (producto: Producto) => {
    if (productoSel?.codigo === producto.codigo) {
      setProductoSel(null); setVariantes([]); setVarianteSel(null); setListaColapsada(false); return
    }
    setProductoSel(producto)
    setVarianteSel(null)
    setListaColapsada(true)
    setLoadingPanel(true)
    const { data } = await supabase.from('producto_variantes')
      .select('*').eq('codigo_producto', producto.codigo).eq('activo', true).order('es_estandar', { ascending: false })
    setVariantes(data || [])
    setLoadingPanel(false)
  }

  const seleccionarVariante = useCallback(async (v: Variante) => {
    setVarianteSel(v)
    setTabActiva('acero')
    setLoadingPanel(true)
    const [{ data: a }, { data: m }, { data: ac }, { data: i }] = await Promise.all([
      supabase.from('variante_acero').select('*').eq('variante_id', v.id).order('id'),
      supabase.from('variante_melamina').select('*').eq('variante_id', v.id).order('id'),
      supabase.from('variante_accesorios').select('*').eq('variante_id', v.id).order('id'),
      supabase.from('variante_insumos').select('*').eq('variante_id', v.id).order('id'),
    ])
    setPiezasAcero(a || [])
    setPiezasMelamina(m || [])
    setPiezasAccesorios(ac || [])
    setPiezasInsumos(i || [])
    setLoadingPanel(false)
  }, [])

  const recalcularVariante = async (varianteId: number) => {
    await supabase.rpc('recalcular_costos_variante', { p_variante_id: varianteId })
    const { data } = await supabase.from('producto_variantes').select('*').eq('id', varianteId).single()
    if (data) {
      setVariantes(prev => prev.map(v => v.id === varianteId ? data : v))
      setVarianteSel(data)
    }
  }

  // ── Nueva variante ─────────────────────────────────────────────────────────
  const abrirModalVariante = () => {
    setFvNombre(''); setFvColor(''); setFvMelamina(''); setFvEstandar(true); setFvClonarDe('')
    setErrorModal(''); setExito(''); setModalVariante(true)
  }

  const guardarVariante = async () => {
    if (!fvNombre.trim()) { setErrorModal('El nombre es obligatorio'); return }
    setGuardando(true); setErrorModal('')
    const { data: nueva, error } = await supabase.from('producto_variantes').insert({
      codigo_producto: productoSel!.codigo,
      nombre_variante: fvNombre.trim(),
      codigo_color: fvColor || null,
      codigo_melamina: fvMelamina || null,
      es_estandar: fvEstandar,
    }).select().single()

    if (error) { setErrorModal('Error al crear: ' + error.message); setGuardando(false); return }

    // Clonar materiales si se eligió una variante base
    if (fvClonarDe && nueva) {
      const baseId = parseInt(fvClonarDe)
      const [{ data: ca }, { data: cm }, { data: cac }, { data: ci }] = await Promise.all([
        supabase.from('variante_acero').select('*').eq('variante_id', baseId),
        supabase.from('variante_melamina').select('*').eq('variante_id', baseId),
        supabase.from('variante_accesorios').select('*').eq('variante_id', baseId),
        supabase.from('variante_insumos').select('*').eq('variante_id', baseId),
      ])
      const clonar = async (tabla: string, rows: any[]) => {
        if (!rows?.length) return
        const clean = rows.map(({ id, variante_id, costo_unitario, costo_total, created_at, subtotal, ...rest }) => ({ ...rest, variante_id: nueva.id }))
        await supabase.from(tabla).insert(clean)
      }
      await Promise.all([
        clonar('variante_acero', ca || []),
        clonar('variante_melamina', cm || []),
        clonar('variante_accesorios', cac || []),
        clonar('variante_insumos', ci || []),
      ])
      await recalcularVariante(nueva.id)
    }

    setExito('Variante creada correctamente')
    const { data } = await supabase.from('producto_variantes').select('*').eq('codigo_producto', productoSel!.codigo).eq('activo', true).order('es_estandar', { ascending: false })
    setVariantes(data || [])
    setGuardando(false)
    setTimeout(() => { setModalVariante(false); setExito('') }, 1200)
  }

  // ── Nueva / Editar pieza ─────────────────────────────────────────────────
  const abrirModalPieza = () => {
    setPiezaEditando(null)
    setFpCodigo(''); setFpDescripcion(''); setFpLongitud(''); setFpLargo(''); setFpAncho(''); setFpCantidad('')
    setFpCanteadoSup(false); setFpCanteadoInf(false); setFpCanteadoIzq(false); setFpCanteadoDer(false); setFpPrecioTapacanto('')
    setErrorModal(''); setExito(''); setModalPieza(true)
  }

  const abrirModalPiezaEditar = (p: any) => {
    setPiezaEditando(p)
    setErrorModal(''); setExito('')

    if (tabActiva === 'acero') {
      setFpCodigo(p.codigo_acero || '')
      setFpDescripcion(p.descripcion || '')
      setFpLongitud(p.longitud_cm != null ? String(p.longitud_cm) : '')
      setFpCantidad(p.cantidad != null ? String(p.cantidad) : '')
    } else if (tabActiva === 'melamina') {
      setFpCodigo(p.codigo_melamina || '')
      setFpLargo(p.largo_cm != null ? String(p.largo_cm) : '')
      setFpAncho(p.ancho_cm != null ? String(p.ancho_cm) : '')
      setFpCantidad(p.cantidad != null ? String(p.cantidad) : '')
      const detectado = parseDetalleMelamina(p.descripcion)
      setFpDescripcion(detectado.resto)
      setFpCanteadoSup(detectado.sup)
      setFpCanteadoInf(detectado.inf)
      setFpCanteadoIzq(detectado.izq)
      setFpCanteadoDer(detectado.der)
      // El precio del tapacanto no se guarda por separado (no hay columna para eso);
      // si había canteado se deja el campo vacío para que se vuelva a ingresar.
      setFpPrecioTapacanto('')
    } else if (tabActiva === 'accesorios') {
      setFpCodigo(p.codigo_accesorio || '')
      setFpDescripcion(p.descripcion || '')
      setFpCantidad(p.cantidad != null ? String(p.cantidad) : '')
    } else if (tabActiva === 'insumos') {
      setFpCodigo(p.codigo_insumo || '')
      setFpDescripcion(p.descripcion || '')
      setFpCantidad(p.cantidad != null ? String(p.cantidad) : '')
    }

    setModalPieza(true)
  }

  const guardarPieza = async () => {
    if (!fpCodigo || !fpCantidad) { setErrorModal('Código y cantidad son obligatorios'); return }
    const cant = parseFloat(fpCantidad)
    if (isNaN(cant) || cant <= 0) { setErrorModal('Cantidad inválida'); return }
    setGuardando(true); setErrorModal('')

    let error: any = null
    const editando = !!piezaEditando

    if (tabActiva === 'acero') {
      const lon = parseFloat(fpLongitud)
      if (isNaN(lon) || lon <= 0) { setErrorModal('Longitud inválida'); setGuardando(false); return }
      const payload = {
        codigo_acero: fpCodigo, descripcion: fpDescripcion || null, longitud_cm: lon, cantidad: cant,
      }
      const res = editando
        ? await supabase.from('variante_acero').update(payload).eq('id', piezaEditando.id)
        : await supabase.from('variante_acero').insert({ variante_id: varianteSel!.id, ...payload })
      error = res.error
      if (!error) { const { data } = await supabase.from('variante_acero').select('*').eq('variante_id', varianteSel!.id).order('id'); setPiezasAcero(data || []) }
    }

    if (tabActiva === 'melamina') {
      const lar = parseFloat(fpLargo); const anc = parseFloat(fpAncho)
      if (isNaN(lar) || isNaN(anc) || lar <= 0 || anc <= 0) { setErrorModal('Largo y ancho inválidos'); setGuardando(false); return }
      const precioTapa = parseFloat(fpPrecioTapacanto) || 0
      const mel = melaminas.find(m => m.codigo_melamina === fpCodigo)
      const precioM2 = mel?.precio_compra || 0

      const calc = calcularMelamina({
        largoCm: lar, anchoCm: anc, cantidad: cant, precioM2,
        sup: fpCanteadoSup, inf: fpCanteadoInf, izq: fpCanteadoIzq, der: fpCanteadoDer,
        precioTapacantoM: precioTapa,
      })

      // La medida (largo x ancho) va entre paréntesis junto a la nota de canteado,
      // porque esta descripción es lo que alimenta las tablas de planificación de
      // presupuestos y talleres (detalle, cantidad, precio de compra) — ahí no hay
      // columnas separadas de largo/ancho, así que la medida debe quedar en el texto.
      const medida = `${lar}x${anc}`
      const descripcionFinal = [`${calc.notaCanteado} (${medida})`, fpDescripcion.trim()].filter(Boolean).join(' — ')

      const payload = {
        codigo_melamina: fpCodigo,
        descripcion: descripcionFinal || null,
        largo_cm: lar, ancho_cm: anc, cantidad: cant,
        costo_unitario: calc.costoUnitario,
        costo_total: calc.costoTotal,
      }
      const res = editando
        ? await supabase.from('variante_melamina').update(payload).eq('id', piezaEditando.id)
        : await supabase.from('variante_melamina').insert({ variante_id: varianteSel!.id, ...payload })
      error = res.error
      if (!error) { const { data } = await supabase.from('variante_melamina').select('*').eq('variante_id', varianteSel!.id).order('id'); setPiezasMelamina(data || []) }
    }

    if (tabActiva === 'accesorios') {
      const payload = { codigo_accesorio: fpCodigo, descripcion: fpDescripcion || null, cantidad: cant }
      const res = editando
        ? await supabase.from('variante_accesorios').update(payload).eq('id', piezaEditando.id)
        : await supabase.from('variante_accesorios').insert({ variante_id: varianteSel!.id, ...payload })
      error = res.error
      if (!error) { const { data } = await supabase.from('variante_accesorios').select('*').eq('variante_id', varianteSel!.id).order('id'); setPiezasAccesorios(data || []) }
    }

    if (tabActiva === 'insumos') {
      // TODO: implementar fórmula de consumo por insumo
      // Por ahora se registra la cantidad directamente
      // La fórmula dependerá del tipo de insumo (ej: pintura = longitud_total_tubo / consumo)
      const payload = { codigo_insumo: fpCodigo, descripcion: fpDescripcion || null, cantidad: cant }
      const res = editando
        ? await supabase.from('variante_insumos').update(payload).eq('id', piezaEditando.id)
        : await supabase.from('variante_insumos').insert({ variante_id: varianteSel!.id, ...payload })
      error = res.error
      if (!error) { const { data } = await supabase.from('variante_insumos').select('*').eq('variante_id', varianteSel!.id).order('id'); setPiezasInsumos(data || []) }
    }

    if (error) { setErrorModal('Error al guardar: ' + error.message); setGuardando(false); return }

    await recalcularVariante(varianteSel!.id)
    setExito(editando ? 'Pieza actualizada correctamente' : 'Pieza agregada correctamente')
    setGuardando(false)
    setTimeout(() => { setModalPieza(false); setExito(''); setPiezaEditando(null) }, 1000)
  }

  const eliminarPieza = async (tabla: string, id: number) => {
    if (!confirm('¿Eliminar esta pieza?')) return
    await supabase.from(tabla).delete().eq('id', id)
    await recalcularVariante(varianteSel!.id)
    await seleccionarVariante(varianteSel!)
  }

  // ── Visor de planos (PDF) ────────────────────────────────────────────────
  // El PDF nunca se expone como archivo descargable a los usuarios normales:
  // se pinta página por página sobre <canvas>, sin capa de texto (no se puede
  // copiar) y sin controles nativos del navegador (no hay botón de descarga
  // ni de impresión, como sí ocurre con un <iframe>/<embed> de PDF).
  const abrirPlano = async (variante: Variante) => {
    if (!variante.plano_pdf_url) {
      if (esAdmin) {
        alert('Esta variante todavía no tiene un plano cargado. Usa "📎 Subir plano" para agregarlo.')
      } else {
        alert('Esta variante todavía no tiene un plano constructivo cargado.')
      }
      return
    }
    setErrorPlano('')
    setCargandoPlano(true)
    setModalPlano(true)
    try {
      // URL firmada de corta duración: no queda un link público reutilizable.
      const { data, error } = await supabase.storage
        .from(BUCKET_PLANOS)
        .createSignedUrl(variante.plano_pdf_url, 300)
      if (error || !data?.signedUrl) throw error || new Error('No se pudo generar el link del plano')

      const pdfjsLib = await cargarPdfJs()
      const pdf = await pdfjsLib.getDocument(data.signedUrl).promise

      const contenedor = planoContainerRef.current
      if (!contenedor) return
      contenedor.innerHTML = ''

      for (let numPagina = 1; numPagina <= pdf.numPages; numPagina++) {
        const pagina = await pdf.getPage(numPagina)
        const anchoDisponible = Math.min(contenedor.clientWidth || 800, 900)
        const viewportBase = pagina.getViewport({ scale: 1 })
        const escala = anchoDisponible / viewportBase.width
        const viewport = pagina.getViewport({ scale: escala })

        const canvas = document.createElement('canvas')
        canvas.width = viewport.width
        canvas.height = viewport.height
        canvas.style.display = 'block'
        canvas.style.margin = '0 auto 16px'
        canvas.style.boxShadow = '0 2px 10px rgba(0,0,0,0.25)'
        canvas.style.borderRadius = '4px'
        const ctx = canvas.getContext('2d')
        if (ctx) await pagina.render({ canvasContext: ctx, viewport }).promise
        contenedor.appendChild(canvas)
      }
    } catch (err: any) {
      console.error(err)
      setErrorPlano('No se pudo cargar el plano. ' + (err?.message || ''))
    } finally {
      setCargandoPlano(false)
    }
  }

  const cerrarPlano = () => {
    setModalPlano(false)
    setErrorPlano('')
    if (planoContainerRef.current) planoContainerRef.current.innerHTML = ''
  }

  const subirPlano = async (file: File) => {
    if (!varianteSel) return
    if (file.type !== 'application/pdf') { alert('El plano debe ser un archivo PDF.'); return }
    setSubiendoPlano(true)
    try {
      const path = `variantes/${varianteSel.id}.pdf`
      const { error: errorSubida } = await supabase.storage
        .from(BUCKET_PLANOS)
        .upload(path, file, { upsert: true, contentType: 'application/pdf' })
      if (errorSubida) throw errorSubida

      const { error: errorUpdate } = await supabase
        .from('producto_variantes')
        .update({ plano_pdf_url: path })
        .eq('id', varianteSel.id)
      if (errorUpdate) throw errorUpdate

      const actualizada = { ...varianteSel, plano_pdf_url: path }
      setVarianteSel(actualizada)
      setVariantes(prev => prev.map(v => v.id === actualizada.id ? actualizada : v))
      alert('Plano subido correctamente.')
    } catch (err: any) {
      console.error(err)
      alert('Error al subir el plano: ' + (err?.message || 'revisa la consola.'))
    } finally {
      setSubiendoPlano(false)
      if (planoInputRef.current) planoInputRef.current.value = ''
    }
  }

  // Bloqueo best-effort de impresión (Ctrl+P / Cmd+P) mientras el plano está abierto.
  // No es infalible (alguien podría hacer una captura de pantalla), pero evita el
  // atajo directo de impresión del navegador para usuarios no-admin.
  useEffect(() => {
    if (!modalPlano || esAdmin) return
    const bloquearImpresion = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault()
      }
    }
    window.addEventListener('keydown', bloquearImpresion)
    return () => window.removeEventListener('keydown', bloquearImpresion)
  }, [modalPlano, esAdmin])

  // ── Estilos compartidos ────────────────────────────────────────────────────
  const thStyle: any = { padding: '10px 12px', textAlign: 'left', borderBottom: '2px solid #eee', color: '#555', fontSize: '12px', whiteSpace: 'nowrap', backgroundColor: '#f9f9f9' }
  const tdStyle: any = { padding: '10px 12px', borderBottom: '1px solid #f0f0f0', fontSize: '13px' }
  const inputStyle: any = { padding: '9px 12px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '14px', width: '100%', boxSizing: 'border-box', backgroundColor: 'white' }
  const labelStyle: any = { fontSize: '12px', color: '#555', display: 'block', marginBottom: '4px', fontWeight: '500' }

  const productosFiltrados = productos.filter(p =>
    (!filtroCategoria || p.categoria === filtroCategoria) &&
    (!busqueda || (p.nombre || '').toLowerCase().includes(busqueda.toLowerCase()) || p.codigo.toLowerCase().includes(busqueda.toLowerCase()))
  )

  // ── Preview costo pieza ────────────────────────────────────────────────    const previewCosto = () => {
  const previewCosto = () => {
    const cant = parseFloat(fpCantidad) || 0
    if (tabActiva === 'acero') {
      const lon = parseFloat(fpLongitud) || 0
      const acero = aceros.find(a => a.codigo_acero === fpCodigo)
      if (!acero || !lon || !cant) return null
      const costo = (lon * cant / 600) * acero.precio_cotizador
      return `Preview: (${lon}cm × ${cant} / 600) × Bs.${acero.precio_cotizador} = ${fmt(costo)}`
    }
    if (tabActiva === 'melamina') {
      const lar = parseFloat(fpLargo) || 0; const anc = parseFloat(fpAncho) || 0
      const mel = melaminas.find(m => m.codigo_melamina === fpCodigo)
      if (!mel || !lar || !anc || !cant) return null
      const precioTapa = parseFloat(fpPrecioTapacanto) || 0
      const calc = calcularMelamina({
        largoCm: lar, anchoCm: anc, cantidad: cant, precioM2: mel.precio_compra,
        sup: fpCanteadoSup, inf: fpCanteadoInf, izq: fpCanteadoIzq, der: fpCanteadoDer,
        precioTapacantoM: precioTapa,
      })
      return `Área: ${fmt(calc.areaCostoUnit)}/pieza  ·  Canteado: ${calc.longCanteadoUnit.toFixed(2)}m/pieza (${calc.longitudCanteadoTotal.toFixed(2)}m total) → ${fmt(calc.tapacantoCostoUnit)}/pieza  ·  Total pieza: ${fmt(calc.costoUnitario)}  ·  Total (×${cant}): ${fmt(calc.costoTotal)}`
    }
    if (tabActiva === 'accesorios') {
      const acc = accesorios.find(a => a.codigo_accesorio === fpCodigo)
      if (!acc || !cant) return null
      return `Preview: ${cant} × Bs.${acc.precio_cotizador} = ${fmt(cant * acc.precio_cotizador)}`
    }
    if (tabActiva === 'insumos') {
      const ins = insumos.find(i => i.codigo_insumos === fpCodigo)
      if (!ins || !cant) return null
      // TODO: usar fórmula de consumo cuando esté implementada
      return `Preview: ${cant} × Bs.${ins.precio_cotizador} = ${fmt(cant * ins.precio_cotizador)} (fórmula pendiente)`
    }
    return null
  }

  if (loading) return <p style={{ textAlign: 'center', marginTop: '100px', fontFamily: 'Arial' }}>Cargando...</p>

  const preview = previewCosto()

  // Totales para el resumen del modal acero
  const totalLongitudAcero = piezasAcero.reduce((sum, p) => sum + p.longitud_cm * p.cantidad, 0)
  const totalTubos = totalLongitudAcero / 600
  const totalMelaminas = piezasMelamina.reduce((sum, p) => sum + p.cantidad, 0)
  const totalAccesorios = piezasAccesorios.reduce((sum, p) => sum + p.cantidad, 0)

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', minHeight: '100vh', backgroundColor: '#f5f5f5' }}>

      <style>{`
        @media (max-width: 900px) {
          .layout-split { flex-direction: column !important; height: auto !important; }
          .panel-lateral { width: 100% !important; border-left: none !important; border-top: 2px solid #eee; }
          .lista-productos { width: 100% !important; max-height: 45vh; }
        }
        .tab-btn { background: none; border: none; padding: 10px 16px; cursor: pointer; font-size: 13px; font-weight: 500; color: #888; border-bottom: 2px solid transparent; transition: all 0.15s; }
        .tab-btn.activa { color: #087e0b; border-bottom-color: #087e0b; }
        .tab-btn:hover { color: #087e0b; }
        .prod-row { cursor: pointer; transition: background 0.1s; }
        .prod-row:hover { background: #f0fff0 !important; }
        .prod-row.seleccionado { background: #e8f5e9 !important; }
        .catalogo-card { cursor: pointer; transition: transform 0.15s, box-shadow 0.15s; }
        .catalogo-card:hover { transform: translateY(-2px); box-shadow: 0 6px 18px rgba(0,0,0,0.12) !important; }
        .catalogo-card.seleccionada { outline: 2px solid #087e0b; }
        /* El visor de planos nunca debe salir en una impresión del navegador. */
        @media print {
          .plano-modal-overlay { display: none !important; }
        }
      `}</style>

      {/* MODAL NUEVA VARIANTE */}
      {modalVariante && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', boxSizing: 'border-box' }}>
          <div style={{ backgroundColor: 'white', borderRadius: '16px', padding: '32px', width: '500px', maxWidth: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ margin: 0, fontSize: '18px' }}>Nueva Variante — {productoSel?.nombre}</h2>
              <button onClick={() => setModalVariante(false)} style={{ background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer', color: '#999' }}>✕</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '14px' }}>
              <div>
                <label style={labelStyle}>Nombre de la variante *</label>
                <input type="text" value={fvNombre} onChange={e => setFvNombre(e.target.value)} style={inputStyle} placeholder="Ej: Negro / Blanco" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>Color estructura</label>
                  <select value={fvColor} onChange={e => setFvColor(e.target.value)} style={inputStyle}>
                    <option value="">-- Sin color --</option>
                    {colores.map(c => <option key={c.id} value={c.codigo_color}>{c.detalle}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Melamina</label>
                  <select value={fvMelamina} onChange={e => setFvMelamina(e.target.value)} style={inputStyle}>
                    <option value="">-- Sin melamina --</option>
                    {melaminas.map(m => <option key={m.id} value={m.codigo_melamina}>{m.detalle}</option>)}
                  </select>
                </div>
              </div>
              {variantes.length > 0 && (
                <div>
                  <label style={labelStyle}>Clonar materiales desde variante existente</label>
                  <select value={fvClonarDe} onChange={e => setFvClonarDe(e.target.value)} style={inputStyle}>
                    <option value="">-- No clonar, empezar vacía --</option>
                    {variantes.map(v => <option key={v.id} value={v.id}>{v.nombre_variante}{v.es_estandar ? ' ★' : ''}</option>)}
                  </select>
                </div>
              )}
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px', cursor: 'pointer' }}>
                <input type="checkbox" checked={fvEstandar} onChange={e => setFvEstandar(e.target.checked)} style={{ width: '16px', height: '16px' }} />
                Variante estándar del producto
              </label>
            </div>

            {errorModal && <div style={{ marginTop: '16px', backgroundColor: '#ffebee', border: '1px solid #ffcdd2', borderRadius: '8px', padding: '10px 14px', color: '#c62828', fontSize: '13px' }}>{errorModal}</div>}
            {exito && <div style={{ marginTop: '16px', backgroundColor: '#e8f5e9', border: '1px solid #c8e6c9', borderRadius: '8px', padding: '10px 14px', color: '#2e7d32', fontSize: '13px' }}>{exito}</div>}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '24px' }}>
              <button onClick={() => setModalVariante(false)} style={{ padding: '10px 20px', background: 'transparent', border: '1px solid #ddd', borderRadius: '8px', cursor: 'pointer', fontSize: '14px' }}>Cancelar</button>
              <button onClick={guardarVariante} disabled={guardando} style={{ padding: '10px 24px', backgroundColor: guardando ? '#ccc' : '#087e0b', color: 'white', border: 'none', borderRadius: '8px', cursor: guardando ? 'not-allowed' : 'pointer', fontSize: '14px', fontWeight: 'bold' }}>
                {guardando ? 'Guardando...' : 'Crear Variante'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL NUEVA PIEZA */}
      {modalPieza && varianteSel && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', boxSizing: 'border-box' }}>
          <div style={{ backgroundColor: 'white', borderRadius: '16px', padding: '32px', width: '500px', maxWidth: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ margin: 0, fontSize: '18px' }}>
                {piezaEditando ? 'Editar' : 'Agregar'} {tabActiva === 'acero' ? '🔩 Acero' : tabActiva === 'melamina' ? '🪵 Melamina' : tabActiva === 'accesorios' ? '🔧 Accesorio' : '🧪 Insumo'}
              </h2>
              <button onClick={() => setModalPieza(false)} style={{ background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer', color: '#999' }}>✕</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '14px' }}>

              {/* Selector de código */}
              <div>
                <label style={labelStyle}>
                  {tabActiva === 'acero' ? 'Código acero' : tabActiva === 'melamina' ? 'Código melamina' : tabActiva === 'accesorios' ? 'Código accesorio' : 'Código insumo'} *
                </label>
                <select value={fpCodigo} onChange={e => setFpCodigo(e.target.value)} style={inputStyle}>
                  <option value="">-- Selecciona --</option>
                  {tabActiva === 'acero' && aceros.map(a => <option key={a.id} value={a.codigo_acero}>{a.codigo_acero} — {a.detalle}</option>)}
                  {tabActiva === 'melamina' && melaminas.map(m => <option key={m.id} value={m.codigo_melamina}>{m.codigo_melamina} — {m.detalle}</option>)}
                  {tabActiva === 'accesorios' && accesorios.map(a => <option key={a.id} value={a.codigo_accesorio}>{a.codigo_accesorio} — {a.detalle}</option>)}
                  {tabActiva === 'insumos' && insumos.map(i => <option key={i.id} value={i.codigo_insumos}>{i.codigo_insumos} — {i.detalle}</option>)}
                </select>
              </div>

              <div>
                <label style={labelStyle}>Descripción / Referencia</label>
                <input type="text" value={fpDescripcion} onChange={e => setFpDescripcion(e.target.value)} style={inputStyle} placeholder="Ej: Pata delantera izquierda" />
              </div>

              {/* Campos según tab */}
              {tabActiva === 'acero' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={labelStyle}>Longitud (cm) *</label>
                    <input type="number" value={fpLongitud} onChange={e => setFpLongitud(e.target.value)} style={inputStyle} placeholder="Ej: 120" min="0" step="0.1" />
                  </div>
                  <div>
                    <label style={labelStyle}>Cantidad *</label>
                    <input type="number" value={fpCantidad} onChange={e => setFpCantidad(e.target.value)} style={inputStyle} placeholder="Ej: 4" min="0" step="1" />
                  </div>
                </div>
              )}

              {tabActiva === 'melamina' && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={labelStyle}>Largo (cm) *</label>
                      <input type="number" value={fpLargo} onChange={e => setFpLargo(e.target.value)} style={inputStyle} placeholder="Ej: 80" min="0" step="0.1" />
                    </div>
                    <div>
                      <label style={labelStyle}>Ancho (cm) *</label>
                      <input type="number" value={fpAncho} onChange={e => setFpAncho(e.target.value)} style={inputStyle} placeholder="Ej: 40" min="0" step="0.1" />
                    </div>
                    <div>
                      <label style={labelStyle}>Cantidad *</label>
                      <input type="number" value={fpCantidad} onChange={e => setFpCantidad(e.target.value)} style={inputStyle} placeholder="Ej: 2" min="0" step="1" />
                    </div>
                  </div>

                  <div style={{ border: '1px solid #eee', borderRadius: '10px', padding: '12px 14px', backgroundColor: '#fafafa' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <label style={{ ...labelStyle, margin: 0 }}>Tapacanto — lados canteados</label>
                      <button type="button"
                        onClick={() => {
                          const todos = fpCanteadoSup && fpCanteadoInf && fpCanteadoIzq && fpCanteadoDer
                          setFpCanteadoSup(!todos); setFpCanteadoInf(!todos); setFpCanteadoIzq(!todos); setFpCanteadoDer(!todos)
                        }}
                        style={{ background: 'none', border: 'none', color: '#087e0b', fontSize: '11px', cursor: 'pointer', textDecoration: 'underline' }}>
                        {fpCanteadoSup && fpCanteadoInf && fpCanteadoIzq && fpCanteadoDer ? 'Quitar todos' : 'Marcar todos'}
                      </button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
                        <input type="checkbox" checked={fpCanteadoSup} onChange={e => setFpCanteadoSup(e.target.checked)} style={{ width: '15px', height: '15px' }} />
                        Arriba
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
                        <input type="checkbox" checked={fpCanteadoInf} onChange={e => setFpCanteadoInf(e.target.checked)} style={{ width: '15px', height: '15px' }} />
                        Abajo
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
                        <input type="checkbox" checked={fpCanteadoIzq} onChange={e => setFpCanteadoIzq(e.target.checked)} style={{ width: '15px', height: '15px' }} />
                        Izquierda
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
                        <input type="checkbox" checked={fpCanteadoDer} onChange={e => setFpCanteadoDer(e.target.checked)} style={{ width: '15px', height: '15px' }} />
                        Derecha
                      </label>
                    </div>
                    <div style={{ marginTop: '10px' }}>
                      <label style={labelStyle}>Precio tapacanto (Bs./metro lineal)</label>
                      <input type="number" value={fpPrecioTapacanto} onChange={e => setFpPrecioTapacanto(e.target.value)} style={inputStyle} placeholder="Ej: 3.50" min="0" step="0.01" />
                      {piezaEditando && (fpCanteadoSup || fpCanteadoInf || fpCanteadoIzq || fpCanteadoDer) && !fpPrecioTapacanto && (
                        <p style={{ margin: '6px 0 0', fontSize: '11px', color: '#f57f17', fontStyle: 'italic' }}>
                          ⚠️ Esta pieza tenía canteado pero el precio no se guarda aparte — vuelve a ingresarlo para recalcular el costo.
                        </p>
                      )}
                    </div>
                  </div>
                </>
              )}

              {(tabActiva === 'accesorios' || tabActiva === 'insumos') && (
                <div>
                  <label style={labelStyle}>Cantidad *</label>
                  <input type="number" value={fpCantidad} onChange={e => setFpCantidad(e.target.value)} style={inputStyle} placeholder="Ej: 4" min="0" step="0.01" />
                  {tabActiva === 'insumos' && (
                    <p style={{ margin: '6px 0 0', fontSize: '11px', color: '#f57f17', fontStyle: 'italic' }}>
                      ⚠️ Fórmula de consumo pendiente — se registra cantidad directamente
                    </p>
                  )}
                </div>
              )}

              {/* Preview costo */}
              {preview && (
                <div style={{ backgroundColor: '#f0fff0', border: '1px solid #a3c47d', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#2c6d2e' }}>
                  {preview}
                </div>
              )}
            </div>

            {errorModal && <div style={{ marginTop: '14px', backgroundColor: '#ffebee', border: '1px solid #ffcdd2', borderRadius: '8px', padding: '10px 14px', color: '#c62828', fontSize: '13px' }}>{errorModal}</div>}
            {exito && <div style={{ marginTop: '14px', backgroundColor: '#e8f5e9', border: '1px solid #c8e6c9', borderRadius: '8px', padding: '10px 14px', color: '#2e7d32', fontSize: '13px' }}>{exito}</div>}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '24px' }}>
              <button onClick={() => { setModalPieza(false); setPiezaEditando(null) }} style={{ padding: '10px 20px', background: 'transparent', border: '1px solid #ddd', borderRadius: '8px', cursor: 'pointer', fontSize: '14px' }}>Cancelar</button>
              <button onClick={guardarPieza} disabled={guardando} style={{ padding: '10px 24px', backgroundColor: guardando ? '#ccc' : '#087e0b', color: 'white', border: 'none', borderRadius: '8px', cursor: guardando ? 'not-allowed' : 'pointer', fontSize: '14px', fontWeight: 'bold' }}>
                {guardando ? 'Guardando...' : (piezaEditando ? 'Guardar cambios' : 'Agregar Pieza')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL VISOR DE PLANOS */}
      {modalPlano && varianteSel && (
        <div
          className="plano-modal-overlay"
          onContextMenu={e => e.preventDefault()}
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(10,10,10,0.92)', zIndex: 3000, display: 'flex', flexDirection: 'column' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 24px', backgroundColor: '#111', color: 'white', flexShrink: 0 }}>
            <div>
              <p style={{ margin: 0, fontSize: '11px', color: '#a3c47d', textTransform: 'uppercase', letterSpacing: '0.5px' }}>📐 Plano constructivo</p>
              <h3 style={{ margin: 0, fontSize: '15px' }}>{productoSel?.nombre} — {varianteSel.nombre_variante}</h3>
            </div>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              {esAdmin && varianteSel.plano_pdf_url && (
                <button
                  onClick={async () => {
                    const { data } = await supabase.storage.from(BUCKET_PLANOS).createSignedUrl(varianteSel.plano_pdf_url!, 120)
                    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
                  }}
                  style={{ background: 'none', border: '1px solid #a3c47d', color: '#a3c47d', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}
                >
                  ⬇ Abrir original (solo admin)
                </button>
              )}
              <button onClick={cerrarPlano} style={{ background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer', color: 'white' }}>✕</button>
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '24px', userSelect: 'none', WebkitUserSelect: 'none' }}>
            {cargandoPlano && <p style={{ color: 'white', textAlign: 'center', marginTop: '60px' }}>Cargando plano...</p>}
            {errorPlano && <p style={{ color: '#ff8080', textAlign: 'center', marginTop: '60px' }}>{errorPlano}</p>}
            <div ref={planoContainerRef} style={{ maxWidth: '900px', margin: '0 auto' }} />
          </div>

          {!esAdmin && (
            <p style={{ textAlign: 'center', color: '#888', fontSize: '11px', padding: '8px', margin: 0, backgroundColor: '#111' }}>
              Vista de solo lectura — descarga, copia e impresión deshabilitadas.
            </p>
          )}
        </div>
      )}

      {/* NAVBAR */}
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 40px', backgroundColor: '#222', color: 'white', position: 'fixed', top: 0, width: '100%', zIndex: 1000, boxSizing: 'border-box' }}>
        <a href="/" style={{ fontWeight: 'bold', fontSize: '20px', color: 'white', textDecoration: 'none' }}>Muebles is Better</a>
        <span style={{ color: '#a3c47d', fontWeight: 'bold' }}>Detalles Constructivos</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <a href="/sistema" style={{ color: '#a3c47d', fontSize: '14px', textDecoration: 'none' }}>← Sistema</a>
          <a href="/" onClick={() => localStorage.removeItem('carnet')} style={{ backgroundColor: 'transparent', color: '#ff6b6b', border: '1px solid #ff6b6b', padding: '5px 12px', borderRadius: '20px', fontSize: '12px', textDecoration: 'none' }}>Salir</a>
        </div>
      </nav>

      {/* LAYOUT PRINCIPAL */}
      <div className="layout-split" style={{ paddingTop: '60px', display: 'flex', height: 'calc(100vh - 60px)' }}>

        {/* COLUMNA IZQUIERDA — Lista productos (se contrae al seleccionar uno) */}
        {(!productoSel || !listaColapsada) && (
        <div className="lista-productos" style={{ width: productoSel ? '38%' : '100%', transition: 'width 0.3s', overflowY: 'auto', borderRight: '1px solid #e0e0e0', backgroundColor: 'white' }}>

          {/* Filtros */}
          <div style={{ padding: '20px', borderBottom: '1px solid #eee', position: 'sticky', top: 0, backgroundColor: 'white', zIndex: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h2 style={{ margin: 0, fontSize: '18px' }}>Catálogo de Productos</h2>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {productoSel && (
                  <button onClick={() => setListaColapsada(true)}
                    style={{ padding: '5px 12px', borderRadius: '16px', border: '1px solid #ddd', cursor: 'pointer', fontSize: '12px', backgroundColor: 'white', color: '#666' }}>
                    Contraer ▸
                  </button>
                )}
                <div style={{ display: 'flex', gap: '4px', backgroundColor: '#f0f0f0', borderRadius: '20px', padding: '3px' }}>
                  <button onClick={() => setVistaCatalogo('tarjetas')}
                    style={{ padding: '5px 10px', borderRadius: '16px', border: 'none', cursor: 'pointer', fontSize: '13px', backgroundColor: vistaCatalogo === 'tarjetas' ? '#087e0b' : 'transparent', color: vistaCatalogo === 'tarjetas' ? 'white' : '#666' }}>
                    ▦
                  </button>
                  <button onClick={() => setVistaCatalogo('tabla')}
                    style={{ padding: '5px 10px', borderRadius: '16px', border: 'none', cursor: 'pointer', fontSize: '13px', backgroundColor: vistaCatalogo === 'tabla' ? '#087e0b' : 'transparent', color: vistaCatalogo === 'tabla' ? 'white' : '#666' }}>
                    ☰
                  </button>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <input type="text" placeholder="Buscar por código o nombre..." value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                style={{ ...inputStyle, flex: 1 }} />
              <select value={filtroCategoria} onChange={e => setFiltroCategoria(e.target.value)}
                style={{ ...inputStyle, width: 'auto', minWidth: '140px' }}>
                <option value="">Todas las categorías</option>
                {categorias.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <p style={{ margin: '10px 0 0', fontSize: '12px', color: '#888' }}>{productosFiltrados.length} productos</p>
          </div>

          {/* Catálogo en tarjetas */}
          {vistaCatalogo === 'tarjetas' ? (
            <div style={{
              display: 'grid',
              gridTemplateColumns: productoSel ? '1fr' : 'repeat(auto-fill, minmax(170px, 1fr))',
              gap: '14px',
              padding: '20px'
            }}>
              {productosFiltrados.map(p => (
                <div key={p.codigo}
                  className={`catalogo-card${productoSel?.codigo === p.codigo ? ' seleccionada' : ''}`}
                  onClick={() => seleccionarProducto(p)}
                  style={{
                    backgroundColor: 'white',
                    borderRadius: '12px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                    overflow: 'hidden',
                    display: productoSel ? 'flex' : 'block',
                    alignItems: productoSel ? 'center' : undefined,
                  }}>
                  <div style={{
                    width: productoSel ? '90px' : '100%',
                    height: productoSel ? '90px' : '140px',
                    flexShrink: 0,
                    backgroundColor: '#f2f2f2',
                    backgroundImage: p.foto_url ? `url(${p.foto_url})` : undefined,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#ccc', fontSize: '28px'
                  }}>
                    {!p.foto_url && '🪑'}
                  </div>
                  <div style={{ padding: '10px 12px' }}>
                    <p style={{ margin: '0 0 2px', fontSize: '10px', color: '#087e0b', fontFamily: 'monospace', fontWeight: 'bold' }}>{p.codigo}</p>
                    <p style={{ margin: '0 0 2px', fontSize: '13px', fontWeight: '600', color: '#222', lineHeight: 1.2 }}>{p.nombre || '—'}</p>
                    <p style={{ margin: 0, fontSize: '11px', color: '#999' }}>{p.categoria || '—'}</p>
                  </div>
                </div>
              ))}
              {productosFiltrados.length === 0 && (
                <p style={{ gridColumn: '1 / -1', textAlign: 'center', color: '#bbb', padding: '30px' }}>Sin productos que coincidan con la búsqueda.</p>
              )}
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thStyle}>Código</th>
                  <th style={thStyle}>Nombre</th>
                  <th style={thStyle}>Categoría</th>
                </tr>
              </thead>
              <tbody>
                {productosFiltrados.map((p, i) => (
                  <tr key={p.codigo}
                    className={`prod-row${productoSel?.codigo === p.codigo ? ' seleccionado' : ''}`}
                    style={{ backgroundColor: i % 2 === 0 ? 'white' : '#fafafa' }}
                    onClick={() => seleccionarProducto(p)}>
                    <td style={{ ...tdStyle, fontWeight: 'bold', color: '#087e0b', fontFamily: 'monospace' }}>{p.codigo}</td>
                    <td style={tdStyle}>{p.nombre || '—'}</td>
                    <td style={{ ...tdStyle, color: '#888', fontSize: '12px' }}>{p.categoria || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        )}

        {/* PANEL LATERAL — Variantes y materiales */}
        {productoSel && (
          <div className="panel-lateral" style={{ width: listaColapsada ? '100%' : '62%', overflowY: 'auto', backgroundColor: '#f9f9f9' }}>

            {/* Header producto */}
            <div style={{ padding: '20px 24px', backgroundColor: 'white', borderBottom: '1px solid #eee', position: 'sticky', top: 0, zIndex: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  {listaColapsada && (
                    <button onClick={() => setListaColapsada(false)}
                      style={{ marginBottom: '6px', padding: '4px 10px', borderRadius: '14px', border: '1px solid #ddd', backgroundColor: 'white', color: '#666', cursor: 'pointer', fontSize: '11px' }}>
                      ◂ Ver catálogo ({productosFiltrados.length})
                    </button>
                  )}
                  <p style={{ margin: '0 0 2px', fontSize: '11px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{productoSel.categoria}</p>
                  <h2 style={{ margin: '0 0 4px', fontSize: '18px' }}>{productoSel.nombre}</h2>
                  <p style={{ margin: 0, fontSize: '12px', color: '#087e0b', fontFamily: 'monospace' }}>{productoSel.codigo}</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ margin: '0 0 2px', fontSize: '11px', color: '#888' }}>P. Mínimo / P. Tienda</p>
                  <p style={{ margin: 0, fontSize: '14px', fontWeight: 'bold' }}>{fmt(productoSel.precio_minimo)} / {fmt(productoSel.precio_tienda)}</p>
                  <button onClick={() => setProductoSel(null)} style={{ marginTop: '8px', background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '12px' }}>✕ Cerrar</button>
                </div>
              </div>
            </div>

            <div style={{ padding: '20px 24px' }}>

              {/* Selector variantes */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h3 style={{ margin: 0, fontSize: '15px', color: '#333' }}>Variantes ({variantes.length})</h3>
                {puedeEditar && (
                  <button onClick={abrirModalVariante}
                    style={{ padding: '7px 14px', backgroundColor: '#087e0b', color: 'white', border: 'none', borderRadius: '20px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>
                    + Nueva variante
                  </button>
                )}
              </div>

              {loadingPanel && !varianteSel ? (
                <p style={{ color: '#888', textAlign: 'center', padding: '20px' }}>Cargando...</p>
              ) : variantes.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px', color: '#bbb', border: '2px dashed #eee', borderRadius: '12px', marginBottom: '20px' }}>
                  <p style={{ margin: 0 }}>Sin variantes — crea la primera</p>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '20px' }}>
                  {variantes.map(v => (
                    <button key={v.id} onClick={() => seleccionarVariante(v)}
                      style={{ padding: '8px 16px', borderRadius: '20px', border: `2px solid ${varianteSel?.id === v.id ? '#087e0b' : '#ddd'}`, backgroundColor: varianteSel?.id === v.id ? '#087e0b' : 'white', color: varianteSel?.id === v.id ? 'white' : '#333', cursor: 'pointer', fontSize: '13px', fontWeight: varianteSel?.id === v.id ? 'bold' : 'normal' }}>
                      {v.es_estandar ? '★ ' : ''}{v.nombre_variante}{v.plano_pdf_url ? ' 📐' : ''}
                    </button>
                  ))}
                </div>
              )}

              {/* Panel variante seleccionada */}
              {varianteSel && (
                <div style={{ backgroundColor: 'white', borderRadius: '16px', boxShadow: '0 2px 12px rgba(0,0,0,0.08)', overflow: 'hidden' }}>

                  {/* Tabs */}
                  <div style={{ display: 'flex', borderBottom: '1px solid #eee', padding: '0 8px', flexWrap: 'wrap' }}>
                    {(['acero', 'melamina', 'accesorios', 'insumos'] as TabActiva[]).map(tab => (
                      <button key={tab} className={`tab-btn${tabActiva === tab ? ' activa' : ''}`}
                        onClick={() => setTabActiva(tab)}>
                        {tab === 'acero' ? '🔩 Acero' : tab === 'melamina' ? '🪵 Melamina' : tab === 'accesorios' ? '🔧 Accesorios' : '🧪 Insumos'}
                        <span style={{ marginLeft: '6px', fontSize: '11px', backgroundColor: tabActiva === tab ? '#087e0b' : '#eee', color: tabActiva === tab ? 'white' : '#666', borderRadius: '10px', padding: '1px 7px' }}>
                          {tab === 'acero' ? piezasAcero.length : tab === 'melamina' ? piezasMelamina.length : tab === 'accesorios' ? piezasAccesorios.length : piezasInsumos.length}
                        </span>
                      </button>
                    ))}
                    <div style={{ flex: 1 }} />
                    <button onClick={() => abrirPlano(varianteSel)}
                      style={{ margin: '8px 4px', padding: '4px 12px', backgroundColor: varianteSel.plano_pdf_url ? '#0B1E36' : '#eee', color: varianteSel.plano_pdf_url ? '#C5A059' : '#999', border: 'none', borderRadius: '20px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>
                      📐 {varianteSel.plano_pdf_url ? 'Ver plano' : 'Sin plano'}
                    </button>
                    {esAdmin && (
                      <>
                        <input
                          ref={planoInputRef}
                          type="file"
                          accept="application/pdf"
                          style={{ display: 'none' }}
                          onChange={e => { const f = e.target.files?.[0]; if (f) subirPlano(f) }}
                        />
                        <button
                          onClick={() => planoInputRef.current?.click()}
                          disabled={subiendoPlano}
                          style={{ margin: '8px 0', padding: '4px 12px', backgroundColor: subiendoPlano ? '#ccc' : '#555', color: 'white', border: 'none', borderRadius: '20px', cursor: subiendoPlano ? 'not-allowed' : 'pointer', fontSize: '12px', fontWeight: 'bold' }}>
                          {subiendoPlano ? 'Subiendo...' : '📎 Subir plano'}
                        </button>
                      </>
                    )}
                    {puedeEditar && (
                      <button onClick={abrirModalPieza}
                        style={{ margin: '8px 0', padding: '4px 12px', backgroundColor: '#087e0b', color: 'white', border: 'none', borderRadius: '20px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>
                        + Agregar
                      </button>
                    )}
                  </div>

                  {/* Contenido tab */}
                  <div style={{ overflowX: 'auto' }}>
                    {loadingPanel ? (
                      <p style={{ padding: '20px', textAlign: 'center', color: '#888' }}>Cargando...</p>
                    ) : (
                      <>
                        {/* ACERO */}
                        {tabActiva === 'acero' && (
                          piezasAcero.length === 0 ? (
                            <p style={{ padding: '24px', textAlign: 'center', color: '#bbb' }}>Sin cortes de acero registrados</p>
                          ) : (
                            <>
                              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead><tr>
                                  <th style={thStyle}>Código</th>
                                  <th style={thStyle}>Descripción</th>
                                  <th style={{ ...thStyle, textAlign: 'right' }}>Long.(cm)</th>
                                  <th style={{ ...thStyle, textAlign: 'right' }}>Cant.</th>
                                  <th style={{ ...thStyle, textAlign: 'right' }}>Costo</th>
                                  {puedeEditar && <th style={{ ...thStyle, textAlign: 'center' }}></th>}
                                </tr></thead>
                                <tbody>
                                  {piezasAcero.map((p, i) => (
                                    <tr key={p.id} style={{ backgroundColor: i % 2 === 0 ? 'white' : '#fafafa' }}>
                                      <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: '12px', color: '#087e0b' }}>{p.codigo_acero}</td>
                                      <td style={{ ...tdStyle, color: '#666' }}>{p.descripcion || '—'}</td>
                                      <td style={{ ...tdStyle, textAlign: 'right' }}>{p.longitud_cm}</td>
                                      <td style={{ ...tdStyle, textAlign: 'right' }}>{p.cantidad}</td>
                                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 'bold', color: '#087e0b' }}>{fmt(p.costo_total)}</td>
                                      {puedeEditar && <td style={{ ...tdStyle, textAlign: 'center' }}>
                                        <button onClick={() => abrirModalPiezaEditar(p)} style={{ background: 'none', border: 'none', color: '#1a73e8', cursor: 'pointer', fontSize: '15px', marginRight: '6px' }}>✏️</button>
                                        <button onClick={() => eliminarPieza('variante_acero', p.id)} style={{ background: 'none', border: 'none', color: '#ff4444', cursor: 'pointer', fontSize: '16px' }}>🗑</button>
                                      </td>}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                              {/* Resumen acero */}
                              <div style={{ display: 'flex', gap: '32px', padding: '14px 16px', backgroundColor: '#f0fff0', borderTop: '2px solid #a3c47d', flexWrap: 'wrap', alignItems: 'center' }}>
                                <div>
                                  <p style={{ margin: 0, fontSize: '11px', color: '#555' }}>📏 Longitud total de acero</p>
                                  <p style={{ margin: 0, fontSize: '15px', fontWeight: 'bold', color: '#087e0b' }}>{totalLongitudAcero.toLocaleString('es-BO')} cm</p>
                                </div>
                                <div>
                                  <p style={{ margin: 0, fontSize: '11px', color: '#555' }}>🪣 Tubos necesarios (÷ 600 cm)</p>
                                  <p style={{ margin: 0, fontSize: '15px', fontWeight: 'bold', color: '#087e0b' }}>{totalTubos.toFixed(1)} {totalTubos === 1 ? 'tubo' : 'tubos'}</p>
                                </div>
                              </div>
                            </>
                          )
                        )}

                        {/* MELAMINA */}
                        {tabActiva === 'melamina' && (
                          piezasMelamina.length === 0 ? (
                            <p style={{ padding: '24px', textAlign: 'center', color: '#bbb' }}>Sin cortes de melamina registrados</p>
                          ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                              <thead><tr>
                                <th style={thStyle}>Código</th>
                                <th style={thStyle}>Descripción</th>
                                <th style={{ ...thStyle, textAlign: 'right' }}>Largo</th>
                                <th style={{ ...thStyle, textAlign: 'right' }}>Ancho</th>
                                <th style={{ ...thStyle, textAlign: 'right' }}>Cant.</th>
                                <th style={{ ...thStyle, textAlign: 'right' }}>Costo</th>
                                {puedeEditar && <th style={{ ...thStyle, textAlign: 'center' }}></th>}
                              </tr></thead>
                              <tbody>
                                {piezasMelamina.map((p, i) => (
                                  <tr key={p.id} style={{ backgroundColor: i % 2 === 0 ? 'white' : '#fafafa' }}>
                                    <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: '12px', color: '#087e0b' }}>{p.codigo_melamina}</td>
                                    <td style={{ ...tdStyle, color: '#666' }}>{p.descripcion || '—'}</td>
                                    <td style={{ ...tdStyle, textAlign: 'right' }}>{p.largo_cm}</td>
                                    <td style={{ ...tdStyle, textAlign: 'right' }}>{p.ancho_cm}</td>
                                    <td style={{ ...tdStyle, textAlign: 'right' }}>{p.cantidad}</td>
                                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 'bold', color: '#087e0b' }}>{fmt(p.costo_total)}</td>
                                    {puedeEditar && <td style={{ ...tdStyle, textAlign: 'center' }}>
                                      <button onClick={() => abrirModalPiezaEditar(p)} style={{ background: 'none', border: 'none', color: '#1a73e8', cursor: 'pointer', fontSize: '15px', marginRight: '6px' }}>✏️</button>
                                      <button onClick={() => eliminarPieza('variante_melamina', p.id)} style={{ background: 'none', border: 'none', color: '#ff4444', cursor: 'pointer', fontSize: '16px' }}>🗑</button>
                                    </td>}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )
                        )}

                        {/* ACCESORIOS */}
                        {tabActiva === 'accesorios' && (
                          piezasAccesorios.length === 0 ? (
                            <p style={{ padding: '24px', textAlign: 'center', color: '#bbb' }}>Sin accesorios registrados</p>
                          ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                              <thead><tr>
                                <th style={thStyle}>Código</th>
                                <th style={thStyle}>Descripción</th>
                                <th style={{ ...thStyle, textAlign: 'right' }}>Cant.</th>
                                <th style={{ ...thStyle, textAlign: 'right' }}>P. Unit.</th>
                                <th style={{ ...thStyle, textAlign: 'right' }}>Costo</th>
                                {puedeEditar && <th style={{ ...thStyle, textAlign: 'center' }}></th>}
                              </tr></thead>
                              <tbody>
                                {piezasAccesorios.map((p, i) => (
                                  <tr key={p.id} style={{ backgroundColor: i % 2 === 0 ? 'white' : '#fafafa' }}>
                                    <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: '12px', color: '#087e0b' }}>{p.codigo_accesorio}</td>
                                    <td style={{ ...tdStyle, color: '#666' }}>{p.descripcion || '—'}</td>
                                    <td style={{ ...tdStyle, textAlign: 'right' }}>{p.cantidad}</td>
                                    <td style={{ ...tdStyle, textAlign: 'right' }}>{fmt(p.costo_unitario)}</td>
                                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 'bold', color: '#087e0b' }}>{fmt(p.costo_total)}</td>
                                    {puedeEditar && <td style={{ ...tdStyle, textAlign: 'center' }}>
                                      <button onClick={() => abrirModalPiezaEditar(p)} style={{ background: 'none', border: 'none', color: '#1a73e8', cursor: 'pointer', fontSize: '15px', marginRight: '6px' }}>✏️</button>
                                      <button onClick={() => eliminarPieza('variante_accesorios', p.id)} style={{ background: 'none', border: 'none', color: '#ff4444', cursor: 'pointer', fontSize: '16px' }}>🗑</button>
                                    </td>}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )
                        )}

                        {/* INSUMOS */}
                        {tabActiva === 'insumos' && (
                          piezasInsumos.length === 0 ? (
                            <p style={{ padding: '24px', textAlign: 'center', color: '#bbb' }}>Sin insumos registrados</p>
                          ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                              <thead><tr>
                                <th style={thStyle}>Código</th>
                                <th style={thStyle}>Descripción</th>
                                <th style={{ ...thStyle, textAlign: 'right' }}>Cant.</th>
                                <th style={{ ...thStyle, textAlign: 'right' }}>P. Unit.</th>
                                <th style={{ ...thStyle, textAlign: 'right' }}>Costo</th>
                                {puedeEditar && <th style={{ ...thStyle, textAlign: 'center' }}></th>}
                              </tr></thead>
                              <tbody>
                                {piezasInsumos.map((p, i) => (
                                  <tr key={p.id} style={{ backgroundColor: i % 2 === 0 ? 'white' : '#fafafa' }}>
                                    <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: '12px', color: '#087e0b' }}>{p.codigo_insumo}</td>
                                    <td style={{ ...tdStyle, color: '#666' }}>{p.descripcion || '—'}</td>
                                    <td style={{ ...tdStyle, textAlign: 'right' }}>{p.cantidad}</td>
                                    <td style={{ ...tdStyle, textAlign: 'right' }}>{fmt(p.costo_unitario)}</td>
                                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 'bold', color: '#087e0b' }}>{fmt(p.costo_total)}</td>
                                    {puedeEditar && <td style={{ ...tdStyle, textAlign: 'center' }}>
                                      <button onClick={() => abrirModalPiezaEditar(p)} style={{ background: 'none', border: 'none', color: '#1a73e8', cursor: 'pointer', fontSize: '15px', marginRight: '6px' }}>✏️</button>
                                      <button onClick={() => eliminarPieza('variante_insumos', p.id)} style={{ background: 'none', border: 'none', color: '#ff4444', cursor: 'pointer', fontSize: '16px' }}>🗑</button>
                                    </td>}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )
                        )}
                      </>
                    )}
                  </div>

                  {/* Resumen costos */}
                  <div style={{ backgroundColor: '#222', padding: '16px 20px', display: 'flex', flexWrap: 'wrap', gap: '20px', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                      {[
                        ['🔩 Acero', varianteSel.costo_acero],
                        ['🪵 Melamina', varianteSel.costo_melamina],
                        ['🔧 Accesorios', varianteSel.costo_accesorios],
                        ['🧪 Insumos', varianteSel.costo_insumos],
                      ].map(([label, val]) => (
                        <div key={label as string}>
                          <p style={{ margin: 0, fontSize: '10px', color: '#aaa' }}>{label as string}</p>
                          <p style={{ margin: 0, fontSize: '14px', color: '#a3c47d', fontWeight: 'bold' }}>{fmt(val as number)}</p>
                        </div>
                      ))}
                      {/* Totales de unidades según tab activa */}
                      {tabActiva === 'acero' && piezasAcero.length > 0 && (
                        <>
                          <div style={{ borderLeft: '1px solid #444', paddingLeft: '20px' }}>
                            <p style={{ margin: 0, fontSize: '10px', color: '#aaa' }}>📏 Long. total acero</p>
                            <p style={{ margin: 0, fontSize: '14px', color: '#f0c060', fontWeight: 'bold' }}>{totalLongitudAcero.toLocaleString('es-BO')} cm</p>
                          </div>
                          <div>
                            <p style={{ margin: 0, fontSize: '10px', color: '#aaa' }}>🪣 Tubos (÷600)</p>
                            <p style={{ margin: 0, fontSize: '14px', color: '#f0c060', fontWeight: 'bold' }}>{totalTubos.toFixed(1)} {totalTubos === 1 ? 'tubo' : 'tubos'}</p>
                          </div>
                        </>
                      )}
                      {tabActiva === 'melamina' && piezasMelamina.length > 0 && (
                        <div style={{ borderLeft: '1px solid #444', paddingLeft: '20px' }}>
                          <p style={{ margin: 0, fontSize: '10px', color: '#aaa' }}>🪵 Total láminas melamina</p>
                          <p style={{ margin: 0, fontSize: '14px', color: '#f0c060', fontWeight: 'bold' }}>{totalMelaminas} unid.</p>
                        </div>
                      )}
                      {tabActiva === 'accesorios' && piezasAccesorios.length > 0 && (
                        <div style={{ borderLeft: '1px solid #444', paddingLeft: '20px' }}>
                          <p style={{ margin: 0, fontSize: '10px', color: '#aaa' }}>🔧 Total accesorios</p>
                          <p style={{ margin: 0, fontSize: '14px', color: '#f0c060', fontWeight: 'bold' }}>{totalAccesorios} unid.</p>
                        </div>
                      )}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ margin: '0 0 2px', fontSize: '10px', color: '#aaa' }}>Costo total / Margen mínimo / Margen tienda</p>
                      <p style={{ margin: 0, fontSize: '16px', color: 'white', fontWeight: 'bold' }}>
                        {fmt(varianteSel.costo_total)}
                        <span style={{ color: '#a3c47d', fontSize: '13px', marginLeft: '10px' }}>
                          {pct(varianteSel.costo_total, productoSel.precio_minimo)} / {pct(varianteSel.costo_total, productoSel.precio_tienda)}
                        </span>
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}