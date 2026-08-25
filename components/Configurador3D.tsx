'use client'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

interface SeccionData {
  id: number
  tipo: string
  alturaCm: number
}

interface ColumnaData {
  id: number
  anchoCm: number
  secciones: SeccionData[]
}

interface Configurador3DProps {
  columnas: ColumnaData[]
  onSelectSeccion: (data: { colId: number; secId: number }) => void
}

export const Configurador3D = ({ columnas, onSelectSeccion }: Configurador3DProps) => {
  const mountRef = useRef<HTMLDivElement>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const muebleGroupRef = useRef<THREE.Group | null>(null)
  
  const raycaster = new THREE.Raycaster()
  const mouse = new THREE.Vector2()

  useEffect(() => {
    if (!mountRef.current) return

    const width = mountRef.current.clientWidth || 800
    const height = mountRef.current.clientHeight || 600

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0xf4f6f9) // Fondo minimalista limpio

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 500)
    camera.position.set(3.5, 2.8, 5.5)
    cameraRef.current = camera

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(width, height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    mountRef.current.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(0, 1, 0)
    controls.enableDamping = true

    const grupo = new THREE.Group()
    scene.add(grupo)
    muebleGroupRef.current = grupo

    // Luces suaves estilo estudio
    scene.add(new THREE.AmbientLight(0xffffff, 0.9))
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8)
    dirLight.position.set(4, 8, 5)
    scene.add(dirLight)

    // Suelo estético sutil
    const piso = new THREE.Mesh(
      new THREE.PlaneGeometry(15, 15),
      new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.9 })
    )
    piso.rotation.x = -Math.PI / 2
    scene.add(piso)

    let frameId: number
    const animate = () => {
      frameId = requestAnimationFrame(animate)
      controls.update()
      renderer.render(scene, camera)
    }
    animate()

    const currentMount = mountRef.current
    const handleMouseClick = (event: MouseEvent) => {
      if (!currentMount || !cameraRef.current || !muebleGroupRef.current) return
      const rect = currentMount.getBoundingClientRect()
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

      raycaster.setFromCamera(mouse, cameraRef.current)
      const intersects = raycaster.intersectObjects(muebleGroupRef.current.children, true)

      if (intersects.length > 0) {
        let obj: any = intersects[0].object
        while (obj && !obj.userData?.seccion && obj.parent) {
          obj = obj.parent
        }
        if (obj?.userData?.seccion) {
          onSelectSeccion(obj.userData.seccion)
        }
      }
    }

    currentMount.addEventListener('click', handleMouseClick)

    const handleResize = () => {
      if (!mountRef.current) return
      const w = mountRef.current.clientWidth
      const h = mountRef.current.clientHeight
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }
    window.addEventListener('resize', handleResize)

    return () => {
      cancelAnimationFrame(frameId)
      window.removeEventListener('resize', handleResize)
      currentMount.removeEventListener('click', handleMouseClick)
      renderer.dispose()
      if (currentMount.contains(renderer.domElement)) {
        currentMount.removeChild(renderer.domElement)
      }
    }
  }, [])

  // Renderizado dinámico limpio (Tipo Bloques de Juego / Diseño Minimalista)
  useEffect(() => {
    const grupo = muebleGroupRef.current
    if (!grupo) return

    while (grupo.children.length > 0) {
      const child = grupo.children[0] as THREE.Mesh
      if (child.geometry) child.geometry.dispose()
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach(m => m.dispose())
        else child.material.dispose()
      }
      grupo.remove(child)
    }

    const totalAnchoCm = columnas.reduce((acc, col) => acc + col.anchoCm, 0)
    let maxAltoCm = 0
    columnas.forEach(col => {
      const hCol = col.secciones.reduce((acc, s) => acc + s.alturaCm, 0)
      if (hCol > maxAltoCm) maxAltoCm = hCol
    })

    const SC = 1 / 35 // Escala visual agradable
    const anchoTotal = totalAnchoCm * SC
    let cursorX = -anchoTotal / 2

    columnas.forEach((col) => {
      const colAncho = col.anchoCm * SC
      let cursorY = 0

      col.secciones.forEach((sec) => {
        const secAlto = Math.max(sec.alturaCm * SC, 0.4)
        const centroX = cursorX + colAncho / 2
        const centroY = cursorY + secAlto / 2

        // Paleta de colores atractiva según tipo de sección
        let colorHex = 0xffffff // Espacio abierto
        let roughnessVal = 0.5

        if (sec.tipo === 'cajon') {
          colorHex = 0xd4af37 // Dorado elegante (MuebLess is Better)
          roughnessVal = 0.3
        } else if (sec.tipo === 'puerta') {
          colorHex = 0x0f3460 // Azul oscuro corporativo
          roughnessVal = 0.4
        } else if (sec.tipo === 'repisa') {
          colorHex = 0xe5e7eb // Gris claro madera/melamina
          roughnessVal = 0.6
        }

        const geometry = new THREE.BoxGeometry(colAncho - 0.02, secAlto - 0.02, 0.5)
        const material = new THREE.MeshStandardMaterial({ 
          color: colorHex, 
          roughness: roughnessVal,
          transparent: sec.tipo === 'espacio',
          opacity: sec.tipo === 'espacio' ? 0.35 : 1.0 
        })

        const mesh = new THREE.Mesh(geometry, material)
        mesh.position.set(centroX, centroY, 0)
        mesh.userData = { seccion: { colId: col.id, secId: sec.id } }

        // Líneas de contorno sutiles estilo CAD limpio / Vectorial
        const edges = new THREE.LineSegments(
          new THREE.EdgesGeometry(geometry),
          new THREE.LineBasicMaterial({ color: 0x111111, linewidth: 1 })
        )
        mesh.add(edges)

        grupo.add(mesh)
        cursorY += secAlto
      })

      cursorX += colAncho
    })
  }, [columnas])

  return <div ref={mountRef} style={{ width: '100%', height: '100%', display: 'block' }} />
}