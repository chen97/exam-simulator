// ─────────────────────────────────────────────────────────────────────────────
// Exam pack loader — validates user-uploaded JSON, persists to localStorage.
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = "examSim:customPacks";
const ALLOWED_DIFFICULTIES = ["easy", "medium", "hard"];
const KNOWN_LANGS = ["en", "zh"];

// Slugify a string for use as a unique pack id.
function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "pack";
}

// ── Localized values ─────────────────────────────────────────────────────────
// A localized value is either a plain string (used as-is for every language)
// or an object like { "en": "...", "zh": "..." } with at least one non-empty
// string. Bilingual packs use the object form on stem / option text /
// rationale entries / explanation; monolingual packs keep plain strings.

// Normalize to a trimmed string or a {en?, zh?} object; null when invalid.
function normalizeLoc(v) {
  if (typeof v === "string") {
    const s = v.trim();
    return s || null;
  }
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const out = {};
    for (const k of KNOWN_LANGS) {
      if (typeof v[k] === "string" && v[k].trim()) out[k] = v[k].trim();
    }
    return Object.keys(out).length ? out : null;
  }
  return null;
}

// Resolve a localized value for display in the given language, falling back
// to the other language rather than rendering nothing. Plain strings pass
// through untouched, so packs and persisted sessions from before bilingual
// support keep working.
function locText(v, lang) {
  if (v == null) return "";
  if (typeof v === "string") return v;
  return v[lang] || v.en || v.zh || "";
}

