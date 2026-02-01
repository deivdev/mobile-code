// Mobile Code - Terminal-like UI

class MobileCode {
  constructor() {
    this.sessions = [];
    this.repos = [];
    this.activeSessionId = null;
    this.settings = null;
    this.ws = null;
    this.terminals = new Map();
    this.paletteItems = [];
    this.paletteIndex = 0;
  }

  async init() {
    await this.loadSettings();
    await this.loadRepos();
    await this.loadSessions();

    this.connectWebSocket();
    this.bindEvents();
    this.updateUI();

    // Show welcome or restore session
    if (this.sessions.length > 0) {
      const running = this.sessions.find(s => s.status === 'running');
      if (running) {
        this.switchToSession(running.id);
      }
    } else {
      this.showWelcome();
    }
  }

  // ─── Data Loading ────────────────────────────────────────

  async loadSettings() {
    try {
      this.settings = await API.settings.get();
    } catch (e) {
      this.settings = { theme: 'dark', defaultTool: 'claude-code', terminal: { fontSize: 14 } };
    }
  }

  async loadRepos() {
    try {
      this.repos = await API.repos.list();
    } catch (e) {
      this.repos = [];
    }
  }

  async loadSessions() {
    try {
      this.sessions = await API.sessions.list();
    } catch (e) {
      this.sessions = [];
    }
  }

  // ─── WebSocket ───────────────────────────────────────────

  connectWebSocket() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.ws = new WebSocket(`${protocol}//${location.host}`);

    this.ws.onopen = () => {
      if (this.activeSessionId) {
        this.attachToSession(this.activeSessionId);
      }
    };

