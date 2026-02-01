const express = require('express');
const http = require('http');
const path = require('path');
const { exec } = require('child_process');
const { setupWebSocket } = require('./websocket');
const reposApi = require('./api/repos');
const sessionsApi = require('./api/sessions');
const settingsApi = require('./api/settings');
const toolsApi = require('./api/tools');
const config = require('./services/config');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

// Initialize config
config.init();

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '../web')));

// API Routes
app.use('/api/repos', reposApi);
app.use('/api/sessions', sessionsApi);
app.use('/api/settings', settingsApi);
app.use('/api/tools', toolsApi);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '0.1.0' });
});

// Setup WebSocket for terminal I/O
setupWebSocket(server);

// Start server - bind to localhost only for security
server.listen(PORT, '127.0.0.1', () => {
  console.log(`
┌─────────────────────────────────────────┐
│         📱 Mobile Code v0.1.0           │
├─────────────────────────────────────────┤
│                                         │
│  Server running at:                     │
│  http://localhost:${PORT.toString().padEnd(5)}                │
│                                         │
│  Open this URL in your browser          │
│                                         │
│  Press Ctrl+C to stop                   │
│                                         │
└─────────────────────────────────────────┘
`);
});

// Graceful shutdown
let isShuttingDown = false;

function shutdown() {
  if (isShuttingDown) {
    console.log('Force exit...');
    process.exit(1);
  }

  isShuttingDown = true;
  console.log('\nShutting down...');

  const { killAllSessions } = require('./services/pty-manager');
  killAllSessions();

  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });

  // Force exit after 3 seconds if graceful shutdown fails
  setTimeout(() => {
    console.log('Force exit (timeout)');
    process.exit(1);
  }, 3000);
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
