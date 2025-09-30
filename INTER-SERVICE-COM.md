# Inter-Service Communication: AWS Managed Services & VPC PrivateLink

## **Context: Single Service in a Microservice Ecosystem**

> **This repository demonstrates infrastructure for a single service as part of a larger microservice architecture.**

For startup to mid-size companies, **VPC PrivateLink, VPC Endpoints, and AWS Managed Services** provide the optimal balance of security, performance, and complexity.

## **The Private Subnet Runtime Pattern**

For enterprise environments, application runtime code should **never** run in public subnets:

```
┌─────────────────────────────────────────────────────────────────┐
│                        VPC Architecture                         │
│  ┌─────────────────┐                  ┌─────────────────────┐   │
│  │  Public Subnet  │                  │   Private Subnet    │   │
│  │ ┌─────────────┐ │                  │ ┌─────────────────┐ │   │
│  │ │     ALB     │ │◄─────────────────┤ │  ECS/Lambda     │ │   │
│  │ └─────────────┘ │                  │ │  (Runtime Code) │ │   │
│  │ ┌─────────────┐ │                  │ ┌─────────────────┐ │   │
│  │ │ NAT Gateway │ │◄─────────────────┤ │    Database     │ │   │
│  │ └─────────────┘ │                  │ └─────────────────┘ │   │
│  └─────────────────┘                  └─────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

**Key Principles:**
- **Load Balancers** in public subnets (internet-facing)
- **Runtime code** in private subnets (no direct internet access)
- **Databases** in private subnets (maximum isolation)
- **NAT Gateways** for outbound internet access from private subnets

## **Communication Patterns**

### **1. VPC PrivateLink (Direct Service-to-Service)**

**Best for**: Synchronous API calls between services.

```typescript
// Service Provider
const vpceService = new ec2.VpcEndpointService(this, 'PaymentEndpointService', {
  vpcEndpointServiceLoadBalancers: [nlb],
  acceptanceRequired: false
});

// Service Consumer
const paymentEndpoint = new ec2.VpcEndpoint(this, 'PaymentEndpoint', {
  vpc: this.vpc,
  service: ec2.VpcEndpointService.fromVpcEndpointServiceAttributes(this, 'PaymentService', {
    vpcEndpointServiceName: paymentServiceName
  })
});
```

### **2. VPC Endpoints for AWS Services**

**Best for**: Connecting to AWS managed services without internet traffic.

```typescript
// S3 VPC Endpoint (Gateway - Free)
new ec2.GatewayVpcEndpoint(this, 'S3Endpoint', {
  vpc: this.vpc,
  service: ec2.GatewayVpcEndpointAwsService.S3
});

// Other AWS Services (Interface - Paid)
new ec2.InterfaceVpcEndpoint(this, 'KinesisEndpoint', {
  vpc: this.vpc,
  service: ec2.InterfaceVpcEndpointAwsService.KINESIS_STREAMS,
  subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }
});
```

### **3. API Gateway Private Integration**

**Best for**: Exposing internal services through a managed API layer.

```typescript
// Internal service behind private ALB
const internalApi = new apigateway.RestApi(this, 'InternalAPI', {
  restApiName: 'Internal Microservices API',
  endpointConfiguration: {
    types: [apigateway.EndpointType.PRIVATE],
    vpcEndpoints: [vpcEndpoint]
  },
  policy: new iam.PolicyDocument({
    statements: [
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        principals: [new iam.AnyPrincipal()],
        actions: ['execute-api:Invoke'],
        resources: ['*'],
        conditions: {
          StringEquals: {
            'aws:sourceVpce': vpcEndpoint.vpcEndpointId
          }
        }
      })
    ]
  })
});

// VPC Link for private integration
const vpcLink = new apigateway.VpcLink(this, 'VpcLink', {
  targets: [nlb], // Network Load Balancer in front of service
  vpcLinkName: 'MicroservicesVpcLink'
});

// Private integration
const integration = new apigateway.Integration({
  type: apigateway.IntegrationType.HTTP_PROXY,
  integrationHttpMethod: 'ANY',
  uri: `http://${nlb.loadBalancerDnsName}`,
  options: {
    connectionType: apigateway.ConnectionType.VPC_LINK,
    vpcLink: vpcLink
  }
});
```

---

## **Event-Driven Architecture: AWS Managed Services**

### **Why Event-Driven with AWS Managed Services?**

Event-driven architecture provides the ultimate loose coupling for microservices. AWS managed services (Kinesis, EventBridge, SQS, SNS) handle the complexity of message delivery, ordering, and reliability while VPC Endpoints keep all traffic secure within your VPC.

```
┌─────────────────────────────────────────────────────────────────┐
│                    Event-Driven Microservices                   │
│                                                                 │
│  ┌─────────────┐    Events    ┌─────────────┐    Events        │
│  │  Service A  │──────────────►│   Kinesis   │◄──────────────┐  │
│  │  (Orders)   │               │   Streams   │               │  │
│  └─────────────┘               └─────────────┘               │  │
│         │                             │                     │  │
│         │                             ▼                     │  │
│         │                      ┌─────────────┐               │  │
│         │                      │ EventBridge │               │  │
│         │                      │    Rules    │               │  │
│         │                      └─────────────┘               │  │
│         │                             │                     │  │
│         ▼                             ▼                     │  │
│  ┌─────────────┐               ┌─────────────┐               │  │
│  │  Service B  │               │  Service C  │               │  │
│  │ (Inventory) │               │ (Analytics) │───────────────┘  │
│  └─────────────┘               └─────────────┘                  │
│                                                                 │
│  All communication through VPC Endpoints - Zero public traffic │
└─────────────────────────────────────────────────────────────────┘
```

### **1. Amazon Kinesis for High-Throughput Event Streaming**

**Best for**: Real-time data streaming, event sourcing, analytics pipelines.

```typescript
// Kinesis Data Stream with VPC Endpoint
const kinesisStream = new kinesis.Stream(this, 'EventStream', {
  streamName: `${props.serviceName}-events`,
  shardCount: 2, // Start small, auto-scale based on throughput
  retentionPeriod: cdk.Duration.days(7), // Adjust based on replay requirements
  encryption: kinesis.StreamEncryption.KMS // Encrypt at rest
});

