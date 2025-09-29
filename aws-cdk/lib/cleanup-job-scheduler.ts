import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as scheduler from 'aws-cdk-lib/aws-scheduler';

export interface CleanupJobSchedulerProps {
  /**
   * The environment name (e.g., 'dev', 'stage', 'prod')
   */
  environment: string;
  
  /**
   * The ECS cluster where the task will run
   */
  cluster: ecs.ICluster;
  
  /**
   * The VPC where the task will run
   */
  vpc: ec2.IVpc;
  
  /**
   * The container image URI to use for the cleanup job
   */
  imageUri: string;
  
  /**
   * The MongoDB connection string for the cleanup job
   */
  mongoConnectionString: string;
  
  /**
   * The S3 bucket ARN for the cleanup job
   */
  s3BucketArn: string;
  
  /**
   * The S3 bucket name for the cleanup job
   */
  s3BucketName: string;
  
  /**
   * The security group to use for the cleanup job
   */
  securityGroup: ec2.ISecurityGroup;
}

/**
 * A construct that creates a scheduled cleanup job using EventBridge Scheduler
 */
export class CleanupJobScheduler extends Construct {
  /**
   * The task definition for the cleanup job
   */
  public readonly taskDefinition: ecs.FargateTaskDefinition;
  
  constructor(scope: Construct, id: string, props: CleanupJobSchedulerProps) {
    super(scope, id);
    
    // Create a role for the scheduler to run ECS tasks
    const schedulerRole = new iam.Role(this, 'SchedulerRole', {
      assumedBy: new iam.ServicePrincipal('scheduler.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy')
      ]
    });
    
    // Create task execution role
    const executionRole = new iam.Role(this, 'TaskExecutionRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy')
      ]
    });
    
    // Create task role with permissions
    const taskRole = new iam.Role(this, 'TaskRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com')
    });
    
    // Update permissions to be more specific for the cleanup job
    taskRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        // MongoDB requires these SecretManager permissions to get connection details
        "secretsmanager:GetSecretValue",
        "secretsmanager:DescribeSecret",
        
        // S3 permissions specifically for listing and deleting objects
        "s3:ListBucket", 
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:DeleteObjectVersion",
        
        // CloudWatch Logs permissions
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      resources: ['*'],
    }));

    // Add a comment explaining the purpose of the cleanup job
    taskRole.addToPolicy(new iam.PolicyStatement({
      sid: 'S3BucketSpecificPermissions',
      actions: [
        "s3:ListBucket", 
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:DeleteObjectVersion"
      ],
      resources: [
        props.s3BucketArn, 
        `${props.s3BucketArn}/*`
      ],
      // This job is responsible for cleaning up stale files from S3 and old records from MongoDB
    }));
    
    // Add permission to invoke ECS tasks
    schedulerRole.addToPolicy(new iam.PolicyStatement({
      actions: ['ecs:RunTask'],
      resources: ['*']  // Will be restricted after task definition is created
    }));
    
    // Add permission to pass the task execution role
    schedulerRole.addToPolicy(new iam.PolicyStatement({
      actions: ['iam:PassRole'],
      resources: [
        executionRole.roleArn,
        taskRole.roleArn
      ]
    }));
    
    // Create a log group for the cleanup job
    const cleanupLogGroup = new logs.LogGroup(this, 'CleanupLogGroup', {
      logGroupName: `/ecs/${props.environment}-cleanup-job`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      retention: logs.RetentionDays.ONE_WEEK
    });
    
    // Create a task definition for the cleanup job using the same image
    this.taskDefinition = new ecs.FargateTaskDefinition(this, 'CleanupTaskDefinition', {
      cpu: 512, // Less CPU for a background job
      memoryLimitMiB: 1024, // Less memory for a background job
      executionRole,
      taskRole,
      family: `${props.environment}-cleanup-job`
    });
    
    // Add a tag to describe the purpose of this task
    cdk.Tags.of(this.taskDefinition).add('Purpose', 'Cleanup S3 files and MongoDB records');
    
    // Add container to the cleanup task definition
    this.taskDefinition.addContainer('cleanup', {
      image: ecs.ContainerImage.fromRegistry(props.imageUri),
      command: ['npx', 'tsx', 'cleanup-job.ts'], // Override the command to run the cleanup script
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'cleanup',
        logGroup: cleanupLogGroup
      }),
      environment: {
        NODE_ENV: 'production',
        MONGODB_CONNECTION_STRING: `${props.mongoConnectionString}&tlsInsecure=true`,
        S3_BUCKET_ARN: props.s3BucketArn,
        S3_BUCKET_NAME: props.s3BucketName,
        TASK_TYPE: 'CLEANUP' // Add environment variable to indicate this is a cleanup task
      }
    });
    
    // Update the scheduler role policy now that we have the task definition ARN
    schedulerRole.addToPolicy(new iam.PolicyStatement({
      actions: ['ecs:RunTask'],
      resources: [this.taskDefinition.taskDefinitionArn]
    }));
    
    // Create the scheduler rule to run every 5 minutes
    const schedule = new scheduler.CfnSchedule(this, 'CleanupSchedule', {
      name: `${props.environment}-cleanup-job`,
      scheduleExpression: 'rate(5 minutes)',
      flexibleTimeWindow: {
        mode: 'OFF'
      },
      target: {
        arn: 'arn:aws:scheduler:::aws-sdk:ecs:runTask',
        roleArn: schedulerRole.roleArn,
        input: JSON.stringify({
          Cluster: props.cluster.clusterArn,
          TaskDefinition: this.taskDefinition.taskDefinitionArn,
          LaunchType: 'FARGATE',
          NetworkConfiguration: {
            AwsvpcConfiguration: {
              Subnets: props.vpc.privateSubnets.map(subnet => subnet.subnetId),
              SecurityGroups: [props.securityGroup.securityGroupId],
              AssignPublicIp: 'DISABLED'
            }
          }
        }),
        retryPolicy: {
          maximumRetryAttempts: 3
        }
      }
    });
  }
} 