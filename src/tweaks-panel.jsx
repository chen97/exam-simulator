import React from 'react';

// tweaks-panel.jsx
// Reusable Tweaks shell + form-control helpers.
//
// Owns the host protocol (listens for __activate_edit_mode / __deactivate_edit_mode,
// posts __edit_mode_available / __edit_mode_set_keys / __edit_mode_dismissed) so
// individual prototypes don't re-roll it. Ships a consistent set of controls so you
// don't hand-draw <input type="range">, segmented radios, steppers, etc.
//
// Usage (in an HTML file that loads React + Babel):
//
//   const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
//     "primaryColor": "#D97757",
//     "palette": ["#D97757", "#29261b", "#f6f4ef"],
//     "fontSize": 16,
//     "density": "regular",
//     "dark": false
//   }/*EDITMODE-END*/;
//
//   function App() {
//     const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
//     return (
//       <div style={{ fontSize: t.fontSize, color: t.primaryColor }}>
//         Hello
//         <TweaksPanel>
//           <TweakSection label="Typography" />
//           <TweakSlider label="Font size" value={t.fontSize} min={10} max={32} unit="px"
//                        onChange={(v) => setTweak('fontSize', v)} />
//           <TweakRadio  label="Density" value={t.density}
//                        options={['compact', 'regular', 'comfy']}
//                        onChange={(v) => setTweak('density', v)} />
//           <TweakSection label="Theme" />
//           <TweakColor  label="Primary" value={t.primaryColor}
//                        options={['#D97757', '#2A6FDB', '#1F8A5B', '#7A5AE0']}
//                        onChange={(v) => setTweak('primaryColor', v)} />
//           <TweakColor  label="Palette" value={t.palette}
//                        options={[['#D97757', '#29261b', '#f6f4ef'],
//                                  ['#475569', '#0f172a', '#f1f5f9']]}
//                        onChange={(v) => setTweak('palette', v)} />
//           <TweakToggle label="Dark mode" value={t.dark}
//                        onChange={(v) => setTweak('dark', v)} />
//         </TweaksPanel>
//       </div>
//     );
//   }
//
// ─────────────────────────────────────────────────────────────────────────────

