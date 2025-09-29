import ffmpeg from "fluent-ffmpeg";
import * as path from "path";

const STANDARD_WIDTH = 1080;
const REKOGNITION_WIDTH = 512; // or 480P as recommended by Rekognition
const REKOGNITION_FPS = 30;
const REKOGNITION_MIN_BITRATE = "1.5M";
const REKOGNITION_TARGET_BITRATE = "3M";

const DEFAULT_OUTPUT_OPTS = [
  // Resolution scaling
  "-vf",
  `scale=${STANDARD_WIDTH}:trunc(ow/a/2)*2`,

  // Video codec settings
  "-c:v",
  "libx264",
  "-profile:v",
  "baseline",
  "-level",
  "3.0",
  "-pix_fmt",
  "yuv420p",

  // Encoding efficiency
  "-preset",
  "fast",
  "-crf",
  "23",

  // Playback optimization
  "-g",
  "30",
  "-keyint_min",
  "15",
  "-sc_threshold",
  "0",

  // Browser streaming optimization
  "-movflags",
  "+faststart",
  "-r",
  "30",

  // Audio settings
  "-c:a",
  "aac",
  "-b:a",
  "128k",

  // Improve seeking in browser
  "-vsync",
  "vfr",
  "-threads",
  "0",

  // Fix potential playback issues
  "-avoid_negative_ts",
  "1",
  "-video_track_timescale",
  "30000",

  // Optimization
  "-threads", "2"
];

type FilePath = string;

const getFormatSpecificOptions = (
  format: string,
  videoCodec: string
): string[] => {
  const options: string[] = ["-fflags", "+genpts"];

  if (
    format.includes("mp4") ||
    format.includes("mov") ||
    format.includes("m4v")
  ) {
    options.push("-ignore_editlist", "1");
  }

  if (videoCodec === "h264" || videoCodec === "h265") {
    options.push("-vsync", "0");
  }

  options.push("-avoid_negative_ts", "1");

  return options;
};

const executeFFmpeg = (
  input: string,
  output: string,
  inOpts: string[],
  outOpts: string[],
  onSuccess: () => void,
  onError: (err: Error) => void,
) => {
  ffmpeg(input)
    .inputOptions(inOpts)
    .outputOptions(outOpts)
    .output(output)
    .on("progress", (progress) => {
      if (progress.percent) {
        console.log(
          `[MediaStandardizer] Video processing: ${Math.round(
            progress.percent
          )}%`
        );
      }
    })
    .on("end", onSuccess)
    .on("error", onError)
    .run();
};

/**
 * Standardizes media files (images and videos) to a consistent resolution
 * Images: Resized to 1K resolution
 * Videos: Resized to 1K resolution and compressed
 */
