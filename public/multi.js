const FATAL_REASONS = {
  4001: 'match_in_progress',
  4002: 'lobby_full',
  4003: 'invalid_name',
};

// Thin, state-tracking WebSocket client. The server owns every rule; this
// class only sends intent (join, start, direction) and stores snapshots.
export class MultiClient {
  constructor(options = {}) {
    this.createSocket = options.createSocket ?? ((url) => new WebSocket(url));
    this.onWelcome = options.onWelcome ?? (() => {});
    this.onState = options.onState ?? (() => {});
    this.onError = options.onError ?? (() => {});
    this.onFatal = options.onFatal ?? (() => {});
    this.socket = null;
    this.playerId = null;
    this.hostId = null;
    this.state = null;
    this.lastErrorCode = null;
    this._leaving = false;
  }

  open(url) {
    const socket = this.createSocket(url);
    socket.onmessage = (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      this._receive(message);
    };
    socket.onclose = (event) => {
      if (this._leaving) return;
      const code = (event && event.code) || 1006;
      const reason = FATAL_REASONS[code] ?? this.lastErrorCode ?? 'disconnected';
      this.onFatal({ code, reason });
    };
    socket.onerror = () => {};
    this.socket = socket;
    return socket;
  }

  _receive(message) {
    if (!message || typeof message.type !== 'string') return;
    switch (message.type) {
      case 'welcome':
        this.playerId = message.playerId ?? null;
        this.hostId = message.hostId ?? null;
        this.onWelcome(message);
        break;
      case 'state':
        this.hostId = message.hostId ?? this.hostId;
        this.state = message;
        this.onState(message);
        break;
      case 'error':
        this.lastErrorCode = typeof message.code === 'string' ? message.code : 'error';
        this.onError(message);
        break;
      default:
        break;
    }
  }

  send(object) {
    if (this.socket && typeof this.socket.send === 'function') {
      this.socket.send(JSON.stringify(object));
    }
  }

  join(name) {
    this.send({ type: 'join', name });
  }

  start() {
    this.send({ type: 'start' });
  }

  turn(dir) {
    this.send({ type: 'direction', dir });
  }

  isHost() {
    return this.playerId !== null && this.playerId === this.hostId;
  }

  getState() {
    return this.state;
  }

  leave() {
    if (!this.socket) return;
    this._leaving = true;
    this.send({ type: 'leave' });
    if (typeof this.socket.close === 'function') this.socket.close();
    this.socket = null;
  }
}
