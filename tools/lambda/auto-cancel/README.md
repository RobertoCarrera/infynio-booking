Auto-cancel Lambda
===================

Purpose
-------
This Lambda calls the Supabase RPC `auto_cancel_small_sessions_report()` to auto-cancel small class sessions and trigger refunds, and then emails affected users via SES. It's intended to be scheduled every 15 minutes by EventBridge Scheduler.

Files
-----
- `index.js` - Lambda handler (Node.js, uses AWS SDK to read Secrets Manager, call Supabase REST RPC, and send SES emails).
- `package.json` - minimal manifest.

Environment variables (set on the Lambda configuration)
- `SUPABASE_URL` - your Supabase project URL, e.g. `https://<project>.supabase.co`
- `SUPABASE_SECRET_ARN` - ARN of the Secrets Manager secret that contains the Service Role key
- `SES_SOURCE_EMAIL` - verified SES identity (email or domain); used as Source
- `SES_REGION` - region for SES (e.g., `eu-west-3`)
- `LOGO_URL`, `SUPPORT_LINK` - optional links used in the email template

Secrets format (Secrets Manager)
- Create a secret (SecretString) with JSON such as:
  {
    "service_role": "<YOUR_SUPABASE_SERVICE_ROLE_KEY>"
  }

IAM roles required
- Lambda execution role: allows Lambda to read the secret and write CloudWatch Logs.
- EventBridge Scheduler assume-role: a role that allows EventBridge Scheduler (`scheduler.amazonaws.com`) to assume it and invoke the Lambda. See `../iam/` for policy templates.

Deploy (manual quick steps)
1. Package handler (Windows PowerShell):

```powershell
cd tools/lambda/auto-cancel
npm ci --omit=dev
Remove-Item -ErrorAction Ignore function.zip
Compress-Archive -Path index.js,node_modules,package.json,package-lock.json -DestinationPath function.zip -Force
```

2. Create Lambda (replace placeholders):

```bash
aws iam create-role --role-name lambda-auto-cancel-exec --assume-role-policy-document file://tools/lambda/auto-cancel/../iam/lambda-exec-trust.json
aws iam put-role-policy --role-name lambda-auto-cancel-exec --policy-name lambda-exec-policy --policy-document file://tools/lambda/auto-cancel/../iam/lambda-exec-policy.json

aws lambda create-function \
  --function-name supabaseCancelClass_Session \
  --runtime nodejs22.x \
  --handler index.handler \
  --zip-file fileb://function.zip \
  --role arn:aws:iam::<ACCOUNT_ID>:role/lambda-auto-cancel-exec \
  --environment Variables={SUPABASE_URL="https://<project>.supabase.co",SUPABASE_SECRET_ARN="arn:aws:secretsmanager:<REGION>:<ACCOUNT_ID>:secret:<NAME>",SES_SOURCE_EMAIL="cancelaciones@mars-studio.es",SES_REGION="eu-west-3",LOGO_URL="https://...",SUPPORT_LINK="https://..."}
```

3. Create EventBridge Scheduler rule and target role (see `tools/lambda/auto-cancel/../iam` for role/trust policy). Example:

```bash
# create role that scheduler can assume
aws iam create-role --role-name scheduler-invoke-lambda-role --assume-role-policy-document file://tools/lambda/auto-cancel/../iam/trust-policy-scheduler.json
aws iam put-role-policy --role-name scheduler-invoke-lambda-role --policy-name scheduler-invoke-policy --policy-document file://tools/lambda/auto-cancel/../iam/scheduler-invoke-policy.json

# create schedule (every 15 minutes) and target
aws events put-rule --name auto-cancel-every-15m --schedule-expression "rate(15 minutes)"
aws lambda add-permission --function-name supabaseCancelClass_Session --statement-id evtInvoke --action 'lambda:InvokeFunction' --principal events.amazonaws.com --source-arn arn:aws:events:<REGION>:<ACCOUNT_ID>:rule/auto-cancel-every-15m
aws events put-targets --rule auto-cancel-every-15m --targets "Id"="1","Arn"="arn:aws:lambda:<REGION>:<ACCOUNT_ID>:function:supabaseCancelClass_Session"
```

Notes
-----
- The README contains quick examples; adapt ARNs, region and account IDs. For production use, create tighter IAM policies and KMS encryption for secrets if required.
- I can add a GitHub Actions workflow to deploy this Lambda automatically if you want.

Packaging & troubleshooting
---------------------------
- If you see Runtime.ImportModuleError for `aws-sdk` or `node-fetch` when running the Lambda, the function package on Lambda is missing node_modules. Build the production dependencies locally and include them in the uploaded zip.

Quick steps (WSL / Git Bash):

```bash
cd tools/lambda/auto-cancel
npm ci --omit=dev
rm -f function.zip
zip -r function.zip index.js node_modules package.json package-lock.json
```

Quick steps (PowerShell):

```powershell
cd tools/lambda/auto-cancel
npm ci --omit=dev
Remove-Item -ErrorAction Ignore function.zip
Compress-Archive -Path index.js,node_modules,package.json,package-lock.json -DestinationPath function.zip -Force
```

Upload the zip:

```bash
aws lambda update-function-code --function-name supabaseCancelClass_Session --zip-file fileb://function.zip
```

