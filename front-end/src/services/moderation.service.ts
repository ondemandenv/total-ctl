import { 
  StartContentModerationCommand, 
  GetContentModerationCommand,
  } from "@aws-sdk/client-rekognition";
  import { rekognitionClient } from '../components/VideoAnalyzer/aws-config';
  import { S3_BUCKET_NAME, MODERATION_TIMEOUT } from '../components/VideoAnalyzer/constants';
  
  export const startModerationJob = async (
  fileKey: string,
  onProgress?: (elapsedTime: number) => void
  ) => {
  const startTime = Date.now();
  let hasTimedOut = false;
  
  try {
      console.log("Starting moderation for file:", fileKey);
      
      const startModCommand = new StartContentModerationCommand({
          Video: {
              S3Object: {
                  Bucket: S3_BUCKET_NAME,
                  Name: fileKey
              }
          }
      });
  
      const startModResponse = await rekognitionClient.send(startModCommand);
      console.log("Moderation job started with ID:", startModResponse.JobId);
  
      if (!startModResponse.JobId) {
          throw new Error('No JobId returned from Rekognition');
      }
  
      const getModCommand = new GetContentModerationCommand({
          JobId: startModResponse.JobId
      });
  
      let getModResponse = await rekognitionClient.send(getModCommand);
      let attempts = 0;
      const maxAttempts = 60;
      const checkInterval = 2000;
  
      while (getModResponse.JobStatus === "IN_PROGRESS" && !hasTimedOut && attempts < maxAttempts) {
          attempts++;
          const elapsedTime = Math.floor((Date.now() - startTime) / 1000);
          
          if (onProgress) {
              onProgress(elapsedTime);
          }
  
          const dynamicInterval = Math.min(checkInterval * (1 + Math.floor(attempts / 10)), 5000);
          await new Promise(resolve => setTimeout(resolve, dynamicInterval));
          
          getModResponse = await rekognitionClient.send(getModCommand);
          
          console.log('Moderation status check:', {
              attempt: attempts,
              status: getModResponse.JobStatus,
              elapsedTime,
              hasLabels: getModResponse.ModerationLabels?.length ?? 0
          });
  
          if (elapsedTime >= MODERATION_TIMEOUT) {
              hasTimedOut = true;
          }
      }
  
      console.log('Final moderation response:', {
          status: getModResponse.JobStatus,
          attempts,
          totalTime: Math.floor((Date.now() - startTime) / 1000),
          labels: getModResponse.ModerationLabels?.length ?? 0
      });
  
      if (getModResponse.JobStatus === "SUCCEEDED") {
          if (getModResponse.ModerationLabels && getModResponse.ModerationLabels.length > 0) {
              return getModResponse.ModerationLabels.map(
                  label => `${label.ModerationLabel?.Name ?? 'Unknown'} (${label.ModerationLabel?.Confidence?.toFixed(2) ?? 0}%)`
              );
          }
          return ["No content concerns detected"];
      }
  
      return ["Processing is taking longer than expected - showing partial results"];
  
  } catch (error: unknown) {
      console.error("Moderation error:", {
          error,
          message: error instanceof Error ? error.message : 'Unknown error',
          code: (error as any)?.code,
          requestId: (error as any)?.$metadata?.requestId
      });
      return ["Error processing video moderation"];
  }
  };  