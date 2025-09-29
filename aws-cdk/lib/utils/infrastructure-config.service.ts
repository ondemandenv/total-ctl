/**
 * Infrastructure configuration service for CDK deployments
 * Determines when to deploy DocumentDB based on environment and configuration
 */

export interface InfrastructureConfig {
    shouldDeployDocumentDB: boolean;
    databaseType: 'documentdb' | 'in-memory';
    environment: string;
    reason: string;
}

export class InfrastructureConfigService {
    private config: InfrastructureConfig;

    constructor(environment: string) {
        this.config = this.determineInfrastructureConfig(environment);
        this.logConfigurationDecision();
    }

    /**
     * Get the infrastructure configuration
     */
    public getConfig(): InfrastructureConfig {
        return { ...this.config };
    }

    /**
     * Check if DocumentDB should be deployed
     */
    public shouldDeployDocumentDB(): boolean {
        return this.config.shouldDeployDocumentDB;
    }

    /**
     * Get the database type for this environment
     */
    public getDatabaseType(): string {
        return this.config.databaseType;
    }

    /**
     * Determine infrastructure configuration based on environment and overrides
     */
    private determineInfrastructureConfig(environment: string): InfrastructureConfig {
        console.log(`🏗️  Infrastructure Configuration Analysis for: ${environment}`);
        
        // Check for explicit infrastructure overrides
        const forceDocumentDB = process.env.CDK_FORCE_DOCUMENTDB === 'true';
        const forceInMemory = process.env.CDK_FORCE_IN_MEMORY === 'true';
        const infraType = process.env.CDK_DATABASE_TYPE?.toLowerCase();
        
        console.log(`   CDK_FORCE_DOCUMENTDB: ${forceDocumentDB}`);
        console.log(`   CDK_FORCE_IN_MEMORY: ${forceInMemory}`);
        console.log(`   CDK_DATABASE_TYPE: ${infraType || 'not set'}`);

        // Priority 1: Force overrides
        if (forceDocumentDB) {
            return {
                shouldDeployDocumentDB: true,
                databaseType: 'documentdb',
                environment,
                reason: 'CDK_FORCE_DOCUMENTDB=true override'
            };
        }

        if (forceInMemory) {
            return {
                shouldDeployDocumentDB: false,
                databaseType: 'in-memory',
                environment,
                reason: 'CDK_FORCE_IN_MEMORY=true override'
            };
        }

        // Priority 2: Explicit database type
        if (infraType === 'documentdb') {
            return {
                shouldDeployDocumentDB: true,
                databaseType: 'documentdb',
                environment,
                reason: 'CDK_DATABASE_TYPE=documentdb'
            };
        }

        if (infraType === 'in-memory' || infraType === 'memory') {
            return {
                shouldDeployDocumentDB: false,
                databaseType: 'in-memory',
                environment,
                reason: 'CDK_DATABASE_TYPE=in-memory'
            };
        }

        // Priority 3: Environment-based auto-detection
        const isProductionLike = this.isProductionEnvironment(environment);
        
        if (isProductionLike) {
            return {
                shouldDeployDocumentDB: true,
                databaseType: 'documentdb',
                environment,
                reason: `Production environment detected: ${environment}`
            };
        } else {
            return {
                shouldDeployDocumentDB: false,
                databaseType: 'in-memory',
                environment,
                reason: `Development/testing environment detected: ${environment}`
            };
        }
    }

    /**
     * Check if the environment is production-like
     */
    private isProductionEnvironment(environment: string): boolean {
        const prodPatterns = [
            'prod', 'production', 'main', 'master', 
            'customer-facing', 'release', 'stable'
        ];
        
        return prodPatterns.some(pattern => 
            environment.toLowerCase().includes(pattern.toLowerCase())
        );
    }

    /**
     * Log the configuration decision
     */
    private logConfigurationDecision(): void {
        console.log(`\n📊 Infrastructure Configuration Decision:`);
        console.log(`   Environment: ${this.config.environment}`);
        console.log(`   Database Type: ${this.config.databaseType.toUpperCase()}`);
        console.log(`   Deploy DocumentDB: ${this.config.shouldDeployDocumentDB ? 'YES' : 'NO'}`);
        console.log(`   Reason: ${this.config.reason}`);

        if (this.config.shouldDeployDocumentDB) {
            this.logDocumentDBDeployment();
        } else {
            this.logInMemoryDeployment();
        }

        console.log(`\n🔧 Infrastructure Override Options:`);
        console.log(`   CDK_FORCE_DOCUMENTDB=true     - Force DocumentDB deployment`);
        console.log(`   CDK_FORCE_IN_MEMORY=true      - Force in-memory (skip DocumentDB)`);
        console.log(`   CDK_DATABASE_TYPE=documentdb  - Explicit DocumentDB deployment`);
        console.log(`   CDK_DATABASE_TYPE=in-memory   - Explicit in-memory deployment`);
        console.log('');
    }

