import * as cdk from 'aws-cdk-lib';
import {Construct} from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import {HttpMethods} from 'aws-cdk-lib/aws-s3';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53targets from 'aws-cdk-lib/aws-route53-targets';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import {Secret} from 'aws-cdk-lib/aws-secretsmanager';
import * as docdb from 'aws-cdk-lib/aws-docdb';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as iam from 'aws-cdk-lib/aws-iam';
import {S3BucketOrigin} from "aws-cdk-lib/aws-cloudfront-origins";
import {InfraBasicAuth} from "./infra-basic-auth";
import * as logs from 'aws-cdk-lib/aws-logs';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import {execSync} from "child_process";
import {InfrastructureConfigService} from './utils/infrastructure-config.service';


export interface InfrastructureStackProps extends cdk.StackProps {
    environment: string;
    baseDomainName: string;
}

export class InfrastructureStack extends cdk.Stack {
    public readonly vpc: ec2.Vpc;
    public readonly ecsCluster: ecs.Cluster;
    public readonly cfPubBucket: s3.Bucket;
    public readonly cfPrivateBucket: s3.Bucket;
    public readonly docDbCluster?: docdb.DatabaseCluster;
    public readonly ecrRepository: ecr.Repository;
    public readonly cfDistr: cloudfront.Distribution;
    public readonly hostedZone: route53.IHostedZone;
    public readonly certificate: acm.Certificate;
    readonly dbCredentialsSecret: Secret;
    public readonly lbDomainName: string;
    public readonly appRuntimePolicy: iam.ManagedPolicy;
    public readonly infraConfig: InfrastructureConfigService;

