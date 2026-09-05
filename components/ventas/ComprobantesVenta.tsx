'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'

export interface ComprobanteVenta {
  id: number
  cod_venta: number
  url: string
  tipo_archivo: 'imagen' | 'pdf'
  nombre_archivo: string | null
  origen: 'vendedor' | 'cliente'
  concepto: 'venta' | 'cobro' | null
  observaciones: string | null
  creado_en: string
}

interface Props {
  codVenta: number
  /** Quién está subiendo el comprobante. Se guarda en la fila para saber si vino
   *  del vendedor (en tienda) o del cliente (autoservicio, a futuro). */
  origen?: 'vendedor' | 'cliente'
  /** Si true, solo muestra la lista, sin permitir subir nuevos. */
  soloLectura?: boolean
  /** Nombre de quién sube el comprobante (vendedor logueado o cliente). */
  subidoPor?: string | null
  /** 'venta': comprobante del anticipo/depósito inicial (página de ventas).
   *  'cobro': comprobante del saldo/cobro final (página de cobros).
   *  Si no se pasa, muestra y permite subir sin distinguir (comportamiento libre).
   *  Los comprobantes viejos sin concepto se tratan como 'venta' por compatibilidad. */
  concepto?: 'venta' | 'cobro'
  /** Título del bloque. Si no se pasa, se infiere de "concepto". */
  titulo?: string
}

const TIPOS_ACEPTADOS = 'image/png,image/jpeg,image/jpg,image/webp,application/pdf'

export default function ComprobantesVenta({
  codVenta, origen = 'vendedor', soloLectura = false, subidoPor = null, concepto, titulo,
}: Props) {
  const [comprobantes, setComprobantes] = useState<ComprobanteVenta[]>([])
  const [loading, setLoading] = useState(true)
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const cargar = async () => {
    setLoading(true)
    let query = supabase.from('comprobantes_venta').select('*').eq('cod_venta', codVenta)
    if (concepto === 'venta') {
      // Los comprobantes subidos antes de que existiera "concepto" se asumen de venta.
      query = query.or('concepto.eq.venta,concepto.is.null')
    } else if (concepto === 'cobro') {
      query = query.eq('concepto', 'cobro')
    }
    const { data, error: eLoad } = await query.order('creado_en', { ascending: false })
    if (eLoad) setError('No se pudo cargar los comprobantes: ' + eLoad.message)
    else setComprobantes(data || [])
    setLoading(false)
  }

  useEffect(() => { if (codVenta) cargar() }, [codVenta, concepto])

  const subirArchivo = async (file: File) => {
    if (!file) return
    const esPdf = file.type === 'application/pdf'
    const esImagen = file.type.startsWith('image/')
    if (!esPdf && !esImagen) {
      setError('Solo se aceptan imágenes (jpg, png, webp) o archivos PDF')
      return
    }
    setSubiendo(true); setError('')
    try {
      const ext = file.name.split('.').pop() || (esPdf ? 'pdf' : 'jpg')
      const path = `${codVenta}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
      const { error: eUp } = await supabase.storage.from('comprobantes-pago').upload(path, file)
      if (eUp) throw eUp

      const { data: pub } = supabase.storage.from('comprobantes-pago').getPublicUrl(path)

      const { error: eIns } = await supabase.from('comprobantes_venta').insert({
        cod_venta: codVenta,
        url: pub.publicUrl,
        tipo_archivo: esPdf ? 'pdf' : 'imagen',
        subido_por: subidoPor || null,
        nombre_archivo: file.name,
        origen,
        concepto: concepto || null,
      })
      if (eIns) throw eIns

      await cargar()
    } catch (e: any) {
      setError('Error al subir el comprobante: ' + (e?.message || 'desconocido'))
    } finally {
      setSubiendo(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const eliminar = async (c: ComprobanteVenta) => {
    if (!confirm('¿Eliminar este comprobante?')) return
    const { error: eDel } = await supabase.from('comprobantes_venta').delete().eq('id', c.id)
    if (eDel) { setError('No se pudo eliminar: ' + eDel.message); return }
    // El archivo en storage queda huérfano intencionalmente (evita romper el
    // borrado si el path cambió); se puede limpiar después con un job aparte.
    setComprobantes(prev => prev.filter(x => x.id !== c.id))
  }

  return (
    <div style={{ backgroundColor: '#f9f9f9', borderRadius: '12px', padding: '16px 20px', marginBottom: '20px', border: '1px solid #eee' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <h3 style={{ margin: 0, fontSize: '15px', color: '#333' }}>
          🧾 {titulo || (concepto === 'cobro' ? 'Comprobante de cobro / saldo' : 'Comprobantes de depósito')}
        </h3>
        {!soloLectura && (
          <label style={{
            background: subiendo ? '#9e9e9e' : '#087e0b', color: 'white', padding: '7px 14px',
            borderRadius: '8px', fontSize: '12px', fontWeight: 'bold', cursor: subiendo ? 'default' : 'pointer',
          }}>
            {subiendo ? 'Subiendo...' : '＋ Adjuntar comprobante'}
            <input ref={inputRef} type="file" accept={TIPOS_ACEPTADOS} disabled={subiendo}
              onChange={e => e.target.files?.[0] && subirArchivo(e.target.files[0])}
              style={{ display: 'none' }} />
          </label>
        )}
      </div>

      {error && <p style={{ fontSize: '12px', color: '#e53935', margin: '0 0 10px' }}>{error}</p>}

      {loading ? (
        <p style={{ fontSize: '12px', color: '#888', margin: 0 }}>Cargando...</p>
      ) : comprobantes.length === 0 ? (
        <p style={{ fontSize: '12px', color: '#aaa', margin: 0 }}>Todavía no hay comprobantes adjuntos para esta venta.</p>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
          {comprobantes.map(c => (
            <div key={c.id} style={{ position: 'relative', border: '1px solid #ddd', borderRadius: '8px', padding: '8px', backgroundColor: 'white', width: '110px' }}>
              <a href={c.url} target="_blank" rel="noreferrer">
                {c.tipo_archivo === 'imagen' ? (
                  <img src={c.url} alt={c.nombre_archivo || 'comprobante'} style={{ width: '94px', height: '94px', objectFit: 'cover', borderRadius: '6px' }} />
                ) : (
                  <div style={{ width: '94px', height: '94px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', backgroundColor: '#f2f2f2', borderRadius: '6px' }}>📄</div>
                )}
              </a>
              <p style={{ fontSize: '9px', color: '#888', margin: '4px 0 0', textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {new Date(c.creado_en).toLocaleDateString('es-BO')}
              </p>
              {!soloLectura && (
                <button onClick={() => eliminar(c)}
                  style={{ position: 'absolute', top: '2px', right: '2px', background: 'rgba(229,57,53,0.9)', color: 'white', border: 'none', borderRadius: '50%', width: '18px', height: '18px', fontSize: '11px', cursor: 'pointer', lineHeight: '18px', padding: 0 }}>
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
