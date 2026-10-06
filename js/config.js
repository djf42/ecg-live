/* =================================================================
   ECG Rhythm Challenge — settings
   Edit this file, then re-upload it to GitHub. All three pages use it:
   index.html (the game), leaderboard.html (public), dashboard.html (admin), gallery.html (rhythm review).
   ================================================================= */
window.APP_CONFIG = {

  // Your Firebase project settings (from Project settings → General → Your apps).
  firebase: {
    apiKey: "AIzaSyB-Evldhw1CRErqC9jT5sZ5jjj8ECKtiZI",
    authDomain: "cpr-misconceptions-1.firebaseapp.com",
    projectId: "cpr-misconceptions-1",
    storageBucket: "cpr-misconceptions-1.firebasestorage.app",
    messagingSenderId: "756118633177",
    appId: "1:756118633177:web:b42223f37567d1d5709cc8"
  },

  // Google accounts allowed to open the analytics dashboard.
  // These must ALSO be listed in the Firestore security rules (SETUP.md, step 3) —
  // the rules are what actually protect the data; this list only controls what the page shows.
  adminEmails: ["dan.fletcher@recoverinitiative.org"],

  leaderboardSize: 25,


  footer: "RECOVER Initiative"
};