// Validate and normalize an exam-pack object parsed from JSON.
// Returns { pack, errors, warnings }. If errors is non-empty, pack is null.
function validatePack(raw) {
  const errors = [];
  const warnings = [];

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { pack: null, errors: ["Top-level value must be a JSON object."], warnings };
  }

  if (!Array.isArray(raw.questions) || raw.questions.length === 0) {
    errors.push("Required field `questions` must be a non-empty array.");
  }
  if (!raw.title && !raw.code) {
    errors.push("Required field `title` (or `code`) is missing.");
  }

  if (errors.length) return { pack: null, errors, warnings };

  // Normalize top-level
  const title = String(raw.title || raw.code || "Untitled exam").trim();
  const code = String(raw.code || title.split(/\s+/).slice(0, 3).join(" ")).trim();
  const vendor = String(raw.vendor || "Custom").trim();
  const slug = "custom:" + slugify(raw.slug || code || title) + "-" + Math.random().toString(36).slice(2, 7);

  const domainSet = new Set(raw.domains && Array.isArray(raw.domains) ? raw.domains : []);

  // Track which languages this pack actually provides so the UI can decide
  // whether to offer a language switch. Plain strings count as the default
  // language (en).
  const langSet = new Set();
  const noteLangs = (v) => {
    if (typeof v === "string") langSet.add("en");
    else if (v && typeof v === "object") {
      for (const k of KNOWN_LANGS) if (v[k]) langSet.add(k);
    }
  };

  // Normalize questions
  const questions = [];
  raw.questions.forEach((q, idx) => {
    const qLabel = `Question ${idx + 1}`;
    if (!q || typeof q !== "object" || Array.isArray(q)) {
      errors.push(`${qLabel}: must be a JSON object.`);
      return;
    }
    const stem = normalizeLoc(q.stem);
    if (!stem) {
      errors.push(`${qLabel}: missing required \`stem\` (a string, or { "en": "...", "zh": "..." }).`);
      return;
    }
    if (!Array.isArray(q.options) || q.options.length < 2) {
      errors.push(`${qLabel}: \`options\` must be an array with at least 2 entries.`);
      return;
    }
    // Normalize options: accept either {key, text} objects or plain strings
    // (auto-key A/B/C/D). `text` may itself be a string or a localized object.
    const opts = q.options.map((o, j) => {
      const autoKey = String.fromCharCode(65 + j);
      if (typeof o === "string") {
        const text = normalizeLoc(o);
        if (text) return { key: autoKey, text };
      } else if (o && typeof o === "object") {
        const text = normalizeLoc(o.text);
        if (text) return { key: String(o.key || autoKey).toUpperCase(), text };
      }
      errors.push(`${qLabel}: option ${j + 1} must be a string or an object whose \`text\` is a string or { "en", "zh" } object.`);
      return null;
    });
    if (opts.some((o) => o === null)) return;

    const validKeys = opts.map((o) => o.key);
    // Answer is either a single key (string) or an array of keys (multi-select).
    let answer;
    if (Array.isArray(q.answer)) {
      const set = Array.from(new Set(q.answer.map((k) => String(k).toUpperCase())));
      if (set.length === 0) {
        errors.push(`${qLabel}: \`answer\` array must be non-empty.`);
        return;
      }
      const bad = set.filter((k) => !validKeys.includes(k));
      if (bad.length) {
        errors.push(`${qLabel}: \`answer\` keys [${bad.join(", ")}] do not match any option key (${validKeys.join(", ")}).`);
        return;
      }
      answer = set.length === 1 ? set[0] : set;
    } else {
      answer = String(q.answer || "").toUpperCase();
      if (!validKeys.includes(answer)) {
        errors.push(`${qLabel}: \`answer\` "${q.answer}" does not match any option key (${validKeys.join(", ")}).`);
        return;
      }
    }

    // Rationale — optional. Values may be strings or localized objects.
    let rationale = null;
    if (q.rationale && typeof q.rationale === "object") {
      rationale = {};
      for (const k of validKeys) {
        const r = normalizeLoc(q.rationale[k]);
        if (r) rationale[k] = r;
      }
      if (Object.keys(rationale).length === 0) rationale = null;
    }

    const domain = String(q.domain || "General").trim();
    domainSet.add(domain);

    let difficulty = String(q.difficulty || "Medium").trim();
    const dLower = difficulty.toLowerCase();
    if (!ALLOWED_DIFFICULTIES.includes(dLower)) {
      warnings.push(`${qLabel}: difficulty "${difficulty}" not recognized — defaulting to "Medium".`);
      difficulty = "Medium";
    } else {
      difficulty = dLower.charAt(0).toUpperCase() + dLower.slice(1);
    }

    const explanation = normalizeLoc(q.explanation) || "";

    noteLangs(stem);
    opts.forEach((o) => noteLangs(o.text));
    if (rationale) Object.values(rationale).forEach(noteLangs);
    if (explanation) noteLangs(explanation);

    questions.push({
      id: String(q.id || `${slug}-q${idx + 1}`),
      stem,
      options: opts,
      answer,
      rationale,
      explanation,
      domain,
      difficulty,
    });
  });

  if (errors.length) return { pack: null, errors, warnings };
  if (questions.length === 0) {
    return { pack: null, errors: ["No valid questions found after validation."], warnings };
  }

  const pack = {
    slug,
    code,
    title,
    vendor,
    domains: Array.from(domainSet),
    // e.g. ["en"] or ["en","zh"] — the UI shows the language switch only
    // when more than one language is present.
    languages: langSet.size ? Array.from(langSet) : ["en"],
    questions,
    custom: true,
    uploadedAt: Date.now(),
  };
  return { pack, errors: [], warnings };
}

// localStorage helpers
function loadCustomPacks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list;
  } catch (e) {
    return [];
  }
}

function saveCustomPacks(packs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(packs));
  } catch (e) {
    console.warn("Failed to save custom packs:", e);
  }
}

// Read a File as text (Promise-wrapped FileReader)
function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("File read failed"));
    reader.readAsText(file);
  });
}

// Example JSON shown in the docs panel. Kept short but complete.
const EXAMPLE_JSON = `{
  "code": "DEMO-100",
  "title": "Demo Exam",
  "vendor": "Your Company",
  "domains": ["Basics", "Advanced"],
  "questions": [
    {
      "id": "q1",
      "domain": "Basics",
      "difficulty": "Easy",
      "stem": "Which HTTP status code means 'Not Found'?",
      "options": [
        { "key": "A", "text": "200" },
        { "key": "B", "text": "301" },
        { "key": "C", "text": "404" },
        { "key": "D", "text": "500" }
      ],
      "answer": "C",
      "rationale": {
        "A": "200 means OK — the request succeeded.",
        "B": "301 is a permanent redirect.",
        "C": "404 is the canonical 'resource not found' response.",
        "D": "500 is a generic server error."
      },
      "explanation": "4xx codes are client-side errors; 404 specifically means the server could not find the resource."
    }
  ]
}`;

