/* =================================================================
   ECG Rhythm Challenge Live: the teammates in scrubs
   Copied from the CPR Team Leader Challenge (src/game.js: LOOKS ... armsFor) so both games share one look.
   Scrubs take the teammate's color; poses: chest (compressions), ventilate, palpate, idle and others.
   ================================================================= */
(function () {
  const LOOKS = {
    alex:   { skin: "#f0c6a2", skinD: "#d9a67f", hair: "#6b4a2b", style: "short" },
    sam:    { skin: "#8a5536", skinD: "#6f4027", hair: "#1d1714", style: "curly" },
    jordan: { skin: "#c99467", skinD: "#ad7a4f", hair: "#3b2a1d", style: "bun" },
    priya:  { skin: "#a86d45", skinD: "#8d5733", hair: "#15100d", style: "long" }
  };
  const LOOK_LIST = Object.values(LOOKS);
  function lookOf(m) { return LOOKS[m.id] || LOOK_LIST[m.idx % LOOK_LIST.length]; }
  function shade(hex, f) {   // f < 0 darkens, f > 0 lightens
    const n = parseInt(hex.slice(1), 16), c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f));
    return "#" + c.map(v => v.toString(16).padStart(2, "0")).join("");
  }
  function figureLegs(m, lk) {
    const pants = shade(m.shirt, -0.12), seam = shade(m.shirt, -0.28);
    return '<path d="M-24 168 L-25 256 L-5 256 L0 196 L5 256 L25 256 L24 168 Z" fill="' + pants + '"/>' +
      '<path d="M0 196 L0 252" stroke="' + seam + '" stroke-width="1.5"/>' +
      '<path d="M-27 254 h22 a4 4 0 0 1 4 4 v6 a3 3 0 0 1 -3 3 h-24 a6 6 0 0 1 -6 -6 a7 7 0 0 1 7 -7 z" fill="#2d333b"/>' +
      '<path d="M27 254 h-22 a4 4 0 0 0 -4 4 v6 a3 3 0 0 0 3 3 h24 a6 6 0 0 0 6 -6 a7 7 0 0 0 -7 -7 z" fill="#2d333b"/>';
  }
  function hairFor(lk) {
    const h = lk.hair;
    if (lk.style === "curly") return '<g fill="' + h + '"><circle cx="-11" cy="31" r="7"/><circle cx="-3" cy="27" r="7.5"/><circle cx="6" cy="27" r="7.5"/><circle cx="13" cy="32" r="6.5"/><circle cx="-15" cy="38" r="5"/><circle cx="16" cy="39" r="5"/></g>';
    if (lk.style === "bun") return '<g fill="' + h + '"><circle cx="0" cy="20" r="8"/><path d="M-16.5 42 Q-18 24 0 24 Q18 24 16.5 42 Q13 31 0 30 Q-13 31 -16.5 42 Z"/></g>';
    if (lk.style === "long") return '<path fill="' + h + '" d="M-16.5 44 Q-19 23 0 23 Q19 23 16.5 44 L19 70 Q14 70 12.5 52 Q11 33 0 31 Q-11 33 -12.5 52 Q-14 70 -19 70 Z"/>';
    return '<path fill="' + h + '" d="M-16.5 41 Q-18 24 0 24 Q18 24 16.5 41 Q15 33 6 31 Q-6 34 -16.5 41 Z"/>';   // short
  }
  function figureUpper(m, lk) {
    const top = m.shirt, dark = shade(m.shirt, -0.16);
    return '<rect x="-6.5" y="54" width="13" height="28" rx="4" fill="' + lk.skinD + '"/>' +
      // scrub top: V-neck tunic
      '<path class="torso" fill="' + top + '" d="M-8 66 L0 81 L8 66 L22 68 Q30 71 29 82 L29 176 Q0 182 -29 176 L-29 82 Q-30 71 -22 68 Z"/>' +
      '<path fill="' + dark + '" opacity=".55" d="M-29 82 L-29 176 Q-24 178 -20 178 L-21 96 Z"/>' +
      '<path d="M-8 66 L0 81 L8 66" fill="none" stroke="' + dark + '" stroke-width="2"/>' +
      '<rect x="7" y="100" width="13" height="13" rx="2" fill="none" stroke="' + dark + '" stroke-width="1.6"/>' +
      '<rect x="-19" y="92" width="9" height="12" rx="1.5" fill="#fff" stroke="#9aa6af" stroke-width="1"/><rect x="-17.5" y="94" width="6" height="3" fill="#84d1f5"/>' +
      // head
      '<ellipse cx="-16.5" cy="46" rx="3.6" ry="5" fill="' + lk.skinD + '"/><ellipse cx="16.5" cy="46" rx="3.6" ry="5" fill="' + lk.skinD + '"/>' +
      '<ellipse cx="0" cy="44" rx="16" ry="18.5" fill="' + lk.skin + '"/>' + hairFor(lk) +
      '<path d="M-10 39.5 q4 -2.2 7 0 M3 39.5 q4 -2.2 7 0" stroke="' + lk.hair + '" stroke-width="1.8" fill="none" stroke-linecap="round"/>' +
      '<circle cx="-6" cy="45" r="1.9" fill="#2a2420"/><circle cx="6" cy="45" r="1.9" fill="#2a2420"/>' +
      '<path d="M0 46 q-1.6 4.5 0.8 5.2" stroke="' + lk.skinD + '" stroke-width="1.4" fill="none" stroke-linecap="round"/>' +
      '<path d="M-4.5 55 q4.5 2.6 9 0" stroke="#7a3f2c" stroke-width="1.6" fill="none" stroke-linecap="round"/>';
  }
  // an arm: short scrub sleeve, then skin to the elbow and the hand
  function arm(m, lk, sx, sy, ex, ey, hx, hy) {
    const k = 0.45, mx = sx + (ex - sx) * k, my = sy + (ey - sy) * k;
    return '<path d="M' + sx + ' ' + sy + ' L' + mx + ' ' + my + '" stroke="' + m.shirt + '" stroke-width="15" stroke-linecap="round" fill="none"/>' +
      '<path d="M' + mx + ' ' + my + ' L' + ex + ' ' + ey + ' L' + hx + ' ' + hy + '" stroke="' + lk.skin + '" stroke-width="9.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>' +
      '<path d="M' + sx + ' ' + sy + ' L' + mx + ' ' + my + '" stroke="' + shade(m.shirt, -0.16) + '" stroke-width="1.2" fill="none" opacity=".5"/>' +
      '<circle cx="' + hx + '" cy="' + hy + '" r="6" fill="' + lk.skin + '"/>';
  }
  function armsFor(pose, m) {
    const lk = lookOf(m), L = (ex, ey, hx, hy) => arm(m, lk, -23, 80, ex, ey, hx, hy), Rr = (ex, ey, hx, hy) => arm(m, lk, 23, 80, ex, ey, hx, hy);
    if (pose === "chest")       // arms locked straight, shoulders over the hands, one hand on top of the other
      return L(-12, 118, -2, 154) + Rr(12, 118, 2, 151) + '<ellipse cx="0" cy="157" rx="10" ry="5.5" fill="' + lk.skin + '"/><ellipse cx="0" cy="151" rx="8.5" ry="5" fill="' + lk.skinD + '"/>';
    if (pose === "ventilate")   // one hand squeezes the bag, the other steadies the tube connector
      return '<path d="M-24 172 L -14 182" stroke="#d6dde2" stroke-width="5" stroke-linecap="round"/>' +
        '<g class="bag"><ellipse cx="-56" cy="164" rx="28" ry="14" fill="#9fd4ee" stroke="#2f6f91" stroke-width="2"/><path d="M-80 164 q24 -7 48 0" stroke="#fff" stroke-width="2" fill="none" opacity=".6"/><rect x="-28" y="159" width="10" height="12" rx="3" fill="#e9eef1" stroke="#5b6b76" stroke-width="1.6"/></g>' +
        L(-48, 118, -58, 154) + Rr(8, 128, -21, 170);
    if (pose === "intubate")
      return L(-42, 122, -34, 168) + Rr(4, 130, -14, 172) + '<path d="M-36 168 l-10 6" stroke="#9aa6af" stroke-width="4" stroke-linecap="round"/>';
    if (pose === "palpate")     // fingertips on the femoral artery
      return L(-44, 128, -52, 180) + Rr(30, 122, 20, 150);
    if (pose === "paddles")     // holding the defibrillator paddles, ready
      return L(-34, 116, -26, 140) + Rr(34, 116, 26, 140) + '<rect x="-34" y="138" width="16" height="22" rx="4" fill="#3a4148"/><rect x="18" y="138" width="16" height="22" rx="4" fill="#3a4148"/><rect x="-34" y="155" width="16" height="5" fill="#c9d1d6"/><rect x="18" y="155" width="16" height="5" fill="#c9d1d6"/>';
    if (pose === "catheter")    // both hands on the foreleg, at the catheter
      return L(-14, 140, -4, 192) + Rr(18, 140, 12, 196);
    if (pose === "cart") return L(-26, 130, -20, 188) + Rr(26, 130, 20, 188);
    return L(-29, 126, -29, 164) + Rr(29, 126, 29, 164);   // arms at the sides
  }



  window.Figures = { figureLegs, figureUpper, armsFor, lookOf, arm };
})();
