// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

function getCorsHeaders(origin: string | null) {
  const allowAll = (Deno.env.get('ALLOW_ALL_ORIGINS') || 'false').toLowerCase() === 'true'
  const allowedOrigins = (Deno.env.get('ALLOWED_ORIGINS') || '')
    .split(',')
  .map((s: string) => s.trim())
    .filter(Boolean)
  const isAllowed = allowAll || (origin && allowedOrigins.includes(origin))
  return {
    'Access-Control-Allow-Origin': isAllowed && origin ? origin : (allowAll ? '*' : ''),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Vary': 'Origin'
  }
}

function isValidDateStr(d: string | null) {
  return !!d && /^\d{4}-\d{2}-\d{2}$/.test(d)
}

serve(async (req: Request) => {
  const origin = req.headers.get('Origin')
  const corsHeaders = getCorsHeaders(origin)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Cliente con contexto de Auth (RLS aplica)
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization') || '' } } }
    )

    // Validar origen si no se permite allow-all
    const allowAll = (Deno.env.get('ALLOW_ALL_ORIGINS') || 'false').toLowerCase() === 'true'
    const allowedOrigins = (Deno.env.get('ALLOWED_ORIGINS') || '')
      .split(',').map(s => s.trim()).filter(Boolean)
    if (!allowAll && (!origin || !allowedOrigins.includes(origin))) {
      return new Response(JSON.stringify({ error: 'Origin not allowed' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const url = new URL(req.url)
    let startDate = url.searchParams.get('start_date')
    let endDate = url.searchParams.get('end_date')

    // Validación básica y valores por defecto (hoy..+365d)
    const today = new Date()
    const y = today.getFullYear()
    const m = String(today.getMonth() + 1).padStart(2, '0')
    const d = String(today.getDate()).padStart(2, '0')
    const defaultStart = `${y}-${m}-${d}`
    const defaultEnd = new Date(today.getTime() + 365 * 24 * 60 * 60 * 1000)
    const deY = defaultEnd.getFullYear()
    const deM = String(defaultEnd.getMonth() + 1).padStart(2, '0')
    const deD = String(defaultEnd.getDate()).padStart(2, '0')
    const defaultEndStr = `${deY}-${deM}-${deD}`

    if (!isValidDateStr(startDate)) startDate = defaultStart
    if (!isValidDateStr(endDate)) endDate = defaultEndStr

    // Asegurar rango sensato (<= 400 días)
    const start = new Date(`${startDate}T00:00:00`)
    const end = new Date(`${endDate}T00:00:00`)
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start || (end.getTime() - start.getTime()) > 400 * 86400000) {
      return new Response(JSON.stringify({ error: 'Invalid date range' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Usar RPC optimizada para traer conteos
    const { data, error } = await supabaseClient.rpc('get_sessions_with_booking_counts', {
      p_start_date: startDate,
      p_end_date: endDate
    })

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const sessions = (data || []).map((s: any) => ({
      id: s.id,
      class_type_id: s.class_type_id,
      capacity: s.capacity,
      schedule_date: s.schedule_date,
      schedule_time: s.schedule_time,
      confirmed_bookings_count: s.confirmed_bookings_count,
      available_spots: s.available_spots
    }))

    return new Response(JSON.stringify({ success: true, data: sessions, count: sessions.length }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Internal server error', details: String(error?.message || error) }), { status: 500, headers: { ...getCorsHeaders(origin), 'Content-Type': 'application/json' } })
  }
})