    constructor(scope: Construct, id: string, props: InfrastructureStackProps) {
        super(scope, id, props);
        this.infraConfig = new InfrastructureConfigService(props.environment)

        const domainName = props.environment + "." + props.baseDomainName;
        this.lbDomainName = `${props.environment}-lb.${props.baseDomainName}`;

        // Create VPC
        this.vpc = new ec2.Vpc(this, "Vpc", {
            maxAzs: 2,
            natGateways: 1,
            enableDnsHostnames: true,
            enableDnsSupport: true,
            subnetConfiguration: [
                {
                    cidrMask: 24,
                    name: "PrivateWithEgress",
                    subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
                },
                {
                    cidrMask: 24,
                    name: "Public",
                    subnetType: ec2.SubnetType.PUBLIC,
                },
            ],
        });


        // Create S3 Bucket
        this.cfPubBucket = new s3.Bucket(this, "wwwBucket", {
            publicReadAccess: true,
            versioned: false,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            autoDeleteObjects: true,
            websiteIndexDocument: 'index.html',
            websiteErrorDocument: 'index.html',
            blockPublicAccess: {
                blockPublicAcls: false,
                blockPublicPolicy: false,
                restrictPublicBuckets: false,
                ignorePublicAcls: true,
            },
            cors: [
                {
                    allowedMethods: [s3.HttpMethods.GET, HttpMethods.HEAD],
                    allowedOrigins: ["*"],
                    allowedHeaders: ["*"],
                    maxAge: 3000,
                }
            ]
        });

        // Create Private S3 Bucket for CloudFront Origin
        this.cfPrivateBucket = new s3.Bucket(this, "PrivateOriginBucket", {
            publicReadAccess: false,
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            encryption: s3.BucketEncryption.S3_MANAGED,
            enforceSSL: true,
            cors: [
                {
                    allowedMethods: [
                        s3.HttpMethods.GET,
                        s3.HttpMethods.POST,
                        s3.HttpMethods.PUT,
                        s3.HttpMethods.DELETE,
                        s3.HttpMethods.HEAD,
                    ],
                    allowedOrigins: ['*'],
                    allowedHeaders: ["*"],
                    maxAge: 3000,
                }
            ]
        });

        // Shared runtime policy for app workloads (ECS task + EC2 debug box)
        this.appRuntimePolicy = new iam.ManagedPolicy(this, 'AppRuntimePolicy', {
            managedPolicyName: `total-ctl-runtime-${props.environment}`,
            statements: [
                new iam.PolicyStatement({
                    effect: iam.Effect.ALLOW,
                    actions: [
                        's3:GetObject',
                        's3:PutObject',
                        's3:DeleteObject',
                        's3:ListBucket'
                    ],
                    resources: [
                        this.cfPrivateBucket.bucketArn,
                        `${this.cfPrivateBucket.bucketArn}/*`
                    ]
                }),
                new iam.PolicyStatement({
                    effect: iam.Effect.ALLOW,
                    actions: [
                        'rekognition:StartContentModeration',
                        'rekognition:GetContentModeration'
                    ],
                    resources: ['*']
                }),
                new iam.PolicyStatement({
                    effect: iam.Effect.ALLOW,
                    actions: [
                        'transcribe:StartTranscriptionJob',
                        'transcribe:GetTranscriptionJob'
                    ],
                    resources: ['*']
                }),
                new iam.PolicyStatement({
                    effect: iam.Effect.ALLOW,
                    actions: [
                        'comprehend:DetectSentiment',
                        'comprehend:DetectToxicContent'
                    ],
                    resources: ['*']
                }),
                new iam.PolicyStatement({
                    effect: iam.Effect.ALLOW,
                    actions: [
                        'ssm:GetParameter',
                        'ssm:GetParameters',
                        'ssm:GetParametersByPath'
                    ],
                    resources: [
                        `arn:aws:ssm:${this.region}:${this.account}:parameter/total-ctl/${props.environment}/*`
                    ]
                })
            ]
        });

        // Create CloudFront Origin Access Identity for private bucket access
        const originAccessIdentity = new cloudfront.OriginAccessIdentity(this, 'OriginAccessIdentity', {
            comment: `OAI for ${domainName} private bucket`,
        });

        // Grant read permissions to CloudFront
        this.cfPrivateBucket.grantRead(originAccessIdentity);

        // Setup Database - only for production environments
        const isProductionLike = props.environment.toLowerCase().includes('prod') ||
            props.environment.toLowerCase().includes('main') ||
            props.environment === 'customer-facing';

        // Declare paramPrefix early so it can be used throughout
        const paramPrefix = `/total-ctl/${props.environment}`;

        if (isProductionLike) {
            console.log(`🏗️ Creating DocumentDB cluster for production environment: ${props.environment}`);

            const databaseAdmUser = process.env.DATABASE_ADM_USER || "dbadmin";
            this.dbCredentialsSecret = new secretsmanager.Secret(this, 'DocumentDbSecret', {
                generateSecretString: {
                    secretStringTemplate: JSON.stringify({username: databaseAdmUser}),
                    generateStringKey: 'password',
                    excludePunctuation: true,
                    includeSpace: false,
                },
            });

            const dbUsername = this.dbCredentialsSecret.secretValueFromJson("username").unsafeUnwrap();
            const dbPassword = this.dbCredentialsSecret.secretValueFromJson("password");

            this.docDbCluster = new docdb.DatabaseCluster(this, "DocumentDbCluster", {
                masterUser: {
                    username: dbUsername,
                    password: dbPassword
                },
                instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.MEDIUM),
                instances: 1,
                vpc: this.vpc,
                deletionProtection: true, // Always protect production databases
                vpcSubnets: {
                    subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS
                },
                backup: {
                    retention: cdk.Duration.days(7),
                    preferredWindow: '03:00-04:00'
                },
                preferredMaintenanceWindow: 'sun:04:00-sun:05:00'
            });

            // Allow inbound access from VPC CIDR to DocumentDB
            this.docDbCluster.connections.allowDefaultPortFrom(
                ec2.Peer.ipv4(this.vpc.vpcCidrBlock),
                'Allow access from ECS tasks in VPC'
            );

            // Store database connection information in SSM
            new ssm.StringParameter(this, "DatabaseTypeParam", {
                parameterName: `${paramPrefix}/database/type`,
                stringValue: "documentdb",
                description: "Database type for this environment",
            });

            new ssm.StringParameter(this, "DatabaseEndpointParam", {
                parameterName: `${paramPrefix}/database/endpoint`,
                stringValue: this.docDbCluster.clusterEndpoint.hostname,
                description: "DocumentDB cluster endpoint",
            });
        } else {
            console.log(`💡 Using in-memory storage for testing environment: ${props.environment}`);

            // Create a dummy secret for non-production environments (not used)
            this.dbCredentialsSecret = new secretsmanager.Secret(this, 'DummySecret', {
                description: 'Dummy secret for non-production environments using in-memory storage',
                generateSecretString: {
                    secretStringTemplate: JSON.stringify({username: 'dummy'}),
                    generateStringKey: 'password',
                },
            });

            // Store in-memory database configuration
            new ssm.StringParameter(this, "DatabaseTypeParam", {
                parameterName: `${paramPrefix}/database/type`,
                stringValue: "in-memory",
                description: "Database type for this environment",
            });
        }