export class MediaStandardizer {
  /**
   * Standardize a video to 1K resolution and compress it
   * @param inputPath Path to the input video
   * @param outputPath Path where the standardized video will be saved
   * @returns Promise that resolves when standardization is complete
   */
  static standardizeVideo(
    inputPath: FilePath,
    outputPath: FilePath,
    customOutputOpts?: string[]
  ): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      try {
        // Force output extension to be .mp4
        const outputDir = path.dirname(outputPath);
        const outputBaseName = path.basename(
          outputPath,
          path.extname(outputPath)
        );
        const finalOutputPath = path.join(outputDir, `${outputBaseName}.mp4`);

        console.log(
          `[MediaStandardizer] Analyzing video metadata: ${inputPath}`
        );

        ffmpeg.ffprobe(inputPath, (err, metadata) => {
          if (err) {
            console.error(
              `[MediaStandardizer] Error analyzing video: ${err.message}`
            );
            reject(err);
            return;
          }

          // Extract and log video codec information
          const videoStream = metadata.streams.find(
            (stream) => stream.codec_type === "video"
          );

          console.log(`[MediaStandardizer] Original video format:`);
          console.log(
            `- Container: ${metadata.format.format_name || "unknown"}`
          );
          console.log(`- Duration: ${metadata.format.duration || "unknown"}s`);
          console.log(
            `- Size: ${
              metadata.format.size
                ? (metadata.format.size / 1024 / 1024).toFixed(2) + " MB"
                : "unknown"
            }`
          );
          console.log(
            `- Bitrate: ${
              metadata.format.bit_rate
                ? (metadata.format.bit_rate / 1000).toFixed(0) + " kbps"
                : "unknown"
            }`
          );

          if (videoStream) {
            console.log(
              `- Video codec: ${videoStream.codec_name || "unknown"} (${
                videoStream.codec_long_name || ""
              })`
            );
            console.log(
              `- Resolution: [w]${videoStream.width || "?"}:[h]${
                videoStream.height || "?"
              }`
            );
            console.log(`- FPS: ${videoStream.r_frame_rate || "unknown"}`);
            console.log(`- Pixel format: ${videoStream.pix_fmt || "unknown"}`);
          }

          console.log(
            `[MediaStandardizer] Converting to standard MP4 (H264)...`
          );

          const formatName = metadata.format.format_name || "";
          const videoCodec = videoStream?.codec_name || "";

          const inputOpts = getFormatSpecificOptions(formatName, videoCodec);

          const outputOpts: string[] = customOutputOpts ?? DEFAULT_OUTPUT_OPTS;

          executeFFmpeg(
            inputPath,
            finalOutputPath,
            inputOpts,
            outputOpts,
            () => {
              console.log(
                `[MediaStandardizer] Video standardized and converted to MP4: ${finalOutputPath}`
              );
              resolve(finalOutputPath);
            },
            (err: Error) => {
              console.error(
                `[MediaStandardizer] Error standardizing video ${inputPath}:`,
                err
              );
              reject(err);
            }
          );
        });
      } catch (error) {
        console.error(
          `[MediaStandardizer] Error setting up video standardization for ${inputPath}:`,
          error
        );
        reject(error);
      }
    });
  }

  static async isConversionForModerationNeeded(inputPath: string): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      try {
        console.log(`[MediaStandardizer] Analyzing video for conversion requirements: ${inputPath}`);
        
        ffmpeg.ffprobe(inputPath, (err, metadata) => {
          if (err) {
            console.error(`[MediaStandardizer] Error analyzing video: ${err.message}`);
            resolve(true);
            return;
          }
          
          const videoStream = metadata.streams.find(
            (stream) => stream.codec_type === "video"
          );
          
          if (!videoStream) {
            console.error('[MediaStandardizer] No video stream found in file');
            resolve(true);
            return;
          }
          
          const codec = videoStream.codec_name || '';
          const width = videoStream.width || 0;
          const height = videoStream.height || 0;
          
          let fps = 0;
          if (videoStream.r_frame_rate) {
            const fpsMatch = videoStream.r_frame_rate.split('/');
            fps = Math.round(parseInt(fpsMatch[0]) / parseInt(fpsMatch[1]));
          }
          
          // Extract bitrate
          let bitrate = 0;
          if (videoStream.bit_rate) {
            bitrate = parseInt(videoStream.bit_rate) / 1000000; 
          } else if (metadata.format.bit_rate) {
            // Fall back to format bitrate if stream bitrate is unavailable
            bitrate = metadata.format.bit_rate / 1000000; 
          }
          
          // Check if format meets Rekognition requirements
          const isH264 = codec === 'h264';
          const isResolutionGood = width >= REKOGNITION_WIDTH;
          const isFpsGood = fps >= 24;
          const isBitrateGood = bitrate >= 1.5;
          
          console.log(
            `[MediaStandardizer] Video analysis results:` +
            `\n- Codec: ${codec} (${isH264 ? 'compatible' : 'needs conversion'})` +
            `\n- Resolution: ${width}x${height} (${isResolutionGood ? 'sufficient' : 'too low'})` +
            `\n- FPS: ${fps} (${isFpsGood ? 'optimal' : 'suboptimal'})` +
            `\n- Bitrate: ${bitrate.toFixed(1)}Mbps (${isBitrateGood ? 'sufficient' : 'too low'})`
          );
          
          // Conversion needed if any requirement is not met
          const conversionNeeded = !(isH264 /* && isResolutionGood && isFpsGood  && isBitrateGood */);
          console.log(`[MediaStandardizer] Conversion ${conversionNeeded ? 'needed' : 'not needed'}`);
          
          resolve(conversionNeeded);
        });
      } catch (error) {
        console.error('[MediaStandardizer] Error checking video format:', error);
        resolve(true);
      }
    });
  }

  static async createModerationVersion(
    inputPath: string,
    outputPath: string
  ): Promise<FilePath> {
    const moderationOutputOpts = [
      "-vf",
      `scale=${REKOGNITION_WIDTH}:trunc(ow/a/2)*2,fps=${REKOGNITION_FPS}`,
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-threads", 
      "2",
      "-b:v",
      REKOGNITION_TARGET_BITRATE,
      "-minrate",
      REKOGNITION_MIN_BITRATE,
      "-maxrate",
      "4M",
      "-bufsize",
      "5M",
      "-pix_fmt",
      "yuv420p",
      "-profile:v",
      "main",
      "-movflags",
      "+faststart",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
    ];

    console.log("[MediaStandardizer] Creating AWS Rekognition optimized video");
    console.log(`[MediaStandardizer] → Resolution: ${REKOGNITION_WIDTH}`);
    console.log(`[MediaStandardizer] → Frame rate: ${REKOGNITION_FPS} fps`);
    console.log(
      `[MediaStandardizer] → Target bitrate: ${REKOGNITION_TARGET_BITRATE}`
    );
    console.log(`[MediaStandardizer] → Audio: Preserved (AAC 128k)`);

    return this.standardizeVideo(inputPath, outputPath, moderationOutputOpts);
  }
}

export default MediaStandardizer;
