'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { Loader2, MapPin, Package, Image as ImageIcon, Search, Layers, Sparkles } from 'lucide-react'

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
  const [accesoDenegado, setAccesoDenegado] = useState(false)
  
  const [melaminas, setMelaminas] = useState<Melamina[]>([])
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [busquedaGlobal, setBusquedaGlobal] = useState('')

  // Las 3 ciudades oficiales fijadas por estrategia geográfica
  const ciudadesGeograficas = ['Cochabamba', 'Santa Cruz', 'El Alto - La Paz']

  useEffect(() => {
    const carnet = localStorage.getItem('carnet')
    if (!carnet) { window.location.replace('/'); return }
    
    supabase.from('personal').select('*, cargos(*)')
      .eq('carnet', carnet).eq('estado', true).single()
      .then(({ data }) => {
        if (!data) { window.location.replace('/'); return }
        setUsuario(data)
        const puedeVer = data?.cargos?.puede_ver_produccion || data?.cargos?.es_admin
        if (!puedeVer) setAccesoDenegado(true)
        setLoading(false)
      })
  }, [])

  useEffect(() => {
    if (!loading && !accesoDenegado) {
      fetchDatosAutomaticos()
    }
  }, [loading, accesoDenegado])

  const fetchDatosAutomaticos = async () => {
    const [resMelaminas, resProveedores] = await Promise.all([
      supabase.from('melaminas').select('*').order('codigo_melamina'),
      supabase.from('proveedores').select('id, nombre, ciudad')
    ])

    if (resMelaminas.data) setMelaminas(resMelaminas.data)
    if (resProveedores.data) setProveedores(resProveedores.data)
  }

  const nombreMostrar = usuario?.usuario || usuario?.nombre || usuario?.carnet | 'Usuario'

  if (loading) return (
    <div className="flex h-screen items-center justify-center bg-[#f4f6f9]">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="animate-spin text-[#D4AF37]" size={48} />
        <p className="text-[#001f3f] font-bold text-sm tracking-wide">Cargando paletas inteligentes...</p>
      </div>
    </div>
  )

  if (accesoDenegado) return (
    <div className="flex h-screen items-center justify-center bg-[#f4f6f9]">
      <div className="text-center p-10 bg-white rounded-3xl shadow-xl border border-red-100 max-w-md">
        <div className="w-16 h-16 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center mx-auto mb-4 text-2xl font-bold">🔒</div>
        <h2 className="text-2xl font-bold text-[#001f3f] mb-2">Acceso Restringido</h2>
        <p className="text-sm text-gray-500">No cuentas con los permisos necesarios para visualizar las paletas de producción.</p>
        <a href="/sistema" className="mt-6 inline-block bg-[#001f3f] text-[#D4AF37] px-6 py-2.5 rounded-xl font-bold text-xs tracking-wider uppercase transition hover:bg-opacity-90">Volver al Sistema</a>
      </div>
    </div>
  )

  // Total global de melaminas mapeadas
  const totalMateriales = melaminas.length

  return (
    <div className="min-h-screen bg-[#f4f6f9]" style={{ fontFamily: 'Arial, sans-serif' }}>
      
      {/* NAVBAR CORPORATIVO */}
      <nav className="flex justify-between items-center px-6 md:px-10 py-4 bg-[#001f3f] text-white sticky top-0 z-50 shadow-md border-b border-[#D4AF37]/30">
        <div className="flex items-center gap-4">
          <a href="/sistema" className="font-bold text-xl text-white tracking-wide flex items-center gap-2">
            <span>Muebless is Better</span>
          </a>
          <span className="hidden md:inline text-[#D4AF37] font-semibold text-sm">| 🎨 Paletas Automáticas por Ubicación</span>
        </div>
        <div className="flex items-center gap-3 bg-white/10 px-4 py-1.5 rounded-full border border-[#D4AF37]/20">
          <span className="text-[#D4AF37] font-bold text-xs">👤 {nombreMostrar}</span>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto p-4 md:p-8">
        
        {/* ENCABEZADO Y MÉTRICAS (Neuromarketing: Recompensa visual inmediata) */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 bg-white p-6 rounded-3xl shadow-xs border border-gray-100">
          <div>
            <div className="flex items-center gap-2 text-[#D4AF37] font-bold text-xs uppercase tracking-wider mb-1">
              <Sparkles size={14} /> Optimización Geográfica
            </div>
            <h1 className="text-2xl font-bold text-[#001f3f]">Catálogo Inteligente por Sucursal</h1>
            <p className="text-xs text-gray-500 mt-0.5">Sincronización automática de materiales según la ubicación de proveedores registrados.</p>
          </div>
          
          <div className="flex items-center gap-4 bg-[#f4f6f9] px-5 py-3 rounded-2xl border border-gray-200">
            <div className="text-center px-3 border-r border-gray-300">
              <span className="block text-xs text-gray-400 font-bold uppercase">Sucursales</span>
              <span className="text-lg font-bold text-[#001f3f]">3</span>
            </div>
            <div className="text-center px-3">
              <span className="block text-xs text-gray-400 font-bold uppercase">Total Registros</span>
              <span className="text-lg font-bold text-[#D4AF37]">{totalMateriales}</span>
            </div>
          </div>
        </div>

        {/* BARRA DE BÚSQUEDA INTERACTIVA (Fricción cero) */}
        <div className="relative mb-8">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400">
            <Search size={18} />
          </div>
          <input 
            type="text" 
            placeholder="Buscar material por código, detalle o nombre en todas las sucursales..." 
            value={busquedaGlobal}
            onChange={(e) => setBusquedaGlobal(e.target.value)}
            className="w-full pl-11 pr-4 py-3.5 bg-white border border-gray-200 rounded-2xl text-xs md:text-sm text-gray-800 shadow-xs focus:outline-none focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20 transition"
          />
          {busquedaGlobal && (
            <button 
              onClick={() => setBusquedaGlobal('')}
              className="absolute inset-y-0 right-0 pr-4 flex items-center text-xs text-gray-400 hover:text-gray-600 font-bold"
            >
              Limpiar ✕
            </button>
          )}
        </div>

        {/* CONTENEDOR DE LAS 3 CIUDADES */}
        <div className="space-y-8">
          {ciudadesGeograficas.map((ciudad) => {
            // 1. Filtrar proveedores que pertenecen a esta ciudad
            const proveedoresDeCiudad = proveedores
              .filter(p => p.ciudad?.toLowerCase().trim() === ciudad.toLowerCase().trim())
              .map(p => p.nombre?.toLowerCase().trim())

            // 2. Filtrar melaminas de la ciudad y aplicar el buscador global si existe
            const melaminasDeCiudad = melaminas.filter(m => {
              const perteneceCiudad = m.proveedor && proveedoresDeCiudad.includes(m.proveedor.toLowerCase().trim())
              if (!perteneceCiudad) return false

              if (!busquedaGlobal.trim()) return true
              const query = busquedaGlobal.toLowerCase()
              const codigoMatch = m.codigo_melamina?.toLowerCase().includes(query)
              const detalleMatch = m.detalle?.toLowerCase().includes(query)
              return codigoMatch || detalleMatch
            })

            return (
              <div key={ciudad} className="bg-white rounded-3xl shadow-sm border border-gray-200 overflow-hidden transition-all duration-300 hover:shadow-md">
                
                {/* Cabecera de la Sucursal / Ciudad */}
                <div className="bg-gradient-to-r from-gray-50 to-white px-6 py-4 border-b border-gray-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-[#001f3f] text-[#D4AF37] rounded-2xl shadow-xs">
                      <MapPin size={20} />
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-[#001f3f]">{ciudad}</h2>
                      <p className="text-[11px] text-gray-500 font-medium">
                        {melaminasDeCiudad.length} {melaminasDeCiudad.length === 1 ? 'material disponible' : 'materiales disponibles'}
                      </p>
                    </div>
                  </div>
                  <span className="text-[11px] font-bold bg-[#001f3f]/5 text-[#001f3f] px-3.5 py-1.5 rounded-xl border border-[#001f3f]/10">
                    📍 Hub Logístico Activo
                  </span>
                </div>

                {/* Grilla de Melaminas de esta Ciudad */}
                <div className="p-6">
                  {melaminasDeCiudad.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                      {melaminasDeCiudad.map((mel) => (
                        <div 
                          key={mel.id} 
                          className="flex items-center gap-3.5 p-3.5 bg-white border border-gray-200/80 rounded-2xl shadow-2xs hover:border-[#D4AF37] hover:shadow-lg transition-all group"
                        >
                          {mel.foto_url ? (
                            <img src={mel.foto_url} alt={mel.detalle || ''} className="w-14 h-14 object-cover rounded-xl border border-gray-100 shrink-0 group-hover:scale-105 transition" />
                          ) : (
                            <div className="w-14 h-14 bg-gray-50 rounded-xl flex items-center justify-center text-gray-300 shrink-0 border border-gray-100">
                              <ImageIcon size={20} />
                            </div>
                          )}
                          <div className="overflow-hidden">
                            <span className="text-[10px] font-mono font-bold bg-[#001f3f] text-[#D4AF37] px-2 py-0.5 rounded-md uppercase tracking-wider">
                              {mel.codigo_melamina}
                            </span>
                            <h4 className="text-xs font-bold text-[#001f3f] truncate mt-1" title={mel.detalle || ''}>
                              {mel.detalle || 'Sin detalle'}
                            </h4>
                            <p className="text-xs text-emerald-600 font-extrabold mt-0.5">
                              Bs. {mel.precio_cotizador?.toFixed(2) || '0.00'}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12 text-gray-400 bg-gray-50/50 rounded-2xl border border-dashed border-gray-200">
                      <Package className="mx-auto mb-2 opacity-30 text-[#001f3f]" size={36} />
                      <p className="text-xs font-bold text-gray-600">No se encontraron materiales para esta sucursal.</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">Verifica que los proveedores locales tengan asignada la ciudad "{ciudad}".</p>
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