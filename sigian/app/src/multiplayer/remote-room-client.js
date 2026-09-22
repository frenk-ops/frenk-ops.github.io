(function (A) {
  "use strict";

  class RemoteRoomClient {
    constructor(options = {}) {
      this.baseUrl = String(options.baseUrl || A.MULTIPLAYER_API_URL || "").trim().replace(/\/$/, "");
      this.code = null;
      this.token = null;
      this.side = null;
      this.sequence = 0;
      this.matchNumber = 0;
      this.checksum = null;
      this.state = null;
      this.clientVersion = String(options.clientVersion || "");
      this.compatibilityVersion = String(options.compatibilityVersion || this.clientVersion);
      this.protocolVersion = Number(options.protocolVersion || A.MULTIPLAYER_PROTOCOL_VERSION || 0);
      this.pendingSubmit = null;
      this.identityTokenProvider = typeof options.identityTokenProvider === "function"
        ? options.identityTokenProvider
        : null;
      this.connection = {
        latencyMs: null,
        lastSuccessAt: null,
        lastFailureAt: null,
        consecutiveFailures: 0
      };
    }

    createRequestId() {
      return globalThis.crypto?.randomUUID?.()
        || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    }

    connectionMetrics() {
      return { ...this.connection };
    }

    recordConnectionSuccess(latencyMs) {
      const measured = Math.max(0, Number(latencyMs || 0));
      const previous = Number(this.connection.latencyMs);
      this.connection.latencyMs = Number.isFinite(previous)
        ? Math.round((previous * 0.65) + (measured * 0.35))
        : Math.round(measured);
      this.connection.lastSuccessAt = Date.now();
      this.connection.consecutiveFailures = 0;
    }

    recordConnectionFailure() {
      this.connection.lastFailureAt = Date.now();
      this.connection.consecutiveFailures = Number(this.connection.consecutiveFailures || 0) + 1;
    }

    compatibility(options = {}) {
      return {
        ...options,
        clientVersion: this.compatibilityVersion,
        gameVersion: this.clientVersion,
        protocolVersion: this.protocolVersion
      };
    }

    async listRooms(options = {}) {
      const params = new URLSearchParams({
        clientVersion: this.compatibilityVersion,
        gameVersion: this.clientVersion,
        protocolVersion: String(this.protocolVersion),
        availableOnly: options.availableOnly === false ? "0" : "1"
      });
      return this.request(`/api/rooms?${params}`);
    }

    async create(options = {}) {
      return this.accept(await this.request("/api/rooms", {
        method: "POST",
        body: this.compatibility(options),
        identity: true
      }));
    }

    async inspect(code) {
      const params = new URLSearchParams({
        clientVersion: this.compatibilityVersion,
        gameVersion: this.clientVersion,
        protocolVersion: String(this.protocolVersion)
      });
      return this.request(`/api/rooms/${encodeURIComponent(code)}/info?${params}`);
    }

    async join(code, options = {}) {
      return this.accept(await this.request(`/api/rooms/${encodeURIComponent(code)}/join`, {
        method: "POST",
        body: this.compatibility(options),
        identity: true
      }));
    }

    async queueRanked(format = "classic", playerName = "Giocatore") {
      const response = await this.request("/api/ranked/queue", {
        method: "POST",
        body: { format, playerName },
        identity: true,
        requireIdentity: true
      });
      if (response?.status === "matched" && response.room) response.room = this.accept(response.room);
      return response;
    }

    async rankedStatus(ticket) {
      const response = await this.request(`/api/ranked/queue/${encodeURIComponent(ticket)}`, {
        identity: true,
        requireIdentity: true
      });
      if (response?.status === "matched" && response.room) response.room = this.accept(response.room);
      return response;
    }

    async cancelRanked(ticket) {
      return this.request(`/api/ranked/queue/${encodeURIComponent(ticket)}/cancel`, {
        method: "POST",
        identity: true,
        requireIdentity: true
      });
    }

    async rankedLeaderboard(format = "classic", limit = 20) {
      const params = new URLSearchParams({
        format: format === "grimoire" ? "grimoire" : "classic",
        limit: String(Math.max(1, Math.min(100, Number(limit || 20))))
      });
      return this.request(`/api/ranked/leaderboard?${params}`, {
        identity: true,
        requireIdentity: true
      });
    }

    async reconnect() {
      this.ensureIdentity();
      return this.accept(await this.request(
        `/api/rooms/${encodeURIComponent(this.code)}/state?afterSequence=${this.sequence}`,
        { token: this.token }
      ));
    }

    async submit(type, payload = {}) {
      this.ensureIdentity();
      if (this.pendingSubmit) return this.pendingSubmit;
      const body = {
        requestId: this.createRequestId(),
        sequence: this.sequence + 1,
        previousChecksum: this.checksum,
        type,
        payload
      };
      const send = () => this.request(`/api/rooms/${encodeURIComponent(this.code)}/commands`, {
        method: "POST",
        token: this.token,
        body
      });
      this.pendingSubmit = (async () => {
        try {
          return this.accept(await send());
        } catch (error) {
          if (!error?.network) throw error;
          await new Promise(resolve => setTimeout(resolve, 220));
          return this.accept(await send());
        }
      })();
      try {
        return await this.pendingSubmit;
      } finally {
        this.pendingSubmit = null;
      }
    }

    async heartbeat() {
      this.ensureIdentity();
      return this.request(`/api/rooms/${encodeURIComponent(this.code)}/heartbeat`, {
        method: "POST",
        token: this.token
      });
    }

    async disconnect() {
      if (!this.code || !this.token) return { ok: true };
      return this.request(`/api/rooms/${encodeURIComponent(this.code)}/disconnect`, {
        method: "POST",
        token: this.token
      });
    }

    async leave() {
      if (!this.code || !this.token) return { ok: true };
      return this.request(`/api/rooms/${encodeURIComponent(this.code)}/leave`, {
        method: "POST",
        token: this.token
      });
    }

    async forfeit() {
      this.ensureIdentity();
      return this.accept(await this.request(`/api/rooms/${encodeURIComponent(this.code)}/forfeit`, {
        method: "POST",
        token: this.token
      }));
    }

    async updateSettings(options = {}) {
      this.ensureIdentity();
      return this.accept(await this.request(`/api/rooms/${encodeURIComponent(this.code)}/settings`, {
        method: "POST",
        token: this.token,
        body: options
      }));
    }

    async setReady(ready) {
      this.ensureIdentity();
      return this.accept(await this.request(`/api/rooms/${encodeURIComponent(this.code)}/ready`, {
        method: "POST",
        token: this.token,
        body: { ready: Boolean(ready) }
      }));
    }

    async rematch(action, mode = undefined) {
      this.ensureIdentity();
      return this.accept(await this.request(`/api/rooms/${encodeURIComponent(this.code)}/rematch`, {
        method: "POST",
        token: this.token,
        body: { action, ...(mode ? { mode } : {}) }
      }));
    }

    async sessionAction(action) {
      this.ensureIdentity();
      return this.accept(await this.request(`/api/rooms/${encodeURIComponent(this.code)}/session`, {
        method: "POST",
        token: this.token,
        body: { action }
      }));
    }

    async sendMessage(text) {
      this.ensureIdentity();
      return this.request(`/api/rooms/${encodeURIComponent(this.code)}/messages`, {
        method: "POST",
        token: this.token,
        body: { kind: "text", text }
      });
    }

    async sendPhrase(phraseId) {
      this.ensureIdentity();
      return this.request(`/api/rooms/${encodeURIComponent(this.code)}/messages`, {
        method: "POST",
        token: this.token,
        body: { kind: "phrase", phraseId }
      });
    }

    accept(response) {
      if (response.code) this.code = response.code;
      if (response.token) this.token = response.token;
      if (response.side) this.side = response.side;
      const incomingMatchNumber = Number(response.matchNumber || 0);
      if (Number.isFinite(incomingMatchNumber) && incomingMatchNumber > 0 && this.matchNumber > 0 && incomingMatchNumber < this.matchNumber) {
        return {
          ...response,
          stale: true,
          matchNumber: this.matchNumber,
          sequence: this.sequence,
          checksum: this.checksum,
          state: this.state,
          commands: [],
          actions: []
        };
      }
      if (Number.isFinite(incomingMatchNumber) && incomingMatchNumber > this.matchNumber) {
        this.matchNumber = incomingMatchNumber;
        this.sequence = 0;
        this.checksum = null;
        this.state = null;
      } else if (Number.isFinite(incomingMatchNumber) && incomingMatchNumber > 0 && this.matchNumber === 0) {
        this.matchNumber = incomingMatchNumber;
      }
      const incomingSequence = Number(response.sequence);
      const hasSequence = Number.isFinite(incomingSequence);
      if (hasSequence && incomingSequence < this.sequence) {
        return {
          ...response,
          stale: true,
          sequence: this.sequence,
          checksum: this.checksum,
          state: this.state,
          commands: [],
          actions: []
        };
      }
      if (hasSequence) this.sequence = incomingSequence;
      if (response.checksum) this.checksum = response.checksum;
      if (response.state) this.state = response.state;
      return response;
    }

    ensureIdentity() {
      if (!this.code || !this.token) throw new Error("Il client non è collegato a una stanza.");
    }

    async request(path, options = {}) {
      const headers = { Accept: "application/json" };
      if (options.body !== undefined) headers["Content-Type"] = "application/json";
      if (options.token) headers.Authorization = `Bearer ${options.token}`;
      if (options.identity && this.identityTokenProvider) {
        const identityToken = String(await this.identityTokenProvider() || "");
        if (identityToken) headers["X-Arcane-Identity"] = identityToken;
        else if (options.requireIdentity) {
          const error = new Error("Account Arcane Duels non disponibile.");
          error.code = "ACCOUNT_REQUIRED";
          throw error;
        }
      } else if (options.requireIdentity) {
        const error = new Error("Account Arcane Duels non disponibile.");
        error.code = "ACCOUNT_REQUIRED";
        throw error;
      }
      const startedAt = Date.now();
      let response;
      let payload;
      try {
        response = await fetch(`${this.baseUrl}${path}`, {
          method: options.method || "GET",
          headers,
          cache: "no-store",
          body: options.body === undefined ? undefined : JSON.stringify(options.body)
        });
        payload = await response.json();
        this.recordConnectionSuccess(Date.now() - startedAt);
      } catch (cause) {
        this.recordConnectionFailure();
        const error = cause instanceof Error ? cause : new Error("Connessione al server interrotta.");
        error.network = true;
        throw error;
      }
      if (!response.ok) {
        if (payload.sync) this.accept(payload.sync);
        const error = new Error(payload.error || `Errore HTTP ${response.status}`);
        error.status = response.status;
        error.code = payload.code;
        error.expectedVersion = payload.expectedVersion;
        error.expectedProtocolVersion = payload.expectedProtocolVersion;
        error.retryAfterMs = payload.retryAfterMs;
        error.sync = payload.sync;
        throw error;
      }
      return payload;
    }
  }

  A.RemoteRoomClient = RemoteRoomClient;
})(window.Arcane = window.Arcane || {});
