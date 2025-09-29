import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as stepfunctions from 'aws-cdk-lib/aws-stepfunctions';
import * as stepfunctionsTasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as snsSubscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as docdb from 'aws-cdk-lib/aws-docdb';
import * as ec2 from 'aws-cdk-lib/aws-ec2';

export interface TestAutoScalingStackProps extends cdk.StackProps {
    environment: string;
    documentDbCluster?: docdb.IDatabaseCluster;
    vpc: ec2.IVpc;
    dbCredentialsSecret: cdk.aws_secretsmanager.ISecret;
}

export class TestAutoScalingStack extends cdk.Stack {
    public readonly stepFunction: stepfunctions.StateMachine;
    public readonly loadGeneratorFunction: lambda.Function;
    public readonly metricsCheckerFunction: lambda.Function;
    public readonly testResultsTopic: sns.Topic;

    constructor(scope: Construct, id: string, props: TestAutoScalingStackProps) {
        super(scope, id, props);

        // Create SNS topic for test results
        this.testResultsTopic = new sns.Topic(this, 'TestResultsTopic', {
            displayName: `DocumentDB Auto Scaling Test Results - ${props.environment}`,
            topicName: `docdb-autoscaling-test-results-${props.environment}`
        });

        // Add email subscription for test results (you can change this email)
        this.testResultsTopic.addSubscription(
            new snsSubscriptions.EmailSubscription('your-email@your-domain.com')
        );

        // Create security group for Lambda functions
        const lambdaSecurityGroup = new ec2.SecurityGroup(this, 'LambdaSecurityGroup', {
            vpc: props.vpc,
            description: 'Security group for DocumentDB auto scaling test Lambda functions',
            allowAllOutbound: true
        });

        // Environment variables (handle optional DocumentDB)
        const lambdaEnvironment: Record<string, string> = {
            SNS_TOPIC_ARN: this.testResultsTopic.topicArn,
            REGION: this.region
        };

        if (props.documentDbCluster) {
            lambdaEnvironment.MONGODB_CONNECTION_STRING = `mongodb://{{resolve:secretsmanager:${props.dbCredentialsSecret.secretArn}:SecretString:username::}}:{{resolve:secretsmanager:${props.dbCredentialsSecret.secretArn}:SecretString:password::}}@${props.documentDbCluster.clusterEndpoint.hostname}:${props.documentDbCluster.clusterEndpoint.port}/?tls=true&replicaSet=rs0&readPreference=secondaryPreferred&retryWrites=false`;
            lambdaEnvironment.CLUSTER_IDENTIFIER = props.documentDbCluster.clusterIdentifier;
        } else {
            lambdaEnvironment.MONGODB_CONNECTION_STRING = '';
            lambdaEnvironment.CLUSTER_IDENTIFIER = 'test-cluster';
        }

        // Create Lambda function to generate load on DocumentDB (Go) - using Docker bundling
        this.loadGeneratorFunction = new lambda.Function(this, 'LoadGeneratorFunction', {
            runtime: lambda.Runtime.PROVIDED_AL2023,
            handler: 'bootstrap',
            code: lambda.Code.fromAsset("lambda-functions", {
                bundling: {
                    image: lambda.Runtime.PROVIDED_AL2023.bundlingImage,
                    command: [
                        'bash', '-c', [
                            'cd /asset-input',
                            'go mod tidy',
                            'go mod download',
                            'cd cmd/load-generator',
                            'GOOS=linux GOARCH=amd64 go build -o bootstrap main.go',
                            'cp bootstrap /asset-output/'
                        ].join(' && ')
                    ],
                    user: 'root'
                }
            }),
            timeout: cdk.Duration.minutes(15),
            memorySize: 2048,
            ephemeralStorageSize: cdk.Size.mebibytes(1024),
            vpc: props.vpc,
            vpcSubnets: {
                subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS
            },
            securityGroups: [lambdaSecurityGroup],
            environment: lambdaEnvironment
        });

        // Grant secrets access
        props.dbCredentialsSecret.grantRead(this.loadGeneratorFunction);

        // Create Lambda function to check metrics and scaling status (Go) - using Docker bundling
        this.metricsCheckerFunction = new lambda.Function(this, 'MetricsCheckerFunction', {
            runtime: lambda.Runtime.PROVIDED_AL2023,
            handler: 'bootstrap',
            code: lambda.Code.fromAsset("lambda-functions", {
                bundling: {
                    image: lambda.Runtime.PROVIDED_AL2023.bundlingImage,
                    command: [
                        'bash', '-c', [
                            'cd /asset-input',
                            'go mod tidy',
                            'go mod download',
                            'cd cmd/metrics-checker',
                            'GOOS=linux GOARCH=amd64 go build -o bootstrap main.go',
                            'cp bootstrap /asset-output/'
                        ].join(' && ')
                    ],
                    user: 'root'
                }
            }),
            timeout: cdk.Duration.minutes(5),
            memorySize: 512,
            vpc: props.vpc,
            vpcSubnets: {
                subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS
            },
            securityGroups: [lambdaSecurityGroup],
            environment: {
                CLUSTER_IDENTIFIER: lambdaEnvironment.CLUSTER_IDENTIFIER,
                ENVIRONMENT: props.environment
            }
        });

        // Grant permissions to metrics checker
        this.metricsCheckerFunction.addToRolePolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
                'rds:DescribeDBClusters',
                'rds:DescribeDBInstances',
                'cloudwatch:GetMetricStatistics',
                'cloudwatch:DescribeAlarms'
            ],
            resources: ['*']
        }));

        // Output the security group ID for manual DocumentDB configuration
        new cdk.CfnOutput(this, 'LambdaSecurityGroupId', {
            value: lambdaSecurityGroup.securityGroupId,
            description: 'Security Group ID for test Lambda functions - add this to DocumentDB security group to allow access on port 27017'
        });

        // Create Step Function to orchestrate the test
        const waitForMetrics = new stepfunctions.Wait(this, 'WaitForMetrics', {
            time: stepfunctions.WaitTime.duration(cdk.Duration.minutes(2))
        });

        const waitForScaling = new stepfunctions.Wait(this, 'WaitForScaling', {
            time: stepfunctions.WaitTime.duration(cdk.Duration.minutes(3))
        });

        const waitForCooldown = new stepfunctions.Wait(this, 'WaitForCooldown', {
            time: stepfunctions.WaitTime.duration(cdk.Duration.minutes(5))
        });

        // Step Function tasks
        const startLoadGeneration = new stepfunctionsTasks.LambdaInvoke(this, 'StartLoadGeneration', {
            lambdaFunction: this.loadGeneratorFunction,
            payload: stepfunctions.TaskInput.fromObject({
                'durationMinutes': 8,
                'numThreads': 50,
                'operationType': 'mixed'
            }),
            resultPath: '$.loadGenerationResult'
        });

        const checkInitialMetrics = new stepfunctionsTasks.LambdaInvoke(this, 'CheckInitialMetrics', {
            lambdaFunction: this.metricsCheckerFunction,
            resultPath: '$.initialMetrics'
        });

        const checkScalingMetrics = new stepfunctionsTasks.LambdaInvoke(this, 'CheckScalingMetrics', {
            lambdaFunction: this.metricsCheckerFunction,
            resultPath: '$.scalingMetrics'
        });

        const checkFinalMetrics = new stepfunctionsTasks.LambdaInvoke(this, 'CheckFinalMetrics', {
            lambdaFunction: this.metricsCheckerFunction,
            resultPath: '$.finalMetrics'
        });

        const publishResults = new stepfunctionsTasks.SnsPublish(this, 'PublishResults', {
            topic: this.testResultsTopic,
            subject: stepfunctions.JsonPath.format(
                'DocumentDB Auto Scaling Test Results - {}',
                stepfunctions.JsonPath.stringAt('$.testId')
            ),
            message: stepfunctions.TaskInput.fromObject({
                'testId': stepfunctions.JsonPath.stringAt('$.testId'),
                'environment': props.environment,
                'clusterIdentifier': lambdaEnvironment.CLUSTER_IDENTIFIER,
                'testStartTime': stepfunctions.JsonPath.stringAt('$.testStartTime'),
                'loadGenerationResult': stepfunctions.JsonPath.stringAt('$.loadGenerationResult'),
                'initialMetrics': stepfunctions.JsonPath.stringAt('$.initialMetrics'),
                'scalingMetrics': stepfunctions.JsonPath.stringAt('$.scalingMetrics'),
                'finalMetrics': stepfunctions.JsonPath.stringAt('$.finalMetrics'),
                'testCompletedTime': stepfunctions.JsonPath.stringAt('$$.State.EnteredTime')
            })
        });

        // Handle errors - create separate error handlers for each task
        const handleLoadGenerationError = new stepfunctionsTasks.SnsPublish(this, 'HandleLoadGenerationError', {
            topic: this.testResultsTopic,
            subject: stepfunctions.JsonPath.format(
                'DocumentDB Auto Scaling Test FAILED - Load Generation - {}',
                stepfunctions.JsonPath.stringAt('$.testId')
            ),
            message: stepfunctions.TaskInput.fromObject({
                'testId': stepfunctions.JsonPath.stringAt('$.testId'),
                'environment': props.environment,
                'failedStep': 'Load Generation',
                'error': stepfunctions.JsonPath.stringAt('$.Error'),
                'cause': stepfunctions.JsonPath.stringAt('$.Cause'),
                'failedTime': stepfunctions.JsonPath.stringAt('$$.State.EnteredTime')
            })
        });

        const handleInitialMetricsError = new stepfunctionsTasks.SnsPublish(this, 'HandleInitialMetricsError', {
            topic: this.testResultsTopic,
            subject: stepfunctions.JsonPath.format(
                'DocumentDB Auto Scaling Test FAILED - Initial Metrics Check - {}',
                stepfunctions.JsonPath.stringAt('$.testId')
            ),
            message: stepfunctions.TaskInput.fromObject({
                'testId': stepfunctions.JsonPath.stringAt('$.testId'),
                'environment': props.environment,
                'failedStep': 'Initial Metrics Check',
                'error': stepfunctions.JsonPath.stringAt('$.Error'),
                'cause': stepfunctions.JsonPath.stringAt('$.Cause'),
                'failedTime': stepfunctions.JsonPath.stringAt('$$.State.EnteredTime')
            })
        });

        const handleScalingMetricsError = new stepfunctionsTasks.SnsPublish(this, 'HandleScalingMetricsError', {
            topic: this.testResultsTopic,
            subject: stepfunctions.JsonPath.format(
                'DocumentDB Auto Scaling Test FAILED - Scaling Metrics Check - {}',
                stepfunctions.JsonPath.stringAt('$.testId')
            ),
            message: stepfunctions.TaskInput.fromObject({
                'testId': stepfunctions.JsonPath.stringAt('$.testId'),
                'environment': props.environment,
                'failedStep': 'Scaling Metrics Check',
                'error': stepfunctions.JsonPath.stringAt('$.Error'),
                'cause': stepfunctions.JsonPath.stringAt('$.Cause'),
                'failedTime': stepfunctions.JsonPath.stringAt('$$.State.EnteredTime')
            })
        });

        const handleFinalMetricsError = new stepfunctionsTasks.SnsPublish(this, 'HandleFinalMetricsError', {
            topic: this.testResultsTopic,
            subject: stepfunctions.JsonPath.format(
                'DocumentDB Auto Scaling Test FAILED - Final Metrics Check - {}',
                stepfunctions.JsonPath.stringAt('$.testId')
            ),
            message: stepfunctions.TaskInput.fromObject({
                'testId': stepfunctions.JsonPath.stringAt('$.testId'),
                'environment': props.environment,
                'failedStep': 'Final Metrics Check',
                'error': stepfunctions.JsonPath.stringAt('$.Error'),
                'cause': stepfunctions.JsonPath.stringAt('$.Cause'),
                'failedTime': stepfunctions.JsonPath.stringAt('$$.State.EnteredTime')
            })
        });

        const handleGeneralError = new stepfunctionsTasks.SnsPublish(this, 'HandleGeneralError', {
            topic: this.testResultsTopic,
            subject: stepfunctions.JsonPath.format(
                'DocumentDB Auto Scaling Test FAILED - {}',
                stepfunctions.JsonPath.stringAt('$.testId')
            ),
            message: stepfunctions.TaskInput.fromObject({
                'testId': stepfunctions.JsonPath.stringAt('$.testId'),
                'environment': props.environment,
                'error': stepfunctions.JsonPath.stringAt('$.Error'),
                'cause': stepfunctions.JsonPath.stringAt('$.Cause'),
                'failedTime': stepfunctions.JsonPath.stringAt('$$.State.EnteredTime')
            })
        });

        // Define the Step Function workflow
        const parallelExecution = new stepfunctions.Parallel(this, 'ParallelLoadAndMonitoring')
            .branch(startLoadGeneration)
            .branch(
                waitForScaling
                    .next(checkScalingMetrics)
            );

        const definition = checkInitialMetrics
            .next(waitForMetrics)
            .next(parallelExecution)
            .next(waitForCooldown)
            .next(checkFinalMetrics)
            .next(publishResults);

        // Create the Step Function
        this.stepFunction = new stepfunctions.StateMachine(this, 'AutoScalingTestStateMachine', {
            definition,
            stateMachineName: `docdb-autoscaling-test-${props.environment}`,
            timeout: cdk.Duration.minutes(30),
            logs: {
                destination: new logs.LogGroup(this, 'StepFunctionLogs', {
                    logGroupName: `/aws/stepfunctions/docdb-autoscaling-test-${props.environment}`,
                    retention: logs.RetentionDays.ONE_WEEK,
                    removalPolicy: cdk.RemovalPolicy.DESTROY
                }),
                level: stepfunctions.LogLevel.ALL
            }
        });

        // Add error handling to individual tasks
        startLoadGeneration.addCatch(handleLoadGenerationError, {
            errors: ['States.ALL'],
            resultPath: '$.error'
        });

        checkInitialMetrics.addCatch(handleInitialMetricsError, {
            errors: ['States.ALL'],
            resultPath: '$.error'
        });

        checkScalingMetrics.addCatch(handleScalingMetricsError, {
            errors: ['States.ALL'],
            resultPath: '$.error'
        });

        checkFinalMetrics.addCatch(handleFinalMetricsError, {
            errors: ['States.ALL'],
            resultPath: '$.error'
        });

        // Add catch to the parallel execution
        parallelExecution.addCatch(handleGeneralError, {
            errors: ['States.ALL'],
            resultPath: '$.error'
        });

        // Create CloudWatch dashboard for test monitoring
        const testDashboard = new cloudwatch.Dashboard(this, 'AutoScalingTestDashboard', {
            dashboardName: `DocumentDB-AutoScaling-Test-${props.environment}`
        });

        // Add widgets to monitor the test
        testDashboard.addWidgets(
            new cloudwatch.TextWidget({
                markdown: `# DocumentDB Auto Scaling Test Dashboard - ${props.environment}\n\nThis dashboard monitors the auto scaling test execution and results.\n\n**Lambda Functions:** Go-based for improved performance and lower cold start times.`,
                width: 24,
                height: 3
            })
        );

        testDashboard.addWidgets(
            new cloudwatch.GraphWidget({
                title: 'Step Function Executions',
                width: 12,
                left: [
                    new cloudwatch.Metric({
                        namespace: 'AWS/States',
                        metricName: 'ExecutionsSucceeded',
                        dimensionsMap: {
                            StateMachineArn: this.stepFunction.stateMachineArn
                        },
                        statistic: 'Sum',
                        period: cdk.Duration.minutes(5)
                    }),
                    new cloudwatch.Metric({
                        namespace: 'AWS/States',
                        metricName: 'ExecutionsFailed',
                        dimensionsMap: {
                            StateMachineArn: this.stepFunction.stateMachineArn
                        },
                        statistic: 'Sum',
                        period: cdk.Duration.minutes(5)
                    })
                ]
            }),
            new cloudwatch.GraphWidget({
                title: 'Load Generator Function Metrics (Go)',
                width: 12,
                left: [
                    this.loadGeneratorFunction.metricInvocations({
                        period: cdk.Duration.minutes(5)
                    }),
                    this.loadGeneratorFunction.metricErrors({
                        period: cdk.Duration.minutes(5)
                    }),
                    this.loadGeneratorFunction.metricDuration({
                        period: cdk.Duration.minutes(5)
                    })
                ]
            })
        );

        testDashboard.addWidgets(
            new cloudwatch.GraphWidget({
                title: 'Metrics Checker Function Metrics (Go)',
                width: 12,
                left: [
                    this.metricsCheckerFunction.metricInvocations({
                        period: cdk.Duration.minutes(5)
                    }),
                    this.metricsCheckerFunction.metricErrors({
                        period: cdk.Duration.minutes(5)
                    }),
                    this.metricsCheckerFunction.metricDuration({
                        period: cdk.Duration.minutes(5)
                    })
                ]
            }),
            new cloudwatch.GraphWidget({
                title: 'Lambda Cold Start Comparison',
                width: 12,
                left: [
                    this.loadGeneratorFunction.metricDuration({
                        period: cdk.Duration.minutes(5),
                        label: 'Load Generator (Go)'
                    }),
                    this.metricsCheckerFunction.metricDuration({
                        period: cdk.Duration.minutes(5),
                        label: 'Metrics Checker (Go)'
                    })
                ]
            })
        );

        // Output important information
        new cdk.CfnOutput(this, 'StepFunctionArn', {
            value: this.stepFunction.stateMachineArn,
            description: 'Step Function ARN for DocumentDB auto scaling test'
        });

        new cdk.CfnOutput(this, 'TestResultsTopicArn', {
            value: this.testResultsTopic.topicArn,
            description: 'SNS Topic ARN for test results notifications'
        });

        new cdk.CfnOutput(this, 'TestDashboardUrl', {
            value: `https://${this.region}.console.aws.amazon.com/cloudwatch/home?region=${this.region}#dashboards:name=${testDashboard.dashboardName}`,
            description: 'CloudWatch Dashboard URL for monitoring the test'
        });

        new cdk.CfnOutput(this, 'LoadGeneratorFunctionName', {
            value: this.loadGeneratorFunction.functionName,
            description: 'Load Generator Lambda Function Name (Go)'
        });

        new cdk.CfnOutput(this, 'MetricsCheckerFunctionName', {
            value: this.metricsCheckerFunction.functionName,
            description: 'Metrics Checker Lambda Function Name (Go)'
        });
    }
} 