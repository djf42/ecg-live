/* =================================================================
   TESTING ONLY: an in-browser stand-in for Firebase, used when the page address
   contains ?mock. Tabs in the same browser share it, so a projector tab and several
   phone tabs can play together without a real database. Has no effect otherwise.
   ================================================================= */
(function () {
  if (!/[?&]mock\b/.test(location.search)) return;
  const KEY = "mockfs", SERVER = { __server: true };
  const bc = new BroadcastChannel("mockfs"), listeners = new Set();
  const load = () => JSON.parse(localStorage.getItem(KEY) || "{}");
  const save = d => localStorage.setItem(KEY, JSON.stringify(d));
  const ts = ms => ({ __ts: ms, toMillis: () => ms });
  const hydrate = v => { if (v && typeof v === "object") { if ("__ts" in v) return ts(v.__ts); if (Array.isArray(v)) return v.map(hydrate); const o = {}; for (const k in v) o[k] = hydrate(v[k]); return o; } return v; };
  const dehydrate = v => { if (v === SERVER) return { __ts: Date.now() }; if (v && v.__ts != null) return { __ts: v.__ts }; if (Array.isArray(v)) return v.map(dehydrate); if (v && typeof v === "object") { const o = {}; for (const k in v) o[k] = dehydrate(v[k]); return o; } return v; };
  const notify = () => listeners.forEach(f => f());
  bc.onmessage = () => notify();
  const changed = () => { bc.postMessage(1); setTimeout(notify, 0); };
  const newId = () => Math.random().toString(36).slice(2, 12);

  // the answer-window rule from the real database rules: current rhythm, once, within 11 s of opening
  const OWNER = "dan.fletcher@recoverinitiative.org";
  function staffRole(db) { const u = AUTH.currentUser; if (!u || u.isAnonymous || !u.email) return ""; if (u.email === OWNER) return "owner"; const d = db["live_staff/" + u.email]; return d ? d.role : ""; }
  function checkRules(path, data, db) {
    if (/^live_sessions\/[^/]+$/.test(path) && !db[path] && !["owner", "admin", "instructor"].includes(staffRole(db))) return "only listed instructors can start sessions";
    if (/^live_staff\//.test(path)) { const r = staffRole(db); if (!(r === "owner" || (r === "admin" && data.role === "instructor"))) return "not allowed to change staff"; }
    if (/^live_sessions\/[^/]+\/players\/[^/]+$/.test(path) && db[path]) return "player already joined (set on an existing document counts as an update)";
    const m = path.match(/^live_sessions\/([^/]+)\/answers\/([^/]+)$/);
    if (!m) return null;
    const ses = db["live_sessions/" + m[1]];
    if (db[path]) return "already answered";
    if (!ses || ses.i !== data.round) return "not the current rhythm";
    if (!ses.roundStartAt || Date.now() > ses.roundStartAt.__ts + 11000) return "window closed";
    return null;
  }
  function docRef(path) {
    return {
      id: path.split("/").pop(), path,
      get ref() { return docRef(path); },
      collection: n => colRef(path + "/" + n),
      set(d) { const db = load(); const bad = checkRules(path, d, db); if (bad) return Promise.reject(new Error("permission-denied: " + bad)); db[path] = dehydrate(d); save(db); changed(); return Promise.resolve(); },
      update(d) { const db = load(); if (!db[path]) return Promise.reject(new Error("no document")); db[path] = Object.assign(db[path], dehydrate(d)); save(db); changed(); return Promise.resolve(); },
      delete() { const db = load(); if (/^live_staff\//.test(path)) { const r = staffRole(db), cur = db[path]; if (!(r === "owner" || (r === "admin" && cur && cur.role === "instructor"))) return Promise.reject(new Error("permission-denied")); } delete db[path]; save(db); changed(); return Promise.resolve(); },
      get: () => Promise.resolve(docSnap(path)),
      onSnapshot(cb) { let last; const f = () => { const s = JSON.stringify(load()[path]); if (s !== last) { last = s; cb(docSnap(path)); } }; listeners.add(f); setTimeout(f, 0); return () => listeners.delete(f); }
    };
  }
  function docSnap(path) { const d = load()[path]; return { id: path.split("/").pop(), exists: !!d, ref: docRef(path), data: () => d ? hydrate(d) : undefined }; }
  function colRef(path, filters, lim) {
    filters = filters || [];
    return {
      doc: id => docRef(path + "/" + (id || newId())),
      add(d) { const r = docRef(path + "/" + newId()); return r.set(d).then(() => r); },
      where: (f, op, v) => colRef(path, filters.concat([[f, op, v]]), lim),
      limit: n => colRef(path, filters, n),
      orderBy: () => colRef(path, filters, lim),
      startAfter: () => colRef(path, filters.concat([["__none__", "==", 1]]), lim),
      get: () => Promise.resolve(query(path, filters, lim, null)),
      onSnapshot(cb) { let prev = null; const f = () => { const q = query(path, filters, lim, prev); if (q._changed) cb(q); prev = q._map; }; listeners.add(f); setTimeout(f, 0); return () => listeners.delete(f); }
    };
  }
  function query(path, filters, lim, prev) {
    const db = load(), depth = path.split("/").length + 1;
    let keys = Object.keys(db).filter(k => k.startsWith(path + "/") && k.split("/").length === depth)
      .filter(k => filters.every(([f, op, v]) => op !== "==" || hydrate(db[k])[f] === v));
    if (lim) keys = keys.slice(0, lim);
    const map = {}; keys.forEach(k => map[k] = JSON.stringify(db[k]));
    const changes = [];
    keys.forEach(k => { if (!prev || !(k in prev)) changes.push({ type: "added", doc: docSnap(k) }); else if (prev[k] !== map[k]) changes.push({ type: "modified", doc: docSnap(k) }); });
    if (prev) Object.keys(prev).forEach(k => { if (!(k in map)) changes.push({ type: "removed", doc: { id: k.split("/").pop(), data: () => ({}) } }); });
    const snaps = keys.map(docSnap);
    return { empty: !keys.length, size: keys.length, docs: snaps, forEach: fn => snaps.forEach(fn), docChanges: () => changes, _map: map, _changed: !prev || changes.length > 0 };
  }
  // a batch is applied in one go (one read, one save, one notification), like Firestore's atomic batches
  function batch() {
    const ops = [];
    return {
      set(r, d) { ops.push(["set", r.path, d]); }, update(r, d) { ops.push(["update", r.path, d]); }, delete(r) { ops.push(["delete", r.path]); },
      commit() {
        const db = load();
        for (const [op, path, d] of ops) {
          if (op === "set") { const bad = checkRules(path, d, db); if (bad) return Promise.reject(new Error("permission-denied: " + bad)); db[path] = dehydrate(d); }
          else if (op === "update") { if (!db[path]) return Promise.reject(new Error("no document")); db[path] = Object.assign(db[path], dehydrate(d)); }
          else delete db[path];
        }
        save(db); changed(); return Promise.resolve();
      }
    };
  }
  const authListeners = [];
  const AUTH = {
    currentUser: null,
    _emit() { authListeners.forEach(cb => cb(this.currentUser)); },
    signInAnonymously() { let id = sessionStorage.getItem("mockuid"); if (!id) { id = "u_" + newId(); sessionStorage.setItem("mockuid", id); } this.currentUser = { uid: id, isAnonymous: true }; this._emit(); return Promise.resolve({ user: this.currentUser }); },
    signInWithPopup() { const email = (sessionStorage.getItem("mockEmail") || OWNER).toLowerCase(); this.currentUser = { uid: "g_" + email.replace(/[^a-z0-9]/g, ""), email, isAnonymous: false, emailVerified: true }; sessionStorage.setItem("mockStaff", email); this._emit(); return Promise.resolve({ user: this.currentUser }); },
    signOut() { this.currentUser = null; sessionStorage.removeItem("mockStaff"); this._emit(); return Promise.resolve(); },
    isSignInWithEmailLink: () => false,
    sendSignInLinkToEmail: () => Promise.resolve(),
    onAuthStateChanged(cb) { authListeners.push(cb); setTimeout(() => cb(this.currentUser), 0); return () => {}; }
  };
  // stay signed in across reloads in the same tab, like Firebase does
  if (sessionStorage.getItem("mockStaff")) { const e = sessionStorage.getItem("mockStaff"); AUTH.currentUser = { uid: "g_" + e.replace(/[^a-z0-9]/g, ""), email: e, isAnonymous: false, emailVerified: true }; }
  const DB = { collection: n => colRef(n), doc: p => docRef(p), batch };
  function GoogleAuthProvider() {}
  window.firebase = { apps: [], initializeApp() { this.apps.push({}); }, auth: Object.assign(() => AUTH, { GoogleAuthProvider }), firestore: Object.assign(() => DB, { FieldValue: { serverTimestamp: () => SERVER } }) };
  window.MockFS = { reset() { localStorage.removeItem(KEY); }, dump: load };
})();
