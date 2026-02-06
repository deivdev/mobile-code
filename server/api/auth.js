const express = require('express');
const router = express.Router();
const githubAuth = require('../services/github-auth');

// Start GitHub device flow
router.post('/github/device', async (req, res) => {
  try {
    const { clientId } = req.body;
    if (!clientId) {
      return res.status(400).json({ error: 'clientId is required' });
    }

    const result = await githubAuth.initiateDeviceFlow(clientId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Poll for token
router.post('/github/poll', async (req, res) => {
  try {
    const { clientId, deviceCode } = req.body;
    if (!clientId || !deviceCode) {
      return res.status(400).json({ error: 'clientId and deviceCode are required' });
    }

    const result = await githubAuth.pollForToken(clientId, deviceCode);

    if (result.status === 'success') {
      // Fetch username and store credentials
      const userInfo = await githubAuth.getUserInfo(result.access_token);
      githubAuth.storeAuth(clientId, result.access_token, userInfo.username);
      res.json({ status: 'success', username: userInfo.username });
    } else {
      res.json(result);
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Check auth status
router.get('/github/status', (req, res) => {
  const auth = githubAuth.getStoredAuth();
  if (auth && auth.accessToken) {
    res.json({ authenticated: true, username: auth.username });
  } else {
    res.json({ authenticated: false });
  }
});

// Logout
router.delete('/github', (req, res) => {
  githubAuth.clearAuth();
  res.json({ success: true });
});

module.exports = router;
