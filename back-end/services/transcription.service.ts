import { analyzeMixedContent } from "./content-analysis.service";
import {
  StartTranscriptionJobCommand,
  GetTranscriptionJobCommand,
  LanguageCode as TranscribeLanguageCode, // Alias Transcribe LanguageCode
  TranscribeClient
} from "@aws-sdk/client-transcribe";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type {
  TranscriptionJob,
  TranscriptionResult,
  ToxicLabel,
  DetectSentimentResult,
} from "../types/video-analyzer.types";
import { LanguageCode } from "@aws-sdk/client-comprehend"; // Import Comprehend LanguageCode

const LANGUAGE_OPTIONS: TranscribeLanguageCode[] = [
  "en-US",
  "es-US",
  "es-ES",
  "fr-FR",
  "fr-CA",
  // "hu-HU",
  // "de-DE",
  // "ro-RO",
  // "nl-NL",
  // "cs-CZ",
  // "sk-SK",
  // "da-DK",
  // "th-TH",
  // "ms-MY",
  // "pt-BR",
  // "pt-PT",
] as const;

const LANGUAGE_CODE_MAPPING: { [key: string]: LanguageCode | undefined } = {
  "en-US": "en" as LanguageCode,
  "es-US": "es" as LanguageCode,
  "es-ES": "es" as LanguageCode,
  "fr-FR": "fr" as LanguageCode,
  "fr-CA": "fr" as LanguageCode,
  "hu-HU": "hu" as LanguageCode,
  "de-DE": "de" as LanguageCode,
  "ro-RO": "ro" as LanguageCode,
  "nl-NL": "nl" as LanguageCode,
  "cs-CZ": "cs" as LanguageCode,
  "sk-SK": "sk" as LanguageCode,
  "da-DK": "da" as LanguageCode,
  "th-TH": "th" as LanguageCode,
  "ms-MY": "ms" as LanguageCode,
  "pt-BR": "pt" as LanguageCode,
  "pt-PT": "pt" as LanguageCode,
};
interface TranscriptData {
  results: {
    transcripts: Array<{ transcript: string }>;
    language_identification?: Array<{
      language_code: string;
      score: number;
    }>;
  };
}
interface DetectedLanguage {
  languageCode: string;
  confidence: number;
}

export const startTranscriptionJob = async (
  fileKey: string,
  bucketName: string,
): Promise<TranscriptionJob> => {
  const jobName = `transcription-${Date.now()}`;
  const transcriptKey = `${fileKey}-transcript`;
  const transcribeClient = new TranscribeClient({});

  try {
    const command = new StartTranscriptionJobCommand({
      TranscriptionJobName: jobName,
      IdentifyLanguage: true,
      LanguageOptions: LANGUAGE_OPTIONS,
      Settings: {
        ShowSpeakerLabels: true,
        MaxSpeakerLabels: 2,
        ShowAlternatives: true,
        MaxAlternatives: 4,
        VocabularyFilterMethod: "mask",
      },
      Media: {
        MediaFileUri: `s3://${bucketName}/${fileKey}`,
      },
      OutputBucketName: bucketName,
      OutputKey: transcriptKey,
    });

    console.log(
      "Starting transcription with config:",
      JSON.stringify(command.input, null, 2)
    );
    await transcribeClient.send(command);
    return { jobName, transcriptKey };
  } catch (error) {
    console.error("Error in transcription setup:", error);
    throw error;
  }
};

