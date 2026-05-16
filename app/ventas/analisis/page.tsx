'use client'

import { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'
import * as XLSX from 'xlsx'

type VentaSistema = {
  id: number
  cod_venta: number
  fecha_pedido: string | null
  total_venta: number | null
}

type FilaDiferencia = {
  llave_unica_row: string
  cod_venta: number
  id_sistema: number
  fecha_sistema: string
  fecha_excel: string
  monto_sistema: number
  monto_excel: number
  tipo_discrepancia: 'Diferencia en Fecha' | 'Diferencia en Monto' | 'Ambos Erróneos' | 'No existe en Sistema' | 'Duplicado en Excel'
}

export default function ConciliadorVentasExcel() {
  const [ventasSistema, setVentasSistema] = useState<VentaSistema[]>([])
  const [diferencias, setDiferencias] = useState<FilaDiferencia[]>([])
  const [loading, setLoading] = useState(true)
  const [procesandoExcel, setProcesandoExcel] = useState(false)
  const [filtroDiscrepancia, setFiltroDiscrepancia] = useState<string>('todos')
  const [guardandoCod, setGuardandoCod] = useState<string | null>(null)
  const [columnasDetectadas, setColumnasDetectadas] = useState<string[]>([])

  // 1. Cargar datos de Supabase
  const cargarDatosSistema = async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('ventas')
        .select('id, cod_venta, fecha_pedido, total_venta')
      
      if (error) throw error

      const formateados = (data || []).map(v => ({
        id: v.id,
        cod_venta: Math.floor(Number(v.cod_venta)),
        fecha_pedido: v.fecha_pedido ? String(v.fecha_pedido).trim() : null,
        total_venta: Number(v.total_venta || 0)
      }))

      setVentasSistema(formateados)
    } catch (e: any) {
      alert('Error al conectar con Supabase: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    cargarDatosSistema()
  }, [])

  // 2. Procesar el archivo Excel
  const procesarArchivoExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setProcesandoExcel(true)
    const reader = new FileReader()

    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result
        const workbook = XLSX.read(bstr, { type: 'binary', cellDates: true })
        const nameHoja = workbook.SheetNames[0]
        const hoja = workbook.Sheets[nameHoja]
        
        const registrosExcel = XLSX.utils.sheet_to_json(hoja) as any[]

        if (registrosExcel.length === 0) {
          alert('El archivo Excel no contiene datos.')
          setProcesandoExcel(false)
          return
        }

        const columnas = Object.keys(registrosExcel[0])
        setColumnasDetectadas(columnas)

        const listaDiscrepancias: FilaDiferencia[] = []
        
        // CORRECCIÓN AQUÍ: Inicializamos como un objeto plano de JS para evitar el "Record is not defined"
        const mapaDuplicadosExcel: { [key: number]: number } = {}

        registrosExcel.forEach((filaExcel, index) => {
          const codVentaRaw = filaExcel['cod_venta'] ?? filaExcel['cod_venta ']
          const fechaExcelRaw = filaExcel['fecha_pedido'] ?? filaExcel['fecha_pedido ']
          const montoExcelRaw = filaExcel['total_venta'] ?? filaExcel['total_venta ']

          const codVentaExcel = codVentaRaw !== undefined ? Math.floor(Number(codVentaRaw)) : 0
          if (!codVentaExcel || isNaN(codVentaExcel)) return 

          // Control analítico de duplicados en el Excel
          mapaDuplicadosExcel[codVentaExcel] = (mapaDuplicadosExcel[codVentaExcel] || 0) + 1
          const esDuplicadoExcel = mapaDuplicadosExcel[codVentaExcel] > 1

          // Traductor de fechas latinas (DD/MM/AAAA -> AAAA-MM-DD)
          let fechaExcelStr = ''
          if (fechaExcelRaw instanceof Date) {
            const offset = fechaExcelRaw.getTimezoneOffset()
            const fechaAjustada = new Date(fechaExcelRaw.getTime() - (offset * 60 * 1000))
            fechaExcelStr = fechaAjustada.toISOString().split('T')[0]
          } else if (fechaExcelRaw) {
            const fechaTexto = String(fechaExcelRaw).trim().split(' ')[0]
            if (fechaTexto.includes('/')) {
              const partes = fechaTexto.split('/')
              if (partes.length === 3) {
                const dia = partes[0].padStart(2, '0')
                const mes = partes[1].padStart(2, '0')
                const anio = partes[2]
                fechaExcelStr = `${anio}-${mes}-${dia}`
              }
            } else {
              fechaExcelStr = fechaTexto
            }
          }

          const montoExcel = Number(montoExcelRaw || 0)

          // Buscar contra Supabase
          const coincidenciaSistema = ventasSistema.find(vs => vs.cod_venta === codVentaExcel)
          const llaveFilaUnica = `${codVentaExcel}-index-${index}`

          if (esDuplicadoExcel) {
            listaDiscrepancias.push({
              llave_unica_row: llaveFilaUnica,
              cod_venta: codVentaExcel,
              id_sistema: coincidenciaSistema ? coincidenciaSistema.id : 0,
              fecha_sistema: coincidenciaSistema ? (coincidenciaSistema.fecha_pedido || 'Vacío') : 'Inexistente',
              fecha_excel: fechaExcelStr || 'Duplicado',
              monto_sistema: coincidenciaSistema ? coincidenciaSistema.total_venta : 0,
              monto_excel: montoExcel,
              tipo_discrepancia: 'Duplicado en Excel'
            })
            return
          }

          if (!coincidenciaSistema) {
            listaDiscrepancias.push({
              llave_unica_row: llaveFilaUnica,
              cod_venta: codVentaExcel,
              id_sistema: 0,
              fecha_sistema: 'Inexistente',
              fecha_excel: fechaExcelStr || 'Sin Fecha',
              monto_sistema: 0,
              monto_excel: montoExcel,
              tipo_discrepancia: 'No existe en Sistema'
            })
          } else {
            const fechaSist = coincidenciaSistema.fecha_pedido || ''
            const montoSist = coincidenciaSistema.total_venta

            const diferenciaFecha = fechaSist !== fechaExcelStr
            const diferenciaMonto = Math.abs(montoSist - montoExcel) > 0.1 

            if (diferenciaFecha || diferenciaMonto) {
              listaDiscrepancias.push({
                llave_unica_row: llaveFilaUnica,
                cod_venta: codVentaExcel,
                id_sistema: coincidenciaSistema.id,
                fecha_sistema: fechaSist || 'Falta en BD',
                fecha_excel: fechaExcelStr || 'Falta en Excel',
                monto_sistema: montoSist,
                monto_excel: montoExcel,
                tipo_discrepancia: diferenciaFecha && diferenciaMonto 
                  ? 'Ambos Erróneos' 
                  : diferenciaFecha ? 'Diferencia en Fecha' : 'Diferencia en Monto'
              })
            }
          }
        })

        setDiferencias(listaDiscrepancias)
        if (listaDiscrepancias.length === 0) {
          alert('🎉 ¡Éxito rotundo! Todos tus registros del Excel coinciden perfectamente con Supabase.')
        }
      } catch (err: any) {
        alert('Error al leer el archivo: ' + err.message)
      } finally {
        setProcesandoExcel(false)
      }
    }

    reader.readAsBinaryString(file)
  }

  const aplicarCambioExcel = async (dif: FilaDiferencia) => {
    setGuardandoCod(dif.llave_unica_row)
    try {
      if (dif.tipo_discrepancia === 'No existe en Sistema') {
        const { error } = await supabase
          .from('ventas')
          .insert({
            cod_venta: dif.cod_venta,
            fecha_pedido: dif.fecha_excel === 'Sin Fecha' ? null : dif.fecha_excel,
            total_venta: dif.monto_excel
          })
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('ventas')
          .update({
            fecha_pedido: dif.fecha_excel,
            total_venta: dif.monto_excel,
            actualizado_en: new Date().toISOString()
          })
          .eq('id', dif.id_sistema)
        if (error) throw error
      }

      setDiferencias(prev => prev.filter(item => item.llave_unica_row !== dif.llave_unica_row))
    } catch (e: any) {
      alert('Error en Supabase: ' + e.message)
    } finally {
      setGuardandoCod(null)
    }
  }

  const filasFiltradas = diferencias.filter(d => {
    if (filtroDiscrepancia === 'todos') return true
    return d.tipo_discrepancia === filtroDiscrepancia
  })

  if (loading) return <div style={msgPantallaSt}><p>Indexando base de datos de Supabase...</p></div>

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', padding: '24px', backgroundColor: '#f8fafc', minHeight: '100vh', color: '#1e293b' }}>
      
      <div style={panelControlSt}>
        <div>
          <h2 style={{ margin: 0, fontSize: '18px', color: '#0f172a' }}>Conciliador de Datos Homologado Exacto</h2>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>Cruce estricto adaptado para decodificar las fechas latinas de tu archivo Excel.</p>
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <label style={{ fontSize: '13px', fontWeight: 'bold', backgroundColor: '#2563eb', color: 'white', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer' }}>
            {procesandoExcel ? 'Normalizando Fechas...' : '📁 Cargar Ventas.xlsx'}
            <input type="file" accept=".xlsx, .xls" onChange={procesarArchivoExcel} style={{ display: 'none' }} disabled={procesandoExcel} />
          </label>
        </div>
      </div>

      {diferencias.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fffbeb', border: '1px solid #fef3c7', padding: '14px 20px', borderRadius: '12px', marginBottom: '20px' }}>
          <span style={{ fontSize: '13px', color: '#b45309', fontWeight: 'bold' }}>
            📊 Se filtraron {diferencias.length} discrepancias reales de formato y carga.
          </span>
          <select 
            value={filtroDiscrepancia} 
            onChange={e => setFiltroDiscrepancia(e.target.value)}
            style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #d97706', fontSize: '12px', fontWeight: 'bold', outline: 'none' }}
          >
            <option value="todos">Ver todos los conflictos</option>
            <option value="Diferencia en Fecha">Solo desfases de Fecha</option>
            <option value="Diferencia en Monto">Solo desfases de Monto</option>
            <option value="Ambos Erróneos">Errores de Fecha y Monto combinados</option>
            <option value="No existe en Sistema">Faltantes en la Base de Datos</option>
            <option value="Duplicado en Excel">Códigos repetidos en el Excel</option>
          </select>
        </div>
      )}

      <div style={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead style={{ backgroundColor: '#f1f5f9', borderBottom: '2px solid #e2e8f0' }}>
            <tr style={{ fontSize: '11px', color: '#475569', textTransform: 'uppercase' }}>
              <th style={thSt}>Cod Venta</th>
              <th style={thSt}>Fecha Sistema (BD)</th>
              <th style={{ ...thSt, backgroundColor: '#eff6ff', color: '#1d4ed8' }}>Fecha Excel (Verdad)</th>
              <th style={thSt}>Monto Sistema</th>
              <th style={{ ...thSt, backgroundColor: '#eff6ff', color: '#1d4ed8' }}>Monto Excel (Verdad)</th>
              <th style={thSt}>Tipo Discrepancia</th>
              <th style={{ ...thSt, textAlign: 'right' }}>Resolución</th>
            </tr>
          </thead>
          <tbody style={{ fontSize: '13px' }}>
            {filasFiltradas.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: '30px', textAlign: 'center', color: '#64748b', fontWeight: 'bold' }}>
                  Sube tu archivo de ventas para iniciar la auditoría de strings indexados.
                </td>
              </tr>
            ) : (
              filasFiltradas.map((dif) => (
                <tr key={dif.llave_unica_row} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ ...tdSt, fontWeight: 'bold' }}>{dif.cod_venta}</td>
                  <td style={{ ...tdSt, color: '#64748b' }}>{dif.fecha_sistema}</td>
                  <td style={{ ...tdSt, backgroundColor: '#f8fafc', fontWeight: 'bold', color: '#1e40af' }}>{dif.fecha_excel}</td>
                  <td style={{ ...tdSt, color: '#64748b' }}>Bs {dif.monto_sistema.toLocaleString('es-BO')}</td>
                  <td style={{ ...tdSt, backgroundColor: '#f8fafc', fontWeight: 'bold', color: '#1e40af' }}>Bs {dif.monto_excel.toLocaleString('es-BO')}</td>
                  <td style={tdSt}>
                    <span style={{
                      padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold',
                      backgroundColor: dif.tipo_discrepancia === 'Duplicado en Excel' ? '#f3e8ff' : dif.tipo_discrepancia === 'No existe en Sistema' ? '#fef2f2' : '#fff7ed',
                      color: dif.tipo_discrepancia === 'Duplicado en Excel' ? '#6b21a8' : dif.tipo_discrepancia === 'No existe en Sistema' ? '#991b1b' : '#c2410c'
                    }}>
                      {dif.tipo_discrepancia}
                    </span>
                  </td>
                  <td style={{ ...tdSt, textAlign: 'right' }}>
                    <button
                      onClick={() => aplicarCambioExcel(dif)}
                      disabled={guardandoCod === dif.llave_unica_row}
                      style={{ backgroundColor: '#16a34a', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '6px', fontWeight: 'bold', fontSize: '11px', cursor: 'pointer' }}
                    >
                      {guardandoCod === dif.llave_unica_row ? 'Sincronizando...' : '✓ Forzar Excel'}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const msgPantallaSt = { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Arial, sans-serif', backgroundColor: '#f8fafc', color: '#475569', fontWeight: 'bold' as const }
const panelControlSt = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'white', padding: '16px 24px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '24px' }
const thSt = { padding: '12px 16px' }
const tdSt = { padding: '10px 16px', verticalAlign: 'middle' }