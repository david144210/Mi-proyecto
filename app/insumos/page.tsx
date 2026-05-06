'use client'
import React, { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

export default function RegistroInsumos() {
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [modal, setModal] = useState(false)
  const [editando, setEditando] = useState<any>(null)
  
  const [form, setForm] = useState({
    codigo_insumos: '', 
    detalle: '', 
    precio_compra: '', 
    precio_cotizador: '', 
    proveedor: '', 
    consumo: ''
  })

  useEffect(() => { 
    const carnetGuardado = localStorage.getItem('carnet')
    if (!carnetGuardado) { window.location.replace('/'); return }
    cargarDatos() 
  }, [])

  const cargarDatos = async () => {
    setLoading(true)
    const { data } = await supabase.from('insumos').select('*').order('id', { ascending: false })
    setItems(data || [])
    setLoading(false)
  }

  const handlePrecioCompraChange = (valor: string) => {
    const compra = parseFloat(valor) || 0
    const sugerido = (compra * 1.20).toFixed(2)
    setForm({ ...form, precio_compra: valor, precio_cotizador: sugerido })
  }

  const guardar = async () => {
    if (!form.codigo_insumos || !form.detalle) return alert('Código y Detalle son requeridos')
    
    const payload = { 
      ...form, 
      precio_compra: parseFloat(form.precio_compra as string) || 0,
      precio_cotizador: parseFloat(form.precio_cotizador as string) || 0,
      consumo: parseFloat(form.consumo as string) || 0
    }

    if (editando) {
      await supabase.from('insumos').update(payload).eq('id', editando.id)
    } else {
      await supabase.from('insumos').insert([payload])
    }
    
    setModal(false)
    setEditando(null)
    resetForm()
    cargarDatos()
  }

  const resetForm = () => setForm({ codigo_insumos: '', detalle: '', precio_compra: '', precio_cotizador: '', proveedor: '', consumo: '' })

  const itemsFiltrados = items.filter(i => 
    (i.detalle || '').toLowerCase().includes(busqueda.toLowerCase()) || 
    (i.codigo_insumos || '').toLowerCase().includes(busqueda.toLowerCase())
  )

  const inputS: any = { padding: '12px', borderRadius: '8px', border: '1px solid #ddd', width: '100%', fontSize: '16px', marginBottom: '10px' }

  if (loading) return <p style={{ textAlign: 'center', marginTop: '50px' }}>Cargando Insumos...</p>

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', backgroundColor: '#f5f5f5', minHeight: '100vh' }}>
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 20px', backgroundColor: '#222', color: 'white' }}>
        <span style={{ fontWeight: 'bold' }}>Better</span>
        <a href="/sistema" style={{ color: '#a3c47d', textDecoration: 'none' }}>← Volver</a>
      </nav>

      <div style={{ padding: '15px', maxWidth: '1100px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ margin: 0, fontSize: '20px' }}>🧪 Registro de Insumos</h2>
          <button 
            onClick={() => { resetForm(); setEditando(null); setModal(true) }} 
            style={{ padding: '10px 20px', backgroundColor: '#7c3aed', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold' }}
          >
            + Adicionar
          </button>
        </div>

        <input 
          type="text" 
          placeholder="Buscar insumo..." 
          value={busqueda} 
          onChange={e => setBusqueda(e.target.value)} 
          style={{ ...inputS, marginBottom: '20px' }} 
        />

        <div style={{ backgroundColor: 'white', borderRadius: '12px', overflowX: 'auto', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
            <thead>
              <tr style={{ backgroundColor: '#f9f9f9', borderBottom: '2px solid #eee' }}>
                <th style={{ padding: '12px', textAlign: 'left', fontSize: '13px' }}>Código</th>
                <th style={{ padding: '12px', textAlign: 'left', fontSize: '13px' }}>Detalle</th>
                <th style={{ padding: '12px', textAlign: 'right', fontSize: '13px' }}>Consumo</th>
                <th style={{ padding: '12px', textAlign: 'right', fontSize: '13px' }}>P. Cotizador</th>
                <th style={{ padding: '12px', textAlign: 'center', fontSize: '13px' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {itemsFiltrados.map(item => (
                <tr key={item.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '12px', fontWeight: 'bold', color: '#7c3aed', fontSize: '14px' }}>{item.codigo_insumos}</td>
                  <td style={{ padding: '12px', fontSize: '14px' }}>{item.detalle}</td>
                  <td style={{ padding: '12px', textAlign: 'right', fontSize: '14px' }}>{item.consumo}</td>
                  <td style={{ padding: '12px', textAlign: 'right', fontWeight: 'bold', fontSize: '14px' }}>Bs. {Number(item.precio_cotizador).toFixed(2)}</td>
                  <td style={{ padding: '12px', textAlign: 'center' }}>
                    <button 
                      onClick={() => { setEditando(item); setForm(item); setModal(true) }}
                      style={{ padding: '6px 12px', borderRadius: '6px', cursor: 'pointer' }}
                    >
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: '10px' }}>
          <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '15px', width: '100%', maxWidth: '500px', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ marginTop: 0 }}>{editando ? 'Editar Insumo' : 'Nuevo Insumo'}</h3>
            
            <label style={{ fontSize: '12px', color: '#666' }}>Código Insumo</label>
            <input value={form.codigo_insumos || ''} onChange={e => setForm({...form, codigo_insumos: e.target.value})} style={inputS} />
            
            <label style={{ fontSize: '12px', color: '#666' }}>Detalle</label>
            <input value={form.detalle || ''} onChange={e => setForm({...form, detalle: e.target.value})} style={inputS} />
            
            <label style={{ fontSize: '12px', color: '#666' }}>Proveedor</label>
            <input value={form.proveedor || ''} onChange={e => setForm({...form, proveedor: e.target.value})} style={inputS} />
            
            <label style={{ fontSize: '12px', color: '#666' }}>Consumo (Cant. de uso)</label>
            <input type="number" value={form.consumo || ''} onChange={e => setForm({...form, consumo: e.target.value})} style={inputS} />
            
            <div style={{ display: 'flex', gap: '10px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '12px', color: '#666' }}>P. Compra</label>
                <input type="number" value={form.precio_compra || ''} onChange={e => handlePrecioCompraChange(e.target.value)} style={inputS} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '12px', color: '#7c3aed', fontWeight: 'bold' }}>P. Cotizador (+20%)</label>
                <input type="number" value={form.precio_cotizador || ''} onChange={e => setForm({...form, precio_cotizador: e.target.value})} style={{ ...inputS, borderColor: '#7c3aed' }} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
              <button onClick={() => setModal(false)} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid #ccc' }}>Cancelar</button>
              <button onClick={guardar} style={{ flex: 1, padding: '12px', backgroundColor: '#7c3aed', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold' }}>Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}