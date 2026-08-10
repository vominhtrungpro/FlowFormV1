interface GateStep {
  id: number;
  name: string;
  actorSummary: string;
}

interface Props {
  steps: GateStep[];
  currentIndex: number;
}

// Port of _StepChips.cshtml — an SVG "bowtie" stepper showing every step of the workflow with its
// actor summary, colored by done/in-progress/upcoming.
export function GateRail({ steps, currentIndex }: Props) {
  const count = steps.length;
  if (count === 0) return null;
  const w = Math.max(3, count) * 150;
  const y = 52;
  const gap = w / count;

  const stateOf = (i: number) => (i < currentIndex ? 'done' : i === currentIndex ? 'live' : '');

  return (
    <div className="gaterail">
      <svg viewBox={`0 0 ${w} 104`}>
        {steps.map((_, i) => {
          const x1 = i === 0 ? 14 : gap * i + gap / 2 + 22;
          const x2 = Math.min(gap * (i + 1) + gap / 2 - 22, w - 14);
          return <line key={i} className={`gr-line ${stateOf(i)}`} x1={x1} y1={y} x2={x2} y2={y} />;
        })}
        {steps.map((s, i) => {
          const cx = gap * i + gap / 2;
          return (
            <g key={s.id} className={`gv ${stateOf(i)}`}>
              <path className="body" d={`M${cx - 20} ${y - 13} L${cx} ${y} L${cx - 20} ${y + 13} Z`} />
              <path className="body" d={`M${cx + 20} ${y - 13} L${cx} ${y} L${cx + 20} ${y + 13} Z`} />
              <circle className="body" cx={cx} cy={y - 19} r={6} />
              <text className="num" x={cx} y={y - 16} textAnchor="middle">
                {i + 1}
              </text>
              <text className="lbl" x={cx} y={y + 30} textAnchor="middle">
                {s.name.toUpperCase()}
              </text>
              <text className="who" x={cx} y={y + 43} textAnchor="middle">
                {s.actorSummary}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="gr-legend">
        <span>
          <i style={{ background: '#2E9E6B' }} />
          Done
        </span>
        <span>
          <i style={{ background: '#22B5DE' }} />
          In progress
        </span>
        <span>
          <i style={{ background: '#3A4E5C' }} />
          Upcoming
        </span>
      </div>
    </div>
  );
}
