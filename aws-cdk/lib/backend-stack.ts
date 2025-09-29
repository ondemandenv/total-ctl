import * as cdk from 'aws-cdk-lib';
import {Construct} from 'constructs';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import {InfrastructureStack} from './infrastructure-stack';

import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53targets from 'aws-cdk-lib/aws-route53-targets';
import {SecurityGroup, Peer, Port} from 'aws-cdk-lib/aws-ec2';
import {CleanupJobScheduler} from './cleanup-job-scheduler';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import { InfraMonitoring } from './monitoring/infra-monitoring';

// CloudFront IP prefix list IDs
const CF_IP_PREFIX_LIST_ID_Map = {
    "us-east-1": "pl-3b927c52",
    "eu-west-1": "pl-4fa04526",
    "ap-southeast-1": "pl-31a34658",
    "us-east-2": "pl-b6a144df",
    "eu-west-2": "pl-93a247fa",
    "us-west-2": "pl-82a045eb",
    "ap-southeast-2": "pl-b8a742d1"
} as Record<string, string>;

export interface BackendStackProps extends cdk.StackProps {
    infrastructure: InfrastructureStack;
    environment: string;
}

export class BackendStack extends cdk.Stack {
    public readonly loadBalancer: elbv2.ApplicationLoadBalancer;
    public readonly httpsListenerTargetGroup: elbv2.ApplicationTargetGroup;
    public readonly fargateService: ecs.FargateService;
    public readonly centralDashboard: cloudwatch.Dashboard;
    public readonly infraMonitoring: InfraMonitoring;

