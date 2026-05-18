'use client'
import React, { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

export default function GestionAceros() {
  const [usuario, setUsuario] = useState<any>(null)
  const [esAdmin, setEsAdmin] = useState(false)
  const [puedeEditar, setPuredeEditar] = useState(false)
  const [loading, setLoading] = useState(true)

  // Datos
  const [aceros, setAceros] = useState<any[]>([])
  
  // Filtros y Paginación
  const [busqueda, setBusqueda] = useState('')
  const [pagina, setPagina] = useState(1)
  const POR_PAGINA = 15

  // Modales
  const [modalOpen, setModalOpen] = useState(false)
  const [aceroEditando, setAceroEditando] = useState<any>(null)

  // Campos del Formulario (Ajustados a tus columnas reales)
  const [formCodigo, setFormCodigo] = useState('')
  const [formDetalle, setFormDetalle] = useState('')
  const [formPrecioCompra, setFormPrecioCompra] = useState('')
  const [formPrecioCotizador, setFormPrecioCotizador] = useState('')
  const [formProveedor, setFormProveedor] = useState('')
  
  const [errorForm, setErrorForm] = useState('')
  const [exito, setExito] = useState('')
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    const carnetGuardado = localStorage.getItem('carnet')
    if (!carnetGuardado) { window.location.replace('/'); return }
    
    supabase.from('personal').select('*, cargos(*)')
      .eq('carnet', carnetGuardado).eq('estado', true).single()
      .then(({ data }) => {
        if (!data) { window.location.replace('/'); return }
        setUsuario(data)
        
        const admin = data.cargos?.es_admin === true
        const editar = data.cargos?.puede_editar_productos === true || admin
        
        setEsAdmin(admin)
        setPuredeEditar(editar)
        
        if (!admin && !editar) { window.location.replace('/sistema'); return }
        cargarAceros()
      })
  }, [])

  const cargarAceros = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('aceros')
      .select('*')
      .order('codigo_acero', { ascending: true })
    
    if (!error && data) setAceros(data)
    setLoading(false)
  }

  const abrirModalNuevo = () => {
    setAceroEditando(null)
    setFormCodigo('')
    setFormDetalle('')
    setFormPrecioCompra('')
    setFormPrecioCotizador('')
    setFormProveedor('')
    setErrorForm('')
    setExito('')
    setModalOpen(true)
  }

  const abrirModalEditar = (acero: any) => {
    setAceroEditando(acero)
    setFormCodigo(acero.codigo_acero || '')
    setFormDetalle(acero.detalle || '')
    setFormPrecioCompra(acero.precio_compra ? String(acero.precio_compra) : '')
    setFormPrecioCotizador(acero.precio_cotizador ? String(acero.precio_cotizador) : '')
    setFormProveedor(acero.proveedor || '')
    setErrorForm('')
    setExito('')
    setModalOpen(true)
  }

  const handleGuardar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formCodigo) {
      setErrorForm('El código de acero es obligatorio')
      return
    }

    setGuardando(true)
    setErrorForm('')
    
    // Mapeo estricto con conversión numérica para evitar strings vacíos "" o errores en columnas numeric(10,2)
    const datosAcero = {
      codigo_acero: formCodigo.trim().toUpperCase(),
      detalle: formDetalle.trim() || null,
      precio_compra: formPrecioCompra ? parseFloat(formPrecioCompra) : null,
      precio_cotizador: formPrecioCotizador ? parseFloat(formPrecioCotizador) : null,
      proveedor: formProveedor.trim() || null,
    }

    try {
      if (aceroEditando) {
        // Modificar registro existente
        const { error } = await supabase
          .from('aceros')
          .update(datosAcero)
          .eq('id', aceroEditando.id)

        if (error) throw error
        setExito('Acero actualizado correctamente')
      } else {
        // Insertar nuevo registro
        const { error } = await supabase
          .from('aceros')
          .insert([datosAcero])

        if (error) throw error
        setExito('Acero registrado correctamente')
      }

      setTimeout(() => {
        setModalOpen(false)
        cargarAceros()
      }, 1000)

    } catch (err: any) {
      setErrorForm('Error al procesar la operación: ' + err.message)
    } finally {
      setGuardando(false)
    }
  }

  const handleEliminar = async (acero: any) => {
    if (!confirm(`¿Estás seguro de eliminar el acero ${acero.codigo_acero}?`)) return
    
    const { error } = await supabase
      .from('aceros')
      .delete()
      .eq('id', acero.id)

    if (error) {
      alert('No se pudo eliminar el acero: ' + error.message)
    } else {
      cargarAceros()
    }
  }

  // Filtrado optimizado para tus columnas reales
  const acerosFiltrados = aceros.filter(a =>
    (a.codigo_acero || '').toLowerCase().includes(busqueda.toLowerCase()) ||
    (a.detalle || '').toLowerCase().includes(busqueda.toLowerCase()) ||
    (a.proveedor || '').toLowerCase().includes(busqueda.toLowerCase())
  )

  const totalPaginas = Math.ceil(acerosFiltrados.length / POR_PAGINA)
  const acerosPagina = acerosFiltrados.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA)

  const inputStyle: any = { padding: '10px 12px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '14px', width: '100%', boxSizing: 'border-box', backgroundColor: 'white' }
  const labelStyle: any = { fontSize: '13px', color: '#555', display: 'block', marginBottom: '4px', fontWeight: '500' }
  const thStyle: any = { padding: '12px 16px', textAlign: 'left', borderBottom: '2px solid #eee', color: '#555', whiteSpace: 'nowrap', fontSize: '13px' }
  const tdStyle = (i: number): any => ({ padding: '11px 16px', borderBottom: '1px solid #f0f0f0', backgroundColor: i % 2 === 0 ? 'white' : '#fafafa', fontSize: '14px' })

  if (loading && aceros.length === 0) return <p style={{ textAlign: 'center', marginTop: '100px', fontFamily: 'Arial' }}>Cargando aceros...</p>

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', minHeight: '100vh', backgroundColor: '#f5f5f5' }}>
      
      <style>{`
        @media (max-width: 768px) {
          .steel-container { padding: 80px 16px 40px 16px !important; }
          .steel-header { flex-direction: column !important; gap: 12px !important; align-items: flex-start !important; }
          .steel-col-extra { display: none !important; }
        }
      `}</style>

      {/* NAVBAR */}
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 40px', backgroundColor: '#222', color: 'white', position: 'fixed', top: 0, width: '100%', zIndex: 1000, boxSizing: 'border-box' }}>
        <a href="/" style={{ fontWeight: 'bold', fontSize: '20px', color: 'white', textDecoration: 'none' }}>Muebles is Better</a>
        <span style={{ color: '#a3c47d', fontWeight: 'bold' }}>Inventario — Aceros</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <a href="/sistema" style={{ color: '#a3c47d', fontSize: '14px', textDecoration: 'none' }}>← Sistema</a>
          <a href="/" onClick={() => localStorage.removeItem('carnet')} style={{ backgroundColor: 'transparent', color: '#ff6b6b', border: '1px solid #ff6b6b', padding: '5px 12px', borderRadius: '20px', fontSize: '12px', textDecoration: 'none' }}>Salir</a>
        </div>
      </nav>

      <div className="steel-container" style={{ padding: '100px 40px 60px 40px', maxWidth: '1100px', margin: '0 auto' }}>
        
        <div className="steel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div>
            <h1 style={{ margin: '0 0 4px 0', fontSize: '24px' }}>Control de Aceros</h1>
            <p style={{ margin: 0, color: '#666', fontSize: '14px' }}>{acerosFiltrados.length} tipos de aceros encontrados</p>
          </div>
          {puedeEditar && (
            <button onClick={abrirModalNuevo}
              style={{ padding: '10px 20px', backgroundColor: '#087e0b', color: 'white', border: 'none', borderRadius: '20px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
              + Agregar Acero
            </button>
          )}
        </div>

        <input type="text" placeholder="Buscar por código, detalle o proveedor..."
          value={busqueda} onChange={(e) => { setBusqueda(e.target.value); setPagina(1) }}
          style={{ padding: '12px 16px', borderRadius: '10px', border: '1px solid #ddd', fontSize: '14px', width: '100%', boxSizing: 'border-box', marginBottom: '16px', backgroundColor: 'white' }} />

        {/* TABLA PRINCIPAL */}
        <div style={{ backgroundColor: 'white', borderRadius: '16px', boxShadow: '0 2px 12px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f9f9f9' }}>
                  <th style={thStyle}>Código Acero</th>
                  <th style={thStyle}>Detalle / Descripción</th>
                  <th className="steel-col-extra" style={thStyle}>Proveedor</th>
                  <th className="steel-col-extra" style={{ ...thStyle, textAlign: 'right' }}>P. Compra</th>
                  <th className="steel-col-extra" style={{ ...thStyle, textAlign: 'right' }}>P. Cotizador</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {acerosPagina.length === 0 ? (
                  <tr><td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: '#bbb' }}>No hay registros de aceros</td></tr>
                ) : (
                  acerosPagina.map((a, i) => (
                    <tr key={a.id} style={{ backgroundColor: i % 2 === 0 ? 'white' : '#fafafa' }}>
                      <td style={{ ...tdStyle(i), fontWeight: 'bold', color: '#087e0b' }}>{a.codigo_acero}</td>
                      <td style={tdStyle(i)}>{a.detalle || '—'}</td>
                      <td className="steel-col-extra" style={tdStyle(i)}>{a.proveedor || '—'}</td>
                      <td className="steel-col-extra" style={{ ...tdStyle(i), textAlign: 'right', fontWeight: '500' }}>
                        {a.precio_compra ? `Bs. ${Number(a.precio_compra).toFixed(2)}` : '—'}
                      </td>
                      <td className="steel-col-extra" style={{ ...tdStyle(i), textAlign: 'right', fontWeight: 'bold', color: '#2e7d32' }}>
                        {a.precio_cotizador ? `Bs. ${Number(a.precio_cotizador).toFixed(2)}` : '—'}
                      </td>
                      <td style={{ ...tdStyle(i), textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                          {puedeEditar && (
                            <button onClick={() => abrirModalEditar(a)}
                              style={{ padding: '5px 12px', backgroundColor: '#eaf2ff', color: '#1a73e8', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '500' }}>
                              Editar
                            </button>
                          )}
                          {esAdmin && (
                            <button onClick={() => handleEliminar(a)}
                              style={{ padding: '5px 12px', backgroundColor: '#ffebee', color: '#c62828', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>
                              Eliminar
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* PAGINACIÓN */}
          {totalPaginas > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', padding: '16px', borderTop: '1px solid #f0f0f0' }}>
              <button onClick={() => setPagina(p => Math.max(1, p - 1))} disabled={pagina === 1}
                style={{ padding: '6px 14px', borderRadius: '8px', border: '1px solid #ddd', backgroundColor: pagina === 1 ? '#f5f5f5' : 'white', cursor: pagina === 1 ? 'not-allowed' : 'pointer', fontSize: '13px' }}>
                ← Anterior
              </button>
              <span style={{ fontSize: '13px', color: '#666' }}>Página {pagina} de {totalPaginas}</span>
              <button onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))} disabled={pagina === totalPaginas}
                style={{ padding: '6px 14px', borderRadius: '8px', border: '1px solid #ddd', backgroundColor: pagina === totalPaginas ? '#f5f5f5' : 'white', cursor: pagina === totalPaginas ? 'not-allowed' : 'pointer', fontSize: '13px' }}>
                Siguiente →
              </button>
            </div>
          )}
        </div>
      </div>

      {/* MODAL PARA AGREGAR / EDITAR */}
      {modalOpen && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', boxSizing: 'border-box' }}>
          <div style={{ backgroundColor: 'white', borderRadius: '16px', padding: '32px', width: '520px', maxWidth: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ margin: 0, fontSize: '20px' }}>{aceroEditando ? `Editar Acero ${aceroEditando.codigo_acero}` : 'Agregar Nuevo Acero'}</h2>
              <button onClick={() => setModalOpen(false)} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#999' }}>✕</button>
            </div>

            <form onSubmit={handleGuardar} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={labelStyle}>Código del Acero *</label>
                <input type="text" value={formCodigo} onChange={(e) => setFormCodigo(e.target.value)} style={inputStyle} placeholder="Ej: AC-TUB-01" disabled={!!aceroEditando} required />
              </div>

              <div>
                <label style={labelStyle}>Descripción / Detalle</label>
                <input type="text" value={formDetalle} onChange={(e) => setFormDetalle(e.target.value)} style={inputStyle} placeholder="Ej: Tubo rectangular de 40x20 e=1.5mm" />
              </div>

              <div>
                <label style={labelStyle}>Proveedor</label>
                <input type="text" value={formProveedor} onChange={(e) => setFormProveedor(e.target.value)} style={inputStyle} placeholder="Ej: Aceros Corp o Importadora X" />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>Precio Compra (Bs.)</label>
                  <input type="number" value={formPrecioCompra} onChange={(e) => setFormPrecioCompra(e.target.value)} style={inputStyle} placeholder="0.00" min="0" step="0.01" />
                </div>
                <div>
                  <label style={labelStyle}>Precio Cotizador (Bs.)</label>
                  <input type="number" value={formPrecioCotizador} onChange={(e) => setFormPrecioCotizador(e.target.value)} style={inputStyle} placeholder="0.00" min="0" step="0.01" />
                </div>
              </div>

              {errorForm && <div style={{ color: '#c62828', fontSize: '13px', backgroundColor: '#ffebee', padding: '10px', borderRadius: '6px' }}>{errorForm}</div>}
              {exito && <div style={{ color: '#2e7d32', fontSize: '13px', backgroundColor: '#e8f5e9', padding: '10px', borderRadius: '6px' }}>{exito}</div>}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '10px' }}>
                <button type="button" onClick={() => setModalOpen(false)} style={{ padding: '10px 20px', backgroundColor: 'transparent', border: '1px solid #ccc', borderRadius: '8px', cursor: 'pointer', fontSize: '14px' }}>Cancelar</button>
                <button type="submit" disabled={guardando}
                  style={{ padding: '10px 24px', backgroundColor: guardando ? '#ccc' : '#087e0b', color: 'white', border: 'none', borderRadius: '8px', cursor: guardando ? 'not-allowed' : 'pointer', fontSize: '14px', fontWeight: 'bold' }}>
                  {guardando ? 'Guardando...' : '✓ Guardar Acero'}
                </button>
              </div>
            </form>

          </div>
        </div>
      )}
    </div>
  )
}