import React, { useState, useRef, useEffect } from 'react';
import { FileUpload } from './components/FileUpload';
import { VideoPreview } from './components/VideoPreview';
import { ProcessingStatus } from './components/ProcessingStatus';
import { ResultsDisplay } from './components/ResultsDisplay';
import { uploadFile, deleteFile } from '../../services/s3.service';
import { generateSignedUrl, analyzeVideo, checkAnalysisStatus } from '../../services/video-analyzer.service';
import { MAX_VIDEO_DURATION, MAX_FILE_SIZE, MODERATION_TIMEOUT, OPTIMAL_VIDEO_SIZE } from './constants';
import { getVideoMetadata } from '../../utils/Moderation/video-utils';
import { 
  ProcessingTimings, 
  ToxicLabel, 
  VideoMetadata,
  VideoAnalysisResult
  } from '../../types/video-analyzer.types';
import './VideoAnalyzer.scss';

export const VideoAnalyzer: React.FC = () => {
// State declarations
const [file, setFile] = useState<File | null>(null);
const [jobId, setJobId] = useState<string | null>(null);
const [isProcessing, setIsProcessing] = useState(false);
const [error, setError] = useState<string>("");
const [moderationResults, setModerationResults] = useState<string[]>([]);
const [transcriptionText, setTranscriptionText] = useState<string>("");
const [toxicContent, setToxicContent] = useState<ToxicLabel[]>([]);
const [videoUrl, setVideoUrl] = useState<string>("");
const [includeLabelDetection, setIncludeLabelDetection] = useState<boolean>(false);
const [processingTime, setProcessingTime] = useState<number>(0);
const [videoMetadata, setVideoMetadata] = useState<VideoMetadata | null>(null);
const [detectedLanguages, setDetectedLanguages] = useState<Array<{
    languageCode: string;
    confidence: number;
}>>([]);
const [timings, setTimings] = useState<ProcessingTimings>({
    total: 0,
    transcription: 0,
    comprehend: 0,
    rekognition: 0
});
const [status, setStatus] = useState<{
    moderation: string;
    transcription: string;
    comprehend: string;
}>({
    moderation: "",
    transcription: "",
    comprehend: ""
});

// Refs
const videoRef = useRef<HTMLVideoElement>(null);

// Cleanup effect
useEffect(() => {
    return () => {
        if (videoUrl) {
            URL.revokeObjectURL(videoUrl);
        }
    };
}, [videoUrl]);

const resetState = () => {
    setError("");
    setJobId(null);
    setModerationResults([]);
    setTranscriptionText("");
    setToxicContent([]);
    setStatus({
        moderation: "",
        transcription: "",
        comprehend: ""
    });
    setProcessingTime(0);
    setDetectedLanguages([]);
    setTimings({
        total: 0,
        transcription: 0,
        comprehend: 0,
        rekognition: 0
    });
};

const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
  resetState();
  setVideoMetadata(null);
  
  const selectedFile = event.target.files?.[0];
  if (selectedFile) {
      console.log("File selected:", {
          name: selectedFile.name,
          size: selectedFile.size,
          type: selectedFile.type
      });
      
      if (videoUrl) {
          URL.revokeObjectURL(videoUrl);
      }
  
      try {
          const metadata = await getVideoMetadata(selectedFile);
          setVideoMetadata(metadata);
  
          if (metadata.duration > MAX_VIDEO_DURATION) {
              setError(`Video must be shorter than ${MAX_VIDEO_DURATION} seconds`);
              return;
          }
  
          if (selectedFile.size > MAX_FILE_SIZE) {
              setError(`File size must be less than ${MAX_FILE_SIZE / 1024 / 1024}MB`);
              return;
          }
  
          // Add warning for large files
          if (selectedFile.size > OPTIMAL_VIDEO_SIZE) {
              console.warn(`Large file detected (${(selectedFile.size / 1024 / 1024).toFixed(1)}MB). Processing may take longer.`);
          }
  
          setFile(selectedFile);
          const newVideoUrl = URL.createObjectURL(selectedFile);
          setVideoUrl(newVideoUrl);
      } catch (error) {
          console.error("Error loading video:", error);
          setError("Failed to load video");
          if (event.target) {
              event.target.value = '';
          }
      }
  }
  };

  const updateStateWithAnalysis = (result: VideoAnalysisResult) => {
    setModerationResults(result.moderationLabels.map(label => `${label.Name} (${(label.Score * 100).toFixed(2)}%)`));
    setTranscriptionText(result.transcript);
    setToxicContent(result.toxicLabels.filter((r): r is ToxicLabel => (r as ToxicLabel).Score !== undefined));
    setDetectedLanguages(result.detectedLanguages);
    setStatus({
      moderation: result.progress.rekognitionStatus,
      transcription: result.progress.transcriptionStatus,
      comprehend: result.progress.comprehendStatus,
    });
  };

  useEffect(() => {
    if (!jobId || !isProcessing) {
      return;
    }

    const interval = setInterval(async () => {
      try {
        const result = await checkAnalysisStatus(jobId);
        updateStateWithAnalysis(result);

        if (result.progress.jobStatus === 'COMPLETED' || result.progress.jobStatus === 'FAILED') {
          clearInterval(interval);
          setIsProcessing(false);
          setJobId(null);

          try {
            console.log("Cleaning up S3 file...");
            await deleteFile(result.fileKey);
          } catch (cleanupError) {
            console.error("Cleanup error:", cleanupError);
          }
        }
      } catch (error) {
        console.error("Error checking analysis status:", error);
        setError("Failed to get analysis status.");
        clearInterval(interval);
        setIsProcessing(false);
        setJobId(null);
      }
    }, 5000); // Poll every 5 seconds

    return () => clearInterval(interval);
  }, [jobId, isProcessing]);

