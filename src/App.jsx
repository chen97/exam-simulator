import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { motion, MotionConfig } from 'motion/react';
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
import {
  useTweaks,
  TweaksPanel,
  TweakSection,
  TweakRadio,
  TweakSelect,
  TweakToggle,
  TweakSlider,
} from './tweaks-panel.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Tweakable defaults (host can persist edits to these via __edit_mode_set_keys)
// ─────────────────────────────────────────────────────────────────────────────
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "light",
  "explanationMode": true,
  "studyMode": false,
  "density": "comfortable",
  "accent": "blue",
  "showTimer": true,
  "minutesPerQuestion": 3
}/*EDITMODE-END*/;

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────
const formatTime = (ms) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
};

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
    for (const f of files) {
      await onUpload(f);
    }
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
      <motion.div
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
              <motion.div
                key={p.slug}
                className={"pack-card" + (p.slug === selectedSlug ? " selected" : "")}
                onClick={() => setSelectedSlug(p.slug)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedSlug(p.slug); }}}
                animate={p.slug === selectedSlug ? { scale: [0.97, 1.015, 1] } : { scale: 1 }}
                transition={{ duration: 0.2, ease: [0.4, 0.7, 0.2, 1] }}
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
              </motion.div>
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
          role="button"
          tabIndex={0}
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

        {(uploadError || (uploadWarnings && uploadWarnings.length > 0)) && (
          <div className={"upload-feedback " + (uploadError ? "error" : "warn")}>
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
          </div>
        )}

        {/* Format guide */}
        <button className="docs-toggle" onClick={() => setShowDocs((v) => !v)}>
          <Icon.book />
          <span>{showDocs ? "Hide" : "Show"} JSON format guide</span>
          <span className={"docs-caret" + (showDocs ? " open" : "")}>▾</span>
        </button>

        {showDocs && (
          <div className="docs-panel">
            <p className="docs-lede">
              An exam pack is a single JSON object with a <span className="mono">questions</span> array.
              Required fields are <strong>bold</strong>; everything else has sensible defaults.
            </p>

            {/* AI prompt — copy & paste into ChatGPT / Claude / Gemini */}
            <div className="ai-prompt-card">
              <div className="ai-prompt-head">
                <div>
                  <div className="ai-prompt-title">✨ Generate questions with AI</div>
                  <div className="ai-prompt-sub">Copy this prompt, paste it into ChatGPT / Claude / Gemini, fill in the angle-bracket placeholders, and save the response as a <span className="mono">.json</span> file to upload here.</div>
                </div>
                <button className={"primary-btn small" + (copiedPrompt ? " copied" : "")} onClick={copyPrompt}>
                  {copiedPrompt ? <><Icon.check /> Copied</> : <>Copy AI prompt</>}
                </button>
              </div>
              <pre className="ai-prompt-preview mono">{AI_PROMPT}</pre>
            </div>

            <div className="docs-section-title">Top-level fields</div>
            <table className="docs-table">
              <thead><tr><th>Field</th><th>Type</th><th>Notes</th></tr></thead>
              <tbody>
                <tr><td className="mono"><strong>title</strong></td><td>string</td><td>Display name of the exam.</td></tr>
                <tr><td className="mono">code</td><td>string</td><td>Short code (e.g. <span className="mono">SAA-C03</span>). Defaults to first 3 words of title.</td></tr>
                <tr><td className="mono">vendor</td><td>string</td><td>Issuing organization. Defaults to "Custom".</td></tr>
                <tr><td className="mono">domains</td><td>string[]</td><td>List of subject areas. Auto-collected from questions if omitted.</td></tr>
                <tr><td className="mono"><strong>questions</strong></td><td>object[]</td><td>At least one question required.</td></tr>
              </tbody>
            </table>

            <div className="docs-section-title">Question fields</div>
            <table className="docs-table">
              <thead><tr><th>Field</th><th>Type</th><th>Notes</th></tr></thead>
              <tbody>
                <tr><td className="mono">id</td><td>string</td><td>Unique within the pack. Auto-generated if omitted.</td></tr>
                <tr><td className="mono"><strong>stem</strong></td><td>string</td><td>The question text.</td></tr>
                <tr><td className="mono"><strong>options</strong></td><td>array</td><td>2+ entries. Each is <span className="mono">{`{ key, text }`}</span> — or just a string (keys auto-assigned A/B/C/D).</td></tr>
                <tr><td className="mono"><strong>answer</strong></td><td>string or array</td><td>The <span className="mono">key</span> of the correct option (e.g. <span className="mono">"C"</span>), or an array for multi-select questions (e.g. <span className="mono">["A","D"]</span>).</td></tr>
                <tr><td className="mono">rationale</td><td>object</td><td>Map of option key → explanation, e.g. <span className="mono">{`{ "A": "...", "B": "..." }`}</span>. Shown when Explanations mode is on.</td></tr>
                <tr><td className="mono">explanation</td><td>string</td><td>Summary paragraph shown below the options.</td></tr>
                <tr><td className="mono">domain</td><td>string</td><td>Topic group. Defaults to "General".</td></tr>
                <tr><td className="mono">difficulty</td><td>string</td><td>One of <span className="mono">Easy</span>, <span className="mono">Medium</span>, <span className="mono">Hard</span>. Defaults to "Medium".</td></tr>
              </tbody>
            </table>

            <div className="docs-section-title docs-section-title-row">
              <span>Example</span>
              <div className="docs-actions">
                <button className="ghost-btn small" onClick={copyExample}>Copy</button>
                <button className="ghost-btn small" onClick={downloadExample}>Download example.json</button>
              </div>
            </div>
            <pre className="docs-code mono">{EXAMPLE_JSON}</pre>

            <div className="docs-section-title">Tips</div>
            <ul className="docs-tips">
              <li>You can have any number of options per question — 2, 3, 4, 5+. The <span className="mono">answer</span> just has to match one option's <span className="mono">key</span>.</li>
              <li>Provide <span className="mono">rationale</span> for <em>every</em> option, not just the correct one — wrong-answer rationale is where most learning happens.</li>
              <li>Uploaded packs are stored in your browser's localStorage. They persist across refreshes but are private to this browser.</li>
              <li>Need to share with someone? Send them the .json file — they can drop it in here.</li>
            </ul>
          </div>
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
          <motion.button
            className="primary-btn" disabled={!selected}
            onClick={() => onStart(selected, questionOrder === "shuffle", answerOrder === "shuffle")}
            whileHover={selected ? { y: -1 } : undefined}
            whileTap={selected ? { scale: 0.97 } : undefined}
          >
            Begin exam{selected && <> &nbsp;<span className="start-count mono">· {selected.questions.length} questions</span></>} &nbsp;→
          </motion.button>
          {selected && <span className="nav-hint" style={{marginLeft: 12}}>Tip: <span className="mono">1–4</span> answer · <span className="mono">←/→</span> nav</span>}
        </div>
      </motion.div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Option card
// ─────────────────────────────────────────────────────────────────────────────
function OptionCard({ option, isSelected, isCorrect, isPending, isMulti, locked, showRationale, rationaleText, onClick, buttonRef }) {
  const showCorrect = locked && isCorrect;
  const showIncorrect = locked && isSelected && !isCorrect;
  const isDim = locked && !showCorrect && !showIncorrect;

  let cls = "option-card";
  if (showCorrect) cls += " is-correct";
  else if (showIncorrect) cls += " is-incorrect";
  else if (isDim) cls += " is-dim";
  if (isPending) cls += " is-pending";
  if (isMulti) cls += " is-multi";

  return (
    <motion.button
      ref={buttonRef}
      className={cls}
      disabled={locked}
      onClick={onClick}
      aria-pressed={isMulti ? (isPending || (locked && isSelected)) : undefined}
      whileHover={!locked ? { y: -1, transition: { duration: 0.14 } } : undefined}
      whileTap={!locked ? { scale: 0.98, transition: { duration: 0.08 } } : undefined}
      animate={(showCorrect || showIncorrect) ? { scale: [0.96, 1.015, 1] } : { scale: 1, opacity: isDim ? 0.62 : 1 }}
      transition={{ duration: (showCorrect || showIncorrect) ? 0.28 : 0.25, ease: [0.4, 0.7, 0.2, 1] }}
    >
      <div className="option-row">
        <span className="opt-key mono">{option.key}</span>
        <span className="opt-text">{option.text}</span>
        {showCorrect && <span className="opt-status-icon" style={{color: "var(--good)"}}><Icon.check /></span>}
        {showIncorrect && <span className="opt-status-icon" style={{color: "var(--bad)"}}><Icon.x /></span>}
      </div>
      {showRationale && rationaleText && (
        <div className="opt-rationale">{rationaleText}</div>
      )}
    </motion.button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Question card
// ─────────────────────────────────────────────────────────────────────────────
function QuestionCard({
  question, index, total,
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
  const selectedKeys = (() => {
    if (locked) {
      if (!response) return []; // studyMode reveal with no response
      return Array.isArray(response.selected) ? response.selected : [response.selected];
    }
    return pending;
  })();
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

  const togglePending = (key) => {
    setPending((prev) => prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]);
  };
  const submitMulti = () => {
    if (pending.length !== requiredPicks) return;
    onSelect(pending);
  };

  const handleOptionClick = (key) => {
    if (locked) return;
    if (isMulti) togglePending(key);
    else onSelect(key);
  };

  return (
    <motion.article
      key={question.id}
      className="question-card"
      data-screen-label={`Question ${index + 1}`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.4, 0.7, 0.2, 1] }}
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
        <motion.button
          className={"q-flag" + (flagged ? " flagged" : "")}
          onClick={onToggleFlag}
          title={flagged ? "Unflag question" : "Flag for review"}
          aria-pressed={flagged}
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.9 }}
          animate={flagged ? { scale: [0.85, 1.15, 1] } : { scale: 1 }}
          transition={{ duration: 0.3, ease: [0.4, 0.7, 0.2, 1] }}
        >
          <Icon.flag />
        </motion.button>
      </div>

      <h2 className="q-stem">{question.stem}</h2>

      <div className="options">
        {question.options.map((opt) => (
          <OptionCard
            key={opt.key}
            buttonRef={(el) => { optionRefs.current[opt.key] = el; }}
            option={{ ...opt, _correctKey: question.answer }}
            isSelected={selectedKeys.includes(opt.key)}
            isCorrect={isKeyCorrect(opt.key)}
            isPending={!locked && isMulti && pending.includes(opt.key)}
            isMulti={isMulti}
            locked={locked}
            showRationale={locked && explanationMode}
            rationaleText={question.rationale?.[opt.key]}
            onClick={() => handleOptionClick(opt.key)}
          />
        ))}
      </div>

      {isMulti && !locked && (
        <div className="multi-submit-row">
          <span className="multi-count mono">{pending.length} / {requiredPicks} selected</span>
          <button
            className="primary-btn small"
            disabled={pending.length !== requiredPicks}
            onClick={submitMulti}
          >
            Submit answer
          </button>
        </div>
      )}

      {locked && explanationMode && question.explanation && (
        <div className="explanation-card">
          <span className="rationale-label">
            <Icon.book style={{width: 12, height: 12, marginRight: 6, verticalAlign: "-2px"}} />
            Explanation
          </span>
          <p>{question.explanation}</p>
        </div>
      )}
    </motion.article>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Palette drawer
// ─────────────────────────────────────────────────────────────────────────────
function PaletteDrawer({ open, onClose, examQuestions, responses, flagged, currentIndex, onJump, domains }) {
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

  return (
    <>
      <div className={"drawer-scrim" + (open ? " open" : "")} onClick={onClose}></div>
      <aside className={"drawer" + (open ? " open" : "")} aria-hidden={!open}>
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
        <div className="drawer-list">
          {filtered.length === 0 && <div className="palette-empty">No questions match.</div>}
          {filtered.map((it) => (
            <button
              key={it.q.id}
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
            </button>
          ))}
        </div>
      </aside>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Results screen
// ─────────────────────────────────────────────────────────────────────────────
function ResultsScreen({ pack, examQuestions, responses, flagged, elapsedMs, onReview, onRestart, onBackToStart }) {
  const total = examQuestions.length;
  const answered = examQuestions.filter((q) => responses[q.id]).length;
  const correct = examQuestions.filter((q) => responses[q.id]?.correct).length;
  const wrong = answered - correct;
  const pct = total ? Math.round((correct / total) * 100) : 0;

  const byDomain = useMemo(() => {
    const map = {};
    examQuestions.forEach((q) => {
      const d = q.domain;
      if (!map[d]) map[d] = { total: 0, correct: 0 };
      map[d].total += 1;
      if (responses[q.id]?.correct) map[d].correct += 1;
    });
    return Object.entries(map).map(([name, v]) => ({ name, ...v }));
  }, [examQuestions, responses]);

  const statItem = {
    hidden: { opacity: 0, y: 12 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.4, 0.7, 0.2, 1] } },
  };

  return (
    <div className="results-wrap">
      <motion.div
        className="results-card"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.4, 0.7, 0.2, 1] }}
      >
        <div className="start-eyebrow">Exam complete · {pack.code}</div>
        <div className="results-score">
          <motion.span
            className="results-percent"
            initial={{ opacity: 0, scale: 0.75 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          >{pct}%</motion.span>
          <span className="results-fraction">{correct} / {total} correct</span>
        </div>
        <div style={{color: "var(--ink-2)", fontSize: 14}}>Finished in {formatTime(elapsedMs)}</div>

        <motion.div
          className="results-stats"
          initial="hidden"
          animate="visible"
          transition={{ staggerChildren: 0.08, delayChildren: 0.08 }}
        >
          <motion.div className="stat-card" variants={statItem}>
            <div className="stat-label">Correct</div>
            <div className="stat-value good">{correct}</div>
          </motion.div>
          <motion.div className="stat-card" variants={statItem}>
            <div className="stat-label">Incorrect</div>
            <div className="stat-value bad">{wrong}</div>
          </motion.div>
          <motion.div className="stat-card" variants={statItem}>
            <div className="stat-label">Flagged</div>
            <div className="stat-value">{flagged.size}</div>
          </motion.div>
        </motion.div>

        <div className="start-eyebrow" style={{marginTop: 8}}>By domain</div>
        <div className="domain-list">
          {byDomain.map((d) => {
            const p = d.total ? Math.round((d.correct / d.total) * 100) : 0;
            return (
              <div className="domain-row" key={d.name}>
                <span className="domain-name">{d.name}</span>
                <div className="domain-bar"><div className="domain-bar-fill" style={{width: p + "%"}}></div></div>
                <span className="domain-score mono">{d.correct}/{d.total} · {p}%</span>
              </div>
            );
          })}
        </div>

        <div className="start-actions" style={{marginTop: 28}}>
          <motion.button className="primary-btn" onClick={onReview}
            whileHover={{ y: -1 }} whileTap={{ scale: 0.97 }}>Review answers &nbsp;→</motion.button>
          <motion.button className="ghost-btn" onClick={onRestart}
            whileTap={{ scale: 0.95 }}>Retake same set</motion.button>
          <motion.button className="ghost-btn" onClick={onBackToStart}
            whileTap={{ scale: 0.95 }}>Change exam</motion.button>
        </div>
      </motion.div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main App
// ─────────────────────────────────────────────────────────────────────────────
function App() {
  // Tweaks-backed settings (also drive theme/density CSS vars)
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);

  // Apply CSS-affecting tweaks to <html>
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", tweaks.theme || "light");
    document.documentElement.setAttribute("data-density", tweaks.density || "comfortable");
    document.documentElement.setAttribute("data-accent", tweaks.accent || "blue");
  }, [tweaks.theme, tweaks.density, tweaks.accent]);

  // Build pack registry: built-in packs from window.ExamPacks + uploaded customs
  const [customPacks, setCustomPacks] = useState(() => loadCustomPacks());
  const packs = useMemo(
    () => [...Object.values(window.ExamPacks || {}), ...customPacks],
    [customPacks]
  );

  const [uploadError, setUploadError] = useState(null);
  const [uploadWarnings, setUploadWarnings] = useState(null);

  const handleUpload = async (file) => {
    setUploadError(null);
    setUploadWarnings(null);
    try {
      const text = await readFileAsText(file);
      let parsed;
      try { parsed = JSON.parse(text); }
      catch (e) {
        setUploadError([`${file.name}: invalid JSON — ${e.message}`]);
        return;
      }
      const { pack, errors, warnings } = validatePack(parsed);
      if (errors.length) {
        setUploadError([`${file.name}:`, ...errors]);
        return;
      }
      setCustomPacks((list) => {
        const next = [...list, pack];
        saveCustomPacks(next);
        return next;
      });
      if (warnings.length) setUploadWarnings(warnings);
    } catch (e) {
      setUploadError([`${file.name}: ${e.message || "could not read file"}`]);
    }
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

  // Navigation
  const goNext = useCallback(() => {
    setCurrentIndex((i) => {
      if (i + 1 >= examQuestions.length) {
        setEndedAt(Date.now());
        setMode("results");
        return i;
      }
      return i + 1;
    });
  }, [examQuestions.length]);

  const goPrev = useCallback(() => {
    setCurrentIndex((i) => Math.max(0, i - 1));
  }, []);

  const jumpTo = (idx) => {
    setCurrentIndex(Math.max(0, Math.min(examQuestions.length - 1, idx)));
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
      else if (e.key === "d" || e.key === "D") { setTweak("theme", tweaks.theme === "dark" ? "light" : "dark"); }
      else if (e.key === "f" || e.key === "F") { toggleFlag(); }
      else if (currentQ && !currentResponse && !Array.isArray(currentQ.answer)
               && ["1","2","3","4","5","6"].includes(e.key)) {
        const map = ["A","B","C","D","E","F"];
        const key = map[parseInt(e.key) - 1];
        if (currentQ.options.some((o) => o.key === key)) handleSelect(key);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, goNext, goPrev, currentQ, currentResponse, tweaks.theme]);

  // Auto-scroll back to the top of the page whenever the question changes,
  // so the new question stem is always in view.
  useEffect(() => {
    if (mode !== "exam") return;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [currentIndex, mode]);

  // Swipe left/right on touch devices to navigate questions. Threshold
  // (~50px) keeps taps and short drags from misfiring; the off-axis cap
  // ignores vertical scrolls.
  useEffect(() => {
    if (mode !== "exam") return;
    const SWIPE_MIN = 50;
    const SWIPE_MAX_OFF_AXIS = 80;
    let startX = 0;
    let startY = 0;
    let active = false;

    const onTouchStart = (e) => {
      if (drawerOpen) return;
      if (e.touches.length > 1) { active = false; return; }
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      active = true;
    };
    const onTouchEnd = (e) => {
      if (!active) return;
      active = false;
      const t = e.changedTouches[0];
      const dx = t.clientX - startX;
      const dy = Math.abs(t.clientY - startY);
      if (Math.abs(dx) >= SWIPE_MIN && dy < SWIPE_MAX_OFF_AXIS) {
        if (dx < 0) goNext();
        else goPrev();
      }
    };

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchend", onTouchEnd);
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
  const answeredCount = Object.keys(responses).length;
  // Counts the remaining questions starting at the user's current position
  // (not the unanswered count) — jumping forward via the palette reduces it,
  // jumping back increases it.
  const remainingMins = Math.max(0, (total - currentIndex) * (tweaks.minutesPerQuestion || 3));
  const progressPct = total ? (answeredCount / total) * 100 : 0;

  return (
    <MotionConfig reducedMotion="user">
    <div className="app-shell">
      <Topbar
        mode={mode}
        pack={pack}
        theme={tweaks.theme}
        onToggleTheme={() => setTweak("theme", tweaks.theme === "dark" ? "light" : "dark")}
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
              <QuestionCard
                question={currentQ}
                index={currentIndex}
                total={total}
                response={currentResponse}
                flagged={flagged.has(currentQ.id)}
                onSelect={handleSelect}
                onToggleFlag={toggleFlag}
                explanationMode={!!tweaks.explanationMode}
                studyMode={!!tweaks.studyMode}
              />

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
            domains={pack.domains}
          />
        </div>
      )}

      {mode === "results" && pack && (
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
      )}

      {/* Tweaks panel (host injects toggle in toolbar) */}
      <AppTweaks tweaks={tweaks} setTweak={setTweak} />
    </div>
    </MotionConfig>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tweaks panel
// ─────────────────────────────────────────────────────────────────────────────
function AppTweaks({ tweaks, setTweak }) {
  return (
    <TweaksPanel>
      <TweakSection label="Appearance">
        <TweakRadio
          label="Theme"
          value={tweaks.theme}
          onChange={(v) => setTweak("theme", v)}
          options={[{ value: "light", label: "Light" }, { value: "dark", label: "Dark" }]}
        />
        <TweakRadio
          label="Density"
          value={tweaks.density}
          onChange={(v) => setTweak("density", v)}
          options={[
            { value: "compact", label: "Compact" },
            { value: "comfortable", label: "Comfy" },
            { value: "spacious", label: "Roomy" },
          ]}
        />
        <TweakSelect
          label="Accent"
          value={tweaks.accent}
          onChange={(v) => setTweak("accent", v)}
          options={[
            { value: "blue", label: "Indigo" },
            { value: "teal", label: "Teal" },
            { value: "violet", label: "Violet" },
            { value: "orange", label: "Amber" },
          ]}
        />
      </TweakSection>

      <TweakSection label="Behavior">
        <TweakToggle
          label="Explanation mode"
          value={!!tweaks.explanationMode}
          onChange={(v) => setTweak("explanationMode", v)}
        />
        <TweakToggle
          label="Study mode"
          value={!!tweaks.studyMode}
          onChange={(v) => setTweak("studyMode", v)}
        />
        <TweakToggle
          label="Show time remaining"
          value={!!tweaks.showTimer}
          onChange={(v) => setTweak("showTimer", v)}
        />
        <TweakSlider
          label="Mins per question"
          unit="m"
          min={1}
          max={10}
          step={1}
          value={tweaks.minutesPerQuestion || 3}
          onChange={(v) => setTweak("minutesPerQuestion", v)}
        />
      </TweakSection>
    </TweaksPanel>
  );
}

export default App;
