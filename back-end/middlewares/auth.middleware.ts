import type { Request, Response, NextFunction } from "express";
import { CredentialService } from '../services/credential-service';
import jwt from 'jsonwebtoken';

const credentialsService = new CredentialService();
const JWT_SECRET = credentialsService.apiKeySecret;

interface AuthDecodedRole {
  _id: string;
  name: string;
  description: string;
  permissions: any[];
  __v?: number;
}
interface AuthDecodedState {
  userId: string;
  roles: AuthDecodedRole[];
  iat: number;
  exp: number;
}

export const authMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  console.log("Auth middleware invoked for path:", req.path);
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    console.error("Auth middleware failed: Missing authorization header");
    res.status(401).json({ error: "Unauthorized: missing authorization header" });
    return;
  }
  const [scheme, token] = authHeader.split(" ");
  if (scheme !== "Bearer" || !token) {
    console.error("Auth middleware failed: Invalid authorization format. Scheme:", scheme);
    res.status(401).json({ error: "Unauthorized: invalid authorization format" });
    return;
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthDecodedState;
    console.log("Auth middleware success: Token verified for user ID:", decoded.userId);
    (req as any).user = { userId: decoded.userId, roles: decoded.roles.map(role => role.name) };
    next();
  } catch (err) {
    console.error("Auth middleware failed: Invalid or expired token.", err);
    res.status(401).json({ error: "Unauthorized: invalid or expired token" });
  }
};
