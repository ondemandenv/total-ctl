import * as cdk from 'aws-cdk-lib';
import {Construct} from 'constructs';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as cloudwatch_actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as docdb from 'aws-cdk-lib/aws-docdb';
import * as lambda from 'aws-cdk-lib/aws-lambda';

import * as iam from 'aws-cdk-lib/aws-iam';
import * as scheduler from 'aws-cdk-lib/aws-scheduler';
import * as schedulerTargets from 'aws-cdk-lib/aws-scheduler-targets';

export interface InfraMonitoringProps {
    // ECS & ALB
    readonly fargateService: ecs.IFargateService;
    readonly ecsCluster: ecs.ICluster;
    readonly albTargetGroup: elbv2.IApplicationTargetGroup;
    readonly alb: elbv2.IApplicationLoadBalancer;

    // Frontend
    readonly cloudFrontDistributionId: string;
    readonly privateS3BucketName: string;

    // DocumentDB
    readonly documentDbCluster?: docdb.IDatabaseCluster;
    readonly documentDbInstanceClass?: string; // Optional: if not provided, defaults to "db.r6g.large"

    // Common
    readonly environment: string;
    readonly alarmSnsTopic?: sns.ITopic; // Optional: if not provided, one will be created
    readonly centralDashboardInstance: cloudwatch.Dashboard; // Added
}

export class InfraMonitoring extends Construct {
    public readonly allAlarms: cloudwatch.IAlarm[] = [];
    public readonly alarmSnsTopic: sns.ITopic;

    // Individual metrics - remove readonly to allow assignment in helper methods
    // ECS Metrics
    public ecsCpuMetric: cloudwatch.Metric;
    public ecsMemoryMetric: cloudwatch.Metric;
    public ecsRunningTaskCountMetric: cloudwatch.Metric;
    public albUnhealthyHostsMetric: cloudwatch.Metric;
    public albTarget5xxMetric: cloudwatch.Metric;
    public alb5xxMetric: cloudwatch.Metric;
    public albTargetResponseTimeAvg: cloudwatch.Metric;
    public albTargetResponseTimeP90: cloudwatch.Metric;
    public albTargetResponseTimeP99: cloudwatch.Metric;

    // Frontend Metrics
    public cf5xxErrorRateMetric: cloudwatch.Metric;
    public cf4xxErrorRateMetric: cloudwatch.Metric;
    public s3Bucket4xxErrorsMetric: cloudwatch.Metric;

    // DocumentDB Metrics
    public docDbCpuMetric: cloudwatch.Metric;
    public docDbConnectionsMetric: cloudwatch.Metric;
    public docDbFreeableMemoryMetric: cloudwatch.Metric;
    public docDbWriteLatencyMetric: cloudwatch.Metric;
    public docDbReadLatencyMetric: cloudwatch.Metric;
    public docDbStorageUsedMetric: cloudwatch.Metric;
    public docDbReadIopsMetric: cloudwatch.Metric;
    public docDbWriteIopsMetric: cloudwatch.Metric;
    public docDbBufferCacheHitRatioMetric: cloudwatch.Metric;
    public docDbIndexBufferCacheHitRatioMetric: cloudwatch.Metric;
    public docDbReaderCpuMetric: cloudwatch.Metric;

    constructor(scope: Construct, id: string, props: InfraMonitoringProps) {
        super(scope, id);

        this.alarmSnsTopic = props.alarmSnsTopic || new sns.Topic(this, 'UnifiedAlarmTopic', {
            displayName: `App Alarms (${props.environment})`
        });

        props.centralDashboardInstance.addWidgets(
            new cloudwatch.TextWidget({
                markdown: `# Unified Application Status: ${props.environment}`,
                width: 24,
                height: 1
            })
        );

        this.createEcsAndAlbMonitoring(props, props.centralDashboardInstance);
        this.createFrontendMonitoring(props, props.centralDashboardInstance);
        
        // Only create DocumentDB monitoring if DocumentDB cluster exists
        if (props.documentDbCluster) {
            this.createDocumentDbMonitoring(props, props.centralDashboardInstance);
        } else {
            console.log(`⚠️ Skipping DocumentDB monitoring for ${props.environment} - using in-memory storage`);
        }

        if (this.allAlarms.length > 0) {
            props.centralDashboardInstance.addWidgets(
                new cloudwatch.AlarmStatusWidget({
                    title: 'Overall Application Alarm Status',
                    width: 24,
                    alarms: this.allAlarms
                })
            );
        }
    }

