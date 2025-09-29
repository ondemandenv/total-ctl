# `CustomDomainStack`

The `CustomDomainStack` is an optional stack that enables white-labeling of the application by serving the frontend from a custom domain. This stack is only instantiated if a valid configuration for the current environment is found in the hardcoded mappings.

## Key Resources

- **Cache Policy (`cloudfront.CachePolicy`)**:
  - A custom CloudFront cache policy is created. The cache duration (`defaultTtl` and `maxTtl`) is dynamically set based on the `cacheDurationMinutes` value in the configuration.

- **ACM Certificate (`acm.Certificate`)**:
  - A new SSL/TLS certificate is created in `us-east-1` for the custom domain(s). It supports multiple domains (Subject Alternative Names).
  - The certificate is validated using DNS validation against the `hostedZoneId` specified in the configuration.

- **CloudFront Distribution (`cloudfront.Distribution`)**:
  - A new, separate CloudFront distribution is created specifically for the custom domain(s).
  - It serves static assets from the same public S3 bucket (`cfPubBucket`) as the main distribution.
  - It uses the custom cache policy and the new ACM certificate.
  - Basic authentication can be enabled for non-production environments based on the `basicAuth` flag in the configuration.
  - A custom `ResponseHeadersPolicy` is created to handle CORS and security headers based on the `corsOrigins` in the configuration.

- **Route 53 A-Records (`route53.ARecord`)**:
  - For each custom domain specified in the `customDomains` array, a Route 53 A-record is created in the specified hosted zone.
  - These records are aliases that point to the new custom CloudFront distribution.

## How it's Triggered

The creation of this stack is conditional. In `bin/cdk.ts`, the `CustomDomainConfigLoader` is used to check if a configuration for the current environment exists in the hardcoded `CUSTOM_DOMAIN_MAPPINGS` in `lib/utils/custom-domain-config.ts`. If it does, this stack is created.

## Outputs

- **`CustomDomainUrls` (`CfnOutput`)**: A comma-separated list of the custom domain URLs (e.g., `https://app.customproddomain.com, https://another.customdomain.com`).
- **`CustomDistributionId` (`CfnOutput`)**: The ID of the custom CloudFront distribution, which is useful for manual cache invalidation. 