package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"sort"
	"strconv"
	"time"

	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go/aws"
	"github.com/aws/aws-sdk-go/aws/session"
	"github.com/aws/aws-sdk-go/service/cloudwatch"
	"github.com/aws/aws-sdk-go/service/docdb"
)

type SchedulerEvent struct {
	Source            string `json:"source"`
	Environment       string `json:"environment"`
	ClusterIdentifier string `json:"clusterIdentifier"`
}

type Response struct {
	StatusCode int    `json:"statusCode"`
	Body       string `json:"body"`
}

type MetricValue struct {
	Timestamp time.Time
	Value     float64
}

var (
	docdbClient                  *docdb.DocDB
	cloudwatchClient             *cloudwatch.CloudWatch
	clusterIdentifier            string
	maxReadReplicas              int
	minReadReplicas              int
	instanceClass                string
	cooldownMinutes              int
	cpuScaleOutThreshold         float64
	cpuScaleInThreshold          float64
	connectionsScaleOutThreshold float64
	evaluationPeriods            int
)

func init() {
	sess := session.Must(session.NewSession())
	docdbClient = docdb.New(sess)
	cloudwatchClient = cloudwatch.New(sess)

	clusterIdentifier = os.Getenv("CLUSTER_IDENTIFIER")
	if clusterIdentifier == "" {
		log.Fatal("CLUSTER_IDENTIFIER environment variable is required")
	}

	maxReadReplicas = getEnvInt("MAX_READ_REPLICAS", 10)
	minReadReplicas = getEnvInt("MIN_READ_REPLICAS", 1)
	instanceClass = os.Getenv("INSTANCE_CLASS")
	if instanceClass == "" {
		instanceClass = "db.r6g.large"
	}

	cooldownMinutes = getEnvInt("COOLDOWN_MINUTES", 15)
	cpuScaleOutThreshold = getEnvFloat("CPU_SCALE_OUT_THRESHOLD", 70.0)
	cpuScaleInThreshold = getEnvFloat("CPU_SCALE_IN_THRESHOLD", 30.0)
	connectionsScaleOutThreshold = getEnvFloat("CONNECTIONS_SCALE_OUT_THRESHOLD", 400.0)
	evaluationPeriods = getEnvInt("EVALUATION_PERIODS", 3)

	log.Printf("Initialized with cluster: %s, max replicas: %d, min replicas: %d",
		clusterIdentifier, maxReadReplicas, minReadReplicas)
}

func getEnvInt(key string, defaultValue int) int {
	if value := os.Getenv(key); value != "" {
		if intValue, err := strconv.Atoi(value); err == nil {
			return intValue
		}
	}
	return defaultValue
}

func getEnvFloat(key string, defaultValue float64) float64 {
	if value := os.Getenv(key); value != "" {
		if floatValue, err := strconv.ParseFloat(value, 64); err == nil {
			return floatValue
		}
	}
	return defaultValue
}

func handler(ctx context.Context, event SchedulerEvent) (Response, error) {
	log.Printf("Processing scheduler event for cluster: %s", event.ClusterIdentifier)

	// Get current cluster information
	clusterInfo, err := getClusterInfo()
	if err != nil {
		log.Printf("Error getting cluster info: %v", err)
		return Response{StatusCode: 500, Body: fmt.Sprintf("Error: %v", err)}, nil
	}

	log.Printf("Current cluster state: %d readers", clusterInfo.ReaderCount)

	// Get current metrics
	metrics, err := getCurrentMetrics()
	if err != nil {
		log.Printf("Error getting metrics: %v", err)
		return Response{StatusCode: 500, Body: fmt.Sprintf("Error: %v", err)}, nil
	}

	log.Printf("Current metrics - Writer CPU: %.1f%%, Reader CPU: %.1f%%, Writer Connections: %.0f",
		metrics.WriterCPU, metrics.ReaderCPU, metrics.WriterConnections)

	// Make scaling decision
	decision := makeScalingDecision(clusterInfo, metrics)
	log.Printf("Scaling decision: %s - %s", decision.Action, decision.Reason)

	// Execute scaling action if needed
	if decision.Action != "none" {
		err = executeScalingAction(decision, clusterInfo)
		if err != nil {
			log.Printf("Error executing scaling action: %v", err)
			return Response{StatusCode: 500, Body: fmt.Sprintf("Error: %v", err)}, nil
		}
		log.Printf("Successfully executed scaling action: %s", decision.Action)
	}

	return Response{
		StatusCode: 200,
		Body:       fmt.Sprintf("Scaling decision: %s", decision.Action),
	}, nil
}

type ClusterInfo struct {
	ReaderCount     int
	WriterCount     int
	ReaderInstances []ReaderInstance
}

type ReaderInstance struct {
	Identifier string
	CreateTime time.Time
	Status     string
}

