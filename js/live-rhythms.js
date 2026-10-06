/* =================================================================
   ECG Rhythm Challenge Live: the standard rhythm set (RECOVER ALS Rescuer Course)
   8 rhythms, always in this set and this order (interleaved so one rhythm doesn't hint at the next). Waveforms are synthesized in millivolts (lead II-like).
   etco2: value shown during compressions (non-ROSC rhythms stay there; ROSC rises after compressions stop).
   ================================================================= */
window.LIVE_SET = (function () {
  const g = (x, m, s, a) => a * Math.exp(-((x - m) * (x - m)) / (2 * s * s));
  const TAU = Math.PI * 2;
  const fuzz = (t, s) => 0.5 * Math.sin(t * 311.7 + s) + 0.3 * Math.sin(t * 523.1 + s * 1.7) + 0.2 * Math.sin(t * 977.3 + s * 2.3);
  const wander = (t, s) => 0.035 * Math.sin(TAU * 0.27 * t + s) + 0.02 * Math.sin(TAU * 0.11 * t + s * 3);
  const LEAD = 0.08;   // first complex appears just after compressions stop

  // sum overlapping beats of a template (x = seconds since the beat began)
  function regular(interval, beat, noise) {
    return function (t, v) {
      if (t < 0) return 0;
      t -= LEAD;
      if (t < 0) return wander(t, v.seed) + 0.012 * fuzz(t, v.seed);
      const n = Math.floor(t / interval); let y = 0;
      for (let k = n; k >= Math.max(0, n - 3); k--) y += (1 + 0.04 * Math.sin(k * 2.1 + v.seed)) * beat(t - k * interval);
      return v.amp * y + wander(t, v.seed) + (noise || 0.012) * fuzz(t, v.seed);
    };
  }
  const sinusBeat = x => g(x, .060, .018, .12) - g(x, .132, .006, .10) + g(x, .150, .0085, 1.15) - g(x, .168, .0075, .30) + g(x, .320, .036, .28);
  const wideBeat = (x, k) => g(x, .060 * k, .030 * k, 1.00) - g(x, .135 * k, .040 * k, .78) + g(x, .190 * k, .022 * k, .10) - g(x, .340 * k, .070 * k, .36);
  // pulseless VT, wide: broad R, deep S, then a tall T that the next complex lands on (R on T)
  const vtWideRonT = x => g(x, .045, .020, 1.05) - g(x, .105, .024, .70) + g(x, .215, .040, .55);
  // pulseless VT, narrower and faster: sharp R, brief S, small T
  const vtNarrow = x => g(x, .030, .011, 1.10) - g(x, .064, .013, .62) + g(x, .135, .028, .26);

  // VF: chaotic oscillation (frequency- and amplitude-modulated); fine = fast and small
  function vf(baseHz, amplitude) {
    const comps = [[1.00, .55], [1.31, .38], [0.74, .36], [1.67, .22], [0.53, .28]];
    return function (t, v) {
      if (t < 0) return 0;
      const s = v.seed; let y = 0;
      comps.forEach(([m, w], i) => { y += w * Math.sin(TAU * baseHz * m * t + 2.8 * Math.sin(TAU * (0.29 + 0.19 * i) * t + s * (i + 1)) + s * (i + 2)); });
      const env = 0.45 + 0.55 * Math.abs(Math.sin(TAU * 0.33 * t + s)) * (0.7 + 0.3 * Math.sin(TAU * 1.3 * t + s * 2));
      return v.amp * amplitude * 0.62 * env * y + 0.6 * wander(t, s) + 0.02 * fuzz(t, s);
    };
  }
  // coarse VF that can pass for repeating complexes at first glance: large, nearly regular waves,
  // but the rate drifts and the height and shape change from wave to wave
  function vfOrganized() {
    return function (t, v) {
      if (t < 0) return 0;
      const s = v.seed;
      const phase = TAU * (4.1 * t + 0.22 * Math.sin(TAU * 0.37 * t + s) + 0.12 * Math.sin(TAU * 0.83 * t + 2 * s));
      const amp = 0.72 + 0.28 * Math.sin(TAU * 0.29 * t + s) + 0.18 * Math.sin(TAU * 0.71 * t + 3 * s);
      const shape = Math.sin(phase) + (0.30 + 0.18 * Math.sin(TAU * 0.5 * t + s)) * Math.sin(2 * phase + 0.9) + 0.12 * Math.sin(3 * phase + 2.1 + Math.sin(TAU * 0.2 * t));
      return v.amp * 0.95 * amp * shape + 0.5 * wander(t, s) + 0.025 * fuzz(t, s);
    };
  }
  const asystole = () => (t, v) => wander(t, v.seed) * 0.9 + 0.01 * fuzz(t, v.seed);
  const scaled = (k, f) => (t, v) => k * f(t, v);   // keep large rhythms inside the monitor

  const RHYTHMS = [
    { key: "pea84", cat: "pea", rate: 84, etco2: 26, detail: "Sinus-looking complexes at about 84/min",
      fn: regular(60 / 84, sinusBeat),
      teach: "This looks like a normal sinus rhythm, but there's no pulse: consistent, repeating complexes under 200/min without a pulse is PEA. Non-shockable." },
    { key: "vfFine", cat: "vf", rate: null, hr: "none", etco2: 18, detail: "Fine VF: low amplitude, high frequency",
      fn: vf(6.2, 0.32),
      teach: "No consistent, repeating complexes, and the ECG isn't a flat line: fine VF. Check the gain before calling it asystole. Shockable." },
    { key: "pea182", cat: "pea", rate: 182, etco2: 20, detail: "Wide, ventricular-looking complexes at about 182/min",
      fn: scaled(0.76, regular(60 / 182, x => wideBeat(x, 0.62))),
      teach: "Fast, wide, ventricular-looking complexes without a pulse, but the rate (about 182/min) is below 200/min, so by the RECOVER algorithm this is PEA, not pulseless VT. Non-shockable." },
    { key: "pvt294", cat: "pvt", rate: 294, etco2: 19, detail: "Narrower complexes at about 294/min",
      fn: scaled(0.78, regular(60 / 294, vtNarrow, 0.015)),
      teach: "No pulse, consistent and repeating complexes at well over 200/min: pulseless VT, even though the complexes are narrower. Shockable." },
    { key: "asys", cat: "asys", rate: 0, etco2: 21, detail: "No electrical activity",
      fn: asystole(),
      teach: "A flat line with no complexes: asystole. Non-shockable." },
    { key: "vfCoarse", cat: "vf", rate: null, hr: "wild", etco2: 24, detail: "Coarse VF that can look like repeating complexes at first glance",
      fn: scaled(0.62, vfOrganized()),
      teach: "At first glance these look like repeating complexes, but the height, shape and spacing keep changing: no consistent, repeating complexes, so this is coarse VF. Shockable." },
    { key: "rosc142", cat: "rosc", rate: 142, etco2: 28, etco2After: 56, detail: "Sinus rhythm at about 142/min with a pulse; ETCO₂ rising from 28 to 56 mmHg",
      fn: regular(60 / 142, sinusBeat),
      teach: "Organized rhythm with a palpable pulse and a sharp rise in ETCO₂: return of spontaneous circulation." },
    { key: "pvt216", cat: "pvt", rate: 216, etco2: 22, detail: "Wide complexes at about 216/min, each landing on the previous T wave (R on T)",
      fn: scaled(0.72, regular(60 / 216, vtWideRonT, 0.015)),
      teach: "No pulse, consistent and repeating wide complexes, and a rate above 200/min: pulseless VT. Shockable." }
  ];
  const CATS = [
    { key: "asys", label: "Asystole", short: "Asystole" }, { key: "pea", label: "PEA", short: "PEA" },
    { key: "vf", label: "VF", short: "VF" }, { key: "pvt", label: "Pulseless VT", short: "PVT" }, { key: "rosc", label: "ROSC", short: "ROSC" }
  ];
  return { RHYTHMS, CATS, byKey: k => RHYTHMS.find(r => r.key === k) };
})();
