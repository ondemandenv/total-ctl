# Infrastructure Configuration Switch

This document explains how the CDK infrastructure automatically adapts based on database configuration, deploying DocumentDB only when necessary.

## 🏗️ Infrastructure Configuration Service

The new `InfrastructureConfigService` determines whether to deploy DocumentDB based on:

1. **CDK-specific environment variables**
2. **Environment patterns** (production vs development)
3. **Cost optimization** for testing environments

## 🔧 CDK Configuration Variables

### Override Controls

| Variable | Values | Description |
|----------|--------|-------------|
| `CDK_FORCE_DOCUMENTDB` | `true`/`false` | Force DocumentDB deployment (highest priority) |
| `CDK_FORCE_IN_MEMORY` | `true`/`false` | Force in-memory (skip DocumentDB) |
| `CDK_DATABASE_TYPE` | `documentdb`/`in-memory` | Explicit database type for infrastructure |

### Priority Resolution

1. **`CDK_FORCE_DOCUMENTDB=true`** - Deploys DocumentDB regardless of environment
2. **`CDK_FORCE_IN_MEMORY=true`** - Skips DocumentDB deployment
3. **`CDK_DATABASE_TYPE=documentdb`** - Explicit DocumentDB deployment
4. **`CDK_DATABASE_TYPE=in-memory`** - Explicit in-memory (no DocumentDB)
5. **Environment auto-detection** - Production environments → DocumentDB, Testing → In-memory

## 💰 Cost Impact

### DocumentDB Deployment
```bash
CDK_FORCE_DOCUMENTDB=true cdk deploy
```

**Components Deployed:**
- ✅ DocumentDB cluster (db.t4g.medium)
- ✅ Security groups and VPC configuration
- ✅ CloudWatch dashboards and alarms
- ✅ Database monitoring and backup
- ✅ Parameter Store configuration

**Cost**: ~$350/month | **Deployment**: ~18 minutes

### In-Memory Deployment
```bash
CDK_FORCE_IN_MEMORY=true cdk deploy
```

**Components Deployed:**
- ✅ ECS cluster and application services
- ✅ S3 buckets and CloudFront distribution
- ✅ Load balancers and networking
- ✅ Parameter Store configuration
- ❌ DocumentDB cluster (SKIPPED)
- ❌ Database monitoring (SKIPPED)

**Cost**: ~$75/month | **Deployment**: ~7 minutes

## 🎯 Deployment Examples

### Force DocumentDB for Testing
```bash
# Deploy DocumentDB for stateless testing in development
CDK_FORCE_DOCUMENTDB=true cdk deploy total-ctl-infra-feature-branch
```

### Force In-Memory for Cost Optimization
```bash
# Skip DocumentDB even in production-named environments
CDK_FORCE_IN_MEMORY=true cdk deploy total-ctl-infra-prod-testing
```

### Environment-Based Auto-Detection
```bash
# Production environments automatically get DocumentDB
cdk deploy total-ctl-infra-main

# Feature environments automatically get in-memory
cdk deploy total-ctl-infra-feature-new-api
```

## 📊 Infrastructure Outputs

The CDK stack outputs comprehensive configuration information:

```json
{
  "environment": "feature-branch",
  "databaseType": "in-memory", 
  "documentDbDeployed": false,
  "reason": "Development/testing environment detected",
  "estimatedMonthlyCost": 75,
  "estimatedDeploymentTime": 7
}
```

## 🔍 Parameter Store Integration

The infrastructure stores configuration details in Parameter Store:

| Parameter | Description |
|-----------|-------------|
| `/total-ctl/{env}/database/type` | `documentdb` or `in-memory` |
| `/total-ctl/{env}/infrastructure/database-deployed` | `true` or `false` |
| `/total-ctl/{env}/infrastructure/config-reason` | Reason for configuration choice |
| `/total-ctl/{env}/infrastructure/monthly-cost` | Estimated monthly cost |
| `/total-ctl/{env}/infrastructure/deployment-time` | Deployment time estimate |

## ⚠️ Configuration Warnings

### DocumentDB Deployment Warning
```
✅ DOCUMENTDB INFRASTRUCTURE DEPLOYMENT:
   ┌─────────────────────────────────────────────────────────────┐
   │  🏗️  DEPLOYING PRODUCTION-GRADE DATABASE                   │
   │                                                             │
   │  💰 Cost Impact: ~$300-400/month                           │
   │  🕒 Deployment Time: ~15-20 minutes                        │
   │  🔄 Stateless Testing: ENABLED                             │
   └─────────────────────────────────────────────────────────────┘
```

