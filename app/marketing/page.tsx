'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

export default function AdminPromo() {
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const [config, setConfig] = useState({
    id: null,
    imagen_url: '',
    activa: false
  })

  // Cargar la configuración actual al montar el componente
  useEffect(() => {
    const fetchConfig = async () => {
      const { data, error } = await supabase
        .from('portada_config')
        .select('*')
        .order('id', { ascending: true })
        .limit(1)
        .single()
      
      if (data) {
        setConfig(data)
      } else if (error) {
        console.error("Error cargando configuración:", error.message)
      }
    }
    fetchConfig()
  }, [])

  // Función para gestionar la subida de la imagen
  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      setUploading(true)
      setMensaje('')
      
      const file = event.target.files?.[0]
      if (!file) return

      // Generar un nombre único para el archivo
      const fileExt = file.name.split('.').pop()
      const fileName = `promo_${Date.now()}.${fileExt}`
      const filePath = `banner/${fileName}`

      // 1. Subir al bucket 'promociones' (asegúrate de que exista en Supabase Storage)
      const { error: uploadError } = await supabase.storage
        .from('promociones')
        .upload(filePath, file)

      if (uploadError) throw uploadError

      // 2. Obtener la URL pública del archivo subido
      const { data: { publicUrl } } = supabase.storage
        .from('promociones')
        .getPublicUrl(filePath)

      setConfig(prev => ({ ...prev, imagen_url: publicUrl }))
      setMensaje('Imagen cargada con éxito.')
    } catch (error: any) {
      setMensaje('Error al subir: ' + error.message)
    } finally {
      setUploading(false)
    }
  }

  // Guardar los cambios en la base de datos
  const handleGuardar = async () => {
    if (!config.imagen_url) {
      setMensaje('Por favor, sube una imagen primero.')
      return
    }

    setLoading(true)
    setMensaje('')
    
    const { error } = await supabase
      .from('portada_config')
      .update({
        imagen_url: config.imagen_url,
        link_destino: '/promociones', // Ruta fija solicitada
        activa: config.activa,
        updated_at: new Date().toISOString()
      })
      .eq('id', config.id || 1) // Usamos el ID cargado o el 1 por defecto

    if (error) {
      setMensaje('Error al actualizar: ' + error.message)
    } else {
      setMensaje('¡Portada actualizada correctamente!')
    }
    setLoading(false)
  }

  return (
    <div className="admin-container">
      <style>{`
        .admin-container {
          min-height: 100vh;
          background: #0f1117;
          color: white;
          font-family: 'Inter', sans-serif;
          display: flex;
          justify-content: center;
          align-items: center;
          padding: 20px;
        }
        .admin-card {
          background: #1a1b2e;
          padding: 30px;
          border-radius: 12px;
          border: 1px solid #FFD700;
          width: 100%;
          max-width: 450px;
          box-shadow: 0 15px 35px rgba(0,0,0,0.4);
        }
        h1 { color: #FFD700; font-size: 20px; margin-bottom: 24px; text-align: center; }
        .field { margin-bottom: 20px; }
        label { display: block; margin-bottom: 8px; font-size: 14px; color: #a1a1aa; }
        
        /* Estilo del botón de subir */
        .upload-wrapper {
          border: 2px dashed #3f3f46;
          border-radius: 8px;
          padding: 20px;
          text-align: center;
          background: #111122;
          transition: border-color 0.2s;
        }
        .upload-wrapper:hover { border-color: #FFD700; }
        
        .custom-file-upload {
          background: #3f3f46;
          color: white;
          padding: 8px 16px;
          border-radius: 5px;
          cursor: pointer;
          font-size: 14px;
          display: inline-block;
        }
        .custom-file-upload:hover { background: #52525b; }

        .preview-img {
          margin-top: 15px;
          width: 100%;
          border-radius: 6px;
          border: 1px solid #3f3f46;
        }

        .checkbox-group {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px;
          background: #111122;
          border-radius: 8px;
          cursor: pointer;
        }

        .btn-save {
          width: 100%;
          padding: 14px;
          background: #FFD700;
          color: #000;
          border: none;
          border-radius: 8px;
          font-weight: bold;
          font-size: 16px;
          cursor: pointer;
          transition: 0.2s;
        }
        .btn-save:hover { background: #ffea70; }
        .btn-save:disabled { background: #71717a; cursor: not-allowed; }

        .msg { margin-top: 15px; text-align: center; font-size: 14px; color: #FFD700; }
        .route-badge {
          font-family: monospace;
          background: #000;
          padding: 4px 8px;
          border-radius: 4px;
          color: #FFD700;
          font-size: 12px;
        }
      `}</style>

      <div className="admin-card">
        <h1>Diseño de Portada</h1>
        
        <div className="field">
          <label>Imagen publicitaria</label>
          <div className="upload-wrapper">
            <label className="custom-file-upload">
              <input type="file" style={{display: 'none'}} accept="image/*" onChange={handleUpload} />
              {uploading ? 'Subiendo...' : '📁 Seleccionar Imagen'}
            </label>
            {config.imagen_url && (
              <img src={config.imagen_url} className="preview-img" alt="Vista previa" />
            )}
          </div>
        </div>

        <div className="field">
          <label>Página de destino</label>
          <span className="route-badge">/promociones</span>
          <p style={{fontSize: '11px', color: '#71717a', marginTop: '5px'}}>
            * El usuario será redirigido automáticamente a la sección de promociones.
          </p>
        </div>

        <div className="field">
          <label className="checkbox-group">
            <input 
              type="checkbox" 
              checked={config.activa} 
              onChange={e => setConfig({...config, activa: e.target.checked})}
            />
            ¿Publicar anuncio ahora?
          </label>
        </div>

        <button 
          className="btn-save" 
          onClick={handleGuardar} 
          disabled={loading || uploading}
        >
          {loading ? 'Guardando...' : 'Actualizar Portada'}
        </button>

        {mensaje && <p className="msg">{mensaje}</p>}
        
        <div style={{marginTop: '20px', textDecoration: 'none', textAlign: 'center'}}>
          <a href="/" style={{color: '#71717a', fontSize: '12px'}}>Volver al inicio</a>
        </div>
      </div>
    </div>
  )
}