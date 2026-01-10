/**
 * Express Application Configuration
 * 
 * Sets up middleware, routes, and error handling
 */

import express from 'express';
import cors from 'cors';
import accessRequestRoutes from './routes/accessRequest.routes';
import escalationRoutes from './routes/escalation.routes';
import requestStateRoutes from './routes/requestState.routes';
import approvalRoutes from './routes/approval.routes';

const app = express();

// Middleware
app.use(cors({
  origin: 'http://localhost:3000', // Frontend dev server
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/access-request', accessRequestRoutes);
app.use('/api/escalation', escalationRoutes);
app.use('/api/request-state', requestStateRoutes);
app.use('/api/approvals', approvalRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Route not found'
  });
});

// Error handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

export default app;

