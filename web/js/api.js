// API Client for Mobile Code

const API = {
  baseUrl: '/api',

  async request(method, endpoint, body = null) {
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, options);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Request failed');
    }

    return data;
  },

  // Repos
  repos: {
    list() {
      return API.request('GET', '/repos');
    },

    get(id) {
      return API.request('GET', `/repos/${id}`);
    },

    clone(url, name) {
      return API.request('POST', '/repos', { url, name });
    },

    create(name) {
      return API.request('POST', '/repos', { name });
    },

    delete(id) {
      return API.request('DELETE', `/repos/${id}`);
    },

    pull(id) {
      return API.request('POST', `/repos/${id}/pull`);
    },

    status(id) {
      return API.request('GET', `/repos/${id}/status`);
    }
  },

  // Sessions
  sessions: {
    list() {
      return API.request('GET', '/sessions');
    },

    get(id) {
      return API.request('GET', `/sessions/${id}`);
    },

    create(repoId, tool, cols, rows) {
      return API.request('POST', '/sessions', { repoId, tool, cols, rows });
    },

    delete(id) {
      return API.request('DELETE', `/sessions/${id}`);
    },

    restart(id) {
      return API.request('POST', `/sessions/${id}/restart`);
    }
  },

  // Settings
  settings: {
    get() {
      return API.request('GET', '/settings');
    },

    update(settings) {
      return API.request('PUT', '/settings', settings);
    }
  },

  // Tools
  tools: {
    list() {
      return API.request('GET', '/tools');
    },

    get(id) {
      return API.request('GET', `/tools/${id}`);
    },

    // Install a tool with streaming output
    install(id, onOutput, onComplete) {
      const eventSource = new EventSource(`${API.baseUrl}/tools/${id}/install`);

      // Use POST via fetch to initiate, but we need SSE for streaming
      // So we'll do a hybrid approach
      fetch(`${API.baseUrl}/tools/${id}/install`, { method: 'POST' })
        .then(response => {
          const reader = response.body.getReader();
          const decoder = new TextDecoder();

          function read() {
            reader.read().then(({ done, value }) => {
              if (done) return;

              const text = decoder.decode(value);
              const lines = text.split('\n');

              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  try {
                    const event = JSON.parse(line.slice(6));
                    if (event.type === 'output') {
                      onOutput?.(event.data);
                    } else if (event.type === 'complete') {
                      onComplete?.(event.data);
                    } else if (event.type === 'error') {
                      onOutput?.(`Error: ${event.data}\n`);
                      onComplete?.({ success: false, error: event.data });
                    }
                  } catch (e) {}
                }
              }

              read();
            });
          }

          read();
        })
        .catch(err => {
          onComplete?.({ success: false, error: err.message });
        });
    }
  },

  // Health check
  health() {
    return API.request('GET', '/health');
  }
};

// Make available globally
window.API = API;
