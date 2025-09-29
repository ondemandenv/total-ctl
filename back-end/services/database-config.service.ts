/**
 * Database configuration service for selecting between in-memory and DocumentDB storage
 * Provides centralized control over database backend selection with safety warnings
 */

export interface DatabaseConfig {
    type: 'in-memory' | 'documentdb';
    connectionString?: string;
    forceInMemory?: boolean;
    environment: string;
}

export class DatabaseConfigService {
    private static instance: DatabaseConfigService;
    private config: DatabaseConfig;

    constructor() {
        this.config = this.determineConfig();
        this.validateAndWarn();
    }

    public static getInstance(): DatabaseConfigService {
        if (!DatabaseConfigService.instance) {
            DatabaseConfigService.instance = new DatabaseConfigService();
        }
        return DatabaseConfigService.instance;
    }

    /**
     * Get the current database configuration
     */
    public getConfig(): DatabaseConfig {
        return { ...this.config };
    }

    /**
     * Check if using in-memory storage
     */
    public isUsingInMemory(): boolean {
        return this.config.type === 'in-memory';
    }

    /**
     * Check if using DocumentDB
     */
    public isUsingDocumentDB(): boolean {
        return this.config.type === 'documentdb';
    }

    /**
     * Get the database type as a string
     */
    public getDatabaseType(): string {
        return this.config.type;
    }

    /**
     * Get connection string if available
     */
    public getConnectionString(): string | undefined {
        return this.config.connectionString;
    }

    /**
     * Determine database configuration based on environment variables and settings
     */
    private determineConfig(): DatabaseConfig {
        const environment = process.env.NODE_ENV || 'development';
        const branchName = this.getCurrentBranch();
        
        // Check for explicit database type override
        const dbTypeOverride = process.env.DATABASE_TYPE?.toLowerCase();
        const forceInMemory = process.env.FORCE_IN_MEMORY_DB === 'true';
        const mongoConnectionString = process.env.MONGODB_CONNECTION_STRING;

        console.log('🔧 Database Configuration Analysis:');
        console.log(`   Environment: ${environment}`);
        console.log(`   Branch: ${branchName}`);
        console.log(`   DATABASE_TYPE override: ${dbTypeOverride || 'none'}`);
        console.log(`   FORCE_IN_MEMORY_DB: ${forceInMemory}`);
        console.log(`   MONGODB_CONNECTION_STRING: ${mongoConnectionString ? 'provided' : 'not provided'}`);

        // Priority order for configuration:
        // 1. FORCE_IN_MEMORY_DB=true (highest priority)
        // 2. DATABASE_TYPE environment variable
        // 3. MONGODB_CONNECTION_STRING presence
        // 4. Environment-based defaults

        if (forceInMemory) {
            return {
                type: 'in-memory',
                forceInMemory: true,
                environment: branchName || environment
            };
        }

        if (dbTypeOverride === 'in-memory' || dbTypeOverride === 'memory') {
            return {
                type: 'in-memory',
                environment: branchName || environment
            };
        }

        if (dbTypeOverride === 'documentdb' || dbTypeOverride === 'mongodb') {
            if (!mongoConnectionString) {
                console.warn('⚠️  DATABASE_TYPE set to documentdb but no MONGODB_CONNECTION_STRING provided');
                console.warn('⚠️  Falling back to in-memory storage');
                return {
                    type: 'in-memory',
                    environment: branchName || environment
                };
            }
            return {
                type: 'documentdb',
                connectionString: mongoConnectionString,
                environment: branchName || environment
            };
        }

        // Auto-detection based on connection string and environment
        if (mongoConnectionString) {
            const isProductionLike = this.isProductionEnvironment(branchName || environment);
            
            if (isProductionLike) {
                return {
                    type: 'documentdb',
                    connectionString: mongoConnectionString,
                    environment: branchName || environment
                };
            } else {
                console.log('💡 Production database available but using in-memory for testing environment');
                return {
                    type: 'in-memory',
                    environment: branchName || environment
                };
            }
        }

        // Default to in-memory if no connection string
        return {
            type: 'in-memory',
            environment: branchName || environment
        };
    }

    /**
     * Check if the environment is production-like
     */
    private isProductionEnvironment(environment: string): boolean {
        const prodPatterns = ['prod', 'production', 'main', 'master', 'customer-facing'];
        return prodPatterns.some(pattern => 
            environment.toLowerCase().includes(pattern.toLowerCase())
        );
    }

    /**
     * Get current git branch name
     */
    private getCurrentBranch(): string {
        try {
            const { execSync } = require('child_process');
            return execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
        } catch (error) {
            return process.env.GITHUB_REF_NAME || 'unknown';
        }
    }