const __TWEAKS_STYLE = `
  /* Every value here is a design-system token (tokens.md). Two things are
     local and say why:
     - --twk-t / --twk-t-micro / --twk-ctl-h divide the user factor back out.
       This panel holds the Text size control, and that control's own type
       does not scale, so it stays reachable at Compact (tokens.md § building
       the control). They land on the base values, 12.5 / 10 / 30px, at
       every step.
     - min-height:24px on the segmented buttons, the close button and the
       swatch is the target floor (accessibility.md), not a type size. */
  .twk-panel{--twk-t:calc(var(--t-md) / var(--t-scale));
    --twk-t-micro:calc(var(--t-micro) / var(--t-scale));
    --twk-ctl-h:calc(var(--ctl-h) / var(--t-scale));
    position:fixed;right:var(--s4);bottom:var(--s4);z-index:2147483646;width:280px;
    max-height:calc(100vh - 2 * var(--s4));display:flex;flex-direction:column;
    transform:scale(var(--dc-inv-zoom,1));transform-origin:bottom right;
    background:var(--panel);color:var(--tx);
    border:1px solid var(--line);border-radius:var(--r-lg);
    box-shadow:var(--shadow-3);
    font:400 var(--twk-t)/1.4 var(--f-sans);overflow:hidden}
  .twk-hd{display:flex;align-items:center;justify-content:space-between;
    padding:var(--s2) var(--s2) var(--s2) var(--s4);cursor:move;user-select:none}
  .twk-hd b{font-size:var(--twk-t);font-weight:650}
  .twk-x{appearance:none;border:0;background:transparent;color:var(--mut);
    min-width:24px;min-height:24px;border-radius:var(--r-sm);cursor:default;
    font-size:var(--twk-t);line-height:1}
  .twk-x:hover{background:var(--in);color:var(--tx)}
  .twk-body{padding:var(--s0) var(--s4) var(--s4);display:flex;flex-direction:column;gap:var(--s3);
    overflow-y:auto;overflow-x:hidden;min-height:0;
    scrollbar-width:thin;scrollbar-color:var(--line-strong) transparent}
  .twk-body::-webkit-scrollbar{width:8px}
  .twk-body::-webkit-scrollbar-track{background:transparent;margin:var(--s0)}
  .twk-body::-webkit-scrollbar-thumb{background:var(--line-strong);border-radius:var(--r-full);
    border:2px solid transparent;background-clip:content-box}
  .twk-body::-webkit-scrollbar-thumb:hover{background:var(--mut);
    border:2px solid transparent;background-clip:content-box}
  .twk-row{display:flex;flex-direction:column;gap:var(--s1)}
  .twk-row-h{flex-direction:row;align-items:center;justify-content:space-between;gap:var(--s3)}
  .twk-lbl{display:flex;justify-content:space-between;align-items:baseline;color:var(--tx)}
  .twk-lbl>span:first-child{font-weight:600}
  .twk-val{color:var(--mut);font-variant-numeric:tabular-nums}

  .twk-sect{font-size:var(--twk-t-micro);font-weight:600;letter-spacing:.05em;text-transform:uppercase;
    color:var(--mut);padding:var(--s3) 0 0}
  .twk-sect:first-child{padding-top:0}

  .twk-field{appearance:none;box-sizing:border-box;width:100%;min-width:0;height:var(--twk-ctl-h);
    padding:0 var(--s2);border:1px solid var(--line-strong);border-radius:var(--r);
    background:var(--in);color:inherit;font:inherit}
  select.twk-field{padding-right:var(--s5);
    background-image:linear-gradient(45deg,transparent 50%,var(--mut) 50%),
      linear-gradient(135deg,var(--mut) 50%,transparent 50%);
    background-size:5px 5px;background-repeat:no-repeat;
    background-position:calc(100% - 13px) 50%,calc(100% - 8px) 50%}
  /* tokens.md § inputs have a 16px floor on small viewports. */
  @media (max-width:760px){.twk-field{font-size:max(16px,var(--twk-t))}}

  .twk-slider{appearance:none;-webkit-appearance:none;width:100%;height:4px;margin:var(--s2) 0;
    border-radius:var(--r-full);background:var(--line-strong);outline-offset:var(--s1)}
  .twk-slider::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;
    width:14px;height:14px;border-radius:var(--r-full);background:var(--ac-fill);border:0;cursor:default}
  .twk-slider::-moz-range-thumb{width:14px;height:14px;border-radius:var(--r-full);
    background:var(--ac-fill);border:0;cursor:default}

  /* Case 3 of components.md § Selected state: the well groups the options,
     the chosen one is raised, and its ink goes --mut → --tx. No accent. */
  .twk-seg{position:relative;display:flex;padding:var(--s0);border-radius:var(--r);
    background:var(--in);border:1px solid var(--line);user-select:none}
  .twk-seg-thumb{position:absolute;top:var(--s0);bottom:var(--s0);box-sizing:border-box;
    border-radius:var(--r-sm);background:var(--panel);border:1px solid var(--line-strong);
    box-shadow:var(--shadow-1);
    transition:left var(--d-fast) var(--ease-out),width var(--d-fast) var(--ease-out)}
  .twk-seg.dragging .twk-seg-thumb{transition:none}
  .twk-seg button{appearance:none;position:relative;z-index:1;flex:1;border:0;
    background:transparent;color:var(--mut);font:inherit;font-weight:550;min-height:24px;
    border-radius:var(--r-sm);cursor:default;padding:var(--s1);line-height:1.2;
    overflow-wrap:anywhere}
  .twk-seg button[aria-checked="true"]{color:var(--tx)}

  /* Same switch as .switch in styles.css: --mut off track, --ac-fill on,
     --panel knob — the measured pairs are written down there. */
  .twk-toggle{position:relative;width:32px;height:18px;border:0;border-radius:var(--r-full);
    background:var(--mut);transition:background var(--d-fast) var(--ease-out);cursor:default;padding:0}
  .twk-toggle[data-on="1"]{background:var(--ac-fill)}
  .twk-toggle i{position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:var(--r-full);
    background:var(--panel);transition:transform var(--d-fast) var(--ease-out)}
  .twk-toggle[data-on="1"] i{transform:translateX(14px)}

  @media (prefers-reduced-motion:reduce){
    .twk-seg-thumb,.twk-toggle,.twk-toggle i,.twk-chip{transition:none}
    .twk-chip:hover{transform:none}
  }

  .twk-num{display:flex;align-items:center;box-sizing:border-box;min-width:0;height:var(--twk-ctl-h);
    padding:0 0 0 var(--s2);border:1px solid var(--line-strong);border-radius:var(--r);background:var(--in)}
  .twk-num-lbl{font-weight:600;color:var(--mut);cursor:ew-resize;
    user-select:none;padding-right:var(--s2)}
  .twk-num input{flex:1;min-width:0;height:100%;border:0;background:transparent;
    font:inherit;font-variant-numeric:tabular-nums;text-align:right;padding:0 var(--s2) 0 0;
    color:inherit;-moz-appearance:textfield}
  .twk-num input::-webkit-inner-spin-button,.twk-num input::-webkit-outer-spin-button{
    -webkit-appearance:none;margin:0}
  .twk-num-unit{padding-right:var(--s2);color:var(--mut)}

  /* components.md § Button: primary and default. */
  .twk-btn{appearance:none;min-height:var(--twk-ctl-h);padding:0 var(--s3);
    border:1px solid transparent;border-radius:var(--r);
    background:var(--ac-fill);color:var(--on-accent);font:inherit;font-weight:650;cursor:default;
    transition:background var(--d-fast) var(--ease-out)}
  .twk-btn:hover{background:var(--ac-hover)}
  .twk-btn.secondary{background:var(--panel-2);border-color:var(--line-strong);color:var(--tx);font-weight:550}
  .twk-btn.secondary:hover{background:var(--in)}

  .twk-swatch{appearance:none;-webkit-appearance:none;width:56px;height:24px;
    border:1px solid var(--line-strong);border-radius:var(--r-sm);padding:0;cursor:default;
    background:transparent;flex-shrink:0}
  .twk-swatch::-webkit-color-swatch-wrapper{padding:0}
  .twk-swatch::-webkit-color-swatch{border:0;border-radius:var(--r-sm)}
  .twk-swatch::-moz-color-swatch{border:0;border-radius:var(--r-sm)}

  /* A swatch's fill is the colour it offers, so case 3's raised --panel
     cannot apply. The chosen one takes a 2px --tx ring set off by a --panel
     gap instead: one channel, 13.95 / 17.81 against --panel, clearing 3:1
     on its own — the stock-analysis .seg precedent (decisions.md § v1.5.8). */
  .twk-chips{display:flex;gap:var(--s2)}
  .twk-chip{position:relative;appearance:none;flex:1;min-width:0;height:46px;
    padding:0;border:0;border-radius:var(--r-sm);overflow:hidden;cursor:default;
    box-shadow:0 0 0 1px var(--line-strong);
    transition:transform var(--d-fast) var(--ease-out),box-shadow var(--d-fast) var(--ease-out)}
  .twk-chip:hover{transform:translateY(-1px);box-shadow:0 0 0 1px var(--mut)}
  .twk-chip[data-on="1"]{box-shadow:0 0 0 2px var(--panel),0 0 0 4px var(--tx)}
  .twk-chip>span{position:absolute;top:0;bottom:0;right:0;width:34%;
    display:flex;flex-direction:column;box-shadow:-1px 0 0 var(--line)}
  .twk-chip>span>i{flex:1;box-shadow:0 -1px 0 var(--line)}
  .twk-chip>span>i:first-child{box-shadow:none}
  .twk-chip svg{position:absolute;top:6px;left:6px;width:13px;height:13px;
    filter:drop-shadow(0 1px 1px var(--scrim))}
`;

