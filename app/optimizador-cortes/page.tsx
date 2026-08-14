'use client'
import { useState, useEffect } from 'react'

interface PiezaEditable {
  pieza: string
  largo: number
  ancho: number
  espesor: number
  seccion: string
}

interface ItemColocado {
  id: string
  nombre: string
  largo: number
  ancho: number
  espesor: number
  x: number
  y: number
  girada: boolean
  tableroId: number
}

interface RectanguloLibre {
  x: number
  y: number
  largo: number
  ancho: number
}

interface TableroOptimizado {
  id: number
  elementos: ItemColocado[]
  libres: RectanguloLibre[]
}

export default function OptimizadorCortes() {
  const [piezasPendientes, setPiezasPendientes] = useState<PiezaEditable[]>([])
  const [muebleInfo, setMuebleInfo] = useState<any>(null)

  // Formulario y estado para agregar / editar pieza
  const [nuevaPiezaNombre, setNuevaPiezaNombre] = useState('')
  const [nuevaPiezaLargo, setNuevaPiezaLargo] = useState<number | ''>('')
  const [nuevaPiezaAncho, setNuevaPiezaAncho] = useState<number | ''>('')
  const [nuevaPiezaEspesor, setNuevaPiezaEspesor] = useState<number>(1.8)
  const [nuevaPiezaSeccion, setNuevaPiezaSeccion] = useState('General')
  const [indiceEdicion, setIndiceEdicion] = useState<number | null>(null)

  // Dimensiones del tablero estándar (cm)
  const [boardLargo, setBoardLargo] = useState(244)
  const [boardAncho, setBoardAncho] = useState(122)
  const [corteHoja, setCorteHoja] = useState(0.4) // 4mm de corte / kerf de cuchilla

  const [tableros, setTableros] = useState<TableroOptimizado[]>([])
  const [piezaSeleccionada, setPiezaSeleccionada] = useState<ItemColocado | null>(null)

  // Cargar piezas desde localStorage al montar garantizando persistencia
  useEffect(() => {
    const raw = localStorage.getItem('opt_piezas_pendientes')
    if (raw) {
      try {
        const data = JSON.parse(raw)
        if (data.piezas) {
          let expandidas: PiezaEditable[] = []
          data.piezas.forEach((p: any) => {
            const cant = p.cantidad || 1
            for (let i = 0; i < cant; i++) {
              expandidas.push({
                pieza: p.pieza,
                largo: Number(p.largo),
                ancho: Number(p.ancho),
                espesor: Number(p.espesor || 1.8),
                seccion: p.seccion || 'General',
              })
            }
          })
          setPiezasPendientes(expandidas)
        }
        if (data.mueble) setMuebleInfo(data.mueble)
      } catch (e) {
        console.error('Error al parsear piezas pendientes', e)
      }
    }
  }, [])

  const guardarOActualizarPieza = (e: React.FormEvent) => {
    e.preventDefault()
    if (!nuevaPiezaNombre.trim() || !nuevaPiezaLargo || !nuevaPiezaAncho) {
      alert('Por favor completa el nombre, largo y ancho de la pieza.')
      return
    }

    const piezaActualizada: PiezaEditable = {
      pieza: nuevaPiezaNombre.trim(),
      largo: Number(Number(nuevaPiezaLargo).toFixed(2)),
      ancho: Number(Number(nuevaPiezaAncho).toFixed(2)),
      espesor: Number(nuevaPiezaEspesor),
      seccion: nuevaPiezaSeccion.trim() || 'General'
    }

    if (indiceEdicion !== null) {
      const nuevas = [...piezasPendientes]
      nuevas[indiceEdicion] = piezaActualizada
      setPiezasPendientes(nuevas)
      setIndiceEdicion(null)
    } else {
      setPiezasPendientes([...piezasPendientes, piezaActualizada])
    }

    limpiarFormulario()
  }

  const iniciarEdicion = (index: number) => {
    const p = piezasPendientes[index]
    setNuevaPiezaNombre(p.pieza)
    setNuevaPiezaLargo(p.largo)
    setNuevaPiezaAncho(p.ancho)
    setNuevaPiezaEspesor(p.espesor)
    setNuevaPiezaSeccion(p.seccion)
    setIndiceEdicion(index)
  }

  const cancelarEdicion = () => {
    setIndiceEdicion(null)
    limpiarFormulario()
  }

  const limpiarFormulario = () => {
    setNuevaPiezaNombre('')
    setNuevaPiezaLargo('')
    setNuevaPiezaAncho('')
    setNuevaPiezaEspesor(1.8)
    setNuevaPiezaSeccion('General')
  }

  const eliminarPiezaPendiente = (index: number) => {
    if (indiceEdicion === index) cancelarEdicion()
    setPiezasPendientes(piezasPendientes.filter((_, i) => i !== index))
  }

  // -- ALGORITMO DE CORTE GUILLOTINA (Cortes rectos X e Y + Maximización de Retazos) --
  const ejecutarOptimizacion = () => {
    if (piezasPendientes.length === 0) {
      alert('No hay piezas pendientes para optimizar.')
      return
    }

    let itemsAColocar = piezasPendientes.map((p, index) => ({
      id: `item-${index}-${Math.random().toString(36).substr(2, 5)}`,
      nombre: p.pieza,
      largo: p.largo,
      ancho: p.ancho,
      espesor: p.espesor,
      area: p.largo * p.ancho
    }))

    itemsAColocar.sort((a, b) => b.area - a.area)

    const hojas: TableroOptimizado[] = []

    const dividirLibresGuillotina = (libres: RectanguloLibre[], colocado: { x: number, y: number, largo: number, ancho: number }) => {
      let nuevosLibres: RectanguloLibre[] = []

      libres.forEach(lib => {
        if (
          colocado.x + colocado.largo <= lib.x ||
          colocado.x >= lib.x + lib.largo ||
          colocado.y + colocado.ancho <= lib.y ||
          colocado.y >= lib.y + lib.ancho
        ) {
          nuevosLibres.push(lib)
          return
        }

        const espacioDerecho = lib.x + lib.largo - (colocado.x + colocado.largo)
        const espacioInferior = lib.y + lib.ancho - (colocado.y + colocado.ancho)

        if (espacioDerecho > 0) {
          nuevosLibres.push({
            x: Number((colocado.x + colocado.largo).toFixed(2)),
            y: lib.y,
            largo: Number(espacioDerecho.toFixed(2)),
            ancho: lib.ancho
          })
        }

        if (espacioInferior > 0) {
          nuevosLibres.push({
            x: lib.x,
            y: Number((colocado.y + colocado.ancho).toFixed(2)),
            largo: Number(colocado.largo.toFixed(2)),
            ancho: Number(espacioInferior.toFixed(2))
          })
        }
      })

      return nuevosLibres.filter(r => r.largo >= 5 && r.ancho >= 5)
    }

    itemsAColocar.forEach(item => {
      let colocadoExitoso = false

      for (let hoja of hojas) {
        let mejorFitIndex = -1
        let mejorScore = Infinity
        let usarGirada = false

        hoja.libres.forEach((lib, idx) => {
          if (item.largo + corteHoja <= lib.largo && item.ancho + corteHoja <= lib.ancho) {
            let score = Math.min(lib.largo - item.largo, lib.ancho - item.ancho)
            if (score < mejorScore) {
              mejorScore = score
              mejorFitIndex = idx
              usarGirada = false
            }
          }
          if (item.ancho + corteHoja <= lib.largo && item.largo + corteHoja <= lib.ancho) {
            let score = Math.min(lib.largo - item.ancho, lib.ancho - item.largo)
            if (score < mejorScore) {
              mejorScore = score
              mejorFitIndex = idx
              usarGirada = true
            }
          }
        })

        if (mejorFitIndex !== -1) {
          let lib = hoja.libres[mejorFitIndex]
          let w = usarGirada ? item.ancho : item.largo
          let h = usarGirada ? item.largo : item.ancho

          let nuevoElemento: ItemColocado = {
            id: item.id,
            nombre: item.nombre,
            largo: Number(w.toFixed(2)),
            ancho: Number(h.toFixed(2)),
            espesor: item.espesor,
            x: Number(lib.x.toFixed(2)),
            y: Number(lib.y.toFixed(2)),
            girada: usarGirada,
            tableroId: hoja.id
          }

          hoja.elementos.push(nuevoElemento)
          hoja.libres = dividirLibresGuillotina(hoja.libres, {
            x: nuevoElemento.x,
            y: nuevoElemento.y,
            largo: w + corteHoja,
            ancho: h + corteHoja
          })

          colocadoExitoso = true
          break
        }
      }

      if (!colocadoExitoso) {
        const nuevoId = hojas.length + 1
        let usarGirada = false
        let w = item.largo
        let h = item.ancho

        if (w + corteHoja > boardLargo || h + corteHoja > boardAncho) {
          w = item.ancho
          h = item.largo
          usarGirada = true
        }

        let nuevoElemento: ItemColocado = {
          id: item.id,
          nombre: item.nombre,
          largo: Number(w.toFixed(2)),
          ancho: Number(h.toFixed(2)),
          espesor: item.espesor,
          x: Number(corteHoja),
          y: Number(corteHoja),
          girada: usarGirada,
          tableroId: nuevoId
        }

        let espacioInicial: RectanguloLibre = {
          x: 0,
          y: 0,
          largo: boardLargo,
          ancho: boardAncho
        }

        let libresRestantes = dividirLibresGuillotina([espacioInicial], {
          x: nuevoElemento.x,
          y: nuevoElemento.y,
          largo: w + corteHoja,
          ancho: h + corteHoja
        })

        hojas.push({
          id: nuevoId,
          elementos: [nuevoElemento],
          libres: libresRestantes
        })
      }
    })

    setTableros(hojas)
    setPiezaSeleccionada(null)
  }

  const moverPiezaManual = (deltaX: number, deltaY: number) => {
    if (!piezaSeleccionada) return
    setTableros(tableros.map(t => {
      if (t.id !== piezaSeleccionada.tableroId) return t
      return {
        ...t,
        elementos: t.elementos.map(el => {
          if (el.id !== piezaSeleccionada.id) return el
          const nuevoX = Number(Math.max(0, Math.min(boardLargo - el.largo, el.x + deltaX)).toFixed(2))
          const nuevoY = Number(Math.max(0, Math.min(boardAncho - el.ancho, el.y + deltaY)).toFixed(2))
          const actualizado = { ...el, x: nuevoX, y: nuevoY }
          if (piezaSeleccionada.id === el.id) {
            setPiezaSeleccionada(actualizado)
          }
          return actualizado
        })
      }
    }))
  }

  const girarPiezaManual = () => {
    if (!piezaSeleccionada) return
    setTableros(tableros.map(t => {
      if (t.id !== piezaSeleccionada.tableroId) return t
      return {
        ...t,
        elementos: t.elementos.map(el => {
          if (el.id !== piezaSeleccionada.id) return el
          const nuevoLargo = el.ancho
          const nuevoAncho = el.largo
          if (el.x + nuevoLargo > boardLargo || el.y + nuevoAncho > boardAncho) {
            alert('La pieza no cabe con esta rotación en la posición actual.')
            return el
          }
          const actualizado = {
            ...el,
            largo: Number(nuevoLargo.toFixed(2)),
            ancho: Number(nuevoAncho.toFixed(2)),
            girada: !el.girada,
          }
          setPiezaSeleccionada(actualizado)
          return actualizado
        })
      }
    }))
  }

  const cambiarTableroPieza = (nuevoTableroId: number) => {
    if (!piezaSeleccionada || piezaSeleccionada.tableroId === nuevoTableroId) return

    setTableros(prevTableros => {
      let piezaAMover: ItemColocado | null = null

      const tablerosSinPieza = prevTableros.map(t => {
        if (t.id === piezaSeleccionada.tableroId) {
          return {
            ...t,
            elementos: t.elementos.filter(el => {
              if (el.id === piezaSeleccionada.id) {
                piezaAMover = el
                return false
              }
              return true
            })
          }
        }
        return t
      })

      if (!piezaAMover) return prevTableros

      return tablerosSinPieza.map(t => {
        if (t.id === nuevoTableroId) {
          const piezaMovidaActualizada = {
            ...piezaAMover!,
            tableroId: nuevoTableroId,
            x: corteHoja,
            y: corteHoja
          }
          setPiezaSeleccionada(piezaMovidaActualizada)
          return {
            ...t,
            elementos: [...t.elementos, piezaMovidaActualizada]
          }
        }
        return t
      })
    })
  }

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', minHeight: '100vh', backgroundColor: '#f5f5f5', paddingBottom: '40px' }}>
      {/* NAVBAR */}
      <nav style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '15px 30px', backgroundColor: '#0f3460', color: 'white',
        borderBottom: '3px solid #d4af37', boxSizing: 'border-box'
      }}>
        <a href="/" style={{ fontWeight: 'bold', fontSize: '18px', color: 'white', textDecoration: 'none' }}>
          MuebLess is Better — Optimizador Corte AI Profesional
        </a>
        <a href="/diseno-cajones" style={{ color: '#0f3460', backgroundColor: 'white', fontSize: '13px', textDecoration: 'none', fontWeight: 'bold', padding: '7px 14px', borderRadius: '8px' }}>
          ← Volver al Diseñador
        </a>
      </nav>

      <div style={{ maxWidth: '1200px', margin: '20px auto', padding: '0 15px' }}>
        {/* PANEL DE CONFIGURACIÓN */}
        <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 10px rgba(0,0,0,0.06)', marginBottom: '20px' }}>
          <h2 style={{ margin: '0 0 15px 0', fontSize: '18px', color: '#0f3460' }}>⚙️ Configuración de Tableros y Cortes Rectos</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '15px', marginBottom: '15px' }}>
            <div>
              <label style={{ fontSize: '12px', color: '#666', display: 'block', marginBottom: '5px' }}>Largo tablero (cm)</label>
              <input type="number" style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ccc' }} value={boardLargo} onChange={e => setBoardLargo(Number(e.target.value))} />
            </div>
            <div>
              <label style={{ fontSize: '12px', color: '#666', display: 'block', marginBottom: '5px' }}>Ancho tablero (cm)</label>
              <input type="number" style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ccc' }} value={boardAncho} onChange={e => setBoardAncho(Number(e.target.value))} />
            </div>
            <div>
              <label style={{ fontSize: '12px', color: '#666', display: 'block', marginBottom: '5px' }}>Espesor de corte / Kerf (cm)</label>
              <input type="number" step="0.1" style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ccc' }} value={corteHoja} onChange={e => setCorteHoja(Number(e.target.value))} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button onClick={ejecutarOptimizacion} style={{ padding: '12px 24px', backgroundColor: '#d4af37', color: '#0f3460', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', fontSize: '14px' }}>
              📐 Calcular Cortes AI ({piezasPendientes.length} piezas listas)
            </button>
            <button onClick={() => window.print()} style={{ padding: '12px 20px', backgroundColor: '#0f3460', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', fontSize: '14px' }}>
              🖨️ Imprimir Planos
            </button>
          </div>
        </div>

        {/* GESTIÓN Y LISTA DE PIEZAS PENDIENTES */}
        <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 10px rgba(0,0,0,0.06)', marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
            <h2 style={{ margin: 0, fontSize: '18px', color: '#0f3460' }}>
              {indiceEdicion !== null ? `✏️ Editando Pieza N° ${indiceEdicion + 1}` : `📋 Lista de Piezas a Cortar (${piezasPendientes.length})`}
            </h2>
            {indiceEdicion !== null && (
              <button onClick={cancelarEdicion} style={{ background: '#ccc', color: '#333', border: 'none', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>
                Cancelar Edición
              </button>
            )}
          </div>
          
          <form onSubmit={guardarOActualizarPieza} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr)) auto', gap: '10px', marginBottom: '20px', alignItems: 'end', background: indiceEdicion !== null ? '#fff9e6' : '#f9f9f9', border: indiceEdicion !== null ? '1px solid #d4af37' : 'none', padding: '12px', borderRadius: '8px' }}>
            <div>
              <label style={{ fontSize: '11px', color: '#666', display: 'block', marginBottom: '3px' }}>Nombre pieza</label>
              <input type="text" placeholder="Ej. Lateral" style={{ width: '100%', padding: '7px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '13px' }} value={nuevaPiezaNombre} onChange={e => setNuevaPiezaNombre(e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: '11px', color: '#666', display: 'block', marginBottom: '3px' }}>Largo (cm)</label>
              <input type="number" placeholder="0" style={{ width: '100%', padding: '7px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '13px' }} value={nuevaPiezaLargo} onChange={e => setNuevaPiezaLargo(e.target.value === '' ? '' : Number(e.target.value))} />
            </div>
            <div>
              <label style={{ fontSize: '11px', color: '#666', display: 'block', marginBottom: '3px' }}>Ancho (cm)</label>
              <input type="number" placeholder="0" style={{ width: '100%', padding: '7px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '13px' }} value={nuevaPiezaAncho} onChange={e => setNuevaPiezaAncho(e.target.value === '' ? '' : Number(e.target.value))} />
            </div>
            <div>
              <label style={{ fontSize: '11px', color: '#666', display: 'block', marginBottom: '3px' }}>Espesor (cm)</label>
              <input type="number" step="0.1" style={{ width: '100%', padding: '7px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '13px' }} value={nuevaPiezaEspesor} onChange={e => setNuevaPiezaEspesor(Number(e.target.value))} />
            </div>
            <div style={{ display: 'flex', gap: '5px' }}>
              <button type="submit" style={{ padding: '8px 14px', backgroundColor: indiceEdicion !== null ? '#d4af37' : '#0f3460', color: indiceEdicion !== null ? '#0f3460' : 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', fontSize: '13px', height: '35px' }}>
                {indiceEdicion !== null ? '💾 Guardar' : '➕ Agregar'}
              </button>
            </div>
          </form>

          {piezasPendientes.length > 0 ? (
            <div style={{ maxHeight: '220px', overflowY: 'auto', border: '1px solid #eee', borderRadius: '8px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                <thead style={{ backgroundColor: '#0f3460', color: 'white', position: 'sticky', top: 0 }}>
                  <tr>
                    <th style={{ padding: '8px 12px' }}>Pieza</th>
                    <th style={{ padding: '8px 12px' }}>Largo (cm)</th>
                    <th style={{ padding: '8px 12px' }}>Ancho (cm)</th>
                    <th style={{ padding: '8px 12px' }}>Espesor</th>
                    <th style={{ padding: '8px 12px', textAlign: 'center' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {piezasPendientes.map((p, index) => (
                    <tr key={index} style={{ borderBottom: '1px solid #eee', backgroundColor: indiceEdicion === index ? '#fff9e6' : index % 2 === 0 ? '#fff' : '#fafafa' }}>
                      <td style={{ padding: '8px 12px', fontWeight: 'bold', color: '#0f3460' }}>{p.pieza}</td>
                      <td style={{ padding: '8px 12px' }}>{p.largo}</td>
                      <td style={{ padding: '8px 12px' }}>{p.ancho}</td>
                      <td style={{ padding: '8px 12px' }}>{p.espesor} cm</td>
                      <td style={{ padding: '8px 12px', textAlign: 'center', display: 'flex', gap: '6px', justifyContent: 'center' }}>
                        <button 
                          onClick={() => iniciarEdicion(index)} 
                          style={{ background: '#d4af37', color: '#0f3460', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}
                        >
                          ✏️ Editar
                        </button>
                        <button 
                          onClick={() => eliminarPiezaPendiente(index)} 
                          style={{ background: '#ff4444', color: 'white', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}
                        >
                          🗑️ Eliminar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p style={{ color: '#888', fontSize: '13px', textAlign: 'center', margin: '20px 0' }}>No hay piezas en la lista. Agrega una arriba o cárgalas desde el diseñador.</p>
          )}
        </div>

        {/* PANEL DE EDICIÓN MANUAL Y CAMBIO DE HOJA */}
        {piezaSeleccionada && (
          <div style={{ backgroundColor: '#fff9e6', border: '2px solid #d4af37', borderRadius: '12px', padding: '15px 20px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
            <div>
              <p style={{ margin: '0 0 5px 0', fontWeight: 'bold', color: '#0f3460' }}>
                🎯 Pieza seleccionada: {piezaSeleccionada.nombre} ({piezaSeleccionada.largo} × {piezaSeleccionada.ancho} cm) — Tablero Actual: {piezaSeleccionada.tableroId}
              </p>
              <p style={{ margin: 0, fontSize: '12px', color: '#666' }}>Mueve la pieza, gírala o mándala a otra hoja para aprovechar el espacio vacío.</p>
            </div>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#0f3460' }}>Mover a otra hoja:</label>
                <select 
                  value={piezaSeleccionada.tableroId} 
                  onChange={(e) => cambiarTableroPieza(Number(e.target.value))}
                  style={{ padding: '6px', borderRadius: '6px', border: '1px solid #d4af37', backgroundColor: 'white', fontWeight: 'bold' }}
                >
                  {tableros.map(t => (
                    <option key={t.id} value={t.id}>Tablero N° {t.id}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 36px)', gap: '4px' }}>
                <div />
                <button onClick={() => moverPiezaManual(0, -2)} style={{ padding: '6px', background: '#0f3460', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>⬆️</button>
                <div />
                <button onClick={() => moverPiezaManual(-2, 0)} style={{ padding: '6px', background: '#0f3460', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>⬅️</button>
                <button onClick={() => moverPiezaManual(0, 2)} style={{ padding: '6px', background: '#0f3460', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>⬇️</button>
                <button onClick={() => moverPiezaManual(2, 0)} style={{ padding: '6px', background: '#0f3460', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>➡️</button>
              </div>

              <button onClick={girarPiezaManual} style={{ padding: '8px 14px', backgroundColor: '#0f3460', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>
                🔄 Girar
              </button>
              <button onClick={() => setPiezaSeleccionada(null)} style={{ padding: '8px 14px', backgroundColor: '#ccc', color: '#333', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
                ✖️ Cerrar
              </button>
            </div>
          </div>
        )}

        {/* PLANOS / TABLEROS RESPONSIVOS */}
        {tableros.length > 0 ? (
          tableros.map(tablero => (
            <div key={tablero.id} style={{ backgroundColor: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 10px rgba(0,0,0,0.06)', marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <h3 style={{ margin: 0, color: '#0f3460' }}>Tablero N° {tablero.id}</h3>
                <span style={{ fontSize: '13px', color: '#666' }}>{tablero.elementos.length} piezas colocadas</span>
              </div>
              <div style={{ width: '100%', overflowX: 'auto', backgroundColor: '#eef0f2', borderRadius: '8px', padding: '10px' }}>
                <svg
                  viewBox={`0 0 ${boardLargo} ${boardAncho}`}
                  style={{ width: '100%', minWidth: '600px', height: 'auto', background: '#fdfbf7', border: '1px solid #ccc', display: 'block' }}
                >
                  <rect x="0" y="0" width={boardLargo} height={boardAncho} fill="#fffcf5" stroke="#333" strokeWidth="0.5" />
                  {tablero.elementos.map(el => {
                    const isSelected = piezaSeleccionada?.id === el.id
                    return (
                      <g key={el.id} onClick={() => setPiezaSeleccionada(el)} style={{ cursor: 'pointer' }}>
                        <rect
                          x={el.x}
                          y={el.y}
                          width={el.largo}
                          height={el.ancho}
                          fill={isSelected ? '#ff4444' : '#2196F3'}
                          fillOpacity={isSelected ? 0.85 : 0.65}
                          stroke="#0f3460"
                          strokeWidth={isSelected ? "1" : "0.5"}
                        />
                        <text
                          x={el.x + el.largo / 2}
                          y={el.y + el.ancho / 2}
                          fontSize="3.5"
                          fill="#000"
                          textAnchor="middle"
                          dominantBaseline="middle"
                          style={{ pointerEvents: 'none', userSelect: 'none', fontWeight: 'bold' }}
                        >
                          {el.nombre} ({el.largo}×{el.ancho}) {el.girada ? '🔄' : ''}
                        </text>
                      </g>
                    )
                  })}
                </svg>
              </div>
              <p style={{ fontSize: '11px', color: '#888', margin: '8px 0 0 0' }}>💡 Haz clic en una pieza para seleccionarla, moverla o transferirla a otro tablero en el menú superior.</p>
            </div>
          ))
        ) : (
          <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '40px', textAlign: 'center', color: '#888', boxShadow: '0 2px 10px rgba(0,0,0,0.06)' }}>
            <p style={{ fontSize: '16px', margin: '0 0 10px 0' }}>No hay tableros calculados aún.</p>
            <p style={{ fontSize: '13px', margin: 0 }}>Haz clic en <strong>"📐 Calcular Cortes Guillotina"</strong> para generar los planos.</p>
          </div>
        )}
      </div>
    </div>
  )
}