const handleUpload = async () => {
    if (!file) return;

    const totalStartTime = Date.now();
    setIsProcessing(true);
    resetState();
    
    const fileKey = `video_${Date.now()}_${file.name}`;

    try {
        setStatus(prev => ({ ...prev, moderation: "Preparing upload..." }));
        const signedUrl = await generateSignedUrl(fileKey, file.type, file.size);

        setStatus(prev => ({ ...prev, moderation: "Uploading file..." }));
        const uploaded = await uploadFile(signedUrl, file);

        if (uploaded) {
            setStatus(prev => ({ ...prev, moderation: "Processing..." }));
            const initialResult = await analyzeVideo(fileKey);
            setJobId(initialResult.jobId);
            updateStateWithAnalysis(initialResult);
        } else {
            throw new Error("Upload to S3 failed");
        }

    } catch (error) {
        console.error("Processing error:", error);
        setError("An error occurred during processing");
        setIsProcessing(false);
    }
};

return (
    <div className="video-analyzer">
        <div className="analyzer-container">
            <FileUpload
                onFileChange={handleFileChange}
                isProcessing={isProcessing}
                includeLabelDetection={includeLabelDetection}
                onLabelDetectionChange={setIncludeLabelDetection}
            />

            {videoUrl && (
                <VideoPreview
                    videoUrl={videoUrl}
                    metadata={videoMetadata}
                    videoRef={videoRef}
                />
            )}

            <button 
                onClick={handleUpload}
                disabled={!file || isProcessing}
                className="upload-button"
            >
                {isProcessing ? 'Processing...' : 'Analyze Video'}
            </button>

            {isProcessing && (
                <ProcessingStatus
                    status={status}
                    processingTime={processingTime}
                    timeoutDuration={MODERATION_TIMEOUT}
                />
            )}

            {error && <div className="error">{error}</div>}

            <ResultsDisplay
                timings={timings}
                moderationResults={moderationResults}
                transcriptionText={transcriptionText}
                detectedLanguages={detectedLanguages}
                toxicContent={toxicContent}
                isProcessing={isProcessing}
            />
        </div>
    </div>
);
};

export default VideoAnalyzer;