package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	"github.com/aws/aws-lambda-go/lambda"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"

	"docdb-autoscaling-lambdas/internal/config"
	"docdb-autoscaling-lambdas/internal/docdb"
)

// LoadGeneratorRequest represents the input to the load generator function
type LoadGeneratorRequest struct {
	DurationMinutes int    `json:"durationMinutes"`
	NumThreads      int    `json:"numThreads"`
	OperationType   string `json:"operationType"` // "read", "write", "mixed"
}

// LoadGeneratorResponse represents the output of the load generator function
type LoadGeneratorResponse struct {
	StatusCode int    `json:"statusCode"`
	Body       string `json:"body"`
}

// LoadGeneratorResult represents the detailed result
type LoadGeneratorResult struct {
	Message         string               `json:"message"`
	TotalOperations int64                `json:"total_operations"`
	ThreadResults   []ThreadResult       `json:"thread_results"`
	TestParameters  LoadGeneratorRequest `json:"test_parameters"`
}

// ThreadResult represents the result from a single thread
type ThreadResult struct {
	ThreadID            int     `json:"thread_id"`
	OperationsCompleted int64   `json:"operations_completed"`
	DurationSeconds     float64 `json:"duration_seconds"`
	Error               string  `json:"error,omitempty"`
}

// LoadWorker handles load generation for a single thread
type LoadWorker struct {
	threadID      int
	operationType string
	client        *docdb.Client
}

// generateLoad performs the actual load generation
func (w *LoadWorker) generateLoad(ctx context.Context, duration time.Duration) ThreadResult {
	startTime := time.Now()
	var operationsCount int64

	dbName := fmt.Sprintf("test_db_%d", w.threadID)
	collectionName := "load_test"

	// Generate load until duration expires
	endTime := startTime.Add(duration)
	for time.Now().Before(endTime) {
		collection := w.client.Collection(dbName, collectionName)

		// Perform operations based on type
		if w.operationType == "write" || w.operationType == "mixed" {
			if err := w.performWrite(ctx, collection, operationsCount); err != nil {
				log.Printf("Write error in thread %d: %v", w.threadID, err)
				continue
			}
			operationsCount++
		}

		if w.operationType == "read" || w.operationType == "mixed" {
			if err := w.performRead(ctx, collection); err != nil {
				log.Printf("Read error in thread %d: %v", w.threadID, err)
				continue
			}
			operationsCount++
		}

		// Small delay to control load intensity
		time.Sleep(10 * time.Millisecond)
	}

	return ThreadResult{
		ThreadID:            w.threadID,
		OperationsCompleted: operationsCount,
		DurationSeconds:     time.Since(startTime).Seconds(),
	}
}

// performWrite inserts a document into the collection
func (w *LoadWorker) performWrite(ctx context.Context, collection *mongo.Collection, counter int64) error {
	doc := bson.M{
		"thread_id": w.threadID,
		"timestamp": time.Now().Unix(),
		"data":      strings.Repeat("x", 1000), // 1KB of data
		"counter":   counter,
	}

	_, err := collection.InsertOne(ctx, doc)
	return err
}

// performRead reads documents from the collection
func (w *LoadWorker) performRead(ctx context.Context, collection *mongo.Collection) error {
	filter := bson.M{"thread_id": w.threadID}
	cursor, err := collection.Find(ctx, filter)
	if err != nil {
		return err
	}
	defer cursor.Close(ctx)

	// Consume up to 100 documents
	count := 0
	for cursor.Next(ctx) && count < 100 {
		var result bson.M
		if err := cursor.Decode(&result); err != nil {
			return err
		}
		count++
	}

	return cursor.Err()
}

// handler is the main Lambda function handler
func handler(ctx context.Context, request LoadGeneratorRequest) (LoadGeneratorResponse, error) {
	log.Printf("Starting load generation with parameters: %+v", request)

	// Load configuration
	dbConfig, err := config.LoadGeneratorConfigFromEnv()
	if err != nil {
		return LoadGeneratorResponse{
			StatusCode: 500,
			Body:       fmt.Sprintf(`{"error": "%s", "message": "Configuration error"}`, err.Error()),
		}, nil
	}

	// Set defaults
	if request.DurationMinutes <= 0 {
		request.DurationMinutes = 5
	}
	if request.NumThreads <= 0 {
		request.NumThreads = 5
	}
	if request.OperationType == "" {
		request.OperationType = "read"
	}

	log.Printf("Using MongoDB connection string: [REDACTED]")
	log.Printf("Test parameters - Duration: %d min, Threads: %d, Operation: %s",
		request.DurationMinutes, request.NumThreads, request.OperationType)

	// Create a single, shared DocumentDB client
	client, err := docdb.NewClient(dbConfig.MongoConnectionString)
	if err != nil {
		return LoadGeneratorResponse{
			StatusCode: 500,
			Body:       fmt.Sprintf(`{"error": "%s", "message": "Failed to create DocumentDB client"}`, err.Error()),
		}, nil
	}
	if err := client.Connect(ctx); err != nil {
		return LoadGeneratorResponse{
			StatusCode: 500,
			Body:       fmt.Sprintf(`{"error": "%s", "message": "Failed to connect to DocumentDB"}`, err.Error()),
		}, nil
	}
	defer client.Disconnect(ctx)

	duration := time.Duration(request.DurationMinutes) * time.Minute

	// Create workers and run them concurrently
	var wg sync.WaitGroup
	results := make([]ThreadResult, request.NumThreads)

	for i := 0; i < request.NumThreads; i++ {
		wg.Add(1)
		go func(threadID int) {
			defer wg.Done()

			worker := &LoadWorker{
				threadID:      threadID,
				operationType: request.OperationType,
				client:        client,
			}

			results[threadID] = worker.generateLoad(ctx, duration)
			log.Printf("Thread %d completed: %+v", threadID, results[threadID])
		}(i)
	}

	// Wait for all workers to complete
	wg.Wait()

	// Calculate total operations
	var totalOperations int64
	for _, result := range results {
		totalOperations += result.OperationsCompleted
	}

	// Prepare response
	result := LoadGeneratorResult{
		Message:         "Load generation completed",
		TotalOperations: totalOperations,
		ThreadResults:   results,
		TestParameters:  request,
	}

	// Check if any threads had errors
	hasErrors := false
	for _, threadResult := range results {
		if threadResult.Error != "" {
			hasErrors = true
			break
		}
	}

	statusCode := 200
	if hasErrors {
		result.Message = "Load generation completed with some errors"
		statusCode = 206 // Partial success
	}

	responseBody, err := json.Marshal(result)
	if err != nil {
		return LoadGeneratorResponse{
			StatusCode: 500,
			Body:       fmt.Sprintf(`{"error": "%s", "message": "Failed to marshal response"}`, err.Error()),
		}, nil
	}

	log.Printf("Load generation completed successfully. Total operations: %d", totalOperations)

	return LoadGeneratorResponse{
		StatusCode: statusCode,
		Body:       string(responseBody),
	}, nil
}

func main() {
	lambda.Start(handler)
}
