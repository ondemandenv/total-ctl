import React from 'react';
import { VideoMetadata } from '../../../types/video-analyzer.types';
import { formatTime } from '../../../utils/Moderation/video-utils';

interface VideoPreviewProps {
  videoUrl: string;
  metadata: VideoMetadata | null | undefined;  // Update this line
  videoRef: React.RefObject<HTMLVideoElement>;
  }

export const VideoPreview: React.FC<VideoPreviewProps> = ({
videoUrl,
metadata,
videoRef
}) => {
return (
    <div className="video-preview-container">
        <video
            ref={videoRef}
            controls
            src={videoUrl}
            style={{ maxWidth: '400px', marginTop: '20px' }}
        />
        {metadata && (
            <div className="video-info">
                <span>Duration: {formatTime(metadata.duration)}</span>
                <span>Resolution: {metadata.width}x{metadata.height}</span>
            </div>
        )}
    </div>
);
};