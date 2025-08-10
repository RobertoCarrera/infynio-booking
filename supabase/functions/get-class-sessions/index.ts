import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Create a Supabase client with the Auth context of the logged in user.
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    const url = new URL(req.url)
    const startDate = url.searchParams.get('start_date')
    const endDate = url.searchParams.get('end_date')

    console.log('📅 Edge Function called with dates:', { startDate, endDate })

    let query = supabaseClient
      .from('class_sessions')
      .select(`
        id,
        class_type_id,
        capacity,
        schedule_date,
        schedule_time,
        class_types (
          id,
          name,
          description,
          duration_minutes
        )
      `)

    // Si se proporcionan fechas, filtrar por rango
    if (startDate && endDate) {
      console.log('🔍 Filtering by date range:', startDate, 'to', endDate)
      
      // DEBUG: Primero verificar cuántos datos hay sin filtro
      const { data: allSessions, error: allError } = await supabaseClient
        .from('class_sessions')
        .select('id, schedule_date')
        .limit(5)
      
      console.log('🔍 Sample data without filter:', { 
        count: allSessions?.length || 0, 
        sampleDates: allSessions?.map(s => s.schedule_date).slice(0, 3),
        error: allError?.message
      })
      
      query = query
        .gte('schedule_date', startDate)
        .lte('schedule_date', endDate)
    } else {
      console.log('📊 No date filter - getting all sessions')
    }

    // Ordenar por fecha y hora
    query = query
      .order('schedule_date', { ascending: true })
      .order('schedule_time', { ascending: true })

    const { data: sessions, error } = await query

    console.log('📊 Query result:', { 
      sessionCount: sessions?.length || 0, 
      error: error?.message,
      sampleDates: sessions?.slice(0, 3).map(s => s.schedule_date)
    })

    if (error) {
      console.error('Error fetching class sessions:', error)
      return new Response(
        JSON.stringify({ error: error.message }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Transformar los datos para el frontend
    const transformedSessions = sessions?.map(session => ({
      id: session.id,
      class_type_id: session.class_type_id,
      capacity: session.capacity,
      schedule_date: session.schedule_date,
      schedule_time: session.schedule_time,
      class_type_name: session.class_types?.name || 'Sin nombre',
      class_type_description: session.class_types?.description || '',
      duration_minutes: session.class_types?.duration_minutes || 60,
      // Calcular datetime de inicio y fin para el calendario
      start_datetime: `${session.schedule_date}T${session.schedule_time}`,
      end_datetime: calculateEndDateTime(session.schedule_date, session.schedule_time, session.class_types?.duration_minutes || 60)
    })) || []

    return new Response(
      JSON.stringify({ 
        success: true,
        data: transformedSessions,
        count: transformedSessions.length
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    console.error('Unexpected error:', error)
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        details: error.message 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})

function calculateEndDateTime(date: string, time: string, durationMinutes: number): string {
  const startDateTime = new Date(`${date}T${time}`)
  const endDateTime = new Date(startDateTime.getTime() + durationMinutes * 60000)
  return endDateTime.toISOString()
}
