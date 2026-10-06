/* =================================================================
   ECG Rhythm Challenge — rhythm library
   Every waveform is synthesized from math, in millivolts, at Lead II-like
   morphology. Times are in seconds from the start of the rhythm.
   Edit the teaching text ("teach") freely; rates are set per rhythm.
   ================================================================= */
window.RHYTHM_LIB = (function () {

  const g = (x, m, s, a) => a * Math.exp(-((x - m) * (x - m)) / (2 * s * s));
  const TAU = Math.PI * 2;

  // smooth, deterministic "fuzz" so traces don't look computer-perfect
  function fuzz(t, seed) {
    return 0.5 * Math.sin(t * 311.7 + seed) + 0.3 * Math.sin(t * 523.1 + seed * 1.7) + 0.2 * Math.sin(t * 977.3 + seed * 2.3);
  }
  function wander(t, seed) { return 0.035 * Math.sin(TAU * 0.27 * t + seed) + 0.02 * Math.sin(TAU * 0.11 * t + seed * 3); }

  // ---- beat templates (x = seconds since the beat began) ----
  // narrow, sinus-looking complex: P wave, narrow QRS (~40 ms), upright T
  function sinusBeat(x) {
    return g(x, .060, .018, .12)          // P
         - g(x, .132, .006, .10)          // Q
         + g(x, .150, .0085, 1.15)        // R
         - g(x, .168, .0075, .30)         // S
         + g(x, .320, .036, .28);         // T
  }
  // wide, bizarre ventricular complex (~140 ms) with a discordant T; k stretches it
  function wideBeat(x, k) {
    k = k || 1;
    return g(x, .060 * k, .030 * k, 1.00)
         - g(x, .135 * k, .040 * k, .78)
         + g(x, .190 * k, .022 * k, .10)
         - g(x, .340 * k, .070 * k, .36);
  }

  // regular rhythm from a beat template; sums the last few beats so T waves overlap naturally
  // LEAD: the first complex begins this many seconds after compressions stop,
  // so it's visible as soon as the artifact clears
  const LEAD = 0.08;
  function regular(interval, beat, opts) {
    opts = opts || {};
    return function (t, v) {
      if (t < 0) return 0;
      t = t - LEAD;
      if (t < 0) return wander(t, v.seed) + (opts.noise || 0.012) * fuzz(t, v.seed);
      const n = Math.floor(t / interval);
      let y = 0;
      for (let k = n; k >= Math.max(0, n - 2); k--) {
        // tiny beat-to-beat amplitude variation
        const amp = 1 + 0.04 * Math.sin(k * 2.1 + v.seed);
        y += amp * beat(t - k * interval);
      }
      return v.amp * y + wander(t, v.seed) + (opts.noise || 0.012) * fuzz(t, v.seed);
    };
  }

  // monomorphic VT: large, regular, sine-like wide complexes
  function vt(rate) {
    const p = 60 / rate;
    return function (t, v) {
      if (t < 0) return 0;
      const ph = TAU * t / p;
      const y = Math.sin(ph) + 0.28 * Math.sin(2 * ph + 0.7) + 0.08 * Math.sin(3 * ph + 1.9);
      const amMod = 1 + 0.06 * Math.sin(TAU * 0.35 * t + v.seed);
      return v.amp * 0.60 * amMod * y + wander(t, v.seed) * 0.6 + 0.015 * fuzz(t, v.seed);
    };
  }

  // monomorphic VT with discrete complexes: sharp tall upstroke, deep negative trough,
  // then a brief near-flat segment (with a small notch) before the next complex
  function vtSpiky(rate) {
    const p = 60 / rate;
    return function (t, v) {
      if (t < 0) return 0;
      const k = Math.floor(t / p), f = (t - k * p) / p;              // position within the complex, 0..1
      const amp = 1 + 0.05 * Math.sin(k * 1.7 + v.seed);              // slight beat-to-beat variation
      const y = g(f, .13, .045, 1.15)                                 // tall, narrow upstroke
              - g(f, .34, .075, 1.25)                                 // deep negative trough
              + g(f, .58, .025, 0.09) - g(f, .66, .02, 0.06);         // small notch on the flat segment
      return 0.8 * v.amp * amp * y + wander(t, v.seed) * 0.5 + 0.02 * fuzz(t, v.seed);
    };
  }

  // ventricular fibrillation: chaotic, frequency- and amplitude-modulated oscillation
  function vf(baseHz, amplitude) {
    // five incommensurate components, each with strong frequency wobble, under a shifting envelope
    const comps = [[1.00, .55], [1.31, .38], [0.74, .36], [1.67, .22], [0.53, .28]];
    return function (t, v) {
      if (t < 0) return 0;
      const s = v.seed;
      let y = 0;
      comps.forEach(([m, w], i) => {
        y += w * Math.sin(TAU * baseHz * m * t + 2.8 * Math.sin(TAU * (0.29 + 0.19 * i) * t + s * (i + 1)) + s * (i + 2));
      });
      const env = 0.45 + 0.55 * Math.abs(Math.sin(TAU * 0.33 * t + s)) * (0.7 + 0.3 * Math.sin(TAU * 1.3 * t + s * 2));
      return v.amp * amplitude * 0.62 * env * y + 0.6 * wander(t, s) + 0.02 * fuzz(t, s);
    };
  }

  function asystole() {
    return function (t, v) { return wander(t, v.seed) * 0.9 + 0.01 * fuzz(t, v.seed); };
  }

  // chest-compression artifact: one large deflection per compression (~110/min) plus noise
  function compressionArtifact(t, seed) {
    const p = 60 / 110, k = Math.floor(t / p), x = (t - k * p) / p;   // x in [0,1)
    const depth = 1 + 0.08 * Math.sin(k * 1.9 + seed);                // compression-to-compression variation
    let y;
    if (x < 0.42) y = 1.05 * Math.sin(Math.PI * x / 0.42);           // downstroke push
    else y = -0.24 * Math.sin(Math.PI * (x - 0.42) / 0.58);          // recoil
    return depth * y - 0.2 + 0.07 * fuzz(t, seed) + 2.0 * wander(t, seed);
  }

  // ---- categories (the five answer choices) ----
  const CATS = [
    { key: "asys", label: "Asystole",                shockable: false },
    { key: "pea",  label: "PEA",                     shockable: false },
    { key: "vf",   label: "Ventricular fibrillation", short: "VF", shockable: true },
    { key: "pvt",  label: "Pulseless VT",            shockable: true },
    { key: "rosc", label: "ROSC",                    shockable: false }
  ];

  // ---- the ten rhythms ----
  // DRAFT teaching text: review and edit to match RECOVER wording.
  const RHYTHMS = [
    { key: "pea38w", cat: "pea", rate: 38, detail: "Wide complexes, about 38/min",
      fn: regular(60 / 38, x => wideBeat(x, 1.15)),
      teach: "No pulse, but consistent, repeating complexes (slow, wide and bizarre) at well under 200/min. That makes it PEA. Non-shockable." },
    { key: "pea94n", cat: "pea", rate: 94, detail: "Narrow complexes, about 94/min, sinus-looking",
      fn: regular(60 / 94, sinusBeat),
      teach: "This looks like a normal sinus rhythm, but there is no pulse: consistent, repeating complexes under 200/min without a pulse is PEA. A normal-looking ECG never proves circulation; the pulse check decides. Non-shockable." },
    { key: "pea164w", cat: "pea", rate: 164, detail: "Wide complexes, about 164/min",
      fn: regular(60 / 164, x => wideBeat(x, 0.80)),
      teach: "Fast, wide, consistent complexes without a pulse, but the rate (about 164/min) is below 200/min, so by the RECOVER algorithm this is PEA, not pulseless VT. Non-shockable." },
    { key: "pvt226", cat: "pvt", rate: 226, detail: "Wide complexes, about 226/min",
      fn: vt(226),
      teach: "No pulse, consistent and repeating wide complexes, and a rate above 200/min (about 226/min): pulseless ventricular tachycardia. Shockable." },
    { key: "pvt268", cat: "pvt", rate: 268, detail: "Wide complexes, about 268/min",
      fn: vtSpiky(268),
      teach: "No pulse, consistent and repeating wide complexes, and a rate well above 200/min (about 268/min): pulseless ventricular tachycardia. Shockable." },
    { key: "asys", cat: "asys", rate: 0, detail: "No electrical activity",
      fn: asystole(),
      teach: "A flat line with no electrical activity. Before calling asystole, check that the leads are attached and the gain is turned up, because fine VF can hide as a flat line. Non-shockable." },
    { key: "vfFine", cat: "vf", rate: null, hr: "none", detail: "Fine VF: high frequency, low amplitude",
      fn: vf(9.5, 0.23),
      teach: "Fine VF: small, rapid, chaotic oscillations with no identifiable complexes. It is easy to mistake for asystole, so check gain and leads. Shockable." },
    { key: "vfMed", cat: "vf", rate: null, hr: "none", detail: "VF: intermediate frequency and amplitude",
      fn: vf(6.5, 0.48),
      teach: "Chaotic, irregular electrical activity with no identifiable QRS complexes and no pulse: ventricular fibrillation. Shockable." },
    { key: "vfCoarse", cat: "vf", rate: null, hr: "wild", detail: "Coarse VF: low frequency, high amplitude",
      fn: vf(4.3, 1.0),
      teach: "Coarse VF: large, slow, chaotic undulations with no consistent shape. Its irregularity separates it from the regular complexes of pulseless VT. Shockable." },
    { key: "rosc", cat: "rosc", rate: 132, detail: "Sinus rhythm with a pulse, about 132/min",
      fn: regular(60 / 132, sinusBeat),
      teach: "Organized sinus rhythm with a palpable pulse: return of spontaneous circulation. A sudden, sustained rise in ETCO\u2082 is often the first sign." }
  ];

  // What the monitor's HR box shows for a rhythm:
  //   a number near the rhythm's rate, "0" for asystole, "---" when the monitor can't count ("none"),
  //   or a number jumping around wildly ("wild"), as monitors sometimes do in VF.
  function hrMode(r) { return r.hr || (r.cat === "asys" ? "zero" : "rate"); }
  // seconds after compressions stop before the HR box shows a number:
  // at least 1 s, and for organized rhythms not until the second complex has appeared
  function hrDelay(r) {
    if (hrMode(r) !== "rate" || !r.rate) return 1.0;
    return Math.max(1.0, LEAD + 60 / r.rate + 0.25);
  }
  function hrDescribe(r) {
    const m = hrMode(r);
    return m === "none" ? "---" : m === "wild" ? "jumps around wildly" : m === "zero" ? "0" : "about " + r.rate;
  }

  const catOf = key => CATS.find(c => c.key === key);
  const byKey = key => RHYTHMS.find(r => r.key === key);

  // per-round variation so repeat plays don't show identical strips
  function variant(seed) { return { seed: seed, amp: 0.92 + 0.16 * ((Math.sin(seed * 12.9898) * 43758.5453) % 1 + 1) % 1 }; }

  return { CATS, RHYTHMS, catOf, byKey, compressionArtifact, variant, hrMode, hrDescribe, hrDelay };
})();
