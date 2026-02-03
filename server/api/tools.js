const express = require('express');
const router = express.Router();
const { spawn } = require('child_process');
const toolDetector = require('../services/tool-detector');

// Track active installations
const activeInstalls = new Map();

// Helper to run a command and stream output
function runCommand(cmd, args, sendEvent) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, {
      env: { ...process.env, FORCE_COLOR: '0' },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    proc.stdout.on('data', (data) => {
      sendEvent('output', data.toString());
    });

    proc.stderr.on('data', (data) => {
      sendEvent('output', data.toString());
    });

    proc.on('error', (err) => {
      reject(err);
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command exited with code ${code}`));
      }
    });
  });
}

// Install proot-distro and Ubuntu for tools that require it
async function setupProotDistro(sendEvent) {
  // Check and install proot-distro
  if (!toolDetector.isProotDistroInstalled()) {
    sendEvent('output', '\n📦 Installing proot-distro...\n');
    await runCommand('pkg', ['install', '-y', 'proot-distro'], sendEvent);
    sendEvent('output', '✓ proot-distro installed\n');
  } else {
    sendEvent('output', '✓ proot-distro already installed\n');
  }

  // Check and install Ubuntu
  if (!toolDetector.isUbuntuInstalled()) {
    sendEvent('output', '\n📦 Installing Ubuntu in proot-distro...\n');
    sendEvent('output', '(This may take a few minutes)\n');
    await runCommand('proot-distro', ['install', 'ubuntu'], sendEvent);
    sendEvent('output', '✓ Ubuntu installed\n');

    // Setup Ubuntu with basic tools
    sendEvent('output', '\n📦 Setting up Ubuntu environment...\n');
    await runCommand('proot-distro', ['login', 'ubuntu', '--', 'apt', 'update'], sendEvent);
    await runCommand('proot-distro', ['login', 'ubuntu', '--', 'apt', 'install', '-y', 'curl', 'git'], sendEvent);

    // Install Node.js in Ubuntu via nvm
    sendEvent('output', '\n📦 Installing Node.js in Ubuntu...\n');
    await runCommand('proot-distro', ['login', 'ubuntu', '--', 'bash', '-c',
      'curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash && ' +
      'export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" && ' +
      'nvm install --lts && nvm use --lts'
    ], sendEvent);
    sendEvent('output', '✓ Node.js installed\n');
  } else {
    sendEvent('output', '✓ Ubuntu already installed\n');
  }
}

// Get all tools with availability status
router.get('/', (req, res) => {
  try {
    const tools = toolDetector.detectTools();
    const defaultTool = toolDetector.getDefaultTool();
    res.json({
      ...tools,
      defaultTool
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Check if specific tool is available
router.get('/:id', (req, res) => {
  try {
    const toolId = req.params.id;
    const available = toolDetector.isToolAvailable(toolId);
    const info = toolDetector.getToolInfo(toolId);

    if (!info) {
      return res.status(404).json({ error: 'Unknown tool' });
    }

    res.json({
      id: toolId,
      name: info.name,
      description: info.description,
      available,
      installCmd: info.installCmd
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Install a tool
router.post('/:id/install', async (req, res) => {
  const toolId = req.params.id;
  const info = toolDetector.getToolInfo(toolId);

  if (!info) {
    return res.status(404).json({ error: 'Unknown tool' });
  }

  if (!info.installCmd) {
    return res.status(400).json({ error: 'Tool cannot be installed' });
  }

  if (toolDetector.isToolAvailable(toolId)) {
    return res.status(400).json({ error: 'Tool is already installed' });
  }

  if (activeInstalls.has(toolId)) {
    return res.status(409).json({ error: 'Installation already in progress' });
  }

  // Set up SSE for streaming output
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sendEvent = (type, data) => {
    res.write(`data: ${JSON.stringify({ type, data })}\n\n`);
  };

  activeInstalls.set(toolId, true);

  // Handle client disconnect
  req.on('close', () => {
    activeInstalls.delete(toolId);
  });

  try {
    const requiresProot = info.requiresProot && toolDetector.isTermux;

    if (requiresProot) {
      sendEvent('start', { tool: toolId, command: `proot-distro + ${info.installCmd}`, requiresProot: true });

      // Setup proot-distro and Ubuntu first
      await setupProotDistro(sendEvent);

      // Install the tool inside proot-distro Ubuntu
      sendEvent('output', `\n📦 Installing ${info.name} in Ubuntu...\n`);
      await runCommand('proot-distro', ['login', 'ubuntu', '--', 'bash', '-c',
        'export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" && ' + info.installCmd
      ], sendEvent);
      sendEvent('output', `✓ ${info.name} installed\n`);
    } else {
      sendEvent('start', { tool: toolId, command: info.installCmd });

      // Parse install command
      const parts = info.installCmd.split(' ');
      const cmd = parts[0];
      const args = parts.slice(1);

      await runCommand(cmd, args, sendEvent);
    }

    // Clear tool cache to refresh availability
    toolDetector.clearCache();
    sendEvent('complete', { success: true, tool: toolId });
  } catch (err) {
    sendEvent('error', err.message);
    sendEvent('complete', { success: false, tool: toolId, error: err.message });
  } finally {
    activeInstalls.delete(toolId);
    res.end();
  }
});

// Get installation status
router.get('/:id/install', (req, res) => {
  const toolId = req.params.id;
  const installing = activeInstalls.has(toolId);
  res.json({ installing });
});

module.exports = router;
