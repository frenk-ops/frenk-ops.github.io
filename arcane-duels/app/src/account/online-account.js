(function (A) {
  "use strict";

  const SESSION_KEY = "arcane.onlineAccount.session.v1";

  function meta(name) {
    return String(document.querySelector(`meta[name="${name}"]`)?.content || "").trim();
  }

  class OnlineAccount {
    constructor(options = {}) {
      this.url = String(options.url || meta("arcane-supabase-url")).trim().replace(/\/$/, "");
      this.publishableKey = String(options.publishableKey || meta("arcane-supabase-key")).trim();
      this.session = null;
      this.user = null;
      this.profile = null;
      this.progression = null;
      this.rating = null;
      this.lastError = null;
      this.ready = false;
      this.initializing = null;
    }

    configured() {
      return Boolean(this.url && this.publishableKey);
    }

    headers(accessToken = "", extra = {}) {
      return {
        apikey: this.publishableKey,
        Accept: "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...extra
      };
    }

    loadStoredSession() {
      try {
        const stored = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
        if (!stored?.access_token || !stored?.refresh_token) return null;
        return stored;
      } catch {
        return null;
      }
    }

    storeSession(session) {
      this.session = session || null;
      try {
        if (session?.access_token && session?.refresh_token) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
        else localStorage.removeItem(SESSION_KEY);
      } catch {}
      return this.session;
    }

    tokenExpiresSoon(session = this.session) {
      const expiresAt = Number(session?.expires_at || 0) * 1000;
      return !expiresAt || expiresAt - Date.now() < 60 * 1000;
    }

    async authRequest(path, options = {}) {
      const response = await fetch(`${this.url}/auth/v1/${path}`, {
        method: options.method || "GET",
        headers: this.headers(options.accessToken, {
          ...(options.body !== undefined ? { "Content-Type": "application/json" } : {})
        }),
        cache: "no-store",
        body: options.body === undefined ? undefined : JSON.stringify(options.body)
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(payload?.msg || payload?.message || payload?.error_description || payload?.error || `Auth HTTP ${response.status}`);
        error.status = response.status;
        error.code = payload?.code || payload?.error_code;
        throw error;
      }
      return payload;
    }

    async refreshSession() {
      const refreshToken = String(this.session?.refresh_token || "");
      if (!refreshToken) return null;
      try {
        const session = await this.authRequest("token?grant_type=refresh_token", {
          method: "POST",
          body: { refresh_token: refreshToken }
        });
        this.storeSession(session);
        this.user = session.user || this.user;
        return session;
      } catch {
        this.storeSession(null);
        this.user = null;
        return null;
      }
    }

    async signInAnonymously(displayName = "Giocatore") {
      const session = await this.authRequest("signup", {
        method: "POST",
        body: { data: { display_name: String(displayName || "Giocatore").trim().slice(0, 24) || "Giocatore" } }
      });
      this.storeSession(session);
      this.user = session.user || null;
      return session;
    }

    async ensureSession(displayName = "Giocatore") {
      if (!this.configured()) return null;
      if (!this.session) this.storeSession(this.loadStoredSession());
      if (this.session && this.tokenExpiresSoon()) await this.refreshSession();
      if (!this.session) await this.signInAnonymously(displayName);
      this.user = this.session?.user || this.user;
      return this.session;
    }

    async accessToken() {
      if (!this.configured()) return "";
      await this.ensureSession();
      return String(this.session?.access_token || "");
    }

    async rest(path, options = {}) {
      const token = await this.accessToken();
      if (!token) throw new Error("Account online non disponibile.");
      const response = await fetch(`${this.url}/rest/v1/${path}`, {
        method: options.method || "GET",
        headers: this.headers(token, {
          ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
          ...(options.prefer ? { Prefer: options.prefer } : {})
        }),
        cache: "no-store",
        body: options.body === undefined ? undefined : JSON.stringify(options.body)
      });
      const text = await response.text();
      const payload = text ? JSON.parse(text) : null;
      if (!response.ok) {
        const error = new Error(payload?.message || payload?.hint || `Data API HTTP ${response.status}`);
        error.status = response.status;
        throw error;
      }
      return payload;
    }

    async loadProfile() {
      if (!this.user?.id) return null;
      const id = encodeURIComponent(this.user.id);
      const rows = await this.rest(`profiles?user_id=eq.${id}&select=user_id,display_name,username,avatar_url,created_at,updated_at&limit=1`);
      this.profile = rows?.[0] || null;
      return this.profile;
    }

    async loadProgression() {
      if (!this.user?.id) return null;
      const id = encodeURIComponent(this.user.id);
      const rows = await this.rest(`player_progression?user_id=eq.${id}&select=user_id,xp,level,games_played,wins,losses,draws,updated_at&limit=1`);
      this.progression = rows?.[0] || null;
      return this.progression;
    }

    async loadRating(queue = "classic") {
      if (!this.user?.id) return null;
      const id = encodeURIComponent(this.user.id);
      const q = encodeURIComponent(queue);
      const rows = await this.rest(`player_ratings?user_id=eq.${id}&queue=eq.${q}&select=rating,games_played,wins,losses,draws,season_id,updated_at&order=updated_at.desc&limit=1`);
      this.rating = rows?.[0] || { rating: 1000, games_played: 0, wins: 0, losses: 0, draws: 0 };
      return this.rating;
    }

    async refreshData() {
      if (!this.configured()) return null;
      await this.ensureSession();
      await Promise.all([this.loadProfile(), this.loadProgression(), this.loadRating("classic")]);
      return this.snapshot();
    }

    async updateProfile(input = {}) {
      if (!this.user?.id) await this.ensureSession();
      const body = {};
      if (input.displayName !== undefined) body.display_name = String(input.displayName || "").replace(/\s+/g, " ").trim().slice(0, 24) || "Giocatore";
      if (input.username !== undefined) {
        const username = String(input.username || "").trim().toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20);
        if (username && username.length < 3) {
          const error = new Error("Lo username deve contenere almeno 3 caratteri.");
          error.code = "USERNAME_INVALID";
          throw error;
        }
        body.username = username || null;
      }
      if (!Object.keys(body).length) return this.profile;
      body.updated_at = new Date().toISOString();
      const id = encodeURIComponent(this.user.id);
      const rows = await this.rest(`profiles?user_id=eq.${id}&select=user_id,display_name,username,avatar_url,created_at,updated_at`, {
        method: "PATCH",
        body,
        prefer: "return=representation"
      });
      this.profile = rows?.[0] || this.profile;
      return this.profile;
    }

    snapshot() {
      return {
        configured: this.configured(),
        ready: this.ready,
        user: this.user ? {
          id: this.user.id,
          isAnonymous: Boolean(this.user.is_anonymous),
          email: this.user.email || null
        } : null,
        profile: this.profile,
        progression: this.progression,
        rating: this.rating,
        error: this.lastError ? this.lastError.message : null
      };
    }

    async initialize(displayName = "Giocatore") {
      if (this.initializing) return this.initializing;
      this.initializing = (async () => {
        try {
          if (!this.configured()) {
            this.ready = true;
            return this.snapshot();
          }
          await this.ensureSession(displayName);
          await this.refreshData();
          this.lastError = null;
          this.ready = true;
          return this.snapshot();
        } catch (error) {
          this.lastError = error;
          this.ready = true;
          return this.snapshot();
        } finally {
          this.initializing = null;
        }
      })();
      return this.initializing;
    }
  }

  A.OnlineAccount = OnlineAccount;
  A.onlineAccount = new OnlineAccount();
})(window.Arcane = window.Arcane || {});
