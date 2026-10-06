# ECG Rhythm Challenge Live: setup

The instructor signs in and projects `index.html`; learners scan the QR code and play on `join.html` (no sign-in for learners). Administrators manage instructors, sessions and research results on `admin.html`. It uses the same Firebase project as the other games, so your settings (`js/config.js`) are already filled in.

## 1. Create the repository

1. On GitHub, create a new **public** repository named `ecg-live`.
2. Upload everything in this folder, keeping the folder structure: `index.html`, `join.html`, `admin.html`, `SETUP.md`, and the `css`, `js` and `assets` folders.
3. In **Settings → Pages**, set Source to **Deploy from a branch**, branch **main**, folder **/ (root)**, and save.
4. After a minute or two the projector page is at `https://djf42.github.io/ecg-live/`, and the QR code points learners to `https://djf42.github.io/ecg-live/join.html`.

## 2. Publish the database rules

Paste the new `firestore-rules.txt` into **Firebase → Firestore → Rules** and click **Publish**. It contains the rules for all three games plus the new live-session rules, so it replaces the old file completely.

## 3. Turn on emailed sign-in links

Instructors can sign in with Google (already turned on for the dashboards) or with a link sent to their email, for addresses that aren't Google accounts.

1. In Firebase, go to **Security → Authentication → Sign-in method**.
2. Click **Email/Password**, turn on **Enable**, then turn on **Email link (passwordless sign-in)**, and click **Save**.
3. Optional but recommended: in **Project settings → General**, set the **Public-facing name** to "RECOVER". That's the name instructors see on the sign-in email.

Anonymous sign-in (for learners) and Google sign-in are already on, and `djf42.github.io` is already an authorized domain.

## 4. Add yourself, administrators and instructors

1. Open `https://djf42.github.io/ecg-live/admin.html` and sign in with dan.fletcher@recoverinitiative.org. You're the owner, set in `js/config.js` and in the database rules.
2. On the **Instructors** tab, add each instructor's email address. For many at once, open **Add many instructors at once** and upload a text or CSV file (or paste the addresses): every email address in it is picked up, you see a preview of new, already-listed and invalid entries, and then **Add** saves the new ones as instructors. Importing an updated file later only adds the new addresses. Add administrators one at a time, choosing **Administrator**; only you can add or remove administrators.
3. People must sign in with exactly the address listed. Someone signed in with a different address sees a message asking them to contact an administrator.

## 5. Test with a few phones

1. Open the projector page on a laptop (ideally on a projector or second screen), sign in, and click **Full screen**. Instructors stay signed in on that laptop until they click **Sign out** in the lobby.
2. Scan the QR code with two or three phones, ideally with one phone on mobile data rather than Wi-Fi. Enter a name; role and country are optional.
3. Check that the names appear on the projector, then press the space bar (or a clicker) to play a few rhythms.
4. On each rhythm, check that the answer buttons appear on the phones when compressions stop, that the bar chart and leaderboard match what the phones chose, and that phones show their result only after **Show the answer**.
5. Finish (or press **End session**) and check that the phones say the session has ended.

## How it works

- **Fair timing.** The projector records when the answer window opens on Firebase's clock, and each answer is stamped on arrival with the same clock. The database refuses answers for the wrong rhythm, second answers, and answers more than 11 seconds after the window opened (10 seconds plus 1 second of grace).
- **Late joiners** can join at any time and start at 0 points.
- **Names** are deleted from the database when the session reaches the final screen or **End session** is pressed. The projector's podium still shows them for the room.
- **Research records** (`live_answers` in Firestore) are saved for every learner on every rhythm: rhythm, answer, correct or not, answer time, optional role and country, and no name. Only administrators can read them, on the admin page's **Research results** tab (filters by date, role and country, and a CSV download).
- **Sessions left open** (for example, if the projector's browser was closed mid-class) are closed automatically, and their names deleted, when the same instructor starts their next session. Administrators can also close them on the admin page's **Sessions** tab.

## Demo mode

Add `?demo` to the projector address (`https://djf42.github.io/ecg-live/?demo`) to run with a simulated class of 24, without phones. Useful for practising the flow or showing the game to someone.

## Roles

| Role | Who | Can |
| --- | --- | --- |
| Owner | dan.fletcher@recoverinitiative.org | Everything, including adding and removing administrators |
| Administrator | Added by the owner | Add and remove instructors, close sessions, see research results; also run sessions |
| Instructor | Added by an administrator | Sign in on the projector page and run sessions |
| Learner | Anyone with the session's code | Join and answer on a phone; no account |

The database rules enforce these roles, so they hold even if someone edits the pages.

## Files

| File | What it is |
| --- | --- |
| `index.html` | The projector page |
| `join.html` | The learner's phone page |
| `admin.html` | Administration: instructors, sessions, research results |
| `js/staff-auth.js` | Instructor and administrator sign-in (Google or emailed link) and roles |
| `js/admin.js` | Administration page logic |
| `js/display.js` | Projector logic: session, rounds, scoring, reveal, leaderboards |
| `js/phone.js` | Phone logic: joining, answering, results |
| `js/live-rhythms.js` | The standard 8-rhythm set: waveforms, rates, ETCO₂ values, teaching text |
| `js/rhythms.js`, `js/monitor.js` | ECG drawing, shared with the ECG game |
| `js/config.js` | Firebase settings |
| `js/mock-firebase.js` | Testing only: active only when the address contains `?mock` |

After changing a file, upload it again and do a hard refresh (Cmd+Shift+R on a Mac).
