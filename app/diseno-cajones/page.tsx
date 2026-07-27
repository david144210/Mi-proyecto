'use client'
import { useState, useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

// ============================================================
// TIPOS
// ============================================================
type TipoSeccion = 'cajon' | 'puerta' | 'espacio'
type TipoRiel = 'bola' | 'ocultas' | 'telescopicas'
type Bisagra = 'izquierda' | 'derecha' | 'ambas'

interface Seccion {
  id: number
  tipo: TipoSeccion
  alturaCm: number
  riel: TipoRiel
  cantidadPuertas: 1 | 2
  bisagra: Bisagra
}

const COLORES = [
  { id: 'blanco', nombre: 'Blanco', hex: 0xf3f1ea },
  { id: 'wengue', nombre: 'Wengue', hex: 0x352721 },
  { id: 'gris', nombre: 'Gris Grafito', hex: 0x6b6d70 },
  { id: 'nogal', nombre: 'Nogal', hex: 0x7a5233 },
  { id: 'natural', nombre: 'Haya Natural', hex: 0xd9bd8f },
]

interface PiezaCorte {
  pieza: string
  cantidad: number
  largo: number
  ancho: number
  espesor: number
  seccion: string
}

export default function DisenoCajones() {
  const [usuario, setUsuario] = useState<any>(null)
  const [checking, setChecking] = useState(true)

  // Dimensiones del mueble
  const [anchoCm, setAnchoCm] = useState(80)
  const [altoCm, setAltoCm] = useState(120)
  const [profundoCm, setProfundoCm] = useState(55)
  const [colorId, setColorId] = useState('blanco')

  // ---- Espesores de tablero (editables, en mm) ----
  const [espesorSelCuerpo, setEspesorSelCuerpo] = useState<'15' | '18' | 'custom'>('18')
  const [espesorMM, setEspesorMM] = useState(18) // grosor del cuerpo, cajones y puertas

  const [espesorSelFondo, setEspesorSelFondo] = useState<'3' | '6' | '9' | 'custom'>('6')
  const [espesorFondoMM, setEspesorFondoMM] = useState(6) // grosor del tablero posterior

  const [espesorSelBase, setEspesorSelBase] = useState<'3' | '6' | '9' | 'custom'>('6')
  const [espesorBaseCajonMM, setEspesorBaseCajonMM] = useState(6) // grosor del piso del cajon

  const espesorCm = espesorMM / 10
  const espesorFondoCm = espesorFondoMM / 10
  const espesorBaseCajonCm = espesorBaseCajonMM / 10

  // Handlers: sincronizan el select (15/18/custom, 3/6/9/custom) con el valor real en mm
  const handleEspesorCuerpo = (valor: '15' | '18' | 'custom') => {
    setEspesorSelCuerpo(valor)
    if (valor !== 'custom') setEspesorMM(Number(valor))
  }
  const handleEspesorFondo = (valor: '3' | '6' | '9' | 'custom') => {
    setEspesorSelFondo(valor)
    if (valor !== 'custom') setEspesorFondoMM(Number(valor))
  }
  const handleEspesorBase = (valor: '3' | '6' | '9' | 'custom') => {
    setEspesorSelBase(valor)
    if (valor !== 'custom') setEspesorBaseCajonMM(Number(valor))
  }

  // ---- Holguras editables (cm) ----
  const [holguraPuerta, setHolguraPuerta] = useState(0.15)
  const [holguraFrenteCajon, setHolguraFrenteCajon] = useState(0.15)
  const [holguraRielAlto, setHolguraRielAlto] = useState(2.5)
  const [holguraRielFondo, setHolguraRielFondo] = useState(2)
  const [holguraRielLateral, setHolguraRielLateral] = useState(1.2)
  const [mostrarAjustes, setMostrarAjustes] = useState(false)

  // Secciones (de abajo hacia arriba)
  const [secciones, setSecciones] = useState<Seccion[]>([
    { id: 1, tipo: 'cajon', alturaCm: 18, riel: 'bola', cantidadPuertas: 1, bisagra: 'izquierda' },
    { id: 2, tipo: 'cajon', alturaCm: 18, riel: 'bola', cantidadPuertas: 1, bisagra: 'izquierda' },
    { id: 3, tipo: 'puerta', alturaCm: 60, riel: 'bola', cantidadPuertas: 2, bisagra: 'ambas' },
  ])
  const [nextId, setNextId] = useState(4)

  // Refs de three.js
  const mountRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const muebleGroupRef = useRef<THREE.Group | null>(null)

  // ---------- Auth simple (mismo patron que el cotizador) ----------
  useEffect(() => {
    const carnetGuardado = localStorage.getItem('carnet')
    if (!carnetGuardado) { window.location.replace('/'); return }
    setUsuario({ carnet: carnetGuardado })
    setChecking(false)
  }, [])

  // ---------- Inicializar escena three.js (recién cuando el div del canvas ya existe) ----------
  useEffect(() => {
    if (checking) return // el div con mountRef todavía no está en el DOM
    if (!mountRef.current) return

    // Tamaño inicial con fallback (por si el layout aun no calculó la altura real)
    const width = mountRef.current.clientWidth || 800
    const height = mountRef.current.clientHeight || 600

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0xeef0f2)
    sceneRef.current = scene

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 500)
    camera.position.set(4, 3.2, 6)
    cameraRef.current = camera

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(width, height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    mountRef.current.appendChild(renderer.domElement)
    rendererRef.current = renderer

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(0, 1.2, 0)
    controls.enableDamping = true
    controlsRef.current = controls

    // Luces
    const hemi = new THREE.HemisphereLight(0xffffff, 0x555555, 1.2)
    scene.add(hemi)
    const dir = new THREE.DirectionalLight(0xffffff, 0.9)
    dir.position.set(5, 8, 5)
    dir.castShadow = true
    scene.add(dir)

    // Piso
    const piso = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 20),
      new THREE.MeshStandardMaterial({ color: 0xd8dadd })
    )
    piso.rotation.x = -Math.PI / 2
    piso.receiveShadow = true
    scene.add(piso)

    const grupo = new THREE.Group()
    scene.add(grupo)
    muebleGroupRef.current = grupo

    let frameId: number
    const animate = () => {
      frameId = requestAnimationFrame(animate)
      controls.update()
      renderer.render(scene, camera)
    }
    animate()

    const resize = (w: number, h: number) => {
      if (w <= 0 || h <= 0) return
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }

    // ResizeObserver detecta el tamaño REAL del contenedor apenas el layout
    // termina de calcularlo (grid + sticky pueden tardar un tick en resolverse),
    // a diferencia del evento "resize" de window que solo dispara al mover la ventana.
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const { width: w, height: h } = entry.contentRect
      resize(w, h)
    })
    ro.observe(mountRef.current)

    const handleWindowResize = () => {
      if (!mountRef.current) return
      resize(mountRef.current.clientWidth, mountRef.current.clientHeight)
    }
    window.addEventListener('resize', handleWindowResize)

    return () => {
      cancelAnimationFrame(frameId)
      ro.disconnect()
      window.removeEventListener('resize', handleWindowResize)
      controls.dispose()
      renderer.dispose()
      if (mountRef.current && renderer.domElement.parentNode === mountRef.current) {
        mountRef.current.removeChild(renderer.domElement)
      }
    }
  }, [checking])

  // ---------- Reconstruir el mueble cada vez que cambian los datos ----------
  useEffect(() => {
    const grupo = muebleGroupRef.current
    if (!grupo) return

    // Limpiar mueble anterior
    while (grupo.children.length) {
      const obj = grupo.children.pop() as THREE.Mesh
      obj.geometry?.dispose()
      if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose())
      else (obj.material as THREE.Material)?.dispose?.()
    }

    const SC = 1 / 30 // escala: 1 unidad three.js = 30 cm
    const ancho = anchoCm * SC
    const alto = altoCm * SC
    const profundo = profundoCm * SC
    const esp = espesorCm * SC
    const espFondo = espesorFondoCm * SC

    const colorHex = COLORES.find(c => c.id === colorId)?.hex ?? 0xf3f1ea
    const matCarcasa = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.6 })
    const matFrente = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.45 })
    const matMetal = new THREE.MeshStandardMaterial({ color: 0x9a9a9a, metalness: 0.7, roughness: 0.35 })

    const addBox = (w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
      mesh.position.set(x, y, z)
      mesh.castShadow = true
      mesh.receiveShadow = true
      grupo.add(mesh)
      return mesh
    }

    // Carcasa: laterales, piso, techo, fondo
    addBox(esp, alto, profundo, -ancho / 2 + esp / 2, alto / 2, 0, matCarcasa) // lateral izq
    addBox(esp, alto, profundo, ancho / 2 - esp / 2, alto / 2, 0, matCarcasa) // lateral der
    addBox(ancho, esp, profundo, 0, esp / 2, 0, matCarcasa) // piso
    addBox(ancho, esp, profundo, 0, alto - esp / 2, 0, matCarcasa) // techo
    addBox(ancho, alto, espFondo, 0, alto / 2, -profundo / 2 + espFondo / 2, matCarcasa) // fondo (tablero mas delgado)

    const interiorAncho = ancho - esp * 2
    let cursorY = esp // empieza sobre el piso interior

    secciones.forEach((sec) => {
      const h = sec.alturaCm * SC
      const centroY = cursorY + h / 2

      if (sec.tipo === 'cajon') {
        // Frente del cajon (ligeramente adelante de la carcasa, "abierto")
        const frenteZ = profundo / 2 + esp / 2 + 0.02
        addBox(interiorAncho - 0.01, h - 0.015, esp, 0, centroY, frenteZ, matFrente)
        // Tirador
        addBox(interiorAncho * 0.35, 0.02, 0.02, 0, centroY, frenteZ + esp / 2 + 0.02, matMetal)
        // Rieles (barras metalicas a los lados, dentro del cuerpo)
        const rielLargo = profundo - esp * 1.5
        const rielY = cursorY + 0.02
        addBox(0.02, 0.02, rielLargo, -interiorAncho / 2 + 0.03, rielY, 0, matMetal)
        addBox(0.02, 0.02, rielLargo, interiorAncho / 2 - 0.03, rielY, 0, matMetal)
      } else if (sec.tipo === 'puerta') {
        const frenteZ = profundo / 2 + esp / 2 + 0.02
        if (sec.cantidadPuertas === 2) {
          const wPuerta = interiorAncho / 2 - 0.01
          addBox(wPuerta, h - 0.015, esp, -wPuerta / 2 - 0.005, centroY, frenteZ, matFrente)
          addBox(wPuerta, h - 0.015, esp, wPuerta / 2 + 0.005, centroY, frenteZ, matFrente)
          addBox(0.02, 0.15, 0.02, -0.05, centroY, frenteZ + esp / 2 + 0.02, matMetal)
          addBox(0.02, 0.15, 0.02, 0.05, centroY, frenteZ + esp / 2 + 0.02, matMetal)
        } else {
          addBox(interiorAncho - 0.01, h - 0.015, esp, 0, centroY, frenteZ, matFrente)
          const lado = sec.bisagra === 'derecha' ? -1 : 1
          addBox(0.02, 0.15, 0.02, lado * (interiorAncho / 2 - 0.08), centroY, frenteZ + esp / 2 + 0.02, matMetal)
        }
      }
      // 'espacio' no dibuja frente: queda hueco (repisa abierta)

      cursorY += h
    })

    // Centrar camara segun tamaño
    const cam = cameraRef.current
    const controls = controlsRef.current
    if (cam && controls) {
      controls.target.set(0, alto / 2, 0)
      cam.position.set(ancho * 1.6 + 1.5, alto * 1.1 + 0.8, profundo * 2.2 + ancho)
    }
  }, [anchoCm, altoCm, profundoCm, colorId, secciones, checking, espesorCm, espesorFondoCm])

  // ---------- Helpers de secciones ----------
  const alturaUsada = secciones.reduce((acc, s) => acc + s.alturaCm, 0)
  const alturaInterior = altoCm - espesorCm * 2
  const alturaRestante = alturaInterior - alturaUsada

  // ---------- Medidas internas ----------
  const anchoInterior = anchoCm - espesorCm * 2
  const profundoInterior = profundoCm - espesorFondoCm

  // ---------- Lista de piezas para corte ----------
  const calcularListaPiezas = (): PiezaCorte[] => {
    const piezas: PiezaCorte[] = []

    // Cuerpo / carcasa
    piezas.push({ pieza: 'Lateral', cantidad: 2, largo: altoCm, ancho: profundoCm, espesor: espesorCm, seccion: 'Cuerpo' })
    piezas.push({ pieza: 'Piso / Techo', cantidad: 2, largo: anchoInterior, ancho: profundoCm, espesor: espesorCm, seccion: 'Cuerpo' })
    piezas.push({ pieza: 'Fondo (posterior)', cantidad: 1, largo: anchoInterior, ancho: alturaInterior > 0 ? alturaInterior : altoCm, espesor: espesorFondoCm, seccion: 'Cuerpo' })

    secciones.forEach((sec, i) => {
      const nombreSeccion = `${sec.tipo === 'cajon' ? 'Cajón' : sec.tipo === 'puerta' ? 'Puerta' : 'Espacio'} ${i + 1}`

      if (sec.tipo === 'cajon') {
        piezas.push({ pieza: 'Frente de cajón', cantidad: 1, largo: anchoInterior - holguraFrenteCajon, ancho: sec.alturaCm - holguraFrenteCajon, espesor: espesorCm, seccion: nombreSeccion })
        piezas.push({ pieza: 'Costado de caja', cantidad: 2, largo: profundoCm - holguraRielFondo, ancho: sec.alturaCm - holguraRielAlto, espesor: espesorCm, seccion: nombreSeccion })
        piezas.push({ pieza: 'Fondo trasero de caja', cantidad: 1, largo: anchoInterior - 2 * espesorCm - holguraRielLateral, ancho: sec.alturaCm - holguraRielAlto - espesorBaseCajonCm, espesor: espesorCm, seccion: nombreSeccion })
        piezas.push({ pieza: 'Base de cajón', cantidad: 1, largo: anchoInterior - 2 * espesorCm - holguraRielLateral, ancho: profundoCm - holguraRielFondo, espesor: espesorBaseCajonCm, seccion: nombreSeccion })
      } else if (sec.tipo === 'puerta') {
        piezas.push({
          pieza: 'Puerta',
          cantidad: sec.cantidadPuertas,
          largo: (anchoInterior / sec.cantidadPuertas) - holguraPuerta,
          ancho: sec.alturaCm - holguraPuerta,
          espesor: espesorCm,
          seccion: nombreSeccion,
        })
      }
      // 'espacio' no genera piezas: queda como hueco abierto
    })

    return piezas.filter(p => p.largo > 0 && p.ancho > 0)
  }

  // Agrupa piezas idénticas (misma pieza + medidas + espesor) sumando cantidades,
  // útil para pedir el corte de una sola vez en vez de repetido por sección.
  const agruparPiezas = (piezas: PiezaCorte[]): PiezaCorte[] => {
    const mapa = new Map<string, PiezaCorte>()
    piezas.forEach(p => {
      const key = `${p.pieza}|${p.largo.toFixed(1)}|${p.ancho.toFixed(1)}|${p.espesor}`
      const existente = mapa.get(key)
      if (existente) existente.cantidad += p.cantidad
      else mapa.set(key, { ...p })
    })
    return Array.from(mapa.values())
  }

  const listaPiezasDetallada = calcularListaPiezas()
  const listaPiezasAgrupada = agruparPiezas(listaPiezasDetallada)
  const areaTotalM2 = listaPiezasDetallada.reduce((acc, p) => acc + (p.largo * p.ancho * p.cantidad) / 10000, 0)

  const copiarListaPiezas = () => {
    const texto = [
      `LISTA DE PIEZAS — ${anchoCm}×${altoCm}×${profundoCm} cm`,
      '',
      ...listaPiezasAgrupada.map(p => `${p.cantidad} x ${p.pieza} — ${p.largo.toFixed(1)} x ${p.ancho.toFixed(1)} cm (esp. ${p.espesor} cm)`),
      '',
      `Área total aprox.: ${areaTotalM2.toFixed(2)} m²`,
    ].join('\n')
    navigator.clipboard?.writeText(texto)
  }

  const agregarSeccion = (tipo: TipoSeccion) => {
    setSecciones([...secciones, {
      id: nextId,
      tipo,
      alturaCm: tipo === 'cajon' ? 18 : tipo === 'puerta' ? 40 : 20,
      riel: 'bola',
      cantidadPuertas: 1,
      bisagra: 'izquierda',
    }])
    setNextId(nextId + 1)
  }

  const actualizarSeccion = (id: number, cambios: Partial<Seccion>) => {
    setSecciones(secciones.map(s => s.id === id ? { ...s, ...cambios } : s))
  }

  const eliminarSeccion = (id: number) => {
    setSecciones(secciones.filter(s => s.id !== id))
  }

  const moverSeccion = (id: number, dir: -1 | 1) => {
    const idx = secciones.findIndex(s => s.id === id)
    const nuevoIdx = idx + dir
    if (nuevoIdx < 0 || nuevoIdx >= secciones.length) return
    const copia = [...secciones]
    ;[copia[idx], copia[nuevoIdx]] = [copia[nuevoIdx], copia[idx]]
    setSecciones(copia)
  }

  // Lista de piezas (informativa, sin precios)
  const totalCajones = secciones.filter(s => s.tipo === 'cajon').length
  const totalPuertas = secciones.filter(s => s.tipo === 'puerta').reduce((a, s) => a + s.cantidadPuertas, 0)

  const inputStyle: React.CSSProperties = {
    padding: '9px 12px', borderRadius: '8px', border: '1px solid #ddd',
    fontSize: '13px', outline: 'none', width: '100%', boxSizing: 'border-box', backgroundColor: 'white',
  }
  const labelStyle: React.CSSProperties = { fontSize: '12px', color: '#888', display: 'block', marginBottom: '4px' }

  if (checking) return null

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', minHeight: '100vh', backgroundColor: '#f5f5f5' }}>
      <style>{`
        @media (max-width: 900px) {
          .diseno-layout { grid-template-columns: 1fr !important; }
          .diseno-canvas { height: 380px !important; }
        }
      `}</style>

      {/* NAVBAR */}
      <nav style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '15px 40px', backgroundColor: '#222', color: 'white',
        position: 'fixed', top: 0, width: '100%', zIndex: 1000, boxSizing: 'border-box'
      }}>
        <a href="/" style={{ fontWeight: 'bold', fontSize: '20px', color: 'white', textDecoration: 'none' }}>
          Muebles is Better
        </a>
        <span style={{ color: '#a3c47d', fontSize: '16px', fontWeight: 'bold' }}>Diseñador 3D de Cajones</span>
        <a href="/cotizador" style={{ color: '#a3c47d', fontSize: '13px', textDecoration: 'none', border: '1px solid #a3c47d', padding: '7px 14px', borderRadius: '8px' }}>
          ← Volver al Cotizador
        </a>
      </nav>

      <div style={{ padding: '90px 24px 40px 24px', maxWidth: '1400px', margin: '0 auto' }}>

        <div className="diseno-layout" style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: '20px', alignItems: 'start' }}>

          {/* ===== PANEL DE CONTROLES ===== */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

            {/* Dimensiones */}
            <div style={{ backgroundColor: 'white', borderRadius: '14px', padding: '20px', boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>
              <h2 style={{ margin: '0 0 14px 0', fontSize: '16px' }}>📐 Dimensiones del mueble</h2>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                <div>
                  <label style={labelStyle}>Ancho (cm)</label>
                  <input type="number" style={inputStyle} value={anchoCm} min={20} max={300}
                    onChange={e => setAnchoCm(Math.max(20, Number(e.target.value) || 0))} />
                </div>
                <div>
                  <label style={labelStyle}>Alto (cm)</label>
                  <input type="number" style={inputStyle} value={altoCm} min={20} max={300}
                    onChange={e => setAltoCm(Math.max(20, Number(e.target.value) || 0))} />
                </div>
                <div>
                  <label style={labelStyle}>Fondo (cm)</label>
                  <input type="number" style={inputStyle} value={profundoCm} min={20} max={100}
                    onChange={e => setProfundoCm(Math.max(20, Number(e.target.value) || 0))} />
                </div>
              </div>
              <label style={labelStyle}>Color / melamina</label>
              <select style={inputStyle} value={colorId} onChange={e => setColorId(e.target.value)}>
                {COLORES.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>

            {/* Espesores de tablero */}
            <div style={{ backgroundColor: 'white', borderRadius: '14px', padding: '20px', boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>
              <h2 style={{ margin: '0 0 14px 0', fontSize: '16px' }}>🪵 Espesores de tablero</h2>

              {/* Cuerpo, cajones y puertas: 15 / 18 mm */}
              <label style={labelStyle}>Cuerpo, cajones y puertas (mm)</label>
              <div style={{ display: 'grid', gridTemplateColumns: espesorSelCuerpo === 'custom' ? '1fr 1fr 1fr' : '1fr 1fr', gap: '8px', marginBottom: '14px' }}>
                <select style={inputStyle} value={espesorSelCuerpo} onChange={e => handleEspesorCuerpo(e.target.value as '15' | '18' | 'custom')}>
                  <option value="15">15 mm</option>
                  <option value="18">18 mm</option>
                  <option value="custom">Personalizado</option>
                </select>
                {espesorSelCuerpo === 'custom' ? (
                  <input type="number" style={inputStyle} value={espesorMM} min={5} max={40} step={0.5}
                    onChange={e => setEspesorMM(Math.max(5, Number(e.target.value) || 0))} />
                ) : (
                  <div style={{ ...inputStyle, backgroundColor: '#f9f9f9', color: '#888', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {espesorMM} mm
                  </div>
                )}
              </div>

              {/* Fondo (tablero posterior): 3 / 6 / 9 mm */}
              <label style={labelStyle}>Fondo posterior (mm)</label>
              <div style={{ display: 'grid', gridTemplateColumns: espesorSelFondo === 'custom' ? '1fr 1fr 1fr' : '1fr 1fr', gap: '8px', marginBottom: '14px' }}>
                <select style={inputStyle} value={espesorSelFondo} onChange={e => handleEspesorFondo(e.target.value as '3' | '6' | '9' | 'custom')}>
                  <option value="3">3 mm</option>
                  <option value="6">6 mm</option>
                  <option value="9">9 mm</option>
                  <option value="custom">Personalizado</option>
                </select>
                {espesorSelFondo === 'custom' ? (
                  <input type="number" style={inputStyle} value={espesorFondoMM} min={2} max={20} step={0.5}
                    onChange={e => setEspesorFondoMM(Math.max(2, Number(e.target.value) || 0))} />
                ) : (
                  <div style={{ ...inputStyle, backgroundColor: '#f9f9f9', color: '#888', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {espesorFondoMM} mm
                  </div>
                )}
              </div>

              {/* Base / piso del cajón: 3 / 6 / 9 mm */}
              <label style={labelStyle}>Base (piso) de cajón (mm)</label>
              <div style={{ display: 'grid', gridTemplateColumns: espesorSelBase === 'custom' ? '1fr 1fr 1fr' : '1fr 1fr', gap: '8px' }}>
                <select style={inputStyle} value={espesorSelBase} onChange={e => handleEspesorBase(e.target.value as '3' | '6' | '9' | 'custom')}>
                  <option value="3">3 mm</option>
                  <option value="6">6 mm</option>
                  <option value="9">9 mm</option>
                  <option value="custom">Personalizado</option>
                </select>
                {espesorSelBase === 'custom' ? (
                  <input type="number" style={inputStyle} value={espesorBaseCajonMM} min={2} max={20} step={0.5}
                    onChange={e => setEspesorBaseCajonMM(Math.max(2, Number(e.target.value) || 0))} />
                ) : (
                  <div style={{ ...inputStyle, backgroundColor: '#f9f9f9', color: '#888', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {espesorBaseCajonMM} mm
                  </div>
                )}
              </div>
            </div>

            {/* Altura disponible */}
            <div style={{
              backgroundColor: alturaRestante < 0 ? '#fff0f0' : '#f0fff0',
              border: `1px solid ${alturaRestante < 0 ? '#ff8a8a' : '#a3c47d'}`,
              borderRadius: '10px', padding: '12px 16px', fontSize: '13px',
              color: alturaRestante < 0 ? '#b53030' : '#2c6d2e',
            }}>
              Altura interior: <strong>{alturaInterior.toFixed(1)} cm</strong> — Usada: <strong>{alturaUsada.toFixed(1)} cm</strong>
              {alturaRestante < 0
                ? <div>⚠️ Te pasaste por {Math.abs(alturaRestante).toFixed(1)} cm, ajusta las secciones.</div>
                : <div>Disponible: {alturaRestante.toFixed(1)} cm</div>}
            </div>

            {/* Secciones */}
            <div style={{ backgroundColor: 'white', borderRadius: '14px', padding: '20px', boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h2 style={{ margin: 0, fontSize: '16px' }}>🗄️ Secciones (de abajo a arriba)</h2>
              </div>

              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
                <button onClick={() => agregarSeccion('cajon')} style={btnAdd}>+ Cajón</button>
                <button onClick={() => agregarSeccion('puerta')} style={btnAdd}>+ Puerta</button>
                <button onClick={() => agregarSeccion('espacio')} style={{ ...btnAdd, backgroundColor: '#888' }}>+ Espacio abierto</button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {secciones.map((sec, i) => (
                  <div key={sec.id} style={{ border: '1px solid #eee', borderRadius: '10px', padding: '12px', backgroundColor: '#fafafa' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <strong style={{ fontSize: '13px' }}>
                        {i + 1}. {sec.tipo === 'cajon' ? '🗃️ Cajón' : sec.tipo === 'puerta' ? '🚪 Puerta' : '⬜ Espacio abierto'}
                      </strong>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button onClick={() => moverSeccion(sec.id, -1)} disabled={i === 0} style={btnMini}>↑</button>
                        <button onClick={() => moverSeccion(sec.id, 1)} disabled={i === secciones.length - 1} style={btnMini}>↓</button>
                        <button onClick={() => eliminarSeccion(sec.id)} style={{ ...btnMini, color: '#ff4444' }}>🗑</button>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: sec.tipo === 'espacio' ? '1fr' : '1fr 1fr', gap: '8px' }}>
                      <div>
                        <label style={labelStyle}>Altura (cm)</label>
                        <input type="number" style={inputStyle} value={sec.alturaCm} min={5} max={100}
                          onChange={e => actualizarSeccion(sec.id, { alturaCm: Math.max(5, Number(e.target.value) || 0) })} />
                      </div>

                      {sec.tipo === 'cajon' && (
                        <div>
                          <label style={labelStyle}>Tipo de riel</label>
                          <select style={inputStyle} value={sec.riel} onChange={e => actualizarSeccion(sec.id, { riel: e.target.value as TipoRiel })}>
                            <option value="bola">Rodamiento (bola)</option>
                            <option value="ocultas">Ocultas</option>
                            <option value="telescopicas">Telescópicas</option>
                          </select>
                        </div>
                      )}

                      {sec.tipo === 'puerta' && (
                        <div>
                          <label style={labelStyle}>Puertas</label>
                          <select style={inputStyle} value={sec.cantidadPuertas}
                            onChange={e => actualizarSeccion(sec.id, { cantidadPuertas: Number(e.target.value) as 1 | 2 })}>
                            <option value={1}>1 puerta</option>
                            <option value={2}>2 puertas</option>
                          </select>
                        </div>
                      )}

                      {sec.tipo === 'puerta' && sec.cantidadPuertas === 1 && (
                        <div style={{ gridColumn: '1 / -1' }}>
                          <label style={labelStyle}>Bisagra</label>
                          <select style={inputStyle} value={sec.bisagra} onChange={e => actualizarSeccion(sec.id, { bisagra: e.target.value as Bisagra })}>
                            <option value="izquierda">Izquierda</option>
                            <option value="derecha">Derecha</option>
                          </select>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {secciones.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '20px', color: '#bbb', border: '2px dashed #eee', borderRadius: '10px', fontSize: '13px' }}>
                    Agrega cajones, puertas o espacios para armar el mueble
                  </div>
                )}
              </div>
            </div>

            {/* Resumen simple */}
            <div style={{ backgroundColor: '#1a1a2e', borderRadius: '14px', padding: '18px 20px', color: 'white', fontSize: '13px' }}>
              <p style={{ margin: '0 0 6px 0', color: '#a3c47d', fontWeight: 'bold' }}>Resumen del diseño</p>
              <p style={{ margin: '2px 0' }}>Cajones: <strong>{totalCajones}</strong></p>
              <p style={{ margin: '2px 0' }}>Puertas: <strong>{totalPuertas}</strong></p>
              <p style={{ margin: '2px 0' }}>Dimensiones: <strong>{anchoCm} × {altoCm} × {profundoCm} cm</strong> (an. × alt. × fondo)</p>
              <p style={{ margin: '8px 0 0 0', color: '#888', fontSize: '11px' }}>
                Este diseño no se guarda ni se envía al cotizador — es solo para visualizar el mueble en 3D.
              </p>
            </div>

            {/* Medidas internas */}
            <div style={{ backgroundColor: 'white', borderRadius: '14px', padding: '20px', boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>
              <h2 style={{ margin: '0 0 4px 0', fontSize: '16px' }}>📏 Medidas internas</h2>
              <p style={{ color: '#888', fontSize: '12px', margin: '0 0 14px 0' }}>
                Calculadas a partir de las medidas externas menos el espesor de melamina ({espesorCm} cm por tablero).
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                <div style={{ backgroundColor: '#f9f9f9', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
                  <p style={{ margin: 0, color: '#888', fontSize: '11px' }}>Ancho int.</p>
                  <p style={{ margin: '4px 0 0 0', fontWeight: 'bold', fontSize: '15px' }}>{anchoInterior.toFixed(1)} cm</p>
                </div>
                <div style={{ backgroundColor: '#f9f9f9', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
                  <p style={{ margin: 0, color: '#888', fontSize: '11px' }}>Alto int.</p>
                  <p style={{ margin: '4px 0 0 0', fontWeight: 'bold', fontSize: '15px' }}>{alturaInterior.toFixed(1)} cm</p>
                </div>
                <div style={{ backgroundColor: '#f9f9f9', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
                  <p style={{ margin: 0, color: '#888', fontSize: '11px' }}>Fondo int.</p>
                  <p style={{ margin: '4px 0 0 0', fontWeight: 'bold', fontSize: '15px' }}>{profundoInterior.toFixed(1)} cm</p>
                </div>
              </div>
            </div>

            {/* Lista de piezas para corte */}
            <div style={{ backgroundColor: 'white', borderRadius: '14px', padding: '20px', boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <h2 style={{ margin: 0, fontSize: '16px' }}>✂️ Lista de piezas para corte</h2>
                <button onClick={copiarListaPiezas} style={{ ...btnMini, padding: '6px 12px' }}>📋 Copiar</button>
              </div>
              <p style={{ color: '#888', fontSize: '11px', margin: '0 0 14px 0' }}>
                Holguras estándar aplicadas: {holguraFrenteCajon} cm en frentes, {holguraPuerta} cm en puertas, {holguraRielAlto} cm de despeje de riel. Ajusta según tus rieles/bisagras reales.
              </p>

              {listaPiezasAgrupada.length > 0 ? (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#f9f9f9' }}>
                        <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '2px solid #eee' }}>Pieza</th>
                        <th style={{ padding: '8px 10px', textAlign: 'center', borderBottom: '2px solid #eee' }}>Cant.</th>
                        <th style={{ padding: '8px 10px', textAlign: 'center', borderBottom: '2px solid #eee' }}>Largo</th>
                        <th style={{ padding: '8px 10px', textAlign: 'center', borderBottom: '2px solid #eee' }}>Ancho</th>
                        <th style={{ padding: '8px 10px', textAlign: 'center', borderBottom: '2px solid #eee' }}>Esp.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {listaPiezasAgrupada.map((p, i) => (
                        <tr key={i} style={{ backgroundColor: i % 2 === 0 ? 'white' : '#fafafa' }}>
                          <td style={{ padding: '7px 10px', borderBottom: '1px solid #f0f0f0' }}>{p.pieza}</td>
                          <td style={{ padding: '7px 10px', borderBottom: '1px solid #f0f0f0', textAlign: 'center' }}>{p.cantidad}</td>
                          <td style={{ padding: '7px 10px', borderBottom: '1px solid #f0f0f0', textAlign: 'center' }}>{p.largo.toFixed(1)} cm</td>
                          <td style={{ padding: '7px 10px', borderBottom: '1px solid #f0f0f0', textAlign: 'center' }}>{p.ancho.toFixed(1)} cm</td>
                          <td style={{ padding: '7px 10px', borderBottom: '1px solid #f0f0f0', textAlign: 'center' }}>{p.espesor} cm</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '20px', color: '#bbb', border: '2px dashed #eee', borderRadius: '10px', fontSize: '13px' }}>
                  Agrega secciones para generar la lista de piezas
                </div>
              )}

              <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid #eee', fontSize: '12px', color: '#555', display: 'flex', justifyContent: 'space-between' }}>
                <span>Piezas totales: <strong>{listaPiezasAgrupada.reduce((a, p) => a + p.cantidad, 0)}</strong></span>
                <span>Área aprox.: <strong>{areaTotalM2.toFixed(2)} m²</strong></span>
              </div>
            </div>
          </div>

          {/* ===== VISTA 3D ===== */}
          <div className="diseno-canvas" style={{
            height: 'calc(100vh - 130px)', minHeight: '500px', borderRadius: '14px', overflow: 'hidden',
            boxShadow: '0 2px 12px rgba(0,0,0,0.08)', position: 'sticky', top: '90px',
          }}>
            <div ref={mountRef} style={{ width: '100%', height: '100%' }} />
          </div>

        </div>
      </div>
    </div>
  )
}

const btnAdd: React.CSSProperties = {
  padding: '8px 14px', backgroundColor: '#087e0b', color: 'white', border: 'none',
  borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold',
}

const btnMini: React.CSSProperties = {
  padding: '4px 8px', backgroundColor: 'white', border: '1px solid #ddd',
  borderRadius: '6px', cursor: 'pointer', fontSize: '12px',
}
