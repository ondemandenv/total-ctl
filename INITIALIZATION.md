# One-Time Initialization for the Self-Propelling Workflow

This guide details the one-time setup process to enable the self-propelling CI/CD workflow. Its purpose is to solve the initial "chicken-and-egg" problem.

## The Core Challenge: Creating the Initial Roles

- The automated CI/CD pipeline needs an IAM Role to deploy infrastructure.
- That IAM Role is defined *inside* the infrastructure code (the CDK app).

To solve this, we must perform a **one-time manual deployment** for each target AWS account. This manual run "primes the pump" by creating the initial IAM roles. After this, the entire workflow becomes automated and self-sufficient.

---

### **Step 1: Bootstrap Each Target AWS Account**

This prepares each AWS account to accept CDK deployments. This only needs to be done once per account/region pair.

```bash
# 1. Bootstrap your Production account
# Replace with your actual Production Account ID and Region
cdk bootstrap aws://PROD_ACCOUNT_ID/PROD_REGION

# 2. Bootstrap your Development/Sandbox account
# Replace with your actual Development Account ID and Region
cdk bootstrap aws://DEV_ACCOUNT_ID/DEV_REGION
```

---

### **Step 2: Create GitHub OIDC Provider in Each Account**

The GitHub OIDC provider allows GitHub Actions to securely authenticate with AWS without long-lived secrets. This must be created **once per AWS account**.

Run the following AWS CLI command, targeting your Production account and then again for your Development account. If the provider already exists in an account, the command will safely fail with an error, and you can continue.

```bash
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1
```

---

### **Step 3: Manually Deploy to Create the Deployment Roles**

Now, we will manually deploy the CDK stack into each account. This action creates the critical IAM roles.

#### 2.1 Create the Production Deployment Role

This role will be used exclusively by the `main` branch.

```bash
cd aws-cdk

# Set context for your Production account
export CDK_DEFAULT_ACCOUNT=PROD_ACCOUNT_ID
export CDK_DEFAULT_REGION=PROD_REGION

# Manually deploy the Production stack
# The stack name (e.g., total-ctl-infra-customer-facing) is defined in aws-cdk/bin/cdk.ts
cdk deploy <YOUR_PROD_STACK_NAME> --require-approval never
```

> **>> After the deployment finishes, the CDK will output the `roleArn`. Copy this ARN. This is your Production Role ARN.**

#### 2.2 Create the Shared Development Role

This single role will be assumed by the pipeline for **all** non-production branches (features, bugfixes, etc.).

```bash
# Set context for your Development account
export CDK_DEFAULT_ACCOUNT=DEV_ACCOUNT_ID
export CDK_DEFAULT_REGION=DEV_REGION

# Manually deploy the Development stack
cdk deploy <YOUR_DEV_STACK_NAME> --require-approval never
```

> **>> After the deployment finishes, copy the output `roleArn`. This is your Shared Development Role ARN.**

---

### **Step 3: Connect the System by Hardcoding the ARNs**

This is the final step that "closes the loop" and makes the system self-propelling. You will now permanently store the two role ARNs you just created inside the Level 1 Action.

1.  Open the file `.github/actions/extract-env/src/index.ts`.
2.  Locate the `Hardcoded Configuration` block.
3.  Paste the ARNs from Step 2 into the `roleArn` fields.

```typescript
// .github/actions/extract-env/src/index.ts

// This configuration is used for the `main` branch.
const productionConfig: EnvironmentConfig = {
  env: 'customer-facing',
  region: 'PROD_REGION', // e.g., 'us-east-1'
  roleArn: 'arn:aws:iam::111111111111:role/github-actions-deploy-role' // <-- PASTE ARN FROM STEP 2.1
};

// This configuration is the BASE for all other branches.
const developmentConfig: EnvironmentConfig = {
  env: 'default-dev',
  region: 'DEV_REGION', // e.g., 'us-west-2'
  roleArn: 'arn:aws:iam::682794873457:role/total-ctl-infra-sandbox-GithubActionsDeployRole3AEB-XXXXXXXXXX' // <-- PASTE ARN FROM STEP 2.2
};
```

---

### **Step 4: Commit and Finalize**

Commit the updated `index.ts` file. The system is now fully operational.

```bash
git add .github/actions/extract-env/src/index.ts
git commit -m "feat(ci): Finalize self-propelling workflow by seeding role ARNs"
git push
```

## ✅ Initialization Complete

From this point forward, the CI/CD pipeline is fully autonomous. When a workflow runs, the `extract-env` action will provide the correct, pre-existing role ARN for the pipeline to assume. Both the GitHub Actions and CDK use the same environment naming utility (`aws-cdk/bin/branch-env-name.js`) as the single source of truth to ensure consistent stack names across all deployments.

The system will now manage its own infrastructure, including the very roles it uses for deployment.
