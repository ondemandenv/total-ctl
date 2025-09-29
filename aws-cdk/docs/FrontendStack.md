# `FrontendStack`

The `FrontendStack` is a simple stack responsible for deploying the static assets of the frontend application to the public S3 bucket.

## Key Resources

- **S3 Bucket Deployment (`s3deploy.BucketDeployment`)**:
  - This is the primary resource in this stack. It takes the contents of the `../front-end/build` directory and uploads them to the `cfPubBucket` provided by the `InfrastructureStack`.
  - **Memory and Storage**: The deployment construct is configured with an increased `memoryLimit` (2048 MiB) and `ephemeralStorageSize` (2 GiB), which can be necessary for large frontend builds or asset directories.
  - **Dummy File**: A dummy file (`_dummy_placeholder.txt`) is created in the build directory. This ensures that the deployment resource has something to deploy even if the `build` directory is empty, preventing a CDK error.

## Important Notes

- **CloudFront Invalidation**: The `distribution` and `distributionPaths` properties of the `BucketDeployment` construct are commented out. This means that after a new deployment, the CloudFront cache is **not** automatically invalidated. Changes to the frontend may not be visible until the CloudFront cache expires or is manually invalidated.

## Outputs

- **`frontendDomainUrl` (`CfnOutput`)**: The full URL to the deployed frontend application (e.g., `https://main.sandbox.example.com/`).
- **`frontendDistributionId` (`CfnOutput`)**: The ID of the CloudFront distribution, which is useful for manual cache invalidation. This is also exported with the name `frontendDistributionId`. 