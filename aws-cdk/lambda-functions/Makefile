# DEPRECATED: These build targets are no longer needed.
# Lambda functions are now built automatically by CDK during deployment.

.PHONY: all build-load-generator build-metrics-checker clean help

# Default target shows deprecation notice
all: help

help:
	@echo "DEPRECATED: This Makefile is no longer needed."
	@echo ""
	@echo "Lambda functions are now built automatically using CDK bundling during deployment."
	@echo "CDK will compile the Go binaries directly from source during the CDK deployment process."
	@echo ""
	@echo "To test functions locally:"
	@echo "  cd cmd/load-generator && go run main.go"
	@echo "  cd cmd/metrics-checker && go run main.go"
	@echo ""
	@echo "To deploy:"
	@echo "  cd .. && npm run deploy"

# Legacy targets (deprecated)
build-load-generator:
	@echo "DEPRECATED: Use CDK bundling instead. Run 'make help' for more info."

build-metrics-checker:
	@echo "DEPRECATED: Use CDK bundling instead. Run 'make help' for more info."

clean:
	@echo "Nothing to clean - CDK handles builds automatically." 