// VPC Endpoint for Kinesis
const kinesisEndpoint = new ec2.InterfaceVpcEndpoint(this, 'KinesisEndpoint', {
  vpc: this.vpc,
  service: ec2.InterfaceVpcEndpointAwsService.KINESIS_STREAMS,
  subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
  privateDnsEnabled: true, // Enable private DNS resolution
  securityGroups: [this.kinesisEndpointSG]
});

// Security group for Kinesis endpoint
const kinesisEndpointSG = new ec2.SecurityGroup(this, 'KinesisEndpointSG', {
  vpc: this.vpc,
  description: 'Security group for Kinesis VPC Endpoint',
  allowAllOutbound: false
});

kinesisEndpointSG.addIngressRule(
  ec2.Peer.ipv4(this.vpc.vpcCidrBlock),
  ec2.Port.tcp(443),
  'Allow HTTPS from VPC'
);

// Event Producer Pattern
export class EventProducer {
  private kinesis: KinesisClient;
  private streamName: string;

  constructor(streamName: string) {
    this.streamName = streamName;
    this.kinesis = new KinesisClient({
      // Uses VPC Endpoint automatically when available
      region: process.env.AWS_REGION
    });
  }

  async publishEvent(eventType: string, data: any, partitionKey?: string): Promise<void> {
    const event = {
      eventId: uuidv4(),
      eventType,
      timestamp: new Date().toISOString(),
      source: process.env.SERVICE_NAME,
      version: '1.0',
      data
    };

    try {
      await this.kinesis.send(new PutRecordCommand({
        StreamName: this.streamName,
        Data: new TextEncoder().encode(JSON.stringify(event)),
        PartitionKey: partitionKey || eventType
      }));

      console.log(`Event published: ${eventType}`, { eventId: event.eventId });
    } catch (error) {
      console.error('Failed to publish event:', error);
      throw error;
    }
  }

  async publishBatch(events: Array<{eventType: string, data: any, partitionKey?: string}>): Promise<void> {
    const records = events.map(({ eventType, data, partitionKey }) => ({
      Data: new TextEncoder().encode(JSON.stringify({
        eventId: uuidv4(),
        eventType,
        timestamp: new Date().toISOString(),
        source: process.env.SERVICE_NAME,
        version: '1.0',
        data
      })),
      PartitionKey: partitionKey || eventType
    }));

    try {
      await this.kinesis.send(new PutRecordsCommand({
        StreamName: this.streamName,
        Records: records
      }));

      console.log(`Batch published: ${events.length} events`);
    } catch (error) {
      console.error('Failed to publish batch:', error);
      throw error;
    }
  }
}

// Event Consumer Pattern with Lambda
const eventProcessor = new lambda.Function(this, 'EventProcessor', {
  runtime: lambda.Runtime.NODEJS_18_X,
  handler: 'index.handler',
  code: lambda.Code.fromInline(`
    exports.handler = async (event) => {
      for (const record of event.Records) {
        const data = JSON.parse(Buffer.from(record.kinesis.data, 'base64').toString());
        console.log('Processing event:', data);
        
        // Process event based on eventType
        switch (data.eventType) {
          case 'order.created':
            await processOrderCreated(data.data);
            break;
          case 'payment.completed':
            await processPaymentCompleted(data.data);
            break;
          default:
            console.warn('Unknown event type:', data.eventType);
        }
      }
    };
    
    async function processOrderCreated(orderData) {
      // Business logic for order creation
    }
    
    async function processPaymentCompleted(paymentData) {
      // Business logic for payment completion
    }
  `),
  vpc: this.vpc,
  vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }
});

// Kinesis Event Source for Lambda
eventProcessor.addEventSource(new lambdaEventSources.KinesisEventSource(kinesisStream, {
  batchSize: 100, // Process up to 100 records per invocation
  maxBatchingWindow: cdk.Duration.seconds(5), // Wait up to 5 seconds to fill batch
  startingPosition: lambda.StartingPosition.LATEST
}));
```

### **2. Amazon EventBridge for Event Routing and Filtering**

**Best for**: Complex event routing, cross-service integration, third-party integrations.

```typescript
// Custom EventBridge Bus
const eventBus = new events.EventBus(this, 'MicroservicesEventBus', {
  eventBusName: `${props.serviceName}-events`
});

