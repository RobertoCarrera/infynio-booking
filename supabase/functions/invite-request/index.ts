// @ts-nocheck
// Edge Function: invite-request
// Purpose: Allow users (even without session) to request a new invitation link by email.
// Admins can list and clear requests in the admin UI.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function getCorsHeaders(origin: string | null) {
  const allowAll = (Deno.env.get("ALLOW_ALL_ORIGINS") || "false").toLowerCase() === "true";
  const allowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const isAllowed = allowAll || (origin && allowedOrigins.includes(origin));
  return {
    "Access-Control-Allow-Origin": isAllowed && origin ? origin : allowAll ? "*" : "",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  } as Record<string, string>;
}

function isAllowedOrigin(origin: string | null): boolean {
  const allowAll = (Deno.env.get("ALLOW_ALL_ORIGINS") || "false").toLowerCase() === "true";
  if (allowAll) return true;
  const allowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return !!origin && allowedOrigins.includes(origin);
}

function isValidEmail(email: string | undefined | null) {
  if (!email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

serve(async (req: Request) => {
  const origin = req.headers.get("Origin");
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (!isAllowedOrigin(origin)) {
    return new Response(JSON.stringify({ error: "Origin not allowed" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !serviceKey) {
      return new Response(JSON.stringify({ error: "Missing Supabase env configuration" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

    const body = await req.json().catch(() => ({}));
    const action = (body?.action || 'request').toString();
    const email = (body?.email || '').toString().trim();

    // Optional: verify admin for list/clear actions
    async function requireAdmin() {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) return false;
      const token = authHeader.replace("Bearer ", "");
      const { data: userData, error } = await admin.auth.getUser(token);
      if (error || !userData?.user) return false;
      const { data: roleRow } = await admin.from('users').select('role_id').eq('auth_user_id', userData.user.id).single();
      return roleRow?.role_id === 1;
    }

    if (action === 'request') {
      if (!isValidEmail(email)) {
        return new Response(JSON.stringify({ error: 'Email inválido' }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const now = new Date().toISOString();
      // Try RPC first to increment atomically; fallback to upsert if RPC missing
      const { error: rpcErr } = await admin.rpc('increment_invite_request', { req_email: email });
      if (rpcErr) {
        const { error: upErr } = await admin.from('invite_requests')
          .upsert({ email, last_requested_at: now, request_count: 1 }, { onConflict: 'email' })
          .select();
        if (upErr) {
          return new Response(JSON.stringify({ error: upErr.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }
      return new Response(JSON.stringify({ status: 'ok', message: 'Solicitud registrada' }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === 'list') {
      if (!(await requireAdmin())) {
        return new Response(JSON.stringify({ error: 'Admin role required' }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const { data, error } = await admin
        .from('invite_requests')
        .select('email, last_requested_at, request_count')
        .order('last_requested_at', { ascending: false });
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ requests: data || [] }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === 'clear') {
      if (!(await requireAdmin())) {
        return new Response(JSON.stringify({ error: 'Admin role required' }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (!isValidEmail(email)) {
        return new Response(JSON.stringify({ error: 'Email inválido' }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const { error } = await admin.from('invite_requests').delete().eq('email', email);
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ status: 'cleared' }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e?.message || 'Internal error' }), {
      status: 500,
      headers: { ...getCorsHeaders(req.headers.get('Origin')), "Content-Type": "application/json" },
    });
  }
});
