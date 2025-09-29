# DEPRECATED: This script is no longer needed.
# 
# The Lambda functions are now built automatically using CDK bundling during deployment.
# CDK will compile the Go binaries directly from source during the CDK deployment process.
# 
# This approach provides:
# - Automatic dependency management
# - Consistent build environment
# - No need for pre-built artifacts
# - Better integration with CDK deployment process
#
# The Lambda functions are defined in:
# - cmd/load-generator/main.go
# - cmd/metrics-checker/main.go
# - lib/db-scaling/main.go (for autoscaling)
#
# They are referenced in the CDK stacks using:
# lambda.Code.fromAsset("lambda-functions/cmd/function-name", { bundling: ... })
#
# If you need to test the functions locally, use:
# cd cmd/function-name
# go run main.go

Write-Host "This script is deprecated. Lambda functions are now built automatically by CDK during deployment."
Write-Host "See the comments in this file for more information about the new approach." 