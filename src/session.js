// ─────────────────────────────────────────────────────────────────────────────
// Exam session persistence — saves the in-progress exam (pack, prepared
// questions, responses, flags, position) to localStorage so closing and
// reopening the tab resumes where the user left off.
// ─────────────────────────────────────────────────────────────────────────────

const SESSION_KEY = "examSim:session";

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
      mode: session.mode,
      pack: session.pack,
      examQuestions: session.examQuestions,
      responses: session.responses,
      flagged: Array.from(session.flagged || []),
      currentIndex: session.currentIndex,
      startedAt: session.startedAt,
      endedAt: session.endedAt || 0,
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(serialized));
  } catch (e) {
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

export function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object") return null;
    if (!data.pack || !Array.isArray(data.examQuestions) || data.examQuestions.length === 0) return null;
    if (data.mode !== "exam" && data.mode !== "results") return null;
    return {
      mode: data.mode,
      pack: data.pack,
      examQuestions: data.examQuestions,
      responses: data.responses && typeof data.responses === "object" ? data.responses : {},
      flagged: new Set(Array.isArray(data.flagged) ? data.flagged : []),
      currentIndex: typeof data.currentIndex === "number" ? data.currentIndex : 0,
      startedAt: typeof data.startedAt === "number" ? data.startedAt : Date.now(),
      endedAt: typeof data.endedAt === "number" ? data.endedAt : 0,
    };
  } catch (e) {
    return null;
  }
}

export function clearSession() {
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
