'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'

// ── Tipos ─────────────────────────────────────────────────────
interface DetalleVenta {
  id: number
  cod_producto: string
  cantidad: number
  color_estructura: string
  color_melamina: string
  producto_nombre?: string
  color_estructura_detalle?: string
  color_melamina_detalle?: string
}

interface Pedido {
  id: number
  cod_venta: number
  cliente: string
  fecha_entrega: string
  estado: number
  detalles: DetalleVenta[]
}

interface MaterialPresupuesto {
  id_fila: string
  cod_venta: number 
  codigo: string
  detalle: string
  cantidad: number
  tipo: 'variante' | 'manual'
}

// ── Página ────────────────────────────────────────────────────
export default function GestorPresupuestos() {
  const [usuario, setUsuario] = useState<any>(null)
  const [fecha, setFecha] = useState(() => new Date().toISOString().split('T')[0])
  const [nombreLote, setNombreLote] = useState('Lote Mañana')
  const [loading, setLoading] = useState(true)

  const [pedidosPendientes, setPedidosPendientes] = useState<Pedido[]>([])
  const [pedidosSeleccionados, setPedidosSeleccionados] = useState<Pedido[]>([])

  const [catalogoMateriales, setCatalogoMateriales] = useState<any[]>([])
  const [preciosEditables, setPreciosEditables] = useState<Record<string, number>>({})
  
  const [materialesLote, setMaterialesLote] = useState<MaterialPresupuesto[]>([])

  // Estados para adición manual / "A medida"
  const [manualCodigo, setManualCodigo] = useState('')
  const [manualDetalle, setManualDetalle] = useState('')
  const [manualCantidad, setManualCantidad] = useState('')
  const [manualPrecio, setManualPrecio] = useState('')

  useEffect(() => {
    const carnetGuardado = localStorage.getItem('carnet')
    if (!carnetGuardado) {
      window.location.replace('/')
      return
    }

    supabase
      .from('personal')
      .select('*, cargos(*)')
      .eq('carnet', carnetGuardado)
      .eq('estado', true)
      .single()
      .then(({ data }) => {
        if (!data) {
          window.location.replace('/')
          return
        }
        setUsuario(data)
        cargarInventarioYCatalogos()
      })
  }, [])

  useEffect(() => {
    if (usuario) {
      cargarPedidosPorFecha()
    }
  }, [fecha, usuario])

  // Carga robusta de todas las tablas de inventario y variantes
  const cargarInventarioYCatalogos = async () => {
    try {
      const [resAceros, resMelaminas, resColores, resInsumos, resAccesorios] = await Promise.all([
        supabase.from('aceros').select('*'),
        supabase.from('melaminas').select('*'),
        supabase.from('colores').select('*'),
        supabase.from('insumos').select('*'),
        supabase.from('accesorios').select('*').then(
          res => res,
          () => ({ data: [] })
        )
      ])

      const catalogoCompleto: any[] = []
      const preciosIniciales: Record<string, number> = {}

      // 1. Aceros / Tubos
      resAceros.data?.forEach(item => {
        const codigo = String(item.codigo_acero || item.id || '')
        const detalle = item.detalle || item.nombre || 'Acero sin nombre'
        if (codigo) {
          catalogoCompleto.push({ codigo, detalle: `Acero/Tubo: ${detalle}` })
          preciosIniciales[codigo] = parseFloat(item.precio_compra || item.precio || 0)
        }
      })

      // 2. Melaminas
      resMelaminas.data?.forEach(item => {
        const codigoText = item.codigo_melamina ? String(item.codigo_melamina) : ''
        const codigoId = item.id ? String(item.id) : ''
        const detalle = item.detalle || 'Melamina sin nombre'
        const precio = parseFloat(item.precio_compra || item.precio || 0)

        if (codigoText) {
          catalogoCompleto.push({ codigo: codigoText, detalle: `Melamina: ${detalle}` })
          preciosIniciales[codigoText] = precio
        }
        if (codigoId) {
          preciosIniciales[codigoId] = precio
        }
      })

      // 3. Colores / Estructuras
      resColores.data?.forEach(item => {
        const codigoText = item.codigo_color ? String(item.codigo_color) : ''
        const codigoId = item.id ? String(item.id) : ''
        const detalle = item.detalle || 'Color sin nombre'
        const precio = parseFloat(item.precio_compra || item.precio || 0)

        if (codigoText) {
          catalogoCompleto.push({ codigo: codigoText, detalle: `Color/Estructura: ${detalle}` })
          preciosIniciales[codigoText] = precio
        }
        if (codigoId) {
          preciosIniciales[codigoId] = precio
        }
      })

      // 4. Insumos
      resInsumos.data?.forEach(item => {
        const codigo = String(item.codigo_insumo || item.id || '')
        const detalle = item.detalle || 'Insumo sin nombre'
        if (codigo) {
          catalogoCompleto.push({ codigo, detalle: `Insumo: ${detalle}` })
          preciosIniciales[codigo] = parseFloat(item.precio_compra || item.precio || 0)
        }
      })

      // 5. Accesorios
      resAccesorios.data?.forEach((item: any) => {
        const codigo = String(item.codigo_accesorio || item.id || '')
        const detalle = item.detalle || item.nombre || 'Accesorio sin nombre'
        if (codigo) {
          catalogoCompleto.push({ codigo, detalle: `Accesorio: ${detalle}` })
          preciosIniciales[codigo] = parseFloat(item.precio_compra || item.precio || 0)
        }
      })

      setCatalogoMateriales(catalogoCompleto)
      setPreciosEditables(preciosIniciales)
    } catch (error) {
      console.error('Error cargando catálogos:', error)
    }
  }

  const cargarPedidosPorFecha = async () => {
    setLoading(true)
    try {
      const { data: ventasData, error } = await supabase
        .from('ventas')
        .select('id, cod_venta, cod_cliente, fecha_entrega, estado')
        .eq('fecha_entrega', fecha)
        .in('estado', [1, 2])

      if (error) throw error

      if (!ventasData || ventasData.length === 0) {
        setPedidosPendientes([])
        setLoading(false)
        return
      }

      const clientesIds = [...new Set(ventasData.map(v => v.cod_cliente))]
      const { data: clientesData } = await supabase.from('clientes').select('id, nombre').in('id', clientesIds)
      const clientesMap = Object.fromEntries(clientesData?.map(c => [c.id, c.nombre]) || [])

      const codigosVenta = ventasData.map(v => v.cod_venta)
      const { data: detallesData } = await supabase.from('detalle_venta').select('*').in('cod_venta', codigosVenta)

      const codigosProd = [...new Set((detallesData || []).map(d => d.cod_producto).filter(Boolean))]
      
      const [{ data: prodData }, { data: coloresData }, { data: melaminasData }] = await Promise.all([
        codigosProd.length > 0
          ? supabase.from('productos').select('codigo, nombre').in('codigo', codigosProd)
          : Promise.resolve({ data: [] }),
        supabase.from('colores').select('*'),
        supabase.from('melaminas').select('*')
      ])

      const prodMap = Object.fromEntries(prodData?.map(p => [String(p.codigo), p.nombre]) || [])

      const coloresMap: Record<string, string> = {}
      coloresData?.forEach((c: any) => {
        if (c.id) coloresMap[String(c.id)] = c.detalle || c.nombre
        if (c.codigo_color) coloresMap[String(c.codigo_color)] = c.detalle || c.nombre
      })

      const melaminasMap: Record<string, string> = {}
      melaminasData?.forEach((m: any) => {
        if (m.id) melaminasMap[String(m.id)] = m.detalle || m.nombre
        if (m.codigo_melamina) melaminasMap[String(m.codigo_melamina)] = m.detalle || m.nombre
      })

      const pedidosProcesados = ventasData.map(v => {
        const detalles = (detallesData || [])
          .filter(d => d.cod_venta === v.cod_venta)
          .map(d => ({
            ...d,
            producto_nombre: prodMap[String(d.cod_producto)] || d.cod_producto,
            color_estructura_detalle: coloresMap[String(d.color_estructura)] || d.color_estructura || 'N/A',
            color_melamina_detalle: melaminasMap[String(d.color_melamina)] || d.color_melamina || 'N/A'
          }))

        return {
          id: v.id,
          cod_venta: v.cod_venta,
          cliente: clientesMap[v.cod_cliente] || 'Sin cliente',
          fecha_entrega: v.fecha_entrega,
          estado: v.estado,
          detalles
        }
      })

      const seleccionadosIds = pedidosSeleccionados.map(s => s.cod_venta)
      setPedidosPendientes(pedidosProcesados.filter(p => !seleccionadosIds.includes(p.cod_venta)))

    } catch (error) {
      console.error(error)
      alert('Error cargando pedidos del día')
    } finally {
      setLoading(false)
    }
  }

  // ── Interacciones ───────────────────────────────────────────
  const moverAPresupuesto = (pedido: Pedido) => {
    setPedidosSeleccionados([...pedidosSeleccionados, pedido])
    setPedidosPendientes(pedidosPendientes.filter(p => p.cod_venta !== pedido.cod_venta))
  }

  const devolverAPendientes = (pedido: Pedido) => {
    setPedidosPendientes([...pedidosPendientes, pedido])
    setPedidosSeleccionados(pedidosSeleccionados.filter(p => p.cod_venta !== pedido.cod_venta))
    setMaterialesLote(prev => prev.filter(m => m.cod_venta !== pedido.cod_venta))
  }

  const agregarVarianteALista = (pedidoId: number, codigo: string, detalle: string, cantidad: number) => {
    if (!codigo) return
    setMaterialesLote(prev => [
      ...prev,
      {
        id_fila: Math.random().toString(36).substr(2, 9),
        cod_venta: pedidoId,
        codigo: String(codigo),
        detalle: `[Pedido #${pedidoId}] ${detalle}`,
        cantidad: cantidad,
        tipo: 'variante'
      }
    ])
  }

  const agregarPiezaAMedida = () => {
    if (!manualDetalle || !manualCantidad) {
      alert('Completa al menos el detalle y la cantidad de la pieza a medida.')
      return
    }

    const codigoGenerado = manualCodigo.trim() || `MEDIDA-${Math.floor(Math.random() * 900 + 100)}`
    const precioUnit = parseFloat(manualPrecio) || 0

    setPreciosEditables(prev => ({
      ...prev,
      [codigoGenerado]: precioUnit
    }))

    setMaterialesLote(prev => [
      ...prev,
      {
        id_fila: Math.random().toString(36).substr(2, 9),
        cod_venta: 0,
        codigo: codigoGenerado,
        detalle: `[A Medida] ${manualDetalle}`,
        cantidad: parseFloat(manualCantidad),
        tipo: 'manual'
      }
    ])

    setManualCodigo('')
    setManualDetalle('')
    setManualCantidad('')
    setManualPrecio('')
  }

  const eliminarFilaMaterial = (id_fila: string) => {
    setMaterialesLote(prev => prev.filter(m => m.id_fila !== id_fila))
  }

  const cambiarPrecio = (codigo: string, nuevoValor: string) => {
    setPreciosEditables(prev => ({
      ...prev,
      [codigo]: parseFloat(nuevoValor) || 0
    }))
  }

  // ── Cálculos ────────────────────────────────────────────────
  const calculoFinal = useMemo(() => {
    let granTotal = 0
    const agrupado: Record<string, { detalle: string, cant: number }> = {}

    materialesLote.forEach(m => {
      if (agrupado[m.codigo]) {
        agrupado[m.codigo].cant += m.cantidad
      } else {
        agrupado[m.codigo] = { detalle: m.detalle, cant: m.cantidad }
      }
    })

    const lista = Object.keys(agrupado).map(codigo => {
      const precioUnitario = preciosEditables[codigo] || 0
      const subtotal = agrupado[codigo].cant * precioUnitario
      granTotal += subtotal
      return {
        codigo,
        detalle: agrupado[codigo].detalle,
        cant: agrupado[codigo].cant,
        precioUnitario,
        subtotal
      }
    })

    return { lista, granTotal }
  }, [materialesLote, preciosEditables])

  // ── Render ──────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f5f5f5', fontFamily: 'Arial, sans-serif' }}>
      
      {/* NAVBAR */}
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 40px', backgroundColor: '#222', color: 'white', flexWrap: 'wrap', gap: '10px' }}>
        <a href="/sistema" style={{ color: 'white', textDecoration: 'none', fontWeight: 'bold', fontSize: '20px' }}>
          ← Sistema
        </a>
        <span style={{ color: '#C5A059', fontWeight: 'bold' }}>Armado de Presupuestos (Lotes)</span>
        <span style={{ fontSize: '14px' }}>{usuario?.usuario || usuario?.nombre || 'Usuario'} 👤</span>
      </nav>

      <div style={{ padding: '25px', maxWidth: '1600px', margin: '0 auto' }}>
        
        {/* CONFIGURACIÓN DEL LOTE */}
        <div style={{ display: 'flex', gap: '20px', backgroundColor: '#0B1E36', padding: '20px', borderRadius: '12px', color: 'white', alignItems: 'flex-end', marginBottom: '25px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', marginBottom: '6px', color: '#C5A059' }}>Fecha de Producción</label>
            <input 
              type="date" 
              value={fecha} 
              onChange={(e) => setFecha(e.target.value)} 
              style={{ padding: '10px', borderRadius: '6px', border: 'none', fontSize: '14px', outline: 'none' }} 
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', marginBottom: '6px', color: '#C5A059' }}>Identificador del Presupuesto</label>
            <input 
              type="text" 
              value={nombreLote} 
              onChange={(e) => setNombreLote(e.target.value)} 
              style={{ padding: '10px', borderRadius: '6px', border: 'none', fontSize: '14px', outline: 'none', width: '300px' }} 
              placeholder="Ej. Turno Mañana, Lote 1..." 
            />
          </div>
          <div style={{ marginLeft: 'auto' }}>
            <h1 style={{ margin: 0, fontSize: '24px', color: '#C5A059' }}>MuebLess is Better</h1>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '25px', alignItems: 'flex-start' }}>
          
          {/* COLUMNA IZQUIERDA: Pedidos Pendientes */}
          <div style={{ flex: '1', backgroundColor: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 12px rgba(0,0,0,0.05)' }}>
            <h2 style={{ margin: '0 0 15px 0', fontSize: '18px', color: '#0B1E36', borderBottom: '2px solid #C5A059', paddingBottom: '10px' }}>
              Pedidos para el {fecha}
            </h2>
            
            {loading ? <p style={{ color: '#666' }}>Cargando pedidos...</p> : null}
            {!loading && pedidosPendientes.length === 0 ? <p style={{ color: '#666', fontSize: '14px' }}>No hay pedidos pendientes para esta fecha.</p> : null}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              {pedidosPendientes.map(pedido => (
                <div key={pedido.cod_venta} style={{ border: '1px solid #eee', borderRadius: '8px', padding: '12px', backgroundColor: '#fafafa' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <strong style={{ color: '#0B1E36', fontSize: '16px' }}>#{pedido.cod_venta} - {pedido.cliente}</strong>
                    <button onClick={() => moverAPresupuesto(pedido)} style={{ backgroundColor: '#C5A059', color: '#0B1E36', border: 'none', padding: '6px 12px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>
                      + Seleccionar Pedido
                    </button>
                  </div>
                  
                  <div style={{ fontSize: '12px', color: '#555', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {pedido.detalles.map(d => (
                      <div key={d.id} style={{ borderLeft: '3px solid #0B1E36', paddingLeft: '8px' }}>
                        {d.cantidad}x {d.producto_nombre} (Estructura: {d.color_estructura_detalle} | Melamina: {d.color_melamina_detalle})
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* COLUMNA DERECHA: Gestión de Variantes y Lote */}
          <div style={{ flex: '1.5', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {/* PANEL DE SELECCIÓN DE VARIANTES DE PEDIDOS */}
            <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 12px rgba(0,0,0,0.05)' }}>
              <h2 style={{ margin: '0 0 15px 0', fontSize: '18px', color: '#0B1E36', borderBottom: '2px solid #C5A059', paddingBottom: '10px' }}>
                1. Variantes y Materiales de los Pedidos Seleccionados
              </h2>

              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '15px' }}>
                {pedidosSeleccionados.length === 0 && <span style={{ fontSize: '13px', fontStyle: 'italic', color: '#999' }}>Ningún pedido seleccionado todavía. Elige uno a la izquierda.</span>}
                {pedidosSeleccionados.map(p => (
                  <span key={p.cod_venta} style={{ backgroundColor: '#0B1E36', color: 'white', padding: '4px 10px', borderRadius: '12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    #{p.cod_venta} - {p.cliente}
                    <button onClick={() => devolverAPendientes(p)} style={{ background: 'none', border: 'none', color: '#C5A059', cursor: 'pointer', fontWeight: 'bold' }}>✕</button>
                  </span>
                ))}
              </div>

              {pedidosSeleccionados.map(pedido => (
                <div key={pedido.cod_venta} style={{ marginBottom: '15px', padding: '12px', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontWeight: 'bold', color: '#0B1E36', marginBottom: '8px' }}>Pedido #{pedido.cod_venta} ({pedido.cliente})</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {pedido.detalles.map(d => (
                      <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'white', padding: '8px 12px', borderRadius: '6px', border: '1px solid #eee', fontSize: '13px' }}>
                        <div>
                          <strong>{d.cantidad}x {d.producto_nombre}</strong>
                          <div style={{ color: '#555', fontSize: '12px' }}>
                            • Estructura/Tubo: {d.color_estructura_detalle} | • Melamina: {d.color_melamina_detalle}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          {d.color_estructura && (
                            <button 
                              onClick={() => agregarVarianteALista(pedido.cod_venta, d.color_estructura, `Estructura/Tubo: ${d.color_estructura_detalle} (${d.producto_nombre})`, d.cantidad)}
                              style={{ backgroundColor: '#0B1E36', color: 'white', border: 'none', padding: '5px 10px', borderRadius: '4px', fontSize: '11px', cursor: 'pointer' }}
                            >
                              + Copiar Tubo
                            </button>
                          )}
                          {d.color_melamina && (
                            <button 
                              onClick={() => agregarVarianteALista(pedido.cod_venta, d.color_melamina, `Melamina: ${d.color_melamina_detalle} (${d.producto_nombre})`, d.cantidad)}
                              style={{ backgroundColor: '#C5A059', color: '#0B1E36', border: 'none', padding: '5px 10px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}
                            >
                              + Copiar Melamina
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* PANEL DE PIEZAS A MEDIDA / MANUALES */}
            <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 12px rgba(0,0,0,0.05)' }}>
              <h2 style={{ margin: '0 0 15px 0', fontSize: '18px', color: '#0B1E36', borderBottom: '2px solid #C5A059', paddingBottom: '10px' }}>
                2. Agregar Piezas "A Medida" o Manuales
              </h2>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                <input 
                  type="text" 
                  placeholder="Código (opcional)" 
                  value={manualCodigo} 
                  onChange={(e) => setManualCodigo(e.target.value)}
                  style={{ width: '130px', padding: '8px', borderRadius: '4px', border: '1px solid #ccc', fontSize: '13px' }}
                />
                <input 
                  type="text" 
                  placeholder="Detalle de la pieza a medida..." 
                  value={manualDetalle} 
                  onChange={(e) => setManualDetalle(e.target.value)}
                  style={{ flex: 1, minWidth: '180px', padding: '8px', borderRadius: '4px', border: '1px solid #ccc', fontSize: '13px' }}
                />
                <input 
                  type="number" 
                  placeholder="Cant." 
                  value={manualCantidad} 
                  onChange={(e) => setManualCantidad(e.target.value)}
                  style={{ width: '70px', padding: '8px', borderRadius: '4px', border: '1px solid #ccc', fontSize: '13px' }}
                />
                <input 
                  type="number" 
                  placeholder="Precio Unit." 
                  value={manualPrecio} 
                  onChange={(e) => setManualPrecio(e.target.value)}
                  style={{ width: '90px', padding: '8px', borderRadius: '4px', border: '1px solid #ccc', fontSize: '13px' }}
                />
                <button onClick={agregarPiezaAMedida} style={{ backgroundColor: '#0B1E36', color: '#C5A059', border: 'none', padding: '8px 14px', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', fontSize: '13px' }}>
                  + Agregar Pieza
                </button>
              </div>
            </div>

            {/* TABLA FINAL DE PRESUPUESTO CONSOLIDADO */}
            <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 12px rgba(0,0,0,0.05)' }}>
              <h2 style={{ margin: '0 0 15px 0', fontSize: '18px', color: '#0B1E36', borderBottom: '2px solid #C5A059', paddingBottom: '10px' }}>
                3. Presupuesto Consolidado: {nombreLote}
              </h2>

              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f1f5f9', color: '#0B1E36' }}>
                    <th style={{ padding: '12px', textAlign: 'left', fontSize: '13px' }}>Código</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontSize: '13px' }}>Pieza / Material / Variante</th>
                    <th style={{ padding: '12px', textAlign: 'right', fontSize: '13px' }}>Cantidad</th>
                    <th style={{ padding: '12px', textAlign: 'right', fontSize: '13px' }}>Precio Unit. (Bs)</th>
                    <th style={{ padding: '12px', textAlign: 'right', fontSize: '13px' }}>Subtotal</th>
                    <th style={{ padding: '12px', textAlign: 'center', fontSize: '13px' }}>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {calculoFinal.lista.length === 0 && (
                    <tr><td colSpan={6} style={{ padding: '20px', textAlign: 'center', color: '#999' }}>Copia variantes de los pedidos o agrega piezas a medida arriba</td></tr>
                  )}
                  {calculoFinal.lista.map((item) => (
                    <tr key={item.codigo} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ padding: '12px', fontSize: '14px', fontWeight: 'bold', color: '#0B1E36' }}>{item.codigo}</td>
                      <td style={{ padding: '12px', fontSize: '14px' }}>{item.detalle}</td>
                      <td style={{ padding: '12px', fontSize: '14px', textAlign: 'right' }}>{item.cant}</td>
                      <td style={{ padding: '12px', textAlign: 'right' }}>
                        <input 
                          type="number" 
                          value={preciosEditables[item.codigo] ?? ''} 
                          onChange={(e) => cambiarPrecio(item.codigo, e.target.value)}
                          style={{ width: '80px', padding: '6px', textAlign: 'right', border: '1px solid #ccc', borderRadius: '4px' }}
                        />
                      </td>
                      <td style={{ padding: '12px', fontSize: '14px', textAlign: 'right', fontWeight: 'bold' }}>
                        Bs. {item.subtotal.toFixed(2)}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        <button 
                          onClick={() => {
                            const matARemover = materialesLote.find(m => m.codigo === item.codigo)
                            if (matARemover) eliminarFilaMaterial(matARemover.id_fila)
                          }}
                          style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontWeight: 'bold' }}
                          title="Eliminar elemento"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={4} style={{ padding: '16px 12px', textAlign: 'right', fontWeight: 'bold', color: '#0B1E36', fontSize: '16px' }}>
                      TOTAL DEL LOTE:
                    </td>
                    <td colSpan={2} style={{ padding: '16px 12px', textAlign: 'right', fontWeight: 'bold', color: '#C5A059', fontSize: '18px', backgroundColor: '#0B1E36', borderRadius: '0 0 8px 0' }}>
                      Bs. {calculoFinal.granTotal.toFixed(2)}
                    </td>
                  </tr>
                </tfoot>
              </table>

            </div>

          </div>
        </div>
      </div>
    </div>
  )
}