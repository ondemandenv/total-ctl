#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import {InfrastructureStack} from '../lib/infrastructure-stack';
import {BackendStack} from '../lib/backend-stack';
import {FrontendStack} from '../lib/frontend-stack';
import {CustomDomainDistributionStack} from '../lib/custom-domain-distribution-stack';
import {EC2Stack} from '../lib/ec2-stack';
import {CustomDomainConfigLoader} from '../lib/utils/custom-domain-config';
import {execSync} from "child_process";

const app = new cdk.App();

const region = process.env.CDK_DEFAULT_REGION!;
const account = process.env.CDK_DEFAULT_ACCOUNT!;
const environment = execSync('git rev-parse --abbrev-ref HEAD').toString().trim();

console.log(`Deploying to environment: ${environment}`);
console.log(`AWS Region: ${region}`);
console.log(`AWS Account: ${account}`);

const baseDomainName = 'kk.odmd.uk';

const infrastructureStack = new InfrastructureStack(app, `total-ctl-infra-${environment}`, {
    environment,
    baseDomainName,
    env: { account, region },
    crossRegionReferences: true,
    description: `Infrastructure stack for ${environment} environment in ${region} (${account})`,
});

const backendStack = new BackendStack(app, `total-ctl-backend-${environment}`, {
    infrastructure: infrastructureStack,
    environment,
    env: { account, region },
    description: `Backend stack for ${environment} environment in ${region} (${account})`,
});

// Add dependencies
backendStack.addDependency(infrastructureStack);

const frontendStack = new FrontendStack(app, `total-ctl-frontend-${environment}`, {
    infrastructure: infrastructureStack,
    environment,
    baseDomainName,
    env: { account, region },
    description: `Frontend stack for ${environment} environment in ${region} (${account})`,
});
frontendStack.addDependency(infrastructureStack);

const ec2Stack = new EC2Stack(app, `total-ctl-ec2-${environment}-2`, {
    infrastructure: infrastructureStack,
    environment,
    env: { account, region },
    description: `EC2 stack for ${environment} environment in ${region} (${account})`,
});

// Add dependencies
ec2Stack.addDependency(infrastructureStack);

// Check if this environment has a custom domain configured
const customDomainConfig = CustomDomainConfigLoader.getCustomDomainForEnvironment(environment);
if (customDomainConfig) {
    console.log(`Custom domain found for environment ${environment}: ${customDomainConfig.customDomains}`);

    
    // const customDomainStack = new CustomDomainStack(app, `example-app-extra-${customDomainConfig.customDomain.replace(/[^A-Za-z0-9-]/g, '')}-${environment}`, {
    const customDomainStack = new CustomDomainDistributionStack(app, `total-ctl-extra-domain-${environment}`, {
        infrastructure: infrastructureStack,
        environment,
        customDomainConfig,
        env: { account, region },
        crossRegionReferences: region != 'us-east-1',
        description: `Custom domain stack for ${environment} environment (${customDomainConfig.customDomains}) - Static assets only`,
    });

    // Add dependencies
    customDomainStack.addDependency(infrastructureStack);
} else {
    console.log(`No custom domain configured for environment ${environment}`);
}

const gitSha = execSync('git rev-parse HEAD', {encoding: 'utf-8'}).trim() + '/' + execSync('git rev-parse --abbrev-ref HEAD', {encoding: 'utf-8'}).trim();

app.node.findAll().forEach(c => {
    if (c instanceof cdk.CfnElement) {
        const logicalId = c.stack.getLogicalId(c);
        cdk.Tags.of(c).add("logicalId", logicalId);
        cdk.Tags.of(c).add("stackId", c.stack.stackId);
    } else if (c instanceof cdk.Stack) {
        c.templateOptions.metadata = {gitSha};
    }
});
