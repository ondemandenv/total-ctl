# DocumentDB Auto Scaling Lambda Function

This Go Lambda function provides automatic scaling for Amazon DocumentDB read replicas based on CloudWatch metrics.

## Features

- **Automatic Scale Out**: Adds read replicas when CPU utilization or connection count is high.
- **Automatic Scale In**: Removes read replicas when CPU utilization is low.
- **Safety Limits**: Maintains a configurable minimum and maximum number of read replicas.
- **Cooldown Protection**: Prevents rapid scaling operations that could cause conflicts.
- **State Awareness**: Checks instance states before deletion to avoid conflicts.
- **Error Handling**: Comprehensive logging and graceful error handling.

## Architecture

The auto-scaling logic is triggered by an **Amazon EventBridge Scheduler** that invokes this Lambda function at a regular interval (e.g., every minute). The function then performs the following steps:

1.  **Queries CloudWatch Metrics**: It directly queries the relevant CloudWatch metrics for the DocumentDB cluster, such as `CPUUtilization` and `DatabaseConnections`.
2.  **Makes Scaling Decision**: Based on the current metric values and predefined thresholds, it decides whether to scale out (add a replica) or scale in (remove a replica).
3.  **Executes Scaling Action**: It calls the AWS API to create or delete a DocumentDB instance.
4.  **Respects Cooldown**: It checks for recent scaling activities to avoid triggering new actions too quickly.

This scheduler-based approach is more reliable than the previous alarm-based trigger, as it continuously monitors the system state rather than only reacting to alarm state changes.

## Project Structure

```
lib/db-scaling/
├── main.go           # Main Lambda function code
├── go.mod           # Go module dependencies
├── Makefile         # Build and development commands
└── README.md        # This file
```

## Development

### Prerequisites

- Go 1.21 or later
- AWS CLI configured
- Make (optional, for using Makefile commands)

### Building

#### On Linux/macOS (with Make):
```bash
# Download dependencies
make deps

# Build for Lambda deployment
make build

# Build for local testing
make build-local
```

#### On Windows (with PowerShell):
```powershell
# Build for Lambda deployment
.\build.ps1

# Build for local testing
.\build.ps1 local

# Clean build artifacts
.\build.ps1 clean

# Show help
.\build.ps1 help
```

#### Manual Go commands:
```bash
# Download dependencies
go mod download
go mod tidy

# Build for Lambda (Linux)
GOOS=linux GOARCH=amd64 go build -o bootstrap main.go

# Build for local testing
go build -o docdb-auto-scaling main.go
```

### Testing

```bash
# Run tests
make test

# Format code
make fmt

# Lint code (requires golangci-lint)
make lint
```

### Deployment

The Lambda function is deployed as part of the CDK infrastructure stack. The CDK will automatically compile the Go code during deployment using Docker bundling.

#### Option 1: Automatic compilation (Recommended)
Simply deploy the CDK stack - no manual build required:
```bash
cd ../..  # Go to CDK root
cdk deploy
```

#### Option 2: Manual build then deploy
If you prefer to build manually first:

**Linux/macOS:**
```bash
make build
cd ../..
cdk deploy
```

**Windows:**
```powershell
.\build.ps1
cd ..\..
cdk deploy
```

#### Development Workflow
1. Make changes to `main.go`
2. Test locally if needed: `.\build.ps1 local` (Windows) or `make build-local` (Linux/macOS)
3. Deploy: `cd ..\.. && cdk deploy`

The CDK bundling process will:
- Download Go dependencies
- Compile the code for Linux/AMD64
- Package it for Lambda deployment

## Configuration

The function uses the following environment variables (set by CDK):

- `CLUSTER_IDENTIFIER`: The DocumentDB cluster identifier to manage
- `MAX_READ_REPLICAS`: Maximum number of read replicas (default: 14)
- `MIN_READ_REPLICAS`: Minimum number of read replicas (default: 1)  
- `INSTANCE_CLASS`: Instance class for new replicas (default: db.r6g.large)
- `COOLDOWN_MINUTES`: Minutes to wait between scaling operations (default: 20)

## Scaling Logic

### Scale Out (`scaleOut` function)

1. Describes the current DocumentDB cluster
2. Counts existing read replicas
3. Checks if maximum limit (14 replicas) is reached
4. Creates a new read replica with auto-generated name
5. Uses the same instance class as existing instances

### Scale In (`scaleIn` function)

1. Describes the current DocumentDB cluster
2. Gets list of read replicas
3. Ensures minimum replica count (1) is maintained
4. Removes the most recently created read replica
5. Deletes the instance without final snapshot

## Error Handling

- Comprehensive logging for all operations
- Graceful handling of AWS API errors
- Validation of cluster existence and state
- Safe handling of edge cases (no replicas, max replicas reached)

## Dependencies

- `github.com/aws/aws-lambda-go`: AWS Lambda Go runtime
- `github.com/aws/aws-sdk-go`: AWS SDK for Go (v1)

## Monitoring

The function logs all operations and can be monitored via:

- CloudWatch Logs: `/aws/lambda/[function-name]`
- CloudWatch Metrics: Lambda function metrics
- DocumentDB Metrics: Cluster and instance metrics

## Troubleshooting

### Common Issues

1. **Permission Errors**: Ensure the Lambda execution role has DocumentDB permissions
2. **Cluster Not Found**: Verify the cluster identifier in environment variables
3. **Instance Creation Failures**: Check DocumentDB service limits and quotas

### Debugging

Enable detailed logging by checking CloudWatch Logs for the Lambda function. All operations are logged with appropriate log levels.

To build the binary, run the following command from this directory (`aws-cdk/lib/db-scaling`):

### For Linux and macOS:

```sh
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o bootstrap main.go
```

### For Windows (Command Prompt):

```cmd
set CGO_ENABLED=0
set GOOS=linux
set GOARCH=amd64
go build -o bootstrap main.go
```

### For Windows (PowerShell):

```powershell
$env:CGO_ENABLED=0
$env:GOOS="linux"
$env:GOARCH="amd64"
go build -o bootstrap main.go
```

This will produce a `bootstrap` executable file. This file must be present in this directory when you run `cdk deploy`.

**Note:** The `CGO_ENABLED=0` flag is added to ensure a statically linked binary, which prevents potential issues with glibc versions in the Lambda environment. 