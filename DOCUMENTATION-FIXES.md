# Documentation Fixes for Code Consistency

This document summarizes the documentation updates made to align with the actual code implementation.

## Issues Fixed

### 1. SSM Parameter Path Corrections

**Problem**: Documentation used inconsistent parameter path examples.

**Fixed**:
- Updated all references from `/my-app-name/` and `/solo/` to `/total-ctl/`
- Corrected parameter examples to match actual implementation:
  - `/total-ctl/{environment}/backend/ecr-repoName`
  - `/total-ctl/{environment}/backend/ecr-imgTag`
  - `/total-ctl/{environment}/backend/service-url`
  - `/total-ctl/{environment}/github-actions/role-arn`

**Files Updated**:
- `README.md`
- `aws-cdk/docs/InfrastructureStack.md`
- `aws-cdk/docs/BackendStack.md`

### 2. Database Username Default Value

**Problem**: Documentation claimed default username was "mememaker".

**Fixed**: Updated to correct default value "dbadmin" as implemented in code.

**Files Updated**:
- `aws-cdk/docs/InfrastructureStack.md`

### 3. GitHub Action Implementation Reality

**Problem**: Documentation didn't reflect that `extract-env` action uses hardcoded config.

**Fixed**: 
- Added clear note that `mapping_json` input is ignored
- Documented the hardcoded configuration approach
- Added actual role ARN example from implementation

**Files Updated**:
- `.github/actions/extract-env/README.md`

### 4. Custom Domain Configuration Location

**Problem**: Documentation referenced non-existent config file.

**Fixed**: Updated to reference the actual hardcoded configuration location.

**Files Updated**:
- `aws-cdk/docs/CustomDomainStack.md`

### 5. Package Name Consistency

**Problem**: Package.json files had old project names.

**Fixed**: Updated package names in all package.json files:
- `aws-cdk/package.json`: "ugc-moderation-cdk" → "total-ctl-cdk"
- `back-end/package.json`: "ugc-moderation-backend" → "total-ctl-backend"  
- `front-end/package.json`: "ugc-moderation-frontend" → "total-ctl-frontend"

**Files Updated**:
- `aws-cdk/package.json`
- `back-end/package.json`
- `front-end/package.json`

### 6. Environment Name Derivation Warning

**Problem**: Critical mismatch between CDK and workflow environment derivation not documented.

**Fixed**: Added prominent warnings about:
- CDK using raw branch names (`feature/new-login`)
- Workflows using sanitized names (`feature-new-login`)
- Potential stack naming conflicts

**Files Updated**:
- `README.md`
- `.github/actions/extract-env/README.md`

### 7. Initialization Guide Role ARN Examples

**Problem**: Placeholder values didn't match the actual hardcoded examples.

**Fixed**: Updated initialization guide to show realistic role ARN format.

**Files Updated**:
- `INITIALIZATION.md`

## Critical Issues Documented (Not Fixed)

### Environment Derivation Mismatch

This is a **critical architectural issue** that needs code changes, not just documentation:

- **CDK** (`bin/cdk.ts`): Uses `execSync('git rev-parse --abbrev-ref HEAD')` → `feature/new-login`
- **Workflows**: Use `${{ env.ENVIRONMENT }}` from `extract-env` → `feature-new-login`

**Impact**: Stack names won't match between local CDK runs and workflow deployments.

**Recommendation**: The CDK should either:
1. Accept environment name via context: `cdk deploy --context env=feature-new-login`
2. Use the same sanitization logic as the `extract-env` action

### GitHub Action Interface Gap

The `extract-env` action defines `mapping_json` input but completely ignores it. This is documented as a reference implementation limitation.

## Files Modified

- `README.md` - Parameter paths, environment derivation warning
- `INITIALIZATION.md` - Role ARN examples
- `.github/actions/extract-env/README.md` - Implementation reality, environment mismatch
- `aws-cdk/docs/InfrastructureStack.md` - Parameter paths, database username
- `aws-cdk/docs/BackendStack.md` - Parameter paths
- `aws-cdk/docs/CustomDomainStack.md` - Configuration file location
- `aws-cdk/package.json` - Package name
- `back-end/package.json` - Package name
- `front-end/package.json` - Package name
- `DOCUMENTATION-FIXES.md` - This summary (new file)

## Validation

All documentation now accurately reflects the actual code implementation. Users following the documentation should no longer encounter surprises due to inconsistencies, though they will be clearly warned about the known architectural issues that require code changes to resolve.