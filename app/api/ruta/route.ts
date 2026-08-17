import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { origen, paradas } = body

    if (!origen || !paradas || paradas.length === 0) {
      return NextResponse.json({ error: 'Faltan datos de origen o paradas' }, { status: 400 })
    }

    // Construir coordenadas para OSRM: {lng},{lat};{lng},{lat}...
    let coords = `${origen.lng},${origen.lat}`
    for (const p of paradas) {
      coords += `;${p.lng},${p.lat}`
    }

    const osrmRes = await fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`, {
      headers: { 'User-Agent': 'SistemaDeliverys/1.0' }
    })
    const osrmData = await osrmRes.json()

    if (osrmData.code !== 'Ok' || !osrmData.routes || osrmData.routes.length === 0) {
      return NextResponse.json({ error: 'No se pudo calcular la ruta' }, { status: 500 })
    }

    const route = osrmData.routes[0]
    const distancia_total_km = Math.round((route.distance / 1000) * 100) / 100
    const duracion_total_min = Math.round(route.duration / 60)

    let paradas_ordenadas = []
    if (osrmData.legs && osrmData.legs.length === paradas.length) {
      for (let i = 0; i < paradas.length; i++) {
        const leg = osrmData.legs[i]
        paradas_ordenadas.push({
          envio_id: paradas[i].envio_id,
          orden_parada: i + 1,
          distancia_tramo_km: Math.round((leg.distance / 1000) * 100) / 100
        })
      }
    } else {
      let distTramo = Math.round((distancia_total_km / paradas.length) * 100) / 100
      for (let i = 0; i < paradas.length; i++) {
        paradas_ordenadas.push({
          envio_id: paradas[i].envio_id,
          orden_parada: i + 1,
          distancia_tramo_km: distTramo
        })
      }
    }

    return NextResponse.json({
      distancia_total_km,
      duracion_total_min,
      paradas_ordenadas,
      ruta_osm: route.geometry
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}