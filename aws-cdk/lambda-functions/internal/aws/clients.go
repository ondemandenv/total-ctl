package aws

import (
	"github.com/aws/aws-sdk-go/aws"
	"github.com/aws/aws-sdk-go/aws/session"
	"github.com/aws/aws-sdk-go/service/cloudwatch"
	"github.com/aws/aws-sdk-go/service/docdb"
)

// Clients holds AWS service clients
type Clients struct {
	CloudWatch *cloudwatch.CloudWatch
	DocDB      *docdb.DocDB
	Session    *session.Session
}

// NewClients creates new AWS service clients
func NewClients() (*Clients, error) {
	// By creating a session without a specific config, the SDK will automatically
	// use the region and credentials from the Lambda execution environment.
	sess, err := session.NewSession()
	if err != nil {
		return nil, err
	}

	return &Clients{
		CloudWatch: cloudwatch.New(sess),
		DocDB:      docdb.New(sess),
		Session:    sess,
	}, nil
}

// NewClientsWithRegion creates new AWS service clients with a specific region
func NewClientsWithRegion(region string) (*Clients, error) {
	sess, err := session.NewSession(&aws.Config{
		Region: aws.String(region),
	})
	if err != nil {
		return nil, err
	}

	return &Clients{
		CloudWatch: cloudwatch.New(sess),
		DocDB:      docdb.New(sess),
		Session:    sess,
	}, nil
}
