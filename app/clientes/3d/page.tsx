'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'

// ============================================================
// TIPOS
// ============================================================
type TipoSeccion = 'cajon' | 'puerta' | 'espacio' | 'repisa'
type TipoRiel = 'bola' | 'ocultas' | 'telescopicas'
type Bisagra = 'izquierda' | 'derecha' | 'ambas'

interface Seccion {
  id: number
  tipo: TipoSeccion
  alturaCm: number
  riel: TipoRiel
  cantidadPuertas: 1 | 2
  bisagra: Bisagra
  alturaCajaCm?: number
  profundidadCajaCm?: number
}

interface Columna {
  id: number
  anchoCm: number
  secciones: Seccion[]
}

const COLORES = [
  { id: 'blanco', nombre: 'Blanco Minimal', hex: 0xf3f1ea },
  { id: 'wengue', nombre: 'Wengue Oscuro', hex: 0x352721 },
  { id: 'gris', nombre: 'Gris Grafito', hex: 0x6b6d70 },
  { id: 'nogal', nombre: 'Nogal Clásico', hex: 0x7a5233 },
  { id: 'natural', nombre: 'Haya Natural', hex: 0xd9bd8f },
]

interface PiezaCorte {
  pieza: string
  cantidad: number
  largo: number
  ancho: number
  espesor: number
  seccion: string
  canteado: string
}

