'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

// ── Tipos ────────────────────────────────────────────────────────────────────
interface Venta {
  id: number
  cod_venta: number
  cod_cliente: number | null
  cod_vendedor: number | null
  fecha_pedido: string | null
  fecha_entrega: string | null
  hora_entrega: string | null
  delivery_cotizado: number | null
  delivery_pagado: number | null
  total_venta: number | null
  anticipo: number | null
  forma_pago: string | null
  cod_transaccion: string | null
  estado: number | null
  nombre_cliente?: string
  nombre_vendedor?: string
  detalles?: DetalleVenta[]
}

interface DetalleVenta {
  id: number
  cod_venta: number
  item: number | null
  cod_producto: string | null
  precio_cotizado: number | null
  precio_vendido: number | null
  cantidad: number | null
  subtotal: number | null
  dimensiones: string | null
  color_estructura: string | null
  color_melamina: string | null
}

const ESTADOS = [
  { value: 1, label: 'En cola de producción', color: '#ffa726' },
  { value: 2, label: 'Produciendo', color: '#42a5f5' },
  { value: 3, label: 'Terminado', color: '#66bb6a' },
  { value: 4, label: 'Despachado', color: '#ab47bc' },
  { value: 5, label: 'Entregado', color: '#26a69a' }
]

const fmtFecha = (v: string | null | undefined) => {
  if (!v) return '—'
  try { return new Date(v + 'T00:00:00').toLocaleDateString('es-BO', { day: '2-digit', month: '2-digit', year: 'numeric' }) }
  catch { return v }
}

