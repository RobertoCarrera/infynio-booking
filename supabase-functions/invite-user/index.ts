// ==================================================
// Edge Function: invite-user
// Archivo: supabase/functions/invite-user/index.ts
// ==================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Manejar preflight CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log('🔄 Edge Function invite-user started')
    
    // Obtener secrets del entorno
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    console.log('✅ Environment variables loaded')
    
    // Crear cliente admin con service role key
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    console.log('✅ Supabase admin client created')

    // Verificar que el usuario que llama es admin
    const authHeader = req.headers.get('Authorization')
    
    if (!authHeader) {
      console.log('❌ No Authorization header found')
      return new Response(
        JSON.stringify({ error: 'Header de autorización requerido' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const token = authHeader.replace('Bearer ', '')
    console.log('✅ Token extracted from header')
    
    // Verificar el token del usuario
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token)
    
    if (userError || !user) {
      console.log('❌ User verification failed:', userError)
      return new Response(
        JSON.stringify({ error: 'Token inválido o usuario no encontrado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('✅ User verified:', user.email)

    // Verificar que el usuario es admin
    const { data: userData, error: roleError } = await supabaseAdmin
      .from('users')
      .select('role_id')
      .eq('auth_user_id', user.id)
      .single()

    if (roleError) {
      console.log('❌ Role verification error:', roleError)
      return new Response(
        JSON.stringify({ error: 'Error al verificar permisos de usuario' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (userData?.role_id !== 1) {
      console.log('❌ User is not admin. Role ID:', userData?.role_id)
      return new Response(
        JSON.stringify({ error: 'Permisos insuficientes - se requiere rol de administrador' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('✅ Admin permissions verified')

    // Obtener email del body
    const body = await req.json()
    const { email } = body
    
    console.log('📧 Email to invite:', email)
    
    if (!email) {
      console.log('❌ No email provided')
      return new Response(
        JSON.stringify({ error: 'Email requerido' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Verificar si el usuario ya existe en auth.users
    const { data: existingAuthUser } = await supabaseAdmin.auth.admin.listUsers()
    const userExists = existingAuthUser.users.some(user => user.email === email)

    if (userExists) {
      // Usuario ya existe en auth, verificar si está en nuestra tabla users
      const { data: userInTable } = await supabaseAdmin
        .from('users')
        .select('*')
        .eq('email', email)
        .single()

      if (userInTable) {
        return new Response(
          JSON.stringify({ 
            message: `El usuario ${email} ya está registrado en el sistema.`,
            status: 'already_exists'
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      } else {
        // Existe en auth pero no en nuestra tabla (usuario huérfano)
        return new Response(
          JSON.stringify({ 
            message: `El email ${email} ya fue invitado anteriormente. Si necesitas reinvitarlo, contacta al administrador del sistema.`,
            status: 'auth_exists_table_missing'
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // Invitar usuario usando service role key
    const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${req.headers.get('origin')}/login`
    })

    if (error) {
      // Manejar errores específicos
      if (error.message.includes('already registered') || error.message.includes('already exists')) {
        return new Response(
          JSON.stringify({ 
            message: `El email ${email} ya está registrado. No se puede enviar otra invitación.`,
            status: 'already_invited'
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ 
        data, 
        message: `Invitación enviada exitosamente a ${email}` 
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