// ── useTweaks ───────────────────────────────────────────────────────────────
// Single source of truth for tweak values. setTweak persists two ways:
//  1. localStorage — so preferences survive a reload in the standalone
//     deployment (GitHub Pages), where there is no host editor listening.
//  2. __edit_mode_set_keys → host rewrites the EDITMODE block on disk,
//     for the in-editor authoring case.
// On init we hydrate from localStorage layered over the baked-in defaults,
// so a newly added default key still appears even after a prior save.
const TWEAKS_KEY = 'examSim:tweaks';

function useTweaks(defaults) {
  const [values, setValues] = React.useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(TWEAKS_KEY) || 'null');
      if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
        return { ...defaults, ...saved };
      }
    } catch (e) { /* ignore unreadable/blocked storage */ }
    return defaults;
  });
  // Accepts either setTweak('key', value) or setTweak({ key: value, ... }) so a
  // useState-style call doesn't write a "[object Object]" key into the persisted
  // JSON block.
  const setTweak = React.useCallback((keyOrEdits, val) => {
    const edits = typeof keyOrEdits === 'object' && keyOrEdits !== null
      ? keyOrEdits : { [keyOrEdits]: val };
    setValues((prev) => {
      const next = { ...prev, ...edits };
      try { localStorage.setItem(TWEAKS_KEY, JSON.stringify(next)); }
      catch (e) { /* ignore quota/blocked storage */ }
      return next;
    });
    window.parent.postMessage({ type: '__edit_mode_set_keys', edits }, '*');
    // Same-window signal so in-page listeners (deck-stage rail thumbnails)
    // can react — the parent message only reaches the host, not peers.
    window.dispatchEvent(new CustomEvent('tweakchange', { detail: edits }));
  }, []);
  return [values, setTweak];
}

