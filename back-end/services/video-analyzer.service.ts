import { getModerationProgress, startModerationJob } from "./moderation.service";
import { processVideo } from "./transcription.service";
import type { ToxicLabel, DetectSentimentResult } from "../types/video-analyzer.types";
import type { CredentialService } from "./credential-service";
import type { S3StorageService } from "./s3-service";
// Lazy-load MediaStandardizer to avoid requiring ffmpeg at startup
import * as path from "path";
import * as fs from "fs";
import { v4 as uuidv4 } from 'uuid';
import { cleanDirectory, getMimeTypeFromFilename } from "../utils/file";

export interface VideoAnalysisResult {
  jobId: string;
  fileKey: string;
  moderationLabels: Array<ToxicLabel>;
  transcript: string;
  detectedLanguages: Array<{ languageCode: string; confidence: number }>;
  toxicLabels: Array<ToxicLabel | DetectSentimentResult>;
  transcriptBadWordsResult: {
    status: "IN_PROGRESS" | "No bad words found" | "One or more bad words detected";
    detectedBadWords: string[];
  }
  progress: {
    rekognitionStatus: string;    // e.g. "SUCCEEDED", "IN_PROGRESS", "FAILED"
    transcriptionStatus: string;  // e.g. "PENDING", "COMPLETED", "FAILED"
    comprehendStatus: string;     // e.g. "PENDING", "COMPLETED", "SKIPPED"
    jobStatus: "IN_PROGRESS" | "COMPLETED" | "FAILED"
  }
}

export class VideoAnalysisService {
  credentialsService: CredentialService;
  s3Service: S3StorageService;

  // Replace persistent repo with in-memory cache for simplicity
  private transcriptionCache: Map<string, { fileKey: string; result: {
    transcript: string;
    detectedLanguages: Array<{ languageCode: string; confidence: number }>;
    toxicLabels: Array<ToxicLabel | DetectSentimentResult>;
    transcriptBadWordsResult: {
      status: "IN_PROGRESS" | "No bad words found" | "One or more bad words detected";
      detectedBadWords: string[];
    };
    jobStatus: "IN_PROGRESS" | "COMPLETED" | "FAILED";
  }; timestamp: number; }> = new Map();

  private readonly CACHE_EXPIRATION = 30 * 60 * 1000;

  constructor(
    credentialsService: CredentialService,
    s3Service: S3StorageService
  ) {
    this.credentialsService = credentialsService;
    this.s3Service = s3Service;
  }

  public async generateSignedUrl(fileKey: string, contentType: string, fileSize: number): Promise<string> {
    return this.s3Service.generateSignedUploadUrl(fileKey, contentType, fileSize);
  }

  public async deleteFile(fileKey: string): Promise<void> {
    await this.s3Service.deleteFile(fileKey);
  }

