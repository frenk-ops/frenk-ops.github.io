(function (A) {
  "use strict";

  class RemoteRoomClient {
    constructor(options = {}) {
      this.baseUrl = String(options.baseUrl || A.MULTIPLAYER_API_URL || "").trim().replace(/\/$/, "");
      this.code = null;
      this.token = null;
      this.side = null;
      this.sequence = 0;
      this.checksum = null;
      this.state = null;
      this.clientVersion = String(options.clientVersion || "");
      this.compatibilityVersion = String(options.compatibilityVersion || this.clientVersion);
      this.protocolVersion = Number(options.protocolVersion || A.MULTIPLAYER_PROTOCOL_VERSION || 0);
    }

    compatibility(options = {}) {
      return {
        ...options,
        clientVersion: this.compatibilityVersion,
        gameVersion: this.clientVersion,
        protocolVersion: this.protocolVersion
      };
    }

    async create(options = {}) {
      return this.accept(await this.request("/api/rooms", {
        method: "POST",
        body: this.compatibility(options)
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
        body: this.compatibility(options)
      }));
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
      return this.accept(await this.request(`/api/rooms/${encodeURIComponent(this.code)}/commands`, {
        method: "POST",
        token: this.token,
        body: {
          sequence: this.sequence + 1,
          previousChecksum: this.checksum,
          type,
          payload
        }
      }));
    }

    async disconnect() {
      if (!this.code || !this.token) return { ok: true };
      return this.request(`/api/rooms/${encodeURIComponent(this.code)}/disconnect`, {
        method: "POST",
        token: this.token
      });
    }

    accept(response) {
      if (response.code) this.code = response.code;
      if (response.token) this.token = response.token;
      if (response.side) this.side = response.side;
      if (Number.isFinite(Number(response.sequence))) this.sequence = Number(response.sequence);
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
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: options.method || "GET",
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body)
      });
      const payload = await response.json();
      if (!response.ok) {
        if (payload.sync) this.accept(payload.sync);
        const error = new Error(payload.error || `Errore HTTP ${response.status}`);
        error.status = response.status;
        error.code = payload.code;
        error.expectedVersion = payload.expectedVersion;
        error.expectedProtocolVersion = payload.expectedProtocolVersion;
        error.sync = payload.sync;
        throw error;
      }
      return payload;
    }
  }

  A.RemoteRoomClient = RemoteRoomClient;
})(window.Arcane = window.Arcane || {});
