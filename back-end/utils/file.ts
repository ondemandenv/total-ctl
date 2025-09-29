import * as fs from 'fs/promises';
import * as path from 'path';

const FILE_TYPE_MAPPINGS: Record<string, string> = {
  // 3D file format
  "glb": "model/gltf-binary",

  // Video formats
  'mp4': 'video/mp4',
  'webm': 'video/webm',
};

// Create a reverse mapping (MIME type → extension)
const MIME_TO_EXTENSION: Record<string, string> = Object.entries(FILE_TYPE_MAPPINGS)
  .reduce((acc, [ext, mime]) => {
    acc[mime] = ext;
    return acc;
  }, {} as Record<string, string>);

export const FILE_VALIDATION = {
  MAX_SIZE_MB: 15,
  MIME_TYPE_EXTENSION_MAP: MIME_TO_EXTENSION
};

export function getFileExtension(contentType: string): string | null {
  return FILE_VALIDATION.MIME_TYPE_EXTENSION_MAP[contentType] || null;
}

export function isExtendedMimeTypeAllowed(mimeType: string, expected: "glb" | "mp4" | "webm"): boolean {
  // Handle GLB files
  if (expected === "glb") {
    return mimeType === "model/gltf-binary";
  }

  // For video formats, check base MIME type
  const baseMimeType = mimeType.split(';')[0].trim().toLowerCase();
  
  // MP4 formats
  if (expected === "mp4") {
    return baseMimeType === "video/mp4" || 
           mimeType.startsWith("video/mp4;") ||
           baseMimeType === "video/x-mp4";
  }
  
  // WebM formats 
  if (expected === "webm") {
    return baseMimeType === "video/webm" || 
           mimeType.startsWith("video/webm;");
  }
  
  return false;
}

export function isAllowedMimeType(type: string, expected: "glb" | "mp4" | "webm"): boolean {
  return isExtendedMimeTypeAllowed(type, expected);
}

export function isUnderSizeLimit(fileSize: number): boolean {
  const maxSizeBytes = FILE_VALIDATION.MAX_SIZE_MB * 1024 * 1024;
  return fileSize <= maxSizeBytes;
}

export const getMimeTypeFromExtension = (extension: string): string => {
  const cleanExt = extension.startsWith('.') ? extension.substring(1) : extension;
  return FILE_TYPE_MAPPINGS[cleanExt.toLowerCase()] || 'application/octet-stream';
};

export const getMimeTypeFromFilename = (filename: string): string => {
  const extension = filename.split('.').pop()?.toLowerCase() || '';
  return getMimeTypeFromExtension(extension);
};

export const getExtensionFromFilename = (filename: string): string => {
  return filename.split('.').pop()?.toLowerCase() || '';
};

export const cleanDirectory = async (dirPath: string) => {
  try {
    try {
      await fs.access(dirPath);
    } catch (err) {
      console.log(`Directory ${dirPath} does not exist, skipping cleanup.`);
      return;
    }

    const files = await fs.readdir(dirPath);
    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const stat = await fs.lstat(filePath);
      if (stat.isDirectory()) {
        await cleanDirectory(filePath);
      } else {
        await fs.unlink(filePath);
      }
    }
    await fs.rmdir(dirPath);
    console.log(`Cleaned and removed ${dirPath} directory.`);
  } catch (error) {
    console.error(`Failed to clean directory ${dirPath}:`, error);
  }
};