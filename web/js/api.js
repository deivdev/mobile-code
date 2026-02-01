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

  // Health check
  health() {
    return API.request('GET', '/health');
  }
};

// Make available globally
window.API = API;
