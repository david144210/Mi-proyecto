'use client'

// app/rrhh/page.tsx
// Panel principal de RRHH — acceso solo admin o puede_gestionar_rrhh

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function PanelRRHH() {
  const [usuario, setUsuario] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const carnet = localStorage.getItem('carnet')
    if (!carnet) return void (window.location.replace('/'))
    supabase.from('personal').select('*, cargos(*)')
      .eq('carnet', carnet).eq('estado', true).single()
      .then(({ data }) => {
        if (!data) return window.location.replace('/')
        const c = data.cargos
        if (!c?.es_admin && !c?.puede_gestionar_rrhh) return window.location.replace('/sistema')
        setUsuario(data)
        setLoading(false)
      })
  }, [])

  if (loading) return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: '#999', fontFamily: 'Arial, sans-serif' }}>Cargando...</p>
    </div>
  )

  const modulos = [
    { href: '/rrhh/turnos',   emoji: '🕐', titulo: 'Turnos',                 desc: 'Horarios de entrada y salida por cargo y sucursal' },
    { href: '/rrhh/planilla', emoji: '⚙️', titulo: 'Config. Planilla',       desc: 'Sanciones, horas extra y seguro de salud' },
    { href: '/rrhh/cargos',   emoji: '🔑', titulo: 'Cargos y Permisos',      desc: 'Accesos al sistema por tipo de cargo' },
    { href: '/rrhh/personal', emoji: '👤', titulo: 'Personal',               desc: 'Datos, sueldo base, cargo y sucursal' },
    { href: '/asistencia', emoji: '🕵️‍♀️🕵️‍♂️', titulo: 'Asistencia',               desc: 'Control de asistencia y permisos' },
{ href: '/planilla', emoji: '✍', titulo: 'Planilla de sueldos',               desc: 'Control de asistencia y permisos' },
{ href: '/rrhh/escalas', emoji: '📊', titulo: 'Escalas Salariales',               desc: 'Control de asistencia y permisos' },
{ href: '/rrhh/vendedores', emoji: '🤞', titulo: 'Asignacion de vendedores',               desc: 'Control de asistencia y permisos' },

]

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', minHeight: '100vh', backgroundColor: '#f5f5f5' }}>
      <nav style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '15px 40px', backgroundColor: '#222', color: 'white', boxSizing: 'border-box' as const,
      }}>
        <a href="/sistema" style={{ fontWeight: 'bold', fontSize: '18px', color: 'white', textDecoration: 'none' }}>← Sistema</a>
        <span style={{ color: '#a3c47d', fontWeight: 'bold', fontSize: '14px' }}>Recursos Humanos</span>
        <span style={{ color: '#888', fontSize: '13px' }}>{usuario?.usuario}</span>
      </nav>

      <div style={{ padding: '40px', maxWidth: '900px', margin: '0 auto' }}>
        <h1 style={{ marginBottom: '6px', fontSize: '24px' }}>Panel RRHH</h1>
        <p style={{ color: '#888', marginBottom: '36px', fontSize: '14px' }}>
          Gestión de personal, turnos y configuración de planilla
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
          {modulos.map(m => (
            <a key={m.href} href={m.href} style={{
              backgroundColor: 'white', borderRadius: '16px', padding: '28px',
              boxShadow: '0 2px 12px rgba(0,0,0,0.08)', textDecoration: 'none',
              color: '#222', textAlign: 'center' as const, display: 'block',
            }}>
              <div style={{ fontSize: '40px', marginBottom: '12px' }}>{m.emoji}</div>
              <h3 style={{ margin: '0 0 6px', fontSize: '15px' }}>{m.titulo}</h3>
              <p style={{ margin: 0, fontSize: '12px', color: '#999', lineHeight: 1.6 }}>{m.desc}</p>
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}
