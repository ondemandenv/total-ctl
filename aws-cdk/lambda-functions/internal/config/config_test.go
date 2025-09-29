package config

import (
	"os"
	"testing"
)

func TestLoadGeneratorConfigFromEnv(t *testing.T) {
	// Test missing environment variables
	os.Clearenv()

	_, err := LoadGeneratorConfigFromEnv()
	if err == nil {
		t.Error("Expected error when MONGODB_CONNECTION_STRING is missing")
	}

	// Test with required environment variable
	connectionString := "mongodb://testuser:testpass@test-cluster.cluster-xxx.docdb.amazonaws.com:27017/?tls=true&replicaSet=rs0&readPreference=secondaryPreferred&retryWrites=false"
	os.Setenv("MONGODB_CONNECTION_STRING", connectionString)

	config, err := LoadGeneratorConfigFromEnv()
	if err != nil {
		t.Errorf("Unexpected error: %v", err)
	}

	if config.MongoConnectionString != connectionString {
		t.Errorf("Expected connection string '%s', got '%s'", connectionString, config.MongoConnectionString)
	}
}

func TestMetricsCheckerConfigFromEnv(t *testing.T) {
	// Test missing environment variables
	os.Clearenv()

	_, err := MetricsCheckerConfigFromEnv()
	if err == nil {
		t.Error("Expected error when CLUSTER_IDENTIFIER is missing")
	}

	// Test with all required environment variables
	os.Setenv("CLUSTER_IDENTIFIER", "test-cluster")
	os.Setenv("ENVIRONMENT", "test")

	config, err := MetricsCheckerConfigFromEnv()
	if err != nil {
		t.Errorf("Unexpected error: %v", err)
	}

	if config.ClusterIdentifier != "test-cluster" {
		t.Errorf("Expected cluster identifier 'test-cluster', got '%s'", config.ClusterIdentifier)
	}

	if config.Environment != "test" {
		t.Errorf("Expected environment 'test', got '%s'", config.Environment)
	}
}

func TestGetEnvInt(t *testing.T) {
	os.Clearenv()

	// Test default value when env var is not set
	result := GetEnvInt("TEST_INT", 42)
	if result != 42 {
		t.Errorf("Expected default value 42, got %d", result)
	}

	// Test with valid integer
	os.Setenv("TEST_INT", "123")
	result = GetEnvInt("TEST_INT", 42)
	if result != 123 {
		t.Errorf("Expected 123, got %d", result)
	}

	// Test with invalid integer (should return default)
	os.Setenv("TEST_INT", "invalid")
	result = GetEnvInt("TEST_INT", 42)
	if result != 42 {
		t.Errorf("Expected default value 42 for invalid input, got %d", result)
	}
}

func TestGetEnvString(t *testing.T) {
	os.Clearenv()

	// Test default value when env var is not set
	result := GetEnvString("TEST_STRING", "default")
	if result != "default" {
		t.Errorf("Expected default value 'default', got '%s'", result)
	}

	// Test with set value
	os.Setenv("TEST_STRING", "custom")
	result = GetEnvString("TEST_STRING", "default")
	if result != "custom" {
		t.Errorf("Expected 'custom', got '%s'", result)
	}
}
