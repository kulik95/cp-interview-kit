import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../index';

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-change-in-production';

export interface AuthenticatedUser {
  id: string;
  email: string;
  organizationId: string;
  role: string;
}

export interface AuthRequest extends Request {
  user?: AuthenticatedUser;
}

// Shared JWT verification for HTTP auth and WebSocket connections.
export async function verifyAuthToken(token: string): Promise<AuthenticatedUser> {
  let decoded: jwt.JwtPayload & { userId: string };

  try {
    decoded = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload & { userId: string };
  } catch {
    throw new Error('Invalid or expired token');
  }

  const user = await prisma.user.findUnique({
    where: { id: decoded.userId }
  });

  if (!user) {
    throw new Error('User not found');
  }

  if (!user.isActive) {
    throw new Error('User is deactivated');
  }

  return {
    id: user.id,
    email: user.email,
    organizationId: user.organizationId,
    role: user.role
  };
}

export const authMiddleware = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ error: 'No authorization header' });
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    try {
      req.user = await verifyAuthToken(token);
      next();
    } catch (jwtError) {
      console.log('JWT verification failed:', jwtError);
      // Reject invalid tokens instead of calling next() without req.user.
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(500).json({ error: 'Authentication error' });
  }
};

export const requireRole = (roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
};

export const requireOwnerOrAdmin = requireRole(['owner', 'admin']);
export const requireOwner = requireRole(['owner']);

export const generateToken = (userId: string, email: string, organizationId: string, role: string) => {
  return jwt.sign(
    { userId, email, organizationId, role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
};

export const apiKeyMiddleware = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const apiKey = req.headers['x-api-key'] as string;

  if (!apiKey) {
    return res.status(401).json({ error: 'API key required' });
  }

  try {
    const keyRecord = await prisma.apiKey.findFirst({
      where: {
        key: apiKey,
        isActive: true
      },
      include: {
        organization: true,
        createdBy: true
      }
    });

    if (!keyRecord) {
      return res.status(401).json({ error: 'Invalid API key' });
    }

    if (keyRecord.expiresAt && keyRecord.expiresAt < new Date()) {
      return res.status(401).json({ error: 'API key expired' });
    }

    prisma.apiKey.update({
      where: { id: keyRecord.id },
      data: { lastUsedAt: new Date() }
    });

    req.user = {
      id: keyRecord.createdBy.id,
      email: keyRecord.createdBy.email,
      organizationId: keyRecord.organizationId,
      role: 'api'
    };

    // Log org only — never log the full API key value.
    console.log(`API key used for org ${keyRecord.organizationId}`);

    next();
  } catch (error) {
    console.error('API key verification error:', error);
    return res.status(500).json({ error: 'Authentication error' });
  }
};
