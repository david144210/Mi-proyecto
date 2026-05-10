'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'

// ── Tipos ────────────────────────────────────────────────────────────────────
interface VentaResumen {
  id: number
  cod_venta: number
  cod_cliente: number | null
  fecha_pedido: string | null
  total_venta: number | null
  estado: number | null
  nombre_cliente?: string
}

export default function AnularVentaPage() {
  const [usuario, setUsuario] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [accesoDenegado, setAccesoDenegado] = useState(false)

  // Buscador y Resultado
  const [busqueda, setBusqueda] = useState('')
  const [venta, setVenta] = useState<VentaResumen | null>(null)
  const [buscando, setBuscando] = useState(false)
  
  // Acciones
  const [procesando, setProcesando] = useState(false)
  const [mensaje, setMensaje] = useState({ texto: '', tipo: '' }) // tipo: 'error' | 'exito'

  // ── Auth & Permisos (Solo Admin) ──────────────────────────────────────────
  useEffect(() => {
    const carnet = localStorage.getItem('carnet')
    if (!carnet) { window.location.replace('/'); return }
    
    supabase.from('personal').select('*, cargos(*)')
      .eq('carnet', carnet).eq('estado', true).single()
      .then(({ data }) => {
        if (!data) { window.location.replace('/'); return }
        setUsuario(data)
        // REGLA: Solo acceso si es_admin es true
        if (!data?.cargos?.es_admin) {
          setAccesoDenegado(true)
        }
        setLoading(false)
      })
  }, [])

  // ── Buscar Venta ──────────────────────────────────────────────────────────
const buscarVenta = async (e?: React.FormEvent) => {
  if (e) e.preventDefault();
  if (!busqueda) return;

  setBuscando(true);
  setVenta(null);
  setMensaje({ texto: '', tipo: '' });

  try {
    // 1. Búsqueda de la venta
    const { data: ventaData, error: ventaError } = await supabase
      .from('ventas')
      .select('*')
      .eq('cod_venta', parseInt(busqueda))
      .maybeSingle(); // Usamos maybeSingle para evitar errores si no hay resultados

    if (ventaError) {
      console.error("Error Supabase:", ventaError);
      setMensaje({ texto: 'Error de conexión: ' + ventaError.message, tipo: 'error' });
      setBuscando(false);
      return;
    }

    if (!ventaData) {
      setMensaje({ texto: `El pedido #${busqueda} no existe en la base de datos.`, tipo: 'error' });
      setBuscando(false);
      return;
    }

    // 2. Obtener nombre del cliente usando el ID (cod_cliente)
    let nombreCli = 'Cliente no asignado';
    if (ventaData.cod_cliente) {
      const { data: clienteData } = await supabase
        .from('clientes')
        .select('nombre')
        .eq('id', ventaData.cod_cliente) // Usamos 'id' asumiendo que es la PK de clientes
        .maybeSingle();
      
      if (clienteData) nombreCli = clienteData.nombre;
    }

    setVenta({
      ...ventaData,
      nombre_cliente: nombreCli
    });

  } catch (err) {
    setMensaje({ texto: 'Error inesperado en el sistema.', tipo: 'error' });
  } finally {
    setBuscando(false);
  }
};

  // ── Anular Venta ──────────────────────────────────────────────────────────
  const confirmarAnulacion = async () => {
    if (!venta) return
    const confirmar = window.confirm(`¿Estás seguro de que deseas ANULAR la venta #${venta.cod_venta}? Esta acción no se puede deshacer.`)
    if (!confirmar) return

    setProcesando(true)
    try {
      const { error } = await supabase
        .from('ventas')
        .update({ estado: 0 }) // Estado 0 = Anulado
        .eq('cod_venta', venta.cod_venta)

      if (error) throw error

      setMensaje({ texto: `Venta #${venta.cod_venta} anulada correctamente.`, tipo: 'exito' })
      setVenta(prev => prev ? { ...prev, estado: 0 } : null)
    } catch (err: any) {
      setMensaje({ texto: 'Error al anular: ' + err.message, tipo: 'error' })
    } finally {
      setProcesando(false)
    }
  }

  // ── Renderizado Condicional ───────────────────────────────────────────────
  if (loading) return <p style={{ textAlign: 'center', marginTop: '100px', fontFamily: 'Arial' }}>Verificando credenciales...</p>

  if (accesoDenegado) return (
    <div style={{ fontFamily: 'Arial, sans-serif', minHeight: '100vh', backgroundColor: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', backgroundColor: 'white', borderRadius: '16px', padding: '48px', boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>🚫</div>
        <h2 style={{ margin: '0 0 8px' }}>Acceso restringido</h2>
        <p style={{ color: '#888', margin: '0 0 24px' }}>Solo los administradores pueden anular pedidos.</p>
        <a href="/sistema" style={{ backgroundColor: '#222', color: 'white', padding: '10px 24px', borderRadius: '8px', textDecoration: 'none', fontSize: '14px' }}>Volver</a>
      </div>
    </div>
  )

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', minHeight: '100vh', backgroundColor: '#f5f5f5' }}>
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 40px', backgroundColor: '#b71c1c', color: 'white', position: 'sticky', top: 0, zIndex: 100 }}>
        <a href="/sistema" style={{ fontWeight: 'bold', fontSize: '20px', color: 'white', textDecoration: 'none' }}>Muebles is Better</a>
        <span style={{ fontWeight: 'bold' }}>⚠️ Panel de Anulación (Admin)</span>
        <span style={{ fontSize: '14px' }}>{usuario?.nombre || 'Admin'} 👤</span>
      </nav>

      <div style={{ padding: '40px', maxWidth: '600px', margin: '0 auto' }}>
        <div style={{ backgroundColor: 'white', borderRadius: '16px', padding: '30px', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
          <h2 style={{ margin: '0 0 20px', fontSize: '22px' }}>Anular Pedido</h2>
          
          <form onSubmit={buscarVenta} style={{ marginBottom: '24px' }}>
            <label style={{ fontSize: '12px', color: '#666', display: 'block', marginBottom: '8px' }}>Ingresa el Código de Venta</label>
            <div style={{ display: 'flex', gap: '10px' }}>
              <input 
                type="number" 
                placeholder="Ej: 26250" 
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '16px' }}
              />
              <button 
                type="submit" 
                disabled={buscando}
                style={{ backgroundColor: '#222', color: 'white', border: 'none', borderRadius: '8px', padding: '0 20px', cursor: 'pointer', fontWeight: 'bold' }}
              >
                {buscando ? '...' : 'Buscar'}
              </button>
            </div>
          </form>

          {mensaje.texto && (
            <div style={{ 
              padding: '14px', 
              borderRadius: '8px', 
              marginBottom: '20px', 
              fontSize: '14px',
              backgroundColor: mensaje.tipo === 'error' ? '#ffebee' : '#e8f5e9',
              color: mensaje.tipo === 'error' ? '#c62828' : '#2e7d32',
              border: `1px solid ${mensaje.tipo === 'error' ? '#ef9a9a' : '#a5d6a7'}`
            }}>
              {mensaje.tipo === 'error' ? '❌ ' : '✅ '} {mensaje.texto}
            </div>
          )}

          {venta && (
            <div style={{ border: '1px solid #eee', borderRadius: '12px', padding: '20px', backgroundColor: '#fafafa' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px' }}>
                <span style={{ fontSize: '12px', color: '#888', textTransform: 'uppercase' }}>Detalles del Pedido</span>
                <span style={{ 
                  fontSize: '11px', 
                  fontWeight: 'bold', 
                  padding: '3px 8px', 
                  borderRadius: '6px',
                  backgroundColor: venta.estado === 0 ? '#eceff1' : '#e3f2fd',
                  color: venta.estado === 0 ? '#546e7a' : '#1565c0'
                }}>
                  {venta.estado === 0 ? 'ANULADO' : 'ACTIVO'}
                </span>
              </div>
              
              <div style={{ marginBottom: '8px' }}><strong>Venta:</strong> #{venta.cod_venta}</div>
              <div style={{ marginBottom: '8px' }}><strong>Cliente:</strong> {venta.nombre_cliente}</div>
              <div style={{ marginBottom: '8px' }}><strong>Fecha:</strong> {venta.fecha_pedido}</div>
              <div style={{ marginBottom: '20px', fontSize: '18px', color: '#087e0b', fontWeight: 'bold' }}>
                Total: Bs. {Number(venta.total_venta).toLocaleString('es-BO', { minimumFractionDigits: 2 })}
              </div>

              {venta.estado !== 0 ? (
                <button 
                  onClick={confirmarAnulacion}
                  disabled={procesando}
                  style={{ 
                    width: '100%', 
                    backgroundColor: '#e53935', 
                    color: 'white', 
                    border: 'none', 
                    padding: '14px', 
                    borderRadius: '8px', 
                    fontWeight: 'bold', 
                    cursor: 'pointer',
                    fontSize: '14px'
                  }}
                >
                  {procesando ? 'Procesando...' : '⚠️ ANULAR PEDIDO DEFINITIVAMENTE'}
                </button>
              ) : (
                <div style={{ textAlign: 'center', color: '#888', fontStyle: 'italic', fontSize: '13px' }}>
                  Este pedido ya se encuentra anulado.
                </div>
              )}
            </div>
          )}
        </div>
        
        <p style={{ textAlign: 'center', marginTop: '20px', fontSize: '12px', color: '#aaa' }}>
          La anulación cambiará el estado a 0. Esto afectará a los reportes y producción.
        </p>
      </div>
    </div>
  )
}