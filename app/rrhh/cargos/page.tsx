'use client'

// app/rrhh/cargos/page.tsx
// Gestión de cargos: crear, editar nombre y activar/desactivar permisos

import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'

type Cargo = {
  id: number; nombre: string; activo: boolean
  es_admin: boolean
  puede_editar_productos: boolean
  puede_ver_precio_minimo: boolean
  puede_ver_cotizador: boolean
  puede_gestionar_usuarios: boolean
  puede_ver_produccion: boolean
  puede_ver_entregas: boolean
  puede_ver_compras: boolean
  puede_editar_tienda: boolean
  puede_ver_caja_chica: boolean
  puede_ver_rrhh: boolean
  puede_gestionar_rrhh: boolean
}

const PERMISOS: { campo: keyof Cargo; label: string; grupo: string }[] = [
  { campo: 'es_admin',               label: 'Administrador total',      grupo: 'Sistema'    },
  { campo: 'puede_gestionar_usuarios',label: 'Gestionar usuarios',      grupo: 'Sistema'    },
  { campo: 'puede_ver_cotizador',    label: 'Ver cotizador / ventas',   grupo: 'Ventas'     },
  { campo: 'puede_ver_precio_minimo',label: 'Ver precio mínimo',        grupo: 'Ventas'     },
  { campo: 'puede_editar_productos', label: 'Editar productos',         grupo: 'Productos'  },
  { campo: 'puede_ver_compras',      label: 'Ver compras e insumos',    grupo: 'Compras'    },
  { campo: 'puede_editar_tienda',    label: 'Gestionar stock tienda',   grupo: 'Tienda'     },
  { campo: 'puede_ver_caja_chica',   label: 'Ver caja chica',           grupo: 'Finanzas'   },
  { campo: 'puede_ver_produccion',   label: 'Ver producción',           grupo: 'Producción' },
  { campo: 'puede_ver_entregas',     label: 'Ver despachos y cobros',   grupo: 'Logística'  },
  { campo: 'puede_ver_rrhh',         label: 'Ver asistencia (RRHH)',    grupo: 'RRHH'       },
  { campo: 'puede_gestionar_rrhh',   label: 'Gestionar RRHH',          grupo: 'RRHH'       },
]

const GRUPOS = [...new Set(PERMISOS.map(p => p.grupo))]

