import React from 'react';
import { LanguageDisplay } from './LanguageDisplay';  // Add this import
import { ToxicLabel, ProcessingTimings } from '../../../types/video-analyzer.types';

interface ResultsDisplayProps {
timings: ProcessingTimings;
moderationResults: string[];
transcriptionText: string;
detectedLanguages: Array<{ languageCode: string; confidence: number }>;
toxicContent: ToxicLabel[];
isProcessing: boolean;
}

export const ResultsDisplay: React.FC<ResultsDisplayProps> = ({
timings,
moderationResults,
transcriptionText,
detectedLanguages,
toxicContent,
isProcessing
}) => {
return (
    <div className="results-container">
        {!isProcessing && timings.total > 0 && (
            <div className="results timing-results">
                <h3>Processing Times:</h3>
                <ul>
                    <li>Total Processing: {timings.total.toFixed(2)}s</li>
                    <li>Rekognition: {timings.rekognition.toFixed(2)}s</li>
                    <li>Transcription: {timings.transcription.toFixed(2)}s</li>
                    <li>Comprehend: {timings.comprehend.toFixed(2)}s</li>
                </ul>
            </div>
        )}

        {moderationResults.length > 0 && (
            <div className="results">
                <h3>Content Moderation Results:</h3>
                <ul>
                    {moderationResults.map((label, index) => (
                        <li key={`mod-${index}`}>{label}</li>
                    ))}
                </ul>
            </div>
        )}

        {transcriptionText && (
            <div className="results">
                <h3>Transcription:</h3>
                <div className="transcription-metadata">
                    <LanguageDisplay languages={detectedLanguages} />
                </div>
                <div className="transcription-text">
                    {transcriptionText}
                </div>
            </div>
        )}

        {toxicContent.length > 0 && (
            <div className="results">
                <h3>Content Analysis:</h3>
                <ul>
                    {toxicContent.map((label, index) => (
                        <li 
                            key={`toxic-${index}`}
                            className={`severity-${label.Severity.toLowerCase()}`}
                        >
                            {label.Name} ({(label.Score * 100).toFixed(1)}%) - {label.Severity} Severity
                            {label.Details && ` - ${label.Details}`}
                        </li>
                    ))}
                </ul>
            </div>
        )}
    </div>
);
};