import BadWords, { type IBadWords } from "../models/badwords.model";

export class BadWordsService {
  public async getBadWordsByLanguage(language: string): Promise<IBadWords | null> {
    return await BadWords.findOne({ language });
  }

  public async createOrUpdateBadWordsForLanguage(language: string, swearWordsList: string): Promise<IBadWords> {
    const swearWords = swearWordsList.split(',').map(word => word.trim()).filter(word => word.length > 0);
    return await BadWords.findOneAndUpdate(
      { language },
      { language, swearWords },
      { new: true, upsert: true }
    );
  }

  // Given a language and a transcript, scan the transcript against the bad words list.
  public async checkTranscription(
    language: string,
    transcript: string
  ): Promise<{
    status: 'No bad words found' | 'One or more bad words detected';
    detectedBadWords: string[];
  }> {
    const DEFAULT_LANG = 'en-US';

    const primaryConfig = await this.getBadWordsByLanguage(language);
    const fallbackConfig = primaryConfig
      ? null
      : await this.getBadWordsByLanguage(DEFAULT_LANG);

    const config = primaryConfig ?? fallbackConfig;

    if (!config) {
      console.log(
        `checkTranscription: no bad-words config for '${language}' or '${DEFAULT_LANG}', skipping check.`
      );
      return {
        status: 'No bad words found',
        detectedBadWords: []
      };
    }
    const loadedLang = primaryConfig ? language : DEFAULT_LANG;
    console.log(`checkTranscription: Detected ${language}, loaded bad-words config for: ${loadedLang}.`);
    const badWords = config.swearWords.join(',')
      .split(',')
      .map((word: string) => word.trim().toLowerCase())
      .filter((word: string) => word.length > 0);
    const transcriptLower = transcript.toLowerCase();
    const detected = badWords.filter((word: string) => transcriptLower.includes(word));

    return { status: detected.length > 0 ? 'One or more bad words detected' : 'No bad words found', detectedBadWords: detected };
  }
}
