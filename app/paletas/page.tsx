'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { Loader2, MapPin, Package, Image as ImageIcon, Layers } from 'lucide-react'

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

  const nombreMostrar = usuario?.usuario || usuario?.nombre || usuario?.carnet || 'Usuario'

  if (loading) return <div className="flex h-screen items-center justify-center bg-gray-50"><Loader2 className="animate-spin text-green-700" size={40} /></div>
  if (accesoDenegado) return <div className="flex h-screen items-center justify-center bg-gray-50"><div className="text-center p-10 bg-white rounded-2xl shadow-lg"><h2 className="text-2xl font-bold text-gray-800">🔒 Acceso Denegado</h2></div></div>

  return (
    <div className="min-h-screen bg-gray-50" style={{ fontFamily: 'Arial, sans-serif' }}>
      {/* NAVBAR */}
      <nav className="flex justify-between items-center px-6 py-4 bg-[#222] text-white sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <a href="/sistema" className="font-bold text-xl hover:text-green-400 transition">Muebles is Better</a>
          <span className="hidden md:inline text-green-500 font-bold">| Paletas Automáticas por Ubicación</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-green-400 font-bold">{nombreMostrar} 👤</span>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto p-4 md:p-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-800">Paletas de Melaminas por Sucursal (Automático)</h1>
          <p className="text-sm text-gray-500 font-medium">Generadas según la ubicación geográfica de los proveedores registrados</p>
        </div>

        {/* CONTENEDOR DE LAS 3 CIUDADES */}
        <div className="space-y-8">
          {ciudadesGeograficas.map((ciudad) => {
            // 1. Filtrar proveedores que pertenecen a esta ciudad
            const proveedoresDeCiudad = proveedores
              .filter(p => p.ciudad?.toLowerCase().trim() === ciudad.toLowerCase().trim())
              .map(p => p.nombre?.toLowerCase().trim())

            // 2. Filtrar melaminas cuyo proveedor esté en esta ciudad
            const melaminasDeCiudad = melaminas.filter(m => 
              m.proveedor && proveedoresDeCiudad.includes(m.proveedor.toLowerCase().trim())
            )

            return (
              <div key={ciudad} className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                {/* Cabecera de la Sucursal / Ciudad */}
                <div className="bg-gray-50 px-6 py-4 border-b border-gray-100 flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-green-100 text-green-700 rounded-xl">
                      <MapPin size={22} />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-gray-800">{ciudad}</h2>
                      <p className="text-xs text-gray-500">Paleta generada automáticamente con {melaminasDeCiudad.length} materiales disponibles</p>
                    </div>
                  </div>
                  <span className="text-xs font-bold bg-green-50 text-green-700 px-3 py-1.5 rounded-xl border border-green-200">
                    Sucursal Activa
                  </span>
                </div>

                {/* Grilla de Melaminas de esta Ciudad */}
                <div className="p-6">
                  {melaminasDeCiudad.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                      {melaminasDeCiudad.map((mel) => (
                        <div key={mel.id} className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-2xl shadow-2xs hover:border-green-500 transition">
                          {mel.foto_url ? (
                            <img src={mel.foto_url} alt={mel.detalle || ''} className="w-14 h-14 object-cover rounded-xl border shrink-0" />
                          ) : (
                            <div className="w-14 h-14 bg-gray-100 rounded-xl flex items-center justify-center text-gray-400 shrink-0">
                              <ImageIcon size={22} />
                            </div>
                          )}
                          <div className="overflow-hidden">
                            <span className="text-[10px] font-mono font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded uppercase">
                              {mel.codigo_melamina}
                            </span>
                            <h4 className="text-xs font-bold text-gray-800 truncate mt-1" title={mel.detalle || ''}>
                              {mel.detalle || 'Sin detalle'}
                            </h4>
                            <p className="text-[11px] text-green-700 font-bold mt-0.5">
                              Bs. {mel.precio_cotizador?.toFixed(2) || '0.00'}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-10 text-gray-400">
                      <Package className="mx-auto mb-2 opacity-20" size={40} />
                      <p className="text-sm">No hay melaminas vinculadas a proveedores de esta ciudad todavía.</p>
                      <p className="text-xs text-gray-400 mt-1">Asegúrate de que el campo "ciudad" en tus proveedores coincida con "{ciudad}".</p>
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