export default function Produccion() {
  const [usuario, setUsuario] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [accesoDenegado, setAccesoDenegado] = useState(false)
  const [ventas, setVentas] = useState<Venta[]>([])
  const [loadingVentas, setLoadingVentas] = useState(false)

  useEffect(() => {
    const carnetGuardado = localStorage.getItem('carnet')
    if (!carnetGuardado) { window.location.replace('/'); return }
    supabase.from('personal').select('*, cargos(*)')
      .eq('carnet', carnetGuardado)
      .eq('estado', true)
      .single()
      .then(({ data }) => {
        if (!data) window.location.replace('/')
        else {
          const esProduccion = data.cargos?.puede_ver_produccion === true
          const esAdmin = data.cargos?.es_admin === true
          if (!esProduccion && !esAdmin) {
            setAccesoDenegado(true)
            setLoading(false)
            return
          }
          setUsuario(data)
          setLoading(false)
          cargarVentas()
        }
      })
  }, [])

  // Refrescar ventas cada minuto
  useEffect(() => {
    const intervalo = setInterval(() => {
      cargarVentas()
    }, 60000) // 60000 ms = 1 minuto

    return () => clearInterval(intervalo)
  }, [])

  const cargarVentas = async () => {
    setLoadingVentas(true)
    try {
      // Obtener ventas con estado 1-3
      const { data: ventasData, error } = await supabase
        .from('ventas')
        .select('*')
        .not('estado', 'is', null)
        .gte('estado', 1)
        .lte('estado', 3)
        .order('fecha_pedido', { ascending: false })

      if (error) {
        console.error('Error en query ventas:', error)
        throw error
      }

      // Obtener clientes
      const codClientes = ventasData.map(v => v.cod_cliente).filter(Boolean)
      const { data: clientesData } = await supabase
        .from('clientes')
        .select('id, nombre')
        .in('id', codClientes)

      const clientesMap = Object.fromEntries(clientesData?.map(c => [c.id, c.nombre]) || [])

      // Obtener vendedores
      const codVendedores = ventasData.map(v => v.cod_vendedor).filter(Boolean)
      const { data: vendedoresData } = await supabase
        .from('vendedores')
        .select('id, nombre')
        .in('id', codVendedores)

      const vendedoresMap = Object.fromEntries(vendedoresData?.map(v => [v.id, v.nombre]) || [])

      // Obtener detalles
      const codVentas = ventasData.map(v => v.cod_venta)
      const { data: detallesData } = await supabase
        .from('detalle_venta')
        .select('*')
        .in('cod_venta', codVentas)

      const detallesMap = detallesData?.reduce((acc, d) => {
        if (!acc[d.cod_venta]) acc[d.cod_venta] = []
        acc[d.cod_venta].push(d)
        return acc
      }, {}) || {}

      // Procesar datos
      const ventasProcesadas = ventasData.map((venta: any) => ({
        ...venta,
        nombre_cliente: clientesMap[venta.cod_cliente] || 'Sin cliente',
        nombre_vendedor: vendedoresMap[venta.cod_vendedor] || 'Sin vendedor',
        detalles: detallesMap[venta.cod_venta] || []
      }))

      setVentas(ventasProcesadas)
    } catch (error) {
      console.error('Error cargando ventas:', error)
      alert('Error al cargar las ventas de producción')
    } finally {
      setLoadingVentas(false)
    }
  }

  const cambiarEstado = async (codVenta: number, nuevoEstado: number) => {
    try {
      const ventaActual = ventas.find(v => v.cod_venta === codVenta)
      if (!ventaActual) return

      const estadoActualNumero = ventaActual.estado ?? 1

      // No permitir reducir estado ni exceder 3
      if (nuevoEstado < estadoActualNumero || nuevoEstado > 3) {
        alert('Solo se permiten estados 1-3 en producción.')
        return
      }

      // Verificar permisos para estado 5
      if (nuevoEstado === 5 && usuario?.cargos?.nombre !== 'Cobranza' && !usuario?.cargos?.es_admin) {
        alert('Solo el usuario de cobranza puede marcar como entregado')
        return
      }

      // Confirmar el cambio
      const estadoActual = ESTADOS.find(e => e.value === estadoActualNumero)?.label || 'desconocido'
      const estadoNuevo = ESTADOS.find(e => e.value === nuevoEstado)?.label || 'desconocido'
      const confirmacion = window.confirm(
        `¿Cambiar de "${estadoActual}" a "${estadoNuevo}"?\n\nEste cambio es irreversible.`
      )

      if (!confirmacion) return

      // Actualizar estado en ventas
      const { error: updateError } = await supabase
        .from('ventas')
        .update({ estado: nuevoEstado, actualizado_en: new Date().toISOString() })
        .eq('cod_venta', codVenta)

      if (updateError) throw updateError

      // Manejar progreso_produccion
      const { data: progresoExistente } = await supabase
        .from('progreso_produccion')
        .select('*')
        .eq('codigo_pedido', codVenta)
        .single()

      const updateData: any = {
        estado: nuevoEstado,
        updated_at: new Date().toISOString()
      }

      // Registrar fecha_produccion cuando cambia a estado 2 (produciendo)
      if (nuevoEstado === 2 && progresoExistente && !progresoExistente.fecha_produccion) {
        updateData.fecha_produccion = new Date().toISOString().split('T')[0]
      }

      // Registrar fecha_entregado cuando cambia a estado 5 (entregado)
      if (nuevoEstado === 5 && progresoExistente && !progresoExistente.fecha_entregado) {
        updateData.fecha_entregado = new Date().toISOString().split('T')[0]
      }

      if (!progresoExistente) {
        // Insertar nuevo
        updateData.codigo_pedido = codVenta
        updateData.fecha_ingreso = ventaActual.fecha_pedido
        if (nuevoEstado === 2) updateData.fecha_produccion = new Date().toISOString().split('T')[0]
        if (nuevoEstado === 5) updateData.fecha_entregado = new Date().toISOString().split('T')[0]

        const { error: insertError } = await supabase
          .from('progreso_produccion')
          .insert(updateData)

        if (insertError) throw insertError
      } else {
        // Actualizar existente
        const { error: updateProgresoError } = await supabase
          .from('progreso_produccion')
          .update(updateData)
          .eq('codigo_pedido', codVenta)

        if (updateProgresoError) throw updateProgresoError
      }

      // Actualizar estado local
      setVentas(prev => prev.map(v =>
        v.cod_venta === codVenta ? { ...v, estado: nuevoEstado } : v
      ))

      alert('Estado actualizado correctamente')
    } catch (error) {
      console.error('Error cambiando estado:', error)
      alert('Error al cambiar el estado')
    }
  }

  if (loading) return <p style={{ textAlign: 'center', marginTop: '100px' }}>Cargando...</p>
  if (accesoDenegado) return <p style={{ textAlign: 'center', marginTop: '100px', color: 'red' }}>Acceso denegado. Solo usuarios de producción pueden acceder.</p>

  const nombreMostrar = usuario?.usuario || usuario?.nombre || usuario?.carnet || 'Usuario'

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', minHeight: '100vh', backgroundColor: '#f5f5f5' }}>
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 40px', backgroundColor: '#222', color: 'white', boxSizing: 'border-box' as const }}>
        <a href="/sistema" style={{ fontWeight: 'bold', fontSize: '20px', color: 'white', textDecoration: 'none' }}>← Sistema</a>
        <span style={{ color: '#a3c47d', fontWeight: 'bold' }}>Producción</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ color: 'white', fontSize: '14px' }}>{nombreMostrar} 👤</span>
          <a href="/" style={{ backgroundColor: 'transparent', color: '#ff6b6b', border: '1px solid #ff6b6b', padding: '5px 12px', borderRadius: '20px', fontSize: '12px', textDecoration: 'none' }}>
            Salir
          </a>
        </div>
      </nav>

      <div style={{ padding: '40px', maxWidth: '1400px', margin: '0 auto' }}>
        <h1 style={{ marginBottom: '8px' }}>Panel de Producción 🏭</h1>
        <p style={{ color: '#666', marginBottom: '40px' }}>Gestiona el progreso de fabricación de los productos vendidos</p>

        {loadingVentas ? (
          <p>Cargando ventas...</p>
        ) : ventas.length === 0 ? (
          <p>No hay ventas en producción</p>
        ) : (
          <div style={{ display: 'grid', gap: '20px' }}>
            {ventas.map(venta => (
              <div key={venta.cod_venta} style={{ backgroundColor: 'white', borderRadius: '16px', padding: '24px', boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h3 style={{ margin: 0 }}>Pedido #{venta.cod_venta}</h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{
                      backgroundColor: ESTADOS.find(e => e.value === venta.estado)?.color || '#ccc',
                      color: 'white',
                      padding: '4px 12px',
                      borderRadius: '20px',
                      fontSize: '12px',
                      fontWeight: 'bold'
                    }}>
                      {ESTADOS.find(e => e.value === venta.estado)?.label || 'Desconocido'}
                    </span>
                    <select
                      value={venta.estado || ''}
                      onChange={(e) => cambiarEstado(venta.cod_venta, parseInt(e.target.value))}
                      style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #ddd' }}
                    >
                      {ESTADOS.filter(estado => {
                        // Solo estados 1-3 para producción
                        return estado.value >= 1 && estado.value <= 3
                      }).map(estado => (
                        <option key={estado.value} value={estado.value}>{estado.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '20px' }}>
                  <div>
                    <strong>Cliente:</strong> {venta.nombre_cliente}
                  </div>
                  <div>
                    <strong>Vendedor:</strong> {venta.nombre_vendedor}
                  </div>
                  <div>
                    <strong>Fecha Pedido:</strong> {fmtFecha(venta.fecha_pedido)}
                  </div>
                  <div>
                    <strong>Fecha Entrega:</strong> {fmtFecha(venta.fecha_entrega)}
                  </div>
                </div>

                <div>
                  <h4 style={{ marginBottom: '12px' }}>Productos a Fabricar:</h4>
                  <div style={{ display: 'grid', gap: '8px' }}>
                    {venta.detalles?.map(detalle => (
                      <div key={detalle.id} style={{ backgroundColor: '#f9f9f9', padding: '12px', borderRadius: '8px', borderLeft: '4px solid #42a5f5' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <strong>{detalle.cod_producto}</strong> - Cantidad: {detalle.cantidad}
                          </div>
                          <div style={{ fontSize: '14px', color: '#666' }}>
                            Dimensiones: {detalle.dimensiones || 'N/A'}
                          </div>
                        </div>
                        <div style={{ marginTop: '4px', fontSize: '14px', color: '#666' }}>
                          Estructura: {detalle.color_estructura || 'N/A'} | Melamina: {detalle.color_melamina || 'N/A'}
                        </div>
                      </div>
                    )) || <p>No hay detalles</p>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}