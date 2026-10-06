/* ECG monitor: navy screen, paper-style grid (big box = 0.2 s, 0.5 mV),
   one-second tick marks, and a sweeping trace that overwrites itself like a real monitor. */
window.Monitor = (function () {
  const SECONDS = 5;          // seconds shown across the screen (25 big boxes)
  const GAP = 0.12;           // blank "eraser" gap ahead of the sweep, in seconds

  function setup(canvas) {
    const r = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
    const ctx = canvas.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = r.width, h = r.height, box = w / (SECONDS * 5);   // px per big box (0.2 s)
    return { ctx, w, h, box, mv: box * 2, base: h * 0.53 };      // 1 mV = 2 big boxes
  }

  function grid(m) {
    const { ctx, w, h, box } = m;
    ctx.clearRect(0, 0, w, h);
    ctx.lineWidth = 1;
    // small boxes
    ctx.strokeStyle = "rgba(132,209,245,0.09)"; ctx.beginPath();
    for (let x = 0; x <= w + 0.5; x += box / 5) { ctx.moveTo(Math.round(x) + .5, 0); ctx.lineTo(Math.round(x) + .5, h); }
    for (let y = m.base % (box / 5); y <= h; y += box / 5) { ctx.moveTo(0, Math.round(y) + .5); ctx.lineTo(w, Math.round(y) + .5); }
    ctx.stroke();
    // big boxes
    ctx.strokeStyle = "rgba(132,209,245,0.24)"; ctx.beginPath();
    for (let x = 0; x <= w + 0.5; x += box) { ctx.moveTo(Math.round(x) + .5, 0); ctx.lineTo(Math.round(x) + .5, h); }
    for (let y = m.base % box; y <= h; y += box) { ctx.moveTo(0, Math.round(y) + .5); ctx.lineTo(w, Math.round(y) + .5); }
    ctx.stroke();
    // one-second ticks along the top
    ctx.strokeStyle = "rgba(255,255,255,0.75)"; ctx.lineWidth = 2; ctx.beginPath();
    for (let s = 0; s <= SECONDS; s++) { const x = Math.min(w - 1, Math.max(1, s * box * 5)); ctx.moveTo(x, 0); ctx.lineTo(x, 9); }
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.8)"; ctx.font = '700 11px "Source Sans 3", Arial, sans-serif';
    ctx.fillText("II", 8, h - 10);
    ctx.textAlign = "right"; ctx.fillText("25 mm/s · ticks = 1 s", w - 8, h - 10); ctx.textAlign = "left";
  }

  // Draw a sweeping trace. sig(t) returns mV (or null for "no data yet"); T = seconds elapsed.
  function sweep(m, sig, T, color) {
    grid(m);
    const { ctx, w, mv, base } = m;
    const phase = T % SECONDS, sweepN = Math.floor(T / SECONDS);
    ctx.strokeStyle = color || "#ffffff"; ctx.lineWidth = 2.2; ctx.lineJoin = "round"; ctx.lineCap = "round";
    ctx.beginPath();
    let pen = false;
    const step = 0.5;                                   // half-pixel sampling keeps narrow QRS crisp
    for (let x = 0; x <= w; x += step) {
      const s = x / w * SECONDS;
      let t;
      if (s <= phase) t = sweepN * SECONDS + s;
      else if (s > phase + GAP) t = (sweepN - 1) * SECONDS + s;
      else { pen = false; continue; }
      const v = t >= 0 ? sig(t) : null;
      if (v == null) { pen = false; continue; }
      const y = base - v * mv;
      if (!pen) { ctx.moveTo(x, y); pen = true; } else ctx.lineTo(x, y);
    }
    ctx.stroke();
    // bright dot at the sweep position
    if (T >= 0) {
      const v = sig(T);
      if (v != null) { ctx.fillStyle = color || "#ffffff"; ctx.beginPath(); ctx.arc(phase / SECONDS * w, base - v * mv, 3.2, 0, 7); ctx.fill(); }
    }
  }

  // Static strip of a whole window starting at t0 (used by the review gallery)
  function strip(m, sig, t0, color) {
    grid(m);
    const { ctx, w, mv, base } = m;
    ctx.strokeStyle = color || "#ffffff"; ctx.lineWidth = 2.2; ctx.lineJoin = "round"; ctx.beginPath();
    for (let x = 0; x <= w; x += 0.5) {
      const y = base - sig(t0 + x / w * SECONDS) * mv;
      x ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke();
  }

  return { SECONDS, setup, grid, sweep, strip };
})();
