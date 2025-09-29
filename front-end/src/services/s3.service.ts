import { apiClient } from './api-client';

export const uploadFile = async (signedUrl: string, file: File): Promise<boolean> => {
  try {
    const response = await fetch(signedUrl, {
      method: 'PUT',
      body: file,
      headers: {
        'Content-Type': file.type,
      },
    });
    return response.ok;
  } catch (error) {
    console.error('Upload error details:', error);
    throw error;
  }
};

export const deleteFile = async (fileKey: string): Promise<void> => {
  try {
    await apiClient.delete(`/video-analyzer/file/${fileKey}`);
    console.log('File deletion request sent for:', fileKey);
  } catch (error) {
    console.error('Delete error:', error);
  }
};
