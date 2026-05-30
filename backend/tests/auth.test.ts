import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import express from 'express';
import type { AddressInfo } from 'net';

const mockPrisma: any = {
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn()
  },
  session: {
    create: jest.fn(),
    deleteMany: jest.fn()
  },
  organization: {
    create: jest.fn(),
    findUnique: jest.fn()
  },
  auditLog: {
    create: jest.fn()
  }
};

jest.mock('../src/index', () => ({
  prisma: mockPrisma
}));

jest.mock('../src/utils/encryption', () => ({
  hashPassword: jest.fn(() => 'hashed_password'),
  verifyPassword: jest.fn(() => true),
  generateToken: jest.fn(() => 'random_token')
}));

jest.mock('../src/middleware/auth', () => ({
  ...jest.requireActual('../src/middleware/auth'),
  generateToken: jest.fn(() => 'jwt_token')
}));

// Disable rate limiting so repeated requests across tests stay deterministic.
jest.mock('../src/middleware/rateLimit', () => ({
  authRateLimiter: (_req: any, _res: any, next: any) => next(),
  rateLimiter: (_req: any, _res: any, next: any) => next()
}));

import authRouter from '../src/routes/auth';

const app = express();
app.use(express.json());
app.use('/api/auth', authRouter);

let server: ReturnType<typeof app.listen>;
let baseUrl: string;

beforeAll(() => {
  server = app.listen(0);
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

async function call(
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {}
) {
  const res = await (globalThis as any).fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: res.status, body: await res.json() };
}

describe('Auth Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /login', () => {
    it('should return a token and user for valid credentials', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
        passwordHash: 'hashed_password',
        isActive: true,
        role: 'member',
        organizationId: 'org-1',
        organization: { id: 'org-1', name: 'Test Org', slug: 'test-org', tier: 'pro' }
      });
      mockPrisma.user.update.mockResolvedValue({});
      mockPrisma.session.create.mockResolvedValue({});

      const { status, body } = await call('POST', '/api/auth/login', {
        email: 'test@example.com',
        password: 'password'
      });

      expect(status).toBe(200);
      expect(body.token).toBe('jwt_token');
      expect(body.user.email).toBe('test@example.com');
      expect(body.user.organization.tier).toBe('pro');
      expect(mockPrisma.session.create).toHaveBeenCalled();
    });

    it('should reject invalid credentials with a 401', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const { status, body } = await call('POST', '/api/auth/login', {
        email: 'missing@example.com',
        password: 'password'
      });

      expect(status).toBe(401);
      expect(body.error).toBe('Invalid credentials');
    });

    it('should reject a malformed email with a 400 from validation', async () => {
      const { status } = await call('POST', '/api/auth/login', {
        email: 'not-an-email',
        password: 'password'
      });

      expect(status).toBe(400);
      expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('POST /register', () => {
    it('should register a new user and create an organization', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.organization.findUnique.mockResolvedValue(null);
      mockPrisma.organization.create.mockResolvedValue({
        id: 'org-1',
        name: 'New Org',
        slug: 'new-org',
        tier: 'free'
      });
      mockPrisma.user.create.mockResolvedValue({
        id: 'user-1',
        email: 'new@example.com',
        name: 'New User',
        role: 'owner',
        organizationId: 'org-1'
      });
      mockPrisma.auditLog.create.mockResolvedValue({});

      const { status, body } = await call('POST', '/api/auth/register', {
        email: 'new@example.com',
        password: 'password123',
        name: 'New User',
        organizationName: 'New Org'
      });

      expect(status).toBe(201);
      expect(body.token).toBe('jwt_token');
      expect(body.user.email).toBe('new@example.com');
      expect(body.organization.slug).toBe('new-org');
    });

    it('should reject a duplicate email with a 400', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'taken@example.com' });

      const { status, body } = await call('POST', '/api/auth/register', {
        email: 'taken@example.com',
        password: 'password123',
        name: 'Existing',
        organizationName: 'Org'
      });

      expect(status).toBe(400);
      expect(body.error).toBe('Email already registered');
      expect(mockPrisma.user.create).not.toHaveBeenCalled();
    });
  });

  describe('GET /verify', () => {
    it('should return 401 when no authorization header is present', async () => {
      const { status, body } = await call('GET', '/api/auth/verify');

      expect(status).toBe(401);
      expect(body.valid).toBe(false);
    });

    it('should confirm a token for an active user', async () => {
      const jwt = jest.requireActual('jsonwebtoken') as typeof import('jsonwebtoken');
      const token = jwt.sign({ userId: 'user-1' }, 'test-secret');

      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
        role: 'member',
        isActive: true
      });

      const { status, body } = await call('GET', '/api/auth/verify', undefined, {
        Authorization: `Bearer ${token}`
      });

      expect(status).toBe(200);
      expect(body.valid).toBe(true);
      expect(body.user.id).toBe('user-1');
    });
  });

  describe('POST /logout', () => {
    it('should delete the session for the provided token', async () => {
      mockPrisma.session.deleteMany.mockResolvedValue({ count: 1 });

      const { status, body } = await call('POST', '/api/auth/logout', {}, {
        Authorization: 'Bearer session-token'
      });

      expect(status).toBe(200);
      expect(body.message).toBe('Logged out successfully');
      expect(mockPrisma.session.deleteMany).toHaveBeenCalledWith({
        where: { token: 'session-token' }
      });
    });
  });

  describe('Token verification', () => {
    it('should reject an expired token', async () => {
      const { verifyAuthToken } = require('../src/middleware/auth');
      const jwt = jest.requireActual('jsonwebtoken') as typeof import('jsonwebtoken');
      const secret = process.env.JWT_SECRET || 'super-secret-key-change-in-production';
      const expiredToken = jwt.sign({ userId: 'user-1' }, secret, { expiresIn: -1 });

      await expect(verifyAuthToken(expiredToken)).rejects.toThrow('Invalid or expired token');
    });
  });
});