    private createEcsAndAlbMonitoring(props: InfraMonitoringProps, dashboard: cloudwatch.Dashboard) {
        const fargateServiceName = props.fargateService.serviceName;
        const ecsClusterName = props.ecsCluster.clusterName;
        const albTargetGroupName = props.albTargetGroup.targetGroupName;
        const albArnResourcePartWithPrefix = cdk.Fn.select(5, cdk.Fn.split(':', props.alb.loadBalancerArn));
        const albNameAndIdPath = cdk.Fn.select(1, cdk.Fn.split('/', albArnResourcePartWithPrefix, 2));

        const ecsNamespace = 'AWS/ECS';
        const albNamespace = 'AWS/ApplicationELB';
        const ecsServiceDimensions = {ClusterName: ecsClusterName, ServiceName: fargateServiceName};

        const cpuUtilizationThreshold = 80;
        const memoryUtilizationThreshold = 80;
        const minRunningTasksThreshold = 2;
        const unhealthyHostCountThreshold = 1;
        const target5xxErrorThreshold = 5;
        const alb5xxErrorThreshold = 5;

        const loadBalancerDimension = {LoadBalancer: albNameAndIdPath};

        const targetGroupArnParts = cdk.Fn.split(':', props.albTargetGroup.targetGroupArn);
        const targetGroupResourcePart = cdk.Fn.select(5, targetGroupArnParts);
        // Ensure targetGroupResourcePart is correctly formatted, e.g., "targetgroup/my-target-group/1234567890abcdef"
        // Sometimes Fn::Select might pick just "targetgroup" or the full path.
        // If props.albTargetGroup.targetGroupFullName is available and tokenizable, it could be safer.
        // For now, using the split approach as in EcsMonitoring.
        const targetGroupDimension = {TargetGroup: targetGroupResourcePart};


        // Metrics
        this.ecsCpuMetric = new cloudwatch.Metric({
            namespace: ecsNamespace, metricName: 'CPUUtilization',
            dimensionsMap: ecsServiceDimensions, period: cdk.Duration.minutes(1), statistic: 'Average',
        });
        this.ecsMemoryMetric = new cloudwatch.Metric({
            namespace: ecsNamespace, metricName: 'MemoryUtilization',
            dimensionsMap: ecsServiceDimensions, period: cdk.Duration.minutes(1), statistic: 'Average',
        });
        this.albUnhealthyHostsMetric = new cloudwatch.Metric({
            namespace: albNamespace, metricName: 'UnHealthyHostCount',
            dimensionsMap: targetGroupDimension, period: cdk.Duration.minutes(1), statistic: 'Maximum',
        });
        this.albTarget5xxMetric = new cloudwatch.Metric({
            namespace: albNamespace, metricName: 'HTTPCode_Target_5XX_Count',
            dimensionsMap: targetGroupDimension, period: cdk.Duration.minutes(1), statistic: 'Sum',
        });
        this.alb5xxMetric = new cloudwatch.Metric({
            namespace: albNamespace, metricName: 'HTTPCode_ELB_5XX_Count',
            dimensionsMap: loadBalancerDimension, period: cdk.Duration.minutes(1), statistic: 'Sum',
        });
        this.albTargetResponseTimeAvg = new cloudwatch.Metric({
            namespace: albNamespace, metricName: 'TargetResponseTime', dimensionsMap: targetGroupDimension,
            statistic: 'Average', period: cdk.Duration.minutes(1), label: 'Avg Target Resp (s)'
        });
        this.albTargetResponseTimeP90 = new cloudwatch.Metric({
            namespace: albNamespace, metricName: 'TargetResponseTime', dimensionsMap: targetGroupDimension,
            statistic: 'p90', period: cdk.Duration.minutes(1), label: 'p90 Target Resp (s)'
        });
        this.albTargetResponseTimeP99 = new cloudwatch.Metric({
            namespace: albNamespace, metricName: 'TargetResponseTime', dimensionsMap: targetGroupDimension,
            statistic: 'p99', period: cdk.Duration.minutes(1), label: 'p99 Target Resp (s)'
        });

        // Enhanced ECS Metrics with Container Insights
        const ecsInsightsNamespace = 'ECS/ContainerInsights';
        
        // Additional ECS Task-level metrics
        this.ecsRunningTaskCountMetric = new cloudwatch.Metric({
            namespace: ecsInsightsNamespace, 
            metricName: 'RunningTaskCount',
            dimensionsMap: ecsServiceDimensions, 
            period: cdk.Duration.minutes(1), 
            statistic: 'Average'
        });

        // Task startup time metric
        const ecsTaskStartupTimeMetric = new cloudwatch.Metric({
            namespace: ecsInsightsNamespace,
            metricName: 'TaskStartupDuration',
            dimensionsMap: ecsServiceDimensions,
            period: cdk.Duration.minutes(5),
            statistic: 'Average'
        });

        // Network metrics for ECS tasks
        const ecsNetworkRxBytesMetric = new cloudwatch.Metric({
            namespace: ecsInsightsNamespace,
            metricName: 'NetworkRxBytes',
            dimensionsMap: ecsServiceDimensions,
            period: cdk.Duration.minutes(1),
            statistic: 'Sum'
        });

        const ecsNetworkTxBytesMetric = new cloudwatch.Metric({
            namespace: ecsInsightsNamespace,
            metricName: 'NetworkTxBytes',
            dimensionsMap: ecsServiceDimensions,
            period: cdk.Duration.minutes(1),
            statistic: 'Sum'
        });

        // Disk utilization for tasks
        const ecsStorageReadBytesMetric = new cloudwatch.Metric({
            namespace: ecsInsightsNamespace,
            metricName: 'StorageReadBytes',
            dimensionsMap: ecsServiceDimensions,
            period: cdk.Duration.minutes(1),
            statistic: 'Sum'
        });

        const ecsStorageWriteBytesMetric = new cloudwatch.Metric({
            namespace: ecsInsightsNamespace,
            metricName: 'StorageWriteBytes',
            dimensionsMap: ecsServiceDimensions,
            period: cdk.Duration.minutes(1),
            statistic: 'Sum'
        });

        // Alarms
        const highCpuAlarm = new cloudwatch.Alarm(this, 'EcsHighCpuUsage', {
            alarmName: cdk.Fn.join('-', [props.environment, 'ECS-CPUUtil', ecsClusterName, fargateServiceName]),
            alarmDescription: `ECS Service ${fargateServiceName} CPU utilization high in ${props.environment}`,
            metric: this.ecsCpuMetric, threshold: cpuUtilizationThreshold, evaluationPeriods: 3,
            comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
            treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        });
        highCpuAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(this.alarmSnsTopic));
        this.allAlarms.push(highCpuAlarm);

