'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

export default function Promociones() {
  const [promociones, setPromociones] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [slideActual, setSlideActual] = useState(0)

  useEffect(() => {
    supabase.from('promociones')
      .select('*')
      .eq('activa', true)
      .order('orden', { ascending: true })
      .then(({ data }) => {
        setPromociones(data || [])
        setLoading(false)
      })
  }, [])

  // Auto-avance cada 6 segundos
  useEffect(() => {
    if (promociones.length <= 1) return
    const timer = setInterval(() => {
      setSlideActual(prev => (prev + 1) % promociones.length)
    }, 6000)
    return () => clearInterval(timer)
  }, [promociones])

  if (loading) return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0f0f0f', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: 'white', fontSize: '16px', fontFamily: 'sans-serif' }}>Cargando...</div>
    </div>
  )

  if (promociones.length === 0) return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0f0f0f', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '20px' }}>
      <p style={{ color: '#888', fontFamily: 'sans-serif', fontSize: '18px' }}>No hay promociones activas por ahora.</p>
      <a href="/" style={{ color: '#a3c47d', fontFamily: 'sans-serif', fontSize: '14px', textDecoration: 'none' }}>← Volver a la web</a>
    </div>
  )

  const promo = promociones[slideActual]

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0f0f0f', fontFamily: 'sans-serif', color: 'white' }}>

      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .slide-dot { width: 8px; height: 8px; border-radius: 50%; border: none; cursor: pointer; transition: all 0.3s; }
        .slide-dot.activo { background: #a3c47d; transform: scale(1.3); }
        .slide-dot.inactivo { background: #555; }
        .red-btn { display: flex; align-items: center; gap: 10px; padding: 12px 20px; border-radius: 30px; text-decoration: none; font-size: 15px; font-weight: 600; transition: transform 0.2s, opacity 0.2s; }
        .red-btn:hover { transform: translateY(-2px); opacity: 0.9; }
        .nav-arrow { background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); color: white; width: 44px; height: 44px; border-radius: 50%; cursor: pointer; font-size: 18px; display: flex; align-items: center; justify-content: center; transition: background 0.2s; }
        .nav-arrow:hover { background: rgba(255,255,255,0.2); }
        @media (max-width: 768px) {
          .promo-grid { flex-direction: column !important; }
          .promo-media { width: 100% !important; max-height: 300px !important; }
          .promo-content { padding: 24px 20px !important; }
          .redes-grid { flex-direction: column !important; }
        }
      `}</style>

      {/* NAVBAR */}
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 32px', backgroundColor: '#1a1a1a', borderBottom: '1px solid #222' }}>
        <a href="/" style={{ color: 'white', textDecoration: 'none', fontWeight: 'bold', fontSize: '18px' }}>
          Muebles is Better
        </a>
        <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
          <a href="/" style={{ color: '#888', textDecoration: 'none', fontSize: '14px' }}>Inicio</a>
          <a href="/#productos" style={{ color: '#888', textDecoration: 'none', fontSize: '14px' }}>Productos</a>
          <a href="/#ubicacion" style={{ color: '#888', textDecoration: 'none', fontSize: '14px' }}>Tiendas</a>
        </div>
      </nav>

      {/* HERO — Slide actual */}
      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '40px 24px' }}>

        {/* Indicador */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
          <p style={{ color: '#a3c47d', fontSize: '13px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '1px' }}>
            Promociones {slideActual + 1} / {promociones.length}
          </p>
          {promociones.length > 1 && (
            <div style={{ display: 'flex', gap: '8px' }}>
              {promociones.map((_, i) => (
                <button key={i} className={`slide-dot ${i === slideActual ? 'activo' : 'inactivo'}`}
                  onClick={() => setSlideActual(i)} />
              ))}
            </div>
          )}
        </div>

        {/* Slide */}
        <div className="promo-grid" style={{ display: 'flex', gap: '0', backgroundColor: '#1a1a1a', borderRadius: '20px', overflow: 'hidden', border: '1px solid #2a2a2a', minHeight: '400px' }}>

          {/* Media: imagen o video */}
{(promo.imagen_url || promo.video_url) && (
  <div className="promo-media" style={{ 
    width: '100%',           // En móvil ocupará el ancho total
    maxWidth: '500px',       // Ajusta según tu diseño para escritorio
    position: 'relative', 
    backgroundColor: '#111', 
    flexShrink: 0,
    aspectRatio: '16/9',     // Mantiene una proporción constante
    overflow: 'hidden'
  }}>
    {promo.video_url ? (
      <video
        src={promo.video_url}
        autoPlay
        loop
        playsInline
        controls              // Agregamos controles para que el usuario suba el volumen
        muted                 // Mantener muted para que el autoPlay no sea bloqueado
        style={{ 
          width: '100%', 
          height: '100%', 
          objectFit: 'contain', // 'contain' evita que se corte el video en pantallas pequeñas
          display: 'block' 
        }}
      />
    ) : (
      <img
        src={promo.imagen_url}
        alt={promo.titulo || 'Promoción'}
        style={{ 
          width: '100%', 
          height: '100%', 
          objectFit: 'cover', 
          display: 'block' 
        }}
      />
    )}
  </div>
)}

          {/* Contenido */}
          <div className="promo-content" style={{ flex: 1, padding: '40px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '20px' }}>

            {promo.titulo && (
              <h1 style={{ fontSize: '28px', fontWeight: '800', lineHeight: '1.2', color: 'white' }}>
                {promo.titulo}
              </h1>
            )}

            {promo.descripcion && (
              <p style={{ fontSize: '16px', color: '#aaa', lineHeight: '1.7', whiteSpace: 'pre-wrap' }}>
                {promo.descripcion}
              </p>
            )}

            {/* Redes sociales */}
            {(promo.link_whatsapp || promo.link_facebook || promo.link_tiktok) && (
              <div className="redes-grid" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '8px' }}>
                {promo.link_whatsapp && (
                  <a href={promo.link_whatsapp} target="_blank" rel="noopener noreferrer"
                    className="red-btn" style={{ backgroundColor: '#25D366', color: 'white' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                    </svg>
                    WhatsApp
                  </a>
                )}
                {promo.link_facebook && (
                  <a href={promo.link_facebook} target="_blank" rel="noopener noreferrer"
                    className="red-btn" style={{ backgroundColor: '#1877F2', color: 'white' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                    </svg>
                    Facebook
                  </a>
                )}
                {promo.link_tiktok && (
                  <a href={promo.link_tiktok} target="_blank" rel="noopener noreferrer"
                    className="red-btn" style={{ backgroundColor: '#010101', color: 'white', border: '1px solid #333' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.79 1.53V6.77a4.85 4.85 0 01-1.02-.08z"/>
                    </svg>
                    TikTok
                  </a>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Navegación entre slides */}
        {promociones.length > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', marginTop: '24px' }}>
            <button className="nav-arrow" onClick={() => setSlideActual(prev => (prev - 1 + promociones.length) % promociones.length)}>←</button>
            <button className="nav-arrow" onClick={() => setSlideActual(prev => (prev + 1) % promociones.length)}>→</button>
          </div>
        )}

        {/* Miniaturas */}
        {promociones.length > 1 && (
          <div style={{ display: 'flex', gap: '12px', marginTop: '24px', overflowX: 'auto', paddingBottom: '8px' }}>
            {promociones.map((p, i) => (
              <button key={p.id} onClick={() => setSlideActual(i)}
                style={{ flexShrink: 0, width: '80px', height: '60px', borderRadius: '10px', overflow: 'hidden', border: `2px solid ${i === slideActual ? '#a3c47d' : '#333'}`, cursor: 'pointer', backgroundColor: '#1a1a1a', padding: 0 }}>
                {p.imagen_url ? (
                  <img src={p.imagen_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555', fontSize: '20px' }}>
                    {p.video_url ? '▶' : '📄'}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}

      </div>

      {/* Footer */}
      <footer style={{ textAlign: 'center', padding: '24px', color: '#555', fontSize: '13px', borderTop: '1px solid #1a1a1a', marginTop: '40px' }}>
        <a href="/" style={{ color: '#a3c47d', textDecoration: 'none' }}>mueblessisbetter.com</a>
      </footer>
    </div>
  )
}
