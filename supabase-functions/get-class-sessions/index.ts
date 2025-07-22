import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';


serve(async (req) => {
  const allowedOrigins = [
    'https://mejoras.mars-studio.es',
    'https://reservas.mars-studio.es'
  ];
  const origin = req.headers.get('origin');
  const corsHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info',
    'Access-Control-Allow-Origin': allowedOrigins.includes(origin || '') ? origin : '',
  };

  // Manejo de preflight OPTIONS
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  if (!origin || !allowedOrigins.includes(origin)) {
    return new Response(JSON.stringify({ error: 'Origin not allowed' }), {
      status: 403,
      headers: corsHeaders,
    });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!
  );

  // Consulta con join para traer datos de class_sessions y class_types
  let data, error;
  try {
    const result = await supabase.rpc('get_class_sessions_with_types');
    data = result.data;
    error = result.error;
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Exception', details: String(e) }), {
      status: 500,
      headers: corsHeaders,
    });
  }

  if (error) {
    return new Response(JSON.stringify({ error: error.message, details: error }), {
      status: 500,
      headers: corsHeaders,
    });
  }

  return new Response(JSON.stringify(data), {
    status: 200,
    headers: corsHeaders,
  });
});
