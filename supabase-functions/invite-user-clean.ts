import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log('🔄 Edge Function invite-user started')
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      console.log('❌ No Authorization header')
      return new Response(
        JSON.stringify({ error: 'Header de autorización requerido' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token)
    
    if (userError || !user) {
      console.log('❌ User verification failed:', userError)
      return new Response(
        JSON.stringify({ error: 'Token inválido' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('✅ User verified:', user.email)

    const { data: userData, error: roleError } = await supabaseAdmin
      .from('users')
      .select('role_id')
      .eq('auth_user_id', user.id)
      .single()

    if (roleError) {
      console.log('❌ Role error:', roleError)
      return new Response(
        JSON.stringify({ error: 'Error al verificar permisos' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (userData?.role_id !== 1) {
      console.log('❌ Not admin. Role:', userData?.role_id)
      return new Response(
        JSON.stringify({ error: 'Se requiere rol de administrador' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { email } = await req.json()
    
    if (!email) {
      return new Response(
        JSON.stringify({ error: 'Email requerido' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('📧 Inviting email:', email)

    // Verificar si ya existe
    const { data: existingAuthUser } = await supabaseAdmin.auth.admin.listUsers()
    const userExists = existingAuthUser.users.some((authUser: any) => authUser.email === email)

    if (userExists) {
      console.log('⚠️ User already exists in auth')
      return new Response(
        JSON.stringify({ 
          message: `El email ${email} ya fue invitado anteriormente.`,
          status: 'already_exists'
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Invitar usuario
    const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${req.headers.get('origin')}/reset-password`
    })

    if (error) {
      console.log('❌ Invite error:', error)
      
      // Manejar específicamente el error de rate limiting
      if (error.message?.includes('email rate limit exceeded') || error.status === 429) {
        console.log('⚠️ Rate limit exceeded for email:', email)
        return new Response(
          JSON.stringify({ 
            error: 'Límite de emails alcanzado',
            message: `El usuario ${email} ya fue invitado recientemente. Por favor, espera unos minutos antes de intentar nuevamente o pide al usuario que revise su email (incluyendo spam/correo no deseado).`,
            code: 'RATE_LIMIT_EXCEEDED',
            details: error.message
          }),
          { 
            status: 429,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }
      
      return new Response(
        JSON.stringify({ 
          error: error.message,
          code: error.status || 'INVITE_ERROR'
        }),
        { status: error.status || 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('✅ User invited successfully')
    return new Response(
      JSON.stringify({ 
        data, 
        message: `Invitación enviada exitosamente a ${email}` 
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    console.log('❌ Unexpected error:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Error interno del servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
