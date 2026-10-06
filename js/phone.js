/* =================================================================
   ECG Rhythm Challenge Live: the learner's phone
   Join with a code and a display name, answer each rhythm, see your points and rank.
   ================================================================= */
(function () {
  const $ = id => document.getElementById(id);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const CATS = window.LIVE_SET.CATS, TOTAL = window.LIVE_SET.RHYTHMS.length, ANSWER_S = 10;
  const ROLES = ["Student", "Technician/nurse", "Veterinarian", "Veterinary specialist", "Technician specialist"];
  const COUNTRIES = "AF AL DZ AD AO AG AR AM AU AT AZ BS BH BD BB BY BE BZ BJ BT BO BA BW BR BN BG BF BI CV KH CM CA CF TD CL CN CO KM CG CD CR CI HR CU CY CZ DK DJ DM DO EC EG SV GQ ER EE SZ ET FJ FI FR GA GM GE DE GH GR GD GT GN GW GY HT HN HK HU IS IN ID IR IQ IE IL IT JM JP JO KZ KE KI KW KG LA LV LB LS LR LY LI LT LU MO MG MW MY MV ML MT MH MR MU MX FM MD MC MN ME MA MZ MM NA NR NP NL NZ NI NE NG MK NO OM PK PW PS PA PG PY PE PH PL PT PR QA RO RU RW KN LC VC WS SM ST SA SN RS SC SL SG SK SI SB SO ZA KR SS ES LK SD SR SE CH SY TW TJ TZ TH TL TG TO TT TN TR TM TV UG UA AE GB US UY UZ VU VE VN YE ZM ZW".split(" ");

  let db, uid, sref, me = null, unsub = null;
  let openedRound = -1, openedAt = 0, timer = null;
  const answered = {};          // round -> choice (or "late")

  // ---------- start ----------
  async function init() {
    try {
      if (!firebase.apps.length) firebase.initializeApp(APP_CONFIG.firebase);
      const auth = firebase.auth(); db = firebase.firestore();
      if (!auth.currentUser) await auth.signInAnonymously();
      uid = auth.currentUser.uid;
    } catch (err) { return showError("Couldn't connect. Check your internet connection and reload. (" + (err.message || err) + ")"); }
    const code = (new URLSearchParams(location.search).get("code") || "").toUpperCase().replace(/[^A-Z]/g, "");
    if (code) findSession(code); else showCodeForm();
  }

  function showCodeForm(msg) {
    screen("code");
    $("codeMsg").textContent = msg || "";
    $("codeInput").focus();
  }
  async function findSession(code) {
    screen("loading");
    try {
      const qs = await db.collection("live_sessions").where("code", "==", code).where("status", "==", "open").limit(1).get();
      if (qs.empty) return showCodeForm("No open session with the code " + code + ". Check the code on the screen.");
      sref = qs.docs[0].ref;
      const mine = await sref.collection("players").doc(uid).get();
      if (mine.exists) { me = mine.data(); return listen(); }      // rejoining after a reload
      showNameForm();
    } catch (err) { showError("Couldn't find the session. (" + (err.message || err) + ")"); }
  }

  function showNameForm() {
    screen("name");
    const role = $("roleSel"), country = $("countrySel");
    if (!role.options.length) {
      role.appendChild(new Option("Prefer not to say", ""));
      ROLES.forEach(r => role.appendChild(new Option(r, r)));
      country.appendChild(new Option("Prefer not to say", ""));
      let names;
      try { const dn = new Intl.DisplayNames(["en"], { type: "region" }); names = COUNTRIES.map(c => [c, dn.of(c)]); } catch (e) { names = COUNTRIES.map(c => [c, c]); }
      names.sort((a, b) => a[1].localeCompare(b[1])).forEach(([c, n]) => country.appendChild(new Option(n, c)));
    }
    $("nameInput").focus();
  }
  async function join() {
    const name = $("nameInput").value.trim().replace(/\s+/g, " ").slice(0, 24);
    if (!name) { $("nameMsg").textContent = "Enter a name to show on the leaderboard."; return; }
    $("joinBtn").disabled = true;
    me = { name, role: $("roleSel").value || null, country: $("countrySel").value || null, joinedAt: firebase.firestore.FieldValue.serverTimestamp() };
    try { await sref.collection("players").doc(uid).set(me); listen(); }
    catch (err) { $("joinBtn").disabled = false; $("nameMsg").textContent = "Couldn't join: " + (err.message || err); }
  }

  // ---------- follow the projected screen ----------
  function listen() {
    screen("play");
    $("who").textContent = me.name;
    if (unsub) unsub();
    unsub = sref.onSnapshot(snap => render(snap.data() || {}), err => showError("Lost the connection to the session. (" + (err.message || err) + ")"));
  }

  function render(d) {
    const box = $("play"); box.replaceChildren();
    const k = d.i, phase = d.status === "closed" ? "ended" : d.phase;
    const mineRow = (d.board || []).find(b => b.uid === uid);
    const players = (d.board || []).length;
    $("round").textContent = k >= 0 && phase !== "lobby" ? "Rhythm " + (k + 1) + " of " + TOTAL : "";
    if (timer && phase !== "answer") { clearInterval(timer); timer = null; }

    if (phase === "lobby") {
      box.append(el("div", "big", "You're in!"), el("p", "lead", "Watch the screen. The first rhythm starts soon."));
    } else if (phase === "ready" || phase === "compress") {
      box.append(el("div", "pulse"), el("div", "big", "Watch the screen"), el("p", "lead", phase === "compress" ? "Compressions are underway. The answer buttons appear when they stop." : "Get ready for rhythm " + (k + 1) + "."));
    } else if (phase === "answer") {
      if (answered[k]) return lockedView(box, answered[k]);
      if (openedRound !== k) { openedRound = k; openedAt = Date.now(); }
      const left = Math.max(0, ANSWER_S - (Date.now() - openedAt) / 1000);
      const cd = el("div", "count", String(Math.ceil(left))); cd.id = "count";
      box.append(el("p", "ask", "What's the rhythm?"), cd);
      const grid = el("div", "answers");
      CATS.forEach(c => {
        const b = el("button", "ans", c.label); b.type = "button"; b.dataset.cat = c.key;
        b.addEventListener("click", () => send(k, c.key));
        grid.appendChild(b);
      });
      box.appendChild(grid);
      if (!timer) timer = setInterval(() => {
        const l = Math.max(0, ANSWER_S - (Date.now() - openedAt) / 1000), c = $("count");
        if (c) { c.textContent = Math.ceil(l); c.classList.toggle("low", l <= 3); }
        if (l <= 0) { clearInterval(timer); timer = null; if (!answered[k]) { answered[k] = "late"; lockedView($("play"), "late"); } }
      }, 200);
    } else if (phase === "closed" || phase === "results" || phase === "algo") {
      const a = answered[k];
      box.append(el("div", "big", "Time's up"),
                 el("p", "lead", a && a !== "late" ? "Your answer: " + label(a) : "No answer this time."),
                 el("p", "lead muted", "Watch the screen while the group works through the algorithm."));
    } else if (phase === "answer2" || phase === "board") {
      if (!mineRow) { box.append(el("div", "big", "Watch the screen")); return; }
      const res = el("div", "result " + (mineRow.correct ? "ok" : "no"));
      res.append(el("div", "rverdict", mineRow.correct ? "Correct" : mineRow.answered ? "Not this time" : "No answer"),
                 el("div", "rpts", "+" + (mineRow.last || 0).toLocaleString()));
      box.append(res, el("p", "total", mineRow.total.toLocaleString() + " points"), el("p", "rank", ordinal(mineRow.rank) + " of " + players));
    } else if (phase === "final" || phase === "ended") {
      box.append(el("div", "big", phase === "ended" ? "Session ended" : "Final results"));
      if (mineRow) box.append(el("p", "total", mineRow.total.toLocaleString() + " points"), el("p", "rank", "You finished " + ordinal(mineRow.rank) + " of " + players));
      box.append(el("p", "lead muted", "Thanks for playing. Your name has been removed from the session."));
      if (phase === "ended" && unsub) { unsub(); unsub = null; }
    }
  }

  function lockedView(box, choice) {
    box.replaceChildren();
    if (choice === "late") box.append(el("div", "big", "Time's up"), el("p", "lead", "No answer this time. Watch the screen."));
    else box.append(el("div", "locked", "Locked in"), el("div", "choice", label(choice)), el("p", "lead muted", "Watch the screen for the results."));
  }
  async function send(k, cat) {
    if (answered[k]) return;
    answered[k] = cat;
    document.querySelectorAll(".ans").forEach(b => { b.disabled = true; b.classList.toggle("picked", b.dataset.cat === cat); });
    if (timer) { clearInterval(timer); timer = null; }
    try {
      await sref.collection("answers").doc(k + "_" + uid).set({ uid, round: k, choice: cat, at: firebase.firestore.FieldValue.serverTimestamp() });
      lockedView($("play"), cat);
    } catch (err) {
      answered[k] = "late";
      lockedView($("play"), "late");
      $("play").appendChild(el("p", "lead muted", "Your answer arrived after the window closed."));
    }
  }

  // ---------- helpers ----------
  const label = k => (CATS.find(c => c.key === k) || {}).label || k;
  const ordinal = n => { const s = ["th", "st", "nd", "rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
  function screen(name) { ["loading", "code", "name", "play", "error"].forEach(s => $("s-" + s).classList.toggle("hidden", s !== name)); }
  function showError(msg) { screen("error"); $("errMsg").textContent = msg; }

  document.addEventListener("DOMContentLoaded", () => {
    $("codeForm").addEventListener("submit", e => { e.preventDefault(); const c = $("codeInput").value.toUpperCase().replace(/[^A-Z]/g, ""); if (c.length === 4) findSession(c); else $("codeMsg").textContent = "The code has 4 letters."; });
    $("nameForm").addEventListener("submit", e => { e.preventDefault(); join(); });
    init();
  });
})();
