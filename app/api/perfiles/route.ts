import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

// Reutiliza el mismo lib/supabaseAdmin.ts creado para el registro/login de
// clientes. Es de solo lectura y devuelve datos de catálogo (no sensibles),
// así que evitamos depender de políticas RLS todavía no configuradas.
export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('perfiles_3d')
      .select(
        `
        codigo_acero,
        tipo_perfil,
        ancho_mm,
        alto_mm,
        diametro_mm,
        espesor_mm,
        longitud_comercial_mm,
        aceros ( detalle, precio_cotizador, proveedor )
      `
      )
      .order('codigo_acero', { ascending: true })

    if (error) {
      console.error('Error leyendo perfiles_3d:', error)
      return NextResponse.json({ error: 'No se pudo cargar el catálogo de perfiles.' }, { status: 500 })
    }

    return NextResponse.json({ perfiles: data || [] })
  } catch (e) {
    console.error('Error inesperado leyendo perfiles_3d:', e)
    return NextResponse.json({ error: 'Error inesperado cargando perfiles.' }, { status: 500 })
  }
}
