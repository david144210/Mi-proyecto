'use client'
import { useState, useEffect, useRef, useMemo } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

// ============================================================
// FASE 1 — Motor de bocetado de estructura por planos de trabajo
// ============================================================
// Cada "plano de trabajo" es una superficie plana alineada a un eje
// (frontal / lateral / superior) ubicada a un offset (mm) en el eje
// perpendicular. Sobre ese plano se dibujan "trazos" (polilíneas
// abiertas) haciendo clic en una grilla de 1mm. Cada punto se puede
// corregir después con coordenadas exactas.
//
// Unidad de trabajo interna: milímetros, siempre enteros (sin
// decimales) — es la unidad natural para fabricación metálica.
// Al exportar hacia el cotizador (JSON), se convierte a centímetros
// para mantener consistencia con el resto del sistema (melamina, etc.).
//
// La Fase 2 tomará cada segmento y le asignará un perfil real
// (codigo_acero de la tabla perfiles_3d) para extruirlo en 3D.

type TipoPlano = 'frontal' | 'lateral' | 'superior'

// Catálogo de perfiles (aceros + perfiles_3d en Supabase)
type TipoPerfil = 'tubo_cuadrado' | 'tubo_rectangular' | 'tubo_redondo' | 'angulo' | 'platina'

interface PerfilCatalogo {
  codigo_acero: string
  tipo_perfil: TipoPerfil
  ancho_mm: number | null
  alto_mm: number | null
  diametro_mm: number | null
  espesor_mm: number
  longitud_comercial_mm: number
  aceros: { detalle: string | null; precio_cotizador: number | null; proveedor: string | null } | null
}

// Metadatos de fabricación de cada barra (un segmento = una barra real)
interface BarraInfo {
  codigoAcero: string | null
  rotacionDeg: number // giro manual del perfil sobre el eje de la barra
}

interface PuntoPlano {
  id: number
  u: number // mm, eje horizontal del plano (entero)
  v: number // mm, eje vertical del plano (entero)
}

interface Trazo {
  id: number
  puntos: PuntoPlano[]
  barras: BarraInfo[] // barras[i] = segmento entre puntos[i] y puntos[i+1]
}

interface PlanoTrabajo {
  id: number
  nombre: string
  tipo: TipoPlano
  offsetMm: number // posición del plano en el eje perpendicular, en mm
  trazos: Trazo[]
}

const ETIQUETA_TIPO: Record<TipoPlano, string> = {
  frontal: 'Frontal (ancho × alto)',
  lateral: 'Lateral (profundidad × alto)',
  superior: 'Superior (ancho × profundidad)',
}

const COLOR_TIPO: Record<TipoPlano, string> = {
  frontal: '#2563eb',
  lateral: '#16a34a',
  superior: '#d97706',
}

const COLOR_TIPO_3D: Record<TipoPlano, number> = {
  frontal: 0x2563eb,
  lateral: 0x16a34a,
  superior: 0xd97706,
}

// Convierte un punto local (u,v) de un plano a coordenadas 3D (metros)
function puntoATresD(plano: PlanoTrabajo, p: PuntoPlano): THREE.Vector3 {
  const u = p.u / 1000
  const v = p.v / 1000
  const off = plano.offsetMm / 1000
  switch (plano.tipo) {
    case 'frontal':
      return new THREE.Vector3(u, v, off) // X=u, Y=v(altura), Z=offset (profundidad fija)
    case 'lateral':
      return new THREE.Vector3(off, v, u) // X=offset (ancho fijo), Y=v(altura), Z=u(profundidad)
    case 'superior':
      return new THREE.Vector3(u, off, v) // X=u, Y=offset(altura fija), Z=v(profundidad)
  }
}

function distanciaMm(a: PuntoPlano, b: PuntoPlano): number {
  return Math.sqrt((a.u - b.u) ** 2 + (a.v - b.v) ** 2)
}

// Ángulo del segmento a->b respecto a la horizontal, en grados [0, 360)
function anguloSegmentoDeg(a: PuntoPlano, b: PuntoPlano): number {
  const rad = Math.atan2(b.v - a.v, b.u - a.u)
  const deg = (rad * 180) / Math.PI
  return deg < 0 ? deg + 360 : deg
}

// Ángulo interior de la esquina en "vertice", entre el segmento que viene de
// "prev" y el que va hacia "next". Devuelve también el corte de inglete
// sugerido por barra (mitad del ángulo de giro), como un corte de marco.
function anguloEsquina(prev: PuntoPlano, vertice: PuntoPlano, next: PuntoPlano) {
  const v1 = { u: prev.u - vertice.u, v: prev.v - vertice.v }
  const v2 = { u: next.u - vertice.u, v: next.v - vertice.v }
  const mag1 = Math.sqrt(v1.u ** 2 + v1.v ** 2)
  const mag2 = Math.sqrt(v2.u ** 2 + v2.v ** 2)
  if (mag1 === 0 || mag2 === 0) return null
  const cos = Math.max(-1, Math.min(1, (v1.u * v2.u + v1.v * v2.v) / (mag1 * mag2)))
  const interiorDeg = (Math.acos(cos) * 180) / Math.PI // 0–180°
  const ingleteDeg = (180 - interiorDeg) / 2 // corte por barra desde escuadra (90°)
  return { interiorDeg, ingleteDeg }
}

// Pasos de grilla "bonitos" en mm, elegidos según el nivel de zoom
const PASOS_GRILLA = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000]
function pasoGrilla(escala: number): number {
  const crudo = 40 / escala
  return PASOS_GRILLA.find(p => p >= crudo) || 5000
}

