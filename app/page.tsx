'use client'
import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Home() {
  const [carnet, setCarnet] = useState('')
  const [error, setError] = useState('')
  const [usuario, setUsuario] = useState(null)
  const [showLogin, setShowLogin] = useState(false)

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
    }
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
          <a href="#mision" style={{ color: 'white', textDecoration: 'none' }}>Misión y Visión</a>
          <a href="#ubicacion" style={{ color: 'white', textDecoration: 'none' }}>Ubicación</a>
        </div>

        {/* BOTON LOGIN */}
        <div style={{ position: 'relative' }}>
          {usuario ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span style={{ color: '#2c6d2e', fontWeight: 'bold' }}> {usuario.nombre}👤</span>
        <button
          onClick={() => { setUsuario(null); setCarnet(''); }}
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
      Cerrar Sesión
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
              Iniciar Sesión
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
              <p style={{ fontSize: '13px', color: '#666', marginBottom: '15px' }}>Ingrese su código de acceso</p>
              <input
                type="text"
                placeholder="Código de acceso"
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
              {error && <p style={{ color: 'red', marginTop: '10px', fontSize: '13px' }}>{error}</p>}
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
        <p>Aquí irán los productos próximamente.</p>
      </div>

      {/* MISION Y VISION */}
      <div id="mision" style={{ padding: '60px 40px', textAlign: 'center' }}>
        <h2>Misión y Visión</h2>
        <p><strong>Misión:</strong> Ofrecer muebles de calidad a precios accesibles.</p>
        <p><strong>Visión:</strong> Ser la empresa líder en muebles de Bolivia.</p>
      </div>

      {/* UBICACION */}
      <div id="ubicacion" style={{ padding: '60px 40px', backgroundColor: '#f9f9f9', textAlign: 'center' }}>
        <h2>¿Dónde Ubicarnos?</h2>
        <p>Aquí irá el mapa próximamente.</p>
      </div>

    </div>
  )
}