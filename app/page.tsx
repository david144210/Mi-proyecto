'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function Home() {
  const [carnet, setCarnet] = useState('')
  const [error, setError] = useState('')
  const [usuario, setUsuario] = useState<any>(null)
  const [showLogin, setShowLogin] = useState(false)

  useEffect(() => {
    const carnetGuardado = localStorage.getItem('carnet')
    if (carnetGuardado) {
      setCarnet(carnetGuardado)
      supabase
        .from('personal')
        .select('*')
        .eq('carnet', carnetGuardado)
        .eq('estado', true)
        .single()
        .then(({ data }) => {
          if (data) setUsuario(data)
        })
    }
  }, [])

  const handleLogin = async () => {
    const { data, error } = await supabase
      .from('personal')
      .select('*')
      .eq('carnet', carnet)
      .eq('estado', true)
      .single()

    if (error || !data) {
      setError('Carnet no encontrado o usuario inactivo')
      setUsuario(null)
    } else {
      setError('')
      setUsuario(data)
      setShowLogin(false)
      localStorage.setItem('carnet', carnet)
    }
  }

  const handleCerrarSesion = () => {
    setUsuario(null)
    setCarnet('')
    setShowLogin(false)
    localStorage.removeItem('carnet')
  }

  return (
    <div style={{ fontFamily: 'Arial, sans-serif' }}>

      {/* NAVBAR */}
      <nav style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '15px 40px',
        backgroundColor: '#222',
        color: 'white',
        position: 'fixed',
        top: 0,
        width: '100%',
        zIndex: 1000,
        boxSizing: 'border-box'
      }}>
        <div style={{ fontWeight: 'bold', fontSize: '20px' }}>Muebles is Better</div>

        {/* MENU */}
        <div style={{ display: 'flex', gap: '30px' }}>
          <a href="#productos" style={{ color: 'white', textDecoration: 'none' }}>Productos</a>
          <a href="#mision" style={{ color: 'white', textDecoration: 'none' }}>Mision y Vision</a>
          <a href="#ubicacion" style={{ color: 'white', textDecoration: 'none' }}>Ubicacion</a>
          <a href="/cotizador" style={{ color: 'white', textDecoration: 'none' }}>Cotizador</a>
        </div>

        {/* BOTON LOGIN */}
        <div style={{ position: 'relative' }}>
          {usuario ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ color: '#2c6d2e', fontWeight: 'bold' }}>
                {usuario.nombre} 👤
              </span>
              <a
                href="/perfil"
                style={{
                  backgroundColor: '#087e0b',
                  color: 'white',
                  padding: '5px 14px',
                  borderRadius: '20px',
                  fontSize: '12px',
                  textDecoration: 'none',
                  cursor: 'pointer'
                }}
              >
                Mi Perfil
              </a>
              <button
                onClick={handleCerrarSesion}
                style={{
                  backgroundColor: 'white',
                  color: '#ff4444',
                  border: '1px solid #ff4444',
                  padding: '5px 12px',
                  borderRadius: '20px',
                  cursor: 'pointer',
                  fontSize: '12px'
                }}
              >
                Cerrar Sesion
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowLogin(!showLogin)}
              style={{
                backgroundColor: '#087e0b',
                color: 'white',
                border: 'none',
                padding: '8px 20px',
                borderRadius: '20px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              Iniciar Sesion
            </button>
          )}

          {/* CAJA LOGIN */}
          {showLogin && (
            <div style={{
              position: 'absolute',
              right: 0,
              top: '45px',
              backgroundColor: 'white',
              padding: '25px',
              borderRadius: '12px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
              width: '280px',
              color: '#333'
            }}>
              <h3 style={{ marginBottom: '5px' }}>Bienvenido</h3>
              <p style={{ fontSize: '13px', color: '#666', marginBottom: '15px' }}>Ingrese su codigo de acceso</p>
              <input
                type="password"
                placeholder="Codigo de acceso"
                value={carnet}
                onChange={(e) => setCarnet(e.target.value)}
                style={{
                  padding: '10px',
                  width: '100%',
                  borderRadius: '8px',
                  border: '1px solid #ccc',
                  marginBottom: '10px',
                  boxSizing: 'border-box',
                  fontSize: '14px'
                }}
              />
              <button
                onClick={handleLogin}
                style={{
                  width: '100%',
                  padding: '10px',
                  backgroundColor: '#201717',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                Ingresar
              </button>
              {error && (
                <p style={{ color: 'red', marginTop: '10px', fontSize: '13px' }}>{error}</p>
              )}
            </div>
          )}
        </div>
      </nav>


      {/* IMAGEN PORTADA */}
      <div style={{ paddingTop: '60px' }}>
        <img
          src="/portada.jpeg"
          alt="Muebles is Better"
          style={{ width: '100%', height: '500px', objectFit: 'cover' }}
        />
      </div>

      {/* PRODUCTOS */}
      <div id="productos" style={{ padding: '60px 40px', backgroundColor: '#f9f9f9', textAlign: 'center' }}>
        <h2>Nuestros Productos</h2>
        <p>Aqui iran los productos proximamente.</p>
      </div>

      {/* MISION Y VISION */}
      <div id="mision" style={{ padding: '60px 40px', textAlign: 'center' }}>
        <h2>Mision y Vision</h2>
        <p><strong>Mision:</strong> Ofrecer muebles de calidad a precios accesibles.</p>
        <p><strong>Vision:</strong> Ser la empresa lider en muebles de Bolivia.</p>
      </div>

      {/* UBICACION */}
      <div id="ubicacion" style={{ padding: '60px 40px', backgroundColor: '#f9f9f9', textAlign: 'center' }}>
        <h2 style={{ marginBottom: '10px' }}>Donde Encontrarnos</h2>
        <p style={{ color: '#666', marginBottom: '40px' }}>Visitanos en cualquiera de nuestras 4 sucursales</p>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: '24px',
          maxWidth: '1100px',
          margin: '0 auto 50px auto'
        }}>

          <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 2px 12px rgba(0,0,0,0.1)', textAlign: 'left' }}>
            <div style={{ fontSize: '28px', marginBottom: '8px' }}>📍</div>
            <h3 style={{ margin: '0 0 6px 0', color: '#222' }}>Sucursal El Alto</h3>
            <p style={{ color: '#666', fontSize: '14px', margin: '0 0 16px 0' }}>C. L. de la Vega 3623, El Alto</p>
            <a href="https://maps.app.goo.gl/S6gJuAURM7S2WEzu5" target="_blank" rel="noopener noreferrer"
              style={{ display: 'inline-block', backgroundColor: '#087e0b', color: 'white', padding: '8px 18px', borderRadius: '20px', textDecoration: 'none', fontSize: '13px' }}>
              Ver en Google Maps
            </a>
          </div>

          <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 2px 12px rgba(0,0,0,0.1)', textAlign: 'left' }}>
            <div style={{ fontSize: '28px', marginBottom: '8px' }}>📍</div>
            <h3 style={{ margin: '0 0 6px 0', color: '#222' }}>Sucursal La Paz</h3>
            <p style={{ color: '#666', fontSize: '14px', margin: '0 0 16px 0' }}>Zona Bella Vista, C. Ignacio Sanjines, La Paz</p>
            <a href="https://maps.app.goo.gl/tA2KuW5a2yU66USm7" target="_blank" rel="noopener noreferrer"
              style={{ display: 'inline-block', backgroundColor: '#087e0b', color: 'white', padding: '8px 18px', borderRadius: '20px', textDecoration: 'none', fontSize: '13px' }}>
              Ver en Google Maps
            </a>
          </div>

          <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 2px 12px rgba(0,0,0,0.1)', textAlign: 'left' }}>
            <div style={{ fontSize: '28px', marginBottom: '8px' }}>📍</div>
            <h3 style={{ margin: '0 0 6px 0', color: '#222' }}>Sucursal Santa Cruz</h3>
            <p style={{ color: '#666', fontSize: '14px', margin: '0 0 16px 0' }}>Av. Napoleon Gomez Landivar, Radial 21, Santa Cruz</p>
            <a href="https://maps.app.goo.gl/f9xnUphWpvmgmLxv5" target="_blank" rel="noopener noreferrer"
              style={{ display: 'inline-block', backgroundColor: '#087e0b', color: 'white', padding: '8px 18px', borderRadius: '20px', textDecoration: 'none', fontSize: '13px' }}>
              Ver en Google Maps
            </a>
          </div>

          <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 2px 12px rgba(0,0,0,0.1)', textAlign: 'left' }}>
            <div style={{ fontSize: '28px', marginBottom: '8px' }}>📍</div>
            <h3 style={{ margin: '0 0 6px 0', color: '#222' }}>Sucursal Cochabamba</h3>
            <p style={{ color: '#666', fontSize: '14px', margin: '0 0 16px 0' }}>Av. Segunda Circunvalacion, Cochabamba</p>
            <a href="https://maps.app.goo.gl/WoCYUfsSXSPRB7Vc9" target="_blank" rel="noopener noreferrer"
              style={{ display: 'inline-block', backgroundColor: '#087e0b', color: 'white', padding: '8px 18px', borderRadius: '20px', textDecoration: 'none', fontSize: '13px' }}>
              Ver en Google Maps
            </a>
          </div>

        </div>
      </div>

    </div>
  )
}