### In-Memory Deployment Warning
```
🧠 IN-MEMORY INFRASTRUCTURE DEPLOYMENT:
   ┌─────────────────────────────────────────────────────────────┐
   │  💡 COST-OPTIMIZED TESTING INFRASTRUCTURE                  │
   │                                                             │
   │  💰 Cost Impact: ~$50-100/month                            │
   │  🕒 Deployment Time: ~5-8 minutes                          │
   │  🔄 Stateless Testing: LIMITED                             │
   └─────────────────────────────────────────────────────────────┘

⚠️  IN-MEMORY INFRASTRUCTURE LIMITATIONS:
   • Applications will use in-memory storage at runtime
   • Cannot test stateless ECS container behavior
   • Data lost on container restart or scaling events
```

## 🧪 Testing Infrastructure Configurations

### Test DocumentDB Deployment
```bash
# Set environment variables and deploy
export CDK_FORCE_DOCUMENTDB=true
cdk deploy total-ctl-infra-test --outputs-file outputs.json

# Verify DocumentDB was created
aws docdb describe-db-clusters --query 'DBClusters[0].DBClusterIdentifier'
```

### Test In-Memory Deployment
```bash
# Set environment variables and deploy  
export CDK_FORCE_IN_MEMORY=true
cdk deploy total-ctl-infra-test --outputs-file outputs.json

# Verify no DocumentDB clusters exist
aws docdb describe-db-clusters --query 'length(DBClusters)'
# Should return 0
```

### Test Auto-Detection
```bash
# Production environment (should deploy DocumentDB)
cdk deploy total-ctl-infra-main

# Feature environment (should skip DocumentDB)
cdk deploy total-ctl-infra-feature-test
```

## 🔄 CI/CD Integration

### Environment-Specific Deployment
```yaml
# .github/workflows/infrastructure.yml
deploy:
  strategy:
    matrix:
      environment: [main, staging, feature-branch]
  steps:
    - name: Set Infrastructure Configuration
      run: |
        if [[ "${{ matrix.environment }}" == "main" ]]; then
          echo "CDK_FORCE_DOCUMENTDB=true" >> $GITHUB_ENV
        elif [[ "${{ matrix.environment }}" == "staging" ]]; then
          echo "CDK_DATABASE_TYPE=documentdb" >> $GITHUB_ENV  
        else
          echo "CDK_FORCE_IN_MEMORY=true" >> $GITHUB_ENV
        fi
    
    - name: Deploy Infrastructure
      run: cdk deploy total-ctl-infra-${{ matrix.environment }}
```

### Cost-Aware Deployment
```yaml
# Only deploy DocumentDB for critical environments
deploy-database:
  if: contains(github.ref, 'main') || contains(github.ref, 'prod')
  environment:
    CDK_FORCE_DOCUMENTDB: true
  run: cdk deploy total-ctl-infra-${{ github.ref_name }}

deploy-cost-optimized:
  if: "!contains(github.ref, 'main') && !contains(github.ref, 'prod')"
  environment:
    CDK_FORCE_IN_MEMORY: true
  run: cdk deploy total-ctl-infra-${{ github.ref_name }}
```

## 📋 Decision Matrix

| Environment Pattern | Auto-Detected Config | Override Example | Monthly Cost |
|---------------------|----------------------|------------------|--------------|
| `main`, `prod-*` | DocumentDB | `CDK_FORCE_IN_MEMORY=true` | $350 → $75 |
| `feature-*`, `dev-*` | In-Memory | `CDK_FORCE_DOCUMENTDB=true` | $75 → $350 |
| `staging`, `test-*` | In-Memory | `CDK_DATABASE_TYPE=documentdb` | $75 → $350 |
| Custom environments | In-Memory | Set explicit configuration | Varies |

## 🎯 Best Practices

### 1. Cost Optimization
```bash
# Use in-memory for development iterations
CDK_FORCE_IN_MEMORY=true

# Use DocumentDB only for production and critical testing
CDK_FORCE_DOCUMENTDB=true  # Only when needed
```

### 2. Testing Strategy
```bash
# Development: Fast, cost-effective
CDK_FORCE_IN_MEMORY=true cdk deploy dev-env

# Pre-production: Realistic, stateless validation  
CDK_FORCE_DOCUMENTDB=true cdk deploy staging-env

# Production: Full infrastructure
# Auto-detected based on environment name
```

### 3. CI/CD Optimization
```bash
# Feature branches: Skip DocumentDB for cost savings
if [[ $BRANCH_NAME != "main" ]]; then
  export CDK_FORCE_IN_MEMORY=true
fi
```

The infrastructure configuration switch provides **automatic cost optimization** while allowing **explicit control** when stateless testing is required! 🎉