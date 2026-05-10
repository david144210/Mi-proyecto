'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { Printer, ArrowLeft, CheckCircle2, Loader2, MapPin, Phone } from 'lucide-react'

export default function ReciboPage() {
  const [venta, setVenta] = useState<any>(null)
  const [cliente, setCliente] = useState<any>(null)
  const [detalles, setDetalles] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const idParam = params.get('id')
    if (idParam) {
      fetchTodo(idParam)
    } else {
      setLoading(false)
      setErrorMsg("Falta el ID de la venta en la URL (?id=...)")
    }
  }, [])

  async function fetchTodo(codVentaStr: string) {
    setLoading(true)
    const codVenta = parseInt(codVentaStr)

    try {
      // 1. Traer la Venta
      const { data: vData, error: vError } = await supabase
        .from('ventas')
        .select('*')
        .eq('cod_venta', codVenta)
        .single()

      if (vError || !vData) throw new Error("No se encontró la venta principal.")
      setVenta(vData)

      // 2. Traer el Cliente (Consulta independiente para evitar errores de JOIN)
      if (vData.cod_cliente) {
        const { data: cData } = await supabase
          .from('clientes')
          .select('*')
          .eq('codigo', vData.cod_cliente)
          .single()
        setCliente(cData)
      }

      // 3. Traer los detalles de la venta
      const { data: dData } = await supabase
        .from('detalle_venta')
        .select('*')
        .eq('cod_venta', codVenta)
      
      setDetalles(dData || [])

    } catch (err: any) {
      console.error("Error detallado:", err)
      setErrorMsg(err.message || "Error al cargar los datos.")
    } finally {
      setLoading(false)
    }
  }

  const handlePrint = () => window.print()

  if (loading) return (
    <div className="h-screen flex flex-col items-center justify-center bg-white">
      <Loader2 className="animate-spin text-green-700" size={40} />
      <p className="mt-4 text-gray-500 font-medium">Cargando recibo...</p>
    </div>
  )

  if (errorMsg) return (
    <div className="h-screen flex flex-col items-center justify-center p-6 text-center">
      <div className="bg-red-50 p-6 rounded-2xl border border-red-200 max-w-md">
        <h2 className="text-red-600 font-bold text-xl mb-2">Error de Carga</h2>
        <p className="text-red-500 mb-4">{errorMsg}</p>
        <button onClick={() => window.location.reload()} className="bg-red-600 text-white px-4 py-2 rounded-lg">Reintentar</button>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-100 p-2 md:p-10">
      {/* CABECERA ACCIONES */}
      <div className="max-w-4xl mx-auto mb-6 flex justify-between items-center print:hidden">
        <button onClick={() => window.history.back()} className="font-bold text-gray-600 flex items-center gap-2 hover:text-black transition">
          <ArrowLeft size={18}/> VOLVER
        </button>
        <button onClick={handlePrint} className="bg-green-700 hover:bg-green-800 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg transition">
          <Printer size={18}/> IMPRIMIR / PDF
        </button>
      </div>

      {/* CUERPO DEL RECIBO */}
      <div className="max-w-4xl mx-auto bg-white p-8 md:p-12 shadow-2xl border border-gray-200 print:shadow-none print:border-none print:p-0">
        
        {/* LOGO Y TÍTULO */}
        <div className="flex justify-between items-start border-b-4 border-gray-800 pb-6 mb-8">
          <div>
            <h1 className="text-3xl font-black text-gray-900">MUEBLES <span className="text-green-700">IS BETTER</span></h1>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Comprobante de Venta</p>
            <div className="mt-4 text-xs text-gray-600">
              <p>Cochabamba, Bolivia</p>
            </div>
          </div>
          <div className="text-right">
            <div className="bg-gray-900 text-white p-4 rounded-lg">
              <p className="text-[10px] font-bold opacity-60 uppercase">N° Pedido</p>
              <p className="text-2xl font-mono font-bold tracking-tighter">{venta.cod_venta}</p>
            </div>
            <p className="text-xs mt-2 font-bold text-gray-500 italic uppercase">Copia de Cliente</p>
          </div>
        </div>

        {/* INFO CLIENTE */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10 border-b border-gray-100 pb-8">
          <div>
            <p className="text-[10px] font-black text-gray-400 uppercase mb-2 tracking-widest">Datos del Cliente</p>
            <h3 className="text-xl font-bold text-gray-800 uppercase">{cliente?.nombre || 'Cliente General'}</h3>
            <p className="text-sm text-gray-600 mt-1 flex items-center gap-2"><Phone size={14}/> {cliente?.celular || 'Sin teléfono'}</p>
          </div>
          <div className="text-left md:text-right flex flex-col justify-end">
            <p className="text-sm text-gray-500">Fecha: <span className="font-bold text-gray-800">{new Date(venta.creado_en).toLocaleDateString()}</span></p>
            <div className="mt-2 inline-flex items-center gap-2 text-green-700 font-black text-sm bg-green-50 px-3 py-1 rounded-full w-fit md:ml-auto">
              <CheckCircle2 size={16}/> VENTA PAGADA
            </div>
          </div>
        </div>

        {/* TABLA DE PRODUCTOS */}
        <div className="mb-10">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b-2 border-gray-800">
                <th className="py-3 text-[11px] font-black text-gray-500 uppercase">Detalle del Producto</th>
                <th className="py-3 text-center text-[11px] font-black text-gray-500 uppercase">Cant.</th>
                <th className="py-3 text-right text-[11px] font-black text-gray-500 uppercase">Unitario</th>
                <th className="py-3 text-right text-[11px] font-black text-gray-500 uppercase">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {detalles.map((item, i) => (
                <tr key={i} className="text-sm">
                  <td className="py-4">
                    <p className="font-bold text-gray-800 uppercase">{item.cod_producto}</p>
                    <p className="text-[10px] text-gray-400 italic font-medium">{item.dimensiones}</p>
                  </td>
                  <td className="py-4 text-center font-bold text-gray-600">{item.cantidad}</td>
                  <td className="py-4 text-right text-gray-600">Bs. {parseFloat(item.precio_vendido).toFixed(2)}</td>
                  <td className="py-4 text-right font-black text-gray-900">Bs. {parseFloat(item.subtotal).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* TOTALES */}
        <div className="flex flex-col items-end pt-6 border-t-2 border-gray-100">
          <div className="w-full md:w-64 space-y-2">
            <div className="flex justify-between text-sm text-gray-500">
              <span>Total Venta:</span>
              <span className="font-bold text-gray-700">Bs. {parseFloat(venta.total_venta || 0).toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm text-gray-500">
              <span>Anticipo:</span>
              <span className="font-bold text-gray-700">Bs. {parseFloat(venta.anticipo || 0).toFixed(2)}</span>
            </div>
            <div className="flex justify-between bg-gray-900 text-white p-4 rounded-xl mt-4 shadow-xl">
              <span className="font-bold uppercase text-xs self-center">Monto Cancelado:</span>
              <span className="font-black text-2xl tracking-tighter">Bs. {parseFloat(venta.total_venta || 0).toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* PIE DE PÁGINA */}
        <div className="mt-20 border-t border-dashed pt-8 text-center">
          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-[0.3em]">Muebles is Better - Cochabamba</p>
        </div>
      </div>

      <style jsx global>{`
        @media print {
          body { background: white !important; margin: 0; padding: 0; }
          .print\:hidden { display: none !important; }
          @page { margin: 1cm; }
        }
      `}</style>
    </div>
  )
}