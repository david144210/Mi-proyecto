'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { Trash2, Edit, Plus, Search, Loader2, Package, Image as ImageIcon } from 'lucide-react'

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

export default function MelaminasGestion() {
  const [usuario, setUsuario] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [accesoDenegado, setAccesoDenegado] = useState(false)
  
  const [items, setItems] = useState<Melamina[]>([])
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [modalOpen, setModalOpen] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [imagenFile, setImagenFile] = useState<File | null>(null)

  const [form, setForm] = useState({
    id: null as number | null,
    codigo_melamina: '',
    detalle: '',
    proveedor: '',
    precio_compra: '',
    precio_cotizador: '',
    foto_url: ''
  })

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
      fetchMelaminas()
      fetchProveedores()
    }
  }, [loading, accesoDenegado])

  const fetchMelaminas = async () => {
    const { data } = await supabase.from('melaminas').select('*').order('codigo_melamina', { ascending: true })
    if (data) setItems(data)
  }

  const fetchProveedores = async () => {
    const { data } = await supabase.from('proveedores').select('id, nombre, ciudad').order('nombre', { ascending: true })
    if (data) setProveedores(data)
  }

  const abrirNuevo = () => {
    const randomStr = Math.random().toString(36).substring(2, 7).toUpperCase()
    setForm({
      id: null,
      codigo_melamina: `MLB-${randomStr}`,
      detalle: '',
      proveedor: proveedores[0]?.nombre || '',
      precio_compra: '',
      precio_cotizador: '',
      foto_url: ''
    })
    setImagenFile(null)
    setModalOpen(true)
  }

  const guardarMelamina = async () => {
    if (!form.codigo_melamina) return
    setGuardando(true)

    let fotoUrlFinal = form.foto_url

    if (imagenFile) {
      const fileName = `melamina_${Date.now()}_${imagenFile.name}`
      const { error: uploadError } = await supabase.storage.from('melaminas').upload(fileName, imagenFile)
      if (!uploadError) {
        const { data: publicUrlData } = supabase.storage.from('melaminas').getPublicUrl(fileName)
        fotoUrlFinal = publicUrlData.publicUrl
      } else {
        alert("Error al subir la imagen: " + uploadError.message)
        setGuardando(false)
        return
      }
    }

    const payload = {
      codigo_melamina: form.codigo_melamina,
      detalle: form.detalle,
      proveedor: form.proveedor,
      precio_compra: parseFloat(form.precio_compra) || 0,
      precio_cotizador: parseFloat(form.precio_cotizador) || 0,
      foto_url: fotoUrlFinal
    }

    const { error } = form.id 
      ? await supabase.from('melaminas').update(payload).eq('id', form.id)
      : await supabase.from('melaminas').insert(payload)

    if (!error) {
      fetchMelaminas()
      setModalOpen(false)
    } else {
      alert("Error al guardar: " + error.message)
    }
    setGuardando(false)
  }

  const eliminarMelamina = async (id: number) => {
    if (!confirm("¿Eliminar esta melamina permanentemente?")) return
    const { error } = await supabase.from('melaminas').delete().eq('id', id)
    if (!error) fetchMelaminas()
  }

  const filtrados = items.filter(i => 
    i.codigo_melamina.toLowerCase().includes(searchTerm.toLowerCase()) ||
    i.detalle?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    i.proveedor?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const nombreMostrar = usuario?.usuario || usuario?.nombre || usuario?.carnet || 'Usuario'

  if (loading) return (
    <div className="flex h-screen items-center justify-center bg-[#f4f6f9]">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="animate-spin text-[#D4AF37]" size={48} />
        <p className="text-[#001f3f] font-bold text-sm tracking-wide">Cargando inventario...</p>
      </div>
    </div>
  )

  if (accesoDenegado) return (
    <div className="flex h-screen items-center justify-center bg-[#f4f6f9]">
      <div className="text-center p-10 bg-white rounded-3xl shadow-xl border border-red-100 max-w-md">
        <div className="w-16 h-16 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center mx-auto mb-4 text-2xl font-bold">🔒</div>
        <h2 className="text-2xl font-bold text-[#001f3f] mb-2">Acceso Restringido</h2>
        <p className="text-sm text-gray-500">No cuentas con los permisos necesarios para gestionar las melaminas.</p>
        <a href="/sistema" className="mt-6 inline-block bg-[#001f3f] text-[#D4AF37] px-6 py-2.5 rounded-xl font-bold text-xs tracking-wider uppercase transition hover:bg-opacity-90">Volver al Sistema</a>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-[#f4f6f9]" style={{ fontFamily: 'Arial, sans-serif' }}>
      
      {/* NAVBAR */}
      <nav className="flex justify-between items-center px-6 md:px-10 py-4 bg-[#001f3f] text-white sticky top-0 z-50 shadow-md border-b border-[#D4AF37]/30">
        <div className="flex items-center gap-4">
          <a href="/sistema" className="font-bold text-xl text-white tracking-wide">Muebless is Better</a>
          <span className="hidden md:inline text-[#D4AF37] font-semibold text-sm">| 🪵 Gestión de Melaminas</span>
        </div>
        <div className="flex items-center gap-3 bg-white/10 px-4 py-1.5 rounded-full border border-[#D4AF37]/20">
          <span className="text-[#D4AF37] font-bold text-xs">👤 {nombreMostrar}</span>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto p-4 md:p-8">
        
        {/* ENCABEZADO Y CONTROLES */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4 bg-white p-6 rounded-3xl shadow-xs border border-gray-100">
          <div>
            <h1 className="text-2xl font-bold text-[#001f3f]">Inventario de Melaminas</h1>
            <p className="text-xs text-gray-500 font-medium mt-0.5">Control de precios, imágenes y sucursales de proveedores</p>
          </div>
          <div className="flex flex-col sm:flex-row w-full md:w-auto gap-3">
            <div className="relative flex-grow sm:w-72">
              <Search className="absolute left-3.5 top-3 h-4 w-4 text-gray-400" />
              <input 
                placeholder="Buscar código, detalle..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2.5 w-full bg-[#f4f6f9] border border-gray-200 rounded-2xl text-xs md:text-sm focus:ring-2 focus:ring-[#D4AF37]/20 focus:border-[#D4AF37] outline-none transition"
              />
            </div>
            <button onClick={abrirNuevo} className="bg-[#001f3f] hover:bg-[#001f3f]/90 text-[#D4AF37] px-6 py-2.5 rounded-2xl flex items-center justify-center gap-2 font-bold text-xs shadow-sm transition">
              <Plus size={16} /> Nueva Melamina
            </button>
          </div>
        </div>

        {/* CONTENEDOR ADAPTABLE (TABLA EN ESCRITORIO / TARJETAS EN MÓVIL) */}
        <div className="bg-white rounded-3xl shadow-sm border border-gray-200 overflow-hidden">
          
          {/* Vista de Tabla para Escritorio */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="p-4 text-xs font-bold text-gray-400 uppercase">Imagen</th>
                  <th className="p-4 text-xs font-bold text-gray-400 uppercase">Código</th>
                  <th className="p-4 text-xs font-bold text-gray-400 uppercase">Detalle</th>
                  <th className="p-4 text-xs font-bold text-gray-400 uppercase">Proveedor / Ciudad</th>
                  <th className="p-4 text-xs font-bold text-gray-400 uppercase text-right">Compra</th>
                  <th className="p-4 text-xs font-bold text-gray-400 uppercase text-right">Cotizador</th>
                  <th className="p-4 text-xs font-bold text-gray-400 uppercase text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtrados.map((item) => {
                  const provObj = proveedores.find(p => p.nombre === item.proveedor)
                  return (
                    <tr key={item.id} className="hover:bg-gray-50/80 transition">
                      <td className="p-4">
                        {item.foto_url ? (
                          <img src={item.foto_url} alt={item.detalle || ''} className="w-12 h-12 object-cover rounded-xl border border-gray-100 shadow-xs" />
                        ) : (
                          <div className="w-12 h-12 bg-gray-50 rounded-xl flex items-center justify-center text-gray-300 border border-gray-100"><ImageIcon size={20}/></div>
                        )}
                      </td>
                      <td className="p-4 font-mono font-bold text-xs text-[#001f3f] bg-[#001f3f]/5 rounded-md px-2 py-1">{item.codigo_melamina}</td>
                      <td className="p-4 text-gray-800 text-xs font-bold">{item.detalle || '—'}</td>
                      <td className="p-4">
                        <div className="text-gray-800 text-xs font-medium">{item.proveedor || '—'}</div>
                        {provObj?.ciudad && (
                          <span className="inline-block mt-1 text-[10px] bg-[#001f3f]/5 text-[#001f3f] px-2 py-0.5 rounded-md font-bold border border-[#001f3f]/10">
                            📍 {provObj.ciudad}
                          </span>
                        )}
                      </td>
                      <td className="p-4 text-right text-xs font-medium text-gray-500">Bs. {item.precio_compra?.toFixed(2) || '0.00'}</td>
                      <td className="p-4 text-right text-xs font-extrabold text-emerald-600">Bs. {item.precio_cotizador?.toFixed(2) || '0.00'}</td>
                      <td className="p-4">
                        <div className="flex justify-center gap-1.5">
                          <button onClick={() => { setForm({...item, precio_compra: item.precio_compra?.toString() || '', precio_cotizador: item.precio_cotizador?.toString() || '', foto_url: item.foto_url || ''} as any); setImagenFile(null); setModalOpen(true); }} className="p-2 text-amber-600 hover:bg-amber-50 rounded-xl transition"><Edit size={16} /></button>
                          <button onClick={() => eliminarMelamina(item.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-xl transition"><Trash2 size={16} /></button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Vista de Tarjetas para Móvil (Optimizado y Responsivo) */}
          <div className="block md:hidden divide-y divide-gray-100">
            {filtrados.length > 0 ? (
              filtrados.map((item) => {
                const provObj = proveedores.find(p => p.nombre === item.proveedor)
                return (
                  <div key={item.id} className="p-4 flex flex-col gap-3.5 hover:bg-gray-50/50 transition">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        {item.foto_url ? (
                          <img src={item.foto_url} alt={item.detalle || ''} className="w-14 h-14 object-cover rounded-2xl border border-gray-100 shadow-xs shrink-0" />
                        ) : (
                          <div className="w-14 h-14 bg-gray-50 rounded-2xl flex items-center justify-center text-gray-300 shrink-0 border border-gray-100">
                            <ImageIcon size={22}/>
                          </div>
                        )}
                        <div>
                          <span className="text-[10px] font-mono font-bold bg-[#001f3f] text-[#D4AF37] px-2 py-0.5 rounded-md uppercase tracking-wider">
                            {item.codigo_melamina}
                          </span>
                          <h3 className="text-xs font-bold text-[#001f3f] mt-1 line-clamp-2">
                            {item.detalle || 'Sin detalle'}
                          </h3>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button 
                          onClick={() => { setForm({...item, precio_compra: item.precio_compra?.toString() || '', precio_cotizador: item.precio_cotizador?.toString() || '', foto_url: item.foto_url || ''} as any); setImagenFile(null); setModalOpen(true); }} 
                          className="p-2 text-amber-600 hover:bg-amber-50 rounded-xl transition"
                        >
                          <Edit size={16} />
                        </button>
                        <button 
                          onClick={() => eliminarMelamina(item.id)} 
                          className="p-2 text-red-600 hover:bg-red-50 rounded-xl transition"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-2.5 border-t border-gray-100 text-xs">
                      <div>
                        <span className="text-gray-400 text-[10px] block uppercase font-bold">Proveedor</span>
                        <span className="text-gray-700 font-medium truncate block">{item.proveedor || '—'}</span>
                        {provObj?.ciudad && (
                          <span className="inline-block mt-1 text-[10px] bg-[#001f3f]/5 text-[#001f3f] px-2 py-0.5 rounded-md font-bold border border-[#001f3f]/10">
                            📍 {provObj.ciudad}
                          </span>
                        )}
                      </div>
                      <div className="text-right">
                        <span className="text-gray-400 text-[10px] block uppercase font-bold">Cotizador</span>
                        <span className="text-emerald-600 font-extrabold text-sm block mt-0.5">Bs. {item.precio_cotizador?.toFixed(2) || '0.00'}</span>
                        <span className="text-gray-400 text-[10px] block">Compra: Bs. {item.precio_compra?.toFixed(2) || '0.00'}</span>
                      </div>
                    </div>
                  </div>
                )
              })
            ) : (
              <div className="text-center py-12 text-gray-400">
                <Package className="mx-auto mb-2 opacity-30 text-[#001f3f]" size={40} />
                <p className="text-xs font-bold text-gray-600">No se encontraron materiales.</p>
              </div>
            )}
          </div>

        </div>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl border border-gray-100">
            <div className="p-6 border-b bg-gradient-to-r from-gray-50 to-white flex justify-between items-center">
              <h3 className="text-base font-bold text-[#001f3f]">{form.id ? 'Editar Melamina' : 'Nueva Melamina'}</h3>
              <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-600 text-2xl font-bold">&times;</button>
            </div>
            
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-[11px] font-bold text-gray-400 uppercase mb-1">Código</label>
                <input type="text" disabled value={form.codigo_melamina} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-2xl font-mono text-[#001f3f] font-bold text-xs" />
              </div>

              <div className="md:col-span-2">
                <label className="block text-[11px] font-bold text-gray-400 uppercase mb-1">Detalle / Color *</label>
                <input type="text" value={form.detalle} onChange={e => setForm({...form, detalle: e.target.value})} placeholder="Ej: Melamina Roble 18mm" className="w-full p-3 border border-gray-200 rounded-2xl outline-none focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20 text-xs md:text-sm" />
              </div>

              <div className="md:col-span-2">
                <label className="block text-[11px] font-bold text-gray-400 uppercase mb-1">Proveedor (con Ciudad)</label>
                <select 
                  value={form.proveedor} 
                  onChange={e => setForm({...form, proveedor: e.target.value})}
                  className="w-full p-3 border border-gray-200 rounded-2xl outline-none bg-white font-medium text-xs md:text-sm focus:border-[#D4AF37]"
                >
                  <option value="">Seleccionar proveedor...</option>
                  {proveedores.map(p => (
                    <option key={p.id} value={p.nombre}>
                      {p.nombre} {p.ciudad ? `(${p.ciudad})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-400 uppercase mb-1">Precio Compra (Bs.)</label>
                <input type="number" value={form.precio_compra} onChange={e => setForm({...form, precio_compra: e.target.value})} className="w-full p-3 border border-gray-200 rounded-2xl font-bold text-xs md:text-sm focus:border-[#D4AF37]" />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-400 uppercase mb-1">Precio Cotizador (Bs.)</label>
                <input type="number" value={form.precio_cotizador} onChange={e => setForm({...form, precio_cotizador: e.target.value})} className="w-full p-3 border border-gray-200 rounded-2xl font-bold text-emerald-600 text-xs md:text-sm focus:border-[#D4AF37]" />
              </div>

<div className="md:col-span-2">
  <label className="block text-[11px] font-bold text-gray-400 uppercase mb-1">Imagen del Color</label>
  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
    {form.foto_url && !imagenFile && (
      <img src={form.foto_url} alt="Vista previa" className="w-16 h-16 object-cover rounded-2xl border shadow-xs shrink-0" />
    )}
    <div className="w-full">
      <input 
        type="file" 
        accept="image/*" 
        capture="environment" // 👈 Esto abre la cámara directamente en dispositivos móviles
        onChange={e => e.target.files && setImagenFile(e.target.files[0])} 
        className="w-full text-xs text-gray-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-[#001f3f]/5 file:text-[#001f3f] hover:file:bg-[#001f3f]/10 cursor-pointer" 
      />
      <p className="text-[10px] text-gray-400 mt-1">Puedes tomar una fotografía directa del material o seleccionar una imagen guardada.</p>
    </div>
  </div>
</div>
            </div>

            <div className="p-6 bg-gray-50 flex gap-3 justify-end border-t border-gray-100">
              <button onClick={() => setModalOpen(false)} className="px-6 py-2.5 border border-gray-200 rounded-2xl text-gray-600 font-bold text-xs hover:bg-gray-100 transition">Cancelar</button>
              <button onClick={guardarMelamina} className="px-8 py-2.5 bg-[#001f3f] text-[#D4AF37] rounded-2xl font-bold text-xs shadow-md hover:bg-opacity-90 transition">
                {guardando ? 'Guardando...' : 'Guardar Material'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}