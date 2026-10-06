# ECG Rhythm Challenge Live: setup (stage 2)

The instructor projects `index.html`; learners scan the QR code and play on `join.html`. It uses the same Firebase project as the other games, so your settings (`js/config.js`) are already filled in.

## 1. Create the repository

1. On GitHub, create a new **public** repository named `ecg-live`.
2. Upload everything in this folder, keeping the folder structure: `index.html`, `join.html`, `SETUP.md`, and the `css`, `js` and `assets` folders.
3. In **Settings → Pages**, set Source to **Deploy from a branch**, branch **main**, folder **/ (root)**, and save.
4. After a minute or two the projector page is at `https://djf42.github.io/ecg-live/`, and the QR code points learners to `https://djf42.github.io/ecg-live/join.html`.

## 2. Publish the database rules

Paste the new `firestore-rules.txt` into **Firebase → Firestore → Rules** and click **Publish**. It contains the rules for all three games plus the new live-session rules, so it replaces the old file completely.

Nothing else needs changing in Firebase: anonymous sign-in is already on, and `djf42.github.io` is already an authorized domain.

## 3. Test with a few phones

1. Open the projector page on a laptop (ideally on a projector or second screen) and click **Full screen**.
2. Scan the QR code with two or three phones, ideally with one phone on mobile data rather than Wi-Fi. Enter a name; role and country are optional.
3. Check that the names appear on the projector, then press the space bar (or a clicker) to play a few rhythms.
4. On each rhythm, check that the answer buttons appear on the phones when compressions stop, that the bar chart and leaderboard match what the phones chose, and that phones show their result only after **Show the answer**.
5. Finish (or press **End session**) and check that the phones say the session has ended.

## How it works

- **Fair timing.** The projector records when the answer window opens on Firebase's clock, and each answer is stamped on arrival with the same clock. The database refuses answers for the wrong rhythm, second answers, and answers more than 11 seconds after the window opened (10 seconds plus 1 second of grace).
- **Late joiners** can join at any time and start at 0 points.
- **Names** are deleted from the database when the session reaches the final screen or **End session** is pressed. The projector's podium still shows them for the room.
- **Research records** (`live_answers` in Firestore) are saved for every learner on every rhythm: rhythm, answer, correct or not, answer time, optional role and country, and no name. Only administrators can read them; a dashboard comes in stage 3.

## Demo mode

Add `?demo` to the projector address (`https://djf42.github.io/ecg-live/?demo`) to run with a simulated class of 24, without phones. Useful for practising the flow or showing the game to someone.

## Known limits of stage 2 (fixed in stage 3)

- **Anyone with the link can start a session.** Instructor sign-in comes in stage 3, so don't share the projector address widely yet.
- **Closing the projector browser mid-session** leaves that session's names in the database until stage 3 adds automatic cleanup. Use **End session** to finish properly.

## Files

| File | What it is |
| --- | --- |
| `index.html` | The projector page |
| `join.html` | The learner's phone page |
| `js/display.js` | Projector logic: session, rounds, scoring, reveal, leaderboards |
| `js/phone.js` | Phone logic: joining, answering, results |
| `js/live-rhythms.js` | The standard 8-rhythm set: waveforms, rates, ETCO₂ values, teaching text |
| `js/rhythms.js`, `js/monitor.js` | ECG drawing, shared with the ECG game |
| `js/config.js` | Firebase settings |
| `js/mock-firebase.js` | Testing only: active only when the address contains `?mock` |

After changing a file, upload it again and do a hard refresh (Cmd+Shift+R on a Mac).
