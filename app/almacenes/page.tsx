'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

interface Sucursal {
  id: number
  nombre: string
}

interface ItemStock {
  id: number
  sucursal_id: number
  codigo: string
  detalle: string
  cantidad: number
  categoria: 'melamina' | 'accesorio' | 'acero' | 'insumo'
}

interface RetazoMelamina {
  id: number
  sucursal_id: number
  codigo_melamina: string
  detalle: string
  largo_cm: number
  ancho_cm: number
  cantidad: number
}

interface ItemCatalogo {
  codigo: string
  detalle: string
}

export default function GestorAlmacenes() {
  const [sucursales, setSucursales] = useState<Sucursal[]>([])
  const [sucursalSeleccionada, setSucursalSeleccionada] = useState<number | null>(null)
  const [categoriaActiva, setCategoriaActiva] = useState<'melamina' | 'accesorio' | 'acero' | 'insumo'>('melamina')
  
  // Sub-vista específica para melaminas (Planchas enteras vs Retazos con medidas)
  const [subVistaMelamina, setSubVistaMelamina] = useState<'planchas' | 'retazos'>('planchas')

  const [inventario, setInventario] = useState<ItemStock[]>([])
  const [retazos, setRetazos] = useState<RetazoMelamina[]>([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')

  // Modales Stock Normal
  const [itemEditando, setItemEditando] = useState<ItemStock | null>(null)
  const [nuevaCantidad, setNuevaCantidad] = useState('')
  const [modalNuevoAbierto, setModalNuevoAbierto] = useState(false)
  const [catalogoDisponible, setCatalogoDisponible] = useState<ItemCatalogo[]>([])
  const [codigoSeleccionado, setCodigoSeleccionado] = useState('')
  const [cantidadInicial, setCantidadInicial] = useState('')

  // Modales Retazos de Melamina
  const [modalRetazoAbierto, setModalRetazoAbierto] = useState(false)
  const [largoRetazo, setLargoRetazo] = useState('')
  const [anchoRetazo, setAnchoRetazo] = useState('')
  const [cantidadRetazo, setCantidadRetazo] = useState('')
  const [retazoEditando, setRetazoEditando] = useState<RetazoMelamina | null>(null)

  useEffect(() => {
    cargarSucursales()
  }, [])

  useEffect(() => {
    if (sucursalSeleccionada) {
      if (categoriaActiva === 'melamina' && subVistaMelamina === 'retazos') {
        cargarRetazosSucursal(sucursalSeleccionada)
      } else {
        cargarInventarioSucursal(sucursalSeleccionada, categoriaActiva)
      }
    }
  }, [sucursalSeleccionada, categoriaActiva, subVistaMelamina])

  const cargarSucursales = async () => {
    const { data, error } = await supabase.from('sucursales').select('*')
    if (error) {
      console.error('Error cargando sucursales:', error)
      return
    }
    if (data && data.length > 0) {
      setSucursales(data)
      setSucursalSeleccionada(data[0].id)
    }
  }

  const cargarInventarioSucursal = async (sucursalId: number, categoria: string) => {
    setLoading(true)
    let tablaStock = ''
    let tablaCatalogo = ''
    let colCodigoStock = ''
    let colCodigoCat = ''

    if (categoria === 'melamina') {
      tablaStock = 'stock_melaminas'
      tablaCatalogo = 'melaminas'
      colCodigoStock = 'codigo_melamina'
      colCodigoCat = 'codigo_melamina'
    } else if (categoria === 'accesorio') {
      tablaStock = 'stock_accesorios'
      tablaCatalogo = 'accesorios'
      colCodigoStock = 'codigo_accesorio'
      colCodigoCat = 'codigo_accesorio'
    } else if (categoria === 'acero') {
      tablaStock = 'stock_aceros'
      tablaCatalogo = 'aceros'
      colCodigoStock = 'codigo_acero'
      colCodigoCat = 'codigo_acero'
    } else if (categoria === 'insumo') {
      tablaStock = 'stock_insumos'
      tablaCatalogo = 'insumos'
      colCodigoStock = 'codigo_insumos'
      colCodigoCat = 'codigo_insumos'
    }

    try {
      const { data: stockData, error: stockError } = await supabase
        .from(tablaStock)
        .select('*')
        .eq('sucursal_id', sucursalId)

      if (stockError) throw stockError

      const { data: catData, error: catError } = await supabase.from(tablaCatalogo).select('*')
      if (catError) throw catError

      const catalogoMap = Object.fromEntries(
        (catData || []).map(item => [
          String(item[colCodigoCat]),
          item.detalle || item.descripcion || item.tipo || item[colCodigoCat]
        ])
      )

      const listadoCat: ItemCatalogo[] = (catData || []).map(item => ({
        codigo: String(item[colCodigoCat]),
        detalle: item.detalle || item.descripcion || item.tipo || String(item[colCodigoCat])
      }))
      setCatalogoDisponible(listadoCat)

      const itemsMapeados: ItemStock[] = (stockData || []).map(item => {
        const codigo = item[colCodigoStock]
        return {
          id: item.id,
          sucursal_id: item.sucursal_id,
          codigo,
          detalle: catalogoMap[String(codigo)] || 'Sin descripción',
          cantidad: Number(item.cantidad) || 0,
          categoria: categoria as any
        }
      })

      setInventario(itemsMapeados)
    } catch (err: any) {
      console.error('Error cargando inventario:', err)
      setInventario([])
    } finally {
      setLoading(false)
    }
  }

  const cargarRetazosSucursal = async (sucursalId: number) => {
    setLoading(true)
    try {
      // Cargamos catálogo de melaminas para mapear el nombre/detalle del color
      const { data: catData } = await supabase.from('melaminas').select('*')
      const catalogoMap = Object.fromEntries(
        (catData || []).map(item => [
          String(item.codigo_melamina),
          item.detalle || item.descripcion || item.codigo_melamina
        ])
      )

      const listadoCat: ItemCatalogo[] = (catData || []).map(item => ({
        codigo: String(item.codigo_melamina),
        detalle: item.detalle || item.descripcion || String(item.codigo_melamina)
      }))
      setCatalogoDisponible(listadoCat)

      const { data, error } = await supabase
        .from('retazos_melaminas')
        .select('*')
        .eq('sucursal_id', sucursalId)

      if (error) throw error

      const retazosMapeados: RetazoMelamina[] = (data || []).map(r => ({
        id: r.id,
        sucursal_id: r.sucursal_id,
        codigo_melamina: r.codigo_melamina,
        detalle: catalogoMap[String(r.codigo_melamina)] || 'Sin descripción',
        largo_cm: Number(r.largo_cm) || 0,
        ancho_cm: Number(r.ancho_cm) || 0,
        cantidad: Number(r.cantidad) || 0
      }))

      setRetazos(retazosMapeados)
    } catch (err) {
      console.error('Error cargando retazos:', err)
      setRetazos([])
    } finally {
      setLoading(false)
    }
  }

  // INGRESAR STOCK NORMAL
  const ingresarStock = async () => {
    if (!codigoSeleccionado || !cantidadInicial || !sucursalSeleccionada) {
      alert('Por favor selecciona un código y define una cantidad inicial.')
      return
    }

    let tablaStock = ''
    let colCodigoStock = ''
    if (categoriaActiva === 'melamina') {
      tablaStock = 'stock_melaminas'
      colCodigoStock = 'codigo_melamina'
    } else if (categoriaActiva === 'accesorio') {
      tablaStock = 'stock_accesorios'
      colCodigoStock = 'codigo_accesorio'
    } else if (categoriaActiva === 'acero') {
      tablaStock = 'stock_aceros'
      colCodigoStock = 'codigo_acero'
    } else if (categoriaActiva === 'insumo') {
      tablaStock = 'stock_insumos'
      colCodigoStock = 'codigo_insumos'
    }

    const { error } = await supabase.from(tablaStock).insert([
      {
        sucursal_id: sucursalSeleccionada,
        [colCodigoStock]: codigoSeleccionado,
        cantidad: parseFloat(cantidadInicial)
      }
    ])

    if (error) {
      console.error('Error al ingresar stock:', error)
      alert('Error al registrar el ítem en el almacén (es posible que ya exista este código).')
      return
    }

    setModalNuevoAbierto(false)
    setCodigoSeleccionado('')
    setCantidadInicial('')
    cargarInventarioSucursal(sucursalSeleccionada, categoriaActiva)
  }

  // INGRESAR RETAZO DE MELAMINA CON MEDIDAS
  const guardarRetazo = async () => {
    if (!codigoSeleccionado || !largoRetazo || !anchoRetazo || !cantidadRetazo || !sucursalSeleccionada) {
      alert('Por favor completa todos los campos del retazo (código, largo, ancho y cantidad).')
      return
    }

    const { error } = await supabase.from('retazos_melaminas').insert([
      {
        sucursal_id: sucursalSeleccionada,
        codigo_melamina: codigoSeleccionado,
        largo_cm: parseFloat(largoRetazo),
        ancho_cm: parseFloat(anchoRetazo),
        cantidad: parseInt(cantidadRetazo)
      }
    ])

    if (error) {
      console.error('Error al guardar retazo:', error)
      alert('Error al registrar el retazo de melamina.')
      return
    }

    setModalRetazoAbierto(false)
    setCodigoSeleccionado('')
    setLargoRetazo('')
    setAnchoRetazo('')
    setCantidadRetazo('')
    cargarRetazosSucursal(sucursalSeleccionada)
  }

  // MODIFICAR STOCK NORMAL
  const guardarStock = async () => {
    if (!itemEditando) return
    const cantidadNum = parseFloat(nuevaCantidad)
    if (isNaN(cantidadNum)) return

    let tablaStock = ''
    if (itemEditando.categoria === 'melamina') tablaStock = 'stock_melaminas'
    else if (itemEditando.categoria === 'accesorio') tablaStock = 'stock_accesorios'
    else if (itemEditando.categoria === 'acero') tablaStock = 'stock_aceros'
    else if (itemEditando.categoria === 'insumo') tablaStock = 'stock_insumos'

    const { error } = await supabase.from(tablaStock).update({ cantidad: cantidadNum }).eq('id', itemEditando.id)
    if (error) {
      alert('Error al actualizar el stock.')
      return
    }

    setInventario(inventario.map(i => i.id === itemEditando.id ? { ...i, cantidad: cantidadNum } : i))
    setItemEditando(null)
    setNuevaCantidad('')
  }

  // MODIFICAR RETAZO
  const actualizarRetazo = async () => {
    if (!retazoEditando) return
    const cantidadNum = parseInt(nuevaCantidad)
    if (isNaN(cantidadNum)) return

    const { error } = await supabase
      .from('retazos_melaminas')
      .update({ cantidad: cantidadNum })
      .eq('id', retazoEditando.id)

    if (error) {
      alert('Error al actualizar el retazo.')
      return
    }

    setRetazos(retazos.map(r => r.id === retazoEditando.id ? { ...r, cantidad: cantidadNum } : r))
    setRetazoEditando(null)
    setNuevaCantidad('')
  }

  // ELIMINAR STOCK NORMAL
  const eliminarStock = async (item: ItemStock) => {
    if (!confirm(`¿Eliminar registro de stock ${item.codigo}?`)) return
    let tablaStock = ''
    if (item.categoria === 'melamina') tablaStock = 'stock_melaminas'
    else if (item.categoria === 'accesorio') tablaStock = 'stock_accesorios'
    else if (item.categoria === 'acero') tablaStock = 'stock_aceros'
    else if (item.categoria === 'insumo') tablaStock = 'stock_insumos'

    await supabase.from(tablaStock).delete().eq('id', item.id)
    setInventario(inventario.filter(i => i.id !== item.id))
  }

  // ELIMINAR RETAZO
  const eliminarRetazo = async (retazo: RetazoMelamina) => {
    if (!confirm(`¿Eliminar este retazo de ${retazo.largo_cm}x${retazo.ancho_cm} cm?`)) return
    await supabase.from('retazos_melaminas').delete().eq('id', retazo.id)
    setRetazos(retazos.filter(r => r.id !== retazo.id))
  }

  const inventarioFiltrado = inventario.filter(i => 
    i.codigo.toLowerCase().includes(busqueda.toLowerCase()) || 
    i.detalle.toLowerCase().includes(busqueda.toLowerCase())
  )

  const retazosFiltrados = retazos.filter(r =>
    r.codigo_melamina.toLowerCase().includes(busqueda.toLowerCase()) ||
    r.detalle.toLowerCase().includes(busqueda.toLowerCase())
  )

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc', fontFamily: 'Arial, sans-serif' }}>
      
      {/* NAVBAR */}
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 40px', backgroundColor: '#0B1E36', color: 'white' }}>
        <a href="/sistema" style={{ color: '#C5A059', textDecoration: 'none', fontWeight: 'bold' }}>← Volver al Sistema</a>
        <h1 style={{ fontSize: '18px', margin: 0, color: 'white' }}>MuebLess is Better - Gestión de Almacenes y Retazos</h1>
        <span style={{ fontSize: '13px', color: '#C5A059' }}>Control Multialmacén</span>
      </nav>

      <div style={{ padding: '30px', maxWidth: '1400px', margin: '0 auto' }}>
        
        {/* SELECTOR DE SUCURSALES */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px', backgroundColor: 'white', padding: '20px', borderRadius: '12px', boxShadow: '0 2px 10px rgba(0,0,0,0.04)', flexWrap: 'wrap', gap: '15px' }}>
          <div style={{ display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 'bold', color: '#0B1E36', fontSize: '14px' }}>Sucursal / Taller:</span>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {sucursales.map(suc => (
                <button
                  key={suc.id}
                  onClick={() => setSucursalSeleccionada(suc.id)}
                  style={{
                    padding: '10px 20px',
                    borderRadius: '8px',
                    border: 'none',
                    fontWeight: 'bold',
                    fontSize: '13px',
                    cursor: 'pointer',
                    backgroundColor: sucursalSeleccionada === suc.id ? '#0B1E36' : '#e2e8f0',
                    color: sucursalSeleccionada === suc.id ? '#C5A059' : '#333'
                  }}
                >
                  🏭 {suc.nombre}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={() => {
              if (categoriaActiva === 'melamina' && subVistaMelamina === 'retazos') {
                setModalRetazoAbierto(true)
              } else {
                setModalNuevoAbierto(true)
              }
            }}
            style={{ backgroundColor: '#16a34a', color: 'white', border: 'none', padding: '10px 18px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', fontSize: '13px' }}
          >
            {categoriaActiva === 'melamina' && subVistaMelamina === 'retazos' ? '+ Registrar Nuevo Retazo' : '+ Ingresar Nuevo Ítem al Stock'}
          </button>
        </div>

        {/* PESTAÑAS DE CATEGORÍAS */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '15px', backgroundColor: 'white', padding: '15px 20px', borderRadius: '12px', boxShadow: '0 2px 10px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {(['melamina', 'accesorio', 'acero', 'insumo'] as const).map(cat => (
              <button
                key={cat}
                onClick={() => {
                  setCategoriaActiva(cat)
                  if (cat !== 'melamina') setSubVistaMelamina('planchas')
                }}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  border: 'none',
                  fontWeight: 'bold',
                  fontSize: '12px',
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                  backgroundColor: categoriaActiva === cat ? '#C5A059' : '#f1f5f9',
                  color: categoriaActiva === cat ? '#0B1E36' : '#475569'
                }}
              >
                {cat}s
              </button>
            ))}
          </div>

          <div>
            <input
              type="text"
              placeholder="Buscar por código o detalle..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              style={{ padding: '8px 14px', borderRadius: '6px', border: '1px solid #cbd5e1', width: '280px', fontSize: '13px' }}
            />
          </div>
        </div>

        {/* SUB-PESTAÑAS SI ES MELAMINA (Planchas enteras vs Retazos con medidas) */}
        {categoriaActiva === 'melamina' && (
          <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
            <button
              onClick={() => setSubVistaMelamina('planchas')}
              style={{
                padding: '8px 16px',
                borderRadius: '6px',
                border: 'none',
                fontWeight: 'bold',
                fontSize: '12px',
                cursor: 'pointer',
                backgroundColor: subVistaMelamina === 'planchas' ? '#0B1E36' : '#e2e8f0',
                color: subVistaMelamina === 'planchas' ? 'white' : '#334155'
              }}
            >
              📦 Planchas Enteras (Stock)
            </button>
            <button
              onClick={() => setSubVistaMelamina('retazos')}
              style={{
                padding: '8px 16px',
                borderRadius: '6px',
                border: 'none',
                fontWeight: 'bold',
                fontSize: '12px',
                cursor: 'pointer',
                backgroundColor: subVistaMelamina === 'retazos' ? '#0B1E36' : '#e2e8f0',
                color: subVistaMelamina === 'retazos' ? '#C5A059' : '#334155'
              }}
            >
              📐 Retazos y Sobrantes con Medidas (Largo x Ancho)
            </button>
          </div>
        )}

        {/* TABLA PRINCIPAL DE INVENTARIO O RETAZOS */}
        <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 10px rgba(0,0,0,0.04)' }}>
          <h2 style={{ fontSize: '16px', color: '#0B1E36', borderBottom: '2px solid #C5A059', paddingBottom: '10px', marginBottom: '15px', textTransform: 'capitalize' }}>
            {categoriaActiva === 'melamina' && subVistaMelamina === 'retazos' ? 'Control de Retazos de Melamina' : `Inventario de ${categoriaActiva}s`}
          </h2>

          {loading ? (
            <p style={{ textAlign: 'center', padding: '40px', color: '#666' }}>Cargando registros...</p>
          ) : categoriaActiva === 'melamina' && subVistaMelamina === 'retazos' ? (
            /* TABLA DE RETAZOS CON MEDIDAS */
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f1f5f9', color: '#0B1E36' }}>
                    <th style={{ padding: '10px', textAlign: 'left' }}>Código Melamina</th>
                    <th style={{ padding: '10px', textAlign: 'left' }}>Detalle / Color</th>
                    <th style={{ padding: '10px', textAlign: 'center' }}>Largo (cm)</th>
                    <th style={{ padding: '10px', textAlign: 'center' }}>Ancho (cm)</th>
                    <th style={{ padding: '10px', textAlign: 'center' }}>Piezas Disponibles</th>
                    <th style={{ padding: '10px', textAlign: 'center' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {retazosFiltrados.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: '30px', color: '#94a3b8' }}>
                        No hay retazos registrados con medidas para esta sucursal.
                      </td>
                    </tr>
                  ) : (
                    retazosFiltrados.map(r => (
                      <tr key={r.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '10px', fontWeight: 'bold', color: '#0B1E36' }}>{r.codigo_melamina}</td>
                        <td style={{ padding: '10px', color: '#334155' }}>{r.detalle}</td>
                        <td style={{ padding: '10px', textAlign: 'center', fontWeight: 'bold' }}>{r.largo_cm} cm</td>
                        <td style={{ padding: '10px', textAlign: 'center', fontWeight: 'bold' }}>{r.ancho_cm} cm</td>
                        <td style={{ padding: '10px', textAlign: 'center', fontWeight: 'bold', color: '#16a34a', fontSize: '14px' }}>{r.cantidad}</td>
                        <td style={{ padding: '10px', textAlign: 'center', display: 'flex', justifyContent: 'center', gap: '8px' }}>
                          <button
                            onClick={() => {
                              setRetazoEditando(r)
                              setNuevaCantidad(r.cantidad.toString())
                            }}
                            style={{ backgroundColor: '#0B1E36', color: '#C5A059', border: 'none', padding: '6px 10px', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', fontSize: '11px' }}
                          >
                            Modificar ✏️
                          </button>
                          <button
                            onClick={() => eliminarRetazo(r)}
                            style={{ backgroundColor: '#fee2e2', color: '#dc2626', border: 'none', padding: '6px 10px', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', fontSize: '11px' }}
                          >
                            Eliminar 🗑️
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            /* TABLA DE INVENTARIO NORMAL */
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f1f5f9', color: '#0B1E36' }}>
                    <th style={{ padding: '10px', textAlign: 'left' }}>Código</th>
                    <th style={{ padding: '10px', textAlign: 'left' }}>Detalle / Descripción</th>
                    <th style={{ padding: '10px', textAlign: 'center' }}>Stock Actual</th>
                    <th style={{ padding: '10px', textAlign: 'center' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {inventarioFiltrado.length === 0 ? (
                    <tr>
                      <td colSpan={4} style={{ textAlign: 'center', padding: '30px', color: '#94a3b8' }}>
                        No hay registros de inventario en esta categoría.
                      </td>
                    </tr>
                  ) : (
                    inventarioFiltrado.map(item => (
                      <tr key={item.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '10px', fontWeight: 'bold', color: '#0B1E36' }}>{item.codigo}</td>
                        <td style={{ padding: '10px', color: '#334155' }}>{item.detalle}</td>
                        <td style={{ padding: '10px', textAlign: 'center', fontWeight: 'bold', color: item.cantidad > 0 ? '#16a34a' : '#dc2626', fontSize: '14px' }}>
                          {item.cantidad}
                        </td>
                        <td style={{ padding: '10px', textAlign: 'center', display: 'flex', justifyContent: 'center', gap: '8px' }}>
                          <button
                            onClick={() => {
                              setItemEditando(item)
                              setNuevaCantidad(item.cantidad.toString())
                            }}
                            style={{ backgroundColor: '#0B1E36', color: '#C5A059', border: 'none', padding: '6px 10px', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', fontSize: '11px' }}
                          >
                            Modificar ✏️
                          </button>
                          <button
                            onClick={() => eliminarStock(item)}
                            style={{ backgroundColor: '#fee2e2', color: '#dc2626', border: 'none', padding: '6px 10px', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', fontSize: '11px' }}
                          >
                            Eliminar 🗑️
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>

      {/* MODAL NUEVO STOCK NORMAL */}
      {modalNuevoAbierto && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: 'white', padding: '30px', borderRadius: '12px', width: '420px', boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }}>
            <h3 style={{ marginTop: 0, color: '#0B1E36', borderBottom: '2px solid #C5A059', paddingBottom: '8px', textTransform: 'capitalize' }}>
              Ingresar {categoriaActiva} al Almacén
            </h3>
            <div style={{ margin: '15px 0' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#0B1E36', marginBottom: '6px' }}>Seleccionar del Catálogo:</label>
              <select
                value={codigoSeleccionado}
                onChange={(e) => setCodigoSeleccionado(e.target.value)}
                style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box' }}
              >
                <option value="">-- Seleccione un ítem --</option>
                {catalogoDisponible.map(cat => (
                  <option key={cat.codigo} value={cat.codigo}>{cat.codigo} - {cat.detalle}</option>
                ))}
              </select>
            </div>
            <div style={{ margin: '15px 0' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#0B1E36', marginBottom: '6px' }}>Cantidad Inicial:</label>
              <input
                type="number"
                value={cantidadInicial}
                onChange={(e) => setCantidadInicial(e.target.value)}
                placeholder="Ej. 10"
                style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
              <button onClick={() => setModalNuevoAbierto(false)} style={{ backgroundColor: '#e2e8f0', color: '#334155', border: 'none', padding: '8px 16px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={ingresarStock} style={{ backgroundColor: '#16a34a', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>Guardar</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL NUEVO RETAZO CON MEDIDAS */}
      {modalRetazoAbierto && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: 'white', padding: '30px', borderRadius: '12px', width: '420px', boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }}>
            <h3 style={{ marginTop: 0, color: '#0B1E36', borderBottom: '2px solid #C5A059', paddingBottom: '8px' }}>Registrar Retazo de Melamina</h3>
            <div style={{ margin: '12px 0' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#0B1E36', marginBottom: '4px' }}>Diseño / Color:</label>
              <select
                value={codigoSeleccionado}
                onChange={(e) => setCodigoSeleccionado(e.target.value)}
                style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
              >
                <option value="">-- Seleccione Melamina --</option>
                {catalogoDisponible.map(cat => (
                  <option key={cat.codigo} value={cat.codigo}>{cat.codigo} - {cat.detalle}</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', gap: '10px', margin: '12px 0' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#0B1E36', marginBottom: '4px' }}>Largo (cm):</label>
                <input type="number" value={largoRetazo} onChange={(e) => setLargoRetazo(e.target.value)} placeholder="Ej. 120" style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#0B1E36', marginBottom: '4px' }}>Ancho (cm):</label>
                <input type="number" value={anchoRetazo} onChange={(e) => setAnchoRetazo(e.target.value)} placeholder="Ej. 60" style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }} />
              </div>
            </div>
            <div style={{ margin: '12px 0' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#0B1E36', marginBottom: '4px' }}>Cantidad de Piezas:</label>
              <input type="number" value={cantidadRetazo} onChange={(e) => setCantidadRetazo(e.target.value)} placeholder="Ej. 2" style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
              <button onClick={() => setModalRetazoAbierto(false)} style={{ backgroundColor: '#e2e8f0', color: '#334155', border: 'none', padding: '8px 16px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={guardarRetazo} style={{ backgroundColor: '#16a34a', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>Guardar Retazo</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL MODIFICAR STOCK */}
      {itemEditando && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: 'white', padding: '30px', borderRadius: '12px', width: '400px', boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }}>
            <h3 style={{ marginTop: 0, color: '#0B1E36', borderBottom: '2px solid #C5A059', paddingBottom: '8px' }}>Actualizar Stock</h3>
            <p style={{ fontSize: '13px', color: '#475569' }}><strong>Código:</strong> {itemEditando.codigo}<br /><strong>Detalle:</strong> {itemEditando.detalle}</p>
            <div style={{ margin: '20px 0' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#0B1E36', marginBottom: '6px' }}>Nueva Cantidad:</label>
              <input type="number" value={nuevaCantidad} onChange={(e) => setNuevaCantidad(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box' }} autoFocus />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button onClick={() => setItemEditando(null)} style={{ backgroundColor: '#e2e8f0', color: '#334155', border: 'none', padding: '8px 16px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={guardarStock} style={{ backgroundColor: '#16a34a', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>Actualizar</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL MODIFICAR RETAZO */}
      {retazoEditando && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: 'white', padding: '30px', borderRadius: '12px', width: '400px', boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }}>
            <h3 style={{ marginTop: 0, color: '#0B1E36', borderBottom: '2px solid #C5A059', paddingBottom: '8px' }}>Actualizar Cantidad de Retazo</h3>
            <p style={{ fontSize: '13px', color: '#475569' }}><strong>Melamina:</strong> {retazoEditando.codigo_melamina}<br /><strong>Medidas:</strong> {retazoEditando.largo_cm} x {retazoEditando.ancho_cm} cm</p>
            <div style={{ margin: '20px 0' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#0B1E36', marginBottom: '6px' }}>Nueva Cantidad:</label>
              <input type="number" value={nuevaCantidad} onChange={(e) => setNuevaCantidad(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box' }} autoFocus />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button onClick={() => setRetazoEditando(null)} style={{ backgroundColor: '#e2e8f0', color: '#334155', border: 'none', padding: '8px 16px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={actualizarRetazo} style={{ backgroundColor: '#16a34a', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>Actualizar</button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}