# CDK end-to-end tests

`run.ts` deploys one exported template in a real AWS account and checks it:

1. Creates `ObsStack-<name>` from the template with `StackDisplayName`, `AdminRoleArns` (the caller's role) and, except on `serverless-easy`, `DeployDemoWorkload=false`.
2. Checks the Description marker, `FieldsReady` and `AlertMonitors` outputs.
3. Sends 20 OTLP logs, 20 spans (5 with span events, 5 with links) and a gauge to the pipeline.
4. Checks that all 20 logs and 20 spans are in OpenSearch, that the gauge is in Amazon Managed Service for Prometheus, that span events are stored as JSON on `optimized`, and that log retention is set on `serverless` and `serverless-easy`.
5. Deletes the stack and checks that no function log group is left.

It prints a table of checks and exits non-zero if any fails. A create takes 15 to 30 minutes, a delete up to 15.

## Run locally

```bash
cd aws/cdk
npm run export-templates -- --out /tmp/templates
AWS_REGION=us-east-1 npx ts-node test/e2e/run.ts --variant serverless --templates /tmp/templates
```

`--variant` is `domain`, `optimized`, `serverless` or `serverless-easy`. `--keep` leaves the stack in place. The template is uploaded to `obs-stack-e2e-<account>-<region>`, created on first use.

## In CI

`.github/workflows/cdk-e2e.yml` runs every variant in parallel on pushes to `main` that touch `aws/cdk`, nightly, on demand, and before each release. It needs an AWS account:

1. Deploy `ci-role.yaml` in that account. It creates the GitHub OIDC provider (`CreateOidcProvider=false` if the account has one) and a role that only this repository's `main` branch and `v*` tags can assume.

   ```bash
   aws cloudformation deploy --stack-name obs-stack-e2e-ci-role --template-file ci-role.yaml --capabilities CAPABILITY_IAM
   ```

2. Set the repository variables `E2E_ROLE_ARN` (the stack's `RoleArn` output) and `E2E_REGION`.

Without `E2E_ROLE_ARN` the deploy jobs are skipped. Pull requests never run them, so they never get AWS credentials.
