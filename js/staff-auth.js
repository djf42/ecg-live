/* =================================================================
   ECG Rhythm Challenge Live: staff sign-in (projector page and admin page)
   Instructors and administrators sign in with Google or an emailed sign-in link.
   Roles: the owner (APP_CONFIG.adminEmails), then administrators and instructors
   listed in Firestore under live_staff/{email}. The database rules enforce the same roles.
   ================================================================= */
window.StaffAuth = (function () {
  let auth, db;
  const OWNERS = () => ((window.APP_CONFIG && APP_CONFIG.adminEmails) || []).map(e => e.toLowerCase());
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

  function init() {
    if (!firebase.apps.length) firebase.initializeApp(APP_CONFIG.firebase);
    auth = firebase.auth(); db = firebase.firestore();
    return { auth, db };
  }
  // finishing an emailed sign-in link: the link brings the browser back to this page
  async function completeEmailLink() {
    if (!(auth.isSignInWithEmailLink && auth.isSignInWithEmailLink(location.href))) return;
    let email = localStorage.getItem("staffEmail");
    if (!email) email = prompt("To finish signing in, confirm your email address:");
    if (!email) return;
    await auth.signInWithEmailLink(email.trim(), location.href);
    localStorage.removeItem("staffEmail");
    history.replaceState(null, "", location.pathname);
  }
  const google = () => auth.signInWithPopup(new firebase.auth.GoogleAuthProvider());
  function emailLink(email) {
    localStorage.setItem("staffEmail", email);
    return auth.sendSignInLinkToEmail(email, { url: location.origin + location.pathname, handleCodeInApp: true });
  }
  async function roleOf(user) {
    const email = (user.email || "").toLowerCase();
    if (!email) return null;
    if (OWNERS().includes(email)) return "owner";
    try { const d = await db.collection("live_staff").doc(email).get(); return d.exists ? d.data().role : null; }
    catch (e) { return null; }
  }
  // cb(user, role): user null when signed out (or only anonymously, from testing a phone on this device)
  function watch(cb) { auth.onAuthStateChanged(async u => { if (!u || u.isAnonymous) return cb(null, null); cb(u, await roleOf(u)); }); }
  const signOut = () => auth.signOut();

  // the sign-in panel, shared by both pages
  function panel(container, opts) {
    opts = opts || {};
    container.replaceChildren();
    const card = el("div", "signcard");
    card.append(el("p", "eyebrow", opts.eyebrow || "RECOVER ALS Rescuer Course"), el("h1", null, opts.title || "Instructor sign-in"));
    if (opts.blocked) {
      card.append(el("p", "signmsg warn", opts.blocked));
      const so = el("button", "btn ghost", "Sign out and use another account"); so.addEventListener("click", signOut);
      card.appendChild(so); container.appendChild(card); return;
    }
    card.appendChild(el("p", "muted", opts.lead || "Sign in with the email address RECOVER has registered for you."));
    const g = el("button", "btn", "Sign in with Google"); g.type = "button";
    const msg = el("p", "signmsg");
    g.addEventListener("click", () => google().catch(err => { msg.textContent = "Google sign-in didn't complete: " + (err.message || err); }));
    const or = el("p", "signor", "or get a sign-in link by email");
    const form = el("form", "signform"); const inp = el("input"); inp.type = "email"; inp.placeholder = "you@example.org"; inp.required = true; inp.autocomplete = "email";
    const send = el("button", "btn ghost", "Email me a link"); send.type = "submit";
    form.append(inp, send);
    form.addEventListener("submit", e => {
      e.preventDefault();
      const email = inp.value.trim(); if (!email) return;
      send.disabled = true;
      emailLink(email).then(() => { msg.textContent = "Check your email for a sign-in link from RECOVER (it may land in your spam folder). Open it on this device."; })
        .catch(err => { send.disabled = false; msg.textContent = "Couldn't send the link: " + (err.message || err); });
    });
    card.append(g, or, form, msg);
    container.appendChild(card);
  }
  return { init, completeEmailLink, watch, signOut, panel, roleOf, get db() { return db; }, get auth() { return auth; } };
})();
