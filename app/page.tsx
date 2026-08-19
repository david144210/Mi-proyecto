'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

type ProductoDestacado = {
  nombre: string
  descripcion: string
  precio: string
  imagen: string
  badge?: string
}

type PortadaConfig = {
  imagen_url: string
  link_destino: string
  activa: boolean
}

type Resena = {
  id: string
  nombre: string
  texto: string
  estrellas: number
  lugar: string | null
  carnet: string | null
  creado_en: string
}

export default function Home() {
  const [carnet, setCarnet] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [usuario, setUsuario] = useState<any>(null)
  const [tipoUsuario, setTipoUsuario] = useState<'personal' | 'cliente' | null>(null)
  const [showLogin, setShowLogin] = useState(false)
  const [menuAbierto, setMenuAbierto] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [configPortada, setConfigPortada] = useState<PortadaConfig | null>(null)
  const [direccionPersonalizada, setDireccionPersonalizada] = useState('')

  // --- Reseñas de clientes ---
  const [resenas, setResenas] = useState<Resena[]>([])
  const [textoResena, setTextoResena] = useState('')
  const [estrellasResena, setEstrellasResena] = useState(5)
  const [enviandoResena, setEnviandoResena] = useState(false)
  const [errorResena, setErrorResena] = useState('')
  const [eliminandoResenaId, setEliminandoResenaId] = useState<string | null>(null)

  const loginRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const carnetGuardado = localStorage.getItem('carnet')
    const tipoGuardado = localStorage.getItem('tipoUsuario')
    
    if (carnetGuardado && !usuario) {
      if (tipoGuardado === 'cliente') {
        supabase.from('clientes').select('*').eq('carnet', carnetGuardado).eq('activo', true).single()
          .then(({ data }) => { 
            if (data) { 
              setUsuario(data)
              setTipoUsuario('cliente') 
            } 
          })
      } else {
        supabase.from('personal').select('*, cargos(*)').eq('carnet', carnetGuardado).eq('estado', true).single()
          .then(({ data }) => { 
            if (data) { 
              setUsuario(data)
              setTipoUsuario('personal') 
            } 
          })
      }
    }

    const fetchPortada = async () => {
      const { data } = await supabase.from('portada_config').select('*').eq('activa', true).single()
      if (data) setConfigPortada(data)
    }
    fetchPortada()

    const handleClickOutside = (event: MouseEvent) => {
      if (loginRef.current && !loginRef.current.contains(event.target as Node)) {
        setShowLogin(false)
      }
    }
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowLogin(false)
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEsc)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEsc)
    }
  }, [usuario])

  useEffect(() => {
    cargarResenas()
  }, [])

  const cargarResenas = async () => {
    const { data } = await supabase
      .from('resenas')
      .select('*')
      .order('creado_en', { ascending: false })
      .limit(6)
    if (data) setResenas(data as Resena[])
  }

  const handlePublicarResena = async () => {
    if (!usuario) { setErrorResena('Debes iniciar sesión para dejar una reseña'); return }
    if (!textoResena.trim()) { setErrorResena('Escribe tu comentario antes de publicar'); return }

    setEnviandoResena(true)
    setErrorResena('')

    const nombreMostrado = tipoUsuario === 'personal' ? usuario.usuario : (usuario.nombre || 'Cliente')

    const { error: errorInsert } = await supabase.from('resenas').insert({
      nombre: nombreMostrado,
      texto: textoResena.trim(),
      estrellas: estrellasResena,
      lugar: null,
      carnet: usuario.carnet ?? carnet,
    })

    if (errorInsert) {
      setErrorResena('No se pudo publicar tu reseña, intenta de nuevo')
    } else {
      setTextoResena('')
      setEstrellasResena(5)
      await cargarResenas()
    }
    setEnviandoResena(false)
  }

  const puedeModerarResenas =
    tipoUsuario === 'personal' && (usuario?.es_admin || !!usuario?.cargos?.puede_ver_mk)

  const handleEliminarResena = async (id: string) => {
    if (!puedeModerarResenas) return
    setEliminandoResenaId(id)
    const { error: errorDelete } = await supabase.from('resenas').delete().eq('id', id)
    if (!errorDelete) {
      setResenas(prev => prev.filter(r => r.id !== id))
    }
    setEliminandoResenaId(null)
  }

  const handleLogin = async () => {
    if (!carnet || !password) { setError('Ingrese su CI y contraseña'); return }
    setCargando(true)
    setError('')
    
    const { data: persona } = await supabase.from('personal').select('*, cargos(*)').eq('carnet', carnet).eq('estado', true).single()
    
    if (persona) {
      const { data: valido } = await supabase.rpc('verificar_password', { password_input: password, hash_guardado: persona.password_hash })
      if (valido) {
        localStorage.setItem('carnet', carnet)
        localStorage.setItem('tipoUsuario', 'personal')
        setUsuario(persona)
        setTipoUsuario('personal')
        finalizarLogin()
        return
      }
    }

    const { data: cliente } = await supabase.from('clientes').select('*').eq('carnet', carnet).eq('activo', true).single()
    
    if (cliente) {
      const { data: validoCliente } = await supabase.rpc('verificar_password', { password_input: password, hash_guardado: cliente.password_hash })
      if (validoCliente) {
        localStorage.setItem('carnet', carnet)
        localStorage.setItem('tipoUsuario', 'cliente')
        setUsuario(cliente)
        setTipoUsuario('cliente')
        finalizarLogin()
        return
      }
    }

    setError('Credenciales incorrectas o usuario inactivo')
    setCargando(false)
  }

  const finalizarLogin = () => {
    setShowLogin(false)
    setMenuAbierto(false)
    setCarnet('')
    setPassword('')
    setError('')
    setCargando(false)
  }

  const handleCerrarSesion = () => {
    localStorage.removeItem('carnet')
    localStorage.removeItem('tipoUsuario')
    setUsuario(null)
    setTipoUsuario(null)
    setCarnet('')
    setPassword('')
    setShowLogin(false)
    setMenuAbierto(false)
  }

  const sucursales = [
    { nombre: 'Sucursal El Alto', dir: 'C. L. de la Vega 3623, El Alto', tel: '+591 65572015', link: 'https://maps.app.goo.gl/S6gJuAURM7S2WEzu5', wa: 'https://wa.me/59165572015' },
    { nombre: 'Sucursal La Paz', dir: 'Zona Bella Vista, C. Ignacio Sanjines, La Paz', tel: '+591 60633283', link: 'https://maps.app.goo.gl/tA2KuW5a2U66USm7', wa: 'https://wa.me/59160633283' },
    { nombre: 'Sucursal Santa Cruz (Radial 21)', dir: 'Av. Napoleon Gomez Landivar, Radial 21, Santa Cruz', tel: '+591 60044821', link: 'https://maps.app.goo.gl/f9xnUphWpvmgmLxv5', wa: 'https://wa.me/59160044821' },
    { nombre: 'Sucursal Santa Cruz (Radial 26)', dir: 'Calle Los Pachio entre 4to y 5to anillo, Radial 26, Santa Cruz', tel: '+591 60044821', link: 'https://maps.app.goo.gl/cVAo6MxgoMr5xsTK7', wa: 'https://wa.me/59160044821' },
    { nombre: 'Sucursal Cochabamba', dir: 'Av. Segunda Circunvalacion, Cochabamba', tel: '+591 61211195', link: 'https://maps.app.goo.gl/WoCYUfsSXSPRB7Vc9', wa: 'https://wa.me/59161211195' },
  ]

  const productosDestacados = [
    { nombre: 'Ropero Skan', descripcion: 'Diseño cómodo y elegante para sala moderna.', precio: 'Bs. 1250', imagen: '/productos/ropero-skan.jpg', badge: 'Más vendido' },
    { nombre: 'Esquinero para living', descripcion: 'Mueble de acero con acabado elegante para tu sala de estar.', precio: 'Bs. 530', imagen: '/productos/esquinero.jpg' },
    { nombre: 'Recibidor para sala', descripcion: 'Mueble ideal para tu sala', precio: 'Bs. 990', imagen: '/productos/recibidor.jpg' },
  ] satisfies ProductoDestacado[]

  const whatsappPrincipal = sucursales[1].wa

  return (
    <div className="app-shell">
      <style>{`
        /* PALETA DE COLORES Y VARIABLES */
        :root {
          --bg-primary: #081021;     /* Azul oscuro profundo */
          --bg-secondary: #0D1831;   /* Azul oscuro tarjetas */
          --bg-glass: rgba(13, 24, 49, 0.7);
          --gold-primary: #D4AF37;   /* Dorado elegante */
          --gold-bright: #FFDF00;    /* Dorado brillante para CTAs */
          --text-main: #FFFFFF;      /* Blanco limpio */
          --text-muted: #A0ABC0;     /* Gris azulado para textos secundarios */
        }

        @keyframes float { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-12px); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        
        .mascota-float { animation: float 4s ease-in-out infinite; drop-shadow(0 20px 30px rgba(0,0,0,0.5)); }
        
        .app-shell { 
          min-height: 100vh; 
          font-family: "Inter", system-ui, sans-serif; 
          background: var(--bg-primary); 
          color: var(--text-main); 
          scroll-behavior: smooth;
        }
        
        /* NAVBAR PREMIUM */
        .top-nav {
          display: flex; justify-content: space-between; align-items: center;
          padding: 15px 5%; background: rgba(8, 16, 33, 0.85);
          backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
          position: fixed; top: 0; width: 100%;
          z-index: 1000; border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          box-sizing: border-box; transition: all 0.3s ease;
        }

        .nav-links-container { display: flex; gap: 30px; align-items: center; }
        .nav-link { 
          color: var(--text-main); text-decoration: none; 
          font-size: 14px; font-weight: 500; transition: color 0.3s ease; 
        }
        .nav-link:hover { color: var(--gold-bright); }

        .hamburger { display: none; background: none; border: none; color: var(--gold-primary); font-size: 28px; cursor: pointer; }

        @media (max-width: 900px) {
          .nav-links-container {
            display: ${menuAbierto ? 'flex' : 'none'};
            flex-direction: column; position: absolute; top: 100%; left: 0; width: 100%;
            background: var(--bg-secondary); padding: 25px; 
            border-bottom: 2px solid var(--gold-primary);
            box-shadow: 0 20px 40px rgba(0,0,0,0.6); z-index: 1001;
          }
          .hamburger { display: block; }
          .nav-login-desktop { display: flex; align-items: center; }
          .login-modal-responsive { right: 5% !important; top: 70px !important; width: 90% !important; max-width: 320px; }
        }

        /* HERO SECTION */
        .hero-section {
          display: flex; align-items: center; justify-content: space-between;
          padding: 160px 5% 80px; max-width: 1400px; margin: 0 auto;
          min-height: 85vh; gap: 40px; box-sizing: border-box;
          animation: fadeIn 0.8s ease-out;
        }

        .hero-title {
          font-size: clamp(3.2rem, 7vw, 5.5rem); font-weight: 800; line-height: 1.05; margin: 0;
          background: linear-gradient(135deg, var(--text-main), var(--gold-primary));
          -webkit-background-clip: text; -webkit-text-fill-color: transparent;
          letter-spacing: -1px;
        }

        /* BOTONES */
        .btn-gold {
          background: linear-gradient(135deg, var(--gold-bright), var(--gold-primary)); 
          color: var(--bg-primary); border: none; padding: 14px 32px; 
          border-radius: 50px; font-weight: 700; cursor: pointer; 
          text-decoration: none; display: inline-flex; align-items: center; justify-content: center;
          transition: transform 0.3s ease, box-shadow 0.3s ease;
          box-shadow: 0 10px 20px rgba(212, 175, 55, 0.2);
        }
        .btn-gold:hover { transform: translateY(-3px); box-shadow: 0 15px 25px rgba(212, 175, 55, 0.4); }

        .btn-outline {
          border: 1px solid var(--gold-primary); color: var(--gold-primary); 
          padding: 13px 32px; border-radius: 50px; text-decoration: none; font-weight: 600;
          transition: all 0.3s ease; background: rgba(212, 175, 55, 0.05);
        }
        .btn-outline:hover { background: rgba(212, 175, 55, 0.15); }

        /* ESTADÍSTICAS */
        .stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-top: 50px; }
        .stats-card { 
          background: rgba(255,255,255,0.02); padding: 20px; border-radius: 20px; 
          text-align: center; border: 1px solid rgba(255,255,255,0.05);
          backdrop-filter: blur(10px); transition: transform 0.3s ease;
        }
        .stats-card:hover { transform: translateY(-5px); background: rgba(255,255,255,0.04); }

        /* SECCIONES Y GRID MINIMALISTA */
        .section-padding { padding: 100px 5%; max-width: 1400px; margin: 0 auto; }
        .divider { height: 1px; background: linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent); margin: 0 5%; }

        .producto-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 30px; margin-top: 50px; }
        .producto-card { 
          background: var(--bg-secondary); border-radius: 24px; overflow: hidden; 
          border: 1px solid rgba(255,255,255,0.03);
          transition: transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275), box-shadow 0.4s ease; 
          position: relative;
        }
        .producto-card:hover { 
          transform: translateY(-10px); 
          box-shadow: 0 25px 50px rgba(0,0,0,0.5); 
          border-color: rgba(212, 175, 55, 0.2);
        }
        .producto-card img { width: 100%; height: 240px; object-fit: cover; transition: transform 0.5s ease; }
        .producto-card:hover img { transform: scale(1.05); }

        .producto-badge {
          position: absolute; top: 16px; left: 16px; 
          background: var(--gold-primary); color: var(--bg-primary); 
          font-size: 11px; font-weight: 800; padding: 6px 14px; border-radius: 30px;
          letter-spacing: 0.5px; text-transform: uppercase; box-shadow: 0 4px 10px rgba(0,0,0,0.3);
          z-index: 2;
        }
        
        .producto-cta-row { display: flex; gap: 12px; margin-top: 20px; }
        .producto-cta-row a { 
          flex: 1; text-align: center; padding: 12px 10px; border-radius: 12px; 
          font-size: 13px; font-weight: 600; text-decoration: none; transition: all 0.2s ease;
        }
        .cta-primaria { background: var(--bg-primary); color: var(--gold-primary); border: 1px solid var(--gold-primary); }
        .cta-primaria:hover { background: var(--gold-primary); color: var(--bg-primary); }
        .cta-secundaria { color: var(--text-muted); background: rgba(255,255,255,0.03); }
        .cta-secundaria:hover { color: var(--text-main); background: rgba(255,255,255,0.08); }

        /* BARRA DE CONFIANZA Y GARANTÍAS */
        .trust-bar {
          display: flex; flex-wrap: wrap; justify-content: center; gap: 15px 40px;
          padding: 16px 5%; background: var(--bg-secondary);
          border-bottom: 1px solid rgba(255, 255, 255, 0.02);
          font-size: 13px; color: var(--text-muted);
        }
        .trust-bar span { display: flex; align-items: center; gap: 8px; font-weight: 500; }

        .garantia-strip {
          display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 30px;
          margin-top: 70px; padding-top: 50px; border-top: 1px solid rgba(255,255,255,0.05);
        }
        .garantia-item { text-align: center; padding: 20px; background: rgba(255,255,255,0.01); border-radius: 20px; transition: transform 0.3s ease; }
        .garantia-item:hover { transform: translateY(-5px); background: rgba(255,255,255,0.03); }
        .garantia-item .icono { font-size: 32px; margin-bottom: 15px; display: inline-block; }
        .garantia-item h4 { margin: 0 0 10px 0; font-size: 15px; color: var(--text-main); font-weight: 600; }
        .garantia-item p { margin: 0; font-size: 13px; color: var(--text-muted); line-height: 1.5; }

        /* TESTIMONIOS (Social Proof) */
        .testimonios-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 24px; margin-top: 50px; }
        .testimonio-card { 
          background: linear-gradient(145deg, var(--bg-secondary), var(--bg-primary));
          border: 1px solid rgba(255,255,255,0.04); border-radius: 24px; padding: 30px;
          position: relative; box-shadow: 0 10px 30px rgba(0,0,0,0.2);
        }
        .testimonio-stars { color: var(--gold-bright); font-size: 16px; letter-spacing: 3px; margin-bottom: 15px; }
        .testimonio-texto { color: var(--text-muted); font-size: 14px; line-height: 1.7; margin: 0 0 20px 0; font-style: italic; }
        .testimonio-autor { color: var(--text-main); font-size: 14px; font-weight: 700; }
        .testimonio-lugar { color: var(--gold-primary); font-size: 12px; margin-top: 4px; }

        /* FORMULARIOS E INPUTS */
        .resena-form {
          max-width: 600px; margin: 30px auto 50px; background: var(--bg-secondary);
          border: 1px solid rgba(255,255,255,0.05); border-radius: 24px; padding: 30px;
          box-shadow: 0 20px 40px rgba(0,0,0,0.3);
        }
        .resena-textarea {
          width: 100%; box-sizing: border-box; padding: 16px; border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.2); 
          color: white; font-family: inherit; font-size: 14px; resize: vertical; transition: border 0.3s ease;
        }
        .resena-textarea:focus { outline: none; border-color: var(--gold-primary); }

        .input-elegante {
          padding: 12px 16px; width: 100%; border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.3);
          color: white; margin-bottom: 12px; box-sizing: border-box; font-size: 14px;
          transition: border 0.3s ease;
        }
        .input-elegante:focus { outline: none; border-color: var(--gold-primary); }

        /* BOTÓN FLOTANTE WHATSAPP */
        .whatsapp-float {
          position: fixed; bottom: 30px; right: 30px; z-index: 1200;
          background: #25D366; color: white; width: 60px; height: 60px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center; font-size: 30px;
          text-decoration: none; box-shadow: 0 10px 30px rgba(37, 211, 102, 0.4);
          transition: transform 0.3s ease;
        }
        .whatsapp-float:hover { transform: scale(1.1) rotate(-5deg); }

        @media (max-width: 768px) {
          .hero-section { flex-direction: column; text-align: center; padding-top: 120px; }
          .hero-microtrust { justify-content: center; }
          .stats-grid { gap: 10px; }
          .producto-grid { grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); }
        }
      `}</style>

      {/* NAVBAR */}
      <nav className="top-nav">
        <div className="brand" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <img src="/logo.jpg" alt="Logo" style={{ width: '40px', height: '40px', borderRadius: '10px' }} />
          <span style={{ fontWeight: '800', color: 'var(--text-main)', fontSize: '18px', letterSpacing: '-0.5px' }}>
            MuebLess <span style={{ color: 'var(--gold-primary)', fontWeight: '400' }}>is Better</span>
          </span>
        </div>

        <div className="nav-links-container">
          <a href="#productos" className="nav-link" onClick={() => setMenuAbierto(false)}>Colección</a>
          {configPortada && <a href="#promociones" className="nav-link" onClick={() => setMenuAbierto(false)}>Promociones</a>}
          <a href="#ubicacion" className="nav-link" onClick={() => setMenuAbierto(false)}>Sucursales</a>
          <a href="/cotizador" className="nav-link">Cotizador</a>
          <a href="/productos" className="nav-link">Catálogo</a>
          
          {tipoUsuario !== 'cliente' && <a href="/sistema" className="nav-link">Sistema</a>}
          {tipoUsuario === 'cliente' && <a href="/mi-cuenta" className="nav-link" style={{ color: 'var(--gold-primary)' }}>Mis Pedidos</a>}
        </div>

        <div className="nav-login-desktop">
          {usuario ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
              <div style={{ textAlign: 'right' }}>
                <span style={{ display: 'block', fontSize: '11px', color: 'var(--gold-primary)', marginBottom: '-2px', textTransform: 'uppercase', letterSpacing: '1px' }}>
                  {tipoUsuario === 'personal' ? (usuario.cargos?.nombre || 'Personal') : `Cliente: ${usuario.codigo || ''}`}
                </span>
                <span style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-main)' }}>
                  {tipoUsuario === 'personal' ? usuario.usuario : (usuario.nombre || 'Usuario')}
                </span>
              </div>
              <button onClick={handleCerrarSesion} style={{ background: 'rgba(255, 107, 107, 0.1)', border: '1px solid #ff6b6b', color: '#ff6b6b', padding: '8px 16px', borderRadius: '50px', cursor: 'pointer', fontSize: '12px', fontWeight: '600', transition: 'all 0.3s ease' }}>Salir</button>
            </div>
          ) : (
            <button onClick={() => { setShowLogin(!showLogin); setMenuAbierto(false); }} className="btn-gold" style={{ padding: '10px 24px', fontSize: '14px' }}>Acceder</button>
          )}

          {showLogin && (
            <div ref={loginRef} className="login-modal-responsive" style={{ position: 'absolute', right: '5%', top: '75px', background: 'var(--bg-secondary)', padding: '30px', borderRadius: '24px', width: '300px', border: '1px solid rgba(255,255,255,0.05)', boxShadow: '0 20px 50px rgba(0,0,0,0.8)' }}>
              <h4 style={{ margin: '0 0 20px 0', textAlign: 'center', color: 'var(--text-main)', fontSize: '16px' }}>Bienvenido de nuevo</h4>
              <input type="text" placeholder="Carnet / CI" value={carnet} onChange={e => setCarnet(e.target.value)} className="input-elegante" />
              <input type="password" placeholder="Contraseña" value={password} onChange={e => setPassword(e.target.value)} className="input-elegante" />
              {error && <p style={{color: '#ff6b6b', fontSize: '13px', margin: '0 0 12px 0', textAlign: 'center'}}>{error}</p>}
              
              <button onClick={handleLogin} disabled={cargando} className="btn-gold" style={{ width: '100%', marginTop: '10px', padding: '12px' }}>
                {cargando ? 'Verificando...' : 'Iniciar Sesión'}
              </button>

              <div style={{ textAlign: 'center', marginTop: '20px', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '15px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>¿Nuevo cliente? </span>
                <a href="/registro" style={{ color: 'var(--gold-primary)', fontSize: '13px', textDecoration: 'none', fontWeight: '600' }}>Regístrate aquí</a>
              </div>
            </div>
          )}
        </div>

        <button className="hamburger" onClick={() => { setMenuAbierto(!menuAbierto); setShowLogin(false); }}>
          {menuAbierto ? '✕' : '☰'}
        </button>
      </nav>

      {/* BARRA DE CONFIANZA */}
      <div className="trust-bar" style={{ marginTop: '70px' }}>
        <span>💎 Calidad Premium Minimalista</span>
        <span>🚚 Envío a 5 sucursales en Bolivia</span>
        <span>🛡️ Respaldo directo de fábrica</span>
        <span>💳 Facilidades de pago seguras</span>
      </div>

      {/* HERO SECTION */}
      <div className="hero-section">
        <div className="hero-text">
          <span style={{ color: 'var(--gold-primary)', fontSize: '12px', letterSpacing: '3px', textTransform: 'uppercase', fontWeight: '700', display: 'block', marginBottom: '15px' }}>
            Más que muebles, ingeniería de interiores
          </span>
          <h1 className="hero-title">
            MuebLess<br/>is Better.
          </h1>
          <p style={{ color: 'var(--text-muted)', lineHeight: '1.8', fontSize: '1.15rem', maxWidth: '500px', margin: '20px 0 30px 0' }}>
            Diseñamos y fabricamos el mueble exacto que tu espacio necesita. Acabados impecables, líneas limpias y entrega garantizada.
          </p>
          <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
            <button className="btn-gold" onClick={() => document.getElementById('productos')?.scrollIntoView?.({ behavior: 'smooth' })}>Descubrir Colección</button>
            <a href="/cotizador" className="btn-outline">Cotizar a Medida</a>
          </div>
          <div className="hero-microtrust" style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', marginTop: '25px' }}>
            <span style={{ fontSize: '13px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>✔️ Sin compromiso</span>
            <span style={{ fontSize: '13px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>✔️ Respuesta inmediata</span>
          </div>
          
          <div className="stats-grid">
            {[{ n: '5', t: 'Sucursales' }, { n: '10+', t: 'Años Experiencia' }, { n: '100%', t: 'Satisfacción' }].map((s, i) => (
              <div key={i} className="stats-card">
                <div style={{ color: 'var(--gold-primary)', fontWeight: '800', fontSize: '24px' }}>{s.n}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>{s.t}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ textAlign: 'center', flex: '1', display: 'flex', justifyContent: 'center' }}>
          <img src="/mascota.png" alt="Mascota MuebLess is Better" className="mascota-img mascota-float" style={{ width: '100%', maxWidth: '450px', objectFit: 'contain' }} />
        </div>
      </div>

      {/* PROMOCIONES */}
      {configPortada && configPortada.activa && (
        <section id="promociones" style={{ padding: '60px 5%', textAlign: 'center', background: 'rgba(212, 175, 55, 0.02)', borderTop: '1px solid rgba(255, 255, 255, 0.02)' }}>
          <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
            <h2 style={{ fontSize: '2rem', color: 'var(--text-main)', marginBottom: '40px', fontWeight: '800' }}>Oportunidades <span style={{ color: 'var(--gold-primary)' }}>Exclusivas</span></h2>
            <a href={configPortada.link_destino} style={{ display: 'inline-block', borderRadius: '24px', overflow: 'hidden', boxShadow: '0 20px 50px rgba(0,0,0,0.5)', transition: 'transform 0.3s ease' }} className="promo-banner-hover">
              <img src={configPortada.imagen_url} alt="Banner Promocional" style={{ width: '100%', maxWidth: '1000px', display: 'block' }} />
            </a>
          </div>
        </section>
      )}

      <div className="divider"></div>

      {/* PRODUCTOS DESTACADOS */}
      <div id="productos" className="section-padding">
        <div style={{ textAlign: 'center', marginBottom: '60px' }}>
          <span style={{ color: 'var(--gold-primary)', fontSize: '12px', letterSpacing: '2px', textTransform: 'uppercase', fontWeight: '700' }}>Catálogo</span>
          <h2 style={{ fontSize: '2.5rem', color: 'var(--text-main)', marginTop: '10px' }}>Selección <span style={{ color: 'var(--gold-primary)' }}>Destacada</span></h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '15px', maxWidth: '600px', margin: '15px auto 0' }}>Piezas diseñadas para elevar la estética de tu hogar con la máxima funcionalidad.</p>
        </div>
        
        <div className="producto-grid">
          {productosDestacados.map((p, i) => (
            <div key={i} className="producto-card">
              <div style={{ position: 'relative', overflow: 'hidden' }}>
                {p.badge && <span className="producto-badge">{p.badge}</span>}
                <img src={p.imagen} alt={p.nombre} />
              </div>
              <div style={{ padding: '24px' }}>
                <h3 style={{ margin: '0 0 8px 0', fontSize: '1.2rem', fontWeight: '700' }}>{p.nombre}</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '14px', lineHeight: '1.6', marginBottom: '15px' }}>{p.descripcion}</p>
                <div style={{ color: 'var(--gold-bright)', fontSize: '1.4rem', fontWeight: '800' }}>{p.precio}</div>
                
                <div className="producto-cta-row">
                  <a
                    className="cta-primaria"
                    href={`${whatsappPrincipal}?text=${encodeURIComponent(`Hola, me interesa el diseño ${p.nombre} (${p.precio}). ¿Me podrían brindar más información?`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Cotizar ahora
                  </a>
                  <a className="cta-secundaria" href="/productos">Ver detalles</a>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* REDUCCIÓN DE FRICCIÓN (Garantías) */}
        <div className="garantia-strip">
          <div className="garantia-item">
            <span className="icono">🚚</span>
            <h4>Logística Coordinada</h4>
            <p>Retiro en sucursal o coordinación de envío directo a tu puerta vía WhatsApp.</p>
          </div>
          <div className="garantia-item">
            <span className="icono">🛡️</span>
            <h4>Calidad Garantizada</h4>
            <p>Respaldo total del fabricante. Cada pieza pasa por estrictos controles.</p>
          </div>
          <div className="garantia-item">
            <span className="icono">💳</span>
            <h4>Inversión Inteligente</h4>
            <p>Consulta nuestras excelentes opciones de pago fraccionado en sucursal.</p>
          </div>
          <div className="garantia-item">
            <span className="icono">📐</span>
            <h4>Asesoría Espacial</h4>
            <p>Expertos listos para ayudarte a elegir las dimensiones perfectas.</p>
          </div>
        </div>
      </div>

      <div className="divider"></div>

      {/* RESEÑAS Y SOCIAL PROOF */}
      <div className="section-padding">
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <span style={{ color: 'var(--gold-primary)', fontSize: '12px', letterSpacing: '2px', textTransform: 'uppercase', fontWeight: '700' }}>Testimonios</span>
          <h2 style={{ fontSize: '2.5rem', color: 'var(--text-main)', marginTop: '10px' }}>Experiencias reales</h2>
          {!usuario && (
            <p style={{ color: 'var(--text-muted)', fontSize: '15px', marginTop: '15px' }}>
              Nos encanta escuchar a nuestra comunidad. Inicia sesión para compartir tu experiencia.
            </p>
          )}
        </div>

        {usuario && (
          <div className="resena-form">
            <h4 style={{ margin: '0 0 15px 0', color: 'var(--gold-primary)' }}>Califica tu mueble</h4>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
              {[1, 2, 3, 4, 5].map(n => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setEstrellasResena(n)}
                  style={{ background: 'none', border: 'none', fontSize: '28px', cursor: 'pointer', padding: '0', transition: 'transform 0.2s', color: n <= estrellasResena ? 'var(--gold-bright)' : 'rgba(255,255,255,0.1)' }}
                  aria-label={`${n} estrellas`}
                >
                  ★
                </button>
              ))}
            </div>
            <textarea
              value={textoResena}
              onChange={e => setTextoResena(e.target.value)}
              placeholder="¿Qué te pareció la calidad y el diseño?..."
              className="resena-textarea"
              rows={4}
            />
            {errorResena && <p style={{ color: '#ff6b6b', fontSize: '13px', margin: '10px 0 0 0' }}>{errorResena}</p>}
            <button onClick={handlePublicarResena} disabled={enviandoResena} className="btn-gold" style={{ marginTop: '20px', width: '100%' }}>
              {enviandoResena ? 'Publicando...' : 'Compartir reseña'}
            </button>
          </div>
        )}

        <div className="testimonios-grid">
          {resenas.length === 0 && (
            <p style={{ color: 'var(--text-muted)', gridColumn: '1 / -1', textAlign: 'center', padding: '40px' }}>
              Aún no hay reseñas publicadas. ¡Sé el primero en inspirar a otros!
            </p>
          )}
          {resenas.map((r) => (
            <div key={r.id} className="testimonio-card">
              <div className="testimonio-stars">{'★'.repeat(r.estrellas)}{'☆'.repeat(5 - r.estrellas)}</div>
              <p className="testimonio-texto">"{r.texto}"</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(212, 175, 55, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--gold-primary)', fontWeight: 'bold', fontSize: '16px' }}>
                  {r.nombre.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="testimonio-autor">{r.nombre}</div>
                  {r.lugar && <div className="testimonio-lugar">{r.lugar}</div>}
                </div>
              </div>

              {puedeModerarResenas && (
                <button
                  onClick={() => handleEliminarResena(r.id)}
                  disabled={eliminandoResenaId === r.id}
                  style={{ position: 'absolute', top: '20px', right: '20px', background: 'none', border: 'none', color: '#ff6b6b', fontSize: '18px', cursor: 'pointer', opacity: '0.6', transition: 'opacity 0.2s' }}
                  title="Eliminar reseña (solo Marketing/Admin)"
                >
                  {eliminandoResenaId === r.id ? '⏳' : '🗑'}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="divider"></div>

      {/* SUCURSALES (Diseño Limpio) */}
      <div id="ubicacion" className="section-padding">
        <div style={{ textAlign: 'center', marginBottom: '50px' }}>
          <h2 style={{ fontSize: '2.5rem', color: 'var(--text-main)' }}>Nuestras <span style={{ color: 'var(--gold-primary)' }}>Sucursales</span></h2>
          <p style={{ color: 'var(--text-muted)', marginTop: '10px' }}>Encuentra el punto MuebLess is Better más cercano a ti o comparte nuestra ubicación.</p>
        </div>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '25px' }}>
          {sucursales.map((s, i) => (
            <div key={i} style={{ background: 'var(--bg-secondary)', padding: '30px', borderRadius: '24px', border: '1px solid rgba(255,255,255,0.03)', transition: 'transform 0.3s ease', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <h4 style={{ color: 'var(--text-main)', margin: '0 0 12px 0', fontSize: '1.2rem' }}>{s.nombre}</h4>
                <p style={{ fontSize: '14px', color: 'var(--text-muted)', lineHeight: '1.5', minHeight: '42px' }}>{s.dir}</p>
              </div>
              <div style={{ marginTop: '25px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <a href={s.wa} target="_blank" rel="noopener noreferrer" style={{ flex: 1, textAlign: 'center', background: '#25D366', color: 'white', padding: '10px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: '600', textDecoration: 'none' }}>WhatsApp</a>
                  <a href={s.link} target="_blank" rel="noopener noreferrer" style={{ flex: 1, textAlign: 'center', border: '1px solid rgba(255,255,255,0.2)', color: 'var(--text-main)', padding: '10px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: '600', textDecoration: 'none' }}>Ver Mapa</a>
                </div>
                <a 
                  href={`${whatsappPrincipal}?text=${encodeURIComponent(`Hola, quiero compartir la ubicación de la *${s.nombre}*:\nDirección: ${s.dir}\nMapa: ${s.link}`)}`} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  style={{ textAlign: 'center', background: 'rgba(212, 175, 55, 0.1)', border: '1px solid var(--gold-primary)', color: 'var(--gold-primary)', padding: '8px', borderRadius: '12px', fontSize: '12px', fontWeight: '600', textDecoration: 'none', transition: 'background 0.2s' }}
                >
                  📤 Compartir esta tienda por WhatsApp
                </a>
              </div>
            </div>
          ))}
        </div>

        {/* COMPARTIR DIRECCIÓN O REFERENCIA PERSONALIZADA */}
        <div style={{ marginTop: '50px', background: 'var(--bg-secondary)', padding: '30px', borderRadius: '24px', border: '1px solid rgba(212, 175, 55, 0.2)', maxWidth: '700px', margin: '50px auto 0', textAlign: 'center' }}>
          <h4 style={{ color: 'var(--text-main)', margin: '0 0 10px 0', fontSize: '1.2rem' }}>¿Deseas compartir una dirección o referencia propia?</h4>
          <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '20px' }}>Escribe tu ubicación exacta para envíos, entregas o proyectos y envíala directamente por WhatsApp:</p>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <input 
              type="text" 
              placeholder="Ej: Av. Principal, Calle 3, Edificio Los Pinos..." 
              value={direccionPersonalizada} 
              onChange={e => setDireccionPersonalizada(e.target.value)} 
              className="input-elegante"
              style={{ flex: '1', margin: '0', minWidth: '220px' }}
            />
            <a 
              href={direccionPersonalizada.trim() ? `${whatsappPrincipal}?text=${encodeURIComponent(`Hola, esta es la dirección/ubicación que deseo compartir para mi proyecto o entrega en MuebLess is Better: ${direccionPersonalizada}`)}` : '#'} 
              onClick={(e) => { if(!direccionPersonalizada.trim()) e.preventDefault(); }}
              target="_blank" 
              rel="noopener noreferrer" 
              className="btn-gold" 
              style={{ padding: '12px 24px', fontSize: '14px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
            >
              Enviar por WhatsApp
            </a>
          </div>
        </div>
      </div>

      {/* FOOTER PREMIUM */}
      <footer style={{ padding: '60px 5%', textAlign: 'center', background: 'var(--bg-secondary)', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <h2 style={{ color: 'var(--text-main)', margin: '0 0 15px 0', fontSize: '1.5rem', letterSpacing: '-0.5px' }}>
          MuebLess <span style={{ color: 'var(--gold-primary)', fontWeight: '400' }}>is Better</span>
        </h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '24px', margin: '20px 0 30px', fontSize: '13px', color: 'var(--text-muted)' }}>
          <span>🛡️ Garantía Absoluta</span>
          <span>💳 Inversión Segura</span>
          <span>🚚 Cobertura Nacional</span>
        </div>
        <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '13px' }}>© 2026 MuebLess is Better Bolivia. Diseñado para espacios excepcionales.</p>
      </footer>

      {/* BOTÓN FLOTANTE WHATSAPP */}
      <a href={whatsappPrincipal} target="_blank" rel="noopener noreferrer" className="whatsapp-float" aria-label="Atención inmediata por WhatsApp" title="Escríbenos por WhatsApp">
        <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
        </svg>
      </a>
    </div>
  )
}