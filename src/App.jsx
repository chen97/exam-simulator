import { useState, useEffect, useMemo, useRef, useCallback, lazy, Suspense, memo } from 'react';
import { LazyMotion, domAnimation, m, AnimatePresence, MotionConfig } from 'motion/react';
import { Icon } from './icons.jsx';
import {
  validatePack,
  loadCustomPacks,
  saveCustomPacks,
  readFileAsText,
  EXAMPLE_JSON,
  AI_PROMPT,
} from './pack-loader.js';
import {
  saveSession,
  loadSession,
  clearSession,
  lastAnsweredIndex,
} from './session.js';
import { useTweaks } from './tweaks-panel.jsx';

// Defer the docs panel, results screen, and tweaks panel — none are needed
// for first paint, and the docs/tweaks bundles together pull in a chunk of
// JSX that's only ever shown on user intent.
const DocsPanel = lazy(() => import('./docs-panel.jsx'));
const ResultsScreen = lazy(() => import('./results-screen.jsx'));
const AppTweaks = lazy(() => import('./app-tweaks.jsx'));

// ─────────────────────────────────────────────────────────────────────────────
// Tweakable defaults (host can persist edits to these via __edit_mode_set_keys)
// ─────────────────────────────────────────────────────────────────────────────
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "system",
  "explanationMode": true,
  "studyMode": false,
  "density": "comfortable",
  "accent": "blue",
  "showTimer": true,
  "minutesPerQuestion": 3,
  "fontSize": 1
}/*EDITMODE-END*/;

// Resolve "system" -> "light"/"dark" by looking at the OS-level
// prefers-color-scheme. Used both for first paint and live updates so
// flipping iPhone night mode (or macOS dark mode) flips the app instantly.
const systemPrefersDark = () =>
  typeof window !== "undefined" &&
  window.matchMedia &&
  window.matchMedia("(prefers-color-scheme: dark)").matches;

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────
// Estimated time remaining: minutes-per-question × unanswered count.
const formatRemaining = (mins) => {
  if (mins <= 0) return "0m";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
};

// ─────────────────────────────────────────────────────────────────────────────
// Topbar
// ─────────────────────────────────────────────────────────────────────────────
function Topbar({
  mode, pack, theme, onToggleTheme,
  explanationMode, onToggleExplanation,
  studyMode, onToggleStudy,
  onOpenPalette, currentIndex, total,
  showTimer, remainingMins, onRestart,
}) {
  return (
    <header className="topbar">
      <div className="topbar-brand">
        <div className="brand-mark">eX</div>
        <span className="topbar-brand-text">Exam Simulator</span>
      </div>

      {mode !== "start" && pack && (
        <div className="topbar-meta">
          <span className="dot"></span>
          <span className="mono">{pack.code}</span>
          {mode === "exam" && (
            <>
              <span className="dot"></span>
              <span className="mono">{currentIndex + 1} / {total}</span>
            </>
          )}
        </div>
      )}

      <div className="topbar-spacer"></div>

      {mode === "exam" && showTimer && (
        <span className="timer-pill" title="Estimated time to finish all remaining questions" aria-label="Estimated remaining time">
          <span className="timer-pill-label">~ </span>{formatRemaining(remainingMins)}<span className="timer-pill-label"> left</span>
        </span>
      )}

      <div className="toggle-row">
        <label className="toggle-row-label" htmlFor="ex-mode" title="Show per-choice rationale and explanations">Explanations</label>
        <div
          id="ex-mode"
          role="switch"
          aria-checked={explanationMode}
          aria-label="Explanations"
          tabIndex={0}
          className={"switch " + (explanationMode ? "on" : "")}
          onClick={onToggleExplanation}
          onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); onToggleExplanation(); } }}
        />
      </div>

      <div className="toggle-row">
        <label className="toggle-row-label" htmlFor="study-mode" title="Reveal the correct answer without picking">Study</label>
        <div
          id="study-mode"
          role="switch"
          aria-checked={studyMode}
          aria-label="Study mode"
          tabIndex={0}
          className={"switch " + (studyMode ? "on" : "")}
          onClick={onToggleStudy}
          onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); onToggleStudy(); } }}
        />
      </div>

      {mode === "exam" && (
        <button className="icon-btn square" onClick={onOpenPalette} title="Question palette (P)" aria-label="Open question palette">
          <Icon.list />
        </button>
      )}

      <button className="icon-btn square" onClick={onToggleTheme} title="Toggle theme (D)" aria-label="Toggle dark mode">
        {theme === "dark" ? <Icon.sun /> : <Icon.moon />}
      </button>

      {mode !== "start" && (
        <button className="icon-btn" onClick={onRestart} title="Restart">
          <Icon.restart /> <span className="topbar-btn-text" style={{fontSize: 13}}>Restart</span>
        </button>
      )}
    </header>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Start screen
