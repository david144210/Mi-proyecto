'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

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
    { nombre: 'Sucursal La Paz', dir: 'Zona Bella Vista, C. Ignacio Sanjines, La Paz', tel: '+591 60633283', link: 'https://maps.app.goo.gl/tA2KuW5a2yU66USm7', wa: 'https://wa.me/59160633283' },
    { nombre: 'Sucursal Santa Cruz', dir: 'Av. Napoleon Gomez Landivar, Radial 21, Santa Cruz', tel: '+591 60044821', link: 'https://maps.app.goo.gl/f9xnUphWpvmgmLxv5', wa: 'https://wa.me/59160044821' },
    { nombre: 'Sucursal Cochabamba', dir: 'Av. Segunda Circunvalacion, Cochabamba', tel: '+591 61211195', link: 'https://maps.app.goo.gl/WoCYUfsSXSPRB7Vc9', wa: 'https://wa.me/59161211195' },
  ]

  return (
    <div style={{ fontFamily: "'Georgia', serif", backgroundColor: '#0a0a1a', color: 'white', minHeight: '100vh' }}>

      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(30px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-12px); }
        }
        @keyframes shimmer {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        .hero-title {
          background: linear-gradient(135deg, #FFD700, #FFA500, #FFD700);
          background-size: 200% auto;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          animation: shimmer 3s linear infinite;
        }
        .mascota-float { animation: float 4s ease-in-out infinite; }
        .btn-gold {
          background: linear-gradient(135deg, #FFD700, #FFA500);
          color: #0a0a1a; border: none;
          padding: 14px 32px; border-radius: 30px;
          font-size: 16px; font-weight: bold; cursor: pointer;
          transition: transform 0.2s, box-shadow 0.2s;
          text-decoration: none; display: inline-block;
        }
        .btn-gold:hover { transform: translateY(-2px); box-shadow: 0 8px 25px rgba(255,215,0,0.4); }
        .btn-outline {
          background: transparent; color: #FFD700;
          border: 2px solid #FFD700; padding: 12px 30px;
          border-radius: 30px; font-size: 16px; cursor: pointer;
          transition: all 0.2s; text-decoration: none; display: inline-block;
        }
        .btn-outline:hover { background: #FFD700; color: #0a0a1a; }
        .btn-wa {
          background: #25D366; color: white; border: none;
          padding: 8px 16px; border-radius: 20px; font-size: 13px;
          cursor: pointer; text-decoration: none; display: inline-flex;
          align-items: center; gap: 6px; font-weight: bold;
          transition: transform 0.2s;
        }
        .btn-wa:hover { transform: translateY(-1px); }
        .card-hover { transition: transform 0.2s, box-shadow 0.2s; }
        .card-hover:hover { transform: translateY(-4px); box-shadow: 0 12px 30px rgba(255,215,0,0.15) !important; }
        .nav-link { color: #ccc; text-decoration: none; font-size: 14px; transition: color 0.2s; letter-spacing: 0.5px; }
        .nav-link:hover { color: #FFD700; }
        .divider { height: 1px; background: linear-gradient(90deg, transparent, rgba(255,215,0,0.3), transparent); margin: 0 40px; }
        @media (max-width: 768px) {
          .nav-menu { display: none !important; }
          .nav-menu.abierto { display: flex !important; flex-direction: column; position: fixed; top: 70px; left: 0; width: 100%; background: #0d0d1f; padding: 20px; gap: 20px; z-index: 999; box-sizing: border-box; border-top: 1px solid #FFD70033; }
          .hamburger { display: flex !important; }
          .nav-login-desktop { display: none !important; }
          .nav-login-movil { display: flex !important; }
          .hero-section { flex-direction: column !important; padding: 100px 20px 60px 20px !important; text-align: center !important; }
          .hero-text { align-items: center !important; }
          .hero-title-text { font-size: 32px !important; }
          .mascota-img { width: 200px !important; margin-top: 30px; }
          .section-padding { padding: 50px 20px !important; }
          .stats-grid { grid-template-columns: 1fr 1fr !important; gap: 16px !important; }
          .mision-grid { grid-template-columns: 1fr !important; }
          .sucursales-grid { grid-template-columns: 1fr !important; }
        }
        @media (min-width: 769px) {
          .hamburger { display: none !important; }
          .nav-login-movil { display: none !important; }
          .nav-menu { display: flex !important; }
        }
      `}</style>

      {/* NAVBAR */}
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 40px', backgroundColor: 'rgba(10,10,26,0.95)', backdropFilter: 'blur(10px)', color: 'white', position: 'fixed', top: 0, width: '100%', zIndex: 1000, boxSizing: 'border-box', borderBottom: '1px solid rgba(255,215,0,0.15)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <img src="/logo.jpg" alt="Logo" style={{ width: '40px', height: '40px', borderRadius: '8px' }} />
          <span style={{ fontWeight: 'bold', fontSize: '18px', color: '#FFD700' }}>Muebles is Better</span>
        </div>

        <div className={`nav-menu${menuAbierto ? ' abierto' : ''}`} style={{ display: 'flex', gap: '30px', alignItems: 'center' }}>
          <a href="#productos" onClick={() => setMenuAbierto(false)} className="nav-link">Productos</a>
          <a href="#mision" onClick={() => setMenuAbierto(false)} className="nav-link">Nosotros</a>
          <a href="#ubicacion" onClick={() => setMenuAbierto(false)} className="nav-link">Contacto</a>
          <a href="/cotizador" onClick={() => setMenuAbierto(false)} className="nav-link">Cotizador</a>
          <a href="/productos" onClick={() => setMenuAbierto(false)} className="nav-link">Catalogo</a>

          <div className="nav-login-movil" style={{ display: 'none', flexDirection: 'column' }}>
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

        <button className="hamburger" onClick={() => { setMenuAbierto(!menuAbierto); setShowLogin(false) }} style={{ background: 'none', border: 'none', color: '#FFD700', fontSize: '24px', cursor: 'pointer', display: 'none' }}>
          {menuAbierto ? '✕' : '☰'}
        </button>
      </nav>

      {/* HERO */}
      <div className="hero-section" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '130px 80px 80px 80px', maxWidth: '1200px', margin: '0 auto', minHeight: '100vh', boxSizing: 'border-box' }}>
        <div className="hero-text" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', maxWidth: '560px' }}>
          <div style={{ display: 'inline-block', backgroundColor: 'rgba(255,215,0,0.1)', border: '1px solid rgba(255,215,0,0.3)', borderRadius: '20px', padding: '6px 16px', marginBottom: '20px', fontSize: '13px', color: '#FFD700', letterSpacing: '1px' }}>
            Mas que diseno, ingenieria de interiores
          </div>
          <h1 className="hero-title hero-title-text" style={{ fontSize: '52px', fontWeight: 'bold', margin: '0 0 12px 0', lineHeight: '1.1' }}>
            Muebles is Better
          </h1>
          <p style={{ fontSize: '16px', color: '#a3c47d', margin: '0 0 20px 0', fontStyle: 'italic', letterSpacing: '0.5px' }}>
            Mas que diseno, ingenieria de interiores
          </p>
          <p style={{ fontSize: '16px', color: '#aaa', margin: '0 0 36px 0', lineHeight: '1.7' }}>
            Diseñamos, fabricamos y comercializamos muebles para el hogar, oficinas y espacios de recreacion con materiales resistentes y de calidad.
          </p>
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' as const }}>
            <button className="btn-gold" onClick={() => document.getElementById('productos')?.scrollIntoView({ behavior: 'smooth' })}>
              Ver Productos
            </button>
            <a href="/cotizador" className="btn-outline">
              Cotizar Ahora
            </a>
          </div>

          <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '24px', marginTop: '50px' }}>
            {[
              { numero: '4', label: 'Sucursales' },
              { numero: '10+', label: 'Anos de experiencia' },
              { numero: '100%', label: 'Calidad garantizada' },
            ].map((s, i) => (
              <div key={i} style={{ textAlign: 'center' }}>
                <p style={{ margin: 0, fontSize: '28px', fontWeight: 'bold', color: '#FFD700' }}>{s.numero}</p>
                <p style={{ margin: 0, fontSize: '12px', color: '#aaa', letterSpacing: '0.5px' }}>{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <img src="/mascota.png" alt="Mascota" className="mascota-img mascota-float" style={{ width: '340px', filter: 'drop-shadow(0 20px 40px rgba(255,215,0,0.2))' }} />
        </div>
      </div>

      <div className="divider"></div>

      {/* PRODUCTOS */}
      <div id="productos" className="section-padding" style={{ padding: '80px 40px', textAlign: 'center', maxWidth: '1200px', margin: '0 auto' }}>
        <div style={{ display: 'inline-block', backgroundColor: 'rgba(255,215,0,0.1)', border: '1px solid rgba(255,215,0,0.3)', borderRadius: '20px', padding: '6px 16px', marginBottom: '16px', fontSize: '13px', color: '#FFD700' }}>
          Catalogo
        </div>
        <h2 style={{ fontSize: '36px', margin: '0 0 12px 0', color: 'white' }}>Nuestros Productos</h2>
        <p style={{ color: '#888', marginBottom: '40px', maxWidth: '500px', margin: '0 auto 40px auto' }}>
          Proxximamente estara disponible nuestro catalogo completo de muebles.
        </p>
        <a href="/cotizador" className="btn-gold" style={{ textDecoration: 'none' }}>
          Ir al Cotizador
        </a>
      </div>

      <div className="divider"></div>

      {/* MISION Y VISION */}
      <div id="mision" className="section-padding" style={{ padding: '80px 40px', maxWidth: '1200px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <div style={{ display: 'inline-block', backgroundColor: 'rgba(255,215,0,0.1)', border: '1px solid rgba(255,215,0,0.3)', borderRadius: '20px', padding: '6px 16px', marginBottom: '16px', fontSize: '13px', color: '#FFD700' }}>
            Quienes Somos
          </div>
          <h2 style={{ fontSize: '36px', margin: '0 0 12px 0', color: 'white' }}>Mision y Vision</h2>
          <p style={{ color: '#a3c47d', fontStyle: 'italic', fontSize: '16px', margin: 0 }}>Mas que diseno, ingenieria de interiores</p>
        </div>
        <div className="mision-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
          <div className="card-hover" style={{ backgroundColor: '#1a1a2e', borderRadius: '16px', padding: '32px', border: '1px solid rgba(255,215,0,0.15)' }}>
            <div style={{ fontSize: '40px', marginBottom: '16px' }}>🎯</div>
            <h3 style={{ color: '#FFD700', margin: '0 0 16px 0', fontSize: '20px' }}>Nuestra Mision</h3>
            <p style={{ color: '#aaa', lineHeight: '1.8', margin: 0, fontSize: '15px' }}>
              Somos una empresa innovadora que disena, fabrica y comercializa muebles para el hogar, oficinas y todo tipo de espacios de recreacion, elaborados con materiales resistentes y de calidad que cumplen con los altos estandares que merecen nuestros clientes.
            </p>
          </div>
          <div className="card-hover" style={{ backgroundColor: '#1a1a2e', borderRadius: '16px', padding: '32px', border: '1px solid rgba(255,215,0,0.15)' }}>
            <div style={{ fontSize: '40px', marginBottom: '16px' }}>🚀</div>
            <h3 style={{ color: '#FFD700', margin: '0 0 16px 0', fontSize: '20px' }}>Nuestra Vision</h3>
            <p style={{ color: '#aaa', lineHeight: '1.8', margin: 0, fontSize: '15px' }}>
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
          <p style={{ color: '#888', margin: 0 }}>Visitanos o contactanos en cualquiera de nuestras 4 sucursales a nivel nacional</p>
        </div>

        <div className="sucursales-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '20px' }}>
          {sucursales.map((s, i) => (
            <div key={i} className="card-hover" style={{ backgroundColor: '#1a1a2e', borderRadius: '16px', padding: '28px', border: '1px solid rgba(255,215,0,0.15)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ fontSize: '28px' }}>📍</div>
              <h3 style={{ margin: 0, color: '#FFD700', fontSize: '16px' }}>{s.nombre}</h3>
              <p style={{ color: '#aaa', fontSize: '13px', margin: 0, lineHeight: '1.5' }}>{s.dir}</p>

              {/* TELEFONO */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '16px' }}>📞</span>
                <a href={`tel:${s.tel.replace(/\s/g, '')}`} style={{ color: '#a3c47d', fontSize: '14px', textDecoration: 'none', fontWeight: 'bold' }}>
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
      <footer style={{ backgroundColor: '#05050f', padding: '48px 40px', borderTop: '1px solid rgba(255,215,0,0.15)', marginTop: '40px' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
          <img src="/logo.jpg" alt="Logo" style={{ width: '60px', height: '60px', borderRadius: '12px' }} />
          <p style={{ color: '#FFD700', fontWeight: 'bold', margin: 0, fontSize: '18px' }}>Muebles is Better</p>
          <p style={{ color: '#a3c47d', fontStyle: 'italic', margin: 0, fontSize: '14px' }}>Mas que diseno, ingenieria de interiores</p>
          <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' as const, justifyContent: 'center' }}>
            {sucursales.map((s, i) => (
              <a key={i} href={s.wa} target="_blank" rel="noopener noreferrer" style={{ color: '#25D366', fontSize: '13px', textDecoration: 'none' }}>
                {s.nombre}: {s.tel}
              </a>
            ))}
          </div>
          <p style={{ color: '#444', fontSize: '12px', margin: 0 }}>Bolivia 2025. Todos los derechos reservados.</p>
        </div>
      </footer>

    </div>
  )
}
