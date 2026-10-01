# Super Flash

A spaced-repetition flash card game for the browser. It starts with the
multiplication facts from 2 × 2 to 12 × 12.

## How it works

- A fact appears and you type the answer. The timer starts when the card is shown.
- Your grade depends on whether you were right and how long you took:
  - wrong → shown again in about 20 seconds
  - right in 3 s or less → full credit and a **gold star** with a chime; the next interval grows the most
  - right in 3–6 s → normal credit and a **silver star** with a ding
  - right but slower than 6 s → partial credit and no star; the next interval stays at 10 minutes or less
- Intervals are real time (1 min → 10 min → hours → days), using an SM-2-style
  ease factor, so facts you answer quickly drift away and slow ones come back sooner.
- When nothing is due, the game shows facts ahead of schedule. An early review only
  earns credit for the share of the wait that actually passed, so a long sitting can't
  push facts far into the future.
- The mastery color on the Progress tab comes from the current interval. Facts answered
  in 3 s or less reach "Mastered" after about 8 answers spread over a week. Facts that
  always take longer than 6 s stay at "Familiar".
- New facts are introduced from the small tables upward. Only a few unlearned
  facts are in play at a time.
- When you get one wrong, or press **I don't know** (or type `?`), you type the
  correct answer before moving on. "I don't know" counts the same as a wrong answer.
- Cards come in **sets of 20**. A row of dots shows progress through the set.
  After each set there's a short break screen with a summary. A perfect set gets confetti.
- Stars fly into that card's dot. Sound can be turned off.
- **Pause** (button or Esc) throws away the current card without recording it. You get
  a different card when you resume. Switching browser tabs, or opening the Progress
  tab, pauses automatically.
- 7 × 8 and 8 × 7 are tracked as separate cards.

The **Progress** tab shows a heat map of every fact with your average recent response time.

## Saving progress

Progress is saved in the browser's `localStorage`, so it stays on that device and browser.
On the Progress tab, **Download backup** saves a `.json` file of your whole history.
**Restore from backup** combines a backup with the history already in the browser and drops
duplicate answers. So restoring never erases anything, restoring the same file twice is
harmless, and backups from two devices can be combined.

### How storage stays compatible as the game changes

- **The review log is the only thing stored.** Each answer is one entry:
  `[time, cardId, ms, correct, typedAnswer, deckId]`. Scheduling state (intervals, ease, due
  dates) is never saved. It is rebuilt at load by replaying the log through `srs.js`,
  so changing the scheduler re-applies to all past answers automatically.
- **Card ids name the fact, not the deck** (`mul:7x8`). A deck can be resized, split,
  merged or removed, and a new deck can share facts with an old one, without losing
  history. Answers for cards that are in no current deck stay in the log.
- **The data format has a version number** (`schema` in `storage.js`). To change the
  format, bump `SCHEMA` and add a function to `migrations` that converts the previous
  version. Old browser data and old backup files are upgraded when they're loaded.
  Before upgrading, a copy of the old data is kept under `superflash:backup:*` in
  localStorage.
- **Safety nets:**
  - Unreadable saved data is set aside rather than overwritten.
  - Reset keeps one hidden copy (`superflash:backup:before-reset`).
  - Data saved by a newer version of the app is never overwritten by an older cached page.
  - Other open tabs pick up new answers.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Page markup |
| `style.css` | Styles (light and dark mode) |
| `srs.js` | Scheduler: grading, intervals, choosing the next card |
| `decks.js` | Deck definitions (add new decks here) |
| `storage.js` | Saved data format, migrations, backup and restore |
| `effects.js` | Sounds (synthesized, no audio files), gold/silver stars, confetti |
| `app.js` | UI, input handling, timing, sets, pause |

## Running locally

There is no build step. Open `index.html` directly, or serve the folder:

```
python -m http.server 8000
```

## Deploying to GitHub Pages

1. Push these files to the root of a GitHub repository.
2. In the repository, go to **Settings → Pages**.
3. Set **Source** to "Deploy from a branch", choose `main` and `/ (root)`, and save.
4. The site will be published at `https://<user>.github.io/<repo>/`.

When you release changes, bump the `?v=` number on the script and stylesheet links in
`index.html`. GitHub Pages lets browsers cache files for 10 minutes, and the version number
keeps a browser from mixing old and new files.
