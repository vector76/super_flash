(() => {
  const deck = Decks.multiplication;
  const cardById = Object.fromEntries(deck.cards.map(c => [c.id, c]));

  const SET_SIZE = 20;       // cards per set, followed by a break
  const ADVANCE_MS = 450;    // pause on a correct answer before the next card

  const $ = id => document.getElementById(id);
  const els = {
    prompt: $("prompt"), answer: $("answer"), form: $("answer-form"),
    feedback: $("feedback"), badge: $("card-badge"), card: $("card"),
    timerFill: $("timer-fill"), start: $("start-btn"),
    autosubmit: $("autosubmit"), sound: $("sound"),
    answered: $("stat-answered"), accuracy: $("stat-accuracy"),
    avg: $("stat-avg"), streak: $("stat-streak"),
    dots: $("set-dots"), cardActions: $("card-actions"), idk: $("idk-btn"),
    pause: $("pause-btn"), pauseOverlay: $("pause-overlay"), pauseNote: $("pause-note"),
    resume: $("resume-btn"), summary: $("summary"), summaryTitle: $("summary-title"),
    sumCorrect: $("sum-correct"), sumGold: $("sum-gold"), sumSilver: $("sum-silver"), sumAvg: $("sum-avg"),
    summaryMsg: $("summary-msg"), continueBtn: $("continue-btn"),
    grid: $("grid"), detail: $("cell-detail"), reset: $("reset-btn"),
    banner: $("banner"), dataInfo: $("data-info"), dataMsg: $("data-msg"),
    exportBtn: $("export-btn"), importBtn: $("import-btn"), importFile: $("import-file"),
  };

  // ---- Persistence ----
  // `data.log` is the stored history; `states` is derived from it by replay.
  let data, states;

  function setData(next) {
    data = next;
    states = buildStates(data.log);
    els.autosubmit.checked = data.settings.autosubmit !== false;
    els.sound.checked = data.settings.sound !== false;
  }

  function buildStates(log) {
    const out = {};
    for (const [t, card, ms, ok] of log) {
      SRS.review(out[card] || (out[card] = SRS.newState()), !!ok, ms, t);
    }
    return out;
  }

  function persist() {
    if (Store.save(data)) return;
    showBanner(Store.readOnly
      ? "This page is out of date, so progress isn't being saved. Reload the page."
      : "Progress couldn't be saved to browser storage. Download a backup from the Progress tab to keep your history.");
  }

  function showBanner(msg) {
    els.banner.textContent = msg;
    els.banner.classList.remove("hidden");
  }

  const loaded = Store.load();
  setData(loaded.data);
  if (loaded.warnings.length) showBanner(loaded.warnings.join(" "));

  // Another tab saved: pick up its history.
  window.addEventListener("storage", e => {
    if (e.key !== Store.KEY) return;
    setData(Store.load().data);
    if (!$("view-progress").classList.contains("hidden")) renderGrid();
  });

  let askedPersist = false;
  function requestPersistentStorage() {
    if (askedPersist) return;
    askedPersist = true;
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  }

  // ---- Session ----
  // Modes: idle → answering → (advancing | correcting) → answering ... → summary.
  // Any active mode can go to paused.
  const session = { answered: 0, correct: 0, totalMs: 0, streak: 0 };
  let set = [];            // results this set: { result: "gold" | "silver" | "right" | "wrong", ms }
  let current = null;      // card being shown
  let shownAt = 0;         // performance.now() when the card appeared
  let mode = "idle";
  let pausedFrom = null;   // mode that was interrupted by a pause
  let lastId = null;
  let rafId = 0;
  let advanceTimer = 0;

  function start() {
    if (mode !== "idle") return;
    Effects.unlock();
    els.start.classList.add("hidden");
    els.cardActions.classList.remove("hidden");
    newSet();
  }

  function newSet() {
    set = [];
    els.summary.classList.add("hidden");
    els.card.classList.remove("hidden");
    renderDots();
    nextCard();
  }

  function nextCard() {
    current = SRS.pickNext(deck.cards, states, Date.now(), lastId);
    lastId = current.id;
    els.badge.textContent = states[current.id] ? "" : "new";
    els.prompt.textContent = current.prompt;
    els.feedback.textContent = "";
    els.feedback.className = "feedback";
    els.card.className = "card";
    els.answer.value = "";
    els.answer.disabled = false;
    els.idk.disabled = false;
    els.answer.focus();
    mode = "answering";
    renderDots();
    shownAt = performance.now();
    runTimer();
  }

  // After an answer is finished: next card, or the end-of-set break.
  function advance() {
    if (set.length >= SET_SIZE) showSummary();
    else nextCard();
  }

  function runTimer() {
    cancelAnimationFrame(rafId);
    const full = SRS.OK_MS * 1.5;
    const tick = () => {
      if (mode !== "answering") return;
      const t = performance.now() - shownAt;
      const pct = Math.min(100, (t / full) * 100);
      els.timerFill.style.width = pct + "%";
      els.timerFill.className = t <= SRS.FAST_MS ? "fast" : t <= SRS.OK_MS ? "ok" : "slow";
      if (pct < 100) rafId = requestAnimationFrame(tick);
    };
    tick();
  }

  function record(correct, value, ms) {
    const now = Date.now();
    data.log.push([now, current.id, ms, correct ? 1 : 0, value, deck.id]);
    SRS.review(states[current.id] || (states[current.id] = SRS.newState()), correct, ms, now);
    persist();
    requestPersistentStorage();

    session.answered++;
    if (correct) {
      session.correct++;
      session.totalMs += ms;
      session.streak++;
    } else {
      session.streak = 0;
    }
    renderStats();
  }

  function submit() {
    const value = els.answer.value.trim();
    if (!value) return;

    if (mode === "correcting") {
      if (value === current.answer) advance();
      else { els.answer.value = ""; shake(); }
      return;
    }
    if (mode !== "answering") return;

    const ms = Math.round(performance.now() - shownAt);
    const correct = value === current.answer;
    record(correct, value, ms);

    if (correct) {
      // Rewards follow the scheduler's speed grades.
      const star = ms <= SRS.FAST_MS ? "gold" : ms <= SRS.OK_MS ? "silver" : null;
      set.push({ result: star || "right", ms });
      mode = "advancing";
      els.answer.disabled = true;
      els.idk.disabled = true;
      els.card.className = "card right";
      els.feedback.className = "feedback right";
      els.feedback.textContent = `✓ ${(ms / 1000).toFixed(1)}s`;
      renderDots();
      if (star) {
        if (els.sound.checked) star === "gold" ? Effects.chime() : Effects.ding();
        const dot = els.dots.children[set.length - 1];
        Effects.star(star, els.answer, dot, () => dot.classList.add("landed"));
      }
      advanceTimer = setTimeout(advance, ADVANCE_MS);
    } else {
      set.push({ result: "wrong", ms });
      showCorrection(`${escapeHtml(value)} ✗ — it's <strong>${current.answer}</strong>. Type it to continue.`);
    }
  }

  function dontKnow() {
    if (mode !== "answering") return;
    const ms = Math.round(performance.now() - shownAt);
    record(false, "?", ms);
    set.push({ result: "wrong", ms });
    showCorrection(`It's <strong>${current.answer}</strong>. Type it to continue.`);
  }

  function showCorrection(html) {
    mode = "correcting";
    renderDots();
    els.idk.disabled = true;
    els.card.className = "card wrong";
    els.feedback.className = "feedback wrong";
    els.feedback.innerHTML = html;
    els.answer.value = "";
    els.answer.focus();
    shake();
  }

  // ---- Pause ----
  function pause() {
    if (!["answering", "advancing", "correcting"].includes(mode)) return;
    pausedFrom = mode;
    mode = "paused";
    clearTimeout(advanceTimer);
    cancelAnimationFrame(rafId);
    els.answer.disabled = true;
    els.answer.blur();
    els.pauseNote.textContent = pausedFrom === "answering"
      ? "That card won't count. You'll get a different one when you resume." : "";
    els.pauseOverlay.classList.remove("hidden");
    els.resume.focus();
  }

  function resume() {
    if (mode !== "paused") return;
    els.pauseOverlay.classList.add("hidden");
    if (pausedFrom === "correcting") {
      mode = "correcting";
      els.answer.disabled = false;
      els.answer.focus();
    } else if (pausedFrom === "advancing") {
      advance();
    } else {
      nextCard();   // interrupted card is discarded; lastId keeps it from repeating
    }
  }

  // ---- End of set ----
  function showSummary() {
    mode = "summary";
    const right = set.filter(r => r.result !== "wrong");
    const count = kind => set.filter(r => r.result === kind).length;
    const perfect = right.length === set.length;
    els.card.classList.add("hidden");
    els.summary.classList.remove("hidden");
    els.summaryTitle.textContent = perfect ? "Perfect set!" : "Set complete";
    els.sumCorrect.textContent = `${right.length}/${set.length}`;
    els.sumGold.textContent = count("gold");
    els.sumSilver.textContent = count("silver");
    els.sumAvg.textContent = right.length
      ? (right.reduce((s, r) => s + r.ms, 0) / right.length / 1000).toFixed(1) + "s" : "–";
    els.summaryMsg.textContent = perfect
      ? "Every answer right. Take a short break, then keep going."
      : "Take a short break: stretch, look away from the screen. Then keep going.";
    els.continueBtn.focus();
    if (perfect) {
      Effects.confetti();
      if (els.sound.checked) Effects.fanfare();
    }
  }

  function continueSet() {
    if (mode !== "summary") return;
    newSet();
  }

  // ---- Rendering ----
  function renderDots() {
    let html = "";
    for (let i = 0; i < SET_SIZE; i++) {
      const r = set[i];
      const cls = r ? r.result : i === set.length && mode !== "summary" && mode !== "idle" ? "current" : "";
      html += `<span class="dot ${cls}"></span>`;
    }
    els.dots.innerHTML = html;
  }

  function shake() {
    els.card.classList.remove("shake");
    void els.card.offsetWidth;
    els.card.classList.add("shake");
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, ch => `&#${ch.charCodeAt(0)};`);
  }

  function renderStats() {
    els.answered.textContent = session.answered;
    els.accuracy.textContent = session.answered
      ? Math.round((session.correct / session.answered) * 100) + "%" : "–";
    els.avg.textContent = session.correct
      ? (session.totalMs / session.correct / 1000).toFixed(1) + "s" : "–";
    els.streak.textContent = session.streak;
  }

  // ---- Input handling ----
  els.answer.addEventListener("input", () => {
    if (els.answer.value.includes("?")) { els.answer.value = ""; dontKnow(); return; }
    const digits = els.answer.value.replace(/\D/g, "");
    if (digits !== els.answer.value) els.answer.value = digits;
    if (els.autosubmit.checked && current && digits.length === current.answer.length) submit();
  });
  els.form.addEventListener("submit", e => { e.preventDefault(); submit(); });
  els.start.addEventListener("click", start);
  els.idk.addEventListener("click", dontKnow);
  els.pause.addEventListener("click", pause);
  els.resume.addEventListener("click", resume);
  els.continueBtn.addEventListener("click", continueSet);
  els.autosubmit.addEventListener("change", () => {
    data.settings.autosubmit = els.autosubmit.checked;
    persist();
    if (mode === "answering" || mode === "correcting") els.answer.focus();
  });
  els.sound.addEventListener("change", () => {
    data.settings.sound = els.sound.checked;
    persist();
    if (els.sound.checked) Effects.chime();
    if (mode === "answering" || mode === "correcting") els.answer.focus();
  });
  document.addEventListener("keydown", e => {
    if ($("view-practice").classList.contains("hidden")) return;
    if (e.key === "Escape") { mode === "paused" ? resume() : pause(); return; }
    if (e.key !== "Enter" || e.target.tagName === "BUTTON") return;  // buttons handle their own Enter
    if (mode === "idle") start();
    else if (mode === "paused") resume();
    else if (mode === "summary") continueSet();
  });

  // Leaving the tab or window pauses, so time away is never counted.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") pause();
  });

  // ---- Progress view ----
  const LEVEL_NAMES = ["Struggling", "Learning", "Familiar", "Strong", "Mastered"];

  function renderGrid() {
    const { min, max } = deck;
    let html = `<div class="cell head corner">×</div>`;
    for (let b = min; b <= max; b++) html += `<div class="cell head">${b}</div>`;
    for (let a = min; a <= max; a++) {
      html += `<div class="cell head">${a}</div>`;
      for (let b = min; b <= max; b++) {
        const card = deck.at(a, b);
        const st = states[card.id];
        const lv = SRS.level(st);
        const avg = st && st.times.length ? avgOf(st.times) / 1000 : null;
        html += `<button type="button" class="cell lv-${lv < 0 ? "new" : lv}" data-id="${card.id}"
          title="${card.prompt}">${avg !== null ? avg.toFixed(1) : ""}</button>`;
      }
    }
    els.grid.innerHTML = html;
    els.detail.textContent = "";
    renderDataInfo();
  }

  function avgOf(xs) { return xs.reduce((s, x) => s + x, 0) / xs.length; }

  function describe(id) {
    const c = cardById[id];
    const st = states[id];
    if (!st) return `${c.prompt} = ${c.answer} · not seen yet`;
    const parts = [
      `${c.prompt} = ${c.answer}`,
      LEVEL_NAMES[SRS.level(st)],
      `${st.correct}/${st.seen} correct`,
    ];
    if (st.times.length) parts.push(`avg ${(avgOf(st.times) / 1000).toFixed(1)}s (last ${st.times.length})`);
    parts.push(`next review ${formatDue(st.due - Date.now())}`);
    return parts.join(" · ");
  }

  function formatDue(ms) {
    if (ms <= 0) return "now";
    const s = ms / 1000;
    if (s < 60) return `in ${Math.round(s)}s`;
    if (s < 3600) return `in ${Math.round(s / 60)} min`;
    if (s < 86400) return `in ${Math.round(s / 3600)} h`;
    return `in ${Math.round(s / 86400)} days`;
  }

  els.grid.addEventListener("click", e => {
    const cell = e.target.closest("[data-id]");
    if (!cell) return;
    els.grid.querySelectorAll(".selected").forEach(n => n.classList.remove("selected"));
    cell.classList.add("selected");
    els.detail.textContent = describe(cell.dataset.id);
  });

  // ---- Data: backup, restore, reset ----
  const fmtDate = t => new Date(t).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

  function renderDataInfo() {
    const n = data.log.length;
    const since = n ? ` since ${fmtDate(data.log[0][0])}` : "";
    const backup = data.lastBackup ? fmtDate(data.lastBackup) : "never";
    els.dataInfo.textContent = `${n} answer${n === 1 ? "" : "s"} recorded${since} · Last backup: ${backup}`;
  }

  function setDataMsg(msg, isError) {
    els.dataMsg.textContent = msg;
    els.dataMsg.classList.toggle("error", !!isError);
  }

  els.exportBtn.addEventListener("click", () => {
    data.lastBackup = Date.now();
    const blob = new Blob([Store.exportText(data)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `super-flash-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    persist();
    renderDataInfo();
    setDataMsg(`Backup downloaded (${data.log.length} answers).`);
  });

  els.importBtn.addEventListener("click", () => els.importFile.click());
  els.importFile.addEventListener("change", async () => {
    const file = els.importFile.files[0];
    els.importFile.value = "";
    if (!file) return;
    try {
      const { data: incoming, dropped } = Store.parseImport(await file.text());
      const { data: merged, added } = Store.merge(data, incoming);
      merged.settings = data.settings;
      setData(merged);
      persist();
      renderGrid();
      const already = incoming.log.length - added;
      let msg = `Restored ${added} answer${added === 1 ? "" : "s"} from the backup`;
      if (already) msg += ` (${already} were already here)`;
      if (dropped) msg += `; ${dropped} damaged entries skipped`;
      setDataMsg(msg + ".");
    } catch (e) {
      setDataMsg(`Couldn't restore: ${e.message}`, true);
    }
  });

  els.reset.addEventListener("click", () => {
    if (!confirm("Erase all progress? Download a backup first if you might want it back.")) return;
    Store.stashCurrent("before-reset");
    const fresh = Store.empty();
    fresh.settings = data.settings;
    setData(fresh);
    persist();
    renderGrid();
    setDataMsg("Progress reset.");
  });

  // ---- Tabs ----
  function showView(name) {
    if (name === "progress") pause();
    for (const v of ["practice", "progress"]) {
      $(`view-${v}`).classList.toggle("hidden", v !== name);
      $(`tab-${v}`).classList.toggle("active", v === name);
    }
    if (name === "progress") {
      renderGrid();
      setDataMsg("");
    } else if (mode === "paused") {
      els.resume.focus();
    }
  }
  $("tab-practice").addEventListener("click", () => showView("practice"));
  $("tab-progress").addEventListener("click", () => showView("progress"));

  renderStats();
  renderDots();
})();
