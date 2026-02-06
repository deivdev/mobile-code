const config = require('./config');

const GITHUB_DEVICE_CODE_URL = 'https://github.com/login/device/code';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GITHUB_USER_URL = 'https://api.github.com/user';

async function initiateDeviceFlow(clientId) {
  const response = await fetch(GITHUB_DEVICE_CODE_URL, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      client_id: clientId,
      scope: 'repo'
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub device flow failed: ${response.status} ${text}`);
  }

  return response.json();
}

async function pollForToken(clientId, deviceCode) {
  const response = await fetch(GITHUB_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      client_id: clientId,
      device_code: deviceCode,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub token poll failed: ${response.status} ${text}`);
  }

  const data = await response.json();

  if (data.error) {
    return { status: data.error, message: data.error_description };
  }

  return { status: 'success', access_token: data.access_token, token_type: data.token_type };
}

async function getUserInfo(accessToken) {
  const response = await fetch(GITHUB_USER_URL, {
    headers: {
      'Accept': 'application/json',
      'Authorization': `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    throw new Error(`GitHub user info failed: ${response.status}`);
  }

  const data = await response.json();
  return { username: data.login, name: data.name, avatar_url: data.avatar_url };
}

function getStoredAuth() {
  const cfg = config.get();
  return cfg.github || null;
}

function storeAuth(clientId, accessToken, username) {
  config.set({ github: { clientId, accessToken, username } });
}

function clearAuth() {
  const cfg = config.get();
  delete cfg.github;
  config.save();
}

module.exports = {
  initiateDeviceFlow,
  pollForToken,
  getUserInfo,
  getStoredAuth,
  storeAuth,
  clearAuth
};
