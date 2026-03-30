import { useMemo, useState } from 'react';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseEndTime(schedule) {
  if (!schedule) return null;
  // e.g. "4:00 P - 1:00 A\nBARTOP"
  const match = schedule.match(/\d+:\d+\s*[AP]\s*-\s*(\d+:\d+\s*[AP])/i);
  if (!match) return null;
  const timeStr = match[1].trim();
  const m = timeStr.match(/^(\d+):(\d+)\s*([AP])/i);
  if (!m) return null;
  let h = parseInt(m[1]);
  const min = parseInt(m[2]);
  const p = m[3].toUpperCase();
  if (p === 'P' && h !== 12) h += 12;
  if (p === 'A' && h === 12) h = 0;
  return h + min / 60;
}

function isClosingShift(schedule) {
  // closing = end time >= 1:00 AM (hour >= 25 in 24h crossing midnight, i.e. 1 or 2)
  const end = parseEndTime(schedule);
  if (end === null) return false;
  // end < 12 means it's AM next day (e.g. 1:00A = 1, 2:00A = 2)
  return end <= 4; // 1am, 2am, 3am, 4am
}

const US_HOLIDAYS = [
  { month: 1, day: 1 },   // New Year's Day
  { month: 1, day: 20 },  // MLK Day (approx 3rd Mon Jan — use Jan 20 as proxy)
  { month: 2, day: 17 },  // Presidents Day (approx 3rd Mon Feb — Feb 17 proxy)
  { month: 5, day: 26 },  // Memorial Day (approx last Mon May — May 26 proxy)
  { month: 7, day: 4 },   // July 4th
  { month: 9, day: 1 },   // Labor Day (approx 1st Mon Sep — Sep 1 proxy)
  { month: 11, day: 27 }, // Thanksgiving (approx 4th Thu Nov — Nov 27 proxy)
  { month: 12, day: 24 }, // Christmas Eve
  { month: 12, day: 25 }, // Christmas
  { month: 12, day: 31 }, // New Year's Eve
];

function isHoliday(parsedDate) {
  if (!parsedDate || isNaN(parsedDate.getTime())) return false;
  const m = parsedDate.getMonth() + 1;
  const d = parsedDate.getDate();
  return US_HOLIDAYS.some(h => h.month === m && h.day === d);
}

const DAY_VALUE = { 5: 5, 6: 5, 4: 4, 0: 3 }; // Fri=5,Sat=5,Thu=4,Sun=3
const POSITION_VALUE = {
  'Bar Top': 5, 'Service Well': 4, 'Closer': 3, 'Floor': 2,
  'Barback': 1, 'Satellite Bar': 3, 'Patio Bar': 3,
};
const OUTLET_VALUE = {
  'Peacock': 5, 'Quill': 4, 'Goldies': 3, 'Banquet': 2,
  'Peacock Patio': 3, 'Kappo Kappo': 2,
};

function shiftPrimeValue(r) {
  const dayV = DAY_VALUE[r.parsedDate?.getDay()] ?? 2;
  const posV = POSITION_VALUE[r.cleanPosition] ?? 2;
  const outV = OUTLET_VALUE[r.outlet] ?? 2;
  return dayV * posV * outV;
}

function scoreDistribution(values) {
  // Returns 0-100 based on coefficient of variation (lower = fairer = higher score)
  if (values.length < 2) return 100;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (mean === 0) return 100;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  const cv = Math.sqrt(variance) / mean;
  return Math.max(0, Math.round(100 - cv * 100));
}

function pctScore(values, targetPct) {
  // Score how evenly distributed a percentage metric is
  // targetPct = ideal %, higher variance = lower score
  if (values.length < 2) return 100;
  const diffs = values.map(v => Math.abs(v - targetPct));
  const avgDiff = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  return Math.max(0, Math.round(100 - avgDiff * 2));
}