export default function GestionCargos() {
  const [cargos,    setCargos]    = useState<Cargo[]>([])
  const [loading,   setLoading]   = useState(true)
  const [modal,     setModal]     = useState(false)
  const [editando,  setEditando]  = useState<Cargo | null>(null)
  const [nombre,    setNombre]    = useState('')
  const [permisos,  setPermisos]  = useState<Partial<Cargo>>({})
  const [guardando, setGuardando] = useState(false)
  const [error,     setError]     = useState('')

  useEffect(() => {
    const carnet = localStorage.getItem('carnet')
    if (!carnet) return void (window.location.replace('/'))
    supabase.from('personal').select('*, cargos(*)').eq('carnet', carnet).eq('estado', true).single()
      .then(({ data }) => {
        if (!data) return window.location.replace('/')
        const c = data.cargos
        if (!c?.es_admin && !c?.puede_gestionar_rrhh) return window.location.replace('/sistema')
        loadCargos()
      })
  }, [])

  const loadCargos = async () => {
    const { data } = await supabase.from('cargos').select('*').order('nombre')
    setCargos(data || [])
    setLoading(false)
  }

  const abrirNuevo = () => {
    setEditando(null); setNombre('')
    setPermisos(Object.fromEntries(PERMISOS.map(p => [p.campo, false])))
    setError(''); setModal(true)
  }

  const abrirEditar = (c: Cargo) => {
    setEditando(c); setNombre(c.nombre)
    setPermisos(Object.fromEntries(PERMISOS.map(p => [p.campo, c[p.campo]])))
    setError(''); setModal(true)
  }

  const togglePermiso = (campo: keyof Cargo) =>
    setPermisos(prev => ({ ...prev, [campo]: !prev[campo] }))

  const guardar = async () => {
    if (!nombre.trim()) return setError('El nombre es obligatorio')
    setGuardando(true); setError('')
    try {
      const payload = { nombre: nombre.trim(), ...permisos }
      if (editando) {
        await supabase.from('cargos').update(payload).eq('id', editando.id)
      } else {
        await supabase.from('cargos').insert({ ...payload, activo: true })
      }
      await loadCargos(); setModal(false)
    } catch (e: any) {
      setError('Error al guardar')
    } finally {
      setGuardando(false)
    }
  }

  const toggleActivo = async (c: Cargo) => {
    await supabase.from('cargos').update({ activo: !c.activo }).eq('id', c.id)
    await loadCargos()
  }

  if (loading) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Arial, sans-serif' }}><p style={{ color: '#999' }}>Cargando...</p></div>

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', minHeight: '100vh', backgroundColor: '#f5f5f5' }}>
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 40px', backgroundColor: '#222', color: 'white', boxSizing: 'border-box' as const }}>
        <a href="/rrhh" style={{ fontWeight: 'bold', fontSize: '16px', color: 'white', textDecoration: 'none' }}>← RRHH</a>
        <span style={{ color: '#a3c47d', fontWeight: 'bold' }}>Cargos y Permisos</span>
        <button onClick={abrirNuevo} style={{ backgroundColor: '#a3c47d', color: '#222', border: 'none', borderRadius: '20px', padding: '8px 20px', fontWeight: 'bold', fontSize: '13px', cursor: 'pointer' }}>
          + Nuevo Cargo
        </button>
      </nav>

      <div style={{ padding: '32px 40px', maxWidth: '1000px', margin: '0 auto' }}>
        <h2 style={{ marginBottom: '24px', fontSize: '20px' }}>Cargos del sistema</h2>

        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '12px' }}>
          {cargos.map(c => (
            <div key={c.id} style={{
              backgroundColor: 'white', borderRadius: '16px', padding: '20px 24px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
              opacity: c.activo ? 1 : 0.6,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <h3 style={{ margin: 0, fontSize: '15px' }}>{c.nombre}</h3>
                  {c.es_admin && <span style={{ backgroundColor: '#fef3c7', color: '#92400e', borderRadius: '20px', padding: '2px 10px', fontSize: '11px', fontWeight: 'bold' }}>★ Admin</span>}
                  {!c.activo  && <span style={{ backgroundColor: '#fee2e2', color: '#991b1b', borderRadius: '20px', padding: '2px 10px', fontSize: '11px', fontWeight: 'bold' }}>Inactivo</span>}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => abrirEditar(c)} style={{ backgroundColor: '#f0f0f0', border: 'none', borderRadius: '8px', padding: '6px 16px', fontSize: '12px', cursor: 'pointer', fontWeight: 'bold' }}>Editar</button>
                  <button onClick={() => toggleActivo(c)} style={{ backgroundColor: c.activo ? '#fee2e2' : '#dcfce7', border: 'none', borderRadius: '8px', padding: '6px 16px', fontSize: '12px', cursor: 'pointer', fontWeight: 'bold', color: c.activo ? '#991b1b' : '#166534' }}>
                    {c.activo ? 'Desactivar' : 'Activar'}
                  </button>
                </div>
              </div>

              {/* Permisos activos */}
              <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: '6px' }}>
                {PERMISOS.filter(p => c[p.campo]).map(p => (
                  <span key={p.campo} style={{ backgroundColor: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', borderRadius: '20px', padding: '3px 10px', fontSize: '11px', fontWeight: 'bold' }}>
                    ✓ {p.label}
                  </span>
                ))}
                {PERMISOS.every(p => !c[p.campo]) && <span style={{ color: '#bbb', fontSize: '12px' }}>Sin permisos especiales</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Modal */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', zIndex: 50, overflowY: 'auto' }}>
          <div style={{ backgroundColor: 'white', borderRadius: '20px', padding: '36px', width: '100%', maxWidth: '520px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', margin: 'auto' }}>
            <h3 style={{ margin: '0 0 20px', fontSize: '18px' }}>{editando ? 'Editar Cargo' : 'Nuevo Cargo'}</h3>

            <label style={labelStyle}>Nombre del cargo</label>
            <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej: Encargado de tienda" style={{ ...inputStyle, width: '100%', marginBottom: '24px' }} />

            <p style={{ ...labelStyle, marginBottom: '16px' }}>Permisos</p>

            {GRUPOS.map(grupo => (
              <div key={grupo} style={{ marginBottom: '16px' }}>
                <p style={{ margin: '0 0 8px', fontSize: '11px', color: '#aaa', fontWeight: 'bold', textTransform: 'uppercase' as const, letterSpacing: '0.08em' }}>{grupo}</p>
                <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '6px' }}>
                  {PERMISOS.filter(p => p.grupo === grupo).map(p => (
                    <label key={p.campo} style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', padding: '8px 12px', borderRadius: '10px', backgroundColor: permisos[p.campo] ? '#f0fdf4' : '#fafafa', border: `1px solid ${permisos[p.campo] ? '#bbf7d0' : '#f0f0f0'}` }}>
                      <input type="checkbox" checked={!!permisos[p.campo]} onChange={() => togglePermiso(p.campo)} style={{ width: '16px', height: '16px', cursor: 'pointer' }} />
                      <span style={{ fontSize: '13px', fontWeight: permisos[p.campo] ? 'bold' : 'normal', color: permisos[p.campo] ? '#166534' : '#555' }}>{p.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}

            {error && <p style={{ color: '#ef4444', fontSize: '13px', margin: '12px 0 0' }}>⚠ {error}</p>}

            <div style={{ display: 'flex', gap: '12px', marginTop: '28px' }}>
              <button onClick={() => setModal(false)} style={{ flex: 1, padding: '12px', backgroundColor: '#f5f5f5', border: 'none', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer', color: '#666' }}>Cancelar</button>
              <button onClick={guardar} disabled={guardando} style={{ flex: 2, padding: '12px', backgroundColor: '#222', border: 'none', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer', color: 'white' }}>
                {guardando ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const labelStyle: React.CSSProperties = { display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#666', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }
const inputStyle: React.CSSProperties = { padding: '10px 14px', border: '1px solid #e5e5e5', borderRadius: '10px', fontSize: '14px', outline: 'none', backgroundColor: '#fafafa', boxSizing: 'border-box' }
