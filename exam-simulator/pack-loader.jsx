/* global React */
// ─────────────────────────────────────────────────────────────────────────────
// Exam pack loader — validates user-uploaded JSON, persists to localStorage,
// merges with built-in packs registered to window.ExamPacks.
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = "examSim:customPacks";
const ALLOWED_DIFFICULTIES = ["easy", "medium", "hard"];

// Slugify a string for use as a unique pack id.
function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "pack";
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

  // Normalize questions
  const questions = [];
  raw.questions.forEach((q, idx) => {
    const qLabel = `Question ${idx + 1}`;
    if (!q || typeof q !== "object" || Array.isArray(q)) {
      errors.push(`${qLabel}: must be a JSON object.`);
      return;
    }
    if (!q.stem || typeof q.stem !== "string") {
      errors.push(`${qLabel}: missing required string \`stem\`.`);
      return;
    }
    if (!Array.isArray(q.options) || q.options.length < 2) {
      errors.push(`${qLabel}: \`options\` must be an array with at least 2 entries.`);
      return;
    }
    // Normalize options: accept either {key, text} objects or plain strings (auto-key A/B/C/D)
    const opts = q.options.map((o, j) => {
      if (typeof o === "string") return { key: String.fromCharCode(65 + j), text: o };
      if (o && typeof o === "object" && typeof o.text === "string") {
        return { key: String(o.key || String.fromCharCode(65 + j)).toUpperCase(), text: o.text };
      }
      errors.push(`${qLabel}: option ${j + 1} must be a string or an object with a string \`text\` field.`);
      return null;
    });
    if (opts.some((o) => o === null)) return;

    const validKeys = opts.map((o) => o.key);
    const answer = String(q.answer || "").toUpperCase();
    if (!validKeys.includes(answer)) {
      errors.push(`${qLabel}: \`answer\` "${q.answer}" does not match any option key (${validKeys.join(", ")}).`);
      return;
    }

    // Rationale — optional. Accept {A: "...", B: "..."} or skip.
    let rationale = null;
    if (q.rationale && typeof q.rationale === "object") {
      rationale = {};
      for (const k of validKeys) {
        if (typeof q.rationale[k] === "string") rationale[k] = q.rationale[k];
      }
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

    questions.push({
      id: String(q.id || `${slug}-q${idx + 1}`),
      stem: q.stem.trim(),
      options: opts,
      answer,
      rationale,
      explanation: typeof q.explanation === "string" ? q.explanation.trim() : "",
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
- Every question MUST have exactly 4 options keyed A, B, C, D.
- "answer" MUST be one of "A", "B", "C", or "D" and MUST match the key of the correct option.
- "rationale" MUST include an entry for EVERY option key (A, B, C, D) — not just the correct one. The wrong-answer rationales are where learners actually learn, so make them specific and instructive (don't just say "this is wrong").
- "explanation" should teach the underlying concept in 2–3 sentences. Do not start with "The correct answer is…" — explain the principle instead.
- "stem" should be self-contained and unambiguous. Avoid "all of the above" / "none of the above".
- Vary the correct answer position across A/B/C/D — do not put the answer in the same slot every time.
- "difficulty" must be exactly one of: Easy, Medium, Hard.
- "id" must be unique within the pack.
- "domain" for each question must be one of the values listed in the top-level "domains" array.
- Output valid JSON — double-quoted keys and strings, no trailing commas, no comments.

Return the JSON object now.`;

window.PackLoader = {
  validatePack,
  loadCustomPacks,
  saveCustomPacks,
  readFileAsText,
  EXAMPLE_JSON,
  AI_PROMPT,
};