export default function DisenoCajones() {
  const [checking, setChecking] = useState(true)

  // Dimensiones principales del mueble
  const [anchoCm, setAnchoCm] = useState(80)
  const [altoCm, setAltoCm] = useState(120)
  const [profundoCm, setProfundoCm] = useState(55)
  const [colorId, setColorId] = useState('blanco')

  // Datos del cliente para cotización
  const [nombreCliente, setNombreCliente] = useState('')
  const [telefonoCliente, setTelefonoCliente] = useState('')
  const [observacionesCliente, setObservacionesCliente] = useState('')
  const [cotizacionEnviada, setCotizacionEnviada] = useState(false)

  // Estado para el menú hamburguesa responsive en la cabecera
  const [menuMovilAbierto, setMenuMovilAbierto] = useState(false)

  // Pestañas y estado del HUD flotante
  const [activeTab, setActiveTab] = useState<'diseno' | 'tecnico'>('diseno')
  const [panelMinimizado, setPanelMinimizado] = useState(false)

  // Selección y Menú Contextual 3D flotante al lado del cursor
  const [piezaSeleccionada, setPiezaSeleccionada] = useState<{ pieza: string; seccion: string } | null>(null)
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    colIndex: number
    secIndex: number
    pieza: string
    seccion: string
  } | null>(null)

  // ---- Espesores de tablero (mm) ----
  const [espesorMM] = useState(18)
  const [espesorFondoMM] = useState(6)
  const [espesorBaseCajonMM] = useState(6)

  const espesorCm = espesorMM / 10
  const espesorFondoCm = espesorFondoMM / 10
  const espesorBaseCajonCm = espesorBaseCajonMM / 10

  // ---- Holguras (cm) ----
  const [holguraPuerta] = useState(0.15)
  const [holguraFrenteCajon] = useState(0.15)
  const [holguraRielAlto] = useState(2.5)
  const [holguraRielFondo] = useState(2)
  const [holguraRielLateral] = useState(2.6)

  // ---- Columnas iniciales ----
  const [columnas, setColumnas] = useState<Columna[]>([
    {
      id: 1,
      anchoCm: 76.4,
      secciones: [
        { id: 1, tipo: 'cajon', alturaCm: 22, riel: 'bola', cantidadPuertas: 1, bisagra: 'izquierda', alturaCajaCm: 16, profundidadCajaCm: 45 },
        { id: 2, tipo: 'cajon', alturaCm: 22, riel: 'bola', cantidadPuertas: 1, bisagra: 'izquierda', alturaCajaCm: 16, profundidadCajaCm: 45 },
        { id: 3, tipo: 'repisa', alturaCm: 30, riel: 'bola', cantidadPuertas: 1, bisagra: 'izquierda' },
        { id: 4, tipo: 'puerta', alturaCm: 46, riel: 'bola', cantidadPuertas: 2, bisagra: 'ambas' },
      ],
    },
  ])
  const [nextColId, setNextColId] = useState(2)
  const [nextSecId, setNextSecId] = useState(5)

  // Refs de Three.js
  const mountRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const muebleGroupRef = useRef<THREE.Group | null>(null)

  useEffect(() => {
    setChecking(false)
  }, [])

  // ---------- Inicializar Escena y Raycaster ----------
  useEffect(() => {
    if (checking || !mountRef.current) return

    const width = mountRef.current.clientWidth || window.innerWidth
    const height = mountRef.current.clientHeight || window.innerHeight

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0b132b)
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

    const hemi = new THREE.HemisphereLight(0xffffff, 0x1c2541, 1.4)
    scene.add(hemi)
    const dir = new THREE.DirectionalLight(0xffffff, 0.9)
    dir.position.set(5, 12, 8)
    dir.castShadow = true
    scene.add(dir)

    const piso = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 30),
      new THREE.MeshStandardMaterial({ color: 0x1c2541, roughness: 0.9 })
    )
    piso.rotation.x = -Math.PI / 2
    piso.receiveShadow = true
    scene.add(piso)

    const grupo = new THREE.Group()
    scene.add(grupo)
    muebleGroupRef.current = grupo

    const raycaster = new THREE.Raycaster()
    const mouse = new THREE.Vector2()
    let isDragging = false

    const onPointerDown = () => { isDragging = false }
    const onPointerMove = () => { isDragging = true }

    const onPointerUp = (event: MouseEvent) => {
      if (isDragging) return
      if (!mountRef.current || !cameraRef.current || !muebleGroupRef.current) return

      const rect = mountRef.current.getBoundingClientRect()
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

      raycaster.setFromCamera(mouse, cameraRef.current)
      const intersects = raycaster.intersectObjects(muebleGroupRef.current.children, true)

      if (intersects.length > 0) {
        let hitObject: THREE.Object3D | null = intersects[0].object
        while (hitObject && (!hitObject.userData || !hitObject.userData.pieza)) {
          hitObject = hitObject.parent
        }

        if (hitObject && hitObject.userData && hitObject.userData.pieza) {
          setPiezaSeleccionada({
            pieza: hitObject.userData.pieza,
            seccion: hitObject.userData.seccion
          })

          if (hitObject.userData.colIndex !== undefined && hitObject.userData.secIndex !== undefined) {
            setContextMenu({
              x: event.clientX,
              y: event.clientY,
              colIndex: hitObject.userData.colIndex,
              secIndex: hitObject.userData.secIndex,
              pieza: hitObject.userData.pieza,
              seccion: hitObject.userData.seccion
            })
          } else {
            setContextMenu(null)
          }
        }
      } else {
        setContextMenu(null)
        setPiezaSeleccionada(null)
      }
    }

    const domElem = renderer.domElement
    domElem.addEventListener('pointerdown', onPointerDown)
    domElem.addEventListener('pointermove', onPointerMove)
    domElem.addEventListener('pointerup', onPointerUp)

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

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) resize(entry.contentRect.width, entry.contentRect.height)
    })
    ro.observe(mountRef.current)

    return () => {
      cancelAnimationFrame(frameId)
      ro.disconnect()
      domElem.removeEventListener('pointerdown', onPointerDown)
      domElem.removeEventListener('pointermove', onPointerMove)
      domElem.removeEventListener('pointerup', onPointerUp)
      controls.dispose()
      renderer.dispose()
      if (mountRef.current && renderer.domElement.parentNode === mountRef.current) {
        mountRef.current.removeChild(renderer.domElement)
      }
    }
  }, [checking])

  // ---------- Reconstruir mueble en 3D ----------
  useEffect(() => {
    const grupo = muebleGroupRef.current
    if (!grupo) return

    while (grupo.children.length) {
      const obj = grupo.children.pop() as THREE.Mesh
      obj.geometry?.dispose()
      if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose())
      else (obj.material as THREE.Material)?.dispose?.()
      
      obj.children.forEach(child => {
        if (child instanceof THREE.LineSegments) {
          child.geometry.dispose();
          (child.material as THREE.Material).dispose();
        }
      })
    }

    const SC = 1 / 30
    const ancho = anchoCm * SC
    const alto = altoCm * SC
    const profundo = profundoCm * SC
    const esp = espesorCm * SC
    const espFondo = espesorFondoCm * SC

    const colorHex = COLORES.find(c => c.id === colorId)?.hex ?? 0xf3f1ea
    
    const matCarcasaNorm = new THREE.MeshStandardMaterial({ 
      color: colorHex, roughness: 0.6, transparent: true, opacity: 0.35, depthWrite: false 
    })
    const matFrenteNorm = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.4 })
    const matCajaNorm = new THREE.MeshStandardMaterial({ color: 0xebdcd0, roughness: 0.5 }) 
    const matMetal = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.8, roughness: 0.2 }) 

    const matHighlight = new THREE.MeshStandardMaterial({
      color: 0xd4af37, roughness: 0.2, emissive: 0x3d3100,
    })

    const addBox = (w: number, h: number, d: number, x: number, y: number, z: number, baseMat: THREE.Material, meta?: { pieza: string; seccion: string; colIndex?: number; secIndex?: number }) => {
      let matFinal = baseMat
      if (piezaSeleccionada && meta) {
        const matchPieza = meta.pieza.toLowerCase()
        const targetPieza = piezaSeleccionada.pieza.toLowerCase()
        if (meta.seccion === piezaSeleccionada.seccion && (targetPieza.includes(matchPieza) || matchPieza.includes(targetPieza))) {
          matFinal = matHighlight
        }
      }

      const geometry = new THREE.BoxGeometry(w, h, d)
      const mesh = new THREE.Mesh(geometry, matFinal)
      if (meta) mesh.userData = meta
      
      const edgesGeometry = new THREE.EdgesGeometry(geometry)
      const edgesMaterial = new THREE.LineBasicMaterial({ color: matFinal === matHighlight ? 0xffffff : 0x111827, linewidth: 1 })
      const edges = new THREE.LineSegments(edgesGeometry, edgesMaterial)
      mesh.add(edges)

      mesh.position.set(x, y, z)
      mesh.castShadow = true
      mesh.receiveShadow = true
      grupo.add(mesh)
      return mesh
    }

    // Carcasa exterior
    addBox(esp, alto, profundo, -ancho / 2 + esp / 2, alto / 2, 0, matCarcasaNorm, { pieza: 'Lateral', seccion: 'Cuerpo' })
    addBox(esp, alto, profundo, ancho / 2 - esp / 2, alto / 2, 0, matCarcasaNorm, { pieza: 'Lateral', seccion: 'Cuerpo' })
    addBox(ancho, esp, profundo, 0, esp / 2, 0, matCarcasaNorm, { pieza: 'Piso / Techo', seccion: 'Cuerpo' })
    addBox(ancho, esp, profundo, 0, alto - esp / 2, 0, matCarcasaNorm, { pieza: 'Piso / Techo', seccion: 'Cuerpo' })
    addBox(ancho, alto, espFondo, 0, alto / 2, -profundo / 2 + espFondo / 2, matCarcasaNorm, { pieza: 'Panel posterior', seccion: 'Cuerpo' })

    const alturaInteriorSC = alto - esp * 2
    let cursorX = -ancho / 2 + esp

    columnas.forEach((col, ci) => {
      const colWidthSC = col.anchoCm * SC
      const colCenterX = cursorX + colWidthSC / 2
      let cursorY = esp

      col.secciones.forEach((sec, sIdx) => {
        const nombreSeccion = `Col.${ci + 1} — ${sec.tipo.toUpperCase()} ${sIdx + 1}`

        if (sec.tipo === 'puerta' && sIdx > 0 && col.secciones[sIdx - 1].tipo !== 'repisa') {
          const repisaProf = profundo - espFondo - 0.03
          addBox(colWidthSC, esp, repisaProf, colCenterX, cursorY + esp / 2, espFondo / 2, matCarcasaNorm, { pieza: 'Estante intermedio', seccion: nombreSeccion })
          cursorY += esp
        }

        const h = sec.alturaCm * SC
        const centroY = cursorY + h / 2

        if (sec.tipo === 'cajon') {
          const frenteZ = profundo / 2 + esp / 2 + 0.02
          addBox(colWidthSC - 0.01, h - 0.015, esp, colCenterX, centroY, frenteZ, matFrenteNorm, { pieza: 'Frente de cajón', seccion: nombreSeccion, colIndex: ci, secIndex: sIdx })
          addBox(colWidthSC * 0.35, 0.02, 0.02, colCenterX, centroY, frenteZ + esp / 2 + 0.02, matMetal)
          
          const rielLargo = profundo - esp * 1.5
          const rielY = cursorY + 0.02
          addBox(0.02, 0.02, rielLargo, colCenterX - colWidthSC / 2 + 0.03, rielY, 0, matMetal)
          addBox(0.02, 0.02, rielLargo, colCenterX + colWidthSC / 2 - 0.03, rielY, 0, matMetal)

          const defAltoCaja = sec.alturaCajaCm !== undefined ? sec.alturaCajaCm : Math.max(5, sec.alturaCm - holguraRielAlto)
          const defProfCaja = sec.profundidadCajaCm !== undefined ? sec.profundidadCajaCm : Math.max(10, profundoCm - holguraRielFondo)

          const anchoCajaExternaSC = (col.anchoCm - holguraRielLateral) * SC
          const altoCajaSC = defAltoCaja * SC
          const largoCostadoSC = defProfCaja * SC
          const espCaja = espesorCm * SC
          const espBaseCaja = espesorBaseCajonCm * SC
          const largoRespaldoSC = anchoCajaExternaSC - (2 * espCaja)
          
          const cajaY = cursorY + 0.02 + altoCajaSC / 2
          const cajaZCenter = (frenteZ - esp / 2) - (largoCostadoSC / 2)

          addBox(espCaja, altoCajaSC, largoCostadoSC, colCenterX - anchoCajaExternaSC / 2 + espCaja / 2, cajaY, cajaZCenter, matCajaNorm, { pieza: 'Costado de caja', seccion: nombreSeccion, colIndex: ci, secIndex: sIdx })
          addBox(espCaja, altoCajaSC, largoCostadoSC, colCenterX + anchoCajaExternaSC / 2 - espCaja / 2, cajaY, cajaZCenter, matCajaNorm, { pieza: 'Costado de caja', seccion: nombreSeccion, colIndex: ci, secIndex: sIdx })
          addBox(largoRespaldoSC, altoCajaSC, espCaja, colCenterX, cajaY, cajaZCenter - largoCostadoSC / 2 + espCaja / 2, matCajaNorm, { pieza: 'Contrafrente/Posterior cajón', seccion: nombreSeccion, colIndex: ci, secIndex: sIdx })
          addBox(largoRespaldoSC, altoCajaSC, espCaja, colCenterX, cajaY, cajaZCenter + largoCostadoSC / 2 - espCaja / 2, matCajaNorm, { pieza: 'Contrafrente/Posterior cajón', seccion: nombreSeccion, colIndex: ci, secIndex: sIdx })
          addBox(anchoCajaExternaSC, espBaseCaja, largoCostadoSC, colCenterX, cursorY + 0.02 + espBaseCaja / 2, cajaZCenter, matCajaNorm, { pieza: 'Fondo de cajón', seccion: nombreSeccion, colIndex: ci, secIndex: sIdx })

        } else if (sec.tipo === 'puerta') {
          const frenteZ = profundo / 2 + esp / 2 + 0.02
          if (sec.cantidadPuertas === 2) {
            const wPuerta = colWidthSC / 2 - 0.01
            addBox(wPuerta, h - 0.015, esp, colCenterX - wPuerta / 2 - 0.005, centroY, frenteZ, matFrenteNorm, { pieza: 'Puerta', seccion: nombreSeccion, colIndex: ci, secIndex: sIdx })
            addBox(wPuerta, h - 0.015, esp, colCenterX + wPuerta / 2 + 0.005, centroY, frenteZ, matFrenteNorm, { pieza: 'Puerta', seccion: nombreSeccion, colIndex: ci, secIndex: sIdx })
            addBox(0.02, 0.15, 0.02, colCenterX - 0.05, centroY, frenteZ + esp / 2 + 0.02, matMetal)
            addBox(0.02, 0.15, 0.02, colCenterX + 0.05, centroY, frenteZ + esp / 2 + 0.02, matMetal)
          } else {
            addBox(colWidthSC - 0.01, h - 0.015, esp, colCenterX, centroY, frenteZ, matFrenteNorm, { pieza: 'Puerta', seccion: nombreSeccion, colIndex: ci, secIndex: sIdx })
            const lado = sec.bisagra === 'derecha' ? -1 : 1
            addBox(0.02, 0.15, 0.02, colCenterX + lado * (colWidthSC / 2 - 0.08), centroY, frenteZ + esp / 2 + 0.02, matMetal)
          }
        } else if (sec.tipo === 'repisa') {
           const repisaProf = profundo - espFondo - 0.03
           addBox(colWidthSC, esp, repisaProf, colCenterX, cursorY + h - esp / 2, espFondo / 2, matCarcasaNorm, { pieza: 'Repisa', seccion: nombreSeccion, colIndex: ci, secIndex: sIdx })
        }

        cursorY += h
      })

      cursorX += colWidthSC
      if (ci < columnas.length - 1) {
        addBox(esp, alturaInteriorSC, profundo, cursorX + esp / 2, alto / 2, 0, matCarcasaNorm, { pieza: 'Divisor vertical', seccion: 'Cuerpo' })
        cursorX += esp
      }
    })
  }, [anchoCm, altoCm, profundoCm, colorId, columnas, checking, espesorCm, espesorFondoCm, espesorBaseCajonCm, holguraRielAlto, holguraRielFondo, holguraRielLateral, piezaSeleccionada])

  // ---------- Exportar modelo GLB ----------
  const exportarModeloGLB = () => {
    if (!muebleGroupRef.current) return
    const exporter = new GLTFExporter()
    exporter.parse(
      muebleGroupRef.current,
      (gltfBinary) => {
        const blob = new Blob([gltfBinary as ArrayBuffer], { type: 'model/gltf-binary' })
        const reader = new FileReader()
        reader.onload = () => {
          localStorage.setItem('mueble_glb_base64', reader.result as string)
          window.open('/visor-ia', '_blank')
        }
        reader.readAsDataURL(blob)
      },
      (error) => console.error('Error al exportar GLB:', error),
      { binary: true }
    )
  }

  // ---------- Cálculos de Piezas para el Cotizador ----------
  const alturaInterior = altoCm - espesorCm * 2
  const anchoInterior = anchoCm - espesorCm * 2
  const anchoColumnasUsado = columnas.reduce((acc, c) => acc + c.anchoCm, 0)
  const anchoDivisores = Math.max(0, columnas.length - 1) * espesorCm
  const anchoRestante = anchoInterior - (anchoColumnasUsado + anchoDivisores)

  const calcularListaPiezas = (): PiezaCorte[] => {
    const piezas: PiezaCorte[] = []
    piezas.push({ pieza: 'Lateral', cantidad: 2, largo: alturaInterior > 0 ? alturaInterior : altoCm, ancho: profundoCm, espesor: espesorCm, seccion: 'Cuerpo', canteado: '1 Canto largo' })
    piezas.push({ pieza: 'Piso / Techo', cantidad: 2, largo: anchoCm, ancho: profundoCm, espesor: espesorCm, seccion: 'Cuerpo', canteado: '1 Canto corto' })
    piezas.push({ pieza: 'Panel posterior', cantidad: 1, largo: anchoInterior, ancho: alturaInterior > 0 ? alturaInterior : altoCm, espesor: espesorFondoCm, seccion: 'Cuerpo', canteado: 'Sin canteado' })

    if (columnas.length > 1) {
      piezas.push({ pieza: 'Divisor vertical', cantidad: columnas.length - 1, largo: alturaInterior > 0 ? alturaInterior : altoCm, ancho: profundoCm, espesor: espesorCm, seccion: 'Cuerpo', canteado: '1 Canto largo' })
    }

    columnas.forEach((col, ci) => {
      col.secciones.forEach((sec, i) => {
        const nombreSeccion = `Col.${ci + 1} — ${sec.tipo.toUpperCase()} ${i + 1}`

        if (sec.tipo === 'cajon') {
          piezas.push({ pieza: 'Frente de cajón', cantidad: 1, largo: col.anchoCm - holguraFrenteCajon, ancho: sec.alturaCm - holguraFrenteCajon, espesor: espesorCm, seccion: nombreSeccion, canteado: '4 Lados' })
          const defAltoCaja = sec.alturaCajaCm !== undefined ? sec.alturaCajaCm : Math.max(5, sec.alturaCm - holguraRielAlto)
          const defProfCaja = sec.profundidadCajaCm !== undefined ? sec.profundidadCajaCm : Math.max(10, profundoCm - holguraRielFondo)
          const anchoCajaExterna = col.anchoCm - holguraRielLateral

          piezas.push({ pieza: 'Costado de caja', cantidad: 2, largo: defProfCaja, ancho: defAltoCaja, espesor: espesorCm, seccion: nombreSeccion, canteado: 'Superior' })
          piezas.push({ pieza: 'Contrafrente/Posterior cajón', cantidad: 2, largo: anchoCajaExterna - (2 * espesorCm), ancho: defAltoCaja, espesor: espesorCm, seccion: nombreSeccion, canteado: 'Superior' })
          piezas.push({ pieza: 'Fondo de cajón', cantidad: 1, largo: anchoCajaExterna, ancho: defProfCaja, espesor: espesorBaseCajonCm, seccion: nombreSeccion, canteado: 'Sin canteado' })
        } else if (sec.tipo === 'puerta') {
          piezas.push({ pieza: 'Puerta', cantidad: sec.cantidadPuertas, largo: (col.anchoCm / sec.cantidadPuertas) - holguraPuerta, ancho: sec.alturaCm - holguraPuerta, espesor: espesorCm, seccion: nombreSeccion, canteado: '4 Lados' })
        } else if (sec.tipo === 'repisa') {
          piezas.push({ pieza: 'Repisa', cantidad: 1, largo: col.anchoCm, ancho: profundoCm - espesorFondoCm - 1, espesor: espesorCm, seccion: nombreSeccion, canteado: 'Frente' })
        }
      })
    })
    return piezas.filter(p => p.largo > 0 && p.ancho > 0)
  }

  const agruparPiezas = (piezas: PiezaCorte[]) => {
    const mapa = new Map<string, PiezaCorte>()
    piezas.forEach(p => {
      const key = `${p.pieza}|${p.seccion}|${p.largo.toFixed(1)}|${p.ancho.toFixed(1)}|${p.espesor}|${p.canteado}`
      const ex = mapa.get(key)
      if (ex) ex.cantidad += p.cantidad
      else mapa.set(key, { ...p })
    })
    return Array.from(mapa.values())
  }

  const prepararDatosCotizador = () => {
    const listaDetallada = calcularListaPiezas()
    const listaAgrupada = agruparPiezas(listaDetallada)

    return {
      cliente: {
        nombre: nombreCliente || 'Cliente General',
        telefono: telefonoCliente || 'Sin teléfono',
        observaciones: observacionesCliente || ''
      },
      mueble: {
        anchoCm,
        altoCm,
        profundoCm,
        colorMelamina: COLORES.find(c => c.id === colorId)?.nombre ?? colorId,
        espesorTableroMM: espesorMM,
      },
      columnas,
      despieceAgrupado: listaAgrupada,
      fecha: new Date().toISOString()
    }
  }

  const agregarColumna = () => {
    const anchoDefault = anchoRestante > 20 ? Math.max(20, anchoRestante - espesorCm) : 30
    setColumnas([...columnas, { id: nextColId, anchoCm: Math.round(anchoDefault * 10) / 10, secciones: [] }])
    setNextColId(nextColId + 1)
  }

  const agregarSeccion = (columnaId: number, tipo: TipoSeccion) => {
    setColumnas(columnas.map(c => c.id !== columnaId ? c : {
      ...c,
      secciones: [...c.secciones, { 
        id: nextSecId, tipo, alturaCm: 25, riel: 'bola', cantidadPuertas: 1, bisagra: 'izquierda',
        alturaCajaCm: tipo === 'cajon' ? 16 : undefined,
        profundidadCajaCm: tipo === 'cajon' ? Math.min(45, profundoCm - 5) : undefined
      }],
    }))
    setNextSecId(nextSecId + 1)
  }

  if (checking) return null

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', width: '100vw', height: '100vh', overflow: 'hidden', backgroundColor: '#0b132b', position: 'relative' }}>
      
      {/* 1. VISOR 3D DE FONDO */}
      <div ref={mountRef} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 1 }} />

      {/* 2. NAVBAR SUPERIOR FLOTANTE CON HAMBURGUESA RESPONSIVE */}
      <nav style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '10px 20px', backgroundColor: 'rgba(11, 19, 43, 0.95)', backdropFilter: 'blur(8px)',
        color: 'white', position: 'fixed', top: 0, left: 0, width: '100%', zIndex: 1000, boxSizing: 'border-box',
        borderBottom: '1px solid rgba(212, 175, 55, 0.3)', boxShadow: '0 4px 20px rgba(0,0,0,0.4)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontWeight: 800, fontSize: '16px', letterSpacing: '0.5px', color: '#fff' }}>
            MuebLess <span style={{ color: '#d4af37' }}>is Better</span>
          </span>
          <span style={{ fontSize: '11px', background: 'rgba(212, 175, 55, 0.15)', color: '#d4af37', padding: '2px 8px', borderRadius: '6px', border: '1px solid rgba(212, 175, 55, 0.3)' }}>CAD Comercial 3D</span>
        </div>

        {/* Botones para Escritorio */}
        <div className="hidden md:flex" style={{ gap: '8px', alignItems: 'center' }}>
          <button onClick={() => setPanelMinimizado(!panelMinimizado)} style={{ background: 'rgba(255,255,255,0.1)', color: 'white', border: '1px solid rgba(255,255,255,0.2)', fontSize: '11px', fontWeight: 'bold', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer' }}>
            {panelMinimizado ? '📂 Mostrar Panel' : '📦 Ocultar Panel'}
          </button>
          <button onClick={exportarModeloGLB} style={{ background: '#7c3aed', color: 'white', border: 'none', fontSize: '11px', fontWeight: 'bold', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer' }}>
            🤖 Ver en IA 3D
          </button>
          <Link href="/registro" style={{ background: '#d4af37', color: '#0b132b', textDecoration: 'none', fontSize: '11px', fontWeight: 'bold', padding: '6px 12px', borderRadius: '6px', display: 'inline-block', textAlign: 'center' }}>
            Mi Registro
          </Link>
        </div>

        {/* Botón Hamburguesa para Móvil */}
        <div className="flex md:hidden" style={{ alignItems: 'center' }}>
          <button 
            onClick={() => setMenuMovilAbierto(!menuMovilAbierto)} 
            style={{ background: 'none', border: '1px solid rgba(255,255,255,0.2)', color: 'white', padding: '6px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '16px' }}
            aria-label="Menú"
          >
            {menuMovilAbierto ? '✕' : '☰'}
          </button>
        </div>
      </nav>

      {/* MENÚ DESPLEGABLE MÓVIL */}
      {menuMovilAbierto && (
        <div style={{
          position: 'fixed', top: '55px', left: 0, width: '100%',
          backgroundColor: 'rgba(15, 23, 42, 0.98)', backdropFilter: 'blur(12px)',
          borderBottom: '1px solid rgba(212, 175, 55, 0.3)', padding: '16px',
          zIndex: 999, display: 'flex', flexDirection: 'column', gap: '10px', boxSizing: 'border-box'
        }}>
          <button onClick={() => { setPanelMinimizado(!panelMinimizado); setMenuMovilAbierto(false); }} style={{ background: 'rgba(255,255,255,0.1)', color: 'white', border: '1px solid rgba(255,255,255,0.2)', fontSize: '12px', fontWeight: 'bold', padding: '10px', borderRadius: '8px', cursor: 'pointer', textAlign: 'left' }}>
            {panelMinimizado ? '📂 Mostrar Panel' : '📦 Ocultar Panel'}
          </button>
          <button onClick={() => { exportarModeloGLB(); setMenuMovilAbierto(false); }} style={{ background: '#7c3aed', color: 'white', border: 'none', fontSize: '12px', fontWeight: 'bold', padding: '10px', borderRadius: '8px', cursor: 'pointer', textAlign: 'left' }}>
            🤖 Ver en IA 3D
          </button>
          <Link href="/registro" onClick={() => setMenuMovilAbierto(false)} style={{ background: '#d4af37', color: '#0b132b', textDecoration: 'none', fontSize: '12px', fontWeight: 'bold', padding: '10px', borderRadius: '8px', display: 'block', textAlign: 'center' }}>
            Mi Registro
          </Link>
        </div>
      )}

      {/* MENÚ CONTEXTUAL FLOTANTE AL HACER CLIC EN EL 3D */}
      {contextMenu && (
        <div style={{
          position: 'fixed',
          top: `${Math.min(contextMenu.y, window.innerHeight - 320)}px`,
          left: `${Math.min(contextMenu.x, window.innerWidth - 280)}px`,
          width: '260px',
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          backdropFilter: 'blur(12px)',
          border: '1px solid #d4af37',
          borderRadius: '12px',
          padding: '12px',
          zIndex: 1100,
          boxShadow: '0 15px 35px rgba(0,0,0,0.7)',
          color: '#fff',
          fontSize: '11px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '6px' }}>
            <div>
              <b style={{ color: '#d4af37', fontSize: '12px' }}>{contextMenu.pieza}</b>
              <div style={{ fontSize: '9px', color: '#94a3b8' }}>{contextMenu.seccion}</div>
            </div>
            <button onClick={() => setContextMenu(null)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}>✕</button>
          </div>

          {(() => {
            const col = columnas[contextMenu.colIndex]
            const sec = col?.secciones[contextMenu.secIndex]
            if (!sec) return <div style={{ color: '#94a3b8' }}>Sección no disponible</div>
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8', marginBottom: '2px', fontSize: '10px' }}>
                    <span>Altura sección</span>
                    <span style={{ color: '#fff', fontWeight: 'bold' }}>{sec.alturaCm} cm</span>
                  </div>
                  <input 
                    type="range" min="10" max="150" step="1" 
                    value={sec.alturaCm} 
                    onChange={e => {
                      const val = Number(e.target.value)
                      setColumnas(columnas.map((c, ci) => ci !== contextMenu.colIndex ? c : {
                        ...c,
                        secciones: c.secciones.map((s, si) => si !== contextMenu.secIndex ? s : { ...s, alturaCm: val })
                      }))
                    }}
                    style={sliderStyle} 
                  />
                </div>

                {sec.tipo === 'cajon' && (
                  <>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#d4af37', marginBottom: '2px', fontSize: '10px' }}>
                        <span>Alto caja interior</span>
                        <span>{sec.alturaCajaCm ?? 16} cm</span>
                      </div>
                      <input 
                        type="range" min="5" max="40" step="1" 
                        value={sec.alturaCajaCm ?? 16} 
                        onChange={e => {
                          const val = Number(e.target.value)
                          setColumnas(columnas.map((c, ci) => ci !== contextMenu.colIndex ? c : {
                            ...c,
                            secciones: c.secciones.map((s, si) => si !== contextMenu.secIndex ? s : { ...s, alturaCajaCm: val })
                          }))
                        }}
                        style={sliderStyle} 
                      />
                    </div>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#d4af37', marginBottom: '2px', fontSize: '10px' }}>
                        <span>Profundidad de caja</span>
                        <span>{sec.profundidadCajaCm ?? 45} cm</span>
                      </div>
                      <input 
                        type="range" min="10" max={profundoCm - 5} step="1" 
                        value={sec.profundidadCajaCm ?? 45} 
                        onChange={e => {
                          const val = Number(e.target.value)
                          setColumnas(columnas.map((c, ci) => ci !== contextMenu.colIndex ? c : {
                            ...c,
                            secciones: c.secciones.map((s, si) => si !== contextMenu.secIndex ? s : { ...s, profundidadCajaCm: val })
                          }))
                        }}
                        style={sliderStyle} 
                      />
                    </div>
                  </>
                )}

                {sec.tipo === 'puerta' && (
                  <div style={{ borderTop: '1px dashed rgba(255,255,255,0.1)', paddingTop: '6px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div>
                      <span style={{ display: 'block', fontSize: '10px', color: '#d4af37', marginBottom: '2px' }}>Tipo de Puerta</span>
                      <select 
                        style={inputStyle} 
                        value={sec.cantidadPuertas} 
                        onChange={e => {
                          const val = Number(e.target.value) as 1 | 2
                          setColumnas(columnas.map((c, ci) => ci !== contextMenu.colIndex ? c : {
                            ...c,
                            secciones: c.secciones.map((s, si) => si !== contextMenu.secIndex ? s : { ...s, cantidadPuertas: val })
                          }))
                        }}
                      >
                        <option value={1} style={{ background: '#0b132b' }}>Puerta Simple (1 hoja)</option>
                        <option value={2} style={{ background: '#0b132b' }}>Puerta Doble (2 hojas)</option>
                      </select>
                    </div>

                    {sec.cantidadPuertas === 1 && (
                      <div>
                        <span style={{ display: 'block', fontSize: '10px', color: '#94a3b8', marginBottom: '2px' }}>Bisagra / Apertura</span>
                        <select 
                          style={inputStyle} 
                          value={sec.bisagra} 
                          onChange={e => {
                            const val = e.target.value as Bisagra
                            setColumnas(columnas.map((c, ci) => ci !== contextMenu.colIndex ? c : {
                              ...c,
                              secciones: c.secciones.map((s, si) => si !== contextMenu.secIndex ? s : { ...s, bisagra: val })
                            }))
                          }}
                        >
                          <option value="izquierda" style={{ background: '#0b132b' }}>Izquierda</option>
                          <option value="derecha" style={{ background: '#0b132b' }}>Derecha</option>
                        </select>
                      </div>
                    )}
                  </div>
                )}

                <button 
                  onClick={() => {
                    setColumnas(columnas.map((c, ci) => ci !== contextMenu.colIndex ? c : {
                      ...c,
                      secciones: c.secciones.filter((_, si) => si !== contextMenu.secIndex)
                    }))
                    setContextMenu(null)
                    setPiezaSeleccionada(null)
                  }}
                  style={{ marginTop: '4px', background: 'rgba(239, 68, 68, 0.2)', border: '1px solid #ef4444', color: '#ef4444', padding: '5px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '10px' }}
                >
                  🗑️ Eliminar sección
                </button>
              </div>
            )
          })()}
        </div>
      )}

      {/* 3. HUD FLOTANTE PRINCIPAL */}
      {!panelMinimizado && (
        <div style={{
          position: 'fixed', top: '65px', left: '20px', width: '400px', maxHeight: 'calc(100vh - 80px)',
          backgroundColor: 'rgba(15, 23, 42, 0.88)', backdropFilter: 'blur(12px)',
          borderRadius: '14px', border: '1px solid rgba(212, 175, 55, 0.35)',
          boxShadow: '0 10px 30px rgba(0,0,0,0.6)', zIndex: 900, display: 'flex', flexDirection: 'column',
          overflow: 'hidden', color: '#f8fafc'
        }}>
          
          <div style={{ display: 'flex', gap: '6px', padding: '12px 12px 0 12px', backgroundColor: 'rgba(11, 19, 43, 0.5)' }}>
            <button 
              onClick={() => setActiveTab('diseno')}
              style={{ flex: 1, padding: '8px', borderRadius: '8px', border: 'none', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer', background: activeTab === 'diseno' ? '#d4af37' : 'rgba(255,255,255,0.06)', color: activeTab === 'diseno' ? '#0b132b' : '#94a3b8' }}
            >
              🛠️ Diseño & Módulos
            </button>
            <button 
              onClick={() => setActiveTab('tecnico')}
              style={{ flex: 1, padding: '8px', borderRadius: '8px', border: 'none', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer', background: activeTab === 'tecnico' ? '#d4af37' : 'rgba(255,255,255,0.06)', color: activeTab === 'tecnico' ? '#0b132b' : '#94a3b8' }}
            >
              💼 Finalizar Compra
            </button>
          </div>

          <div style={{ padding: '14px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: 'calc(100vh - 150px)' }}>

            {activeTab === 'diseno' ? (
              <>
                <div style={{ backgroundColor: 'rgba(255, 255, 255, 0.03)', borderRadius: '10px', padding: '12px', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <h4 style={{ margin: '0 0 10px 0', fontSize: '12px', color: '#d4af37', letterSpacing: '0.5px' }}>📐 DIMENSIONES GENERALES</h4>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#94a3b8', marginBottom: '3px' }}>
                        <span>ANCHO</span>
                        <span style={{ fontWeight: 'bold', color: '#fff' }}>{Math.round(anchoCm * 10)} mm ({anchoCm} cm)</span>
                      </div>
                      <input type="range" min="40" max="200" step="1" value={anchoCm} onChange={e => setAnchoCm(Number(e.target.value))} style={sliderStyle} />
                    </div>

                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#94a3b8', marginBottom: '3px' }}>
                        <span>ALTO</span>
                        <span style={{ fontWeight: 'bold', color: '#fff' }}>{Math.round(altoCm * 10)} mm ({altoCm} cm)</span>
                      </div>
                      <input type="range" min="40" max="240" step="1" value={altoCm} onChange={e => setAltoCm(Number(e.target.value))} style={sliderStyle} />
                    </div>

                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#94a3b8', marginBottom: '3px' }}>
                        <span>PROFUNDIDAD</span>
                        <span style={{ fontWeight: 'bold', color: '#fff' }}>{Math.round(profundoCm * 10)} mm ({profundoCm} cm)</span>
                      </div>
                      <input type="range" min="20" max="90" step="1" value={profundoCm} onChange={e => setProfundoCm(Number(e.target.value))} style={sliderStyle} />
                    </div>
                  </div>

                  <div style={{ marginTop: '10px' }}>
                    <label style={{ fontSize: '10px', color: '#94a3b8', display: 'block', marginBottom: '3px' }}>ACABADO / MELAMINA</label>
                    <select style={inputStyle} value={colorId} onChange={e => setColorId(e.target.value)}>
                      {COLORES.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                    </select>
                  </div>
                </div>

                <div style={{ backgroundColor: 'rgba(255, 255, 255, 0.03)', borderRadius: '10px', padding: '12px', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <h4 style={{ margin: 0, fontSize: '12px', color: '#d4af37', letterSpacing: '0.5px' }}>🏛️ MÓDULOS Y SECCIONES</h4>
                    <button onClick={agregarColumna} style={{ padding: '4px 8px', background: '#d4af37', color: '#0b132b', border: 'none', borderRadius: '5px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}>+ Columna</button>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '280px', overflowY: 'auto', paddingRight: '2px' }}>
                    {columnas.map((col, ci) => (
                      <div key={col.id} style={{ border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '8px', background: 'rgba(11, 19, 43, 0.6)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', alignItems: 'center' }}>
                          <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#d4af37' }}>Columna {ci + 1}</span>
                          {columnas.length > 1 && (
                            <button onClick={() => setColumnas(columnas.filter(c => c.id !== col.id))} style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '10px', cursor: 'pointer' }}>Eliminar</button>
                          )}
                        </div>

                        {/* SLIDER DE ANCHO DE COLUMNA */}
                        <div style={{ marginBottom: '8px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#94a3b8' }}>
                            <span>Ancho de columna</span>
                            <span style={{ color: '#fff', fontWeight: 'bold' }}>{col.anchoCm} cm</span>
                          </div>
                          <input 
                            type="range" min="20" max="150" step="0.5" 
                            value={col.anchoCm} 
                            onChange={e => {
                              const val = Number(e.target.value)
                              setColumnas(columnas.map(c => c.id !== col.id ? c : { ...c, anchoCm: val }))
                            }} 
                            style={sliderStyle} 
                          />
                        </div>

                        <div style={{ display: 'flex', gap: '4px', marginBottom: '6px', flexWrap: 'wrap' }}>
                          <button onClick={() => agregarSeccion(col.id, 'cajon')} style={btnSec}>🗃️ Cajón</button>
                          <button onClick={() => agregarSeccion(col.id, 'puerta')} style={btnSec}>🚪 Puerta</button>
                          <button onClick={() => agregarSeccion(col.id, 'repisa')} style={btnSec}>🪵 Repisa</button>
                          <button onClick={() => agregarSeccion(col.id, 'espacio')} style={btnSec}>📦 Vacío</button>
                        </div>

                        {col.secciones.map((sec, si) => (
                          <div key={sec.id} style={{ background: 'rgba(255,255,255,0.04)', padding: '6px', borderRadius: '6px', marginBottom: '4px', border: '1px solid rgba(255,255,255,0.06)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px', fontSize: '11px' }}>
                              <span style={{ color: '#fff' }}>{si + 1}. <b>{sec.tipo.toUpperCase()}</b></span>
                              <button onClick={() => setColumnas(columnas.map(c => c.id !== col.id ? c : { ...c, secciones: c.secciones.filter(s => s.id !== sec.id) }))} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '10px' }}>✕</button>
                            </div>

                            <div style={{ marginBottom: '4px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#94a3b8' }}>
                                <span>Altura sección</span>
                                <span style={{ color: '#fff' }}>{sec.alturaCm} cm</span>
                              </div>
                              <input 
                                type="range" min="10" max="150" step="1" 
                                value={sec.alturaCm} 
                                onChange={e => {
                                  const val = Number(e.target.value)
                                  setColumnas(columnas.map(c => c.id !== col.id ? c : {
                                    ...c,
                                    secciones: c.secciones.map(s => s.id !== sec.id ? s : { ...s, alturaCm: val })
                                  }))
                                }} 
                                style={sliderStyle} 
                              />
                            </div>

                            {sec.tipo === 'cajon' && (
                              <div style={{ borderTop: '1px dashed rgba(255,255,255,0.1)', paddingTop: '4px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <div>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: '#d4af37' }}>
                                    <span>Alto caja interior</span>
                                    <span>{sec.alturaCajaCm ?? 16} cm</span>
                                  </div>
                                  <input 
                                    type="range" min="5" max="40" step="1" 
                                    value={sec.alturaCajaCm ?? 16} 
                                    onChange={e => {
                                      const val = Number(e.target.value)
                                      setColumnas(columnas.map(c => c.id !== col.id ? c : {
                                        ...c,
                                        secciones: c.secciones.map(s => s.id !== sec.id ? s : { ...s, alturaCajaCm: val })
                                      }))
                                    }} 
                                    style={sliderStyle} 
                                  />
                                </div>
                                <div>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: '#d4af37' }}>
                                    <span>Profundidad caja</span>
                                    <span>{sec.profundidadCajaCm ?? 45} cm</span>
                                  </div>
                                  <input 
                                    type="range" min="10" max={profundoCm - 5} step="1" 
                                    value={sec.profundidadCajaCm ?? 45} 
                                    onChange={e => {
                                      const val = Number(e.target.value)
                                      setColumnas(columnas.map(c => c.id !== col.id ? c : {
                                        ...c,
                                        secciones: c.secciones.map(s => s.id !== sec.id ? s : { ...s, profundidadCajaCm: val })
                                      }))
                                    }} 
                                    style={sliderStyle} 
                                  />
                                </div>
                              </div>
                            )}

                            {sec.tipo === 'puerta' && (
                              <div style={{ borderTop: '1px dashed rgba(255,255,255,0.1)', paddingTop: '4px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <div>
                                  <span style={{ display: 'block', fontSize: '9px', color: '#d4af37', marginBottom: '1px' }}>Tipo de Puerta</span>
                                  <select 
                                    style={inputStyle} 
                                    value={sec.cantidadPuertas} 
                                    onChange={e => {
                                      const val = Number(e.target.value) as 1 | 2
                                      setColumnas(columnas.map(c => c.id !== col.id ? c : {
                                        ...c,
                                        secciones: c.secciones.map(s => s.id !== sec.id ? s : { ...s, cantidadPuertas: val })
                                      }))
                                    }}
                                  >
                                    <option value={1} style={{ background: '#0b132b' }}>Puerta Simple (1 hoja)</option>
                                    <option value={2} style={{ background: '#0b132b' }}>Puerta Doble (2 hojas)</option>
                                  </select>
                                </div>

                                {sec.cantidadPuertas === 1 && (
                                  <div>
                                    <span style={{ display: 'block', fontSize: '9px', color: '#94a3b8', marginBottom: '1px' }}>Bisagra</span>
                                    <select 
                                      style={inputStyle} 
                                      value={sec.bisagra} 
                                      onChange={e => {
                                        const val = e.target.value as Bisagra
                                        setColumnas(columnas.map(c => c.id !== col.id ? c : {
                                          ...c,
                                          secciones: c.secciones.map(s => s.id !== sec.id ? s : { ...s, bisagra: val })
                                        }))
                                      }}
                                    >
                                      <option value="izquierda" style={{ background: '#0b132b' }}>Izquierda</option>
                                      <option value="derecha" style={{ background: '#0b132b' }}>Derecha</option>
                                    </select>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div style={{ backgroundColor: 'rgba(255, 255, 255, 0.03)', borderRadius: '10px', padding: '14px', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <h4 style={{ margin: 0, fontSize: '12px', color: '#d4af37' }}>💼 FINALIZAR COMPRA Y PEDIDO</h4>
                <p style={{ fontSize: '11px', color: '#94a3b8', margin: 0 }}>
                  Ingresa tus datos para procesar la orden. El acceso al diseñador 3D es libre, y al finalizar la compra se registrará tu pedido con el despiece técnico.
                </p>

                <div>
                  <label style={{ fontSize: '10px', color: '#94a3b8', display: 'block', marginBottom: '3px' }}>Nombre Completo</label>
                  <input type="text" placeholder="Ej. Juan Pérez" style={inputStyle} value={nombreCliente} onChange={e => setNombreCliente(e.target.value)} />
                </div>

                <div>
                  <label style={{ fontSize: '10px', color: '#94a3b8', display: 'block', marginBottom: '3px' }}>Teléfono / WhatsApp</label>
                  <input type="text" placeholder="Ej. +591..." style={inputStyle} value={telefonoCliente} onChange={e => setTelefonoCliente(e.target.value)} />
                </div>

                <div>
                  <label style={{ fontSize: '10px', color: '#94a3b8', display: 'block', marginBottom: '3px' }}>Observaciones o Requerimientos</label>
                  <textarea placeholder="Ej. Requiere instalación en planta baja..." style={{ ...inputStyle, height: '60px', resize: 'none' }} value={observacionesCliente} onChange={e => setObservacionesCliente(e.target.value)} />
                </div>

                <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                  <button 
                    onClick={() => {
                      const payload = prepararDatosCotizador()
                      const resumenTexto = `*NUEVA COMPRA / COTIZACIÓN - MuebLess is Better*\n` +
                        `👤 *Cliente:* ${payload.cliente.nombre}\n` +
                        `📱 *Teléfono:* ${payload.cliente.telefono}\n` +
                        `📐 *Dimensiones:* ${anchoCm}x${altoCm}x${profundoCm} cm\n` +
                        `🎨 *Acabado:* ${payload.mueble.colorMelamina}\n` +
                        `📝 *Notas:* ${payload.cliente.observaciones}\n` +
                        `🧩 *Total Piezas Despiece:* ${payload.despieceAgrupado.reduce((acc, p) => acc + p.cantidad, 0)} unids.\n\n` +
                        `_Diseño guardado y listo para procesar pago._`
                      const urlWhatsApp = `https://api.whatsapp.com/send?phone=TU_NUMERO_VENDEDOR&text=${encodeURIComponent(resumenTexto)}`
                      window.open(urlWhatsApp, '_blank')
                      setCotizacionEnviada(true)
                    }}
                    style={{ flex: 1, padding: '10px', background: '#d4af37', color: '#0b132b', border: 'none', borderRadius: '8px', fontWeight: 'bold', fontSize: '11px', cursor: 'pointer' }}
                  >
                    🚀 Realizar Pedido / Comprar
                  </button>
                </div>

                {cotizacionEnviada && (
                  <div style={{ padding: '8px', background: 'rgba(34, 197, 94, 0.2)', border: '1px solid #22c55e', borderRadius: '6px', color: '#86efac', fontSize: '10px', textAlign: 'center' }}>
                    ✓ ¡Pedido realizado con éxito! Te contactaremos.
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      )}
    </div>
  )
}

const sliderStyle: React.CSSProperties = {
  width: '100%', accentColor: '#d4af37', cursor: 'pointer', height: '4px', background: 'rgba(255,255,255,0.2)', borderRadius: '2px'
}

const inputStyle: React.CSSProperties = {
  padding: '6px 10px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.15)',
  fontSize: '11px', outline: 'none', width: '100%', boxSizing: 'border-box', backgroundColor: 'rgba(11, 19, 43, 0.8)', color: '#fff',
}

const btnSec: React.CSSProperties = {
  padding: '3px 6px', backgroundColor: 'rgba(255,255,255,0.08)', color: '#cbd5e1', border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: '4px', cursor: 'pointer', fontSize: '10px', fontWeight: '500',
}