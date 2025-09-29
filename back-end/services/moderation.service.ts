import {
  StartContentModerationCommand,
  GetContentModerationCommand,
  RekognitionClient
} from "@aws-sdk/client-rekognition";
import {
  MODERATION_TIMEOUT,
} from "../utils/constants";
import type { ToxicLabel } from "../types/video-analyzer.types";
import { determineSeverity } from "./content-analysis.service";

export const startModerationJob = async (
  fileKey: string,
  bucketName: string,
  onProgress?: (elapsedTime: number) => void
): Promise<{ jobId: string; moderationLabels: Array<ToxicLabel>; }> => {
  const rekognitionClient = new RekognitionClient({});
  let jobId: string = "";
  let moderationLabels: ToxicLabel[] = [];
  try {
    console.log("Starting moderation for file:", fileKey);
    const startModCommand = new StartContentModerationCommand({
      Video: {
        S3Object: {
          Bucket: bucketName,
          Name: fileKey,
        },
      },
    });
    const startModResponse = await rekognitionClient.send(startModCommand);
    jobId = startModResponse.JobId || "";
    if (!jobId) {
      throw new Error("No JobId returned from Rekognition");
    }

    const startTime = Date.now();
    let hasTimedOut = false;
    const getModCommand = new GetContentModerationCommand({ JobId: jobId });
    let getModResponse = await rekognitionClient.send(getModCommand);
    let attempts = 0;
    const checkInterval = 2000;
    const maxAttempts = Math.floor(MODERATION_TIMEOUT * 1000 / checkInterval);

    console.log(`Moderation polling (background) will timeout after ${MODERATION_TIMEOUT} seconds or ${maxAttempts} attempts.`);
    while (
      getModResponse.JobStatus === "IN_PROGRESS" &&
      !hasTimedOut &&
      attempts < maxAttempts
    ) {
      attempts++;
      const elapsedTime = Math.floor((Date.now() - startTime) / 1000);
      if (onProgress) {
        onProgress(elapsedTime);
      }
      const dynamicInterval = Math.min(
        checkInterval * (1 + Math.floor(attempts / 10)),
        5000
      );
      await new Promise((resolve) => setTimeout(resolve, dynamicInterval));
      getModResponse = await rekognitionClient.send(getModCommand);
      if (elapsedTime >= MODERATION_TIMEOUT) {
        hasTimedOut = true;
      }
    }

    if (getModResponse.ModerationLabels && getModResponse.ModerationLabels.length > 0) {
      moderationLabels = getModResponse.ModerationLabels.map(label => ({
        Name: label.ModerationLabel?.Name!,
        Score: label.ModerationLabel?.Confidence! / 100,
        Severity: determineSeverity(label.ModerationLabel?.Confidence!),
        Details: `AWS Rekognition detected ${label.ModerationLabel?.Name} with ${(label.ModerationLabel?.Confidence!).toFixed(1)}% confidence`,
      }));
    }

    if (moderationLabels.length === 0) {
      moderationLabels = [{
        Name:     "CONTENT_CHECK",
        Score:    0,
        Severity: "Low",
        Details:  "No content concerns detected",
      }];
    }
    console.log("Background moderation polling completed for jobId:", jobId);
    return { jobId, moderationLabels };
  } catch (error: unknown) {
    console.error("Moderation error:", error);
    return { jobId: jobId || "", moderationLabels };
  }
};

export const getModerationProgress = async (jobId: string): Promise<{
  jobStatus: string;
  moderationLabels: ToxicLabel[];
}> => {
  const rekognitionClient = new RekognitionClient({});

  try {
    const getModCommand = new GetContentModerationCommand({ JobId: jobId });
    const response = await rekognitionClient.send(getModCommand);

    let moderationLabels: ToxicLabel[] = [];
    const status = response.JobStatus || "Unknown";

    if (response.ModerationLabels && response.ModerationLabels.length > 0) {
      moderationLabels = response.ModerationLabels.map(label => ({
        Name: label.ModerationLabel?.Name!,
        Score: label.ModerationLabel?.Confidence! / 100,
        Severity: determineSeverity(label.ModerationLabel?.Confidence!),
        Details: `AWS Rekognition detected ${label.ModerationLabel?.Name} with ${(label.ModerationLabel?.Confidence!).toFixed(1)}% confidence`,
      }));
    }

    return {
      jobStatus: status,
      moderationLabels,
    };
  } catch (error: unknown) {
    console.error("Error retrieving moderation progress:", error);
    throw error;
  }
};