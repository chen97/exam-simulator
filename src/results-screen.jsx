import { useMemo } from 'react';
import { m } from 'motion/react';

const formatTime = (ms) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const min = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(min)}:${pad(s)}` : `${pad(min)}:${pad(s)}`;
};

// Lazy-loaded — only mounts when the user finishes the exam.
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
      <m.div
        className="results-card"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.4, 0.7, 0.2, 1] }}
      >
        <div className="start-eyebrow">Exam complete · {pack.code}</div>
        <div className="results-score">
          <m.span
            className="results-percent"
            initial={{ opacity: 0, scale: 0.75 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          >{pct}%</m.span>
          <span className="results-fraction">{correct} / {total} correct</span>
        </div>
        <div style={{color: "var(--ink-2)", fontSize: 14}}>Finished in {formatTime(elapsedMs)}</div>

        <m.div
          className="results-stats"
          initial="hidden"
          animate="visible"
          transition={{ staggerChildren: 0.08, delayChildren: 0.08 }}
        >
          <m.div className="stat-card" variants={statItem}>
            <div className="stat-label">Correct</div>
            <div className="stat-value good">{correct}</div>
          </m.div>
          <m.div className="stat-card" variants={statItem}>
            <div className="stat-label">Incorrect</div>
            <div className="stat-value bad">{wrong}</div>
          </m.div>
          <m.div className="stat-card" variants={statItem}>
            <div className="stat-label">Flagged</div>
            <div className="stat-value">{flagged.size}</div>
          </m.div>
        </m.div>

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
          <button className="primary-btn" onClick={onReview}>Review answers &nbsp;→</button>
          <button className="ghost-btn" onClick={onRestart}>Retake same set</button>
          <button className="ghost-btn" onClick={onBackToStart}>Change exam</button>
        </div>
      </m.div>
    </div>
  );
}

export default ResultsScreen;
