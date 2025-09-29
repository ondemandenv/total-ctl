import { apiClient } from './api-client';
import type { VideoAnalysisResult } from '../types/video-analyzer.types';

export const generateSignedUrl = async (fileKey: string, contentType: string, fileSize: number): Promise<string> => {
  const response = await apiClient.post('/video-analyzer/signed-url', { fileKey, contentType, fileSize });
  return response.data.signedUrl;
};

export const analyzeVideo = async (fileKey: string): Promise<VideoAnalysisResult> => {
  const response = await apiClient.post('/video-analyzer/analyze', { fileKey });
  return response.data;
};

export const checkAnalysisStatus = async (jobId: string): Promise<VideoAnalysisResult> => {
  const response = await apiClient.get(`/video-analyzer/analyze/status/${jobId}`);
  return response.data;
};
