package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"time"

	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go/aws"
	"github.com/aws/aws-sdk-go/service/cloudwatch"
	"github.com/aws/aws-sdk-go/service/docdb"

	awsClients "docdb-autoscaling-lambdas/internal/aws"
	"docdb-autoscaling-lambdas/internal/config"
)

// MetricsCheckerRequest represents the input to the metrics checker function
type MetricsCheckerRequest struct {
	// Optional parameters for customizing the check
	LookbackMinutes int `json:"lookbackMinutes,omitempty"`
}

// MetricsCheckerResponse represents the output of the metrics checker function
type MetricsCheckerResponse struct {
	StatusCode int    `json:"statusCode"`
	Body       string `json:"body"`
}

// MetricsCheckerResult represents the detailed result
type MetricsCheckerResult struct {
	ClusterStatus ClusterStatus         `json:"cluster_status"`
	Metrics       MetricsData           `json:"metrics"`
	AlarmStates   map[string]AlarmState `json:"alarm_states"`
	Timestamp     string                `json:"timestamp"`
}

// ClusterStatus represents DocumentDB cluster information
type ClusterStatus struct {
	ClusterID          string              `json:"cluster_id"`
	Status             string              `json:"status"`
	TotalInstances     int                 `json:"total_instances"`
	WriterInstances    int                 `json:"writer_instances"`
	ReadReplicas       int                 `json:"read_replicas"`
	ReadReplicaDetails []ReadReplicaDetail `json:"read_replica_details"`
}

// ReadReplicaDetail represents information about a read replica
type ReadReplicaDetail struct {
	InstanceID    string `json:"instance_id"`
	InstanceClass string `json:"instance_class"`
	Status        string `json:"status"`
}

// MetricsData represents CloudWatch metrics
type MetricsData struct {
	CPUUtilization      MetricValues `json:"cpu_utilization"`
	DatabaseConnections MetricValues `json:"database_connections"`
}

// MetricValues represents metric statistics
type MetricValues struct {
	Average float64 `json:"average"`
	Maximum float64 `json:"maximum"`
}

// AlarmState represents CloudWatch alarm information
type AlarmState struct {
	State   string `json:"state"`
	Reason  string `json:"reason"`
	Updated string `json:"updated"`
	Error   string `json:"error,omitempty"`
}

// MetricsChecker handles metrics checking operations
type MetricsChecker struct {
	clients *awsClients.Clients
	config  *config.MetricsCheckerConfig
}

// NewMetricsChecker creates a new metrics checker
func NewMetricsChecker(clients *awsClients.Clients, config *config.MetricsCheckerConfig) *MetricsChecker {
	return &MetricsChecker{
		clients: clients,
		config:  config,
	}
}

// checkClusterStatus retrieves DocumentDB cluster status and instance information
func (mc *MetricsChecker) checkClusterStatus(ctx context.Context) (ClusterStatus, error) {
	input := &docdb.DescribeDBClustersInput{
		DBClusterIdentifier: aws.String(mc.config.ClusterIdentifier),
	}

	result, err := mc.clients.DocDB.DescribeDBClustersWithContext(ctx, input)
	if err != nil {
		return ClusterStatus{}, fmt.Errorf("failed to describe DB clusters: %w", err)
	}

	if len(result.DBClusters) == 0 {
		return ClusterStatus{}, fmt.Errorf("cluster %s not found", mc.config.ClusterIdentifier)
	}

	cluster := result.DBClusters[0]
	clusterMembers := cluster.DBClusterMembers

	var readReplicas []ReadReplicaDetail
	var writerCount, readerCount int

	// Get detailed instance information
	instancesInput := &docdb.DescribeDBInstancesInput{
		Filters: []*docdb.Filter{
			{
				Name:   aws.String("db-cluster-id"),
				Values: []*string{aws.String(mc.config.ClusterIdentifier)},
			},
		},
	}

	instancesResult, err := mc.clients.DocDB.DescribeDBInstancesWithContext(ctx, instancesInput)
	if err != nil {
		// If we can't get instance details, fall back to basic info
		for _, member := range clusterMembers {
			if member.IsClusterWriter != nil && *member.IsClusterWriter {
				writerCount++
			} else {
				readerCount++
				readReplicas = append(readReplicas, ReadReplicaDetail{
					InstanceID:    aws.StringValue(member.DBInstanceIdentifier),
					InstanceClass: "unknown",
					Status:        "unknown",
				})
			}
		}
	} else {
		// Create a map of instance details for quick lookup
		instanceDetails := make(map[string]*docdb.DBInstance)
		for _, instance := range instancesResult.DBInstances {
			instanceDetails[aws.StringValue(instance.DBInstanceIdentifier)] = instance
		}

		for _, member := range clusterMembers {
			if member.IsClusterWriter != nil && *member.IsClusterWriter {
				writerCount++
			} else {
				readerCount++
				instanceID := aws.StringValue(member.DBInstanceIdentifier)

				// Get detailed info if available
				instanceClass := "unknown"
				status := "unknown"
				if instance, exists := instanceDetails[instanceID]; exists {
					instanceClass = aws.StringValue(instance.DBInstanceClass)
					status = aws.StringValue(instance.DBInstanceStatus)
				}

				readReplicas = append(readReplicas, ReadReplicaDetail{
					InstanceID:    instanceID,
					InstanceClass: instanceClass,
					Status:        status,
				})
			}
		}
	}

	return ClusterStatus{
		ClusterID:          mc.config.ClusterIdentifier,
		Status:             aws.StringValue(cluster.Status),
		TotalInstances:     len(clusterMembers),
		WriterInstances:    writerCount,
		ReadReplicas:       readerCount,
		ReadReplicaDetails: readReplicas,
	}, nil
}

