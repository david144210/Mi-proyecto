'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'

export default function RegistrarGastosGenerales() {
  const [usuario, setUsuario] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [mensaje, setMensaje] = useState({ tipo: '', texto: '' })

  // Estados del Formulario
  const [monto, setMonto] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [categoriaId, setCategoriaId] = useState('')

  // Tus categorías fijas configuradas en el Trigger
  const categoriasFijas = [
    { id: 5, nombre: 'Alquileres / Arriendos' },
    { id: 1, nombre: 'Luz y Agua (Servicios Básicos)' },
    { id: 6, nombre: 'Internet y Telecomunicaciones' },
    { id: 7, nombre: 'Impuestos y Patentes' },
    { id: 2, nombre: 'Mantenimiento General' },
  ]

  useEffect(() => {
    const carnetGuardado = localStorage.getItem('carnet')
    if (!carnetGuardado) { window.location.replace('/'); return }

    supabase.from('personal').select('*, cargos(*)')
      .eq('carnet', carnetGuardado)
      .eq('estado', true)
      .single()
      .then(({ data }) => {
        // Validación: Solo permitir si es Admin
        if (!data || data.cargos?.es_admin !== true) {
          window.location.replace('/sistema')
        } else {
          setUsuario(data)
          setLoading(false)
        }
      })
  }, [])

  const handleGuardarGasto = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!monto || !descripcion || !categoriaId) {
      setMensaje({ tipo: 'error', texto: 'Por favor, completa todos los campos.' })
      return
    }

    setEnviando(true)
    setMensaje({ tipo: '', texto: '' })

    const { error } = await supabase.from('gastos_caja').insert({
      monto: parseFloat(monto),
      descripcion: descripcion,
      categoria_id: parseInt(categoriaId),
      sucursal_id: usuario.sucursal_id || 1, // Tu sucursal asignada o la central
      estado: 'aprobado', // Se inserta aprobado directamente para activar el Trigger contable
      registrado_por: usuario.id,
      aprobado_por: usuario.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })

    setEnviando(false)

    if (error) {
      setMensaje({ tipo: 'error', texto: 'Error al registrar: ' + error.message })
    } else {
      setMensaje({ tipo: 'exito', texto: '¡Gasto registrado y contabilizado con éxito!' })
      setMonto('')
      setDescripcion('')
      setCategoriaId('')
    }
  }

  if (loading) return <p style={{ textAlign: 'center', marginTop: '100px', fontFamily: 'Arial' }}>Verificando permisos de seguridad...</p>

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', minHeight: '100vh', backgroundColor: '#f5f5f5' }}>
      {/* Navbar idéntica a tu diseño */}
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 20px', backgroundColor: '#222', color: 'white', boxSizing: 'border-box' }}>
        <a href="/sistema" style={{ fontWeight: 'bold', fontSize: '20px', color: 'white', textDecoration: 'none' }}>Muebles is Better</a>
        <span style={{ color: '#a3c47d', fontWeight: 'bold', fontSize: '14px' }}>Gastos de Gerencia</span>
        <a href="/contabilidad" style={{ backgroundColor: 'transparent', color: '#ccc', border: '1px solid #ccc', padding: '5px 12px', borderRadius: '20px', fontSize: '12px', textDecoration: 'none' }}>Volver</a>
      </nav>

      <div style={{ padding: '20px', maxWidth: '500px', margin: '40px auto', boxSizing: 'border-box' }}>
        <div style={{ backgroundColor: 'white', borderRadius: '16px', padding: '30px', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
          <h2 style={{ margin: '0 0 10px 0', fontSize: '22px', color: '#222', textAlign: 'center' }}>Registrar Gasto Fijo 🏢</h2>
          <p style={{ margin: '0 0 25px 0', fontSize: '14px', color: '#666', textAlign: 'center' }}>
            Los gastos ingresados aquí afectarán directamente al Banco Central y se registrarán de forma privada en la contabilidad.
          </p>

          {mensaje.texto && (
            <div style={{ padding: '12px', borderRadius: '8px', marginBottom: '20px', fontSize: '14px', fontWeight: 'bold', backgroundColor: mensaje.tipo === 'exito' ? '#e8f5e9' : '#ffebee', color: mensaje.tipo === 'exito' ? '#2e7d32' : '#c62828', textAlign: 'center' }}>
              {mensaje.texto}
            </div>
          )}

          <form onSubmit={handleGuardarGasto} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            {/* Tipo de Gasto */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '14px', fontWeight: 'bold', color: '#444' }}>Tipo de Gasto:</label>
              <select
                value={categoriaId}
                onChange={(e) => setCategoriaId(e.target.value)}
                style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '15px', backgroundColor: '#fff', boxSizing: 'border-box' }}
              >
                <option value="">-- Selecciona una categoría --</option>
                {categoriasFijas.map((cat: { id: number; nombre: string }) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.nombre}
                  </option>
                ))}
              </select>
            </div>

            {/* Monto */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '14px', fontWeight: 'bold', color: '#444' }}>Monto ($):</label>
              <input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '15px', boxSizing: 'border-box' }}
              />
            </div>

            {/* Descripción */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '14px', fontWeight: 'bold', color: '#444' }}>Descripción / Glosa:</label>
              <textarea
                rows={3}
                placeholder="Ej: Pago de alquiler del local central correspondiente al mes de..."
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '15px', fontFamily: 'Arial', boxSizing: 'border-box', resize: 'vertical' }}
              />
            </div>

            {/* Botón de Enviar */}
            <button
              type="submit"
              disabled={enviando}
              style={{ width: '100%', padding: '14px', borderRadius: '8px', border: 'none', backgroundColor: '#222', color: 'white', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', transition: 'background-color 0.2s', marginTop: '10px', boxShadow: '0 2px 5px rgba(0,0,0,0.2)' }}
            >
              {enviando ? 'Guardando...' : 'Registrar Gasto'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}