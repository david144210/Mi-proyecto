'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { Loader2, MapPin, Package, Image as ImageIcon, Search, Sparkles, Info, RotateCw, Download } from 'lucide-react'

interface Melamina {
  id: number
  codigo_melamina: string
  detalle: string | null
  proveedor: string | null
  precio_compra: number | null
  precio_cotizador: number | null
  foto_url: string | null
}

interface Proveedor {
  id: number
  nombre: string
  ciudad: string | null
}

export default function PaletasAutomaticas() {
  const [usuario, setUsuario] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  
  const [melaminas, setMelaminas] = useState<Melamina[]>([])
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [busquedaGlobal, setBusquedaGlobal] = useState('')
  
  const [tarjetasVolteadas, setTarjetasVolteadas] = useState<{ [key: number]: boolean }>({})

  const ciudadesGeograficas = ['Cochabamba', 'Santa Cruz', 'El Alto - La Paz']

  useEffect(() => {
    const carnet = localStorage.getItem('carnet')
    if (!carnet) { window.location.replace('/'); return }
    
    supabase.from('personal').select('*, cargos(*)')
      .eq('carnet', carnet).eq('estado', true).single()
      .then(({ data }) => {
        if (!data) { window.location.replace('/'); return }
        setUsuario(data)
        setLoading(false)
      })
  }, [])

  useEffect(() => {
    if (!loading) {
      fetchDatosAutomaticos()
    }
  }, [loading])

  const fetchDatosAutomaticos = async () => {
    const [resMelaminas, resProveedores] = await Promise.all([
      supabase.from('melaminas').select('*').order('codigo_melamina'),
      supabase.from('proveedores').select('id, nombre, ciudad')
    ])

    if (resMelaminas.data) setMelaminas(resMelaminas.data)
    if (resProveedores.data) setProveedores(resProveedores.data)
  }

  const toggleTarjeta = (id: number) => {
    setTarjetasVolteadas(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const descargarFoto = async (e: React.MouseEvent, url: string | null, detalle: string | null, codigo: string | null) => {
    e.stopPropagation()
    if (!url) return

    try {
      const response = await fetch(url)
      const blob = await response.blob()
      const blobUrl = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = blobUrl
      const nombreLimpio = (detalle || 'melamina').replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ\s-_]/g, '').trim()
      const codigoLimpio = (codigo || 'codigo').replace(/[^a-zA-Z0-9-_]/g, '').trim()
      link.download = `${nombreLimpio}_${codigoLimpio}.jpg`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(blobUrl)
    } catch {
      window.open(url, '_blank')
    }
  }

  const nombreMostrar = usuario?.usuario || usuario?.nombre || usuario?.carnet || 'Usuario'
  const puedeVerPrivado = usuario?.cargos?.es_admin || usuario?.cargos?.puede_ver_compras

  if (loading) return (
    <div className="flex h-screen items-center justify-center bg-[#f4f6f9]">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="animate-spin text-[#D4AF37]" size={48} />
        <p className="text-[#001f3f] font-bold text-sm tracking-wide">Cargando catálogo digital...</p>
      </div>
    </div>
  )

  const totalMateriales = melaminas.length

  return (
    <div className="min-h-screen bg-[#f4f6f9]" style={{ fontFamily: 'Arial, sans-serif' }}>
      
      <nav className="flex justify-between items-center px-6 md:px-10 py-4 bg-[#001f3f] text-white sticky top-0 z-50 shadow-md border-b border-[#D4AF37]/30">
        <div className="flex items-center gap-4">
          <a href="/sistema" className="font-bold text-xl text-white tracking-wide flex items-center gap-2">
            <span>Muebless is Better</span>
          </a>
          <span className="hidden md:inline text-[#D4AF37] font-semibold text-sm">| 🎨 Catálogo Digital de Melaminas</span>
        </div>
        <div className="flex items-center gap-3 bg-white/10 px-4 py-1.5 rounded-full border border-[#D4AF37]/20">
          <span className="text-[#D4AF37] font-bold text-xs">👤 {nombreMostrar}</span>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto p-4 md:p-8">
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 bg-white p-6 rounded-3xl shadow-xs border border-gray-100">
          <div>
            <div className="flex items-center gap-2 text-[#D4AF37] font-bold text-xs uppercase tracking-wider mb-1">
              <Sparkles size={14} /> Exhibición Interactiva
            </div>
            <h1 className="text-2xl font-bold text-[#001f3f]">Catálogo Visual por Sucursal</h1>
            <p className="text-xs text-gray-500 mt-0.5">Toca cualquier muestra para ver detalles o descargar su imagen.</p>
          </div>
          
          <div className="flex items-center gap-4 bg-[#f4f6f9] px-5 py-3 rounded-2xl border border-gray-200">
            <div className="text-center px-3 border-r border-gray-300">
              <span className="block text-xs text-gray-400 font-bold uppercase">Sucursales</span>
              <span className="text-lg font-bold text-[#001f3f]">3</span>
            </div>
            <div className="text-center px-3">
              <span className="block text-xs text-gray-400 font-bold uppercase">Muestras</span>
              <span className="text-lg font-bold text-[#D4AF37]">{totalMateriales}</span>
            </div>
          </div>
        </div>

        <div className="relative mb-8">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400">
            <Search size={18} />
          </div>
          <input 
            type="text" 
            placeholder="Buscar material por código, detalle o nombre en todo el catálogo..." 
            value={busquedaGlobal}
            onChange={(e) => setBusquedaGlobal(e.target.value)}
            className="w-full pl-11 pr-4 py-3.5 bg-white border border-gray-200 rounded-2xl text-xs md:text-sm text-gray-800 shadow-xs focus:outline-none focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20 transition"
          />
          {busquedaGlobal && (
            <button onClick={() => setBusquedaGlobal('')} className="absolute inset-y-0 right-0 pr-4 flex items-center text-xs text-gray-400 hover:text-gray-600 font-bold">
              Limpiar ✕
            </button>
          )}
        </div>

        <div className="space-y-10">
          {ciudadesGeograficas.map((ciudad) => {
            const proveedoresDeCiudad = proveedores
              .filter(p => p.ciudad?.toLowerCase().trim() === ciudad.toLowerCase().trim())
              .map(p => p.nombre?.toLowerCase().trim())

            const melaminasDeCiudad = melaminas.filter(m => {
              const perteneceCiudad = m.proveedor && proveedoresDeCiudad.includes(m.proveedor.toLowerCase().trim())
              if (!perteneceCiudad) return false

              if (!busquedaGlobal.trim()) return true
              const query = busquedaGlobal.toLowerCase()
              return m.codigo_melamina?.toLowerCase().includes(query) || m.detalle?.toLowerCase().includes(query)
            })

            return (
              <div key={ciudad} className="bg-white rounded-3xl shadow-sm border border-gray-200 overflow-hidden">
                
                <div className="bg-gradient-to-r from-gray-50 to-white px-6 py-4 border-b border-gray-100 flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-[#001f3f] text-[#D4AF37] rounded-2xl shadow-xs">
                      <MapPin size={20} />
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-[#001f3f]">{ciudad}</h2>
                      <p className="text-[11px] text-gray-500 font-medium">
                        {melaminasDeCiudad.length} {melaminasDeCiudad.length === 1 ? 'color disponible' : 'colores disponibles'}
                      </p>
                    </div>
                  </div>
                  <span className="text-[11px] font-bold bg-[#001f3f]/5 text-[#001f3f] px-3.5 py-1.5 rounded-xl border border-[#001f3f]/10">
                    📍 Hub Logístico
                  </span>
                </div>

                <div className="p-6">
                  {melaminasDeCiudad.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                      {melaminasDeCiudad.map((mel) => {
                        const volteada = tarjetasVolteadas[mel.id] || false

                        return (
                          <div 
                            key={mel.id} 
                            onClick={() => toggleTarjeta(mel.id)}
                            className="group relative bg-white border-2 border-gray-100 hover:border-[#D4AF37] rounded-3xl shadow-sm hover:shadow-xl transition-all duration-300 cursor-pointer overflow-hidden flex flex-col"
                          >
                            <div className="absolute top-3 right-3 z-10 bg-black/40 backdrop-blur-md text-white p-1.5 rounded-full text-[10px] shadow-sm transition group-hover:bg-[#001f3f] group-hover:text-[#D4AF37]">
                              {volteada ? <RotateCw size={14} className="rotate-180" /> : <Info size={14} />}
                            </div>

                            {!volteada ? (
                              <>
                                <div className="w-full h-56 bg-gray-100 overflow-hidden relative">
                                  {mel.foto_url ? (
                                    <img 
                                      src={mel.foto_url} 
                                      alt={mel.detalle || ''} 
                                      className="w-full h-full object-cover group-hover:scale-105 transition duration-500" 
                                    />
                                  ) : (
                                    <div className="w-full h-full flex flex-col items-center justify-center text-gray-300 bg-gray-50">
                                      <ImageIcon size={40} />
                                      <span className="text-[10px] text-gray-400 mt-1">Sin imagen</span>
                                    </div>
                                  )}
                                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-60"></div>
                                  <span className="absolute bottom-3 left-3 text-[11px] font-mono font-bold bg-[#001f3f] text-[#D4AF37] px-2.5 py-1 rounded-lg uppercase tracking-wider shadow-sm">
                                    {mel.codigo_melamina}
                                  </span>
                                </div>

                                <div className="p-4 flex flex-col justify-between flex-grow bg-white">
                                  <div className="flex items-start justify-between gap-2">
                                    <h3 className="text-sm font-bold text-[#001f3f] line-clamp-2" title={mel.detalle || ''}>
                                      {mel.detalle || 'Color sin nombre'}
                                    </h3>
                                    {mel.foto_url && (
                                      <button 
                                        onClick={(e) => descargarFoto(e, mel.foto_url, mel.detalle, mel.codigo_melamina)} 
                                        title="Descargar foto"
                                        className="p-1.5 text-gray-400 hover:text-[#D4AF37] hover:bg-gray-100 rounded-lg transition shrink-0"
                                      >
                                        <Download size={16} />
                                      </button>
                                    )}
                                  </div>

                                  {puedeVerPrivado && (
                                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                                      <span className="text-[11px] text-gray-400 font-bold uppercase">Cotizador</span>
                                      <span className="text-sm font-extrabold text-emerald-600">
                                        Bs. {mel.precio_cotizador?.toFixed(2) || '0.00'}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </>
                            ) : (
                              <div className="p-6 bg-[#001f3f] text-white h-full min-h-[280px] flex flex-col justify-between animate-fadeIn">
                                <div>
                                  <div className="flex justify-between items-center mb-3">
                                    <span className="text-[10px] font-mono font-bold bg-[#D4AF37] text-[#001f3f] px-2 py-0.5 rounded uppercase">
                                      {mel.codigo_melamina}
                                    </span>
                                    <span className="text-[10px] text-gray-300">Toca para volver</span>
                                  </div>
                                  <h3 className="text-sm font-bold text-white mb-3">
                                    {mel.detalle}
                                  </h3>
                                  <div className="space-y-2 text-xs border-t border-white/10 pt-3">
                                    {puedeVerPrivado && (
                                      <>
                                        <div>
                                          <span className="text-gray-400 text-[10px] block uppercase font-bold">Proveedor</span>
                                          <span className="text-white font-medium">{mel.proveedor || 'No asignado'}</span>
                                        </div>
                                        <div>
                                          <span className="text-gray-400 text-[10px] block uppercase font-bold">Precio Compra</span>
                                          <span className="text-gray-200 font-medium">Bs. {mel.precio_compra?.toFixed(2) || '0.00'}</span>
                                        </div>
                                      </>
                                    )}
                                    {!puedeVerPrivado && (
                                      <div className="text-gray-300 text-xs italic py-2">
                                        Muestra disponible en stock digital para proyectos de diseño.
                                      </div>
                                    )}
                                  </div>
                                </div>
                                <div className="pt-3 border-t border-white/10 flex justify-between items-center">
                                  {mel.foto_url && (
                                    <button 
                                      onClick={(e) => descargarFoto(e, mel.foto_url, mel.detalle, mel.codigo_melamina)}
                                      className="bg-[#D4AF37] text-[#001f3f] px-3 py-1.5 rounded-xl font-bold text-[10px] flex items-center gap-1 hover:bg-opacity-90 transition"
                                    >
                                      <Download size={12} /> Descargar Imagen
                                    </button>
                                  )}
                                  {puedeVerPrivado && (
                                    <div className="text-right">
                                      <span className="text-[9px] text-[#D4AF37] block uppercase font-bold">Cotizador</span>
                                      <span className="text-sm font-extrabold text-[#D4AF37]">
                                        Bs. {mel.precio_cotizador?.toFixed(2) || '0.00'}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}

                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-12 text-gray-400 bg-gray-50/50 rounded-2xl border border-dashed border-gray-200">
                      <Package className="mx-auto mb-2 opacity-30 text-[#001f3f]" size={36} />
                      <p className="text-xs font-bold text-gray-600">No se encontraron materiales para esta sucursal.</p>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}