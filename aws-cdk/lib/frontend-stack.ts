import * as cdk from 'aws-cdk-lib';
import {Construct} from 'constructs';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import {InfrastructureStack} from './infrastructure-stack';
import {CfnOutput, Size} from "aws-cdk-lib";
import * as fs from "node:fs";

export interface FrontendStackProps extends cdk.StackProps {
    infrastructure: InfrastructureStack;
    environment: string;
    baseDomainName: string;
}

export class FrontendStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: FrontendStackProps) {
        super(scope, id, props);

        // Get infrastructure resources directly
        const s3Bucket = props.infrastructure.cfPubBucket;
        const cloudfrontDistribution = props.infrastructure.cfDistr;

        fs.mkdirSync('../front-end/build', { recursive: true });
        fs.writeFileSync( '../front-end/build/_dummy_placeholder.txt', '__dummy_chg')

        new s3deploy.BucketDeployment(this, 'vite-build-deploy', {
            sources: [s3deploy.Source.asset('../front-end/build')],
            destinationBucket: s3Bucket,
            // distribution: cloudfrontDistribution,
            // distributionPaths: ['/*'],
            memoryLimit: 2048,
            ephemeralStorageSize: Size.gibibytes(2),
        });

        new CfnOutput(this, 'public_domain_URL', {
            value: '\nhttps://' + props.environment + '.' + props.baseDomainName,
        })
        new CfnOutput(this, 'total_ctl_frontend_distributionId', {
            exportName: 'totalCtlFrontendDistributionId',
            value: cloudfrontDistribution.distributionId,
        })
    }
} 