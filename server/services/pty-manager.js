const pty = require('node-pty');
const os = require('os');
const path = require('path');

// Store active sessions
const sessions = new Map();

// Default shell
const defaultShell = process.env.SHELL || (os.platform() === 'win32' ? 'powershell.exe' : 'bash');

function createSession(id, options = {}) {
  const {
    cwd = os.homedir(),
    tool = null,
    cols = 80,
    rows = 24,
    env = {}
  } = options;

  // Determine command to run
  let command = defaultShell;
  let args = [];

  if (tool) {
    switch (tool) {
      case 'claude-code':
        command = 'claude';
        args = [];
        break;
      case 'opencode':
        command = 'opencode';
        args = [];
        break;
      case 'codex':
        command = 'codex';
        args = [];
        break;
      default:
        // Default to shell
        command = defaultShell;
        args = [];
    }
  }

  // Create PTY process
  const ptyProcess = pty.spawn(command, args, {
    name: 'xterm-256color',
    cols: cols,
    rows: rows,
    cwd: cwd,
    env: {
      ...process.env,
      ...env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor'
    }
  });

  // Create session object
  const session = {
    id: id,
    pty: ptyProcess,
    pid: ptyProcess.pid,
    tool: tool,
    cwd: cwd,
    status: 'running',
    createdAt: new Date().toISOString(),
    buffer: '',
    outputHandler: null,
    exitHandler: null
  };

  // Handle PTY data
  ptyProcess.onData((data) => {
    // Buffer output for reconnection
    session.buffer += data;
    // Keep buffer size reasonable (last 50KB)
    if (session.buffer.length > 50000) {
      session.buffer = session.buffer.slice(-50000);
    }
    // Send to attached WebSocket
    if (session.outputHandler) {
      session.outputHandler(data);
    }
  });

  // Handle PTY exit
  ptyProcess.onExit(({ exitCode }) => {
    session.status = 'stopped';
    session.exitCode = exitCode;
    if (session.exitHandler) {
      session.exitHandler(exitCode);
    }
  });

  sessions.set(id, session);
  return session;
}

function getSession(id) {
  return sessions.get(id);
}

function getAllSessions() {
  const result = [];
  sessions.forEach((session, id) => {
    result.push({
      id: session.id,
      pid: session.pid,
      tool: session.tool,
      cwd: session.cwd,
      status: session.status,
      createdAt: session.createdAt,
      exitCode: session.exitCode
    });
  });
  return result;
}

function writeToSession(id, data) {
  const session = sessions.get(id);
  if (session && session.pty && session.status === 'running') {
    session.pty.write(data);
    return true;
  }
  return false;
}

function resizeSession(id, cols, rows) {
  const session = sessions.get(id);
  if (session && session.pty && session.status === 'running') {
    session.pty.resize(cols, rows);
    return true;
  }
  return false;
}

function killSession(id) {
  const session = sessions.get(id);
  if (session) {
    if (session.pty && session.status === 'running') {
      session.pty.kill();
    }
    sessions.delete(id);
    return true;
  }
  return false;
}

function killAllSessions() {
  sessions.forEach((session) => {
    if (session.pty && session.status === 'running') {
      session.pty.kill();
    }
  });
  sessions.clear();
}

module.exports = {
  createSession,
  getSession,
  getAllSessions,
  writeToSession,
  resizeSession,
  killSession,
  killAllSessions
};