// ── TweaksPanel ─────────────────────────────────────────────────────────────
// Floating shell. Registers the protocol listener BEFORE announcing
// availability — if the announce ran first, the host's activate could land
// before our handler exists and the toolbar toggle would silently no-op.
// The close button posts __edit_mode_dismissed so the host's toolbar toggle
// flips off in lockstep; the host echoes __deactivate_edit_mode back which
// is what actually hides the panel.
function TweaksPanel({ title = 'Tweaks', children }) {
  const [open, setOpen] = React.useState(false);
  const dragRef = React.useRef(null);
  const offsetRef = React.useRef({ x: 16, y: 16 });
  const PAD = 16;

  const clampToViewport = React.useCallback(() => {
    const panel = dragRef.current;
    if (!panel) return;
    const w = panel.offsetWidth, h = panel.offsetHeight;
    const maxRight = Math.max(PAD, window.innerWidth - w - PAD);
    const maxBottom = Math.max(PAD, window.innerHeight - h - PAD);
    offsetRef.current = {
      x: Math.min(maxRight, Math.max(PAD, offsetRef.current.x)),
      y: Math.min(maxBottom, Math.max(PAD, offsetRef.current.y)),
    };
    panel.style.right = offsetRef.current.x + 'px';
    panel.style.bottom = offsetRef.current.y + 'px';
  }, []);

  React.useEffect(() => {
    if (!open) return;
    clampToViewport();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', clampToViewport);
      return () => window.removeEventListener('resize', clampToViewport);
    }
    const ro = new ResizeObserver(clampToViewport);
    ro.observe(document.documentElement);
    return () => ro.disconnect();
  }, [open, clampToViewport]);

  React.useEffect(() => {
    const onMsg = (e) => {
      const t = e?.data?.type;
      if (t === '__activate_edit_mode') setOpen(true);
      else if (t === '__deactivate_edit_mode') setOpen(false);
    };
    // In-app trigger: lets a button anywhere on the page open this panel
    // without depending on a host editor. Listens for a 'tweaks:toggle'
    // CustomEvent so the standalone GitHub Pages deploy can expose the
    // settings via the topbar's sliders button.
    const onToggle = () => setOpen((v) => !v);
    window.addEventListener('message', onMsg);
    window.addEventListener('tweaks:toggle', onToggle);
    window.parent.postMessage({ type: '__edit_mode_available' }, '*');
    return () => {
      window.removeEventListener('message', onMsg);
      window.removeEventListener('tweaks:toggle', onToggle);
    };
  }, []);

  const dismiss = () => {
    setOpen(false);
    window.parent.postMessage({ type: '__edit_mode_dismissed' }, '*');
  };

  const onDragStart = (e) => {
    const panel = dragRef.current;
    if (!panel) return;
    const r = panel.getBoundingClientRect();
    const sx = e.clientX, sy = e.clientY;
    const startRight = window.innerWidth - r.right;
    const startBottom = window.innerHeight - r.bottom;
    const move = (ev) => {
      offsetRef.current = {
        x: startRight - (ev.clientX - sx),
        y: startBottom - (ev.clientY - sy),
      };
      clampToViewport();
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  if (!open) return null;
  return (
    <>
      <style>{__TWEAKS_STYLE}</style>
      <div ref={dragRef} className="twk-panel" data-omelette-chrome=""
           style={{ right: offsetRef.current.x, bottom: offsetRef.current.y }}>
        <div className="twk-hd" onMouseDown={onDragStart}>
          <b>{title}</b>
          <button className="twk-x" aria-label="Close tweaks"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={dismiss}>✕</button>
        </div>
        <div className="twk-body">
          {children}
        </div>
      </div>
    </>
  );
}

// ── Layout helpers ──────────────────────────────────────────────────────────

function TweakSection({ label, children }) {
  return (
    <>
      <div className="twk-sect">{label}</div>
      {children}
    </>
  );
}

function TweakRow({ label, value, children, inline = false }) {
  return (
    <div className={inline ? 'twk-row twk-row-h' : 'twk-row'}>
      <div className="twk-lbl">
        <span>{label}</span>
        {value != null && <span className="twk-val">{value}</span>}
      </div>
      {children}
    </div>
  );
}

// ── Controls ────────────────────────────────────────────────────────────────

function TweakSlider({ label, value, min = 0, max = 100, step = 1, unit = '', onChange }) {
  return (
    <TweakRow label={label} value={`${value}${unit}`}>
      <input type="range" className="twk-slider" min={min} max={max} step={step}
             value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </TweakRow>
  );
}

function TweakToggle({ label, value, onChange }) {
  return (
    <div className="twk-row twk-row-h">
      <div className="twk-lbl"><span>{label}</span></div>
      <button type="button" className="twk-toggle" data-on={value ? '1' : '0'}
              role="switch" aria-checked={!!value}
              onClick={() => onChange(!value)}><i /></button>
    </div>
  );
}

function TweakRadio({ label, value, options, onChange }) {
  const trackRef = React.useRef(null);
  const [dragging, setDragging] = React.useState(false);
  // The active value is read by pointer-move handlers attached for the lifetime
  // of a drag — ref it so a stale closure doesn't fire onChange for every move.
  const valueRef = React.useRef(value);
  valueRef.current = value;

  // Segments wrap mid-word once per-segment width runs out. The track is
  // ~248px (280 panel − 28 body pad − 4 seg pad), each button loses 12px
  // to its own padding, and 11.5px system-ui averages ~6.3px/char — so 2
  // options fit ~16 chars each, 3 fit ~10. Past that (or >3 options), fall
  // back to a dropdown rather than wrap.
  const labelLen = (o) => String(typeof o === 'object' ? o.label : o).length;
  const maxLen = options.reduce((m, o) => Math.max(m, labelLen(o)), 0);
  const fitsAsSegments = maxLen <= ({ 2: 16, 3: 10 }[options.length] ?? 0);
  if (!fitsAsSegments) {
    // <select> emits strings — map back to the original option value so the
    // fallback stays type-preserving (numbers, booleans) like the segment path.
    const resolve = (s) => {
      const m = options.find((o) => String(typeof o === 'object' ? o.value : o) === s);
      return m === undefined ? s : typeof m === 'object' ? m.value : m;
    };
    return <TweakSelect label={label} value={value} options={options}
                        onChange={(s) => onChange(resolve(s))} />;
  }
  const opts = options.map((o) => (typeof o === 'object' ? o : { value: o, label: o }));
  const idx = Math.max(0, opts.findIndex((o) => o.value === value));
  const n = opts.length;

  const segAt = (clientX) => {
    const r = trackRef.current.getBoundingClientRect();
    // 1px border + 2px padding on each side of the well.
    const inner = r.width - 6;
    const i = Math.floor(((clientX - r.left - 3) / inner) * n);
    return opts[Math.max(0, Math.min(n - 1, i))].value;
  };

  const onPointerDown = (e) => {
    setDragging(true);
    const v0 = segAt(e.clientX);
    if (v0 !== valueRef.current) onChange(v0);
    const move = (ev) => {
      if (!trackRef.current) return;
      const v = segAt(ev.clientX);
      if (v !== valueRef.current) onChange(v);
    };
    const up = () => {
      setDragging(false);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <TweakRow label={label}>
      <div ref={trackRef} role="radiogroup" onPointerDown={onPointerDown}
           className={dragging ? 'twk-seg dragging' : 'twk-seg'}>
        <div className="twk-seg-thumb"
             style={{ left: `calc(2px + ${idx} * (100% - 4px) / ${n})`,
                      width: `calc((100% - 4px) / ${n})` }} />
        {opts.map((o) => (
          <button key={o.value} type="button" role="radio" aria-checked={o.value === value}>
            {o.label}
          </button>
        ))}
      </div>
    </TweakRow>
  );
}

function TweakSelect({ label, value, options, onChange }) {
  return (
    <TweakRow label={label}>
      <select className="twk-field" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => {
          const v = typeof o === 'object' ? o.value : o;
          const l = typeof o === 'object' ? o.label : o;
          return <option key={v} value={v}>{l}</option>;
        })}
      </select>
    </TweakRow>
  );
}