function scoreLabel(s) {
  if (s >= 90) return { label: 'Excellent', color: 'text-emerald-400', bg: 'bg-emerald-500' };
  if (s >= 75) return { label: 'Good', color: 'text-blue-400', bg: 'bg-blue-500' };
  if (s >= 60) return { label: 'Fair', color: 'text-yellow-400', bg: 'bg-yellow-500' };
  return { label: 'Needs Attention', color: 'text-red-400', bg: 'bg-red-500' };
}

function MiniBar({ value, bg }) {
  return (
    <div className="w-full bg-slate-700 rounded-full h-1.5 mt-1.5">
      <div
        className={`h-1.5 rounded-full transition-all ${bg}`}
        style={{ width: `${Math.max(2, value)}%` }}
      />
    </div>
  );
}

function MetricCard({ title, score, explanation, weight }) {
  const { label, color, bg } = scoreLabel(score);
  return (
    <div className="bg-slate-800 border border-slate-700/60 rounded-xl p-4">
      <div className="flex items-start justify-between mb-1">
        <div>
          <div className="text-xs text-slate-400 font-medium uppercase tracking-wider">{title}</div>
          <div className="text-xs text-slate-500 mt-0.5">Weight: {weight}%</div>
        </div>
        <div className={`text-2xl font-bold ${color}`}>{score}</div>
      </div>
      <MiniBar value={score} bg={bg} />
      <div className={`text-xs font-semibold mt-2 ${color}`}>{label}</div>
      <div className="text-xs text-slate-400 mt-1 leading-snug">{explanation}</div>
    </div>
  );
}

