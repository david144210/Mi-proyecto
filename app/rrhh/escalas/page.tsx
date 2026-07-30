'use client'

// app/rrhh/escalas/page.tsx
// Gestión de escalas de vendedor por temporada — editables

import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'

type TipoVendedor = 'Planta' | 'Virtual'

type Escala = { 
  id: number; 
  nombre: string; 
  activa: boolean; 
  nivel: number; 
  tipo: TipoVendedor; 
  categoria: string; 
  venta_min: number; 
  sueldo_base: number; // Actúa como Salario Base (Planta) o Piso Mínimo (Virtual)
  comision_pct: number; // Porcentaje de comisión 
}

type CampoEditable = 'categoria' | 'venta_min' | 'sueldo_base' | 'comision_pct'

const fmt = (n: number) => new Intl.NumberFormat('es-BO', { minimumFractionDigits: 2 }).format(n)

const CAMPOS_EDITABLES: readonly CampoEditable[] = ['categoria', 'venta_min', 'sueldo_base', 'comision_pct']

const nivelVacio = (nombre: string, nivel: number, tipo: TipoVendedor) => {
  const defaults = {
    id: 0, nombre, activa: false, nivel, tipo,
    venta_min: 0, sueldo_base: tipo === 'Planta' ? 3300 : 231, comision_pct: 0.5,
  }
  
  let categoria = 'Sin categoría'
  if (nivel === 2) categoria = 'Júnior'
  if (nivel === 3) categoria = 'Intermedio'
  if (nivel === 4) categoria = 'Avanzado'
  if (nivel === 5) categoria = 'Estrella'
  if (nivel >= 6) categoria = tipo === 'Planta' ? 'Diamante' : 'Super Estrella'

  return { ...defaults, categoria }
}

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
  const [nivelesNueva, setNivelesNueva] = useState(6)
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
    const { data } = await supabase.from('escalas_vendedor').select('*').order('nombre').order('tipo').order('nivel')
    const rows = (data || []) as Escala[]
    setEscalas(rows)

    const temps = [...new Set(rows.map(e => e.nombre))]
    setTemporadas(temps)

    const activa = rows.find(e => e.activa)?.nombre || temps[0] || ''
    setTempActiva(activa)
    setTempVista(activa)
    setLoading(false)
  }

  const filasPorTemp = (nombre: string, tipo: TipoVendedor) => 
    escalas.filter(e => e.nombre === nombre && e.tipo === tipo).sort((a, b) => a.nivel - b.nivel)

  const editVal = (id: number, campo: CampoEditable, valor: string | number | null) =>
    setEditRows(prev => ({ ...prev, [id]: { ...prev[id], [campo]: valor } }))

  const getVal = (e: Escala, campo: CampoEditable): any => {
    const valorEditado = editRows[e.id]?.[campo]
    return valorEditado !== undefined ? valorEditado : e[campo]
  }

  const guardarTemporada = async (nombre: string) => {
    setGuardando(true); setError(''); setGuardado(false)
    try {
      const filasPlanta = filasPorTemp(nombre, 'Planta')
      const filasVirtual = filasPorTemp(nombre, 'Virtual')
      const todasLasFilas = [...filasPlanta, ...filasVirtual]
      
      for (const e of todasLasFilas) {
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
      await supabase.from('escalas_vendedor').update({ activa: false }).neq('nombre', '___')
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
      const nivelesPlanta = Array.from({ length: nivelesNueva }, (_, i) => nivelVacio(nombreNueva.trim(), i + 1, 'Planta'))
      const nivelesVirtual = Array.from({ length: nivelesNueva }, (_, i) => nivelVacio(nombreNueva.trim(), i + 1, 'Virtual'))
      
      const { error: err } = await supabase.from('escalas_vendedor').insert([...nivelesPlanta, ...nivelesVirtual])
      if (err) throw err
      
      setModalNueva(false); setNombreNueva(''); setNivelesNueva(6)
      await loadEscalas()
      setTempVista(nombreNueva.trim())
    } catch (e: any) { setError('Error: ' + e.message) }
    finally { setCreando(false) }
  }

  const agregarNivel = async (nombre: string, tipo: TipoVendedor) => {
    const filas = filasPorTemp(nombre, tipo)
    const siguiente = (filas[filas.length - 1]?.nivel || 0) + 1
    await supabase.from('escalas_vendedor').insert(nivelVacio(nombre, siguiente, tipo))
    await loadEscalas()
  }

  const eliminarNivel = async (id: number) => {
    if (!confirm('¿Eliminar este nivel?')) return
    await supabase.from('escalas_vendedor').delete().eq('id', id)
    await loadEscalas()
  }

  if (loading) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Arial, sans-serif' }}><p style={{ color: '#999' }}>Cargando...</p></div>

  const renderTabla = (tipo: TipoVendedor) => {
    const filasVista = filasPorTemp(tempVista, tipo)
    if (filasVista.length === 0) return null

    return (
      <div style={{ backgroundColor: 'white', borderRadius: '16px', boxShadow: '0 2px 12px rgba(0,0,0,0.04)', overflow: 'hidden', marginBottom: '24px', border: '1px solid #eaeaea' }}>
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fafafa' }}>
          <h3 style={{ margin: 0, fontSize: '15px', color: '#002855' }}>Vendedores B2C - {tipo}</h3>
          <button onClick={() => agregarNivel(tempVista, tipo)} style={{ backgroundColor: '#002855', color: '#fff', border: 'none', borderRadius: '4px', padding: '6px 14px', fontSize: '12px', cursor: 'pointer', fontWeight: 'bold' }}>+ Agregar Nivel {tipo}</button>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #002855' }}>
              <th style={thSt}>Nivel</th>
              <th style={thSt}>Categoría</th>
              <th style={thSt}>Desde (Bs.)</th>
              <th style={thSt}>{tipo === 'Planta' ? 'Salario Base (Bs.)' : 'Piso Mínimo (Bs.)'}</th>
              <th style={thSt}>% Comisión</th>
              <th style={thSt}></th>
            </tr>
          </thead>
          <tbody>
            {filasVista.map((e, i) => (
              <tr key={e.id} style={{ borderBottom: '1px solid #f5f5f5', backgroundColor: i % 2 === 0 ? 'white' : '#fafafa' }}>
                <td style={{ padding: '12px 16px' }}>
                  <span style={{ backgroundColor: '#002855', color: '#d4af37', borderRadius: '4px', padding: '3px 10px', fontWeight: 'bold', fontSize: '12px' }}>
                    {e.nivel}
                  </span>
                </td>
                <td style={{ padding: '8px 16px' }}>
                  <input
                    type="text" value={getVal(e, 'categoria')}
                    onChange={ev => editVal(e.id, 'categoria', ev.target.value)}
                    style={inputGridSt(editRows[e.id]?.categoria !== undefined)}
                  />
                </td>
                <td style={{ padding: '8px 16px' }}>
                  <input
                    type="number" min="0" value={getVal(e, 'venta_min')}
                    onChange={ev => editVal(e.id, 'venta_min', ev.target.value === '' ? null : Number(ev.target.value))}
                    style={inputGridSt(editRows[e.id]?.venta_min !== undefined)}
                  />
                </td>
                <td style={{ padding: '8px 16px' }}>
                  <input
                    type="number" min="0" value={getVal(e, 'sueldo_base')}
                    onChange={ev => editVal(e.id, 'sueldo_base', ev.target.value === '' ? null : Number(ev.target.value))}
                    style={inputGridSt(editRows[e.id]?.sueldo_base !== undefined)}
                  />
                </td>
                <td style={{ padding: '8px 16px' }}>
                  <input
                    type="number" min="0" step="0.1" value={getVal(e, 'comision_pct')}
                    onChange={ev => editVal(e.id, 'comision_pct', ev.target.value === '' ? null : Number(ev.target.value))}
                    style={inputGridSt(editRows[e.id]?.comision_pct !== undefined)}
                  />
                </td>
                <td style={{ padding: '8px 16px' }}>
                  <button onClick={() => eliminarNivel(e.id)} style={{ backgroundColor: '#fef2f2', color: '#991b1b', border: 'none', borderRadius: '4px', padding: '6px 12px', fontSize: '12px', cursor: 'pointer', fontWeight: 'bold' }}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', minHeight: '100vh', backgroundColor: '#ffffff' }}>
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 40px', backgroundColor: '#002855', color: 'white', boxSizing: 'border-box' as const, flexWrap: 'wrap' as const, gap: '10px' }}>
        <a href="/rrhh" style={{ fontWeight: 'bold', fontSize: '16px', color: 'white', textDecoration: 'none' }}>← RRHH</a>
        <span style={{ color: '#d4af37', fontWeight: 'bold', letterSpacing: '0.05em' }}>MUEBLESS IS BETTER - Condiciones de Ventas</span>
        <button onClick={() => { setModalNueva(true); setError('') }} style={{ backgroundColor: '#d4af37', color: '#002855', border: 'none', borderRadius: '4px', padding: '7px 18px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}>
          + Nueva temporada
        </button>
      </nav>

      <div style={{ padding: '32px 40px', maxWidth: '1100px', margin: '0 auto' }}>
        <h2 style={{ marginBottom: '6px', fontSize: '20px', color: '#002855' }}>Escalas Salariales — B2C Planta y Virtual</h2>
        <p style={{ color: '#666', marginBottom: '28px', fontSize: '13px' }}>
          * El Bono Digital (+0.5%) se aplica en el módulo de planillas, no se refleja en los topes de escala.
        </p>

        {/* Selector de temporada */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '24px', flexWrap: 'wrap' as const }}>
          {temporadas.map(t => (
            <button key={t} onClick={() => setTempVista(t)} style={{
              padding: '8px 20px', borderRadius: '4px', border: '1px solid #002855', cursor: 'pointer',
              fontWeight: 'bold', fontSize: '13px',
              backgroundColor: tempVista === t ? '#002855' : 'white',
              color: tempVista === t ? '#d4af37' : '#002855',
              transition: 'all 0.2s',
            }}>
              {t}
              {tempActiva === t && (
                <span style={{ marginLeft: '8px', backgroundColor: '#d4af37', color: '#002855', borderRadius: '2px', padding: '2px 8px', fontSize: '10px', fontWeight: 'bold' }}>ACTIVA</span>
              )}
            </button>
          ))}
        </div>

        {tempVista && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <h3 style={{ margin: 0, fontSize: '18px', color: '#002855' }}>Gestionando: {tempVista}</h3>
                {tempActiva !== tempVista && (
                  <button onClick={() => activarTemporada(tempVista)} disabled={guardando} style={{ backgroundColor: '#fffbeb', color: '#92400e', border: '1px solid #fde68a', borderRadius: '4px', padding: '4px 12px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}>Activar esta temporada</button>
                )}
              </div>
              <button onClick={() => guardarTemporada(tempVista)} disabled={guardando} style={{ backgroundColor: '#d4af37', color: '#002855', border: 'none', borderRadius: '4px', padding: '8px 24px', fontSize: '13px', cursor: 'pointer', fontWeight: 'bold' }}>
                {guardando ? 'Guardando...' : 'Guardar todos los cambios'}
              </button>
            </div>

            {renderTabla('Planta')}
            {renderTabla('Virtual')}
          </div>
        )}

        {error && <p style={{ color: '#ef4444', fontSize: '13px', marginTop: '16px', fontWeight: 'bold' }}>⚠ {error}</p>}
        {guardado && <p style={{ color: '#22c55e', fontSize: '13px', marginTop: '16px', fontWeight: 'bold' }}>✓ Cambios guardados correctamente</p>}
      </div>

      {/* Modal nueva temporada */}
      {modalNueva && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,40,85,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', zIndex: 50 }}>
          <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '32px', width: '100%', maxWidth: '420px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <h3 style={{ margin: '0 0 20px', fontSize: '17px', color: '#002855' }}>Crear Nueva Temporada</h3>
            <label style={labelSt}>Nombre de la temporada</label>
            <input value={nombreNueva} onChange={e => setNombreNueva(e.target.value)} placeholder="Ej: Octubre 2026" style={inputSt} />
            <label style={{ ...labelSt, marginTop: '16px' }}>Niveles base por tipo</label>
            <input type="number" min="2" max="10" value={nivelesNueva} onChange={e => setNivelesNueva(Number(e.target.value))} style={{ ...inputSt, width: '100px' }} />
            {error && <p style={{ color: '#ef4444', fontSize: '13px', margin: '12px 0 0' }}>⚠ {error}</p>}
            <div style={{ display: 'flex', gap: '10px', marginTop: '24px' }}>
              <button onClick={() => setModalNueva(false)} style={{ flex: 1, padding: '12px', backgroundColor: '#f5f5f5', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', color: '#666' }}>Cancelar</button>
              <button onClick={crearTemporada} disabled={creando} style={{ flex: 2, padding: '12px', backgroundColor: '#002855', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', color: '#d4af37' }}>
                {creando ? 'Creando...' : 'Generar Tablas'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const thSt: React.CSSProperties = { padding: '12px 16px', textAlign: 'left', fontSize: '11px', fontWeight: 'bold', color: '#002855', textTransform: 'uppercase', letterSpacing: '0.05em' }
const labelSt: React.CSSProperties = { display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#666', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }
const inputSt: React.CSSProperties = { width: '100%', padding: '10px 14px', border: '1px solid #e5e5e5', borderRadius: '4px', fontSize: '14px', outline: 'none', backgroundColor: '#fafafa', boxSizing: 'border-box' }

const inputGridSt = (editado: boolean): React.CSSProperties => ({
  width: '100%', padding: '8px 10px', border: '1px solid #e5e5e5', borderRadius: '4px', fontSize: '13px', outline: 'none',
  backgroundColor: editado ? '#fffbeb' : '#fafafa', boxSizing: 'border-box'
})