'use client'

// app/rrhh/escalas/page.tsx
// Gestión de escalas de vendedor por temporada — editables

import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'

type Escala = { id: number; nombre: string; activa: boolean; nivel: number; venta_min: number; venta_max: number | null; sueldo_base: number; bono: number; comision_pct: number }
type CampoEditable = 'venta_min' | 'venta_max' | 'sueldo_base' | 'bono' | 'comision_pct'

const fmt = (n: number) => new Intl.NumberFormat('es-BO', { minimumFractionDigits: 2 }).format(n)
const NIVEL_COLOR = ['', '#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899']
const CAMPOS_EDITABLES: readonly CampoEditable[] = ['venta_min', 'venta_max', 'sueldo_base', 'bono', 'comision_pct']

const nivelVacio = (nombre: string, nivel: number) => ({
  id: 0, nombre, activa: false, nivel,
  venta_min: 0, venta_max: null as number | null,
  sueldo_base: 0, bono: 0, comision_pct: 0,
})

export default function GestionEscalas() {
  const [escalas,      setEscalas]      = useState<Escala[]>([])
  const [temporadas,   setTemporadas]   = useState<string[]>([])
  const [tempActiva,   setTempActiva]   = useState<string>('')
  const [tempVista,    setTempVista]    = useState<string>('')
  const [loading,      setLoading]      = useState(true)
  const [guardando,    setGuardando]    = useState(false)
  const [editRows,     setEditRows]     = useState<Record<number, Partial<Escala>>>({})
  const [modalNueva,   setModalNueva]   = useState(false)
  const [nombreNueva,  setNombreNueva]  = useState('')
  const [nivelesNueva, setNivelesNueva] = useState(4)
  const [creando,      setCreando]      = useState(false)
  const [error,        setError]        = useState('')
  const [guardado,     setGuardado]     = useState(false)

  useEffect(() => {
    const carnet = localStorage.getItem('carnet')
    if (!carnet) return void (window.location.replace('/'))
    supabase.from('personal').select('*, cargos(*)').eq('carnet', carnet).eq('estado', true).single()
      .then(({ data }) => {
        if (!data) return window.location.replace('/')
        const c = data.cargos
        if (!c?.es_admin && !c?.puede_gestionar_rrhh) return window.location.replace('/sistema')
        loadEscalas()
      })
  }, [])

  const loadEscalas = async () => {
    const { data } = await supabase.from('escalas_vendedor').select('*').order('nombre').order('nivel')
    const rows = data || []
    setEscalas(rows)

    const temps = [...new Set(rows.map(e => e.nombre))]
    setTemporadas(temps)

    const activa = rows.find(e => e.activa)?.nombre || temps[0] || ''
    setTempActiva(activa)
    setTempVista(activa)
    setLoading(false)
  }

  const filasPorTemp = (nombre: string) => escalas.filter(e => e.nombre === nombre).sort((a, b) => a.nivel - b.nivel)

  const editVal = (id: number, campo: CampoEditable, valor: number | null) =>
    setEditRows(prev => ({ ...prev, [id]: { ...prev[id], [campo]: valor } }))

  const getVal = (e: Escala, campo: CampoEditable): number | null => {
    const valorEditado = editRows[e.id]?.[campo]
    return valorEditado !== undefined ? valorEditado : e[campo]
  }

  const guardarTemporada = async (nombre: string) => {
    setGuardando(true); setError(''); setGuardado(false)
    try {
      const filas = filasPorTemp(nombre)
      for (const e of filas) {
        const cambios = editRows[e.id]
        if (!cambios || Object.keys(cambios).length === 0) continue
        const { error: err } = await supabase.from('escalas_vendedor').update(cambios).eq('id', e.id)
        if (err) throw err
      }
      setEditRows({})
      setGuardado(true)
      setTimeout(() => setGuardado(false), 3000)
      await loadEscalas()
    } catch (e: any) {
      setError('Error al guardar: ' + e.message)
    } finally {
      setGuardando(false)
    }
  }

  const activarTemporada = async (nombre: string) => {
    setGuardando(true)
    try {
      // Desactivar todas
      await supabase.from('escalas_vendedor').update({ activa: false }).neq('nombre', '___')
      // Activar la seleccionada
      await supabase.from('escalas_vendedor').update({ activa: true }).eq('nombre', nombre)
      setTempActiva(nombre)
      await loadEscalas()
    } catch (e: any) { setError('Error: ' + e.message) }
    finally { setGuardando(false) }
  }

  const crearTemporada = async () => {
    if (!nombreNueva.trim()) return setError('Ingresa un nombre para la temporada')
    if (temporadas.includes(nombreNueva.trim())) return setError('Ya existe una temporada con ese nombre')
    setCreando(true); setError('')
    try {
      const niveles = Array.from({ length: nivelesNueva }, (_, i) => nivelVacio(nombreNueva.trim(), i + 1))
      const { error: err } = await supabase.from('escalas_vendedor').insert(niveles)
      if (err) throw err
      setModalNueva(false); setNombreNueva(''); setNivelesNueva(4)
      await loadEscalas()
      setTempVista(nombreNueva.trim())
    } catch (e: any) { setError('Error: ' + e.message) }
    finally { setCreando(false) }
  }

  const agregarNivel = async (nombre: string) => {
    const filas   = filasPorTemp(nombre)
    const siguiente = (filas[filas.length - 1]?.nivel || 0) + 1
    await supabase.from('escalas_vendedor').insert(nivelVacio(nombre, siguiente))
    await loadEscalas()
  }

  const eliminarNivel = async (id: number) => {
    if (!confirm('¿Eliminar este nivel?')) return
    await supabase.from('escalas_vendedor').delete().eq('id', id)
    await loadEscalas()
  }

  if (loading) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Arial, sans-serif' }}><p style={{ color: '#999' }}>Cargando...</p></div>

  const filasVista = filasPorTemp(tempVista)

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', minHeight: '100vh', backgroundColor: '#f5f5f5' }}>
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 40px', backgroundColor: '#222', color: 'white', boxSizing: 'border-box' as const, flexWrap: 'wrap' as const, gap: '10px' }}>
        <a href="/rrhh" style={{ fontWeight: 'bold', fontSize: '16px', color: 'white', textDecoration: 'none' }}>← RRHH</a>
        <span style={{ color: '#a3c47d', fontWeight: 'bold' }}>Escalas de Vendedor</span>
        <button onClick={() => { setModalNueva(true); setError('') }} style={{ backgroundColor: '#a3c47d', color: '#222', border: 'none', borderRadius: '20px', padding: '7px 18px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}>
          + Nueva temporada
        </button>
      </nav>

      <div style={{ padding: '32px 40px', maxWidth: '1000px', margin: '0 auto' }}>
        <h2 style={{ marginBottom: '6px', fontSize: '20px' }}>Escalas salariales — Vendedores</h2>
        <p style={{ color: '#888', marginBottom: '28px', fontSize: '13px' }}>Solo una temporada puede estar activa a la vez. Los cambios se aplican al calcular la planilla del mes.</p>

        {/* Selector de temporada */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '24px', flexWrap: 'wrap' as const }}>
          {temporadas.map(t => (
            <button key={t} onClick={() => setTempVista(t)} style={{
              padding: '8px 20px', borderRadius: '20px', border: 'none', cursor: 'pointer',
              fontWeight: 'bold', fontSize: '13px',
              backgroundColor: tempVista === t ? '#222' : 'white',
              color: tempVista === t ? 'white' : '#555',
              boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
              position: 'relative' as const,
            }}>
              {t}
              {tempActiva === t && (
                <span style={{ marginLeft: '8px', backgroundColor: '#22c55e', color: 'white', borderRadius: '20px', padding: '1px 8px', fontSize: '10px', fontWeight: 'bold' }}>ACTIVA</span>
              )}
            </button>
          ))}
        </div>

        {tempVista && (
          <div style={{ backgroundColor: 'white', borderRadius: '16px', boxShadow: '0 2px 12px rgba(0,0,0,0.07)', overflow: 'hidden' }}>
            {/* Header de tabla */}
            <div style={{ padding: '16px 24px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <h3 style={{ margin: 0, fontSize: '15px' }}>{tempVista}</h3>
                {tempActiva === tempVista
                  ? <span style={{ backgroundColor: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', borderRadius: '20px', padding: '2px 12px', fontSize: '11px', fontWeight: 'bold' }}>✓ Activa</span>
                  : <button onClick={() => activarTemporada(tempVista)} disabled={guardando} style={{ backgroundColor: '#fffbeb', color: '#92400e', border: '1px solid #fde68a', borderRadius: '20px', padding: '2px 12px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}>Activar esta temporada</button>
                }
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => agregarNivel(tempVista)} style={{ backgroundColor: '#f0f0f0', border: 'none', borderRadius: '10px', padding: '6px 14px', fontSize: '12px', cursor: 'pointer', fontWeight: 'bold' }}>+ Nivel</button>
                <button onClick={() => guardarTemporada(tempVista)} disabled={guardando} style={{ backgroundColor: '#222', color: 'white', border: 'none', borderRadius: '10px', padding: '6px 18px', fontSize: '12px', cursor: 'pointer', fontWeight: 'bold' }}>
                  {guardando ? 'Guardando...' : 'Guardar cambios'}
                </button>
              </div>
            </div>

            {/* Tabla de niveles */}
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f9f9f9', borderBottom: '2px solid #eee' }}>
                  {['Nivel', 'Venta mínima (Bs)', 'Venta máxima (Bs)', 'Sueldo base (Bs)', 'Bono (Bs)', 'Comisión %', ''].map(h => (
                    <th key={h} style={{ padding: '12px 16px', textAlign: 'left' as const, fontSize: '11px', fontWeight: 'bold', color: '#888', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filasVista.map((e, i) => (
                  <tr key={e.id} style={{ borderBottom: '1px solid #f5f5f5', backgroundColor: i % 2 === 0 ? 'white' : '#fafafa' }}>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ backgroundColor: NIVEL_COLOR[e.nivel] + '20', color: NIVEL_COLOR[e.nivel], borderRadius: '20px', padding: '3px 14px', fontWeight: 'bold', fontSize: '13px' }}>
                        Nivel {e.nivel}
                      </span>
                    </td>
                    {CAMPOS_EDITABLES.map(campo => (
                      <td key={campo} style={{ padding: '8px 16px' }}>
                        <input
                          type="number" min="0" step={campo === 'comision_pct' ? '0.1' : '1'}
                          value={getVal(e, campo) ?? ''}
                          placeholder={campo === 'venta_max' && !getVal(e, campo) ? 'Sin límite' : '0'}
                          onChange={ev => editVal(e.id, campo, ev.target.value === '' ? null : Number(ev.target.value))}
                          style={{ width: '100%', padding: '8px 10px', border: '1px solid #e5e5e5', borderRadius: '8px', fontSize: '14px', outline: 'none', backgroundColor: editRows[e.id]?.[campo] !== undefined ? '#fffbeb' : '#fafafa', boxSizing: 'border-box' as const }}
                        />
                      </td>
                    ))}
                    <td style={{ padding: '8px 16px' }}>
                      <button onClick={() => eliminarNivel(e.id)} style={{ backgroundColor: '#fef2f2', color: '#991b1b', border: 'none', borderRadius: '8px', padding: '6px 12px', fontSize: '12px', cursor: 'pointer', fontWeight: 'bold' }}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Preview de escala */}
            <div style={{ padding: '16px 24px', borderTop: '1px solid #f0f0f0', backgroundColor: '#fafafa' }}>
              <p style={{ margin: '0 0 10px', fontSize: '11px', fontWeight: 'bold', color: '#888', textTransform: 'uppercase' as const, letterSpacing: '0.08em' }}>Vista previa de la escala</p>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' as const }}>
                {filasVista.map(e => (
                  <div key={e.id} style={{ backgroundColor: 'white', border: `1px solid ${NIVEL_COLOR[e.nivel]}33`, borderRadius: '12px', padding: '10px 16px', minWidth: '160px' }}>
                    <p style={{ margin: 0, fontSize: '10px', fontWeight: 'bold', color: NIVEL_COLOR[e.nivel], textTransform: 'uppercase' as const }}>Nivel {e.nivel}</p>
                    <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#555' }}>
                      Bs {fmt(Number(getVal(e, 'venta_min')))} — {getVal(e, 'venta_max') ? `Bs ${fmt(Number(getVal(e, 'venta_max')))}` : '∞'}
                    </p>
                    <p style={{ margin: '6px 0 0', fontSize: '14px', fontWeight: 'bold', color: '#222' }}>Bs {fmt(Number(getVal(e, 'sueldo_base')))}</p>
                    <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#888' }}>+ Bs {fmt(Number(getVal(e, 'bono')))} bono · {getVal(e, 'comision_pct')}% comisión</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {error   && <p style={{ color: '#ef4444', fontSize: '13px', marginTop: '16px' }}>⚠ {error}</p>}
        {guardado && <p style={{ color: '#22c55e', fontSize: '13px', marginTop: '16px' }}>✓ Cambios guardados</p>}
      </div>

      {/* Modal nueva temporada */}
      {modalNueva && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', zIndex: 50 }}>
          <div style={{ backgroundColor: 'white', borderRadius: '20px', padding: '32px', width: '100%', maxWidth: '420px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <h3 style={{ margin: '0 0 20px', fontSize: '17px' }}>Nueva temporada</h3>
            <label style={labelSt}>Nombre de la temporada</label>
            <input value={nombreNueva} onChange={e => setNombreNueva(e.target.value)} placeholder="Ej: Temporada Alta 2026" style={inputSt} />
            <label style={{ ...labelSt, marginTop: '16px' }}>Cantidad de niveles</label>
            <input type="number" min="2" max="8" value={nivelesNueva} onChange={e => setNivelesNueva(Number(e.target.value))} style={{ ...inputSt, width: '80px' }} />
            {error && <p style={{ color: '#ef4444', fontSize: '13px', margin: '12px 0 0' }}>⚠ {error}</p>}
            <div style={{ display: 'flex', gap: '10px', marginTop: '24px' }}>
              <button onClick={() => setModalNueva(false)} style={{ flex: 1, padding: '12px', backgroundColor: '#f5f5f5', border: 'none', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer', color: '#666' }}>Cancelar</button>
              <button onClick={crearTemporada} disabled={creando} style={{ flex: 2, padding: '12px', backgroundColor: '#222', border: 'none', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer', color: 'white' }}>
                {creando ? 'Creando...' : 'Crear temporada'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const labelSt: React.CSSProperties = { display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#666', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }
const inputSt: React.CSSProperties = { width: '100%', padding: '10px 14px', border: '1px solid #e5e5e5', borderRadius: '10px', fontSize: '14px', outline: 'none', backgroundColor: '#fafafa', boxSizing: 'border-box' }