        const highMemoryAlarm = new cloudwatch.Alarm(this, 'EcsHighMemoryUsage', {
            alarmName: cdk.Fn.join('-', [props.environment, 'ECS-MemUtil', ecsClusterName, fargateServiceName]),
            alarmDescription: `ECS Service ${fargateServiceName} Memory utilization high in ${props.environment}`,
            metric: this.ecsMemoryMetric, threshold: memoryUtilizationThreshold, evaluationPeriods: 3,
            comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
            treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        });
        highMemoryAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(this.alarmSnsTopic));
        this.allAlarms.push(highMemoryAlarm);

        const lowRunningTasksAlarm = new cloudwatch.Alarm(this, 'EcsLowRunningTasks', {
            alarmName: cdk.Fn.join('-', [props.environment, 'ECS-LowTasks', ecsClusterName, fargateServiceName]),
            alarmDescription: `ECS Service ${fargateServiceName} has low running tasks in ${props.environment}`,
            metric: this.ecsRunningTaskCountMetric, threshold: minRunningTasksThreshold, evaluationPeriods: 2,
            comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD, // Ensure it's less than for low tasks
            treatMissingData: cloudwatch.TreatMissingData.BREACHING,
        });
        lowRunningTasksAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(this.alarmSnsTopic));
        this.allAlarms.push(lowRunningTasksAlarm);

        const unhealthyHostsAlarm = new cloudwatch.Alarm(this, 'AlbUnhealthyHosts', {
            alarmName: cdk.Fn.join('-', [props.environment, 'ALBTarget-Unhealthy', albTargetGroupName]),
            alarmDescription: `ALB Target Group ${albTargetGroupName} has unhealthy hosts in ${props.environment}`,
            metric: this.albUnhealthyHostsMetric, threshold: unhealthyHostCountThreshold, evaluationPeriods: 2,
            comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
            treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        });
        unhealthyHostsAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(this.alarmSnsTopic));
        this.allAlarms.push(unhealthyHostsAlarm);

        const target5xxAlarm = new cloudwatch.Alarm(this, 'AlbTarget5xxErrors', {
            alarmName: cdk.Fn.join('-', [props.environment, 'ALBTarget-5xx', albTargetGroupName]),
            alarmDescription: `ALB Target Group ${albTargetGroupName} 5xx errors in ${props.environment}`,
            metric: this.albTarget5xxMetric, threshold: target5xxErrorThreshold, evaluationPeriods: 1,
            comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
            treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        });
        target5xxAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(this.alarmSnsTopic));
        this.allAlarms.push(target5xxAlarm);

        const alb5xxAlarm = new cloudwatch.Alarm(this, 'Alb5xxErrors', {
            alarmName: `ALB-5xx-Errors-${props.environment}`,
            alarmDescription: `ALB 5xx errors in ${props.environment}`,
            metric: this.alb5xxMetric, threshold: alb5xxErrorThreshold, evaluationPeriods: 1,
            comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
            treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        });
        alb5xxAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(this.alarmSnsTopic));
        this.allAlarms.push(alb5xxAlarm);

        // Enhanced ECS Dashboard Widgets
        dashboard.addWidgets(
            new cloudwatch.TextWidget({
                markdown: `## Enhanced ECS Container Insights: ${fargateServiceName} (${props.environment})`,
                width: 24, height: 1,
            })
        );
        
        // Network utilization widgets
        dashboard.addWidgets(
            new cloudwatch.GraphWidget({
                title: 'ECS Network I/O (Bytes)',
                width: 12,
                left: [ecsNetworkRxBytesMetric, ecsNetworkTxBytesMetric],
                period: cdk.Duration.minutes(5)
            }),
            new cloudwatch.GraphWidget({
                title: 'ECS Storage I/O (Bytes)',
                width: 12,
                left: [ecsStorageReadBytesMetric, ecsStorageWriteBytesMetric],
                period: cdk.Duration.minutes(5)
            })
        );

        // Task performance widgets
        dashboard.addWidgets(
            new cloudwatch.GraphWidget({
                title: 'ECS Task Startup Time (ms)',
                width: 12,
                left: [ecsTaskStartupTimeMetric],
                period: cdk.Duration.minutes(5)
            }),
            new cloudwatch.GraphWidget({
                title: 'ECS Running Tasks Count',
                width: 12,
                left: [this.ecsRunningTaskCountMetric],
                leftAnnotations: [{
                    value: minRunningTasksThreshold,
                    label: 'Min Tasks Threshold',
                    color: cloudwatch.Color.RED
                }]
            })
        );

        // Dashboard Widgets for ECS/ALB
        dashboard.addWidgets(
            new cloudwatch.TextWidget({
                markdown: `## ECS: ${ecsClusterName}/${fargateServiceName} & ALB (${props.environment})`,
                width: 24, height: 1
            })
        );
        dashboard.addWidgets(
            new cloudwatch.GraphWidget({
                title: 'ECS CPU Utilization (%)', width: 12, left: [this.ecsCpuMetric],
                leftAnnotations: [{value: cpuUtilizationThreshold, label: 'CPU Alarm', color: cloudwatch.Color.RED}]
            }),
            new cloudwatch.GraphWidget({
                title: 'ECS Memory Utilization (%)', width: 12, left: [this.ecsMemoryMetric],
                leftAnnotations: [{
                    value: memoryUtilizationThreshold,
                    label: 'Memory Alarm',
                    color: cloudwatch.Color.RED
                }]
            })
        );
        dashboard.addWidgets(
            new cloudwatch.GraphWidget({
                title: 'ECS Running Tasks', width: 12, left: [this.ecsRunningTaskCountMetric],
                leftAnnotations: [{
                    value: minRunningTasksThreshold,
                    label: 'Min Tasks Alarm',
                    color: cloudwatch.Color.RED
                }]
            }),
            new cloudwatch.GraphWidget({
                title: 'ALB Unhealthy Hosts (TG)', width: 12, left: [this.albUnhealthyHostsMetric],
                leftAnnotations: [{
                    value: unhealthyHostCountThreshold,
                    label: 'Unhealthy Hosts Alarm',
                    color: cloudwatch.Color.RED
                }]
            })
        );
        dashboard.addWidgets(
            new cloudwatch.GraphWidget({
                title: 'ALB Target 5xx Err (Sum)', width: 12, left: [this.albTarget5xxMetric],
                leftAnnotations: [{
                    value: target5xxErrorThreshold,
                    label: 'Target 5xx Alarm',
                    color: cloudwatch.Color.RED
                }]
            }),
            new cloudwatch.GraphWidget({
                title: 'ALB 5xx Err (Sum)', width: 12, left: [this.alb5xxMetric],
                leftAnnotations: [{value: alb5xxErrorThreshold, label: 'ALB 5xx Alarm', color: cloudwatch.Color.RED}]
            })
        );
        dashboard.addWidgets(
            new cloudwatch.GraphWidget({
                title: 'ALB Target Response Time (s)', width: 24,
                left: [this.albTargetResponseTimeAvg, this.albTargetResponseTimeP90, this.albTargetResponseTimeP99],
            })
        );
    }

    private createFrontendMonitoring(props: InfraMonitoringProps, dashboard: cloudwatch.Dashboard) {
        const cfNamespace = 'AWS/CloudFront';
        const s3Namespace = 'AWS/S3';
        const cfDimensions = {DistributionId: props.cloudFrontDistributionId, Region: 'Global'};
        const s3Dimensions = {BucketName: props.privateS3BucketName, FilterId: 'EntireBucket'};

        const cf5xxErrorRateThreshold = 1; // 1%
        const cf4xxErrorRateThreshold = 5; // 5%
        const s3Bucket4xxErrorThreshold = 5; // 5 errors

        // Metrics
        this.cf5xxErrorRateMetric = new cloudwatch.Metric({
            namespace: cfNamespace, metricName: '5xxErrorRate', dimensionsMap: cfDimensions,
            statistic: 'Average', period: cdk.Duration.minutes(1), unit: cloudwatch.Unit.PERCENT,
            label: `CF 5xx Error Rate (%) - ${props.environment}`
        });
        this.cf4xxErrorRateMetric = new cloudwatch.Metric({
            namespace: cfNamespace, metricName: '4xxErrorRate', dimensionsMap: cfDimensions,
            statistic: 'Average', period: cdk.Duration.minutes(1), unit: cloudwatch.Unit.PERCENT,
            label: `CF 4xx Error Rate (%) - ${props.environment}`
        });
        this.s3Bucket4xxErrorsMetric = new cloudwatch.Metric({
            namespace: s3Namespace, metricName: '4xxErrors', dimensionsMap: s3Dimensions,
            statistic: 'Sum', period: cdk.Duration.minutes(5), unit: cloudwatch.Unit.COUNT,
            label: `S3 Bucket 4xx Errors - ${props.environment}`
        });

        // Alarms
        const cf5xxAlarm = new cloudwatch.Alarm(this, 'CloudFront5xxErrors', {
            alarmName: `CloudFront-5xxErrors-${props.environment}`,
            alarmDescription: `CloudFront 5xx error rate high for ${props.environment}`,
            metric: this.cf5xxErrorRateMetric, threshold: cf5xxErrorRateThreshold, evaluationPeriods: 2,
            comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
            treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
        });
        cf5xxAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(this.alarmSnsTopic));
        this.allAlarms.push(cf5xxAlarm);

        const cf4xxAlarm = new cloudwatch.Alarm(this, 'CloudFront4xxErrors', {
            alarmName: `CloudFront-4xxErrors-${props.environment}`,
            alarmDescription: `CloudFront 4xx error rate high for ${props.environment}`,
            metric: this.cf4xxErrorRateMetric, threshold: cf4xxErrorRateThreshold, evaluationPeriods: 2,
            comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
            treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
        });
        cf4xxAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(this.alarmSnsTopic));
        this.allAlarms.push(cf4xxAlarm);

        const s3Bucket4xxAlarm = new cloudwatch.Alarm(this, 'S3Bucket4xxErrors', {
            alarmName: `S3Bucket-4xxErrors-${props.environment}-${props.privateS3BucketName}`,
            alarmDescription: `S3 bucket ${props.privateS3BucketName} 4xx errors high for ${props.environment}`,
            metric: this.s3Bucket4xxErrorsMetric, threshold: s3Bucket4xxErrorThreshold, evaluationPeriods: 1,
            comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
            treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
        });
        s3Bucket4xxAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(this.alarmSnsTopic));
        this.allAlarms.push(s3Bucket4xxAlarm);

        // Dashboard Widgets for Frontend
        dashboard.addWidgets(
            new cloudwatch.TextWidget({
                markdown: `## Frontend Monitoring (CloudFront & S3 Private Bucket) - ${props.environment}`,
                width: 24, height: 1
            })
        );
        dashboard.addWidgets(
            new cloudwatch.GraphWidget({
                title: 'CloudFront 5xx Error Rate (%)', left: [this.cf5xxErrorRateMetric],
                leftAnnotations: [{value: cf5xxErrorRateThreshold, label: 'CF 5xx Alarm', color: cloudwatch.Color.RED}]
            }),
            new cloudwatch.GraphWidget({
                title: 'CloudFront 4xx Error Rate (%)', left: [this.cf4xxErrorRateMetric],
                leftAnnotations: [{
                    value: cf4xxErrorRateThreshold,
                    label: 'CF 4xx Alarm',
                    color: cloudwatch.Color.ORANGE
                }]
            }),
            new cloudwatch.GraphWidget({
                title: 'S3 Private Bucket 4xx Errors (Count)', left: [this.s3Bucket4xxErrorsMetric],
                leftAnnotations: [{
                    value: s3Bucket4xxErrorThreshold,
                    label: 'S3 4xx Alarm',
                    color: cloudwatch.Color.ORANGE
                }]
            })
        );
    }

    private createDocumentDbMonitoring(props: InfraMonitoringProps, dashboard: cloudwatch.Dashboard) {
        if (!props.documentDbCluster) {
            console.log('DocumentDB cluster not available, skipping DocumentDB monitoring');
            return;
        }
        
        const docDbNamespace = 'AWS/DocDB';
        const docDbClusterIdentifier = props.documentDbCluster.clusterIdentifier;
        const dimensions = {DBClusterIdentifier: docDbClusterIdentifier};

        const cpuThreshold = 80; // %
        const connectionsThreshold = 500; // Count, depends on instance type
        const freeableMemoryThreshold = 100 * 1024 * 1024; // 100MB in bytes
        const writeLatencyThreshold = 100; // ms
        const readLatencyThreshold = 50; // ms
        const storageUsagePercentageThreshold = 80; // %

        // Metrics
        this.docDbCpuMetric = new cloudwatch.Metric({
            namespace: docDbNamespace,
            metricName: 'CPUUtilization',
            dimensionsMap: {...dimensions, Role: 'WRITER'},
            statistic: 'Average',
            period: cdk.Duration.minutes(1),
            label: 'CPU Utilization (Writer)'
        });
        this.docDbConnectionsMetric = new cloudwatch.Metric({
            namespace: docDbNamespace,
            metricName: 'DatabaseConnections',
            dimensionsMap: dimensions,
            statistic: 'Average',
            period: cdk.Duration.minutes(1)
        });
        this.docDbFreeableMemoryMetric = new cloudwatch.Metric({
            namespace: docDbNamespace,
            metricName: 'FreeableMemory',
            dimensionsMap: dimensions,
            statistic: 'Minimum',
            period: cdk.Duration.minutes(1)
        });
        this.docDbWriteLatencyMetric = new cloudwatch.Metric({
            namespace: docDbNamespace,
            metricName: 'WriteLatency',
            dimensionsMap: dimensions,
            statistic: 'Average',
            period: cdk.Duration.minutes(1)
        });
        this.docDbReadLatencyMetric = new cloudwatch.Metric({
            namespace: docDbNamespace,
            metricName: 'ReadLatency',
            dimensionsMap: dimensions,
            statistic: 'Average',
            period: cdk.Duration.minutes(1)
        });
        this.docDbStorageUsedMetric = new cloudwatch.Metric({
            namespace: docDbNamespace,
            metricName: 'VolumeBytesUsed',
            dimensionsMap: dimensions,
            statistic: 'Average',
            period: cdk.Duration.hours(1)
        }); // Less frequent
        this.docDbReadIopsMetric = new cloudwatch.Metric({
            namespace: docDbNamespace,
            metricName: 'ReadIOPS',
            dimensionsMap: dimensions,
            statistic: 'Average',
            period: cdk.Duration.minutes(1)
        });
        this.docDbWriteIopsMetric = new cloudwatch.Metric({
            namespace: docDbNamespace,
            metricName: 'WriteIOPS',
            dimensionsMap: dimensions,
            statistic: 'Average',
            period: cdk.Duration.minutes(1)
        });
        this.docDbBufferCacheHitRatioMetric = new cloudwatch.Metric({
            namespace: docDbNamespace,
            metricName: 'BufferCacheHitRatio',
            dimensionsMap: dimensions,
            statistic: 'Average',
            period: cdk.Duration.minutes(5)
        });
        this.docDbIndexBufferCacheHitRatioMetric = new cloudwatch.Metric({
            namespace: docDbNamespace,
            metricName: 'IndexBufferCacheHitRatio',
            dimensionsMap: dimensions,
            statistic: 'Average',
            period: cdk.Duration.minutes(5)
        });

        this.docDbReaderCpuMetric = new cloudwatch.Metric({
            namespace: docDbNamespace,
            metricName: 'CPUUtilization',
            dimensionsMap: { ...dimensions, Role: 'READER' },
            statistic: 'Average',
            period: cdk.Duration.minutes(5),
            label: 'CPU Utilization (Reader)'
        });

        // Enhanced DocumentDB Metrics for Transcoding Workload
        const docDbSwapUsageMetric = new cloudwatch.Metric({
            namespace: docDbNamespace,
            metricName: 'SwapUsage',
            dimensionsMap: dimensions,
            statistic: 'Average',
            period: cdk.Duration.minutes(1)
        });

        const docDbNetworkReceiveThroughputMetric = new cloudwatch.Metric({
            namespace: docDbNamespace,
            metricName: 'NetworkReceiveThroughput',
            dimensionsMap: dimensions,
            statistic: 'Average',
            period: cdk.Duration.minutes(1)
        });

        const docDbNetworkTransmitThroughputMetric = new cloudwatch.Metric({
            namespace: docDbNamespace,
            metricName: 'NetworkTransmitThroughput',
            dimensionsMap: dimensions,
            statistic: 'Average',
            period: cdk.Duration.minutes(1)
        });

        const docDbLockWaitsMetric = new cloudwatch.Metric({
            namespace: docDbNamespace,
            metricName: 'LockWaits',
            dimensionsMap: dimensions,
            statistic: 'Sum',
            period: cdk.Duration.minutes(1)
        });

        const docDbCursorsTimedOutMetric = new cloudwatch.Metric({
            namespace: docDbNamespace,
            metricName: 'CursorsTimedOut',
            dimensionsMap: dimensions,
            statistic: 'Sum',
            period: cdk.Duration.minutes(5)
        });

        const docDbCursorsNoTimeoutMetric = new cloudwatch.Metric({
            namespace: docDbNamespace,
            metricName: 'CursorsNoTimeout',
            dimensionsMap: dimensions,
            statistic: 'Average',
            period: cdk.Duration.minutes(1)
        });

        const docDbDocumentsInsertedMetric = new cloudwatch.Metric({
            namespace: docDbNamespace,
            metricName: 'DocumentsInserted',
            dimensionsMap: dimensions,
            statistic: 'Sum',
            period: cdk.Duration.minutes(1)
        });

        const docDbDocumentsReturnedMetric = new cloudwatch.Metric({
            namespace: docDbNamespace,
            metricName: 'DocumentsReturned',
            dimensionsMap: dimensions,
            statistic: 'Sum',
            period: cdk.Duration.minutes(1)
        });

        const docDbDocumentsUpdatedMetric = new cloudwatch.Metric({
            namespace: docDbNamespace,
            metricName: 'DocumentsUpdated',
            dimensionsMap: dimensions,
            statistic: 'Sum',
            period: cdk.Duration.minutes(1)
        });

        const docDbDocumentsDeletedMetric = new cloudwatch.Metric({
            namespace: docDbNamespace,
            metricName: 'DocumentsDeleted',
            dimensionsMap: dimensions,
            statistic: 'Sum',
            period: cdk.Duration.minutes(1)
        });

        // Alarms
        const highCpuAlarm = new cloudwatch.Alarm(this, 'DocDbHighCpu', {
            alarmName: `DocDB-HighCPU-${docDbClusterIdentifier}-${props.environment}`,
            alarmDescription: `DocumentDB cluster ${docDbClusterIdentifier} CPU utilization high in ${props.environment}`,
            metric: this.docDbCpuMetric, threshold: cpuThreshold, evaluationPeriods: 3,
            comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
            treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
        });
        this.allAlarms.push(highCpuAlarm);

        const highConnectionsAlarm = new cloudwatch.Alarm(this, 'DocDbHighConnections', {
            alarmName: `DocDB-HighConnections-${docDbClusterIdentifier}-${props.environment}`,
            alarmDescription: `DocumentDB cluster ${docDbClusterIdentifier} connections high in ${props.environment}`,
            metric: this.docDbConnectionsMetric, threshold: connectionsThreshold, evaluationPeriods: 2,
            comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
            treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
        });
        this.allAlarms.push(highConnectionsAlarm);

        const lowFreeableMemoryAlarm = new cloudwatch.Alarm(this, 'DocDbLowMemory', {
            alarmName: `DocDB-LowFreeableMemory-${docDbClusterIdentifier}-${props.environment}`,
            alarmDescription: `DocumentDB cluster ${docDbClusterIdentifier} freeable memory low in ${props.environment}`,
            metric: this.docDbFreeableMemoryMetric, threshold: freeableMemoryThreshold, evaluationPeriods: 3,
            comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_OR_EQUAL_TO_THRESHOLD,
            treatMissingData: cloudwatch.TreatMissingData.BREACHING
        });
        lowFreeableMemoryAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(this.alarmSnsTopic));
        this.allAlarms.push(lowFreeableMemoryAlarm);

        const highWriteLatencyAlarm = new cloudwatch.Alarm(this, 'DocDbHighWriteLatency', {
            alarmName: `DocDB-HighWriteLatency-${docDbClusterIdentifier}-${props.environment}`,
            alarmDescription: `DocumentDB cluster ${docDbClusterIdentifier} write latency high in ${props.environment}`,
            metric: this.docDbWriteLatencyMetric, threshold: writeLatencyThreshold, evaluationPeriods: 2,
            comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
            treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
        });
        highWriteLatencyAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(this.alarmSnsTopic));
        this.allAlarms.push(highWriteLatencyAlarm);

        const highReadLatencyAlarm = new cloudwatch.Alarm(this, 'DocDbHighReadLatency', {
            alarmName: `DocDB-HighReadLatency-${docDbClusterIdentifier}-${props.environment}`,
            alarmDescription: `DocumentDB cluster ${docDbClusterIdentifier} read latency high in ${props.environment}`,
            metric: this.docDbReadLatencyMetric, threshold: readLatencyThreshold, evaluationPeriods: 2,
            comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
            treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
        });
        highReadLatencyAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(this.alarmSnsTopic));
        this.allAlarms.push(highReadLatencyAlarm);

        // this.createDocumentDbAutoScaling(props);

        // Enhanced DocumentDB Dashboard Widgets
        dashboard.addWidgets(
            new cloudwatch.GraphWidget({
                title: 'DocDB Network Throughput (Bytes/sec)',
                width: 12,
                left: [docDbNetworkReceiveThroughputMetric, docDbNetworkTransmitThroughputMetric]
            }),
            new cloudwatch.GraphWidget({
                title: 'DocDB Document Operations/min',
                width: 12,
                left: [
                    docDbDocumentsInsertedMetric,
                    docDbDocumentsReturnedMetric,
                    docDbDocumentsUpdatedMetric,
                    docDbDocumentsDeletedMetric
                ]
            })
        );
        
        dashboard.addWidgets(
            new cloudwatch.GraphWidget({
                title: 'DocDB Cursor Metrics',
                width: 12,
                left: [docDbCursorsNoTimeoutMetric],
                right: [docDbCursorsTimedOutMetric]
            }),
            new cloudwatch.GraphWidget({
                title: 'DocDB Performance Issues',
                width: 12,
                left: [docDbLockWaitsMetric, docDbSwapUsageMetric]
            })
        );

        // Dashboard Widgets for DocumentDB
        dashboard.addWidgets(
            new cloudwatch.TextWidget({
                markdown: `## DocumentDB Performance: ${docDbClusterIdentifier} (${props.environment})`,
                width: 24, height: 1,
            })
        );
        dashboard.addWidgets(
            new cloudwatch.GraphWidget({
                title: 'DocDB CPU Utilization (Writer/Reader, %)', width: 12,
                left: [this.docDbCpuMetric, this.docDbReaderCpuMetric],
                leftAnnotations: [{value: cpuThreshold, label: 'CPU Alarm (Writer)', color: cloudwatch.Color.RED}],
                rightAnnotations: [{value: 30, label: 'Scale-in Threshold (Reader)', color: cloudwatch.Color.GREEN}]
            }),
            new cloudwatch.GraphWidget({
                title: 'DocDB Connections', width: 12, left: [this.docDbConnectionsMetric],
                leftAnnotations: [{
                    value: connectionsThreshold,
                    label: 'Connections Alarm',
                    color: cloudwatch.Color.RED
                }]
            })
        );
        dashboard.addWidgets(
            new cloudwatch.GraphWidget({
                title: 'DocDB Freeable Memory (Bytes)', width: 12, left: [this.docDbFreeableMemoryMetric],
                leftAnnotations: [{value: freeableMemoryThreshold, label: 'Memory Alarm', color: cloudwatch.Color.RED}]
            }),
            new cloudwatch.GraphWidget({
                title: 'DocDB Volume Bytes Used', width: 12, left: [this.docDbStorageUsedMetric],
                // Add annotation if a meaningful threshold is set for the alarm
                // leftAnnotations: [{ value: fixedStorageThresholdBytes, label: 'Storage Alarm', color: cloudwatch.Color.RED }]
            })
        );
        dashboard.addWidgets(
            new cloudwatch.GraphWidget({
                title: 'DocDB Read/Write IOPS',
                width: 12,
                left: [this.docDbReadIopsMetric, this.docDbWriteIopsMetric]
            }),
            new cloudwatch.GraphWidget({
                title: 'DocDB Read/Write Latency (ms)',
                width: 12,
                left: [this.docDbReadLatencyMetric, this.docDbWriteLatencyMetric],
                leftAnnotations: [
                    {value: readLatencyThreshold, label: 'Read Latency Alarm', color: cloudwatch.Color.ORANGE},
                    {value: writeLatencyThreshold, label: 'Write Latency Alarm', color: cloudwatch.Color.RED}
                ]
            })
        );
        dashboard.addWidgets(
            new cloudwatch.GraphWidget({
                title: 'DocDB Buffer Cache Hit (%)',
                width: 12,
                left: [this.docDbBufferCacheHitRatioMetric]
            }),
            new cloudwatch.GraphWidget({
                title: 'DocDB Index Cache Hit (%)',
                width: 12,
                left: [this.docDbIndexBufferCacheHitRatioMetric]
            })
        );
    }

    private createDocumentDbAutoScaling(
        props: InfraMonitoringProps
    ) {
        // Create Lambda function for DocumentDB auto scaling
        const autoScalingFunction = new lambda.Function(this, "DocDbAutoScalingFunction", {
            runtime: lambda.Runtime.PROVIDED_AL2023,
            handler: "bootstrap",
            code: lambda.Code.fromAsset("lib/db-scaling", {
                bundling: {
                    image: lambda.Runtime.PROVIDED_AL2023.bundlingImage,
                    command: [
                        'bash', '-c', [
                            'cd /asset-input',
                            'go mod tidy',
                            'go mod download',
                            'GOOS=linux GOARCH=amd64 go build -o bootstrap main.go',
                            'cp bootstrap /asset-output/'
                        ].join(' && ')
                    ],
                    user: 'root'
                }
            }),
            timeout: cdk.Duration.minutes(5),
            environment: {
                CLUSTER_IDENTIFIER: props.documentDbCluster?.clusterIdentifier || 'test-cluster',
                MAX_READ_REPLICAS: "14",
                MIN_READ_REPLICAS: "1",
                INSTANCE_CLASS: props.documentDbInstanceClass || "db.r6g.large",
                COOLDOWN_MINUTES: "20", // Prevent scaling operations for 20 minutes after any scaling activity
                CPU_SCALE_OUT_THRESHOLD: "80",
                CPU_SCALE_IN_THRESHOLD: "30",
                CONNECTIONS_SCALE_OUT_THRESHOLD: "500",
                EVALUATION_PERIODS: "3"
            }
        });

        // Grant permissions to the Lambda function
        autoScalingFunction.addToRolePolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
                'rds:DescribeDBClusters',
                'rds:DescribeDBInstances',
                'rds:CreateDBInstance',
                'rds:DeleteDBInstance',
                'cloudwatch:GetMetricStatistics',
                'cloudwatch:GetMetricData'
            ],
            resources: ['*']
        }));

        const schedulerRole = new iam.Role(this, 'AutoScalingSchedulerRole', {
            assumedBy: new iam.ServicePrincipal('scheduler.amazonaws.com'),
        });

        schedulerRole.addToPolicy(new iam.PolicyStatement({
            actions: ['lambda:InvokeFunction'],
            resources: [autoScalingFunction.functionArn]
        }));

        new scheduler.Schedule(this, 'AutoScalingSchedule', {
            schedule: scheduler.ScheduleExpression.rate(cdk.Duration.minutes(1)),
            target: new schedulerTargets.LambdaInvoke(autoScalingFunction, {
                input: scheduler.ScheduleTargetInput.fromObject({
                    source: 'scheduler',
                    environment: props.environment,
                    clusterIdentifier: props.documentDbCluster?.clusterIdentifier || 'test-cluster'
                })
            }),
            description: `DocumentDB autoscaling scheduler for ${props.environment}`
        });
    }
} 