  public async analyzeVideo(fileKey: string): Promise<VideoAnalysisResult> {
    for (const [, entry] of this.transcriptionCache) {
      if (entry.fileKey === fileKey) {
        throw new Error("A job for this file is already in progress.");
      }
    }

    const bucketName = this.credentialsService.s3BucketName;

    const { moderationFileKey, taskId } = await this.createModerationVersion(fileKey);

    // Run the video through Rekognition content moderation.
    const { jobId, moderationLabels } = await startModerationJob(
      moderationFileKey,
      bucketName
    );

    if(taskId) await this.cleanupDownloadedFiles(taskId);

    this.transcriptionCache.set(jobId, {
      fileKey,
      result: {
        transcript: "",
        detectedLanguages: [],
        toxicLabels: [],
        transcriptBadWordsResult: { status: "IN_PROGRESS", detectedBadWords: [] },
        jobStatus: "IN_PROGRESS",
      },
      timestamp: Date.now(),
    });

    // Kick off the transcription process in the background – we don't await it here.
    processVideo(fileKey, bucketName)
    .then(async (result) => {
      const entry = this.transcriptionCache.get(jobId);
      if (!entry) return;

      // FIXED: Properly validate bad words using whole word and phrase matching
      const transcript = result.transcript.toLowerCase();

      // Filter bad words to include both single words and phrases that appear in the transcript
      const actualBadWords = result.transcriptBadWordsResult.detectedBadWords.filter(badWord => {
        const badWordLower = badWord.toLowerCase();

        // Check if it's a multi-word phrase
        if (badWordLower.includes(' ')) {
          // For phrases, check if the entire phrase appears in the transcript
          return transcript.includes(badWordLower);
        } else {
          // For single words, ensure it's a whole word match using word boundaries
          const wordRegex = new RegExp(`\\b${badWordLower}\\b`, 'i');
          return wordRegex.test(transcript);
        }
      });

      // Update the bad words result with properly validated words using the correct type
      const validatedBadWordsResult: {
        status: "IN_PROGRESS" | "No bad words found" | "One or more bad words detected";
        detectedBadWords: string[];
      } = {
        status: actualBadWords.length > 0
          ? "One or more bad words detected"
          : "No bad words found",
        detectedBadWords: actualBadWords
      };

      let jobStatus: "IN_PROGRESS" | "COMPLETED" | "FAILED" = "IN_PROGRESS";
      let allToxicLabels: ToxicLabel[] = [];

      const toxicOnly = result.toxicLabels.filter(
          (r): r is ToxicLabel => (r as ToxicLabel).Score !== undefined
      );
      const toxicOnlyLabels = moderationLabels.filter(
          (r): r is ToxicLabel => (r as ToxicLabel).Score !== undefined
      );
      allToxicLabels = [
        ...toxicOnlyLabels,
        ...toxicOnly
      ];

      // If actual bad words detected, mark as FAILED; otherwise evaluate toxicity threshold
      if (actualBadWords.length > 0) {
        jobStatus = "FAILED";
      } else {
        jobStatus = this.processToxicLabels(fileKey, allToxicLabels, 0.8);
      }

      this.transcriptionCache.set(jobId, {
        fileKey: entry.fileKey,
        result: {
          transcript: result.transcript,
          detectedLanguages: result.detectedLanguages,
          toxicLabels: allToxicLabels,
          transcriptBadWordsResult: validatedBadWordsResult,
          jobStatus,
        },
        timestamp: entry.timestamp,
      });
      // extra log
      const entryFinal = this.transcriptionCache.get(jobId);
      console.log(
        `Background transcription completed: ${JSON.stringify(entryFinal?.result)}`
      );
    })
    .catch((error) => {
      console.error("Error processing background transcription:", error);
    });

    return {
      jobId: jobId,
      fileKey: fileKey,
      moderationLabels: moderationLabels,
      transcript: "", // Not yet available
      detectedLanguages: [], // Not yet available
      toxicLabels: [], // Not yet available
      transcriptBadWordsResult: {
        status: "IN_PROGRESS",
        detectedBadWords: [],
      },
      progress: {
        rekognitionStatus: "IN_PROGRESS",
        transcriptionStatus: "PENDING",
        comprehendStatus: "PENDING",
        jobStatus: "IN_PROGRESS",
      },
    };
  }

  public async checkModerationProgress(
    jobId: string
  ): Promise<VideoAnalysisResult> {
    if (!this.transcriptionCache.has(jobId)) {
      throw new Error("Job not found for moderation");
    }

    const moderationData = await getModerationProgress(jobId);
    const moderationLabels: ToxicLabel[] = moderationData.moderationLabels;

    let transcript = "";
    let fileKeyValue = "";
    let detectedLanguages: Array<{ languageCode: string; confidence: number }> =
      [];
    let toxicLabels: Array<ToxicLabel | DetectSentimentResult> = [];
    let transcriptionStatus = "PENDING";
    let comprehendStatus = "PENDING";
    let transcriptBadWordsResultStatus:
      | "IN_PROGRESS"
      | "No bad words found"
      | "One or more bad words detected" = "IN_PROGRESS";
    let transcriptBadWordsResultDetectedLanguages = [];
    let jobStatus: "IN_PROGRESS" | "COMPLETED" | "FAILED" = "IN_PROGRESS";

    // Retrieve from cache that is still in progress
    const { result, fileKey } = (this.transcriptionCache.get(jobId))!;
    transcript = result.transcript;
    fileKeyValue = fileKey;
    detectedLanguages = result.detectedLanguages;
    toxicLabels = result.toxicLabels;
    transcriptBadWordsResultStatus = result.transcriptBadWordsResult.status;
    transcriptBadWordsResultDetectedLanguages =
      result.transcriptBadWordsResult.detectedBadWords;
    jobStatus = result.jobStatus;

    // If moderation is complete, try to get the transcription from the cache:
    if (moderationData.jobStatus === "SUCCEEDED") {
      transcriptionStatus = "COMPLETED";
      comprehendStatus = "COMPLETED";
    } else {
      transcript = "Video moderation still in progress";
    }

    return {
      jobId: jobId,
      fileKey: fileKeyValue,
      moderationLabels: moderationLabels,
      transcript,
      detectedLanguages,
      toxicLabels,
      transcriptBadWordsResult: {
        status: transcriptBadWordsResultStatus,
        detectedBadWords: transcriptBadWordsResultDetectedLanguages,
      },
      progress: {
        rekognitionStatus: moderationData.jobStatus,
        transcriptionStatus,
        comprehendStatus,
        jobStatus,
      },
    };
  }

