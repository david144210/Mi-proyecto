'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

interface Proveedor {
  id: number
  nombre: string
  nit: string
  telefono: string
  email: string
  direccion: string
  categoria: string
}

export default function GestorProveedores() {
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [loading, setLoading] = useState(true)
  const [guardando, setGuardando] = useState(false)

  // Estados del formulario
  const [nombre, setNombre] = useState('')
  const [nit, setNit] = useState('')
  const [telefono, setTelefono] = useState('')
  const [email, setEmail] = useState('')
  const [direccion, setDireccion] = useState('')
  const [categoria, setCategoria] = useState('Melamina y Tableros')

  const [busqueda, setBusqueda] = useState('')

  useEffect(() => {
    cargarProveedores()
  }, [])

  const cargarProveedores = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('proveedores')
      .select('*')
      .order('nombre', { ascending: true })

    if (error) {
      console.error('Error cargando proveedores:', error)
    } else {
      setProveedores(data || [])
    }
    setLoading(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nombre.trim()) {
      alert('El nombre o razón social del proveedor es obligatorio.')
      return
    }

    setGuardando(true)
    const { error } = await supabase.from('proveedores').insert([
      {
        nombre,
        nit,
        telefono,
        email,
        direccion,
        categoria
      }
    ])

    if (error) {
      console.error('Error al guardar proveedor:', error)
      alert('Hubo un error al registrar el proveedor.')
    } else {
      // Limpiar formulario
      setNombre('')
      setNit('')
      setTelefono('')
      setEmail('')
      setDireccion('')
      setCategoria('Melamina y Tableros')
      cargarProveedores()
    }
    setGuardando(false)
  }

  const eliminarProveedor = async (id: number) => {
    if (!confirm('¿Estás seguro de eliminar este proveedor?')) return

    const { error } = await supabase.from('proveedores').delete().eq('id', id)
    if (error) {
      console.error('Error eliminando proveedor:', error)
      alert('No se pudo eliminar el proveedor.')
    } else {
      cargarProveedores()
    }
  }

  const proveedoresFiltrados = proveedores.filter(p =>
    p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
    (p.nit && p.nit.includes(busqueda)) ||
    (p.categoria && p.categoria.toLowerCase().includes(busqueda.toLowerCase()))
  )

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f5f5f5', fontFamily: 'Arial, sans-serif' }}>
      
      {/* NAVBAR */}
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 40px', backgroundColor: '#222', color: 'white' }}>
        <a href="/sistema" style={{ color: 'white', textDecoration: 'none', fontWeight: 'bold' }}>← Sistema</a>
        <span style={{ color: '#C5A059', fontWeight: 'bold', fontSize: '16px' }}>Gestión de Proveedores</span>
        <span>MuebLess is Better 🪑</span>
      </nav>

      <div style={{ padding: '30px', maxWidth: '1400px', margin: '0 auto', display: 'flex', gap: '30px', flexWrap: 'wrap' }}>
        
        {/* COLUMNA IZQUIERDA: Formulario de Registro */}
        <div style={{ flex: '1', minWidth: '320px', backgroundColor: 'white', borderRadius: '12px', padding: '25px', boxShadow: '0 2px 12px rgba(0,0,0,0.05)', height: 'fit-content' }}>
          <h2 style={{ fontSize: '18px', color: '#0B1E36', borderBottom: '2px solid #C5A059', paddingBottom: '10px', marginBottom: '20px' }}>
            Registrar Nuevo Proveedor
          </h2>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#333', marginBottom: '5px' }}>Nombre / Razón Social *</label>
              <input 
                type="text" 
                value={nombre} 
                onChange={(e) => setNombre(e.target.value)} 
                placeholder="Ej. Melaminas del Sur S.R.L."
                style={{ width: '100%', padding: '10px', border: '1px solid #ccc', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }}
                required 
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#333', marginBottom: '5px' }}>NIT / Cédula de Identidad</label>
              <input 
                type="text" 
                value={nit} 
                onChange={(e) => setNit(e.target.value)} 
                placeholder="Ej. 1029384756"
                style={{ width: '100%', padding: '10px', border: '1px solid #ccc', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#333', marginBottom: '5px' }}>Teléfono / Celular</label>
                <input 
                  type="text" 
                  value={telefono} 
                  onChange={(e) => setTelefono(e.target.value)} 
                  placeholder="Ej. 70123456"
                  style={{ width: '100%', padding: '10px', border: '1px solid #ccc', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#333', marginBottom: '5px' }}>Categoría Principal</label>
                <select 
                  value={categoria} 
                  onChange={(e) => setCategoria(e.target.value)}
                  style={{ width: '100%', padding: '10px', border: '1px solid #ccc', borderRadius: '6px', fontSize: '13px', backgroundColor: 'white', boxSizing: 'border-box' }}
                >
                  <option value="Melamina y Tableros">Melamina y Tableros</option>
                  <option value="Aceros y Tubos">Aceros y Tubos</option>
                  <option value="Accesorios y Herrajes">Accesorios y Herrajes</option>
                  <option value="Insumos y Químicos">Insumos y Químicos</option>
                  <option value="Varios / General">Varios / General</option>
                </select>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#333', marginBottom: '5px' }}>Correo Electrónico</label>
              <input 
                type="email" 
                value={email} 
                onChange={(e) => setEmail(e.target.value)} 
                placeholder="contacto@proveedor.com"
                style={{ width: '100%', padding: '10px', border: '1px solid #ccc', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#333', marginBottom: '5px' }}>Dirección / Ubicación</label>
              <input 
                type="text" 
                value={direccion} 
                onChange={(e) => setDireccion(e.target.value)} 
                placeholder="Ej. Av. 6 de Marzo #123"
                style={{ width: '100%', padding: '10px', border: '1px solid #ccc', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }}
              />
            </div>

            <button 
              type="submit" 
              disabled={guardando}
              style={{ 
                backgroundColor: '#0B1E36', 
                color: '#C5A059', 
                border: 'none', 
                padding: '12px', 
                borderRadius: '6px', 
                fontWeight: 'bold', 
                cursor: 'pointer', 
                marginTop: '10px',
                fontSize: '14px' 
              }}
            >
              {guardando ? 'Guardando...' : '+ Guardar Proveedor'}
            </button>
          </form>
        </div>

        {/* COLUMNA DERECHA: Listado y Buscador */}
        <div style={{ flex: '2', minWidth: '400px', backgroundColor: 'white', borderRadius: '12px', padding: '25px', boxShadow: '0 2px 12px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #C5A059', paddingBottom: '10px', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
            <h2 style={{ fontSize: '18px', color: '#0B1E36', margin: 0 }}>Directorio de Proveedores ({proveedores.length})</h2>
            <input 
              type="text" 
              placeholder="Buscar por nombre, NIT o categoría..." 
              value={busqueda} 
              onChange={(e) => setBusqueda(e.target.value)}
              style={{ padding: '8px 12px', border: '1px solid #ccc', borderRadius: '6px', fontSize: '13px', width: '250px' }}
            />
          </div>

          {loading && <p style={{ color: '#666' }}>Cargando proveedores...</p>}
          
          {!loading && proveedoresFiltrados.length === 0 && (
            <p style={{ color: '#888', fontStyle: 'italic', textAlign: 'center', padding: '40px' }}>No se encontraron proveedores registrados.</p>
          )}

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ backgroundColor: '#f1f5f9', color: '#0B1E36' }}>
                  <th style={{ padding: '10px', textAlign: 'left' }}>Proveedor / Razón Social</th>
                  <th style={{ padding: '10px', textAlign: 'left' }}>NIT</th>
                  <th style={{ padding: '10px', textAlign: 'left' }}>Contacto</th>
                  <th style={{ padding: '10px', textAlign: 'left' }}>Categoría</th>
                  <th style={{ padding: '10px', textAlign: 'center' }}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {proveedoresFiltrados.map((prov) => (
                  <tr key={prov.id} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '10px' }}>
                      <strong style={{ fontSize: '13px', color: '#0B1E36' }}>{prov.nombre}</strong><br/>
                      <span style={{ color: '#555' }}>{prov.direccion || 'Sin dirección'}</span>
                    </td>
                    <td style={{ padding: '10px' }}>{prov.nit || 'S/N'}</td>
                    <td style={{ padding: '10px' }}>
                      📱 {prov.telefono || 'Sin teléfono'}<br/>
                      ✉️ {prov.email || 'Sin email'}
                    </td>
                    <td style={{ padding: '10px' }}>
                      <span style={{ backgroundColor: '#e2e8f0', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', color: '#1e293b', fontWeight: 'bold' }}>
                        {prov.categoria}
                      </span>
                    </td>
                    <td style={{ padding: '10px', textAlign: 'center' }}>
                      <button 
                        onClick={() => eliminarProveedor(prov.id)} 
                        style={{ background: 'none', border: 'none', color: '#ef4444', fontWeight: 'bold', cursor: 'pointer', fontSize: '14px' }}
                        title="Eliminar proveedor"
                      >
                        🗑️
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  )
}