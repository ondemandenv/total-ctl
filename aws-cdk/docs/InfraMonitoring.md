# `InfraMonitoring` Construct

The `InfraMonitoring` construct is a crucial part of the `BackendStack`. It encapsulates all the monitoring, alarming, and dashboarding logic for the entire application infrastructure.

## Key Features

- **Centralized Dashboard**: It creates a single, unified CloudWatch Dashboard (`<environment>-ApplicationStatus`) that provides a holistic view of the application's health. The dashboard is populated with widgets from all monitored services.
- **Unified SNS Topic**: It creates a single SNS topic (`UnifiedAlarmTopic`) to which all alarms are sent, simplifying notification management.
- **Comprehensive Metrics and Alarms**: It sets up detailed metrics and corresponding alarms for various services.

### ECS and ALB Monitoring

- **Metrics**:
  - **ECS**: `CPUUtilization`, `MemoryUtilization`, `RunningTaskCount`.
  - **Container Insights**: `TaskStartupDuration`, `NetworkRx/TxBytes`, `StorageRead/WriteBytes`.
  - **ALB**: `UnHealthyHostCount`, `HTTPCode_Target_5XX_Count`, `HTTPCode_ELB_5XX_Count`, `TargetResponseTime` (Avg, p90, p99).
- **Alarms**:
  - High CPU and Memory utilization on the ECS service.
  - Low number of running tasks.
  - Unhealthy hosts in the target group.
  - High number of 5xx errors from both the target group and the ALB itself.

### Frontend Monitoring (CloudFront & S3)

- **Metrics**:
  - **CloudFront**: `5xxErrorRate`, `4xxErrorRate`.
  - **S3**: `4xxErrors` for the private bucket.
- **Alarms**:
  - High 4xx and 5xx error rates on the CloudFront distribution.
  - High number of 4xx errors from the S3 bucket.

### DocumentDB Monitoring

- **Metrics**: A wide range of metrics are monitored, including:
  - **Performance**: `CPUUtilization`, `DatabaseConnections`, `FreeableMemory`, `Read/WriteLatency`, `Read/WriteIOPS`.
  - **Storage**: `VolumeBytesUsed`.
  - **Cache Performance**: `BufferCacheHitRatio`, `IndexBufferCacheHitRatio`.
  - **Operational**: `DocumentsInserted/Returned/Updated/Deleted`, `CursorsTimedOut`.
- **Alarms**:
  - High CPU, high connections, low freeable memory.
  - High read and write latency.

### DocumentDB Auto-Scaling

- This is a key feature of the monitoring construct.
- A **Go-based Lambda function** (`DocDbAutoScalingFunction`) is created, responsible for scaling the number of DocumentDB read replicas.
- The Lambda is triggered by a dedicated **SNS Topic** (`DocDbAutoScalingTopic`).
- **Scale-out** is triggered by the existing high CPU and high connections alarms on the DocumentDB cluster.
- **Scale-in** is triggered by a new, separate alarm (`DocDbLowCpuAlarm`) that monitors for low CPU utilization specifically on the read replicas.
- The Lambda has permissions to describe, create, and delete DB instances.
- The number of replicas is scaled between a configured minimum (1) and maximum (14). 