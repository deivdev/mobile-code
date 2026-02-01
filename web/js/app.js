// Mobile Code - Terminal-like UI

class MobileCode {
  constructor() {
    this.sessions = [];
    this.repos = [];
    this.activeSessionId = null;
    this.settings = null;
    this.tools = { available: [], unavailable: [], defaultTool: 'shell' };
    this.ws = null;
    this.terminals = new Map();
    this.paletteItems = [];
    this.paletteIndex = 0;
    this.serverOnline = false;
    this.retryCount = 0;
    this.maxRetries = 3;

    // Modifier keys state
    this.modifiers = { ctrl: false, alt: false };

    // Gesture state
    this.touchStart = null;
    this.gestureThreshold = 50;
  }

  async init() {
    // Setup viewport handling for keyboard
    this.setupViewport();

    // Check server connectivity first
    const online = await this.checkServer();

    if (!online) {
      this.showOfflineScreen();
      this.startServerCheck();
      return;
    }

    await this.loadSettings();
    await this.loadTools();
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

  // ─── Viewport Handling (keyboard) ───────────────────────────

  setupViewport() {
    // Store initial viewport height to detect keyboard
    const initialHeight = window.innerHeight;
    const keyboardThreshold = 150; // Keyboard is ~150px+ tall

    const updateViewport = () => {
      const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
      document.documentElement.style.setProperty('--viewport-height', `${vh}px`);

      // Detect keyboard: viewport shrunk significantly
      const heightDiff = initialHeight - vh;
      const keyboardVisible = heightDiff > keyboardThreshold;

      // Toggle keyboard visibility class and toolbar
      const toolbar = document.getElementById('key-toolbar');
      if (keyboardVisible) {
        document.body.classList.add('keyboard-visible');
        toolbar?.classList.add('visible');
      } else {
        document.body.classList.remove('keyboard-visible');
        toolbar?.classList.remove('visible');
      }

      // Refit terminal when viewport changes
      if (this.activeSessionId) {
        const terminal = this.terminals.get(this.activeSessionId);
        if (terminal) {
          setTimeout(() => terminal.fitAddon.fit(), 50);
        }
      }
    };

    // Initial update
    updateViewport();

    // Listen for viewport changes (keyboard show/hide)
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', updateViewport);
      window.visualViewport.addEventListener('scroll', updateViewport);
    }

    // Fallback for browsers without visualViewport
    window.addEventListener('resize', updateViewport);
  }

  // ─── Server Connectivity ───────────────────────────────────

  async checkServer() {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);

      const response = await fetch('/api/health', {
        signal: controller.signal,
        cache: 'no-store'
      });
      clearTimeout(timeout);

