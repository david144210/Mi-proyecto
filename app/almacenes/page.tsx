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

interface ItemCatalogo {
  codigo: string
  detalle: string
}

export default function GestorAlmacenes() {
  const [sucursales, setSucursales] = useState<Sucursal[]>([])
  const [sucursalSeleccionada, setSucursalSeleccionada] = useState<number | null>(null)
  const [categoriaActiva, setCategoriaActiva] = useState<'melamina' | 'accesorio' | 'acero' | 'insumo'>('melamina')
  const [inventario, setInventario] = useState<ItemStock[]>([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')

  // Modal para edición rápida de stock
  const [itemEditando, setItemEditando] = useState<ItemStock | null>(null)
  const [nuevaCantidad, setNuevaCantidad] = useState('')

  // Modal para ingresar nuevo ítem al stock
  const [modalNuevoAbierto, setModalNuevoAbierto] = useState(false)
  const [catalogoDisponible, setCatalogoDisponible] = useState<ItemCatalogo[]>([])
  const [codigoSeleccionado, setCodigoSeleccionado] = useState('')
  const [cantidadInicial, setCantidadInicial] = useState('')

  useEffect(() => {
    cargarSucursales()
  }, [])

  useEffect(() => {
    if (sucursalSeleccionada) {
      cargarInventarioSucursal(sucursalSeleccionada, categoriaActiva)
    }
  }, [sucursalSeleccionada, categoriaActiva])

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

      const { data: catData, error: catError } = await supabase
        .from(tablaCatalogo)
        .select('*')

      if (catError) throw catError

      const catalogoMap = Object.fromEntries(
        (catData || []).map(item => [
          String(item[colCodigoCat]),
          item.detalle || item.descripcion || item.tipo || item[colCodigoCat]
        ])
      )

      // Guardamos también el catálogo completo para el modal de ingreso
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

  // CREAR / INGRESAR NUEVO STOCK
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
      alert('Error al registrar el ítem en el almacén (es posible que ya exista este código en esta sucursal).')
      return
    }

    setModalNuevoAbierto(false)
    setCodigoSeleccionado('')
    setCantidadInicial('')
    cargarInventarioSucursal(sucursalSeleccionada, categoriaActiva)
  }

  // MODIFICAR STOCK EXISTENTE
  const guardarStock = async () => {
    if (!itemEditando) return
    const cantidadNum = parseFloat(nuevaCantidad)
    if (isNaN(cantidadNum)) {
      alert('Por favor ingresa un número válido.')
      return
    }

    let tablaStock = ''
    if (itemEditando.categoria === 'melamina') tablaStock = 'stock_melaminas'
    else if (itemEditando.categoria === 'accesorio') tablaStock = 'stock_accesorios'
    else if (itemEditando.categoria === 'acero') tablaStock = 'stock_aceros'
    else if (itemEditando.categoria === 'insumo') tablaStock = 'stock_insumos'

    const { error } = await supabase
      .from(tablaStock)
      .update({ cantidad: cantidadNum })
      .eq('id', itemEditando.id)

    if (error) {
      console.error('Error actualizando stock:', error)
      alert('Error al actualizar el stock en la base de datos.')
      return
    }

    setInventario(inventario.map(i => i.id === itemEditando.id ? { ...i, cantidad: cantidadNum } : i))
    setItemEditando(null)
    setNuevaCantidad('')
  }

  // ELIMINAR REGISTRO DE STOCK
  const eliminarStock = async (item: ItemStock) => {
    if (!confirm(`¿Estás seguro de eliminar el registro de stock para ${item.codigo} (${item.detalle}) de esta sucursal?`)) return

    let tablaStock = ''
    if (item.categoria === 'melamina') tablaStock = 'stock_melaminas'
    else if (item.categoria === 'accesorio') tablaStock = 'stock_accesorios'
    else if (item.categoria === 'acero') tablaStock = 'stock_aceros'
    else if (item.categoria === 'insumo') tablaStock = 'stock_insumos'

    const { error } = await supabase
      .from(tablaStock)
      .delete()
      .eq('id', item.id)

    if (error) {
      console.error('Error eliminando stock:', error)
      alert('No se pudo eliminar el registro.')
      return
    }

    setInventario(inventario.filter(i => i.id !== item.id))
  }

  const inventarioFiltrado = inventario.filter(i => 
    i.codigo.toLowerCase().includes(busqueda.toLowerCase()) || 
    i.detalle.toLowerCase().includes(busqueda.toLowerCase())
  )

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc', fontFamily: 'Arial, sans-serif' }}>
      
      {/* NAVBAR */}
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 40px', backgroundColor: '#0B1E36', color: 'white' }}>
        <a href="/sistema" style={{ color: '#C5A059', textDecoration: 'none', fontWeight: 'bold' }}>← Volver al Sistema</a>
        <h1 style={{ fontSize: '18px', margin: 0, color: 'white' }}>MuebLess is Better - Gestión de Almacenes</h1>
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
                    color: sucursalSeleccionada === suc.id ? '#C5A059' : '#333',
                    transition: 'all 0.2s'
                  }}
                >
                  🏭 {suc.nombre}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={() => setModalNuevoAbierto(true)}
            style={{ backgroundColor: '#16a34a', color: 'white', border: 'none', padding: '10px 18px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', fontSize: '13px' }}
          >
            + Ingresar Nuevo Ítem al Stock
          </button>
        </div>

        {/* PESTAÑAS DE CATEGORÍAS Y BUSCADOR */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '15px', backgroundColor: 'white', padding: '15px 20px', borderRadius: '12px', boxShadow: '0 2px 10px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {(['melamina', 'accesorio', 'acero', 'insumo'] as const).map(cat => (
              <button
                key={cat}
                onClick={() => setCategoriaActiva(cat)}
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

        {/* TABLA PRINCIPAL */}
        <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 10px rgba(0,0,0,0.04)' }}>
          <h2 style={{ fontSize: '16px', color: '#0B1E36', borderBottom: '2px solid #C5A059', paddingBottom: '10px', marginBottom: '15px', textTransform: 'capitalize' }}>
            Inventario de {categoriaActiva}s
          </h2>

          {loading ? (
            <p style={{ textAlign: 'center', padding: '40px', color: '#666' }}>Cargando inventario de almacén...</p>
          ) : (
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
                        No hay registros de inventario para esta categoría en la sucursal actual.
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

      {/* MODAL PARA INGRESAR NUEVO STOCK */}
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
                  <option key={cat.codigo} value={cat.codigo}>
                    {cat.codigo} - {cat.detalle}
                  </option>
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
              <button
                onClick={() => setModalNuevoAbierto(false)}
                style={{ backgroundColor: '#e2e8f0', color: '#334155', border: 'none', padding: '8px 16px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}
              >
                Cancelar
              </button>
              <button
                onClick={ingresarStock}
                style={{ backgroundColor: '#16a34a', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}
              >
                Guardar en Almacén
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL PARA MODIFICAR STOCK */}
      {itemEditando && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: 'white', padding: '30px', borderRadius: '12px', width: '400px', boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }}>
            <h3 style={{ marginTop: 0, color: '#0B1E36', borderBottom: '2px solid #C5A059', paddingBottom: '8px' }}>Actualizar Stock</h3>
            <p style={{ fontSize: '13px', color: '#475569' }}>
              <strong>Código:</strong> {itemEditando.codigo}<br />
              <strong>Detalle:</strong> {itemEditando.detalle}
            </p>

            <div style={{ margin: '20px 0' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#0B1E36', marginBottom: '6px' }}>Nueva Cantidad:</label>
              <input
                type="number"
                value={nuevaCantidad}
                onChange={(e) => setNuevaCantidad(e.target.value)}
                style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box' }}
                autoFocus
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => setItemEditando(null)}
                style={{ backgroundColor: '#e2e8f0', color: '#334155', border: 'none', padding: '8px 16px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}
              >
                Cancelar
              </button>
              <button
                onClick={guardarStock}
                style={{ backgroundColor: '#16a34a', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}
              >
                Actualizar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}