        // Create CloudWatch Log Groups for enhanced monitoring
        if (this.docDbCluster) {
            const appLogGroup = new logs.LogGroup(this, 'ApplicationLogGroup', {
                logGroupName: `/ecs/${props.environment}/application`,
                retention: logs.RetentionDays.ONE_MONTH,
                removalPolicy: cdk.RemovalPolicy.DESTROY
            });

            // Create custom CloudWatch dashboard for database insights
            const insightsDashboard = new cloudwatch.Dashboard(this, 'DatabaseInsightsDashboard', {
                dashboardName: `${props.environment}-database-insights`,
                defaultInterval: cdk.Duration.hours(1)
            });

            // Add database connection pool metrics
            const dbConnectionsMetric = new cloudwatch.Metric({
                namespace: 'AWS/DocDB',
                metricName: 'DatabaseConnections',
                dimensionsMap: {
                    DBClusterIdentifier: this.docDbCluster.clusterIdentifier
                },
                statistic: 'Average',
                period: cdk.Duration.minutes(1)
            });

            // Add database read/write throughput metrics
            const dbReadThroughputMetric = new cloudwatch.Metric({
                namespace: 'AWS/DocDB',
                metricName: 'ReadThroughput',
                dimensionsMap: {
                    DBClusterIdentifier: this.docDbCluster.clusterIdentifier
                },
                statistic: 'Average',
                period: cdk.Duration.minutes(1)
            });

            const dbWriteThroughputMetric = new cloudwatch.Metric({
                namespace: 'AWS/DocDB',
                metricName: 'WriteThroughput',
                dimensionsMap: {
                    DBClusterIdentifier: this.docDbCluster.clusterIdentifier
                },
                statistic: 'Average',
                period: cdk.Duration.minutes(1)
            });

            // Add widgets to the insights dashboard
            insightsDashboard.addWidgets(
                new cloudwatch.TextWidget({
                    markdown: `# Database Insights Dashboard - ${props.environment}`,
                    width: 24,
                    height: 1
                }),
                new cloudwatch.GraphWidget({
                    title: 'Database Connections',
                    width: 12,
                    height: 6,
                    left: [dbConnectionsMetric]
                }),
                new cloudwatch.GraphWidget({
                    title: 'Database Throughput',
                    width: 12,
                    height: 6,
                    left: [dbReadThroughputMetric, dbWriteThroughputMetric]
                })
            );
        } else {
            // Create simplified application monitoring for in-memory deployments
            const appLogGroup = new logs.LogGroup(this, 'ApplicationLogGroup', {
                logGroupName: `/ecs/${props.environment}/application`,
                retention: logs.RetentionDays.ONE_MONTH,
                removalPolicy: cdk.RemovalPolicy.DESTROY
            });
        }

        // Setup Route53 and Certificate
        this.hostedZone = route53.HostedZone.fromLookup(this, "HostedZone", {
            domainName: props.baseDomainName,
            privateZone: false,
        });

        // Certificate must be in us-east-1 for CloudFront
        const certificateStack = new cdk.Stack(this, "CertificateStack", {
            env: {
                account: this.account,
                region: "us-east-1",
            },
            crossRegionReferences: true
        });

        this.certificate = new acm.Certificate(certificateStack, "Certificate", {
            domainName,
            validation: acm.CertificateValidation.fromDns(this.hostedZone),
        });

        this.ecsCluster = new ecs.Cluster(this, "Cluster", {
            vpc: this.vpc,
            enableFargateCapacityProviders: true,
            containerInsights: true // Enable Container Insights for enhanced monitoring
        });