// ─────────────────────────────────────────────────────────────────────────────
function StartScreen({ packs, onStart, onUpload, onDeleteCustom, uploadError, uploadWarnings, onDismissUpload }) {
  const [selectedSlug, setSelectedSlug] = useState(packs[0]?.slug || null);
  const selected = packs.find((p) => p.slug === selectedSlug);
  const [questionOrder, setQuestionOrder] = useState("sequence");
  const [answerOrder, setAnswerOrder] = useState("sequence");
  const [showDocs, setShowDocs] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  // Auto-select newest pack after upload
  useEffect(() => {
    if (packs.length && !packs.find((p) => p.slug === selectedSlug)) {
      setSelectedSlug(packs[packs.length - 1].slug);
    }
  }, [packs.length]); // eslint-disable-line

  const handleFiles = async (files) => {
    if (!files || files.length === 0) return;
    // Pass the whole list so the handler can aggregate per-file results
    // instead of each file overwriting the previous one's error/warning.
    await onUpload(files);
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  };

  const copyExample = () => {
    navigator.clipboard?.writeText(EXAMPLE_JSON);
  };

  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const copyPrompt = () => {
    navigator.clipboard?.writeText(AI_PROMPT);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 1800);
  };

  const downloadExample = () => {
    const blob = new Blob([EXAMPLE_JSON], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "example-exam.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="start-wrap">
      <m.div
        className="start-card"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.4, 0.7, 0.2, 1] }}
      >
        <div className="start-eyebrow">{packs.length ? "Select an exam pack" : "Get started"}</div>
        <h1 className="start-title">{packs.length ? "Practice with focus." : "Upload an exam pack."}</h1>
        <p className="start-sub">
          {packs.length
            ? <>Choose a pack to begin — or upload a new <span className="mono" style={{fontSize:"0.9em"}}>.json</span> question set below.</>
            : <>Drop a <span className="mono" style={{fontSize:"0.9em"}}>.json</span> file containing your questions and answers to begin. See the format guide below for the schema.</>}
        </p>

        {packs.length > 0 && (
          <div className="pack-list">
            {packs.map((p) => (
              <div
                key={p.slug}
                className={"pack-card" + (p.slug === selectedSlug ? " selected" : "")}
                onClick={() => setSelectedSlug(p.slug)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedSlug(p.slug); }}}
              >
                <span className="pack-code">{p.code}</span>
                <div className="pack-info">
                  <div className="pack-title">{p.title}</div>
                  <div className="pack-meta">{p.vendor} · {p.questions.length} questions · {p.domains.length} domains</div>
                </div>
                <button
                  className="pack-delete"
                  onClick={(e) => { e.stopPropagation(); onDeleteCustom(p.slug); }}
                  title="Remove exam pack"
                  aria-label="Remove exam pack"
                >
                  <Icon.close />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Upload dropzone */}
        <div
          className={"dropzone" + (dragOver ? " is-over" : "")}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInputRef.current?.click(); } }}
          role="button"
          tabIndex={0}
          aria-label="Upload exam pack: drop a .json file here or activate to browse"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            multiple
            style={{ display: "none" }}
            onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }}
          />
          <Icon.upload />
          <div>
            <div className="dropzone-title">Upload exam pack</div>
            <div className="dropzone-sub">Drop a <span className="mono">.json</span> file here or click to browse · stored locally in your browser</div>
          </div>
        </div>

        <AnimatePresence>
          {(uploadError || (uploadWarnings && uploadWarnings.length > 0)) && (
            <m.div
              className={"upload-feedback " + (uploadError ? "error" : "warn")}
              initial={{ opacity: 0, y: -8, height: 0 }}
              animate={{ opacity: 1, y: 0, height: "auto" }}
              exit={{ opacity: 0, y: -8, height: 0 }}
              transition={{ duration: 0.22, ease: [0.4, 0.7, 0.2, 1] }}
              style={{ overflow: "hidden" }}
            >
              <div className="upload-feedback-head">
                {uploadError ? "Upload failed" : "Uploaded with warnings"}
                <button className="upload-feedback-close" onClick={onDismissUpload} aria-label="Dismiss"><Icon.close /></button>
              </div>
              {uploadError && (
                <ul>
                  {uploadError.slice(0, 8).map((e, i) => <li key={i}>{e}</li>)}
                  {uploadError.length > 8 && <li>…and {uploadError.length - 8} more</li>}
                </ul>
              )}
              {!uploadError && uploadWarnings && (
                <ul>
                  {uploadWarnings.slice(0, 5).map((w, i) => <li key={i}>{w}</li>)}
                  {uploadWarnings.length > 5 && <li>…and {uploadWarnings.length - 5} more</li>}
                </ul>
              )}
            </m.div>
          )}
        </AnimatePresence>

        {/* Format guide */}
        <button className="docs-toggle" onClick={() => setShowDocs((v) => !v)}>
          <Icon.book />
          <span>{showDocs ? "Hide" : "Show"} JSON format guide</span>
          <span className={"docs-caret" + (showDocs ? " open" : "")}>▾</span>
        </button>

        {showDocs && (
          <Suspense fallback={null}>
            <DocsPanel
              copyExample={copyExample}
              downloadExample={downloadExample}
              copyPrompt={copyPrompt}
              copiedPrompt={copiedPrompt}
            />
          </Suspense>
        )}

        <div className="start-config">
          <div className="config-field">
            <label className="config-label" htmlFor="cfg-qorder">Question order</label>
            <select id="cfg-qorder" className="config-select" value={questionOrder} onChange={(e) => setQuestionOrder(e.target.value)}>
              <option value="sequence">Sequence</option>
              <option value="shuffle">Shuffle</option>
            </select>
          </div>
          <div className="config-field">
            <label className="config-label" htmlFor="cfg-aorder">Answer order</label>
            <select id="cfg-aorder" className="config-select" value={answerOrder} onChange={(e) => setAnswerOrder(e.target.value)}>
              <option value="sequence">Sequence</option>
              <option value="shuffle">Shuffle</option>
            </select>
          </div>
        </div>

        <div className="start-actions">
          <button
            className="primary-btn" disabled={!selected}
            onClick={() => onStart(selected, questionOrder === "shuffle", answerOrder === "shuffle")}
          >
            Begin exam{selected && <> &nbsp;<span className="start-count mono">· {selected.questions.length} questions</span></>} &nbsp;→
          </button>
          {selected && <span className="nav-hint" style={{marginLeft: 12}}>Tip: <span className="mono">1–4</span> answer · <span className="mono">←/→</span> nav</span>}
        </div>
      </m.div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Option card
