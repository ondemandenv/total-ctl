export interface ProcessingTimings {
    total: number;
    transcription: number;
    comprehend: number;
    rekognition: number;
}

export interface ToxicLabel {
    Name: string;
    Score: number;
    Severity: string;
    Details: string;
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

export interface DetectSentimentResult {
    Sentiment: string;
    SentimentScore: {
        Positive: number;
        Negative: number;
        Neutral: number;
        Mixed: number;
    };
}

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
    rekognitionStatus: string;
    transcriptionStatus: string;
    comprehendStatus: string;
    jobStatus: "IN_PROGRESS" | "COMPLETED" | "FAILED"
  }
}
