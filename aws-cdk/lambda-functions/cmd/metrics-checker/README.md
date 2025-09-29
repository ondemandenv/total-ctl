# Metrics Checker

This directory contains the source code for a Go-based AWS Lambda function that checks CloudWatch metrics.

## Building

To build the binary, run the following command from this directory (`aws-cdk/lambda-functions/cmd/metrics-checker`):

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

- `CLUSTER_IDENTIFIER`: DocumentDB cluster identifier to monitor
- `ENVIRONMENT`: Environment name (dev, stage, prod)

## Function

This function:
1. Queries CloudWatch metrics for DocumentDB
2. Checks current cluster state (number of instances)
3. Evaluates scaling effectiveness
4. Reports metrics and scaling status
5. Used by Step Functions for orchestrated testing 