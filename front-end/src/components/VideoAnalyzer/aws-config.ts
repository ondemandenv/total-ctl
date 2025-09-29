import { S3Client } from "@aws-sdk/client-s3";
import { RekognitionClient } from "@aws-sdk/client-rekognition";
import { TranscribeClient } from "@aws-sdk/client-transcribe";
import { ComprehendClient } from "@aws-sdk/client-comprehend";
import { AWS_REGION } from './constants';

const awsConfig = {
region: AWS_REGION,
credentials: {
    accessKeyId: import.meta.env.VITE_AWS_ACCESS_KEY_ID,
    secretAccessKey: import.meta.env.VITE_AWS_SECRET_ACCESS_KEY,
    sessionToken: import.meta.env.VITE_AWS_SESSION_TOKEN
}
};

export const s3Client = new S3Client(awsConfig);
export const rekognitionClient = new RekognitionClient(awsConfig);
export const transcribeClient = new TranscribeClient(awsConfig);
export const comprehendClient = new ComprehendClient(awsConfig);