# Exam Simulator

A clean, mobile-friendly multiple-choice exam simulator that runs entirely in the browser. Upload your own JSON exam packs, get per-choice rationale, swipe nav with a live commit indicator, auto theme that follows your phone's night mode. Built with React + Vite + Motion.

**Live demo:** https://chen97.github.io/exam-simulator/

## Features

- **Multiple exam packs** — Upload any number of `.json` question sets. Uploaded packs persist in browser localStorage.
- **AI prompt template** — Built-in prompt you can copy into ChatGPT / Claude / Gemini to generate exam packs in the correct schema.
- **Auto / Light / Dark theme** — Defaults to Auto, which follows the OS color scheme live (iPhone night mode, macOS Sundown, etc.). Light or Dark can be picked explicitly in the tweaks panel.
- **Explanation mode** — When on, per-choice rationale slides in below each option and a concept summary appears below the question.
- **Study mode** — Reveals the correct answer up front without recording a response — good for flashcard-style review.
- **Multi-select questions** — Packs can declare `answer` as an array (`["A","D"]`) for "Choose two / three" questions; the UI requires the right number of picks before submit.
- **Swipe navigation** — On touch devices, swipe left / right between questions. A live edge pill shows the gesture being tracked and snaps to the accent color once you've crossed the commit threshold; pull the finger back to abort.
- **Question palette** — Searchable drawer to jump to any question, filter by answered / unanswered / flagged / correct / wrong.
- **Order controls** — Question order and answer order can each be Sequence (default) or Shuffle.
- **Estimated time remaining** — Based on minutes-per-question × unanswered count (configurable).
- **Session resume** — Closing and reopening the tab drops you back at your last answered question with all responses and flags intact.
- **Keyboard shortcuts** — `1–4` answer · `←/→` nav · `F` flag · `P` palette · `D` theme
- **Mobile-friendly** — Responsive from 380 px phones through 1920 px desktops, ≥40 px tap targets, side click-zones collapse to bottom nav on small screens, motion respects `prefers-reduced-motion`.
- **Tweaks panel** — Theme, density (compact / comfy / roomy), accent color, time-per-question all adjustable in-page.

## Getting started

```bash
npm install
npm run dev        # local dev server with HMR at http://localhost:5173
npm run build      # production build → dist/
npm run preview    # serve the built dist/ locally
```

To deploy to GitHub Pages (or any static host), run `npm run build` and publish the contents of `dist/`. The `base: './'` in `vite.config.js` keeps asset paths relative so it works from any subpath.

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
| `questions[].answer` | string or array | A single `key` (e.g. `"C"`) for single-answer, or an array of keys (e.g. `["A","D"]`) for multi-select ("Choose two/three") |

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
.
├── index.html            # Vite entry — fonts + color-scheme metas + #root
├── vite.config.js        # Vite + plugin-react + terser + manualChunks
└── src/
    ├── main.jsx          # mounts <App /> into #root
    ├── App.jsx           # main React app: state machine + screens + swipe nav
    ├── icons.jsx         # inline SVG icon set
    ├── pack-loader.js    # JSON pack validation + localStorage persistence + AI prompt
    ├── session.js        # in-progress session save/load (rIC-debounced)
    ├── docs-panel.jsx    # JSON format guide (lazy-loaded)
    ├── results-screen.jsx# end-of-exam score + per-domain breakdown (lazy-loaded)
    ├── app-tweaks.jsx    # tweaks panel wrapper (lazy-loaded)
    ├── tweaks-panel.jsx  # generic tweak controls (radio/select/toggle/slider)
    └── styles.css        # all app styles
```

## License

MIT.