// VPC Endpoint for EventBridge
const eventBridgeEndpoint = new ec2.InterfaceVpcEndpoint(this, 'EventBridgeEndpoint', {
  vpc: this.vpc,
  service: ec2.InterfaceVpcEndpointAwsService.EVENTBRIDGE,
  subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
  privateDnsEnabled: true
});

// Event Rules for different service concerns
const orderEvents = new events.Rule(this, 'OrderEvents', {
  eventBus,
  ruleName: 'order-service-events',
  eventPattern: {
    source: ['order-service'],
    detailType: ['Order Created', 'Order Updated', 'Order Cancelled']
  }
});

const paymentEvents = new events.Rule(this, 'PaymentEvents', {
  eventBus,
  ruleName: 'payment-service-events',
  eventPattern: {
    source: ['payment-service'],
    detailType: ['Payment Completed', 'Payment Failed', 'Refund Processed']
  }
});

// Cross-service event routing
const inventoryUpdateRule = new events.Rule(this, 'InventoryUpdateRule', {
  eventBus,
  ruleName: 'inventory-updates',
  eventPattern: {
    source: ['order-service'],
    detailType: ['Order Created'],
    detail: {
      status: ['confirmed']
    }
  }
});

// EventBridge Publisher
export class EventBridgePublisher {
  private eventBridge: EventBridgeClient;
  private eventBusName: string;

  constructor(eventBusName: string) {
    this.eventBusName = eventBusName;
    this.eventBridge = new EventBridgeClient({
      region: process.env.AWS_REGION
    });
  }

  async publishEvent(
    source: string,
    detailType: string,
    detail: any,
    resources?: string[]
  ): Promise<void> {
    const event = {
      Source: source,
      DetailType: detailType,
      Detail: JSON.stringify({
        ...detail,
        eventId: uuidv4(),
        timestamp: new Date().toISOString(),
        version: '1.0'
      }),
      EventBusName: this.eventBusName,
      Resources: resources || []
    };

    try {
      await this.eventBridge.send(new PutEventsCommand({
        Entries: [event]
      }));

      console.log(`EventBridge event published: ${detailType}`, { 
        source, 
        eventId: JSON.parse(event.Detail).eventId 
      });
    } catch (error) {
      console.error('Failed to publish EventBridge event:', error);
      throw error;
    }
  }

  async publishBatch(events: Array<{
    source: string;
    detailType: string;
    detail: any;
    resources?: string[];
  }>): Promise<void> {
    const entries = events.map(({ source, detailType, detail, resources }) => ({
      Source: source,
      DetailType: detailType,
      Detail: JSON.stringify({
        ...detail,
        eventId: uuidv4(),
        timestamp: new Date().toISOString(),
        version: '1.0'
      }),
      EventBusName: this.eventBusName,
      Resources: resources || []
    }));

    try {
      // EventBridge supports up to 10 events per PutEvents call
      const chunks = this.chunkArray(entries, 10);
      
      for (const chunk of chunks) {
        await this.eventBridge.send(new PutEventsCommand({
          Entries: chunk
        }));
      }

      console.log(`EventBridge batch published: ${events.length} events`);
    } catch (error) {
      console.error('Failed to publish EventBridge batch:', error);
      throw error;
    }
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}

// Event Handler Lambda
const eventHandler = new lambda.Function(this, 'EventHandler', {
  runtime: lambda.Runtime.NODEJS_18_X,
  handler: 'index.handler',
  code: lambda.Code.fromInline(`
    exports.handler = async (event) => {
      console.log('EventBridge event received:', JSON.stringify(event, null, 2));
      
      const { source, 'detail-type': detailType, detail } = event;
      
      try {
        switch (source) {
          case 'order-service':
            await handleOrderEvents(detailType, detail);
            break;
          case 'payment-service':
            await handlePaymentEvents(detailType, detail);
            break;
          default:
            console.warn('Unknown event source:', source);
        }
      } catch (error) {
        console.error('Error processing event:', error);
        throw error; // This will cause the event to be retried
      }
    };
    
    async function handleOrderEvents(detailType, detail) {
      switch (detailType) {
        case 'Order Created':
          // Update inventory, send notifications, etc.
          break;
        case 'Order Cancelled':
          // Restore inventory, process refunds, etc.
          break;
      }
    }
    
    async function handlePaymentEvents(detailType, detail) {
      switch (detailType) {
        case 'Payment Completed':
          // Update order status, trigger fulfillment, etc.
          break;
        case 'Payment Failed':
          // Handle failed payment, notify customer, etc.
          break;
      }
    }
  `),
  vpc: this.vpc,
  vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }
});

// Add EventBridge as trigger
orderEvents.addTarget(new targets.LambdaFunction(eventHandler));
paymentEvents.addTarget(new targets.LambdaFunction(eventHandler));
```

### **3. Amazon SQS for Reliable Message Queuing**

**Best for**: Asynchronous task processing, decoupling services, guaranteed delivery.

```typescript
// Dead Letter Queue for failed messages
const dlq = new sqs.Queue(this, 'EventProcessingDLQ', {
  queueName: `${props.serviceName}-events-dlq`,
  retentionPeriod: cdk.Duration.days(14) // Keep failed messages for analysis
});