// Memoized — re-renders only when its own visual state changes, not on every
// parent render. Hover, tap, dim, and correct/incorrect pops are pure CSS;
// the rationale reveal uses a CSS grid-rows trick (0fr ↔ 1fr) so the height
// animates without JS-driven layout measurement per frame.
// ─────────────────────────────────────────────────────────────────────────────
const OptionCard = memo(function OptionCard({
  optKey, optText, isSelected, isCorrect, isPending, isMulti, locked,
  showRationale, rationaleText, onPick, registerRef,
}) {
  const showCorrect = locked && isCorrect;
  const showIncorrect = locked && isSelected && !isCorrect;
  const isDim = locked && !showCorrect && !showIncorrect;
  const hasRationale = showRationale && !!rationaleText;

  let cls = "option-card";
  if (showCorrect) cls += " is-correct";
  else if (showIncorrect) cls += " is-incorrect";
  else if (isDim) cls += " is-dim";
  if (isPending) cls += " is-pending";
  if (isMulti) cls += " is-multi";
  if (hasRationale) cls += " has-rationale";

  return (
    <button
      ref={(el) => registerRef(optKey, el)}
      className={cls}
      disabled={locked}
      onClick={() => onPick(optKey)}
      aria-pressed={isMulti ? (isPending || (locked && isSelected)) : undefined}
    >
      <div className="option-row">
        <span className="opt-key mono">{optKey}</span>
        <span className="opt-text">{optText}</span>
        {showCorrect && <span className="opt-status-icon" style={{color: "var(--good)"}}><Icon.check /></span>}
        {showIncorrect && <span className="opt-status-icon" style={{color: "var(--bad)"}}><Icon.x /></span>}
      </div>
      <div className="opt-rationale-wrap">
        <div className="opt-rationale-inner">
          <div className="opt-rationale">{rationaleText}</div>
        </div>
      </div>
    </button>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Question card
// ─────────────────────────────────────────────────────────────────────────────
function QuestionCard({
  question, index,
  response, flagged, onSelect, onToggleFlag,
  explanationMode, studyMode,
}) {
  const isMulti = Array.isArray(question.answer);
  const requiredPicks = isMulti ? question.answer.length : 1;
  // Study mode reveals the correct answer up front without recording a
  // response, so the locked/revealed UI runs for either condition.
  const locked = !!response || studyMode;
  const diffClass = "diff-" + (question.difficulty || "medium").toLowerCase();
  const optionRefs = useRef({});

  // Multi-select: in-progress picks before the user submits. Reset per
  // question via the question.id key so navigating away discards them.
  const [pending, setPending] = useState([]);
  useEffect(() => { setPending([]); }, [question.id]);

  // Which option keys are currently in the "selected" visual state, in
  // both locked and pre-lock multi.
  const selectedKeys = locked
    ? (response ? (Array.isArray(response.selected) ? response.selected : [response.selected]) : [])
    : pending;
  const isKeyCorrect = (key) =>
    Array.isArray(question.answer) ? question.answer.includes(key) : key === question.answer;

  // When the user picks an answer and explanation mode is on, scroll the
  // first selected option into view so the rationale lands in front.
  useEffect(() => {
    if (!explanationMode || !response) return;
    const first = Array.isArray(response.selected) ? response.selected[0] : response.selected;
    if (!first) return;
    const el = optionRefs.current[first];
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, [response, explanationMode]);

  // Stable per-key registrar + click handler. OptionCard is memoized, so
  // these need to keep identity across renders for memo to skip work.
  const registerRef = useCallback((key, el) => {
    if (el) optionRefs.current[key] = el;
    else delete optionRefs.current[key];
  }, []);

  const lockedRef = useRef(locked);
  const isMultiRef = useRef(isMulti);
  const onSelectRef = useRef(onSelect);
  lockedRef.current = locked;
  isMultiRef.current = isMulti;
  onSelectRef.current = onSelect;

  const onPick = useCallback((key) => {
    if (lockedRef.current) return;
    if (isMultiRef.current) {
      setPending((prev) => prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]);
    } else {
      onSelectRef.current(key);
    }
  }, []);

  const submitMulti = () => {
    if (pending.length !== requiredPicks) return;
    onSelect(pending);
  };

  return (
    <article
      className="question-card"
      data-screen-label={`Question ${index + 1}`}
    >
      <div className="q-head">
        <span className="q-num mono">Q{String(index + 1).padStart(2, "0")}</span>
        <span className="q-tag mono">{question.domain}</span>
        <span className={"q-tag mono " + diffClass}>{question.difficulty}</span>
        {isMulti && (
          <span className="q-tag mono q-tag-multi" title={`Select ${requiredPicks} answers`}>
            Select {requiredPicks}
          </span>
        )}
        <button
          className={"q-flag" + (flagged ? " flagged" : "")}
          onClick={onToggleFlag}
          title={flagged ? "Unflag question" : "Flag for review"}
          aria-pressed={flagged}
        >
          <Icon.flag />
        </button>
      </div>

      <h2 className="q-stem">{question.stem}</h2>

      <div className="options">
        {question.options.map((opt) => (
          <OptionCard
            key={opt.key}
            optKey={opt.key}
            optText={opt.text}
            isSelected={selectedKeys.includes(opt.key)}
            isCorrect={isKeyCorrect(opt.key)}
            isPending={!locked && isMulti && pending.includes(opt.key)}
            isMulti={isMulti}
            locked={locked}
            showRationale={locked && explanationMode}
            rationaleText={question.rationale?.[opt.key] || ""}
            onPick={onPick}
            registerRef={registerRef}
          />
        ))}
      </div>

      <AnimatePresence>
        {isMulti && !locked && (
          <m.div
            className="multi-submit-row"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: [0.4, 0.7, 0.2, 1] }}
          >
            <span className="multi-count mono">{pending.length} / {requiredPicks} selected</span>
            <button
              className="primary-btn small"
              disabled={pending.length !== requiredPicks}
              onClick={submitMulti}
            >
              Submit answer
            </button>
          </m.div>
        )}
      </AnimatePresence>

      {locked && explanationMode && question.explanation && (
        <div className="explanation-card">
          <span className="rationale-label">
            <Icon.book style={{width: 12, height: 12, marginRight: 6, verticalAlign: "-2px"}} />
            Explanation
          </span>
          <p>{question.explanation}</p>
        </div>
      )}
    </article>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Palette drawer
// ─────────────────────────────────────────────────────────────────────────────
function PaletteDrawer({ open, onClose, examQuestions, responses, flagged, currentIndex, onJump }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all"); // all | unanswered | flagged | wrong | correct

  useEffect(() => { if (!open) { setSearch(""); setFilter("all"); } }, [open]);

  const items = useMemo(() => {
    return examQuestions.map((q, posIdx) => {
      const resp = responses[q.id];
      return {
        posIdx,
        q,
        status: resp ? (resp.correct ? "correct" : "wrong") : "unanswered",
        flagged: flagged.has(q.id),
      };
    });
  }, [examQuestions, responses, flagged]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return items.filter((it) => {
      if (filter === "unanswered" && it.status !== "unanswered") return false;
      if (filter === "flagged" && !it.flagged) return false;
      if (filter === "wrong" && it.status !== "wrong") return false;
      if (filter === "correct" && it.status !== "correct") return false;
      if (!s) return true;
      return (
        it.q.stem.toLowerCase().includes(s) ||
        it.q.domain.toLowerCase().includes(s) ||
        it.q.id.toLowerCase().includes(s)
      );
    });
  }, [items, search, filter]);

  const rowVariants = {
    hidden: { opacity: 0, x: 16 },
    visible: { opacity: 1, x: 0, transition: { duration: 0.18 } },
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <m.div
            className="drawer-scrim"
            onClick={onClose}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          />
          <m.aside
            className="drawer"
            aria-hidden={!open}
            initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
          >
            <div className="drawer-head">
              <Icon.list />
              <span className="drawer-title">Questions</span>
              <button className="icon-btn square" onClick={onClose} aria-label="Close palette"><Icon.close /></button>
            </div>
            <div className="drawer-search-row">
              <input
                className="search-input"
                type="search"
                placeholder="Search questions, domains, IDs…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <div className="filter-chips">
                {[
                  ["all", "All"],
                  ["unanswered", "Unanswered"],
                  ["flagged", "Flagged"],
                  ["correct", "Correct"],
                  ["wrong", "Wrong"],
                ].map(([k, l]) => (
                  <button key={k} className={"chip" + (filter === k ? " active" : "")} onClick={() => setFilter(k)}>{l}</button>
                ))}
              </div>
            </div>
            <m.div
              className="drawer-list"
              initial="hidden"
              animate="visible"
              transition={{ staggerChildren: 0.015, delayChildren: 0.05 }}
            >
              {filtered.length === 0 && <div className="palette-empty">No questions match.</div>}
              {filtered.map((it) => (
                <m.button
                  key={it.q.id}
                  variants={rowVariants}
                  className={"palette-row" + (it.posIdx === currentIndex ? " current" : "")}
                  onClick={() => { onJump(it.posIdx); onClose(); }}
                >
                  <span className="palette-num">{String(it.posIdx + 1).padStart(2, "0")}</span>
                  <span className="palette-stem">{it.q.stem}</span>
                  <span className="palette-marks">
                    {it.flagged && <span className="palette-mark flagged" title="Flagged"></span>}
                    {it.status === "correct" && <span className="palette-mark correct" title="Correct"></span>}
                    {it.status === "wrong" && <span className="palette-mark wrong" title="Wrong"></span>}
                  </span>
                </m.button>
              ))}
            </m.div>
          </m.aside>
        </>
      )}
    </AnimatePresence>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main App
// ─────────────────────────────────────────────────────────────────────────────
function App() {
  // Tweaks-backed settings (also drive theme/density CSS vars)
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);

  // Track the OS-level color scheme so theme:"system" can follow it live
  // (e.g. iPhone night mode kicking in flips the app instantly).
  const [systemDark, setSystemDark] = useState(systemPrefersDark);
  useEffect(() => {
    if (!window.matchMedia) return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e) => setSystemDark(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  // "system" -> follow OS; otherwise honor the user's explicit choice.
  const effectiveTheme =
    tweaks.theme === "system" || !tweaks.theme
      ? (systemDark ? "dark" : "light")
      : tweaks.theme;

  // Apply CSS-affecting tweaks to <html>
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", effectiveTheme);
    document.documentElement.setAttribute("data-density", tweaks.density || "comfortable");
    document.documentElement.setAttribute("data-accent", tweaks.accent || "blue");
    // Clamp the slider value so a stale localStorage entry can't make the
    // stem hilariously huge or microscopic. 0.85 -> 1.25 keeps option text
    // between ~12.5 px and ~20 px on the default density.
    const scale = Math.max(0.85, Math.min(1.25, Number(tweaks.fontSize) || 1));
    document.documentElement.style.setProperty("--font-scale", String(scale));

    // Keep the iOS Safari toolbar / PWA status bar matching the effective
    // theme even when the user explicitly overrides the OS preference.
    // A no-media theme-color meta takes precedence over the media-queried
    // ones in index.html.
    let meta = document.querySelector('meta[name="theme-color"]:not([media])');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "theme-color";
      document.head.appendChild(meta);
    }
    meta.content = effectiveTheme === "dark" ? "#0e1014" : "#f7f6f2";
  }, [effectiveTheme, tweaks.density, tweaks.accent, tweaks.fontSize]);

  // Build pack registry: built-in packs from window.ExamPacks + uploaded customs
  const [customPacks, setCustomPacks] = useState(() => loadCustomPacks());
  const packs = useMemo(
    () => [...Object.values(window.ExamPacks || {}), ...customPacks],
    [customPacks]
  );

  const [uploadError, setUploadError] = useState(null);
  const [uploadWarnings, setUploadWarnings] = useState(null);

  // Accepts one or many files and aggregates every file's result, so a
  // failed upload in a multi-file drop isn't silently overwritten by a
  // later file's outcome. Each file is prefixed by name when more than
  // one was provided.
  const handleUpload = async (files) => {
    setUploadError(null);
    setUploadWarnings(null);
    const list = Array.from(files || []);
    if (list.length === 0) return;
    const multi = list.length > 1;
    const allErrors = [];
    const allWarnings = [];
    for (const file of list) {
      try {
        const text = await readFileAsText(file);
        let parsed;
        try { parsed = JSON.parse(text); }
        catch (e) {
          allErrors.push(`${file.name}: invalid JSON — ${e.message}`);
          continue;
        }
        const { pack, errors, warnings } = validatePack(parsed);
        if (errors.length) {
          allErrors.push(`${file.name}:`, ...errors);
          continue;
        }
        setCustomPacks((prev) => {
          const next = [...prev, pack];
          saveCustomPacks(next);
          return next;
        });
        warnings.forEach((w) => allWarnings.push(multi ? `${file.name}: ${w}` : w));
      } catch (e) {
        allErrors.push(`${file.name}: ${e.message || "could not read file"}`);
      }
    }
    if (allErrors.length) setUploadError(allErrors);
    if (allWarnings.length) setUploadWarnings(allWarnings);
  };

  const handleDeleteCustom = (slug) => {
    setCustomPacks((list) => {
      const next = list.filter((p) => p.slug !== slug);
      saveCustomPacks(next);
      return next;
    });
  };

  const dismissUpload = () => { setUploadError(null); setUploadWarnings(null); };

  // App state machine — seeded from any persisted session so closing and
  // reopening the tab resumes where the user left off. Per spec, the
  // initial question on resume is the last one with a recorded answer.
  const initialSession = useMemo(() => loadSession(), []);
  const initialIndex = initialSession
    ? (initialSession.mode === "exam"
        ? lastAnsweredIndex(initialSession.examQuestions, initialSession.responses)
        : initialSession.currentIndex)
    : 0;

  const [mode, setMode] = useState(initialSession ? initialSession.mode : "start");
  const [pack, setPack] = useState(initialSession ? initialSession.pack : null);
  const [examQuestions, setExamQuestions] = useState(initialSession ? initialSession.examQuestions : []);
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [responses, setResponses] = useState(initialSession ? initialSession.responses : {});
  const [flagged, setFlagged] = useState(initialSession ? initialSession.flagged : new Set());
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [startedAt, setStartedAt] = useState(initialSession ? initialSession.startedAt : 0);
  const [endedAt, setEndedAt] = useState(initialSession ? initialSession.endedAt : 0);

  // Edge-pill indicators shown live during a touch swipe so the user can
  // see the gesture being tracked before they release.
  const swipePrevRef = useRef(null);
  const swipeNextRef = useRef(null);

  // Estimated time remaining = unanswered × minutes-per-question.
  // Static (no ticking) — only changes when an answer is recorded.

  // Start exam
  const handleStart = (selectedPack, shuffleQuestions, shuffleAnswers) => {
    // 1. Question order
    const qs = [...selectedPack.questions];
    if (shuffleQuestions) {
      for (let i = qs.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [qs[i], qs[j]] = [qs[j], qs[i]];
      }
    }
    // 2. Per-question option shuffle + key remap
    const prepared = qs.map((q) => {
      let opts = q.options.map((o) => ({ ...o }));
      if (shuffleAnswers && opts.length > 1) {
        for (let i = opts.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [opts[i], opts[j]] = [opts[j], opts[i]];
        }
      }
      // Remap keys to A/B/C/D… in display order; track original key per option
      const remapped = opts.map((o, idx) => {
        const newKey = String.fromCharCode(65 + idx);
        return { key: newKey, text: o.text, _origKey: o.key };
      });
      const keyFor = (orig) => remapped.find((o) => o._origKey === orig)?.key || orig;
      const newAnswer = Array.isArray(q.answer) ? q.answer.map(keyFor) : keyFor(q.answer);
      let newRationale = null;
      if (q.rationale) {
        newRationale = {};
        for (const o of remapped) {
          if (q.rationale[o._origKey] != null) newRationale[o.key] = q.rationale[o._origKey];
        }
      }
      return {
        ...q,
        options: remapped.map(({ key, text }) => ({ key, text })),
        answer: newAnswer,
        rationale: newRationale,
      };
    });

    setPack(selectedPack);
    setExamQuestions(prepared);
    setCurrentIndex(0);
    setResponses({});
    setFlagged(new Set());
    setStartedAt(Date.now());
    setEndedAt(0);
    setMode("exam");
  };

  // Navigation. navDirection feeds the question-card slide animation:
  // +1 = next/forward (slides in from the right), -1 = previous,
  // 0 = no slide (initial load, palette jump).
  const [navDirection, setNavDirection] = useState(0);
  const goNext = useCallback(() => {
    setCurrentIndex((i) => {
      if (i + 1 >= examQuestions.length) {
        setEndedAt(Date.now());
        setMode("results");
        return i;
      }
      setNavDirection(1);
      return i + 1;
    });
  }, [examQuestions.length]);

  const goPrev = useCallback(() => {
    setCurrentIndex((i) => {
      if (i <= 0) return i;
      setNavDirection(-1);
      return i - 1;
    });
  }, []);

  const jumpTo = (idx) => {
    setCurrentIndex((i) => {
      const next = Math.max(0, Math.min(examQuestions.length - 1, idx));
      setNavDirection(next > i ? 1 : next < i ? -1 : 0);
      return next;
    });
  };

  // Answer selection
  const currentQ = mode === "exam" && examQuestions.length ? examQuestions[currentIndex] : null;
  const currentResponse = currentQ ? responses[currentQ.id] : null;

  // Lock in an answer. `pick` is a single key (single-answer Qs) or an
  // array of keys (multi-select). Correctness for multi requires the exact
  // set match.
  const handleSelect = (pick) => {
    if (!currentQ || currentResponse) return;
    const answer = currentQ.answer;
    let correct, selected;
    if (Array.isArray(answer)) {
      const picks = Array.isArray(pick) ? pick : [pick];
      const sortedPicks = [...picks].sort().join("");
      const sortedAns = [...answer].sort().join("");
      correct = sortedPicks === sortedAns;
      selected = picks;
    } else {
      const key = Array.isArray(pick) ? pick[0] : pick;
      correct = key === answer;
      selected = key;
    }
    setResponses((r) => ({
      ...r,
      [currentQ.id]: { selected, correct, ts: Date.now() },
    }));
  };

  const toggleFlag = () => {
    if (!currentQ) return;
    setFlagged((f) => {
      const n = new Set(f);
      if (n.has(currentQ.id)) n.delete(currentQ.id); else n.add(currentQ.id);
      return n;
    });
  };

  // Keyboard shortcuts
  useEffect(() => {
    if (mode !== "exam") return;
    const onKey = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      if (e.key === "ArrowRight") { e.preventDefault(); goNext(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); goPrev(); }
      else if (e.key === "p" || e.key === "P") { setDrawerOpen((o) => !o); }
      else if (e.key === "d" || e.key === "D") { setTweak("theme", effectiveTheme === "dark" ? "light" : "dark"); }
      else if (e.key === "f" || e.key === "F") { toggleFlag(); }
      else if (currentQ && !currentResponse && !Array.isArray(currentQ.answer)
               && ["1","2","3","4","5","6","7","8","9"].includes(e.key)) {
        const key = String.fromCharCode(64 + parseInt(e.key)); // 1->A … 9->I
        if (currentQ.options.some((o) => o.key === key)) handleSelect(key);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, goNext, goPrev, currentQ, currentResponse, effectiveTheme]);

  // Reset scroll on question change. Instant rather than smooth so it doesn't
  // race with the slide-in animation on the question card.
  useEffect(() => {
    if (mode !== "exam") return;
    window.scrollTo(0, 0);
  }, [currentIndex, mode]);

  // Swipe left/right on touch devices to navigate questions. The earlier
  // 50 px threshold misfired during reading and slow scrolls; this version
  // requires a deliberate horizontal flick. To commit at release:
  //   - >=80 px horizontal travel
  //   - <50 px vertical drift AND |dx| > |dy| * 1.5 (clearly horizontal)
  //   - gesture must not start on an interactive control (so picking an
  //     option or hitting Submit can't be misread as a swipe)
  // Duration / velocity gates were removed: with the live edge pill, the
  // user already gets visual confirmation that the gesture has crossed
  // the commit threshold (ring fills 0->1, inner snaps to accent). A
  // deliberate slow drag that fills the ring should commit on release,
  // not be rejected as "not a flick." If the user changes their mind,
  // they pull the finger back below the threshold and release.
  //
  // While the user is dragging, an edge pill (the swipe indicator) fades
  // in once the gesture clears the hint threshold and snaps to the accent
  // color when commit distance is reached, so the user can tell mid-swipe
  // that nav is being tracked.
  useEffect(() => {
    if (mode !== "exam") return;
    const SWIPE_MIN_DX = 80;
    const SWIPE_MAX_DY = 50;
    const SWIPE_AXIS_RATIO = 1.5;
    const HINT_MIN_DX = 24;

    let startX = 0;
    let startY = 0;
    let active = false;

    const isInteractive = (el) =>
      !!(el && el.closest && el.closest(
        "button, input, textarea, select, a, [role='button'], [role='switch']"
      ));

    const setIndicator = (el, progress, isPrev) => {
      if (!el) return;
      el.style.setProperty("--swipe-progress", String(progress));
      el.style.opacity = String(0.55 + 0.45 * progress);
      const slide = (1 - progress) * 28;
      el.style.transform =
        `translate3d(${isPrev ? -slide : slide}px, -50%, 0) scale(${0.85 + 0.15 * progress})`;
      const ready = progress >= 1;
      if (ready !== el.classList.contains("is-ready")) {
        el.classList.toggle("is-ready", ready);
      }
    };
    const resetIndicator = (el) => {
      if (!el) return;
      el.style.opacity = "0";
      el.style.setProperty("--swipe-progress", "0");
      el.classList.remove("is-ready");
    };
    const clearIndicators = () => {
      resetIndicator(swipePrevRef.current);
      resetIndicator(swipeNextRef.current);
    };

    // rAF-batch touchmove so DOM updates happen at most once per frame
    // (touchmove can fire at 120 Hz on modern iPads/iPhones; without
    // this the style writes pile up and microstutter the slide).
    let rafId = 0;
    let pendingDx = 0;
    let pendingDy = 0;
    const flushIndicator = () => {
      rafId = 0;
      const adx = Math.abs(pendingDx);
      const ady = Math.abs(pendingDy);
      const isHorizontalIntent =
        adx > HINT_MIN_DX && adx > ady * SWIPE_AXIS_RATIO && ady < SWIPE_MAX_DY;
      if (!isHorizontalIntent) {
        clearIndicators();
        return;
      }
      const progress = Math.min(
        1, (adx - HINT_MIN_DX) / Math.max(1, SWIPE_MIN_DX - HINT_MIN_DX)
      );
      const isPrev = pendingDx > 0;
      const target = isPrev ? swipePrevRef.current : swipeNextRef.current;
      const other = isPrev ? swipeNextRef.current : swipePrevRef.current;
      setIndicator(target, progress, isPrev);
      resetIndicator(other);
    };

    const onTouchStart = (e) => {
      if (drawerOpen) return;
      if (e.touches.length > 1) { active = false; clearIndicators(); return; }
      if (isInteractive(e.target)) { active = false; return; }
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      active = true;
    };
    const onTouchMove = (e) => {
      if (!active) return;
      const t = e.touches[0];
      pendingDx = t.clientX - startX;
      pendingDy = t.clientY - startY;
      if (rafId) return;
      rafId = requestAnimationFrame(flushIndicator);
    };
    const onTouchEnd = (e) => {
      if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
      clearIndicators();
      if (!active) return;
      active = false;
      const t = e.changedTouches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      const adx = Math.abs(dx);
      const ady = Math.abs(dy);
      // Geometric gates: must be past the visual commit threshold and
      // clearly horizontal. No duration / velocity check - the ring's
      // fill state is the user's "this will navigate" cue.
      if (adx < SWIPE_MIN_DX) return;
      if (ady > SWIPE_MAX_DY) return;
      if (adx < ady * SWIPE_AXIS_RATIO) return;
      if (dx < 0) goNext();
      else goPrev();
    };

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: true });
    document.addEventListener("touchend", onTouchEnd, { passive: true });
    document.addEventListener("touchcancel", clearIndicators, { passive: true });
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("touchcancel", clearIndicators);
    };
  }, [mode, drawerOpen, goNext, goPrev]);

  // Persist exam progress to localStorage while a session is active so a
  // closed tab can be resumed. Cleared explicitly on backToStart.
  useEffect(() => {
    if (mode === "start" || examQuestions.length === 0) return;
    saveSession({
      mode, pack, examQuestions, responses, flagged, currentIndex, startedAt, endedAt,
    });
  }, [mode, pack, examQuestions, responses, flagged, currentIndex, startedAt, endedAt]);

  // Reset / restart helpers
  const restartSameSet = () => {
    setResponses({});
    setFlagged(new Set());
    setCurrentIndex(0);
    setStartedAt(Date.now());
    setEndedAt(0);
    setMode("exam");
  };
  const backToStart = () => {
    clearSession();
    setPack(null); setExamQuestions([]); setCurrentIndex(0); setResponses({}); setFlagged(new Set());
    setMode("start");
  };
  const reviewAnswers = () => {
    setCurrentIndex(0);
    setMode("exam");
  };

  // Derived
  const total = examQuestions.length;
  // Counts the remaining questions starting at the user's current position
  // (not the unanswered count) — jumping forward via the palette reduces it,
  // jumping back increases it.
  const remainingMins = Math.max(0, (total - currentIndex) * (tweaks.minutesPerQuestion || 3));

  return (
    <LazyMotion features={domAnimation} strict>
    <MotionConfig reducedMotion="user">
    <div className="app-shell">
      <Topbar
        mode={mode}
        pack={pack}
        theme={effectiveTheme}
        onToggleTheme={() => setTweak("theme", effectiveTheme === "dark" ? "light" : "dark")}
        explanationMode={tweaks.explanationMode}
        onToggleExplanation={() => setTweak("explanationMode", !tweaks.explanationMode)}
        studyMode={!!tweaks.studyMode}
        onToggleStudy={() => setTweak("studyMode", !tweaks.studyMode)}
        onOpenPalette={() => setDrawerOpen(true)}
        currentIndex={currentIndex}
        total={total}
        showTimer={!!tweaks.showTimer}
        remainingMins={remainingMins}
        onRestart={mode === "results" ? restartSameSet : backToStart}
      />

      {mode === "start" && (
        <StartScreen
          packs={packs}
          onStart={handleStart}
          onUpload={handleUpload}
          onDeleteCustom={handleDeleteCustom}
          uploadError={uploadError}
          uploadWarnings={uploadWarnings}
          onDismissUpload={dismissUpload}
        />
      )}

      {mode === "exam" && currentQ && (
        <div className="exam-layout">
          {/* Left side-of-screen click zone — Previous */}
          <button
            className="side-zone left"
            onClick={goPrev}
            disabled={currentIndex === 0}
            aria-label="Previous question"
            title="Previous (←)"
          >
            <span className="side-zone-inner">
              <span className="side-zone-arrow"><Icon.arrowLeft /></span>
              <span>Prev</span>
            </span>
          </button>

          <main className="exam-main">
            <div className="exam-container">
              <div className="question-slot">
                <AnimatePresence mode="popLayout" custom={navDirection} initial={false}>
                  <m.div
                    key={currentQ.id}
                    custom={navDirection}
                    variants={{
                      enter: (dir) => ({ opacity: 0, x: dir === 0 ? 0 : dir > 0 ? 56 : -56 }),
                      center: { opacity: 1, x: 0 },
                      exit:  (dir) => ({ opacity: 0, x: dir > 0 ? -56 : 56 }),
                    }}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{ duration: 0.28, ease: [0.4, 0.7, 0.2, 1] }}
                  >
                    <QuestionCard
                      question={currentQ}
                      index={currentIndex}
                      response={currentResponse}
                      flagged={flagged.has(currentQ.id)}
                      onSelect={handleSelect}
                      onToggleFlag={toggleFlag}
                      explanationMode={!!tweaks.explanationMode}
                      studyMode={!!tweaks.studyMode}
                    />
                  </m.div>
                </AnimatePresence>
              </div>

              {/* Bottom nav row (mobile only — hidden on desktop via CSS) */}
              <div className="nav-row">
                <button className="ghost-btn" onClick={goPrev} disabled={currentIndex === 0}>
                  <Icon.arrowLeft /> Previous
                </button>
                <button className="ghost-btn" onClick={goNext}>
                  {currentIndex + 1 >= total ? "Finish" : "Next"} <Icon.arrowRight />
                </button>
              </div>
              <span className="nav-row-hint mono">
                1–4 answer · ← → nav · F flag · P palette
              </span>
            </div>
          </main>

          {/* Right side-of-screen click zone — Next / Finish */}
          <button
            className="side-zone right"
            onClick={goNext}
            aria-label={currentIndex + 1 >= total ? "Finish exam" : "Next question"}
            title={currentIndex + 1 >= total ? "Finish" : "Next (→)"}
          >
            <span className="side-zone-inner">
              {currentIndex + 1 >= total ? (
                <span className="side-zone-arrow side-zone-finish">Finish <Icon.arrowRight /></span>
              ) : (
                <>
                  <span className="side-zone-arrow"><Icon.arrowRight /></span>
                  <span>Next</span>
                </>
              )}
            </span>
          </button>

          <PaletteDrawer
            open={drawerOpen}
            onClose={() => setDrawerOpen(false)}
            examQuestions={examQuestions}
            responses={responses}
            flagged={flagged}
            currentIndex={currentIndex}
            onJump={jumpTo}
          />

          {/* Edge pills shown live during a touch swipe. The outer
              element wears a conic-gradient progress ring driven by the
              --swipe-progress CSS var; the inner pill holds the icon
              and snaps to the accent color once the gesture clears the
              commit threshold. All updates from the touchmove handler. */}
          {currentIndex > 0 && (
            <div ref={swipePrevRef} className="swipe-indicator prev" aria-hidden="true">
              <div className="pill-inner"><Icon.arrowLeft /></div>
            </div>
          )}
          <div ref={swipeNextRef} className="swipe-indicator next" aria-hidden="true">
            <div className="pill-inner"><Icon.arrowRight /></div>
          </div>
        </div>
      )}

      {mode === "results" && pack && (
        <Suspense fallback={null}>
          <ResultsScreen
            pack={pack}
            examQuestions={examQuestions}
            responses={responses}
            flagged={flagged}
            elapsedMs={endedAt - startedAt}
            onReview={reviewAnswers}
            onRestart={restartSameSet}
            onBackToStart={backToStart}
          />
        </Suspense>
      )}

      {/* Tweaks panel (host injects toggle in toolbar) */}
      <Suspense fallback={null}>
        <AppTweaks tweaks={tweaks} setTweak={setTweak} />
      </Suspense>
    </div>
    </MotionConfig>
    </LazyMotion>
  );
}

export default App;
