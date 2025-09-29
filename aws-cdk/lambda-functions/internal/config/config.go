package config

import (
	"fmt"
	"os"
	"strconv"
)

// LoadGeneratorConfig holds configuration for the load generator function
type LoadGeneratorConfig struct {
	MongoConnectionString string
}

// MetricsCheckerConfig holds configuration for the metrics checker function
type MetricsCheckerConfig struct {
	ClusterIdentifier string
	Environment       string
}

// LoadGeneratorConfigFromEnv loads load generator configuration from environment variables
func LoadGeneratorConfigFromEnv() (*LoadGeneratorConfig, error) {
	connectionString := os.Getenv("MONGODB_CONNECTION_STRING")
	if connectionString == "" {
		return nil, fmt.Errorf("MONGODB_CONNECTION_STRING environment variable is required")
	}

	return &LoadGeneratorConfig{
		MongoConnectionString: connectionString,
	}, nil
}

// MetricsCheckerConfigFromEnv loads metrics checker configuration from environment variables
func MetricsCheckerConfigFromEnv() (*MetricsCheckerConfig, error) {
	clusterID := os.Getenv("CLUSTER_IDENTIFIER")
	if clusterID == "" {
		return nil, fmt.Errorf("CLUSTER_IDENTIFIER environment variable is required")
	}

	environment := os.Getenv("ENVIRONMENT")
	if environment == "" {
		return nil, fmt.Errorf("ENVIRONMENT environment variable is required")
	}

	return &MetricsCheckerConfig{
		ClusterIdentifier: clusterID,
		Environment:       environment,
	}, nil
}

// GetEnvInt gets an integer environment variable with a default value
func GetEnvInt(key string, defaultValue int) int {
	if value := os.Getenv(key); value != "" {
		if intValue, err := strconv.Atoi(value); err == nil {
			return intValue
		}
	}
	return defaultValue
}

// GetEnvString gets a string environment variable with a default value
func GetEnvString(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
