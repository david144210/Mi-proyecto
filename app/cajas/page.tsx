'use client'

import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../../lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────
type Gasto = {
  id: number
  monto: number
  descripcion: string
  categoria_id: number
  sucursal_id: number
  estado: 'pendiente' | 'aprobado' | 'rechazado'
  comprobante?: string
  created_at: string
  aprobado_por?: number
  registrado_por: number
  categorias?: { nombre: string; color: string; icono: string }
  sucursales?: { nombre: string }
  aprobador?: { nombre: string }
  registrador?: { nombre: string }
}

type Categoria = { id: number; nombre: string; color: string; icono: string }
type Sucursal  = { id: number; nombre: string }

// ─── Colores de estado ────────────────────────────────────────────────────────
const ESTADO_CFG = {
  pendiente:  { label: 'Pendiente',  bg: 'bg-amber-100',   text: 'text-amber-700',  dot: 'bg-amber-400'  },
  aprobado:   { label: 'Aprobado',   bg: 'bg-emerald-100', text: 'text-emerald-700',dot: 'bg-emerald-500' },
  rechazado:  { label: 'Rechazado',  bg: 'bg-red-100',     text: 'text-red-700',    dot: 'bg-red-500'    },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  new Intl.NumberFormat('es-BO', { style: 'currency', currency: 'BOB', maximumFractionDigits: 2 }).format(n)

const fmtFecha = (s: string) =>
  new Date(s).toLocaleDateString('es-BO', { day: '2-digit', month: 'short', year: 'numeric' })

// ─── Main Component ───────────────────────────────────────────────────────────
export default function CajaChicaPro() {
  const [usuario,     setUsuario]     = useState<any>(null)
  const [gastos,      setGastos]      = useState<Gasto[]>([])
  const [categorias,  setCategorias]  = useState<Categoria[]>([])
  const [sucursales,  setSucursales]  = useState<Sucursal[]>([])
  const [loading,     setLoading]     = useState(true)
  const [esAdmin,     setEsAdmin]     = useState(false)
  const [puedeVerCaja,setPuedeVerCaja]= useState(false)

  // Filtros
  const [filtroSucursal,  setFiltroSucursal]  = useState<number | 'todas'>('todas')
  const [filtroEstado,    setFiltroEstado]    = useState<string>('todos')
  const [filtroCategoria, setFiltroCategoria] = useState<number | 'todas'>('todas')

  // Modal registro
  const [modalAbierto, setModalAbierto] = useState(false)
  const [form, setForm] = useState({ monto: '', descripcion: '', categoria_id: '', sucursal_id: '' })
  const [guardando, setGuardando] = useState(false)

  // Modal detalle / aprobar
  const [gastoDetalle, setGastoDetalle] = useState<Gasto | null>(null)
  const [procesando,   setProcesando]   = useState(false)

  // ── Init ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      try {
        const carnet = localStorage.getItem('carnet')
        if (!carnet) return setLoading(false)

        const { data: userData } = await supabase
          .from('personal')
          .select('*, cargos(*)')
          .eq('carnet', carnet)
          .single()

        setUsuario(userData)

        const cargo = userData?.cargos
        const admin = cargo?.puede_editar_tienda === true
        const verCaja = cargo?.puede_ver_caja_chica === true || admin

        setEsAdmin(admin)
        setPuedeVerCaja(verCaja)

        if (!verCaja) return setLoading(false)

        await Promise.all([loadCategorias(), loadSucursales()])
        await loadGastos(admin, userData?.id)
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [])

  // ── Loaders ─────────────────────────────────────────────────────────────────
  const loadCategorias = async () => {
    const { data } = await supabase.from('categorias_gasto').select('*').order('nombre')
    setCategorias(data || [])
  }

  const loadSucursales = async () => {
    const { data } = await supabase.from('sucursales').select('*')
    setSucursales(data || [])
  }

  const loadGastos = async (admin: boolean, userId: number) => {
    try {
      // Paso 1: gastos con joins simples (sin doble FK a personal)
      let query = supabase
        .from('gastos_caja')
        .select(`
          id, monto, descripcion, estado, created_at,
          categoria_id, sucursal_id, aprobado_por, registrado_por,
          categorias_gasto(nombre, color, icono),
          sucursales(nombre)
        `)
        .order('created_at', { ascending: false })

      if (!admin) query = query.eq('registrado_por', userId)

      const { data: gastosData, error } = await query
      if (error) {
        console.error('Error gastos:', error)
        return
      }

      if (!gastosData || gastosData.length === 0) {
        setGastos([])
        return
      }

      // Paso 2: resolver nombres de personal por ids únicos
      const personalIds = [
        ...new Set([
          ...gastosData.map((g: any) => g.registrado_por),
          ...gastosData.map((g: any) => g.aprobado_por).filter(Boolean),
        ])
      ]

      const { data: personalData } = await supabase
        .from('personal')
        .select('id, nombre')
        .in('id', personalIds)

      const personalMap: Record<number, string> = {}
      ;(personalData || []).forEach((p: any) => { personalMap[p.id] = p.nombre })

      // Paso 3: combinar
      const combined = gastosData.map((g: any) => ({
        ...g,
        registrador: { nombre: personalMap[g.registrado_por] || '—' },
        aprobador:   g.aprobado_por ? { nombre: personalMap[g.aprobado_por] || '—' } : null,
      }))

      setGastos(combined as any)
    } catch (err) {
      console.error('Error crítico en gastos:', err)
    }
  }

  // ── Stats ───────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const aprobados  = gastos.filter(g => g.estado === 'aprobado')
    const pendientes = gastos.filter(g => g.estado === 'pendiente')
    const totalMes   = aprobados
      .filter(g => new Date(g.created_at).getMonth() === new Date().getMonth())
      .reduce((s, g) => s + g.monto, 0)
    return {
      totalMes,
      pendientesCount: pendientes.length,
      totalAprobado: aprobados.reduce((s, g) => s + g.monto, 0),
    }
  }, [gastos])

  // ── Gastos filtrados ─────────────────────────────────────────────────────────
  const gastosFiltrados = useMemo(() => {
    return gastos.filter(g => {
      if (filtroSucursal  !== 'todas' && g.sucursal_id  !== filtroSucursal)  return false
      if (filtroEstado    !== 'todos'  && g.estado       !== filtroEstado)    return false
      if (filtroCategoria !== 'todas' && g.categoria_id !== filtroCategoria) return false
      return true
    })
  }, [gastos, filtroSucursal, filtroEstado, filtroCategoria])

  // ── Acciones ─────────────────────────────────────────────────────────────────
  const registrarGasto = async () => {
    if (!form.monto || !form.descripcion || !form.categoria_id || !form.sucursal_id)
      return alert('Completa todos los campos')
    if (Number(form.monto) <= 0) return alert('El monto debe ser mayor a 0')

    setGuardando(true)
    try {
      const { error } = await supabase.from('gastos_caja').insert({
        monto:          Number(form.monto),
        descripcion:    form.descripcion.trim(),
        categoria_id:   Number(form.categoria_id),
        sucursal_id:    Number(form.sucursal_id),
        registrado_por: usuario.id,
        estado:         'pendiente',
      })
      if (error) throw error
      cerrarModal()
      await loadGastos(esAdmin, usuario?.id)
    } catch (e: any) {
      alert('Error al guardar: ' + e.message)
    } finally {
      setGuardando(false)
    }
  }

  const cambiarEstado = async (id: number, estado: 'aprobado' | 'rechazado') => {
    setProcesando(true)
    try {
      const { error } = await supabase
        .from('gastos_caja')
        .update({ estado, aprobado_por: usuario.id })
        .eq('id', id)
      if (error) throw error
      setGastoDetalle(null)
      await loadGastos(esAdmin, usuario?.id)
    } catch (e: any) {
      alert('Error: ' + e.message)
    } finally {
      setProcesando(false)
    }
  }

  const cerrarModal = () => {
    setModalAbierto(false)
    setForm({ monto: '', descripcion: '', categoria_id: '', sucursal_id: '' })
  }

  // ── Exportar CSV ─────────────────────────────────────────────────────────────
  const exportarCSV = () => {
    const headers = ['Fecha', 'Sucursal', 'Categoría', 'Descripción', 'Monto', 'Estado', 'Registrado por', 'Aprobado por']
    const rows = gastosFiltrados.map(g => [
      fmtFecha(g.created_at),
      (g.sucursales as any)?.nombre || '',
      (g.categorias as any)?.nombre || '',
      g.descripcion,
      g.monto,
      g.estado,
      (g.registrador as any)?.nombre || '',
      (g.aprobador as any)?.nombre  || '',
    ])
    const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `caja_chica_${new Date().toISOString().slice(0,10)}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  // ── Guards ───────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center">
      <div className="text-center space-y-3">
        <div className="w-10 h-10 border-4 border-slate-300 border-t-slate-800 rounded-full animate-spin mx-auto" />
        <p className="text-slate-500 font-bold text-sm uppercase tracking-widest">Cargando...</p>
      </div>
    </div>
  )

  if (!puedeVerCaja) return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
      <div className="bg-white rounded-[32px] p-10 text-center shadow-sm max-w-sm w-full">
        <div className="text-5xl mb-4">🔒</div>
        <h2 className="font-black text-slate-800 text-xl uppercase">Sin Acceso</h2>
        <p className="text-slate-400 text-sm mt-2">No tienes permisos para ver caja chica.</p>
      </div>
    </div>
  )

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-100 pb-16">

      {/* ── Header ── */}
      <div className="bg-slate-900 text-white p-6 rounded-b-[40px] shadow-xl">
        <div className="max-w-xl mx-auto">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400 font-bold mb-1">Muebless is Better</p>
              <h1 className="text-2xl font-black italic leading-tight">CAJA CHICA</h1>
            </div>
            <div className="text-right">
              <p className="text-xs opacity-60">{usuario?.nombre}</p>
              <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full mt-1 inline-block ${esAdmin ? 'bg-amber-400 text-slate-900' : 'bg-slate-700 text-slate-300'}`}>
                {esAdmin ? '★ Admin' : 'Visor'}
              </span>
            </div>
          </div>

          {/* Stats strip */}
          <div className="grid grid-cols-3 gap-3 mt-6">
            <div className="bg-slate-800 rounded-2xl p-3 text-center">
              <p className="text-[9px] uppercase tracking-widest text-slate-400 font-bold">Este mes</p>
              <p className="text-lg font-black text-white mt-0.5">{fmt(stats.totalMes)}</p>
            </div>
            <div className="bg-amber-400 rounded-2xl p-3 text-center">
              <p className="text-[9px] uppercase tracking-widest text-amber-800 font-bold">Pendientes</p>
              <p className="text-lg font-black text-slate-900 mt-0.5">{stats.pendientesCount}</p>
            </div>
            <div className="bg-emerald-500 rounded-2xl p-3 text-center">
              <p className="text-[9px] uppercase tracking-widest text-emerald-900 font-bold">Aprobado</p>
              <p className="text-lg font-black text-white mt-0.5">{fmt(stats.totalAprobado)}</p>
            </div>
          </div>

          {/* Botones de acción */}
          <div className="flex gap-3 mt-4">
            <button
              onClick={() => setModalAbierto(true)}
              className="flex-1 bg-white text-slate-900 py-3.5 rounded-2xl font-black shadow-lg active:scale-95 transition-all uppercase text-[11px] tracking-wide"
            >
              ➕ Registrar Gasto
            </button>
            {esAdmin && (
              <button
                onClick={exportarCSV}
                className="bg-slate-700 text-white px-4 py-3.5 rounded-2xl font-black active:scale-95 transition-all text-[11px] uppercase tracking-wide"
              >
                📥 CSV
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Filtros ── */}
      <div className="max-w-xl mx-auto px-4 mt-5 space-y-3">
        <div className="grid grid-cols-3 gap-2">
          {/* Sucursal */}
          <select
            value={filtroSucursal}
            onChange={e => setFiltroSucursal(e.target.value === 'todas' ? 'todas' : Number(e.target.value))}
            className="bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-[11px] font-bold text-slate-700 outline-none col-span-1"
          >
            <option value="todas">Todas</option>
            {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>

          {/* Estado */}
          <select
            value={filtroEstado}
            onChange={e => setFiltroEstado(e.target.value)}
            className="bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-[11px] font-bold text-slate-700 outline-none"
          >
            <option value="todos">Todos</option>
            <option value="pendiente">Pendientes</option>
            <option value="aprobado">Aprobados</option>
            <option value="rechazado">Rechazados</option>
          </select>

          {/* Categoría */}
          <select
            value={filtroCategoria}
            onChange={e => setFiltroCategoria(e.target.value === 'todas' ? 'todas' : Number(e.target.value))}
            className="bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-[11px] font-bold text-slate-700 outline-none"
          >
            <option value="todas">Categorías</option>
            {categorias.map(c => <option key={c.id} value={c.id}>{c.icono} {c.nombre}</option>)}
          </select>
        </div>

        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest text-right">
          {gastosFiltrados.length} registro{gastosFiltrados.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* ── Lista de gastos ── */}
      <div className="p-4 space-y-3 max-w-xl mx-auto">
        {gastosFiltrados.length === 0 && (
          <div className="text-center py-16 text-slate-400">
            <p className="text-4xl mb-3">🧾</p>
            <p className="font-bold text-sm uppercase tracking-widest">Sin gastos registrados</p>
          </div>
        )}

        {gastosFiltrados.map(g => {
          const cat    = g.categorias as any
          const suc    = g.sucursales as any
          const reg    = g.registrador as any
          const estado = ESTADO_CFG[g.estado]

          return (
            <button
              key={g.id}
              onClick={() => setGastoDetalle(g)}
              className="w-full text-left bg-white rounded-[28px] p-5 shadow-sm border border-slate-100 hover:border-slate-300 transition-all active:scale-[0.97]"
            >
              <div className="flex justify-between items-start gap-3">
                {/* Icono + info */}
                <div className="flex gap-3 items-start flex-1 min-w-0">
                  <div
                    className="w-11 h-11 rounded-2xl flex items-center justify-center text-xl flex-shrink-0"
                    style={{ backgroundColor: cat?.color ? cat.color + '22' : '#f1f5f9' }}
                  >
                    {cat?.icono || '💰'}
                  </div>
                  <div className="min-w-0">
                    <p className="font-black text-slate-800 text-sm truncate">{g.descripcion}</p>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      <span className="text-[10px] font-bold text-slate-400">📍 {suc?.nombre}</span>
                      {cat && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                          style={{ backgroundColor: cat.color + '22', color: cat.color }}>
                          {cat.nombre}
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-300 mt-1">{fmtFecha(g.created_at)} · {reg?.nombre}</p>
                  </div>
                </div>

                {/* Monto + estado */}
                <div className="text-right flex-shrink-0">
                  <p className="text-xl font-black text-slate-800">{fmt(g.monto)}</p>
                  <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full mt-1 inline-flex items-center gap-1 ${estado.bg} ${estado.text}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${estado.dot}`} />
                    {estado.label}
                  </span>
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {/* ── Modal: Registrar Gasto ── */}
      {modalAbierto && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md flex items-end sm:items-center justify-center p-4 z-50">
          <div className="bg-white rounded-[40px] p-8 w-full max-w-md shadow-2xl">
            <h2 className="text-xl font-black mb-1 text-slate-800 text-center uppercase">💸 Nuevo Gasto</h2>
            <p className="text-center text-[11px] text-slate-400 font-bold mb-6 uppercase tracking-widest">Caja Chica</p>

            <div className="space-y-3">
              {/* Monto */}
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-slate-400 text-sm">Bs.</span>
                <input
                  type="number"
                  placeholder="0.00"
                  value={form.monto}
                  onChange={e => setForm(f => ({ ...f, monto: e.target.value }))}
                  className="w-full bg-slate-50 rounded-2xl pl-12 pr-4 py-4 font-black text-2xl text-slate-800 outline-none text-right"
                />
              </div>

              {/* Descripción */}
              <textarea
                placeholder="Descripción del gasto..."
                value={form.descripcion}
                onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
                rows={2}
                className="w-full bg-slate-50 rounded-2xl p-4 font-bold text-slate-700 text-sm outline-none resize-none"
              />

              {/* Categoría */}
              <select
                value={form.categoria_id}
                onChange={e => setForm(f => ({ ...f, categoria_id: e.target.value }))}
                className="w-full bg-slate-50 rounded-2xl p-4 font-bold text-slate-700 text-sm outline-none"
              >
                <option value="">Seleccionar categoría...</option>
                {categorias.map(c => (
                  <option key={c.id} value={c.id}>{c.icono} {c.nombre}</option>
                ))}
              </select>

              {/* Sucursal */}
              <select
                value={form.sucursal_id}
                onChange={e => setForm(f => ({ ...f, sucursal_id: e.target.value }))}
                className="w-full bg-slate-50 rounded-2xl p-4 font-bold text-slate-700 text-sm outline-none"
              >
                <option value="">Seleccionar sucursal/taller...</option>
                {sucursales.map(s => (
                  <option key={s.id} value={s.id}>{s.nombre}</option>
                ))}
              </select>
            </div>

            <div className="flex gap-3 mt-8">
              <button onClick={cerrarModal} className="flex-1 py-4 font-bold text-slate-400 uppercase text-[10px]">
                Cancelar
              </button>
              <button
                onClick={registrarGasto}
                disabled={guardando}
                className="flex-[2] bg-slate-900 text-white rounded-[22px] font-black py-4 shadow-xl uppercase text-[10px] tracking-wider active:scale-95 transition-all disabled:opacity-50"
              >
                {guardando ? 'Guardando...' : 'Registrar Gasto'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Detalle / Aprobar ── */}
      {gastoDetalle && (() => {
        const cat    = gastoDetalle.categorias as any
        const suc    = gastoDetalle.sucursales as any
        const reg    = gastoDetalle.registrador as any
        const apr    = gastoDetalle.aprobador as any
        const estado = ESTADO_CFG[gastoDetalle.estado]

        return (
          <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md flex items-end sm:items-center justify-center p-4 z-50">
            <div className="bg-white rounded-[40px] p-8 w-full max-w-md shadow-2xl">

              {/* Icono + monto */}
              <div className="text-center mb-6">
                <div
                  className="w-16 h-16 rounded-3xl flex items-center justify-center text-3xl mx-auto mb-3"
                  style={{ backgroundColor: cat?.color ? cat.color + '22' : '#f1f5f9' }}
                >
                  {cat?.icono || '💰'}
                </div>
                <p className="text-4xl font-black text-slate-800">{fmt(gastoDetalle.monto)}</p>
                <p className="text-slate-500 text-sm font-bold mt-1">{gastoDetalle.descripcion}</p>
                <span className={`text-[10px] font-black uppercase px-3 py-1 rounded-full mt-2 inline-flex items-center gap-1.5 ${estado.bg} ${estado.text}`}>
                  <span className={`w-2 h-2 rounded-full ${estado.dot}`} />
                  {estado.label}
                </span>
              </div>

              {/* Info */}
              <div className="bg-slate-50 rounded-3xl p-5 space-y-3 text-sm">
                <Row label="Sucursal"   value={suc?.nombre} />
                <Row label="Categoría"  value={cat ? `${cat.icono} ${cat.nombre}` : '—'} />
                <Row label="Fecha"      value={fmtFecha(gastoDetalle.created_at)} />
                <Row label="Registrado" value={reg?.nombre || '—'} />
                {apr && <Row label="Aprobado por" value={apr.nombre} />}
              </div>

              {/* Acciones admin */}
              {esAdmin && gastoDetalle.estado === 'pendiente' && (
                <div className="flex gap-3 mt-6">
                  <button
                    onClick={() => cambiarEstado(gastoDetalle.id, 'rechazado')}
                    disabled={procesando}
                    className="flex-1 bg-red-50 text-red-600 rounded-2xl font-black py-4 uppercase text-[10px] tracking-wide active:scale-95 transition-all disabled:opacity-50"
                  >
                    ✕ Rechazar
                  </button>
                  <button
                    onClick={() => cambiarEstado(gastoDetalle.id, 'aprobado')}
                    disabled={procesando}
                    className="flex-[2] bg-emerald-500 text-white rounded-2xl font-black py-4 shadow-lg uppercase text-[10px] tracking-wide active:scale-95 transition-all disabled:opacity-50"
                  >
                    ✓ Aprobar
                  </button>
                </div>
              )}

              <button
                onClick={() => setGastoDetalle(null)}
                className="w-full mt-3 py-3 font-bold text-slate-400 uppercase text-[10px]"
              >
                Cerrar
              </button>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

// ─── Sub-componente ───────────────────────────────────────────────────────────
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-slate-400 font-bold text-xs uppercase tracking-wide">{label}</span>
      <span className="text-slate-700 font-black text-xs text-right max-w-[60%]">{value}</span>
    </div>
  )
}
