'use client'

// app/rrhh/planilla/page.tsx
// Parámetros de planilla: sanciones LGT Bolivia, horas extra, seguro salud CNS

import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'

type Config = {
  id: number
  tolerancia_min: number
  min_retraso_grave: number
  retrasos_llamada_verbal: number
  retrasos_descuento: number
  retrasos_memorandum: number
  retrasos_causal_despido: number
  mult_hora_extra: number
  mult_hora_sabado: number
  mult_hora_feriado: number
  aporte_empleado_pct: number
  aporte_empleador_pct: number
  dias_laborales_mes: number
}

export default function ConfigPlanilla() {
  const [config,    setConfig]    = useState<Config | null>(null)
  const [form,      setForm]      = useState<Partial<Config>>({})
  const [loading,   setLoading]   = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [guardado,  setGuardado]  = useState(false)
  const [error,     setError]     = useState('')

  useEffect(() => {
    const carnet = localStorage.getItem('carnet')
    if (!carnet) return void (window.location.replace('/'))
    supabase.from('personal').select('*, cargos(*)').eq('carnet', carnet).eq('estado', true).single()
      .then(({ data }) => {
        if (!data) return window.location.replace('/')
        const c = data.cargos
        if (!c?.es_admin && !c?.puede_gestionar_rrhh) return window.location.replace('/sistema')
        loadConfig()
      })
  }, [])

  const loadConfig = async () => {
    const { data } = await supabase.from('configuracion_planilla').select('*').single()
    if (data) { setConfig(data); setForm(data) }
    setLoading(false)
  }

  const f = (campo: keyof Config) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(prev => ({ ...prev, [campo]: Number(e.target.value) }))

  const guardar = async () => {
    if (!config) return
    setGuardando(true); setError(''); setGuardado(false)
    try {
      const { error: err } = await supabase
        .from('configuracion_planilla')
        .update({ ...form, actualizado_at: new Date().toISOString() })
        .eq('id', config.id)
      if (err) throw err
      setGuardado(true)
      setTimeout(() => setGuardado(false), 3000)
      await loadConfig()
    } catch (e: any) {
      setError('Error al guardar: ' + e.message)
    } finally {
      setGuardando(false)
    }
  }

  if (loading) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Arial, sans-serif' }}><p style={{ color: '#999' }}>Cargando...</p></div>

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', minHeight: '100vh', backgroundColor: '#f5f5f5' }}>
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 40px', backgroundColor: '#222', color: 'white', boxSizing: 'border-box' as const }}>
        <a href="/rrhh" style={{ fontWeight: 'bold', fontSize: '16px', color: 'white', textDecoration: 'none' }}>← RRHH</a>
        <span style={{ color: '#a3c47d', fontWeight: 'bold' }}>Configuración Planilla</span>
        <span />
      </nav>

      <div style={{ padding: '32px 40px', maxWidth: '700px', margin: '0 auto' }}>
        <h2 style={{ marginBottom: '6px', fontSize: '20px' }}>Parámetros de Planilla</h2>
        <p style={{ color: '#888', marginBottom: '32px', fontSize: '13px' }}>Basado en la Ley General del Trabajo Bolivia y CNS</p>

        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '20px' }}>

          {/* Asistencia */}
          <Seccion titulo="⏱ Asistencia y Retrasos">
            <Fila label="Tolerancia de entrada (minutos)" desc="Tiempo máximo antes de marcar retraso leve">
              <input type="number" min="0" max="60" value={form.tolerancia_min ?? ''} onChange={f('tolerancia_min')} style={inputStyle} />
            </Fila>
            <Fila label="Minutos para retraso grave" desc="A partir de aquí descuenta del sueldo">
              <input type="number" min="0" max="120" value={form.min_retraso_grave ?? ''} onChange={f('min_retraso_grave')} style={inputStyle} />
            </Fila>
            <Fila label="Días laborales por mes" desc="Para calcular el valor del día y del minuto">
              <input type="number" min="20" max="31" value={form.dias_laborales_mes ?? ''} onChange={f('dias_laborales_mes')} style={inputStyle} />
            </Fila>
          </Seccion>

          {/* Sanciones LGT */}
          <Seccion titulo="⚖️ Escala de Sanciones (LGT Bolivia)">
            <Fila label="Retrasos para llamada verbal" desc="Acumulado en el mes">
              <input type="number" min="1" value={form.retrasos_llamada_verbal ?? ''} onChange={f('retrasos_llamada_verbal')} style={inputStyle} />
            </Fila>
            <Fila label="Retrasos para descuento" desc="A partir de aquí se descuenta del sueldo">
              <input type="number" min="1" value={form.retrasos_descuento ?? ''} onChange={f('retrasos_descuento')} style={inputStyle} />
            </Fila>
            <Fila label="Retrasos para memorándum" desc="Sanción escrita formal">
              <input type="number" min="1" value={form.retrasos_memorandum ?? ''} onChange={f('retrasos_memorandum')} style={inputStyle} />
            </Fila>
            <Fila label="Retrasos para causal de despido" desc="Según Art. 16 LGT">
              <input type="number" min="1" value={form.retrasos_causal_despido ?? ''} onChange={f('retrasos_causal_despido')} style={inputStyle} />
            </Fila>
          </Seccion>

          {/* Horas extra */}
          <Seccion titulo="🕐 Multiplicadores Horas Extra (LGT Bolivia)">
            <Fila label="Hora extra entre semana" desc="Valor hora normal × multiplicador">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input type="number" step="0.1" min="1" max="5" value={form.mult_hora_extra ?? ''} onChange={f('mult_hora_extra')} style={{ ...inputStyle, width: '80px' }} />
                <span style={{ color: '#888', fontSize: '13px' }}>× hora normal</span>
              </div>
            </Fila>
            <Fila label="Hora extra sábado" desc="">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input type="number" step="0.1" min="1" max="5" value={form.mult_hora_sabado ?? ''} onChange={f('mult_hora_sabado')} style={{ ...inputStyle, width: '80px' }} />
                <span style={{ color: '#888', fontSize: '13px' }}>× hora normal</span>
              </div>
            </Fila>
            <Fila label="Hora extra feriado" desc="">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input type="number" step="0.1" min="1" max="5" value={form.mult_hora_feriado ?? ''} onChange={f('mult_hora_feriado')} style={{ ...inputStyle, width: '80px' }} />
                <span style={{ color: '#888', fontSize: '13px' }}>× hora normal</span>
              </div>
            </Fila>
          </Seccion>

          {/* Seguro salud CNS */}
          <Seccion titulo="🏥 Seguro de Salud CNS Bolivia">
            <Fila label="Aporte empleado (%)" desc="Descuento del sueldo del trabajador">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input type="number" step="0.1" min="0" max="20" value={form.aporte_empleado_pct ?? ''} onChange={f('aporte_empleado_pct')} style={{ ...inputStyle, width: '80px' }} />
                <span style={{ color: '#888', fontSize: '13px' }}>%</span>
              </div>
            </Fila>
            <Fila label="Aporte empleador (%)" desc="A cargo de la empresa">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input type="number" step="0.1" min="0" max="20" value={form.aporte_empleador_pct ?? ''} onChange={f('aporte_empleador_pct')} style={{ ...inputStyle, width: '80px' }} />
                <span style={{ color: '#888', fontSize: '13px' }}>%</span>
              </div>
            </Fila>
          </Seccion>
        </div>

        {/* Feedback */}
        {error    && <p style={{ color: '#ef4444', fontSize: '13px', marginTop: '16px' }}>⚠ {error}</p>}
        {guardado && <p style={{ color: '#22c55e', fontSize: '13px', marginTop: '16px' }}>✓ Configuración guardada correctamente</p>}

        {/* Guardar */}
        <button onClick={guardar} disabled={guardando} style={{
          marginTop: '28px', width: '100%', padding: '16px',
          backgroundColor: guardando ? '#ccc' : '#222',
          color: 'white', border: 'none', borderRadius: '14px',
          fontSize: '14px', fontWeight: 'bold', cursor: guardando ? 'not-allowed' : 'pointer',
          letterSpacing: '0.05em',
        }}>
          {guardando ? 'Guardando...' : 'Guardar Configuración'}
        </button>
      </div>
    </div>
  )
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div style={{ backgroundColor: 'white', borderRadius: '16px', padding: '24px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
      <h3 style={{ margin: '0 0 20px', fontSize: '14px', fontWeight: 'bold', color: '#222' }}>{titulo}</h3>
      <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '16px' }}>{children}</div>
    </div>
  )
}

function Fila({ label, desc, children }: { label: string; desc: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
      <div style={{ flex: 1 }}>
        <p style={{ margin: 0, fontSize: '14px', fontWeight: 'bold', color: '#333' }}>{label}</p>
        {desc && <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#aaa' }}>{desc}</p>}
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  )
}

const inputStyle: React.CSSProperties = { padding: '8px 12px', border: '1px solid #e5e5e5', borderRadius: '10px', fontSize: '14px', outline: 'none', backgroundColor: '#fafafa', width: '120px', boxSizing: 'border-box' }
