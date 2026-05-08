'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

interface PiezaAcero {
  id: number
  material: string
  longitud: number
  cantidad: number
  precio_unitario: number
  subtotal: number
}

interface PiezaMelamina {
  id: number
  material: string
  largo: number
  ancho: number
  cantidad: number
  precio_unitario: number
  subtotal: number
}

interface PiezaAccesorio {
  id: number
  material: string
  cantidad: number
  precio_unitario: number
  subtotal: number
}

interface PiezaUnion {
  id: number
  label: string
  tipo: string
  cantidad: number
  precio_unitario: number
  subtotal: number
}

export default function Cotizador() {
  const [usuario, setUsuario] = useState<any>(null)
  const [aceros, setAceros] = useState<any[]>([])
  const [melaminas, setMelaminas] = useState<any[]>([])
  const [accesorios, setAccesorios] = useState<any[]>([])
  const [colores, setColores] = useState<any[]>([])
  const [uniones, setUniones] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // Acero
  const [aceroSelId, setAceroSelId] = useState('')
  const [longitud, setLongitud] = useState('')
  const [cantAcero, setCantAcero] = useState('')
  const [piezasAcero, setPiezasAcero] = useState<PiezaAcero[]>([])
  const [nextIdAcero, setNextIdAcero] = useState(1)

  // Melamina
  const [melaminaSelId, setMelaminaSelId] = useState('')
  const [largo, setLargo] = useState('')
  const [ancho, setAncho] = useState('')
  const [cantMelamina, setCantMelamina] = useState('')
  const [piezasMelamina, setPiezasMelamina] = useState<PiezaMelamina[]>([])
  const [nextIdMelamina, setNextIdMelamina] = useState(1)

  // Accesorios
  const [accesorioSelId, setAccesorioSelId] = useState('')
  const [cantAccesorio, setCantAccesorio] = useState('')
  const [piezasAccesorio, setPiezasAccesorio] = useState<PiezaAccesorio[]>([])
  const [nextIdAccesorio, setNextIdAccesorio] = useState(1)

  // Uniones
  const [unionSelId, setUnionSelId] = useState('')
  const [cantUnion, setCantUnion] = useState('')
  const [piezasUnion, setPiezasUnion] = useState<PiezaUnion[]>([])
  const [nextIdUnion, setNextIdUnion] = useState(1)

  // Colores
  const [colorSelId, setColorSelId] = useState('')

  useEffect(() => {
    const carnetGuardado = localStorage.getItem('carnet')
    if (!carnetGuardado) { window.location.replace('/'); return }
    supabase.from('personal').select('*, cargos(*)').eq('carnet', carnetGuardado).eq('estado', true).single()
      .then(({ data }) => {
        if (!data || !data.cargos?.puede_ver_cotizador) {
          window.location.replace('/'); return
        }
        setUsuario(data)
      })
    Promise.all([
      supabase.from('aceros').select('*').order('detalle'),
      supabase.from('melaminas').select('*').order('detalle'),
      supabase.from('accesorios').select('*').order('detalle'),
      supabase.from('colores').select('*').order('detalle'),
      supabase.from('uniones').select('*').order('codigo_union'),
    ]).then(([a, m, ac, co, uni]) => {
      setAceros(a.data || [])
      setMelaminas(m.data || [])
      setAccesorios(ac.data || [])
      setColores(co.data || [])
      setUniones(uni.data || [])
      setLoading(false)
    })
  }, [])

  const aceroSel = aceros.find(a => String(a.id) === aceroSelId)
  const melaminaSel = melaminas.find(m => String(m.id) === melaminaSelId)
  const accesorioSel = accesorios.find(a => String(a.id) === accesorioSelId)
  const colorSel = colores.find(c => String(c.id) === colorSelId)
  const unionSel = uniones.find(u => String(u.id) === unionSelId)

  const COSTOS_ADMINISTRATIVOS = 166

  const longitudTotalAcero = piezasAcero.reduce((acc, p) => acc + p.longitud * p.cantidad, 0)

  // Cantidad total de piezas de acero (suma de cantidad de cada fila)
  const cantidadTotalPiezasAcero = piezasAcero.reduce((acc, p) => acc + p.cantidad, 0)

  // Union recta automatica: tipo R (MLB-U00), solo registros sin M en el tipo
  const unionRectaAuto = uniones.find(u => u.tipo === 'R')
  const totalUnionRectaAuto = unionRectaAuto && cantidadTotalPiezasAcero > 0
    ? cantidadTotalPiezasAcero * unionRectaAuto.precio
    : 0

  const calcSubtotalAcero = (lon: number, cant: number, precio: number) =>
    (lon * cant / 600) * precio

  const calcSubtotalMelamina = (lar: number, anc: number, cant: number, precio: number) =>
    (lar / 100) * (anc / 100) * cant * precio

  const calcSubtotalAccesorio = (cant: number, precio: number) =>
    cant * precio

  const calcSubtotalUnion = (cant: number, precio: number) =>
    cant * precio

  const calcSubtotalColor = () => {
    if (!colorSel || longitudTotalAcero === 0) return 0
    const longitudEnMetros = longitudTotalAcero / 100
    return (colorSel.precio_cotizador * longitudEnMetros) / colorSel.consumo
  }

  const handleAgregarAcero = () => {
    if (!aceroSel || !longitud || !cantAcero) return
    const lon = parseFloat(longitud)
    const cant = parseFloat(cantAcero)
    if (isNaN(lon) || isNaN(cant) || lon <= 0 || cant <= 0) return
    const subtotal = calcSubtotalAcero(lon, cant, aceroSel.precio_cotizador)
    setPiezasAcero([...piezasAcero, { id: nextIdAcero, material: aceroSel.detalle, longitud: lon, cantidad: cant, precio_unitario: aceroSel.precio_cotizador, subtotal }])
    setNextIdAcero(nextIdAcero + 1)
    setLongitud('')
    setCantAcero('')
  }

  const handleAgregarMelamina = () => {
    if (!melaminaSel || !largo || !ancho || !cantMelamina) return
    const lar = parseFloat(largo)
    const anc = parseFloat(ancho)
    const cant = parseFloat(cantMelamina)
    if (isNaN(lar) || isNaN(anc) || isNaN(cant) || lar <= 0 || anc <= 0 || cant <= 0) return
    const subtotal = calcSubtotalMelamina(lar, anc, cant, melaminaSel.precio_cotizador)
    setPiezasMelamina([...piezasMelamina, { id: nextIdMelamina, material: melaminaSel.detalle, largo: lar, ancho: anc, cantidad: cant, precio_unitario: melaminaSel.precio_cotizador, subtotal }])
    setNextIdMelamina(nextIdMelamina + 1)
    setLargo('')
    setAncho('')
    setCantMelamina('')
  }

  const handleAgregarAccesorio = () => {
    if (!accesorioSel || !cantAccesorio) return
    const cant = parseFloat(cantAccesorio)
    if (isNaN(cant) || cant <= 0) return
    const subtotal = calcSubtotalAccesorio(cant, accesorioSel.precio_cotizador)
    setPiezasAccesorio([...piezasAccesorio, { id: nextIdAccesorio, material: accesorioSel.detalle, cantidad: cant, precio_unitario: accesorioSel.precio_cotizador, subtotal }])
    setNextIdAccesorio(nextIdAccesorio + 1)
    setCantAccesorio('')
    setAccesorioSelId('')
  }

  const handleAgregarUnion = () => {
    if (!unionSel || !cantUnion) return
    const cant = parseFloat(cantUnion)
    if (isNaN(cant) || cant <= 0) return
    const subtotal = calcSubtotalUnion(cant, unionSel.precio)
    setPiezasUnion([...piezasUnion, {
      id: nextIdUnion,
      label: `${unionSel.codigo_union} — ${unionSel.tipo}`,
      tipo: unionSel.tipo,
      cantidad: cant,
      precio_unitario: unionSel.precio,
      subtotal,
    }])
    setNextIdUnion(nextIdUnion + 1)
    setCantUnion('')
    setUnionSelId('')
  }

  const totalAcero = piezasAcero.reduce((acc, p) => acc + p.subtotal, 0)
  const totalMelamina = piezasMelamina.reduce((acc, p) => acc + p.subtotal, 0)
  const totalAccesorio = piezasAccesorio.reduce((acc, p) => acc + p.subtotal, 0)
  const totalUnion = piezasUnion.reduce((acc, p) => acc + p.subtotal, 0)
  const totalColor = calcSubtotalColor()
  const totalGeneral = totalAcero + totalMelamina + totalAccesorio + totalUnion + totalUnionRectaAuto + totalColor + COSTOS_ADMINISTRATIVOS

  // Precios de venta
  const precioMarginal = totalGeneral * 1.11
  const precioNeto = precioMarginal * 1.11
  const precioFacturado = precioMarginal * 1.16

  const puedeVerPrecioMinimo =
    usuario?.cargos?.puede_ver_precio_minimo === true ||
    usuario?.cargos?.puede_ver_precio_minimo === 1 ||
    usuario?.cargos?.es_admin === true ||
    usuario?.cargos?.es_admin === 1

  const esJerarquia = puedeVerPrecioMinimo
  
  const inputStyle = {
    padding: '10px 14px',
    borderRadius: '8px',
    border: '1px solid #ddd',
    fontSize: '14px',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box' as const,
    backgroundColor: 'white',
  }

  const labelStyle = {
    fontSize: '13px',
    color: '#666',
    display: 'block' as const,
    marginBottom: '6px',
  }

  const thStyle = {
    padding: '12px 16px',
    textAlign: 'left' as const,
    borderBottom: '2px solid #eee',
    color: '#555',
    whiteSpace: 'nowrap' as const,
  }

  const tdStyle = (i: number) => ({
    padding: '12px 16px',
    borderBottom: '1px solid #f0f0f0',
    backgroundColor: i % 2 === 0 ? 'white' : '#fafafa',
    fontSize: '14px',
  })

  const emptyBox = (
    <div style={{ textAlign: 'center', padding: '24px', color: '#bbb', border: '2px dashed #eee', borderRadius: '10px' }}>
      <p style={{ margin: 0, fontSize: '14px' }}>No hay piezas agregadas todavia</p>
    </div>
  )

  const handleLimpiarTodo = () => {
    setPiezasAcero([])
    setPiezasMelamina([])
    setPiezasAccesorio([])
    setPiezasUnion([])
    setAceroSelId('')
    setMelaminaSelId('')
    setAccesorioSelId('')
    setUnionSelId('')
    setColorSelId('')
    setLongitud('')
    setCantAcero('')
    setLargo('')
    setAncho('')
    setCantMelamina('')
    setCantAccesorio('')
    setCantUnion('')
  }

  if (!usuario && !loading) return null

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', minHeight: '100vh', backgroundColor: '#f5f5f5' }}>

      <style>{`
        @media (max-width: 768px) {
          .cot-container { padding: 80px 16px 40px 16px !important; }
          .grid-acero { grid-template-columns: 1fr 1fr !important; }
          .grid-acero .col-full { grid-column: 1 / -1; }
          .grid-melamina { grid-template-columns: 1fr 1fr !important; }
          .grid-melamina .col-full { grid-column: 1 / -1; }
          .grid-accesorio { grid-template-columns: 1fr 1fr !important; }
          .grid-accesorio .col-full { grid-column: 1 / -1; }
          .grid-union { grid-template-columns: 1fr 1fr !important; }
          .grid-union .col-full { grid-column: 1 / -1; }
          .cot-tabla th, .cot-tabla td { padding: 8px 10px !important; font-size: 12px !important; color: #222 !important; }
          .resumen-bar { flex-direction: column !important; gap: 16px !important; text-align: center !important; }
        }
      `}</style>

      {/* NAVBAR */}
      <nav style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '15px 40px', backgroundColor: '#222', color: 'white',
        position: 'fixed', top: 0, width: '100%', zIndex: 1000, boxSizing: 'border-box'
      }}>
        <a href="/" style={{ fontWeight: 'bold', fontSize: '20px', color: 'white', textDecoration: 'none' }}>
          Muebles is Better
        </a>
        <span style={{ color: '#a3c47d', fontSize: '16px', fontWeight: 'bold' }}>Cotizador</span>
        {usuario && <span style={{ color: '#a3c47d', fontSize: '14px' }}>{usuario.nombre} 👤</span>}
      </nav>

      <div className="cot-container" style={{ padding: '100px 40px 60px 40px', maxWidth: '960px', margin: '0 auto' }}>
        {loading ? (
          <p style={{ textAlign: 'center', color: '#666' }}>Cargando materiales...</p>
        ) : (
          <>

            {/* ===== SECCION ACERO ===== */}
            <div style={{ backgroundColor: 'white', borderRadius: '16px', padding: '28px', boxShadow: '0 2px 12px rgba(0,0,0,0.08)', marginBottom: '24px' }}>
              <h2 style={{ margin: '0 0 4px 0', fontSize: '20px' }}>🔩 Tuberia / Acero</h2>
              <p style={{ color: '#888', fontSize: '13px', margin: '0 0 20px 0' }}>
                {esJerarquia && 'Precio por barra de 6 metros (600 cm). Formula: (longitud x cantidad / 600) x precio'}
              </p>

              <div className="grid-acero" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: '12px', alignItems: 'end', marginBottom: '12px' }}>
                <div className="col-full">
                  <label style={labelStyle}>Material</label>
                  <select value={aceroSelId} onChange={(e) => setAceroSelId(e.target.value)} style={inputStyle}>
                    <option value="">-- Selecciona un acero --</option>
                    {aceros.map((a) => (
                      <option key={a.id} value={String(a.id)}>
                        {esJerarquia ? `${a.detalle} — Bs. ${Number(a.precio_cotizador).toFixed(2)}/barra` : a.detalle}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Longitud (cm)</label>
                  <input type="number" placeholder="Ej: 120" value={longitud} onChange={(e) => setLongitud(e.target.value)} style={inputStyle} min="1" />
                </div>
                <div>
                  <label style={labelStyle}>Cantidad</label>
                  <input type="number" placeholder="Ej: 4" value={cantAcero} onChange={(e) => setCantAcero(e.target.value)} style={inputStyle} min="1" />
                </div>
                <div style={{ paddingTop: '22px' }}>
                  <button
                    onClick={handleAgregarAcero}
                    disabled={!aceroSel || !longitud || !cantAcero}
                    style={{ padding: '10px 20px', backgroundColor: (!aceroSel || !longitud || !cantAcero) ? '#ccc' : '#087e0b', color: 'white', border: 'none', borderRadius: '8px', cursor: (!aceroSel || !longitud || !cantAcero) ? 'not-allowed' : 'pointer', fontSize: '14px', fontWeight: 'bold', whiteSpace: 'nowrap' as const }}
                  >
                    + Agregar
                  </button>
                </div>
              </div>

              {esJerarquia && aceroSel && longitud && cantAcero && (
                <div style={{ backgroundColor: '#f0fff0', border: '1px solid #a3c47d', borderRadius: '8px', padding: '10px 16px', marginBottom: '16px', fontSize: '13px', color: '#2c6d2e' }}>
                  Preview: ({longitud} cm x {cantAcero} piezas / 600) x Bs. {Number(aceroSel.precio_cotizador).toFixed(2)} =
                  <strong> Bs. {calcSubtotalAcero(parseFloat(longitud) || 0, parseFloat(cantAcero) || 0, aceroSel.precio_cotizador).toFixed(2)}</strong>
                </div>
              )}

              {piezasAcero.length > 0 ? (
                <div style={{ overflowX: 'auto' }}>
                  <table className="cot-tabla" style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#f9f9f9' }}>
                        <th style={thStyle}>Material</th>
                        <th style={{ ...thStyle, textAlign: 'center' }}>Long. (cm)</th>
                        <th style={{ ...thStyle, textAlign: 'center' }}>Cant.</th>
                        {esJerarquia && <th style={{ ...thStyle, textAlign: 'center' }}>Precio/barra</th>}
                        {esJerarquia && <th style={{ ...thStyle, textAlign: 'right' }}>Subtotal</th>}
                        <th style={{ ...thStyle, textAlign: 'center' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {piezasAcero.map((p, i) => (
                        <tr key={p.id}>
                          <td style={tdStyle(i)}>{p.material}</td>
                          <td style={{ ...tdStyle(i), textAlign: 'center' }}>{p.longitud}</td>
                          <td style={{ ...tdStyle(i), textAlign: 'center' }}>{p.cantidad}</td>
                          {esJerarquia && <td style={{ ...tdStyle(i), textAlign: 'center' }}>Bs. {Number(p.precio_unitario).toFixed(2)}</td>}
                          {esJerarquia && <td style={{ ...tdStyle(i), textAlign: 'right', fontWeight: 'bold', color: '#087e0b' }}>Bs. {p.subtotal.toFixed(2)}</td>}
                          <td style={{ ...tdStyle(i), textAlign: 'center' }}>
                            <button onClick={() => setPiezasAcero(piezasAcero.filter(x => x.id !== p.id))} style={{ background: 'none', border: 'none', color: '#ff4444', cursor: 'pointer', fontSize: '18px' }}>🗑</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    {esJerarquia && <tfoot>
                      <tr style={{ backgroundColor: '#f0fff0' }}>
                        <td colSpan={esJerarquia ? 4 : 2} style={{ padding: '14px 16px', fontWeight: 'bold', fontSize: '15px', borderTop: '2px solid #087e0b' }}>Total Tuberia</td>
                        {esJerarquia && <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: 'bold', fontSize: '18px', color: '#087e0b', borderTop: '2px solid #087e0b' }}>Bs. {totalAcero.toFixed(2)}</td>}
                        <td style={{ borderTop: '2px solid #087e0b' }}></td>
                      </tr>
                    </tfoot>}
                  </table>
                </div>
              ) : emptyBox}
            </div>

            {/* ===== SECCION MELAMINA ===== */}
            <div style={{ backgroundColor: 'white', borderRadius: '16px', padding: '28px', boxShadow: '0 2px 12px rgba(0,0,0,0.08)', marginBottom: '24px' }}>
              <h2 style={{ margin: '0 0 4px 0', fontSize: '20px' }}>🪵 Melamina</h2>
              <p style={{ color: '#888', fontSize: '13px', margin: '0 0 20px 0' }}>
                {esJerarquia && 'Precio por m². Formula: (largo/100 x ancho/100) x cantidad x precio'}
              </p>

              <div className="grid-melamina" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr auto', gap: '12px', alignItems: 'end', marginBottom: '12px' }}>
                <div className="col-full">
                  <label style={labelStyle}>Material</label>
                  <select value={melaminaSelId} onChange={(e) => setMelaminaSelId(e.target.value)} style={inputStyle}>
                    <option value="">-- Selecciona una melamina --</option>
                    {melaminas.map((m) => (
                      <option key={m.id} value={String(m.id)}>
                        {esJerarquia ? `${m.detalle} — Bs. ${Number(m.precio_cotizador).toFixed(2)}/m²` : m.detalle}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Largo (cm)</label>
                  <input type="number" placeholder="Ej: 80" value={largo} onChange={(e) => setLargo(e.target.value)} style={inputStyle} min="1" />
                </div>
                <div>
                  <label style={labelStyle}>Ancho (cm)</label>
                  <input type="number" placeholder="Ej: 40" value={ancho} onChange={(e) => setAncho(e.target.value)} style={inputStyle} min="1" />
                </div>
                <div>
                  <label style={labelStyle}>Cantidad</label>
                  <input type="number" placeholder="Ej: 2" value={cantMelamina} onChange={(e) => setCantMelamina(e.target.value)} style={inputStyle} min="1" />
                </div>
                <div style={{ paddingTop: '22px' }}>
                  <button
                    onClick={handleAgregarMelamina}
                    disabled={!melaminaSel || !largo || !ancho || !cantMelamina}
                    style={{ padding: '10px 20px', backgroundColor: (!melaminaSel || !largo || !ancho || !cantMelamina) ? '#ccc' : '#087e0b', color: 'white', border: 'none', borderRadius: '8px', cursor: (!melaminaSel || !largo || !ancho || !cantMelamina) ? 'not-allowed' : 'pointer', fontSize: '14px', fontWeight: 'bold', whiteSpace: 'nowrap' as const }}
                  >
                    + Agregar
                  </button>
                </div>
              </div>

              {esJerarquia && melaminaSel && largo && ancho && cantMelamina && (
                <div style={{ backgroundColor: '#f0fff0', border: '1px solid #a3c47d', borderRadius: '8px', padding: '10px 16px', marginBottom: '16px', fontSize: '13px', color: '#2c6d2e' }}>
                  Preview: ({largo}/100 x {ancho}/100) x {cantMelamina} x Bs. {Number(melaminaSel.precio_cotizador).toFixed(2)} =
                  <strong> Bs. {calcSubtotalMelamina(parseFloat(largo) || 0, parseFloat(ancho) || 0, parseFloat(cantMelamina) || 0, melaminaSel.precio_cotizador).toFixed(2)}</strong>
                </div>
              )}

              {piezasMelamina.length > 0 ? (
                <div style={{ overflowX: 'auto' }}>
                  <table className="cot-tabla" style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#f9f9f9' }}>
                        <th style={thStyle}>Material</th>
                        <th style={{ ...thStyle, textAlign: 'center' }}>Largo (cm)</th>
                        <th style={{ ...thStyle, textAlign: 'center' }}>Ancho (cm)</th>
                        <th style={{ ...thStyle, textAlign: 'center' }}>Cant.</th>
                        {esJerarquia && <th style={{ ...thStyle, textAlign: 'center' }}>Precio/m²</th>}
                        {esJerarquia && <th style={{ ...thStyle, textAlign: 'right' }}>Subtotal</th>}
                        <th style={{ ...thStyle, textAlign: 'center' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {piezasMelamina.map((p, i) => (
                        <tr key={p.id}>
                          <td style={tdStyle(i)}>{p.material}</td>
                          <td style={{ ...tdStyle(i), textAlign: 'center' }}>{p.largo}</td>
                          <td style={{ ...tdStyle(i), textAlign: 'center' }}>{p.ancho}</td>
                          <td style={{ ...tdStyle(i), textAlign: 'center' }}>{p.cantidad}</td>
                          {esJerarquia && <td style={{ ...tdStyle(i), textAlign: 'center' }}>Bs. {Number(p.precio_unitario).toFixed(2)}</td>}
                          {esJerarquia && <td style={{ ...tdStyle(i), textAlign: 'right', fontWeight: 'bold', color: '#087e0b' }}>Bs. {p.subtotal.toFixed(2)}</td>}
                          <td style={{ ...tdStyle(i), textAlign: 'center' }}>
                            <button onClick={() => setPiezasMelamina(piezasMelamina.filter(x => x.id !== p.id))} style={{ background: 'none', border: 'none', color: '#ff4444', cursor: 'pointer', fontSize: '18px' }}>🗑</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    {esJerarquia && <tfoot>
                      <tr style={{ backgroundColor: '#f0fff0' }}>
                        <td colSpan={esJerarquia ? 5 : 3} style={{ padding: '14px 16px', fontWeight: 'bold', fontSize: '15px', borderTop: '2px solid #087e0b' }}>Total Melamina</td>
                        {esJerarquia && <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: 'bold', fontSize: '18px', color: '#087e0b', borderTop: '2px solid #087e0b' }}>Bs. {totalMelamina.toFixed(2)}</td>}
                        <td style={{ borderTop: '2px solid #087e0b' }}></td>
                      </tr>
                    </tfoot>}
                  </table>
                </div>
              ) : emptyBox}
            </div>

            {/* ===== SECCION ACCESORIOS ===== */}
            <div style={{ backgroundColor: 'white', borderRadius: '16px', padding: '28px', boxShadow: '0 2px 12px rgba(0,0,0,0.08)', marginBottom: '24px' }}>
              <h2 style={{ margin: '0 0 4px 0', fontSize: '20px' }}>🔧 Accesorios</h2>
              <p style={{ color: '#888', fontSize: '13px', margin: '0 0 20px 0' }}>
                {esJerarquia && 'Formula: cantidad x precio unitario'}
              </p>

              <div className="grid-accesorio" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto', gap: '12px', alignItems: 'end', marginBottom: '12px' }}>
                <div className="col-full">
                  <label style={labelStyle}>Accesorio</label>
                  <select value={accesorioSelId} onChange={(e) => setAccesorioSelId(e.target.value)} style={inputStyle}>
                    <option value="">-- Selecciona un accesorio --</option>
                    {accesorios.map((a) => (
                      <option key={a.id} value={String(a.id)}>
                        {esJerarquia ? `${a.detalle}${a.medidas ? ` (${a.medidas})` : ''} — Bs. ${Number(a.precio_cotizador).toFixed(2)}/u` : `${a.detalle}${a.medidas ? ` (${a.medidas})` : ''}`}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Cantidad</label>
                  <input type="number" placeholder="Ej: 4" value={cantAccesorio} onChange={(e) => setCantAccesorio(e.target.value)} style={inputStyle} min="1" />
                </div>
                <div style={{ paddingTop: '22px' }}>
                  <button
                    onClick={handleAgregarAccesorio}
                    disabled={!accesorioSel || !cantAccesorio}
                    style={{ padding: '10px 20px', backgroundColor: (!accesorioSel || !cantAccesorio) ? '#ccc' : '#087e0b', color: 'white', border: 'none', borderRadius: '8px', cursor: (!accesorioSel || !cantAccesorio) ? 'not-allowed' : 'pointer', fontSize: '14px', fontWeight: 'bold', whiteSpace: 'nowrap' as const }}
                  >
                    + Agregar
                  </button>
                </div>
              </div>

              {esJerarquia && accesorioSel && cantAccesorio && (
                <div style={{ backgroundColor: '#f0fff0', border: '1px solid #a3c47d', borderRadius: '8px', padding: '10px 16px', marginBottom: '16px', fontSize: '13px', color: '#2c6d2e' }}>
                  Preview: {cantAccesorio} x Bs. {Number(accesorioSel.precio_cotizador).toFixed(2)} =
                  <strong> Bs. {calcSubtotalAccesorio(parseFloat(cantAccesorio) || 0, accesorioSel.precio_cotizador).toFixed(2)}</strong>
                </div>
              )}

              {piezasAccesorio.length > 0 ? (
                <div style={{ overflowX: 'auto' }}>
                  <table className="cot-tabla" style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#f9f9f9' }}>
                        <th style={thStyle}>Accesorio</th>
                        <th style={{ ...thStyle, textAlign: 'center' }}>Cant.</th>
                        {esJerarquia && <th style={{ ...thStyle, textAlign: 'center' }}>Precio/u</th>}
                        {esJerarquia && <th style={{ ...thStyle, textAlign: 'right' }}>Subtotal</th>}
                        <th style={{ ...thStyle, textAlign: 'center' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {piezasAccesorio.map((p, i) => (
                        <tr key={p.id}>
                          <td style={tdStyle(i)}>{p.material}</td>
                          <td style={{ ...tdStyle(i), textAlign: 'center' }}>{p.cantidad}</td>
                          {esJerarquia && <td style={{ ...tdStyle(i), textAlign: 'center' }}>Bs. {Number(p.precio_unitario).toFixed(2)}</td>}
                          {esJerarquia && <td style={{ ...tdStyle(i), textAlign: 'right', fontWeight: 'bold', color: '#087e0b' }}>Bs. {p.subtotal.toFixed(2)}</td>}
                          <td style={{ ...tdStyle(i), textAlign: 'center' }}>
                            <button onClick={() => setPiezasAccesorio(piezasAccesorio.filter(x => x.id !== p.id))} style={{ background: 'none', border: 'none', color: '#ff4444', cursor: 'pointer', fontSize: '18px' }}>🗑</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    {esJerarquia && <tfoot>
                      <tr style={{ backgroundColor: '#f0fff0' }}>
                        <td colSpan={esJerarquia ? 3 : 1} style={{ padding: '14px 16px', fontWeight: 'bold', fontSize: '15px', borderTop: '2px solid #087e0b' }}>Total Accesorios</td>
                        {esJerarquia && <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: 'bold', fontSize: '18px', color: '#087e0b', borderTop: '2px solid #087e0b' }}>Bs. {totalAccesorio.toFixed(2)}</td>}
                        <td style={{ borderTop: '2px solid #087e0b' }}></td>
                      </tr>
                    </tfoot>}
                  </table>
                </div>
              ) : emptyBox}
            </div>

            {/* ===== SECCION UNIONES ===== */}
            <div style={{ backgroundColor: 'white', borderRadius: '16px', padding: '28px', boxShadow: '0 2px 12px rgba(0,0,0,0.08)', marginBottom: '24px' }}>
              <h2 style={{ margin: '0 0 4px 0', fontSize: '20px' }}>🔗 Uniones</h2>
              <p style={{ color: '#888', fontSize: '13px', margin: '0 0 20px 0' }}>
                {esJerarquia && 'Formula: cantidad x precio unitario. La union recta (R) se calcula automaticamente segun las piezas de tuberia.'}
              </p>

              {/* Union recta automatica */}
              {esJerarquia && unionRectaAuto && cantidadTotalPiezasAcero > 0 && (
                <div style={{ backgroundColor: '#f0fff0', border: '1px solid #a3c47d', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px', fontSize: '13px', color: '#2c6d2e', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>
                    🔩 Union Recta ({unionRectaAuto.codigo_union}) — calculada automaticamente: {cantidadTotalPiezasAcero} piezas x Bs. {Number(unionRectaAuto.precio).toFixed(2)}
                  </span>
                  <strong style={{ fontSize: '15px' }}>Bs. {totalUnionRectaAuto.toFixed(2)}</strong>
                </div>
              )}

              {esJerarquia && unionRectaAuto && cantidadTotalPiezasAcero === 0 && (
                <div style={{ backgroundColor: '#f9f9f9', border: '1px solid #eee', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px', fontSize: '13px', color: '#aaa' }}>
                  🔩 Union Recta ({unionRectaAuto.codigo_union}) — se calculara automaticamente cuando agregues piezas de tuberia
                </div>
              )}

              <div className="grid-union" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto', gap: '12px', alignItems: 'end', marginBottom: '12px' }}>
                <div className="col-full">
                  <label style={labelStyle}>Otras uniones</label>
                  <select value={unionSelId} onChange={(e) => setUnionSelId(e.target.value)} style={inputStyle}>
                    <option value="">-- Selecciona una union --</option>
                    {uniones.filter(u => u.tipo !== 'R').map((u) => (
                      <option key={u.id} value={String(u.id)}>
                        {esJerarquia ? `${u.codigo_union} — ${u.tipo} — Bs. ${Number(u.precio).toFixed(2)}/u` : `${u.codigo_union} — ${u.tipo}`}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Cantidad</label>
                  <input type="number" placeholder="Ej: 8" value={cantUnion} onChange={(e) => setCantUnion(e.target.value)} style={inputStyle} min="1" />
                </div>
                <div style={{ paddingTop: '22px' }}>
                  <button
                    onClick={handleAgregarUnion}
                    disabled={!unionSel || !cantUnion}
                    style={{ padding: '10px 20px', backgroundColor: (!unionSel || !cantUnion) ? '#ccc' : '#087e0b', color: 'white', border: 'none', borderRadius: '8px', cursor: (!unionSel || !cantUnion) ? 'not-allowed' : 'pointer', fontSize: '14px', fontWeight: 'bold', whiteSpace: 'nowrap' as const }}
                  >
                    + Agregar
                  </button>
                </div>
              </div>

              {esJerarquia && unionSel && cantUnion && (
                <div style={{ backgroundColor: '#f0fff0', border: '1px solid #a3c47d', borderRadius: '8px', padding: '10px 16px', marginBottom: '16px', fontSize: '13px', color: '#2c6d2e' }}>
                  Preview: {cantUnion} x Bs. {Number(unionSel.precio).toFixed(2)} =
                  <strong> Bs. {calcSubtotalUnion(parseFloat(cantUnion) || 0, unionSel.precio).toFixed(2)}</strong>
                </div>
              )}

              {piezasUnion.length > 0 ? (
                <div style={{ overflowX: 'auto' }}>
                  <table className="cot-tabla" style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#f9f9f9' }}>
                        <th style={thStyle}>Union</th>
                        <th style={{ ...thStyle, textAlign: 'center' }}>Cant.</th>
                        {esJerarquia && <th style={{ ...thStyle, textAlign: 'center' }}>Precio/u</th>}
                        {esJerarquia && <th style={{ ...thStyle, textAlign: 'right' }}>Subtotal</th>}
                        <th style={{ ...thStyle, textAlign: 'center' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {piezasUnion.map((p, i) => (
                        <tr key={p.id}>
                          <td style={tdStyle(i)}>{p.label}</td>
                          <td style={{ ...tdStyle(i), textAlign: 'center' }}>{p.cantidad}</td>
                          {esJerarquia && <td style={{ ...tdStyle(i), textAlign: 'center' }}>Bs. {Number(p.precio_unitario).toFixed(2)}</td>}
                          {esJerarquia && <td style={{ ...tdStyle(i), textAlign: 'right', fontWeight: 'bold', color: '#087e0b' }}>Bs. {p.subtotal.toFixed(2)}</td>}
                          <td style={{ ...tdStyle(i), textAlign: 'center' }}>
                            <button onClick={() => setPiezasUnion(piezasUnion.filter(x => x.id !== p.id))} style={{ background: 'none', border: 'none', color: '#ff4444', cursor: 'pointer', fontSize: '18px' }}>🗑</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    {esJerarquia && <tfoot>
                      <tr style={{ backgroundColor: '#f0fff0' }}>
                        <td colSpan={esJerarquia ? 3 : 1} style={{ padding: '14px 16px', fontWeight: 'bold', fontSize: '15px', borderTop: '2px solid #087e0b' }}>Total Uniones (manuales)</td>
                        {esJerarquia && <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: 'bold', fontSize: '18px', color: '#087e0b', borderTop: '2px solid #087e0b' }}>Bs. {totalUnion.toFixed(2)}</td>}
                        <td style={{ borderTop: '2px solid #087e0b' }}></td>
                      </tr>
                    </tfoot>}
                  </table>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '24px', color: '#bbb', border: '2px dashed #eee', borderRadius: '10px' }}>
                  <p style={{ margin: 0, fontSize: '14px' }}>No hay otras uniones agregadas</p>
                </div>
              )}
            </div>

            {/* ===== SECCION COLOR ===== */}
            <div style={{ backgroundColor: 'white', borderRadius: '16px', padding: '28px', boxShadow: '0 2px 12px rgba(0,0,0,0.08)', marginBottom: '24px' }}>
              <h2 style={{ margin: '0 0 4px 0', fontSize: '20px' }}>🎨 Color / Pintura</h2>
              <p style={{ color: '#888', fontSize: '13px', margin: '0 0 20px 0' }}>
                {esJerarquia && 'Formula: (precio x longitud total de tuberia) / consumo. Se calcula automaticamente segun la tuberia ingresada.'}
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label style={labelStyle}>Color</label>
                  <select value={colorSelId} onChange={(e) => setColorSelId(e.target.value)} style={inputStyle}>
                    <option value="">-- Selecciona un color --</option>
                    {colores.map((c) => (
                      <option key={c.id} value={String(c.id)}>
                        {esJerarquia ? `${c.detalle} — Bs. ${Number(c.precio_cotizador).toFixed(2)} | Consumo: ${c.consumo}` : c.detalle}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {esJerarquia && <div style={{ backgroundColor: '#f9f9f9', border: '1px solid #eee', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px', fontSize: '13px', color: '#555' }}>
                📏 Longitud total de tubería ingresada:
                <strong style={{ color: longitudTotalAcero > 0 ? '#087e0b' : '#aaa' }}> {longitudTotalAcero.toFixed(0)} cm</strong>
                {longitudTotalAcero === 0 && <span style={{ color: '#aaa' }}> — Agrega tubería primero</span>}
              </div>}

              {esJerarquia && colorSel && longitudTotalAcero > 0 && (
                <div style={{ backgroundColor: '#f0fff0', border: '1px solid #a3c47d', borderRadius: '8px', padding: '10px 16px', fontSize: '13px', color: '#2c6d2e' }}>
                  Preview: (Bs. {Number(colorSel.precio_cotizador).toFixed(2)} x {longitudTotalAcero.toFixed(0)} cm) / {colorSel.consumo} =
                  <strong> Bs. {calcSubtotalColor().toFixed(2)}</strong>
                </div>
              )}

              {esJerarquia && colorSel && longitudTotalAcero === 0 && (
                <div style={{ backgroundColor: '#fff8e1', border: '1px solid #ffd54f', borderRadius: '8px', padding: '10px 16px', fontSize: '13px', color: '#f57f17' }}>
                  ⚠️ Agrega piezas de tubería para calcular el color automáticamente.
                </div>
              )}

              {!colorSel && (
                <div style={{ textAlign: 'center', padding: '24px', color: '#bbb', border: '2px dashed #eee', borderRadius: '10px' }}>
                  <p style={{ margin: 0, fontSize: '14px' }}>Selecciona un color para ver el cálculo</p>
                </div>
              )}
            </div>

            {/* RESUMEN TOTAL */}
            {(piezasAcero.length > 0 || piezasMelamina.length > 0 || piezasAccesorio.length > 0 || piezasUnion.length > 0 || colorSel) && (
              <>
                {/* DETALLE DE COSTOS — solo jerarquia */}
                {esJerarquia && (
                  <div className="resumen-bar" style={{ backgroundColor: '#222', borderRadius: '16px', padding: '24px 32px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' as const, alignItems: 'flex-end' }}>
                      {piezasAcero.length > 0 && (
                        <div>
                          <p style={{ margin: 0, color: '#aaa', fontSize: '11px' }}>Tuberia</p>
                          <p style={{ margin: '2px 0 0 0', color: '#a3c47d', fontSize: '15px', fontWeight: 'bold' }}>Bs. {totalAcero.toFixed(2)}</p>
                        </div>
                      )}
                      {piezasMelamina.length > 0 && (
                        <div>
                          <p style={{ margin: 0, color: '#aaa', fontSize: '11px' }}>Melamina</p>
                          <p style={{ margin: '2px 0 0 0', color: '#a3c47d', fontSize: '15px', fontWeight: 'bold' }}>Bs. {totalMelamina.toFixed(2)}</p>
                        </div>
                      )}
                      {piezasAccesorio.length > 0 && (
                        <div>
                          <p style={{ margin: 0, color: '#aaa', fontSize: '11px' }}>Accesorios</p>
                          <p style={{ margin: '2px 0 0 0', color: '#a3c47d', fontSize: '15px', fontWeight: 'bold' }}>Bs. {totalAccesorio.toFixed(2)}</p>
                        </div>
                      )}
                      {totalUnionRectaAuto > 0 && (
                        <div>
                          <p style={{ margin: 0, color: '#aaa', fontSize: '11px' }}>Union Recta</p>
                          <p style={{ margin: '2px 0 0 0', color: '#a3c47d', fontSize: '15px', fontWeight: 'bold' }}>Bs. {totalUnionRectaAuto.toFixed(2)}</p>
                        </div>
                      )}
                      {piezasUnion.length > 0 && (
                        <div>
                          <p style={{ margin: 0, color: '#aaa', fontSize: '11px' }}>Otras Uniones</p>
                          <p style={{ margin: '2px 0 0 0', color: '#a3c47d', fontSize: '15px', fontWeight: 'bold' }}>Bs. {totalUnion.toFixed(2)}</p>
                        </div>
                      )}
                      {colorSel && longitudTotalAcero > 0 && (
                        <div>
                          <p style={{ margin: 0, color: '#aaa', fontSize: '11px' }}>Color</p>
                          <p style={{ margin: '2px 0 0 0', color: '#a3c47d', fontSize: '15px', fontWeight: 'bold' }}>Bs. {totalColor.toFixed(2)}</p>
                        </div>
                      )}
                      <div>
                        <p style={{ margin: 0, color: '#aaa', fontSize: '11px' }}>Costos Adm.</p>
                        <p style={{ margin: '2px 0 0 0', color: '#a3c47d', fontSize: '15px', fontWeight: 'bold' }}>Bs. {COSTOS_ADMINISTRATIVOS.toFixed(2)}</p>
                      </div>
                      <div style={{ borderLeft: '1px solid #444', paddingLeft: '24px' }}>
                        <p style={{ margin: 0, color: '#aaa', fontSize: '11px' }}>Costo Total</p>
                        <p style={{ margin: '2px 0 0 0', color: 'white', fontSize: '20px', fontWeight: 'bold' }}>Bs. {totalGeneral.toFixed(2)}</p>
                      </div>
                    </div>
                    <button
                      onClick={handleLimpiarTodo}
                      style={{ padding: '10px 20px', backgroundColor: 'transparent', color: '#ff6b6b', border: '1px solid #ff6b6b', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', flexShrink: 0 }}
                    >
                      Limpiar todo
                    </button>
                  </div>
                )}

                {/* PRECIOS DE VENTA — todos los usuarios */}
                <div style={{ borderRadius: '16px', overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.10)' }}>
                  <div style={{ backgroundColor: '#1a1a2e', padding: '14px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ color: '#a3c47d', fontSize: '13px', fontWeight: 'bold', letterSpacing: '0.5px' }}>💰 PRECIOS DE VENTA</span>
                    {!esJerarquia && (
                      <button
                        onClick={handleLimpiarTodo}
                        style={{ padding: '8px 16px', backgroundColor: 'transparent', color: '#ff6b6b', border: '1px solid #ff6b6b', borderRadius: '8px', cursor: 'pointer', fontSize: '12px' }}
                      >
                        Limpiar todo
                      </button>
                    )}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)' }}>

                    {/* Precio Marginal */}
                    <div style={{ backgroundColor: '#0f3460', padding: '24px 28px', borderRight: '1px solid rgba(255,255,255,0.08)' }}>
                      <p style={{ margin: '0 0 4px 0', color: '#7eb8d4', fontSize: '12px', fontWeight: 'bold', letterSpacing: '0.5px' }}>PRECIO MARGINAL</p>
                      <p style={{ margin: '0 0 6px 0', color: 'white', fontSize: '28px', fontWeight: 'bold' }}>Bs. {precioMarginal.toFixed(2)}</p>
                      {esJerarquia && (
                        <p style={{ margin: 0, color: '#7eb8d4', fontSize: '11px' }}>Costo × 1.11 (utilidad 11%)</p>
                      )}
                    </div>

                    {/* Precio Neto */}
                    <div style={{ backgroundColor: '#16213e', padding: '24px 28px', borderRight: '1px solid rgba(255,255,255,0.08)' }}>
                      <p style={{ margin: '0 0 4px 0', color: '#a3c47d', fontSize: '12px', fontWeight: 'bold', letterSpacing: '0.5px' }}>PRECIO NETO</p>
                      <p style={{ margin: '0 0 6px 0', color: 'white', fontSize: '28px', fontWeight: 'bold' }}>Bs. {precioNeto.toFixed(2)}</p>
                      {esJerarquia && (
                        <p style={{ margin: 0, color: '#a3c47d', fontSize: '11px' }}>Marginal × 1.11 (ventas y marketing)</p>
                      )}
                    </div>

                    {/* Precio Facturado */}
                    <div style={{ backgroundColor: '#1a1a2e', padding: '24px 28px' }}>
                      <p style={{ margin: '0 0 4px 0', color: '#f5c842', fontSize: '12px', fontWeight: 'bold', letterSpacing: '0.5px' }}>PRECIO FACTURADO</p>
                      <p style={{ margin: '0 0 6px 0', color: 'white', fontSize: '28px', fontWeight: 'bold' }}>Bs. {precioFacturado.toFixed(2)}</p>
                      {esJerarquia && (
                        <p style={{ margin: 0, color: '#f5c842', fontSize: '11px' }}>Marginal × 1.16 (con factura)</p>
                      )}
                    </div>

                  </div>
                </div>
              </>
            )}

          </>
        )}
      </div>
    </div>
  )
}
