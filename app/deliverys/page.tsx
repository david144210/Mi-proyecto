'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import dynamic from 'next/dynamic'

const MapaInteractivo = dynamic(() => import('./MapaInteractivo'), { ssr: false })
const MapaConfigOrigen = dynamic(() => import('./MapaConfigOrigen'), { ssr: false })

type Ciudad = { id: number; nombre: string; usa_yango: boolean; activo: boolean }
type Origen = { id: number; ciudad_id: number; nombre: string; tipo: string; direccion: string; latitud: number; longitud: number; activo: boolean }
type Tarifario = { id: number; ciudad_id: number; tarifa_base_taxi: number; tarifa_km_taxi: number; tarifa_base_cliente: number; tarifa_km_cliente: number }
type Envio = {
  id: number
  ciudad_id: number
  origen_id: number | null
  cliente_nombre: string
  cliente_telefono: string | null
  cliente_direccion: string
  destino_lat: number | null
  destino_lng: number | null
  distancia_km: number | null
  duracion_min: number | null
  encargado_carnet: string | null
  monto_presupuesto: number
  monto_taxi_estimado: number
  estado: string
  viaje_id: number | null
  creado_en: string
}
type PagoTaxi = {
  id: number
  envio_id: number | null
  viaje_id: number | null
  transportista_nombre: string
  monto: number
  metodo_pago: string
  estado_pago: string
  fecha_pago: string | null
}
type Rendicion = {
  id: number
  envio_id: number
  encargado_carnet: string | null
  monto_desembolsado: number
  monto_cobrado_cliente: number | null
  monto_pagado_taxi: number | null
  utilidad: number
  estado: string
}
type Viaje = {
  id: number
  ciudad_id: number
  origen_id: number
  transportista_nombre: string
  transportista_telefono: string | null
  placa: string | null
  estado: string
  distancia_total_km: number | null
  duracion_total_min: number | null
  costo_total_taxi: number | null
  creado_en: string
}
type ViajeParada = { id: number; viaje_id: number; envio_id: number; orden_parada: number; distancia_tramo_km: number | null; costo_asignado: number | null }