// ============================================================
// FASE 2 — Geometría real del perfil (extrusión con ingletes)
// ============================================================

// Genera el contorno 2D (en mm, centrado en el eje de la barra) de la
// sección transversal, en orden CCW, según el tipo de perfil.
function generarSeccion(perfil: PerfilCatalogo): { u: number; v: number }[] {
  switch (perfil.tipo_perfil) {
    case 'tubo_cuadrado':
    case 'tubo_rectangular': {
      const w = perfil.ancho_mm ?? 20
      const h = perfil.alto_mm ?? w
      return [
        { u: -w / 2, v: -h / 2 }, { u: w / 2, v: -h / 2 },
        { u: w / 2, v: h / 2 }, { u: -w / 2, v: h / 2 },
      ]
    }
    case 'tubo_redondo': {
      const r = (perfil.diametro_mm ?? 20) / 2
      const N = 20
      const pts: { u: number; v: number }[] = []
      for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2
        pts.push({ u: r * Math.cos(a), v: r * Math.sin(a) })
      }
      return pts
    }
    case 'platina': {
      const w = perfil.ancho_mm ?? 25
      const t = perfil.espesor_mm ?? 3
      return [
        { u: -w / 2, v: -t / 2 }, { u: w / 2, v: -t / 2 },
        { u: w / 2, v: t / 2 }, { u: -w / 2, v: t / 2 },
      ]
    }
    case 'angulo': {
      const a = perfil.ancho_mm ?? 25
      const b = perfil.alto_mm ?? a
      const e = perfil.espesor_mm ?? 3
      // L con el codo en (0,0), luego se centra según el bounding box
      const pts = [
        { u: 0, v: 0 }, { u: a, v: 0 }, { u: a, v: e },
        { u: e, v: e }, { u: e, v: b }, { u: 0, v: b },
      ]
      return pts.map(p => ({ u: p.u - a / 2, v: p.v - b / 2 }))
    }
  }
}

const EJE_ARRIBA = new THREE.Vector3(0, 1, 0)
const EJE_DERECHA = new THREE.Vector3(1, 0, 0)

// Construye la malla 3D (BufferGeometry) de una barra recta entre p1 y p2,
// con la sección dada, rotada `rotacionDeg` sobre su propio eje, y con los
// extremos cortados a inglete según los planos de corte normalInicio/normalFin
// (null = corte recto/escuadra).
function construirBarra(
  p1: THREE.Vector3, p2: THREE.Vector3,
  seccion: { u: number; v: number }[],
  rotacionDeg: number,
  normalInicio: THREE.Vector3 | null,
  normalFin: THREE.Vector3 | null
): THREE.BufferGeometry {
  const dir = new THREE.Vector3().subVectors(p2, p1).normalize()
  const refUp = Math.abs(dir.dot(EJE_ARRIBA)) > 0.98 ? EJE_DERECHA : EJE_ARRIBA
  const uAxis0 = new THREE.Vector3().crossVectors(refUp, dir).normalize()
  const vAxis0 = new THREE.Vector3().crossVectors(dir, uAxis0).normalize()

  const rad = (rotacionDeg * Math.PI) / 180
  const cos = Math.cos(rad), sin = Math.sin(rad)
  const uAxis = uAxis0.clone().multiplyScalar(cos).add(vAxis0.clone().multiplyScalar(sin))
  const vAxis = uAxis0.clone().multiplyScalar(-sin).add(vAxis0.clone().multiplyScalar(cos))

  const nIni = normalInicio ?? dir
  const nFin = normalFin ?? dir

  const N = seccion.length
  const inicio: THREE.Vector3[] = []
  const fin: THREE.Vector3[] = []

  seccion.forEach(({ u, v }) => {
    const offsetMm = uAxis.clone().multiplyScalar(u).add(vAxis.clone().multiplyScalar(v))
    const offsetM = offsetMm.clone().multiplyScalar(0.001) // mm -> m

    const denomIni = dir.dot(nIni)
    const tIni = Math.abs(denomIni) > 1e-6 ? -offsetM.dot(nIni) / denomIni : 0
    inicio.push(p1.clone().add(offsetM).add(dir.clone().multiplyScalar(tIni)))

    const denomFin = dir.dot(nFin)
    const tFin = Math.abs(denomFin) > 1e-6 ? -offsetM.dot(nFin) / denomFin : 0
    fin.push(p2.clone().add(offsetM).add(dir.clone().multiplyScalar(tFin)))
  })

  const posiciones: number[] = []
  const push3 = (v: THREE.Vector3) => posiciones.push(v.x, v.y, v.z)

  // Caras laterales
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N
    push3(inicio[i]); push3(inicio[j]); push3(fin[j])
    push3(inicio[i]); push3(fin[j]); push3(fin[i])
  }

  // Tapas (triangulación robusta, sirve para formas no convexas como el ángulo)
  const contorno2D = seccion.map(p => new THREE.Vector2(p.u, p.v))
  const triangulos = THREE.ShapeUtils.triangulateShape(contorno2D, [])
  triangulos.forEach(([a, b, c]) => {
    push3(inicio[a]); push3(inicio[c]); push3(inicio[b]) // tapa inicio (orden invertido, mira hacia -dir)
  })
  triangulos.forEach(([a, b, c]) => {
    push3(fin[a]); push3(fin[b]); push3(fin[c])
  })

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(posiciones, 3))
  geometry.computeVertexNormals()
  return geometry
}

// ---- Config del lienzo 2D ----
const CANVAS_SIZE = 560
const ESCALA_INICIAL = 0.4 // px por mm (equivale a 4 px/cm)
const ESCALA_MIN = 0.03
const ESCALA_MAX = 2.5

