'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

export default function Contabilidad() {
  const [loading, setLoading] = useState(true)
  const [pestana, setPestana] = useState<'diario' | 'reportes' | 'caja'>('diario')
  const [asientos, setAsientos] = useState<any[]>([])
  const [balances, setBalances] = useState<any[]>([])
  
  // Estados para Filtros (Diario)
  const [busqueda, setBusqueda] = useState('')
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  
  // Estado para Control de Caja
  const [mesCaja, setMesCaja] = useState(new Date().toISOString().slice(0, 7))

  // Funciones Utilitarias
  const formatearFecha = (fechaStr: string): string => {
    if (!fechaStr) return ''
    try {
      const partes = fechaStr.split('T')[0].split('-')
      if (partes.length !== 3) return fechaStr
      const [anio, mes, dia] = partes
      return `${dia}/${mes}/${anio}`
    } catch (e) { return fechaStr }
  }

  const cambiarMes = (delta: number) => {
    const [y, m] = mesCaja.split('-').map(Number);
    const date = new Date(y, m - 1, 1);
    date.setMonth(date.getMonth() + delta);
    setMesCaja(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
  };

  const exportarCSV = () => {
    const csvContent = "data:text/csv;charset=utf-8," + 
      "Fecha,Glosa,Monto\n" +
      asientosCaja.map(a => `${formatearFecha(a.fecha)},${a.glosa},${a.contabilidad_lineas.reduce((s:any, l:any) => s + Number(l.debe || l.haber), 0)}`).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `reporte_caja_${mesCaja}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // Cargar Datos
  async function cargarDatos() {
    const { data: dataAsientos } = await supabase
      .from('contabilidad_asientos')
      .select(`id, fecha, glosa, contabilidad_lineas(debe, haber, contabilidad_cuentas(nombre, codigo, tipo))`)
      .order('fecha', { ascending: false })

    const { data: dataLineas } = await supabase
      .from('contabilidad_lineas')
      .select(`debe, haber, contabilidad_cuentas(nombre, codigo, tipo)`)

    if (dataAsientos) setAsientos(dataAsientos)
    if (dataLineas) calcularBalances(dataLineas)
    setLoading(false)
  }

  useEffect(() => {
    const carnetGuardado = localStorage.getItem('carnet')
    if (!carnetGuardado) { window.location.replace('/'); return }
    cargarDatos()
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

  // Lógica Filtrado Diario
  const asientosFiltrados = asientos.filter(asiento => {
    const coincideBusqueda = asiento.glosa.toLowerCase().includes(busqueda.toLowerCase())
    const fechaAsiento = asiento.fecha.split('T')[0]
    const coincideDesde = fechaDesde ? fechaAsiento >= fechaDesde : true
    const coincideHasta = fechaHasta ? fechaAsiento <= fechaHasta : true
    return coincideBusqueda && coincideDesde && coincideHasta
  })

  // Lógica Control Caja
  const asientosCaja = asientos.filter(a => a.fecha.startsWith(mesCaja))
  const esCompra = (glosa: string) => glosa.toLowerCase().includes('compra')
  const esCobro = (glosa: string) => glosa.toLowerCase().includes('cobro')
  const esAnticipo = (glosa: string) => glosa.toLowerCase().includes('anticipo')
  
  const totalIngresos = asientosCaja.reduce((acc, a) => acc + (esCobro(a.glosa) ? a.contabilidad_lineas.reduce((sum: number, l: any) => sum + Number(l.haber), 0) : 0), 0)
  const totalCompras = asientosCaja.reduce((acc, a) => acc + (esCompra(a.glosa) ? a.contabilidad_lineas.reduce((sum: number, l: any) => sum + Number(l.debe), 0) : 0), 0)
  const totalAnticipos = asientosCaja.reduce((acc, a) => acc + (esAnticipo(a.glosa) ? a.contabilidad_lineas.reduce((sum: number, l: any) => sum + Number(l.debe), 0) : 0), 0)

  // KPIs Generales
  const ingresosTotales = balances.filter(b => b.tipo === 'ingreso').reduce((acc, b) => acc + b.saldo, 0)
  const gastosTotales = balances.filter(b => b.tipo === 'gasto').reduce((acc, b) => acc + b.saldo, 0)
  const utilidadNeta = ingresosTotales - gastosTotales

  if (loading) return <p style={{ textAlign: 'center', marginTop: '100px' }}>Cargando...</p>

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', minHeight: '100vh', backgroundColor: '#f5f5f5' }}>
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 20px', backgroundColor: '#222', color: 'white' }}>
        <h2 style={{margin:0, fontSize:'20px'}}>Muebles is Better</h2>
        <button onClick={() => window.print()} style={{cursor:'pointer', padding:'5px 10px'}}>🖨️ Imprimir</button>
      </nav>

      <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
        <h1 style={{ fontSize: '24px', marginBottom: '20px' }}>Dashboard Financiero 📊</h1>

        {/* Tarjetas KPI */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px', marginBottom: '30px' }}>
          <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '16px', boxShadow: '0 2px 10px rgba(0,0,0,0.05)' }}>
            <span style={{ fontSize: '14px', color: '#666' }}>Ingresos Totales</span>
            <h2 style={{ margin: '5px 0 0', color: '#2e7d32' }}>${ingresosTotales.toFixed(2)}</h2>
          </div>
          <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '16px', boxShadow: '0 2px 10px rgba(0,0,0,0.05)' }}>
            <span style={{ fontSize: '14px', color: '#666' }}>Gastos Totales</span>
            <h2 style={{ margin: '5px 0 0', color: '#c62828' }}>${gastosTotales.toFixed(2)}</h2>
          </div>
          <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '16px', boxShadow: '0 2px 10px rgba(0,0,0,0.05)' }}>
            <span style={{ fontSize: '14px', color: '#666' }}>Utilidad</span>
            <h2 style={{ margin: '5px 0 0', color: '#222' }}>${utilidadNeta.toFixed(2)}</h2>
          </div>
        </div>

        {/* Pestañas */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
          <button onClick={() => setPestana('diario')} style={{ flex: 1, padding: '12px', border: 'none', borderRadius: '10px', backgroundColor: pestana === 'diario' ? '#222' : 'white', color: pestana === 'diario' ? 'white' : '#222', fontWeight: 'bold', cursor: 'pointer' }}>📖 Diario</button>
          <button onClick={() => setPestana('reportes')} style={{ flex: 1, padding: '12px', border: 'none', borderRadius: '10px', backgroundColor: pestana === 'reportes' ? '#222' : 'white', color: pestana === 'reportes' ? 'white' : '#222', fontWeight: 'bold', cursor: 'pointer' }}>📋 Balances</button>
          <button onClick={() => setPestana('caja')} style={{ flex: 1, padding: '12px', border: 'none', borderRadius: '10px', backgroundColor: pestana === 'caja' ? '#222' : 'white', color: pestana === 'caja' ? 'white' : '#222', fontWeight: 'bold', cursor: 'pointer' }}>💰 Control Caja</button>
        </div>

        {pestana === 'diario' && (
          <div>
            <div style={{ backgroundColor: 'white', padding: '15px', borderRadius: '14px', marginBottom: '20px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <input type="text" placeholder="Buscar glosa..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} style={{ padding: '8px', borderRadius: '6px', border: '1px solid #ddd' }} />
              <input type="date" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} style={{ padding: '8px', borderRadius: '6px', border: '1px solid #ddd' }} />
              <input type="date" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} style={{ padding: '8px', borderRadius: '6px', border: '1px solid #ddd' }} />
            </div>
            {asientosFiltrados.map((asiento) => (
              <div key={asiento.id} style={{ backgroundColor: 'white', borderRadius: '14px', padding: '15px', marginBottom: '10px' }}>
                <strong>Asiento #{asiento.id} - {asiento.glosa}</strong> <br/>
                <small>{formatearFecha(asiento.fecha)}</small>
              </div>
            ))}
          </div>
        )}

        {pestana === 'reportes' && (
          <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '16px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr style={{textAlign:'left'}}><th>Cuenta</th><th>Tipo</th><th>Saldo</th></tr></thead>
              <tbody>
                {balances.map((b, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{padding:'8px'}}>{b.nombre}</td>
                    <td style={{padding:'8px'}}>{b.tipo}</td>
                    <td style={{padding:'8px'}}>${b.saldo.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pestana === 'caja' && (
          <div>
            <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '12px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '15px', justifyContent: 'center' }}>
              <button onClick={() => cambiarMes(-1)} style={{ padding: '8px 15px', cursor: 'pointer' }}>◀ Anterior</button>
              <input type="month" value={mesCaja} onChange={(e) => setMesCaja(e.target.value)} style={{ padding: '8px' }} />
              <button onClick={() => cambiarMes(1)} style={{ padding: '8px 15px', cursor: 'pointer' }}>Siguiente ▶</button>
              <button onClick={exportarCSV} style={{ padding: '8px 15px', background: '#4caf50', color: 'white', border:'none', borderRadius:'5px', cursor: 'pointer' }}>Excel</button>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '20px' }}>
              <div style={{ padding: '20px', background: '#e8f5e9', borderRadius: '10px', textAlign: 'center' }}>
                <p style={{margin:0, fontSize:'12px'}}>Ingresos</p>
                <h3>${totalIngresos.toFixed(2)}</h3>
              </div>
              <div style={{ padding: '20px', background: '#ffebee', borderRadius: '10px', textAlign: 'center' }}>
                <p style={{margin:0, fontSize:'12px'}}>Compras</p>
                <h3>${totalCompras.toFixed(2)}</h3>
              </div>
              <div style={{ padding: '20px', background: '#fff3e0', borderRadius: '10px', textAlign: 'center' }}>
                <p style={{margin:0, fontSize:'12px'}}>Anticipos</p>
                <h3>${totalAnticipos.toFixed(2)}</h3>
              </div>
            </div>

            <div style={{ background: 'white', borderRadius: '12px', padding: '15px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr style={{textAlign:'left'}}><th style={{padding:10}}>Fecha</th><th style={{padding:10}}>Glosa</th><th style={{padding:10}}>Tipo</th><th style={{padding:10}}>Monto</th></tr></thead>
                <tbody>
                  {asientosCaja.map((a: any) => (
                    <tr key={a.id} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{padding:'10px'}}>{formatearFecha(a.fecha)}</td>
                      <td style={{padding:'10px'}}>{a.glosa}</td>
                      <td style={{padding:'10px'}}>{esCobro(a.glosa) ? 'Cobro' : esCompra(a.glosa) ? 'Compra' : esAnticipo(a.glosa) ? 'Anticipo' : 'Otro'}</td>
                      <td style={{padding:'10px'}}>${a.contabilidad_lineas.reduce((sum: number, l: any) => sum + Number(l.debe || l.haber), 0).toFixed(2)}</td>
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