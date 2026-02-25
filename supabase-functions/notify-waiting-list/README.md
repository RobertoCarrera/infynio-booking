# Notify Waiting List Edge Function

This function sends email notifications to the user and admin when a user joins the waiting list.
It uses AWS SES for sending emails.

## Setup Instructions

### 1. Deploy the Function
Run the following command in your terminal to deploy the function to Supabase:

```bash
supabase functions deploy notify-waiting-list
```

### 2. Set Environment Variables
You need to set the AWS credentials and email configuration in your Supabase project secrets:

```bash
supabase secrets set AWS_ACCESS_KEY_ID=your_access_key AWS_SECRET_ACCESS_KEY=your_secret_key SES_SOURCE_EMAIL=info@mars-studio.es ADMIN_EMAIL=admin@mars-studio.es
```

- `SES_SOURCE_EMAIL`: The email address verified in AWS SES that sends the emails.
- `ADMIN_EMAIL`: The email address to receive admin notifications.

### 3. Create Database Webhook
To trigger this function automatically when someone joins the waiting list, creates a Webhook in the Supabase Dashboard:

1. Go to **Database** > **Webhooks**.
2. Click **Create a new webhook**.
3. Configure:
   - **Name:** `notify-waiting-list`
   - **Table:** `public.waiting_list`
   - **Events:** Select `INSERT`.
   - **Type:** `HTTP Request`
   - **Method:** `POST`
   - **URL:** (Copy the URL from the deployment output, usually `https://<project>.supabase.co/functions/v1/notify-waiting-list`)
   - **HTTP Headers:** Add `Authorization` with value `Bearer <SERVICE_ROLE_KEY>` (or Anon key).
4. Save the webhook.

Now, whenever a user joins the waiting list, an email will be sent automatically.
