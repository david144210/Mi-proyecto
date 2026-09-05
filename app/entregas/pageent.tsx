'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

// ── Tipos ─────────────────────────────────────────────────────
interface Pedido {
  id: number
  cod_venta: number
  cliente: string
  fecha_entrega: string | null
  estado: number
  total_venta?: number
}

// ── Página ────────────────────────────────────────────────────
export default function EntregasPage() {

  const [usuario, setUsuario] = useState<any>(null)
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [loading, setLoading] = useState(true)
  const [actualizando, setActualizando] = useState<number | null>(null)

  // ── Seguridad ───────────────────────────────────────────────
  useEffect(() => {

    const verificarUsuario = async () => {

      const carnetGuardado = localStorage.getItem('carnet')

      if (!carnetGuardado) {
        window.location.replace('/')
        return
      }

      const { data, error } = await supabase
        .from('personal')
        .select(`
          *,
          cargos(*)
        `)
        .eq('carnet', carnetGuardado)
        .eq('estado', true)
        .single()

      if (error || !data) {
        window.location.replace('/')
        return
      }

      // VALIDAR PERMISO
      const puedeVer =
        data?.cargos?.puede_ver_entregas === true ||
        data?.cargos?.puede_ver_entregas === 1

      if (!puedeVer) {
        alert('No tienes permisos para acceder')
        window.location.replace('/sistema')
        return
      }

      setUsuario(data)

      cargarPedidos()
    }

    verificarUsuario()

  }, [])

  // ── Auto refresh ────────────────────────────────────────────
  useEffect(() => {

    const intervalo = setInterval(() => {
      cargarPedidos()
    }, 30000)

    return () => clearInterval(intervalo)

  }, [])

  // ── Cargar pedidos ──────────────────────────────────────────
  const cargarPedidos = async () => {

    try {

      setLoading(true)

      // SOLO ESTADO 3
      const { data: ventasData, error } = await supabase
        .from('ventas')
        .select('*')
        .eq('estado', 3)
        .order('fecha_entrega', { ascending: true })

      if (error) throw error

      // CLIENTES
      const clientesIds = ventasData
        ?.map(v => v.cod_cliente)
        .filter(Boolean) || []

      const { data: clientesData } = await supabase
        .from('clientes')
        .select('id, nombre')
        .in('id', clientesIds)

      const clientesMap = Object.fromEntries(
        clientesData?.map(c => [c.id, c.nombre]) || []
      )

      // PEDIDOS
      const pedidosProcesados = ventasData.map((venta: any) => ({
        id: venta.id,
        cod_venta: venta.cod_venta,
        cliente: clientesMap[venta.cod_cliente] || 'Sin cliente',
        fecha_entrega: venta.fecha_entrega,
        estado: venta.estado,
        total_venta: venta.total_venta
      }))

      setPedidos(pedidosProcesados)

    } catch (error) {

      console.error(error)
      alert('Error cargando pedidos')

    } finally {

      setLoading(false)

    }
  }

  // ── Cambiar estado ──────────────────────────────────────────
  const marcarDespachado = async (pedido: Pedido) => {

    const confirmar = confirm(
      `¿Marcar pedido #${pedido.cod_venta} como DESPACHADO?`
    )

    if (!confirmar) return

    try {

      setActualizando(pedido.id)

      const { error } = await supabase
        .from('ventas')
        .update({
          estado: 4
        })
        .eq('id', pedido.id)

      if (error) throw error

      // REFRESH
      await cargarPedidos()

    } catch (error) {

      console.error(error)
      alert('Error actualizando pedido')

    } finally {

      setActualizando(null)

    }
  }

  // ── Loading ─────────────────────────────────────────────────
  if (loading) {

    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          fontFamily: 'Arial'
        }}
      >
        Cargando entregas...
      </div>
    )
  }

  // ── Render ──────────────────────────────────────────────────
  return (

    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#f5f5f5',
        fontFamily: 'Arial, sans-serif'
      }}
    >

      {/* NAVBAR */}
      <nav
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '15px 25px',
          backgroundColor: '#222',
          color: 'white',
          flexWrap: 'wrap',
          gap: '10px'
        }}
      >

        <a
          href="/sistema"
          style={{
            color: 'white',
            textDecoration: 'none',
            fontWeight: 'bold',
            fontSize: '18px'
          }}
        >
          ← Sistema
        </a>

        <div
          style={{
            fontWeight: 'bold',
            color: '#90caf9'
          }}
        >
          🚚 Panel de Entregas
        </div>

        <div style={{ fontSize: '14px' }}>
          {usuario?.usuario || usuario?.nombre || 'Usuario'}
        </div>

      </nav>

      {/* CONTENIDO */}
      <div
        style={{
          padding: '25px',
          maxWidth: '1200px',
          margin: '0 auto'
        }}
      >

        {/* HEADER */}
        <div
          style={{
            marginBottom: '25px'
          }}
        >

          <h1
            style={{
              margin: 0,
              marginBottom: '8px'
            }}
          >
            Pedidos Terminados
          </h1>

          <p
            style={{
              color: '#666',
              margin: 0
            }}
          >
            Aquí puedes marcar pedidos como despachados
          </p>

        </div>

        {/* SIN PEDIDOS */}
        {pedidos.length === 0 && (

          <div
            style={{
              backgroundColor: 'white',
              padding: '40px',
              borderRadius: '20px',
              textAlign: 'center',
              color: '#777'
            }}
          >
            No hay pedidos pendientes para despacho
          </div>

        )}

        {/* LISTADO */}
        <div
          style={{
            display: 'grid',
            gap: '18px'
          }}
        >

          {pedidos.map((pedido) => (

            <div
              key={pedido.id}
              style={{
                backgroundColor: 'white',
                borderRadius: '20px',
                padding: '20px',
                boxShadow: '0 2px 10px rgba(0,0,0,0.06)'
              }}
            >

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: '20px',
                  flexWrap: 'wrap'
                }}
              >

                {/* INFO */}
                <div
                  style={{
                    flex: 1,
                    minWidth: '250px'
                  }}
                >

                  <div
                    style={{
                      fontSize: '20px',
                      fontWeight: 'bold',
                      marginBottom: '10px'
                    }}
                  >
                    Pedido #{pedido.cod_venta}
                  </div>

                  <div
                    style={{
                      marginBottom: '8px',
                      color: '#444'
                    }}
                  >
                    👤 {pedido.cliente}
                  </div>

                  <div
                    style={{
                      marginBottom: '8px',
                      color: '#444'
                    }}
                  >
                    📅 {pedido.fecha_entrega || 'Sin fecha'}
                  </div>

                  <div
                    style={{
                      color: '#2e7d32',
                      fontWeight: 'bold'
                    }}
                  >
                    ✅ Terminado
                  </div>

                </div>

                {/* BOTÓN */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center'
                  }}
                >

                  <button
                    onClick={() => marcarDespachado(pedido)}
                    disabled={actualizando === pedido.id}
                    style={{
                      border: 'none',
                      backgroundColor:
                        actualizando === pedido.id
                          ? '#999'
                          : '#1976d2',
                      color: 'white',
                      padding: '14px 22px',
                      borderRadius: '12px',
                      cursor: 'pointer',
                      fontWeight: 'bold',
                      minWidth: '180px'
                    }}
                  >

                    {actualizando === pedido.id
                      ? 'Actualizando...'
                      : '🚚 Marcar Despachado'}

                  </button>

                </div>

              </div>

            </div>

          ))}

        </div>

      </div>

    </div>
  )
}