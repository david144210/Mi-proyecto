'use client'
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'

delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

function MapClickHandler({ onLocationClick }: { onLocationClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onLocationClick(e.latlng.lat, e.latlng.lng)
    },
  })
  return null
}

export default function MapaInteractivo({ centerLat, centerLng, origen, pinLat, pinLng, onLocationClick }: any) {
  return (
    <MapContainer center={[centerLat, centerLng]} zoom={14} style={{ height: '100%', width: '100%' }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <MapClickHandler onLocationClick={onLocationClick} />
      {origen && <Marker position={[origen.latitud, origen.longitud]} />}
      {pinLat && pinLng && <Marker position={[pinLat, pinLng]} />}
    </MapContainer>
  )
}