// ─────────────────────────────────────────────────────────────────────────────
// Exam session persistence — saves the in-progress exam to localStorage so
// closing and reopening the tab can resume where the user left off.
//
// What is NOT saved: the question text. v1 of this file stored the whole pack
// plus a prepared copy of every question, so a session cost roughly twice the
// pack's size on top of the copy already in the pack library. With a large
// bilingual pack that blew straight through Safari's ~5 MB localStorage cap on
// iOS — setItem threw, the throw was swallowed, and the session silently never
// saved. So instead we store a reference to the pack and, per question, the
// option ordering that was shown, and rebuild from the library on load. A
// 1000-question session is now tens of KB rather than ~5.6 MB.
// ─────────────────────────────────────────────────────────────────────────────
import { prepareQuestion } from "./pack-loader.js";

const SESSION_KEY = "examSim:session";
const SESSION_VERSION = 2;

// Coalesce rapid state updates into a single write per idle/animation tick so
// typing/picking on slower devices isn't blocked by JSON.stringify of the full
// session on every keystroke.
let pendingSession = null;
let scheduled = false;
const flush = () => {
  scheduled = false;
  const session = pendingSession;
  pendingSession = null;
  if (!session) return;
  try {
    const serialized = {
      v: SESSION_VERSION,
      mode: session.mode,
      // Reference, not a copy — the questions live in the pack library.
      packSlug: session.pack?.slug,
      // Per question: its id, and the original option keys in the order they
      // were shown. Answers were recorded against those display positions, so
      // the ordering has to come back exactly as it went out.
      order: (session.examQuestions || []).map((q) => ({
        i: q.id,
        k: q.options.map((o) => o._origKey || o.key),
      })),
      responses: session.responses,
      flagged: Array.from(session.flagged || []),
      currentIndex: session.currentIndex,
      startedAt: session.startedAt,
      endedAt: session.endedAt || 0,
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(serialized));
  } catch (e) {
    // Storage full or blocked (private mode, quota). Nothing actionable here —
    // the exam keeps working, it just won't be resumable.
    console.warn("Failed to save exam session:", e);
  }
};

export function saveSession(session) {
  pendingSession = session;
  if (scheduled) return;
  scheduled = true;
  const schedule =
    typeof requestIdleCallback === "function"
      ? (cb) => requestIdleCallback(cb, { timeout: 500 })
      : (cb) => setTimeout(cb, 16);
  schedule(flush);
}

// The debounce leaves a small window where the latest state exists only in
// pendingSession. Flush synchronously when the page is being hidden or
// unloaded so the answer picked right before closing the tab isn't lost.
// (flush no-ops when nothing is pending, so this is free otherwise.)
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
}

// `packs` is the current pack registry — a v2 session is rebuilt against it.
// Returns null when the session is missing, malformed, or its pack is no
// longer in the library (there is nothing to rebuild from, so don't guess).
export function loadSession(packs) {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object") return null;
    if (data.mode !== "exam" && data.mode !== "results") return null;

    const common = {
      mode: data.mode,
      responses: data.responses && typeof data.responses === "object" ? data.responses : {},
      flagged: new Set(Array.isArray(data.flagged) ? data.flagged : []),
      currentIndex: typeof data.currentIndex === "number" ? data.currentIndex : 0,
      startedAt: typeof data.startedAt === "number" ? data.startedAt : Date.now(),
      endedAt: typeof data.endedAt === "number" ? data.endedAt : 0,
    };

    // v1 sessions inlined the pack and the prepared questions. Still readable
    // so an exam in progress across this upgrade isn't thrown away.
    if (data.pack && Array.isArray(data.examQuestions) && data.examQuestions.length) {
      return { ...common, pack: data.pack, examQuestions: data.examQuestions };
    }

    if (!Array.isArray(data.order) || data.order.length === 0) return null;
    const pack = (packs || []).find((p) => p.slug === data.packSlug);
    if (!pack) {
      // The pack was deleted (or this is another browser profile). The session
      // can never be rebuilt, so drop it rather than leaving dead bytes.
      clearSession();
      return null;
    }

    const byId = new Map(pack.questions.map((q) => [q.id, q]));
    const examQuestions = [];
    for (const entry of data.order) {
      const src = byId.get(entry?.i);
      if (!src || !Array.isArray(entry.k)) return null;
      const prepared = prepareQuestion(src, entry.k);
      // The pack was replaced by a different version under the same slug —
      // resuming would show answers against the wrong options.
      if (!prepared) return null;
      examQuestions.push(prepared);
    }

    return { ...common, pack, examQuestions };
  } catch (e) {
    return null;
  }
}

export function clearSession() {
  // Drop any pending debounced write FIRST — otherwise a flush scheduled
  // just before the user left the exam would fire after the removeItem
  // below and resurrect the session they explicitly abandoned.
  pendingSession = null;
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch (e) {
    // ignore
  }
}

// Index of the last question that has a recorded response, or 0 if none.
export function lastAnsweredIndex(questions, responses) {
  if (!Array.isArray(questions) || !responses) return 0;
  for (let i = questions.length - 1; i >= 0; i--) {
    if (responses[questions[i].id]) return i;
  }
  return 0;
}
