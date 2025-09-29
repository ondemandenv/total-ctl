import * as cdk from 'aws-cdk-lib';
import {Construct} from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as logs from 'aws-cdk-lib/aws-logs';
import {InfrastructureStack} from './infrastructure-stack';

export interface EC2StackProps extends cdk.StackProps {
    infrastructure: InfrastructureStack;
    environment: string;
}

export class EC2Stack extends cdk.Stack {
    public readonly instance: ec2.Instance;
    public readonly securityGroup: ec2.SecurityGroup;

    constructor(scope: Construct, id: string, props: EC2StackProps) {
        super(scope, id, props);

        /* No need when connect thru ssm!

                this.keyPair = new ec2.KeyPair(this, 'EC2KeyPair1', {
                    keyPairName: `example-app-ec2-${props.environment}`,
                    publicKeyMaterial: 'ssh-rsa YOUR_PUBLIC_KEY_HERE', // Replace with your actual public key
                });
        */

        // Create Security Group for EC2 instance
        this.securityGroup = new ec2.SecurityGroup(this, 'EC2SecurityGroup', {
            vpc: props.infrastructure.vpc,
            description: `Security group for EC2 instance in ${props.environment} environment`,
            allowAllOutbound: true,
        });

        // No inbound SSH; access via SSM Session Manager (tunneling)


        // Create IAM role for EC2 instance, add permissions when needed
        const ec2Role = new iam.Role(this, 'EC2InstanceRole', {
            assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
            description: `IAM role for EC2 instance in ${props.environment} environment`,
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
                iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchAgentServerPolicy'),
                props.infrastructure.appRuntimePolicy
            ],
        });


        // Get latest Ubuntu AMI
        const ubuntu = ec2.MachineImage.fromSsmParameter(
            '/aws/service/canonical/ubuntu/server/22.04/stable/current/amd64/hvm/ebs-gp2/ami-id',
            {
                os: ec2.OperatingSystemType.LINUX,
            }
        );

        // Create EC2 instance in private subnets
        this.instance = new ec2.Instance(this, 'EC2Instance3', {
            vpc: props.infrastructure.vpc,
            vpcSubnets: {
                subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
            },
            instanceType: ec2.InstanceType.of(ec2.InstanceClass.BURSTABLE3, ec2.InstanceSize.MICRO),
            machineImage: ubuntu,
            securityGroup: this.securityGroup,
            role: ec2Role,
            userData: ec2.UserData.forLinux(),
        });

        // Add user data script to update system and install basic tools
        this.instance.userData.addCommands(
            'apt-get update -y',
            'apt-get upgrade -y',
            'apt-get install -y htop curl wget git unzip',
            'snap install aws-cli --classic',
            // Install CloudWatch agent
            'wget https://s3.amazonaws.com/amazoncloudwatch-agent/ubuntu/amd64/latest/amazon-cloudwatch-agent.deb',
            'dpkg -i amazon-cloudwatch-agent.deb',
            'apt-get install -f -y',
            // Ensure SSM agent is running (it should be by default on Ubuntu 20.04)
            'systemctl enable amazon-ssm-agent',
            'systemctl start amazon-ssm-agent',
            'systemctl status amazon-ssm-agent',
            // Configure CloudWatch Agent to ship syslog and application logs
            'mkdir -p /opt/aws/amazon-cloudwatch-agent/bin',
            'cat > /opt/aws/amazon-cloudwatch-agent/bin/config.json <<\'CWCFG\'',
            '{',
            '  "agent": {',
            '    "metrics_collection_interval": 60,',
            '    "logfile": "/opt/aws/amazon-cloudwatch-agent/logs/agent.log"',
            '  },',
            '  "logs": {',
            '    "logs_collected": {',
            '      "files": {',
            '        "collect_list": [',
            `          { "file_path": "/var/log/syslog", "log_group_name": "/ec2/${props.environment}/syslog", "log_stream_name": "{instance_id}" },`,
            `          { "file_path": "/var/log/app-debug.log", "log_group_name": "/ec2/${props.environment}/app", "log_stream_name": "{instance_id}" }`,
            '        ]',
            '      }',
            '    }',
            '  }',
            '}',
            'CWCFG',
            '/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -a stop || true',
            '/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -a fetch-config -m ec2 -c file:/opt/aws/amazon-cloudwatch-agent/bin/config.json -s'
        );

        // Output the instance ID
        new cdk.CfnOutput(this, 'InstanceId', {
            value: this.instance.instanceId,
            description: 'EC2 Instance ID',
        });

        // Output the private IP address
        new cdk.CfnOutput(this, 'PrivateIPAddress', {
            value: this.instance.instancePrivateIp,
            description: 'EC2 Instance Private IP Address',
        });

        // Pre-create CloudWatch log groups for agent with retention
        const ec2SyslogGroup = new logs.LogGroup(this, 'Ec2SyslogLogGroup', {
            logGroupName: `/ec2/${props.environment}/syslog`,
            retention: logs.RetentionDays.ONE_WEEK,
            removalPolicy: cdk.RemovalPolicy.DESTROY
        });

        const ec2AppLogGroup = new logs.LogGroup(this, 'Ec2AppLogGroup', {
            logGroupName: `/ec2/${props.environment}/app`,
            retention: logs.RetentionDays.ONE_WEEK,
            removalPolicy: cdk.RemovalPolicy.DESTROY
        });

        // Output SSM connection command
        new cdk.CfnOutput(this, 'SSMConnectCommand', {
            value: `aws ssm start-session --target ${this.instance.instanceId} --profile YOUR_AWS_PROFILE`,
            description: 'Command to connect via SSM Session Manager',
        });

        // Example: SSM port forwarding (tunneling) via Session Manager
        new cdk.CfnOutput(this, 'SSMPortForwardExample', {
            value: `aws ssm start-session --target ${this.instance.instanceId} --document-name AWS-StartPortForwardingSession --parameters 'portNumber=["5432"],localPortNumber=["5432"]'`,
            description: 'Example command to forward local 5432 to remote 5432',
        });

        // Add tags
        cdk.Tags.of(this.instance).add('Name', `total-ctl-ec2-${props.environment}`);
        cdk.Tags.of(this.instance).add('Environment', props.environment);
        cdk.Tags.of(this.instance).add('Purpose', 'Development/Testing');
    }
}