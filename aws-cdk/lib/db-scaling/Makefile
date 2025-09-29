.PHONY: build clean deploy test

# Build the Lambda function
build:
	GOOS=linux GOARCH=amd64 go build -o bootstrap main.go
	zip lambda-function.zip bootstrap

# Clean build artifacts
clean:
	rm -f bootstrap lambda-function.zip

# Download dependencies
deps:
	go mod download
	go mod tidy

# Run tests
test:
	go test -v ./...

# Format code
fmt:
	go fmt ./...

# Lint code
lint:
	golangci-lint run

# Build for local testing
build-local:
	go build -o docdb-auto-scaling main.go

# Help
help:
	@echo "Available targets:"
	@echo "  build       - Build Lambda function for deployment"
	@echo "  clean       - Clean build artifacts"
	@echo "  deps        - Download and tidy dependencies"
	@echo "  test        - Run tests"
	@echo "  fmt         - Format code"
	@echo "  lint        - Lint code"
	@echo "  build-local - Build for local testing"
	@echo "  help        - Show this help" 