'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

type ProductoDestacado = {
  nombre: string
  descripcion: string
  precio: string
  imagen: string
}

type PortadaConfig = {
  imagen_url: string
  link_destino: string
  activa: boolean
}

export default function Home() {
  const [carnet, setCarnet] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [usuario, setUsuario] = useState<any>(null)
  const [showLogin, setShowLogin] = useState(false)
  const [menuAbierto, setMenuAbierto] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [configPortada, setConfigPortada] = useState<PortadaConfig | null>(null)
  
  const loginRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const carnetGuardado = localStorage.getItem('carnet')
    if (carnetGuardado) {
      supabase.from('personal').select('*, cargos(*)').eq('carnet', carnetGuardado).eq('estado', true).single()
        .then(({ data }) => { if (data) setUsuario(data) })
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
  }, [])

  const handleLogin = async () => {
    if (!carnet || !password) { setError('Ingrese su CI y contrasena'); return }
    setCargando(true)
    setError('')
    const { data: persona, error: errPersona } = await supabase.from('personal').select('*, cargos(*)').eq('carnet', carnet).eq('estado', true).single()
    if (errPersona || !persona) { setError('CI no encontrado o usuario inactivo'); setCargando(false); return }
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

  const inputStyle = {
    padding: '10px', width: '100%', borderRadius: '8px',
    border: '1px solid #333', backgroundColor: '#0d0d1f',
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
    { nombre: 'Ropero Skan', descripcion: 'Diseño cómodo y elegante para sala moderna.', precio: 'Bs. 1250', imagen: '/productos/ropero-skan.jpg' },
    { nombre: 'Esquinero para living', descripcion: 'Mueble de acero con acabado elegante para tu sala de estar.', precio: 'Bs. 530', imagen: '/productos/esquinero.jpg' },
    { nombre: 'Recibidor para sala', descripcion: 'Mueble ideal para tu sala', precio: 'Bs. 990', imagen: '/productos/recibidor.jpg' },
  ] satisfies ProductoDestacado[]

  return (
    <div className="app-shell">
      <style>{`
        @keyframes float { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-12px); } }
        .mascota-float { animation: float 4s ease-in-out infinite; }
        @keyframes shimmer { 0% { background-position: -200% center; } 100% { background-position: 200% center; } }
        
        .app-shell { min-height: 100vh; font-family: "Inter", sans-serif; background: #0f1117; color: white; }
        
        .top-nav {
          display: flex; justify-content: space-between; align-items: center;
          padding: 12px 40px; background: rgba(20, 21, 35, 0.95);
          backdrop-filter: blur(20px); position: fixed; top: 0; width: 100%;
          z-index: 1000; border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          box-sizing: border-box;
        }

        .nav-links-container { display: flex; gap: 25px; align-items: center; }
        .nav-link { color: #e8e8e8; text-decoration: none; font-size: 14px; font-weight: 500; transition: 0.2s; }
        .nav-link:hover { color: #FFD700; }

        .hamburger { display: none; background: none; border: none; color: #FFD700; font-size: 28px; cursor: pointer; }

        @media (max-width: 900px) {
          .top-nav { padding: 12px 20px; }
          .nav-links-container {
            display: ${menuAbierto ? 'flex' : 'none'};
            flex-direction: column; position: absolute; top: 100%; left: 0; width: 100%;
            background: #1a1b2e; padding: 20px; border-bottom: 2px solid #FFD700;
            box-shadow: 0 10px 20px rgba(0,0,0,0.5);
            z-index: 1001;
          }
          .hamburger { display: block; }
          .nav-login-desktop { display: none; }
        }

        .hero-section {
          display: flex; align-items: center; justify-content: space-between;
          padding: 140px 40px 80px; max-width: 1200px; margin: 0 auto;
          min-height: 80vh; gap: 40px; box-sizing: border-box;
        }

        .hero-title {
          font-size: clamp(2.5rem, 5vw, 4.5rem); font-weight: 800; line-height: 1.1; margin: 0;
          background: linear-gradient(135deg, #FFD700, #FFA500);
          -webkit-background-clip: text; -webkit-text-fill-color: transparent;
        }

        .btn-gold {
          background: linear-gradient(135deg, #FFD700, #FFA500); color: #0a0a1a;
          border: none; padding: 12px 28px; border-radius: 30px; font-weight: 700;
          cursor: pointer; text-decoration: none; display: inline-flex;
        }

        .btn-outline {
          border: 2px solid #FFD700; color: #FFD700; padding: 10px 26px;
          border-radius: 30px; text-decoration: none; font-weight: 600;
        }

        .stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-top: 40px; }
        .stats-card { background: rgba(255,255,255,0.05); padding: 15px; border-radius: 15px; text-align: center; border: 1px solid rgba(255,255,255,0.1); }

        .promo-banner-section {
          padding: 60px 20px; text-align: center; background: rgba(255, 215, 0, 0.02);
          border-top: 1px solid rgba(255, 255, 255, 0.05);
        }

        .producto-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 25px; margin-top: 40px; }
        .producto-card { background: #1a1b2e; border-radius: 20px; overflow: hidden; border: 1px solid rgba(255,255,255,0.05); }
        .producto-card img { width: 100%; height: 200px; object-fit: cover; }

        .section-padding { padding: 80px 20px; max-width: 1200px; margin: 0 auto; }
        .divider { height: 1px; background: rgba(255,255,255,0.1); margin: 0 40px; }
        
        @media (max-width: 768px) {
          .hero-section { flex-direction: column; text-align: center; padding-top: 100px; }
          .mascota-img { width: 280px !important; }
        }
      `}</style>

      {/* NAVBAR */}
      <nav className="top-nav">
        <div className="brand" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <img src="/logo.jpg" alt="Logo" style={{ width: '35px', height: '35px', borderRadius: '8px' }} />
          <span style={{ fontWeight: '800', color: '#FFD700', fontSize: '16px' }}>Muebles is Better</span>
        </div>

        <div className="nav-links-container">
          <a href="#productos" className="nav-link" onClick={() => setMenuAbierto(false)}>Productos</a>
          {configPortada && <a href="#promociones" className="nav-link" onClick={() => setMenuAbierto(false)}>Promociones</a>}
          <a href="#ubicacion" className="nav-link" onClick={() => setMenuAbierto(false)}>Contacto</a>
          <a href="/cotizador" className="nav-link">Cotizador</a>
          <a href="/productos" className="nav-link">Catalogo</a>
          <a href="/sistema" className="nav-link">Sistema </a>
        </div>

        <div className="nav-login-desktop">
          {usuario ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '13px', color: '#FFD700' }}>{usuario.usuario}</span>
              <a href="/sistema" className="btn-gold" style={{ padding: '6px 15px', fontSize: '12px' }}>Sistema</a>
              <button onClick={handleCerrarSesion} style={{ background: 'none', border: '1px solid #ff6b6b', color: '#ff6b6b', padding: '5px 12px', borderRadius: '20px', cursor: 'pointer', fontSize: '12px' }}>Salir</button>
            </div>
          ) : (
            <button onClick={() => setShowLogin(!showLogin)} className="btn-gold" style={{ padding: '8px 20px', fontSize: '13px' }}>Ingresar</button>
          )}

          {showLogin && (
            <div ref={loginRef} style={{ position: 'absolute', right: '40px', top: '55px', background: '#161726', padding: '20px', borderRadius: '12px', width: '260px', border: '1px solid #FFD700', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
              <input type="text" placeholder="Carnet" value={carnet} onChange={e => setCarnet(e.target.value)} style={inputStyle} />
              <input type="password" placeholder="Contraseña" value={password} onChange={e => setPassword(e.target.value)} style={inputStyle} />
              <button onClick={handleLogin} disabled={cargando} style={{ width: '100%', padding: '10px', background: '#FFD700', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', color: '#000' }}>
                {cargando ? '...' : 'Entrar'}
              </button>
            </div>
          )}
        </div>

        <button className="hamburger" onClick={() => setMenuAbierto(!menuAbierto)}>
          {menuAbierto ? '✕' : '☰'}
        </button>
      </nav>

      {/* HERO - Mascota Fija */}
      <div className="hero-section">
        <div className="hero-text">
          <span style={{ color: '#FFD700', fontSize: '14px', letterSpacing: '2px' }}>INGENIERÍA DE INTERIORES</span>
          <h1 className="hero-title">Muebles is Better</h1>
          <p style={{ color: '#ccc', lineHeight: '1.6', fontSize: '1.1rem' }}>Más que muebles, Ingenieriía de interiores</p>
          <div style={{ display: 'flex', gap: '15px', marginTop: '10px' }}>
            <button className="btn-gold" onClick={() => document.getElementById('productos')?.scrollIntoView({ behavior: 'smooth' })}>Ver Productos</button>
            <a href="/cotizador" className="btn-outline">Cotizar</a>
          </div>
          <div className="stats-grid">
            {[{ n: '4', t: 'Sucursales' }, { n: '10+', t: 'Años' }, { n: '100%', t: 'Calidad' }].map((s, i) => (
              <div key={i} className="stats-card">
                <div style={{ color: '#FFD700', fontWeight: '800', fontSize: '20px' }}>{s.n}</div>
                <div style={{ fontSize: '11px', color: '#888' }}>{s.t}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ textAlign: 'center' }}>
          <img src="/mascota.png" alt="Mascota" className="mascota-img mascota-float" style={{ width: '340px', maxWidth: '85%' }} />
        </div>
      </div>

      {/* SECCIÓN DE PROMOCIONES - Condicional y debajo del Hero */}
      {configPortada && configPortada.activa && (
        <section id="promociones" className="promo-banner-section">
          <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
            <h2 style={{ fontSize: '1.8rem', color: '#FFD700', marginBottom: '30px' }}>Promociones Activas</h2>
            <a href={configPortada.link_destino}>
              <img 
                src={configPortada.imagen_url} 
                alt="Banner Promocional" 
                style={{ 
                  width: '100%', 
                  maxWidth: '900px', 
                  borderRadius: '20px', 
                  boxShadow: '0 15px 40px rgba(0,0,0,0.4)',
                  transition: 'transform 0.3s ease'
                }}
                onMouseOver={e => e.currentTarget.style.transform = 'scale(1.01)'}
                onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}
              />
            </a>
          </div>
        </section>
      )}

      <div className="divider"></div>

      {/* PRODUCTOS */}
      <div id="productos" className="section-padding">
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <h2 style={{ fontSize: '2rem', color: '#FFD700' }}>Nuestros Destacados</h2>
        </div>
        <div className="producto-grid">
          {productosDestacados.map((p, i) => (
            <div key={i} className="producto-card">
              <img src={p.imagen} alt={p.nombre} />
              <div style={{ padding: '20px' }}>
                <h3 style={{ margin: '0 0 10px 0' }}>{p.nombre}</h3>
                <p style={{ color: '#aaa', fontSize: '14px' }}>{p.descripcion}</p>
                <div style={{ color: '#FFD700', fontWeight: 'bold', marginTop: '15px' }}>{p.precio}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* SUCURSALES */}
      <div id="ubicacion" className="section-padding">
        <h2 style={{ textAlign: 'center', color: '#FFD700', marginBottom: '40px' }}>Ubicaciones</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px' }}>
          {sucursales.map((s, i) => (
            <div key={i} style={{ background: '#111222', padding: '20px', borderRadius: '15px', border: '1px solid #333' }}>
              <h4 style={{ color: '#FFD700', margin: '0 0 10px 0' }}>{s.nombre}</h4>
              <p style={{ fontSize: '13px', color: '#ccc' }}>{s.dir}</p>
              <div style={{ marginTop: '15px', display: 'flex', gap: '10px' }}>
                <a href={s.wa} style={{ background: '#25D366', color: 'white', padding: '7px 12px', borderRadius: '15px', fontSize: '12px', textDecoration: 'none' }}>WhatsApp</a>
                <a href={s.link} style={{ border: '1px solid #FFD700', color: '#FFD700', padding: '7px 12px', borderRadius: '15px', fontSize: '12px', textDecoration: 'none' }}>Mapa</a>
              </div>
            </div>
          ))}
        </div>
      </div>

      <footer style={{ padding: '40px', textAlign: 'center', borderTop: '1px solid #222' }}>
        <p style={{ color: '#FFD700', fontWeight: 'bold' }}>Muebles is Better</p>
        <p style={{ color: '#555', fontSize: '12px' }}>Bolivia 2026. Todos los derechos reservados.</p>
      </footer>
    </div>
  )
}