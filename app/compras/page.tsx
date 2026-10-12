'use client'
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

// ── IMPORTANTE: esta página reconstruye las cantidades desde las tablas de
// variantes reales (variante_acero, variante_melamina, variante_accesorios,
// variante_insumos), NO desde la columna ya aplanada
// "materiales" de lotes_produccion. Esto es a propósito: esa columna mezcla
// unidades distintas según el origen del ítem (metros lineales si viene de
// una venta, cantidad de piezas si viene de Planificación), así que no es
// una base confiable para sumar. Las tablas de variantes sí son consistentes.

const LONGITUD_BARRA_CM = 600 // longitud comercial fija de todo perfil de acero

// ── Tipos ─────────────────────────────────────────────────────────────────
interface DetalleVenta {
  id: number
  cod_producto: string
  cantidad: number
  variante_id?: number
  producto_nombre?: string
}
interface Pedido {
  cod_venta: number
  taller_destino?: string
  detalles: DetalleVenta[]
}
interface PiezaDesglose {
  tipo: string
  descripcion?: string
  cantidad: number
  codigo_acero?: string
  codigo_melamina?: string
  codigo_accesorio?: string
  codigo_insumo?: string
  codigo_union?: string
  longitud_cm?: number
  largo_cm?: number
  ancho_cm?: number
  [extra: string]: any
}
interface ItemPlanificacion {
  id_temp: string
  taller_destino: string
  titulo: string
  incorporado?: boolean
  piezas_desglose: PiezaDesglose[]
}
interface LoteAprobado {
  id: number
  fecha: string
  nombre_lote: string
  pedidos_seleccionados: Pedido[]
  materiales_planificados: ItemPlanificacion[]
}

type TipoMaterial = 'acero' | 'melamina' | 'accesorio' | 'insumo'

interface FilaConsolidada {
  key: string
  tipo: TipoMaterial
  codigo: string
  detalle: string
  taller_destino: string
  totalCm: number            // solo acero: suma de longitud_cm * cantidad de piezas
  cantidadNecesaria: number  // barras (acero, ya redondeado hacia arriba) o piezas (los demás)
  stockDisponible: number | null // null = no aplica para este tipo (ver notas)
  sugeridoDescontar: number  // editable antes de confirmar
  loteIds: number[]
}

const TIPO_LABEL: Record<TipoMaterial, string> = {
  acero: '🔩 Acero', melamina: '🪵 Melamina', accesorio: '🔧 Accesorio', insumo: '🧪 Insumo',
}
const TABLA_STOCK: Partial<Record<TipoMaterial, { tabla: string; col: string }>> = {
  acero: { tabla: 'stock_aceros', col: 'codigo_acero' },
  accesorio: { tabla: 'stock_accesorios', col: 'codigo_accesorio' },
  insumo: { tabla: 'stock_insumos', col: 'codigo_insumos' },
  // melamina: sin lookup aquí a propósito (ver nota más abajo).
  // Las uniones no entran a este módulo: son un valor de costo por punto
  // que usa el cotizador, no un material físico que se compre o almacene.
}

