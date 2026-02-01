const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

// Try to load node-pty, fall back to child_process
let pty = null;
let usePty = false;

try {
  pty = require('node-pty');
  usePty = true;
  console.log('[pty-manager] Using node-pty');
} catch (e) {
  console.log('[pty-manager] node-pty not available, using child_process fallback');
}

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

  const processEnv = {
    ...process.env,
    ...env,
    TERM: 'xterm-256color',
    COLORTERM: 'truecolor',
    COLUMNS: String(cols),
    LINES: String(rows)
  };

  let proc;
  let session;

  if (usePty) {
    // Use node-pty for full PTY support
    proc = pty.spawn(command, args, {
      name: 'xterm-256color',
      cols: cols,
      rows: rows,
      cwd: cwd,
      env: processEnv
    });

    session = {
      id: id,
      pty: proc,
      pid: proc.pid,
      tool: tool,
      cwd: cwd,
      status: 'running',
      createdAt: new Date().toISOString(),
      buffer: '',
      outputHandler: null,
      exitHandler: null,
      usePty: true
    };

    proc.onData((data) => {
      session.buffer += data;
      if (session.buffer.length > 50000) {
        session.buffer = session.buffer.slice(-50000);
      }
      if (session.outputHandler) {
        session.outputHandler(data);
      }
    });

    proc.onExit(({ exitCode }) => {
      session.status = 'stopped';
      session.exitCode = exitCode;
      if (session.exitHandler) {
        session.exitHandler(exitCode);
      }
    });

  } else {
    // Fallback: use child_process with script command for PTY-like behavior
    // On Unix, 'script' command provides a pseudo-terminal
    const isTermux = process.env.PREFIX && process.env.PREFIX.includes('com.termux');

    if (os.platform() !== 'win32') {
      // Use script -q for pseudo-PTY on Unix/Termux
      proc = spawn('script', ['-q', '-c', `${command} ${args.join(' ')}`, '/dev/null'], {
        cwd: cwd,
        env: processEnv,
        stdio: ['pipe', 'pipe', 'pipe']
      });
    } else {
      // Windows fallback - direct spawn
      proc = spawn(command, args, {
        cwd: cwd,
        env: processEnv,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: true
      });
    }

    session = {
      id: id,
      pty: proc,
      pid: proc.pid,
      tool: tool,
      cwd: cwd,
      status: 'running',
      createdAt: new Date().toISOString(),
      buffer: '',
      outputHandler: null,
      exitHandler: null,
      usePty: false
    };

    // Handle stdout
    proc.stdout.on('data', (data) => {
      const str = data.toString();
      session.buffer += str;
      if (session.buffer.length > 50000) {
        session.buffer = session.buffer.slice(-50000);
      }
      if (session.outputHandler) {
        session.outputHandler(str);
      }
    });

    // Handle stderr
    proc.stderr.on('data', (data) => {
      const str = data.toString();
      session.buffer += str;
      if (session.buffer.length > 50000) {
        session.buffer = session.buffer.slice(-50000);
      }
      if (session.outputHandler) {
        session.outputHandler(str);
      }
    });

    // Handle exit
    proc.on('exit', (exitCode) => {
      session.status = 'stopped';
      session.exitCode = exitCode;
      if (session.exitHandler) {
        session.exitHandler(exitCode);
      }
    });

    proc.on('error', (err) => {
      console.error('[pty-manager] Process error:', err.message);
      session.status = 'stopped';
      session.exitCode = 1;
      if (session.exitHandler) {
        session.exitHandler(1);
      }
    });
  }

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
    if (session.usePty) {
      session.pty.write(data);
    } else {
      session.pty.stdin.write(data);
    }
    return true;
  }
  return false;
}

function resizeSession(id, cols, rows) {
  const session = sessions.get(id);
  if (session && session.pty && session.status === 'running') {
    if (session.usePty) {
      session.pty.resize(cols, rows);
    }
    // For fallback mode, resize is not supported but we don't error
    return true;
  }
  return false;
}

function killSession(id) {
  const session = sessions.get(id);
  if (session) {
    if (session.pty && session.status === 'running') {
      if (session.usePty) {
        session.pty.kill();
      } else {
        session.pty.kill('SIGTERM');
      }
    }
    sessions.delete(id);
    return true;
  }
  return false;
}

function killAllSessions() {
  sessions.forEach((session) => {
    if (session.pty && session.status === 'running') {
      if (session.usePty) {
        session.pty.kill();
      } else {
        session.pty.kill('SIGTERM');
      }
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