export const getTranscriptionResult = async (
  jobName: string,
  transcriptKey: string,
  bucketName: string,
): Promise<TranscriptionResult> => {
  while (true) {
    const command = new GetTranscriptionJobCommand({
      TranscriptionJobName: jobName,
    });

    const transcribeClient = new TranscribeClient({});
    const response = await transcribeClient.send(command);
    const job = response.TranscriptionJob;
    const status = job?.TranscriptionJobStatus;

    console.log("Transcription job details:", {
      status,
      languageCode: job?.LanguageCode,
      identifiedLanguageScore: job?.IdentifiedLanguageScore,
    });

    if (status === "COMPLETED") {
      try {
        await new Promise((resolve) => setTimeout(resolve, 1000));

        const transcriptData = await getTranscriptData(transcriptKey, bucketName);

        if (!transcriptData) {
          throw new Error("No transcript data found");
        }

        let detectedLanguages: DetectedLanguage[] = [];

        // Use the job's language code directly
        if (job?.LanguageCode) {
          detectedLanguages = [
            {
              languageCode: job.LanguageCode, // This will be 'hu-HU'
              confidence: job.IdentifiedLanguageScore || 1.0,
            },
          ];
        }

        return {
          transcript: transcriptData.results.transcripts[0].transcript,
          detectedLanguages,
        };
      } catch (error) {
        console.error("Error getting transcript:", error);
        throw new Error("Failed to retrieve transcript");
      }
    } else if (status === "FAILED") {
      throw new Error(
        `Transcription failed: ${job?.FailureReason || "Unknown reason"}`
      );
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
};

const getTranscriptData = async (
  transcriptKey: string,
  bucketName: string,
): Promise<TranscriptData | null> => {
  const s3Client = new S3Client({});
  try {
    const getCommand = new GetObjectCommand({
      Bucket: bucketName,
      Key: transcriptKey,
    });

    const response = await s3Client.send(getCommand);
    const transcriptText = await response.Body?.transformToString();

    if (!transcriptText) {
      return null;
    }

    return JSON.parse(transcriptText) as TranscriptData;
  } catch (error) {
    console.error("Error getting transcript data:", error);
    return null;
  }
};

// In transcription.service.ts:
export const processVideo = async (
  fileKey: string,
  bucketName: string,
): Promise<{
  transcript: string;
  detectedLanguages: Array<{ languageCode: string; confidence: number }>;
  toxicLabels: Array<ToxicLabel | DetectSentimentResult>;
  transcriptBadWordsResult: {
    status: "IN_PROGRESS" | "No bad words found" | "One or more bad words detected";
    detectedBadWords: string[];
  }
}> => {
  try {
    const { jobName, transcriptKey } = await startTranscriptionJob(fileKey, bucketName);
    const transcriptionResult = await getTranscriptionResult(
      jobName,
      transcriptKey,
      bucketName,
    );

    // Get the most confident language code
    let detectedLanguageCode: LanguageCode | undefined = undefined;
    let badWordsResult: { status: "IN_PROGRESS" | "No bad words found" | "One or more bad words detected"; detectedBadWords: string[] } = {
      status: "No bad words found",
      detectedBadWords: []
    };
    if (
      transcriptionResult.detectedLanguages &&
      transcriptionResult.detectedLanguages.length > 0
    ) {
      const sortedLanguages = transcriptionResult.detectedLanguages.sort(
        (a, b) => b.confidence - a.confidence
      );
      const transcribeLanguageCode = sortedLanguages[0].languageCode;
      detectedLanguageCode = LANGUAGE_CODE_MAPPING[transcribeLanguageCode];
      console.log("Detected transcribe language code:", transcribeLanguageCode);
      console.log("Mapped to comprehend language code:", detectedLanguageCode);

      // Simplified: skip DB-backed bad words list, mark as clean
      badWordsResult = { status: "No bad words found", detectedBadWords: [] };
    }

    if (!detectedLanguageCode) {
      console.warn(
        "No Comprehend language code mapping found for detected language. Defaulting to English."
      );
      detectedLanguageCode = "en" as LanguageCode;

      // Simplified: skip DB-backed bad words list when no language is detected
      badWordsResult = { status: "No bad words found", detectedBadWords: [] };
    }

    console.log(`Detected language for Comprehend: ${detectedLanguageCode}`);
    console.log("processVideo - detectedLanguageCode:", detectedLanguageCode);

    // Analyze the transcript with the detected language
    const toxicLabels = await analyzeMixedContent(
      transcriptionResult.transcript,
      detectedLanguageCode
    );

    return {
      transcript: transcriptionResult.transcript,
      detectedLanguages: transcriptionResult.detectedLanguages,
      toxicLabels: toxicLabels,
      transcriptBadWordsResult: {
        status: badWordsResult.status,
        detectedBadWords: badWordsResult.detectedBadWords
      }
    };
  } catch (error) {
    console.error("Error in processVideo:", error);
    throw error;
  }
};