    /**
     * Log DocumentDB deployment information
     */
    private logDocumentDBDeployment(): void {
        console.log(`\n✅ DOCUMENTDB INFRASTRUCTURE DEPLOYMENT:`);
        console.log(`   ┌─────────────────────────────────────────────────────────────┐`);
        console.log(`   │  🏗️  DEPLOYING PRODUCTION-GRADE DATABASE                   │`);
        console.log(`   │                                                             │`);
        console.log(`   │  Components being deployed:                                 │`);
        console.log(`   │  ✅ DocumentDB cluster with backup and monitoring          │`);
        console.log(`   │  ✅ Security groups and VPC configuration                  │`);
        console.log(`   │  ✅ CloudWatch dashboards and alarms                       │`);
        console.log(`   │  ✅ Parameter Store configuration                           │`);
        console.log(`   │  ✅ IAM roles and policies                                 │`);
        console.log(`   │                                                             │`);
        console.log(`   │  💰 Cost Impact: ~$300-400/month                           │`);
        console.log(`   │  🕒 Deployment Time: ~15-20 minutes                        │`);
        console.log(`   │  🔄 Stateless Testing: ENABLED                             │`);
        console.log(`   └─────────────────────────────────────────────────────────────┘`);
    }

    /**
     * Log in-memory deployment information
     */
    private logInMemoryDeployment(): void {
        console.log(`\n🧠 IN-MEMORY INFRASTRUCTURE DEPLOYMENT:`);
        console.log(`   ┌─────────────────────────────────────────────────────────────┐`);
        console.log(`   │  💡 COST-OPTIMIZED TESTING INFRASTRUCTURE                  │`);
        console.log(`   │                                                             │`);
        console.log(`   │  Components being deployed:                                 │`);
        console.log(`   │  ✅ ECS cluster and application services                   │`);
        console.log(`   │  ✅ S3 buckets and CloudFront distribution                 │`);
        console.log(`   │  ✅ Load balancers and networking                          │`);
        console.log(`   │  ✅ Parameter Store configuration                           │`);
        console.log(`   │  ❌ DocumentDB cluster (SKIPPED)                           │`);
        console.log(`   │  ❌ Database monitoring (SKIPPED)                          │`);
        console.log(`   │                                                             │`);
        console.log(`   │  💰 Cost Impact: ~$50-100/month                            │`);
        console.log(`   │  🕒 Deployment Time: ~5-8 minutes                          │`);
        console.log(`   │  🔄 Stateless Testing: LIMITED                             │`);
        console.log(`   └─────────────────────────────────────────────────────────────┘`);
        
        console.log(`\n⚠️  IN-MEMORY INFRASTRUCTURE LIMITATIONS:`);
        console.log(`   • Applications will use in-memory storage at runtime`);
        console.log(`   • Cannot test stateless ECS container behavior`);
        console.log(`   • Data lost on container restart or scaling events`);
        console.log(`   • Not suitable for production-like testing`);
        console.log(`   • Use CDK_FORCE_DOCUMENTDB=true for stateless testing`);
    }

    /**
     * Get cost estimate for the current configuration
     */
    public getCostEstimate(): { monthly: number; components: string[] } {
        if (this.config.shouldDeployDocumentDB) {
            return {
                monthly: 350, // DocumentDB + infrastructure
                components: [
                    'DocumentDB cluster (db.t4g.medium): ~$200/month',
                    'ECS + ALB + CloudFront: ~$100/month', 
                    'Data transfer and storage: ~$50/month'
                ]
            };
        } else {
            return {
                monthly: 75, // Infrastructure only
                components: [
                    'ECS + ALB + CloudFront: ~$50/month',
                    'S3 storage and transfer: ~$25/month'
                ]
            };
        }
    }

    /**
     * Get deployment time estimate
     */
    public getDeploymentTimeEstimate(): { minutes: number; phases: string[] } {
        if (this.config.shouldDeployDocumentDB) {
            return {
                minutes: 18,
                phases: [
                    'VPC and networking: 3-5 minutes',
                    'DocumentDB cluster creation: 10-12 minutes',
                    'Application services: 3-5 minutes'
                ]
            };
        } else {
            return {
                minutes: 7,
                phases: [
                    'VPC and networking: 2-3 minutes',
                    'S3 and CloudFront: 2-3 minutes',
                    'Application services: 2-3 minutes'
                ]
            };
        }
    }
}