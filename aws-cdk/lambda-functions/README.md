# DocumentDB Auto Scaling Lambda Functions

This directory contains Go-based Lambda functions for DocumentDB auto scaling and testing.

## Functions

### 1. Auto Scaling Function (`lib/db-scaling/main.go`)
- **Purpose**: Handles DocumentDB cluster auto scaling based on metrics
- **Trigger**: EventBridge Scheduler (runs every minute)
- **Features**: 
  - Queries CloudWatch metrics directly
  - Makes intelligent scaling decisions
  - Respects cooldown periods
  - Sends SNS notifications

### 2. Load Generator (`cmd/load-generator/main.go`)
- **Purpose**: Generates load on DocumentDB for testing auto scaling
- **Trigger**: Step Functions (for orchestrated testing)
- **Features**:
  - Configurable workload patterns
  - Multiple concurrent threads
  - Various operation types (read, write, mixed)

### 3. Metrics Checker (`cmd/metrics-checker/main.go`)
- **Purpose**: Monitors DocumentDB metrics and scaling status
- **Trigger**: Step Functions (for testing validation)
- **Features**:
  - CloudWatch metrics analysis
  - Cluster state monitoring
  - Scaling effectiveness evaluation

## Building Lambda Functions

**Note:** The Lambda functions are now built automatically by the AWS CDK during deployment using Go-based bundling. You do not need to build the binaries manually before deploying.

The CDK configuration in `lib/monitoring/infra-monitoring.ts` uses `lambda.Code.fromAsset` with a bundling option that compiles the Go source code into a `bootstrap` executable within the deployment package.

### Manual Builds (for local testing)

If you need to build or run the functions locally for testing, you can use the standard `go build` or `go run` commands from within each function's directory.

```bash
# To run the load generator locally:
cd cmd/load-generator
go run main.go

# To build a Linux binary for the metrics checker:
cd cmd/metrics-checker
GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build -ldflags="-s -w" -o bootstrap main.go
```

## Deployment

The CDK stacks reference these functions using `lambda.Code.fromAsset()` and expect a `bootstrap` binary in each directory:

- `lib/db-scaling/bootstrap` - Auto scaling function
- `cmd/load-generator/bootstrap` - Load generator function  
- `cmd/metrics-checker/bootstrap` - Metrics checker function

## Architecture Changes

### From Alarm-Based to Scheduler-Based Auto Scaling

**Old Approach (Deprecated):**
- CloudWatch alarms trigger SNS notifications
- Lambda function responds to SNS messages
- Issues: Alarms only fire on state changes, missed scaling opportunities

**New Approach (Current):**
- EventBridge Scheduler runs Lambda every minute
- Lambda queries CloudWatch metrics directly
- Makes scaling decisions based on current conditions
- More responsive and reliable

### Benefits of New Approach

1. **Continuous Monitoring**: Runs every minute regardless of alarm states
2. **Better Decision Making**: Evaluates all metrics together
3. **No Missed Opportunities**: Doesn't depend on alarm state changes
4. **Intelligent Cooldowns**: Per-instance cooldown checking
5. **Prioritized Actions**: Scale-out takes priority over scale-in

## Environment Variables

### Auto Scaling Function
- `CLUSTER_IDENTIFIER`: DocumentDB cluster to manage
- `MAX_READ_REPLICAS`: Maximum number of read replicas (default: 10)
- `MIN_READ_REPLICAS`: Minimum number of read replicas (default: 1)
- `INSTANCE_CLASS`: Instance class for new replicas (default: db.r6g.large)
- `COOLDOWN_MINUTES`: Cooldown period between scaling actions (default: 15)
- `CPU_SCALE_OUT_THRESHOLD`: CPU threshold for scaling out (default: 70)
- `CPU_SCALE_IN_THRESHOLD`: CPU threshold for scaling in (default: 30)
- `CONNECTIONS_SCALE_OUT_THRESHOLD`: Connection threshold for scaling out (default: 400)
- `EVALUATION_PERIODS`: Number of minutes to evaluate (default: 3)


### Load Generator Function
- `MONGODB_CONNECTION_STRING`: DocumentDB connection string
- `DURATION_MINUTES`: Test duration (default: 5)
- `NUM_THREADS`: Concurrent threads (default: 5)
- `OPERATION_TYPE`: Operation type (read, write, mixed)

### Metrics Checker Function
- `CLUSTER_IDENTIFIER`: DocumentDB cluster to monitor
- `ENVIRONMENT`: Environment name (dev, stage, prod)

## Testing

### Manual Testing
```bash
# Test individual functions locally (requires Go)
cd cmd/load-generator && go run main.go
cd cmd/metrics-checker && go run main.go
```

### Integration Testing
Use the Step Functions workflow defined in `test-autoscaling-stack.ts` for comprehensive testing.

## Monitoring

All functions include comprehensive logging and CloudWatch integration:
- Detailed execution logs
- Performance metrics
- Error tracking
- Custom dashboards

## Troubleshooting

### Common Issues

1. **Missing bootstrap binary**: Ensure binaries are built and present
2. **Permission errors**: Check IAM roles and policies
3. **Network issues**: Verify VPC and security group configuration
4. **Timeout errors**: Adjust Lambda timeout settings

### Logs

Check CloudWatch Logs for detailed execution information:
- `/aws/lambda/[function-name]`
- Step Functions execution logs
- Auto scaling notifications in SNS 