export default function Deliverys() {
  const [usuario, setUsuario] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'calculadora' | 'viajes' | 'cobranza' | 'encargado' | 'config'>('calculadora')

  const [ciudades, setCiudades] = useState<Ciudad[]>([])
  const [origenes, setOrigenes] = useState<Origen[]>([])
  const [tarifarios, setTarifarios] = useState<Tarifario[]>([])
  const [envios, setEnvios] = useState<Envio[]>([])
  const [pagos, setPagos] = useState<PagoTaxi[]>([])
  const [rendiciones, setRendiciones] = useState<Rendicion[]>([])
  const [viajes, setViajes] = useState<Viaje[]>([])
  const [paradas, setParadas] = useState<ViajeParada[]>([])

  // Estados compartidos para el formulario de la Calculadora (permiten importación de ventas)
  const [clienteNombre, setClienteNombre] = useState('')
  const [clienteTelefono, setClienteTelefono] = useState('')
  const [direccion, setDireccion] = useState('')
  const [detallesEspecificos, setDetallesEspecificos] = useState('')
  const [codVentaAsociado, setCodVentaAsociado] = useState<number | null>(null)
  const [modalVentasOpen, setModalVentasOpen] = useState(false)

  const [mensaje, setMensaje] = useState('')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const carnetGuardado = localStorage.getItem('carnet')
    if (!carnetGuardado) { window.location.replace('/'); return }
    supabase.from('personal').select('*, cargos(*)')
      .eq('carnet', carnetGuardado).eq('estado', true).single()
      .then(({ data }: any) => {
        if (!data) { window.location.replace('/'); return }
        setUsuario(data)
        setLoading(false)
      })
  }, [])

  const esAdmin = usuario?.cargos?.es_admin === true
  const esCobranza = esAdmin || !!usuario?.cargos?.puede_gestionar_cobranza_delivery
  const esEncargado = esAdmin || !!usuario?.cargos?.puede_gestionar_encargado_delivery

  useEffect(() => {
    if (!loading && !esAdmin && !esCobranza && !esEncargado) window.location.replace('/')
  }, [loading, esAdmin, esCobranza, esEncargado])

  const avisar = (msg: string) => { setMensaje(msg); setTimeout(() => setMensaje(''), 3500) }

  const cargarBase = async () => {
    const { data: c } = await supabase.from('ciudades').select('*').eq('activo', true).order('nombre')
    setCiudades(c || [])
    const { data: o } = await supabase.from('origenes').select('*').eq('activo', true).order('nombre')
    setOrigenes(o || [])
    const { data: t } = await supabase.from('tarifario_ciudad').select('*')
    setTarifarios(t || [])
  }
  const cargarEnvios = async () => {
    const { data } = await supabase.from('envios').select('*').order('creado_en', { ascending: false }).limit(300)
    setEnvios(data || [])
  }
  const cargarPagos = async () => {
    const { data } = await supabase.from('pagos_taxi').select('*').order('creado_en', { ascending: false }).limit(300)
    setPagos(data || [])
  }
  const cargarRendiciones = async () => {
    const { data } = await supabase.from('rendiciones_encargado').select('*').order('creado_en', { ascending: false }).limit(300)
    setRendiciones(data || [])
  }
  const cargarViajes = async () => {
    const { data: v } = await supabase.from('viajes').select('*').order('creado_en', { ascending: false }).limit(200)
    setViajes(v || [])
    const { data: p } = await supabase.from('viaje_paradas').select('*')
    setParadas(p || [])
  }

  useEffect(() => {
    if (loading) return
    cargarBase(); cargarEnvios()
    if (esCobranza) { cargarPagos(); cargarViajes() }
    if (esEncargado) cargarRendiciones()
    if (esAdmin) cargarViajes()
  }, [loading]) // eslint-disable-line

  const handleSeleccionarVenta = (v: any) => {
    setCodVentaAsociado(v.cod_venta)
    setClienteNombre(v.cliente?.nombre || '')
    setClienteTelefono(v.cliente?.celular || '')
    setDireccion(v.ubicacion_pedido || v.destino || v.cliente?.direccion || '')
    setDetallesEspecificos(v.detalles_especificos || '')
    setTab('calculadora')
  }

  const navy = '#001f3f', gold = '#D4AF37'
  const cardStyle: React.CSSProperties = { backgroundColor: 'white', borderRadius: '16px', padding: '24px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', color: '#222' }
  const inputStyle: React.CSSProperties = { padding: '10px 12px', borderRadius: '8px', border: '1px solid #ccc', fontSize: '14px', width: '100%' }
  const btnStyle: React.CSSProperties = { backgroundColor: navy, color: gold, border: 'none', padding: '10px 18px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', fontSize: '14px' }
  const tabBtn = (active: boolean): React.CSSProperties => ({ padding: '10px 18px', borderRadius: '20px', border: `1px solid ${navy}`, backgroundColor: active ? navy : 'white', color: active ? gold : navy, fontWeight: 'bold', cursor: 'pointer', fontSize: '14px' })

  if (loading || !mounted) return <p style={{ textAlign: 'center', marginTop: '100px' }}>Cargando...</p>

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', minHeight: '100vh', backgroundColor: '#f5f5f5' }}>
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 30px', backgroundColor: navy, color: 'white', position: 'sticky', top: 0, zIndex: 1000 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <a href="/sistema" style={{ color: gold, textDecoration: 'none', fontSize: '20px' }}>←</a>
          <span style={{ fontWeight: 'bold', fontSize: '20px' }}>🚚 Deliverys</span>
        </div>
        <span style={{ color: gold, fontSize: '14px' }}>{usuario?.usuario || usuario?.nombre} 👤</span>
      </nav>

      <div style={{ padding: '30px', maxWidth: '1150px', margin: '0 auto' }}>
        {mensaje && <div style={{ backgroundColor: '#eaffea', border: '1px solid #4caf50', color: '#256029', padding: '12px 16px', borderRadius: '10px', marginBottom: '20px' }}>{mensaje}</div>}

        {/* Barra de navegación de pestañas y botón de importar ventas global */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '24px' }}>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button style={tabBtn(tab === 'calculadora')} onClick={() => setTab('calculadora')}>⚡ Calculadora</button>
            {esCobranza && <button style={tabBtn(tab === 'viajes')} onClick={() => setTab('viajes')}>🗺️ Viajes</button>}
            {esCobranza && <button style={tabBtn(tab === 'cobranza')} onClick={() => setTab('cobranza')}>💵 Cobranza</button>}
            {esEncargado && <button style={tabBtn(tab === 'encargado')} onClick={() => setTab('encargado')}>🧾 Mis rendiciones</button>}
            {esAdmin && <button style={tabBtn(tab === 'config')} onClick={() => setTab('config')}>⚙️ Configuración</button>}
          </div>

          <button
            onClick={() => setModalVentasOpen(true)}
            style={{ backgroundColor: '#10b981', color: 'white', border: 'none', padding: '10px 16px', borderRadius: '20px', fontWeight: 'bold', cursor: 'pointer', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px', boxShadow: '0 2px 6px rgba(0,0,0,0.1)' }}
          >
            📦 Importar desde Ventas
          </button>
        </div>

        {tab === 'calculadora' && (
          <Calculadora 
            ciudades={ciudades} origenes={origenes} tarifarios={tarifarios} usuario={usuario} esAdmin={esAdmin}
            cardStyle={cardStyle} inputStyle={inputStyle} btnStyle={btnStyle}
            MapaInteractivo={MapaInteractivo}
            clienteNombre={clienteNombre} setClienteNombre={setClienteNombre}
            clienteTelefono={clienteTelefono} setClienteTelefono={setClienteTelefono}
            direccion={direccion} setDireccion={setDireccion}
            detallesEspecificos={detallesEspecificos} setDetallesEspecificos={setDetallesEspecificos}
            codVentaAsociado={codVentaAsociado} setCodVentaAsociado={setCodVentaAsociado}
            onCreado={() => { cargarEnvios(); avisar('Envío registrado. Ya puede agruparse en un viaje.'); }} 
          />
        )}

        {tab === 'viajes' && esCobranza && (
          <Viajes ciudades={ciudades} origenes={origenes} tarifarios={tarifarios} envios={envios} usuario={usuario}
            cardStyle={cardStyle} inputStyle={inputStyle} btnStyle={btnStyle}
            onCreado={() => { cargarEnvios(); cargarViajes(); avisar('Viaje creado y pedidos agrupados.') }} />
        )}

        {tab === 'cobranza' && esCobranza && (
          <Cobranza viajes={viajes} paradas={paradas} envios={envios} pagos={pagos} usuario={usuario}
            cardStyle={cardStyle} inputStyle={inputStyle} btnStyle={btnStyle}
            onCambio={() => { cargarPagos(); cargarViajes(); cargarEnvios() }} avisar={avisar} />
        )}

        {tab === 'encargado' && esEncargado && (
          <PanelEncargado envios={envios} rendiciones={rendiciones} usuario={usuario} esAdmin={esAdmin}
            cardStyle={cardStyle} inputStyle={inputStyle} btnStyle={btnStyle}
            onCambio={() => { cargarRendiciones(); cargarEnvios() }} avisar={avisar} />
        )}

        {tab === 'config' && esAdmin && (
          <Configuracion ciudades={ciudades} origenes={origenes} tarifarios={tarifarios}
            cardStyle={cardStyle} inputStyle={inputStyle} btnStyle={btnStyle}
            MapaConfigOrigen={MapaConfigOrigen}
            onCambio={() => { cargarBase(); avisar('Configuración actualizada.') }} />
        )}
      </div>

      {/* MODAL GLOBAL PARA IMPORTAR VENTAS */}
      <ImportarVentasModal 
        isOpen={modalVentasOpen} 
        onClose={() => setModalVentasOpen(false)} 
        onSelectVenta={handleSeleccionarVenta} 
        supabaseClient={supabase} 
      />
    </div>
  )
}

