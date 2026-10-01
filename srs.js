// Spaced repetition scheduler (SM-2 variant) where the grade comes from
// correctness plus response time, and intervals are real wall-clock time.

const SRS = (() => {
  const SEC = 1000;
  const MIN = 60 * SEC;

  const FAST_MS = 3 * SEC;  // at or under this: grade 5
  const OK_MS = 6 * SEC;    // at or under this: grade 4; slower correct: grade 3
  const RETRY_DELAY = 20 * SEC;
  const FIRST_INTERVAL = 1 * MIN;
  const SECOND_INTERVAL = 10 * MIN;
  const MIN_EASE = 1.3;
  const MAX_LEARNING = 4;   // cap on cards in early learning before adding new ones
  const HISTORY_LEN = 5;

  function newState() {
    return { reps: 0, ease: 2.5, interval: 0, due: 0, seen: 0, correct: 0, lapses: 0, times: [] };
  }

  function grade(correct, ms) {
    if (!correct) return 0;
    if (ms <= FAST_MS) return 5;
    if (ms <= OK_MS) return 4;
    return 3;
  }

  // Updates state in place for an answer given at time `now`.
  function review(state, correct, ms, now) {
    const q = grade(correct, ms);
    // Share of the scheduled wait that actually passed: 1 when the card is due,
    // less when it is reviewed ahead of schedule. Early reviews earn only that
    // share of the usual credit, so playing a lot in one sitting can't push
    // cards far into the future.
    const credit = state.interval > 0
      ? Math.max(0, Math.min(1, 1 - (state.due - now) / state.interval)) : 1;
    state.seen++;
    if (correct) {
      state.correct++;
      state.times.push(Math.round(ms));
      if (state.times.length > HISTORY_LEN) state.times.shift();
    }

    if (q < 3) {
      state.lapses++;
      state.reps = 0;
      state.interval = 0;
      state.ease = Math.max(MIN_EASE, state.ease - 0.2);
      state.due = now + RETRY_DELAY;
      state.lastWrong = now;
      return q;
    }

    const easeDelta = 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02);
    // Ease only rises on reviews that are due; many tiny early bonuses would add up.
    const updateEase = () => {
      if (easeDelta < 0 || credit >= 1) state.ease = Math.max(MIN_EASE, state.ease + easeDelta);
    };

    if (state.reps === 1 && credit < 1) {
      // First learning step isn't up yet: practice counts, but the card stays
      // on its current schedule instead of advancing.
      updateEase();
      return q;
    }

    if (state.reps === 0) state.interval = FIRST_INTERVAL;
    else if (state.reps === 1) state.interval = SECOND_INTERVAL;
    else {
      // Grow from the time actually waited; an early review never shrinks the interval.
      const speed = q === 5 ? 1.3 : q === 4 ? 1.0 : 0.6;
      const grown = Math.round(state.interval * credit * state.ease * speed);
      state.interval = credit < 1 ? Math.max(state.interval, grown) : grown;
    }
    if (q === 3) state.interval = Math.min(state.interval, SECOND_INTERVAL);
    updateEase();
    state.reps++;
    state.due = now + state.interval;
    return q;
  }

  // Picks the next card. `states` maps card id -> state (missing = unseen).
  function pickNext(cards, states, now, lastId) {
    const seen = cards.filter(c => states[c.id]);
    const candidates = seen.filter(c => c.id !== lastId);

    // 1. Most overdue card.
    const due = candidates
      .filter(c => states[c.id].due <= now)
      .sort((x, y) => states[x.id].due - states[y.id].due);
    if (due.length) return due[0];

    // 2. A new card, unless too many are still in early learning.
    const learning = candidates.filter(c => states[c.id].reps < 2);
    const fresh = cards.find(c => !states[c.id] && c.id !== lastId);
    if (fresh && learning.length < MAX_LEARNING) return fresh;

    // 3. Review ahead: whatever comes due soonest, preferring learning cards.
    const pool = learning.length ? learning : candidates;
    if (pool.length) {
      return pool.slice().sort((x, y) => states[x.id].due - states[y.id].due)[0];
    }
    return fresh || cards.find(c => c.id === lastId) || cards[0];
  }

  // 0..4 mastery level for display, or -1 if unseen.
  function level(state) {
    if (!state) return -1;
    if (state.reps === 0) return 0;
    if (state.interval < SECOND_INTERVAL) return 1;
    if (state.interval < 24 * 60 * MIN) return 2;
    if (state.interval < 7 * 24 * 60 * MIN) return 3;
    return 4;
  }

  return { newState, review, pickNext, level, FAST_MS, OK_MS };
})();
