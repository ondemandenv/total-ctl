# Database Configuration & Stateless Testing Guide

This document explains how to configure database backends and understand the implications for testing stateless ECS applications.

## 🔧 Configuration Options

### Environment Variables

| Variable | Values | Description |
|----------|--------|-------------|
| `DATABASE_TYPE` | `documentdb`, `in-memory` | Explicitly set database type |
| `FORCE_IN_MEMORY_DB` | `true`, `false` | Force in-memory storage (highest priority) |
| `MONGODB_CONNECTION_STRING` | Connection string | Enable DocumentDB when provided |
| `NODE_ENV` | `test`, `development`, `production` | Environment context |

### Configuration Priority (Highest to Lowest)

1. **`FORCE_IN_MEMORY_DB=true`** - Overrides all other settings
2. **`DATABASE_TYPE`** - Explicit database type selection
3. **`MONGODB_CONNECTION_STRING`** - Auto-detect based on connection availability
4. **Environment patterns** - Branch/environment name detection

## 📊 Database Types

### In-Memory Storage

**Best for**: Development, unit testing, cost optimization

```bash
# Force in-memory storage
DATABASE_TYPE=in-memory

# Or use the force flag
FORCE_IN_MEMORY_DB=true
```

**Characteristics**:
- ✅ **Fast**: Instant startup, zero latency
- ✅ **Cost-effective**: No infrastructure costs
- ✅ **Isolated**: Each container has independent data
- ❌ **Ephemeral**: Data lost on container restart
- ❌ **Cannot test stateless behavior**

### DocumentDB Storage

**Best for**: Integration testing, production environments, stateless validation

```bash
# Use DocumentDB with connection string
DATABASE_TYPE=documentdb
MONGODB_CONNECTION_STRING="mongodb://username:password@cluster.region.docdb.amazonaws.com:27017/?tls=true&replicaSet=rs0"
```

**Characteristics**:
- ✅ **Persistent**: Data survives container restarts
- ✅ **Stateless capable**: Tests true ECS behavior
- ✅ **Production-like**: Realistic environment simulation
- ✅ **Multi-container ready**: Shared state across instances
- ❌ **Higher cost**: Infrastructure expenses
- ❌ **Slower startup**: Network connection overhead

## ⚠️ Stateless Testing Limitations

### Why In-Memory Storage Can't Test Stateless Behavior

ECS containers are designed to be **stateless** - they can be started, stopped, and replaced at any time. In-memory storage fundamentally conflicts with this principle:

#### **Container Lifecycle Events**

| Event | In-Memory Behavior | DocumentDB Behavior | Production Reality |
|-------|-------------------|---------------------|-------------------|
| **Container Restart** | ❌ All data lost | ✅ Data persists | ✅ Data persists |
| **Auto-scaling Up** | ❌ New container has empty state | ✅ Shared data access | ✅ Shared data access |
| **Auto-scaling Down** | ❌ Data in terminated container lost | ✅ Data remains available | ✅ Data remains available |
| **Rolling Deployment** | ❌ Data inconsistency during rollout | ✅ Consistent data access | ✅ Consistent data access |
| **Load Balancer Routing** | ❌ User sees different data per container | ✅ Consistent user experience | ✅ Consistent user experience |

#### **Real-World Scenarios That Fail With In-Memory**

1. **User Session Management**
   ```bash
   # In-memory: User login on Container A, gets routed to Container B → "Not logged in"
   # DocumentDB: User login persists across all containers → "Logged in"
   ```

2. **Shopping Cart Persistence**
   ```bash
   # In-memory: Add item on Container A, checkout on Container B → "Empty cart"
   # DocumentDB: Cart persists across containers → "Items available"
   ```

3. **File Upload Processing**
   ```bash
   # In-memory: Upload metadata on Container A, process on Container B → "File not found"
   # DocumentDB: Metadata shared across containers → "Processing successful"
   ```

## 🧪 Testing Strategies

### Development Testing (In-Memory)
```bash
# Fast iteration for feature development
FORCE_IN_MEMORY_DB=true npm run dev
```
- ✅ Use for unit tests
- ✅ Use for feature development
- ✅ Use for API contract testing
- ❌ Don't use for integration testing
- ❌ Don't use for production validation

### Integration Testing (DocumentDB)
```bash
# Realistic environment testing
DATABASE_TYPE=documentdb
MONGODB_CONNECTION_STRING="mongodb://..."
npm run test:integration
```
- ✅ Use for end-to-end testing
- ✅ Use for stateless behavior validation
- ✅ Use for performance testing
- ✅ Use for production readiness testing

## 🔍 Configuration Validation

### Check Current Configuration
```bash
curl http://localhost:3001/health | jq '.database'
```

### Expected Response (In-Memory)
```json
{
  "type": "in-memory",
  "environment": "feature-branch",
  "isStatelessCapable": false,
  "warnings": [
    "In-memory storage cannot test stateless ECS container behavior",
    "Data will be lost on container restart or scaling events"
  ],
  "recommendations": [
    "Use DATABASE_TYPE=documentdb for stateless testing",
    "Deploy to production-like environment for full validation"
  ]
}
```

### Expected Response (DocumentDB)
```json
{
  "type": "documentdb", 
  "environment": "main",
  "isStatelessCapable": true,
  "warnings": [],
  "recommendations": []
}
```

## 🚀 Best Practices

### 1. Environment-Specific Defaults
```bash
# .env.development
DATABASE_TYPE=in-memory

# .env.staging  
DATABASE_TYPE=documentdb
MONGODB_CONNECTION_STRING="mongodb://..."

# .env.production
DATABASE_TYPE=documentdb
MONGODB_CONNECTION_STRING="mongodb://..."
```

### 2. CI/CD Pipeline Configuration
```yaml
# Fast unit tests
test:unit:
  environment:
    FORCE_IN_MEMORY_DB: true
    
# Comprehensive integration tests  
test:integration:
  environment:
    DATABASE_TYPE: documentdb
    MONGODB_CONNECTION_STRING: ${{ secrets.MONGODB_CONNECTION_STRING }}
```

### 3. Local Development Workflow
```bash
# Quick development iteration
DATABASE_TYPE=in-memory npm run dev

# Pre-deployment validation
DATABASE_TYPE=documentdb npm run test:full
```

## 📋 Configuration Examples

### Force In-Memory (Development)
```bash
export FORCE_IN_MEMORY_DB=true
npm start
```

### Use DocumentDB (Staging/Production)
```bash
export DATABASE_TYPE=documentdb
export MONGODB_CONNECTION_STRING="mongodb://user:pass@cluster.region.docdb.amazonaws.com:27017/?tls=true&replicaSet=rs0"
npm start
```

### Environment Auto-Detection (Default)
```bash
# Will automatically choose based on environment name
# Uses single source of truth: aws-cdk/bin/branch-env-name.js
# Production branches → DocumentDB
# Feature branches → In-Memory
npm start
```

## 🎯 Decision Matrix

| Use Case | Recommended Database | Reasoning |
|----------|---------------------|-----------|
| **Local Development** | In-Memory | Fast iteration, cost-free |
| **Unit Testing** | In-Memory | Isolated, predictable state |
| **Integration Testing** | DocumentDB | Realistic behavior validation |
| **Performance Testing** | DocumentDB | Production-like conditions |
| **Production** | DocumentDB | Stateless, reliable, persistent |
| **Demo Environments** | In-Memory | Cost optimization |
| **Load Testing** | DocumentDB | Accurate scaling behavior |

Remember: **In-memory storage is excellent for development velocity, but DocumentDB is essential for production readiness validation.**