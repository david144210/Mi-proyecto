'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'

const UBICACIONES_PEDIDO = ['La Paz', 'El Alto', 'Cochabamba', 'Santa Cruz']

export default function ComprarPage() {
  const [cliente, setCliente] = useState<any>(null)
  const [producto, setProducto] = useState<any>(null)
  const [coloresEst, setColoresEst] = useState<any[]>([])
  const [coloresMel, setColoresMel] = useState<any[]>([])
  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState('')

  // Campos del formulario
  const [cantidad, setCantidad] = useState('1')
  const [colorEstructura, setColorEstructura] = useState('')
  const [colorMelamina, setColorMelamina] = useState('')
  const [dimensiones, setDimensiones] = useState('')
  const [ubicacion, setUbicacion] = useState('')
  const [detalles, setDetalles] = useState('')
  const [fechaEntrega, setFechaEntrega] = useState('')
  const [tipoPago, setTipoPago] = useState<'total' | 'anticipo'>('total')
  const [montoAnticipo, setMontoAnticipo] = useState('')
  const [comprobanteFile, setComprobanteFile] = useState<File | null>(null)
  const [comprobantePreview, setComprobantePreview] = useState('')

  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')
  const [exito, setExito] = useState<{ codVenta: number } | null>(null)
  const [erroresCampos, setErroresCampos] = useState<Record<string, string>>({})

  useEffect(() => {
    const carnetGuardado = localStorage.getItem('carnet')
    const tipoGuardado = localStorage.getItem('tipoUsuario')

    if (!carnetGuardado || tipoGuardado !== 'cliente') {
      window.location.href = '/'
      return
    }

    const params = new URLSearchParams(window.location.search)
    const codigoProducto = params.get('producto')

    if (!codigoProducto) {
      setErrorCarga('No se especificó ningún producto. Vuelve al catálogo y selecciona uno.')
      setCargando(false)
      return
    }

    const cargar = async () => {
      try {
        const [clienteRes, productoRes, ceRes, cmRes] = await Promise.all([
          supabase.from('clientes').select('*').eq('carnet', carnetGuardado).single(),
          supabase.from('productos').select('*').eq('codigo', codigoProducto).single(),
          supabase.from('colores').select('id, codigo_color, detalle').order('detalle'),
          supabase.from('melaminas').select('id, codigo_melamina, detalle').order('detalle'),
        ])

        if (clienteRes.error || !clienteRes.data) {
          window.location.href = '/'
          return
        }
        setCliente(clienteRes.data)

        if (productoRes.error || !productoRes.data) {
          setErrorCarga('No se encontró el producto seleccionado.')
          setCargando(false)
          return
        }
        setProducto(productoRes.data)
        setDimensiones(productoRes.data.medidas || '')

        setColoresEst(ceRes.data || [])
        setColoresMel(cmRes.data || [])
      } catch (err: any) {
        setErrorCarga('Error al cargar los datos: ' + err.message)
      } finally {
        setCargando(false)
      }
    }

    cargar()
  }, [])

  const handleArchivoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setComprobanteFile(file)
    const reader = new FileReader()
    reader.onload = () => setComprobantePreview(reader.result as string)
    reader.readAsDataURL(file)
  }

  const totalVenta = producto ? (Number(producto.precio_tienda) || 0) * (parseInt(cantidad) || 0) : 0

  const validar = (): boolean => {
    const errs: Record<string, string> = {}
    if (!cantidad || parseInt(cantidad) <= 0) errs.cantidad = 'Ingresa una cantidad válida'
    if (!colorEstructura) errs.colorEstructura = 'Selecciona un color de estructura'
    if (!colorMelamina) errs.colorMelamina = 'Selecciona un color de melamina'
    if (!ubicacion) errs.ubicacion = 'Selecciona tu ciudad de entrega'
    if (!comprobanteFile) errs.comprobante = 'Sube la captura de tu comprobante de pago'
    if (tipoPago === 'anticipo') {
      const monto = parseFloat(montoAnticipo)
      if (!monto || monto <= 0) errs.montoAnticipo = 'Ingresa el monto que pagaste como anticipo'
      else if (monto >= totalVenta) errs.montoAnticipo = 'El anticipo debe ser menor al total. Si pagaste todo, elige "Pago total".'
    }
    setErroresCampos(errs)
    return Object.keys(errs).length === 0
  }

  const handleComprar = async () => {
    setError('')
    if (!validar() || !cliente || !producto) return

    setEnviando(true)
    try {
      // 1. Subir comprobante de pago a Storage
      const ext = comprobanteFile!.name.split('.').pop()
      const nombreArchivo = `${cliente.codigo}_${Date.now()}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('comprobantes')
        .upload(nombreArchivo, comprobanteFile!)

      if (uploadError) throw new Error('No se pudo subir el comprobante: ' + uploadError.message)

      const { data: urlData } = supabase.storage.from('comprobantes').getPublicUrl(nombreArchivo)
      const comprobanteUrl = urlData.publicUrl

      // 2. Obtener código de venta desde la secuencia segura de Supabase
      const { data: codData, error: codError } = await supabase.rpc('siguiente_cod_venta')
      if (codError || !codData) throw new Error('No se pudo generar el código de pedido: ' + (codError?.message || ''))
      const codVentaFinal: number = codData

      const montoFinal = tipoPago === 'total' ? totalVenta : parseFloat(montoAnticipo)

      // 3. Insertar cabecera de venta (cod_cliente = clientes.id, consistente con el panel de vendedores)
      const { error: eVenta } = await supabase.from('ventas').insert({
        cod_venta: codVentaFinal,
        cod_cliente: cliente.id,
        cod_vendedor: null,
        fecha_pedido: new Date().toISOString().split('T')[0],
        fecha_entrega: fechaEntrega || null,
        ubicacion_pedido: ubicacion,
        detalles_especificos: detalles || null,
        total_venta: totalVenta,
        anticipo: montoFinal,
        forma_pago: 'TRANSFERENCIA',
        estado: 1,
        origen: 'web',
        estado_pago: 'pendiente',
        comprobante_url: comprobanteUrl,
      })

      if (eVenta) throw new Error('Error al registrar el pedido: ' + eVenta.message)

      // 4. Insertar línea de detalle
      const { error: eDet } = await supabase.from('detalle_venta').insert({
        cod_venta: codVentaFinal,
        item: 1,
        cod_producto: producto.codigo,
        precio_cotizado: producto.precio_minimo || null,
        precio_vendido: producto.precio_tienda,
        cantidad: parseInt(cantidad),
        subtotal: totalVenta,
        dimensiones: dimensiones || null,
        color_estructura: colorEstructura,
        color_melamina: colorMelamina,
      })

      if (eDet) {
        await supabase.from('ventas').delete().eq('cod_venta', codVentaFinal)
        throw new Error('Error al registrar el producto del pedido: ' + eDet.message)
      }

      // 5. Insertar progreso de producción inicial
      await supabase.from('progreso_produccion').insert({
        codigo_pedido: codVentaFinal,
        estado: 1,
        fecha_ingreso: new Date().toISOString().split('T')[0],
      })

      setExito({ codVenta: codVentaFinal })
    } catch (err: any) {
      setError(err.message || 'Ocurrió un error inesperado.')
    } finally {
      setEnviando(false)
    }
  }

  const inputStyle = {
    padding: '12px 16px', borderRadius: '10px', border: '1px solid rgba(255,215,0,0.3)',
    fontSize: '14px', width: '100%', boxSizing: 'border-box' as const,
    backgroundColor: '#0d0d1f', color: 'white', outline: 'none',
  }
  const labelStyle = { fontSize: '12px', color: '#ccc', display: 'block', marginBottom: '6px' }
  const errStyle = { color: '#ff6b6b', fontSize: '12px', margin: '4px 0 0 0' }

  if (cargando) {
    return (
      <div style={{ minHeight: '100vh', background: '#0f1117', color: '#FFD700', display: 'flex', justifyContent: 'center', alignItems: 'center', fontFamily: 'Inter, sans-serif' }}>
        <p>Cargando...</p>
      </div>
    )
  }

  if (errorCarga) {
    return (
      <div style={{ minHeight: '100vh', background: '#0f1117', color: 'white', display: 'flex', flexDirection: 'column', gap: '15px', justifyContent: 'center', alignItems: 'center', fontFamily: 'Inter, sans-serif', padding: '20px', textAlign: 'center' }}>
        <p style={{ color: '#ff6b6b' }}>{errorCarga}</p>
        <a href="/mi-cuenta" style={{ color: '#FFD700', textDecoration: 'none', fontWeight: 'bold' }}>← Volver a Mi Cuenta</a>
      </div>
    )
  }

  if (exito) {
    return (
      <div style={{ minHeight: '100vh', background: '#0f1117', color: 'white', display: 'flex', justifyContent: 'center', alignItems: 'center', fontFamily: 'Inter, sans-serif', padding: '20px' }}>
        <div style={{ background: '#161726', border: '1px solid rgba(255,215,0,0.3)', borderRadius: '20px', padding: '40px', maxWidth: '440px', textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '10px' }}>✅</div>
          <h1 style={{ color: '#FFD700', fontSize: '22px', margin: '0 0 10px 0' }}>¡Pedido registrado!</h1>
          <p style={{ color: '#ccc', fontSize: '14px', lineHeight: '1.6' }}>
            Tu pedido <strong style={{ color: '#FFD700' }}>#{exito.codVenta}</strong> fue registrado y tu comprobante está en revisión.
            Un vendedor va a confirmar tu pago pronto y podrás ver el avance en "Mis Pedidos".
          </p>
          <a href="/mi-cuenta" style={{ display: 'inline-block', marginTop: '20px', background: 'linear-gradient(135deg, #FFD700, #FFA500)', color: '#0a0a1a', padding: '12px 28px', borderRadius: '25px', fontWeight: 'bold', textDecoration: 'none' }}>
            Ver Mis Pedidos
          </a>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0f1117', color: 'white', fontFamily: 'Inter, sans-serif', paddingBottom: '60px' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 40px', background: '#161726', borderBottom: '1px solid rgba(255,215,0,0.2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <img src="/logo.jpg" alt="Logo" style={{ width: '35px', height: '35px', borderRadius: '8px' }} />
          <span style={{ fontWeight: '800', color: '#FFD700', fontSize: '16px' }}>Muebles is Better</span>
        </div>
        <a href="/mi-cuenta" style={{ color: '#ccc', textDecoration: 'none', fontSize: '14px' }}>← Volver</a>
      </header>

      <main style={{ maxWidth: '640px', margin: '40px auto', padding: '0 20px' }}>
        {/* Resumen del producto */}
        <div style={{ background: '#161726', border: '1px solid rgba(255,215,0,0.3)', borderRadius: '16px', padding: '20px', marginBottom: '25px', display: 'flex', gap: '16px', alignItems: 'center' }}>
          <div style={{ width: '80px', height: '80px', borderRadius: '10px', background: '#0d0d1f', flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {producto?.foto_url ? (
              <img src={producto.foto_url} alt={producto.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <span style={{ color: '#444', fontSize: '11px' }}>Sin imagen</span>
            )}
          </div>
          <div>
            <span style={{ fontSize: '10px', color: '#FFD700', textTransform: 'uppercase' }}>{producto?.categoria || 'General'}</span>
            <h2 style={{ margin: '2px 0 4px 0', fontSize: '17px' }}>{producto?.nombre}</h2>
            <span style={{ color: '#FFD700', fontWeight: 'bold', fontSize: '15px' }}>
              Bs. {producto?.precio_tienda ?? '—'} c/u
            </span>
          </div>
        </div>

        <h1 style={{ fontSize: '20px', color: '#FFD700', marginBottom: '20px' }}>Completa tu pedido</h1>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div>
            <label style={labelStyle}>Cantidad *</label>
            <input type="number" min="1" value={cantidad} onChange={(e) => setCantidad(e.target.value)} style={inputStyle} />
            {erroresCampos.cantidad && <p style={errStyle}>{erroresCampos.cantidad}</p>}
          </div>

          <div>
            <label style={labelStyle}>Color de estructura (acero) *</label>
            <select value={colorEstructura} onChange={(e) => setColorEstructura(e.target.value)} style={inputStyle}>
              <option value="">Selecciona un color...</option>
              {coloresEst.map((c) => (
                <option key={c.id} value={c.codigo_color}>{c.detalle}</option>
              ))}
            </select>
            {erroresCampos.colorEstructura && <p style={errStyle}>{erroresCampos.colorEstructura}</p>}
          </div>

          <div>
            <label style={labelStyle}>Color de melamina *</label>
            <select value={colorMelamina} onChange={(e) => setColorMelamina(e.target.value)} style={inputStyle}>
              <option value="">Selecciona un color...</option>
              {coloresMel.map((m) => (
                <option key={m.id} value={m.codigo_melamina}>{m.detalle}</option>
              ))}
            </select>
            {erroresCampos.colorMelamina && <p style={errStyle}>{erroresCampos.colorMelamina}</p>}
          </div>

          <div>
            <label style={labelStyle}>Dimensiones (opcional, si necesitas una medida especial)</label>
            <input type="text" value={dimensiones} onChange={(e) => setDimensiones(e.target.value)} style={inputStyle} />
          </div>

          <div>
            <label style={labelStyle}>Ciudad de entrega *</label>
            <select value={ubicacion} onChange={(e) => setUbicacion(e.target.value)} style={inputStyle}>
              <option value="">Selecciona tu ciudad...</option>
              {UBICACIONES_PEDIDO.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
            {erroresCampos.ubicacion && <p style={errStyle}>{erroresCampos.ubicacion}</p>}
          </div>

          <div>
            <label style={labelStyle}>Dirección / referencias de entrega</label>
            <textarea value={detalles} onChange={(e) => setDetalles(e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical' as const }} placeholder="Calle, número, referencia..." />
          </div>

          <div>
            <label style={labelStyle}>Fecha de entrega deseada (opcional)</label>
            <input type="date" value={fechaEntrega} onChange={(e) => setFechaEntrega(e.target.value)} style={inputStyle} />
          </div>

          {/* Total */}
          <div style={{ background: 'rgba(255,215,0,0.05)', border: '1px solid rgba(255,215,0,0.2)', borderRadius: '12px', padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#ccc', fontSize: '14px' }}>Total del pedido</span>
            <span style={{ color: '#FFD700', fontWeight: 'bold', fontSize: '22px' }}>Bs. {totalVenta.toFixed(2)}</span>
          </div>

          {/* Forma de pago */}
          <div>
            <label style={labelStyle}>Forma de pago *</label>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setTipoPago('total')}
                style={{ flex: 1, padding: '12px', borderRadius: '10px', border: tipoPago === 'total' ? 'none' : '1px solid rgba(255,255,255,0.2)', background: tipoPago === 'total' ? 'linear-gradient(135deg, #FFD700, #FFA500)' : 'transparent', color: tipoPago === 'total' ? '#0a0a1a' : '#ccc', fontWeight: 'bold', cursor: 'pointer', fontSize: '13px' }}
              >
                Pago total
              </button>
              <button
                type="button"
                onClick={() => setTipoPago('anticipo')}
                style={{ flex: 1, padding: '12px', borderRadius: '10px', border: tipoPago === 'anticipo' ? 'none' : '1px solid rgba(255,255,255,0.2)', background: tipoPago === 'anticipo' ? 'linear-gradient(135deg, #FFD700, #FFA500)' : 'transparent', color: tipoPago === 'anticipo' ? '#0a0a1a' : '#ccc', fontWeight: 'bold', cursor: 'pointer', fontSize: '13px' }}
              >
                Pagar un anticipo
              </button>
            </div>
          </div>

          {tipoPago === 'anticipo' && (
            <div>
              <label style={labelStyle}>¿Cuánto pagaste de anticipo? (Bs.) *</label>
              <input type="number" step="0.01" value={montoAnticipo} onChange={(e) => setMontoAnticipo(e.target.value)} style={inputStyle} placeholder={`Ej: ${(totalVenta / 2).toFixed(0)}`} />
              {erroresCampos.montoAnticipo && <p style={errStyle}>{erroresCampos.montoAnticipo}</p>}
              {parseFloat(montoAnticipo) > 0 && totalVenta > 0 && (
                <p style={{ fontSize: '12px', color: '#aaa', margin: '6px 0 0 0' }}>
                  Saldo pendiente: Bs. {(totalVenta - parseFloat(montoAnticipo)).toFixed(2)}
                </p>
              )}
            </div>
          )}

          {/* Datos de pago */}
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '16px' }}>
            <p style={{ margin: '0 0 6px 0', fontSize: '13px', color: '#FFD700', fontWeight: 'bold' }}>📲 Datos para transferencia / QR</p>
            <p style={{ margin: 0, fontSize: '13px', color: '#ccc', lineHeight: '1.6' }}>
              [Completa aquí tu número de cuenta, QR o alias bancario]
            </p>
          </div>

          <div>
            <label style={labelStyle}>Sube tu comprobante de pago *</label>
            <input type="file" accept="image/*" onChange={handleArchivoChange} style={inputStyle} />
            {erroresCampos.comprobante && <p style={errStyle}>{erroresCampos.comprobante}</p>}
            {comprobantePreview && (
              <img src={comprobantePreview} alt="Vista previa" style={{ marginTop: '10px', maxWidth: '160px', borderRadius: '10px', border: '1px solid rgba(255,215,0,0.3)' }} />
            )}
          </div>

          {error && (
            <div style={{ background: 'rgba(255,107,107,0.1)', border: '1px solid #ff6b6b', borderRadius: '10px', padding: '12px', color: '#ff6b6b', fontSize: '13px' }}>
              {error}
            </div>
          )}

          <button
            onClick={handleComprar}
            disabled={enviando}
            style={{ background: 'linear-gradient(135deg, #FFD700, #FFA500)', color: '#0a0a1a', border: 'none', padding: '16px', borderRadius: '12px', fontWeight: 'bold', fontSize: '16px', cursor: 'pointer', marginTop: '10px' }}
          >
            {enviando ? 'Registrando pedido...' : `Confirmar Pedido — Bs. ${totalVenta.toFixed(2)}`}
          </button>
        </div>
      </main>
    </div>
  )
}
