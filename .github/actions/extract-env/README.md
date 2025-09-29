# Extract Environment Action

This action is the first stage in a sophisticated **two-level configuration architecture**. Its sole responsibility is to act as the **Authentication and Bootstrap Layer**. It intelligently routes deployments to the correct AWS account (Production or Development) based on the Git branch name, enabling a powerful and flexible dynamic environment strategy.

## The Mental Model: Multi-Account Dynamic Environments

This architecture enables a clear, convention-based workflow for deploying both standard feature branches and high-stakes production hotfixes with maximum safety and fidelity.

### The Routing Rules

The action uses the branch name to determine the deployment target. This logic is the core of the **Level 1 (Auth/Bootstrap)** configuration:

1.  **`main` → Static Production Environment**
    *   The `main` branch always deploys to the primary, static `customer-facing` environment within the **Production Account**.

2.  **`prod/*` or `hotfix/*` → Dynamic Production Environment**
    *   Branches prefixed with `prod/` or `hotfix/` are special. They deploy a **dynamic, ephemeral environment** into the **Production Account**.
    *   **Use Case**: This is for high-fidelity staging or testing a critical hotfix against live production data and infrastructure without touching the primary `customer-facing` deployment.

3.  **`feature/*` (or any other name) → Dynamic Development Environment**
    *   Any other branch is treated as a standard development branch. It deploys a **dynamic, ephemeral environment** into the safe, isolated **Development Account**.

### The Two-Level Architecture

This routing system is the first of two configuration levels:

*   **Level 1 (This Action):** Reads the branch name and uses the rules above to determine the correct **AWS Account/Role** and the unique **`ENVIRONMENT`** key.
*   **Level 2 (Your CDK Code):** Ingests the `ENVIRONMENT` key and uses its own internal logic to define the specific infrastructure (CPU, memory, feature flags) for that environment.

This model provides a secure, predictable framework for deploying a wide variety of environments, from safe daily development to critical production hotfixes.

## Usage Example

Your workflow passes the `ENVIRONMENT` key from this action to your IaC tool. The action's internal logic handles routing to the correct AWS account.

```yaml
jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      contents: read
    steps:
      # LEVEL 1: Determines WHERE to deploy (Prod or Dev account) and provides the key for Level 2.
      - name: Extract Environment Info
        id: extract_env
        uses: ./.github/actions/extract-env
        with:
          branch: ${{ github.ref_name }}

      - name: Configure AWS Credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ env.AWS_ROLE_ARN }}
          aws-region: ${{ env.AWS_REGION }}

      # LEVEL 2: Ingests the key and determines WHAT to deploy.
      - name: Deploy Isolated Stack via CDK
        run: |
          echo "Deploying to environment: $ENVIRONMENT in account: $AWS_ACCOUNT_ID"
          cdk deploy MyWebAppStack --context env=$ENVIRONMENT
```

## Important Implementation Notes

### Environment Name Derivation

**Critical**: There is currently a mismatch in how environment names are derived:

- **CDK (`bin/cdk.ts`)**: Uses the raw Git branch name directly via `execSync('git rev-parse --abbrev-ref HEAD')`
- **GitHub Actions workflows**: Use the sanitized environment name from the `extract-env` action

This means:
- For branch `feature/new-login`, CDK expects stack name `total-ctl-infra-feature/new-login` 
- But workflows attempt to deploy to `total-ctl-infra-feature-new-login`

**Workaround**: The system currently works when run from a local environment where the CDK uses the actual Git branch name. The workflows may need adjustment to pass the environment name to CDK via context or environment variables.

### GitHub Action Interface

The `extract-env` action currently uses hardcoded configuration in `src/index.ts` and **ignores** the `mapping_json` input, despite it being defined in `action.yml` and used by workflows. This is a reference implementation pattern where the JSON mapping would be implemented in a production environment.

To configure the routing rules, edit the hardcoded AWS account targets in `src/index.ts`:

```typescript
// src/index.ts

// This configuration points to your stable, production AWS account.
// It is used for the 'main' branch AND for dynamic 'prod/*' or 'hotfix/*' branches.
const productionConfig: EnvironmentConfig = {
  env: 'customer-facing', // The static name for the primary production environment
  region: 'us-east-1',
  roleArn: 'arn:aws:iam::111111111111:role/github-actions-deploy-role'
};

// This configuration points to your sandbox/development AWS account.
// It is used for all standard development branches (e.g., 'feature/*').
const developmentConfig: EnvironmentConfig = {
  env: 'default-dev', // This name is overridden by the dynamic branch name
  region: 'us-west-2',
  roleArn: 'arn:aws:iam::682794873457:role/total-ctl-infra-sandbox-GithubActionsDeployRole3AEB-59VstfyutSjB'
};
```

### Additional Notes

**Package Scripts**: The `cdk-deploy-infra` script in `aws-cdk/package.json` uses a hardcoded environment name `sandbox` for local development. In production, the CDK deployment should use the dynamic environment name derived from the Git branch or passed via the GitHub Actions workflow.
