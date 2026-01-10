/**
 * Server Entry Point
 * 
 * Starts the Express server
 */

import app from './app';

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📋 Health check: http://localhost:${PORT}/health`);
  console.log(`🔐 Access Request API: http://localhost:${PORT}/api/access-request`);
});

