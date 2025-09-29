import { Router, Request, Response } from "express";
import { VideoAnalyzerController } from "../controllers/video-analyzer.controller";
import { VideoAnalysisService } from "../services/video-analyzer.service";
import { secretMiddleware } from "../middlewares/secret.middleware";
import type { CredentialService } from '../services/credential-service';
import {
  checkS3Connectivity,
  checkRekognitionConnectivity,
  checkTranscribeConnectivity,
  checkComprehendConnectivity,
} from "../factory/aws-connectivity-factory";
import { S3StorageService } from "../services/s3-service";

export const VideoAnalyzerRoutes = (credentialService: CredentialService) => {
  const s3Service = new S3StorageService(credentialService);
  const videoAnalysisService = new VideoAnalysisService(credentialService, s3Service);
  const videoAnalyzerController = new VideoAnalyzerController(videoAnalysisService);
  const router = Router();

  router.post("/signed-url", secretMiddleware, async (req: Request, res: Response) => {
    await videoAnalyzerController.generateSignedUrl(req, res);
  });

  router.delete("/file/:fileKey", secretMiddleware, async (req: Request, res: Response) => {
    await videoAnalyzerController.deleteFile(req, res);
  });

  router.post("/analyze", secretMiddleware, async (req: Request, res: Response) => {
    await videoAnalyzerController.analyzeVideo(req, res);
  });

  router.get("/status", async (_req: Request, res: Response) => {
    const s3Client = await checkS3Connectivity();
    const rekognition = await checkRekognitionConnectivity();
    const transcribe = await checkTranscribeConnectivity();
    const comprehend = await checkComprehendConnectivity();
    return res.status(200).json({ s3Client, rekognition, transcribe, comprehend });
  });

  router.get("/analyze/status/:id", secretMiddleware, async (req: Request, res: Response) => {
    await videoAnalyzerController.checkModerationProgress(req, res);
  });

  return router;
};

export default VideoAnalyzerRoutes;