function SortIcon({ active, dir }) {
  if (!active) return <span className="text-slate-600 ml-1">↕</span>;
  return <span className="text-blue-400 ml-1">{dir === 'asc' ? '↑' : '↓'}</span>;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function FairnessScore({ data, onEmployeeClick }) {
  const [sortCol, setSortCol] = useState('overall');
  const [sortDir, setSortDir] = useState('asc');
  const [expandedEmployee, setExpandedEmployee] = useState(null);

  const { metrics, employeeRows, consecutiveAlerts, overallScore } = useMemo(() => {
    const working = data.filter(r => r.isWorking);
    if (working.length === 0) return { metrics: null, employeeRows: [], consecutiveAlerts: [], overallScore: 0 };

    // Group by employee
    const byEmp = {};
    working.forEach(r => {
      if (!byEmp[r.name]) byEmp[r.name] = [];
      byEmp[r.name].push(r);
    });

    const empNames = Object.keys(byEmp);

    // ── Metric 1: Weekend Share ──────────────────────────────────────────────
    const weekendPcts = empNames.map(name => {
      const shifts = byEmp[name];
      const wknd = shifts.filter(r => {
        const day = r.parsedDate?.getDay();
        return day === 5 || day === 6 || day === 0;
      }).length;
      return shifts.length > 0 ? (wknd / shifts.length) * 100 : 0;
    });
    const idealWeekendPct = (weekendPcts.reduce((a, b) => a + b, 0) / weekendPcts.length);
    const weekendScore = pctScore(weekendPcts, idealWeekendPct);

    // ── Metric 2: Position Rotation ──────────────────────────────────────────
    const posVarieties = empNames.map(name => {
      const positions = new Set(byEmp[name].map(r => r.cleanPosition).filter(p => p && p !== 'Unassigned'));
      return positions.size;
    });
    const posScore = scoreDistribution(posVarieties);

    // ── Metric 3: Closing Shifts ─────────────────────────────────────────────
    const closingPcts = empNames.map(name => {
      const shifts = byEmp[name];
      const closing = shifts.filter(r => isClosingShift(r.schedule)).length;
      return shifts.length > 0 ? (closing / shifts.length) * 100 : 0;
    });
    const idealClosingPct = closingPcts.reduce((a, b) => a + b, 0) / closingPcts.length;
    const closingScore = pctScore(closingPcts, idealClosingPct);

    // ── Metric 4: Holiday Coverage ───────────────────────────────────────────
    const holidayCounts = empNames.map(name => byEmp[name].filter(r => isHoliday(r.parsedDate)).length);
    const holidayScore = scoreDistribution(holidayCounts);

    // ── Metric 5: Total Hours Equity ─────────────────────────────────────────
    const totalHours = empNames.map(name => byEmp[name].reduce((s, r) => s + (r.hours || 0), 0));
    const hoursScore = scoreDistribution(totalHours);

    // ── Metric 6: Prime Shift Access ─────────────────────────────────────────
    const avgPrimeValues = empNames.map(name => {
      const shifts = byEmp[name];
      const total = shifts.reduce((s, r) => s + shiftPrimeValue(r), 0);
      return shifts.length > 0 ? total / shifts.length : 0;
    });
    const primeScore = scoreDistribution(avgPrimeValues);

    // ── Metric 7: Consecutive Days (informational) ───────────────────────────
    const consecutiveAlerts = [];
    empNames.forEach(name => {
      const dates = [...new Set(byEmp[name].map(r => r.parsedDate?.getTime()).filter(Boolean))].sort((a, b) => a - b);
      let maxStreak = 1, streak = 1, streakStart = 0;
      for (let i = 1; i < dates.length; i++) {
        const diff = (dates[i] - dates[i - 1]) / (1000 * 60 * 60 * 24);
        if (diff === 1) {
          streak++;
          if (streak > maxStreak) {
            maxStreak = streak;
            streakStart = i - streak + 1;
          }
        } else {
          streak = 1;
          streakStart = i;
        }
      }
      if (maxStreak >= 6) {
        const startDate = new Date(dates[streakStart]);
        const endDate = new Date(dates[streakStart + maxStreak - 1]);
        const fmt = d => `${d.getMonth() + 1}/${d.getDate()}`;
        consecutiveAlerts.push({ name, streak: maxStreak, range: `${fmt(startDate)} – ${fmt(endDate)}` });
      }
    });

    // ── Overall Score ────────────────────────────────────────────────────────
    const overallScore = Math.round(
      weekendScore * 0.25 +
      posScore * 0.20 +
      closingScore * 0.15 +
      holidayScore * 0.10 +
      hoursScore * 0.15 +
      primeScore * 0.15
    );

    // ── Per-employee rows ────────────────────────────────────────────────────
    const employeeRows = empNames.map((name, i) => {
      const empOverall = Math.round(
        (100 - Math.abs(weekendPcts[i] - idealWeekendPct) * 2) * 0.25 +
        Math.min(100, posVarieties[i] * 20) * 0.20 +
        (100 - Math.abs(closingPcts[i] - idealClosingPct) * 2) * 0.15 +
        (holidayCounts[i] === 0 ? 80 : 100) * 0.10 +
        (totalHours[i] > 0 ? 80 : 50) * 0.15 +
        Math.min(100, avgPrimeValues[i] * 2) * 0.15
      );
      return {
        name,
        overall: Math.min(100, Math.max(0, empOverall)),
        weekend: Math.min(100, Math.max(0, Math.round(100 - Math.abs(weekendPcts[i] - idealWeekendPct) * 2))),
        position: Math.min(100, Math.max(0, Math.round(posVarieties[i] * 20))),
        closing: Math.min(100, Math.max(0, Math.round(100 - Math.abs(closingPcts[i] - idealClosingPct) * 2))),
        holidays: holidayCounts[i] > 0 ? 100 : (idealClosingPct === 0 ? 100 : 70),
        hours: Math.min(100, Math.max(0, totalHours[i] > 0 ? 85 : 40)),
        prime: Math.min(100, Math.max(0, Math.round(avgPrimeValues[i] * 2))),
        // Details
        totalShifts: byEmp[name].length,
        weekendPct: weekendPcts[i].toFixed(1),
        posVariety: posVarieties[i],
        positions: [...new Set(byEmp[name].map(r => r.cleanPosition).filter(p => p && p !== 'Unassigned'))].join(', '),
        closingPct: closingPcts[i].toFixed(1),
        holidayCount: holidayCounts[i],
        totalHoursVal: totalHours[i].toFixed(1),
        avgPrimeVal: avgPrimeValues[i].toFixed(1),
      };
    });

    const metrics = [
      { title: 'Weekend Share', score: weekendScore, weight: 25, explanation: `Fri/Sat/Sun shifts — team avg ${idealWeekendPct.toFixed(1)}% of shifts are weekends` },
      { title: 'Position Rotation', score: posScore, weight: 20, explanation: `How evenly position variety is spread (avg ${(posVarieties.reduce((a,b)=>a+b,0)/posVarieties.length).toFixed(1)} positions/person)` },
      { title: 'Closing Shifts', score: closingScore, weight: 15, explanation: `1AM+ closings — team avg ${idealClosingPct.toFixed(1)}% of shifts are closes` },
      { title: 'Holiday Coverage', score: holidayScore, weight: 10, explanation: `Major US holidays — distribution across ${empNames.length} employees` },
      { title: 'Hours Equity', score: hoursScore, weight: 15, explanation: `Total hours across team — lower variance = fairer score` },
      { title: 'Prime Shift Access', score: primeScore, weight: 15, explanation: `High-value shifts (day × position × outlet) — avg score ${(avgPrimeValues.reduce((a,b)=>a+b,0)/avgPrimeValues.length).toFixed(0)}/125` },
    ];

    return { metrics, employeeRows, consecutiveAlerts, overallScore };
  }, [data]);

  const sortedRows = useMemo(() => {
    if (!employeeRows.length) return [];
    return [...employeeRows].sort((a, b) => {
      const av = a[sortCol], bv = b[sortCol];
      const cmp = typeof av === 'string' ? av.localeCompare(bv) : av - bv;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [employeeRows, sortCol, sortDir]);

  function handleSort(col) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  }

  if (!metrics) {
    return (
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6 text-slate-400 text-center">
        No working shifts in selected range.
      </div>
    );
  }

  const { label: overallLabel, color: overallColor, bg: overallBg } = scoreLabel(overallScore);

  const COLS = [
    { key: 'name', label: 'Employee' },
    { key: 'overall', label: 'Overall' },
    { key: 'weekend', label: 'Weekend' },
    { key: 'position', label: 'Position' },
    { key: 'closing', label: 'Closing' },
    { key: 'holidays', label: 'Holidays' },
    { key: 'hours', label: 'Hours' },
    { key: 'prime', label: 'Prime' },
  ];

  return (
    <div className="space-y-6">
      {/* ── Overall Score ─────────────────────────────────────────────────── */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
        <div className="flex flex-col sm:flex-row items-center gap-6">
          {/* Circular gauge */}
          <div className="relative flex-shrink-0">
            <svg width="120" height="120" viewBox="0 0 120 120">
              <circle cx="60" cy="60" r="50" fill="none" stroke="#1e293b" strokeWidth="12" />
              <circle
                cx="60" cy="60" r="50"
                fill="none"
                stroke={overallScore >= 90 ? '#10b981' : overallScore >= 75 ? '#3b82f6' : overallScore >= 60 ? '#eab308' : '#ef4444'}
                strokeWidth="12"
                strokeLinecap="round"
                strokeDasharray={`${overallScore * 3.14} 314`}
                transform="rotate(-90 60 60)"
                style={{ transition: 'stroke-dasharray 0.6s ease' }}
              />
              <text x="60" y="56" textAnchor="middle" fill="white" fontSize="26" fontWeight="bold">{overallScore}</text>
              <text x="60" y="72" textAnchor="middle" fill="#94a3b8" fontSize="10">/100</text>
            </svg>
          </div>
          <div>
            <div className="text-2xl font-bold text-white">Schedule Fairness Score</div>
            <div className={`text-lg font-semibold mt-1 ${overallColor}`}>{overallLabel}</div>
            <div className="text-sm text-slate-400 mt-1">Weighted across 6 metrics · {employeeRows.length} employees analyzed</div>
            <div className="flex flex-wrap gap-2 mt-3">
              {metrics.map(m => (
                <span key={m.title} className="text-xs bg-slate-700 text-slate-300 rounded px-2 py-0.5">
                  {m.title}: <span className={scoreLabel(m.score).color}>{m.score}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── 6 Metric Cards ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {metrics.map(m => (
          <MetricCard
            key={m.title}
            title={m.title}
            score={m.score}
            weight={m.weight}
            explanation={m.explanation}
          />
        ))}
      </div>

      {/* ── Per-Employee Breakdown Table ──────────────────────────────────── */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 sm:p-6">
        <h3 className="text-base font-semibold text-white mb-4">Per-Employee Breakdown</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700">
                {COLS.map(col => (
                  <th
                    key={col.key}
                    className="text-left text-slate-400 font-medium py-2 px-2 cursor-pointer hover:text-slate-200 select-none whitespace-nowrap"
                    onClick={() => handleSort(col.key)}
                  >
                    {col.label}
                    <SortIcon active={sortCol === col.key} dir={sortDir} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedRows.map(row => {
                const isExpanded = expandedEmployee === row.name;
                const { color: ovColor } = scoreLabel(row.overall);
                return (
                  <>
                    <tr
                      key={row.name}
                      className="border-b border-slate-700/30 hover:bg-slate-700/30 cursor-pointer"
                      onClick={() => {
                        setExpandedEmployee(isExpanded ? null : row.name);
                        onEmployeeClick?.(row.name);
                      }}
                    >
                      <td className="py-2.5 px-2 text-slate-200 whitespace-nowrap font-medium">
                        <span className="mr-1 text-slate-500">{isExpanded ? '▾' : '▸'}</span>
                        {row.name}
                      </td>
                      {['overall', 'weekend', 'position', 'closing', 'holidays', 'hours', 'prime'].map(col => {
                        const { color } = scoreLabel(row[col]);
                        return (
                          <td key={col} className={`py-2.5 px-2 text-right font-semibold ${color}`}>
                            {row[col]}
                          </td>
                        );
                      })}
                    </tr>
                    {isExpanded && (
                      <tr key={`${row.name}-detail`} className="border-b border-slate-700/30 bg-slate-900/40">
                        <td colSpan={8} className="px-4 py-3">
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 text-xs text-slate-300">
                            <div><span className="text-slate-500">Total Shifts:</span> {row.totalShifts}</div>
                            <div><span className="text-slate-500">Weekend %:</span> {row.weekendPct}%</div>
                            <div><span className="text-slate-500">{row.posVariety === 1 ? 'Position' : 'Positions'} ({row.posVariety}):</span> {row.positions || 'None'}</div>
                            <div><span className="text-slate-500">Closing %:</span> {row.closingPct}%</div>
                            <div><span className="text-slate-500">Holidays Worked:</span> {row.holidayCount}</div>
                            <div><span className="text-slate-500">Total Hours:</span> {row.totalHoursVal}h</div>
                            <div><span className="text-slate-500">Avg Shift Value:</span> {row.avgPrimeVal}/125</div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Consecutive Days Alerts ──────────────────────────────────────── */}
      {consecutiveAlerts.length > 0 && (
        <div className="bg-slate-800/50 border border-amber-700/40 rounded-xl p-4 sm:p-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-amber-400 text-lg">⚠️</span>
            <h3 className="text-base font-semibold text-amber-300">Consecutive Day Alerts (6+ days)</h3>
          </div>
          <div className="space-y-2">
            {consecutiveAlerts.map(a => (
              <div key={a.name} className="flex items-center gap-4 bg-amber-900/20 border border-amber-700/30 rounded-lg px-4 py-2.5">
                <span className="text-slate-200 font-medium min-w-[140px]">{a.name}</span>
                <span className="text-amber-400 font-bold">{a.streak} days in a row</span>
                <span className="text-slate-400 text-sm">{a.range}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
