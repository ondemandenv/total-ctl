import {
  DetectToxicContentCommand,
  DetectSentimentCommand,
  LanguageCode,
  ComprehendClient
} from "@aws-sdk/client-comprehend";
import type {
  ToxicLabel,
  DetectSentimentResult
} from "../types/video-analyzer.types";

const SUPPORTED_COMPREHEND_LANGUAGES: LanguageCode[] = [
  "en", "es", "fr", "de", "it", "pt", "ar", "hi", "ja", "ko", "zh", "zh-TW"
];

const ALLOWED_REGIONS_TOXIC_LABELS = new Set([
  "us-east-1",
  "us-west-2",
  "eu-west-1",
  "ap-southeast-2",
]);

const comprehendClient = new ComprehendClient({});

/**
 * Runs the DetectToxicContentCommand and returns an array of ToxicLabel.
 */
export const detectToxicContent = async (
  text: string,
  languageCode: LanguageCode
): Promise<ToxicLabel[]> => {
  // input validation
  if (!text.trim()) {
    // no toxicity at all
    return [{
      Name: "CONTENT_CHECK",
      Score: 0,
      Severity: "Low",
      Details: "No toxic or inappropriate content detected (Empty text)",
    }];
  }
  if (text.length > 5000) {
    throw new Error("Text exceeds maximum length of 5000 characters");
  }

  const cmd = new DetectToxicContentCommand({
    TextSegments: [{ Text: text }],
    LanguageCode: languageCode,
  });

  const resp = await comprehendClient.send(cmd);
  const labels = resp.ResultList?.[0]?.Labels ?? [];

  if (labels.length === 0) {
    // no toxicity at all
    return [{
      Name: "CONTENT_CHECK",
      Score: 0,
      Severity: "Low",
      Details: "No toxic or inappropriate content detected",
    }];
  }

  return labels.map(label => ({
    Name: label.Name!,
    Score: label.Score!,
    Severity: determineSeverity(label.Score!),
    Details: `AWS Comprehend detected ${label.Name} with ${(label.Score! * 100).toFixed(1)}% confidence`,
  }));
};

/**
 * Runs the DetectSentimentCommand and returns the full DetectSentimentResult.
 */
export const detectSentiment = async (
  text: string,
  languageCode: LanguageCode = "en"
): Promise<DetectSentimentResult> => {
  if (!text.trim()) {
    throw new Error("Text cannot be empty");
  }
  if (text.length > 5000) {
    throw new Error("Text exceeds maximum length of 5000 characters");
  }

  const cmd = new DetectSentimentCommand({
    Text: text,
    LanguageCode: languageCode,
  });

  const resp = await comprehendClient.send(cmd);
  const score = resp.SentimentScore!;

  return {
    Sentiment: resp.Sentiment!,
    SentimentScore: [{
      Mixed:   score.Mixed!,
      Negative: score.Negative!,
      Neutral:  score.Neutral!,
      Positive: score.Positive!,
    }],
  };
};

/**
 * For "en": run both toxicity + sentiment.
 * Otherwise: just sentiment.
 * Returns a mixed array of ToxicLabel and DetectSentimentResult.
 */
export const analyzeMixedContent = async (
  text: string,
  languageCode: LanguageCode = "en"
): Promise<Array<ToxicLabel | DetectSentimentResult>> => {
  try {
    const results: Array<ToxicLabel | DetectSentimentResult> = [];
    const region = process.env.AWS_REGION ?? "None";

    if (SUPPORTED_COMPREHEND_LANGUAGES.includes(languageCode) && ALLOWED_REGIONS_TOXIC_LABELS.has(region)) {
      // English supports toxicity + sentiment
      if (languageCode === "en") {
        // toxicity
        try {
          const toxy = await detectToxicContent(text, languageCode);
          results.push(...toxy);
        } catch (e: any) {
          console.error("Toxicity analysis failed:", JSON.stringify(e));
        }
      } else {
        console.log(`Skipping toxic check for unsupported language: ${languageCode}`);
      }
    } else {
      console.log(
        `Skipping AWS Comprehend for unsupported language or region: language: ${languageCode} region: ${region}.`
      );
    }

    return results;
  } catch (err) {
    console.error("analyzeMixedContent error:", err);
    throw err;
  }
};

// Helper function to determine severity based on score
export function determineSeverity(score: number): "High" | "Medium" | "Low" {
  if (score >= 0.8) return "High";
  if (score >= 0.5) return "Low";
  return "Low";
}
