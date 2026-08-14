'use client'
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

type EstiloEscenario = 'minimalista' | 'loft' | 'lujo'

export default function VisorIA() {
  const mountRef = useRef<HTMLDivElement>(null)
  const [escenario, setEscenario] = useState<EstiloEscenario>('minimalista')
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const sceneRef = useRef<THREE.Scene | null>(null)
  const pisoRef = useRef<THREE.Mesh | null>(null)
  const paredFondoRef = useRef<THREE.Mesh | null>(null)
  const paredLateralRef = useRef<THREE.Mesh | null>(null)

  // Cambiar los materiales de la escenografía según el estilo de IA elegido
  const cambiarEscenarioEstilo = (tipo: EstiloEscenario) => {
    setEscenario(tipo)
    if (!sceneRef.current || !pisoRef.current || !paredFondoRef.current || !paredLateralRef.current) return

    const matPiso = pisoRef.current.material as THREE.MeshStandardMaterial
    const matParedFondo = paredFondoRef.current.material as THREE.MeshStandardMaterial
    const matParedLateral = paredLateralRef.current.material as THREE.MeshStandardMaterial

    if (tipo === 'minimalista') {
      sceneRef.current.background = new THREE.Color(0xf0f2f5)
      matPiso.color.setHex(0xe2e5e9)
      matPiso.roughness = 0.4
      matParedFondo.color.setHex(0xf7f8fa)
      matParedLateral.color.setHex(0xf2f4f7)
    } else if (tipo === 'loft') {
      sceneRef.current.background = new THREE.Color(0x1e1e22)
      matPiso.color.setHex(0x3a3835) // Concreto pulido / cemento alisado
      matPiso.roughness = 0.6
      matParedFondo.color.setHex(0x2c2c30) // Ladrillo o pared oscura industrial
      matParedLateral.color.setHex(0x252528)
    } else if (tipo === 'lujo') {
      sceneRef.current.background = new THREE.Color(0x181513)
      matPiso.color.setHex(0x4a3b32) // Madera oscura de alta gama
      matPiso.roughness = 0.35
      matParedFondo.color.setHex(0x2d2621) // Pared tonos tierra / elegantes
      matParedLateral.color.setHex(0x241f1b)
    }
  }

  useEffect(() => {
    if (!mountRef.current) return

    const width = mountRef.current.clientWidth || window.innerWidth
    const height = mountRef.current.clientHeight || window.innerHeight

    // 1. Escena, Cámara y Renderer
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0xf0f2f5)
    sceneRef.current = scene

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 1000)
    camera.position.set(3.5, 2.2, 4.5)

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(width, height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.1
    mountRef.current.appendChild(renderer.domElement)

    // 2. Controles de órbita (limitados para no salir de la habitación)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(0, 1, 0)
    controls.enableDamping = true
    controls.dampingFactor = 0.05
    controls.maxPolarAngle = Math.PI / 2 - 0.02 // No permitir ver debajo del suelo
    controls.minDistance = 1.5
    controls.maxDistance = 10

    // 3. Iluminación realista estilo render arquitectónico
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.9)
    scene.add(ambientLight)

    // Luz principal de ventana / sol simulado
    const sunLight = new THREE.DirectionalLight(0xfffaed, 1.6)
    sunLight.position.set(5, 6, 4)
    sunLight.castShadow = true
    sunLight.shadow.mapSize.width = 2048
    sunLight.shadow.mapSize.height = 2048
    sunLight.shadow.bias = -0.0001
    sunLight.shadow.camera.near = 0.5
    sunLight.shadow.camera.far = 20
    sunLight.shadow.camera.left = -4
    sunLight.shadow.camera.right = 4
    sunLight.shadow.camera.top = 4
    sunLight.shadow.camera.bottom = -4
    scene.add(sunLight)

    // Luz de relleno ambiental lateral
    const fillLight = new THREE.DirectionalLight(0xddeeff, 0.5)
    fillLight.position.set(-5, 3, -2)
    scene.add(fillLight)

    // 4. Construcción de la Escenografía de la Habitación (Piso + 2 Paredes)
    const roomSize = 10
    const roomHeight = 5

    // Piso
    const pisoGeo = new THREE.PlaneGeometry(roomSize, roomSize)
    const pisoMat = new THREE.MeshStandardMaterial({ color: 0xe2e5e9, roughness: 0.4 })
    const piso = new THREE.Mesh(pisoGeo, pisoMat)
    piso.rotation.x = -Math.PI / 2
    piso.receiveShadow = true
    scene.add(piso)
    pisoRef.current = piso

    // Pared trasera
    const paredFondoGeo = new THREE.PlaneGeometry(roomSize, roomHeight)
    const paredFondoMat = new THREE.MeshStandardMaterial({ color: 0xf7f8fa, roughness: 0.9 })
    const paredFondo = new THREE.Mesh(paredFondoGeo, paredFondoMat)
    paredFondo.position.set(0, roomHeight / 2, -roomSize / 2)
    paredFondo.receiveShadow = true
    scene.add(paredFondo)
    paredFondoRef.current = paredFondo

    // Pared lateral izquierda
    const paredLateralGeo = new THREE.PlaneGeometry(roomSize, roomHeight)
    const paredLateralMat = new THREE.MeshStandardMaterial({ color: 0xf2f4f7, roughness: 0.9 })
    const paredLateral = new THREE.Mesh(paredLateralGeo, paredLateralMat)
    paredLateral.rotation.y = Math.PI / 2
    paredLateral.position.set(-roomSize / 2, roomHeight / 2, 0)
    paredLateral.receiveShadow = true
    scene.add(paredLateral)
    paredLateralRef.current = paredLateral

    // Zócalos / Rodapiés decorativos para realismo arquitectónico
    const zocaloMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 })
    const zocaloFondo = new THREE.Mesh(new THREE.BoxGeometry(roomSize, 0.1, 0.05), zocaloMat)
    zocaloFondo.position.set(0, 0.05, -roomSize / 2 + 0.025)
    scene.add(zocaloFondo)

    const zocaloLateral = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.1, roomSize), zocaloMat)
    zocaloLateral.position.set(-roomSize / 2 + 0.025, 0.05, 0)
    scene.add(zocaloLateral)

    // 5. Cargar el Mueble desde localStorage (Base64)
    const base64Data = localStorage.getItem('mueble_glb_base64')
    if (!base64Data) {
      setError('No se encontró ningún diseño 3D guardado. Vuelve al diseñador y haz clic en "Ver en Escenario IA".')
      setCargando(false)
    } else {
      const loader = new GLTFLoader()
      loader.parse(
        dataURIToArrayBuffer(base64Data),
        '',
        (gltf) => {
          const model = gltf.scene
          
          // Centrar y posicionar perfectamente apoyado contra la pared trasera y el suelo
          const box = new THREE.Box3().setFromObject(model)
          const center = box.getCenter(new THREE.Vector3())
          const size = box.getSize(new THREE.Vector3())

          model.position.x -= center.x
          model.position.y -= box.min.y // Apoyar sobre y = 0
          model.position.z = -roomSize / 2 + size.z / 2 + 0.1 // Acomodar junto a la pared trasera

          model.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              child.castShadow = true
              child.receiveShadow = true
            }
          })

          scene.add(model)
          setCargando(false)
        },
        (err) => {
          console.error(err)
          setError('Error al decodificar el modelo 3D.')
          setCargando(false)
        }
      )
    }

    // Loop de animación
    let frameId: number
    const animate = () => {
      frameId = requestAnimationFrame(animate)
      controls.update()
      renderer.render(scene, camera)
    }
    animate()

    // Responsivo al redimensionar ventana
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
      renderer.dispose()
      if (mountRef.current && renderer.domElement.parentNode === mountRef.current) {
        mountRef.current.removeChild(renderer.domElement)
      }
    }
  }, [])

  function dataURIToArrayBuffer(dataURI: string) {
    const byteString = atob(dataURI.split(',')[1])
    const ab = new ArrayBuffer(byteString.length)
    const ia = new Uint8Array(ab)
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i)
    }
    return ab
  }

  return (
    <div style={{ width: '100vw', height: '100vh', margin: 0, overflow: 'hidden', fontFamily: 'Arial, sans-serif', backgroundColor: '#111' }}>
      
      {/* HUD / Controles superiores */}
      <div style={{
        position: 'absolute', top: 20, left: 20, zIndex: 10,
        display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap'
      }}>
        <a href="/diseno" style={{
          backgroundColor: 'white', color: '#0f3460', padding: '10px 18px',
          borderRadius: '10px', textDecoration: 'none', fontWeight: 'bold', fontSize: '13px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
        }}>
          ← Volver al Diseñador
        </a>

        <div style={{
          backgroundColor: 'rgba(255, 255, 255, 0.9)', backdropFilter: 'blur(8px)',
          padding: '8px 14px', borderRadius: '10px', display: 'flex', gap: '8px', alignItems: 'center',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
        }}>
          <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#444' }}>Escenografía IA:</span>
          <button onClick={() => cambiarEscenarioEstilo('minimalista')} style={btnAmbiente(escenario === 'minimalista')}>Minimalista</button>
          <button onClick={() => cambiarEscenarioEstilo('loft')} style={btnAmbiente(escenario === 'loft')}>Loft Industrial</button>
          <button onClick={() => cambiarEscenarioEstilo('lujo')} style={btnAmbiente(escenario === 'lujo')}>Sala de Lujo</button>
        </div>
      </div>

      {/* Pantalla de carga */}
      {cargando && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(15, 52, 96, 0.85)',
          color: 'white', zIndex: 20, gap: '12px'
        }}>
          <div style={{ fontSize: '24px', fontWeight: 'bold' }}>🤖 Montando escenografía 3D...</div>
          <p style={{ fontSize: '14px', color: '#d4af37' }}>Integrando tu mueble en el ambiente arquitectónico</p>
        </div>
      )}

      {error && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          justifyContent: 'center', alignItems: 'center', backgroundColor: '#1a1a2e',
          color: 'white', zIndex: 20, padding: '20px', textAlign: 'center', gap: '16px'
        }}>
          <h2 style={{ color: '#ff6b6b', margin: 0 }}>⚠️ Aviso importante</h2>
          <p style={{ fontSize: '15px', maxWidth: '400px' }}>{error}</p>
          <a href="/diseno" style={{ backgroundColor: '#d4af37', color: '#0f3460', padding: '10px 20px', borderRadius: '8px', textDecoration: 'none', fontWeight: 'bold' }}>
            Ir al Diseñador 3D
          </a>
        </div>
      )}

      {/* Contenedor WebGL */}
      <div ref={mountRef} style={{ width: '100%', height: '100%' }} />
    </div>
  )
}

const btnAmbiente = (activo: boolean): React.CSSProperties => ({
  padding: '6px 12px',
  borderRadius: '6px',
  border: 'none',
  fontSize: '12px',
  fontWeight: 'bold',
  cursor: 'pointer',
  backgroundColor: activo ? '#0f3460' : '#e0e0e0',
  color: activo ? 'white' : '#333',
  transition: 'all 0.2s',
})