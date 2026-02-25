// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SESClient, SendEmailCommand } from "npm:@aws-sdk/client-ses@3.370.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { type, record, old_record } = await req.json();

    // Triggered when a booking is cancelled
    const isCancellation = (type === "UPDATE" && record?.status === "CANCELLED" && old_record?.status !== "CANCELLED") ||
                (type === "DELETE");

    if (!isCancellation) {
      return new Response("Ignored: Not a cancellation", { status: 200, headers: corsHeaders });
    }

    const class_session_id = record?.class_session_id ?? old_record?.class_session_id;

    if (!class_session_id) {
      return new Response("Missing class_session_id", { status: 400, headers: corsHeaders });
    }

    // 1. Fetch Session and Waitlist
    const { data: sessionData, error: sessionError } = await supabase
      .from("class_sessions")
      .select("id, schedule_date, schedule_time, class_types(name)")
      .eq("id", class_session_id)
      .single();

    if (sessionError) throw sessionError;

    const { data: waitlist, error: waitlistError } = await supabase
      .from("waiting_list")
      .select("id, user_id, users(email, name)")
      .eq("class_session_id", class_session_id)
      .eq("status", "waiting")
      .order("join_date_time", { ascending: true })
      .limit(1);

    if (waitlistError) throw waitlistError;

    if (!waitlist || waitlist.length === 0) {
      return new Response("No users waiting", { status: 200, headers: corsHeaders });
    }

    const nextEntry = waitlist[0];
    const nextUserId = nextEntry.user_id;
    const nextUserEmail = nextEntry.users?.email;
    const nextUserName = nextEntry.users?.name || "Usuario";

    // 2. Promote the next waiting user to confirmed booking (uses package validation)
    const { data: bookingResult, error: bookingError } = await supabase.rpc("admin_create_booking_for_user", {
      p_target_user_id: nextUserId,
      p_class_session_id: class_session_id,
      p_booking_date_time: new Date().toISOString()
    });

    if (bookingError) throw bookingError;

    const bookingRow = Array.isArray(bookingResult) ? bookingResult[0] : bookingResult;
    if (!bookingRow?.success) {
      return new Response(JSON.stringify({ message: bookingRow?.message || "No booking created" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Remove the waiting list entry so it no longer appears as waiting
    await supabase
      .from("waiting_list")
      .delete()
      .eq("id", nextEntry.id);

    // 3. Setup SES
    const sesClient = new SESClient({
      region: Deno.env.get("AWS_REGION") ?? "eu-south-2",
      credentials: {
        accessKeyId: Deno.env.get("AWS_ACCESS_KEY_ID") ?? "",
        secretAccessKey: Deno.env.get("AWS_SECRET_ACCESS_KEY") ?? "",
      },
    });

    const sourceEmail = Deno.env.get("SES_SOURCE_EMAIL") ?? "info@mars-studio.es";
    const className = sessionData.class_types?.name || "Clase";
    const sessionDate = sessionData.schedule_date;
    const sessionTime = sessionData.schedule_time;

    // 4. Notify the promoted user
    if (nextUserEmail) {
      const params = {
        Source: sourceEmail,
        Destination: { ToAddresses: [nextUserEmail] },
        Message: {
          Subject: { Data: `Plaza confirmada en ${className}` },
          Body: {
            Text: { Data: `Hola ${nextUserName},\n\nSe ha liberado una plaza y acabas de pasar de la lista de espera a la clase de ${className} el día ${sessionDate} a las ${sessionTime}.\n\nTu plaza está confirmada.\n\nMars Studio` },
          },
        },
      };

      await sesClient.send(new SendEmailCommand(params));
    }

    return new Response(JSON.stringify({
      message: "Promoted next waiting user and confirmed booking",
      booking_id: bookingRow.booking_id,
      promoted_user_id: nextUserId
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
