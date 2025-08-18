// @ts-nocheck
// Edge Function: invite-user
// Purpose: Invite a new user by email (admin-only). Uses Service Role for Admin API.
// CORS is controlled via env: ALLOW_ALL_ORIGINS, ALLOWED_ORIGINS

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

function pickRedirectUrl(origin: string | null): string | undefined {
  // Use explicit env override first
  const envRedirect = Deno.env.get("INVITE_REDIRECT_TO");
  if (envRedirect) return envRedirect;
  // Then prefer the caller origin if allowed
  if (isAllowedOrigin(origin) && origin) return `${origin}/auth-redirect.html`;
  // Fallback to first allowed origin
  const allowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (allowedOrigins.length > 0) return `${allowedOrigins[0]}/auth-redirect.html`;
  return undefined;
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

  // Enforce allowed origin
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

    // Admin client (Service Role) for Admin API
    const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Authorization header required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check admin role in public.users by auth_user_id
    const { data: roleRow, error: roleErr } = await supabaseAdmin
      .from("users")
      .select("role_id")
      .eq("auth_user_id", userData.user.id)
      .single();
    if (roleErr || roleRow?.role_id !== 1) {
      return new Response(JSON.stringify({ error: "Admin role required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

  const body = await req.json().catch(() => ({}));
  const action = (body?.action || 'invite').toString();
  const email = (body?.email || "").toString().trim();
  const authUserId = (body?.auth_user_id || "").toString().trim();
  const redirectToRaw = (body?.redirectTo || pickRedirectUrl(origin)) as string | undefined;

  // Build redirect and type per flow
  const makeRedirect = (appType: 'invite' | 'onboarding' | 'recovery') => {
    if (!redirectToRaw) return redirectToRaw;
    try {
      const u = new URL(redirectToRaw);
      u.pathname = '/auth-redirect.html';
      u.searchParams.set('type', appType);
      return u.toString();
    } catch {
      return redirectToRaw;
    }
  };

    // Validate email only for actions that need it
  const needsEmail = action === 'invite' || action === 'resend' || (action === 'cancel' && !authUserId);
  if (needsEmail && !isValidEmail(email)) {
      return new Response(JSON.stringify({ error: "Valid email is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === 'resend') {
      // kind: 'pending' (invite) | 'onboarding' (magic link)
      const kind = (body?.kind || '').toString();
      if (!isValidEmail(email)) {
        return new Response(JSON.stringify({ error: "Valid email is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (kind === 'pending') {
        // Reenviar INVITACIÓN a usuarios no confirmados
        const redirectToInvite = makeRedirect('invite');
        const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, { redirectTo: redirectToInvite });
        if (error) {
          const msg = (error as any)?.message || "Invite failed";
          const lower = `${msg}`.toLowerCase();
          const status = (error as any)?.status || 400;
          if (status === 429 || lower.includes("rate limit")) {
            return new Response(JSON.stringify({
              status: 'rate_limited',
              message: `Ya se envió recientemente una invitación a ${email}.`,
              details: msg
            }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
          return new Response(JSON.stringify({ error: msg }), {
            status,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ status: 'resent_invite', message: `Invitación reenviada a ${email}.` }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Default: onboarding with MAGIC LINK
      const redirectToOnboarding = makeRedirect('onboarding');
      const { data, error } = await (supabaseAdmin as any).auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectToOnboarding }
      });
      if (error) {
        return new Response(JSON.stringify({ error: error.message || 'No se pudo enviar el magic link' }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      return new Response(JSON.stringify({ status: 'sent_magic_link', message: `Enlace de acceso enviado a ${email}.` }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

  if (action === 'cancel') {
      // Try to find an auth user by email and delete if not confirmed
      try {
    let targetEmail = email;
    let targetAuthId: string | null = null;
    let deletedAuth = false;
        if (authUserId) {
          const { data: userById, error: getErr } = await supabaseAdmin.auth.admin.getUserById(authUserId as any);
          if (getErr) {
            // If not found by id, fall back to email path
            console.warn('getUserById error:', getErr.message);
          } else if (userById?.user) {
            const confirmed = !!userById.user.email_confirmed_at;
            if (confirmed) {
              return new Response(JSON.stringify({ status: 'blocked', code: 'already_confirmed', error: 'El usuario ya confirmó el email. Usa desactivar/gestión de usuarios.' }), {
                status: 200,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              });
            }
            targetAuthId = userById.user.id;
            targetEmail = userById.user.email || targetEmail;
          }
        }

        if (!authUserId) {
          // Search users by paging; stop when found
          let page = 1;
          const perPage = 1000;
          let found: any = null;
          while (true) {
            const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers({ page, perPage } as any);
            if (listErr) throw listErr;
            const users = (list?.users || list || []) as any[];
            if (!users.length) break;
            found = users.find((u: any) => (u?.email || '').toLowerCase() === email.toLowerCase());
            if (found) break;
            if (users.length < perPage) break;
            page += 1;
          }

          if (found) {
            // Only allow cancel for PENDING (unconfirmed) invites
            const confirmed = !!found.email_confirmed_at;
            if (confirmed) {
              return new Response(JSON.stringify({ status: 'blocked', code: 'already_confirmed', error: 'El usuario ya confirmó el email. Usa desactivar/gestión de usuarios.' }), {
                status: 200,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              });
            }
            targetAuthId = found.id;
            targetEmail = found.email || targetEmail;
          }
        }

        // If we have an auth user id, first remove referencing rows in public.users to avoid FK violations
        if (targetAuthId) {
          const { data: linkedUsers, error: linkErr } = await supabaseAdmin
            .from('users')
            .select('id')
            .eq('auth_user_id', targetAuthId);
          if (linkErr) {
            console.warn('Error fetching linked users by auth_user_id:', linkErr.message);
          }
          const linkedIds = (linkedUsers || []).map((r: any) => r.id);
          if (linkedIds.length > 0) {
            const { error: delPkgsErr2 } = await supabaseAdmin
              .from('user_packages')
              .delete()
              .in('user_id', linkedIds);
            if (delPkgsErr2) {
              console.warn('Error deleting packages for linked users:', delPkgsErr2.message);
            }
            const { error: delUsersErr2 } = await supabaseAdmin
              .from('users')
              .delete()
              .in('id', linkedIds);
            if (delUsersErr2) {
              console.warn('Error deleting linked users:', delUsersErr2.message);
            }
          }
        }

        // Now try to delete the auth user (idempotent on not-found)
        if (targetAuthId) {
          const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(targetAuthId);
          if (delErr) {
            const msg = delErr.message || '';
            if (!/not\s*found/i.test(msg)) {
              return new Response(JSON.stringify({ status: 'error', code: 'delete_failed', error: msg || 'No se pudo cancelar la invitación' }), {
                status: 200,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              });
            }
          } else {
            deletedAuth = true;
          }
        }

        // Clean orphaned public.users rows for that email (auth_user_id is null)
        const { data: orphanRows, error: orphanErr } = await supabaseAdmin
          .from('users')
          .select('id')
          .eq('email', targetEmail)
          .is('auth_user_id', null);
        if (orphanErr) {
          console.warn('Error fetching orphaned users for cleanup:', orphanErr.message);
        }
    const orphanIds = (orphanRows || []).map((r: any) => r.id);
        if (orphanIds.length > 0) {
          const { error: delPkgsErr } = await supabaseAdmin
            .from('user_packages')
            .delete()
            .in('user_id', orphanIds);
          if (delPkgsErr) {
            console.warn('Error deleting orphan user packages:', delPkgsErr.message);
          }
          const { error: delUsersErr } = await supabaseAdmin
            .from('users')
            .delete()
            .in('id', orphanIds);
          if (delUsersErr) {
            console.warn('Error deleting orphan users:', delUsersErr.message);
          }
        }
    const cleaned = orphanIds.length;
  return new Response(JSON.stringify({ status: 'cancelled', message: `Invitación pendiente para ${targetEmail || email} cancelada.`, deleted_auth_user: deletedAuth, cleaned_orphans: cleaned }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (err: any) {
    return new Response(JSON.stringify({ code: 'cancel_exception', error: err?.message || 'Error al cancelar invitación' }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    if (action === 'list_pending') {
      try {
        let page = 1;
        const perPage = 1000;
        const pending: any[] = [];
        while (true) {
          const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers({ page, perPage } as any);
          if (listErr) throw listErr;
          const users = (list?.users || list || []) as any[];
          if (!users.length) break;
          for (const u of users) {
            const confirmed = !!u.email_confirmed_at;
            if (!confirmed) {
              pending.push({
                id: u.id,
                email: u.email,
                created_at: u.created_at,
                confirmation_sent_at: (u as any).confirmation_sent_at || null,
                last_sign_in_at: u.last_sign_in_at,
                email_confirmed_at: u.email_confirmed_at,
              });
            }
          }
          if (users.length < perPage) break;
          page += 1;
        }
        return new Response(JSON.stringify({ status: 'ok', count: pending.length, pending }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err?.message || 'Error al listar invitaciones pendientes' }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    if (action === 'list_unfinished') {
      try {
        let page = 1;
        const perPage = 1000;
        const candidates: any[] = [];
        while (true) {
          const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers({ page, perPage } as any);
          if (listErr) throw listErr;
          const users = (list?.users || list || []) as any[];
          if (!users.length) break;
          for (const u of users) {
            const confirmed = !!u.email_confirmed_at;
            if (confirmed) {
              candidates.push({ id: u.id, email: u.email, last_sign_in_at: u.last_sign_in_at, created_at: u.created_at });
            }
          }
          if (users.length < perPage) break;
          page += 1;
        }

        // Check profiles for these auth ids
        const authIds = candidates.map(c => c.id);
        const batches: string[][] = [];
        for (let i = 0; i < authIds.length; i += 1000) {
          batches.push(authIds.slice(i, i + 1000));
        }
        const existingProfiles: Record<string, any> = {};
        for (const batch of batches) {
          if (!batch.length) continue;
          const { data: rows, error: rowsErr } = await supabaseAdmin
            .from('users')
            .select('auth_user_id, name, surname, telephone')
            .in('auth_user_id', batch);
          if (rowsErr) throw rowsErr;
          for (const r of rows || []) {
            existingProfiles[r.auth_user_id] = r;
          }
        }

        const unfinished = candidates.filter(c => {
          const prof = existingProfiles[c.id];
          if (!prof) return true; // no profile row yet
          const nameOk = !!(prof.name && String(prof.name).trim());
          const surnameOk = !!(prof.surname && String(prof.surname).trim());
          const phoneOk = !!(prof.telephone && String(prof.telephone).trim());
          return !(nameOk && surnameOk && phoneOk);
        }).map(c => ({ id: c.id, email: c.email }));

        return new Response(JSON.stringify({ status: 'ok', count: unfinished.length, unfinished }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err?.message || 'Error al listar usuarios sin onboarding' }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Default action: invite
    const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      redirectTo: makeRedirect('invite'),
    });

    if (error) {
      const msg = (error as any)?.message || "Invite failed";
      const status = (error as any)?.status || 400;
      const lower = `${msg}`.toLowerCase();
      if (status === 429 || lower.includes("rate limit")) {
        // Even if invite is rate-limited, try to generate a recovery link
        const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
          type: 'recovery',
          email,
          options: { redirectTo },
        } as any);

        return new Response(
          JSON.stringify({
            error: "RATE_LIMIT_EXCEEDED",
            message:
              `El usuario ${email} ya fue invitado recientemente. Espera unos minutos o revisa spam/correo no deseado.`,
            details: msg,
            recovery_link: linkData?.action_link || null,
            note: linkErr ? `No se pudo generar recovery link: ${linkErr.message}` : undefined,
          }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (lower.includes("already") || lower.includes("exists")) {
        // Generate a recovery link so admins can send it manually
        const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
          type: 'recovery',
          email,
          options: { redirectTo },
        } as any);

        return new Response(
          JSON.stringify({
            status: "already_exists",
            message: `El email ${email} ya fue invitado o existe.`,
            details: msg,
            recovery_link: linkData?.action_link || null,
            note: linkErr ? `No se pudo generar recovery link: ${linkErr.message}` : undefined,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ error: msg }), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      data,
      message: `Invitación enviada exitosamente a ${email}`,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: "Internal server error", details: `${e?.message || e}` }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
