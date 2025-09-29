# `CleanupJobScheduler` Construct

The `CleanupJobScheduler` is a self-contained construct, instantiated within the `BackendStack`, that sets up a recurring cleanup task.

## Key Resources

- **Scheduled Task**:
  - An **EventBridge Scheduler (`scheduler.CfnSchedule`)** is created to trigger the cleanup task.
  - The schedule is configured to run at a fixed rate of every 5 minutes.

- **ECS Fargate Task Definition**:
  - A new, separate Fargate task definition is created specifically for the cleanup job.
  - It is configured with a smaller resource footprint (512 CPU, 1024 MiB memory) compared to the main service, as it's a background job.
  - It uses the **same container image** as the main application service (`props.imageUri`).
  - The `command` for the container is overridden to be `['npx', 'tsx', 'cleanup-job.ts']`, ensuring that it runs the cleanup script instead of the main application entry point.
  - A `TASK_TYPE` environment variable is set to `CLEANUP` to allow the application code to differentiate its behavior.
  - It has its own dedicated **Log Group** (`/ecs/{environment}-cleanup-job`).

- **IAM Roles**:
  - **`SchedulerRole`**: An IAM role assumed by the EventBridge Scheduler, with permissions to run the ECS task (`ecs:RunTask`).
  - **`TaskRole`**: A dedicated IAM role for the cleanup task itself. It has more limited permissions than the main service's task role, scoped to what the cleanup job needs:
    - `secretsmanager:GetSecretValue` to retrieve the database connection string.
    - S3 permissions to list and delete objects from the private bucket.
    - CloudWatch Logs permissions to write logs.

- **Networking**:
  - The scheduled task is configured to run in the private subnets of the VPC and uses the security group provided in the props.
  - A public IP is not assigned. 