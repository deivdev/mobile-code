const simpleGit = require('simple-git');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const config = require('./config');

async function cloneRepo(url, name) {
  const reposDir = config.getReposDir();
  const repoPath = path.join(reposDir, name);

  // Check if path already exists
  if (fs.existsSync(repoPath)) {
    throw new Error(`Repository directory already exists: ${name}`);
  }

  // Clone the repository
  const git = simpleGit();
  await git.clone(url, repoPath);

  // Create repo entry
  const repo = {
    id: uuidv4(),
    name: name,
    path: repoPath,
    remoteUrl: url,
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
