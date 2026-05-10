'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function GestionStockPro() {
  const [usuario, setUsuario] = useState<any>(null)
  const [stock, setStock] = useState<any[]>([])
  const [productos, setProductos] = useState<any[]>([])
  const [sucursales, setSucursales] = useState<any[]>([])
  const [ventasPendientes, setVentasPendientes] = useState<any[]>([])
  const [productosEnVenta, setProductosEnVenta] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  
  const [modalAbierto, setModalAbierto] = useState(false)
  const [tipoOperacion, setTipoOperacion] = useState<'entrada' | 'salida' | 'ajuste'>('entrada')
  const [productoSeleccionado, setProductoSeleccionado] = useState('')
  const [sucursalSeleccionada, setSucursalSeleccionada] = useState<number | ''>('')
  const [cantidadNueva, setCantidadNueva] = useState(0)
  const [codigoVenta, setCodigoVenta] = useState('')

  useEffect(() => {
    const init = async () => {
      try {
        const carnet = localStorage.getItem('carnet')
        if (!carnet) return setLoading(false)
        const { data: userData } = await supabase.from('personal').select('*, cargos(*)').eq('carnet', carnet).single()
        setUsuario(userData)
        await Promise.all([loadProductos(), loadSucursales(), loadStock(), loadVentasPendientes()])
      } catch (e) { console.error(e) } finally { setLoading(false) }
    }
    init()
  }, [])

  const loadProductos = async () => {
    const { data } = await supabase.from('productos').select('codigo, nombre').order('nombre')
    setProductos(data || [])
  }

  const loadSucursales = async () => {
    const { data } = await supabase.from('sucursales').select('*')
    setSucursales(data || [])
  }

  const loadStock = async () => {
    const { data } = await supabase.from('stock_productos').select(`
      id, cantidad, stock_minimo, producto_codigo, sucursal_id, 
      productos(nombre), sucursales(nombre)
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
    const { data } = await supabase.from('detalle_ventas').select('producto_codigo, cantidad, productos(nombre)').eq('cod_venta', Number(codVenta))
    setProductosEnVenta(data || [])
  }

  const abrirSalidaProducto = (item: any) => {
    setTipoOperacion('salida')
    setProductoSeleccionado(item.producto_codigo)
    setSucursalSeleccionada(item.sucursal_id)
    setModalAbierto(true)
    loadVentasPendientes() 
  }

  const procesarStock = async () => {
    if (!productoSeleccionado || !sucursalSeleccionada || cantidadNueva <= 0) return alert('Campos incompletos')
    try {
      const itemStock = stock.find(s => s.producto_codigo === productoSeleccionado && s.sucursal_id === Number(sucursalSeleccionada))
      if (tipoOperacion !== 'entrada' && (!itemStock || itemStock.cantidad < cantidadNueva)) return alert('Sin stock suficiente')

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

      alert('Éxito')
      cerrarModal()
      loadStock()
    } catch (e) { alert('Error de red') }
  }

  const cerrarModal = () => {
    setModalAbierto(false)
    setProductoSeleccionado('')
    setSucursalSeleccionada('')
    setCantidadNueva(0)
    setCodigoVenta('')
    setProductosEnVenta([])
  }

  return (
    <div className="min-h-screen bg-slate-100 pb-10">
      <div className="bg-slate-900 text-white p-6 rounded-b-[40px] shadow-xl">
        <div className="max-w-xl mx-auto flex justify-between items-center">
          <h1 className="text-2xl font-black italic">STOCK PRO</h1>
          <p className="text-xs opacity-70">{usuario?.nombre}</p>
        </div>
        <button onClick={() => { setTipoOperacion('entrada'); setModalAbierto(true); }} className="w-full mt-6 bg-white text-slate-900 py-4 rounded-2xl font-black shadow-lg active:scale-95 transition-all max-w-xl mx-auto block uppercase text-sm">➕ Agregar Stock</button>
      </div>

      <div className="p-4 space-y-4 max-w-xl mx-auto mt-4">
        {stock.map((item) => (
          <button key={item.id} onClick={() => abrirSalidaProducto(item)} className="w-full text-left bg-white rounded-[32px] p-6 shadow-sm border border-slate-200 hover:border-indigo-300 transition-all active:scale-[0.97]">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="font-black text-slate-800 text-lg uppercase leading-tight">{item.productos?.nombre}</h2>
                <div className="flex gap-2 mt-1.5 text-xs font-bold text-indigo-500">📍 {item.sucursales?.nombre}</div>
              </div>
              <div className="text-right">
                <div className="text-4xl font-black text-slate-800">{item.cantidad}</div>
                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">Unids</p>
              </div>
            </div>
          </button>
        ))}
      </div>

      {modalAbierto && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-[45px] p-8 w-full max-w-md shadow-2xl">
            <h2 className="text-xl font-black mb-6 text-slate-800 text-center uppercase">
              {tipoOperacion === 'entrada' ? '📥 Entrada' : '📤 Salida'}
            </h2>

            {tipoOperacion !== 'entrada' && (
              <div className="flex bg-slate-100 p-1.5 rounded-2xl mb-6">
                <button onClick={() => setTipoOperacion('salida')} className={`flex-1 py-3 rounded-xl font-black text-[10px] ${tipoOperacion === 'salida' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400'}`}>POR VENTA</button>
                <button onClick={() => {setTipoOperacion('ajuste'); setCodigoVenta('');}} className={`flex-1 py-3 rounded-xl font-black text-[10px] ${tipoOperacion === 'ajuste' ? 'bg-white text-red-600 shadow-sm' : 'text-slate-400'}`}>BAJA/AJUSTE</button>
              </div>
            )}

            <div className="space-y-4">
              {tipoOperacion === 'salida' && (
                <select 
                  className="w-full bg-blue-50 border-2 border-blue-100 rounded-2xl p-4 font-black text-blue-900 text-sm outline-none"
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
                className="w-full bg-slate-50 border-none rounded-2xl p-4 font-bold text-slate-700 text-sm outline-none"
                value={productoSeleccionado}
                onChange={(e) => setProductoSeleccionado(e.target.value)}
                disabled={tipoOperacion === 'salida' && productosEnVenta.length === 0}
              >
                <option value="">Seleccionar Producto...</option>
                {tipoOperacion === 'salida' 
                  ? productosEnVenta.map(p => <option key={p.producto_codigo} value={p.producto_codigo}>{p.productos?.nombre} ({p.cantidad})</option>)
                  : productos.map(p => <option key={p.codigo} value={p.codigo}>{p.nombre}</option>)
                }
              </select>

              <div className="grid grid-cols-2 gap-4">
                <select className="w-full bg-slate-50 rounded-2xl p-4 font-bold text-xs" value={sucursalSeleccionada} onChange={(e) => setSucursalSeleccionada(Number(e.target.value))}>
                  <option value="">Sucursal</option>
                  {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </select>
                <input type="number" className="w-full bg-slate-100 rounded-2xl p-4 font-black text-center text-xl outline-none" placeholder="0" value={cantidadNueva || ''} onChange={(e) => setCantidadNueva(Number(e.target.value))} />
              </div>
            </div>

            <div className="flex gap-4 mt-10">
              <button onClick={cerrarModal} className="flex-1 py-4 font-bold text-slate-400 uppercase text-[10px]">Cerrar</button>
              <button onClick={procesarStock} className={`flex-[2] text-white rounded-[25px] font-black py-4 shadow-xl uppercase text-[10px] ${tipoOperacion === 'entrada' ? 'bg-green-600' : 'bg-slate-900'}`}>
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}