'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

export default function Contabilidad() {
  const [loading, setLoading] = useState(true)
  const [pestana, setPestana] = useState<'diario' | 'reportes'>('diario')
  const [asientos, setAsientos] = useState<any[]>([])
  const [balances, setBalances] = useState<any[]>([])

  // Estados para los Filtros y Buscador
  const [busqueda, setBusqueda] = useState('')
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')

  useEffect(() => {
    // Verificación de sesión rápida (Igual a tu sistema original)
    const carnetGuardado = localStorage.getItem('carnet')
    if (!carnetGuardado) { window.location.replace('/'); return }

    async function cargarDatosContables() {
      // 1. Obtener asientos con sus líneas y nombres de cuenta
      const { data: dataAsientos } = await supabase
        .from('contabilidad_asientos')
        .select(`
          id, fecha, glosa,
          contabilidad_lineas(debe, haber, contabilidad_cuentas(nombre, codigo))
        `)
        .order('fecha', { ascending: false })

      // 2. Obtener sumas por cuenta para reportes rápidos
      const { data: dataLineas } = await supabase
        .from('contabilidad_lineas')
        .select(`debe, haber, contabilidad_cuentas(nombre, codigo, tipo)`)

      if (dataAsientos) setAsientos(dataAsientos)
      if (dataLineas) calcularBalances(dataLineas)
      setLoading(false)
    }

    cargarDatosContables()
  }, [])

  const calcularBalances = (lineas: any[]) => {
    const mapa: { [key: string]: { nombre: string; tipo: string; saldo: number } } = {}
    
    lineas.forEach(l => {
      const cuenta = l.contabilidad_cuentas
      if (!mapa[cuenta.codigo]) {
        mapa[cuenta.codigo] = { nombre: cuenta.nombre, tipo: cuenta.tipo, saldo: 0 }
      }
      if (cuenta.tipo === 'activo' || cuenta.tipo === 'gasto') {
        mapa[cuenta.codigo].saldo += (Number(l.debe) - Number(l.haber))
      } else {
        mapa[cuenta.codigo].saldo += (Number(l.haber) - Number(l.debe))
      }
    })

    setBalances(Object.entries(mapa).map(([codigo, datos]) => ({ codigo, ...datos })))
  }

  // Lógica de Filtrado en tiempo real (Client-side para máxima fluidez)
  const asientosFiltrados = asientos.filter(asiento => {
    // Filtro de buscador (Glosa)
    const coincideBusqueda = asiento.glosa.toLowerCase().includes(busqueda.toLowerCase())
    
    // Filtro de Fechas
    const fechaAsiento = new Date(asiento.fecha).toISOString().split('T')[0] // Formato YYYY-MM-DD
    const coincideDesde = fechaDesde ? fechaAsiento >= fechaDesde : true
    const coincideHasta = fechaHasta ? fechaAsiento <= fechaHasta : true

    return coincideBusqueda && coincideDesde && coincideHasta
  })

  if (loading) return <p style={{ textAlign: 'center', marginTop: '100px', fontFamily: 'Arial' }}>Cargando datos financieros...</p>

  // Cálculos rápidos de KPI basados en los datos ya filtrados para que las tarjetas reaccionen a la búsqueda
  const ingresosTotales = balances.filter(b => b.tipo === 'ingreso').reduce((acc, b) => acc + b.saldo, 0)
  const gastosTotales = balances.filter(b => b.tipo === 'gasto').reduce((acc, b) => acc + b.saldo, 0)
  const utilidadNeta = ingresosTotales - gastosTotales

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', minHeight: '100vh', backgroundColor: '#f5f5f5' }}>
      {/* Navbar idéntica a tu diseño */}
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 20px', backgroundColor: '#222', color: 'white', boxSizing: 'border-box' }}>
        <a href="/sistema" style={{ fontWeight: 'bold', fontSize: '20px', color: 'white', textDecoration: 'none' }}>Muebles is Better</a>
        <span style={{ color: '#a3c47d', fontWeight: 'bold', fontSize: '14px' }}>Módulo Contable</span>
        <a href="/sistema" style={{ backgroundColor: 'transparent', color: '#ccc', border: '1px solid #ccc', padding: '5px 12px', borderRadius: '20px', fontSize: '12px', textDecoration: 'none' }}>Volver</a>
      </nav>

      <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto', boxSizing: 'border-box' }}>
        <h1 style={{ fontSize: '24px', marginBottom: '20px' }}>Dashboard Contable 📊</h1>

        {/* Tarjetas de KPI */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px', marginBottom: '30px' }}>
          <div style={{ backgroundColor: 'white', borderRadius: '16px', padding: '20px', boxShadow: '0 2px 12px rgba(0,0,0,0.05)' }}>
            <span style={{ color: '#666', fontSize: '14px' }}>Ingresos Totales</span>
            <h2 style={{ margin: '5px 0 0 0', color: '#2e7d32' }}>${ingresosTotales.toFixed(2)}</h2>
          </div>
          <div style={{ backgroundColor: 'white', borderRadius: '16px', padding: '20px', boxShadow: '0 2px 12px rgba(0,0,0,0.05)' }}>
            <span style={{ color: '#666', fontSize: '14px' }}>Gastos Totales</span>
            <h2 style={{ margin: '5px 0 0 0', color: '#c62828' }}>${gastosTotales.toFixed(2)}</h2>
          </div>
          <div style={{ backgroundColor: 'white', borderRadius: '16px', padding: '20px', boxShadow: '0 2px 12px rgba(0,0,0,0.05)', borderLeft: `4px solid ${utilidadNeta >= 0 ? '#4caf50' : '#f44336'}` }}>
            <span style={{ color: '#666', fontSize: '14px' }}>Utilidad del Ejercicio</span>
            <h2 style={{ margin: '5px 0 0 0', color: '#222' }}>${utilidadNeta.toFixed(2)}</h2>
          </div>
        </div>

        {/* Selector de Pestañas */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
          <button onClick={() => setPestana('diario')} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: 'none', backgroundColor: pestana === 'diario' ? '#222' : 'white', color: pestana === 'diario' ? 'white' : '#222', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 2px 6px rgba(0,0,0,0.05)' }}>
            📖 Libro Diario
          </button>
          <button onClick={() => setPestana('reportes')} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: 'none', backgroundColor: pestana === 'reportes' ? '#222' : 'white', color: pestana === 'reportes' ? 'white' : '#222', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 2px 6px rgba(0,0,0,0.05)' }}>
            📋 Estados Financieros
          </button>
        </div>


        {/* CONTROLES DE BÚSQUEDA Y FILTRADO (Solo visibles en Libro Diario) */}
        {pestana === 'diario' && (
          <div style={{ backgroundColor: 'white', borderRadius: '14px', padding: '15px', marginBottom: '20px', boxShadow: '0 2px 10px rgba(0,0,0,0.04)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: '12px' }}>
              
              {/* Buscador de Texto */}
              <div style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#666' }}>Buscar por descripción:</label>
                <input 
                  type="text" 
                  placeholder="Ej: Melamina, Caja Chica, Venta..." 
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '14px', boxSizing: 'border-box' }}
                />
              </div>

              {/* Filtro Fecha Desde */}
              <div style={{ flex: '1 1 180px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#666' }}>Desde:</label>
                <input 
                  type="date" 
                  value={fechaDesde}
                  onChange={(e) => setFechaDesde(e.target.value)}
                  style={{ width: '100%', padding: '9px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '14px', boxSizing: 'border-box' }}
                />
              </div>

              {/* Filtro Fecha Hasta */}
              <div style={{ flex: '1 1 180px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#666' }}>Hasta:</label>
                <input 
                  type="date" 
                  value={fechaHasta}
                  onChange={(e) => setFechaHasta(e.target.value)}
                  style={{ width: '100%', padding: '9px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '14px', boxSizing: 'border-box' }}
                />
              </div>

              {/* Botón para Limpiar Filtros */}
              {(busqueda || fechaDesde || fechaHasta) && (
                <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                  <button 
                    onClick={() => { setBusqueda(''); setFechaDesde(''); setFechaHasta('') }}
                    style={{ padding: '10px 15px', backgroundColor: '#f44336', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px', width: '100%' }}
                  >
                    Limpiar
                  </button>
                </div>
              )}

            </div>
            <div style={{ fontSize: '12px', color: '#888', textAlign: 'right' }}>
              Resultados encontrados: {asientosFiltrados.length}
            </div>
          </div>
        )}

        {/* VISTA 1: LIBRO DIARIO */}
        {pestana === 'diario' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            {asientosFiltrados.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#888', padding: '40px', backgroundColor: 'white', borderRadius: '14px' }}>
                No se encontraron asientos contables con los filtros aplicados.
              </p>
            ) : (
              asientosFiltrados.map((asiento) => (
                <div key={asiento.id} style={{ backgroundColor: 'white', borderRadius: '14px', padding: '18px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '5px', marginBottom: '10px', borderBottom: '1px solid #eee', paddingBottom: '8px' }}>
                    <span style={{ fontWeight: 'bold', color: '#555', fontSize: '14px' }}>Asiento #{asiento.id}</span>
                    <span style={{ color: '#888', fontSize: '13px' }}>{new Date(asiento.fecha).toLocaleDateString()}</span>
                  </div>
                  <p style={{ margin: '0 0 12px 0', fontSize: '15px', fontWeight: 500, color: '#333' }}>{asiento.glosa}</p>
                  
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', minWidth: '400px', borderCollapse: 'collapse', fontSize: '13px' }}>
                      <thead>
                        <tr style={{ backgroundColor: '#fafafa', color: '#666' }}>
                          <th style={{ textAlign: 'left', padding: '6px' }}>Cuenta</th>
                          <th style={{ textAlign: 'right', padding: '6px', width: '80px' }}>Debe</th>
                          <th style={{ textAlign: 'right', padding: '6px', width: '80px' }}>Haber</th>
                        </tr>
                      </thead>
                      <tbody>
                        {asiento.contabilidad_lineas?.map((linea: any, idx: number) => (
                          <tr key={idx} style={{ borderBottom: '1px solid #f9f9f9' }}>
                            <td style={{ padding: '6px', paddingLeft: linea.haber > 0 ? '20px' : '6px', color: linea.haber > 0 ? '#666' : '#000' }}>
                              {linea.haber > 0 ? '→ ' : ''}{linea.contabilidad_cuentas?.nombre}
                            </td>
                            <td style={{ padding: '6px', textAlign: 'right', color: '#2e7d32' }}>{linea.debe > 0 ? `$${linea.debe}` : '-'}</td>
                            <td style={{ padding: '6px', textAlign: 'right', color: '#b71c1c' }}>{linea.haber > 0 ? `$${linea.haber}` : '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* VISTA 2: REPORTES */}
        {pestana === 'reportes' && (
          <div style={{ backgroundColor: 'white', borderRadius: '16px', padding: '20px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
            <h3 style={{ marginTop: 0, borderBottom: '2px solid #222', paddingBottom: '6px' }}>Balance de Saldos</h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: '500px', borderCollapse: 'collapse', fontSize: '14px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#222', color: 'white' }}>
                    <th style={{ textAlign: 'left', padding: '10px' }}>Código</th>
                    <th style={{ textAlign: 'left', padding: '10px' }}>Cuenta</th>
                    <th style={{ textAlign: 'left', padding: '10px' }}>Tipo</th>
                    <th style={{ textAlign: 'right', padding: '10px' }}>Saldo Actual</th>
                  </tr>
                </thead>
                <tbody>
                  {balances.map((b, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #eee', backgroundColor: idx % 2 === 0 ? '#fff' : '#fcfcfc' }}>
                      <td style={{ padding: '10px', fontFamily: 'monospace', color: '#555' }}>{b.codigo}</td>
                      <td style={{ padding: '10px', fontWeight: 'bold' }}>{b.nombre}</td>
                      <td style={{ padding: '10px', textTransform: 'capitalize', color: '#777', fontSize: '12px' }}>{b.tipo}</td>
                      <td style={{ padding: '10px', textAlign: 'right', fontWeight: 'bold', color: b.saldo >= 0 ? '#222' : '#c62828' }}>
                        ${Math.abs(b.saldo).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}