    /**
     * Validate configuration and show warnings
     */
    private validateAndWarn(): void {
        console.log(`\n📊 Database Configuration Selected:`);
        console.log(`   Type: ${this.config.type.toUpperCase()}`);
        console.log(`   Environment: ${this.config.environment}`);
        
        if (this.config.forceInMemory) {
            console.log(`   Override: FORCE_IN_MEMORY_DB=true`);
        }

        if (this.isUsingInMemory()) {
            this.showInMemoryWarnings();
        } else {
            this.showDocumentDBInfo();
        }

        console.log(''); // Empty line for readability
    }

    /**
     * Show warnings about in-memory storage limitations
     */
    private showInMemoryWarnings(): void {
        console.log('\n⚠️  IN-MEMORY DATABASE WARNINGS:');
        console.log('   ┌─────────────────────────────────────────────────────────────┐');
        console.log('   │  🔄 STATELESS ECS TESTING LIMITATION                       │');
        console.log('   │                                                             │');
        console.log('   │  In-memory storage CANNOT test the stateless nature of     │');
        console.log('   │  ECS containers because:                                    │');
        console.log('   │                                                             │');
        console.log('   │  • Data persists only within a single container instance   │');
        console.log('   │  • Container restarts = complete data loss                 │');
        console.log('   │  • Auto-scaling events = data inconsistency                │');
        console.log('   │  • Load balancer routing = unpredictable data access       │');
        console.log('   │                                                             │');
        console.log('   │  💡 To test true stateless behavior:                        │');
        console.log('   │     Set DATABASE_TYPE=documentdb or deploy to production   │');
        console.log('   └─────────────────────────────────────────────────────────────┘');
        
        console.log('\n📋 In-Memory Storage Characteristics:');
        console.log('   ✅ Fast development and testing');
        console.log('   ✅ Zero infrastructure costs');
        console.log('   ✅ Instant environment startup');
        console.log('   ✅ Isolated test data per container');
        console.log('   ❌ Data lost on container restart');
        console.log('   ❌ Cannot test multi-container scenarios');
        console.log('   ❌ Does not reflect production behavior');
        
        console.log('\n🔧 Configuration Options:');
        console.log('   DATABASE_TYPE=documentdb     - Force DocumentDB usage');
        console.log('   DATABASE_TYPE=in-memory      - Force in-memory usage');
        console.log('   FORCE_IN_MEMORY_DB=true      - Override all settings');
        console.log('   MONGODB_CONNECTION_STRING    - Provide DocumentDB connection');
    }

    /**
     * Show DocumentDB information
     */
    private showDocumentDBInfo(): void {
        console.log('\n✅ DOCUMENTDB CONFIGURATION:');
        console.log('   ┌─────────────────────────────────────────────────────────────┐');
        console.log('   │  🏗️  PRODUCTION-READY STATELESS TESTING                    │');
        console.log('   │                                                             │');
        console.log('   │  DocumentDB enables testing of true stateless behavior:    │');
        console.log('   │                                                             │');
        console.log('   │  ✅ Data persists across container restarts                │');
        console.log('   │  ✅ Auto-scaling events maintain data consistency          │');
        console.log('   │  ✅ Load balancer routing works with shared state          │');
        console.log('   │  ✅ Multiple container instances share data                │');
        console.log('   │  ✅ Realistic production environment simulation            │');
        console.log('   └─────────────────────────────────────────────────────────────┘');
        
        console.log('\n📊 DocumentDB Benefits:');
        console.log('   ✅ High availability and durability');
        console.log('   ✅ Automatic backups and point-in-time recovery');
        console.log('   ✅ Horizontal scaling capabilities');
        console.log('   ✅ Production-grade security');
        console.log('   ⚠️  Higher operational costs');
        console.log('   ⚠️  Slower startup times');
    }

    /**
     * Get a summary of the current configuration for API responses
     */
    public getConfigSummary(): {
        databaseType: string;
        environment: string;
        isStatelessCapable: boolean;
        warnings: string[];
        recommendations: string[];
    } {
        const isStatelessCapable = this.isUsingDocumentDB();
        const warnings: string[] = [];
        const recommendations: string[] = [];

        if (this.isUsingInMemory()) {
            warnings.push('In-memory storage cannot test stateless ECS container behavior');
            warnings.push('Data will be lost on container restart or scaling events');
            warnings.push('Multi-container deployments will have inconsistent data');
            
            recommendations.push('Use DATABASE_TYPE=documentdb for stateless testing');
            recommendations.push('Deploy to production-like environment for full validation');
            recommendations.push('Consider this for development/testing only');
        }

        return {
            databaseType: this.config.type,
            environment: this.config.environment,
            isStatelessCapable,
            warnings,
            recommendations
        };
    }
}