'use client'
import { useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function RegistroClientePage() {
  const [vista, setVista] = useState<'login' | 'buscar' | 'ingreso_existente' | 'activar'>('login')

  // Estados para Login Principal
  const [carnetLogin, setCarnetLogin] = useState('')
  const [contrasenaLogin, setContrasenaLogin] = useState('')
  const [cargandoLogin, setCargandoLogin] = useState(false)

  // Estados para Búsqueda
  const [busqueda, setBusqueda] = useState('')
  const [resultados, setResultados] = useState<any[]>([])
  const [buscando, setBuscando] = useState(false)

  // Cliente seleccionado
  const [clienteSeleccionado, setClienteSeleccionado] = useState<any>(null)

  // Estados para Vista "ingreso_existente"
  const [ciIngreso, setCiIngreso] = useState('')
  const [passIngreso, setPassIngreso] = useState('')
  const [validandoExistente, setValidandoExistente] = useState(false)

  // Estados para Vista "activar"
  const [codigoVendedor, setCodigoVendedor] = useState('')
  const [nuevoCarnet, setNuevoCarnet] = useState('')
  const [nuevaContrasena, setNuevaContrasena] = useState('')
  const [actualizando, setActualizando] = useState(false)

  const [mensaje, setMensaje] = useState({ texto: '', tipo: '' })

  const extraerNombre = (obj: any) => obj?.nombre ?? 'Sin nombre'
  const extraerCelular = (obj: any) => obj?.celular ?? 'No registrado'

  // Manejar Login Principal
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!carnetLogin.trim() || !contrasenaLogin.trim()) {
      setMensaje({ texto: 'Ingresa tu carnet y contraseña.', tipo: 'error' })
      return
    }

    setCargandoLogin(true)
    setMensaje({ texto: '', tipo: '' })

    try {
      const val = carnetLogin.trim()
      const pass = contrasenaLogin.trim()

      const { data: cliente, error } = await supabase
        .from('clientes')
        .select('*')
        .eq('carnet', val)
        .eq('activo', true)
        .maybeSingle()

      if (error) {
        setMensaje({ texto: 'Error al conectar con la base de datos: ' + error.message, tipo: 'error' })
        setCargandoLogin(false)
        return
      }

      if (!cliente || !cliente.password_hash) {
        setMensaje({ texto: 'Carnet o contraseña incorrectos.', tipo: 'error' })
        setCargandoLogin(false)
        return
      }

      const { data: valido, error: verError } = await supabase.rpc('verificar_password', {
        password_input: pass,
        hash_guardado: cliente.password_hash,
      })

      if (verError || !valido) {
        setMensaje({ texto: 'Carnet o contraseña incorrectos.', tipo: 'error' })
        setCargandoLogin(false)
        return
      }

      localStorage.setItem('carnet', cliente.carnet)
      localStorage.setItem('tipoUsuario', 'cliente')
      window.location.href = '/'
    } catch (err: any) {
      setMensaje({ texto: 'Error al iniciar sesión: ' + err.message, tipo: 'error' })
      setCargandoLogin(false)
    }
  }

  // Buscar por Nombre o Celular
  const handleBuscar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!busqueda.trim()) return

    setBuscando(true)
    setMensaje({ texto: '', tipo: '' })

    const val = busqueda.trim()
    const { data, error } = await supabase
      .from('clientes')
      .select('*')
      .or(`nombre.ilike.%${val}%,celular.ilike.%${val}%`)

    if (error) {
      setMensaje({ texto: 'Error en la búsqueda: ' + error.message, tipo: 'error' })
    } else {
      setResultados(data || [])
      if (data && data.length === 0) {
        setMensaje({ texto: 'No se encontró ningún registro con ese nombre o celular.', tipo: 'info' })
      }
    }
    setBuscando(false)
  }

  // Seleccionar usuario de la lista
  const handleSeleccionarCliente = (cliente: any) => {
    setClienteSeleccionado(cliente)
    setMensaje({ texto: '', tipo: '' })

    // Un cliente "ya tiene credenciales" si tiene carnet Y password_hash guardados
    const tieneCredenciales = !!cliente.carnet && !!cliente.password_hash

    if (tieneCredenciales) {
      setVista('ingreso_existente')
    } else {
      setVista('activar')
    }
  }

  // Ingresar para cliente existente (vía buscador)
  const handleIngresarExistente = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!ciIngreso.trim() || !passIngreso.trim()) {
      setMensaje({ texto: 'Debes ingresar tu carnet y contraseña.', tipo: 'error' })
      return
    }

    setValidandoExistente(true)
    setMensaje({ texto: '', tipo: '' })

    try {
      if (ciIngreso.trim() !== clienteSeleccionado.carnet) {
        setMensaje({ texto: 'El carnet no coincide con este registro.', tipo: 'error' })
        setValidandoExistente(false)
        return
      }

      const { data: valido, error: verError } = await supabase.rpc('verificar_password', {
        password_input: passIngreso.trim(),
        hash_guardado: clienteSeleccionado.password_hash,
      })

      if (verError || !valido) {
        setMensaje({ texto: 'El carnet o la contraseña no coinciden con este registro.', tipo: 'error' })
        setValidandoExistente(false)
        return
      }

      localStorage.setItem('carnet', clienteSeleccionado.carnet)
      localStorage.setItem('tipoUsuario', 'cliente')
      window.location.href = '/'
    } catch (err: any) {
      setMensaje({ texto: 'Error al validar: ' + err.message, tipo: 'error' })
      setValidandoExistente(false)
    }
  }

  // Activar cuenta para cliente sin contraseña (usa la RPC activar_credenciales_cliente)
  const handleActivarCuenta = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!codigoVendedor.trim() || !nuevoCarnet.trim() || !nuevaContrasena.trim()) {
      setMensaje({ texto: 'Todos los campos son obligatorios para activar tu cuenta.', tipo: 'error' })
      return
    }

    const codClienteReal = String(clienteSeleccionado.codigo)
    if (codigoVendedor.trim() !== codClienteReal) {
      setMensaje({ texto: 'El código de cliente no coincide con este usuario. Verifica el código otorgado por tu vendedor.', tipo: 'error' })
      return
    }

    setActualizando(true)
    setMensaje({ texto: '', tipo: '' })

    try {
      const { data, error: rpcError } = await supabase.rpc('activar_credenciales_cliente', {
        p_codigo: clienteSeleccionado.codigo,
        p_carnet: nuevoCarnet.trim(),
        p_password: nuevaContrasena.trim(),
      })

      if (rpcError) throw rpcError

      localStorage.setItem('carnet', nuevoCarnet.trim())
      localStorage.setItem('tipoUsuario', 'cliente')
      window.location.href = '/'
    } catch (err: any) {
      setMensaje({ texto: 'Error al activar tu cuenta: ' + err.message, tipo: 'error' })
      setActualizando(false)
    }
  }

  const inputStyle = {
    padding: '12px 16px', borderRadius: '10px', border: '1px solid rgba(255,215,0,0.3)',
    fontSize: '14px', width: '100%', boxSizing: 'border-box' as const,
    backgroundColor: '#0d0d1f', color: 'white', outline: 'none'
  }

  const nombreCliente = extraerNombre(clienteSeleccionado)

  return (
    <div style={{ minHeight: '100vh', background: '#0f1117', color: 'white', fontFamily: 'Inter, sans-serif', paddingBottom: '60px' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 40px', background: '#161726', borderBottom: '1px solid rgba(255,215,0,0.2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <img src="/logo.jpg" alt="Logo" style={{ width: '35px', height: '35px', borderRadius: '8px' }} />
          <span style={{ fontWeight: '800', color: '#FFD700', fontSize: '16px' }}>Muebles is Better</span>
        </div>
        <a href="/" style={{ color: '#ccc', textDecoration: 'none', fontSize: '14px' }}>Volver al Inicio</a>
      </header>

      <main style={{ maxWidth: '600px', margin: '40px auto', padding: '0 20px' }}>
        <div style={{ background: '#161726', border: '1px solid rgba(255,215,0,0.2)', borderRadius: '16px', padding: '30px', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>

          <h1 style={{ fontSize: '24px', color: '#FFD700', textAlign: 'center', marginBottom: '8px' }}>Portal de Clientes VIP</h1>
          <p style={{ textAlign: 'center', color: '#aaa', fontSize: '14px', marginBottom: '24px' }}>Accede para ver el estado de tus pedidos</p>

          <div style={{ display: 'flex', background: '#0d0d1f', borderRadius: '10px', padding: '4px', marginBottom: '24px', border: '1px solid rgba(255,255,255,0.05)' }}>
            <button
              onClick={() => { setVista('login'); setMensaje({ texto: '', tipo: '' }); setClienteSeleccionado(null); }}
              style={{ flex: 1, padding: '10px', background: vista === 'login' ? '#FFD700' : 'transparent', color: vista === 'login' ? '#0a0a1a' : '#ccc', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', fontSize: '13px', transition: '0.3s' }}
            >
              Iniciar Sesión
            </button>
            <button
              onClick={() => { setVista('buscar'); setMensaje({ texto: '', tipo: '' }); setClienteSeleccionado(null); }}
              style={{ flex: 1, padding: '10px', background: vista !== 'login' ? '#FFD700' : 'transparent', color: vista !== 'login' ? '#0a0a1a' : '#ccc', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', fontSize: '13px', transition: '0.3s' }}
            >
              Buscar / Activar Cuenta
            </button>
          </div>

          {mensaje.texto && (
            <div style={{ padding: '12px', borderRadius: '8px', marginBottom: '20px', fontSize: '13px', backgroundColor: mensaje.tipo === 'error' ? 'rgba(255,107,107,0.1)' : 'rgba(255,215,0,0.1)', color: mensaje.tipo === 'error' ? '#ff6b6b' : '#FFD700', border: `1px solid ${mensaje.tipo === 'error' ? '#ff6b6b' : '#FFD700'}30` }}>
              {mensaje.texto}
            </div>
          )}

          {/* VISTA 1: LOGIN PRINCIPAL */}
          {vista === 'login' && (
            <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div>
                <label style={{ fontSize: '12px', color: '#ccc', display: 'block', marginBottom: '5px' }}>Número de Carnet (CI) *</label>
                <input type="text" value={carnetLogin} onChange={(e) => setCarnetLogin(e.target.value)} style={inputStyle} placeholder="Tu carnet de identidad" />
              </div>
              <div>
                <label style={{ fontSize: '12px', color: '#ccc', display: 'block', marginBottom: '5px' }}>Contraseña *</label>
                <input type="password" value={contrasenaLogin} onChange={(e) => setContrasenaLogin(e.target.value)} style={inputStyle} placeholder="Tu contraseña" />
              </div>
              <button type="submit" disabled={cargandoLogin} style={{ background: 'linear-gradient(135deg, #FFD700, #FFA500)', color: '#0a0a1a', border: 'none', padding: '14px', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer', fontSize: '15px', marginTop: '10px' }}>
                {cargandoLogin ? 'Verificando...' : 'Iniciar Sesión'}
              </button>
            </form>
          )}

          {/* VISTA 2: BUSCAR USUARIO */}
          {vista === 'buscar' && (
            <div>
              <p style={{ fontSize: '13px', color: '#aaa', marginBottom: '15px' }}>
                Escribe tu <strong>Nombre</strong> o <strong>Número de Celular</strong> para ubicar tu perfil:
              </p>
              <form onSubmit={handleBuscar} style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                <input type="text" placeholder="Ej: Juan Pérez o 70012345" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} style={inputStyle} />
                <button type="submit" disabled={buscando} style={{ background: 'linear-gradient(135deg, #FFD700, #FFA500)', color: '#0a0a1a', border: 'none', padding: '0 20px', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  {buscando ? 'Buscando...' : 'Buscar'}
                </button>
              </form>

              {resultados.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <p style={{ fontSize: '12px', color: '#FFD700' }}>Selecciona tu usuario:</p>
                  {resultados.map((c, idx) => {
                    const cNombre = extraerNombre(c)
                    const cCel = extraerCelular(c)
                    return (
                      <div key={c.id || c.codigo || idx} onClick={() => handleSeleccionarCliente(c)} style={{ background: '#0d0d1f', border: '1px solid rgba(255,215,0,0.3)', padding: '15px', borderRadius: '10px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <strong style={{ display: 'block', fontSize: '15px' }}>{cNombre}</strong>
                          <span style={{ fontSize: '12px', color: '#aaa' }}>Celular: {cCel}</span>
                        </div>
                        <span style={{ color: '#FFD700', fontSize: '13px', fontWeight: 'bold' }}>Seleccionar →</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* VISTA 3: INGRESO PARA CLIENTE QUE YA TIENE CREDENCIALES */}
          {vista === 'ingreso_existente' && clienteSeleccionado && (
            <form onSubmit={handleIngresarExistente} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div style={{ background: 'rgba(255,215,0,0.05)', padding: '15px', borderRadius: '10px', border: '1px solid rgba(255,215,0,0.2)' }}>
                <p style={{ margin: '0 0 4px 0', fontSize: '12px', color: '#aaa' }}>Usuario encontrado:</p>
                <strong style={{ fontSize: '16px', color: '#FFD700', display: 'block' }}>{nombreCliente}</strong>
                <span style={{ fontSize: '12px', color: '#ccc' }}>Este perfil ya cuenta con datos de acceso registrados.</span>
              </div>

              <div>
                <label style={{ fontSize: '12px', color: '#ccc', display: 'block', marginBottom: '5px' }}>Ingresa tu Carnet (CI) *</label>
                <input type="text" value={ciIngreso} onChange={(e) => setCiIngreso(e.target.value)} style={inputStyle} placeholder="Tu carnet de identidad" />
              </div>

              <div>
                <label style={{ fontSize: '12px', color: '#ccc', display: 'block', marginBottom: '5px' }}>Ingresa tu Contraseña *</label>
                <input type="password" value={passIngreso} onChange={(e) => setPassIngreso(e.target.value)} style={inputStyle} placeholder="Tu contraseña" />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button type="button" onClick={() => { setClienteSeleccionado(null); setVista('buscar'); }} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: '#ccc', padding: '14px', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer', fontSize: '14px', flex: 1 }}>
                  Volver
                </button>
                <button type="submit" disabled={validandoExistente} style={{ background: 'linear-gradient(135deg, #FFD700, #FFA500)', color: '#0a0a1a', border: 'none', padding: '14px', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer', fontSize: '15px', flex: 2 }}>
                  {validandoExistente ? 'Ingresando...' : 'Entrar a mi Cuenta'}
                </button>
              </div>
            </form>
          )}

          {/* VISTA 4: ACTIVAR CLIENTE QUE NO TIENE CONTRASEÑA */}
          {vista === 'activar' && clienteSeleccionado && (
            <form onSubmit={handleActivarCuenta} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div style={{ background: 'rgba(255,215,0,0.05)', padding: '15px', borderRadius: '10px', border: '1px solid rgba(255,215,0,0.2)' }}>
                <p style={{ margin: '0 0 4px 0', fontSize: '12px', color: '#aaa' }}>Usuario a activar:</p>
                <strong style={{ fontSize: '16px', color: '#FFD700' }}>{nombreCliente}</strong>
              </div>

              <p style={{ fontSize: '13px', color: '#aaa', margin: 0 }}>
                Este perfil aún no ha configurado sus accesos web. Ingresa el <strong>Código de Cliente</strong> otorgado por tu vendedor, tu Carnet y define tu contraseña:
              </p>

              <div>
                <label style={{ fontSize: '12px', color: '#ccc', display: 'block', marginBottom: '5px' }}>Código de Cliente (Otorgado por el vendedor) *</label>
                <input type="number" value={codigoVendedor} onChange={(e) => setCodigoVendedor(e.target.value)} style={inputStyle} placeholder="Ej: 2084" />
              </div>

              <div>
                <label style={{ fontSize: '12px', color: '#ccc', display: 'block', marginBottom: '5px' }}>Tu Número de Carnet (CI) *</label>
                <input type="text" value={nuevoCarnet} onChange={(e) => setNuevoCarnet(e.target.value)} style={inputStyle} placeholder="Tu carnet de identidad" />
              </div>

              <div>
                <label style={{ fontSize: '12px', color: '#ccc', display: 'block', marginBottom: '5px' }}>Crea tu Contraseña *</label>
                <input type="password" value={nuevaContrasena} onChange={(e) => setNuevaContrasena(e.target.value)} style={inputStyle} placeholder="Contraseña segura" />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button type="button" onClick={() => { setClienteSeleccionado(null); setVista('buscar'); }} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: '#ccc', padding: '14px', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer', fontSize: '14px', flex: 1 }}>
                  Volver
                </button>
                <button type="submit" disabled={actualizando} style={{ background: 'linear-gradient(135deg, #FFD700, #FFA500)', color: '#0a0a1a', border: 'none', padding: '14px', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer', fontSize: '15px', flex: 2 }}>
                  {actualizando ? 'Guardando...' : 'Activar y Entrar'}
                </button>
              </div>
            </form>
          )}

        </div>
      </main>
    </div>
  )
}
