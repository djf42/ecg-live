/* =================================================================
   ECG Rhythm Challenge Live: administration
   Instructors and administrators · open sessions · research results
   ================================================================= */
(function () {
  const $ = id => document.getElementById(id);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const SET = window.LIVE_SET, CATS = SET.CATS;
  const catLabel = k => k == null ? "No answer" : ((CATS.find(c => c.key === k) || {}).label || k);
  const rhythmName = r => catLabel(r.cat) + (r.rate ? " " + r.rate + "/min" : r.key === "vfFine" ? " (fine)" : r.key === "vfCoarse" ? " (coarse)" : "");
  const fmtDate = t => t && t.toMillis ? new Date(t.toMillis()).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "–";
  let db, me = null, myRole = null, unsubStaff = null, records = [];

  // ---------- sign-in ----------
  function start() {
    StaffAuth.init(); db = StaffAuth.db;
    StaffAuth.completeEmailLink().catch(err => StaffAuth.panel($("gate"), { title: "Administration", blocked: "That sign-in link didn't work (" + (err.message || err) + "). Request a new one." }));
    StaffAuth.watch((user, role) => {
      me = user; myRole = role;
      $("signOut").classList.toggle("hidden", !user); $("who").textContent = "";
      const ok = role === "owner" || role === "admin";
      $("gate").classList.toggle("hidden", ok); $("app").classList.toggle("hidden", !ok);
      if (!user) return StaffAuth.panel($("gate"), { title: "Administration", lead: "For RECOVER administrators. Sign in with your registered email address." });
      if (!ok) return StaffAuth.panel($("gate"), { title: "Administration", blocked: (user.email || "This account") + " isn't a RECOVER administrator." + (role === "instructor" ? " Instructors run sessions from the projector page." : "") });
      $("who").textContent = user.email + (role === "owner" ? " (owner)" : " (administrator)");
      $("roleAdminOpt").disabled = role !== "owner";
      $("roleAdminOpt").textContent = role === "owner" ? "Administrator" : "Administrator (owner only)";
      showTab(location.hash.slice(1) || "staff");
    });
  }

  // ---------- tabs ----------
  function showTab(name) {
    if (!["staff", "sessions", "results"].includes(name)) name = "staff";
    document.querySelectorAll(".tabs button").forEach(b => b.classList.toggle("on", b.dataset.tab === name));
    document.querySelectorAll(".tab").forEach(t => t.classList.toggle("hidden", t.id !== "tab-" + name));
    history.replaceState(null, "", "#" + name);
    if (name === "staff") loadStaff();
    if (name === "sessions") loadSessions();
    if (name === "results" && !records.length) loadResults();
  }

  // ---------- instructors and administrators ----------
  function loadStaff() {
    if (unsubStaff) return;
    unsubStaff = db.collection("live_staff").onSnapshot(qs => {
      const rows = [];
      ((APP_CONFIG.adminEmails) || []).forEach(e => rows.push({ email: e.toLowerCase(), role: "owner" }));
      qs.forEach(d => rows.push(Object.assign({ email: d.id }, d.data())));
      staffNow = new Set(qs.docs.map(d => d.id));
      staffRoles = {}; qs.docs.forEach(d => staffRoles[d.id] = d.data().role);
      const order = { owner: 0, admin: 1, instructor: 2 };
      rows.sort((a, b) => order[a.role] - order[b.role] || a.email.localeCompare(b.email));
      const tb = $("staffRows"); tb.replaceChildren();
      rows.forEach(r => {
        const tr = el("tr");
        tr.append(el("td", null, r.email), el("td", null, r.role === "owner" ? "Owner" : r.role === "admin" ? "Administrator" : "Instructor"),
                  el("td", "muted", r.addedBy || ""), el("td", "muted", r.addedAt ? fmtDate(r.addedAt) : ""));
        const td = el("td");
        const canRemove = r.role !== "owner" && (myRole === "owner" || r.role === "instructor");
        if (canRemove) { const b = el("button", "link", "Remove"); b.addEventListener("click", () => removeStaff(r)); td.appendChild(b); }
        tr.appendChild(td); tb.appendChild(tr);
      });
      const ni = rows.filter(r => r.role === "instructor").length, na = rows.filter(r => r.role !== "instructor").length;
      $("staffCount").textContent = ni + (ni === 1 ? " instructor" : " instructors") + " · " + na + (na === 1 ? " administrator" : " administrators") + " (including the owner)";
    }, err => { $("staffMsg").textContent = "Couldn't load the list: " + err.message; });
  }
  async function addStaff(e) {
    e.preventDefault();
    const email = $("newEmail").value.trim().toLowerCase(), role = $("newRole").value;
    const msg = $("staffMsg");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { msg.textContent = "Enter a valid email address."; return; }
    if (role === "admin" && myRole !== "owner") { msg.textContent = "Only the owner can add administrators."; return; }
    try {
      await db.collection("live_staff").doc(email).set({ role, addedBy: me.email.toLowerCase(), addedAt: firebase.firestore.FieldValue.serverTimestamp() });
      msg.textContent = "Added " + email + " as " + (role === "admin" ? "an administrator" : "an instructor") + ". They can now sign in with that address.";
      $("newEmail").value = "";
    } catch (err) { msg.textContent = "Couldn't add " + email + ": " + (err.message || err); }
  }
  async function removeStaff(r) {
    if (!confirm("Remove " + r.email + "? They'll no longer be able to " + (r.role === "admin" ? "administer the game or " : "") + "start sessions.")) return;
    try { await db.collection("live_staff").doc(r.email).delete(); $("staffMsg").textContent = "Removed " + r.email + "."; }
    catch (err) { $("staffMsg").textContent = "Couldn't remove " + r.email + ": " + (err.message || err); }
  }

  // ---------- bulk import ----------
  let bulkNew = [], staffNow = new Set(), staffRoles = {}, rmList = [];
  const EMAIL_RE = /[A-Za-z0-9._%+'-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
  function bulkCheck() {
    const raw = $("bulkText").value, rep = $("bulkReport"); rep.replaceChildren();
    const found = [...new Set((raw.match(EMAIL_RE) || []).map(e => e.toLowerCase().replace(/^[.'-]+|[.'-]+$/g, "")))];
    // tokens with an @ that didn't parse as an address
    const bad = [...new Set(raw.split(/[\s,;"<>()\[\]]+/).filter(tok => tok.includes("@") && !/^[A-Za-z0-9._%+'-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(tok)))];
    const owners = (APP_CONFIG.adminEmails || []).map(e => e.toLowerCase());
    bulkNew = found.filter(e => !staffNow.has(e) && !owners.includes(e));
    const already = found.length - bulkNew.length;
    rep.append(el("p", "bulkline", found.length + " addresses found: " + bulkNew.length + " new, " + already + " already listed."));
    if (bad.length) { rep.append(el("p", "bulkline", bad.length + " entries don't look like email addresses and will be skipped:"), el("p", "bulkbad", bad.slice(0, 50).join("  ·  ") + (bad.length > 50 ? "  · …" : ""))); }
    $("bulkAdd").disabled = !bulkNew.length;
    $("bulkAdd").textContent = bulkNew.length ? "Add " + bulkNew.length + " instructor" + (bulkNew.length > 1 ? "s" : "") : "Add instructors";
  }
  async function bulkAdd() {
    const list = bulkNew.slice(), rep = $("bulkReport"), btn = $("bulkAdd");
    if (!list.length) return;
    btn.disabled = true; $("bulkCheck").disabled = true;
    const prog = el("p", "bulkline"); rep.appendChild(prog);
    let done = 0, failed = [];
    for (let i = 0; i < list.length; i += 200) {
      const chunk = list.slice(i, i + 200), b = db.batch();
      chunk.forEach(e => b.set(db.collection("live_staff").doc(e), { role: "instructor", addedBy: me.email.toLowerCase(), addedAt: firebase.firestore.FieldValue.serverTimestamp() }));
      try { await b.commit(); done += chunk.length; } catch (err) { failed = failed.concat(chunk); }
      prog.textContent = "Added " + done + " of " + list.length + "…";
    }
    prog.textContent = "Done: added " + done + " instructor" + (done === 1 ? "" : "s") + "." + (failed.length ? " " + failed.length + " couldn't be added; check them and try again." : "");
    bulkNew = []; btn.textContent = "Add instructors"; $("bulkCheck").disabled = false;
  }

  // ---------- bulk removal (instructors only) ----------
  function parseEmails(raw) {
    const found = [...new Set((raw.match(EMAIL_RE) || []).map(e => e.toLowerCase().replace(/^[.'-]+|[.'-]+$/g, "")))];
    const bad = [...new Set(raw.split(/[\s,;"<>()\[\]]+/).filter(tok => tok.includes("@") && !/^[A-Za-z0-9._%+'-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(tok)))];
    return { found, bad };
  }
  function rmCheck() {
    const { found, bad } = parseEmails($("rmText").value), rep = $("rmReport"); rep.replaceChildren();
    const owners = (APP_CONFIG.adminEmails || []).map(e => e.toLowerCase());
    rmList = found.filter(e => staffRoles[e] === "instructor");
    const admins = found.filter(e => staffRoles[e] === "admin" || owners.includes(e));
    const notListed = found.filter(e => !staffRoles[e] && !owners.includes(e));
    rep.append(el("p", "bulkline", found.length + " addresses found: " + rmList.length + " listed instructor" + (rmList.length === 1 ? "" : "s") + " to remove, " + notListed.length + " not on the list" + (admins.length ? ", " + admins.length + " administrator" + (admins.length > 1 ? "s" : "") + " skipped" : "") + "."));
    if (rmList.length) rep.append(el("p", "bulklist", "To remove: " + rmList.slice(0, 40).join(", ") + (rmList.length > 40 ? ", and " + (rmList.length - 40) + " more" : "")));
    if (admins.length) rep.append(el("p", "bulklist", "Administrators aren't removed in bulk: " + admins.join(", ") + "."));
    if (bad.length) rep.append(el("p", "bulkline", bad.length + " entries don't look like email addresses and will be ignored:"), el("p", "bulkbad", bad.slice(0, 50).join("  ·  ")));
    $("rmGo").disabled = !rmList.length;
    $("rmGo").textContent = rmList.length ? "Remove " + rmList.length + " instructor" + (rmList.length > 1 ? "s" : "") : "Remove instructors";
  }
  async function rmGo() {
    const list = rmList.slice(); if (!list.length) return;
    if (!confirm("Remove " + list.length + " instructor" + (list.length > 1 ? "s" : "") + "? They'll no longer be able to start sessions. You can add them back later if needed.")) return;
    const rep = $("rmReport"), btn = $("rmGo"); btn.disabled = true; $("rmCheck").disabled = true;
    const prog = el("p", "bulkline"); rep.appendChild(prog);
    let done = 0, failed = [];
    for (let i = 0; i < list.length; i += 200) {
      const chunk = list.slice(i, i + 200), b = db.batch();
      chunk.forEach(e => b.delete(db.collection("live_staff").doc(e)));
      try { await b.commit(); done += chunk.length; } catch (err) { failed = failed.concat(chunk); }
      prog.textContent = "Removed " + done + " of " + list.length + "…";
    }
    prog.textContent = "Done: removed " + done + " instructor" + (done === 1 ? "" : "s") + "." + (failed.length ? " " + failed.length + " couldn't be removed; check them and try again." : "");
    rmList = []; btn.textContent = "Remove instructors"; $("rmCheck").disabled = false;
  }

  // ---------- open sessions ----------
  async function loadSessions() {
    const tb = $("sessionRows"); tb.replaceChildren(el("tr", null, ""));
    try {
      const qs = await db.collection("live_sessions").where("status", "==", "open").get();
      const rows = qs.docs.map(d => Object.assign({ id: d.id, ref: d.ref }, d.data())).sort((a, b) => (a.createdAt ? a.createdAt.toMillis() : 0) - (b.createdAt ? b.createdAt.toMillis() : 0));
      tb.replaceChildren();
      const STALE = 6 * 3600 * 1000, nowMs = Date.now();
      rows.forEach(r => {
        const age = r.createdAt ? nowMs - r.createdAt.toMillis() : 0, stale = age > STALE;
        const tr = el("tr", stale ? "stale" : "");
        tr.append(el("td", null, r.code), el("td", null, fmtDate(r.createdAt)), el("td", null, Math.round(age / 60000) + " min" + (stale ? " (stale)" : "")),
                  el("td", null, r.phase + (r.i >= 0 ? " · rhythm " + (r.i + 1) : "")), el("td", null, String((r.board || []).length || "–")));
        const td = el("td"), b = el("button", "link", "Close"); b.addEventListener("click", () => closeSession(r).then(loadSessions)); td.appendChild(b); tr.appendChild(td);
        tb.appendChild(tr);
      });
      $("sessionCount").textContent = rows.length ? rows.length + " open session" + (rows.length > 1 ? "s" : "") + ", " + rows.filter(r => r.createdAt && nowMs - r.createdAt.toMillis() > STALE).length + " older than 6 hours" : "No open sessions right now.";
      $("closeStale").disabled = !rows.some(r => r.createdAt && nowMs - r.createdAt.toMillis() > STALE);
      $("closeStale").onclick = async () => { for (const r of rows) if (r.createdAt && nowMs - r.createdAt.toMillis() > STALE) await closeSession(r); loadSessions(); };
    } catch (err) { $("sessionCount").textContent = "Couldn't load sessions: " + (err.message || err); }
  }
  async function closeSession(r) {
    // close it for the phones and delete its learners' names
    const ps = await r.ref.collection("players").get(), b = db.batch();
    ps.forEach(x => b.delete(x.ref));
    b.update(r.ref, { status: "closed", phase: "ended", board: (r.board || []).map(e => ({ uid: e.uid, total: e.total, rank: e.rank })) });
    await b.commit();
  }

  // ---------- research results ----------
  async function loadResults() {
    $("resMsg").textContent = "Loading results…";
    records = [];
    try {
      let q = db.collection("live_answers").orderBy("date").limit(5000), last = null;
      for (let page = 0; page < 40; page++) {
        const qs = await (last ? q.startAfter(last) : q).get();
        qs.forEach(d => { const v = d.data(); v.dateMs = v.date && v.date.toMillis ? v.date.toMillis() : 0; records.push(v); });
        if (qs.size < 5000) break;
        last = qs.docs[qs.docs.length - 1];
      }
    } catch (err) { $("resMsg").textContent = "Couldn't load results: " + (err.message || err); return; }
    // filter choices from the data
    const roles = [...new Set(records.map(r => r.role).filter(Boolean))].sort(), countries = [...new Set(records.map(r => r.country).filter(Boolean))].sort();
    fillSelect($("fRole"), roles, "All roles"); fillSelect($("fCountry"), countries, "All countries", c => regionName(c));
    $("resMsg").textContent = "";
    renderResults();
  }
  function fillSelect(sel, vals, all, labelFn) {
    const cur = sel.value; sel.replaceChildren(new Option(all, ""));
    vals.forEach(v => sel.appendChild(new Option(labelFn ? labelFn(v) : v, v)));
    sel.value = vals.includes(cur) ? cur : "";
  }
  function regionName(c) { try { return new Intl.DisplayNames(["en"], { type: "region" }).of(c); } catch (e) { return c; } }
  function filtered() {
    const role = $("fRole").value, country = $("fCountry").value;
    const from = $("fFrom").value ? Date.parse($("fFrom").value) : null, to = $("fTo").value ? Date.parse($("fTo").value) + 864e5 : null;
    return records.filter(r => (!role || r.role === role) && (!country || r.country === country) && (!from || r.dateMs >= from) && (!to || r.dateMs < to));
  }
  const median = a => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y), m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const pct = (n, d) => d ? Math.round(n / d * 100) + "%" : "–";
  function renderResults() {
    const rs = filtered();
    $("kRecords").textContent = rs.length.toLocaleString();
    $("kSessions").textContent = new Set(rs.map(r => r.sessionId)).size.toLocaleString();
    $("kLearners").textContent = rs.filter(r => r.round === 0).length.toLocaleString();
    $("kCorrect").textContent = pct(rs.filter(r => r.correct).length, rs.length);
    // per rhythm
    const tb = $("rhythmRows"); tb.replaceChildren();
    SET.RHYTHMS.forEach(rh => {
      const a = rs.filter(r => r.rhythm === rh.key), answered = a.filter(r => r.choice != null), ok = a.filter(r => r.correct);
      const wrong = {}; answered.filter(r => !r.correct).forEach(r => wrong[r.choice] = (wrong[r.choice] || 0) + 1);
      const top = Object.entries(wrong).sort((x, y) => y[1] - x[1])[0];
      const med = median(ok.map(r => r.ms).filter(x => x != null));
      const fastWrong = answered.filter(r => !r.correct && r.ms != null && r.ms < 4000).length;
      const tr = el("tr");
      const bar = el("td"); const track = el("span", "minibar"); const fill = el("i"); fill.style.width = (a.length ? ok.length / a.length * 100 : 0) + "%"; track.appendChild(fill); bar.append(track, el("span", null, " " + pct(ok.length, a.length)));
      tr.append(el("td", "strong", rhythmName(rh)), el("td", null, a.length.toLocaleString()), bar, el("td", null, pct(a.length - answered.length, a.length)),
                el("td", null, med != null ? (med / 1000).toFixed(1) + " s" : "–"), el("td", null, top ? catLabel(top[0]) + " (" + pct(top[1], answered.length) + ")" : "–"),
                el("td", fastWrong >= 3 && fastWrong / Math.max(1, answered.length) > 0.15 ? "flag" : "muted", fastWrong ? fastWrong + " (" + pct(fastWrong, answered.length) + ")" : "–"));
      tb.appendChild(tr);
    });
    // what each rhythm is mistaken for
    const head = $("confHead"); head.replaceChildren(el("th", null, "Rhythm shown"));
    const choices = CATS.map(c => c.key).concat([null]);
    choices.forEach(c => head.appendChild(el("th", null, catLabel(c))));
    const cb = $("confRows"); cb.replaceChildren();
    SET.RHYTHMS.forEach(rh => {
      const a = rs.filter(r => r.rhythm === rh.key), tr = el("tr");
      tr.appendChild(el("td", "strong", rhythmName(rh)));
      choices.forEach(c => {
        const n = a.filter(r => r.choice === c).length, share = a.length ? n / a.length : 0;
        const td = el("td", c === rh.cat ? "diag" : "", a.length ? Math.round(share * 100) + "%" : "–");
        if (c !== rh.cat && share > 0) td.style.background = "rgba(238,60,54," + Math.min(0.55, share * 1.2).toFixed(2) + ")";
        tr.appendChild(td);
      });
      cb.appendChild(tr);
    });
    // by role and by country
    breakdown($("roleRows"), rs, r => r.role || "Not given");
    breakdown($("countryRows"), rs, r => r.country ? regionName(r.country) : "Not given", 15);
  }
  function breakdown(tb, rs, keyFn, limit) {
    const groups = {}; rs.forEach(r => { const k = keyFn(r); (groups[k] = groups[k] || []).push(r); });
    tb.replaceChildren();
    Object.entries(groups).sort((a, b) => b[1].length - a[1].length).slice(0, limit || 99).forEach(([k, a]) => {
      const learners = a.filter(r => r.round === 0).length, tr = el("tr");
      tr.append(el("td", "strong", k), el("td", null, learners.toLocaleString()), el("td", null, pct(a.filter(r => r.correct).length, a.length)));
      tb.appendChild(tr);
    });
  }
  function exportCsv() {
    const rs = filtered(), cols = ["date", "sessionId", "round", "rhythm", "cat", "choice", "correct", "ms", "role", "country"];
    const esc = v => { v = v == null ? "" : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    const lines = [cols.join(",")].concat(rs.map(r => cols.map(c => esc(c === "date" ? (r.dateMs ? new Date(r.dateMs).toISOString() : "") : r[c])).join(",")));
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
    a.download = "ecg-live-results-" + new Date().toISOString().slice(0, 10) + ".csv"; a.click();
  }

  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll(".tabs button").forEach(b => b.addEventListener("click", () => showTab(b.dataset.tab)));
    $("addForm").addEventListener("submit", addStaff);
    $("bulkCheck").addEventListener("click", bulkCheck);
    $("bulkAdd").addEventListener("click", bulkAdd);
    $("bulkText").addEventListener("input", () => { $("bulkAdd").disabled = true; });
    $("rmCheck").addEventListener("click", rmCheck);
    $("rmGo").addEventListener("click", rmGo);
    $("rmText").addEventListener("input", () => { $("rmGo").disabled = true; });
    $("rmFile").addEventListener("change", e => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { $("rmText").value = r.result; rmCheck(); }; r.readAsText(f); e.target.value = ""; });
    $("bulkFile").addEventListener("change", e => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { $("bulkText").value = r.result; bulkCheck(); }; r.readAsText(f); e.target.value = ""; });   // reset so choosing the same file again still works
    $("signOut").addEventListener("click", () => StaffAuth.signOut());
    ["fRole", "fCountry", "fFrom", "fTo"].forEach(id => $(id).addEventListener("change", renderResults));
    $("reload").addEventListener("click", loadResults);
    $("csv").addEventListener("click", exportCsv);
    $("refreshSessions").addEventListener("click", loadSessions);
    start();
  });
  window.LiveAdmin = { reload: loadResults, get records() { return records; } };
})();