// getMetrics retrieves CloudWatch metrics for the cluster
func (mc *MetricsChecker) getMetrics(ctx context.Context, lookbackMinutes int) (MetricsData, error) {
	endTime := time.Now()
	startTime := endTime.Add(-time.Duration(lookbackMinutes) * time.Minute)

	// Get CPU metrics
	cpuMetrics, err := mc.getMetricStatistics(ctx, "CPUUtilization", startTime, endTime)
	if err != nil {
		return MetricsData{}, fmt.Errorf("failed to get CPU metrics: %w", err)
	}

	// Get connection metrics
	connectionMetrics, err := mc.getMetricStatistics(ctx, "DatabaseConnections", startTime, endTime)
	if err != nil {
		return MetricsData{}, fmt.Errorf("failed to get connection metrics: %w", err)
	}

	return MetricsData{
		CPUUtilization:      cpuMetrics,
		DatabaseConnections: connectionMetrics,
	}, nil
}

// getMetricStatistics retrieves statistics for a specific metric
func (mc *MetricsChecker) getMetricStatistics(ctx context.Context, metricName string, startTime, endTime time.Time) (MetricValues, error) {
	input := &cloudwatch.GetMetricStatisticsInput{
		Namespace:  aws.String("AWS/DocDB"),
		MetricName: aws.String(metricName),
		Dimensions: []*cloudwatch.Dimension{
			{
				Name:  aws.String("DBClusterIdentifier"),
				Value: aws.String(mc.config.ClusterIdentifier),
			},
		},
		StartTime:  aws.Time(startTime),
		EndTime:    aws.Time(endTime),
		Period:     aws.Int64(300), // 5-minute periods
		Statistics: []*string{aws.String("Average"), aws.String("Maximum")},
	}

	result, err := mc.clients.CloudWatch.GetMetricStatisticsWithContext(ctx, input)
	if err != nil {
		return MetricValues{}, err
	}

	if len(result.Datapoints) == 0 {
		return MetricValues{Average: 0, Maximum: 0}, nil
	}

	var avgSum, maxValue float64
	for _, datapoint := range result.Datapoints {
		if datapoint.Average != nil {
			avgSum += *datapoint.Average
		}
		if datapoint.Maximum != nil && *datapoint.Maximum > maxValue {
			maxValue = *datapoint.Maximum
		}
	}

	average := avgSum / float64(len(result.Datapoints))

	return MetricValues{
		Average: math.Round(average*100) / 100, // Round to 2 decimal places
		Maximum: math.Round(maxValue*100) / 100,
	}, nil
}

// checkAlarmStates retrieves the state of relevant CloudWatch alarms
func (mc *MetricsChecker) checkAlarmStates(ctx context.Context) map[string]AlarmState {
	alarmNames := []string{
		fmt.Sprintf("DocDB-HighCPU-%s-%s", mc.config.ClusterIdentifier, mc.config.Environment),
		fmt.Sprintf("DocDB-HighConnections-%s-%s", mc.config.ClusterIdentifier, mc.config.Environment),
		fmt.Sprintf("DocDB-LowCPU-%s-%s", mc.config.ClusterIdentifier, mc.config.Environment),
	}

	alarmStates := make(map[string]AlarmState)

	for _, alarmName := range alarmNames {
		input := &cloudwatch.DescribeAlarmsInput{
			AlarmNames: []*string{aws.String(alarmName)},
		}

		result, err := mc.clients.CloudWatch.DescribeAlarmsWithContext(ctx, input)
		if err != nil {
			alarmStates[alarmName] = AlarmState{
				Error: err.Error(),
			}
			continue
		}

		if len(result.MetricAlarms) == 0 {
			alarmStates[alarmName] = AlarmState{
				Error: "alarm not found",
			}
			continue
		}

		alarm := result.MetricAlarms[0]
		alarmStates[alarmName] = AlarmState{
			State:   aws.StringValue(alarm.StateValue),
			Reason:  aws.StringValue(alarm.StateReason),
			Updated: alarm.StateUpdatedTimestamp.Format(time.RFC3339),
		}
	}

	return alarmStates
}

