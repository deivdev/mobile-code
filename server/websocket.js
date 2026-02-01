const WebSocket = require('ws');
const { getSession, writeToSession, resizeSession } = require('./services/pty-manager');

function setupWebSocket(server) {
  const wss = new WebSocket.Server({ server });

  wss.on('connection', (ws) => {
    let attachedSessionId = null;

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());

        switch (message.type) {
          case 'attach':
            attachedSessionId = message.sessionId;
            const session = getSession(attachedSessionId);
            if (session) {
              // Send any buffered output
              if (session.buffer) {
                ws.send(JSON.stringify({
                  type: 'output',
                  sessionId: attachedSessionId,
                  data: session.buffer
                }));
              }
              // Set up output handler for this WebSocket
              session.outputHandler = (output) => {
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({
                    type: 'output',
                    sessionId: attachedSessionId,
                    data: output
                  }));
                }
              };
              // Set up exit handler
              session.exitHandler = (code) => {
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({
                    type: 'exit',
                    sessionId: attachedSessionId,
                    code: code
                  }));
                }
              };
            } else {
              ws.send(JSON.stringify({
                type: 'error',
                sessionId: attachedSessionId,
                message: 'Session not found'
              }));
            }
            break;

          case 'input':
            if (message.sessionId) {
              writeToSession(message.sessionId, message.data);
            }
            break;

          case 'resize':
            if (message.sessionId && message.cols && message.rows) {
              resizeSession(message.sessionId, message.cols, message.rows);
            }
            break;

          case 'detach':
            if (attachedSessionId) {
              const detachSession = getSession(attachedSessionId);
              if (detachSession) {
                detachSession.outputHandler = null;
                detachSession.exitHandler = null;
              }
              attachedSessionId = null;
            }
            break;

          default:
            ws.send(JSON.stringify({
              type: 'error',
              message: `Unknown message type: ${message.type}`
            }));
        }
      } catch (err) {
        ws.send(JSON.stringify({
          type: 'error',
          message: `Invalid message format: ${err.message}`
        }));
      }
    });

    ws.on('close', () => {
      // Clean up handlers on disconnect
      if (attachedSessionId) {
        const session = getSession(attachedSessionId);
        if (session) {
          session.outputHandler = null;
          session.exitHandler = null;
        }
      }
    });

    ws.on('error', (err) => {
      console.error('WebSocket error:', err.message);
    });
  });

  return wss;
}

module.exports = { setupWebSocket };
