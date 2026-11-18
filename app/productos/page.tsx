'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { Loader2, Package, Image as ImageIcon, Search, Sparkles, FileText, Plus, Trash2, Edit3, BookOpen, Download, Images, Upload } from 'lucide-react'

type Producto = {
  codigo: string
  categoria: string | null
  nombre: string | null
  medidas: string | null
  precio_minimo: number | null
  precio_tienda: number | null
  foto_url: string | null
}

type FotoGaleria = {
  id: number
  codigo_producto: string
  foto_url: string
  orden: number
}

type Usuario = {
  carnet: string
  nombre: string
  rol: string
  estado: boolean
  cargos?: {
    puede_editar_productos?: boolean
  }
}

export default function CatalogoEditorialVendedores() {
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [productos, setProductos] = useState<Producto[]>([])
  const [busquedaGlobal, setBusquedaGlobal] = useState('')
  const [loading, setLoading] = useState(true)
  const [esAdmin, setEsAdmin] = useState(false)
  const [generandoPdfCat, setGenerandoPdfCat] = useState<string | null>(null)
  const [generandoPdfGeneral, setGenerandoPdfGeneral] = useState(false)
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState<string>('TODAS')

  // Modales de administración
  const [showEditModal, setShowEditModal] = useState(false)
  const [editando, setEditando] = useState<Producto | null>(null)
  const [editForm, setEditForm] = useState<Partial<Producto>>({})
  const [uploadingFoto, setUploadingFoto] = useState(false)
  const [saveLoading, setSaveLoading] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deletingCodigo, setDeletingCodigo] = useState<string | null>(null)

  const [showNuevoModal, setShowNuevoModal] = useState(false)
  const [nuevoForm, setNuevoForm] = useState<Partial<Producto>>({})
  const [nuevoLoading, setNuevoLoading] = useState(false)
  const [nuevoMsg, setNuevoMsg] = useState('')
  const [uploadingFotoNuevo, setUploadingFotoNuevo] = useState(false)
  const fileInputNuevoRef = useRef<HTMLInputElement>(null)
  const [letraCodigo, setLetraCodigo] = useState('')
  const [sugiriendoCodigo, setSugiriendoCodigo] = useState(false)

  // Modal Galería de Fotos
  const [showGaleriaModal, setShowGaleriaModal] = useState(false)
  const [productoGaleria, setProductoGaleria] = useState<Producto | null>(null)
  const [listaFotos, setListaFotos] = useState<FotoGaleria[]>([])
  const [fotoActivaUrl, setFotoActivaUrl] = useState<string | null>(null)
  const [subiendoGaleria, setSubiendoGaleria] = useState(false)
  const fileInputGaleriaRef = useRef<HTMLInputElement>(null)

  // Validación de sesión y permisos
  useEffect(() => {
    const carnetGuardado = localStorage.getItem('carnet')
    if (!carnetGuardado) {
      window.location.replace('/')
      return
    }
    supabase
      .from('personal')
      .select('*, cargos(*)')
      .eq('carnet', carnetGuardado)
      .eq('estado', true)
      .single()
      .then(({ data }) => {
        if (!data) { window.location.replace('/'); return }
        setUsuario(data)
        if (data.cargos?.puede_editar_productos === true) {
          setEsAdmin(true)
        }
        setLoading(false)
      })
  }, [])

  useEffect(() => {
    if (!loading) {
      cargarProductos()
    }
  }, [loading])

  const cargarProductos = async () => {
    const { data } = await supabase
      .from('productos')
      .select('*')
      .order('categoria', { ascending: true })
    setProductos(data || [])
  }

  const categoriasUnicas = Array.from(new Set(productos.map(p => p.categoria || 'SIN CATEGORÍA'))).sort()

  // --- ABRIR GALERÍA DE PRODUCTO ---
  const abrirGaleria = async (p: Producto) => {
    setProductoGaleria(p)
    setFotoActivaUrl(p.foto_url || null)
    setShowGaleriaModal(true)
    
    // Cargar fotos adicionales desde Supabase
    const { data } = await supabase
      .from('producto_galeria')
      .select('*')
      .eq('codigo_producto', p.codigo)
      .order('orden', { ascending: true })
    
    setListaFotos(data || [])
  }

  const subirFotoGaleria = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !productoGaleria) return
    setSubiendoGaleria(true)
    
    const ext = file.name.split('.').pop()
    const timestamp = Date.now()
    const path = `galeria_${productoGaleria.codigo}_${timestamp}.${ext}`

    const { error: uploadError } = await supabase.storage
      .from('producto-fotos')
      .upload(path, file, { upsert: true })

    if (!uploadError) {
      const { data: urlData } = supabase.storage
        .from('producto-fotos')
        .getPublicUrl(path)

      const nuevaUrl = urlData.publicUrl

      // Guardar en tabla producto_galeria
      const { data: insertedData } = await supabase
        .from('producto_galeria')
        .insert({
          codigo_producto: productoGaleria.codigo,
          foto_url: nuevaUrl,
          orden: listaFotos.length + 1
        })
        .select()

      if (insertedData) {
        setListaFotos(prev => [...prev, insertedData[0]])
        setFotoActivaUrl(nuevaUrl)
      }
    } else {
      alert('Error al subir la imagen')
    }
    setSubiendoGaleria(false)
  }

  const eliminarFotoGaleria = async (id: number, url: string) => {
    if (!confirm('¿Eliminar esta foto de la galería?')) return
    await supabase.from('producto_galeria').delete().eq('id', id)
    setListaFotos(prev => prev.filter(f => f.id !== id))
    if (fotoActivaUrl === url) {
      setFotoActivaUrl(productoGaleria?.foto_url || null)
    }
  }

  // --- CRUD PRODUCTOS ---
  const abrirEditar = (p: Producto) => {
    if (!esAdmin) return
    setEditando(p)
    setEditForm({ ...p })
    setSaveMsg('')
    setShowEditModal(true)
  }

  const handleFotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !editando) return
    setUploadingFoto(true)
    const ext = file.name.split('.').pop()
    const path = `${editando.codigo}.${ext}`
    const { error } = await supabase.storage.from('producto-fotos').upload(path, file, { upsert: true })
    if (!error) {
      const { data: urlData } = supabase.storage.from('producto-fotos').getPublicUrl(path)
      setEditForm(prev => ({ ...prev, foto_url: urlData.publicUrl }))
    }
    setUploadingFoto(false)
  }

  const guardarEdicion = async () => {
    if (!editando) return
    setSaveLoading(true)
    const categoriaMayus = editForm.categoria?.trim() ? editForm.categoria.trim().toUpperCase() : null

    const { error } = await supabase.from('productos').update({
      categoria: categoriaMayus,
      nombre: editForm.nombre,
      medidas: editForm.medidas,
      precio_minimo: editForm.precio_minimo,
      precio_tienda: editForm.precio_tienda,
      foto_url: editForm.foto_url,
    }).eq('codigo', editando.codigo)

    setSaveLoading(false)
    if (!error) {
      setSaveMsg('✓ Actualizado con éxito')
      cargarProductos()
      setTimeout(() => { setShowEditModal(false); setSaveMsg('') }, 1200)
    } else {
      setSaveMsg('Error al actualizar')
    }
  }

  const abrirEliminar = (codigo: string) => {
    if (!esAdmin) return
    setDeletingCodigo(codigo)
    setShowDeleteModal(true)
  }

  const confirmarEliminar = async () => {
    if (!deletingCodigo) return
    await supabase.from('productos').delete().eq('codigo', deletingCodigo)
    setShowDeleteModal(false)
    setDeletingCodigo(null)
    cargarProductos()
  }

  const abrirNuevo = () => {
    if (!esAdmin) return
    setNuevoForm({})
    setNuevoMsg('')
    setLetraCodigo('')
    setShowNuevoModal(true)
  }

  const handleFotoNuevoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const codigo = nuevoForm.codigo?.trim()
    if (!codigo) { setNuevoMsg('Indica el código primero'); return }
    setUploadingFotoNuevo(true)
    const ext = file.name.split('.').pop()
    const path = `${codigo}.${ext}`
    const { error } = await supabase.storage.from('producto-fotos').upload(path, file, { upsert: true })
    if (!error) {
      const { data: urlData } = supabase.storage.from('producto-fotos').getPublicUrl(path)
      setNuevoForm(prev => ({ ...prev, foto_url: urlData.publicUrl }))
    }
    setUploadingFotoNuevo(false)
  }

  useEffect(() => {
    if (!letraCodigo && nuevoForm.categoria?.trim()) {
      setLetraCodigo(nuevoForm.categoria.trim().charAt(0).toUpperCase())
    }
  }, [nuevoForm.categoria])

  const sugerirCodigo = async () => {
    const letra = (letraCodigo || nuevoForm.categoria?.charAt(0) || '').toUpperCase().slice(0, 1)
    if (!letra) { setNuevoMsg('Escribe una categoría primero'); return }
    setSugiriendoCodigo(true)
    const { data } = await supabase.rpc('siguiente_codigo_producto', { p_letra: letra })
    setSugiriendoCodigo(false)
    if (data) setNuevoForm(prev => ({ ...prev, codigo: data }))
  }

  const guardarNuevo = async () => {
    if (!nuevoForm.codigo?.trim() || !nuevoForm.nombre?.trim()) {
      setNuevoMsg('Código y nombre obligatorios')
      return
    }
    setNuevoLoading(true)
    const categoriaMayus = nuevoForm.categoria?.trim() ? nuevoForm.categoria.trim().toUpperCase() : null

    const { error } = await supabase.from('productos').insert({
      codigo: nuevoForm.codigo.trim(),
      categoria: categoriaMayus,
      nombre: nuevoForm.nombre.trim(),
      medidas: nuevoForm.medidas || null,
      precio_minimo: nuevoForm.precio_minimo ?? null,
      precio_tienda: nuevoForm.precio_tienda ?? null,
      foto_url: nuevoForm.foto_url || null,
    })
    setNuevoLoading(false)
    if (!error) {
      setNuevoMsg('✓ Creado correctamente')
      cargarProductos()
      setTimeout(() => { setShowNuevoModal(false); setNuevoMsg('') }, 1200)
    } else {
      setNuevoMsg('Error al guardar (código duplicado)')
    }
  }

  // --- HELPERS PDF ---
  const cargarImagenCuadrada = async (url: string): Promise<string | null> => {
    try {
      const resp = await fetch(url)
      const blob = await resp.blob()
      const objUrl = URL.createObjectURL(blob)
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const i = new window.Image()
        i.onload = () => resolve(i)
        i.onerror = reject
        i.src = objUrl
      })
      const lado = 400
      const canvas = document.createElement('canvas')
      canvas.width = lado; canvas.height = lado
      const ctx = canvas.getContext('2d')
      if (!ctx) { URL.revokeObjectURL(objUrl); return null }
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, lado, lado)
      const corte = Math.min(img.width, img.height)
      const sx = (img.width - corte) / 2
      const sy = (img.height - corte) / 2
      ctx.drawImage(img, sx, sy, corte, corte, 0, 0, lado, lado)
      URL.revokeObjectURL(objUrl)
      return canvas.toDataURL('image/jpeg', 0.85)
    } catch { return null }
  }

  const cargarAssetLocal = async (ruta: string): Promise<string | null> => {
    try {
      const resp = await fetch(ruta)
      if (!resp.ok) return null
      const blob = await resp.blob()
      return await new Promise<string | null>((resolve) => {
        const reader = new FileReader()
        reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : null)
        reader.readAsDataURL(blob)
      })
    } catch { return null }
  }

  const descargarPdfCategoria = async (categoria: string) => {
    const lista = productos.filter(p => (p.categoria || 'SIN CATEGORÍA') === categoria)
    if (lista.length === 0) return

    setGenerandoPdfCat(categoria)
    try {
      const { jsPDF } = await import('jspdf')
      const [logoBase64, mascotaBase64] = await Promise.all([
        cargarAssetLocal('/logo.jpg'),
        cargarAssetLocal('/mascota.jpg'),
      ])

      const imagenes: (string | null)[] = []
      for (let i = 0; i < lista.length; i += 6) {
        const lote = await Promise.all(
          lista.slice(i, i + 6).map(m => (m.foto_url ? cargarImagenCuadrada(m.foto_url) : Promise.resolve(null)))
        )
        imagenes.push(...lote)
      }

      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const W = 210, H = 297, M = 12, COLS = 3, GAP = 6
      const cellW = (W - 2 * M - GAP * (COLS - 1)) / COLS
      const cellH = cellW + 26
      const headerH = 28
      const yInicio = headerH + 10
      const fecha = new Date().toLocaleDateString('es-BO')

      const encabezado = () => {
        doc.setFillColor(14, 19, 38)
        doc.rect(0, 0, W, headerH, 'F')
        doc.setFillColor(212, 175, 55)
        doc.rect(0, headerH, W, 1.5, 'F')

        let textoX = M
        if (logoBase64) {
          try { doc.addImage(logoBase64, 'JPEG', M, 3, 22, 22); textoX = M + 25 } catch {}
        }

        doc.setFont('helvetica', 'bold')
        doc.setFontSize(13)
        doc.setTextColor(212, 175, 55)
        doc.text(`Capítulo: ${categoria}`, textoX, 11)

        doc.setFont('helvetica', 'bold')
        doc.setFontSize(8.5)
        doc.setTextColor(255, 255, 255)
        doc.text('Muebless is Better · Uso Exclusivo Vendedores', textoX, 16.5)

        doc.setFont('helvetica', 'normal')
        doc.setFontSize(7.5)
        doc.setTextColor(180, 190, 210)
        doc.text('Tarifario y Especificaciones 2026', textoX, 21)

        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)
        doc.setTextColor(255, 255, 255)
        doc.text(`${lista.length} modelos | ${fecha}`, W - M, 14, { align: 'right' })
      }

      encabezado()
      let y = yInicio
      let col = 0

      lista.forEach((prod, idx) => {
        if (col === 0 && y + cellH > H - 24) {
          doc.addPage()
          encabezado()
          y = yInicio
        }
        const x = M + col * (cellW + GAP)
        const img = imagenes[idx]

        if (img) {
          doc.addImage(img, 'JPEG', x, y, cellW, cellW)
        } else {
          doc.setFillColor(240, 242, 245)
          doc.rect(x, y, cellW, cellW, 'F')
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(8)
          doc.setTextColor(150, 150, 150)
          doc.text('Sin imagen', x + cellW / 2, y + cellW / 2, { align: 'center' })
        }
        doc.setDrawColor(210, 215, 220)
        doc.rect(x, y, cellW, cellW)

        doc.setFont('helvetica', 'bold')
        doc.setFontSize(8.5)
        doc.setTextColor(14, 19, 38)
        doc.text(String(prod.codigo || ''), x, y + cellW + 4.5)

        doc.setFont('helvetica', 'bold')
        doc.setFontSize(7.5)
        doc.setTextColor(40, 50, 70)
        const nom = (doc.splitTextToSize(prod.nombre || 'Modelo', cellW) as string[]).slice(0, 1)
        doc.text(nom, x, y + cellW + 8.5)

        doc.setFont('helvetica', 'normal')
        doc.setFontSize(7)
        doc.setTextColor(100, 110, 130)
        const pMin = prod.precio_minimo != null ? `Min: Bs.${prod.precio_minimo.toLocaleString()}` : 'Min: —'
        const pTda = prod.precio_tienda != null ? `Tda: Bs.${prod.precio_tienda.toLocaleString()}` : 'Tda: —'
        doc.text(`${pMin} | ${pTda}`, x, y + cellW + 12.5)

        col++
        if (col === COLS) { col = 0; y += cellH + GAP }
      })

      const paginas = doc.getNumberOfPages()
      for (let p = 1; p <= paginas; p++) {
        doc.setPage(p)
        if (mascotaBase64) {
          try { doc.addImage(mascotaBase64, 'JPEG', W - M - 16, H - 22, 16, 16) } catch {}
        }
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(7.5)
        doc.setTextColor(140, 150, 170)
        doc.text(`Página ${p} de ${paginas}`, W / 2, H - 7, { align: 'center' })
      }

      doc.save(`Catalogo_${categoria.replace(/[^a-zA-Z0-9]+/g, '_')}.pdf`)
    } catch (e) {
      console.error(e)
      alert('Error al exportar PDF')
    } finally {
      setGenerandoPdfCat(null)
    }
  }

  const descargarPdfGeneral = async () => {
    if (productos.length === 0) return
    setGenerandoPdfGeneral(true)
    try {
      const { jsPDF } = await import('jspdf')
      const [logoBase64, mascotaBase64] = await Promise.all([
        cargarAssetLocal('/logo.jpg'),
        cargarAssetLocal('/mascota.jpg'),
      ])

      const imagenes: (string | null)[] = []
      for (let i = 0; i < productos.length; i += 6) {
        const lote = await Promise.all(
          productos.slice(i, i + 6).map(m => (m.foto_url ? cargarImagenCuadrada(m.foto_url) : Promise.resolve(null)))
        )
        imagenes.push(...lote)
      }

      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const W = 210, H = 297, M = 12, COLS = 3, GAP = 6
      const cellW = (W - 2 * M - GAP * (COLS - 1)) / COLS
      const cellH = cellW + 26
      const headerH = 28
      const yInicio = headerH + 10
      const fecha = new Date().toLocaleDateString('es-BO')

      const encabezadoGeneral = (sub: string) => {
        doc.setFillColor(14, 19, 38)
        doc.rect(0, 0, W, headerH, 'F')
        doc.setFillColor(212, 175, 55)
        doc.rect(0, headerH, W, 1.5, 'F')

        let textoX = M
        if (logoBase64) {
          try { doc.addImage(logoBase64, 'JPEG', M, 3, 22, 22); textoX = M + 25 } catch {}
        }

        doc.setFont('helvetica', 'bold')
        doc.setFontSize(13)
        doc.setTextColor(212, 175, 55)
        doc.text(sub, textoX, 11)

        doc.setFont('helvetica', 'bold')
        doc.setFontSize(8.5)
        doc.setTextColor(255, 255, 255)
        doc.text('Muebless is Better · Dossier General de Vendedores', textoX, 16.5)

        doc.setFont('helvetica', 'normal')
        doc.setFontSize(7.5)
        doc.setTextColor(180, 190, 210)
        doc.text(`Total Modelos: ${productos.length} | ${fecha}`, W - M, 14, { align: 'right' })
      }

      encabezadoGeneral('Catálogo Maestro General')
      let y = yInicio
      let col = 0

      productos.forEach((prod, idx) => {
        if (col === 0 && y + cellH > H - 24) {
          doc.addPage()
          encabezadoGeneral('Catálogo Maestro General (Cont.)')
          y = yInicio
        }
        const x = M + col * (cellW + GAP)
        const img = imagenes[idx]

        if (img) {
          doc.addImage(img, 'JPEG', x, y, cellW, cellW)
        } else {
          doc.setFillColor(240, 242, 245)
          doc.rect(x, y, cellW, cellW, 'F')
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(8)
          doc.setTextColor(150, 150, 150)
          doc.text('Sin imagen', x + cellW / 2, y + cellW / 2, { align: 'center' })
        }
        doc.setDrawColor(210, 215, 220)
        doc.rect(x, y, cellW, cellW)

        doc.setFont('helvetica', 'bold')
        doc.setFontSize(8.5)
        doc.setTextColor(14, 19, 38)
        doc.text(String(prod.codigo || ''), x, y + cellW + 4.5)

        doc.setFont('helvetica', 'bold')
        doc.setFontSize(7.5)
        doc.setTextColor(40, 50, 70)
        const nom = (doc.splitTextToSize(prod.nombre || 'Modelo', cellW) as string[]).slice(0, 1)
        doc.text(nom, x, y + cellW + 8.5)

        doc.setFont('helvetica', 'normal')
        doc.setFontSize(7)
        doc.setTextColor(100, 110, 130)
        const pMin = prod.precio_minimo != null ? `Min: Bs.${prod.precio_minimo.toLocaleString()}` : 'Min: —'
        const pTda = prod.precio_tienda != null ? `Tda: Bs.${prod.precio_tienda.toLocaleString()}` : 'Tda: —'
        doc.text(`${pMin} | ${pTda}`, x, y + cellW + 12.5)

        col++
        if (col === COLS) { col = 0; y += cellH + GAP }
      })

      const paginas = doc.getNumberOfPages()
      for (let p = 1; p <= paginas; p++) {
        doc.setPage(p)
        if (mascotaBase64) {
          try { doc.addImage(mascotaBase64, 'JPEG', W - M - 16, H - 22, 16, 16) } catch {}
        }
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(7.5)
        doc.setTextColor(140, 150, 170)
        doc.text(`Página ${p} de ${paginas}`, W / 2, H - 7, { align: 'center' })
      }

      doc.save('Catalogo_General_Completo_Vendedores.pdf')
    } catch (e) {
      console.error(e)
      alert('Error al generar el catálogo general')
    } finally {
      setGenerandoPdfGeneral(false)
    }
  }

  const fmt = (n: number | null) => n != null ? `Bs. ${n.toLocaleString()}` : '—'

  if (loading || !usuario) return (
    <div className="flex h-screen items-center justify-center bg-[#070b14]">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="animate-spin text-[#D4AF37]" size={42} />
        <p className="text-[#D4AF37] font-bold text-xs uppercase tracking-widest">Cargando Módulo Interno de Vendedores...</p>
      </div>
    </div>
  )

  const categoriasFiltradas = categoriasUnicas.filter(cat => {
    if (categoriaSeleccionada !== 'TODAS' && cat !== categoriaSeleccionada) return false
    return true
  })

  return (
    <div className="min-h-screen bg-[#070b14] text-white" style={{ fontFamily: 'Arial, sans-serif' }}>
      
      {/* ── NAVBAR ── */}
      <nav className="flex justify-between items-center px-6 md:px-12 py-4 bg-[#0a0f1d] sticky top-0 z-50 border-b border-[#D4AF37]/30 shadow-2xl">
        <div className="flex items-center gap-3">
          <img src="/logo.jpg" alt="Logo" className="w-9 h-9 rounded-lg border border-[#D4AF37]/50 object-cover" />
          <div>
            <span className="font-bold text-base text-white block">Muebless is Better</span>
            <span className="text-[9px] text-[#D4AF37] tracking-widest uppercase font-bold">Panel Interno · Solo Vendedores</span>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {esAdmin && (
            <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 px-3 py-1 rounded-full text-[10px] font-bold">
              Modo Edición Activo
            </span>
          )}
          <a href="/sistema" className="text-gray-300 hover:text-[#D4AF37] text-xs font-bold transition">
            ← Volver al Sistema
          </a>
        </div>
      </nav>

      {/* ── PORTADA / CABECERA ── */}
      <header className="relative bg-gradient-to-b from-[#0a0f1d] to-[#0e1628] border-b border-[#D4AF37]/20 py-14 px-6 text-center">
        <div className="max-w-4xl mx-auto space-y-4">
          <div className="inline-flex items-center gap-2 bg-[#D4AF37]/10 border border-[#D4AF37]/30 text-[#D4AF37] px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest">
            <Sparkles size={13} /> Tarifario Interno 2026
          </div>
          <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight text-white">
            Catálogo Comercial de <span className="text-[#D4AF37]">Vendedores</span>
          </h1>
          <p className="text-gray-300 text-sm max-w-lg mx-auto font-light leading-relaxed">
            Haz clic en la foto de cualquier producto para abrir su <strong>galería fotográfica detallada</strong>.
          </p>

          <div className="pt-2 flex justify-center">
            <button
              onClick={descargarPdfGeneral}
              disabled={generandoPdfGeneral}
              className="bg-[#D4AF37] text-[#070b14] font-extrabold text-xs md:text-sm px-6 py-3.5 rounded-2xl shadow-xl hover:bg-opacity-90 transition flex items-center gap-2.5 disabled:opacity-60"
            >
              {generandoPdfGeneral ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
              {generandoPdfGeneral ? 'Generando Catálogo General...' : '📥 Descargar Catálogo General Completo (PDF)'}
            </button>
          </div>

          <div className="max-w-xl mx-auto pt-4 flex gap-2">
            <div className="relative w-full">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400">
                <Search size={16} />
              </div>
              <input 
                type="text" 
                placeholder="Buscar por código, nombre o categoría..." 
                value={busquedaGlobal}
                onChange={(e) => setBusquedaGlobal(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-[#131b31] border border-[#D4AF37]/30 rounded-xl text-xs text-white placeholder-gray-400 focus:outline-none focus:border-[#D4AF37]"
              />
            </div>
            {esAdmin && (
              <button 
                onClick={abrirNuevo}
                className="bg-[#D4AF37] text-[#070b14] px-5 py-3 rounded-xl font-bold text-xs hover:bg-opacity-90 transition shrink-0 flex items-center gap-1.5"
              >
                <Plus size={15} /> Nuevo
              </button>
            )}
          </div>

          <div className="flex flex-wrap justify-center gap-2 pt-4">
            <button
              onClick={() => setCategoriaSeleccionada('TODAS')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition ${categoriaSeleccionada === 'TODAS' ? 'bg-[#D4AF37] text-[#070b14]' : 'bg-white/5 text-gray-300 hover:bg-white/10 border border-white/10'}`}
            >
              📚 Todas ({productos.length})
            </button>
            {categoriasUnicas.map(cat => (
              <button
                key={cat}
                onClick={() => setCategoriaSeleccionada(cat)}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition ${categoriaSeleccionada === cat ? 'bg-[#D4AF37] text-[#070b14]' : 'bg-white/5 text-gray-300 hover:bg-white/10 border border-white/10'}`}
              >
                {cat} ({productos.filter(p => (p.categoria || 'SIN CATEGORÍA') === cat).length})
              </button>
            ))}
          </div>

        </div>
      </header>

      {/* ── CUERPO DE CAPÍTULOS ── */}
      <main className="max-w-7xl mx-auto px-4 md:px-8 py-12 space-y-16">
        
        {categoriasFiltradas.map(cat => {
          const prodsCat = productos.filter(p => {
            const coincideCat = (p.categoria || 'SIN CATEGORÍA') === cat
            if (!busquedaGlobal.trim()) return coincideCat
            const q = busquedaGlobal.toLowerCase()
            return coincideCat && [p.codigo, p.nombre, p.categoria, p.medidas].join(' ').toLowerCase().includes(q)
          })

          if (prodsCat.length === 0) return null

          return (
            <section key={cat} className="space-y-6">
              
              <div className="bg-gradient-to-r from-[#0e1628] to-[#131b31] border-l-4 border-[#D4AF37] p-6 md:p-8 rounded-2xl shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                  <div className="flex items-center gap-2 text-[#D4AF37] text-[10px] font-bold uppercase tracking-widest mb-1">
                    <BookOpen size={13} /> Capítulo de Colección
                  </div>
                  <h2 className="text-2xl md:text-3xl font-extrabold text-white uppercase">
                    {cat}
                  </h2>
                  <p className="text-gray-400 text-xs mt-1">
                    Exhibición de mobiliario certificado fabricado en acero y melamina.
                  </p>
                </div>

                <button
                  onClick={() => descargarPdfCategoria(cat)}
                  disabled={generandoPdfCat === cat}
                  className="bg-[#D4AF37] text-[#070b14] font-bold text-xs px-5 py-2.5 rounded-xl shadow-md hover:bg-opacity-90 transition flex items-center gap-2 disabled:opacity-60"
                >
                  {generandoPdfCat === cat ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
                  {generandoPdfCat === cat ? 'Generando PDF...' : `Descargar PDF de ${cat}`}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {prodsCat.map(p => (
                  <div 
                    key={p.codigo}
                    className="group bg-[#0e1628] border border-white/10 hover:border-[#D4AF37]/50 rounded-2xl overflow-hidden shadow-lg transition-all duration-300 flex flex-col justify-between"
                  >
                    <div>
                      {/* FOTO CON CLIC PARA ABRIR GALERÍA */}
                      <div 
                        onClick={() => abrirGaleria(p)}
                        className="w-full h-64 bg-[#070b14] relative overflow-hidden cursor-pointer group/img"
                        title="Haz clic para ver galería de fotos"
                      >
                        {p.foto_url ? (
                          <img 
                            src={p.foto_url} 
                            alt={p.nombre || ''} 
                            className="w-full h-full object-cover group-hover/img:scale-105 transition duration-500" 
                          />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center text-gray-600">
                            <ImageIcon size={36} />
                            <span className="text-[10px] mt-1 text-gray-500">Sin fotografía</span>
                          </div>
                        )}
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition flex items-center justify-center gap-2 text-white font-bold text-xs backdrop-blur-xs">
                          <Images size={20} className="text-[#D4AF37]" /> Ver Galería de Fotos
                        </div>
                        <span className="absolute top-3 left-3 text-[10px] font-mono font-bold bg-[#070b14]/90 text-[#D4AF37] px-2.5 py-1 rounded-lg border border-[#D4AF37]/30 shadow-md uppercase">
                          {p.codigo}
                        </span>
                      </div>

                      <div className="p-5 space-y-2">
                        <span className="text-[9px] font-bold uppercase tracking-wider text-[#D4AF37] block">
                          Estructura de Acero y Melamina
                        </span>
                        <h3 className="text-sm font-bold text-white leading-snug">
                          {p.nombre || 'Modelo sin nombre'}
                        </h3>
                        {p.medidas && (
                          <p className="text-[11px] text-gray-400 font-mono">
                            📐 {p.medidas}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="p-5 pt-0">
                      <div className="bg-[#070b14] p-3 rounded-xl border border-white/5 space-y-2 mb-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-gray-400 uppercase font-bold">Precio Mínimo:</span>
                          <span className="text-xs font-bold text-gray-200">{fmt(p.precio_minimo)}</span>
                        </div>
                        <div className="flex items-center justify-between border-t border-white/5 pt-1.5">
                          <span className="text-[10px] text-[#D4AF37] uppercase font-bold">Precio Tienda:</span>
                          <span className="text-sm font-extrabold text-[#D4AF37]">{fmt(p.precio_tienda)}</span>
                        </div>
                      </div>

                      {esAdmin && (
                        <div className="flex gap-2">
                          <button 
                            onClick={() => abrirEditar(p)}
                            className="flex-1 bg-white/5 hover:bg-[#D4AF37] hover:text-[#070b14] text-gray-300 font-bold text-[11px] py-2 rounded-xl transition flex items-center justify-center gap-1 border border-white/10"
                          >
                            <Edit3 size={13} /> Editar
                          </button>
                          <button 
                            onClick={() => abrirEliminar(p.codigo)}
                            className="flex-1 bg-red-500/10 hover:bg-red-600 text-red-400 hover:text-white font-bold text-[11px] py-2 rounded-xl transition flex items-center justify-center gap-1 border border-red-500/20"
                          >
                            <Trash2 size={13} /> Eliminar
                          </button>
                        </div>
                      )}
                    </div>

                  </div>
                ))}
              </div>

            </section>
          )
        })}

      </main>

      {/* ── MODAL: GALERÍA DE FOTOS POR PRODUCTO ── */}
      {showGaleriaModal && productoGaleria && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowGaleriaModal(false)}>
          <div className="bg-[#0e1628] border border-[#D4AF37]/40 rounded-3xl p-6 md:p-8 w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-2xl text-white" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4 border-b border-white/10 pb-4">
              <div>
                <span className="text-[10px] font-mono font-bold text-[#D4AF37] uppercase bg-[#D4AF37]/10 px-2 py-1 rounded-md border border-[#D4AF37]/30">
                  {productoGaleria.codigo}
                </span>
                <h3 className="text-lg font-extrabold text-white mt-1">{productoGaleria.nombre}</h3>
              </div>
              <button onClick={() => setShowGaleriaModal(false)} className="text-gray-400 hover:text-white font-bold text-xl px-2">✕</button>
            </div>

            {/* FOTO PRINCIPAL AMPLIADA */}
            <div className="w-full h-80 bg-[#070b14] rounded-2xl overflow-hidden border border-white/10 relative mb-4">
              {fotoActivaUrl ? (
                <img src={fotoActivaUrl} alt="" className="w-full h-full object-contain" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-500">Sin imagen seleccionada</div>
              )}
            </div>

            {/* BOTÓN PARA SUBIR NUEVA FOTO A LA GALERÍA */}
            <div className="flex justify-between items-center mb-4">
              <span className="text-xs font-bold text-gray-300 uppercase">Colección de Fotografías ({listaFotos.length + (productoGaleria.foto_url ? 1 : 0)})</span>
              {esAdmin && (
                <div>
                  <button
                    onClick={() => fileInputGaleriaRef.current?.click()}
                    disabled={subiendoGaleria}
                    className="bg-[#D4AF37] text-[#070b14] px-4 py-2 rounded-xl font-bold text-xs hover:bg-opacity-90 transition flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {subiendoGaleria ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                    {subiendoGaleria ? 'Subiendo...' : 'Agregar Foto a la Galería'}
                  </button>
                  <input ref={fileInputGaleriaRef} type="file" accept="image/*" className="hidden" onChange={subirFotoGaleria} />
                </div>
              )}
            </div>

            {/* TIRA DE MINIATURAS DE LA GALERÍA */}
            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
              {/* Foto Principal Original */}
              {productoGaleria.foto_url && (
                <div 
                  onClick={() => setFotoActivaUrl(productoGaleria.foto_url)}
                  className={`w-20 h-20 rounded-xl overflow-hidden border-2 cursor-pointer shrink-0 relative ${fotoActivaUrl === productoGaleria.foto_url ? 'border-[#D4AF37]' : 'border-white/20 opacity-70'}`}
                >
                  <img src={productoGaleria.foto_url} alt="" className="w-full h-full object-cover" />
                  <span className="absolute bottom-0 inset-x-0 bg-black/70 text-[8px] text-center text-white font-bold py-0.5">Principal</span>
                </div>
              )}

              {/* Fotos Adicionales */}
              {listaFotos.map(foto => (
                <div 
                  key={foto.id}
                  onClick={() => setFotoActivaUrl(foto.foto_url)}
                  className={`w-20 h-20 rounded-xl overflow-hidden border-2 cursor-pointer shrink-0 relative group/thumb ${fotoActivaUrl === foto.foto_url ? 'border-[#D4AF37]' : 'border-white/20 opacity-70'}`}
                >
                  <img src={foto.foto_url} alt="" className="w-full h-full object-cover" />
                  {esAdmin && (
                    <button
                      onClick={(e) => { e.stopPropagation(); eliminarFotoGaleria(foto.id, foto.foto_url); }}
                      className="absolute top-1 right-1 bg-red-600 text-white rounded-md p-1 opacity-0 group-hover/thumb:opacity-100 transition shadow-md"
                      title="Eliminar foto"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              ))}
            </div>

          </div>
        </div>
      )}

      {/* ── MODAL: EDITAR PRODUCTO ── */}
      {showEditModal && editando && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center z-50 p-4" onClick={() => setShowEditModal(false)}>
          <div className="bg-[#0e1628] border border-[#D4AF37]/30 rounded-2xl p-6 w-full max-w-md shadow-2xl text-white" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold text-[#D4AF37] mb-4">Editar Producto ({editando.codigo})</h3>
            
            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-gray-400 font-bold uppercase mb-1">Fotografía Principal</label>
                <div className="flex items-center gap-3">
                  {editForm.foto_url ? <img src={editForm.foto_url} alt="" className="w-12 h-12 object-cover rounded-lg" /> : <div className="w-12 h-12 bg-black rounded-lg"></div>}
                  <button onClick={() => fileInputRef.current?.click()} className="bg-[#D4AF37] text-[#070b14] px-3 py-1.5 rounded-lg font-bold">Cambiar foto</button>
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFotoUpload} />
                </div>
              </div>

              <div>
                <label className="block text-gray-400 font-bold uppercase mb-1">Categoría (En MAYÚSCULAS)</label>
                <input type="text" value={editForm.categoria || ''} onChange={e => setEditForm(prev => ({ ...prev, categoria: e.target.value.toUpperCase() }))} className="w-full px-3 py-2 bg-[#070b14] border border-white/20 rounded-lg text-white uppercase" />
              </div>

              <div>
                <label className="block text-gray-400 font-bold uppercase mb-1">Nombre</label>
                <input type="text" value={editForm.nombre || ''} onChange={e => setEditForm(prev => ({ ...prev, nombre: e.target.value }))} className="w-full px-3 py-2 bg-[#070b14] border border-white/20 rounded-lg text-white" />
              </div>

              <div>
                <label className="block text-gray-400 font-bold uppercase mb-1">Medidas</label>
                <input type="text" value={editForm.medidas || ''} onChange={e => setEditForm(prev => ({ ...prev, medidas: e.target.value }))} className="w-full px-3 py-2 bg-[#070b14] border border-white/20 rounded-lg text-white" />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-gray-400 font-bold uppercase mb-1">Precio Mínimo</label>
                  <input type="number" value={editForm.precio_minimo ?? ''} onChange={e => setEditForm(prev => ({ ...prev, precio_minimo: e.target.value ? Number(e.target.value) : null }))} className="w-full px-3 py-2 bg-[#070b14] border border-white/20 rounded-lg text-white" />
                </div>
                <div>
                  <label className="block text-gray-400 font-bold uppercase mb-1">Precio Tienda</label>
                  <input type="number" value={editForm.precio_tienda ?? ''} onChange={e => setEditForm(prev => ({ ...prev, precio_tienda: e.target.value ? Number(e.target.value) : null }))} className="w-full px-3 py-2 bg-[#070b14] border border-white/20 rounded-lg text-white" />
                </div>
              </div>

              {saveMsg && <p className="text-center font-bold text-emerald-400">{saveMsg}</p>}

              <div className="flex gap-2 pt-3">
                <button onClick={() => setShowEditModal(false)} className="flex-1 bg-white/10 py-2.5 rounded-lg font-bold">Cancelar</button>
                <button onClick={guardarEdicion} disabled={saveLoading} className="flex-1 bg-[#D4AF37] text-[#070b14] py-2.5 rounded-lg font-bold">Guardar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: NUEVO PRODUCTO ── */}
      {showNuevoModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center z-50 p-4" onClick={() => setShowNuevoModal(false)}>
          <div className="bg-[#0e1628] border border-[#D4AF37]/30 rounded-2xl p-6 w-full max-w-md shadow-2xl text-white" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold text-[#D4AF37] mb-4">Nuevo Producto al Catálogo</h3>
            
            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-gray-400 font-bold uppercase mb-1">Categoría (En MAYÚSCULAS)</label>
                <input type="text" placeholder="Ej: ESCRITORIOS" value={nuevoForm.categoria || ''} onChange={e => setNuevoForm(prev => ({ ...prev, categoria: e.target.value.toUpperCase() }))} className="w-full px-3 py-2 bg-[#070b14] border border-white/20 rounded-lg text-white uppercase" />
              </div>

              <div>
                <label className="block text-gray-400 font-bold uppercase mb-1">Código *</label>
                <div className="flex gap-2">
                  <input type="text" maxLength={1} placeholder="E" value={letraCodigo} onChange={e => setLetraCodigo(e.target.value.toUpperCase())} className="w-14 text-center font-mono bg-[#070b14] border border-white/20 rounded-lg text-white uppercase" />
                  <input type="text" placeholder="MLB-E001" value={nuevoForm.codigo || ''} onChange={e => setNuevoForm(prev => ({ ...prev, codigo: e.target.value }))} className="flex-1 font-mono bg-[#070b14] border border-white/20 rounded-lg text-white px-3" />
                  <button type="button" onClick={sugerirCodigo} className="bg-[#D4AF37] text-[#070b14] px-3 py-2 rounded-lg font-bold">Sugerir</button>
                </div>
              </div>

              <div>
                <label className="block text-gray-400 font-bold uppercase mb-1">Fotografía Principal</label>
                <div className="flex items-center gap-3">
                  {nuevoForm.foto_url ? <img src={nuevoForm.foto_url} alt="" className="w-12 h-12 object-cover rounded-lg" /> : <div className="w-12 h-12 bg-black rounded-lg"></div>}
                  <button onClick={() => fileInputNuevoRef.current?.click()} className="bg-[#D4AF37] text-[#070b14] px-3 py-1.5 rounded-lg font-bold">Subir foto</button>
                  <input ref={fileInputNuevoRef} type="file" accept="image/*" className="hidden" onChange={handleFotoNuevoUpload} />
                </div>
              </div>

              <div>
                <label className="block text-gray-400 font-bold uppercase mb-1">Nombre *</label>
                <input type="text" value={nuevoForm.nombre || ''} onChange={e => setNuevoForm(prev => ({ ...prev, nombre: e.target.value }))} className="w-full px-3 py-2 bg-[#070b14] border border-white/20 rounded-lg text-white" />
              </div>

              <div>
                <label className="block text-gray-400 font-bold uppercase mb-1">Medidas</label>
                <input type="text" placeholder="120x60x75 cm" value={nuevoForm.medidas || ''} onChange={e => setNuevoForm(prev => ({ ...prev, medidas: e.target.value }))} className="w-full px-3 py-2 bg-[#070b14] border border-white/20 rounded-lg text-white" />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-gray-400 font-bold uppercase mb-1">Precio Mínimo</label>
                  <input type="number" value={nuevoForm.precio_minimo ?? ''} onChange={e => setNuevoForm(prev => ({ ...prev, precio_minimo: e.target.value ? Number(e.target.value) : null }))} className="w-full px-3 py-2 bg-[#070b14] border border-white/20 rounded-lg text-white" />
                </div>
                <div>
                  <label className="block text-gray-400 font-bold uppercase mb-1">Precio Tienda</label>
                  <input type="number" value={nuevoForm.precio_tienda ?? ''} onChange={e => setNuevoForm(prev => ({ ...prev, precio_tienda: e.target.value ? Number(e.target.value) : null }))} className="w-full px-3 py-2 bg-[#070b14] border border-white/20 rounded-lg text-white" />
                </div>
              </div>

              {nuevoMsg && <p className="text-center font-bold text-emerald-400">{nuevoMsg}</p>}

              <div className="flex gap-2 pt-3">
                <button onClick={() => setShowNuevoModal(false)} className="flex-1 bg-white/10 py-2.5 rounded-lg font-bold">Cancelar</button>
                <button onClick={guardarNuevo} disabled={nuevoLoading} className="flex-1 bg-[#D4AF37] text-[#070b14] py-2.5 rounded-lg font-bold">Crear</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: ELIMINAR ── */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center z-50 p-4" onClick={() => setShowDeleteModal(false)}>
          <div className="bg-[#0e1628] border border-red-500/30 rounded-2xl p-6 w-full max-w-sm text-center shadow-2xl text-white" onClick={e => e.stopPropagation()}>
            <p className="text-xl mb-2">⚠️</p>
            <h3 className="text-sm font-bold text-white mb-2">¿Eliminar producto?</h3>
            <p className="text-xs text-gray-400 mb-5 font-mono text-[#D4AF37]">{deletingCodigo}</p>
            <div className="flex gap-2">
              <button onClick={() => setShowDeleteModal(false)} className="flex-1 bg-white/10 py-2 rounded-xl text-xs font-bold">Cancelar</button>
              <button onClick={confirmarEliminar} className="flex-1 bg-red-600 py-2 rounded-xl text-xs font-bold">Eliminar</button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}