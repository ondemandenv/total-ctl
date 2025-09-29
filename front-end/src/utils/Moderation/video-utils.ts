import { VideoMetadata } from '../../types/video-analyzer.types';

export const formatTime = (seconds: number): string => {
if (seconds < 60) {
    return `${seconds} seconds`;
}
const minutes = Math.floor(seconds / 60);
const remainingSeconds = seconds % 60;
return `${minutes}m ${remainingSeconds}s`;
};

export const getVideoMetadata = async (file: File): Promise<VideoMetadata> => {
return new Promise((resolve, reject) => {
    const video = document.createElement('video') as unknown as HTMLVideoElement;
    video.preload = 'metadata';
    
    video.onloadedmetadata = () => {
        URL.revokeObjectURL(video.src);
        resolve({
            duration: video.duration,
            width: video.videoWidth,
            height: video.videoHeight
        });
    };

    video.onerror = () => reject(new Error("Failed to load video metadata"));
    video.src = URL.createObjectURL(file);
});
};