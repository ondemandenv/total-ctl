import type { Request, Response, NextFunction } from 'express';
import { CredentialService } from '../services/credential-service';

const credentialsService = new CredentialService();

export const secretMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    res.status(401).json({ error: 'Unauthorized: missing authorization header' });
    return;
  }

  if (authHeader !== credentialsService.apiKeySecret) {
    res.status(401).json({ error: 'Unauthorized: invalid authorization header' });
    return;
  }

  next();
};