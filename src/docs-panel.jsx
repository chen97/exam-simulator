import { m } from 'motion/react';
import { Icon } from './icons.jsx';
import { EXAMPLE_JSON, AI_PROMPT } from './pack-loader.js';

// JSON-format reference for users authoring their own exam packs. Lazy-loaded
// because it's only opened on user intent and pulls in a chunk of static JSX
// that doesn't belong in the first-paint bundle.
function DocsPanel({ copyExample, downloadExample, copyPrompt, copiedPrompt }) {
  return (
    <m.div
      className="docs-panel"
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      transition={{ duration: 0.24, ease: [0.4, 0.7, 0.2, 1] }}
      style={{ overflow: "hidden" }}
    >
      <p className="docs-lede">
        An exam pack is a single JSON object with a <span className="mono">questions</span> array.
        Required fields are <strong>bold</strong>; everything else has sensible defaults.
      </p>

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
    </m.div>
  );
}

export default DocsPanel;
