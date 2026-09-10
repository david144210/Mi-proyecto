'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function GestionStockPro() {
  const [usuario, setUsuario] = useState<any>(null)
  const [stock, setStock] = useState<any[]>([])
  const [productos, setProductos] = useState<any[]>([])
  const [sucursales, setSucursales] = useState<any[]>([])
  const [ventasPendientes, setVentasPendientes] = useState<any[]>([])
  const [productosEnVenta, setProductosEnVenta] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [puedeEditar, setPuedeEditar] = useState(false)

  // Búsqueda / filtro del catálogo de stock
  const [busqueda, setBusqueda] = useState('')
  // null = mostrando el selector de tiendas (nunca mezclamos todo el stock junto)
  const [sucursalActiva, setSucursalActiva] = useState<number | null>(null)

  const [modalAbierto, setModalAbierto] = useState(false)
  const [tipoOperacion, setTipoOperacion] = useState<'entrada' | 'salida' | 'ajuste'>('entrada')
  const [productoSeleccionado, setProductoSeleccionado] = useState('')
  const [sucursalSeleccionada, setSucursalSeleccionada] = useState<number | ''>('')
  const [cantidadNueva, setCantidadNueva] = useState(0)
  const [codigoVenta, setCodigoVenta] = useState('')
  const [procesando, setProcesando] = useState(false)

  useEffect(() => {
    const init = async () => {
      try {
        const carnet = localStorage.getItem('carnet')
        if (!carnet) { window.location.replace('/'); return }
        const { data: userData } = await supabase.from('personal').select('*, cargos(*)').eq('carnet', carnet).eq('estado', true).single()
        if (!userData) { window.location.replace('/'); return }
        setUsuario(userData)
        // Admin, o el permiso específico de tienda: cualquiera de los dos habilita edición.
        if (userData?.cargos?.es_admin === true || userData?.cargos?.puede_editar_tienda === true) {
          setPuedeEditar(true)
        }
        await Promise.all([loadProductos(), loadSucursales(), loadStock(), loadVentasPendientes()])
      } catch (e) { console.error(e) } finally { setLoading(false) }
    }
    init()
  }, [])

  const loadProductos = async () => {
    const { data } = await supabase.from('productos').select('codigo, nombre, foto_url').order('nombre')
    setProductos(data || [])
  }

  const loadSucursales = async () => {
    const { data } = await supabase.from('sucursales').select('*').order('nombre')
    setSucursales(data || [])
  }

  const loadStock = async () => {
    const { data } = await supabase.from('stock_productos').select(`
      id, cantidad, stock_minimo, producto_codigo, sucursal_id,
      productos(nombre, foto_url), sucursales(nombre)
    `)
    setStock(data || [])
  }

  // --- FUNCIÓN CORREGIDA CON FALLBACK ---
  const loadVentasPendientes = async () => {
    try {
      // Intento 1: Con relación a clientes (JOIN)
      const { data, error } = await supabase
        .from('ventas')
        .select(`
          cod_venta, 
          destino, 
          cod_cliente,
          clientes(nombre)
        `)
        .eq('estado', 4)
        .order('cod_venta', { ascending: false })

      if (error) {
        // Intento 2: Si el JOIN falla, cargar solo datos de ventas
        console.warn("Falla JOIN clientes, cargando solo ventas...", error)
        const { data: simpleData } = await supabase
          .from('ventas')
          .select('cod_venta, destino, cod_cliente')
          .eq('estado', 4)
          .order('cod_venta', { ascending: false })
        
        setVentasPendientes(simpleData || [])
      } else {
        setVentasPendientes(data || [])
      }
    } catch (err) {
      console.error("Error crítico en ventas:", err)
    }
  }

  const cargarProductosDeVenta = async (codVenta: string) => {
    setCodigoVenta(codVenta)
    if (!codVenta) { setProductosEnVenta([]); return; }
    // Antes decía 'detalle_ventas' / 'producto_codigo' — la tabla real es
    // 'detalle_venta' (sin "s") y la columna es 'cod_producto'.
    const { data } = await supabase
      .from('detalle_venta')
      .select('cod_producto, cantidad, productos(nombre)')
      .eq('cod_venta', Number(codVenta))
    setProductosEnVenta(data || [])
  }

  const abrirSalidaProducto = (item: any) => {
    if (!puedeEditar) return
    setTipoOperacion('salida')
    setProductoSeleccionado(item.producto_codigo)
    setSucursalSeleccionada(item.sucursal_id)
    setModalAbierto(true)
    loadVentasPendientes()
  }

  const procesarStock = async () => {
    if (!productoSeleccionado || !sucursalSeleccionada || cantidadNueva <= 0) return alert('Campos incompletos')
    setProcesando(true)
    try {
      const itemStock = stock.find(s => s.producto_codigo === productoSeleccionado && s.sucursal_id === Number(sucursalSeleccionada))
      if (tipoOperacion !== 'entrada' && (!itemStock || itemStock.cantidad < cantidadNueva)) { alert('Sin stock suficiente'); setProcesando(false); return }

      const factor = tipoOperacion === 'entrada' ? 1 : -1
      const nuevaCant = (itemStock?.cantidad || 0) + (cantidadNueva * factor)

      if (itemStock) {
        await supabase.from('stock_productos').update({ cantidad: nuevaCant }).eq('id', itemStock.id)
      } else {
        await supabase.from('stock_productos').insert({ producto_codigo: productoSeleccionado, sucursal_id: Number(sucursalSeleccionada), cantidad: cantidadNueva })
      }

      await supabase.from('movimientos_stock').insert({
        producto_codigo: productoSeleccionado,
        sucursal_id: Number(sucursalSeleccionada),
        cantidad: cantidadNueva * factor,
        tipo_movimiento: tipoOperacion === 'entrada' ? 'entrada' : (tipoOperacion === 'salida' ? 'baja_venta' : 'ajuste'),
        cod_venta: tipoOperacion === 'salida' ? Number(codigoVenta) : null,
        usuario_id: usuario.id
      })

      cerrarModal()
      loadStock()
    } catch (e) {
      alert('Error de red')
    } finally {
      setProcesando(false)
    }
  }

  const cerrarModal = () => {
    setModalAbierto(false)
    setProductoSeleccionado('')
    setSucursalSeleccionada('')
    setCantidadNueva(0)
    setCodigoVenta('')
    setProductosEnVenta([])
  }

  // Estadísticas por tienda, para identificarlas de un vistazo antes de entrar
  const statsPorSucursal = useMemo(() => {
    const mapa = new Map<number, { total: number; bajoMinimo: number }>()
    stock.forEach(item => {
      const actual = mapa.get(item.sucursal_id) || { total: 0, bajoMinimo: 0 }
      actual.total += 1
      if (item.stock_minimo != null && item.cantidad <= item.stock_minimo) actual.bajoMinimo += 1
      mapa.set(item.sucursal_id, actual)
    })
    return mapa
  }, [stock])

  const sucursalSeleccionadaInfo = sucursales.find(s => s.id === sucursalActiva)

  const stockFiltrado = useMemo(() => {
    if (!sucursalActiva) return []
    const q = busqueda.trim().toLowerCase()
    return stock.filter(item => {
      if (item.sucursal_id !== sucursalActiva) return false
      return !q || (item.productos?.nombre || '').toLowerCase().includes(q)
    })
  }, [stock, busqueda, sucursalActiva])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f1117] flex items-center justify-center text-[#FFD700] font-sans">
        Cargando stock...
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0f1117] text-white pb-16 font-sans">

      {/* HEADER */}
      <div className="bg-[#161726] border-b border-[#FFD700]/20 p-6">
        <div className="max-w-4xl mx-auto flex justify-between items-center flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-black uppercase tracking-tight text-[#FFD700]">📦 Stock — Muebless is Better</h1>
            <p className="text-xs text-slate-400 mt-1">{usuario?.nombre} {puedeEditar && <span className="text-emerald-400 font-bold ml-2">· EDICIÓN ACTIVA</span>}</p>
          </div>
          <a href="/sistema" className="text-slate-300 text-sm hover:text-[#FFD700] transition-colors">← Sistema</a>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 mt-6">

        {sucursalActiva === null ? (
          <>
            {/* ── PASO 1: ELEGIR TIENDA — nunca mezclamos el stock de todas ── */}
            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wide mb-4">Selecciona una tienda</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {sucursales.map(s => {
                const info = statsPorSucursal.get(s.id) || { total: 0, bajoMinimo: 0 }
                return (
                  <button
                    key={s.id}
                    onClick={() => { setSucursalActiva(s.id); setBusqueda('') }}
                    className="text-left bg-[#161726] border border-[#FFD700]/15 hover:border-[#FFD700]/60 rounded-2xl p-5 transition-all active:scale-[0.98]"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-black text-white text-lg uppercase">🏬 {s.nombre}</h3>
                        <p className="text-xs text-slate-400 mt-1">{info.total} producto{info.total !== 1 ? 's' : ''} en stock</p>
                      </div>
                      <span className="text-[#FFD700] text-2xl">→</span>
                    </div>
                    {info.bajoMinimo > 0 && (
                      <div className="mt-3 inline-block text-[10px] font-bold text-red-400 bg-red-500/10 border border-red-500/30 rounded-full px-3 py-1">
                        ⚠️ {info.bajoMinimo} bajo mínimo
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </>
        ) : (
          <>
            {/* ── PASO 2: STOCK DE LA TIENDA ELEGIDA ── */}
            <button onClick={() => { setSucursalActiva(null); setBusqueda('') }} className="text-slate-400 text-sm mb-4 hover:text-[#FFD700] transition-colors">
              ← Todas las tiendas
            </button>

            <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
              <h2 className="text-lg font-black uppercase text-[#FFD700]">🏬 {sucursalSeleccionadaInfo?.nombre}</h2>
              {puedeEditar && (
                <button
                  onClick={() => { setTipoOperacion('entrada'); setSucursalSeleccionada(sucursalActiva); setModalAbierto(true) }}
                  className="bg-gradient-to-r from-[#FFD700] to-[#FFA500] text-[#0a0a1a] px-5 py-2.5 rounded-xl font-black text-xs uppercase shadow-lg active:scale-95 transition-all"
                >
                  ➕ Agregar Stock
                </button>
              )}
            </div>

            <input
              type="text"
              placeholder="🔍 Buscar producto en esta tienda..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="w-full bg-[#161726] border border-[#FFD700]/20 rounded-2xl px-4 py-3 text-sm outline-none focus:border-[#FFD700] transition-colors placeholder:text-slate-500 mb-6"
            />

            {stockFiltrado.length === 0 ? (
              <div className="text-center text-slate-500 bg-[#161726] border border-[#FFD700]/10 rounded-2xl py-16">
                Sin resultados en {sucursalSeleccionadaInfo?.nombre}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {stockFiltrado.map((item) => {
                  const bajoMinimo = item.stock_minimo != null && item.cantidad <= item.stock_minimo
                  return (
                    <button
                      key={item.id}
                      onClick={() => abrirSalidaProducto(item)}
                      disabled={!puedeEditar}
                      className={`text-left bg-[#161726] border rounded-2xl overflow-hidden transition-all ${puedeEditar ? 'hover:border-[#FFD700]/60 active:scale-[0.97] cursor-pointer' : 'cursor-default'} ${bajoMinimo ? 'border-red-500/50' : 'border-[#FFD700]/15'}`}
                    >
                      {item.productos?.foto_url ? (
                        <img src={item.productos.foto_url} alt={item.productos?.nombre || ''} className="w-full aspect-square object-cover" />
                      ) : (
                        <div className="w-full aspect-square bg-[#0d0d1f] flex items-center justify-center text-3xl text-slate-700">📦</div>
                      )}
                      <div className="p-3">
                        <h2 className="font-bold text-white text-[13px] uppercase leading-tight line-clamp-2">{item.productos?.nombre || '—'}</h2>
                        <div className="flex items-center justify-between mt-2">
                          <span className={`text-2xl font-black ${bajoMinimo ? 'text-red-400' : 'text-white'}`}>{item.cantidad}</span>
                          <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">Unids</span>
                        </div>
                        {bajoMinimo && (
                          <div className="mt-2 text-[10px] font-bold text-red-400 bg-red-500/10 border border-red-500/30 rounded-full px-2 py-1 text-center">
                            ⚠️ Bajo mínimo ({item.stock_minimo})
                          </div>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}

            {!puedeEditar && (
              <p className="text-center text-slate-600 text-xs mt-8">
                Solo administradores o usuarios con permiso de tienda pueden registrar movimientos de stock
              </p>
            )}
          </>
        )}
      </div>

      {/* MODAL ENTRADA / SALIDA / AJUSTE */}
      {modalAbierto && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-[#161726] border border-[#FFD700]/20 rounded-[32px] p-8 w-full max-w-md shadow-2xl">
            <h2 className="text-xl font-black mb-6 text-white text-center uppercase">
              {tipoOperacion === 'entrada' ? '📥 Entrada' : tipoOperacion === 'salida' ? '📤 Salida por venta' : '📤 Baja / Ajuste'}
            </h2>

            {tipoOperacion !== 'entrada' && (
              <div className="flex bg-[#0d0d1f] p-1.5 rounded-2xl mb-6">
                <button onClick={() => setTipoOperacion('salida')} className={`flex-1 py-3 rounded-xl font-black text-[10px] transition-colors ${tipoOperacion === 'salida' ? 'bg-[#FFD700] text-[#0a0a1a]' : 'text-slate-400'}`}>POR VENTA</button>
                <button onClick={() => { setTipoOperacion('ajuste'); setCodigoVenta('') }} className={`flex-1 py-3 rounded-xl font-black text-[10px] transition-colors ${tipoOperacion === 'ajuste' ? 'bg-red-500 text-white' : 'text-slate-400'}`}>BAJA/AJUSTE</button>
              </div>
            )}

            <div className="space-y-4">
              {tipoOperacion === 'salida' && (
                <select
                  className="w-full bg-[#0d0d1f] border-2 border-[#FFD700]/30 rounded-2xl p-4 font-bold text-[#FFD700] text-sm outline-none focus:border-[#FFD700]"
                  value={codigoVenta}
                  onChange={(e) => cargarProductosDeVenta(e.target.value)}
                >
                  <option value="">-- Seleccionar Venta --</option>
                  {ventasPendientes.map(v => (
                    <option key={v.cod_venta} value={v.cod_venta}>
                      #{v.cod_venta} - {v.clientes?.nombre || `Cli: ${v.cod_cliente}`}
                    </option>
                  ))}
                </select>
              )}

              <select
                className="w-full bg-[#0d0d1f] border border-white/10 rounded-2xl p-4 font-bold text-white text-sm outline-none focus:border-[#FFD700] disabled:opacity-40"
                value={productoSeleccionado}
                onChange={(e) => setProductoSeleccionado(e.target.value)}
                disabled={tipoOperacion === 'salida' && productosEnVenta.length === 0}
              >
                <option value="">Seleccionar Producto...</option>
                {tipoOperacion === 'salida'
                  ? productosEnVenta.map(p => <option key={p.cod_producto} value={p.cod_producto}>{p.productos?.nombre} ({p.cantidad})</option>)
                  : productos.map(p => <option key={p.codigo} value={p.codigo}>{p.nombre}</option>)
                }
              </select>

              <div className="grid grid-cols-2 gap-4">
                <select className="w-full bg-[#0d0d1f] border border-white/10 rounded-2xl p-4 font-bold text-white text-xs outline-none focus:border-[#FFD700]" value={sucursalSeleccionada} onChange={(e) => setSucursalSeleccionada(Number(e.target.value))}>
                  <option value="">Sucursal</option>
                  {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </select>
                <input type="number" className="w-full bg-[#0d0d1f] border border-white/10 rounded-2xl p-4 font-black text-center text-xl text-white outline-none focus:border-[#FFD700]" placeholder="0" value={cantidadNueva || ''} onChange={(e) => setCantidadNueva(Number(e.target.value))} />
              </div>
            </div>

            <div className="flex gap-4 mt-10">
              <button onClick={cerrarModal} className="flex-1 py-4 font-bold text-slate-400 uppercase text-[10px]">Cerrar</button>
              <button
                onClick={procesarStock}
                disabled={procesando}
                className={`flex-[2] text-white rounded-[25px] font-black py-4 shadow-xl uppercase text-[10px] disabled:opacity-50 ${tipoOperacion === 'entrada' ? 'bg-emerald-600' : 'bg-red-600'}`}
              >
                {procesando ? 'Guardando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
