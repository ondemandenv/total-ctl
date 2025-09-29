import * as cdk from 'aws-cdk-lib';
import {Construct} from 'constructs';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53targets from 'aws-cdk-lib/aws-route53-targets';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import {InfrastructureStack} from './infrastructure-stack';
import {InfraBasicAuth} from './infra-basic-auth';
import {CustomDomainConfig, CustomDomainConfigLoader} from './utils/custom-domain-config';


export interface CustomDomainStackProps extends cdk.StackProps {
    infrastructure: InfrastructureStack;
    environment: string;
    customDomainConfig: CustomDomainConfig;
}

export class CustomDomainDistributionStack extends cdk.Stack {
    public readonly distribution: cloudfront.Distribution;
    public readonly certificate: acm.Certificate;
    public readonly customDomains: string[];
    public readonly cachePolicy: cloudfront.CachePolicy;

    constructor(scope: Construct, id: string, props: CustomDomainStackProps) {
        super(scope, id, props);

        // Get all domains as array
        this.customDomains = props.customDomainConfig.customDomains

        const cacheDurationMinutes = CustomDomainConfigLoader.getCacheDurationMinutes(props.customDomainConfig);

        this.cachePolicy = new cloudfront.CachePolicy(this, 'ShortCachePolicy', {
            cachePolicyName: `short-cache-${props.environment}-${cacheDurationMinutes}min`,
            defaultTtl: cdk.Duration.minutes(cacheDurationMinutes),
            maxTtl: cdk.Duration.minutes(cacheDurationMinutes),
            minTtl: cdk.Duration.seconds(0),
            queryStringBehavior: cloudfront.CacheQueryStringBehavior.none(),
            headerBehavior: cloudfront.CacheHeaderBehavior.allowList('CloudFront-Viewer-Country'),
            cookieBehavior: cloudfront.CacheCookieBehavior.none(),
            enableAcceptEncodingGzip: true,
            enableAcceptEncodingBrotli: true
        });

        // Import the hosted zone for the custom domain
        const customHostedZone = route53.HostedZone.fromHostedZoneAttributes(
            this,
            'CustomHostedZone',
            {
                hostedZoneId: props.customDomainConfig.hostedZoneId,
                zoneName: props.customDomainConfig.hostedZoneName,
            }
        );

        // Create certificate for all custom domains in us-east-1
        const certificateStack = new cdk.Stack(this, "CustomCertificateStack", {
            env: {
                account: this.account,
                region: "us-east-1",
            },
            crossRegionReferences: true
        });

        this.certificate = new acm.Certificate(certificateStack, "CustomCertificate", {
            domainName: this.customDomains[0], // Primary domain
            subjectAlternativeNames: this.customDomains.length > 1 ? this.customDomains.slice(1) : undefined,
            validation: acm.CertificateValidation.fromDns(customHostedZone),
        });

        // Set up basic auth if enabled
        let functionAssociations: cloudfront.FunctionAssociation[] | undefined;
        if (props.customDomainConfig.config.basicAuth && !props.environment.toLowerCase().startsWith('prod')) {
            functionAssociations = [{
                function: new InfraBasicAuth(this, 'CustomBasicAuth' + this.region).authFunction,
                eventType: cloudfront.FunctionEventType.VIEWER_REQUEST
            }];
        }

        // Create CloudFront distribution for custom domains - ONLY serving static assets
        this.distribution = new cloudfront.Distribution(this, "CustomDistribution", {
            defaultBehavior: {
                origin: new origins.S3Origin(props.infrastructure.cfPubBucket),
                allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
                viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                cachePolicy: this.cachePolicy,
                responseHeadersPolicy: this.createCustomResponseHeadersPolicy(props.customDomainConfig.config.corsOrigins),
                functionAssociations: functionAssociations
            },
            defaultRootObject: 'index.html',
            domainNames: this.customDomains, // All domains
            certificate: this.certificate,
            comment: `Custom domain distribution for ${this.customDomains.join(', ')} (${props.environment}) - Static assets with ${cacheDurationMinutes}min cache`,
        });

        // Create Route53 alias records for each custom domain
        this.customDomains.forEach((domain, index) => {
            new route53.ARecord(this, `CustomDomainAliasRecord${index}`, {
                zone: customHostedZone,
                recordName: this.getRecordName(domain, props.customDomainConfig.hostedZoneName),
                target: route53.RecordTarget.fromAlias(
                    new route53targets.CloudFrontTarget(this.distribution)
                )
            });
        });

        // Output the custom domain URLs
        new cdk.CfnOutput(this, 'CustomDomainUrls', {
            value: this.customDomains.map(domain => `https://${domain}`).join(', '),
            description: `Custom domain URLs for ${props.environment} environment (${cacheDurationMinutes}min cache)`,
            exportName: `${props.environment}-custom-domain-urls`
        });

        // Output distribution ID for cache invalidation
        new cdk.CfnOutput(this, 'CustomDistributionId', {
            value: this.distribution.distributionId,
            description: `Custom domain CloudFront distribution ID`,
            exportName: `${props.environment}-custom-distribution-id`
        });
    }

    private createCustomResponseHeadersPolicy(corsOrigins?: string[]): cloudfront.ResponseHeadersPolicy {
        const origins = corsOrigins || ['*'];

        return new cloudfront.ResponseHeadersPolicy(this, 'CustomResponseHeadersPolicy', {
            comment: 'Custom CORS policy for custom domain',
            corsBehavior: {
                accessControlAllowCredentials: false,
                accessControlAllowHeaders: ['*'],
                accessControlAllowMethods: ['GET', 'HEAD', 'OPTIONS'],
                accessControlAllowOrigins: origins,
                accessControlExposeHeaders: ['*'],
                accessControlMaxAge: cdk.Duration.seconds(600),
                originOverride: true,
            },
            securityHeadersBehavior: {
                contentTypeOptions: {override: true},
                frameOptions: {frameOption: cloudfront.HeadersFrameOption.DENY, override: true},
                referrerPolicy: {
                    referrerPolicy: cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
                    override: true
                },
                strictTransportSecurity: {
                    accessControlMaxAge: cdk.Duration.seconds(31536000),
                    includeSubdomains: true,
                    override: true
                },
            },
        });
    }

    private getRecordName(customDomain: string, rootDomain: string): string {
        // If custom domain is the root domain itself, use empty string
        if (customDomain === rootDomain) {
            return '';
        }
        // Otherwise, extract the subdomain part
        return customDomain.replace(`.${rootDomain}`, '');
    }
} 