    constructor(scope: Construct, id: string, props: BackendStackProps) {
        super(scope, id, props);
        const API_PORT = 80;

        const paramPrefix = `/total-ctl/${props.environment}`;

        const imageTagParamPath = `${paramPrefix}/backend/ecr-imgTag`;
        const imageTag = ssm.StringParameter.valueFromLookup(this, imageTagParamPath, 'latest');

        // Get infrastructure resources directly
        const vpc = props.infrastructure.vpc;
        const cluster = props.infrastructure.ecsCluster;
        const cfDistr = props.infrastructure.cfDistr;
        const hostedZone = props.infrastructure.hostedZone;
        const lbDomainName = props.infrastructure.lbDomainName;

        // Check if this environment uses DocumentDB or in-memory storage
        const shouldUseDocumentDB = props.infrastructure.infraConfig.shouldDeployDocumentDB();

        // Construct imageUri and mongoConnectionString early for reuse
        const imageUri = `${props.infrastructure.ecrRepository.repositoryUri}:${imageTag}`;
        console.log(`Using image URI: ${imageUri} for main service and cleanup job`);

        let mongoConnectionString = "";
        
        if (shouldUseDocumentDB && props.infrastructure.docDbCluster) {
            // Use DocumentDB for environments where it's deployed
            const dbUsername = props.infrastructure.dbCredentialsSecret.secretValueFromJson("username").unsafeUnwrap();
            const dbPassword = props.infrastructure.dbCredentialsSecret.secretValueFromJson("password");
            mongoConnectionString =
                `mongodb://${dbUsername}:${dbPassword.unsafeUnwrap()}@${props.infrastructure.docDbCluster.clusterEndpoint.socketAddress}/` +
                `?tls=true&replicaSet=rs0&readPreference=secondaryPreferred&retryWrites=false`;
            console.log(`🗄️ Using DocumentDB for ${props.environment} environment`);
        } else {
            // Use in-memory storage for environments without DocumentDB
            mongoConnectionString = ""; // Empty string signals in-memory usage
            console.log(`🧠 Using in-memory storage for ${props.environment} environment`);
            if (!shouldUseDocumentDB) {
                console.log(`   Reason: ${props.infrastructure.infraConfig.getConfig().reason}`);
                console.log(`   💰 Estimated monthly savings: $${350 - props.infrastructure.infraConfig.getCostEstimate().monthly}`);
            }
        }

        // ALB SECURITY GROUP
        // Only allow traffic from CloudFront managed prefix list on port 443
        const securityGroup = new SecurityGroup(this, 'lb-sg', {
            vpc,
            description: 'Security group for API Application Load Balancer',
            allowAllOutbound: true,
        });

        // Use the correct region variable if available
        const regionPrefixList = CF_IP_PREFIX_LIST_ID_Map[this.region];
        if (regionPrefixList) {
            securityGroup.addIngressRule(
                Peer.prefixList(regionPrefixList),
                Port.tcp(443),
                'Allow traffic from CloudFront IPs only on 443'
            );
        } else {
            throw new Error(`CloudFront prefix list not found for region: ${this.region}.`);
        }

        // CREATE ALB
        this.loadBalancer = new elbv2.ApplicationLoadBalancer(this, "LoadBalancer", {
            vpc,
            internetFacing: true,
            securityGroup
        });

        // CREATE ALB CERTIFICATE
        const lbCertificate = new acm.Certificate(this, "LbCertificate", {
            domainName: lbDomainName,
            validation: acm.CertificateValidation.fromDns(hostedZone),
        });

        // ADD HTTPS LISTENER
        const httpsListener = this.loadBalancer.addListener('HttpsListener', {
            port: 443,
            certificates: [lbCertificate],
            protocol: elbv2.ApplicationProtocol.HTTPS,
        });

        // Conditional stickiness - only enable for production environments
        const isProduction = props.environment.toLowerCase().includes('prod') || props.environment.toLowerCase().includes('event');
        const stickinessConfig = isProduction ? {
            stickinessCookieDuration: cdk.Duration.hours(24),
            stickinessCookieName: 'TotalCtlALB'
        } : {};

        this.httpsListenerTargetGroup = new elbv2.ApplicationTargetGroup(this, 'EcsTargetGroup', {
            vpc,
            port: API_PORT,
            protocol: elbv2.ApplicationProtocol.HTTP,
            targetType: elbv2.TargetType.IP,
            healthCheck: {
                path: '/api',
                protocol: elbv2.Protocol.HTTP,
                timeout: cdk.Duration.seconds(30),
                interval: cdk.Duration.seconds(60),
                healthyThresholdCount: 2,
                unhealthyThresholdCount: 5,
                port: API_PORT.toString()
            },
            ...stickinessConfig
        });

        httpsListener.addTargetGroups('EcsTargets', {
            targetGroups: [this.httpsListenerTargetGroup]
        });

        // Add HTTP to HTTPS redirect
        this.loadBalancer.addRedirect({
            sourceProtocol: elbv2.ApplicationProtocol.HTTP,
            sourcePort: 80,
            targetProtocol: elbv2.ApplicationProtocol.HTTPS,
            targetPort: 443,
        });

        // CREATE DNS RECORD FOR ALB
        new route53.ARecord(this, 'LoadBalancerAliasRecord', {
            zone: hostedZone,
            recordName: lbDomainName.split('.')[0], // Just the '<environment>-lb' part
            target: route53.RecordTarget.fromAlias(
                new route53targets.LoadBalancerTarget(this.loadBalancer)
            )
        });

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

        // Attach shared runtime policy for least-privilege access across environments
        taskRole.addManagedPolicy(props.infrastructure.appRuntimePolicy);

        // Create log group
        const logGroup = new logs.LogGroup(this, 'LogGroup', {
            logGroupName: `/ecs/${props.environment}-backend`,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            retention: logs.RetentionDays.ONE_MONTH
        });
        logGroup.grantWrite(taskRole)

        // Create Fargate task definition
        const taskDefinition = new ecs.FargateTaskDefinition(this, 'TaskDefinition', {
            cpu: 4096,
            memoryLimitMiB: 8192,
            executionRole,
            taskRole
        });

        // Add container to task definition
        const container = taskDefinition.addContainer('main', {
            image: ecs.ContainerImage.fromRegistry(imageUri),
            logging: ecs.LogDrivers.awsLogs({
                streamPrefix: 'ecs',
                logGroup
            }),
            environment: {
                NODE_ENV: 'production',
                MONGODB_CONNECTION_STRING: mongoConnectionString,
                API_PORT: API_PORT + "",
                S3_BUCKET_ARN: props.infrastructure.cfPrivateBucket.bucketArn,
                S3_BUCKET_NAME: props.infrastructure.cfPrivateBucket.bucketName
            },
            memoryLimitMiB: 8192,
            cpu: 4096,
            startTimeout: cdk.Duration.minutes(10),
            stopTimeout: cdk.Duration.minutes(2),
            portMappings: [
                {
                    containerPort: API_PORT,
                    hostPort: API_PORT,
                    protocol: ecs.Protocol.TCP
                }
            ]
        });

        // Create Fargate service
        this.fargateService = new ecs.FargateService(this, 'Service', {
            cluster: props.infrastructure.ecsCluster,
            taskDefinition,
            minHealthyPercent: 50,
            desiredCount: 2,
            healthCheckGracePeriod: cdk.Duration.minutes(10),
            vpcSubnets: {
                subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS
            }
        });

        const scaling = this.fargateService.autoScaleTaskCount({
            minCapacity: 2,
            maxCapacity: 4
        });

        scaling.scaleOnCpuUtilization('CpuScaling', {
            targetUtilizationPercent: 80,
            scaleInCooldown: cdk.Duration.minutes(10),
            scaleOutCooldown: cdk.Duration.minutes(5)
        });

        scaling.scaleOnMemoryUtilization('MemoryScaling', {
            targetUtilizationPercent: 80,
            scaleInCooldown: cdk.Duration.minutes(10),
            scaleOutCooldown: cdk.Duration.minutes(5)
        });

        // Register the service with the target group
        this.fargateService.attachToApplicationTargetGroup(this.httpsListenerTargetGroup);

        // Allow traffic from the ALB to the ECS service
        this.fargateService.connections.allowFrom(
            this.loadBalancer,
            ec2.Port.tcp(API_PORT),
            `Allow traffic from ALB to ECS Service on port ${API_PORT}`
        );

        // Store service parameters in SSM
        new ssm.StringParameter(this, 'ServiceUrlParameter', {
            parameterName: `${paramPrefix}/backend/service-url`,
            // Use the CloudFront distribution domain name for the HTTPS URL
            stringValue: `https://${cfDistr.distributionDomainName}`,
            description: 'Backend service access URL (via CloudFront/ALB)'
        });

        new ssm.StringParameter(this, 'ServiceNameParameter', {
            parameterName: `${paramPrefix}/backend/service-name`,
            stringValue: this.fargateService.serviceName
        });

        // Create the central dashboard (now owned by BackendStack)
        this.centralDashboard = new cloudwatch.Dashboard(this, 'AppUnifiedDashboard', {
            dashboardName: `${props.environment}-ApplicationStatus`,
        });

        // Instantiate InfraMonitoring, passing all required resources
        this.infraMonitoring = new InfraMonitoring(this, 'AppUnifiedMonitoring', {
            environment: props.environment,
            // From BackendStack itself:
            fargateService: this.fargateService,
            alb: this.loadBalancer,
            albTargetGroup: this.httpsListenerTargetGroup,
            centralDashboardInstance: this.centralDashboard, 
            // From props.infrastructure:
            ecsCluster: props.infrastructure.ecsCluster,
            cloudFrontDistributionId: props.infrastructure.cfDistr.distributionId,
            privateS3BucketName: props.infrastructure.cfPrivateBucket.bucketName,
            documentDbCluster: props.infrastructure.docDbCluster, // Can be undefined for non-production
            documentDbInstanceClass: "db.r6g.large", // Matches infrastructure stack
        });

        // Security Group for the Cleanup Job ECS Task
        const cleanupJobSecurityGroup = new ec2.SecurityGroup(this, 'CleanupJobSecurityGroup', {
            vpc: props.infrastructure.vpc,
            description: 'Security group for the cleanup job ECS task',
            allowAllOutbound: true, // Adjust as needed, outbound typically needed for S3/Mongo
        });

        new CleanupJobScheduler(this, 'CleanupJobScheduler', {
            environment: props.environment,
            cluster: props.infrastructure.ecsCluster,
            vpc: props.infrastructure.vpc,
            imageUri: imageUri, // Use the same image as the main service
            mongoConnectionString: mongoConnectionString, // Use the constructed connection string
            s3BucketArn: props.infrastructure.cfPrivateBucket.bucketArn,
            s3BucketName: props.infrastructure.cfPrivateBucket.bucketName,
            securityGroup: cleanupJobSecurityGroup, // Pass the new SG
        });
    }
} 