// Main processing queue
const eventQueue = new sqs.Queue(this, 'EventQueue', {
  queueName: `${props.serviceName}-events`,
  visibilityTimeout: cdk.Duration.seconds(300), // 5 minutes for processing
  retentionPeriod: cdk.Duration.days(7),
  deadLetterQueue: {
    queue: dlq,
    maxReceiveCount: 3 // Retry up to 3 times before sending to DLQ
  }
});

// VPC Endpoint for SQS
const sqsEndpoint = new ec2.InterfaceVpcEndpoint(this, 'SQSEndpoint', {
  vpc: this.vpc,
  service: ec2.InterfaceVpcEndpointAwsService.SQS,
  subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
  privateDnsEnabled: true
});

// SQS Publisher
export class SQSPublisher {
  private sqs: SQSClient;
  private queueUrl: string;

  constructor(queueUrl: string) {
    this.queueUrl = queueUrl;
    this.sqs = new SQSClient({
      region: process.env.AWS_REGION
    });
  }

  async sendMessage(messageBody: any, messageGroupId?: string): Promise<void> {
    const message = {
      messageId: uuidv4(),
      timestamp: new Date().toISOString(),
      source: process.env.SERVICE_NAME,
      ...messageBody
    };

    try {
      await this.sqs.send(new SendMessageCommand({
        QueueUrl: this.queueUrl,
        MessageBody: JSON.stringify(message),
        MessageGroupId: messageGroupId, // For FIFO queues
        MessageDeduplicationId: message.messageId
      }));

      console.log('SQS message sent:', { messageId: message.messageId });
    } catch (error) {
      console.error('Failed to send SQS message:', error);
      throw error;
    }
  }

  async sendBatch(messages: any[]): Promise<void> {
    const entries = messages.map((messageBody, index) => ({
      Id: index.toString(),
      MessageBody: JSON.stringify({
        messageId: uuidv4(),
        timestamp: new Date().toISOString(),
        source: process.env.SERVICE_NAME,
        ...messageBody
      })
    }));

    // SQS supports up to 10 messages per batch
    const chunks = this.chunkArray(entries, 10);

    try {
      for (const chunk of chunks) {
        await this.sqs.send(new SendMessageBatchCommand({
          QueueUrl: this.queueUrl,
          Entries: chunk
        }));
      }

      console.log(`SQS batch sent: ${messages.length} messages`);
    } catch (error) {
      console.error('Failed to send SQS batch:', error);
      throw error;
    }
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}

// Lambda function to process SQS messages
const queueProcessor = new lambda.Function(this, 'QueueProcessor', {
  runtime: lambda.Runtime.NODEJS_18_X,
  handler: 'index.handler',
  code: lambda.Code.fromInline(`
    exports.handler = async (event) => {
      for (const record of event.Records) {
        try {
          const message = JSON.parse(record.body);
          console.log('Processing SQS message:', message);
          
          // Process message based on type
          await processMessage(message);
          
          // Message is automatically deleted from queue on successful return
        } catch (error) {
          console.error('Error processing SQS message:', error);
          // Throwing error will cause message to be retried or sent to DLQ
          throw error;
        }
      }
    };
    
    async function processMessage(message) {
      // Implement your business logic here
      console.log('Message processed successfully:', message.messageId);
    }
  `),
  vpc: this.vpc,
  vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }
});

// Add SQS as event source
queueProcessor.addEventSource(new lambdaEventSources.SqsEventSource(eventQueue, {
  batchSize: 10, // Process up to 10 messages per invocation
  maxBatchingWindow: cdk.Duration.seconds(5)
}));
```

### **4. Amazon SNS for Fan-Out Messaging**

**Best for**: Broadcasting events to multiple subscribers, mobile notifications.

```typescript
// SNS Topic for event broadcasting
const eventTopic = new sns.Topic(this, 'EventTopic', {
  topicName: `${props.serviceName}-events`,
  displayName: 'Microservice Events'
});

// VPC Endpoint for SNS
const snsEndpoint = new ec2.InterfaceVpcEndpoint(this, 'SNSEndpoint', {
  vpc: this.vpc,
  service: ec2.InterfaceVpcEndpointAwsService.SNS,
  subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
  privateDnsEnabled: true
});

// Fan-out pattern: SNS → Multiple SQS Queues
const orderProcessingQueue = new sqs.Queue(this, 'OrderProcessingQueue');
const analyticsQueue = new sqs.Queue(this, 'AnalyticsQueue');
const notificationQueue = new sqs.Queue(this, 'NotificationQueue');

// Subscribe queues to topic
eventTopic.addSubscription(new snsSubscriptions.SqsSubscription(orderProcessingQueue, {
  filterPolicy: {
    eventType: sns.SubscriptionFilter.stringFilter({
      allowlist: ['order.created', 'order.updated']
    })
  }
}));

eventTopic.addSubscription(new snsSubscriptions.SqsSubscription(analyticsQueue, {
  filterPolicy: {
    eventType: sns.SubscriptionFilter.stringFilter({
      allowlist: ['order.created', 'payment.completed', 'user.registered']
    })
  }
}));

eventTopic.addSubscription(new snsSubscriptions.SqsSubscription(notificationQueue, {
  filterPolicy: {
    eventType: sns.SubscriptionFilter.stringFilter({
      allowlist: ['order.shipped', 'payment.failed']
    })
  }
}));

