import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { PrismaClient } from '@prisma/client';

import authRoutes from './routes/auth';
import organizationsRoutes from './routes/organizations';
import usersRoutes from './routes/users';
import dashboardRoutes, { getSharedDashboard } from './routes/dashboard';
import analyticsRoutes from './routes/analytics';
import billingRoutes from './routes/billing';
import notificationsRoutes from './routes/notifications';
import auditRoutes from './routes/audit';
import webhooksRoutes from './routes/webhooks';
import commentsRoutes from './routes/comments';

import { authMiddleware, verifyAuthToken } from './middleware/auth';
import { rateLimiter } from './middleware/rateLimit';
import { startNotificationJob } from './jobs/notifications';
import { startReportJob } from './jobs/reports';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

export const prisma = new PrismaClient();

// Whitelist browser origins instead of origin: '*' (required when credentials: true).
const allowedOrigins = (
  process.env.CORS_ALLOWED_ORIGINS ??
  process.env.FRONTEND_URL ??
  'http://localhost:3000'
)
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

if (process.env.NODE_ENV === 'production' && allowedOrigins.length === 0) {
  throw new Error('CORS_ALLOWED_ORIGINS must be set in production');
}

app.use(cors({
  origin(origin, callback) {
    // Allow non-browser clients (curl, Postman, server-to-server).
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(null, false);
  },
  credentials: true,
}));

app.use(express.json());
app.use(rateLimiter);

// Health check - this is fine, no auth needed
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Public routes
app.use('/api/auth', authRoutes);
app.get('/api/dashboards/shared/:dashboardId', getSharedDashboard);

// Protected routes
app.use('/api/organizations', authMiddleware, organizationsRoutes);
app.use('/api/users', authMiddleware, usersRoutes);
app.use('/api/dashboards', authMiddleware, dashboardRoutes);
app.use('/api/analytics', authMiddleware, analyticsRoutes);
app.use('/api/billing', authMiddleware, billingRoutes);
app.use('/api/notifications', authMiddleware, notificationsRoutes);
app.use('/api/audit', authMiddleware, auditRoutes);
app.use('/api/webhooks', authMiddleware, webhooksRoutes);
app.use('/api/comments', authMiddleware, commentsRoutes);

// WebSocket handling
const wsClients = new Map<string, Set<any>>();

wss.on('connection', async (ws, req) => {
  // Authenticate via JWT; org comes from the token, not a client-supplied ?org= param.
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const token = url.searchParams.get('token');

  if (!token) {
    ws.close(1008, 'Unauthorized');
    return;
  }

  let orgId: string;

  try {
    const user = await verifyAuthToken(token);
    orgId = user.organizationId;
  } catch (error) {
    console.log('WebSocket authentication failed:', error);
    ws.close(1008, 'Unauthorized');
    return;
  }

  if (!wsClients.has(orgId)) {
    wsClients.set(orgId, new Set());
  }
  wsClients.get(orgId)!.add(ws);

  ws.on('close', () => {
    wsClients.get(orgId)?.delete(ws);
  });

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());

      // Ignore client-supplied orgId so messages can't be relayed to other orgs.
      if (message.orgId && message.orgId !== orgId) {
        return;
      }

      wsClients.get(orgId)?.forEach((client) => {
        if (client !== ws && client.readyState === 1) {
          client.send(JSON.stringify(message));
        }
      });
    } catch (error) {
      console.error('WebSocket message parse error:', error);
    }
  });
});

// Broadcast helper for routes to use
export function broadcastToOrg(orgId: string, message: object) {
  if (wsClients.has(orgId)) {
    wsClients.get(orgId)?.forEach(client => {
      if (client.readyState === 1) {
        client.send(JSON.stringify(message));
      }
    });
  }
}

// Global error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message,
    stack: err.stack
  });
});

// Start background jobs
startNotificationJob();
startReportJob();

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export default app;
