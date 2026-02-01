const { execSync } = require('child_process');

// Define available tools with their commands and install instructions
const TOOLS = {
  'claude-code': {
    command: 'claude',
    name: 'Claude Code',
    installCmd: 'npm install -g @anthropic-ai/claude-code',
    description: 'Anthropic\'s AI coding assistant'
  },
  'opencode': {
    command: 'opencode',
    name: 'OpenCode',
    installCmd: 'npm install -g opencode',
    description: 'Open-source AI coding assistant'
  },
  'codex': {
    command: 'codex',
    name: 'Codex',
    installCmd: 'npm install -g @openai/codex',
    description: 'OpenAI Codex CLI'
  },
  'shell': {
    command: null, // Always available
    name: 'Bash Shell',
    installCmd: null,
    description: 'Standard terminal shell'
  }
};

// Cache for tool availability (refreshed on each call but memoized for the request)
let toolCache = null;
let cacheTime = 0;
const CACHE_TTL = 30000; // 30 seconds

function commandExists(cmd) {
  try {
    execSync(`which ${cmd}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
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
      installCmd: tool.installCmd
    };

    if (tool.command === null) {
      // Shell is always available
      info.available = true;
      available.push(info);
    } else if (commandExists(tool.command)) {
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

module.exports = {
  detectTools,
  getDefaultTool,
  isToolAvailable,
  getToolInfo,
  TOOLS
};
