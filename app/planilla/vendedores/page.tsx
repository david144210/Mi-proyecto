'use client'

// app/planilla/vendedores/page.tsx
// Planilla de Comisiones de Vendedores conectada al Sistema de Ventas de Supabase

import { useEffect, useState, useMemo, useCallback } from 'react'
import { supabase } from '../../../lib/supabase'

// ── Utilidades de Fechas ──────────────────────────────────────────────────────
const getRangoFechas = (mesStr: string) => {
  const [anio, mes] = mesStr.split('-')
  const inicio = `${mesStr}-01`
  const fin = new Date(parseInt(anio), parseInt(mes), 0).toISOString().split('T')[0]
  return { inicio, fin }
}

const fmt = (n: number) => n.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// ── Tipos ────────────────────────────────────────────────────────────────────
type TipoVendedor = 'Planta' | 'Virtual' | string

type Vendedor = {
  id: number
  nombre: string
  ci: string
  alias: string | null
  tipo: TipoVendedor
  activo: boolean
  bono_digital: boolean
  personal_id: number | null
  personal?: { id: number; usuario: string; carnet: string; cargo: string }
}

type Escala = {
  id: number
  nombre?: string
  temporada?: string
  activa: boolean
  nivel: number
  tipo: TipoVendedor
  categoria: string
  venta_min: number
  sueldo_base: number
  comision_pct: number
}

// Mapa de colores por nivel de escala
const NIVEL_COLOR: Record<number, string> = {
  1: '#64748b', // Gris
  2: '#2563eb', // Azul
  3: '#0891b2', // Cyan
  4: '#059669', // Verde
  5: '#d97706', // Naranja
  6: '#7c3aed', // Púrpura
}

