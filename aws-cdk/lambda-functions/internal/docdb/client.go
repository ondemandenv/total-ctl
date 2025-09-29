package docdb

import (
	"context"
	"crypto/tls"
	"fmt"
	"time"

	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// Client wraps MongoDB client with DocumentDB-specific configuration
type Client struct {
	client           *mongo.Client
	connectionString string
}

// NewClient creates a new DocumentDB client
func NewClient(connectionString string) (*Client, error) {
	return &Client{
		connectionString: connectionString,
	}, nil
}

// Connect establishes connection to DocumentDB
func (c *Client) Connect(ctx context.Context) error {
	// Configure TLS for DocumentDB
	tlsConfig := &tls.Config{
		InsecureSkipVerify: false, // Set to true only for testing
	}

	clientOptions := options.Client().
		ApplyURI(c.connectionString).
		SetTLSConfig(tlsConfig).
		SetConnectTimeout(30 * time.Second).
		SetSocketTimeout(30 * time.Second).
		SetServerSelectionTimeout(30 * time.Second).
		SetMaxPoolSize(50).
		SetMinPoolSize(5)

	client, err := mongo.Connect(ctx, clientOptions)
	if err != nil {
		return fmt.Errorf("failed to connect to DocumentDB: %w", err)
	}

	// Test the connection
	if err := client.Ping(ctx, nil); err != nil {
		return fmt.Errorf("failed to ping DocumentDB: %w", err)
	}

	c.client = client
	return nil
}

// Disconnect closes the connection to DocumentDB
func (c *Client) Disconnect(ctx context.Context) error {
	if c.client != nil {
		return c.client.Disconnect(ctx)
	}
	return nil
}

// GetClient returns the underlying MongoDB client
func (c *Client) GetClient() *mongo.Client {
	return c.client
}

// Database returns a database handle
func (c *Client) Database(name string) *mongo.Database {
	return c.client.Database(name)
}

// Collection returns a collection handle
func (c *Client) Collection(dbName, collectionName string) *mongo.Collection {
	return c.client.Database(dbName).Collection(collectionName)
}

// IsConnected checks if the client is connected
func (c *Client) IsConnected(ctx context.Context) bool {
	if c.client == nil {
		return false
	}
	return c.client.Ping(ctx, nil) == nil
}

// ConnectionInfo holds connection information
type ConnectionInfo struct {
	ConnectionString string
	// Password and other sensitive info are not included for security reasons
}

// GetConnectionInfo returns connection information (without sensitive data)
func (c *Client) GetConnectionInfo() ConnectionInfo {
	return ConnectionInfo{
		ConnectionString: "[REDACTED]", // Don't expose the full connection string for security
	}
}