    this.ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      this.handleWsMessage(msg);
    };

    this.ws.onclose = () => {
      setTimeout(() => this.connectWebSocket(), 2000);
    };
  }

  handleWsMessage(msg) {
    const terminal = this.terminals.get(msg.sessionId);

    switch (msg.type) {
      case 'output':
        if (terminal) terminal.term.write(msg.data);
        break;
      case 'exit':
        if (terminal) {
          terminal.term.write(`\r\n\x1b[33m[exited: ${msg.code}]\x1b[0m\r\n`);
        }
        const session = this.sessions.find(s => s.id === msg.sessionId);
        if (session) {
          session.status = 'stopped';
          this.renderTabs();
          this.updateStatusBar();
        }
        break;
      case 'error':
        this.toast(msg.message, 'error');
        break;
    }
  }

  attachToSession(sessionId) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'attach', sessionId }));
    }
  }

  sendInput(sessionId, data) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'input', sessionId, data }));
    }
  }

  sendResize(sessionId, cols, rows) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'resize', sessionId, cols, rows }));
    }
  }

  // ─── Terminal Management ─────────────────────────────────

  createTerminal(sessionId) {
    const container = document.getElementById('terminal-container');

    // Hide all terminals
    this.terminals.forEach(t => t.wrapper.classList.remove('active'));

    // Create wrapper
    const wrapper = document.createElement('div');
    wrapper.className = 'terminal-wrapper active';
    wrapper.id = `term-${sessionId}`;
    container.appendChild(wrapper);

    // Create xterm
    const term = new Terminal({
      cursorBlink: true,
      fontSize: this.settings?.terminal?.fontSize || 14,
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      theme: {
        background: '#0d1117',
        foreground: '#c9d1d9',
        cursor: '#58a6ff',
        cursorAccent: '#0d1117',
        selection: 'rgba(88, 166, 255, 0.3)',
        black: '#484f58',
        red: '#f85149',
        green: '#3fb950',
        yellow: '#d29922',
        blue: '#58a6ff',
        magenta: '#a371f7',
        cyan: '#39c5cf',
        white: '#b1bac4',
        brightBlack: '#6e7681',
        brightRed: '#ffa198',
        brightGreen: '#56d364',
        brightYellow: '#e3b341',
        brightBlue: '#79c0ff',
        brightMagenta: '#d2a8ff',
        brightCyan: '#56d4dd',
        brightWhite: '#f0f6fc'
      },
      allowProposedApi: true
    });

    const fitAddon = new FitAddon.FitAddon();
    term.loadAddon(fitAddon);
    term.open(wrapper);
    fitAddon.fit();

    // Handle input
    term.onData(data => this.sendInput(sessionId, data));

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      if (wrapper.classList.contains('active')) {
        fitAddon.fit();
        this.sendResize(sessionId, term.cols, term.rows);
      }
    });
    resizeObserver.observe(wrapper);

    this.terminals.set(sessionId, { term, fitAddon, wrapper, resizeObserver });

    // Attach and focus
    this.attachToSession(sessionId);
    setTimeout(() => {
      fitAddon.fit();
      term.focus();
      this.sendResize(sessionId, term.cols, term.rows);
    }, 100);
  }

  showTerminal(sessionId) {
    this.terminals.forEach(t => t.wrapper.classList.remove('active'));
    const terminal = this.terminals.get(sessionId);
    if (terminal) {
      terminal.wrapper.classList.add('active');
      this.attachToSession(sessionId);
      setTimeout(() => {
        terminal.fitAddon.fit();
        terminal.term.focus();
      }, 50);
    }
  }

  destroyTerminal(sessionId) {
    const terminal = this.terminals.get(sessionId);
    if (terminal) {
      terminal.resizeObserver.disconnect();
      terminal.term.dispose();
      terminal.wrapper.remove();
      this.terminals.delete(sessionId);
    }
  }

  // ─── Session Management ──────────────────────────────────

  async createSession(repoId = null, tool = null) {
    try {
      tool = tool || this.settings?.defaultTool || 'claude-code';
      console.log('Creating session:', { repoId, tool });
      const session = await API.sessions.create(repoId, tool, 80, 24);
      console.log('Session created:', session);
      this.sessions.push(session);
      this.switchToSession(session.id);
      this.toast(`Started ${session.tool || 'shell'}`, 'success');
    } catch (e) {
      console.error('Session creation error:', e);
      this.toast(e.message, 'error');
    }
  }

  switchToSession(sessionId) {
    console.log('switchToSession:', sessionId);
    const session = this.sessions.find(s => s.id === sessionId);
    if (!session) {
      console.error('Session not found:', sessionId);
      return;
    }

    this.activeSessionId = sessionId;
    console.log('Showing terminal view');
    this.showView('terminal');

    if (!this.terminals.has(sessionId)) {
      console.log('Creating terminal for session');
      this.createTerminal(sessionId);
    } else {
      console.log('Showing existing terminal');
      this.showTerminal(sessionId);
    }

    this.renderTabs();
    this.updateStatusBar();
  }

  async closeSession(sessionId) {
    try {
      await API.sessions.delete(sessionId);
      this.destroyTerminal(sessionId);
      this.sessions = this.sessions.filter(s => s.id !== sessionId);

      if (this.activeSessionId === sessionId) {
        this.activeSessionId = null;
        if (this.sessions.length > 0) {
          this.switchToSession(this.sessions[0].id);
        } else {
          this.showWelcome();
        }
      }

      this.renderTabs();
    } catch (e) {
      this.toast(e.message, 'error');
    }
  }

  nextSession() {
    if (this.sessions.length < 2) return;
    const idx = this.sessions.findIndex(s => s.id === this.activeSessionId);
    const next = this.sessions[(idx + 1) % this.sessions.length];
    this.switchToSession(next.id);
  }

  prevSession() {
    if (this.sessions.length < 2) return;
    const idx = this.sessions.findIndex(s => s.id === this.activeSessionId);
    const prev = this.sessions[(idx - 1 + this.sessions.length) % this.sessions.length];
    this.switchToSession(prev.id);
  }

  // ─── Repository Management ───────────────────────────────

  async cloneRepo(url, name) {
    try {
      await API.repos.clone(url, name);
      await this.loadRepos();
      this.toast(`Cloned ${name}`, 'success');
      this.updateRecentRepos();
      return true;
    } catch (e) {
      this.toast(e.message, 'error');
      return false;
    }
  }

  async deleteRepo(id) {
    try {
      const repo = this.repos.find(r => r.id === id);
      await API.repos.delete(id);
      await this.loadRepos();
      this.toast(`Deleted ${repo?.name}`, 'success');
      this.updateRecentRepos();
    } catch (e) {
      this.toast(e.message, 'error');
    }
  }

  // ─── UI Updates ──────────────────────────────────────────

  updateUI() {
    this.renderTabs();
    this.updateRecentRepos();
    this.updateStatusBar();
  }

  renderTabs() {
    const tabs = document.getElementById('tabs');
    tabs.innerHTML = this.sessions.map((s, i) => {
      const active = s.id === this.activeSessionId ? 'active' : '';
      const label = s.repoName || s.tool || 'shell';
      return `
        <button class="tab ${active}" data-id="${s.id}">
          <span class="tab-index">${i + 1}</span>
          <span>${this.escapeHtml(label)}</span>
          <span class="tab-close" data-id="${s.id}">×</span>
        </button>
      `;
    }).join('');

    // Bind events
    tabs.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', e => {
        if (!e.target.classList.contains('tab-close')) {
          this.switchToSession(tab.dataset.id);
        }
      });
    });

    tabs.querySelectorAll('.tab-close').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        this.closeSession(btn.dataset.id);
      });
    });

    // Update indicator
    const indicator = document.getElementById('session-indicator');
    const active = this.sessions.find(s => s.id === this.activeSessionId);
    if (active) {
      indicator.className = 'indicator' + (active.status === 'stopped' ? ' stopped' : '');
    }
  }

  updateRecentRepos() {
    const section = document.getElementById('recent-repos');
    const list = document.getElementById('recent-list');

    if (this.repos.length === 0) {
      section.classList.add('hidden');
      return;
    }

    section.classList.remove('hidden');
    const recent = [...this.repos].sort((a, b) =>
      new Date(b.lastOpened || 0) - new Date(a.lastOpened || 0)
    ).slice(0, 5);

    list.innerHTML = recent.map(r => `
      <button class="recent-item" data-id="${r.id}">
        <span class="repo-icon">📁</span>
        <span class="repo-name">${this.escapeHtml(r.name)}</span>
      </button>
    `).join('');

    list.querySelectorAll('.recent-item').forEach(item => {
      item.addEventListener('click', () => {
        this.createSession(item.dataset.id);
      });
    });
  }

  updateStatusBar() {
    const session = this.sessions.find(s => s.id === this.activeSessionId);

    document.getElementById('status-tool').textContent = session?.tool || '';
    document.getElementById('status-cwd').textContent = session?.cwd ?
      session.cwd.replace(/^.*\//, '') : '~';
    document.getElementById('status-session').textContent = session ?
      `${this.sessions.indexOf(session) + 1}/${this.sessions.length}` : '';
  }

  // ─── Views ───────────────────────────────────────────────

  showView(name) {
    const terminalView = document.getElementById('terminal-view');
    const welcomeView = document.getElementById('welcome-view');

    if (name === 'terminal') {
      terminalView.classList.remove('hidden');
      terminalView.classList.add('active');
      welcomeView.classList.add('hidden');
      welcomeView.classList.remove('active');
    } else {
      welcomeView.classList.remove('hidden');
      welcomeView.classList.add('active');
      terminalView.classList.add('hidden');
      terminalView.classList.remove('active');
    }
  }

  showWelcome() {
    this.showView('welcome');
    this.activeSessionId = null;
    this.renderTabs();
    this.updateStatusBar();
  }

  // ─── Command Palette ─────────────────────────────────────

  showPalette(items = null) {
    this.paletteItems = items || this.getDefaultCommands();
    this.paletteIndex = 0;

    const overlay = document.getElementById('palette-overlay');
    const input = document.getElementById('palette-input');
    const results = document.getElementById('palette-results');

    overlay.classList.remove('hidden');
    input.value = '';
    input.focus();

    this.renderPaletteResults();
  }

  hidePalette() {
    document.getElementById('palette-overlay').classList.add('hidden');
    // Refocus terminal
    const terminal = this.terminals.get(this.activeSessionId);
    if (terminal) terminal.term.focus();
  }

  getDefaultCommands() {
    const cmds = [
      { icon: '+', label: 'New session', hint: 'Ctrl+T', action: () => this.showNewSessionModal() },
      { icon: '📁', label: 'Clone repository', hint: 'Ctrl+Shift+C', action: () => this.showCloneModal() },
      { icon: '⚙', label: 'Settings', action: () => this.showSettingsModal() },
    ];

    // Add repos
    this.repos.forEach(r => {
      cmds.push({
        icon: '→',
        label: `Open ${r.name}`,
        hint: r.path,
        action: () => this.createSession(r.id)
      });
    });

    // Add session switching
    this.sessions.forEach((s, i) => {
      cmds.push({
        icon: `${i + 1}`,
        label: `Switch to ${s.repoName || s.tool || 'shell'}`,
        hint: `Alt+${i + 1}`,
        action: () => this.switchToSession(s.id)
      });
    });

    return cmds;
  }

  filterPaletteItems(query) {
    if (!query) return this.paletteItems;
    const q = query.toLowerCase();
    return this.paletteItems.filter(item =>
      item.label.toLowerCase().includes(q)
    );
  }

  renderPaletteResults() {
    const input = document.getElementById('palette-input');
    const results = document.getElementById('palette-results');
    const filtered = this.filterPaletteItems(input.value);

    results.innerHTML = filtered.map((item, i) => `
      <div class="palette-item ${i === this.paletteIndex ? 'selected' : ''}" data-index="${i}">
        <span class="palette-item-icon">${item.icon}</span>
        <span class="palette-item-label">${this.escapeHtml(item.label)}</span>
        ${item.hint ? `<span class="palette-item-hint">${this.escapeHtml(item.hint)}</span>` : ''}
      </div>
    `).join('');

    results.querySelectorAll('.palette-item').forEach(item => {
      item.addEventListener('click', () => {
        const idx = parseInt(item.dataset.index);
        filtered[idx]?.action();
        this.hidePalette();
      });
    });
  }

  executePaletteItem() {
    const filtered = this.filterPaletteItems(document.getElementById('palette-input').value);
    if (filtered[this.paletteIndex]) {
      filtered[this.paletteIndex].action();
      this.hidePalette();
    }
  }

  // ─── Modals ──────────────────────────────────────────────

  showModal(title, content) {
    document.getElementById('modal-header').textContent = title;
    document.getElementById('modal-body').innerHTML = content;
    document.getElementById('modal-overlay').classList.remove('hidden');

    const firstInput = document.querySelector('#modal-body input, #modal-body select');
    if (firstInput) firstInput.focus();
  }

  hideModal() {
    document.getElementById('modal-overlay').classList.add('hidden');
    const terminal = this.terminals.get(this.activeSessionId);
    if (terminal) terminal.term.focus();
  }

  showNewSessionModal() {
    const repoOptions = this.repos.map(r =>
      `<option value="${r.id}">${this.escapeHtml(r.name)}</option>`
    ).join('');

    this.showModal('New Session', `
      <div class="form-group">
        <label class="form-label">Repository</label>
        <select id="new-repo" class="form-select">
          <option value="">~ (Home directory)</option>
          ${repoOptions}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Tool</label>
        <select id="new-tool" class="form-select">
          <option value="claude-code">Claude Code</option>
          <option value="opencode">OpenCode</option>
          <option value="codex">Codex</option>
          <option value="">Bash Shell</option>
        </select>
      </div>
      <div class="form-actions">
        <button class="btn" onclick="app.hideModal()">Cancel</button>
        <button class="btn btn-primary" onclick="app.submitNewSession()">Start</button>
      </div>
    `);

    document.getElementById('new-tool').value = this.settings?.defaultTool || 'claude-code';
  }

  submitNewSession() {
    const repoId = document.getElementById('new-repo').value || null;
    const tool = document.getElementById('new-tool').value || null;
    this.hideModal();
    this.createSession(repoId, tool);
  }

  showCloneModal() {
    this.showModal('Clone Repository', `
      <div class="form-group">
        <label class="form-label">Repository URL</label>
        <input type="text" id="clone-url" class="form-input" placeholder="https://github.com/user/repo.git">
      </div>
      <div class="form-group">
        <label class="form-label">Local name</label>
        <input type="text" id="clone-name" class="form-input" placeholder="repo-name">
      </div>
      <div class="form-actions">
        <button class="btn" onclick="app.hideModal()">Cancel</button>
        <button class="btn btn-primary" onclick="app.submitClone()">Clone</button>
      </div>
    `);
  }

  async submitClone() {
    const url = document.getElementById('clone-url').value.trim();
    const name = document.getElementById('clone-name').value.trim();

    if (!url || !name) {
      this.toast('Please fill all fields', 'error');
      return;
    }

    this.hideModal();
    await this.cloneRepo(url, name);
  }

  showSettingsModal() {
    this.showModal('Settings', `
      <div class="form-group">
        <label class="form-label">Default tool</label>
        <select id="setting-tool" class="form-select">
          <option value="claude-code">Claude Code</option>
          <option value="opencode">OpenCode</option>
          <option value="codex">Codex</option>
          <option value="">Bash Shell</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Font size</label>
        <input type="number" id="setting-fontsize" class="form-input" min="10" max="24" value="${this.settings?.terminal?.fontSize || 14}">
      </div>
      <div class="form-actions">
        <button class="btn" onclick="app.hideModal()">Cancel</button>
        <button class="btn btn-primary" onclick="app.submitSettings()">Save</button>
      </div>
    `);

    document.getElementById('setting-tool').value = this.settings?.defaultTool || 'claude-code';
  }

  async submitSettings() {
    const tool = document.getElementById('setting-tool').value;
    const fontSize = parseInt(document.getElementById('setting-fontsize').value);

    try {
      this.settings = await API.settings.update({
        defaultTool: tool,
        terminal: { fontSize }
      });

      // Update terminal font sizes
      this.terminals.forEach(t => {
        t.term.options.fontSize = fontSize;
        t.fitAddon.fit();
      });

      this.hideModal();
      this.toast('Settings saved', 'success');
    } catch (e) {
      this.toast(e.message, 'error');
    }
  }

  showOpenRepoModal() {
    if (this.repos.length === 0) {
      this.toast('No repositories. Clone one first.', 'error');
      return;
    }

    const items = this.repos.map(r => ({
      icon: '📁',
      label: r.name,
      hint: r.path,
      action: () => this.createSession(r.id)
    }));

    this.showPalette(items);
  }

  // ─── Toast ───────────────────────────────────────────────

  toast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type}`;

    setTimeout(() => {
      toast.classList.add('hidden');
    }, 3000);
  }

  // ─── Event Binding ───────────────────────────────────────

  bindEvents() {
    // Welcome screen actions
    document.querySelectorAll('.action-item').forEach(item => {
      item.addEventListener('click', () => {
        const action = item.dataset.action;
        switch (action) {
          case 'new-session': this.showNewSessionModal(); break;
          case 'clone-repo': this.showCloneModal(); break;
          case 'open-repo': this.showOpenRepoModal(); break;
          case 'settings': this.showSettingsModal(); break;
          case 'help': this.toast('Ctrl+K for commands, Ctrl+T for new session'); break;
        }
      });
    });

    // Top bar buttons
    document.getElementById('new-tab-btn').addEventListener('click', () => this.showNewSessionModal());
    document.getElementById('menu-btn').addEventListener('click', () => this.showPalette());

    // Palette input
    const paletteInput = document.getElementById('palette-input');
    paletteInput.addEventListener('input', () => {
      this.paletteIndex = 0;
      this.renderPaletteResults();
    });

    paletteInput.addEventListener('keydown', e => {
      const filtered = this.filterPaletteItems(paletteInput.value);

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.paletteIndex = Math.min(this.paletteIndex + 1, filtered.length - 1);
        this.renderPaletteResults();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.paletteIndex = Math.max(this.paletteIndex - 1, 0);
        this.renderPaletteResults();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        this.executePaletteItem();
      } else if (e.key === 'Escape') {
        this.hidePalette();
      }
    });

    // Close overlays on backdrop click
    document.getElementById('palette-overlay').addEventListener('click', e => {
      if (e.target.id === 'palette-overlay') this.hidePalette();
    });

    document.getElementById('modal-overlay').addEventListener('click', e => {
      if (e.target.id === 'modal-overlay') this.hideModal();
    });

    // Global keyboard shortcuts
    document.addEventListener('keydown', e => {
      // Don't capture if typing in input (except palette)
      if (e.target.tagName === 'INPUT' && e.target.id !== 'palette-input') return;
      if (e.target.tagName === 'SELECT') return;

      // Ctrl+K: Command palette
      if (e.ctrlKey && e.key === 'k') {
        e.preventDefault();
        this.showPalette();
        return;
      }

      // Ctrl+T: New session
      if (e.ctrlKey && e.key === 't') {
        e.preventDefault();
        this.showNewSessionModal();
        return;
      }

      // Ctrl+W: Close session
      if (e.ctrlKey && e.key === 'w') {
        e.preventDefault();
        if (this.activeSessionId) this.closeSession(this.activeSessionId);
        return;
      }

      // Ctrl+Tab / Ctrl+Shift+Tab: Switch sessions
      if (e.ctrlKey && e.key === 'Tab') {
        e.preventDefault();
        if (e.shiftKey) this.prevSession();
        else this.nextSession();
        return;
      }

      // Alt+1-9: Jump to session
      if (e.altKey && e.key >= '1' && e.key <= '9') {
        e.preventDefault();
        const idx = parseInt(e.key) - 1;
        if (this.sessions[idx]) this.switchToSession(this.sessions[idx].id);
        return;
      }

      // Escape: Close palette/modal or focus terminal
      if (e.key === 'Escape') {
        if (!document.getElementById('palette-overlay').classList.contains('hidden')) {
          this.hidePalette();
        } else if (!document.getElementById('modal-overlay').classList.contains('hidden')) {
          this.hideModal();
        }
        return;
      }

      // Welcome screen shortcuts (when no sessions active)
      if (!this.activeSessionId && e.target === document.body) {
        switch (e.key.toLowerCase()) {
          case 'n': this.showNewSessionModal(); break;
          case 'c': this.showCloneModal(); break;
          case 'o': this.showOpenRepoModal(); break;
          case 's': this.showSettingsModal(); break;
        }
      }
    });

    // Handle modal form submission on Enter
    document.getElementById('modal-body').addEventListener('keydown', e => {
      if (e.key === 'Enter' && e.target.tagName !== 'BUTTON') {
        e.preventDefault();
        const primaryBtn = document.querySelector('#modal-body .btn-primary');
        if (primaryBtn) primaryBtn.click();
      }
    });
  }

  // ─── Utilities ───────────────────────────────────────────

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Initialize app
const app = new MobileCode();
document.addEventListener('DOMContentLoaded', () => app.init());