// handler is the main Lambda function handler
func handler(ctx context.Context, event json.RawMessage) (MetricsCheckerResponse, error) {
	log.Printf("Received event: %s", string(event))

	// Try to parse as MetricsCheckerRequest first
	var request MetricsCheckerRequest

	// Handle different input formats
	if err := json.Unmarshal(event, &request); err != nil {
		// If direct parsing fails, try to extract from Step Function context
		var stepFunctionInput map[string]interface{}
		if err2 := json.Unmarshal(event, &stepFunctionInput); err2 != nil {
			// If that fails too, try as array (some services send arrays)
			var arrayInput []interface{}
			if err3 := json.Unmarshal(event, &arrayInput); err3 != nil {
				log.Printf("Failed to parse input as object, map, or array: %v, %v, %v", err, err2, err3)
				// Use default values if parsing fails
				request = MetricsCheckerRequest{LookbackMinutes: 10}
			} else {
				// Handle array input - use first element or default
				if len(arrayInput) > 0 {
					if firstItem, ok := arrayInput[0].(map[string]interface{}); ok {
						if lookback, exists := firstItem["lookbackMinutes"]; exists {
							if lookbackFloat, ok := lookback.(float64); ok {
								request.LookbackMinutes = int(lookbackFloat)
							}
						}
					}
				}
				if request.LookbackMinutes == 0 {
					request.LookbackMinutes = 10
				}
			}
		} else {
			// Extract from Step Function context if available
			if lookback, exists := stepFunctionInput["lookbackMinutes"]; exists {
				if lookbackFloat, ok := lookback.(float64); ok {
					request.LookbackMinutes = int(lookbackFloat)
				}
			}
			if request.LookbackMinutes == 0 {
				request.LookbackMinutes = 10
			}
		}
	}

	log.Printf("Starting metrics check with parameters: %+v", request)

	// Load configuration
	cfg, err := config.MetricsCheckerConfigFromEnv()
	if err != nil {
		return MetricsCheckerResponse{
			StatusCode: 500,
			Body:       fmt.Sprintf(`{"error": "%s", "message": "Configuration error"}`, err.Error()),
		}, nil
	}

	// Create AWS clients
	clients, err := awsClients.NewClients()
	if err != nil {
		return MetricsCheckerResponse{
			StatusCode: 500,
			Body:       fmt.Sprintf(`{"error": "%s", "message": "Failed to create AWS clients"}`, err.Error()),
		}, nil
	}

	// Set default lookback period
	lookbackMinutes := request.LookbackMinutes
	if lookbackMinutes <= 0 {
		lookbackMinutes = 10
	}

	log.Printf("Checking metrics for cluster: %s, environment: %s, lookback: %d minutes",
		cfg.ClusterIdentifier, cfg.Environment, lookbackMinutes)

	// Create metrics checker
	metricsChecker := NewMetricsChecker(clients, cfg)

	// Check cluster status
	clusterStatus, err := metricsChecker.checkClusterStatus(ctx)
	if err != nil {
		return MetricsCheckerResponse{
			StatusCode: 500,
			Body:       fmt.Sprintf(`{"error": "%s", "cluster_id": "%s"}`, err.Error(), cfg.ClusterIdentifier),
		}, nil
	}

	// Get metrics
	metrics, err := metricsChecker.getMetrics(ctx, lookbackMinutes)
	if err != nil {
		return MetricsCheckerResponse{
			StatusCode: 500,
			Body:       fmt.Sprintf(`{"error": "%s", "cluster_id": "%s"}`, err.Error(), cfg.ClusterIdentifier),
		}, nil
	}

	// Check alarm states
	alarmStates := metricsChecker.checkAlarmStates(ctx)

	// Prepare response
	result := MetricsCheckerResult{
		ClusterStatus: clusterStatus,
		Metrics:       metrics,
		AlarmStates:   alarmStates,
		Timestamp:     time.Now().Format(time.RFC3339),
	}

	responseBody, err := json.Marshal(result)
	if err != nil {
		return MetricsCheckerResponse{
			StatusCode: 500,
			Body:       fmt.Sprintf(`{"error": "%s", "message": "Failed to marshal response"}`, err.Error()),
		}, nil
	}

	log.Printf("Metrics check completed successfully. Cluster: %s, Status: %s, Read Replicas: %d",
		clusterStatus.ClusterID, clusterStatus.Status, clusterStatus.ReadReplicas)
	log.Printf("CPU: avg=%.2f%%, max=%.2f%%, Connections: avg=%.0f, max=%.0f",
		metrics.CPUUtilization.Average, metrics.CPUUtilization.Maximum,
		metrics.DatabaseConnections.Average, metrics.DatabaseConnections.Maximum)

	return MetricsCheckerResponse{
		StatusCode: 200,
		Body:       string(responseBody),
	}, nil
}

func main() {
	lambda.Start(handler)
}