// =====================================================================
// 1) CALCULADORA
// =====================================================================
function Calculadora({ 
  ciudades, origenes, tarifarios, usuario, esAdmin, cardStyle, inputStyle, btnStyle, MapaInteractivo, 
  clienteNombre, setClienteNombre, clienteTelefono, setClienteTelefono, 
  direccion, setDireccion, detallesEspecificos, setDetallesEspecificos, 
  codVentaAsociado, setCodVentaAsociado, onCreado 
}: any) {
  const [ciudadId, setCiudadId] = useState('')
  const [origenId, setOrigenId] = useState('')
  const [encargadoCarnet, setEncargadoCarnet] = useState(usuario?.carnet || '')
  
  const [calculando, setCalculando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [resultado, setResultado] = useState<any>(null)

  const [pinLat, setPinLat] = useState<number | null>(null)
  const [pinLng, setPinLng] = useState<number | null>(null)

  const ciudad = ciudades.find((c: Ciudad) => String(c.id) === ciudadId)
  const origenesCiudad = origenes.filter((o: Origen) => String(o.ciudad_id) === ciudadId)
  const origen = origenesCiudad.find((o: Origen) => String(o.id) === origenId)
  const tarifario = tarifarios.find((t: Tarifario) => String(t.ciudad_id) === ciudadId)

  const centerLat = origen ? origen.latitud : -17.3895
  const centerLng = origen ? origen.longitud : -66.1568

  const manejarClickMapa = async (lat: number, lng: number) => {
    setPinLat(lat)
    setPinLng(lng)
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`, {
        headers: { 'User-Agent': 'SistemaDeliverys/1.0' }
      })
      const data = await res.json()
      if (data && data.display_name) {
        setDireccion(data.display_name)
      } else {
        setDireccion(`${lat.toFixed(5)}, ${lng.toFixed(5)}`)
      }
    } catch {
      setDireccion(`${lat.toFixed(5)}, ${lng.toFixed(5)}`)
    }
  }

  const calcular = async () => {
    if (!origen || (!direccion && (!pinLat || !pinLng))) return alert('Selecciona el origen e indica la dirección o coloca un pin en el mapa[cite: 4].')
    if (!tarifario) return alert('Esta ciudad no tiene tarifario configurado.')
    setCalculando(true)
    setResultado(null)
    try {
      let latFinal = pinLat
      let lngFinal = pinLng
      let dirFinal = direccion

      if (!latFinal || !lngFinal) {
        const geoRes = await fetch(`/api/geocode?address=${encodeURIComponent(direccion + ', ' + ciudad.nombre)}`)
        if (!geoRes.ok) throw new Error('Error en el servidor de geocodificación')
        const geo = await geoRes.json()
        if (geo.error) throw new Error(geo.error)
        latFinal = geo.lat
        lngFinal = geo.lng
        dirFinal = geo.direccion_formateada
      }

      const rutaRes = await fetch('/api/ruta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origen: { lat: origen.latitud, lng: origen.longitud },
          paradas: [{ envio_id: 0, lat: latFinal, lng: lngFinal }]
        })
      })
      const ruta = await rutaRes.json()
      if (ruta.error) throw new Error(ruta.error)

      const distancia_km = ruta.distancia_total_km
      const monto_taxi = tarifario.tarifa_base_taxi + tarifario.tarifa_km_taxi * distancia_km
      const monto_cliente = tarifario.tarifa_base_cliente + tarifario.tarifa_km_cliente * distancia_km

      setResultado({
        distancia_km, duracion_min: ruta.duracion_total_min,
        destino_lat: latFinal, destino_lng: lngFinal, direccion_formateada: dirFinal,
        monto_taxi: Math.round(monto_taxi * 100) / 100,
        monto_cliente: Math.round(monto_cliente * 100) / 100
      })
    } catch (e: any) {
      alert('No se pudo calcular: ' + e.message)
    }
    setCalculando(false)
  }

  const registrar = async () => {
    if (!resultado || !clienteNombre) return alert('Completa el nombre del cliente.')
    setGuardando(true)
    const { data: envio, error } = await supabase.from('envios').insert({
      ciudad_id: ciudad.id, origen_id: origen.id,
      cliente_nombre: clienteNombre, cliente_telefono: clienteTelefono || null,
      cliente_direccion: resultado.direccion_formateada,
      destino_lat: resultado.destino_lat, destino_lng: resultado.destino_lng,
      distancia_km: resultado.distancia_km, duracion_min: resultado.duracion_min,
      encargado_carnet: encargadoCarnet || null,
      monto_presupuesto: resultado.monto_cliente, monto_taxi_estimado: resultado.monto_taxi,
      creado_por: usuario?.carnet || null, estado: 'pendiente'
    }).select().single()

    if (error || !envio) { setGuardando(false); return alert('Error al registrar: ' + error?.message) }

    await supabase.from('rendiciones_encargado').insert({
      envio_id: envio.id, encargado_carnet: encargadoCarnet || null,
      monto_desembolsado: resultado.monto_cliente, estado: 'pendiente'
    })

    setGuardando(false); setDireccion(''); setClienteNombre(''); setClienteTelefono(''); setDetallesEspecificos(''); setCodVentaAsociado(null); setResultado(null); setPinLat(null); setPinLng(null)
    onCreado()
  }

  return (
    <div style={cardStyle}>
      <div>
        <h2 style={{ marginTop: 0, color: '#001f3f' }}>Calcular costo de envío</h2>
        <p style={{ color: '#666', fontSize: '14px' }}>Selecciona el origen y haz clic en el mapa para ubicar la casa del cliente[cite: 4].</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px,1fr))', gap: '16px', marginTop: '16px' }}>
        <div>
          <label style={{ fontSize: '13px', color: '#555' }}>Ciudad</label>
          <select style={inputStyle} value={ciudadId} onChange={e => { setCiudadId(e.target.value); setOrigenId(''); setResultado(null); setPinLat(null); setPinLng(null) }}>
            <option value="">Selecciona una ciudad</option>
            {ciudades.map((c: Ciudad) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </div>
        {ciudad && !ciudad.usa_yango && (
          <div>
            <label style={{ fontSize: '13px', color: '#555' }}>Origen (tienda/taller)</label>
            <select style={inputStyle} value={origenId} onChange={e => { setOrigenId(e.target.value); setResultado(null) }}>
              <option value="">Selecciona un origen</option>
              {origenesCiudad.map((o: Origen) => <option key={o.id} value={o.id}>{o.nombre} ({o.tipo})</option>)}
            </select>
          </div>
        )}
      </div>

      {ciudad?.usa_yango && (
        <div style={{ marginTop: '20px', backgroundColor: '#fff8e1', border: '1px solid #D4AF37', borderRadius: '10px', padding: '16px', color: '#7a5c00' }}>
          Esta ciudad no usa nuestro sistema de deliverys propio: los envíos se coordinan por <b>YANGO</b>.
        </div>
      )}

      {origen && (
        <>
          <div style={{ marginTop: '20px' }}>
            <label style={{ fontSize: '13px', color: '#555', fontWeight: 'bold', display: 'block', marginBottom: '8px' }}>
              📍 Haz clic en el mapa para colocar el pin de entrega del cliente[cite: 4] o pega el enlace/dirección de WhatsApp:
            </label>
            <div style={{ height: '350px', width: '100%', borderRadius: '12px', overflow: 'hidden', border: '1px solid #ccc' }}>
              <MapaInteractivo centerLat={centerLat} centerLng={centerLng} origen={origen} pinLat={pinLat} pinLng={pinLng} onLocationClick={manejarClickMapa} />
            </div>
          </div>

          <div style={{ marginTop: '16px' }}>
            <label style={{ fontSize: '13px', color: '#555' }}>Dirección del cliente / Enlace de WhatsApp</label>
            <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
              <input style={inputStyle} value={direccion} onChange={e => setDireccion(e.target.value)} placeholder="Pega dirección o enlace de Google Maps..." />
              <button style={{ ...btnStyle, whiteSpace: 'nowrap' }} disabled={calculando} onClick={calcular}>
                {calculando ? 'Calculando...' : 'Calcular'}
              </button>
            </div>
          </div>

          {resultado && (
            <>
              <p style={{ fontSize: '13px', color: '#666', marginTop: '10px' }}>📍 {resultado.direccion_formateada} — {resultado.distancia_km} km, ~{resultado.duracion_min} min</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px,1fr))', gap: '16px', margin: '16px 0' }}>
                <div style={{ backgroundColor: '#f5f5f5', borderRadius: '10px', padding: '16px', textAlign: 'center' }}>
                  <div style={{ fontSize: '13px', color: '#666' }}>Se paga al taxi/camión</div>
                  <div style={{ fontSize: '26px', fontWeight: 'bold', color: '#001f3f' }}>Bs {resultado.monto_taxi.toFixed(2)}</div>
                </div>
                <div style={{ backgroundColor: '#f5f5f5', borderRadius: '10px', padding: '16px', textAlign: 'center' }}>
                  <div style={{ fontSize: '13px', color: '#666' }}>Presupuesto encargado</div>
                  <div style={{ fontSize: '26px', fontWeight: 'bold', color: '#001f3f' }}>Bs {resultado.monto_cliente.toFixed(2)}</div>
                </div>
                <div style={{ backgroundColor: '#eaffea', borderRadius: '10px', padding: '16px', textAlign: 'center' }}>
                  <div style={{ fontSize: '13px', color: '#256029' }}>Margen</div>
                  <div style={{ fontSize: '26px', fontWeight: 'bold', color: '#256029' }}>Bs {(resultado.monto_cliente - resultado.monto_taxi).toFixed(2)}</div>
                </div>
              </div>

              <h3 style={{ color: '#001f3f', marginBottom: '10px' }}>Registrar este envío</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px,1fr))', gap: '16px' }}>
                <div>
                  <label style={{ fontSize: '13px', color: '#555' }}>Nombre del cliente</label>
                  <input style={inputStyle} value={clienteNombre} onChange={e => setClienteNombre(e.target.value)} />
                </div>
                <div>
                  <label style={{ fontSize: '13px', color: '#555' }}>Teléfono del cliente</label>
                  <input style={inputStyle} value={clienteTelefono} onChange={e => setClienteTelefono(e.target.value)} />
                </div>
                <div>
                  <label style={{ fontSize: '13px', color: '#555' }}>Detalles específicos</label>
                  <input style={inputStyle} value={detallesEspecificos} onChange={e => setDetallesEspecificos(e.target.value)} placeholder="Ej. Tocar timbre..." />
                </div>
                {esAdmin && (
                  <div>
                    <label style={{ fontSize: '13px', color: '#555' }}>Carnet del encargado</label>
                    <input style={inputStyle} value={encargadoCarnet} onChange={e => setEncargadoCarnet(e.target.value)} />
                  </div>
                )}
              </div>

              {codVentaAsociado && (
                <div style={{ marginTop: '12px', backgroundColor: '#e0f2fe', padding: '8px 12px', borderRadius: '8px', fontSize: '13px', color: '#0369a1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Vinculado a <strong>Venta #{codVentaAsociado}</strong></span>
                  <button onClick={() => setCodVentaAsociado(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 'bold', color: '#0369a1' }}>&times;</button>
                </div>
              )}

              <button style={{ ...btnStyle, marginTop: '18px' }} disabled={guardando} onClick={registrar}>
                {guardando ? 'Guardando...' : 'Registrar envío'}
              </button>
            </>
          )}
        </>
      )}
    </div>
  )
}

// =====================================================================
// COMPONENTE MODAL DE VENTAS (Con soporte para estados numéricos)
// =====================================================================
function ImportarVentasModal({ isOpen, onClose, onSelectVenta, supabaseClient }: { isOpen: boolean; onClose: () => void; onSelectVenta: (venta: any) => void; supabaseClient: any }) {
  const [ventas, setVentas] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [filtroFecha, setFiltroFecha] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('')

  useEffect(() => {
    if (isOpen) {
      cargarVentas()
    }
  }, [isOpen])

  const cargarVentas = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabaseClient
        .from('ventas')
        .select(`*`)
        .order('fecha_entrega', { ascending: false, nullsFirst: false })
        .limit(50)

      if (error) throw error

      const ventasConClientes = await Promise.all(
        (data || []).map(async (v: any) => {
          let clienteInfo = { nombre: 'Cliente General', celular: '', direccion: '' }
          const codigoCliente = v.cod_cliente || v.cliente_id
          if (codigoCliente) {
            const { data: cli } = await supabaseClient
              .from('clientes')
              .select('nombre, celular, direccion')
              .eq('codigo', codigoCliente)
              .single()
            if (cli) clienteInfo = cli
          }
          return { ...v, cliente: clienteInfo }
        })
      )

      setVentas(ventasConClientes)
    } catch (err: any) {
      console.error('Error al cargar ventas:', err)
      alert('Error al cargar las ventas: ' + (err.message || ''))
    } finally {
      setLoading(false)
    }
  }

  const obtenerNombreEstado = (estadoVal: any) => {
    switch (String(estadoVal)) {
      case '1': return '1 - En cola'
      case '2': return '2 - Produciendo'
      case '3': return '3 - Terminado'
      case '4': return '4 - Despachado'
      case '5': return '5 - Cobrado'
      default: return estadoVal ? `Estado ${estadoVal}` : 'Sin estado'
    }
  }

  if (!isOpen) return null

  const ventasFiltradas = ventas.filter(v => {
    const textoMatch = 
      v.cod_venta?.toString().includes(busqueda) ||
      v.cliente?.nombre?.toLowerCase().includes(busqueda.toLowerCase()) ||
      v.destino?.toLowerCase().includes(busqueda.toLowerCase()) ||
      v.ubicacion_pedido?.toLowerCase().includes(busqueda.toLowerCase())

    const fechaMatch = filtroFecha ? v.fecha_entrega === filtroFecha : true
    const estadoMatch = filtroEstado ? String(v.estado) === filtroEstado : true

    return textoMatch && fechaMatch && estadoMatch
  })

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)', padding: '16px' }}>
      <div style={{ backgroundColor: 'white', borderRadius: '16px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', width: '100%', maxWidth: '750px', display: 'flex', flexDirection: 'column', maxHeight: '85vh', overflow: 'hidden' }}>
        
        <div style={{ padding: '16px 20px', backgroundColor: '#001f3f', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '18px' }}>📦 Importar Pedido desde Ventas</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', fontSize: '22px', cursor: 'pointer' }}>&times;</button>
        </div>

        <div style={{ padding: '16px', borderBottom: '1px solid #eee', backgroundColor: '#f9fafb', display: 'grid', gridTemplateColumns: '1fr 150px 170px', gap: '10px' }}>
          <input 
            type="text" 
            placeholder="Buscar por código, cliente o destino..." 
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #ccc', fontSize: '14px', outline: 'none', width: '100%' }}
          />
          <input 
            type="date" 
            value={filtroFecha}
            onChange={(e) => setFiltroFecha(e.target.value)}
            style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid #ccc', fontSize: '14px', outline: 'none' }}
          />
          <select 
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value)}
            style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid #ccc', fontSize: '14px', outline: 'none', backgroundColor: 'white' }}
          >
            <option value="">Todos los estados</option>
            <option value="1">1 - En cola</option>
            <option value="2">2 - Produciendo</option>
            <option value="3">3 - Terminado</option>
            <option value="4">4 - Despachado</option>
            <option value="5">5 - Cobrado</option>
          </select>
        </div>

        <div style={{ padding: '16px', overflowY: 'auto', flex: 1 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '30px', color: '#666' }}>Cargando ventas desde Supabase...</div>
          ) : ventasFiltradas.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '30px', color: '#666' }}>No se encontraron ventas con los filtros seleccionados.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {ventasFiltradas.map((v) => (
                <div key={v.cod_venta} style={{ border: '1px solid #e5e7eb', borderRadius: '10px', padding: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', backgroundColor: 'white' }}>
                  <div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '4px' }}>
                      <span style={{ fontWeight: 'bold', color: '#001f3f' }}>Venta #{v.cod_venta}</span>
                      <span style={{ fontSize: '11px', backgroundColor: '#e5e7eb', padding: '2px 6px', borderRadius: '4px', color: '#374151' }}>
                        Fecha: {v.fecha_entrega || 'Sin fecha'}
                      </span>
                      {v.estado !== undefined && v.estado !== null && (
                        <span style={{ fontSize: '11px', backgroundColor: '#e0f2fe', color: '#0369a1', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>
                          {obtenerNombreEstado(v.estado)}
                        </span>
                      )}
                    </div>
                    <p style={{ margin: '2px 0', fontSize: '14px', fontWeight: '500', color: '#1f2937' }}>
                      Cliente: {v.cliente.nombre} ({v.cliente.celular || 'Sin celular'})
                    </p>
                    <p style={{ margin: 0, fontSize: '13px', color: '#4b5563' }}>
                      Destino: {v.destino || v.ubicacion_pedido || 'No especificada'}
                    </p>
                  </div>
                  <button 
                    onClick={() => {
                      onSelectVenta(v)
                      onClose()
                    }}
                    style={{ backgroundColor: '#2563eb', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', fontSize: '13px', whiteSpace: 'nowrap' }}
                  >
                    Importar
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ padding: '12px 16px', borderTop: '1px solid #eee', backgroundColor: '#f3f4f6', display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 16px', backgroundColor: '#e5e7eb', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', fontSize: '13px' }}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}

// =====================================================================
// 2) VIAJES
// =====================================================================
function Viajes({ ciudades, origenes, tarifarios, envios, usuario, cardStyle, inputStyle, btnStyle, onCreado }: any) {
  const [ciudadId, setCiudadId] = useState('')
  const [origenId, setOrigenId] = useState('')
  const [seleccionados, setSeleccionados] = useState<number[]>([])
  const [previa, setPrevia] = useState<any>(null)
  const [calculando, setCalculando] = useState(false)
  const [transportista, setTransportista] = useState('')
  const [telefono, setTelefono] = useState('')
  const [placa, setPlaca] = useState('')
  const [costoTotal, setCostoTotal] = useState('')
  const [guardando, setGuardando] = useState(false)

  const ciudad = ciudades.find((c: Ciudad) => String(c.id) === ciudadId)
  const origenesCiudad = origenes.filter((o: Origen) => String(o.ciudad_id) === ciudadId)
  const origen = origenesCiudad.find((o: Origen) => String(o.id) === origenId)
  const tarifario = tarifarios.find((t: Tarifario) => String(t.ciudad_id) === ciudadId)

  const pendientes = envios.filter((e: Envio) =>
    String(e.origen_id) === origenId && !e.viaje_id && e.estado === 'pendiente' && e.destino_lat && e.destino_lng
  )

  const toggle = (id: number) => {
    setSeleccionados(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])
    setPrevia(null)
  }

  const optimizar = async () => {
    if (!origen || seleccionados.length === 0) return alert('Elige el origen y al menos un pedido pendiente.')
    setCalculando(true)
    try {
      const paradasReq = seleccionados.map(id => {
        const e = envios.find((x: Envio) => x.id === id)
        return { envio_id: e.id, lat: e.destino_lat, lng: e.destino_lng }
      })
      const res = await fetch('/api/ruta', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ origen: { lat: origen.latitud, lng: origen.longitud }, paradas: paradasReq })
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setPrevia(data)
      if (tarifario) {
        const sugerido = tarifario.tarifa_base_taxi + tarifario.tarifa_km_taxi * data.distancia_total_km
        setCostoTotal((Math.round(sugerido * 100) / 100).toString())
      }
    } catch (e: any) {
      alert('No se pudo optimizar la ruta: ' + e.message)
    }
    setCalculando(false)
  }

  const confirmarViaje = async () => {
    if (!previa || !transportista || !costoTotal) return alert('Completa transportista y costo total del viaje.')
    setGuardando(true)
    const { data: viaje, error } = await supabase.from('viajes').insert({
      ciudad_id: ciudad.id, origen_id: origen.id,
      transportista_nombre: transportista, transportista_telefono: telefono || null, placa: placa || null,
      estado: 'planificado',
      distancia_total_km: previa.distancia_total_km, duracion_total_min: previa.duracion_total_min,
      costo_total_taxi: Number(costoTotal), ruta_google: previa.ruta_osm || previa.ruta_google,
      creado_por: usuario?.carnet || null
    }).select().single()

    if (error || !viaje) { setGuardando(false); return alert('Error al crear el viaje: ' + error?.message) }

    const total = Number(costoTotal)
    const sumaDistancias = previa.paradas_ordenadas.reduce((acc: number, p: any) => acc + p.distancia_tramo_km, 0) || 1
    const filasParadas = previa.paradas_ordenadas.map((p: any) => ({
      viaje_id: viaje.id, envio_id: p.envio_id, orden_parada: p.orden_parada,
      distancia_tramo_km: p.distancia_tramo_km,
      costo_asignado: Math.round((total * (p.distancia_tramo_km / sumaDistancias)) * 100) / 100
    }))
    await supabase.from('viaje_paradas').insert(filasParadas)
    await supabase.from('envios').update({ viaje_id: viaje.id, estado: 'en_camino' }).in('id', seleccionados)

    setGuardando(false); setSeleccionados([]); setPrevia(null); setTransportista(''); setTelefono(''); setPlaca(''); setCostoTotal('')
    onCreado()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={cardStyle}>
        <h2 style={{ marginTop: 0, color: '#001f3f' }}>Agrupar pedidos en un viaje</h2>
        <p style={{ color: '#666', fontSize: '14px' }}>
          Selecciona el origen y marca los pedidos pendientes que puede llevar el mismo taxi/camión. El sistema ordena las paradas de la forma más corta.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px,1fr))', gap: '16px', marginTop: '10px' }}>
          <select style={inputStyle} value={ciudadId} onChange={e => { setCiudadId(e.target.value); setOrigenId(''); setSeleccionados([]); setPrevia(null) }}>
            <option value="">Ciudad</option>
            {ciudades.filter((c: Ciudad) => !c.usa_yango).map((c: Ciudad) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
          <select style={inputStyle} value={origenId} onChange={e => { setOrigenId(e.target.value); setSeleccionados([]); setPrevia(null) }}>
            <option value="">Origen (tienda/taller)</option>
            {origenesCiudad.map((o: Origen) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
          </select>
        </div>

        {origen && (
          <div style={{ marginTop: '16px' }}>
            {pendientes.length === 0 && <p style={{ color: '#999' }}>No hay pedidos pendientes desde este origen.</p>}
            {pendientes.map((e: Envio) => (
              <label key={e.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', border: '1px solid #eee', borderRadius: '8px', marginBottom: '8px' }}>
                <input type="checkbox" checked={seleccionados.includes(e.id)} onChange={() => toggle(e.id)} />
                <span>#{e.id} — {e.cliente_nombre} — {e.cliente_direccion} ({e.distancia_km} km)</span>
              </label>
            ))}
            {seleccionados.length > 0 && (
              <button style={{ ...btnStyle, marginTop: '8px' }} disabled={calculando} onClick={optimizar}>
                {calculando ? 'Optimizando...' : `Optimizar ruta (${seleccionados.length} paradas)`}
              </button>
            )}
          </div>
        )}
      </div>

      {previa && (
        <div style={cardStyle}>
          <h3 style={{ marginTop: 0, color: '#001f3f' }}>Ruta sugerida</h3>
          <p style={{ fontSize: '14px', color: '#666' }}>Distancia total: {previa.distancia_total_km} km — Duración estimada: {previa.duracion_total_min} min</p>
          <ol style={{ paddingLeft: '20px' }}>
            {previa.paradas_ordenadas.map((p: any) => {
              const e = envios.find((x: Envio) => x.id === p.envio_id)
              return <li key={p.envio_id} style={{ marginBottom: '6px' }}>{e?.cliente_nombre} — {e?.cliente_direccion} <span style={{ color: '#999' }}>(+{p.distancia_tramo_km} km)</span></li>
            })}
          </ol>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px,1fr))', gap: '16px', marginTop: '16px' }}>
            <div><label style={{ fontSize: '13px', color: '#555' }}>Transportista</label><input style={inputStyle} value={transportista} onChange={e => setTransportista(e.target.value)} /></div>
            <div><label style={{ fontSize: '13px', color: '#555' }}>Teléfono</label><input style={inputStyle} value={telefono} onChange={e => setTelefono(e.target.value)} /></div>
            <div><label style={{ fontSize: '13px', color: '#555' }}>Placa</label><input style={inputStyle} value={placa} onChange={e => setPlaca(e.target.value)} /></div>
            <div><label style={{ fontSize: '13px', color: '#555' }}>Costo total del viaje (Bs)</label><input style={inputStyle} type="number" value={costoTotal} onChange={e => setCostoTotal(e.target.value)} /></div>
          </div>
          <p style={{ fontSize: '12px', color: '#999', marginTop: '8px' }}>El costo se reparte entre los pedidos según la distancia de su tramo.</p>
          <button style={{ ...btnStyle, marginTop: '12px' }} disabled={guardando} onClick={confirmarViaje}>
            {guardando ? 'Guardando...' : 'Confirmar viaje'}
          </button>
        </div>
      )}
    </div>
  )
}

// =====================================================================
// 3) COBRANZA
// =====================================================================
function Cobranza({ viajes, paradas, envios, pagos, usuario, cardStyle, inputStyle, btnStyle, onCambio, avisar }: any) {
  const viajesSinPago = viajes.filter((v: Viaje) => !pagos.some((p: PagoTaxi) => p.viaje_id === v.id))

  const registrarPago = async (v: Viaje) => {
    const { error } = await supabase.from('pagos_taxi').insert({
      viaje_id: v.id, transportista_nombre: v.transportista_nombre,
      monto: v.costo_total_taxi, metodo_pago: 'efectivo', estado_pago: 'pendiente',
      cobranza_carnet: usuario?.carnet || null
    })
    if (error) return alert('Error: ' + error.message)
    avisar('Pago registrado. Márcalo como pagado cuando entregues el dinero.')
    onCambio()
  }

  const marcarPagado = async (p: PagoTaxi) => {
    const { error } = await supabase.from('pagos_taxi').update({ estado_pago: 'pagado', fecha_pago: new Date().toISOString() }).eq('id', p.id)
    if (error) return alert('Error: ' + error.message)
    if (p.viaje_id) {
      const paradasViaje = paradas.filter((pp: ViajeParada) => pp.viaje_id === p.viaje_id)
      for (const pp of paradasViaje) {
        await supabase.from('rendiciones_encargado').update({ monto_pagado_taxi: pp.costo_asignado }).eq('envio_id', pp.envio_id)
      }
    }
    avisar('Pago marcado como realizado.')
    onCambio()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={cardStyle}>
        <h2 style={{ marginTop: 0, color: '#001f3f' }}>Viajes pendientes de pago</h2>
        {viajesSinPago.length === 0 && <p style={{ color: '#999' }}>No hay viajes pendientes de pago.</p>}
        {viajesSinPago.map((v: Viaje) => {
          const paradasViaje = paradas.filter((p: ViajeParada) => p.viaje_id === v.id)
          return (
            <div key={v.id} style={{ border: '1px solid #eee', borderRadius: '10px', padding: '14px', marginBottom: '10px' }}>
              <b>Viaje #{v.id} — {v.transportista_nombre}</b>
              <p style={{ fontSize: '13px', color: '#666', margin: '4px 0' }}>{paradasViaje.length} pedido(s) — {v.distancia_total_km} km — Bs {Number(v.costo_total_taxi).toFixed(2)}</p>
              <button style={{ ...btnStyle, padding: '6px 14px', fontSize: '13px' }} onClick={() => registrarPago(v)}>Registrar pago</button>
            </div>
          )
        })}
      </div>

      <div style={cardStyle}>
        <h2 style={{ marginTop: 0, color: '#001f3f' }}>Historial de pagos</h2>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
            <thead><tr style={{ textAlign: 'left', borderBottom: '2px solid #eee' }}>
              <th style={{ padding: '8px' }}>Viaje</th><th style={{ padding: '8px' }}>Transportista</th>
              <th style={{ padding: '8px' }}>Monto</th><th style={{ padding: '8px' }}>Estado</th><th style={{ padding: '8px' }}></th>
            </tr></thead>
            <tbody>
              {pagos.map((p: PagoTaxi) => (
                <tr key={p.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td style={{ padding: '8px' }}>{p.viaje_id ? `#${p.viaje_id}` : `envío #${p.envio_id}`}</td>
                  <td style={{ padding: '8px' }}>{p.transportista_nombre}</td>
                  <td style={{ padding: '8px' }}>Bs {Number(p.monto).toFixed(2)}</td>
                  <td style={{ padding: '8px' }}>
                    <span style={{ padding: '3px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: 'bold', backgroundColor: p.estado_pago === 'pagado' ? '#eaffea' : '#fff8e1', color: p.estado_pago === 'pagado' ? '#256029' : '#7a5c00' }}>{p.estado_pago}</span>
                  </td>
                  <td style={{ padding: '8px' }}>
                    {p.estado_pago === 'pendiente' && <button style={{ ...btnStyle, padding: '6px 12px', fontSize: '12px' }} onClick={() => marcarPagado(p)}>Marcar pagado</button>}
                  </td>
                </tr>
              ))}
              {pagos.length === 0 && <tr><td colSpan={5} style={{ padding: '16px', textAlign: 'center', color: '#999' }}>Sin pagos registrados aún.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// =====================================================================
// 4) PANEL DEL ENCARGADO
// =====================================================================
function PanelEncargado({ envios, rendiciones, usuario, esAdmin, cardStyle, inputStyle, btnStyle, onCambio, avisar }: any) {
  const misEnvios = esAdmin ? envios : envios.filter((e: Envio) => e.encargado_carnet === usuario?.carnet)
  const [edicion, setEdicion] = useState<Record<number, { cobrado: string; pagado: string }>>({})
  const rendicionDe = (envioId: number) => rendiciones.find((r: Rendicion) => r.envio_id === envioId)

  const guardarRendicion = async (envioId: number) => {
    const r = rendicionDe(envioId)
    const edit = edicion[envioId]
    if (!r || !edit) return
    const cobrado = edit.cobrado !== undefined && edit.cobrado !== '' ? Number(edit.cobrado) : r.monto_cobrado_cliente
    const { error } = await supabase.from('rendiciones_encargado').update({
      monto_cobrado_cliente: cobrado, estado: 'rendido', fecha_rendicion: new Date().toISOString()
    }).eq('id', r.id)
    if (error) return alert('Error al guardar: ' + error.message)
    await supabase.from('envios').update({ estado: 'cobrado' }).eq('id', envioId)
    avisar('Rendición guardada.')
    onCambio()
  }

  return (
    <div style={cardStyle}>
      <h2 style={{ marginTop: 0, color: '#001f3f' }}>Rendición de presupuestos</h2>
      <p style={{ color: '#666', fontSize: '14px' }}>El pago al taxi/camión lo completa Cobranza; aquí registras cuánto cobraste al cliente.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '10px' }}>
        {misEnvios.map((e: Envio) => {
          const r = rendicionDe(e.id)
          if (!r) return null
          const edit = edicion[e.id] || { cobrado: r.monto_cobrado_cliente?.toString() || '', pagado: '' }
          return (
            <div key={e.id} style={{ border: '1px solid #eee', borderRadius: '10px', padding: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                <div><b>#{e.id} — {e.cliente_nombre}</b><div style={{ fontSize: '13px', color: '#666' }}>{e.cliente_direccion}</div></div>
                <span style={{ padding: '3px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: 'bold', height: 'fit-content', backgroundColor: r.estado === 'rendido' ? '#eaffea' : '#fff8e1', color: r.estado === 'rendido' ? '#256029' : '#7a5c00' }}>{r.estado}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px,1fr))', gap: '12px', marginTop: '12px' }}>
                <div><label style={{ fontSize: '12px', color: '#555' }}>Presupuesto recibido</label><div style={{ fontWeight: 'bold' }}>Bs {Number(r.monto_desembolsado).toFixed(2)}</div></div>
                <div>
                  <label style={{ fontSize: '12px', color: '#555' }}>Cobrado al cliente</label>
                  <input style={inputStyle} type="number" value={edit.cobrado} onChange={ev => setEdicion({ ...edicion, [e.id]: { ...edit, cobrado: ev.target.value } })} disabled={r.estado === 'rendido'} />
                </div>
                <div><label style={{ fontSize: '12px', color: '#555' }}>Pagado al taxi (Cobranza)</label><div>{r.monto_pagado_taxi != null ? `Bs ${Number(r.monto_pagado_taxi).toFixed(2)}` : '—'}</div></div>
                <div><label style={{ fontSize: '12px', color: '#555' }}>Utilidad</label><div style={{ fontWeight: 'bold', color: '#256029' }}>Bs {Number(r.utilidad || 0).toFixed(2)}</div></div>
              </div>
              {r.estado !== 'rendido' && <button style={{ ...btnStyle, marginTop: '12px', padding: '8px 16px', fontSize: '13px' }} onClick={() => guardarRendicion(e.id)}>Guardar rendición</button>}
            </div>
          )
        })}
        {misEnvios.length === 0 && <p style={{ color: '#999' }}>No tienes envíos asignados todavía.</p>}
      </div>
    </div>
  )
}

// =====================================================================
// 5) CONFIGURACIÓN
// =====================================================================
function Configuracion({ ciudades, origenes, tarifarios, cardStyle, inputStyle, btnStyle, MapaConfigOrigen, onCambio }: any) {
  const [nombreCiudad, setNombreCiudad] = useState('')
  const [usaYango, setUsaYango] = useState(false)

  const [ciudadOrigenId, setCiudadOrigenId] = useState('')
  const [nombreOrigen, setNombreOrigen] = useState('')
  const [tipoOrigen, setTipoOrigen] = useState('tienda')
  const [direccionOrigen, setDireccionOrigen] = useState('')
  
  const [origenLat, setOrigenLat] = useState<number>(-17.3895)
  const [origenLng, setOrigenLng] = useState<number>(-66.1568)
  const [pinOrigenPuesto, setPinOrigenPuesto] = useState(false)
  const [guardandoOrigen, setGuardandoOrigen] = useState(false)

  const [ciudadTarifaId, setCiudadTarifaId] = useState('')
  const [baseTaxi, setBaseTaxi] = useState('')
  const [kmTaxi, setKmTaxi] = useState('')
  const [baseCliente, setBaseCliente] = useState('')
  const [kmCliente, setKmCliente] = useState('')

  const crearCiudad = async () => {
    if (!nombreCiudad) return
    const { error } = await supabase.from('ciudades').insert({ nombre: nombreCiudad, usa_yango: usaYango })
    if (error) return alert('Error: ' + error.message)
    setNombreCiudad(''); setUsaYango(false); onCambio()
  }
  const toggleYango = async (c: Ciudad) => {
    const { error } = await supabase.from('ciudades').update({ usa_yango: !c.usa_yango }).eq('id', c.id)
    if (error) return alert('Error: ' + error.message)
    onCambio()
  }

  const manejarClickMapaOrigen = async (lat: number, lng: number) => {
    setOrigenLat(lat)
    setOrigenLng(lng)
    setPinOrigenPuesto(true)
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`, {
        headers: { 'User-Agent': 'SistemaDeliverys/1.0' }
      })
      const data = await res.json()
      if (data && data.display_name) {
        setDireccionOrigen(data.display_name)
      } else {
        setDireccionOrigen(`${lat.toFixed(5)}, ${lng.toFixed(5)}`)
      }
    } catch {
      setDireccionOrigen(`${lat.toFixed(5)}, ${lng.toFixed(5)}`)
    }
  }

  const crearOrigen = async () => {
    if (!ciudadOrigenId || !nombreOrigen || !direccionOrigen) return alert('Completa ciudad, nombre y dirección.')
    setGuardandoOrigen(true)
    try {
      const { error } = await supabase.from('origenes').insert({
        ciudad_id: Number(ciudadOrigenId), nombre: nombreOrigen, tipo: tipoOrigen,
        direccion: direccionOrigen, latitud: origenLat, longitud: origenLng
      })
      if (error) throw new Error(error.message)
      setNombreOrigen(''); setDireccionOrigen(''); setPinOrigenPuesto(false)
      onCambio()
    } catch (e: any) {
      alert('No se pudo guardar el origen: ' + e.message)
    }
    setGuardandoOrigen(false)
  }

  const guardarTarifario = async () => {
    if (!ciudadTarifaId) return alert('Selecciona la ciudad.')
    const { error } = await supabase.from('tarifario_ciudad').upsert({
      ciudad_id: Number(ciudadTarifaId),
      tarifa_base_taxi: Number(baseTaxi) || 0, tarifa_km_taxi: Number(kmTaxi) || 0,
      tarifa_base_cliente: Number(baseCliente) || 0, tarifa_km_cliente: Number(kmCliente) || 0
    }, { onConflict: 'ciudad_id' })
    if (error) return alert('Error: ' + error.message)
    setBaseTaxi(''); setKmTaxi(''); setBaseCliente(''); setKmCliente('')
    onCambio()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={cardStyle}>
        <h2 style={{ marginTop: 0, color: '#001f3f' }}>Ciudades</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px,1fr))', gap: '12px' }}>
          <input style={inputStyle} placeholder="Nombre de la ciudad" value={nombreCiudad} onChange={e => setNombreCiudad(e.target.value)} />
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
            <input type="checkbox" checked={usaYango} onChange={e => setUsaYango(e.target.checked)} /> Usa YANGO
          </label>
          <button style={btnStyle} onClick={crearCiudad}>Agregar ciudad</button>
        </div>
        <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {ciudades.map((c: Ciudad) => (
            <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', border: '1px solid #eee', borderRadius: '8px' }}>
              <span>{c.nombre}</span>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                <input type="checkbox" checked={c.usa_yango} onChange={() => toggleYango(c)} /> Usa YANGO
              </label>
            </div>
          ))}
        </div>
      </div>

      <div style={cardStyle}>
        <h2 style={{ marginTop: 0, color: '#001f3f' }}>Orígenes (tiendas y talleres)</h2>
        <p style={{ fontSize: '13px', color: '#666' }}>Haz clic en el mapa para ubicar exactamente dónde está tu tienda o taller[cite: 4].</p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px,1fr))', gap: '12px', marginBottom: '16px' }}>
          <select style={inputStyle} value={ciudadOrigenId} onChange={e => setCiudadOrigenId(e.target.value)}>
            <option value="">Ciudad</option>
            {ciudades.filter((c: Ciudad) => !c.usa_yango).map((c: Ciudad) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
          <input style={inputStyle} placeholder="Nombre (ej. Tienda Centro)" value={nombreOrigen} onChange={e => setNombreOrigen(e.target.value)} />
          <select style={inputStyle} value={tipoOrigen} onChange={e => setTipoOrigen(e.target.value)}>
            <option value="tienda">Tienda</option>
            <option value="taller">Taller</option>
          </select>
        </div>

        <div style={{ height: '300px', width: '100%', borderRadius: '12px', overflow: 'hidden', border: '1px solid #ccc', marginBottom: '16px' }}>
          <MapaConfigOrigen origenLat={origenLat} origenLng={origenLng} pinOrigenPuesto={pinOrigenPuesto} onLocationClick={manejarClickMapaOrigen} />
        </div>

        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <input style={{ ...inputStyle, flex: 1 }} placeholder="Dirección obtenida del mapa" value={direccionOrigen} onChange={e => setDireccionOrigen(e.target.value)} />
          <button style={btnStyle} disabled={guardandoOrigen} onClick={crearOrigen}>
            {guardandoOrigen ? 'Guardando...' : 'Agregar origen'}
          </button>
        </div>

        <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {origenes.map((o: Origen) => (
            <div key={o.id} style={{ padding: '10px', border: '1px solid #eee', borderRadius: '8px', fontSize: '14px' }}>
              <b>{o.nombre}</b> ({o.tipo}) — {o.direccion}
            </div>
          ))}
        </div>
      </div>

      <div style={cardStyle}>
        <h2 style={{ marginTop: 0, color: '#001f3f' }}>Tarifario por ciudad (Bs)</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px,1fr))', gap: '12px' }}>
          <select style={inputStyle} value={ciudadTarifaId} onChange={e => setCiudadTarifaId(e.target.value)}>
            <option value="">Ciudad</option>
            {ciudades.filter((c: Ciudad) => !c.usa_yango).map((c: Ciudad) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
          <input style={inputStyle} placeholder="Base taxi" type="number" value={baseTaxi} onChange={e => setBaseTaxi(e.target.value)} />
          <input style={inputStyle} placeholder="Bs/km taxi" type="number" value={kmTaxi} onChange={e => setKmTaxi(e.target.value)} />
          <input style={inputStyle} placeholder="Base cliente" type="number" value={baseCliente} onChange={e => setBaseCliente(e.target.value)} />
          <input style={inputStyle} placeholder="Bs/km cliente" type="number" value={kmCliente} onChange={e => setKmCliente(e.target.value)} />
          <button style={btnStyle} onClick={guardarTarifario}>Guardar</button>
        </div>
        <div style={{ overflowX: 'auto', marginTop: '16px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
            <thead><tr style={{ textAlign: 'left', borderBottom: '2px solid #eee' }}>
              <th style={{ padding: '8px' }}>Ciudad</th><th style={{ padding: '8px' }}>Base taxi</th><th style={{ padding: '8px' }}>Bs/km taxi</th>
              <th style={{ padding: '8px' }}>Base cliente</th><th style={{ padding: '8px' }}>Bs/km cliente</th>
            </tr></thead>
            <tbody>
              {tarifarios.map((t: Tarifario) => (
                <tr key={t.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td style={{ padding: '8px' }}>{ciudades.find((c: Ciudad) => c.id === t.ciudad_id)?.nombre}</td>
                  <td style={{ padding: '8px' }}>Bs {Number(t.tarifa_base_taxi).toFixed(2)}</td>
                  <td style={{ padding: '8px' }}>Bs {Number(t.tarifa_km_taxi).toFixed(2)}</td>
                  <td style={{ padding: '8px' }}>Bs {Number(t.tarifa_base_cliente).toFixed(2)}</td>
                  <td style={{ padding: '8px' }}>Bs {Number(t.tarifa_km_cliente).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}