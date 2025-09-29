export interface CustomDomainConfig {
    customDomains: string[];
    hostedZoneId: string;
    hostedZoneName: string;
    config: CustomDomainFeatures
}

export interface CustomDomainFeatures {
    basicAuth?: boolean;
    corsOrigins?: string[];
    cacheDurationMinutes?: number;
}

export const CUSTOM_DOMAIN_MAPPINGS: Record<string, CustomDomainConfig> = {
    "some-special-event": {
        customDomains: ["www.some-special-event.com"],
        hostedZoneId: "YOUR_HOSTED_ZONE_ID",
        hostedZoneName: "some-special-event.com",
        config: {
            basicAuth: false,
            corsOrigins: ["*"],
            cacheDurationMinutes: 5
        }
    }
};

export class CustomDomainConfigLoader {
    static getCustomDomainForEnvironment(environment: string): CustomDomainConfig | null {
        return CUSTOM_DOMAIN_MAPPINGS[environment] || null;
    }

    static hasCustomDomain(environment: string): boolean {
        return this.getCustomDomainForEnvironment(environment) !== null;
    }

    static getAllMappings(): Record<string, CustomDomainConfig> {
        return CUSTOM_DOMAIN_MAPPINGS;
    }

    static getCacheDurationMinutes(config: CustomDomainConfig): number {
        return config.config.cacheDurationMinutes || 2;
    }
} 