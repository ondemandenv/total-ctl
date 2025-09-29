export interface ProcessingTimings {
  total: number;
  transcription: number;
  comprehend: number;
  rekognition: number;
}

export interface ProcessingStatus {
  moderation: string;
  transcription: string;
  comprehend: string;
}

export interface VideoMetadata {
  duration: number;
  width: number;
  height: number;
}

export interface TranscriptionJob {
  jobName: string;
  transcriptKey: string;
}

export interface TranscriptionResult {
  transcript: string;
  detectedLanguages: Array<{
    languageCode: string;
    confidence: number;
  }>;
}

export interface ToxicLabel {
  Name: string;
  Score: number;
  Severity: "High" | "Medium" | "Low";
  Details?: string;
}

export interface TranscriptionResult {
  transcript: string;
  detectedLanguages: Array<{
    languageCode: string;
    confidence: number;
  }>;
}

export interface DetectSentimentResult {
  Sentiment: string;
  SentimentScore: Array<{
    Mixed: number;
    Negative: number;
    Neutral: number;
    Positive: number;
  }>;
}