export default function ConsolidadoComprasPage() {
  const [usuario, setUsuario] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const [lotesPendientes, setLotesPendientes] = useState<LoteAprobado[]>([])
  const [lotesSeleccionados, setLotesSeleccionados] = useState<Set<number>>(new Set())

  const [consolidando, setConsolidando] = useState(false)
  const [filas, setFilas] = useState<FilaConsolidada[]>([])
  const [sinCatalogar, setSinCatalogar] = useState<{ codigo: string; taller: string; origen: string }[]>([])
  const [unionesExcluidas, setUnionesExcluidas] = useState(0)
  const [tallerFiltro, setTallerFiltro] = useState<string>('TODOS')
  const [confirmando, setConfirmando] = useState(false)
  const [mensaje, setMensaje] = useState('')

  // ── Auth ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const carnet = localStorage.getItem('carnet')
    if (!carnet) { window.location.replace('/'); return }
    supabase.from('personal').select('*, cargos(*)')
      .eq('carnet', carnet).eq('estado', true).single()
      .then(({ data }) => {
        if (!data) { window.location.replace('/'); return }
        const admin = data.cargos?.es_admin === true
        const puedeCompras = data.cargos?.puede_ver_compras === true
        if (!admin && !puedeCompras) { window.location.replace('/sistema'); return }
        setUsuario(data)
        cargarLotesAprobados()
      })
  }, [])

  const cargarLotesAprobados = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('lotes_produccion')
      .select('id, fecha, nombre_lote, pedidos_seleccionados, materiales_planificados')
      .eq('estado_workflow', 'aprobado')
      .eq('consolidado_compra', false)
      .order('fecha', { ascending: false })
    if (error) { console.error(error); setLoading(false); return }
    const lotes = (data || []) as LoteAprobado[]
    setLotesPendientes(lotes)
    setLotesSeleccionados(new Set(lotes.map(l => l.id))) // por defecto, todos marcados
    setLoading(false)
  }

  const toggleLote = (id: number) => {
    setLotesSeleccionados(prev => {
      const nuevo = new Set(prev)
      if (nuevo.has(id)) nuevo.delete(id); else nuevo.add(id)
      return nuevo
    })
  }

  // ── Consolidación ─────────────────────────────────────────────────────
  const consolidar = async () => {
    const lotesElegidos = lotesPendientes.filter(l => lotesSeleccionados.has(l.id))
    if (lotesElegidos.length === 0) {
      alert('Selecciona al menos un lote aprobado.')
      return
    }
    setConsolidando(true)
    setFilas([])
    setSinCatalogar([])
    setUnionesExcluidas(0)
    setMensaje('')

    try {
      // 1) Reunir todos los variante_id referenciados por pedidos de venta,
      //    con su taller y multiplicador (cantidad vendida).
      const referencias: { variante_id: number; taller: string; mult: number; loteId: number }[] = []
      for (const lote of lotesElegidos) {
        for (const pedido of lote.pedidos_seleccionados || []) {
          const taller = pedido.taller_destino || 'SIN-TALLER'
          for (const det of pedido.detalles || []) {
            if (det.variante_id) {
              referencias.push({ variante_id: det.variante_id, taller, mult: Number(det.cantidad) || 1, loteId: lote.id })
            }
          }
        }
      }
      const idsUnicos = [...new Set(referencias.map(r => r.variante_id))]

      // 2) Traer las piezas reales de esas variantes, en un solo viaje por tabla.
      // Nota: no se consulta variante_uniones — las uniones son un valor de costo
      // del cotizador, no un material que este módulo deba comprar/descontar.
      const [rAcero, rMelamina, rAccesorio, rInsumo] = idsUnicos.length === 0
        ? [{ data: [] }, { data: [] }, { data: [] }, { data: [] }]
        : await Promise.all([
            supabase.from('variante_acero').select('variante_id, codigo_acero, longitud_cm, cantidad, aceros(detalle)').in('variante_id', idsUnicos),
            supabase.from('variante_melamina').select('variante_id, codigo_melamina, cantidad, largo_cm, ancho_cm, melaminas(detalle)').in('variante_id', idsUnicos),
            supabase.from('variante_accesorios').select('variante_id, codigo_accesorio, cantidad, accesorios(detalle)').in('variante_id', idsUnicos),
            supabase.from('variante_insumos').select('variante_id, codigo_insumo, cantidad, insumos(detalle)').in('variante_id', idsUnicos),
          ])

      // ── Acumuladores ──────────────────────────────────────────────────
      const mapa = new Map<string, FilaConsolidada>()
      const catalogados = new Set<string>() // códigos que sí resolvimos contra un catálogo
      const noCatalogados: { codigo: string; taller: string; origen: string }[] = []
      let excluidasUniones = 0

      const acumular = (
        tipo: TipoMaterial, codigo: string | undefined, detalleTxt: string, taller: string,
        loteId: number, cm: number, piezas: number, origen: string
      ) => {
        if (!codigo) { noCatalogados.push({ codigo: '(sin código)', taller, origen }); return }
        const key = `${tipo}|${codigo}|${taller}`
        catalogados.add(key)
        const existente = mapa.get(key)
        if (existente) {
          existente.totalCm += cm
          existente.cantidadNecesaria += piezas
          if (!existente.loteIds.includes(loteId)) existente.loteIds.push(loteId)
        } else {
          mapa.set(key, {
            key, tipo, codigo, detalle: detalleTxt, taller_destino: taller,
            totalCm: cm, cantidadNecesaria: piezas,
            stockDisponible: null, sugeridoDescontar: 0, loteIds: [loteId],
          })
        }
      }

      // 2a) Piezas provenientes de ventas (pedidos_seleccionados)
      for (const ref of referencias) {
        const loteId = ref.loteId
        for (const p of (rAcero.data || []) as any[]) {
          if (p.variante_id !== ref.variante_id) continue
          const cm = (Number(p.longitud_cm) || 0) * (Number(p.cantidad) || 0) * ref.mult
          acumular('acero', p.codigo_acero, p.aceros?.detalle || p.codigo_acero, ref.taller, loteId, cm, 0, 'venta')
        }
        for (const p of (rMelamina.data || []) as any[]) {
          if (p.variante_id !== ref.variante_id) continue
          const piezas = (Number(p.cantidad) || 0) * ref.mult
          acumular('melamina', p.codigo_melamina, p.melaminas?.detalle || p.codigo_melamina, ref.taller, loteId, 0, piezas, 'venta')
        }
        for (const p of (rAccesorio.data || []) as any[]) {
          if (p.variante_id !== ref.variante_id) continue
          const piezas = (Number(p.cantidad) || 0) * ref.mult
          acumular('accesorio', p.codigo_accesorio, p.accesorios?.detalle || p.codigo_accesorio, ref.taller, loteId, 0, piezas, 'venta')
        }
        for (const p of (rInsumo.data || []) as any[]) {
          if (p.variante_id !== ref.variante_id) continue
          const piezas = (Number(p.cantidad) || 0) * ref.mult
          acumular('insumo', p.codigo_insumo, p.insumos?.detalle || p.codigo_insumo, ref.taller, loteId, 0, piezas, 'venta')
        }
      }

      // 2b) Piezas provenientes de Planificación (stock / especiales), ya
      //     incorporadas al presupuesto — traen sus propios códigos y medidas.
      for (const lote of lotesElegidos) {
        for (const item of lote.materiales_planificados || []) {
          if (!item.incorporado) continue // solo lo que ya fue aprobado dentro del presupuesto
          const taller = item.taller_destino || 'SIN-TALLER'
          for (const p of item.piezas_desglose || []) {
            const cant = Number(p.cantidad) || 0
            if (p.codigo_acero) {
              const cm = (Number(p.longitud_cm ?? p.largo_cm) || 0) * cant
              acumular('acero', p.codigo_acero, p.descripcion || p.codigo_acero, taller, lote.id, cm, 0, 'planificacion')
            } else if (p.codigo_melamina) {
              acumular('melamina', p.codigo_melamina, p.descripcion || p.codigo_melamina, taller, lote.id, 0, cant, 'planificacion')
            } else if (p.codigo_accesorio) {
              acumular('accesorio', p.codigo_accesorio, p.descripcion || p.codigo_accesorio, taller, lote.id, 0, cant, 'planificacion')
            } else if (p.codigo_insumo) {
              acumular('insumo', p.codigo_insumo, p.descripcion || p.codigo_insumo, taller, lote.id, 0, cant, 'planificacion')
            } else if (p.codigo_union) {
              // Las uniones no se compran ni se almacenan: es un valor de costo por
              // punto que usa el cotizador. Se ignoran a propósito en este módulo.
              excluidasUniones++
              continue
            } else {
              noCatalogados.push({ codigo: p.descripcion || '(sin código)', taller, origen: 'planificacion' })
            }
          }
        }
      }

      // 3) Cerrar cada fila: acero → barras (redondeo hacia arriba); resto → piezas.
      const filasFinales: FilaConsolidada[] = []
      for (const fila of mapa.values()) {
        if (fila.tipo === 'acero') {
          fila.cantidadNecesaria = Math.ceil(fila.totalCm / LONGITUD_BARRA_CM - 1e-9)
        } else {
          fila.cantidadNecesaria = Math.ceil(fila.cantidadNecesaria - 1e-9)
        }
        filasFinales.push(fila)
      }

      // 4) Stock disponible por taller (según tabla correspondiente al tipo).
      const { data: sucData } = await supabase.from('sucursales').select('id, nombre')
      const idPorNombre = new Map((sucData || []).map((s: any) => [s.nombre, s.id]))

      await Promise.all(filasFinales.map(async fila => {
        const cfg = TABLA_STOCK[fila.tipo]
        if (!cfg) return // melamina: no se descuenta acá (ver nota de retazos más abajo)
        const sucursalId = idPorNombre.get(fila.taller_destino)
        if (!sucursalId) return
        const { data } = await supabase.from(cfg.tabla).select('cantidad').eq('sucursal_id', sucursalId).eq(cfg.col, fila.codigo).maybeSingle()
        fila.stockDisponible = data ? Number(data.cantidad) : 0
        fila.sugeridoDescontar = Math.max(0, Math.min(fila.cantidadNecesaria, fila.stockDisponible ?? 0))
      }))

      filasFinales.sort((a, b) => a.taller_destino.localeCompare(b.taller_destino) || a.tipo.localeCompare(b.tipo) || a.codigo.localeCompare(b.codigo))
      setFilas(filasFinales)
      setSinCatalogar(noCatalogados)
      setUnionesExcluidas(excluidasUniones)
    } catch (err: any) {
      console.error(err)
      alert('Error al consolidar: ' + (err?.message || 'revisa la consola.'))
    } finally {
      setConsolidando(false)
    }
  }

  const actualizarSugerido = (key: string, valor: number) => {
    setFilas(prev => prev.map(f => f.key === key
      ? { ...f, sugeridoDescontar: Math.max(0, Math.min(valor, f.stockDisponible ?? valor)) }
      : f))
  }

  const filasFiltradas = tallerFiltro === 'TODOS' ? filas : filas.filter(f => f.taller_destino === tallerFiltro)
  const talleresEnFilas = [...new Set(filas.map(f => f.taller_destino))].sort()

  // ── Confirmar: descuenta stock real y marca los lotes como consolidados ──
  const confirmarDescuento = async () => {
    if (filas.length === 0) return
    const totalADescontar = filas.reduce((acc, f) => acc + f.sugeridoDescontar, 0)
    const ok = confirm(
      `Vas a descontar stock de ${filas.filter(f => f.sugeridoDescontar > 0).length} ítem(s) y marcar ${lotesSeleccionados.size} lote(s) como consolidados. Esta acción no se puede deshacer automáticamente. ¿Confirmas?`
    )
    if (!ok) return

    setConfirmando(true)
    try {
      const { data: sucData } = await supabase.from('sucursales').select('id, nombre')
      const idPorNombre = new Map((sucData || []).map((s: any) => [s.nombre, s.id]))

      for (const fila of filas) {
        if (fila.sugeridoDescontar <= 0) continue
        const cfg = TABLA_STOCK[fila.tipo]
        if (!cfg) continue
        const sucursalId = idPorNombre.get(fila.taller_destino)
        if (!sucursalId) continue

        const { data: actual } = await supabase.from(cfg.tabla).select('id, cantidad').eq('sucursal_id', sucursalId).eq(cfg.col, fila.codigo).maybeSingle()
        if (!actual) continue
        const nuevaCantidad = Math.max(0, Number(actual.cantidad) - fila.sugeridoDescontar)
        await supabase.from(cfg.tabla).update({ cantidad: nuevaCantidad }).eq('id', actual.id)
      }

      const loteIds = [...lotesSeleccionados]
      await supabase.from('lotes_produccion')
        .update({ consolidado_compra: true, consolidado_compra_en: new Date().toISOString() })
        .in('id', loteIds)

      await supabase.from('historial_consolidado_compras').insert({
        lotes_incluidos: loteIds,
        detalle: filas.map(f => ({
          tipo: f.tipo, codigo: f.codigo, detalle: f.detalle, taller: f.taller_destino,
          necesario: f.cantidadNecesaria, stock_descontado: f.sugeridoDescontar,
          a_comprar: Math.max(0, f.cantidadNecesaria - f.sugeridoDescontar),
        })),
        realizado_por: usuario?.carnet || null,
      })

      setMensaje(`Listo: se procesaron ${loteIds.length} lote(s) y se descontó stock de ${filas.filter(f => f.sugeridoDescontar > 0).length} ítem(s).`)
      setFilas([])
      setSinCatalogar([])
      setUnionesExcluidas(0)
      cargarLotesAprobados()
    } catch (err: any) {
      console.error(err)
      alert('Error al confirmar: ' + (err?.message || 'revisa la consola.'))
    } finally {
      setConfirmando(false)
    }
  }

  if (loading) return <p style={{ textAlign: 'center', marginTop: '80px', fontFamily: 'Arial' }}>Cargando...</p>

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', minHeight: '100vh', backgroundColor: '#f5f5f5', padding: '20px' }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
        <h1 style={{ fontSize: '20px', color: '#0B1E36', marginBottom: '4px' }}>📦 Consolidado de Compras</h1>
        <p style={{ fontSize: '12px', color: '#888', marginBottom: '20px' }}>
          Combina los materiales de varios lotes ya <strong>aprobados</strong> (con su rendición de cuentas hecha), identifica ítems iguales y los suma —
          en acero, convierte el total de centímetros cortados a barras comerciales de {LONGITUD_BARRA_CM}cm.
          No incluye melamina en el descuento de stock (esa se maneja por retazos al aprobar cada lote, no por hojas enteras) ni uniones (son un valor de costo del cotizador, no un material físico).
        </p>

        {mensaje && (
          <div style={{ backgroundColor: '#ecfdf5', color: '#16a34a', padding: '12px 16px', borderRadius: '8px', marginBottom: '16px', fontSize: '13px', fontWeight: 'bold' }}>
            ✓ {mensaje}
          </div>
        )}

        {/* Selección de lotes */}
        <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '20px', marginBottom: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <h2 style={{ fontSize: '15px', color: '#0B1E36', marginBottom: '12px' }}>
            Lotes aprobados pendientes de consolidar ({lotesPendientes.length})
          </h2>
          {lotesPendientes.length === 0 ? (
            <p style={{ fontSize: '13px', color: '#999' }}>No hay lotes aprobados esperando consolidación.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {lotesPendientes.map(l => (
                <label key={l.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', borderRadius: '6px', backgroundColor: lotesSeleccionados.has(l.id) ? '#f0fff0' : '#fafafa', cursor: 'pointer', fontSize: '13px' }}>
                  <input type="checkbox" checked={lotesSeleccionados.has(l.id)} onChange={() => toggleLote(l.id)} />
                  <strong>{l.nombre_lote}</strong>
                  <span style={{ color: '#888' }}>{l.fecha}</span>
                  <span style={{ color: '#aaa', fontSize: '11px' }}>
                    {(l.pedidos_seleccionados || []).length} pedido(s) · {(l.materiales_planificados || []).filter(i => i.incorporado).length} ítem(s) planificado(s)
                  </span>
                </label>
              ))}
            </div>
          )}
          <button onClick={consolidar} disabled={consolidando || lotesSeleccionados.size === 0}
            style={{ marginTop: '14px', padding: '10px 20px', backgroundColor: consolidando ? '#ccc' : '#087e0b', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: consolidando ? 'not-allowed' : 'pointer', fontSize: '13px' }}>
            {consolidando ? 'Consolidando...' : `🔄 Consolidar ${lotesSeleccionados.size} lote(s) seleccionado(s)`}
          </button>
        </div>

        {/* Resultado consolidado */}
        {filas.length > 0 && (
          <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
              <h2 style={{ fontSize: '15px', color: '#0B1E36', margin: 0 }}>Lista consolidada ({filasFiltradas.length})</h2>
              <select value={tallerFiltro} onChange={e => setTallerFiltro(e.target.value)} style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '12px' }}>
                <option value="TODOS">Todos los talleres</option>
                {talleresEnFilas.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f1f5f9', color: '#0B1E36' }}>
                    <th style={{ padding: '8px', textAlign: 'left' }}>Taller</th>
                    <th style={{ padding: '8px', textAlign: 'left' }}>Tipo</th>
                    <th style={{ padding: '8px', textAlign: 'left' }}>Código / Detalle</th>
                    <th style={{ padding: '8px', textAlign: 'center' }}>Necesario</th>
                    <th style={{ padding: '8px', textAlign: 'center', color: '#2563eb' }}>Stock Disponible</th>
                    <th style={{ padding: '8px', textAlign: 'center', color: '#2563eb' }}>Sugerido Descontar</th>
                    <th style={{ padding: '8px', textAlign: 'center', color: '#16a34a' }}>A Comprar</th>
                  </tr>
                </thead>
                <tbody>
                  {filasFiltradas.map(f => {
                    const aComprar = Math.max(0, f.cantidadNecesaria - f.sugeridoDescontar)
                    return (
                      <tr key={f.key} style={{ borderBottom: '1px solid #eee' }}>
                        <td style={{ padding: '8px' }}>{f.taller_destino}</td>
                        <td style={{ padding: '8px' }}>{TIPO_LABEL[f.tipo]}</td>
                        <td style={{ padding: '8px' }}>
                          <strong>{f.codigo}</strong><br />
                          <span style={{ color: '#666', fontSize: '11px' }}>{f.detalle}</span>
                          {f.tipo === 'acero' && <div style={{ fontSize: '10px', color: '#aaa' }}>{f.totalCm.toFixed(1)} cm totales ÷ {LONGITUD_BARRA_CM}cm</div>}
                        </td>
                        <td style={{ padding: '8px', textAlign: 'center', fontWeight: 'bold' }}>
                          {f.cantidadNecesaria} {f.tipo === 'acero' ? 'barra(s)' : 'u.'}
                        </td>
                        <td style={{ padding: '8px', textAlign: 'center' }}>
                          {f.stockDisponible === null ? <span style={{ color: '#bbb', fontStyle: 'italic', fontSize: '11px' }}>
                            {f.tipo === 'melamina' ? 'gestionado por retazos' : 'sin tabla de stock'}
                          </span> : f.stockDisponible}
                        </td>
                        <td style={{ padding: '8px', textAlign: 'center' }}>
                          {f.stockDisponible === null ? '—' : (
                            <input type="number" min={0} max={f.stockDisponible} value={f.sugeridoDescontar}
                              onChange={e => actualizarSugerido(f.key, Number(e.target.value))}
                              style={{ width: '55px', padding: '4px', textAlign: 'center', border: '1px solid #2563eb', borderRadius: '4px' }} />
                          )}
                        </td>
                        <td style={{ padding: '8px', textAlign: 'center', fontWeight: 'bold', color: '#16a34a' }}>{aComprar}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {sinCatalogar.length > 0 && (
              <div style={{ marginTop: '16px', padding: '12px', backgroundColor: '#fff8e1', borderRadius: '8px', fontSize: '12px' }}>
                <strong style={{ color: '#f57f17' }}>⚠️ {sinCatalogar.length} pieza(s) sin código reconocido</strong> — no se sumaron automáticamente, revísalas manualmente:
                <ul style={{ margin: '6px 0 0', paddingLeft: '20px' }}>
                  {sinCatalogar.map((s, i) => <li key={i}>{s.codigo} — {s.taller} ({s.origen})</li>)}
                </ul>
              </div>
            )}

            {unionesExcluidas > 0 && (
              <p style={{ marginTop: '10px', fontSize: '11px', color: '#999' }}>
                ℹ️ Se excluyeron {unionesExcluidas} pieza(s) de tipo Unión: son un valor de costo por punto para el cotizador, no un material que se compre o almacene, así que no entran a este módulo.
              </p>
            )}

            <button onClick={confirmarDescuento} disabled={confirmando}
              style={{ marginTop: '20px', padding: '12px 24px', backgroundColor: confirmando ? '#ccc' : '#16a34a', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: confirmando ? 'not-allowed' : 'pointer', fontSize: '14px' }}>
              {confirmando ? 'Procesando...' : '✅ Confirmar y Descontar Stock'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
