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

  const esAdmin = usuario?.cargos?.es_admin
  const nombreMostrar = usuario?.usuario || usuario?.nombre || usuario?.carnet || 'Usuario'

  if (loading) return <div className="flex h-screen items-center justify-center bg-gray-50"><Loader2 className="animate-spin text-green-700" size={40} /></div>
  if (accesoDenegado) return <div className="flex h-screen items-center justify-center bg-gray-50"><div className="text-center p-10 bg-white rounded-2xl shadow-lg"><h2 className="text-2xl font-bold text-gray-800">🔒 Acceso Denegado</h2></div></div>

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="flex justify-between items-center px-6 py-4 bg-[#222] text-white sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <a href="/sistema" className="font-bold text-xl hover:text-green-400">Muebles is Better</a>
          <span className="text-green-500 font-bold">| Gestión de Melaminas</span>
        </div>
        <div className="text-sm text-green-400 font-bold">{nombreMostrar} 👤</div>
      </nav>

      <div className="max-w-7xl mx-auto p-4 md:p-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Inventario de Melaminas</h1>
            <p className="text-sm text-gray-500 font-medium">Control de precios, imágenes y sucursales de proveedores</p>
          </div>
          <div className="flex w-full md:w-auto gap-2">
            <div className="relative flex-grow">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              <input 
                placeholder="Buscar código, detalle o proveedor..." 
                className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-600 outline-none"
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <button onClick={abrirNuevo} className="bg-[#087e0b] hover:bg-[#065e08] text-white px-5 py-2 rounded-xl flex items-center gap-2 font-bold shadow-sm">
              <Plus size={18} /> Nueva
            </button>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <table className="w-full text-left border-collapse hidden md:table">
            <thead>
              <tr className="bg-gray-50 border-b-2 border-gray-100">
                <th className="p-4 text-xs font-bold text-gray-500 uppercase">Imagen</th>
                <th className="p-4 text-xs font-bold text-gray-500 uppercase">Código</th>
                <th className="p-4 text-xs font-bold text-gray-500 uppercase">Detalle</th>
                <th className="p-4 text-xs font-bold text-gray-500 uppercase">Proveedor / Ciudad</th>
                <th className="p-4 text-xs font-bold text-gray-500 uppercase text-right">Compra</th>
                <th className="p-4 text-xs font-bold text-gray-500 uppercase text-right">Cotizador</th>
                <th className="p-4 text-xs font-bold text-gray-500 uppercase text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtrados.map((item) => {
                const provObj = proveedores.find(p => p.nombre === item.proveedor)
                return (
                  <tr key={item.id} className="hover:bg-green-50">
                    <td className="p-4">
                      {item.foto_url ? (
                        <img src={item.foto_url} alt={item.detalle || ''} className="w-12 h-12 object-cover rounded-lg border shadow-sm" />
                      ) : (
                        <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center text-gray-400"><ImageIcon size={20}/></div>
                      )}
                    </td>
                    <td className="p-4 font-mono font-bold text-green-700">{item.codigo_melamina}</td>
                    <td className="p-4 text-gray-700 font-medium">{item.detalle || '—'}</td>
                    <td className="p-4">
                      <div className="text-gray-800 font-medium">{item.proveedor || '—'}</div>
                      {provObj?.ciudad && (
                        <span className="text-[11px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-bold">
                          📍 {provObj.ciudad}
                        </span>
                      )}
                    </td>
                    <td className="p-4 text-right font-medium text-gray-600">Bs. {item.precio_compra?.toFixed(2)}</td>
                    <td className="p-4 text-right font-bold text-green-700">Bs. {item.precio_cotizador?.toFixed(2)}</td>
                    <td className="p-4">
                      <div className="flex justify-center gap-2">
                        <button onClick={() => { setForm({...item, precio_compra: item.precio_compra?.toString() || '', precio_cotizador: item.precio_cotizador?.toString() || '', foto_url: item.foto_url || ''} as any); setImagenFile(null); setModalOpen(true); }} className="p-2 text-amber-600 hover:bg-amber-100 rounded-lg"><Edit size={18} /></button>
                        <button onClick={() => eliminarMelamina(item.id)} className="p-2 text-red-600 hover:bg-red-100 rounded-lg"><Trash2 size={18} /></button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
            <div className="p-6 border-b bg-gray-50 flex justify-between items-center">
              <h3 className="text-lg font-bold text-gray-800">{form.id ? 'Editar Melamina' : 'Nueva Melamina'}</h3>
              <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
            </div>
            
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Código</label>
                <input type="text" disabled value={form.codigo_melamina} className="w-full p-3 bg-gray-100 border rounded-xl font-mono text-green-700 font-bold" />
              </div>

              <div className="md:col-span-2">
                <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Detalle / Color *</label>
                <input type="text" value={form.detalle} onChange={e => setForm({...form, detalle: e.target.value})} placeholder="Ej: Melamina Roble 18mm" className="w-full p-3 border rounded-xl outline-none" />
              </div>

              <div className="md:col-span-2">
                <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Proveedor (con Ciudad)</label>
                <select 
                  value={form.proveedor} 
                  onChange={e => setForm({...form, proveedor: e.target.value})}
                  className="w-full p-3 border rounded-xl outline-none bg-white font-medium"
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
                <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Precio Compra (Bs.)</label>
                <input type="number" value={form.precio_compra} onChange={e => setForm({...form, precio_compra: e.target.value})} className="w-full p-3 border rounded-xl font-bold" />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Precio Cotizador (Bs.)</label>
                <input type="number" value={form.precio_cotizador} onChange={e => setForm({...form, precio_cotizador: e.target.value})} className="w-full p-3 border rounded-xl font-bold text-green-700" />
              </div>

              <div className="md:col-span-2">
                <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Imagen del Color</label>
                <div className="flex items-center gap-4">
                  {form.foto_url && !imagenFile && (
                    <img src={form.foto_url} alt="Vista previa" className="w-16 h-16 object-cover rounded-xl border shadow-sm" />
                  )}
                  <input type="file" accept="image/*" onChange={e => e.target.files && setImagenFile(e.target.files[0])} className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-green-50 file:text-green-700 hover:file:bg-green-100" />
                </div>
              </div>
            </div>

            <div className="p-6 bg-gray-50 flex gap-3 justify-end">
              <button onClick={() => setModalOpen(false)} className="px-6 py-2 border rounded-xl text-gray-600 font-bold hover:bg-gray-100">Cancelar</button>
              <button onClick={guardarMelamina} className="px-8 py-2 bg-[#087e0b] text-white rounded-xl font-bold shadow-md">
                {guardando ? 'Guardando...' : 'Guardar Material'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}