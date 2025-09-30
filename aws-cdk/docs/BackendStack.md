# `BackendStack`

The `BackendStack` is responsible for deploying the containerized backend application and all its related resources. It depends on the resources created in the `InfrastructureStack`.

## Key Resources

- **Application Load Balancer (ALB)**:
  - An internet-facing ALB is created to route traffic to the backend service.
  - A **Security Group** is attached to the ALB that restricts inbound traffic on port 443 to only the CloudFront managed prefix list, ensuring that the backend can only be accessed through the CloudFront distribution.
  - An **ACM Certificate** is created for the ALB's domain (`<environment>-lb.<baseDomainName>`).
  - An **HTTPS listener** is configured on port 443.
  - An **HTTP to HTTPS redirect** is configured on port 80.
  - A **Route 53 A-record** is created to point the ALB's domain to the load balancer itself.

- **ECS Fargate Service (`ecs.FargateService`)**:
  - This is the core of the backend, running the application in a Fargate container.
  - The **Task Definition** is configured with 4096 CPU units and 8192 MiB of memory.
  - The container image is pulled from the ECR repository created in the `InfrastructureStack`, using an image tag looked up from an SSM parameter (`/total-ctl/{environment}/backend/ecr-imgTag`).
  - **Environment Variables** are passed to the container, including the `MONGODB_CONNECTION_STRING`, S3 bucket details, and `API_PORT`.
  - **Auto-scaling** is configured to adjust the task count between 2 and 4 instances based on CPU and Memory utilization (targeting 80%).
  - **IAM Roles**: Separate task execution and task roles are created with permissions to access secrets, S3, Rekognition, Transcribe, and more.

- **`CleanupJobScheduler` Construct**:
  - An instance of the `CleanupJobScheduler` construct is created. This sets up a scheduled task to run every 5 minutes.
  - It uses the same container image as the main service but overrides the `command` to run `['npx', 'tsx', 'cleanup-job.ts']`.
  - It runs in a separate security group within the VPC.
  - It creates a separate, smaller task definition for the cleanup job (512 CPU, 1024 MiB memory).
  - It adds a `TASK_TYPE: 'CLEANUP'` environment variable to the container.

- **`InfraMonitoring` Construct**:
  - An instance of the `InfraMonitoring` construct is created, passing in all the relevant resources (Fargate service, ALB, ECS cluster, etc.) to set up comprehensive monitoring and alerting.

- **SSM Parameter Store**:
  - Two SSM parameters are created:
    - `/total-ctl/{environment}/backend/service-url`: The public URL of the service (via CloudFront).
    - `/total-ctl/{environment}/backend/service-name`: The name of the Fargate service.

## Outputs

- Like the `InfrastructureStack`, this stack doesn't have explicit CfnOutput values, but it passes its public properties to other constructs that might need them. The key outputs are stored in SSM. 