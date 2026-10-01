// Persistent storage for Super Flash.
//
// The source of truth is an append-only review log. Card scheduling state is
// never stored: it is rebuilt by replaying the log through the scheduler, so
// changes to the scheduler apply to old history automatically. Cards are
// identified by stable, deck-independent ids (e.g. "mul:7x8"), so decks can be
// added, resized or removed without touching history.
//
// To change the stored shape: bump SCHEMA and add migrations[previousSchema].

const Store = (() => {
  const APP = "super-flash";
  const KEY = "superflash";
  const LEGACY_KEY = "superflash:mult-2-12"; // first prototype, before schemas
  const BACKUP_PREFIX = "superflash:backup:";
  const SCHEMA = 1;
  const LOG_FIELDS = ["t", "card", "ms", "ok", "ans"];
  const DEFAULT_SETTINGS = { autosubmit: true, sound: true };

  // migrations[n] turns schema-n data into schema-(n+1) data.
  const migrations = {
    // 0 -> 1: the prototype stored per-card scheduler state instead of a log.
    // Rebuild an approximate log from the counts and recent times it kept.
    0: old => {
      const log = [];
      for (const [id, s] of Object.entries(old.states || {})) {
        const card = id.includes(":") ? id : `mul:${id}`;
        const times = s.times || [];
        const avg = times.length ? times.reduce((a, b) => a + b, 0) / times.length : 5000;
        const nCorrect = s.correct || 0;
        const corrects = Array.from({ length: nCorrect }, (_, i) =>
          [times[i - (nCorrect - times.length)] ?? avg, 1]);
        const wrongs = Array.from({ length: Math.max(0, (s.seen || 0) - nCorrect) }, () => [avg, 0]);
        const lastWasWrong = s.reps === 0;
        const seq = lastWasWrong ? [...corrects, ...wrongs] : [...wrongs, ...corrects];
        const last = lastWasWrong ? (s.lastWrong || s.due) : s.due - s.interval;
        seq.forEach(([ms, ok], i) =>
          log.push([last - (seq.length - 1 - i) * 60000, card, Math.round(ms), ok, ""]));
      }
      return { schema: 1, settings: old.settings || {}, log };
    },
  };

  let readOnly = false;

  function read(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function write(key, value) {
    try { localStorage.setItem(key, value); return true; } catch (e) { return false; }
  }
  function stash(tag, text) {
    if (text != null) write(BACKUP_PREFIX + tag, text);
  }

  function validEntry(e) {
    return Array.isArray(e) && e.length >= 4 &&
      Number.isFinite(e[0]) && typeof e[1] === "string" && e[1] &&
      Number.isFinite(e[2]) && e[2] >= 0;
  }

  // Cleans up data of the current schema: validates, dedupes and sorts the log,
  // and fills in missing settings. Unknown top-level fields are preserved.
  function normalize(data) {
    const seen = new Set();
    const log = [];
    let dropped = 0;
    for (const e of Array.isArray(data.log) ? data.log : []) {
      if (!validEntry(e)) { dropped++; continue; }
      const key = e[0] + "|" + e[1];
      if (seen.has(key)) continue;
      seen.add(key);
      log.push([e[0], e[1], Math.round(e[2]), e[3] ? 1 : 0, String(e[4] ?? "")]);
    }
    log.sort((a, b) => a[0] - b[0]);
    const out = {
      app: APP,         // listed first so they lead the backup file,
      schema: SCHEMA,   // then set again below to override `data`
      ...data,
      app: APP,
      schema: SCHEMA,
      createdAt: data.createdAt || (log.length ? log[0][0] : Date.now()),
      lastBackup: data.lastBackup || null,
      settings: { ...DEFAULT_SETTINGS, ...(data.settings || {}) },
      logFields: LOG_FIELDS,
      log,
    };
    delete out.exportedAt;
    return { data: out, dropped };
  }

  function upgrade(raw) {
    let data = raw;
    let schema = Number.isInteger(data.schema) ? data.schema : 0;
    if (schema > SCHEMA) {
      throw new Error(`This data was saved by a newer version of Super Flash (format ${schema}). ` +
        "Reload the page to get the latest version.");
    }
    while (schema < SCHEMA) {
      data = migrations[schema](data);
      schema = data.schema;
    }
    return normalize(data);
  }

  function empty() {
    return normalize({}).data;
  }

  // Returns { data, warnings }.
  function load() {
    const warnings = [];
    const text = read(KEY);
    let raw = null;
    let source = text;

    if (text != null) {
      try { raw = JSON.parse(text); } catch (e) {
        stash("corrupt", text);
        warnings.push("Saved progress could not be read, so a fresh history was started. " +
          "The unreadable copy was kept in browser storage.");
      }
    } else {
      source = read(LEGACY_KEY);
      if (source) {
        try { raw = { ...JSON.parse(source), schema: 0 }; } catch (e) { /* ignore unreadable prototype data */ }
      }
    }
    if (!raw || typeof raw !== "object") return { data: empty(), warnings };

    try {
      const from = Number.isInteger(raw.schema) ? raw.schema : 0;
      const { data, dropped } = upgrade(raw);
      if (from < SCHEMA) {
        stash(`schema${from}`, source);
        save(data);
      }
      if (dropped) warnings.push(`${dropped} damaged history entries were skipped.`);
      return { data, warnings };
    } catch (e) {
      // Saved by a newer version: never overwrite it from this older page.
      readOnly = true;
      warnings.push(e.message + " Progress won't be saved until then.");
      return { data: empty(), warnings };
    }
  }

  function save(data) {
    if (readOnly) return false;
    return write(KEY, JSON.stringify(data));
  }

  // Backup file: readable JSON with one log entry per line.
  function exportText(data) {
    const { log, ...rest } = data;
    const head = JSON.stringify({ ...rest, exportedAt: new Date().toISOString() }, null, 2);
    const body = log.map(e => "    " + JSON.stringify(e)).join(",\n");
    return head.slice(0, -2) + `,\n  "log": [\n${body}\n  ]\n}\n`;
  }

  // Parses and upgrades a backup file. Throws with a readable message.
  function parseImport(text) {
    let raw;
    try { raw = JSON.parse(text); } catch (e) { throw new Error("That file isn't valid JSON."); }
    if (!raw || typeof raw !== "object") throw new Error("That file isn't a Super Flash backup.");
    if (raw.app !== APP) {
      if (raw.states && !raw.schema) raw = { ...raw, schema: 0 };
      else throw new Error("That file isn't a Super Flash backup.");
    }
    return upgrade(raw);
  }

  // Union of two histories. Merging the same backup twice changes nothing.
  function merge(current, incoming) {
    const { data } = normalize({
      ...current,
      createdAt: Math.min(current.createdAt, incoming.createdAt),
      log: current.log.concat(incoming.log),
    });
    return { data, added: data.log.length - current.log.length };
  }

  function stashCurrent(tag) {
    stash(tag, read(KEY));
  }

  return {
    KEY, load, save, empty, exportText, parseImport, merge, stashCurrent,
    get readOnly() { return readOnly; },
  };
})();
