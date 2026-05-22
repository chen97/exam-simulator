# Exam Simulator

A clean, mobile-friendly multiple-choice exam simulator that runs entirely in the browser. Built with React + vanilla CSS, no build step required.

## Features

- **Multiple exam packs** — Upload any number of `.json` question sets. Uploaded packs persist in browser localStorage.
- **AI prompt template** — Built-in prompt you can copy into ChatGPT / Claude / Gemini to generate exam packs in the correct schema.
- **Light & dark mode** — Toggle in the topbar.
- **Explanation mode** — When on, per-choice rationale and a concept summary appear after you answer.
- **Question palette** — Searchable drawer to jump to any question, filter by answered / unanswered / flagged / correct / wrong.
- **Order controls** — Question order and answer order can each be Sequence (default) or Shuffle.
- **Estimated time remaining** — Based on minutes-per-question × unanswered count (configurable).
- **Keyboard shortcuts** — `1–4` answer · `←/→` nav · `F` flag · `P` palette · `D` theme
- **Mobile-friendly** — Three responsive breakpoints, ≥40px tap targets, side click-zones collapse to bottom nav on small screens.
- **Tweaks panel** — Theme, density (compact / comfy / roomy), accent color, time-per-question all adjustable in-page.

## Getting started

Open `exam-simulator/index.html` in any modern browser. No build, no install. To deploy to GitHub Pages, push to a repo and enable Pages on the `main` branch — the app is fully static.

## JSON pack format

Each exam pack is a single JSON file matching this schema:

```json
{
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
}
```

### Required fields

| Field | Type | Notes |
|---|---|---|
| `title` | string | Display name of the exam |
| `questions` | array | At least one question |
| `questions[].stem` | string | The question text |
| `questions[].options` | array | 2+ options; each `{ key, text }` or just a string |
| `questions[].answer` | string | Must match a `key` in `options` |

### Optional fields (with defaults)

| Field | Default | Notes |
|---|---|---|
| `code` | first 3 words of title | Short code shown on the pack card |
| `vendor` | `"Custom"` | Issuing organization |
| `domains` | auto-collected | Subject areas |
| `questions[].id` | auto-generated | Must be unique within the pack |
| `questions[].domain` | `"General"` | Topic group |
| `questions[].difficulty` | `"Medium"` | `Easy` / `Medium` / `Hard` |
| `questions[].rationale` | none | `{ "A": "...", "B": "...", … }` — shown in Explanation mode |
| `questions[].explanation` | none | Summary paragraph |

## Generating packs with AI

Open the app → "Show JSON format guide" → click "Copy AI prompt". Paste into ChatGPT / Claude / Gemini, fill in the placeholders (subject, count, difficulty mix, domains), then save the response as a `.json` file and drop it into the upload zone.

## File layout

```
exam-simulator/
├── index.html           # entry point — fonts, styles, script tags
├── app.jsx              # main React app: state machine + screens
├── icons.jsx            # inline SVG icon set
├── pack-loader.jsx      # JSON validation + localStorage persistence + AI prompt
└── tweaks-panel.jsx     # tweaks panel component
```

## License

MIT.