export default function PlanillaVendedores() {
  const [vendedores, setVendedores] = useState<Vendedor[]>([])
  const [escalas, setEscalas] = useState<Escala[]>([])
  const [temporadaSel, setTemporadaSel] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [filtroTipo, setFiltroTipo] = useState<string>('')

  // Selección de Mes libre (AAAA-MM)
  const [mesSeleccionado, setMesSeleccionado] = useState(() => {
    const hoy = new Date()
    return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`
  })

  // Ventas automáticas calculadas desde Supabase: { [cod_vendedor]: montoTotalVendido }
  const [mapaVentas, setMapaVentas] = useState<Record<number, number>>({})

  useEffect(() => {
    const carnet = localStorage.getItem('carnet')
    if (!carnet) return void (window.location.replace('/'))

    supabase.from('personal').select('*, cargos(*)').eq('carnet', carnet).eq('estado', true).single()
      .then(({ data }) => {
        if (!data) return window.location.replace('/')
        const c = data.cargos
        if (!c?.es_admin && !c?.puede_gestionar_rrhh && !c?.puede_ver_planillas) {
          return window.location.replace('/sistema')
        }
        Promise.all([loadVendedores(), loadEscalas()]).finally(() => setLoading(false))
      })
  }, [])

  const loadVendedores = async () => {
    const { data } = await supabase
      .from('vendedores')
      .select('id, nombre, ci, alias, tipo, activo, bono_digital, personal_id, personal(id, usuario, carnet, cargo)')
      .eq('activo', true)
      .order('nombre')
    setVendedores((data as any) || [])
  }

  const loadEscalas = async () => {
    const { data } = await supabase
      .from('escalas_vendedor')
      .select('*')
      .eq('activa', true)
      .order('nivel', { ascending: true })
    
    const listaEscalas = (data as any) || []
    setEscalas(listaEscalas)

    const temporadas = Array.from(new Set(listaEscalas.map((e: Escala) => e.temporada).filter(Boolean)))
    if (temporadas.length > 0) {
      const temporada2026 = temporadas.find(t => String(t).includes('2026')) || temporadas[0]
      setTemporadaSel(String(temporada2026))
    }
  }

  // ── Cargar Ventas Automáticas desde Supabase según el Mes ──────────────────
  const cargarVentasMes = useCallback(async (mesStr: string) => {
    const { inicio, fin } = getRangoFechas(mesStr)

    // Consulta de ventas válidas en la tabla 'ventas'
    const { data: ventas, error } = await supabase
      .from('ventas')
      .select('cod_vendedor, total_venta')
      .gte('fecha_pedido', inicio)
      .lte('fecha_pedido', fin)
      .gt('estado', 0) // Excluir ventas anuladas

    if (error) {
      console.error('Error cargando ventas automáticas:', error)
      return
    }

    // Agrupar y sumar montos por vendedor
    const mapaTotales: Record<number, number> = {}
    ventas?.forEach((v: any) => {
      const codVendedor = v.cod_vendedor
      const monto = Number(v.total_venta) || 0
      if (codVendedor) {
        mapaTotales[codVendedor] = (mapaTotales[codVendedor] || 0) + monto
      }
    })

    setMapaVentas(mapaTotales)
  }, [])

  useEffect(() => {
    cargarVentasMes(mesSeleccionado)
  }, [mesSeleccionado, cargarVentasMes])

  // ── Temporadas disponibles ──────────────────────────────────────────────────
  const temporadasDisponibles = useMemo(() => {
    const set = new Set<string>()
    escalas.forEach(e => {
      if (e.temporada) set.add(e.temporada)
    })
    return Array.from(set)
  }, [escalas])

  // ── Escalas filtradas por temporada ─────────────────────────────────────────
  const escalasActuales = useMemo(() => {
    if (!temporadaSel) return escalas
    return escalas.filter(e => e.temporada === temporadaSel)
  }, [escalas, temporadaSel])

  const escalasPlanta = useMemo(() => {
    return escalasActuales.filter(e => (e.tipo || '').toString().trim().toLowerCase() === 'planta')
  }, [escalasActuales])

  const escalasVirtual = useMemo(() => {
    return escalasActuales.filter(e => (e.tipo || '').toString().trim().toLowerCase() === 'virtual')
  }, [escalasActuales])

  // ── Función de cálculo individual ──────────────────────────────────────────
  const calcularComision = (v: Vendedor, ventaMonto: number) => {
    const tipoVendedor = (v.tipo || '').toString().trim().toLowerCase()

    const escalasDelTipo = escalasActuales
      .filter(e => (e.tipo || '').toString().trim().toLowerCase() === tipoVendedor)
      .sort((a, b) => a.venta_min - b.venta_min)
    
    if (escalasDelTipo.length === 0) {
      return { escalaAlcanzada: null, sueldoBase: 0, pctBase: 0, pctBono: 0, pctTotal: 0, montoComision: 0, totalNeto: 0 }
    }

    let escalaAlcanzada = escalasDelTipo[0]
    for (const esc of escalasDelTipo) {
      if (ventaMonto >= esc.venta_min) {
        escalaAlcanzada = esc
      } else {
        break
      }
    }

    const pctBase = escalaAlcanzada.comision_pct || 0
    const pctBono = v.bono_digital ? 0.5 : 0.0
    const pctTotal = pctBase + pctBono
    const montoComision = ventaMonto * (pctTotal / 100)

    // Planta: 0 de Sueldo Base en esta planilla.
    // Virtual: Sueldo Base asignado en la escala.
    const sueldoBase = tipoVendedor === 'planta' ? 0 : (escalaAlcanzada.sueldo_base || 0)
    const totalNeto = sueldoBase + montoComision

    return { escalaAlcanzada, sueldoBase, pctBase, pctBono, pctTotal, montoComision, totalNeto }
  }

  // ── Lista procesada con Ventas Automáticas ──────────────────────────────
  const calculosPlanilla = useMemo(() => {
    return vendedores.map(v => {
      const vNum = mapaVentas[v.id] || 0
      const calc = calcularComision(v, vNum)
      return { vendedor: v, ventaMonto: vNum, ...calc }
    })
  }, [vendedores, escalasActuales, mapaVentas])

  const planillaFiltrada = useMemo(() => {
    return calculosPlanilla.filter(item => {
      const tipo = (item.vendedor.tipo || '').toString().trim().toLowerCase()
      if (filtroTipo && tipo !== filtroTipo.toLowerCase()) return false
      if (busqueda) {
        const q = busqueda.toLowerCase()
        const v = item.vendedor
        const match = [v.nombre, v.ci, v.alias, v.personal?.usuario].some(s => s?.toLowerCase().includes(q))
        if (!match) return false
      }
      return true
    })
  }, [calculosPlanilla, filtroTipo, busqueda])

  // Totales acumulados
  const totales = useMemo(() => {
    return calculosPlanilla.reduce((acc, curr) => ({
      totalVentas: acc.totalVentas + curr.ventaMonto,
      totalSueldosVirtual: acc.totalSueldosVirtual + curr.sueldoBase,
      totalComisiones: acc.totalComisiones + curr.montoComision,
      totalNetoPagar: acc.totalNetoPagar + curr.totalNeto,
    }), { totalVentas: 0, totalSueldosVirtual: 0, totalComisiones: 0, totalNetoPagar: 0 })
  }, [calculosPlanilla])

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Arial, sans-serif' }}>
      <p style={{ color: '#002855', fontWeight: 'bold' }}>Cargando datos de comisiones...</p>
    </div>
  )

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', minHeight: '100vh', backgroundColor: '#f8fafc', paddingBottom: '60px' }}>
      
      {/* Navbar Superior */}
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 40px', backgroundColor: '#002855', color: 'white', flexWrap: 'wrap', gap: '15px' }}>
        <a href="/rrhh" style={{ fontWeight: 'bold', fontSize: '15px', color: 'white', textDecoration: 'none' }}>← Volver a RRHH</a>
        
        <span style={{ color: '#d4af37', fontWeight: 'bold', letterSpacing: '0.05em', fontSize: '16px' }}>
          MUEBLESS IS BETTER — Planilla de Comisiones
        </span>
        
        {/* Selectores de Mes Libre y Temporada */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          
          {/* SELECTOR DE MES CUALQUIERA (INPUT TYPE MONTH) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: 'rgba(255,255,255,0.08)', padding: '4px 10px', borderRadius: '6px' }}>
            <span style={{ fontSize: '11px', color: '#d4af37', textTransform: 'uppercase', fontWeight: 'bold' }}>📅 Mes de Evaluación:</span>
            <input 
              type="month" 
              value={mesSeleccionado}
              onChange={(e) => setMesSeleccionado(e.target.value)}
              style={{
                padding: '4px 8px', borderRadius: '4px', border: '1px solid #d4af37',
                backgroundColor: '#ffffff', color: '#002855', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer', outline: 'none'
              }}
            />
          </div>

          {/* SELECTOR DE TEMPORADA */}
          {temporadasDisponibles.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: 'rgba(255,255,255,0.08)', padding: '4px 10px', borderRadius: '6px' }}>
              <span style={{ fontSize: '11px', color: '#d4af37', textTransform: 'uppercase', fontWeight: 'bold' }}>🏆 Temporada:</span>
              <select 
                value={temporadaSel} 
                onChange={e => setTemporadaSel(e.target.value)}
                style={{ padding: '5px 10px', borderRadius: '4px', border: '1px solid #d4af37', backgroundColor: '#ffffff', color: '#002855', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer', outline: 'none' }}
              >
                {temporadasDisponibles.map(temp => (
                  <option key={temp} value={temp}>{temp}</option>
                ))}
              </select>
            </div>
          )}

        </div>
      </nav>

      <div style={{ padding: '28px 40px', maxWidth: '1280px', margin: '0 auto' }}>

        {/* Banner Informativo */}
        <div style={{ backgroundColor: '#e0f2fe', borderLeft: '4px solid #0284c7', padding: '12px 18px', borderRadius: '6px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <span style={{ color: '#0369a1', fontWeight: 'bold', fontSize: '14px' }}>
            Periodo seleccionado: <u style={{ textUnderlineOffset: '3px' }}>{mesSeleccionado}</u>
          </span>
          <span style={{ fontSize: '12px', color: '#0284c7', fontWeight: 'bold' }}>
            ⚡ Montos de ventas calculados automáticamente desde el Sistema de Ventas
          </span>
        </div>

        {/* Sección de Escalas */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h2 style={{ margin: 0, color: '#002855', fontSize: '20px' }}>
              Escalas Salariales — B2C Planta y Virtual
            </h2>
            <span style={{ fontSize: '12px', color: '#64748b', fontStyle: 'italic' }}>
              * Personal Planta cobra solo comisión en esta planilla.
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(480px, 1fr))', gap: '20px' }}>
            
            {/* Escalas Planta */}
            <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '18px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <h4 style={{ margin: '0 0 12px', color: '#002855', fontSize: '14px', borderBottom: '2px solid #002855', paddingBottom: '6px' }}>
                🏢 Personal de Planta (Sólo Comisión)
              </h4>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' as const }}>
                {escalasPlanta.map(e => (
                  <div key={e.id} style={{ flex: '1 1 130px', backgroundColor: (NIVEL_COLOR[e.nivel] || '#64748b') + '10', border: `1px solid ${NIVEL_COLOR[e.nivel] || '#64748b'}`, borderRadius: '6px', padding: '10px' }}>
                    <p style={{ margin: 0, fontSize: '10px', fontWeight: 'bold', color: NIVEL_COLOR[e.nivel], textTransform: 'uppercase' }}>
                      Niv {e.nivel} · {e.categoria}
                    </p>
                    <p style={{ margin: '4px 0 2px', fontSize: '11px', color: '#475569' }}>
                      Desde Bs. {fmt(e.venta_min)}
                    </p>
                    <p style={{ margin: 0, fontSize: '13px', fontWeight: 'bold', color: '#0f172a' }}>
                      {e.comision_pct}% com.
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Escalas Virtual */}
            <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '18px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <h4 style={{ margin: '0 0 12px', color: '#8a6d0b', fontSize: '14px', borderBottom: '2px solid #d4af37', paddingBottom: '6px' }}>
                💻 Personal Virtual / Freelance (Sueldo + Comisión)
              </h4>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' as const }}>
                {escalasVirtual.map(e => (
                  <div key={e.id} style={{ flex: '1 1 130px', backgroundColor: (NIVEL_COLOR[e.nivel] || '#64748b') + '10', border: `1px solid ${NIVEL_COLOR[e.nivel] || '#64748b'}`, borderRadius: '6px', padding: '10px' }}>
                    <p style={{ margin: 0, fontSize: '10px', fontWeight: 'bold', color: NIVEL_COLOR[e.nivel], textTransform: 'uppercase' }}>
                      Niv {e.nivel} · {e.categoria}
                    </p>
                    <p style={{ margin: '4px 0 2px', fontSize: '11px', color: '#475569' }}>
                      Desde Bs. {fmt(e.venta_min)}
                    </p>
                    <p style={{ margin: 0, fontSize: '12px', fontWeight: 'bold', color: '#0f172a' }}>
                      Bs. {fmt(e.sueldo_base)} + {e.comision_pct}%
                    </p>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>

        {/* Tarjetas de Resumen */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px', marginBottom: '24px' }}>
          <div style={cardStatSt}>
            <p style={cardLabelSt}>Total Ventas del Mes</p>
            <p style={{ ...cardValSt, color: '#002855' }}>Bs. {fmt(totales.totalVentas)}</p>
          </div>
          <div style={cardStatSt}>
            <p style={cardLabelSt}>Sueldos Base (Virtual)</p>
            <p style={{ ...cardValSt, color: '#334155' }}>Bs. {fmt(totales.totalSueldosVirtual)}</p>
          </div>
          <div style={cardStatSt}>
            <p style={cardLabelSt}>Total Comisiones</p>
            <p style={{ ...cardValSt, color: '#15803d' }}>Bs. {fmt(totales.totalComisiones)}</p>
          </div>
          <div style={{ ...cardStatSt, backgroundColor: '#002855', color: 'white' }}>
            <p style={{ ...cardLabelSt, color: '#d4af37' }}>NETO A PAGAR</p>
            <p style={{ ...cardValSt, color: '#ffffff' }}>Bs. {fmt(totales.totalNetoPagar)}</p>
          </div>
        </div>

        {/* Filtros */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' as const }}>
          <input 
            value={busqueda} 
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, CI o usuario..."
            style={{ flex: 1, minWidth: '240px', padding: '10px 14px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', outline: 'none' }} 
          />
          <select 
            value={filtroTipo} 
            onChange={e => setFiltroTipo(e.target.value)}
            style={{ padding: '10px 14px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', outline: 'none', backgroundColor: 'white' }}
          >
            <option value="">Todos los tipos</option>
            <option value="Planta">Planta</option>
            <option value="Virtual">Virtual</option>
          </select>
        </div>

        {/* Tabla de Planilla */}
        <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0', overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '950px' }}>
            <thead>
              <tr style={{ backgroundColor: '#f1f5f9', borderBottom: '2px solid #cbd5e1' }}>
                <th style={thSt}>Vendedor</th>
                <th style={thSt}>Tipo</th>
                <th style={{ ...thSt, width: '170px', textAlign: 'right' }}>Venta Sistema (Bs.)</th>
                <th style={thSt}>Nivel</th>
                <th style={thSt}>Sueldo Base</th>
                <th style={thSt}>% Comisión</th>
                <th style={thSt}>Monto Comisión</th>
                <th style={{ ...thSt, backgroundColor: '#002855', color: '#d4af37' }}>Neto a Pagar</th>
                <th style={{ ...thSt, textAlign: 'center' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {planillaFiltrada.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8', fontSize: '14px' }}>
                    No se encontraron vendedores registrados.
                  </td>
                </tr>
              )}
              {planillaFiltrada.map((item, i) => {
                const v = item.vendedor
                const esc = item.escalaAlcanzada
                const colorNivel = esc ? (NIVEL_COLOR[esc.nivel] || '#64748b') : '#94a3b8'
                const esPlanta = (v.tipo || '').toString().trim().toLowerCase() === 'planta'

                return (
                  <tr key={v.id} style={{ borderBottom: '1px solid #f1f5f9', backgroundColor: i % 2 === 0 ? 'white' : '#fafafa' }}>
                    
                    {/* Vendedor */}
                    <td style={tdSt}>
                      <span style={{ fontWeight: 'bold', color: '#002855', fontSize: '14px' }}>{v.nombre}</span>
                      <span style={{ display: 'block', fontSize: '11px', color: '#64748b' }}>
                        {v.personal?.cargo || 'Vendedor'} · CI: {v.ci}
                      </span>
                    </td>

                    {/* Tipo / Modalidad */}
                    <td style={tdSt}>
                      <span style={{ backgroundColor: esPlanta ? '#e6f0fa' : '#fef9e7', color: esPlanta ? '#002855' : '#8a6d0b', borderRadius: '4px', padding: '3px 8px', fontSize: '11px', fontWeight: 'bold' }}>
                        {v.tipo}
                      </span>
                      {v.bono_digital && (
                        <span style={{ display: 'inline-block', marginLeft: '6px', backgroundColor: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', borderRadius: '4px', padding: '2px 6px', fontSize: '10px', fontWeight: 'bold' }}>
                          +0.5%
                        </span>
                      )}
                    </td>

                    {/* Venta Total Automática */}
                    <td style={{ ...tdSt, textAlign: 'right', fontWeight: 'bold', color: item.ventaMonto > 0 ? '#002855' : '#94a3b8', fontSize: '14px' }}>
                      Bs. {fmt(item.ventaMonto)}
                    </td>

                    {/* Nivel */}
                    <td style={tdSt}>
                      {esc ? (
                        <span style={{ backgroundColor: colorNivel + '15', color: colorNivel, border: `1px solid ${colorNivel}`, borderRadius: '4px', padding: '3px 8px', fontSize: '11px', fontWeight: 'bold' }}>
                          Niv {esc.nivel} - {esc.categoria}
                        </span>
                      ) : (
                        <span style={{ color: '#94a3b8', fontSize: '12px' }}>Sin escala</span>
                      )}
                    </td>

                    {/* Sueldo Base */}
                    <td style={{ ...tdSt, fontSize: '12px' }}>
                      {esPlanta ? (
                        <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>En Planilla General</span>
                      ) : (
                        <span style={{ fontWeight: 'bold', color: '#334155' }}>Bs. {fmt(item.sueldoBase)}</span>
                      )}
                    </td>

                    {/* % Comisión */}
                    <td style={tdSt}>
                      <span style={{ fontWeight: 'bold', color: '#0f172a' }}>{item.pctTotal.toFixed(1)}%</span>
                      {v.bono_digital && (
                        <span style={{ fontSize: '10px', color: '#166534', display: 'block' }}>
                          ({item.pctBase}% + 0.5%)
                        </span>
                      )}
                    </td>

                    {/* Monto Comisión */}
                    <td style={{ ...tdSt, fontWeight: 'bold', color: '#15803d' }}>
                      Bs. {fmt(item.montoComision)}
                    </td>

                    {/* Neto a Pagar */}
                    <td style={{ ...tdSt, fontWeight: 'bold', fontSize: '14px', backgroundColor: '#f8fafc', color: '#002855' }}>
                      Bs. {fmt(item.totalNeto)}
                    </td>

                    {/* Acciones */}
                    <td style={{ ...tdSt, textAlign: 'center' }}>
                      <button 
                        onClick={() => alert(`Generando PDF para ${v.nombre} (${mesSeleccionado})...`)}
                        style={{ padding: '4px 8px', fontSize: '11px', backgroundColor: '#e2e8f0', border: '1px solid #cbd5e1', borderRadius: '4px', cursor: 'pointer', color: '#334155', fontWeight: 'bold' }}
                      >
                        Ver PDF
                      </button>
                    </td>

                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

      </div>
    </div>
  )
}

// ─── Estilos ──────────────────────────────────────────────────────────────────
const thSt: React.CSSProperties = { padding: '12px 14px', textAlign: 'left', fontSize: '11px', fontWeight: 'bold', color: '#002855', textTransform: 'uppercase', letterSpacing: '0.05em' }
const tdSt: React.CSSProperties = { padding: '12px 14px', fontSize: '13px' }
const cardStatSt: React.CSSProperties = { backgroundColor: 'white', borderRadius: '8px', padding: '16px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }
const cardLabelSt: React.CSSProperties = { margin: 0, fontSize: '10px', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }
const cardValSt: React.CSSProperties = { margin: '4px 0 0', fontSize: '20px', fontWeight: 'bold' }