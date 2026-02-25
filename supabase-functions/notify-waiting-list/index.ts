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

    // Determine event type
    const isJoin = (type === "INSERT" && record?.status === "waiting") ||
                   (type === "UPDATE" && record?.status === "waiting" && (old_record?.status !== "waiting" || record.join_date_time !== old_record?.join_date_time));
    
    const isLeave = (type === "DELETE" && old_record?.status === "waiting") ||
                    (type === "UPDATE" && record?.status !== "waiting" && old_record?.status === "waiting");

    if (!isJoin && !isLeave) {
      return new Response("Ignored", { status: 200, headers: corsHeaders });
    }

    // Use record for Join, old_record for Leave (DELETE)
    const activeRecord = isJoin ? record : old_record;
    const { user_id, class_session_id } = activeRecord;

    // Fetch User, Session, and Class Type details
    const { data: sessionData, error: sessionError } = await supabase
      .from("class_sessions")
      .select(`
        schedule_date,
        schedule_time,
        class_types (name)
      `)
      .eq("id", class_session_id)
      .single();

    if (sessionError) throw sessionError;

    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("email, name, surname")
      .eq("id", user_id)
      .single();

    if (userError) throw userError;

    const userEmail = userData.email;
    const userName = userData.name || "Usuario";
    const className = sessionData.class_types?.name || "Clase";
    const sessionDate = sessionData.schedule_date; // Format as needed
    const sessionTime = sessionData.schedule_time; // Format as needed

    const sesClient = new SESClient({
      region: Deno.env.get("AWS_REGION") ?? "eu-south-2",
      credentials: {
        accessKeyId: Deno.env.get("AWS_ACCESS_KEY_ID") ?? "",
        secretAccessKey: Deno.env.get("AWS_SECRET_ACCESS_KEY") ?? "",
      },
    });

    const sourceEmail = Deno.env.get("SES_SOURCE_EMAIL") ?? "info@mars-studio.es"; // Fallback
    const adminEmail = Deno.env.get("ADMIN_EMAIL") ?? sourceEmail;

    // Email content based on event type
    const userSubject = isJoin 
      ? `Has entrado en la lista de espera: ${className}`
      : `Baja de lista de espera: ${className}`;
    
    const userBody = isJoin
      ? `Hola ${userName},\n\nTe confirmamos que estás en la lista de espera para la clase de ${className} el día ${sessionDate} a las ${sessionTime}.\n\nTe avisaremos si queda una plaza libre.\n\nMars Studio`
      : `Hola ${userName},\n\nHas salido de la lista de espera para la clase de ${className} el día ${sessionDate} a las ${sessionTime}.\n\nSi ha sido un error, puedes volver a apuntarte desde la App.\n\nMars Studio`;

    const adminSubject = isJoin
      ? `Nuevo usuario en lista de espera: ${className}`
      : `Usuario fuera de lista de espera: ${className}`;

    const adminBody = isJoin
      ? `El usuario ${userName} (${userEmail}) se ha unido a la lista de espera para:\nClase: ${className}\nFecha: ${sessionDate}\nHora: ${sessionTime}`
      : `El usuario ${userName} (${userEmail}) ha salido (se ha dado de baja) de la lista de espera para:\nClase: ${className}\nFecha: ${sessionDate}\nHora: ${sessionTime}`;

    // Email to User
    const userParams = {
      Source: sourceEmail,
      Destination: { ToAddresses: [userEmail] },
      Message: {
        Subject: { Data: userSubject },
        Body: {
          Text: { Data: userBody },
        },
      },
    };

    // Email to Admin
    const adminParams = {
      Source: sourceEmail,
      Destination: { ToAddresses: [adminEmail] },
      Message: {
        Subject: { Data: adminSubject },
        Body: {
          Text: { Data: adminBody },
        },
      },
    };

    await Promise.all([
      sesClient.send(new SendEmailCommand(userParams)),
      sesClient.send(new SendEmailCommand(adminParams)),
    ]);

    return new Response(JSON.stringify({ message: "Emails sent" }), {
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