type Metrics struct {
	WriterCPU         float64
	ReaderCPU         float64
	WriterConnections float64
	Timestamp         time.Time
}

type ScalingDecision struct {
	Action    string // "scale_out", "scale_in", "none"
	Reason    string
	Threshold float64
	Current   float64
}

func getClusterInfo() (*ClusterInfo, error) {
	input := &docdb.DescribeDBClustersInput{
		DBClusterIdentifier: aws.String(clusterIdentifier),
	}
	result, err := docdbClient.DescribeDBClusters(input)
	if err != nil {
		return nil, fmt.Errorf("failed to describe cluster: %w", err)
	}
	if len(result.DBClusters) == 0 {
		return nil, fmt.Errorf("cluster %s not found", clusterIdentifier)
	}

	cluster := result.DBClusters[0]
	info := &ClusterInfo{}

	for _, member := range cluster.DBClusterMembers {
		if member.IsClusterWriter != nil && *member.IsClusterWriter {
			info.WriterCount++
		} else {
			// Get detailed instance information
			instanceInput := &docdb.DescribeDBInstancesInput{
				DBInstanceIdentifier: member.DBInstanceIdentifier,
			}
			instanceResult, err := docdbClient.DescribeDBInstances(instanceInput)
			if err != nil {
				log.Printf("Warning: Failed to describe instance %s: %v", *member.DBInstanceIdentifier, err)
				continue
			}
			if len(instanceResult.DBInstances) > 0 {
				instance := instanceResult.DBInstances[0]
				if instance.InstanceCreateTime != nil {
					info.ReaderInstances = append(info.ReaderInstances, ReaderInstance{
						Identifier: *instance.DBInstanceIdentifier,
						CreateTime: *instance.InstanceCreateTime,
						Status:     *instance.DBInstanceStatus,
					})
					info.ReaderCount++
				}
			}
		}
	}

	log.Printf("Current cluster state: %d writers, %d readers", info.WriterCount, info.ReaderCount)
	return info, nil
}

func getCurrentMetrics() (*Metrics, error) {
	endTime := time.Now()
	startTime := endTime.Add(-time.Duration(evaluationPeriods) * time.Minute)

	// Get Writer CPU utilization
	writerCPU, err := getMetricValue("CPUUtilization", "WRITER", startTime, endTime)
	if err != nil {
		return nil, fmt.Errorf("failed to get writer CPU metric: %w", err)
	}

	// Get Reader CPU utilization (average across all readers)
	readerCPU, err := getMetricValue("CPUUtilization", "READER", startTime, endTime)
	if err != nil {
		log.Printf("Warning: Failed to get reader CPU metric: %v", err)
		readerCPU = 0 // Default to 0 if no readers exist
	}

	// Get Writer connections
	writerConnections, err := getMetricValue("DatabaseConnections", "WRITER", startTime, endTime)
	if err != nil {
		return nil, fmt.Errorf("failed to get writer connections metric: %w", err)
	}

	metrics := &Metrics{
		WriterCPU:         writerCPU,
		ReaderCPU:         readerCPU,
		WriterConnections: writerConnections,
		Timestamp:         endTime,
	}

	log.Printf("Current metrics - Writer CPU: %.1f%%, Reader CPU: %.1f%%, Writer Connections: %.0f",
		metrics.WriterCPU, metrics.ReaderCPU, metrics.WriterConnections)

	return metrics, nil
}

func getMetricValue(metricName, role string, startTime, endTime time.Time) (float64, error) {
	input := &cloudwatch.GetMetricStatisticsInput{
		Namespace:  aws.String("AWS/DocDB"),
		MetricName: aws.String(metricName),
		Dimensions: []*cloudwatch.Dimension{
			{
				Name:  aws.String("DBClusterIdentifier"),
				Value: aws.String(clusterIdentifier),
			},
			{
				Name:  aws.String("Role"),
				Value: aws.String(role),
			},
		},
		StartTime:  aws.Time(startTime),
		EndTime:    aws.Time(endTime),
		Period:     aws.Int64(60), // 1 minute periods
		Statistics: []*string{aws.String("Average")},
	}

	result, err := cloudwatchClient.GetMetricStatistics(input)
	if err != nil {
		return 0, err
	}

	if len(result.Datapoints) == 0 {
		return 0, nil // No data available
	}

	// Calculate average of the evaluation period
	var sum float64
	for _, datapoint := range result.Datapoints {
		if datapoint.Average != nil {
			sum += *datapoint.Average
		}
	}

	return sum / float64(len(result.Datapoints)), nil
}

