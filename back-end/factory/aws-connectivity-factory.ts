import { HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { DetectLabelsCommand, RekognitionClient } from "@aws-sdk/client-rekognition";
import { GetTranscriptionJobCommand, TranscribeClient } from "@aws-sdk/client-transcribe";
import { DetectDominantLanguageCommand, ComprehendClient } from "@aws-sdk/client-comprehend";
import { CredentialService } from "../services/credential-service";

// S3 connectivity check: list buckets
export async function checkS3Connectivity(): Promise<boolean> {
  const credentialService = new CredentialService();
  const s3Client = new S3Client({});
  const bucketName = credentialService.s3BucketName;

  try {
    await s3Client.send(new HeadBucketCommand({ Bucket: bucketName }));
    console.log("S3 connectivity: OK");
    return true;
  } catch (error) {
    console.error("S3 connectivity error:", error);
    return false;
  }
}

// Rekognition connectivity check: list collections (or an equivalent harmless call)
export async function checkRekognitionConnectivity(): Promise<boolean> {
  const rekognitionClient = new RekognitionClient({});

  // Base64-encoded valid JPEG (1x1 white pixel)
  const base64JPEG =
    "/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAkGBxISEhUTEhIVFRUXFxUVFxUVFRUVFRUVFhUXFxcVFRUYHSggGBolGxUVITEhJSkrLi4uFx8zODMsNygtLisBCgoKDg0OGxAQGy0lICYtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLf/AABEIAKgBLAMBIgACEQEDEQH/xAAXAAEBAQEAAAAAAAAAAAAAAAABAAID/8QAGREAAgMBAAAAAAAAAAAAAAAAAQIAAxES/9oADAMBAAIQAxAAAAFadX//xAAaEAACAwEBAAAAAAAAAAAAAAACAwABBBEh/9oACAEBAAEFAhsV7Is0mZkFUX//xAAZEQACAwEAAAAAAAAAAAAAAAAAAgESITH/2gAIAQMBAT8BM0f/xAAbEQACAgMBAAAAAAAAAAAAAAAAAREhIQIScf/aAAgBAgEBPwF6iLxy/8QAHhAAAgEDBQAAAAAAAAAAAAAAAQIRAAQhMUGRsdH/2gAIAQEABj8C1UMUeVJ2vT1DRM7KDn//xAAbEAEBAAMBAQEAAAAAAAAAAAABEQAhMUFRYf/aAAgBAQABPyFj+eFRysw3vAb5QzvOkQMKrdUkd2fs1f/aAAwDAQACAAMAAAAQb//EABoRAAICAwAAAAAAAAAAAAAAAAABERAhMUH/2gAIAQMBAT8QEm5rZ//EAB0RAAICAQUAAAAAAAAAAAAAAAEAEVEhMVFhgZH/2gAIAQIBAT8Q2FqFPZBa1//EABoQAQACAwEAAAAAAAAAAAAAAAEAESExUWH/2gAIAQEAAT8QUU0m8EZjz1a34DZpTxyfSOqU2KzoCW+xw8xyIB8CJl//Z";

  const buffer = Buffer.from(base64JPEG, "base64");

  const command = new DetectLabelsCommand({
    Image: { Bytes: buffer },
    MaxLabels: 1,
  });

  try {
    await rekognitionClient.send(command);
    console.log("Rekognition connectivity: OK");
    return true;
  } catch (error) {
    console.error("Rekognition connectivity error:", error);
    return false;
  }
}

// Transcribe connectivity check: list transcription jobs
export async function checkTranscribeConnectivity(): Promise<boolean> {
  const transcribeClient = new TranscribeClient({});

  try {
    await transcribeClient.send(
      new GetTranscriptionJobCommand({
        TranscriptionJobName: "__connectivity_check__"
      })
    );
    console.log("Transcribe connectivity: OK (unexpected success)");
    return true;
  } catch (error: any) {
    if (error.name === "BadRequestException" || error.$metadata?.httpStatusCode === 400) {
      console.log("Transcribe connectivity: OK (expected job not found)");
      return true;
    }

    console.error("Transcribe connectivity error:", error);
    return false;
  }
}

// Comprehend connectivity check: run a basic dominant language detection
export async function checkComprehendConnectivity(): Promise<boolean> {
  const comprehendClient = new ComprehendClient({});
  try {
    const command = new DetectDominantLanguageCommand({
      Text: "Hello world",
    });
    await comprehendClient.send(command);
    console.log("Comprehend connectivity: OK");
    return true;
  } catch (error) {
    console.error("Comprehend connectivity error:", error);
    return false;
  }
}
