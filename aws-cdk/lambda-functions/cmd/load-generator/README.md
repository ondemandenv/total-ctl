# Load Generator

This directory contains the source code for a Go-based AWS Lambda function that acts as a load generator.

## Building

To build the binary, run the following command from this directory (`aws-cdk/lambda-functions/cmd/load-generator`):

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

## Deployment

The CDK stack will look for the `bootstrap` binary in this directory. Make sure it exists before deploying.

## Environment Variables

- `MONGODB_CONNECTION_STRING`: Connection string for DocumentDB
- `DURATION_MINUTES`: How long to run the load test (default: 5)
- `NUM_THREADS`: Number of concurrent threads (default: 10)
- `OPERATION_TYPE`: Type of operations to perform (read, write, mixed)

## Function

This function:
1. Connects to DocumentDB
2. Performs various database operations (insert, query, update, delete)
3. Simulates realistic workload patterns
4. Reports metrics and completion status 