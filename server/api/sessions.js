const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const ptyManager = require('../services/pty-manager');
const repoManager = require('../services/repo-manager');

// List all sessions
router.get('/', (req, res) => {
  try {
    const sessions = ptyManager.getAllSessions();
    res.json(sessions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create new session
router.post('/', (req, res) => {
  try {
    const { repoId, tool, cols, rows } = req.body;

    // Get working directory
    let cwd = require('os').homedir();
    let repoName = null;

    if (repoId) {
      const repo = repoManager.getRepo(repoId);
      if (!repo) {
        return res.status(404).json({ error: 'Repository not found' });
      }
      cwd = repo.path;
      repoName = repo.name;
      // Update last opened
      repoManager.updateRepo(repoId, { lastOpened: new Date().toISOString() });
    }

    // Create session
    const sessionId = uuidv4();
    const session = ptyManager.createSession(sessionId, {
      cwd: cwd,
      tool: tool || null,
      cols: cols || 80,
      rows: rows || 24
    });

    res.status(201).json({
      id: session.id,
      pid: session.pid,
      tool: session.tool,
      cwd: session.cwd,
      repoId: repoId || null,
      repoName: repoName,
      status: session.status,
      createdAt: session.createdAt
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get session info
router.get('/:id', (req, res) => {
  try {
    const session = ptyManager.getSession(req.params.id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    res.json({
      id: session.id,
      pid: session.pid,
      tool: session.tool,
      cwd: session.cwd,
      status: session.status,
      createdAt: session.createdAt,
      exitCode: session.exitCode
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Kill session
router.delete('/:id', (req, res) => {
  try {
    const success = ptyManager.killSession(req.params.id);
    if (!success) {
      return res.status(404).json({ error: 'Session not found' });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Restart session
router.post('/:id/restart', (req, res) => {
  try {
    const session = ptyManager.getSession(req.params.id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Kill old session
    ptyManager.killSession(req.params.id);

    // Create new session with same settings
    const newSession = ptyManager.createSession(req.params.id, {
      cwd: session.cwd,
      tool: session.tool
    });

    res.json({
      id: newSession.id,
      pid: newSession.pid,
      tool: newSession.tool,
      cwd: newSession.cwd,
      status: newSession.status,
      createdAt: newSession.createdAt
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
