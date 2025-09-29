import { 
  StartTranscriptionJobCommand,
  GetTranscriptionJobCommand,
  LanguageCode
  } from "@aws-sdk/client-transcribe";
  import { GetObjectCommand } from "@aws-sdk/client-s3";
  import { S3_BUCKET_NAME } from '../components/VideoAnalyzer/constants';
  import { TranscriptionJob, TranscriptionResult } from '../types/video-analyzer.types';
  import { transcribeClient, s3Client } from '../components/VideoAnalyzer/aws-config';
  
  // Define valid language codes
  const LANGUAGE_OPTIONS: LanguageCode[] = [
  'en-US',
  'es-US',
  'es-ES',
  'fr-FR',
  'fr-CA',
  'hu-HU',
  'de-DE',
  'ro-RO',
  'nl-NL',
  'cs-CZ',
  'sk-SK',
  'da-DK',
  'th-TH',
  'ms-MY',
  'pt-BR',
  'pt-PT'
  ] as const;
  
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
  
  export const startTranscriptionJob = async (fileKey: string): Promise<TranscriptionJob> => {
    const jobName = `transcription-${Date.now()}`;
    const transcriptKey = `${fileKey}-transcript`;
  
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
                VocabularyFilterMethod: "mask"
            },
            Media: {
                MediaFileUri: `s3://${S3_BUCKET_NAME}/${fileKey}`
            },
            OutputBucketName: S3_BUCKET_NAME,
            OutputKey: transcriptKey
        });
    
        console.log('Starting transcription with config:', JSON.stringify(command.input, null, 2));
        await transcribeClient.send(command);
        return { jobName, transcriptKey };
    } catch (error) {
        console.error('Error in transcription setup:', error);
        throw error;
    }
  };
  
  export const getTranscriptionResult = async (
    jobName: string, 
    transcriptKey: string
    ): Promise<TranscriptionResult> => {
    while (true) {
        const command = new GetTranscriptionJobCommand({
            TranscriptionJobName: jobName
        });
    
        const response = await transcribeClient.send(command);
        const job = response.TranscriptionJob;
        const status = job?.TranscriptionJobStatus;
    
        console.log('Transcription job details:', {
            status,
            languageCode: job?.LanguageCode,
            identifiedLanguageScore: job?.IdentifiedLanguageScore
        });
    
        if (status === 'COMPLETED') {
            try {
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                const transcriptData = await getTranscriptData(transcriptKey);
                
                if (!transcriptData) {
                    throw new Error('No transcript data found');
                }
    
                let detectedLanguages: DetectedLanguage[] = [];
    
                // Check for language identification in transcript data
                if (transcriptData.results?.language_identification) {
                    detectedLanguages = transcriptData.results.language_identification.map(lang => ({
                        languageCode: lang.language_code,
                        confidence: lang.score
                    }));
                } 
                // Fallback to job language if available
                else if (job?.LanguageCode) {
                    detectedLanguages = [{
                        languageCode: job.LanguageCode,
                        confidence: job.IdentifiedLanguageScore || 1.0
                    }];
                }
    
                return {
                    transcript: transcriptData.results.transcripts[0].transcript,
                    detectedLanguages
                };
            } catch (error) {
                console.error('Error getting transcript:', error);
                throw new Error('Failed to retrieve transcript');
            }
        } else if (status === 'FAILED') {
            throw new Error(`Transcription failed: ${job?.FailureReason || 'Unknown reason'}`);
        }
    
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
    };
    
  
  const getTranscriptData = async (transcriptKey: string): Promise<TranscriptData | null> => {
    try {
        const getCommand = new GetObjectCommand({
            Bucket: S3_BUCKET_NAME,
            Key: transcriptKey
        });
        
        const response = await s3Client.send(getCommand);
        const transcriptText = await response.Body?.transformToString();
        
        if (!transcriptText) {
            return null;
        }
    
        return JSON.parse(transcriptText) as TranscriptData;
    } catch (error) {
        console.error('Error getting transcript data:', error);
        return null;
    }
  };