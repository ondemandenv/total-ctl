import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import {Construct} from 'constructs';

export class InfraBasicAuth extends Construct {
    readonly authFunction: cloudfront.Function;

    constructor(scope: Construct, id: string) {
        super(scope, id);

        const store = new cloudfront.KeyValueStore(this, 'total-ctl-auth', {
            source: cloudfront.ImportSource.fromInline(JSON.stringify({
                data: [
                    {
                        key: "username",
                        value: "admin"
                    },
                    {
                        key: "password",
                        value: "password"
                    }
                ],
            })),
        });

        this.authFunction = new cloudfront.Function(this, 'BasicAuthFunction', {
            // Note: Must use JS_2_0 runtime for KeyValueStore support
            runtime: cloudfront.FunctionRuntime.JS_2_0,
            keyValueStore: store,
            code: cloudfront.FunctionCode.fromInline(`
import cf from 'cloudfront';

// Get the key value store handle
const kvsHandle = cf.kvs('${store.keyValueStoreId}');

async function handler(event) {
  const request = event.request;
  const headers = request.headers;
  const method = request.method;
  
  let username = '';
  let password = '';
  
  try {
    username = await kvsHandle.get('username');
    password = await kvsHandle.get('password');
  } catch (err) {
    console.log(\`KVS key lookup failed: \${err}\`);
    throw err;
  }
  
  // Create the expected authorization header
  const authorization = \`Basic \${btoa(\`\${username}:\${password}\`)}\`;
  
  // Skip auth for preflight requests
  if (method === "OPTIONS") {
    return {
      statusCode: 204,
      statusDescription: "NoContent",
      headers: {
        "access-control-allow-origin": { value: "*" }
      }
    };
  }
  
  // Check if authorization header matches expected value
  if (headers.authorization === undefined || 
      headers.authorization.value !== authorization) {
    return {
      statusCode: 401,
      statusDescription: 'Unauthorized',
      headers: {
        'www-authenticate': {value: 'Basic realm="Secure Area"'}
      }
    };
  }
  
  // If auth is successful, pass the request through
  return request;
}
      `
            ),
        })
    }
}
