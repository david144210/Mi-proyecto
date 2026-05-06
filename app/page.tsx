'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

type ProductoDestacado = {
  nombre: string
  descripcion: string
  precio: string
  imagen: string
}

export default function Home() {
  const [carnet, setCarnet] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [usuario, setUsuario] = useState<any>(null)
  const [showLogin, setShowLogin] = useState(false)
  const [menuAbierto, setMenuAbierto] = useState(false)
  const [cargando, setCargando] = useState(false)

  useEffect(() => {
    const carnetGuardado = localStorage.getItem('carnet')
    if (carnetGuardado) {
      supabase.from('personal').select('*, cargos(*)').eq('carnet', carnetGuardado).eq('estado', true).single()
        .then(({ data }) => { if (data) setUsuario(data) })
    }
  }, [])

  const handleLogin = async () => {
    if (!carnet || !password) { setError('Ingrese su CI y contrasena'); return }
    setCargando(true)
    setError('')
    const { data: persona, error: errPersona } = await supabase.from('personal').select('*, cargos(*)').eq('carnet', carnet).eq('estado', true).single()
    if (errPersona || !persona) { setError('CI no encontrado o usuario inactivo'); setCargando(false); return }
    if (!persona.password_hash) { setError('Este usuario no tiene contrasena asignada'); setCargando(false); return }
    const { data: valido, error: errPass } = await supabase.rpc('verificar_password', { password_input: password, hash_guardado: persona.password_hash })
    if (errPass || !valido) { setError('Contrasena incorrecta'); setCargando(false); return }
    setUsuario(persona)
    setShowLogin(false)
    setMenuAbierto(false)
    setPassword('')
    setError('')
    localStorage.setItem('carnet', carnet)
    setCargando(false)
  }

  const handleCerrarSesion = () => {
    setUsuario(null); setCarnet(''); setPassword('')
    setShowLogin(false); setMenuAbierto(false)
    localStorage.removeItem('carnet')
  }

  const inputDesktop = {
    padding: '10px', width: '100%', borderRadius: '8px',
    border: '1px solid #333', backgroundColor: '#0d0d1f',
    color: 'white', marginBottom: '8px',
    boxSizing: 'border-box' as const, fontSize: '14px'
  }

  const inputMovil = {
    padding: '10px', width: '100%', borderRadius: '8px',
    border: '1px solid #555', backgroundColor: '#333',
    color: 'white', marginBottom: '8px',
    boxSizing: 'border-box' as const, fontSize: '14px'
  }

  const sucursales = [
    { nombre: 'Sucursal El Alto', dir: 'C. L. de la Vega 3623, El Alto', tel: '+591 65572015', link: 'https://maps.app.goo.gl/S6gJuAURM7S2WEzu5', wa: 'https://wa.me/59165572015' },
    { nombre: 'Sucursal La Paz', dir: 'Zona Bella Vista, C. Ignacio Sanjines, La Paz', tel: '+591 60633283', link: 'https://maps.app.goo.gl/tA2KuW5a2U66USm7', wa: 'https://wa.me/59160633283' },
    { nombre: 'Sucursal Santa Cruz', dir: 'Av. Napoleon Gomez Landivar, Radial 21, Santa Cruz', tel: '+591 60044821', link: 'https://maps.app.goo.gl/f9xnUphWpvmgmLxv5', wa: 'https://wa.me/59160044821' },
    { nombre: 'Sucursal Cochabamba', dir: 'Av. Segunda Circunvalacion, Cochabamba', tel: '+591 61211195', link: 'https://maps.app.goo.gl/WoCYUfsSXSPRB7Vc9', wa: 'https://wa.me/59161211195' },
  ]

  const productosDestacados = [
  {
    nombre: 'Ropero Skan',
    descripcion: 'Diseño cómodo y elegante para sala moderna.',
    precio: 'Bs. 1250',
    imagen: '/productos/ropero-skan.jpg',
  },
  {
    nombre: 'Esquinero para living',
    descripcion: 'Mueble de acero con acabado elegante para tu sala de estar.',
    precio: 'Bs. 530',
    imagen: '/productos/esquinero.jpg',
  },
  {
    nombre: 'Recibidor para sala',
    descripcion: 'Mueble ideal para tu sala',
    precio: 'Bs. 990',
    imagen: '/productos/recibidor.jpg',
  },
] satisfies ProductoDestacado[]

  return (
    <div className="app-shell">

      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-12px); }
        }
        @keyframes shimmer {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        .app-shell {
          min-height: 100vh;
          font-family: "Inter", system-ui, sans-serif;
          background: radial-gradient(circle at top, rgba(255,215,0,0.12), transparent 30%),
                      linear-gradient(180deg, #0f1117 0%, #1a1b2e 48%, #14151f 100%);
          color: #ffffff;
        }
        .top-nav {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 18px 40px;
          background: rgba(20, 21, 35, 0.85);
          backdrop-filter: blur(20px);
          color: white;
          position: fixed;
          top: 0;
          width: 100%;
          z-index: 1000;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          box-sizing: border-box;
        }
        .brand-name {
          font-weight: 700;
          font-size: 18px;
          color: #FFD700;
          letter-spacing: 0.4px;
          text-transform: uppercase;
        }
        .top-nav .nav-menu {
          display: flex;
          gap: 30px;
          align-items: center;
          flex-wrap: wrap;
        }
        .top-nav .nav-link {
          color: #e8e8e8;
          text-decoration: none;
          font-size: 14px;
          transition: color 0.2s ease;
          letter-spacing: 0.5px;
        }
        .top-nav .nav-link:hover {
          color: #FFD700;
        }
        .top-nav .nav-actions {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .glass-panel {
          position: absolute;
          right: 0;
          top: 62px;
          width: 320px;
          background: rgba(14, 15, 33, 0.92);
          border: 1px solid rgba(255, 215, 0, 0.16);
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
          padding: 24px;
          border-radius: 18px;
          color: white;
          z-index: 1001;
        }
        .hero-section {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 140px 40px 80px;
          max-width: 1200px;
          margin: 0 auto;
          min-height: 92vh;
          gap: 40px;
          box-sizing: border-box;
        }
        .hero-text {
          display: flex;
          flex-direction: column;
          gap: 24px;
          max-width: 560px;
        }
        .hero-title {
          font-size: clamp(3rem, 4.5vw, 5rem);
          font-weight: 800;
          line-height: 1.02;
          margin: 0;
          background: linear-gradient(135deg, #FFD700, #FFA500, #FFD700);
          background-size: 180% auto;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          animation: shimmer 3s linear infinite;
        }
        .hero-copy {
          font-size: 1rem;
          color: #e0e0e0;
          line-height: 1.8;
          max-width: 560px;
          margin: 0;
        }
        .hero-subtitle {
          color: #ffffff;
          font-size: 1.05rem;
          font-style: italic;
          letter-spacing: 0.4px;
          margin: 0;
        }
        .hero-actions {
          display: flex;
          gap: 16px;
          flex-wrap: wrap;
          align-items: center;
        }
        .btn-gold {
          background: linear-gradient(135deg, #FFD700, #FFA500);
          color: #0a0a1a;
          border: none;
          padding: 14px 32px;
          border-radius: 30px;
          font-size: 16px;
          font-weight: 700;
          cursor: pointer;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
          text-decoration: none;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .btn-gold:hover {
          transform: translateY(-2px);
          box-shadow: 0 16px 30px rgba(255, 215, 0, 0.35);
        }
        .btn-outline {
          background: rgba(255, 255, 255, 0.04);
          color: #FFD700;
          border: 2px solid rgba(255, 215, 0, 0.45);
          padding: 12px 30px;
          border-radius: 30px;
          font-size: 16px;
          cursor: pointer;
          transition: background 0.2s ease, color 0.2s ease;
          text-decoration: none;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .btn-outline:hover {
          background: #FFD700;
          color: #0a0a1a;
        }
        .btn-wa {
          background: #25D366;
          color: white;
          border: none;
          padding: 10px 16px;
          border-radius: 22px;
          font-size: 13px;
          cursor: pointer;
          text-decoration: none;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-weight: 700;
          transition: transform 0.2s ease;
        }
        .btn-wa:hover {
          transform: translateY(-1px);
        }
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 22px;
          margin-top: 50px;
        }
        .stats-card {
          padding: 24px;
          border-radius: 20px;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.12);
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }
        .stats-card:hover {
          transform: translateY(-3px);
          box-shadow: 0 16px 30px rgba(0, 0, 0, 0.15);
        }
        .producto-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          gap: 24px;
          margin-top: 40px;
        }
        .producto-card {
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 24px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          min-height: 100%;
        }
        .producto-card img {
          width: 100%;
          height: 220px;
          object-fit: cover;
          background: #111;
        }
        .producto-card-content {
          display: flex;
          flex-direction: column;
          gap: 12px;
          padding: 22px;
          flex: 1;
        }
        .producto-card-title {
          margin: 0;
          font-size: 1.05rem;
          color: #ffffff;
          font-weight: 700;
        }
        .producto-card-desc {
          margin: 0;
          color: #d8d8d8;
          line-height: 1.7;
          font-size: 0.96rem;
        }
        .producto-card-price {
          margin: 0;
          font-weight: 700;
          color: #ffd700;
          font-size: 1rem;
        }
        .producto-card-cta {
          margin-top: auto;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          padding: 10px 16px;
          background: rgba(255, 255, 255, 0.08);
          color: #ffffff;
          border-radius: 999px;
          text-decoration: none;
          font-size: 0.95rem;
          font-weight: 700;
          transition: background 0.2s ease;
        }
        .producto-card-cta:hover {
          background: rgba(255, 255, 255, 0.14);
        }
        .section-padding {
          padding: 80px 40px;
          max-width: 1200px;
          margin: 0 auto;
          box-sizing: border-box;
        }
        .section-heading {
          text-align: center;
          margin-bottom: 48px;
        }
        .section-label {
          display: inline-block;
          background-color: rgba(255, 215, 0, 0.1);
          border: 1px solid rgba(255, 215, 0, 0.28);
          border-radius: 20px;
          padding: 6px 16px;
          margin-bottom: 16px;
          font-size: 13px;
          color: #FFD700;
          letter-spacing: 0.8px;
          text-transform: uppercase;
        }
        .section-title {
          font-size: 2.25rem;
          margin: 0 0 12px 0;
          color: white;
        }
        .section-copy {
          color: #d8d8d8;
          margin: 0 auto;
          max-width: 640px;
          font-size: 1rem;
          line-height: 1.8;
        }
        .card-panel {
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 24px;
          padding: 32px;
          transition: transform 0.25s ease, box-shadow 0.25s ease;
        }
        .card-panel:hover {
          transform: translateY(-4px);
          box-shadow: 0 24px 40px rgba(0, 0, 0, 0.22);
        }
        .mision-grid,
        .sucursales-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 24px;
        }
        .divider {
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.15), transparent);
          margin: 0 40px;
        }
        .footer {
          background-color: #0a0b15;
          padding: 56px 40px;
          border-top: 1px solid rgba(255, 255, 255, 0.08);
        }
        .footer-links {
          display: flex;
          gap: 24px;
          flex-wrap: wrap;
          justify-content: center;
        }
        .footer-links a {
          color: #c8d4b8;
          text-decoration: none;
          font-size: 13px;
        }
        .hamburger {
          background: none;
          border: none;
          color: #FFD700;
          font-size: 28px;
          cursor: pointer;
          display: none;
        }
        @media (max-width: 768px) {
          .top-nav {
            padding: 16px 20px;
          }
          .nav-menu {
            display: none !important;
          }
          .nav-menu.abierto {
            display: flex !important;
            flex-direction: column;
            position: fixed;
            top: 70px;
            left: 0;
            width: 100%;
            background: rgba(9, 10, 26, 0.96);
            padding: 20px;
            gap: 18px;
            z-index: 999;
            box-sizing: border-box;
            border-top: 1px solid rgba(255, 215, 0, 0.18);
          }
          .nav-login-movil {
            display: none;
          }
          .nav-menu.abierto .nav-login-movil {
            display: flex !important;
            flex-direction: column;
            gap: 14px;
          }
          .hamburger {
            display: flex;
          }
          .hero-section {
            flex-direction: column;
            padding: 120px 20px 60px;
            text-align: center;
          }
          .hero-text {
            align-items: center;
          }
          .stats-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 18px;
          }
          .mision-grid,
          .sucursales-grid {
            grid-template-columns: 1fr;
          }
          .section-padding {
            padding: 50px 20px;
          }
          .hero-copy,
          .section-copy {
            max-width: 100%;
          }
          .producto-grid {
            grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
            gap: 16px;
          }
          .producto-card img {
            height: 160px;
          }
          .producto-card-content {
            padding: 16px;
            gap: 10px;
          }
          .producto-card-title {
            font-size: 0.95rem;
          }
          .producto-card-desc {
            font-size: 0.88rem;
          }
        }
      `}</style>

      {/* NAVBAR */}
      <nav className="top-nav">
        <div className="brand" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <img src="/logo.jpg" alt="Logo" style={{ width: '40px', height: '40px', borderRadius: '10px' }} />
          <span className="brand-name">Muebles is Better</span>
        </div>

        <div className={`nav-menu${menuAbierto ? ' abierto' : ''}`}>
          <a href="#productos" onClick={() => setMenuAbierto(false)} className="nav-link">Productos</a>
          <a href="#mision" onClick={() => setMenuAbierto(false)} className="nav-link">Nosotros</a>
          <a href="#ubicacion" onClick={() => setMenuAbierto(false)} className="nav-link">Contacto</a>
          <a href="/cotizador" onClick={() => setMenuAbierto(false)} className="nav-link">Cotizador</a>
          <a href="/productos" onClick={() => setMenuAbierto(false)} className="nav-link">Catalogo</a>

          <div className="nav-login-movil" style={{ flexDirection: 'column' }}>
            {usuario ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <span style={{ color: '#FFD700', fontWeight: 'bold' }}>{usuario.usuario} 👤</span>
                {usuario.cargos?.nombre && <span style={{ color: '#aaa', fontSize: '12px' }}>{usuario.cargos.nombre}</span>}
                <a href="/sistema" style={{ display: 'inline-block', background: 'linear-gradient(135deg,#FFD700,#FFA500)', color: '#0a0a1a', padding: '8px 14px', borderRadius: '20px', fontSize: '13px', textDecoration: 'none', textAlign: 'center', fontWeight: 'bold' }}>
                  Ingresar al Sistema
                </a>
                <button onClick={handleCerrarSesion} style={{ backgroundColor: 'transparent', color: '#ff6b6b', border: '1px solid #ff6b6b', padding: '8px 12px', borderRadius: '20px', cursor: 'pointer', fontSize: '13px' }}>
                  Cerrar Sesion
                </button>
              </div>
            ) : (
              <div style={{ width: '100%' }}>
                <p style={{ color: '#aaa', fontSize: '13px', marginBottom: '10px' }}>Ingresa con tu CI</p>
                <input type="text" placeholder="Carnet de identidad" value={carnet} onChange={(e) => setCarnet(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleLogin()} style={inputMovil} />
                <input type="password" placeholder="Contrasena" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleLogin()} style={{ ...inputMovil, marginBottom: '10px' }} />
                <button onClick={handleLogin} disabled={cargando} style={{ width: '100%', padding: '10px', background: 'linear-gradient(135deg,#FFD700,#FFA500)', color: '#0a0a1a', border: 'none', borderRadius: '8px', cursor: cargando ? 'not-allowed' : 'pointer', fontSize: '14px', fontWeight: 'bold' }}>
                  {cargando ? 'Verificando...' : 'Ingresar'}
                </button>
                {error && <p style={{ color: '#ff6b6b', marginTop: '8px', fontSize: '13px' }}>{error}</p>}
              </div>
            )}
          </div>
        </div>

        <div className="nav-login-desktop" style={{ position: 'relative' }}>
          {usuario ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ textAlign: 'right' }}>
                <p style={{ margin: 0, color: '#FFD700', fontWeight: 'bold', fontSize: '14px' }}>{usuario.usuario} 👤</p>
                {usuario.cargos?.nombre && <p style={{ margin: 0, color: '#aaa', fontSize: '11px' }}>{usuario.cargos.nombre}</p>}
              </div>
              <a href="/sistema" style={{ background: 'linear-gradient(135deg,#FFD700,#FFA500)', color: '#0a0a1a', padding: '6px 14px', borderRadius: '20px', fontSize: '12px', textDecoration: 'none', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                Ingresar al Sistema
              </a>
              <button onClick={handleCerrarSesion} style={{ backgroundColor: 'transparent', color: '#ff6b6b', border: '1px solid #ff6b6b', padding: '5px 12px', borderRadius: '20px', cursor: 'pointer', fontSize: '12px' }}>
                Cerrar Sesion
              </button>
            </div>
          ) : (
            <button onClick={() => setShowLogin(!showLogin)} className="btn-gold" style={{ padding: '8px 20px', fontSize: '14px' }}>
              Iniciar Sesion
            </button>
          )}

          {showLogin && !usuario && (
            <div style={{ position: 'absolute', right: 0, top: '50px', backgroundColor: '#1a1a2e', padding: '25px', borderRadius: '16px', boxShadow: '0 8px 32px rgba(0,0,0,0.5)', width: '300px', color: 'white', zIndex: 1001, border: '1px solid rgba(255,215,0,0.2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                <img src="/logo.jpg" alt="Logo" style={{ width: '32px', height: '32px', borderRadius: '6px' }} />
                <div>
                  <h3 style={{ margin: 0, fontSize: '16px', color: '#FFD700' }}>Bienvenido</h3>
                  <p style={{ margin: 0, fontSize: '12px', color: '#aaa' }}>Ingrese sus credenciales</p>
                </div>
              </div>
              <input type="text" placeholder="Carnet de identidad (CI)" value={carnet} onChange={(e) => setCarnet(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleLogin()} style={inputDesktop} />
              <input type="password" placeholder="Contrasena" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleLogin()} style={{ ...inputDesktop, marginBottom: '12px' }} />
              <button onClick={handleLogin} disabled={cargando} style={{ width: '100%', padding: '10px', background: cargando ? '#555' : 'linear-gradient(135deg,#FFD700,#FFA500)', color: '#0a0a1a', border: 'none', borderRadius: '8px', cursor: cargando ? 'not-allowed' : 'pointer', fontSize: '14px', fontWeight: 'bold' }}>
                {cargando ? 'Verificando...' : 'Ingresar'}
              </button>
              {error && <p style={{ color: '#ff6b6b', marginTop: '8px', fontSize: '13px' }}>{error}</p>}
            </div>
          )}
        </div>

        <button className="hamburger" onClick={() => { setMenuAbierto(!menuAbierto); setShowLogin(false) }} style={{ background: 'none', border: 'none', color: '#FFD700', fontSize: '24px', cursor: 'pointer' }}>
          {menuAbierto ? '✕' : '☰'}
        </button>
      </nav>

      {/* HERO */}
      <div className="hero-section">
        <div className="hero-text">
          <div className="section-label" style={{ marginBottom: '0' }}>
            Más que Muebles, ingeniería de interiores
          </div>
          <h1 className="hero-title">
            Muebles is Better
          </h1>
          <p className="hero-subtitle">
            Más que Muebles, ingeniería de interiores
          </p>
          <p className="hero-copy">
            Diseñamos, fabricamos y comercializamos muebles para el hogar, oficinas y espacios de recreacion con materiales resistentes y de calidad.
          </p>
          <div className="hero-actions">
            <button className="btn-gold" onClick={() => document.getElementById('productos')?.scrollIntoView({ behavior: 'smooth' })}>
              Ver Productos
            </button>
            <a href="/cotizador" className="btn-outline">
              Cotizar Ahora
            </a>
          </div>

          <div className="stats-grid">
            {[
              { numero: '4', label: 'Sucursales' },
              { numero: '10+', label: 'Anos de experiencia' },
              { numero: '100%', label: 'Calidad garantizada' },
            ].map((s, i) => (
              <div key={i} className="stats-card" style={{ textAlign: 'center' }}>
                <p style={{ margin: 0, fontSize: '28px', fontWeight: '800', color: '#FFD700' }}>{s.numero}</p>
                <p style={{ margin: 0, fontSize: '13px', color: '#d3d3d3', letterSpacing: '0.4px' }}>{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <img src="/mascota.png" alt="Mascota" className="mascota-img mascota-float" style={{ width: '340px', filter: 'drop-shadow(0 20px 40px rgba(255,215,0,0.22))' }} />
        </div>
      </div>

      <div className="divider"></div>

      {/* PRODUCTOS */}
      <div id="productos" className="section-padding" style={{ textAlign: 'center' }}>
        <div className="section-label">Catalogo</div>
        <h2 className="section-title">Nuestros Productos</h2>
        <p className="section-copy" style={{ marginBottom: '24px' }}>
          Descubre algunos de nuestros muebles destacados. Sube tus imágenes a <code>/public/productos/</code> y actualiza las rutas en el arreglo de productos.
        </p>
        <div className="producto-grid">
          {productosDestacados.map((producto, index) => (
            <div key={index} className="producto-card">
              <img src={producto.imagen} alt={producto.nombre} />
              <div className="producto-card-content">
                <h3 className="producto-card-title">{producto.nombre}</h3>
                <p className="producto-card-desc">{producto.descripcion}</p>
                <p className="producto-card-price">{producto.precio}</p>
                <a href="/cotizador" className="producto-card-cta">Pedir información</a>
              </div>
            </div>
          ))}
        </div>
        <a href="/cotizador" className="btn-gold" style={{ textDecoration: 'none', marginTop: '34px', display: 'inline-block' }}>
          Ir al Cotizador
        </a>
      </div>

      <div className="divider"></div>

      {/* MISION Y VISION */}
      <div id="mision" className="section-padding">
        <div className="section-heading">
          <div className="section-label">Quienes Somos</div>
          <h2 className="section-title">Mision y Vision</h2>
          <p className="section-copy" style={{ fontStyle: 'italic', color: '#d4d4d4' }}>Más que Muebles, ingeniería de interiores</p>
        </div>
        <div className="mision-grid">
          <div className="card-panel">
            <div style={{ fontSize: '40px', marginBottom: '16px' }}>🎯</div>
            <h3 style={{ color: '#FFD700', margin: '0 0 16px 0', fontSize: '20px' }}>Nuestra Mision</h3>
            <p style={{ color: '#d4d4d4', lineHeight: '1.8', margin: 0, fontSize: '15px' }}>
              Somos una empresa innovadora que disena, fabrica y comercializa muebles para el hogar, oficinas y todo tipo de espacios de recreacion, elaborados con materiales resistentes y de calidad que cumplen con los altos estandares que merecen nuestros clientes.
            </p>
          </div>
          <div className="card-panel">
            <div style={{ fontSize: '40px', marginBottom: '16px' }}>🚀</div>
            <h3 style={{ color: '#FFD700', margin: '0 0 16px 0', fontSize: '20px' }}>Nuestra Vision</h3>
            <p style={{ color: '#d4d4d4', lineHeight: '1.8', margin: 0, fontSize: '15px' }}>
              Ser una empresa proveedora de muebles de excelente calidad, de manera eficiente y oportuna contribuyendo al progreso del pais, mediante la generacion de empleos dignos y justos.
            </p>
          </div>
        </div>
      </div>

      <div className="divider"></div>

      {/* UBICACION Y CONTACTO */}
      <div id="ubicacion" className="section-padding" style={{ padding: '80px 40px', maxWidth: '1200px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <div style={{ display: 'inline-block', backgroundColor: 'rgba(255,215,0,0.1)', border: '1px solid rgba(255,215,0,0.3)', borderRadius: '20px', padding: '6px 16px', marginBottom: '16px', fontSize: '13px', color: '#FFD700' }}>
            Contacto y Sucursales
          </div>
          <h2 style={{ fontSize: '36px', margin: '0 0 12px 0', color: 'white' }}>Donde Encontrarnos</h2>
          <p style={{ color: '#d0d0d0', margin: 0 }}>Visitanos o contactanos en cualquiera de nuestras 4 sucursales a nivel nacional</p>
        </div>

        <div className="sucursales-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '20px' }}>
          {sucursales.map((s, i) => (
            <div key={i} className="card-panel" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ fontSize: '28px' }}>📍</div>
              <h3 style={{ margin: 0, color: '#FFD700', fontSize: '16px' }}>{s.nombre}</h3>
              <p style={{ color: '#d8d8d8', fontSize: '13px', margin: 0, lineHeight: '1.5' }}>{s.dir}</p>

              {/* TELEFONO */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '16px' }}>📞</span>
                <a href={`tel:${s.tel.replace(/\s/g, '')}`} style={{ color: '#e0e0e0', fontSize: '14px', textDecoration: 'none', fontWeight: '600' }}>
                  {s.tel}
                </a>
              </div>

              {/* BOTONES */}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' as const, marginTop: '4px' }}>
                <a href={s.wa} target="_blank" rel="noopener noreferrer" className="btn-wa">
                  <span>💬</span> WhatsApp
                </a>
                <a href={s.link} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', background: 'linear-gradient(135deg,#FFD700,#FFA500)', color: '#0a0a1a', padding: '8px 14px', borderRadius: '20px', textDecoration: 'none', fontSize: '12px', fontWeight: 'bold' }}>
                  Ver Mapa
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* FOOTER */}
      <footer className="footer">
        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
          <img src="/logo.jpg" alt="Logo" style={{ width: '60px', height: '60px', borderRadius: '14px' }} />
          <p style={{ color: '#FFD700', fontWeight: '700', margin: 0, fontSize: '18px' }}>Muebles is Better</p>
          <p style={{ color: '#e0e0e0', fontStyle: 'italic', margin: 0, fontSize: '14px' }}>Más que Muebles, ingeniería de interiores</p>
          <div className="footer-links">
            {sucursales.map((s, i) => (
              <a key={i} href={s.wa} target="_blank" rel="noopener noreferrer">
                {s.nombre}: {s.tel}
              </a>
            ))}
          </div>
          <p style={{ color: '#888', fontSize: '12px', margin: 0 }}>Bolivia 2025. Todos los derechos reservados.</p>
        </div>
      </footer>

    </div>
  )
}
