import type { Request, Response, NextFunction } from "express";
import { VideoAnalysisService } from "../services/video-analyzer.service";
export class VideoAnalyzerController {
  private videoAnalysisService: VideoAnalysisService;

  constructor(
    videoAnalysisService: VideoAnalysisService,
  ) {
    this.videoAnalysisService = videoAnalysisService;
  }

  public async generateSignedUrl(req: Request, res: Response): Promise<Response> {
    try {
      const { fileKey, contentType, fileSize } = req.body;
      if (!fileKey || !contentType || !fileSize) {
        return res.status(400).json({ error: "Missing fileKey, contentType, or fileSize in request" });
      }

      const signedUrl = await this.videoAnalysisService.generateSignedUrl(fileKey, contentType, fileSize);
      return res.status(200).json({ signedUrl });
    } catch (error: any) {
      console.error("Error generating signed URL:", error);
      return res.status(500).json({ error: error.message });
    }
  }

  public async deleteFile(req: Request, res: Response): Promise<Response> {
    try {
      const { fileKey } = req.params;
      if (!fileKey) {
        return res.status(400).json({ error: "Missing fileKey in request" });
      }

      await this.videoAnalysisService.deleteFile(fileKey);
      return res.status(204).send();
    } catch (error: any) {
      console.error("Error deleting file:", error);
      return res.status(500).json({ error: error.message });
    }
  }

  public async analyzeVideo(req: Request, res: Response): Promise<Response> {
    try {
      // Expecting a JSON body with a "fileKey" property
      const { fileKey } = req.body;
      if (!fileKey) {
        return res.status(400).json({ error: "Missing fileKey in request" });
      }
      
      // Analyze the moderated video
      const analysisResult = await this.videoAnalysisService.analyzeVideo(fileKey);
      
      return res.status(200).json(analysisResult);
    } catch (error: any) {
      console.error("Error analyzing video:", error);
      return res.status(500).json({ error: error.message });
    }
  }

  public async checkModerationProgress(req: Request, res: Response): Promise<Response> {
    try {
      const jobId = req.params.id;

      if (!jobId) {
        return res.status(400).json({ error: "Missing moderation job id in request" });
      }

      const result = await this.videoAnalysisService.checkModerationProgress(jobId);
      return res.status(200).json(result);
    } catch (error: any) {
      console.error("Error checking moderation progress:", error);
      if (error.message === "Job not found for moderation") {
        return res.status(404).json({ error: error.message });
      }
      return res.status(500).json({ error: error.message });
    }
  }
}