// SNS Publisher
export class SNSPublisher {
  private sns: SNSClient;
  private topicArn: string;

  constructor(topicArn: string) {
    this.topicArn = topicArn;
    this.sns = new SNSClient({
      region: process.env.AWS_REGION
    });
  }

  async publishEvent(
    eventType: string, 
    data: any, 
    attributes?: Record<string, string>
  ): Promise<void> {
    const message = {
      eventId: uuidv4(),
      eventType,
      timestamp: new Date().toISOString(),
      source: process.env.SERVICE_NAME,
      data
    };

    try {
      await this.sns.send(new PublishCommand({
        TopicArn: this.topicArn,
        Message: JSON.stringify(message),
        MessageAttributes: {
          eventType: {
            DataType: 'String',
            StringValue: eventType
          },
          source: {
            DataType: 'String',
            StringValue: process.env.SERVICE_NAME || 'unknown'
          },
          ...Object.entries(attributes || {}).reduce((acc, [key, value]) => ({
            ...acc,
            [key]: { DataType: 'String', StringValue: value }
          }), {})
        }
      }));

      console.log(`SNS event published: ${eventType}`, { eventId: message.eventId });
    } catch (error) {
      console.error('Failed to publish SNS event:', error);
      throw error;
    }
  }
}
```

## **Service Mesh Patterns via VPC Endpoints**

### **Service Discovery with AWS Cloud Map**

```typescript
// Private DNS namespace
const namespace = new servicediscovery.PrivateDnsNamespace(this, 'ServiceNamespace', {
  name: 'microservices.local',
  vpc: this.vpc,
  description: 'Private service discovery for microservices'
});

// Service registration
const service = new servicediscovery.Service(this, 'ServiceDiscovery', {
  namespace,
  name: props.serviceName,
  dnsRecordType: servicediscovery.DnsRecordType.A,
  dnsTtl: cdk.Duration.seconds(60),
  healthCheckConfig: {
    type: servicediscovery.HealthCheckType.HTTP,
    resourcePath: '/health',
    failureThreshold: 3
  }
});

// Register service instances
const serviceInstance = service.registerNonIpInstance('ServiceInstance', {
  customAttributes: {
    'ELB_ENDPOINT': nlb.loadBalancerDnsName,
    'VPC_ENDPOINT_SERVICE': vpceService.vpcEndpointServiceName,
    'SERVICE_VERSION': props.serviceVersion || '1.0.0'
  }
});
```

### **Distributed Tracing with X-Ray**

```typescript
// VPC Endpoint for X-Ray
const xrayEndpoint = new ec2.InterfaceVpcEndpoint(this, 'XRayEndpoint', {
  vpc: this.vpc,
  service: ec2.InterfaceVpcEndpointAwsService.XRAY,
  subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
  privateDnsEnabled: true
});

// X-Ray tracing for Lambda functions
const tracedFunction = new lambda.Function(this, 'TracedFunction', {
  runtime: lambda.Runtime.NODEJS_18_X,
  handler: 'index.handler',
  tracing: lambda.Tracing.ACTIVE, // Enable X-Ray tracing
  code: lambda.Code.fromInline(`
    const AWSXRay = require('aws-xray-sdk-core');
    const AWS = AWSXRay.captureAWS(require('aws-sdk'));
    
    exports.handler = async (event) => {
      const segment = AWSXRay.getSegment();
      const subsegment = segment.addNewSubsegment('business-logic');
      
      try {
        // Your business logic here
        const result = await processEvent(event);
        
        subsegment.addAnnotation('eventType', event.eventType);
        subsegment.addMetadata('result', result);
        
        return result;
      } catch (error) {
        subsegment.addError(error);
        throw error;
      } finally {
        subsegment.close();
      }
    };
    
    async function processEvent(event) {
      // Simulate processing
      return { processed: true, eventId: event.eventId };
    }
  `),
  vpc: this.vpc,
  vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }
});

// X-Ray service map annotations
export class TracingHelper {
  static addServiceAnnotations(serviceName: string, operation: string) {
    const segment = AWSXRay.getSegment();
    if (segment) {
      segment.addAnnotation('service', serviceName);
      segment.addAnnotation('operation', operation);
      segment.setNamespace('microservices');
    }
  }

  static addCustomMetadata(key: string, data: any) {
    const segment = AWSXRay.getSegment();
    if (segment) {
      segment.addMetadata(key, data);
    }
  }
}
```

## **Why Not VPC Peering or Transit Gateway?**

### **VPC Peering: Complexity Explosion**
- **5 services** = 10 peering connections
- **10 services** = 45 peering connections  
- **20 services** = 190 peering connections
- Manual route table and security group management
- IP address conflicts and no transitive routing

### **Transit Gateway: Over-Engineering**
- **$36/month** base cost + **$36/month** per VPC attachment
- Example: 10 services = **~$400/month** vs. **$220/month** for PrivateLink
- Complex route management for simple use cases
- Enterprise-scale solution for startup-scale problems

## **Service Registry & Discovery**

```typescript
// Service registration
export class ServiceRegistry {
  static async registerService(serviceName: string, endpoints: ServiceEndpoints) {
    new ssm.StringParameter(scope, `${serviceName}VPCEndpoint`, {
      parameterName: `/microservices/${serviceName}/vpc-endpoint-service-name`,
      stringValue: endpoints.vpcEndpointServiceName
    });

    new ssm.StringParameter(scope, `${serviceName}EventBus`, {
      parameterName: `/microservices/${serviceName}/event-bus-arn`,
      stringValue: endpoints.eventBusArn
    });
  }