export default function DisenoEstructura() {
  const [planos, setPlanos] = useState<PlanoTrabajo[]>([
    { id: 1, nombre: 'Frontal', tipo: 'frontal', offsetMm: 0, trazos: [] },
  ])
  const [planoActivoId, setPlanoActivoId] = useState(1)
  const [nextPlanoId, setNextPlanoId] = useState(2)
  const [nextTrazoId, setNextTrazoId] = useState(1)
  const [nextPuntoId, setNextPuntoId] = useState(1)

  // Catálogo de perfiles (Fase 2), cargado desde /api/perfiles
  const [perfiles, setPerfiles] = useState<PerfilCatalogo[]>([])
  const [cargandoPerfiles, setCargandoPerfiles] = useState(true)
  const [errorPerfiles, setErrorPerfiles] = useState('')

  useEffect(() => {
    fetch('/api/perfiles')
      .then(r => r.json())
      .then(data => {
        if (data.error) { setErrorPerfiles(data.error); return }
        setPerfiles(data.perfiles || [])
      })
      .catch(() => setErrorPerfiles('No se pudo conectar con el catálogo de perfiles.'))
      .finally(() => setCargandoPerfiles(false))
  }, [])

  const [trazoActivoId, setTrazoActivoId] = useState<number | null>(null)
  const [puntoEditandoId, setPuntoEditandoId] = useState<number | null>(null)

  // Formulario "nuevo plano"
  const [mostrarFormPlano, setMostrarFormPlano] = useState(false)
  const [nuevoTipo, setNuevoTipo] = useState<TipoPlano>('lateral')
  const [nuevoOffset, setNuevoOffset] = useState(0)
  const [nuevoNombre, setNuevoNombre] = useState('')

  // Punto exacto por teclado (sin clic)
  const [uExacto, setUExacto] = useState('')
  const [vExacto, setVExacto] = useState('')

  // Punto por longitud + ángulo (para diagonales exactas)
  const [largoPolar, setLargoPolar] = useState('')
  const [anguloPolar, setAnguloPolar] = useState('')

  // Zoom / pan del lienzo 2D
  const [escala, setEscala] = useState(ESCALA_INICIAL)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const panActivoRef = useRef(false)
  const panUltimoRef = useRef({ x: 0, y: 0 })

  const planoActivo = planos.find(p => p.id === planoActivoId) || planos[0]

  // Transformaciones mm <-> px del lienzo, según zoom/pan actuales
  const mmAPx = (u: number, v: number) => ({
    x: CANVAS_SIZE / 2 + pan.x + u * escala,
    y: CANVAS_SIZE / 2 + pan.y - v * escala,
  })
  const pxAMm = (xPx: number, yPx: number) => ({
    u: (xPx - CANVAS_SIZE / 2 - pan.x) / escala,
    v: (CANVAS_SIZE / 2 + pan.y - yPx) / escala,
  })

  // ---------- refs three.js ----------
  const mountRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const esqueletoGroupRef = useRef<THREE.Group | null>(null)

  // ---------- Inicializar escena 3D ----------
  useEffect(() => {
    if (!mountRef.current) return
    const width = mountRef.current.clientWidth || 700
    const height = mountRef.current.clientHeight || 600

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0xeef0f2)
    sceneRef.current = scene

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 500)
    camera.position.set(3.5, 2.8, 4.5)
    cameraRef.current = camera

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(width, height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    mountRef.current.appendChild(renderer.domElement)
    rendererRef.current = renderer

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(0.5, 0.8, 0)
    controls.enableDamping = true
    controlsRef.current = controls

    const hemi = new THREE.HemisphereLight(0xffffff, 0x555555, 1.2)
    scene.add(hemi)
    const dir = new THREE.DirectionalLight(0xffffff, 0.8)
    dir.position.set(5, 8, 5)
    scene.add(dir)

    const grid = new THREE.GridHelper(6, 24, 0xbbbbbb, 0xdddddd)
    scene.add(grid)
    const ejes = new THREE.AxesHelper(1.2)
    scene.add(ejes)

    const grupo = new THREE.Group()
    scene.add(grupo)
    esqueletoGroupRef.current = grupo

    let vivo = true
    const animar = () => {
      if (!vivo) return
      requestAnimationFrame(animar)
      controls.update()
      renderer.render(scene, camera)
    }
    animar()

    const onResize = () => {
      if (!mountRef.current || !rendererRef.current || !cameraRef.current) return
      const w = mountRef.current.clientWidth
      const h = mountRef.current.clientHeight
      rendererRef.current.setSize(w, h)
      cameraRef.current.aspect = w / h
      cameraRef.current.updateProjectionMatrix()
    }
    window.addEventListener('resize', onResize)

    return () => {
      vivo = false
      window.removeEventListener('resize', onResize)
      controls.dispose()
      renderer.dispose()
      if (mountRef.current && renderer.domElement.parentElement === mountRef.current) {
        mountRef.current.removeChild(renderer.domElement)
      }
    }
  }, [])

  // ---------- Reconstruir el esqueleto 3D cuando cambian los planos o el catálogo ----------
  useEffect(() => {
    const grupo = esqueletoGroupRef.current
    if (!grupo) return

    while (grupo.children.length) {
      const hijo = grupo.children[0]
      grupo.remove(hijo)
      if ((hijo as any).geometry) (hijo as any).geometry.dispose()
      if ((hijo as any).material) (hijo as any).material.dispose()
    }

    const materialBarra = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.6, roughness: 0.4, side: THREE.DoubleSide })

    planos.forEach(plano => {
      const color = COLOR_TIPO_3D[plano.tipo]

      plano.trazos.forEach(trazo => {
        const n = trazo.puntos.length
        if (n === 1) {
          const pos = puntoATresD(plano, trazo.puntos[0])
          const esfera = new THREE.Mesh(new THREE.SphereGeometry(0.02, 12, 12), new THREE.MeshBasicMaterial({ color }))
          esfera.position.copy(pos)
          grupo.add(esfera)
          return
        }

        const pts3d = trazo.puntos.map(p => puntoATresD(plano, p))

        for (let i = 0; i < n - 1; i++) {
          const barra = trazo.barras[i]
          const perfil = perfilDe(barra?.codigoAcero ?? null)
          const p1 = pts3d[i]
          const p2 = pts3d[i + 1]

          if (perfil) {
            const dirActual = new THREE.Vector3().subVectors(p2, p1).normalize()

            let normalInicio: THREE.Vector3 | null = null
            if (i > 0) {
              const dirPrev = new THREE.Vector3().subVectors(pts3d[i], pts3d[i - 1]).normalize()
              normalInicio = new THREE.Vector3().addVectors(dirPrev, dirActual).normalize()
            }
            let normalFin: THREE.Vector3 | null = null
            if (i < n - 2) {
              const dirNext = new THREE.Vector3().subVectors(pts3d[i + 2], pts3d[i + 1]).normalize()
              normalFin = new THREE.Vector3().addVectors(dirActual, dirNext).normalize()
            }

            const seccion = generarSeccion(perfil)
            const geometry = construirBarra(p1, p2, seccion, barra.rotacionDeg || 0, normalInicio, normalFin)
            const mesh = new THREE.Mesh(geometry, materialBarra)
            grupo.add(mesh)
          } else {
            // Sin perfil asignado todavía: línea guía simple
            const geometry = new THREE.BufferGeometry().setFromPoints([p1, p2])
            const material = new THREE.LineDashedMaterial({ color, dashSize: 0.03, gapSize: 0.02 })
            const linea = new THREE.Line(geometry, material)
            linea.computeLineDistances()
            grupo.add(linea)
          }
        }

        pts3d.forEach(pos => {
          const esfera = new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 10), new THREE.MeshBasicMaterial({ color }))
          esfera.position.copy(pos)
          grupo.add(esfera)
        })
      })
    })
  }, [planos, perfiles])

  // ---------- Helpers de datos ----------
  const actualizarPlano = (id: number, cambios: Partial<PlanoTrabajo>) => {
    setPlanos(prev => prev.map(p => (p.id === id ? { ...p, ...cambios } : p)))
  }

  const agregarPunto = (planoId: number, u: number, v: number) => {
    const uSnap = Math.round(u)
    const vSnap = Math.round(v)
    setPlanos(prev =>
      prev.map(plano => {
        if (plano.id !== planoId) return plano
        const nuevoPunto: PuntoPlano = { id: nextPuntoId, u: uSnap, v: vSnap }

        if (trazoActivoId === null) {
          const nuevoTrazo: Trazo = { id: nextTrazoId, puntos: [nuevoPunto], barras: [] }
          setTrazoActivoId(nextTrazoId)
          setNextTrazoId(id => id + 1)
          return { ...plano, trazos: [...plano.trazos, nuevoTrazo] }
        }

        return {
          ...plano,
          trazos: plano.trazos.map(t =>
            t.id === trazoActivoId
              ? {
                  ...t,
                  puntos: [...t.puntos, nuevoPunto],
                  barras: t.puntos.length > 0 ? [...t.barras, { codigoAcero: null, rotacionDeg: 0 }] : t.barras,
                }
              : t
          ),
        }
      })
    )
    setNextPuntoId(id => id + 1)
  }

  const handleClicLienzo = (e: React.MouseEvent<SVGSVGElement>) => {
    if (panActivoRef.current) return // fue un pan, no un clic de dibujo
    const rect = e.currentTarget.getBoundingClientRect()
    const xPx = ((e.clientX - rect.left) / rect.width) * CANVAS_SIZE
    const yPx = ((e.clientY - rect.top) / rect.height) * CANVAS_SIZE
    const { u, v } = pxAMm(xPx, yPx)
    agregarPunto(planoActivoId, u, v)
  }

  const handleWheelLienzo = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault()
    const rect = e.currentTarget.getBoundingClientRect()
    const cursorPx = {
      x: ((e.clientX - rect.left) / rect.width) * CANVAS_SIZE,
      y: ((e.clientY - rect.top) / rect.height) * CANVAS_SIZE,
    }
    const { u, v } = pxAMm(cursorPx.x, cursorPx.y)
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15
    const nuevaEscala = Math.min(ESCALA_MAX, Math.max(ESCALA_MIN, escala * factor))
    setEscala(nuevaEscala)
    setPan({
      x: cursorPx.x - CANVAS_SIZE / 2 - u * nuevaEscala,
      y: cursorPx.y - CANVAS_SIZE / 2 + v * nuevaEscala,
    })
  }

  const handlePointerDownLienzo = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 2) return // solo clic derecho arrastra (pan)
    panActivoRef.current = true
    panUltimoRef.current = { x: e.clientX, y: e.clientY }
  }
  const handlePointerMoveLienzo = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!panActivoRef.current) return
    const dx = e.clientX - panUltimoRef.current.x
    const dy = e.clientY - panUltimoRef.current.y
    panUltimoRef.current = { x: e.clientX, y: e.clientY }
    setPan(prev => ({ x: prev.x + dx, y: prev.y + dy }))
  }
  const handlePointerUpLienzo = () => {
    // pequeño retraso para que el clic sintético posterior no dibuje un punto
    setTimeout(() => { panActivoRef.current = false }, 0)
  }

  const zoomBoton = (factor: number) => {
    const nuevaEscala = Math.min(ESCALA_MAX, Math.max(ESCALA_MIN, escala * factor))
    setEscala(nuevaEscala) // zoom centrado en el origen del plano
  }
  const centrarVista = () => { setEscala(ESCALA_INICIAL); setPan({ x: 0, y: 0 }) }

  const agregarPuntoExacto = () => {
    const u = parseFloat(uExacto)
    const v = parseFloat(vExacto)
    if (Number.isNaN(u) || Number.isNaN(v)) return
    agregarPunto(planoActivoId, u, v)
    setUExacto('')
    setVExacto('')
  }

  // Punto anterior del trazo activo (para el modo longitud + ángulo)
  const trazoActivo = planoActivo.trazos.find(t => t.id === trazoActivoId)
  const puntoAnterior = trazoActivo && trazoActivo.puntos.length > 0
    ? trazoActivo.puntos[trazoActivo.puntos.length - 1]
    : null

  const agregarPuntoPolar = () => {
    if (!puntoAnterior) return
    const largo = parseFloat(largoPolar)
    const angulo = parseFloat(anguloPolar)
    if (Number.isNaN(largo) || Number.isNaN(angulo)) return
    const rad = (angulo * Math.PI) / 180
    const u = puntoAnterior.u + largo * Math.cos(rad)
    const v = puntoAnterior.v + largo * Math.sin(rad)
    agregarPunto(planoActivoId, u, v)
    setLargoPolar('')
    setAnguloPolar('')
  }

  const actualizarBarra = (planoId: number, trazoId: number, indiceSegmento: number, cambios: Partial<BarraInfo>) => {
    setPlanos(prev =>
      prev.map(plano => {
        if (plano.id !== planoId) return plano
        return {
          ...plano,
          trazos: plano.trazos.map(t =>
            t.id === trazoId
              ? { ...t, barras: t.barras.map((b, i) => (i === indiceSegmento ? { ...b, ...cambios } : b)) }
              : t
          ),
        }
      })
    )
  }

  const perfilDe = (codigoAcero: string | null): PerfilCatalogo | null =>
    codigoAcero ? perfiles.find(p => p.codigo_acero === codigoAcero) || null : null

  const esAsimetrico = (tipo: TipoPerfil | undefined) =>
    tipo === 'angulo' || tipo === 'tubo_rectangular' || tipo === 'platina'

  const terminarTrazo = () => setTrazoActivoId(null)

  const eliminarTrazo = (planoId: number, trazoId: number) => {
    actualizarPlano(planoId, {
      trazos: (planos.find(p => p.id === planoId)?.trazos || []).filter(t => t.id !== trazoId),
    })
    if (trazoActivoId === trazoId) setTrazoActivoId(null)
  }

  const eliminarPunto = (planoId: number, trazoId: number, puntoId: number) => {
    setPlanos(prev =>
      prev.map(plano => {
        if (plano.id !== planoId) return plano
        return {
          ...plano,
          trazos: plano.trazos
            .map(t => {
              if (t.id !== trazoId) return t
              const puntos = t.puntos.filter(pt => pt.id !== puntoId)
              const nSeg = Math.max(0, puntos.length - 1)
              const barras = Array.from({ length: nSeg }, (_, i) => t.barras[i] ?? { codigoAcero: null, rotacionDeg: 0 })
              return { ...t, puntos, barras }
            })
            .filter(t => t.puntos.length > 0),
        }
      })
    )
  }

  const editarPunto = (planoId: number, trazoId: number, puntoId: number, u: number, v: number) => {
    setPlanos(prev =>
      prev.map(plano => {
        if (plano.id !== planoId) return plano
        return {
          ...plano,
          trazos: plano.trazos.map(t =>
            t.id === trazoId
              ? { ...t, puntos: t.puntos.map(pt => (pt.id === puntoId ? { ...pt, u, v } : pt)) }
              : t
          ),
        }
      })
    )
  }

  const agregarPlano = () => {
    const nombre = nuevoNombre.trim() || `${ETIQUETA_TIPO[nuevoTipo].split(' ')[0]} ${nuevoOffset}mm`
    const nuevo: PlanoTrabajo = { id: nextPlanoId, nombre, tipo: nuevoTipo, offsetMm: nuevoOffset, trazos: [] }
    setPlanos(prev => [...prev, nuevo])
    setPlanoActivoId(nextPlanoId)
    setNextPlanoId(id => id + 1)
    setMostrarFormPlano(false)
    setNuevoNombre('')
    setNuevoOffset(0)
  }

  const eliminarPlano = (id: number) => {
    if (planos.length <= 1) return
    setPlanos(prev => prev.filter(p => p.id !== id))
    if (planoActivoId === id) setPlanoActivoId(planos.find(p => p.id !== id)?.id || planos[0].id)
  }

  // ---------- Resumen ----------
  const totalLineas = useMemo(
    () => planos.reduce((acc, p) => acc + p.trazos.reduce((a, t) => a + Math.max(0, t.puntos.length - 1), 0), 0),
    [planos]
  )
  const largoTotalMm = useMemo(() => {
    let total = 0
    planos.forEach(plano => {
      plano.trazos.forEach(trazo => {
        for (let i = 0; i < trazo.puntos.length - 1; i++) {
          total += distanciaMm(trazo.puntos[i], trazo.puntos[i + 1])
        }
      })
    })
    return total
  }, [planos])

  // Exporta el boceto convirtiendo mm -> cm, para que el formato quede listo
  // para migrar hacia el cotizador (que trabaja en centímetros, igual que
  // el resto del sistema: melaminas, ventas, etc.)
  const exportarJSON = () => {
    const planosEnCm = planos.map(plano => ({
      ...plano,
      offsetCm: plano.offsetMm / 10,
      trazos: plano.trazos.map(trazo => ({
        ...trazo,
        puntos: trazo.puntos.map(p => ({ id: p.id, u: p.u / 10, v: p.v / 10 })),
      })),
    }))
    const datos = JSON.stringify({ unidad: 'cm', planos: planosEnCm }, null, 2)
    const blob = new Blob([datos], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'boceto-estructura-cm.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  // ---------- Render de la grilla SVG (dinámica según zoom/pan) ----------
  const paso = pasoGrilla(escala)
  const { u: uMin } = pxAMm(0, 0)
  const { u: uMax } = pxAMm(CANVAS_SIZE, 0)
  const { v: vMax } = pxAMm(0, 0)
  const { v: vMin } = pxAMm(0, CANVAS_SIZE)
  const lineasGrilla = []
  const iInicioU = Math.floor(uMin / paso) * paso
  for (let i = iInicioU; i <= uMax; i += paso) {
    const { x } = mmAPx(i, 0)
    lineasGrilla.push(<line key={`v${i}`} x1={x} y1={0} x2={x} y2={CANVAS_SIZE} stroke={Math.abs(i) < 0.01 ? '#94a3b8' : '#e5e7eb'} strokeWidth={Math.abs(i) < 0.01 ? 1.5 : 1} />)
  }
  const iInicioV = Math.floor(vMin / paso) * paso
  for (let i = iInicioV; i <= vMax; i += paso) {
    const { y } = mmAPx(0, i)
    lineasGrilla.push(<line key={`h${i}`} x1={0} y1={y} x2={CANVAS_SIZE} y2={y} stroke={Math.abs(i) < 0.01 ? '#94a3b8' : '#e5e7eb'} strokeWidth={Math.abs(i) < 0.01 ? 1.5 : 1} />)
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f3f4f6', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ padding: '16px 24px', backgroundColor: '#0f172a', color: 'white' }}>
        <h1 style={{ margin: 0, fontSize: '18px' }}>🔩 Diseño de estructura — Fase 2: Perfiles reales</h1>
        <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#94a3b8' }}>
          Dibuja sobre un plano de trabajo. Clic = punto aproximado (snap 1mm) · edítalo abajo con coordenadas exactas. Asigna un perfil a cada segmento para verlo extruido en 3D.
        </p>
        {cargandoPerfiles && <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: '#fbbf24' }}>Cargando catálogo de perfiles…</p>}
        {errorPerfiles && <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: '#f87171' }}>⚠ {errorPerfiles}</p>}
        {!cargandoPerfiles && !errorPerfiles && perfiles.length === 0 && (
          <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: '#fbbf24' }}>⚠ No hay perfiles cargados aún en la tabla perfiles_3d.</p>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr 340px', gap: '16px', padding: '16px', alignItems: 'start' }}>
        {/* ===== Columna izquierda: planos ===== */}
        <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <h2 style={{ fontSize: '14px', margin: '0 0 10px 0' }}>Planos de trabajo</h2>
          {planos.map(plano => (
            <div
              key={plano.id}
              onClick={() => setPlanoActivoId(plano.id)}
              style={{
                padding: '8px 10px', borderRadius: '8px', marginBottom: '6px', cursor: 'pointer',
                border: plano.id === planoActivoId ? `2px solid ${COLOR_TIPO[plano.tipo]}` : '1px solid #e5e7eb',
                backgroundColor: plano.id === planoActivoId ? '#f8fafc' : 'white',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}
            >
              <div>
                <div style={{ fontSize: '12px', fontWeight: 'bold', color: COLOR_TIPO[plano.tipo] }}>{plano.nombre}</div>
                <div style={{ fontSize: '10px', color: '#888' }}>{ETIQUETA_TIPO[plano.tipo]} · offset {plano.offsetMm}mm</div>
              </div>
              {planos.length > 1 && (
                <button onClick={e => { e.stopPropagation(); eliminarPlano(plano.id) }} style={{ border: 'none', background: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '13px' }}>✕</button>
              )}
            </div>
          ))}

          {!mostrarFormPlano ? (
            <button onClick={() => setMostrarFormPlano(true)} style={{ width: '100%', marginTop: '8px', padding: '8px', borderRadius: '8px', border: '1px dashed #94a3b8', background: 'none', cursor: 'pointer', fontSize: '12px', color: '#475569' }}>
              + Nuevo plano de trabajo
            </button>
          ) : (
            <div style={{ marginTop: '10px', padding: '10px', backgroundColor: '#f8fafc', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <select value={nuevoTipo} onChange={e => setNuevoTipo(e.target.value as TipoPlano)} style={inputStyle}>
                <option value="frontal">Frontal (ancho × alto)</option>
                <option value="lateral">Lateral (profundidad × alto)</option>
                <option value="superior">Superior (ancho × profundidad)</option>
              </select>
              <input placeholder="Nombre (opcional)" value={nuevoNombre} onChange={e => setNuevoNombre(e.target.value)} style={inputStyle} />
              <div>
                <label style={labelStyle}>Offset en el eje perpendicular (mm)</label>
                <input type="number" value={nuevoOffset} onChange={e => setNuevoOffset(Number(e.target.value))} style={inputStyle} />
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button onClick={agregarPlano} style={{ ...btnMini, flex: 1, backgroundColor: '#087e0b', color: 'white', border: 'none' }}>Crear</button>
                <button onClick={() => setMostrarFormPlano(false)} style={{ ...btnMini, flex: 1 }}>Cancelar</button>
              </div>
            </div>
          )}

          <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid #eee', fontSize: '12px', color: '#475569' }}>
            <p style={{ margin: '2px 0' }}>Líneas totales: <strong>{totalLineas}</strong></p>
            <p style={{ margin: '2px 0' }}>Largo total: <strong>{largoTotalMm.toFixed(0)} mm</strong> <span style={{ color: '#999' }}>({(largoTotalMm / 1000).toFixed(2)} m)</span></p>
            <button onClick={exportarJSON} style={{ ...btnMini, marginTop: '8px', width: '100%' }}>💾 Exportar boceto (JSON)</button>
          </div>
        </div>

        {/* ===== Columna central: lienzo 2D + vista 3D ===== */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <h2 style={{ fontSize: '14px', margin: 0 }}>
                Lienzo — <span style={{ color: COLOR_TIPO[planoActivo.tipo] }}>{planoActivo.nombre}</span>
              </h2>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <button onClick={() => zoomBoton(1 / 1.3)} style={btnMini} title="Alejar">−</button>
                <span style={{ fontSize: '11px', color: '#666', minWidth: '38px', textAlign: 'center' }}>{Math.round((escala / ESCALA_INICIAL) * 100)}%</span>
                <button onClick={() => zoomBoton(1.3)} style={btnMini} title="Acercar">+</button>
                <button onClick={centrarVista} style={btnMini}>⤢ Centrar</button>
                <button onClick={terminarTrazo} disabled={trazoActivoId === null} style={{ ...btnMini, opacity: trazoActivoId === null ? 0.4 : 1 }}>
                  ✓ Terminar trazo
                </button>
              </div>
            </div>
            <svg
              width={CANVAS_SIZE} height={CANVAS_SIZE}
              onClick={handleClicLienzo}
              onWheel={handleWheelLienzo}
              onPointerDown={handlePointerDownLienzo}
              onPointerMove={handlePointerMoveLienzo}
              onPointerUp={handlePointerUpLienzo}
              onPointerLeave={handlePointerUpLienzo}
              onContextMenu={e => e.preventDefault()}
              style={{ border: '1px solid #e5e7eb', borderRadius: '8px', cursor: 'crosshair', width: '100%', maxWidth: CANVAS_SIZE, touchAction: 'none' }}
              viewBox={`0 0 ${CANVAS_SIZE} ${CANVAS_SIZE}`}
            >
              {lineasGrilla}
              {planoActivo.trazos.map(trazo => (
                <g key={trazo.id}>
                  <polyline
                    points={trazo.puntos.map(p => { const { x, y } = mmAPx(p.u, p.v); return `${x},${y}` }).join(' ')}
                    fill="none" stroke={COLOR_TIPO[planoActivo.tipo]} strokeWidth={trazo.id === trazoActivoId ? 2.5 : 1.5}
                  />
                  {trazo.puntos.map(p => {
                    const { x, y } = mmAPx(p.u, p.v)
                    return <circle key={p.id} cx={x} cy={y} r={4} fill={puntoEditandoId === p.id ? '#ef4444' : COLOR_TIPO[planoActivo.tipo]} />
                  })}
                </g>
              ))}
            </svg>
            <p style={{ fontSize: '11px', color: '#94a3b8', margin: '8px 0 0 0' }}>
              Grilla cada {paso}mm (se ajusta con el zoom) · snap a 1mm. Clic = punto · clic derecho + arrastrar = mover la vista · rueda = zoom.
            </p>

            {/* Punto exacto por teclado */}
            <div style={{ marginTop: '10px', display: 'flex', gap: '8px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div>
                <label style={labelStyle}>u exacto (mm)</label>
                <input value={uExacto} onChange={e => setUExacto(e.target.value)} style={{ ...inputStyle, width: '80px' }} placeholder="ej. 764" />
              </div>
              <div>
                <label style={labelStyle}>v exacto (mm)</label>
                <input value={vExacto} onChange={e => setVExacto(e.target.value)} style={{ ...inputStyle, width: '80px' }} placeholder="ej. 1200" />
              </div>
              <button onClick={agregarPuntoExacto} style={{ ...btnMini, backgroundColor: '#0f3460', color: 'white', border: 'none' }}>+ Punto exacto</button>
            </div>

            {/* Punto por longitud + ángulo (diagonales) */}
            <div style={{ marginTop: '8px', display: 'flex', gap: '8px', alignItems: 'flex-end', flexWrap: 'wrap', opacity: puntoAnterior ? 1 : 0.4 }}>
              <div>
                <label style={labelStyle}>longitud (mm)</label>
                <input value={largoPolar} onChange={e => setLargoPolar(e.target.value)} disabled={!puntoAnterior} style={{ ...inputStyle, width: '80px' }} placeholder="ej. 650" />
              </div>
              <div>
                <label style={labelStyle}>ángulo (°, 0°=derecha, 90°=arriba)</label>
                <input value={anguloPolar} onChange={e => setAnguloPolar(e.target.value)} disabled={!puntoAnterior} style={{ ...inputStyle, width: '110px' }} placeholder="ej. 35" />
              </div>
              <button onClick={agregarPuntoPolar} disabled={!puntoAnterior} style={{ ...btnMini, backgroundColor: puntoAnterior ? '#087e0b' : '#eee', color: puntoAnterior ? 'white' : '#aaa', border: 'none' }}>
                ↗ Punto diagonal (largo + ángulo)
              </button>
              {!puntoAnterior && <span style={{ fontSize: '10px', color: '#aaa' }}>Agrega o selecciona un trazo con al menos un punto primero</span>}
            </div>
          </div>

          <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', height: '420px' }}>
            <div ref={mountRef} style={{ width: '100%', height: '100%', borderRadius: '8px', overflow: 'hidden' }} />
          </div>
        </div>

        {/* ===== Columna derecha: lista de trazos/puntos ===== */}
        <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', maxHeight: '80vh', overflowY: 'auto' }}>
          <h2 style={{ fontSize: '14px', margin: '0 0 10px 0' }}>Trazos de "{planoActivo.nombre}"</h2>
          {planoActivo.trazos.length === 0 && (
            <p style={{ fontSize: '12px', color: '#bbb' }}>Sin trazos aún. Haz clic en el lienzo para empezar.</p>
          )}
          {planoActivo.trazos.map((trazo, ti) => (
            <div key={trazo.id} style={{ marginBottom: '12px', padding: '8px', backgroundColor: '#f9fafb', borderRadius: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <strong style={{ fontSize: '12px' }}>Trazo {ti + 1} {trazo.id === trazoActivoId && '(dibujando)'}</strong>
                <button onClick={() => eliminarTrazo(planoActivo.id, trazo.id)} style={{ border: 'none', background: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '12px' }}>eliminar</button>
              </div>
              {trazo.puntos.map((p, pi) => {
                const esquina = pi > 0 && pi < trazo.puntos.length - 1
                  ? anguloEsquina(trazo.puntos[pi - 1], p, trazo.puntos[pi + 1])
                  : null
                return (
                  <div key={p.id} style={{ marginBottom: '6px' }}>
                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                      <span style={{ fontSize: '10px', color: '#888', width: '14px' }}>P{pi + 1}</span>
                      <input
                        type="number" step={1} value={p.u}
                        onChange={e => editarPunto(planoActivo.id, trazo.id, p.id, Math.round(Number(e.target.value)), p.v)}
                        onFocus={() => setPuntoEditandoId(p.id)} onBlur={() => setPuntoEditandoId(null)}
                        style={{ ...inputStyle, width: '54px', padding: '4px 6px', fontSize: '11px' }}
                      />
                      <input
                        type="number" step={1} value={p.v}
                        onChange={e => editarPunto(planoActivo.id, trazo.id, p.id, p.u, Math.round(Number(e.target.value)))}
                        onFocus={() => setPuntoEditandoId(p.id)} onBlur={() => setPuntoEditandoId(null)}
                        style={{ ...inputStyle, width: '54px', padding: '4px 6px', fontSize: '11px' }}
                      />
                      <button onClick={() => eliminarPunto(planoActivo.id, trazo.id, p.id)} style={{ border: 'none', background: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '11px', marginLeft: 'auto' }}>✕</button>
                    </div>
                    {pi > 0 && (
                      <div style={{ fontSize: '10px', color: '#666', marginLeft: '18px' }}>
                        segmento: {distanciaMm(trazo.puntos[pi - 1], p).toFixed(0)}mm · ángulo {anguloSegmentoDeg(trazo.puntos[pi - 1], p).toFixed(1)}°
                      </div>
                    )}
                    {pi > 0 && (() => {
                      const idxBarra = pi - 1
                      const barra = trazo.barras[idxBarra]
                      const perfilSel = perfilDe(barra?.codigoAcero ?? null)
                      return (
                        <div style={{ marginLeft: '18px', marginTop: '3px', display: 'flex', gap: '4px', alignItems: 'center', flexWrap: 'wrap' }}>
                          <select
                            value={barra?.codigoAcero ?? ''}
                            onChange={e => actualizarBarra(planoActivo.id, trazo.id, idxBarra, { codigoAcero: e.target.value || null })}
                            style={{ ...inputStyle, width: 'auto', maxWidth: '150px', padding: '3px 5px', fontSize: '10px' }}
                          >
                            <option value="">— sin perfil —</option>
                            {perfiles.map(pf => (
                              <option key={pf.codigo_acero} value={pf.codigo_acero}>
                                {pf.codigo_acero} · {pf.aceros?.detalle || pf.tipo_perfil}
                              </option>
                            ))}
                          </select>
                          {esAsimetrico(perfilSel?.tipo_perfil) && (
                            <>
                              <input
                                type="number" step={1} value={barra?.rotacionDeg ?? 0}
                                onChange={e => actualizarBarra(planoActivo.id, trazo.id, idxBarra, { rotacionDeg: Number(e.target.value) })}
                                style={{ ...inputStyle, width: '48px', padding: '3px 5px', fontSize: '10px' }}
                              />
                              <span style={{ fontSize: '9px', color: '#999' }}>° giro</span>
                            </>
                          )}
                        </div>
                      )
                    })()}
                    {esquina && (
                      <div style={{ fontSize: '10px', color: '#d97706', marginLeft: '18px', fontWeight: 500 }}>
                        ⊿ esquina {esquina.interiorDeg.toFixed(1)}° → inglete {esquina.ingleteDeg.toFixed(1)}° por barra
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  padding: '6px 8px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '12px', width: '100%', boxSizing: 'border-box',
}
const labelStyle: React.CSSProperties = { fontSize: '10px', color: '#888', display: 'block', marginBottom: '2px' }
const btnMini: React.CSSProperties = {
  padding: '6px 10px', backgroundColor: 'white', border: '1px solid #ddd', borderRadius: '6px', cursor: 'pointer', fontSize: '11px',
}
