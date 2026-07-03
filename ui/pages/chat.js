class OPChatPlusPage extends HTMLElement {
  constructor() {
    super();
    this.agents = {};
    this.selectedAgent = '';
    this.sessions = [];
    this.activeSessionId = '';
    this.messages = [];
    this.ws = null;
    this.isThinking = false;
    this.status = 'idle'; // 'idle' | 'connecting' | 'running' | 'error'
    this.errorMsg = null;
    this.searchQuery = '';
    this.activeView = 'agents'; // 'agents' | 'chat'
  }

  connectedCallback() {
    this.render();
    this.loadAgents();
  }

  disconnectedCallback() {
    this.closeWebSocket();
  }

  get tsUrls() {
    const isDev = window.location.port === '5173' || window.location.port === '3000';
    const proto = window.location.protocol;
    const host = window.location.host;
    
    const slashSlash = '://';
    const httpPrefix = (proto === 'https:' ? 'https' : 'http') + slashSlash;
    const wsPrefix = (proto === 'https:' ? 'wss' : 'ws') + slashSlash;
    
    const tsHttp = isDev
      ? `${httpPrefix}localhost:32352`
      : `${httpPrefix}${host}/terminal`;
      
    const tsWs = isDev
      ? `${wsPrefix}localhost:32352`
      : `${wsPrefix}${host}/terminal`;
      
    return { http: tsHttp, ws: tsWs };
  }

  render() {
    this.innerHTML = `
      <style>
        .chatplus-wrapper {
          display: flex;
          width: 100%;
          height: 100%;
          background-color: var(--bg-primary, #0C111D);
          color: var(--text-primary, #F9FAFB);
          font-family: 'Inter', system-ui, -apple-system, sans-serif;
          overflow: hidden;
        }

        /* -------------------------------------------------------------
           1. AGENTS SELECTION VIEW
           ------------------------------------------------------------- */
        .agents-view {
          display: flex;
          flex-direction: column;
          width: 100%;
          height: 100%;
          padding: 24px 40px;
          overflow-y: auto;
        }

        .agents-header {
          margin-bottom: 24px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
          flex-wrap: wrap;
        }

        .agents-title h1 {
          font-size: 24px;
          font-weight: 700;
          margin: 0 0 6px 0;
          letter-spacing: -0.02em;
        }

        .agents-title p {
          font-size: 14px;
          color: var(--text-muted, #667085);
          margin: 0;
        }

        .search-wrapper {
          display: flex;
          align-items: center;
          background-color: var(--bg-card, #182230);
          border: 1px solid var(--border, #344054);
          border-radius: 8px;
          padding: 8px 14px;
          width: 320px;
          gap: 8px;
        }

        .search-input {
          background: none;
          border: none;
          color: var(--text-primary, #F9FAFB);
          font-size: 13px;
          outline: none;
          width: 100%;
        }

        .agents-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 20px;
          padding-bottom: 40px;
        }

        .agent-card {
          background-color: var(--bg-card, #182230);
          border: 1px solid var(--border, #344054);
          border-radius: 12px;
          padding: 20px;
          cursor: pointer;
          transition: transform 0.2s, border-color 0.2s, box-shadow 0.2s;
          display: flex;
          flex-direction: column;
          height: 100%;
          position: relative;
        }

        .agent-card:hover {
          border-color: var(--evo-green, #00FFA7);
          box-shadow: 0 4px 20px rgba(0, 255, 167, 0.05);
          transform: translateY(-2px);
        }

        .card-header {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 12px;
        }

        .card-avatar {
          width: 44px;
          height: 44px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 16px;
          border: 2px solid var(--border, #344054);
          background-color: rgba(12, 17, 29, 0.4);
          flex-shrink: 0;
        }

        .card-meta {
          min-width: 0;
        }

        .card-name {
          font-size: 15px;
          font-weight: 600;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .card-category {
          font-size: 11px;
          color: var(--evo-green, #00FFA7);
          font-weight: 500;
          text-transform: uppercase;
          margin-top: 2px;
        }

        .card-desc {
          font-size: 12px;
          color: var(--text-secondary, #D0D5DD);
          line-height: 1.5;
          margin: 0;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          text-overflow: ellipsis;
          flex-grow: 1;
        }

        .card-footer {
          margin-top: 14px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-top: 1px solid rgba(52, 64, 84, 0.4);
          padding-top: 12px;
        }

        .card-cmd {
          font-family: monospace;
          font-size: 11px;
          color: var(--text-muted, #667085);
        }

        .card-action {
          font-size: 12px;
          color: var(--evo-green, #00FFA7);
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 4px;
        }

        /* -------------------------------------------------------------
           2. ACTIVE CHAT VIEW
           ------------------------------------------------------------- */
        .chat-view {
          display: flex;
          width: 100%;
          height: 100%;
          overflow: hidden;
        }

        /* Sidebar */
        .chat-sidebar {
          width: 280px;
          border-right: 1px solid var(--border, #344054);
          background-color: var(--bg-sidebar, #0a0f1a);
          display: flex;
          flex-direction: column;
          flex-shrink: 0;
          height: 100%;
        }

        .back-btn-wrapper {
          padding: 16px;
          border-bottom: 1px solid var(--border, #344054);
        }

        .back-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          background: none;
          border: none;
          color: var(--text-secondary, #D0D5DD);
          cursor: pointer;
          font-size: 13px;
          font-weight: 500;
          padding: 0;
          transition: color 0.2s;
        }

        .back-btn:hover {
          color: var(--evo-green, #00FFA7);
        }

        .sidebar-agent-header {
          padding: 16px;
          display: flex;
          align-items: center;
          gap: 12px;
          background-color: rgba(0, 0, 0, 0.1);
        }

        .sidebar-agent-avatar {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 14px;
        }

        .sidebar-agent-info {
          min-width: 0;
        }

        .sidebar-agent-name {
          font-size: 13px;
          font-weight: 600;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .sidebar-agent-cmd {
          font-size: 11px;
          color: var(--text-muted, #667085);
        }

        .sessions-header {
          padding: 16px 16px 8px 16px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .sessions-label {
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--text-muted, #667085);
        }

        .new-conv-btn {
          background-color: rgba(0, 255, 167, 0.08);
          border: 1px solid rgba(0, 255, 167, 0.2);
          color: var(--evo-green, #00FFA7);
          cursor: pointer;
          font-size: 12px;
          font-weight: 600;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 8px 12px;
          border-radius: 8px;
          margin: 0 16px 12px 16px;
          transition: background-color 0.2s, border-color 0.2s;
        }

        .new-conv-btn:hover {
          background-color: rgba(0, 255, 167, 0.15);
          border-color: var(--evo-green, #00FFA7);
        }

        .session-list {
          flex: 1;
          overflow-y: auto;
          padding: 0 12px 16px 12px;
        }

        .session-item {
          padding: 10px 12px;
          border-radius: 8px;
          font-size: 12px;
          cursor: pointer;
          margin-bottom: 4px;
          color: var(--text-secondary, #D0D5DD);
          transition: background-color 0.2s, color 0.2s;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          border: 1px solid transparent;
        }

        .session-item:hover {
          background-color: var(--surface-hover, #1e2d3d);
          color: var(--text-primary, #F9FAFB);
        }

        .session-item.active {
          background-color: var(--surface-active, #1a2744);
          color: var(--evo-green, #00FFA7);
          border-color: rgba(0, 255, 167, 0.2);
          font-weight: 500;
        }

        /* Chat Panel */
        .chat-panel {
          flex: 1;
          display: flex;
          flex-direction: column;
          height: 100%;
          min-width: 0;
          overflow: hidden;
        }

        .chat-header {
          height: 57px;
          border-bottom: 1px solid var(--border, #344054);
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 24px;
          background-color: rgba(12, 17, 29, 0.6);
          backdrop-filter: blur(8px);
          flex-shrink: 0;
        }

        .chat-header-title {
          font-size: 14px;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .status-badge {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background-color: #667085;
          display: inline-block;
        }

        .status-badge.connected {
          background-color: var(--evo-green, #00FFA7);
          box-shadow: 0 0 6px var(--evo-green, #00FFA7);
        }

        .status-badge.running {
          background-color: #eab308;
          box-shadow: 0 0 6px #eab308;
        }

        .status-badge.error {
          background-color: #ef4444;
          box-shadow: 0 0 6px #ef4444;
        }

        .messages-container {
          flex: 1;
          overflow-y: auto;
          padding: 24px 32px;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .message-row {
          display: flex;
          width: 100%;
          gap: 12px;
        }

        .message-row.user {
          justify-content: flex-end;
        }

        .message-avatar-col {
          flex-shrink: 0;
        }

        .message-avatar {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 12px;
        }

        .message-body-col {
          display: flex;
          flex-direction: column;
          max-width: 75%;
        }

        .message-row.user .message-body-col {
          align-items: flex-end;
        }

        .message-sender {
          font-size: 11px;
          color: var(--text-muted, #667085);
          margin-bottom: 4px;
        }

        .message-bubble {
          padding: 12px 16px;
          border-radius: 12px;
          font-size: 14px;
          line-height: 1.5;
          word-break: break-word;
          border: 1px solid var(--border, #344054);
        }

        .message-row.user .message-bubble {
          background-color: var(--surface-active, #1a2744);
          color: var(--text-primary, #F9FAFB);
          border-bottom-right-radius: 2px;
          border-color: rgba(0, 255, 167, 0.15);
        }

        .message-row.assistant .message-bubble {
          background-color: var(--bg-card, #182230);
          color: var(--text-secondary, #D0D5DD);
          border-bottom-left-radius: 2px;
        }

        .message-row.system .message-bubble {
          background-color: rgba(239, 68, 68, 0.08);
          color: #f87171;
          border-color: rgba(239, 68, 68, 0.2);
          font-family: monospace;
          font-size: 12px;
        }

        /* Message Input Bar (Mockup exact replica) */
        .input-outer-container {
          padding: 16px 32px 24px 32px;
          background-color: var(--bg-primary, #0C111D);
          flex-shrink: 0;
        }

        .input-bar-wrapper {
          display: flex;
          align-items: center;
          gap: 12px;
          background-color: var(--bg-card, #182230);
          border: 1px solid var(--border, #344054);
          border-radius: 24px;
          padding: 8px 16px;
          transition: border-color 0.2s;
        }

        .input-bar-wrapper:focus-within {
          border-color: var(--evo-green, #00FFA7);
        }

        .attach-btn {
          background: none;
          border: none;
          color: var(--text-muted, #667085);
          cursor: pointer;
          padding: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: color 0.2s;
        }

        .attach-btn:hover {
          color: var(--text-secondary, #D0D5DD);
        }

        .chat-textarea {
          flex: 1;
          background: none;
          border: none;
          color: var(--text-primary, #F9FAFB);
          font-family: inherit;
          font-size: 14px;
          resize: none;
          height: 20px;
          max-height: 120px;
          outline: none;
          padding: 2px 0;
        }

        .send-btn {
          background: none;
          border: none;
          color: var(--evo-green, #00FFA7);
          cursor: pointer;
          padding: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: transform 0.1s, opacity 0.2s;
        }

        .send-btn:hover {
          opacity: 0.8;
        }

        .send-btn:active {
          transform: scale(0.92);
        }

        .send-btn:disabled {
          color: var(--text-muted, #667085);
          cursor: not-allowed;
        }

        /* Typing indicator */
        .typing-indicator {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 4px 8px;
        }

        .typing-dot {
          width: 6px;
          height: 6px;
          background-color: var(--evo-green, #00FFA7);
          border-radius: 50%;
          animation: typingBounce 1.4s infinite both;
        }

        .typing-dot:nth-child(2) { animation-delay: .2s; }
        .typing-dot:nth-child(3) { animation-delay: .4s; }

        @keyframes typingBounce {
          0%, 80%, 100% { transform: scale(0); }
          40% { transform: scale(1); }
        }

        .bubble-content p {
          margin: 0 0 8px 0;
        }
        .bubble-content p:last-child {
          margin-bottom: 0;
        }
        .bubble-content pre {
          background-color: rgba(0, 0, 0, 0.3);
          padding: 8px 12px;
          border-radius: 6px;
          overflow-x: auto;
          margin: 8px 0;
          font-family: monospace;
          font-size: 13px;
        }
        .bubble-content code {
          font-family: monospace;
          background-color: rgba(0, 0, 0, 0.2);
          padding: 2px 4px;
          border-radius: 4px;
          color: var(--evo-green, #00FFA7);
          font-size: 13px;
        }
      </style>

      <div class="chatplus-wrapper" id="chatplusWrapper"></div>
    `;

    this.wrapperEl = this.querySelector('#chatplusWrapper');
  }

  showAgentsView() {
    this.activeView = 'agents';
    this.closeWebSocket();
    this.activeSessionId = '';
    this.messages = [];

    const agentsListHtml = Object.entries(this.agents)
      .filter(([slug, meta]) => {
        const name = (meta.display_name || meta.label || slug).toLowerCase();
        return name.includes(this.searchQuery.toLowerCase());
      })
      .map(([slug, meta]) => {
        const name = meta.display_name || meta.label || slug;
        const cmd = meta.command_alias || `/${slug}`;
        const color = meta.color || 'var(--evo-green, #00FFA7)';
        const category = meta.category_label || meta.category || 'Geral';
        const desc = meta.description || 'Nenhuma descrição fornecida.';

        return `
          <div class="agent-card" data-slug="${slug}">
            <div class="card-header">
              <div class="card-avatar" style="border-color: ${color}; color: ${color}">
                ${name.charAt(0).toUpperCase()}
              </div>
              <div class="card-meta">
                <div class="card-name">${name}</div>
                <div class="card-category">${category}</div>
              </div>
            </div>
            <p class="card-desc">${desc}</p>
            <div class="card-footer">
              <span class="card-cmd">${cmd}</span>
              <span class="card-action">
                Abrir Chat
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
              </span>
            </div>
          </div>
        `;
      }).join('');

    this.wrapperEl.innerHTML = `
      <div class="agents-view">
        <div class="agents-header">
          <div class="agents-title">
            <h1>Agentes</h1>
            <p>Selecione um agente para iniciar uma conversa estruturada.</p>
          </div>
          <div class="search-wrapper">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: var(--text-muted)"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="text" class="search-input" id="searchInput" placeholder="Pesquisar agentes..." value="${this.searchQuery}">
          </div>
        </div>
        <div class="agents-grid">
          ${agentsListHtml || `<div style="color: var(--text-muted); grid-column: 1/-1; text-align: center; padding: 40px;">Nenhum agente encontrado.</div>`}
        </div>
      </div>
    `;

    // Bind events
    this.querySelectorAll('.agent-card').forEach(card => {
      card.addEventListener('click', () => {
        this.selectAgent(card.dataset.slug);
      });
    });

    const searchInput = this.querySelector('#searchInput');
    searchInput.addEventListener('input', (e) => {
      this.searchQuery = e.target.value;
      this.showAgentsView();
      this.querySelector('#searchInput').focus();
    });
  }

  showChatView() {
    this.activeView = 'chat';
    const agentMeta = this.agents[this.selectedAgent] || {};
    const agentName = agentMeta.display_name || agentMeta.label || this.selectedAgent;
    const agentColor = agentMeta.color || 'var(--evo-green, #00FFA7)';
    const agentCmd = agentMeta.command_alias || `/${this.selectedAgent}`;

    this.wrapperEl.innerHTML = `
      <div class="chat-view">
        <!-- Sidebar -->
        <div class="chat-sidebar">
          <div class="back-btn-wrapper">
            <button class="back-btn" id="backBtn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
              Voltar para Agentes
            </button>
          </div>
          <div class="sidebar-agent-header">
            <div class="sidebar-agent-avatar" style="background-color: rgba(0, 0, 0, 0.2); border: 2px solid ${agentColor}; color: ${agentColor}">
              ${agentName.charAt(0).toUpperCase()}
            </div>
            <div class="sidebar-agent-info">
              <div class="sidebar-agent-name">${agentName}</div>
              <div class="sidebar-agent-cmd">${agentCmd}</div>
            </div>
          </div>
          <div class="sessions-header">
            <span class="sessions-label">Conversas</span>
          </div>
          <button class="new-conv-btn" id="newConvBtn">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            + NOVA CONVERSA
          </button>
          <div class="session-list" id="sessionList">
            <div style="color: var(--text-muted); font-size: 11px; padding: 12px; text-align: center;">Carregando sessões...</div>
          </div>
        </div>

        <!-- Chat Panel -->
        <div class="chat-panel">
          <div class="chat-header">
            <div class="chat-header-title">
              <span class="status-badge" id="statusBadge"></span>
              <span id="sessionHeaderTitle">Conectando...</span>
            </div>
          </div>

          <div class="messages-container" id="messagesContainer">
            <div class="empty-state" style="color: var(--text-muted); text-align: center; margin-top: 100px;">
              <p>Carregando histórico de mensagens...</p>
            </div>
          </div>

          <div class="input-outer-container">
            <div class="input-bar-wrapper">
              <button class="attach-btn" title="Anexar arquivo (Mock)">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
              </button>
              <textarea class="chat-textarea" id="chatInput" placeholder="Mensagem @${this.selectedAgent}..." disabled></textarea>
              <button class="send-btn" id="sendBtn" disabled>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    // Elements
    this.sessionListEl = this.querySelector('#sessionList');
    this.statusBadgeEl = this.querySelector('#statusBadge');
    this.sessionHeaderTitleEl = this.querySelector('#sessionHeaderTitle');
    this.messagesContainerEl = this.querySelector('#messagesContainer');
    this.chatInputEl = this.querySelector('#chatInput');
    this.sendBtnEl = this.querySelector('#sendBtn');

    // Events
    this.querySelector('#backBtn').addEventListener('click', () => this.showAgentsView());
    this.querySelector('#newConvBtn').addEventListener('click', () => this.createNewSession());

    this.chatInputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.submitMessage();
      }
    });

    this.chatInputEl.addEventListener('input', () => {
      this.chatInputEl.style.height = 'auto';
      this.chatInputEl.style.height = `${Math.min(this.chatInputEl.scrollHeight - 8, 120)}px`;
    });

    this.sendBtnEl.addEventListener('click', () => this.submitMessage());

    this.renderSessionList();
  }

  async loadAgents() {
    try {
      const res = await fetch('/api/agent-meta');
      if (!res.ok) throw new Error('API failed');
      this.agents = await res.json();
      this.showAgentsView();
    } catch (err) {
      this.wrapperEl.innerHTML = `<div style="color: #ef4444; font-size: 14px; padding: 40px; text-align: center;">Erro ao carregar os agentes do EvoNexus.</div>`;
    }
  }

  async selectAgent(slug) {
    this.selectedAgent = slug;
    this.showChatView();
    await this.loadSessions();
  }

  async loadSessions() {
    try {
      const res = await fetch(`${this.tsUrls.http}/api/sessions/by-agent/${this.selectedAgent}`);
      if (!res.ok) throw new Error('API error');
      const data = await res.json();
      this.sessions = data.sessions || [];
      this.renderSessionList();

      if (this.sessions.length > 0) {
        this.selectSession(this.sessions[0].id);
      } else {
        this.createNewSession();
      }
    } catch {
      this.sessionListEl.innerHTML = `<div style="color: #ef4444; font-size: 11px; padding: 12px; text-align: center;">Erro ao carregar conversas.</div>`;
    }
  }

  renderSessionList() {
    if (!this.sessionListEl) return;
    this.sessionListEl.innerHTML = '';
    this.sessions.forEach((s) => {
      const item = document.createElement('div');
      item.className = `session-item ${this.activeSessionId === s.id ? 'active' : ''}`;
      item.innerText = s.name || `${this.selectedAgent} #${s.id.slice(0, 4)}`;
      item.addEventListener('click', () => this.selectSession(s.id));
      this.sessionListEl.appendChild(item);
    });
  }

  async createNewSession() {
    if (!this.selectedAgent) return;
    try {
      const res = await fetch(`${this.tsUrls.http}/api/sessions/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentName: this.selectedAgent })
      });
      if (!res.ok) throw new Error('Failed to create session');
      const data = await res.json();
      const newSession = { id: data.sessionId, name: data.session?.name };
      this.sessions.unshift(newSession);
      this.renderSessionList();
      this.selectSession(newSession.id);
    } catch (err) {
      console.error(err);
    }
  }

  selectSession(sessionId) {
    if (this.activeSessionId === sessionId && this.ws) return;
    this.activeSessionId = sessionId;
    this.renderSessionList();

    const activeSession = this.sessions.find(s => s.id === sessionId);
    if (this.sessionHeaderTitleEl) {
      this.sessionHeaderTitleEl.innerText = activeSession?.name || `${this.selectedAgent} #${sessionId.slice(0, 4)}`;
    }

    this.messages = [];
    this.renderMessages();

    this.connectWebSocket(sessionId);
  }

  closeWebSocket() {
    if (this.ws) {
      try { this.ws.close(); } catch {}
      this.ws = null;
    }
  }

  connectWebSocket(sessionId) {
    this.closeWebSocket();
    this.updateStatus('connecting');

    this.ws = new WebSocket(`${this.tsUrls.ws}/ws`);

    this.ws.onopen = () => {
      this.ws.send(JSON.stringify({ type: 'join_session', sessionId }));
      this.updateStatus('connected');
      this.enableInput(true);
    };

    this.ws.onmessage = (event) => {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }

      switch (msg.type) {
        case 'session_joined':
          if (msg.chatHistory && msg.chatHistory.length > 0) {
            this.messages = msg.chatHistory.map(m => ({
              role: m.role,
              text: m.text || this.extractTextFromBlocks(m.blocks),
              ts: m.ts || Date.now()
            }));
            this.renderMessages();
          } else {
            this.messages = [];
            this.renderMessages();
          }
          break;

        case 'chat_event':
          this.handleChatEvent(msg.event || msg);
          break;

        case 'chat_error':
          this.updateStatus('error', msg.message);
          this.appendSystemMessage(`Error: ${msg.message}`);
          break;

        case 'chat_complete':
          this.updateStatus('connected');
          this.isThinking = false;
          this.renderMessages();
          this.enableInput(true);
          break;
      }
    };

    this.ws.onerror = () => {
      this.updateStatus('error', 'Erro no WebSocket');
    };

    this.ws.onclose = () => {
      this.enableInput(false);
    };
  }

  extractTextFromBlocks(blocks) {
    if (!blocks) return '';
    return blocks.map(b => b.text || '').join('');
  }

  handleChatEvent(event) {
    if (event.type === 'thinking_start') {
      this.isThinking = true;
      this.updateStatus('running');
      this.renderMessages();
      return;
    }

    if (event.type === 'text_start' || event.type === 'message_start') {
      this.isThinking = false;
      this.updateStatus('running');
      this.messages.push({ role: 'assistant', text: '', ts: Date.now() });
      this.renderMessages();
      return;
    }

    if (event.type === 'text_delta') {
      this.isThinking = false;
      const last = this.messages[this.messages.length - 1];
      if (last && last.role === 'assistant') {
        last.text += (event.text || '');
        this.renderMessages();
      }
    }
  }

  updateStatus(status, errorMsg = null) {
    this.status = status;
    this.errorMsg = errorMsg;
    if (this.statusBadgeEl) {
      this.statusBadgeEl.className = `status-badge ${status}`;
    }
  }

  enableInput(enabled) {
    if (!this.chatInputEl) return;
    if (enabled) {
      this.chatInputEl.removeAttribute('disabled');
      this.sendBtnEl.removeAttribute('disabled');
      this.chatInputEl.focus();
    } else {
      this.chatInputEl.setAttribute('disabled', 'true');
      this.sendBtnEl.setAttribute('disabled', 'true');
    }
  }

  appendSystemMessage(text) {
    this.messages.push({ role: 'system', text, ts: Date.now() });
    this.renderMessages();
  }

  submitMessage() {
    const text = this.chatInputEl.value.trim();
    if (!text || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    this.messages.push({ role: 'user', text, ts: Date.now() });
    this.renderMessages();

    this.chatInputEl.value = '';
    this.chatInputEl.style.height = '20px';

    this.ws.send(JSON.stringify({
      type: 'chat_send',
      prompt: text
    }));

    this.enableInput(false);
  }

  renderMessages() {
    if (!this.messagesContainerEl) return;

    if (this.messages.length === 0) {
      const agentMeta = this.agents[this.selectedAgent] || {};
      const agentName = agentMeta.display_name || agentMeta.label || this.selectedAgent;
      this.messagesContainerEl.innerHTML = `
        <div class="empty-state" style="margin-top: 120px;">
          <div class="empty-icon">💬</div>
          <h3 style="font-size: 16px; font-weight: 600; margin: 12px 0 6px 0;">Chat com @${this.selectedAgent}</h3>
          <p style="font-size: 13px; color: var(--text-muted); max-width: 340px; margin: 0 auto; line-height: 1.5;">
            Digite uma mensagem abaixo para iniciar a conversa. O agente tem acesso às ferramentas do seu workspace.
          </p>
        </div>
      `;
      return;
    }

    this.messagesContainerEl.innerHTML = '';
    this.messages.forEach((m) => {
      const row = document.createElement('div');
      row.className = `message-row ${m.role}`;

      const agentMeta = this.agents[this.selectedAgent] || {};
      const agentName = agentMeta.display_name || agentMeta.label || this.selectedAgent;
      const agentColor = agentMeta.color || 'var(--evo-green, #00FFA7)';

      const isUser = m.role === 'user';
      const senderName = isUser ? 'Você' : agentName;

      row.innerHTML = `
        ${!isUser ? `
          <div class="message-avatar-col">
            <div class="message-avatar" style="background-color: rgba(0, 0, 0, 0.2); border: 1.5px solid ${agentColor}; color: ${agentColor}">
              ${agentName.charAt(0).toUpperCase()}
            </div>
          </div>
        ` : ''}
        <div class="message-body-col">
          <div class="message-sender">${senderName}</div>
          <div class="message-bubble">
            <div class="bubble-content">${this.formatMarkdown(m.text)}</div>
          </div>
        </div>
      `;
      this.messagesContainerEl.appendChild(row);
    });

    if (this.isThinking) {
      const agentMeta = this.agents[this.selectedAgent] || {};
      const agentName = agentMeta.display_name || agentMeta.label || this.selectedAgent;
      const agentColor = agentMeta.color || 'var(--evo-green, #00FFA7)';

      const loaderRow = document.createElement('div');
      loaderRow.className = 'message-row assistant';
      loaderRow.innerHTML = `
        <div class="message-avatar-col">
          <div class="message-avatar" style="background-color: rgba(0, 0, 0, 0.2); border: 1.5px solid ${agentColor}; color: ${agentColor}">
            ${agentName.charAt(0).toUpperCase()}
          </div>
        </div>
        <div class="message-body-col">
          <div class="message-sender">${agentName}</div>
          <div class="message-bubble">
            <div class="typing-indicator">
              <span class="typing-dot"></span>
              <span class="typing-dot"></span>
              <span class="typing-dot"></span>
            </div>
          </div>
        </div>
      `;
      this.messagesContainerEl.appendChild(loaderRow);
    }

    this.messagesContainerEl.scrollTop = this.messagesContainerEl.scrollHeight;
  }

  formatMarkdown(text) {
    if (!text) return '';
    // Very basic markdown parsing for display safety and simplicity
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
      .replace(/`([^`\n]+)`/g, '<code>$1</code>')
      .split('\n')
      .map(line => line.trim() ? `<p>${line}</p>` : '')
      .join('');
  }
}

customElements.define('op-chatplus-page', OPChatPlusPage);
