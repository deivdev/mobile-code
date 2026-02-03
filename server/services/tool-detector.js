const { execSync } = require('child_process');

// Check if running in Termux
const isTermux = !!process.env.TERMUX_VERSION;

// Define available tools with their commands and install instructions
const TOOLS = {
  'claude-code': {
    command: 'claude',
    name: 'Claude Code',
    installCmd: 'npm install -g @anthropic-ai/claude-code',
    description: 'Anthropic\'s AI coding assistant',
    requiresProot: false
  },
  'opencode': {
    command: 'opencode',
    name: 'OpenCode',
    installCmd: 'npm install -g opencode-ai',
    description: 'Open-source AI coding assistant',
    requiresProot: true // Requires proot-distro Ubuntu on Termux
  },
  'codex': {
    command: 'codex',
    name: 'Codex',
    installCmd: 'npm install -g @openai/codex',
    description: 'OpenAI Codex CLI',
    requiresProot: true // Requires proot-distro Ubuntu on Termux
  },
  'shell': {
    command: null, // Always available
    name: 'Bash Shell',
    installCmd: null,
    description: 'Standard terminal shell',
    requiresProot: false
  }
};

// Cache for tool availability (refreshed on each call but memoized for the request)
let toolCache = null;
let cacheTime = 0;
const CACHE_TTL = 30000; // 30 seconds

// Check if proot-distro is installed
function isProotDistroInstalled() {
  try {
    execSync('which proot-distro', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// Check if Ubuntu is installed in proot-distro
function isUbuntuInstalled() {
  if (!isProotDistroInstalled()) {
    return false;
  }
  try {
    // Try to actually login to ubuntu - most reliable check
    execSync('proot-distro login ubuntu -- echo ok', { stdio: 'ignore', timeout: 10000 });
    return true;
  } catch {
    return false;
  }
}

// Check if a command exists inside proot-distro Ubuntu
function commandExistsInProot(cmd) {
  if (!isProotDistroInstalled() || !isUbuntuInstalled()) {
    return false;
  }

  try {
    execSync(`proot-distro login ubuntu -- which ${cmd}`, { stdio: 'ignore', timeout: 10000 });
    return true;
  } catch {
    return false;
  }
}

function commandExists(cmd, requiresProot = false) {
  // Validate command name to prevent injection (extra safety layer)
  if (!/^[a-zA-Z0-9_-]+$/.test(cmd)) {
    return false;
  }

  // If tool requires proot and we're on Termux, check inside proot-distro
  if (requiresProot && isTermux) {
    return commandExistsInProot(cmd);
  }

  const isWindows = process.platform === 'win32';
  const whichCmd = isWindows ? 'where' : 'which';

  try {
    // First check if command is in PATH
    execSync(`${whichCmd} ${cmd}`, { stdio: 'ignore' });

    // Then verify it's actually executable by running --help or --version
    // This catches binary format incompatibilities (e.g., wrong architecture on Termux)
    // We need to capture stderr to detect binary errors
    const execOptions = {
      timeout: 5000,
      killSignal: 'SIGKILL',
      encoding: 'utf8',
      stdio: ['ignore', 'ignore', 'pipe'] // Capture stderr
    };

    const isBinaryError = (err) => {
      const errorText = ((err.stderr && err.stderr.toString()) || '') + (err.message || '');
      return errorText.includes('Exec format error') ||
             errorText.includes('cannot execute') ||
             errorText.includes('e_type') ||
             errorText.includes('Bad CPU type') ||
             errorText.includes('not executable');
    };

    // Try --version first (most tools support it), then --help
    for (const flag of ['--version', '--help']) {
      try {
        execSync(`${cmd} ${flag}`, execOptions);
        return true; // Success - command exists and runs
      } catch (err) {
        if (isBinaryError(err)) {
          return false; // Binary incompatible with this architecture
        }
        // Non-zero exit is okay, try next flag
      }
    }

    // Both flags failed but not with binary errors - command likely exists
    // (some tools require subcommands and fail on --help/--version)
    return true;
  } catch {
    return false; // Command not in PATH
  }
}

function detectTools() {
  const now = Date.now();

  // Return cached result if fresh
  if (toolCache && (now - cacheTime) < CACHE_TTL) {
    return toolCache;
  }

  const available = [];
  const unavailable = [];

  for (const [id, tool] of Object.entries(TOOLS)) {
    const info = {
      id,
      name: tool.name,
      description: tool.description,
      installCmd: tool.installCmd,
      requiresProot: tool.requiresProot && isTermux
    };

    if (tool.command === null) {
      // Shell is always available
      info.available = true;
      available.push(info);
    } else if (commandExists(tool.command, tool.requiresProot)) {
      info.available = true;
      available.push(info);
    } else {
      info.available = false;
      unavailable.push(info);
    }
  }

  toolCache = { available, unavailable };
  cacheTime = now;

  return toolCache;
}

function getDefaultTool() {
  const { available } = detectTools();
  // Prefer claude-code, then opencode, then codex, then shell
  const priority = ['claude-code', 'opencode', 'codex', 'shell'];

  for (const id of priority) {
    if (available.find(t => t.id === id)) {
      return id;
    }
  }

  return 'shell';
}

function isToolAvailable(toolId) {
  if (!toolId || toolId === 'shell') return true;
  const { available } = detectTools();
  return available.some(t => t.id === toolId);
}

function getToolInfo(toolId) {
  return TOOLS[toolId] || null;
}

function clearCache() {
  toolCache = null;
  cacheTime = 0;
}

module.exports = {
  detectTools,
  getDefaultTool,
  isToolAvailable,
  getToolInfo,
  clearCache,
  isProotDistroInstalled,
  isUbuntuInstalled,
  isTermux,
  TOOLS
};
