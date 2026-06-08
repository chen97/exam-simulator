import {
  TweaksPanel,
  TweakSection,
  TweakRadio,
  TweakSelect,
  TweakToggle,
  TweakSlider,
} from './tweaks-panel.jsx';

// Lazy-loaded — the tweaks panel is host-injected and only mounts when its
// toolbar toggle is opened, so it doesn't need to ship in the first paint.
function AppTweaks({ tweaks, setTweak }) {
  return (
    <TweaksPanel>
      <TweakSection label="Appearance">
        <TweakRadio
          label="Theme"
          value={tweaks.theme}
          onChange={(v) => setTweak("theme", v)}
          options={[
            { value: "system", label: "Auto" },
            { value: "light", label: "Light" },
            { value: "dark", label: "Dark" },
          ]}
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
        <TweakSlider
          label="Font size"
          unit="%"
          min={85}
          max={125}
          step={5}
          value={Math.round((tweaks.fontSize || 1) * 100)}
          onChange={(v) => setTweak("fontSize", v / 100)}
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

export default AppTweaks;
