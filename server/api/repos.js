const express = require('express');
const router = express.Router();
const repoManager = require('../services/repo-manager');
const githubAuth = require('../services/github-auth');

// List all repos
router.get('/', (req, res) => {
  try {
    const repos = repoManager.listRepos();
    res.json(repos);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Clone or create repo
router.post('/', async (req, res) => {
  try {
    const { url, name, username, token } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    // Validate name (alphanumeric, dash, underscore only)
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
      return res.status(400).json({
        error: 'Name can only contain letters, numbers, dashes, and underscores'
      });
    }

    let repo;
    if (url) {
      // Pass credentials as options (used only for clone, never stored)
      const options = {};
      if (username) options.username = username;
      if (token) options.token = token;

      // Auto-inject stored GitHub credentials for github.com URLs
      if (!options.token && /^https?:\/\/(www\.)?github\.com[\/:]/.test(url)) {
        const auth = githubAuth.getStoredAuth();
        if (auth && auth.accessToken) {
          options.username = auth.username;
          options.token = auth.accessToken;
        }
      }

      repo = await repoManager.cloneRepo(url, name, options);
    } else {
      repo = repoManager.createRepo(name);
    }

    res.status(201).json(repo);
  } catch (err) {
    // Use 401 for auth-specific errors
    if (err.message.includes('Authentication failed')) {
      return res.status(401).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
});

// Get repo details
router.get('/:id', (req, res) => {
  try {
    const repo = repoManager.getRepo(req.params.id);
    if (!repo) {
      return res.status(404).json({ error: 'Repository not found' });
    }
    res.json(repo);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete repo
router.delete('/:id', (req, res) => {
  try {
    repoManager.deleteRepo(req.params.id);
    res.json({ success: true });
  } catch (err) {
    if (err.message === 'Repository not found') {
      return res.status(404).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
});

// Git pull
router.post('/:id/pull', async (req, res) => {
  try {
    const result = await repoManager.pullRepo(req.params.id);
    res.json(result);
  } catch (err) {
    if (err.message === 'Repository not found') {
      return res.status(404).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
});

// Get repo status
router.get('/:id/status', async (req, res) => {
  try {
    const status = await repoManager.getRepoStatus(req.params.id);
    res.json(status);
  } catch (err) {
    if (err.message === 'Repository not found') {
      return res.status(404).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
