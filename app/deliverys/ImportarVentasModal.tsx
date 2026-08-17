'use client'
import { useState, useEffect } from 'react'

export default function ImportarVentasModal({ 
  isOpen, 
  onClose, 
  onSelectVenta, 
  supabaseClient 
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  onSelectVenta: (venta: any) => void; 
  supabaseClient: any 
}) {
  const [ventas, setVentas] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [busqueda, setBusqueda] = useState('')

  useEffect(() => {
    if (isOpen) {
      cargarVentasPendientes()
    }
  }, [isOpen])

  const cargarVentasPendientes = async () => {
    setLoading(true)
    try {
      // Consultar ventas recientes desde Supabase
      const { data, error } = await supabaseClient
        .from('ventas')
        .select(`
          cod_venta,
          fecha_entrega,
          hora_entrega,
          destino,
          ubicacion_pedido,
          detalles_especificos,
          cod_cliente,
          delivery_cotizado
        `)
        .order('fecha_entrega', { ascending: false })
        .limit(30)

      if (error) throw error

      // Enriquecer con los datos de la tabla clientes
      const ventasConClientes = await Promise.all(
        (data || []).map(async (v: any) => {
          let clienteInfo = { nombre: 'Cliente General', celular: '', direccion: '' }
          if (v.cod_cliente) {
            const { data: cli } = await supabaseClient
              .from('clientes')
              .select('nombre, celular, direccion')
              .eq('codigo', v.cod_cliente)
              .single()
            if (cli) clienteInfo = cli
          }
          return { ...v, cliente: clienteInfo }
        })
      )

      setVentas(ventasConClientes)
    } catch (err) {
      console.error('Error al cargar ventas:', err)
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  const ventasFiltradas = ventas.filter(v => 
    v.cod_venta.toString().includes(busqueda) ||
    v.cliente?.nombre?.toLowerCase().includes(busqueda.toLowerCase()) ||
    v.destino?.toLowerCase().includes(busqueda.toLowerCase())
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[85vh]">
        <div className="p-4 bg-slate-900 text-white flex justify-between items-center">
          <h3 className="font-semibold text-lg">Importar Pedido desde Ventas</h3>
          <button onClick={onClose} className="text-gray-300 hover:text-white text-xl font-bold">&times;</button>
        </div>

        <div className="p-4 border-b">
          <input 
            type="text" 
            placeholder="Buscar por código de venta, cliente o destino..." 
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800"
          />
        </div>

        <div className="p-4 overflow-y-auto flex-1">
          {loading ? (
            <div className="text-center py-8 text-gray-500">Cargando ventas desde Supabase...</div>
          ) : ventasFiltradas.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No se encontraron ventas registradas.</div>
          ) : (
            <div className="space-y-3">
              {ventasFiltradas.map((v) => (
                <div key={v.cod_venta} className="border rounded-lg p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:bg-slate-50 transition">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-blue-600">Venta #{v.cod_venta}</span>
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">Entrega: {v.fecha_entrega || 'Por definir'}</span>
                    </div>
                    <p className="font-medium text-gray-800 mt-1">Cliente: {v.cliente.nombre} ({v.cliente.celular || 'Sin celular'})</p>
                    <p className="text-sm text-gray-600">Destino: {v.destino || v.ubicacion_pedido || 'No especificada'}</p>
                    {v.detalles_especificos && <p className="text-xs text-gray-500 mt-1">Detalles: {v.detalles_especificos}</p>}
                  </div>
                  <button 
                    onClick={() => {
                      onSelectVenta(v)
                      onClose()
                    }}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition self-end md:self-center"
                  >
                    Importar
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 border-t bg-gray-50 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg text-sm font-medium">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}