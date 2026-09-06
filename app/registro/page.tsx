'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

export default function RegistroClientePage() {
  const [vista, setVista] = useState<'login' | 'registro_manual' | 'buscar' | 'ingreso_existente' | 'activar' | 'google_completar'>('login')

  // Chequeo inicial de sesión de Google (evita mostrar el login de golpe mientras se verifica)
  const [chequeandoGoogle, setChequeandoGoogle] = useState(true)

  // Datos de la cuenta de Google mientras falta pedirle carnet + contraseña
  const [googleUser, setGoogleUser] = useState<{ email: string; auth_id: string; nombreSugerido: string } | null>(null)
  const [celularGoogle, setCelularGoogle] = useState('')
  const [carnetGoogle, setCarnetGoogle] = useState('')
  const [passGoogle, setPassGoogle] = useState('')
  const [completandoGoogle, setCompletandoGoogle] = useState(false)

  // Estados para Login Principal
  const [carnetLogin, setCarnetLogin] = useState('')
  const [contrasenaLogin, setContrasenaLogin] = useState('')
  const [cargandoLogin, setCargandoLogin] = useState(false)

  // Estados para Registro Manual
  const [nombreReg, setNombreReg] = useState('')
  const [emailReg, setEmailReg] = useState('')
  const [passwordReg, setPasswordReg] = useState('')
  const [celularReg, setCelularReg] = useState('')
  const [carnetReg, setCarnetReg] = useState('')
  const [cargandoRegistro, setCargandoRegistro] = useState(false)

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

  // Detectar sesión activa de Google al recargar la página tras el redirect.
  // Importante: esto YA NO crea el cliente a ciegas. Si la cuenta de Google
  // todavía no tiene carnet + contraseña asignados, se le pide completarlos
  // (misma idea que la vista "activar", pero disparada por Google en vez de
  // por el código del vendedor).
  useEffect(() => {
    let cancelado = false
    let yaProcesado = false

    const procesarSesion = async (session: any) => {
      if (yaProcesado || cancelado || !session?.user) return
      yaProcesado = true

      const authId = session.user.id
      const email = session.user.email || ''
      const nombreSugerido = session.user.user_metadata?.full_name || (email ? email.split('@')[0] : 'Cliente')

      // ¿Esta cuenta de Google ya está vinculada a un cliente? (por auth_id, o
      // por email si se vinculó antes de que existiera la columna auth_id)
      const { data: porAuthId } = await supabase.from('clientes').select('*').eq('auth_id', authId).maybeSingle()
      let cliente = porAuthId
      if (!cliente && email) {
        const { data: porEmail } = await supabase.from('clientes').select('*').eq('email', email).maybeSingle()
        cliente = porEmail
      }

      if (cancelado) return

      if (cliente?.carnet && cliente?.password_hash) {
        // Ya tiene todo activado: entra directo, sin pedir nada de nuevo.
        localStorage.setItem('carnet', cliente.carnet)
        localStorage.setItem('tipoUsuario', 'cliente')
        window.location.href = '/'
        return
      }

      // Falta carnet y/o contraseña: se los pedimos antes de continuar.
      setGoogleUser({ email, auth_id: authId, nombreSugerido })
      if (cliente) {
        setClienteSeleccionado(cliente)
        setCelularGoogle(cliente.celular || '')
      }
      setVista('google_completar')
      setChequeandoGoogle(false)
    }

    // 1) Por si la sesión ya estaba lista al montar (ej. recarga normal).
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        procesarSesion(session)
      } else {
        // Justo después de volver de Google, el cliente de Supabase puede
        // tardar un instante en leer el access_token del hash de la URL.
        // Le damos un margen antes de rendirnos y mostrar el login normal;
        // si la sesión llega en ese lapso, la captura el listener de abajo.
        setTimeout(() => {
          if (!yaProcesado && !cancelado) setChequeandoGoogle(false)
        }, 1200)
      }
    })

    // 2) Se dispara justo cuando el cliente termina de procesar el
    //    access_token del hash tras volver de Google (evento SIGNED_IN).
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) procesarSesion(session)
    })

    return () => {
      cancelado = true
      listener?.subscription?.unsubscribe()
    }
  }, [])

  // Completar el registro de Google pidiendo carnet + contraseña.
  // Reutiliza la misma lógica que ya usás en "activar" (RPC activar_credenciales_cliente),
  // así que el carnet y la contraseña quedan guardados exactamente igual que
  // para cualquier otro cliente.
  const handleCompletarGoogle = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!carnetGoogle.trim() || !passGoogle.trim()) {
      setMensaje({ texto: 'El carnet y la contraseña son obligatorios.', tipo: 'error' })
      return
    }

    setCompletandoGoogle(true)
    setMensaje({ texto: '', tipo: '' })

    try {
      const carnetTrim = carnetGoogle.trim()
      const passTrim = passGoogle.trim()

      // ¿Ya existe un cliente con este carnet? (por ejemplo, uno que un
      // vendedor ya había dado de alta antes, sin credenciales todavía)
      const { data: existentePorCarnet } = await supabase
        .from('clientes').select('*').eq('carnet', carnetTrim).maybeSingle()

      let codigoDestino: number

      if (existentePorCarnet) {
        if (existentePorCarnet.password_hash) {
          setMensaje({ texto: 'Ese carnet ya tiene una cuenta activada. Inicia sesión con tu Carnet y Contraseña, o usa otro carnet.', tipo: 'error' })
          setCompletandoGoogle(false)
          return
        }
        codigoDestino = existentePorCarnet.codigo
        const { error: eUpd } = await supabase.from('clientes').update({
          email: googleUser!.email || existentePorCarnet.email,
          auth_id: googleUser!.auth_id,
          celular: existentePorCarnet.celular || celularGoogle.trim() || null,
        }).eq('codigo', codigoDestino)
        if (eUpd) throw eUpd
      } else if (clienteSeleccionado?.codigo) {
        // Ya había una fila vinculada por email/auth_id, solo falta el carnet
        codigoDestino = clienteSeleccionado.codigo
        const { error: eUpd } = await supabase.from('clientes').update({
          celular: celularGoogle.trim() || clienteSeleccionado.celular || null,
        }).eq('codigo', codigoDestino)
        if (eUpd) throw eUpd
      } else {
        // Cliente completamente nuevo
        const { data: maxData } = await supabase.from('clientes').select('codigo').order('codigo', { ascending: false }).limit(1)
        codigoDestino = (maxData?.[0]?.codigo || 0) + 1

        const { error: eIns } = await supabase.from('clientes').insert({
          codigo: codigoDestino,
          nombre: googleUser!.nombreSugerido,
          celular: celularGoogle.trim() || null,
          email: googleUser!.email || null,
          auth_id: googleUser!.auth_id,
          activo: true,
        })
        if (eIns) throw eIns
      }

      const { error: rpcError } = await supabase.rpc('activar_credenciales_cliente', {
        p_codigo: codigoDestino,
        p_carnet: carnetTrim,
        p_password: passTrim,
      })
      if (rpcError) throw rpcError

      localStorage.setItem('carnet', carnetTrim)
      localStorage.setItem('tipoUsuario', 'cliente')
      window.location.href = '/'
    } catch (err: any) {
      setMensaje({ texto: 'Error al completar tu registro: ' + err.message, tipo: 'error' })
      setCompletandoGoogle(false)
    }
  }

  const handleCancelarGoogle = async () => {
    await supabase.auth.signOut()
    setGoogleUser(null)
    setClienteSeleccionado(null)
    setCarnetGoogle('')
    setPassGoogle('')
    setCelularGoogle('')
    setMensaje({ texto: '', tipo: '' })
    setVista('login')
  }

  // Manejar Login Principal con Carnet
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

      if (error || !cliente || !cliente.password_hash) {
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

  // Manejar Login con Google (Gmail)
  const handleGoogleLogin = async () => {
    setMensaje({ texto: '', tipo: '' })
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/registro`, // Esta página vive en /registro, no en /login
        },
      })
      if (error) throw error
    } catch (err: any) {
      setMensaje({ texto: 'Error al iniciar sesión con Google: ' + err.message, tipo: 'error' })
    }
  }

  // Manejar Registro Manual Nuevo
  const handleRegistroManual = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nombreReg.trim() || !passwordReg.trim() || !carnetReg.trim()) {
      setMensaje({ texto: 'Nombre, Carnet y Contraseña son obligatorios.', tipo: 'error' })
      return
    }

    setCargandoRegistro(true)
    setMensaje({ texto: '', tipo: '' })

    try {
      const carnetTrim = carnetReg.trim()

      // Antes de crear una fila nueva, nos aseguramos de que este carnet no
      // pertenezca ya a otro cliente (por ejemplo, uno dado de alta por un vendedor).
      const { data: existente } = await supabase
        .from('clientes').select('*').eq('carnet', carnetTrim).maybeSingle()

      let codigoDestino: number

      if (existente) {
        if (existente.password_hash) {
          setMensaje({ texto: 'Ese carnet ya tiene una cuenta activada. Inicia sesión en vez de registrarte de nuevo.', tipo: 'error' })
          setCargandoRegistro(false)
          return
        }
        codigoDestino = existente.codigo
        const { error: eUpd } = await supabase.from('clientes').update({
          nombre: nombreReg.trim(),
          email: emailReg.trim() || existente.email || null,
          celular: celularReg.trim() || existente.celular || null,
        }).eq('codigo', codigoDestino)
        if (eUpd) throw eUpd
      } else {
        const { data: maxData } = await supabase.from('clientes').select('codigo').order('codigo', { ascending: false }).limit(1)
        codigoDestino = (maxData?.[0]?.codigo || 0) + 1

        const { error: eIns } = await supabase.from('clientes').insert({
          codigo: codigoDestino,
          nombre: nombreReg.trim(),
          email: emailReg.trim() || null,
          celular: celularReg.trim() || null,
          activo: true,
        })
        if (eIns) throw eIns
      }

      // El hash de la contraseña lo genera la misma RPC que usa el resto del
      // sistema (activar_credenciales_cliente), así el login por Carnet
      // funciona igual para todos los clientes.
      const { error: rpcError } = await supabase.rpc('activar_credenciales_cliente', {
        p_codigo: codigoDestino,
        p_carnet: carnetTrim,
        p_password: passwordReg.trim(),
      })
      if (rpcError) throw rpcError

      setMensaje({ texto: '¡Registro exitoso! Ya puedes iniciar sesión.', tipo: 'success' })
      setTimeout(() => {
        setVista('login')
      }, 2000)
    } catch (err: any) {
      setMensaje({ texto: 'Error en el registro: ' + err.message, tipo: 'error' })
    } finally {
      setCargandoRegistro(false)
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

  const handleSeleccionarCliente = (cliente: any) => {
    setClienteSeleccionado(cliente)
    setMensaje({ texto: '', tipo: '' })
    const tieneCredenciales = !!cliente.carnet && !!cliente.password_hash
    if (tieneCredenciales) {
      setVista('ingreso_existente')
    } else {
      setVista('activar')
    }
  }

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

  const handleActivarCuenta = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!codigoVendedor.trim() || !nuevoCarnet.trim() || !nuevaContrasena.trim()) {
      setMensaje({ texto: 'Todos los campos son obligatorios para activar tu cuenta.', tipo: 'error' })
      return
    }

    const codClienteReal = String(clienteSeleccionado.codigo)
    if (codigoVendedor.trim() !== codClienteReal) {
      setMensaje({ texto: 'El código de cliente no coincide con este usuario.', tipo: 'error' })
      return
    }

    setActualizando(true)
    setMensaje({ texto: '', tipo: '' })

    try {
      const { error: rpcError } = await supabase.rpc('activar_credenciales_cliente', {
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

  if (chequeandoGoogle) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#0f1117', color: '#ccc', fontFamily: 'Inter, sans-serif' }}>
        Verificando tu cuenta...
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
        <a href="/" style={{ color: '#ccc', textDecoration: 'none', fontSize: '14px' }}>Volver al Inicio</a>
      </header>

      <main style={{ maxWidth: '600px', margin: '40px auto', padding: '0 20px' }}>
        <div style={{ background: '#161726', border: '1px solid rgba(255,215,0,0.2)', borderRadius: '16px', padding: '30px', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>

          <h1 style={{ fontSize: '24px', color: '#FFD700', textAlign: 'center', marginBottom: '8px' }}>Portal de Clientes VIP</h1>
          <p style={{ textAlign: 'center', color: '#aaa', fontSize: '14px', marginBottom: '24px' }}>Accede para ver el estado de tus pedidos y pagos</p>

          <div style={{ display: 'flex', background: '#0d0d1f', borderRadius: '10px', padding: '4px', marginBottom: '24px', border: '1px solid rgba(255,255,255,0.05)', gap: '4px' }}>
            <button
              onClick={() => { setVista('login'); setMensaje({ texto: '', tipo: '' }); setClienteSeleccionado(null); }}
              style={{ flex: 1, padding: '10px 6px', background: vista === 'login' ? '#FFD700' : 'transparent', color: vista === 'login' ? '#0a0a1a' : '#ccc', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', fontSize: '12px', transition: '0.3s' }}
            >
              Iniciar Sesión
            </button>
            <button
              onClick={() => { setVista('registro_manual'); setMensaje({ texto: '', tipo: '' }); setClienteSeleccionado(null); }}
              style={{ flex: 1, padding: '10px 6px', background: vista === 'registro_manual' ? '#FFD700' : 'transparent', color: vista === 'registro_manual' ? '#0a0a1a' : '#ccc', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', fontSize: '12px', transition: '0.3s' }}
            >
              Registrarse
            </button>
            <button
              onClick={() => { setVista('buscar'); setMensaje({ texto: '', tipo: '' }); setClienteSeleccionado(null); }}
              style={{ flex: 1, padding: '10px 6px', background: (vista === 'buscar' || vista === 'activar' || vista === 'ingreso_existente') ? '#FFD700' : 'transparent', color: (vista === 'buscar' || vista === 'activar' || vista === 'ingreso_existente') ? '#0a0a1a' : '#ccc', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', fontSize: '12px', transition: '0.3s' }}
            >
              Vendedor / Activar
            </button>
          </div>

          {mensaje.texto && (
            <div style={{ padding: '12px', borderRadius: '8px', marginBottom: '20px', fontSize: '13px', backgroundColor: mensaje.tipo === 'error' ? 'rgba(255,107,107,0.1)' : 'rgba(255,215,0,0.1)', color: mensaje.tipo === 'error' ? '#ff6b6b' : '#FFD700', border: `1px solid ${mensaje.tipo === 'error' ? '#ff6b6b' : '#FFD700'}30` }}>
              {mensaje.texto}
            </div>
          )}

          {/* VISTA 1: LOGIN PRINCIPAL */}
          {vista === 'login' && (
            <div>
              <button 
                type="button" 
                onClick={handleGoogleLogin} 
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', background: 'white', color: '#333', border: 'none', padding: '12px', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer', fontSize: '14px', marginBottom: '20px', boxShadow: '0 4px 10px rgba(0,0,0,0.2)' }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"/>
                  <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.19v3.15C3.17 21.32 7.25 24 12 24z"/>
                  <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.19C.43 8.1 0 9.8 0 12s.43 3.9 1.19 5.42l4.09-3.15z"/>
                  <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.25 0 3.17 2.68 1.19 6.58l4.09 3.15c.95-2.83 3.6-4.98 6.72-4.98z"/>
                </svg>
                Continuar con Google (Gmail)
              </button>

              <div style={{ display: 'flex', alignItems: 'center', textAlign: 'center', margin: '20px 0', color: '#666', fontSize: '12px' }}>
                <div style={{ flex: 1, borderBottom: '1px solid rgba(255,255,255,0.1)' }}></div>
                <span style={{ padding: '0 10px' }}>O con tu Carnet</span>
                <div style={{ flex: 1, borderBottom: '1px solid rgba(255,255,255,0.1)' }}></div>
              </div>

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
                  {cargandoLogin ? 'Verificando...' : 'Iniciar Sesión con Carnet'}
                </button>
              </form>
            </div>
          )}

          {/* VISTA 2: REGISTRO MANUAL */}
          {vista === 'registro_manual' && (
            <form onSubmit={handleRegistroManual} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <p style={{ fontSize: '13px', color: '#aaa', margin: 0 }}>
                Crea una cuenta nueva ingresando tus datos personales:
              </p>
              <div>
                <label style={{ fontSize: '12px', color: '#ccc', display: 'block', marginBottom: '5px' }}>Nombre Completo *</label>
                <input type="text" value={nombreReg} onChange={(e) => setNombreReg(e.target.value)} style={inputStyle} placeholder="Ej: María Gómez" />
              </div>
              <div>
                <label style={{ fontSize: '12px', color: '#ccc', display: 'block', marginBottom: '5px' }}>Correo Electrónico (opcional)</label>
                <input type="email" value={emailReg} onChange={(e) => setEmailReg(e.target.value)} style={inputStyle} placeholder="tucorreo@gmail.com" />
              </div>
              <div>
                <label style={{ fontSize: '12px', color: '#ccc', display: 'block', marginBottom: '5px' }}>Contraseña *</label>
                <input type="password" value={passwordReg} onChange={(e) => setPasswordReg(e.target.value)} style={inputStyle} placeholder="Mínimo 6 caracteres" />
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '12px', color: '#ccc', display: 'block', marginBottom: '5px' }}>Celular</label>
                  <input type="text" value={celularReg} onChange={(e) => setCelularReg(e.target.value)} style={inputStyle} placeholder="70012345" />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '12px', color: '#ccc', display: 'block', marginBottom: '5px' }}>Carnet (CI) *</label>
                  <input type="text" value={carnetReg} onChange={(e) => setCarnetReg(e.target.value)} style={inputStyle} placeholder="Tu carnet de identidad" />
                </div>
              </div>
              <button type="submit" disabled={cargandoRegistro} style={{ background: 'linear-gradient(135deg, #FFD700, #FFA500)', color: '#0a0a1a', border: 'none', padding: '14px', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer', fontSize: '15px', marginTop: '10px' }}>
                {cargandoRegistro ? 'Registrando...' : 'Registrarme'}
              </button>
            </form>
          )}

          {/* VISTA 3: BUSCAR USUARIO */}
          {vista === 'buscar' && (
            <div>
              <p style={{ fontSize: '13px', color: '#aaa', marginBottom: '15px' }}>
                Si tu vendedor ya te dio de alta, escribe tu <strong>Nombre</strong> o <strong>Celular</strong>:
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

          {/* VISTA 4: INGRESO EXISTENTE */}
          {vista === 'ingreso_existente' && clienteSeleccionado && (
            <form onSubmit={handleIngresarExistente} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div style={{ background: 'rgba(255,215,0,0.05)', padding: '15px', borderRadius: '10px', border: '1px solid rgba(255,215,0,0.2)' }}>
                <p style={{ margin: '0 0 4px 0', fontSize: '12px', color: '#aaa' }}>Usuario encontrado:</p>
                <strong style={{ fontSize: '16px', color: '#FFD700', display: 'block' }}>{nombreCliente}</strong>
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

          {/* VISTA 5: ACTIVAR CLIENTE */}
          {vista === 'activar' && clienteSeleccionado && (
            <form onSubmit={handleActivarCuenta} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div style={{ background: 'rgba(255,215,0,0.05)', padding: '15px', borderRadius: '10px', border: '1px solid rgba(255,215,0,0.2)' }}>
                <p style={{ margin: '0 0 4px 0', fontSize: '12px', color: '#aaa' }}>Usuario a activar:</p>
                <strong style={{ fontSize: '16px', color: '#FFD700' }}>{nombreCliente}</strong>
              </div>
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

          {/* VISTA 6: COMPLETAR REGISTRO CON GOOGLE (pide carnet + contraseña) */}
          {vista === 'google_completar' && googleUser && (
            <form onSubmit={handleCompletarGoogle} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div style={{ background: 'rgba(255,215,0,0.05)', padding: '15px', borderRadius: '10px', border: '1px solid rgba(255,215,0,0.2)' }}>
                <p style={{ margin: '0 0 4px 0', fontSize: '12px', color: '#aaa' }}>Conectado con Google:</p>
                <strong style={{ fontSize: '16px', color: '#FFD700', display: 'block' }}>{googleUser.nombreSugerido}</strong>
                {googleUser.email && <span style={{ fontSize: '12px', color: '#aaa' }}>{googleUser.email}</span>}
              </div>
              <p style={{ fontSize: '13px', color: '#aaa', margin: 0 }}>
                Para terminar, ingresa tu <strong>Carnet (CI)</strong> y crea una <strong>contraseña</strong>. También podrás usarlos para entrar sin Google.
              </p>
              <div>
                <label style={{ fontSize: '12px', color: '#ccc', display: 'block', marginBottom: '5px' }}>Celular</label>
                <input type="text" value={celularGoogle} onChange={(e) => setCelularGoogle(e.target.value)} style={inputStyle} placeholder="70012345" />
              </div>
              <div>
                <label style={{ fontSize: '12px', color: '#ccc', display: 'block', marginBottom: '5px' }}>Número de Carnet (CI) *</label>
                <input type="text" value={carnetGoogle} onChange={(e) => setCarnetGoogle(e.target.value)} style={inputStyle} placeholder="Tu carnet de identidad" />
              </div>
              <div>
                <label style={{ fontSize: '12px', color: '#ccc', display: 'block', marginBottom: '5px' }}>Crea tu Contraseña *</label>
                <input type="password" value={passGoogle} onChange={(e) => setPassGoogle(e.target.value)} style={inputStyle} placeholder="Mínimo 6 caracteres" />
              </div>
              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button type="button" onClick={handleCancelarGoogle} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: '#ccc', padding: '14px', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer', fontSize: '14px', flex: 1 }}>
                  Cancelar
                </button>
                <button type="submit" disabled={completandoGoogle} style={{ background: 'linear-gradient(135deg, #FFD700, #FFA500)', color: '#0a0a1a', border: 'none', padding: '14px', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer', fontSize: '15px', flex: 2 }}>
                  {completandoGoogle ? 'Guardando...' : 'Completar registro'}
                </button>
              </div>
            </form>
          )}

        </div>
      </main>
    </div>
  )
}