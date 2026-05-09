'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { Trash2, Edit, Plus, Search, Loader2, Package } from 'lucide-react'

// --- Tipos ---
interface Melamina {
  id: number
  codigo_melamina: string
  detalle: string | null
  proveedor: string | null
  precio_compra: number | null
  precio_cotizador: number | null
}

export default function MelaminasGestion() {
  const [usuario, setUsuario] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [accesoDenegado, setAccesoDenegado] = useState(false)
  
  const [items, setItems] = useState<Melamina[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [modalOpen, setModalOpen] = useState(false)
  const [guardando, setGuardando] = useState(false)

  // Formulario
  const [form, setForm] = useState({
    id: null as number | null,
    codigo_melamina: '',
    detalle: '',
    proveedor: '',
    precio_compra: '',
    precio_cotizador: ''
  })

  // 
  useEffect(() => {
    const carnet = localStorage.getItem('carnet')
    if (!carnet) { window.location.replace('/'); return }
    
    supabase.from('personal').select('*, cargos(*)')
      .eq('carnet', carnet).eq('estado', true).single()
      .then(({ data }) => {
        if (!data) { window.location.replace('/'); return }
        setUsuario(data)
        // Permitir si es admin o si tiene permiso de producción
        const puedeVer = data?.cargos?.puede_ver_produccion || data?.cargos?.es_admin
        if (!puedeVer) setAccesoDenegado(true)
        setLoading(false)
      })
  }, [])

  useEffect(() => {
    if (!loading && !accesoDenegado) fetchMelaminas()
  }, [loading, accesoDenegado])

  const fetchMelaminas = async () => {
    const { data } = await supabase
      .from('melaminas')
      .select('*')
      .order('codigo_melamina', { ascending: true })
    if (data) setItems(data)
  }

  // --- Lógica de Generación de Código Automático ---
  const abrirNuevo = () => {
    const randomStr = Math.random().toString(36).substring(2, 7).toUpperCase()
    const nuevoCodigo = `MLB-${randomStr}`
    
    setForm({
      id: null,
      codigo_melamina: nuevoCodigo,
      detalle: '',
      proveedor: '',
      precio_compra: '',
      precio_cotizador: ''
    })
    setModalOpen(true)
  }

  const guardarMelamina = async () => {
    if (!form.codigo_melamina) return
    setGuardando(true)

    const payload = {
      codigo_melamina: form.codigo_melamina,
      detalle: form.detalle,
      proveedor: form.proveedor,
      precio_compra: parseFloat(form.precio_compra) || 0,
      precio_cotizador: parseFloat(form.precio_cotizador) || 0
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

  // --- Filtrado ---
  const filtrados = items.filter(i => 
    i.codigo_melamina.toLowerCase().includes(searchTerm.toLowerCase()) ||
    i.detalle?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const esAdmin = usuario?.cargos?.es_admin
  const nombreMostrar = usuario?.usuario || usuario?.nombre || usuario?.carnet || 'Usuario'

  if (loading) return <div className="flex h-screen items-center justify-center bg-gray-50"><Loader2 className="animate-spin text-green-700" size={40} /></div>

  if (accesoDenegado) return (
    <div className="flex h-screen items-center justify-center bg-gray-50">
      <div className="text-center p-10 bg-white rounded-2xl shadow-lg">
        <h2 className="text-2xl font-bold text-gray-800">🔒 Acceso Denegado</h2>
        <p className="text-gray-500">No tienes permisos para gestionar melaminas.</p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50" style={{ fontFamily: 'Arial, sans-serif' }}>
      {/* NAVBAR (Consistente con tu diseño) */}
      <nav className="flex justify-between items-center px-6 py-4 bg-[#222] text-white sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <a href="/sistema" className="font-bold text-xl hover:text-green-400 transition">Muebles is Better</a>
          <span className="hidden md:inline text-green-500 font-bold">| Gestión de Melaminas</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-green-400 font-bold">{nombreMostrar} 👤</span>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto p-4 md:p-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Inventario de Melaminas</h1>
            <p className="text-sm text-gray-500 font-medium">Control de precios y proveedores</p>
          </div>

          <div className="flex w-full md:w-auto gap-2">
            <div className="relative flex-grow">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              <input 
                placeholder="Buscar por código o detalle..." 
                className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-600 outline-none transition"
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            {(esAdmin || usuario?.cargos?.puede_ver_produccion) && (
              <button 
                onClick={abrirNuevo}
                className="bg-[#087e0b] hover:bg-[#065e08] text-white px-5 py-2 rounded-xl flex items-center gap-2 font-bold shadow-sm transition"
              >
                <Plus size={18} /> <span className="hidden sm:inline">Nueva</span>
              </button>
            )}
          </div>
        </div>

        {/* CONTENEDOR PRINCIPAL */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          {/* TABLA ESCRITORIO */}
          <div className="hidden md:block">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b-2 border-gray-100">
                  <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Código</th>
                  <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Detalle de Material</th>
                  <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Proveedor</th>
                  <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Costo Compra</th>
                  <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">P. Cotizador</th>
                  <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtrados.map((item) => (
                  <tr key={item.id} className="hover:bg-green-50 transition-colors">
                    <td className="p-4 font-mono font-bold text-green-700">{item.codigo_melamina}</td>
                    <td className="p-4 text-gray-700 font-medium">{item.detalle || '—'}</td>
                    <td className="p-4 text-gray-500">{item.proveedor || '—'}</td>
                    <td className="p-4 text-right font-medium text-gray-600">Bs. {item.precio_compra?.toFixed(2)}</td>
                    <td className="p-4 text-right font-bold text-green-700">Bs. {item.precio_cotizador?.toFixed(2)}</td>
                    <td className="p-4">
                      <div className="flex justify-center gap-2">
                        {esAdmin ? (
                          <>
                            <button 
                              onClick={() => { setForm({...item, precio_compra: item.precio_compra?.toString() || '', precio_cotizador: item.precio_cotizador?.toString() || ''} as any); setModalOpen(true); }}
                              className="p-2 text-amber-600 hover:bg-amber-100 rounded-lg transition"
                            >
                              <Edit size={18} />
                            </button>
                            <button 
                              onClick={() => eliminarMelamina(item.id)}
                              className="p-2 text-red-600 hover:bg-red-100 rounded-lg transition"
                            >
                              <Trash2 size={18} />
                            </button>
                          </>
                        ) : (
                          <span className="text-[10px] bg-gray-100 px-2 py-1 rounded text-gray-400">LECTURA</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* VISTA MÓVIL (Cards dinámicas) */}
          <div className="md:hidden divide-y divide-gray-100">
            {filtrados.map((item) => (
              <div key={item.id} className="p-4 space-y-3 active:bg-gray-50">
                <div className="flex justify-between items-center">
                  <span className="text-[11px] font-bold bg-green-100 text-green-700 px-2 py-1 rounded-md uppercase tracking-wide">
                    {item.codigo_melamina}
                  </span>
                  <div className="flex gap-2">
                    {esAdmin && (
                      <>
                        <button onClick={() => { setForm({...item, precio_compra: item.precio_compra?.toString() || '', precio_cotizador: item.precio_cotizador?.toString() || ''} as any); setModalOpen(true); }} className="text-amber-600 p-1"><Edit size={18}/></button>
                        <button onClick={() => eliminarMelamina(item.id)} className="text-red-600 p-1"><Trash2 size={18}/></button>
                      </>
                    )}
                  </div>
                </div>
                <div>
                  <h3 className="font-bold text-gray-800">{item.detalle || 'Sin detalle'}</h3>
                  <p className="text-xs text-gray-500 uppercase tracking-tight">Proveedor: {item.proveedor || 'No asignado'}</p>
                </div>
                <div className="flex justify-between items-center bg-gray-50 p-2 rounded-lg border border-gray-100">
                  <div className="text-center flex-1">
                    <p className="text-[10px] text-gray-400 uppercase">Compra</p>
                    <p className="font-bold text-gray-600">Bs. {item.precio_compra?.toFixed(2)}</p>
                  </div>
                  <div className="w-[1px] h-8 bg-gray-200"></div>
                  <div className="text-center flex-1">
                    <p className="text-[10px] text-gray-400 uppercase font-bold">Cotizador</p>
                    <p className="font-bold text-green-700">Bs. {item.precio_cotizador?.toFixed(2)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {filtrados.length === 0 && (
            <div className="p-20 text-center text-gray-400">
              <Package className="mx-auto mb-4 opacity-20" size={64} />
              <p>No se encontraron melaminas registradas.</p>
            </div>
          )}
        </div>
      </div>

      {/* MODAL (Estilo igual al de tu page.tsx) */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
            <div className="p-6 border-b bg-gray-50 flex justify-between items-center">
              <h3 className="text-lg font-bold text-gray-800">
                {form.id ? 'Editar Melamina' : 'Nueva Melamina'}
              </h3>
              <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
            </div>
            
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Código del Material</label>
                <input 
                  type="text" 
                  disabled 
                  value={form.codigo_melamina} 
                  className="w-full p-3 bg-gray-100 border border-gray-200 rounded-xl font-mono text-green-700 font-bold"
                />
                <p className="text-[10px] text-gray-400 mt-1">* El código se genera automáticamente para evitar duplicidad.</p>
              </div>

              <div className="md:col-span-2">
                <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Detalle / Color / Marca *</label>
                <input 
                  type="text" 
                  value={form.detalle} 
                  onChange={e => setForm({...form, detalle: e.target.value})}
                  placeholder="Ej: Melamina Blanca 18mm Pelikano"
                  className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-600 outline-none"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Proveedor</label>
                <input 
                  type="text" 
                  value={form.proveedor} 
                  onChange={e => setForm({...form, proveedor: e.target.value})}
                  className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-600 outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Precio Compra (Bs.)</label>
                <input 
                  type="number" 
                  value={form.precio_compra} 
                  onChange={e => setForm({...form, precio_compra: e.target.value})}
                  className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-600 outline-none font-bold"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Precio Cotizador (Bs.)</label>
                <input 
                  type="number" 
                  value={form.precio_cotizador} 
                  onChange={e => setForm({...form, precio_cotizador: e.target.value})}
                  className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-600 outline-none font-bold text-green-700"
                />
              </div>
            </div>

            <div className="p-6 bg-gray-50 flex gap-3 justify-end">
              <button 
                onClick={() => setModalOpen(false)}
                className="px-6 py-2 border border-gray-300 rounded-xl text-gray-600 font-bold hover:bg-gray-100 transition"
              >
                Cancelar
              </button>
              <button 
                onClick={guardarMelamina}
                disabled={guardando || !form.detalle}
                className="px-8 py-2 bg-[#087e0b] hover:bg-[#065e08] text-white rounded-xl font-bold disabled:bg-gray-300 transition shadow-md"
              >
                {guardando ? 'Guardando...' : 'Guardar Material'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}