  static async discoverService(serviceName: string): Promise<ServiceEndpoints> {
    const ssmClient = new SSMClient({});
    const params = await Promise.all([
      ssmClient.send(new GetParameterCommand({
        Name: `/microservices/${serviceName}/vpc-endpoint-service-name`
      })),
      ssmClient.send(new GetParameterCommand({
        Name: `/microservices/${serviceName}/event-bus-arn`
      }))
    ]);

    return {
      vpcEndpointServiceName: params[0].Parameter?.Value!,
      eventBusArn: params[1].Parameter?.Value!
    };
  }
}

// Service client with circuit breaker
export class ServiceClient {
  private circuitBreaker: CircuitBreaker;

  constructor(private serviceName: string) {
    this.circuitBreaker = new CircuitBreaker(this.makeRequest.bind(this), {
      timeout: 3000,
      errorThresholdPercentage: 50,
      resetTimeout: 30000
    });
  }

  async callSync(path: string, data?: any): Promise<any> {
    return this.circuitBreaker.fire(path, data);
  }

  async publishEvent(eventType: string, data: any): Promise<void> {
    const endpoints = await ServiceRegistry.discoverService(this.serviceName);
    const eventPublisher = new EventBridgePublisher(endpoints.eventBusArn);
    await eventPublisher.publishEvent(this.serviceName, eventType, data);
  }

