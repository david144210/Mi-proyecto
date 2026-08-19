'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import Link from 'next/link'

type Escala = {
  id: number;
  nivel: number;
  tipo: 'Planta' | 'Virtual';
  categoria: string;
  venta_min: number;
}

const fmt = (n: number) => new Intl.NumberFormat('es-BO', { minimumFractionDigits: 0 }).format(n)

export default function ProgresoWidget() {
  const [loading, setLoading] = useState(true)
  const [ventasReales, setVentasReales] = useState<number>(0)
  const [nivelActual, setNivelActual] = useState<Escala | null>(null)
  const [siguienteNivel, setSiguienteNivel] = useState<Escala | null>(null)
  const [progresoPct, setProgresoPct] = useState<number>(0)

  useEffect(() => {
    cargarResumenProgreso()
  }, [])

  const cargarResumenProgreso = async () => {
    try {
      const carnetStorage = localStorage.getItem('carnet')
      if (!carnetStorage) return

      const { data: personalData } = await supabase
        .from('personal')
        .select('id')
        .eq('carnet', carnetStorage)
        .single()

      if (!personalData) return

      const { data: vendedorData } = await supabase
        .from('vendedores')
        .select('*')
        .eq('personal_id', personalData.id)
        .maybeSingle()

      const tipoDetectado = vendedorData?.tipo || 'Planta'

      const { data: escalasData } = await supabase
        .from('escalas_vendedor')
        .select('*')
        .eq('activa', true)

      if (escalasData) {
        const filtradas = (escalasData as Escala[])
          .filter(e => e.tipo === tipoDetectado)
          .sort((a, b) => a.nivel - b.nivel)

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

        let actual = filtradas[0]
        let siguiente = filtradas[1] || null

        for (let i = 0; i < filtradas.length; i++) {
          if (totalVendido >= filtradas[i].venta_min) {
            actual = filtradas[i]
            siguiente = filtradas[i + 1] || null
          }
        }

        setNivelActual(actual)
        setSiguienteNivel(siguiente)

        if (siguiente) {
          const base = actual.venta_min
          const tope = siguiente.venta_min
          const avance = totalVendido - base
          const span = tope - base
          const pct = span > 0 ? Math.min(Math.max((avance / span) * 100, 0), 100) : 100
          setProgresoPct(pct)
        } else {
          setProgresoPct(totalVendido >= actual.venta_min ? 100 : 0)
        }
      }
    } catch (e) {
      console.error('Error cargando widget de progreso:', e)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return null

  return (
    <div style={{ 
      background: 'linear-gradient(135deg, #002855 0%, #001730 100%)', 
      borderRadius: '16px', 
      padding: '20px 24px', 
      border: '1px solid rgba(212, 175, 55, 0.3)', 
      boxShadow: '0 8px 20px rgba(0,0,0,0.3)',
      color: '#ffffff',
      fontFamily: 'Arial, sans-serif',
      marginBottom: '24px'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '20px' }}>⭐</span>
          <div>
            <h3 style={{ margin: 0, fontSize: '15px', color: '#ffffff' }}>Tu Progreso de Comisiones (Mes en Curso)</h3>
            <span style={{ fontSize: '12px', color: '#d4af37', fontWeight: 'bold' }}>Nivel {nivelActual?.nivel}: {nivelActual?.categoria}</span>
          </div>
        </div>
        <Link href="/dashboard/progreso" style={{ 
          fontSize: '12px', 
          color: '#002855', 
          backgroundColor: '#d4af37', 
          padding: '6px 14px', 
          borderRadius: '8px', 
          textDecoration: 'none', 
          fontWeight: 'bold',
          boxShadow: '0 2px 8px rgba(212,175,55,0.4)'
        }}>
          Ver Mapa Completo →
        </Link>
      </div>

      <div style={{ margin: '14px 0 8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px', color: '#cbd5e1' }}>
          <span>Progreso a: <strong style={{ color: '#fff' }}>{siguienteNivel ? siguienteNivel.categoria : 'Cima alcanzada 🏆'}</strong></span>
          <span style={{ color: '#d4af37', fontWeight: 'bold' }}>{progresoPct.toFixed(0)}%</span>
        </div>
        <div style={{ width: '100%', height: '10px', backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: '5px', overflow: 'hidden', border: '1px solid rgba(212,175,55,0.2)' }}>
          <div style={{ 
            width: `${progresoPct}%`, 
            height: '100%', 
            background: 'linear-gradient(90deg, #b8860b, #d4af37, #fef08a)', 
            borderRadius: '4px',
            transition: 'width 1s ease-in-out'
          }} />
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#94a3b8' }}>
        <span>Ventas del mes: {fmt(ventasReales)} Bs.</span>
        <span>{siguienteNivel ? `Faltan ${fmt(siguienteNivel.venta_min - ventasReales)} Bs.` : '¡Máximo nivel!'}</span>
      </div>
    </div>
  )
}