function TweakText({ label, value, placeholder, onChange }) {
  return (
    <TweakRow label={label}>
      <input className="twk-field" type="text" value={value} placeholder={placeholder}
             onChange={(e) => onChange(e.target.value)} />
    </TweakRow>
  );
}

function TweakNumber({ label, value, min, max, step = 1, unit = '', onChange }) {
  const clamp = (n) => {
    if (min != null && n < min) return min;
    if (max != null && n > max) return max;
    return n;
  };
  const startRef = React.useRef({ x: 0, val: 0 });
  const onScrubStart = (e) => {
    e.preventDefault();
    startRef.current = { x: e.clientX, val: value };
    const decimals = (String(step).split('.')[1] || '').length;
    const move = (ev) => {
      const dx = ev.clientX - startRef.current.x;
      const raw = startRef.current.val + dx * step;
      const snapped = Math.round(raw / step) * step;
      onChange(clamp(Number(snapped.toFixed(decimals))));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return (
    <div className="twk-num">
      <span className="twk-num-lbl" onPointerDown={onScrubStart}>{label}</span>
      <input type="number" value={value} min={min} max={max} step={step}
             onChange={(e) => onChange(clamp(Number(e.target.value)))} />
      {unit && <span className="twk-num-unit">{unit}</span>}
    </div>
  );
}

// Relative-luminance contrast pick — checkmarks drawn over a swatch need to
// read on both #111 and #fafafa without per-option configuration. Hex input
// only (#rgb / #rrggbb); named or rgb()/hsl() colors fall through to "light".
function __twkIsLight(hex) {
  const h = String(hex).replace('#', '');
  const x = h.length === 3 ? h.replace(/./g, (c) => c + c) : h.padEnd(6, '0');
  const n = parseInt(x.slice(0, 6), 16);
  if (Number.isNaN(n)) return true;
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return r * 299 + g * 587 + b * 114 > 148000;
}

const __TwkCheck = ({ light }) => (
  <svg viewBox="0 0 14 14" aria-hidden="true">
    <path d="M3 7.2 5.8 10 11 4.2" fill="none" strokeWidth="2.2"
          strokeLinecap="round" strokeLinejoin="round"
          stroke={light ? 'rgba(0,0,0,.78)' : '#fff'} />
  </svg>
);

// TweakColor — curated color/palette picker. Each option is either a single
// hex string or an array of 1-5 hex strings; the card adapts — a lone color
// renders solid, a palette renders colors[0] as the hero (left ~2/3) with the
// rest stacked in a sharp column on the right. onChange emits the
// option in the shape it was passed (string stays string, array stays array).
// Without options it falls back to the native color input for back-compat.
function TweakColor({ label, value, options, onChange }) {
  if (!options || !options.length) {
    return (
      <div className="twk-row twk-row-h">
        <div className="twk-lbl"><span>{label}</span></div>
        <input type="color" className="twk-swatch" value={value}
               onChange={(e) => onChange(e.target.value)} />
      </div>
    );
  }
  // Native <input type=color> emits lowercase hex per the HTML spec, so
  // compare case-insensitively. String() guards JSON.stringify(undefined),
  // which returns the primitive undefined (no .toLowerCase).
  const key = (o) => String(JSON.stringify(o)).toLowerCase();
  const cur = key(value);
  return (
    <TweakRow label={label}>
      <div className="twk-chips" role="radiogroup">
        {options.map((o, i) => {
          const colors = Array.isArray(o) ? o : [o];
          const [hero, ...rest] = colors;
          const sup = rest.slice(0, 4);
          const on = key(o) === cur;
          return (
            <button key={i} type="button" className="twk-chip" role="radio"
                    aria-checked={on} data-on={on ? '1' : '0'}
                    aria-label={colors.join(', ')} title={colors.join(' · ')}
                    style={{ background: hero }}
                    onClick={() => onChange(o)}>
              {sup.length > 0 && (
                <span>
                  {sup.map((c, j) => <i key={j} style={{ background: c }} />)}
                </span>
              )}
              {on && <__TwkCheck light={__twkIsLight(hero)} />}
            </button>
          );
        })}
      </div>
    </TweakRow>
  );
}

function TweakButton({ label, onClick, secondary = false }) {
  return (
    <button type="button" className={secondary ? 'twk-btn secondary' : 'twk-btn'}
            onClick={onClick}>{label}</button>
  );
}

export {
  useTweaks, TweaksPanel, TweakSection, TweakRow,
  TweakSlider, TweakToggle, TweakRadio, TweakSelect,
  TweakText, TweakNumber, TweakColor, TweakButton,
};
