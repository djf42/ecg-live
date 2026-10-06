/* =================================================================
   ECG Rhythm Challenge Live: projected display
   Live mode: learners join and answer on their phones through Firebase.
   Demo mode (?demo, or when Firebase can't load): a simulated class of 24.
   ================================================================= */
(function () {
  const SET = window.LIVE_SET, R = SET.RHYTHMS;
  const $ = id => document.getElementById(id);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const now = () => performance.now() / 1000;
  const COMPRESS_S = 3, ANSWER_S = 10;
  const catLabel = k => (SET.CATS.find(c => c.key === k) || {}).label || k;

  // ---------- simulated class (replaced by real phones in stage 2) ----------
  const NAMES = ["Alex R.", "Priya S.", "Sam K.", "Jordan M.", "Maria G.", "Chen L.", "Fatima A.", "Tom B.", "Aisha N.", "Lucas P.", "Hana T.", "Diego F.",
                 "Emma W.", "Kofi O.", "Sofia V.", "Liam D.", "Yuki H.", "Noah C.", "Zara E.", "Mateo J.", "Grace I.", "Omar Q.", "Ines Z.", "Ben U."];
  const DIFFICULTY = { pvt216: .75, pvt294: .70, vfFine: .80, vfCoarse: .50, pea84: .75, pea182: .45, asys: .92, rosc142: .85 };
  const CONFUSE = { pvt: [["pea", .5], ["vf", .4], ["rosc", .1]], vf: [["pvt", .6], ["pea", .2], ["asys", .2]], pea: [["pvt", .55], ["rosc", .35], ["vf", .1]],
                    asys: [["vf", .7], ["pea", .3]], rosc: [["pea", .9], ["pvt", .1]] };
  const pick = list => { let x = Math.random(), acc = 0; for (const [k, w] of list) { acc += w; if (x <= acc) return k; } return list[0][0]; };

  // ---------- backends: Live (Firebase) and Demo (simulated class) ----------
  const LIVE = !!(window.firebase && window.APP_CONFIG && !/[?&]demo\b/.test(location.search));
  const GRACE_MS = 1500;   // answers sent just before zero still arrive and count
  let db, uid, sref, unsubPlayers, unsubAnswers, unsubSession, roundStartMs = null;
  const Live = {
    async start() {
      db = firebase.firestore(); uid = firebase.auth().currentUser.uid;
      S.ended = false;
      // a session this instructor left open (browser closed mid-class) is closed now, and its names deleted
      try {
        const old = await db.collection("live_sessions").where("hostUid", "==", uid).where("status", "==", "open").get();
        for (const d of old.docs) {
          const ps = await d.ref.collection("players").get(), b = db.batch();
          ps.forEach(x => b.delete(x.ref));
          b.update(d.ref, { status: "closed", phase: "ended", board: (d.data().board || []).map(e => ({ uid: e.uid, total: e.total, rank: e.rank })) });
          await b.commit();
        }
      } catch (err) { console.warn("couldn't close earlier sessions", err); }
      // a join code nobody else is using right now
      for (let tries = 0; tries < 8; tries++) {
        const taken = await db.collection("live_sessions").where("code", "==", S.code).where("status", "==", "open").limit(1).get();
        if (taken.empty) break;
        S.code = randomCode();
      }
      sref = db.collection("live_sessions").doc();
      S.sessionId = sref.id;
      await sref.set({ code: S.code, hostUid: uid, phase: "lobby", i: -1, status: "open", createdAt: firebase.firestore.FieldValue.serverTimestamp(), roundStartAt: null, board: [], v: 1 });
      unsubSession = sref.onSnapshot(snap => { const d = snap.data(); if (d && d.roundStartAt && d.roundStartAt.toMillis) roundStartMs = d.roundStartAt.toMillis(); });
      unsubPlayers = sref.collection("players").onSnapshot(qs => {
        qs.docChanges().forEach(ch => {
          const d = ch.doc.data(), id = ch.doc.id;
          if (ch.type === "removed") return;
          if (!S.players.find(p => p.uid === id)) S.players.push(newPlayer(id, d.name, d.role, d.country));
        });
        rankPlayers(); render();
      });
      render();
    },
    phase(phase) { if (sref) sref.update({ phase, i: S.i }).catch(err => console.warn("phase update failed", err)); },
    open() {
      roundStartMs = null;
      const k = S.i, rd = round();
      sref.update({ phase: "answer", i: k, roundStartAt: firebase.firestore.FieldValue.serverTimestamp() });
      if (unsubAnswers) unsubAnswers();
      unsubAnswers = sref.collection("answers").where("round", "==", k).onSnapshot(qs => {
        qs.docChanges().forEach(ch => {
          if (ch.type !== "added") return;
          const d = ch.doc.data(), p = S.players.find(x => x.uid === d.uid);
          if (!p || rd.answers.find(a => a.uid === d.uid)) return;
          rd.answers.push({ uid: d.uid, name: p.name, choice: d.choice, atMs: d.at && d.at.toMillis ? d.at.toMillis() : null });
        });
        if (S.phase === "answer") { renderSide(); if (rd.answers.length >= S.players.length) closeAnswers(); }
      });
    },
    finalizeAnswers(rd) {
      // elapsed time is measured on Firebase's clock: answer arrival minus the moment the window opened
      rd.answers.forEach(a => { a.ms = (a.atMs != null && roundStartMs != null) ? Math.max(0, a.atMs - roundStartMs) : ANSWER_S * 1000; });
    },
    publish(rd) {
      const board = S.players.map(p => ({ uid: p.uid, name: p.name, total: p.total, rank: p.rank, last: p.last, correct: !!p.lastCorrect, answered: !!p.lastAnswered }));
      sref.update({ board });
      // anonymous research records: one per learner per rhythm, no names
      const r = rhythm(), batch = db.batch();
      S.players.forEach(p => {
        const a = rd.answers.find(x => x.uid === p.uid);
        batch.set(db.collection("live_answers").doc(), {
          sessionId: S.sessionId, hostUid: uid, round: S.i, rhythm: r.key, cat: r.cat,
          choice: a ? a.choice : null, correct: !!(a && a.correct), ms: a ? a.ms : null,
          role: p.role || null, country: p.country || null, date: firebase.firestore.FieldValue.serverTimestamp(), v: 1
        });
      });
      batch.commit().catch(err => console.warn("research records failed", err));
    },
    async end() {
      // names are deleted as soon as the session ends
      if (!sref || S.ended) return; S.ended = true;
      try {
        const board = S.players.map(p => ({ uid: p.uid, total: p.total, rank: p.rank }));
        await sref.update({ status: "closed", phase: "ended", board });
        const qs = await sref.collection("players").get(), batch = db.batch();
        qs.forEach(d => batch.delete(d.ref)); await batch.commit();
      } catch (err) { console.warn("end failed", err); }
      [unsubPlayers, unsubAnswers, unsubSession].forEach(u => u && u());
    }
  };
  const Demo = {
    start() { simulateJoins(); },
    phase() {},
    open() { simulateAnswers(); },
    finalizeAnswers() {},
    publish() {},
    end() {}
  };
  const Backend = LIVE ? Live : Demo;
  const randomCode = () => Array.from({ length: 4 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ"[Math.floor(Math.random() * 24)]).join("");
  const newPlayer = (id, name, role, country) => ({ uid: id, name, role: role || null, country: country || null, skill: (Math.random() - 0.5) * 0.2, total: 0, time: 0, rank: 0, prevRank: 0, last: 0, lastCorrect: false, lastAnswered: false });

  // ---------- session state ----------
  let S;
  function newSession() {
    S = {
      phase: "lobby", code: randomCode(), sessionId: null,
      players: [], i: -1, rounds: [], t0: 0, stopReal: 0, artSeed: Math.random() * 100,
      variant: { seed: Math.random() * 100, amp: 1 }, bubble: false
    };
  }
  const round = () => S.rounds[S.i];
  const rhythm = () => R[S.i];

  // ---------- phase control ----------
  const PRIMARY = { lobby: "Start the first rhythm", ready: "Start rhythm", compress: null, answer: "Close answers", closed: "Show results", results: "Start the algorithm", algo: "Next step", answer2: "Show leaderboard", board: "Next rhythm", final: "New session" };
  function primary() {
    const p = S.phase;
    if (p === "lobby") return nextRhythm();
    if (p === "ready") return startRound();
    if (p === "answer") return closeAnswers();
    if (p === "closed") return go("results");
    if (p === "results") { S.algoStep = 1; return go("algo"); }
    if (p === "algo") { const n = ALG.PATH[rhythm().cat].length; if (S.algoStep < n) { S.algoStep += 1; return render(); } return go("answer2"); }
    if (p === "answer2") return go("board");
    if (p === "board") { if (S.i < R.length - 1) return nextRhythm(); go("final"); return Backend.end(); }   // the session ends at the final screen; names are deleted
    if (p === "final") { newSession(); go("lobby"); Backend.start(); }
  }
  function go(phase) { S.phase = phase; render(); if (phase !== "answer") Backend.phase(phase); }
  function nextRhythm() {
    S.i += 1;
    S.rounds[S.i] = { answers: [], start: 0, closedAt: 0 };
    S.variant = { seed: Math.random() * 100, amp: 0.95 + Math.random() * 0.1 };
    S.bubble = false; S.algoStep = 0; resetMonitor();
    go("ready");                         // the blank monitor is drawn once the stage is visible
  }
  function startRound() {
    S.t0 = now(); S.bubble = false;
    resetMonitor();                      // traces start from the left edge
    go("compress");
    setTimeout(() => { if (S.phase === "compress") openAnswers(); }, COMPRESS_S * 1000);
  }
  function openAnswers() {
    S.stopReal = now(); round().start = now();
    go("answer");
    Backend.open();
    setTimeout(() => { S.bubble = true; renderScene(); }, 1200);
  }
  function closeAnswers() {
    if (S.phase !== "answer") return;
    const rd = round(); rd.closedAt = now();
    S.frozenAt = now();                  // the monitor freezes so the strip can be examined
    S.scoring = true;
    go("closed");
    setTimeout(() => finalize(rd), LIVE ? GRACE_MS : 0);
  }
  function finalize(rd) {
    Backend.finalizeAnswers(rd);
    // score: 100-1,000 for a correct answer, by speed; 0 otherwise
    rd.answers.forEach(a => { a.correct = a.choice === rhythm().cat; a.pts = a.correct ? Math.round(1000 - 900 * Math.min(1, a.ms / 1000 / ANSWER_S)) : 0; });
    S.players.forEach(pl => {
      const a = rd.answers.find(x => (x.uid ? x.uid === pl.uid : x.name === pl.name));
      pl.prevRank = pl.rank; pl.last = a ? a.pts : 0; pl.lastCorrect = !!(a && a.correct); pl.lastAnswered = !!a;
      pl.total += pl.last; pl.time += a ? a.ms : ANSWER_S * 1000;
    });
    rankPlayers();
    S.scoring = false;
    Backend.publish(rd);
    render();
  }
  function rankPlayers() {
    const sorted = S.players.slice().sort((a, b) => b.total - a.total || a.time - b.time);
    sorted.forEach((p, i) => p.rank = i + 1);
  }

  // ---------- simulation ----------
  function simulateJoins() {
    S.players = [];
    NAMES.forEach((n, i) => setTimeout(() => {
      if (S.phase !== "lobby") return;
      S.players.push(newPlayer("sim" + i, n));
      renderLobby();
    }, 400 + i * 260 + Math.random() * 200));
  }
  function simulateAnswers() {
    const r = rhythm(), rd = round();
    S.players.forEach(pl => {
      if (Math.random() < 0.05) return;                                   // a few don't answer
      const t = 1.4 + Math.pow(Math.random(), 1.6) * 8.2;                 // seconds to answer
      const ok = Math.random() < Math.min(.98, Math.max(.05, DIFFICULTY[r.key] + pl.skill));
      const choice = ok ? r.cat : pick(CONFUSE[r.cat]);
      setTimeout(() => {
        if (S.phase !== "answer" || round() !== rd) return;
        rd.answers.push({ uid: pl.uid, name: pl.name, choice, ms: Math.round(t * 1000) });
        renderSide();
        if (rd.answers.length >= S.players.length) closeAnswers();
      }, t * 1000);
    });
  }

  // ---------- rendering ----------
  function render() {
    document.body.dataset.phase = S.phase;
    $("lobby").classList.toggle("hidden", S.phase !== "lobby");
    $("stage").classList.toggle("hidden", S.phase === "lobby" || S.phase === "final");
    $("final").classList.toggle("hidden", S.phase !== "final");
    $("rcount").textContent = S.i >= 0 ? "Rhythm " + (S.i + 1) + " of " + R.length : "Lobby";
    $("joinCode").textContent = S.code;
    $("players").textContent = S.players.length;
    const label = PRIMARY[S.phase];
    const b = $("primaryBtn");
    if (S.phase === "board" && S.i === R.length - 1) b.textContent = "Final results";
    else if (S.phase === "algo" && S.algoStep >= ALG.PATH[rhythm().cat].length) b.textContent = "Show the answer";
    else b.textContent = label || "Compressions…";
    b.disabled = !label || (S.phase === "closed" && S.scoring);
    if (S.phase === "lobby") renderLobby();
    if (S.phase === "final") renderFinal();
    renderScene(); renderSide();
    // reveal swaps the scene for the algorithm
    const showAlgo = S.phase === "algo" || S.phase === "answer2";
    $("scene").classList.toggle("hidden", showAlgo);
    $("algoArea").classList.toggle("hidden", !showAlgo);
    if (showAlgo) {
      const n = ALG.PATH[rhythm().cat].length;
      $("algoArea").innerHTML = '<p class="algo-title">RECOVER CPR ECG Algorithm</p>' + ALG.svg(rhythm().cat, S.phase === "answer2" ? n : S.algoStep);
    }
  }

  function renderLobby() {
    $("players").textContent = S.players.length;
    $("joinCodeBig").textContent = S.code;
    const box = $("names"); box.replaceChildren();
    S.players.forEach(p => box.appendChild(el("span", "namechip", p.name)));
    $("lobbyCount").textContent = S.players.length + (S.players.length === 1 ? " learner has joined" : " learners have joined");
    const base = location.origin + location.pathname.replace(/[^/]*$/, ""), url = base + "join.html?code=" + S.code;
    $("joinUrl").textContent = (base + "join.html").replace(/^https?:\/\//, "");
    const q = $("qr");
    $("protoNote").textContent = LIVE ? "You can join at any time." : "Demo mode: the class here is simulated.";
    if (q.dataset.code !== S.code) {
      q.dataset.code = S.code; q.replaceChildren();
      if (window.QRCode) new QRCode(q, { text: url, width: 360, height: 360, colorDark: "#022033", colorLight: "#ffffff", correctLevel: QRCode.CorrectLevel.M });
      else q.appendChild(el("div", "qrfallback", "QR code"));
    }
  }

  function renderSide() {
    const box = $("side"); if (!box || !S) return;
    box.replaceChildren();
    const p = S.phase, rd = round();
    if (p === "ready") {
      box.append(el("p", "eyebrow", "Rhythm " + (S.i + 1) + " of " + R.length), el("h2", null, "Get ready"),
                 el("p", "big muted", "The answer buttons appear on your phone when compressions stop."));
    } else if (p === "compress") {
      box.append(el("p", "eyebrow", "Rhythm " + (S.i + 1) + " of " + R.length), el("h2", null, "Compressions"), el("p", "big muted", "Watch the monitor."));
    } else if (p === "answer" || p === "closed") {
      const n = rd.answers.length, tot = S.players.length;
      const cd = el("div", "countdown"); cd.id = "countdown"; cd.textContent = p === "answer" ? ANSWER_S : "0";
      box.append(el("p", "eyebrow", p === "answer" ? "Answer on your phone" : "Time's up"), cd);
      const bar = el("div", "abar"); const fill = el("i"); fill.style.width = (tot ? n / tot * 100 : 0) + "%"; bar.appendChild(fill);
      box.append(el("p", "acount", n + " of " + tot + " answered"), bar);

      tickCountdown();
    } else if (p === "results" || p === "algo" || p === "answer2") {
      const r = rhythm(), tot = Math.max(1, rd.answers.length), showAns = p === "answer2";
      box.append(el("p", "eyebrow", "How the room answered"));
      const chart = el("div", "chart");
      SET.CATS.forEach(c => {
        const n = rd.answers.filter(a => a.choice === c.key).length, pct = Math.round(n / tot * 100), ok = showAns && c.key === r.cat;
        const row = el("div", "crow" + (ok ? " ok" : ""));
        const lab = el("span", "clab", c.label);
        const track = el("span", "ctrack"); const f = el("i"); f.style.width = pct + "%"; track.appendChild(f);
        const val = el("span", "cval", pct + "%"); val.title = n + " learners";
        row.append(lab, track, val); chart.appendChild(row);
      });
      box.appendChild(chart);
      if (!showAns) {
        box.append(el("p", "muted small", rd.answers.length + " of " + S.players.length + " answered"));
        // during the algorithm, the room sees the question it's working on
        if (p === "algo") { const q = ALG.question(r.cat, S.algoStep); if (q) box.append(el("p", "eyebrow", "The question"), el("p", "question", q)); }
      } else {
        const right = rd.answers.filter(a => a.correct).length;
        box.append(el("p", "verdict", "Correct: " + catLabel(r.cat)), el("p", "detail", r.detail), el("p", "teach", r.teach),
                   el("p", "muted small", right + " of " + S.players.length + " correct" + (rd.answers.length < S.players.length ? " · " + (S.players.length - rd.answers.length) + " didn't answer" : "")));
      }
    } else if (p === "board") {
      box.append(el("p", "eyebrow", "Leaderboard after rhythm " + (S.i + 1)));
      box.appendChild(boardList(10, true));
    }
  }
  function boardList(n, showLast) {
    const list = el("ol", "board");
    S.players.slice().sort((a, b) => a.rank - b.rank).slice(0, n).forEach(p => {
      const li = el("li");
      const mv = p.prevRank && p.prevRank !== p.rank ? (p.rank < p.prevRank ? "up" : "down") : "";
      li.append(el("span", "rk", p.rank), el("span", "nm", p.name));
      if (showLast) li.append(el("span", "last" + (p.last ? "" : " zero"), p.last ? "+" + p.last : "+0"));
      li.append(el("span", "tot", p.total.toLocaleString()), el("span", "mv " + mv, mv === "up" ? "▲" : mv === "down" ? "▼" : ""));
      list.appendChild(li);
    });
    return list;
  }
  function tickCountdown() {
    if (S.phase !== "answer") return;
    const left = Math.max(0, ANSWER_S - (now() - round().start));
    const c = $("countdown"); if (c) { c.textContent = Math.ceil(left); c.classList.toggle("low", left <= 3); }
    if (left <= 0) return closeAnswers();
    requestAnimationFrame(tickCountdown);
  }

  function renderFinal() {
    const pod = $("podium"); pod.replaceChildren();
    const sorted = S.players.slice().sort((a, b) => a.rank - b.rank);
    [1, 0, 2].forEach(i => { const p = sorted[i]; if (!p) return; const d = el("div", "pod p" + (i + 1)); d.append(el("span", "pr", i + 1), el("b", null, p.name), el("span", null, p.total.toLocaleString() + " pts")); pod.appendChild(d); });
    const rest = $("finalList"); rest.replaceChildren();
    sorted.slice(3, 10).forEach(p => { const li = el("li"); li.append(el("span", "rk", p.rank), el("span", "nm", p.name), el("span", "tot", p.total.toLocaleString())); rest.appendChild(li); });
    const hard = $("hardest"); hard.replaceChildren();
    S.rounds.map((rd, i) => ({ r: R[i], pct: Math.round(rd.answers.filter(a => a.correct).length / Math.max(1, S.players.length) * 100) }))
      .sort((a, b) => a.pct - b.pct).forEach(x => {
        const li = el("li"); const track = el("span", "ctrack"); const f = el("i"); f.style.width = x.pct + "%"; track.appendChild(f);
        li.append(el("span", "clab", catLabel(x.r.cat) + (x.r.rate ? " " + x.r.rate + "/min" : x.r.key === "vfFine" ? " (fine)" : x.r.key === "vfCoarse" ? " (coarse)" : "")), track, el("span", "cval", x.pct + "%"));
        hard.appendChild(li);
      });
  }

  // ---------- the RECOVER CPR ECG algorithm, revealed one level at a time ----------
  const ALG = (function () {
    const N = {
      root: { x: 395, y: 34,  w: 210, h: 46, lines: ["Palpable pulse?"], q: true },
      cons: { x: 250, y: 132, w: 270, h: 56, lines: ["Consistent, repeating", "complexes on ECG?"], q: true },
      rosc: { x: 548, y: 132, w: 172, h: 56, lines: ["Perfusing rhythm", "= ROSC"], cat: "rosc" },
      rate: { x: 150, y: 236, w: 200, h: 46, lines: ["Rate > 200/min?"], q: true },
      flat: { x: 460, y: 236, w: 230, h: 46, lines: ["Is the ECG a flat line?"], q: true },
      pvt:  { x: 80,  y: 344, w: 144, h: 64, lines: ["Pulseless VT"], sub: "Shockable", cat: "pvt" },
      pea:  { x: 236, y: 344, w: 144, h: 64, lines: ["PEA"], sub: "Non-shockable", cat: "pea" },
      vf:   { x: 400, y: 344, w: 144, h: 64, lines: ["VF"], sub: "Shockable", cat: "vf" },
      asys: { x: 560, y: 344, w: 144, h: 64, lines: ["Asystole"], sub: "Non-shockable", cat: "asys" }
    };
    const E = [["root", "cons", "No"], ["root", "rosc", "Yes"], ["cons", "rate", "Yes"], ["cons", "flat", "No"],
               ["rate", "pvt", "Yes"], ["rate", "pea", "No"], ["flat", "vf", "No"], ["flat", "asys", "Yes"]];
    const PATH = { rosc: ["root", "rosc"], pvt: ["root", "cons", "rate", "pvt"], pea: ["root", "cons", "rate", "pea"], vf: ["root", "cons", "flat", "vf"], asys: ["root", "cons", "flat", "asys"] };
    const RED = "#ee3c36", NAVY = "#022033", MUTED = "#9aa6af", LINE = "#cfd5da", SKY = "#84d1f5";
    const esc = t => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;");
    // step k shows the first k boxes of the path; each answered question shows its branch taken (red)
    // and the branch not taken greyed out
    function svg(cat, k) {
      const path = PATH[cat], shown = path.slice(0, k), last = k >= path.length;
      const greyed = [];
      for (let i = 0; i < k - 1; i++) E.filter(e => e[0] === path[i] && e[1] !== path[i + 1]).forEach(e => greyed.push(e[1]));
      let o = '<svg viewBox="0 0 640 400" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="RECOVER CPR ECG algorithm, one step at a time">';
      E.forEach(([a, b, label]) => {
        const ai = shown.indexOf(a); if (ai < 0 || ai >= k - 1) return;            // only edges out of answered questions
        const on = path[ai + 1] === b;
        const A = N[a], B = N[b];
        const x1 = A.x + (B.x < A.x ? -1 : 1) * Math.min(A.w / 2 - 30, Math.abs(B.x - A.x) / 2), y1 = A.y + A.h / 2;
        const x2 = B.x, y2 = B.y - B.h / 2, ym = (y1 + y2) / 2, c = on ? RED : LINE, sw = on ? 4 : 2;
        o += '<path d="M' + x1 + ' ' + y1 + ' V ' + ym + ' H ' + x2 + ' V ' + (y2 - 2) + '" fill="none" stroke="' + c + '" stroke-width="' + sw + '" stroke-linejoin="round"/>';
        o += '<path d="M' + (x2 - 6) + ' ' + (y2 - 9) + ' L ' + x2 + ' ' + (y2 - 1) + ' L ' + (x2 + 6) + ' ' + (y2 - 9) + '" fill="none" stroke="' + c + '" stroke-width="' + sw + '" stroke-linecap="round" stroke-linejoin="round"/>';
        const lx = (x1 + x2) / 2;
        o += '<rect x="' + (lx - 22) + '" y="' + (ym - 12) + '" width="44" height="24" rx="12" fill="' + (on ? RED : "#fff") + '" stroke="' + c + '" stroke-width="1.5"/>' +
             '<text x="' + lx + '" y="' + (ym + 5) + '" text-anchor="middle" font-family="Source Sans 3, Arial, sans-serif" font-weight="700" font-size="14" fill="' + (on ? "#fff" : MUTED) + '">' + label + '</text>';
      });
      Object.entries(N).forEach(([id, n]) => {
        const isShown = shown.includes(id), isGrey = greyed.includes(id);
        if (!isShown && !isGrey) return;
        const current = isShown && id === shown[shown.length - 1];
        const isDx = !!n.cat && isShown;
        const fill = isGrey ? "#fff" : isDx ? RED : NAVY, stroke = isGrey ? LINE : isDx ? RED : NAVY, color = isGrey ? MUTED : "#fff";
        const x = n.x - n.w / 2, y = n.y - n.h / 2;
        if (current && !last) o += '<rect x="' + (x - 6) + '" y="' + (y - 6) + '" width="' + (n.w + 12) + '" height="' + (n.h + 12) + '" rx="14" fill="none" stroke="' + SKY + '" stroke-width="4"/>';
        o += '<rect x="' + x + '" y="' + y + '" width="' + n.w + '" height="' + n.h + '" rx="10" fill="' + fill + '" stroke="' + stroke + '" stroke-width="2"/>';
        const lines = n.lines, total = lines.length + (n.sub ? 1 : 0), y0 = n.y - (total - 1) * 9 + 5;
        lines.forEach((t, i) => { o += '<text x="' + n.x + '" y="' + (y0 + i * 18) + '" text-anchor="middle" font-family="Outfit, Arial, sans-serif" font-weight="' + (n.cat ? 800 : 700) + '" font-size="' + (n.cat ? 17 : 15) + '" fill="' + color + '">' + esc(t) + '</text>'; });
        if (n.sub) o += '<text x="' + n.x + '" y="' + (y0 + lines.length * 18) + '" text-anchor="middle" font-family="Source Sans 3, Arial, sans-serif" font-weight="600" font-size="13" fill="' + color + '">' + esc(n.sub) + '</text>';
      });
      return o + "</svg>";
    }
    // the question the room is discussing at this step (none once the diagnosis box appears)
    function question(cat, k) {
      const cur = N[PATH[cat][k - 1]];
      return cur.cat ? "" : cur.lines.join(" ");
    }
    return { svg, question, PATH };
  })();

  // ---------- scene ----------
  function renderScene() {
    const comp = S && S.phase === "compress";
    $("scene").classList.toggle("compressing", comp);
    const r = S && S.i >= 0 ? rhythm() : null;
    $("bubbleText").textContent = r && r.cat === "rosc" ? "I feel a pulse!" : "I don't feel a pulse";
    $("bubble").classList.toggle("show", !!(S && S.bubble && ["answer", "closed", "results", "algo", "answer2", "board"].includes(S.phase)));
    $("phaseTag").textContent = comp ? "Chest compressions" : (S && ["answer", "closed", "results", "algo", "answer2", "board"].includes(S.phase) ? "Pulse check" : "");
    $("phaseTag").classList.toggle("hidden", !$("phaseTag").textContent);
  }

  // ---------- monitor: ECG with HR, ETCO2 breath by breath, bag squeeze in step ----------
  const ECG_HZ = 250, ECG_N = ECG_HZ * 6, ecgVal = new Float32Array(ECG_N), ecgStamp = new Int32Array(ECG_N).fill(-1);
  const CO2_HZ = 50, CO2_WIN = 12, CO2_N = CO2_HZ * CO2_WIN, co2Val = new Float32Array(CO2_N), co2Stamp = new Int32Array(CO2_N).fill(-1);
  let ecgM = null, real0 = now(), ecgLast = -1, co2Last = -1, hrNext = 0, hrShown = "---", breathIdx = -1, breathEt = null;
  function resetMonitor() { ecgM = null; ecgStamp.fill(-1); co2Stamp.fill(-1); ecgLast = -1; co2Last = -1; real0 = now(); hrShown = "---"; breathIdx = -1; breathEt = null; }
  function sizeMonitor() {
    if (!$("ecg").clientWidth || !$("co2").clientWidth) return false;   // stage not visible yet
    ecgM = Monitor.setup($("ecg"));
    const c = $("co2"), r = c.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr); c.getContext("2d").setTransform(dpr, 0, 0, dpr, 0, 0);
    return true;
  }
  const compressing = () => S && (S.phase === "compress" || S.phase === "ready");
  function ecgSample(tRel, r) {
    if (!S || S.i < 0) return 0;
    if (compressing()) return S.phase === "ready" ? 0.02 * Math.sin(tRel * 3) : window.RHYTHM_LIB.compressionArtifact(tRel, S.artSeed);
    const since = r - S.stopReal, v = rhythm().fn(Math.max(0, since), S.variant);
    if (since < 0.06) return v + window.RHYTHM_LIB.compressionArtifact(tRel, S.artSeed) * (1 - since / 0.06) * 0.3;
    return v;
  }
  function etco2Target(r) {
    const rh = rhythm(); if (!rh) return 0;
    if (S.phase === "ready") return rh.etco2;
    if (rh.cat === "rosc" && !compressing()) { const since = r - S.stopReal; return rh.etco2 + (rh.etco2After - rh.etco2) * Math.min(1, since / 8); }
    return rh.etco2;
  }
  function hrText(r) {
    if (compressing()) return "---";
    const rh = rhythm(), since = r - S.stopReal;
    const delay = rh.rate ? Math.max(1, 0.08 + 60 / rh.rate + 0.25) : 1;
    if (since < delay) return "---";
    if (rh.cat === "asys") return "0";
    if (rh.hr === "none") return "---";
    if (rh.hr === "wild") { if (r > hrNext) { hrShown = String(70 + Math.floor(Math.random() * 280)); hrNext = r + 0.7; } return hrShown; }
    if (r > hrNext || hrShown === "---") { hrShown = String(rh.rate + Math.round((Math.random() * 2 - 1) * 2)); hrNext = r + 2; }
    return hrShown;
  }
  const FROZEN = ["closed", "results", "algo", "answer2", "board"];
  function blankMonitor() {
    if (!ecgM && !sizeMonitor()) return;
    Monitor.sweep(ecgM, () => null, 0);
    const cv = $("co2"), ctx = cv.getContext("2d"); ctx.clearRect(0, 0, cv.clientWidth, cv.clientHeight); co2Grid(ctx, cv.clientWidth, cv.clientHeight);
    $("hrVal").textContent = "---"; $("co2Val").textContent = "--";
  }
  function co2Grid(ctx, w, h) {
    ctx.strokeStyle = "rgba(132,209,245,.18)"; ctx.lineWidth = 1; ctx.beginPath();
    [10, 20, 30, 40, 50].forEach(mm => { const y = h - 6 - mm / 60 * (h - 12); ctx.moveTo(0, y); ctx.lineTo(w, y); }); ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,.55)"; ctx.font = '600 11px "Source Sans 3", Arial'; ctx.fillText("CO₂ 0–60 mmHg", 8, 14);
  }
  function draw() {
    requestAnimationFrame(draw);
    if (!S || S.i < 0 || S.phase === "final" || S.phase === "lobby") return;
    if (S.phase === "ready") { if (!ecgM) blankMonitor(); return; }
    const frozen = FROZEN.includes(S.phase);
    if (frozen && ecgM) return;                       // frozen and already drawn: leave the strip as it is
    const r = frozen ? S.frozenAt : now();            // after a resize, redraw the frozen strip at the moment it froze
    if (!ecgM && !sizeMonitor()) return;
    // ECG
    const tNow = r - real0, idx = Math.floor(tNow * ECG_HZ);
    if (!frozen) for (let i = Math.max(ecgLast + 1, idx - ECG_N + 1); i <= idx; i++) { const s = ((i % ECG_N) + ECG_N) % ECG_N; ecgVal[s] = ecgSample(i / ECG_HZ, r - (idx - i) / ECG_HZ); ecgStamp[s] = i; }
    ecgLast = idx;
    Monitor.sweep(ecgM, t => { const i = Math.floor(t * ECG_HZ), s = ((i % ECG_N) + ECG_N) % ECG_N; return ecgStamp[s] === i ? ecgVal[s] : null; }, tNow);
    if (!frozen) $("hrVal").textContent = hrText(r);
    // ETCO2: a breath every 6 s; each breath holds the value it started with
    const cv = $("co2"), ctx = cv.getContext("2d"), w = cv.clientWidth, h = cv.clientHeight;
    const cIdx = Math.floor(tNow * CO2_HZ), et = etco2Target(r);
    if (!frozen) for (let i = Math.max(co2Last + 1, cIdx - CO2_N + 1); i <= cIdx; i++) {
      const s = i % CO2_N, tt = i / CO2_HZ, bi = Math.floor(tt / 6), sec = tt - bi * 6;
      if (bi !== breathIdx) { breathIdx = bi; breathEt = et; squeeze(); }
      const be = breathEt; let v = 0;
      if (sec < 1.0) v = 0; else if (sec < 1.2) v = be * (sec - 1.0) / 0.2; else if (sec < 2.7) v = be * (0.96 + 0.04 * (sec - 1.2) / 1.5); else if (sec < 2.9) v = be * (1 - (sec - 2.7) / 0.2); else v = 0;
      co2Val[s] = v; co2Stamp[s] = i;
    }
    co2Last = cIdx;
    ctx.clearRect(0, 0, w, h);
    co2Grid(ctx, w, h);
    ctx.strokeStyle = "#f2b134"; ctx.lineWidth = 2.5; ctx.beginPath(); let pen = false;
    const ph = tNow % CO2_WIN, sw = Math.floor(tNow / CO2_WIN);
    for (let x = 0; x <= w; x++) {
      const sx = x / w * CO2_WIN; let t;
      if (sx <= ph) t = sw * CO2_WIN + sx; else if (sx > ph + 0.3) t = (sw - 1) * CO2_WIN + sx; else { pen = false; continue; }
      const i = Math.floor(t * CO2_HZ); if (i < 0) { pen = false; continue; }
      const s = i % CO2_N; if (co2Stamp[s] !== i) { pen = false; continue; }
      const y = h - 6 - co2Val[s] / 60 * (h - 12);
      if (!pen) { ctx.moveTo(x, y); pen = true; } else ctx.lineTo(x, y);
    }
    ctx.stroke();
    if (!frozen) $("co2Val").textContent = breathEt == null ? "--" : Math.round(breathEt);
  }
  function squeeze() { const b = $("bag"); if (!b) return; b.classList.remove("squeeze"); void b.getBoundingClientRect(); b.classList.add("squeeze"); }

  function hideViews() { ["lobby", "stage", "final"].forEach(id => $(id).classList.add("hidden")); }

  // ---------- start ----------
  document.addEventListener("DOMContentLoaded", () => {
    $("signOutLink").addEventListener("click", e => { e.preventDefault(); if (S.phase === "lobby" || confirm("Sign out and end this session?")) { Backend.end(); StaffAuth.signOut(); } });
    newSession();
    if (!LIVE) { document.querySelector(".staffline").classList.add("hidden"); render(); Backend.start(); return; }
    // live mode: only a listed instructor (or administrator) can start a session
    StaffAuth.init();
    StaffAuth.completeEmailLink().catch(err => { $("signin").classList.remove("hidden"); StaffAuth.panel($("signin"), { blocked: "That sign-in link didn't work (" + (err.message || err) + "). Request a new one." }); });
    let started = false;
    StaffAuth.watch((user, role) => {
      const gate = $("signin");
      if (!user) { if (started) return location.reload(); gate.classList.remove("hidden"); hideViews(); StaffAuth.panel(gate); return; }
      if (!role) { gate.classList.remove("hidden"); hideViews(); StaffAuth.panel(gate, { blocked: (user.email || "This account") + " isn't registered as a RECOVER instructor. Ask a RECOVER administrator to add this email address." }); return; }
      gate.classList.add("hidden");
      $("staffWho").textContent = user.email;
      if (!started) {
        started = true; render();
        Promise.resolve(Backend.start()).catch(err => { console.error(err); $("protoNote").textContent = "Couldn't start the session: " + (err.message || err) + ". Reload to try again."; });
      }
    });
    $("primaryBtn").addEventListener("click", primary);
    $("endBtn").addEventListener("click", () => { if (S.phase !== "lobby" && confirm("End this session?")) { if (S.phase === "answer") closeAnswers(); go("final"); Backend.end(); } });
    $("fsBtn").addEventListener("click", () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen && document.documentElement.requestFullscreen(); });
    document.addEventListener("keydown", e => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.closest(".algo-zoom")) return;
      if (e.key === " " || e.key === "ArrowRight" || e.key === "PageDown") { e.preventDefault(); if (!$("primaryBtn").disabled) primary(); }
    });
    // redraw the monitor whenever its size changes (window resize, or the algorithm replacing the scene)
    const ro = new ResizeObserver(() => { ecgM = null; });
    ro.observe($("ecg")); ro.observe($("co2"));
    requestAnimationFrame(draw);
  });
  window.LiveDisplay = { get state() { return S; }, primary, live: LIVE };
})();