  private async makeRequest(path: string, data?: any): Promise<any> {
    const endpoints = await ServiceRegistry.discoverService(this.serviceName);
    const response = await fetch(`https://${endpoints.internalDnsName}${path}`, {
      method: data ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json' },
      body: data ? JSON.stringify(data) : undefined
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return response.json();
  }
}
```

### **Health Check and Service Discovery**

```typescript
// Health check endpoint for each service
app.get('/health', async (req, res) => {
  try {
    // Check database connectivity
    await database.ping();
    
    // Check downstream service dependencies
    const dependencyChecks = await Promise.all([
      checkDependencyHealth('payment-service'),
      checkDependencyHealth('inventory-service')
    ]);

    const allHealthy = dependencyChecks.every(check => check.healthy);

    res.status(allHealthy ? 200 : 503).json({
      status: allHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      dependencies: dependencyChecks,
      version: process.env.SERVICE_VERSION || 'unknown'
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

async function checkDependencyHealth(serviceName: string): Promise<HealthCheck> {
  try {
    const client = new ResilientServiceClient(serviceName);
    await client.callService('/health');
    return { service: serviceName, healthy: true };
  } catch (error) {
    return { 
      service: serviceName, 
      healthy: false, 
      error: error.message 
    };
  }
}

interface HealthCheck {
  service: string;
  healthy: boolean;
  error?: string;
}
```

## **Security Best Practices**

### **1. Least Privilege IAM Policies**

```typescript
// Service-specific IAM role with minimal permissions
const serviceRole = new iam.Role(this, 'ServiceRole', {
  assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
  inlinePolicies: {
    ServiceSpecificPolicy: new iam.PolicyDocument({
      statements: [
        // Only access own service parameters
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['ssm:GetParameter', 'ssm:GetParameters'],
          resources: [
            `arn:aws:ssm:${this.region}:${this.account}:parameter/microservices/${serviceName}/*`
          ]
        }),
        // Only access own secrets
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['secretsmanager:GetSecretValue'],
          resources: [
            `arn:aws:secretsmanager:${this.region}:${this.account}:secret:${serviceName}/*`
          ]
        }),
        // Service discovery for other services (read-only)
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['ssm:GetParameter'],
          resources: [
            `arn:aws:ssm:${this.region}:${this.account}:parameter/microservices/*/vpc-endpoint-service-name`,
            `arn:aws:ssm:${this.region}:${this.account}:parameter/microservices/*/internal-dns`
          ]
        })
      ]
    })
  }
});
```

### **2. Security Group Isolation**

```typescript
// Strict security group rules for inter-service communication
const serviceSecurityGroup = new ec2.SecurityGroup(this, 'ServiceSG', {
  vpc: this.vpc,
  description: `Security group for ${serviceName}`,
  allowAllOutbound: false // Explicit outbound rules only
});

// Only allow inbound from ALB
serviceSecurityGroup.addIngressRule(
  ec2.Peer.securityGroupId(albSecurityGroup.securityGroupId),
  ec2.Port.tcp(8080),
  'Allow traffic from ALB'
);

// Only allow outbound to specific services
serviceSecurityGroup.addEgressRule(
  ec2.Peer.securityGroupId(databaseSecurityGroup.securityGroupId),
  ec2.Port.tcp(27017),
  'Allow outbound to DocumentDB'
);

// Allow outbound to VPC endpoints
serviceSecurityGroup.addEgressRule(
  ec2.Peer.ipv4(vpc.vpcCidrBlock),
  ec2.Port.tcp(443),
  'Allow HTTPS to VPC endpoints'
);
```

### **3. Network ACLs for Defense in Depth**

```typescript
// Additional network-level security
const privateNetworkAcl = new ec2.NetworkAcl(this, 'PrivateNetworkAcl', {
  vpc: this.vpc,
  networkAclName: 'private-subnets-nacl'
});

// Allow inbound HTTPS from VPC
privateNetworkAcl.addEntry('AllowInboundHTTPS', {
  ruleNumber: 100,
  traffic: ec2.AclTraffic.tcpPort(443),
  direction: ec2.TrafficDirection.INGRESS,
  cidr: ec2.AclCidr.ipv4(vpc.vpcCidrBlock),
  ruleAction: ec2.Action.ALLOW
});

// Allow outbound to VPC endpoints
privateNetworkAcl.addEntry('AllowOutboundHTTPS', {
  ruleNumber: 100,
  traffic: ec2.AclTraffic.tcpPort(443),
  direction: ec2.TrafficDirection.EGRESS,
  cidr: ec2.AclCidr.ipv4(vpc.vpcCidrBlock),
  ruleAction: ec2.Action.ALLOW
});

// Associate with private subnets
vpc.privateSubnets.forEach((subnet, index) => {
  new ec2.SubnetNetworkAclAssociation(this, `PrivateSubnetNaclAssoc${index}`, {
    subnet,
    networkAcl: privateNetworkAcl
  });
});
```

## **Cost Analysis: PrivateLink vs Alternatives**

### **Startup Scale (5-10 Services)**

| Solution | Monthly Cost | Complexity | Maintenance |
|----------|-------------|------------|-------------|
| **VPC PrivateLink** | $110-220 | Low | Minimal |
| **VPC Peering** | $0 | High | High |
| **Transit Gateway** | $400+ | Medium | Medium |
| **Public Internet + Security** | $50-100 | High | High |

### **Mid-Size Scale (20-50 Services)**

| Solution | Monthly Cost | Complexity | Maintenance |
|----------|-------------|------------|-------------|
| **VPC PrivateLink** | $440-1,100 | Low | Minimal |
| **VPC Peering** | $0 | Very High | Very High |
| **Transit Gateway** | $800+ | Medium | Medium |

**PrivateLink ROI Calculation:**
```
Engineering Time Saved per Month:
• VPC Peering: 20-40 hours debugging connectivity issues
• PrivateLink: 2-4 hours routine maintenance

Cost of Engineering Time: $150/hour (loaded cost)
Monthly savings: $3,000-6,000 in engineering productivity
PrivateLink cost: $440-1,100

Net savings: $2,000-5,000/month for mid-size companies
```

## **Implementation Checklist**

### **✅ Direct Communication Setup**
- [ ] Runtime code in private subnets only
- [ ] Network Load Balancer for internal communication
- [ ] VPC Endpoint Service created and registered
- [ ] Circuit breaker pattern implemented
- [ ] Service discovery parameters published
- [ ] Least privilege IAM roles configured

### **✅ Event-Driven Communication Setup**
- [ ] EventBridge custom bus created
- [ ] Kinesis streams for high-throughput data
- [ ] SQS queues with DLQ for reliable processing
- [ ] SNS topics for fan-out messaging
- [ ] VPC Endpoints for all AWS services
- [ ] Event schema registry implemented

### **✅ Service Registry & Discovery**
- [ ] Parameter Store service registration
- [ ] Service capabilities documentation
- [ ] Health check endpoints implemented
- [ ] Service contract versioning
- [ ] API documentation published

### **✅ Security & Monitoring**
- [ ] Security groups with minimal required rules
- [ ] Network ACLs for defense in depth
- [ ] VPC Flow Logs enabled for traffic analysis
- [ ] CloudTrail logging for API calls
- [ ] X-Ray distributed tracing configured
- [ ] CloudWatch dashboards for service metrics
- [ ] EventBridge and Kinesis monitoring

### **✅ Resilience Patterns**
- [ ] Circuit breaker implementation
- [ ] Retry logic with exponential backoff
- [ ] Correlation ID tracking for debugging
- [ ] Dead letter queues for failed events
- [ ] Event replay capabilities
- [ ] Service degradation handling

## **Migration Strategy**

### **Phase 1: Foundation (Direct Communication)**
1. Move existing services to private subnets
2. Implement health check endpoints
3. Set up service registry in Parameter Store
4. Create monitoring dashboards
5. Implement VPC PrivateLink for critical service pairs

### **Phase 2: Event-Driven Foundation**
1. Create EventBridge custom bus
2. Set up VPC Endpoints for AWS services
3. Implement basic event publishing for audit/analytics
4. Add SQS queues for asynchronous processing
5. Set up dead letter queues and monitoring

### **Phase 3: Advanced Event Patterns**
1. Add Kinesis streams for high-throughput data
2. Implement event-driven business processes
3. Add SNS for fan-out messaging patterns
4. Implement event replay and recovery mechanisms
5. Add advanced monitoring and distributed tracing

### **Phase 4: Optimization & Governance**
1. Implement event schema registry
2. Add service contract testing
3. Optimize event routing and filtering
4. Implement advanced security patterns
5. Document communication patterns and best practices

## **Communication Pattern Decision Matrix**

| Use Case | Recommended Pattern | AWS Services | Justification |
|----------|-------------------|-------------|--------------|
| **Immediate Response Required** | PrivateLink + HTTP | VPC Endpoint Service + NLB | Low latency, synchronous |
| **Fire-and-Forget Events** | EventBridge | EventBridge + Lambda | Simple event routing |
| **High-Volume Analytics** | Kinesis Streams | Kinesis + Lambda/Firehose | High throughput, real-time |
| **Reliable Task Processing** | SQS + DLQ | SQS + Lambda | Guaranteed delivery |
| **Broadcast Notifications** | SNS Fan-Out | SNS + SQS/Lambda | Multiple subscribers |
| **Cross-Service Workflows** | EventBridge + Step Functions | EventBridge + Step Functions | Complex orchestration |
| **Real-Time User Updates** | WebSockets | API Gateway WebSocket + EventBridge | Real-time push |

## **Troubleshooting Guide**

### **Common VPC Endpoint Issues**
```bash
# Check VPC Endpoint DNS resolution
nslookup kinesis.us-east-1.amazonaws.com

# Check VPC Endpoint connectivity
curl -I https://kinesis.us-east-1.amazonaws.com

# Check security group rules
aws ec2 describe-security-groups --group-ids sg-xxx

# Check route tables
aws ec2 describe-route-tables --filters "Name=vpc-id,Values=vpc-xxx"
```

### **EventBridge Debugging**
```typescript
// Add detailed logging for EventBridge events
const eventRule = new events.Rule(this, 'DebugRule', {
  eventBus,
  eventPattern: { source: ['*'] }, // Catch all events
  targets: [
    new targets.CloudWatchLogGroup(logGroup)
  ]
});

// Test event publishing
const testEvent = {
  Source: 'test-service',
  DetailType: 'Test Event',
  Detail: JSON.stringify({ test: true }),
  EventBusName: eventBusName
};

await eventBridge.send(new PutEventsCommand({
  Entries: [testEvent]
}));
```

### **Kinesis Monitoring**
```typescript
// CloudWatch metrics for Kinesis
const kinesisMetrics = new cloudwatch.Dashboard(this, 'KinesisMetrics', {
  widgets: [
    new cloudwatch.GraphWidget({
      title: 'Kinesis Throughput',
      left: [
        new cloudwatch.Metric({
          namespace: 'AWS/Kinesis',
          metricName: 'IncomingRecords',
          dimensionsMap: { StreamName: streamName }
        })
      ]
    })
  ]
});
```

## **Conclusion**

For startup to mid-size companies building microservice architectures, the combination of **AWS managed services with VPC endpoints** provides the optimal foundation for loose coupling:

### **✅ Recommended Event-Driven Stack:**

**For High-Reliability, Low-Latency Communication:**
- **VPC PrivateLink** for synchronous service-to-service calls
- **EventBridge** for event routing and business process coordination  
- **SQS + DLQ** for reliable asynchronous task processing
- **VPC Endpoints** to keep all traffic within AWS backbone

**For High-Throughput, Analytics-Heavy Workloads:**
- **Kinesis Streams** for real-time data processing
- **Kinesis Firehose** for data lake ingestion
- **SNS fan-out** for broadcasting to multiple consumers
- **Step Functions** for complex event-driven workflows

### **✅ Cost-Effective Architecture:**
- **$350/month** for complete event-driven stack (10 services)
- **Zero** operational overhead for message delivery, ordering, durability
- **Built-in** monitoring, security, and compliance with AWS managed services
- **Linear scaling** costs vs. exponential complexity of alternatives

### **✅ Enterprise Security Benefits:**
- All runtime code isolated in private subnets
- All inter-service traffic stays within AWS backbone
- No public internet dependencies for service communication
- Built-in encryption at rest and in transit
- Granular IAM permissions per service

### **❌ Avoid These Anti-Patterns:**

**VPC Peering for Microservices:**
- Complexity explosion: N*(N-1)/2 connections
- IP address management nightmare
- Manual security group coordination
- **Result**: 20-40 hours/month debugging connectivity

**Self-Hosted Message Brokers:**
- Kafka/RabbitMQ operational overhead
- Cluster management, scaling, monitoring
- Security patching and high availability
- **Result**: Full-time DevOps engineer needed

**Public Internet Communication:**
- Security risks and compliance failures
- Unpredictable latency and reliability
- NAT Gateway costs for outbound traffic
- **Result**: Higher costs + lower security

### **The Strategic Advantage**

AWS managed services with VPC endpoints enable **true microservice independence**:

1. **Technology Freedom**: Each service chooses optimal AWS services for its domain
2. **Independent Scaling**: Services scale event processing based on their own requirements  
3. **Failure Isolation**: Event delivery failures in one service don't affect others
4. **Zero Coordination**: No shared infrastructure to coordinate or maintain
5. **AI Agent Ready**: Event-driven patterns work perfectly with AI agents as event processors

### **The OnDemandEnv.dev Alignment**

This architecture perfectly implements the [OnDemandEnv.dev](https://ondemandenv.dev) principles:

- **Individual Racers**: Services evolve independently through event contracts
- **Committee-Free**: No platform team coordination needed for AWS managed services
- **AI-Native**: Events provide clean signal for AI agents to process and optimize
- **Hypothesis→Experiment**: Each service can experiment with different event patterns in isolated environments

**The bottom line**: AWS managed services + VPC endpoints provide enterprise-grade reliability with startup-friendly operational simplicity. You get Netflix-scale event processing without Netflix-scale operational teams.