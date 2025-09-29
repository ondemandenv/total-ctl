export const MAX_VIDEO_DURATION = 60; // 1 minute max
export const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB max
export const MODERATION_TIMEOUT = 120; // 120 seconds
export const OPTIMAL_VIDEO_SIZE = 10 * 1024 * 1024; // 10MB recommended size

// Language codes with their display names
export const SUPPORTED_LANGUAGES = {
  // Spanish variants
  "es-ES": "Spanish (Spain)",
  "es-US": "Spanish (US/Latin America)",

  // Portuguese variants
  "pt-BR": "Portuguese (Brazil)",
  "pt-PT": "Portuguese (Portugal)",

  // English variants
  "en-US": "English (US)",
  "en-GB": "English (UK)",

  // French variants
  "fr-FR": "French (France)",
  "fr-CA": "French (Canada)",

  // Other languages
  "th-TH": "Thai",
  "ms-MY": "Malay",
  "hu-HU": "Hungarian",
  "de-DE": "German",
  "ro-RO": "Romanian",
  "nl-NL": "Dutch",
  "cs-CZ": "Czech",
  "sk-SK": "Slovak",
  "da-DK": "Danish",
} as const;

// Array of language codes for AWS Transcribe
export const LANGUAGE_OPTIONS = Object.keys(SUPPORTED_LANGUAGES);

// Language groups for better organization
export const LANGUAGE_GROUPS = {
  SPANISH: ["es-ES", "es-US"],
  PORTUGUESE: ["pt-BR", "pt-PT"],
  ENGLISH: ["en-US", "en-GB"],
  FRENCH: ["fr-FR", "fr-CA"],
} as const;
