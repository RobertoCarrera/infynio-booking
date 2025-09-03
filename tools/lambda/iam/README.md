IAM notes
=========

Two roles are required in this pattern:

1. Lambda execution role (`lambda-auto-cancel-exec`)
   - Trust policy: `lambda-exec-trust.json` (lambda.amazonaws.com)
   - Inline policy: `lambda-exec-policy.json` (permissions to read the Secrets Manager secret and write logs)

2. Scheduler invoke role (`scheduler-invoke-lambda-role`)
   - Trust policy: `trust-policy-scheduler.json` (scheduler.amazonaws.com)
   - Inline policy: `scheduler-invoke-policy.json` (permission to invoke the specific Lambda)

When creating the EventBridge / Scheduler target you will supply the `scheduler-invoke-lambda-role` ARN as the `RoleArn` so the Scheduler can assume it and perform the invocation.

Remember to replace placeholders `<REGION>`, `<ACCOUNT_ID>`, `<SECRET_NAME>` and function name where necessary.

Exact commands to update your existing role `Acciones_Supabase` so EventBridge Scheduler can assume it and invoke the Lambda:

# 1) Update the role trust policy to allow scheduler.amazonaws.com to assume it
aws iam update-assume-role-policy \
  --role-name Acciones_Supabase \
  --policy-document file://tools/lambda/iam/trust-policy-scheduler.json

# 2) Attach inline policy that allows invoking the Lambda
aws iam put-role-policy \
  --role-name Acciones_Supabase \
  --policy-name scheduler-invoke-policy \
  --policy-document file://tools/lambda/iam/scheduler-invoke-policy.json

# 3) Verify the AssumeRolePolicyDocument
aws iam get-role --role-name Acciones_Supabase --query 'Role.AssumeRolePolicyDocument' --output json

# 4) When creating the schedule in EventBridge Scheduler, use this Role ARN:
#    arn:aws:iam::124766368859:role/Acciones_Supabase

Notes:
- The inline policy file `scheduler-invoke-policy.json` has been pre-filled with your Lambda ARN.
- Running step 1 replaces the existing trust policy for the role; confirm there are no other services that need to assume it before overwriting.
- If you prefer to append a statement instead of replacing the trust policy, I can generate the JSON to merge instead.

Additional commands you may need to run locally (these require IAM permissions):

# 5) Attach the lambda execution inline policy to the Acciones_Supabase role so the Lambda can read the Secrets Manager secret
aws iam put-role-policy \
  --role-name Acciones_Supabase \
  --policy-name lambda-exec-policy \
  --policy-document file://tools/lambda/iam/lambda-exec-policy.json

# 6) If your IAM user `infynio` needs to read CloudWatch Logs for the Lambda, attach a simple read-only logs policy to the user
aws iam put-user-policy \
  --user-name infynio \
  --policy-name cloudwatch-logs-readonly \
  --policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":["logs:FilterLogEvents","logs:GetLogEvents","logs:DescribeLogStreams"],"Resource":"arn:aws:logs:eu-south-2:124766368859:log-group:/aws/lambda/supabaseCancelClass_Session:*"}]}'

After running these, try invoking the Lambda again and then fetch logs with:
aws logs filter-log-events --log-group-name /aws/lambda/supabaseCancelClass_Session --limit 50