        // Create basic auth only if not in production
        let functionAssociations = props.environment.toLowerCase().startsWith('prod')
            ? undefined
            : [{
                function: new InfraBasicAuth(this, 'basicAuth' + this.region).authFunction,
                eventType: cloudfront.FunctionEventType.VIEWER_REQUEST
            }];

        this.cfDistr = new cloudfront.Distribution(this, "Distribution", {
            defaultBehavior: {
                origin: S3BucketOrigin.withOriginAccessControl(this.cfPubBucket),
                allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
                viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
                responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.CORS_ALLOW_ALL_ORIGINS_WITH_PREFLIGHT_AND_SECURITY_HEADERS,
                functionAssociations: functionAssociations
            },
            defaultRootObject: 'index.html',
            additionalBehaviors: {
                '/api*': { // Additional behavior for /api/* path
                    origin: new origins.HttpOrigin(this.lbDomainName, {
                        protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
                        httpsPort: 443,
                    }),
                    allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
                    cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
                    cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
                    viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                    responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.CORS_ALLOW_ALL_ORIGINS_WITH_PREFLIGHT_AND_SECURITY_HEADERS,
                    originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER
                },
                '/private/*': { // Additional behavior for private content
                    origin: new origins.S3Origin(this.cfPrivateBucket, {
                        originAccessIdentity: originAccessIdentity
                    }),
                    allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
                    viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                    cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
                    responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.CORS_ALLOW_ALL_ORIGINS_WITH_PREFLIGHT_AND_SECURITY_HEADERS
                }
            },
            domainNames: [domainName],
            certificate: this.certificate,
        });

        // Create Route53 Alias record for CloudFront
        new route53.ARecord(this, 'CloudFrontAliasRecord', {
            zone: this.hostedZone,
            recordName: props.environment,
            target: route53.RecordTarget.fromAlias(
                new route53targets.CloudFrontTarget(this.cfDistr)
            )
        });

        // Add bucket policy to allow only CloudFront access
        const bucketPolicy = new s3.BucketPolicy(this, 'BucketPolicy', {
            bucket: this.cfPubBucket
        });

        bucketPolicy.document.addStatements(
            new iam.PolicyStatement({
                actions: ['s3:GetObject'],
                effect: iam.Effect.ALLOW,
                principals: [new iam.ServicePrincipal('cloudfront.amazonaws.com')],
                resources: [`${this.cfPubBucket.bucketArn}/*`]
            })
        );

        // Create ECR Repository
        this.ecrRepository = new ecr.Repository(this, "EcrRepository", {
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            emptyOnDelete: true
        });

        // Store infrastructure configuration information for applications
        new ssm.StringParameter(this, "InfraConfigParam", {
            parameterName: `${paramPrefix}/infrastructure/database-deployed`,
            stringValue: this.infraConfig.shouldDeployDocumentDB().toString(),
            description: "Whether DocumentDB was deployed in this environment",
        });

        new ssm.StringParameter(this, "InfraConfigReasonParam", {
            parameterName: `${paramPrefix}/infrastructure/config-reason`,
            stringValue: this.infraConfig.getConfig().reason,
            description: "Reason for infrastructure configuration choice",
        });

        // Store cost and deployment estimates
        const costEstimate = this.infraConfig.getCostEstimate();
        const deploymentEstimate = this.infraConfig.getDeploymentTimeEstimate();

        new ssm.StringParameter(this, "MonthlyCostParam", {
            parameterName: `${paramPrefix}/infrastructure/monthly-cost`,
            stringValue: costEstimate.monthly.toString(),
            description: "Estimated monthly cost for this infrastructure configuration",
        });

        new ssm.StringParameter(this, "DeploymentTimeParam", {
            parameterName: `${paramPrefix}/infrastructure/deployment-time`,
            stringValue: deploymentEstimate.minutes.toString(),
            description: "Estimated deployment time in minutes",
        });

        // Create Parameter Store parameters for environment configuration
        new ssm.StringParameter(this, "BackendEcrRepositoryParam", {
            parameterName: `${paramPrefix}/backend/ecr-repoName`,
            stringValue: this.ecrRepository.repositoryName,
            description: "ECR repository name for backend",
        });

