const simpleGit = require('simple-git');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const config = require('./config');

/**
 * Build a URL with embedded credentials for authentication.
 * Credentials are URL-encoded to handle special characters.
 */
function buildAuthenticatedUrl(url, username, token) {
  if (!username || !token) {
    return url;
  }

  try {
    const parsed = new URL(url);
    parsed.username = encodeURIComponent(username);
    parsed.password = encodeURIComponent(token);
    return parsed.toString();
  } catch (e) {
    // If URL parsing fails, return original
    return url;
  }
}

async function cloneRepo(url, name, options = {}) {
  const { username, token } = options;
  const reposDir = config.getReposDir();
  const repoPath = path.join(reposDir, name);

  // Check if path already exists
  if (fs.existsSync(repoPath)) {
    throw new Error(`Repository directory already exists: ${name}`);
  }

  // Build authenticated URL if credentials provided
  const cloneUrl = buildAuthenticatedUrl(url, username, token);

  // Clone the repository
  const git = simpleGit();
  try {
    await git.clone(cloneUrl, repoPath);
  } catch (err) {
    // Clean up partial clone on failure
    if (fs.existsSync(repoPath)) {
      fs.rmSync(repoPath, { recursive: true, force: true });
    }

    // Provide more helpful error messages for auth failures
    const errorMsg = err.message || '';
    if (errorMsg.includes('Authentication failed') ||
        errorMsg.includes('could not read Username') ||
        errorMsg.includes('Invalid username or password') ||
        errorMsg.includes('401')) {
      throw new Error('Authentication failed. Check your username and token.');
    }
    if (errorMsg.includes('Repository not found') || errorMsg.includes('404')) {
      throw new Error('Repository not found. It may be private - try adding credentials.');
    }
    throw err;
  }

  // Create repo entry - store original URL without credentials
  const repo = {
    id: uuidv4(),
    name: name,
    path: repoPath,
    remoteUrl: url,  // Never store credentials
    createdAt: new Date().toISOString(),
    lastOpened: new Date().toISOString()
  };

  // Save to config
  const cfg = config.get();
  cfg.repos.push(repo);
  config.set(cfg);

  return repo;
}

function createRepo(name) {
  const reposDir = config.getReposDir();
  const repoPath = path.join(reposDir, name);

  // Check if path already exists
  if (fs.existsSync(repoPath)) {
    throw new Error(`Repository directory already exists: ${name}`);
  }

  // Create directory
  fs.mkdirSync(repoPath, { recursive: true });

  // Initialize git repo
  const git = simpleGit(repoPath);
  git.init();

  // Create repo entry
  const repo = {
    id: uuidv4(),
    name: name,
    path: repoPath,
    remoteUrl: null,
    createdAt: new Date().toISOString(),
    lastOpened: new Date().toISOString()
  };

  // Save to config
  const cfg = config.get();
  cfg.repos.push(repo);
  config.set(cfg);

  return repo;
}

function listRepos() {
  const cfg = config.get();
  return cfg.repos || [];
}

function getRepo(id) {
  const cfg = config.get();
  return cfg.repos.find(r => r.id === id);
}

function updateRepo(id, updates) {
  const cfg = config.get();
  const index = cfg.repos.findIndex(r => r.id === id);
  if (index === -1) {
    throw new Error('Repository not found');
  }
  cfg.repos[index] = { ...cfg.repos[index], ...updates };
  config.set(cfg);
  return cfg.repos[index];
}

function deleteRepo(id) {
  const cfg = config.get();
  const index = cfg.repos.findIndex(r => r.id === id);
  if (index === -1) {
    throw new Error('Repository not found');
  }

  const repo = cfg.repos[index];

  // Delete directory
  if (fs.existsSync(repo.path)) {
    fs.rmSync(repo.path, { recursive: true, force: true });
  }

  // Remove from config
  cfg.repos.splice(index, 1);
  config.set(cfg);

  return true;
}

async function pullRepo(id) {
  const repo = getRepo(id);
  if (!repo) {
    throw new Error('Repository not found');
  }

  const git = simpleGit(repo.path);
  const result = await git.pull();
  return result;
}

async function getRepoStatus(id) {
  const repo = getRepo(id);
  if (!repo) {
    throw new Error('Repository not found');
  }

  const git = simpleGit(repo.path);
  const status = await git.status();
  return status;
}

module.exports = {
  cloneRepo,
  createRepo,
  listRepos,
  getRepo,
  updateRepo,
  deleteRepo,
  pullRepo,
  getRepoStatus
};
