'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'

type Escala = {
  id: number;
  nombre: string;
  activa: boolean;
  nivel: number;
  tipo: 'Planta' | 'Virtual';
  categoria: string;
  venta_min: number;
  sueldo_base: number;
  comision_pct: number;
}

type Vendedor = {
  id: number;
  nombre: string;
  carnet: string;
  foto?: string | null;
  tipo_vendedor?: 'Planta' | 'Virtual';
  cargo?: string;
}

const fmt = (n: number) => new Intl.NumberFormat('es-BO', { minimumFractionDigits: 2 }).format(n)

export default function ProgresoResponsivePage() {
  const [loading, setLoading] = useState(true)
  const [vendedor, setVendedor] = useState<Vendedor | null>(null)
  const [escalasTipo, setEscalasTipo] = useState<Escala[]>([])
  const [ventasReales, setVentasReales] = useState<number>(0)
  const [nivelActual, setNivelActual] = useState<Escala | null>(null)
  const [siguienteNivel, setSiguienteNivel] = useState<Escala | null>(null)
  const [progresoPct, setProgresoPct] = useState<number>(0)
  const [animarXP, setAnimarXP] = useState(false)

  const mascotaImg = '/mascota.png'

  useEffect(() => {
    cargarDatosReales()
  }, [])

  const cargarDatosReales = async () => {
    try {
      const carnetStorage = localStorage.getItem('carnet')
      if (!carnetStorage) {
        window.location.replace('/')
        return
      }

      const { data: personalData, error: errPersonal } = await supabase
        .from('personal')
        .select('*, cargos(nombre)')
        .eq('carnet', carnetStorage)
        .single()

      if (errPersonal || !personalData) {
        window.location.replace('/')
        return
      }

      const { data: vendedorData } = await supabase
        .from('vendedores')
        .select('*')
        .eq('personal_id', personalData.id)
        .maybeSingle()

      const nombreColaborador = vendedorData?.nombre || personalData.usuario || `Colaborador (${personalData.carnet})`
      const cargoColaborador = (personalData.cargos as any)?.nombre || personalData.cargo || 'Sin cargo asignado'
      const tipoDetectado: 'Planta' | 'Virtual' = vendedorData?.tipo || 'Planta'

      const datosVendedor: Vendedor = {
        id: vendedorData ? vendedorData.id : personalData.id,
        nombre: nombreColaborador,
        carnet: personalData.carnet,
        foto: personalData.foto_url || null,
        tipo_vendedor: tipoDetectado,
        cargo: cargoColaborador
      }
      setVendedor(datosVendedor)

      const { data: escalasData } = await supabase
        .from('escalas_vendedor')
        .select('*')
        .eq('activa', true)

      if (escalasData && escalasData.length > 0) {
        const escalasFiltradas = (escalasData as Escala[])
          .filter(e => e.tipo === tipoDetectado)
          .sort((a, b) => a.nivel - b.nivel)

        setEscalasTipo(escalasFiltradas)

        // Rango estricto del mes en curso
        const hoy = new Date()
        const anio = hoy.getFullYear()
        const mes = hoy.getMonth() + 1
        const mesStr = `${anio}-${String(mes).padStart(2, '0')}`
        const inicio = `${mesStr}-01`
        const fin = new Date(anio, mes, 0).toISOString().split('T')[0]

        let totalVendido = 0
        if (vendedorData) {
          // Consulta con filtro estricto de fechas y estado activo
          const { data: ventasData } = await supabase
            .from('ventas')
            .select('total_venta')
            .eq('cod_vendedor', vendedorData.id)
            .gte('fecha_pedido', inicio)
            .lte('fecha_pedido', fin)
            .gt('estado', 0)

          totalVendido = ventasData 
            ? ventasData.reduce((acc, curr) => acc + (Number(curr.total_venta) || 0), 0) 
            : 0
        }

        setVentasReales(totalVendido)
        evaluarProgreso(escalasFiltradas, totalVendido)
      }
    } catch (e) {
      console.error('Error cargando datos reales:', e)
    } finally {
      setLoading(false)
      setTimeout(() => setAnimarXP(true), 150)
    }
  }

  const evaluarProgreso = (escalas: Escala[], ventas: number) => {
    let actual = escalas[0]
    let siguiente = escalas[1] || null

    for (let i = 0; i < escalas.length; i++) {
      if (ventas >= escalas[i].venta_min) {
        actual = escalas[i]
        siguiente = escalas[i + 1] || null
      }
    }

    setNivelActual(actual)
    setSiguienteNivel(siguiente)

    if (siguiente) {
      const base = actual.venta_min
      const tope = siguiente.venta_min
      const avance = ventas - base
      const span = tope - base
      const pct = span > 0 ? Math.min(Math.max((avance / span) * 100, 0), 100) : 100
      setProgresoPct(pct)
    } else {
      setProgresoPct(ventas >= actual.venta_min ? 100 : 0)
    }
  }

  const esMaximoNivel = !siguienteNivel

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: '#001328', color: '#d4af37', fontFamily: 'Arial, sans-serif' }}>
        <div style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '8px' }}>Cargando tus registros...</div>
        <div style={{ color: '#88a0c0', fontSize: '13px' }}>MuebLess is Better</div>
      </div>
    )
  }

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', minHeight: '100vh', backgroundColor: '#001328', color: '#ffffff', padding: 'clamp(15px, 4vw, 35px) clamp(10px, 3vw, 20px)', boxSizing: 'border-box' }}>
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', background: 'linear-gradient(135deg, #002855 0%, #001a3d 100%)', padding: 'clamp(16px, 3vw, 24px)', borderRadius: '16px', border: '1px solid rgba(212, 175, 55, 0.3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ position: 'relative', width: '68px', height: '68px', flexShrink: 0, borderRadius: '50%', backgroundColor: '#ffffff', border: '3px solid #d4af37', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {vendedor?.foto ? (
                <img src={vendedor.foto} alt={vendedor.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <span style={{ fontSize: '22px', fontWeight: 'bold', color: '#002855' }}>{vendedor?.nombre?.charAt(0) || 'V'}</span>
              )}
            </div>
            <div>
              <span style={{ color: '#d4af37', fontSize: '11px', textTransform: 'uppercase', fontWeight: 'bold' }}>
                {vendedor?.tipo_vendedor} B2C • {vendedor?.cargo}
              </span>
              <h1 style={{ margin: '2px 0 2px', fontSize: 'clamp(18px, 2.5vw, 22px)', color: '#ffffff' }}>{vendedor?.nombre}</h1>
              <span style={{ color: '#94a3b8', fontSize: '12px' }}>Categoría: <strong style={{ color: '#d4af37' }}>{nivelActual?.categoria}</strong></span>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase' }}>Ventas del Mes</div>
            <div style={{ fontSize: 'clamp(20px, 3vw, 24px)', fontWeight: 'bold', color: '#d4af37' }}>{fmt(ventasReales)} <span style={{ fontSize: '12px', color: '#fff' }}>Bs.</span></div>
          </div>
        </div>

        <div style={{ background: 'linear-gradient(180deg, #00234a 0%, #001730 100%)', borderRadius: '16px', padding: 'clamp(20px, 3vw, 28px)', border: '1px solid rgba(255,255,255,0.08)', marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#cbd5e1' }}>
              Siguiente Meta: <span style={{ color: '#d4af37' }}>{siguienteNivel ? siguienteNivel.categoria : '¡Rango Máximo! 🌟'}</span>
            </span>
            <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#d4af37' }}>{progresoPct.toFixed(1)}%</span>
          </div>

          <div style={{ width: '100%', height: '16px', backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: '8px', overflow: 'hidden', padding: '2px', border: '1px solid rgba(212,175,55,0.2)' }}>
            <div style={{ 
              width: animarXP ? `${progresoPct}%` : '0%', 
              height: '100%', 
              background: 'linear-gradient(90deg, #b8860b, #d4af37, #fef08a)', 
              borderRadius: '6px', 
              transition: 'width 1.2s cubic-bezier(0.1, 1, 0.1, 1)'
            }} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#94a3b8', marginTop: '8px' }}>
            <span>Mes en curso: {fmt(ventasReales)} Bs.</span>
            <span>{siguienteNivel ? `Faltan ${fmt(siguienteNivel.venta_min - ventasReales)} Bs.` : 'Completado'}</span>
            <span>Meta: {siguienteNivel ? fmt(siguienteNivel.venta_min) + ' Bs.' : 'MAX'}</span>
          </div>
        </div>

        <h3 style={{ fontSize: '14px', color: '#d4af37', marginBottom: '14px', textTransform: 'uppercase' }}>Mapa de Niveles — MuebLess is Better</h3>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {escalasTipo.map((esc) => {
            const esAlcanzado = ventasReales >= esc.venta_min
            const esActual = nivelActual?.id === esc.id

            return (
              <div key={esc.id} style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between', 
                padding: '14px 18px', 
                borderRadius: '12px', 
                background: esActual ? 'rgba(212, 175, 55, 0.12)' : esAlcanzado ? 'rgba(0, 40, 85, 0.6)' : 'rgba(255, 255, 255, 0.02)',
                border: esActual ? '2px solid #d4af37' : esAlcanzado ? '1px solid rgba(212, 175, 55, 0.3)' : '1px solid rgba(255, 255, 255, 0.05)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0, flex: 1 }}>
                  <div style={{ 
                    width: '34px', height: '34px', flexShrink: 0, borderRadius: '50%', 
                    backgroundColor: esAlcanzado ? '#d4af37' : 'rgba(255,255,255,0.1)', 
                    color: esAlcanzado ? '#001328' : '#64748b', 
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '13px'
                  }}>
                    {esAlcanzado ? '✓' : esc.nivel}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: '13px', fontWeight: 'bold', color: esActual ? '#d4af37' : '#ffffff' }}>
                      Nivel {esc.nivel}: {esc.categoria} {esActual && ' 📍'}
                    </div>
                    <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                      Mín: {fmt(esc.venta_min)} Bs. | Com: <strong style={{ color: '#d4af37' }}>{esc.comision_pct}%</strong>
                    </div>
                  </div>
                </div>

                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <span style={{ 
                    fontSize: '10px', fontWeight: 'bold', padding: '4px 8px', borderRadius: '6px', display: 'inline-block',
                    backgroundColor: esAlcanzado ? 'rgba(34, 197, 94, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                    color: esAlcanzado ? '#4ade80' : '#94a3b8'
                  }}>
                    {esAlcanzado ? 'DESBLOQUEADO' : 'BLOQUEADO'}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}