        // --- GitHub OIDC provider and deploy role (for self-propelling workflows) ---
        // Derive repository from environment or CDK context
        const remoteUrl = execSync('git config --get remote.origin.url').toString().trim();
        const repoMatch = remoteUrl.match(/github\.com[:/](.*)\.git$/);
        const ghRepoFull = process.env.GITHUB_REPOSITORY || (repoMatch ? repoMatch[1] : undefined);
        // Import the existing GitHub OIDC provider for the account.
        //
        // IMPORTANT: This is a prerequisite. The deployment will fail if the OIDC provider
        // does not already exist in the AWS account. It must be created manually once per account.
        // See INITIALIZATION.md for the one-time setup command.
        //
        const githubOidcProviderArn = `arn:aws:iam::${this.account}:oidc-provider/token.actions.githubusercontent.com`;
        const ghOidc = iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(this, 'GitHubOidcProvider', githubOidcProviderArn);

        // Trust policy: restrict to this repository when available; fallback to requiring audience only
        const conditions: { [key: string]: { [key: string]: string } } = {
            'StringEquals': {
                'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com'
            }
        };
        if (ghRepoFull) {
            conditions['StringLike'] = {
                'token.actions.githubusercontent.com:sub': `repo:${ghRepoFull}:*`
            };
        }

        const gaDeployRole = new iam.Role(this, 'GithubActionsDeployRole', {
            assumedBy: new iam.FederatedPrincipal(
                ghOidc.openIdConnectProviderArn,
                conditions,
                'sts:AssumeRoleWithWebIdentity'
            ),
            // Demo: admin privileges for simplicity; narrow in real setups
            managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess')]
        });
        // Optionally, add explicit permissions if you prefer least-privilege
        // gaDeployRole.addToPolicy(new iam.PolicyStatement({ ... }));

        // Store the GitHub Actions deploy role ARN in Parameter Store for easy retrieval by workflows.
        // This is used to populate the BRANCH_TO_CONFIG mapping.
        new ssm.StringParameter(this, "GitHubActionsRoleArnParam", {
            parameterName: `${paramPrefix}/github-actions/role-arn`,
            stringValue: gaDeployRole.roleArn,
            description: `GitHub Actions deploy role ARN for ${props.environment} environment`,
        });

        // Output infrastructure configuration summary
        new cdk.CfnOutput(this, 'InfrastructureConfigSummary', {
            value: JSON.stringify({
                environment: props.environment,
                databaseType: this.infraConfig.getDatabaseType(),
                documentDbDeployed: this.infraConfig.shouldDeployDocumentDB(),
                reason: this.infraConfig.getConfig().reason,
                estimatedMonthlyCost: costEstimate.monthly,
                estimatedDeploymentTime: deploymentEstimate.minutes
            }),
            description: 'Infrastructure configuration summary'
        });
    }

    /**
     * Create database monitoring dashboard (only when DocumentDB is deployed)
     */
    private createDatabaseDashboard(environment: string): void {
        if (!this.docDbCluster) return;

        const insightsDashboard = new cloudwatch.Dashboard(this, 'DatabaseInsightsDashboard', {
            dashboardName: `${environment}-database-insights`,
            defaultInterval: cdk.Duration.hours(1)
        });

        const dbConnectionsMetric = new cloudwatch.Metric({
            namespace: 'AWS/DocDB',
            metricName: 'DatabaseConnections',
            dimensionsMap: {
                DBClusterIdentifier: this.docDbCluster.clusterIdentifier
            },
            statistic: 'Average',
            period: cdk.Duration.minutes(1)
        });

        insightsDashboard.addWidgets(
            new cloudwatch.TextWidget({
                markdown: `# Database Insights Dashboard - ${environment}\n\n**Configuration**: DocumentDB cluster deployed\n**Instance Type**: db.t4g.medium\n**Stateless Testing**: Enabled`,
                width: 24,
                height: 2
            }),
            new cloudwatch.GraphWidget({
                title: 'Database Connections',
                width: 24,
                height: 6,
                left: [dbConnectionsMetric]
            })
        );
    }
} 