  private processToxicLabels(
    fileKey: string,
    toxicLabels: ToxicLabel[],
    threshold = 0.9
  ): "COMPLETED" | "IN_PROGRESS" | "FAILED" {
    const maxScore = toxicLabels.reduce(
      (max, lbl) => Math.max(max, lbl.Score),
      0
    );

    if (maxScore > threshold) {
      return "FAILED";
    }

    return "COMPLETED";
  }

  private async checkIfNeedsConversion(fileKey: string): Promise<boolean> {
    try {
      console.log(`[VideoAnalyzer] Checking if ${fileKey} needs conversion based on content type`);
      
      const metadata = await this.s3Service.getObjectMetadata(fileKey);

      console.log(`[VideoAnalyzer] Metadata for ${fileKey}: ${JSON.stringify(metadata)}`)
      
      const contentType = metadata.ContentType || getMimeTypeFromFilename(fileKey);
      
      console.log(`[VideoAnalyzer] Content type for ${fileKey}: ${contentType}`);
      
      const validModerationTypes = [
        'video/mp4',
      ];
      
      if (contentType.toLowerCase().startsWith('video/mp4')) {
        const fileSize = metadata.ContentLength || 0;
        const MAX_DIRECT_MODERATION_SIZE = 50 * 1024 * 1024; // 50MB threshold
        
        if (fileSize > MAX_DIRECT_MODERATION_SIZE) {
          console.log(`[VideoAnalyzer] File is too large (${fileSize} bytes), needs conversion`);
          return true;
        }
      }
      
      const needsConversion = !validModerationTypes.some(type => 
        contentType.toLowerCase().startsWith(type)
      );
      
      console.log(`[VideoAnalyzer] File ${needsConversion ? 'needs' : 'does not need'} conversion`);
      return needsConversion;
    } catch (error) {
      console.error(`[VideoAnalyzer] Error checking content type: ${error}`);
      return true;
    }
  }

  private async createModerationVersion(fileKey: string): Promise<{ moderationFileKey: string, taskId: string | null }> {

    // Check if conversion is actually needed
    const needsConversion = await this.checkIfNeedsConversion(fileKey);

    if (!needsConversion) {
      console.log(`[VideoAnalyzer] Video already in suitable format, skipping transcoding`);
      // return the same fileKey
      return { moderationFileKey: fileKey, taskId: null };
    } else {
      // for use in random unique folder name
      const taskId = uuidv4();

      console.log(`[VideoAnalyzer] Downloading file from S3: ${fileKey}`);

      const contentType = getMimeTypeFromFilename(fileKey);

      const downloadedFilePath = await this.s3Service.downloadFileToDir(
        taskId,
        fileKey,
        contentType
      );

      console.log(`[VideoAnalyzer] Downloaded file to: ${downloadedFilePath}`);

      // Create output directory for the moderation version
      const outputDir = path.join(__dirname, `./output/${taskId}`);
      await fs.promises.mkdir(outputDir, { recursive: true });

      // Generate output path for moderation version
      const outputPath = path.join(outputDir, "for_moderation.mp4");

      console.log(
        `[VideoAnalyzer] Creating moderation version at: ${outputPath}`
      );

      // Create moderation version of the video (lazy import)
      const { MediaStandardizer } = await import("../utils/media-standardizer");
      const moderationVersionPath = await MediaStandardizer.createModerationVersion(
        downloadedFilePath,
        outputPath
      );

      const moderationS3Key = `analysis/${taskId}/${path.basename(
        moderationVersionPath
      )}`;

      const moderationFile = await import('fs').then(fs => 
        fs.promises.readFile(moderationVersionPath)
      );

      // createModerationVersion always returns mp4 format
      const moderationBlob = new Blob([moderationFile], { type: "video/mp4" });

      console.log(
        `[VideoAnalyzer] Uploading moderation version to S3: ${moderationS3Key}`
      );

      // Upload the moderation version to S3
      await this.s3Service.uploadFile(moderationS3Key, moderationBlob);

      console.log(
        `[VideoAnalyzer] Moderation version uploaded to S3: ${moderationS3Key}`
      );

      return { moderationFileKey: moderationS3Key, taskId };
    }
  }

  private async cleanupDownloadedFiles(taskId: string) {
    try {
      const inputDir = path.join(__dirname, `./input/${taskId}`);
      await cleanDirectory(inputDir);

      const outputDir = path.join(__dirname, `./output/${taskId}`);
      await cleanDirectory(outputDir);
      console.log(`[VideoAnalyzer] Successfully cleaned up temporary files.`);
    } catch (cleanupError) {
      console.warn(
        `[VideoAnalyzer] Error cleaning up temporary files:`,
        cleanupError
      );
    }
  }
}