      this.serverOnline = response.ok;
      return this.serverOnline;
    } catch (e) {
      this.serverOnline = false;
      return false;
    }
  }

  startServerCheck() {
    // Check every 2 seconds for server availability
    this.serverCheckInterval = setInterval(async () => {
      const online = await this.checkServer();
      if (online) {
        clearInterval(this.serverCheckInterval);
        this.hideOfflineScreen();
        this.init();
      }
    }, 2000);
  }

  showOfflineScreen() {
    const existing = document.getElementById('offline-view');
    if (existing) return;

    const isTermux = /Android/i.test(navigator.userAgent);
    const isPWA = window.matchMedia('(display-mode: standalone)').matches ||
                  window.navigator.standalone === true;

    const offlineView = document.createElement('div');
    offlineView.id = 'offline-view';
    offlineView.className = 'view active';
    offlineView.innerHTML = `
      <div class="offline-content">
        <div class="offline-icon">⚡</div>
        <h2 class="offline-title">Server Not Running</h2>
        <p class="offline-subtitle">The Mobile Code server isn't reachable</p>

        <div class="offline-spinner">
          <div class="spinner"></div>
          <span>Checking for server...</span>
        </div>

        ${isTermux || isPWA ? `
        <div class="offline-instructions">
          <p class="instruction-title">To start the server:</p>
          <div class="instruction-steps">
            <div class="step">
              <span class="step-num">1</span>
              <span>Open <strong>Termux</strong> app</span>
            </div>
            <div class="step">
              <span class="step-num">2</span>
              <span>Run: <code>cd ~/mobile-code && npm start</code></span>
            </div>
          </div>

          <div class="offline-tip">
            <strong>Tip:</strong> Set up auto-start with Termux:Boot
            <br><code>~/.termux/boot/mobile-code</code>
          </div>
        </div>
        ` : `
        <div class="offline-instructions">
          <p class="instruction-title">Start the server:</p>
          <code class="instruction-code">npm start</code>
        </div>
        `}

        <button class="btn btn-primary offline-retry" onclick="app.retryConnection()">
          Retry Now
        </button>
      </div>
    `;

    // Hide other views
    document.getElementById('welcome-view')?.classList.add('hidden');
    document.getElementById('terminal-view')?.classList.add('hidden');

    document.getElementById('main-content').appendChild(offlineView);
  }

  hideOfflineScreen() {
    const offlineView = document.getElementById('offline-view');
    if (offlineView) {
      offlineView.remove();
    }
  }

  async retryConnection() {
    const btn = document.querySelector('.offline-retry');
    const spinner = document.querySelector('.offline-spinner span');

    if (btn) btn.disabled = true;
    if (spinner) spinner.textContent = 'Connecting...';

    const online = await this.checkServer();

    if (online) {
      clearInterval(this.serverCheckInterval);
      this.hideOfflineScreen();
      this.init();
    } else {
      if (btn) btn.disabled = false;
      if (spinner) spinner.textContent = 'Server not found. Retrying...';
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

  async loadTools() {
    try {
      this.tools = await API.tools.list();
    } catch (e) {
      this.tools = { available: [{ id: 'shell', name: 'Bash Shell' }], unavailable: [], defaultTool: 'shell' };
    }
  }

  // ─── WebSocket ───────────────────────────────────────────

  connectWebSocket() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.ws = new WebSocket(`${protocol}//${location.host}`);

    this.ws.onopen = () => {
      this.serverOnline = true;
      this.updateConnectionIndicator();
      if (this.activeSessionId) {
        this.attachToSession(this.activeSessionId);
      }
    };

    this.ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      this.handleWsMessage(msg);
    };

    this.ws.onclose = () => {
      this.serverOnline = false;
      this.updateConnectionIndicator();
      setTimeout(() => this.connectWebSocket(), 2000);
    };
  }

  updateConnectionIndicator() {
    const indicator = document.getElementById('session-indicator');
    if (!indicator) return;

    if (!this.serverOnline) {
      indicator.className = 'indicator stopped';
      indicator.title = 'Server offline';
    } else {
      const active = this.sessions.find(s => s.id === this.activeSessionId);
      indicator.className = 'indicator' + (active?.status === 'stopped' ? ' stopped' : '');
      indicator.title = active?.status === 'stopped' ? 'Session stopped' : 'Connected';
    }
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
    this.updateConnectionIndicator();
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

    // Build tool options from available tools
    const toolOptions = this.tools.available.map(t =>
      `<option value="${t.id === 'shell' ? '' : t.id}">${this.escapeHtml(t.name)}</option>`
    ).join('');

    // Build unavailable tools with install buttons
    let unavailableHint = '';
    if (this.tools.unavailable.length > 0) {
      const hints = this.tools.unavailable.map(t =>
        `<div class="install-hint">
          <span class="hint-name">${this.escapeHtml(t.name)}</span>
          <button class="btn-install" data-tool="${t.id}" onclick="app.installTool('${t.id}')">Install</button>
        </div>`
      ).join('');
      unavailableHint = `
        <div class="form-group">
          <label class="form-label form-label-muted">Install AI tools:</label>
          ${hints}
        </div>
      `;
    }

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
          ${toolOptions}
        </select>
      </div>
      ${unavailableHint}
      <div class="form-actions">
        <button class="btn" onclick="app.hideModal()">Cancel</button>
        <button class="btn btn-primary" onclick="app.submitNewSession()">Start</button>
      </div>
    `);

    // Set default tool
    const defaultValue = this.tools.defaultTool === 'shell' ? '' : this.tools.defaultTool;
    document.getElementById('new-tool').value = defaultValue;
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
    // Build tool options from available tools
    const toolOptions = this.tools.available.map(t =>
      `<option value="${t.id === 'shell' ? '' : t.id}">${this.escapeHtml(t.name)}</option>`
    ).join('');

    this.showModal('Settings', `
      <div class="form-group">
        <label class="form-label">Default tool</label>
        <select id="setting-tool" class="form-select">
          ${toolOptions}
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

    const defaultValue = this.settings?.defaultTool === 'shell' ? '' : (this.settings?.defaultTool || '');
    document.getElementById('setting-tool').value = defaultValue;
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

  installTool(toolId) {
    const tool = this.tools.unavailable.find(t => t.id === toolId);
    if (!tool) return;

    this.showModal(`Installing ${tool.name}`, `
      <div class="install-output" id="install-output"></div>
      <div class="install-status" id="install-status">
        <span class="spinner"></span> Installing...
      </div>
    `);

    const output = document.getElementById('install-output');
    const status = document.getElementById('install-status');

    API.tools.install(
      toolId,
      // onOutput
      (text) => {
        output.textContent += text;
        output.scrollTop = output.scrollHeight;
      },
      // onComplete
      async (result) => {
        if (result.success) {
          status.innerHTML = '<span class="success">Installed successfully!</span>';
          this.toast(`${tool.name} installed!`, 'success');
          // Reload tools
          await this.loadTools();
          // Close modal after a moment
          setTimeout(() => this.hideModal(), 1500);
        } else {
          status.innerHTML = `<span class="error">Installation failed (code ${result.code || 'unknown'})</span>`;
          this.toast('Installation failed', 'error');
        }
      }
    );
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

    // Key toolbar
    this.bindKeyToolbar();

    // Touch gestures
    this.bindGestures();
  }

  // ─── Key Toolbar ────────────────────────────────────────────

  bindKeyToolbar() {
    const toolbar = document.getElementById('key-toolbar');
    if (!toolbar) return;

    toolbar.querySelectorAll('.key-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.preventDefault();

        if (btn.dataset.modifier) {
          // Toggle modifier key
          this.toggleModifier(btn.dataset.modifier);
        } else if (btn.dataset.key) {
          // Send key to terminal
          this.sendKey(btn.dataset.key);
        }
      });
    });
  }

  toggleModifier(mod) {
    this.modifiers[mod] = !this.modifiers[mod];

    // Update button visual state
    const btn = document.querySelector(`.key-btn[data-modifier="${mod}"]`);
    if (btn) {
      btn.classList.toggle('active', this.modifiers[mod]);
    }
  }

  clearModifiers() {
    this.modifiers.ctrl = false;
    this.modifiers.alt = false;

    document.querySelectorAll('.key-btn.modifier').forEach(btn => {
      btn.classList.remove('active');
    });
  }

  sendKey(key) {
    const terminal = this.terminals.get(this.activeSessionId);
    if (!terminal) return;

    let data = '';

    // Handle special keys
    switch (key) {
      case 'Escape':
        data = '\x1b';
        break;
      case 'Tab':
        data = '\t';
        break;
      case 'ArrowUp':
        data = '\x1b[A';
        break;
      case 'ArrowDown':
        data = '\x1b[B';
        break;
      case 'ArrowRight':
        data = '\x1b[C';
        break;
      case 'ArrowLeft':
        data = '\x1b[D';
        break;
      default:
        // Handle Ctrl+key combinations
        if (this.modifiers.ctrl && key.length === 1) {
          const code = key.toUpperCase().charCodeAt(0) - 64;
          if (code > 0 && code < 32) {
            data = String.fromCharCode(code);
          }
        } else if (this.modifiers.alt && key.length === 1) {
          data = '\x1b' + key;
        } else {
          data = key;
        }
    }

    if (data) {
      this.sendInput(this.activeSessionId, data);
      terminal.term.focus();
    }

    // Clear modifiers after sending
    this.clearModifiers();
  }

  // ─── Touch Gestures ─────────────────────────────────────────

  bindGestures() {
    const container = document.getElementById('terminal-container');
    if (!container) return;

    container.addEventListener('touchstart', e => {
      if (e.touches.length === 1) {
        this.touchStart = {
          x: e.touches[0].clientX,
          y: e.touches[0].clientY,
          time: Date.now()
        };
      }
    }, { passive: true });

    container.addEventListener('touchend', e => {
      if (!this.touchStart) return;

      const touch = e.changedTouches[0];
      const dx = touch.clientX - this.touchStart.x;
      const dy = touch.clientY - this.touchStart.y;
      const dt = Date.now() - this.touchStart.time;

      // Must be a quick swipe (< 300ms)
      if (dt > 300) {
        this.touchStart = null;
        return;
      }

      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      // Horizontal swipe
      if (absDx > this.gestureThreshold && absDx > absDy * 1.5) {
        if (dx < 0) {
          // Swipe left → ESC
          this.sendKey('Escape');
          this.showGestureFeedback('ESC');
        } else {
          // Swipe right → TAB
          this.sendKey('Tab');
          this.showGestureFeedback('TAB');
        }
      }
      // Vertical swipe
      else if (absDy > this.gestureThreshold && absDy > absDx * 1.5) {
        if (dy > 0) {
          // Swipe down → Ctrl+C
          this.sendInput(this.activeSessionId, '\x03');
          this.showGestureFeedback('Ctrl+C');
        } else {
          // Swipe up → Ctrl+Z
          this.sendInput(this.activeSessionId, '\x1a');
          this.showGestureFeedback('Ctrl+Z');
        }
      }

      this.touchStart = null;
    }, { passive: true });
  }

  showGestureFeedback(text) {
    let indicator = document.querySelector('.gesture-indicator');

    if (!indicator) {
      indicator = document.createElement('div');
      indicator.className = 'gesture-indicator';
      document.body.appendChild(indicator);
    }

    indicator.textContent = text;
    indicator.classList.add('show');

    setTimeout(() => {
      indicator.classList.remove('show');
    }, 500);
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
