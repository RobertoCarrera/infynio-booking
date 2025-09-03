const AWS = require('aws-sdk');

// prefer the Lambda-provided AWS_REGION, fall back to the project region
const region = process.env.AWS_REGION || 'eu-south-2';
const secretsManager = new AWS.SecretsManager({ region });

const SUPABASE_URL = process.env.SUPABASE_URL; // e.g. https://<project>.supabase.co
const SECRET_ARN = process.env.SUPABASE_SECRET_ARN; // ARN of the secret in Secrets Manager

exports.handler = async (event) => {
  console.log('auto-cancel Lambda invoked', { event });
  if (!SUPABASE_URL || !SECRET_ARN) {
    const msg = 'Missing SUPABASE_URL or SUPABASE_SECRET_ARN environment variables';
    console.error(msg);
    throw new Error(msg);
  }

  try {
  const secretResp = await secretsManager.getSecretValue({ SecretId: SECRET_ARN }).promise();
  // SecretString is preferred; SecretBinary (if present) is base64 encoded
  const secretString = secretResp.SecretString || (secretResp.SecretBinary && Buffer.from(secretResp.SecretBinary, 'base64').toString('utf8'));
    if (!secretString) throw new Error('Empty secret value');

    const secret = JSON.parse(secretString);
    const svc = secret.service_role || secret.SERVICE_ROLE || secret.supabase_service_role;
    if (!svc) throw new Error('service_role key not found in secret');

  const res = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/rpc/auto_cancel_small_sessions_report`, {
      method: 'POST',
      headers: {
        'apikey': svc,
        'Authorization': `Bearer ${svc}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    });

  const text = await res.text();
  console.log('RPC response', { status: res.status, body: text });

    if (!res.ok) {
      const err = new Error(`RPC call failed with status ${res.status}: ${text}`);
      console.error(err);
      throw err;
    }

    // Try to parse the RPC response. If it contains a `cancelled` array with
    // email + session information, send an email notification to each user.
    let rpcJson = null;
    try {
      rpcJson = JSON.parse(text);
    } catch (e) {
      // ignore, rpcJson remains null
    }

    // SES: send notification for each cancelled booking (if provided by RPC)
    try {
      const SES_SOURCE = process.env.SES_SOURCE_EMAIL; // required to send
      if (rpcJson && Array.isArray(rpcJson.cancelled) && SES_SOURCE) {
        if (rpcJson.cancelled.length === 0) {
          console.log('No cancellations to email');
        } else {
          console.log(`Preparing to send ${rpcJson.cancelled.length} cancellation email(s)`);
        }
  const AWS = require('aws-sdk');
  const sesRegion = process.env.SES_REGION;
  const ses = new AWS.SES({ region: sesRegion });

        for (const item of rpcJson.cancelled) {
          try {
            const to = item.email;
            if (!to) continue;
            const subject = `Clase ha sido cancelada: ${item.session_title || ''}`.trim();
            const starts = item.starts_at ? new Date(item.starts_at).toLocaleString() : '';
            const supportLink = process.env.SUPPORT_LINK;
            const LOGO_URL = process.env.LOGO_URL;

            const bodyText = `Hola ${item.name || ''},\n\nLa clase "${item.session_title || ''}" programada para ${starts} ha sido cancelada. Se te ha reembolsado al bono automáticamente.\n\nSi tienes preguntas: ${supportLink}\n\nGracias,\nMars Studio`;

            const bodyHtml = `
              <div style="font-family:Arial,Helvetica,sans-serif;color:#222;line-height:1.4;">
                <div style="max-width:600px;margin:0 auto;padding:18px;">
                  <a href="https://mars-studio.es" style="display:inline-block;margin-bottom:12px;">
                    <img src="${LOGO_URL}" alt="Mars Studio" width="120" style="display:block;border:0;"/>
                  </a>
                  <h2 style="margin:0 0 12px 0;font-size:18px;color:#111;">Clase cancelada</h2>
                  <p>Hola ${item.name || ''},</p>
                  <p>La clase <strong>${item.session_title || ''}</strong> programada para <strong>${starts}</strong> ha sido cancelada por falta de usuari@s.</p>
                  <p>Tu clase ha sido reembolsada automáticamente.</p>
                  <hr style="border:none;border-top:1px solid #eee;margin:18px 0;">
                  <p style="font-size:13px;color:#666">Si tienes dudas, <a href="${supportLink}">contáctanos</a>.</p>
                </div>
              </div>
            `;

            const params = {
              Destination: { ToAddresses: [to] },
              Message: {
                Body: {
                  Html: { Data: bodyHtml },
                  Text: { Data: bodyText }
                },
                Subject: { Data: subject }
              },
              Source: SES_SOURCE
            };

            await ses.sendEmail(params).promise();
            console.log('Sent cancellation email to', to);
          } catch (emailErr) {
            console.error('Failed sending email for item', item, emailErr);
            // continue with next
          }
        }
      } else if (rpcJson && Array.isArray(rpcJson.cancelled) && !process.env.SES_SOURCE_EMAIL) {
        console.warn('RPC returned cancelled items but SES_SOURCE_EMAIL env var is not set; skipping emails');
      } else if (!rpcJson) {
        console.warn('RPC response is not valid JSON; skipping email sending');
      } else if (!Array.isArray(rpcJson.cancelled)) {
        console.warn('RPC JSON missing cancelled array; skipping email sending');
      }
    } catch (sesErr) {
      console.error('SES send loop error', sesErr);
      // Do not fail the whole Lambda because of email errors
    }

    return {
      statusCode: 200,
      body: text
    };
  } catch (err) {
    console.error('Handler error', err);
    // Let the error bubble so EventBridge / scheduler records a failure and retries according to its policy
    throw err;
  }
};