// AI prompt — copy/paste this into ChatGPT, Claude, Gemini, etc. to generate
// exam packs that drop straight into this app. Placeholders in <ANGLE BRACKETS>.
const AI_PROMPT = `You are an expert exam-question writer. Generate a practice-exam question pack as a single JSON object that conforms exactly to the schema below.

SUBJECT: <DESCRIBE YOUR EXAM — e.g. "AWS Solutions Architect Associate (SAA-C03)", "PMP Chapter 4", "Grade 10 Biology — Cell Division">
NUMBER OF QUESTIONS: <e.g. 25>
DIFFICULTY MIX: <e.g. "40% Easy, 40% Medium, 20% Hard">
DOMAINS / TOPICS TO COVER: <e.g. "IAM, S3, EC2, VPC, RDS" — or "any relevant areas">
TONE: realistic certification-style multiple choice, plausible distractors, no trick questions.

OUTPUT FORMAT — return ONLY a single valid JSON object (no markdown fences, no commentary before or after) matching this exact schema:

{
  "code": "<short code, e.g. SAA-C03>",
  "title": "<full exam title>",
  "vendor": "<issuing organization or 'Custom'>",
  "domains": ["<domain 1>", "<domain 2>", "..."],
  "questions": [
    {
      "id": "<unique slug, e.g. q1, saa-001>",
      "domain": "<which domain from the list above>",
      "difficulty": "Easy" | "Medium" | "Hard",
      "stem": "<the question, written as a complete sentence ending with ? or :>",
      "options": [
        { "key": "A", "text": "<option text>" },
        { "key": "B", "text": "<option text>" },
        { "key": "C", "text": "<option text>" },
        { "key": "D", "text": "<option text>" }
      ],
      "answer": "<the key of the correct option, e.g. C>",
      "rationale": {
        "A": "<1–2 sentences: why this option is right OR specifically why it is wrong>",
        "B": "<1–2 sentences: why this option is right OR specifically why it is wrong>",
        "C": "<1–2 sentences: why this option is right OR specifically why it is wrong>",
        "D": "<1–2 sentences: why this option is right OR specifically why it is wrong>"
      },
      "explanation": "<2–3 sentences explaining the underlying concept the question is testing>"
    }
  ]
}

REQUIREMENTS:
- Default to exactly 4 options keyed A, B, C, D. You MAY use 5 (add "E") for multi-select questions.
- "answer" MUST match the key of the correct option (e.g. "C"). For multi-select ("Choose two/three") questions, use an array of keys instead (e.g. ["A","D"]) and make the stem state how many to choose.
- "rationale" MUST include an entry for EVERY option key the question uses — not just the correct one. The wrong-answer rationales are where learners actually learn, so make them specific and instructive (don't just say "this is wrong").
- "explanation" should teach the underlying concept in 2–3 sentences. Do not start with "The correct answer is…" — explain the principle instead.
- "stem" should be self-contained and unambiguous. Avoid "all of the above" / "none of the above".
- Vary the correct answer position across A/B/C/D — do not put the answer in the same slot every time.
- "difficulty" must be exactly one of: Easy, Medium, Hard.
- "id" must be unique within the pack.
- "domain" for each question must be one of the values listed in the top-level "domains" array.
- OPTIONAL bilingual packs: "stem", each option's "text", each "rationale" value, and "explanation" may each be an object { "en": "...", "zh": "..." } instead of a plain string. Use this form (with BOTH languages filled in) only if the user asks for a bilingual English/Chinese pack.
- Output valid JSON — double-quoted keys and strings, no trailing commas, no comments.

Return the JSON object now.`;

export {
  validatePack,
  locText,
  loadCustomPacks,
  saveCustomPacks,
  readFileAsText,
  EXAMPLE_JSON,
  AI_PROMPT,
};