func makeScalingDecision(clusterInfo *ClusterInfo, metrics *Metrics) ScalingDecision {
	// Check for scale out conditions
	if metrics.WriterCPU >= cpuScaleOutThreshold {
		if clusterInfo.ReaderCount < maxReadReplicas {
			return ScalingDecision{
				Action:    "scale_out",
				Reason:    "Writer CPU utilization high",
				Threshold: cpuScaleOutThreshold,
				Current:   metrics.WriterCPU,
			}
		} else {
			log.Printf("Scale out needed but already at max replicas (%d)", maxReadReplicas)
		}
	}

	if metrics.WriterConnections >= connectionsScaleOutThreshold {
		if clusterInfo.ReaderCount < maxReadReplicas {
			return ScalingDecision{
				Action:    "scale_out",
				Reason:    "Writer connections high",
				Threshold: connectionsScaleOutThreshold,
				Current:   metrics.WriterConnections,
			}
		} else {
			log.Printf("Scale out needed but already at max replicas (%d)", maxReadReplicas)
		}
	}

	// Check for scale in conditions
	if metrics.ReaderCPU <= cpuScaleInThreshold && metrics.WriterCPU <= cpuScaleInThreshold {
		if clusterInfo.ReaderCount > minReadReplicas {
			return ScalingDecision{
				Action:    "scale_in",
				Reason:    "CPU utilization low on both writer and readers",
				Threshold: cpuScaleInThreshold,
				Current:   metrics.ReaderCPU,
			}
		} else {
			log.Printf("Scale in conditions met but already at min replicas (%d)", minReadReplicas)
		}
	}

	return ScalingDecision{Action: "none", Reason: "No scaling conditions met"}
}

func executeScalingAction(decision ScalingDecision, clusterInfo *ClusterInfo) error {
	switch decision.Action {
	case "scale_out":
		return scaleOut()
	case "scale_in":
		return scaleIn(clusterInfo)
	default:
		return nil
	}
}

func scaleOut() error {
	log.Printf("Scaling out cluster: %s", clusterIdentifier)

	// Generate a unique instance identifier
	timestamp := time.Now().Unix()
	newInstanceId := fmt.Sprintf("%s-reader-%d", clusterIdentifier, timestamp)

	createInput := &docdb.CreateDBInstanceInput{
		DBInstanceIdentifier: aws.String(newInstanceId),
		DBClusterIdentifier:  aws.String(clusterIdentifier),
		DBInstanceClass:      aws.String(instanceClass),
		Engine:               aws.String("docdb"),
	}

	_, err := docdbClient.CreateDBInstance(createInput)
	if err != nil {
		return fmt.Errorf("failed to create read replica: %w", err)
	}

	log.Printf("Successfully initiated creation of read replica: %s", newInstanceId)
	return nil
}

func scaleIn(clusterInfo *ClusterInfo) error {
	log.Printf("Scaling in cluster: %s", clusterIdentifier)

	// Check if an instance is already being deleted
	for _, instance := range clusterInfo.ReaderInstances {
		if instance.Status == "deleting" {
			log.Printf("Skipping scale-in: instance %s is already being deleted.", instance.Identifier)
			return nil
		}
	}

	if len(clusterInfo.ReaderInstances) <= minReadReplicas {
		log.Printf("Already at or below minimum read replicas (%d)", minReadReplicas)
		return nil
	}

	// Sort readers by creation time (oldest first)
	sort.Slice(clusterInfo.ReaderInstances, func(i, j int) bool {
		return clusterInfo.ReaderInstances[i].CreateTime.Before(clusterInfo.ReaderInstances[j].CreateTime)
	})

	// Find the first reader that is outside the cooldown period and available
	cooldownThreshold := time.Now().Add(-time.Duration(cooldownMinutes) * time.Minute)
	var instanceToDelete *ReaderInstance

	for _, r := range clusterInfo.ReaderInstances {
		log.Printf("Checking reader instance %s (created at %s, status: %s)", r.Identifier, r.CreateTime, r.Status)
		if r.CreateTime.Before(cooldownThreshold) && r.Status == "available" {
			instanceToDelete = &r
			log.Printf("Selected instance %s for deletion as it is outside the %d-minute cooldown and is available.", r.Identifier, cooldownMinutes)
			break
		}
	}

	if instanceToDelete == nil {
		log.Printf("Skipping scale-in: no available reader instances are old enough to be removed from cooldown.")
		return nil
	}

	// Delete the selected instance
	log.Printf("Deleting instance: %s", instanceToDelete.Identifier)
	deleteInput := &docdb.DeleteDBInstanceInput{
		DBInstanceIdentifier: aws.String(instanceToDelete.Identifier),
	}
	_, err := docdbClient.DeleteDBInstance(deleteInput)
	if err != nil {
		return fmt.Errorf("failed to delete instance %s: %w", instanceToDelete.Identifier, err)
	}

	log.Printf("Successfully initiated deletion of instance %s", instanceToDelete.Identifier)
	return nil
}

func main() {
	lambda.Start(handler)
}
