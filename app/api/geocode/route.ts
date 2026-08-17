import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const input = searchParams.get('address')

  if (!input) {
    return NextResponse.json({ error: 'Falta la dirección o enlace' }, { status: 400 })
  }

  try {
    let cleanInput = input.trim()

    // 1. Detectar si es un enlace de Google Maps (corto o largo)
    if (cleanInput.includes('maps.app.goo.gl') || cleanInput.includes('goo.gl/maps') || cleanInput.includes('google.com/maps')) {
      let finalUrl = cleanInput
      if (!cleanInput.startsWith('http://') && !cleanInput.startsWith('https://')) {
        finalUrl = 'https://' + cleanInput
      }

      // Resolver la redirección del enlace corto de WhatsApp/Google
      const response = await fetch(finalUrl, {
        method: 'HEAD',
        redirect: 'follow',
        headers: { 'User-Agent': 'Mozilla/5.0' }
      })
      const resolvedUrl = response.url

      // Intentar extraer coordenadas directamente de la URL expandida (ej: @lat,lng)
      const coordsMatch = resolvedUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/)
      if (coordsMatch) {
        return NextResponse.json({
          lat: parseFloat(coordsMatch[1]),
          lng: parseFloat(coordsMatch[2]),
          direccion_formateada: 'Ubicación obtenida desde enlace de WhatsApp'
        })
      }

      // Si viene con parámetro q=lat,lng
      const qMatch = resolvedUrl.match(/q=(-?\d+\.\d+),(-?\d+\.\d+)/)
      if (qMatch) {
        return NextResponse.json({
          lat: parseFloat(qMatch[1]),
          lng: parseFloat(qMatch[2]),
          direccion_formateada: 'Ubicación obtenida desde enlace de WhatsApp'
        })
      }
    }

    // 2. Si es texto plano, buscar mediante Nominatim (OpenStreetMap)
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(cleanInput)}&limit=1`, {
      headers: { 'User-Agent': 'SistemaDeliverys/1.0' }
    })
    const data = await res.json()

    if (!data || data.length === 0) {
      return NextResponse.json({ error: 'No se pudo interpretar la ubicación o el enlace proporcionado' }, { status: 404 })
    }

    return NextResponse.json({
      lat: parseFloat(data[0].lat),
      lng: parseFloat(data[0].lon),
      direccion_formateada: data[0].display_name
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}