import { POSITION_COLORS } from '../utils/dataProcessing';
import { DAYS } from '../utils/schedulerUtils';

export default function ScheduleQuality({ scores, schedule, preferences }) {
  if (!scores || !schedule) return null;

  const metrics = [
    { label: 'Preference Match', value: scores.preference, color: '#3b82f6' },
    { label: 'Position Rotation', value: scores.rotation, color: '#22c55e' },
    { label: 'Workload Balance', value: scores.workload, color: '#a855f7' },
  ];

  // Per-employee breakdown
  const empStats = {};
  for (const day of DAYS) {
    for (const a of (schedule[day] || [])) {
      if (!a.employee) continue;
      if (!empStats[a.employee]) empStats[a.employee] = { shifts: 0, positions: {}, prefMatches: 0 };
      empStats[a.employee].shifts++;
      empStats[a.employee].positions[a.position] = (empStats[a.employee].positions[a.position] || 0) + 1;

      const pref = preferences[a.employee];
      if (pref) {
        const idx = pref.preferredPositions.indexOf(a.position);
        if (idx === 0) empStats[a.employee].prefMatches++;
      }
    }
  }

  return (
    <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
      <h2 className="text-lg font-semibold text-white mb-4">Schedule Quality Score</h2>

      {/* Overall Score */}
      <div className="flex items-center gap-6 mb-6">
        <div className="relative w-20 h-20">
          <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
            <circle cx="18" cy="18" r="15" fill="none" stroke="#334155" strokeWidth="3" />
            <circle
              cx="18" cy="18" r="15" fill="none"
              stroke={scores.overall >= 70 ? '#22c55e' : scores.overall >= 40 ? '#eab308' : '#ef4444'}
              strokeWidth="3"
              strokeDasharray={`${scores.overall * 0.942} 100`}
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xl font-bold text-white">{scores.overall}</span>
          </div>
        </div>

        <div className="flex-1 space-y-2">
          {metrics.map(m => (
            <div key={m.label}>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-400">{m.label}</span>
                <span className="text-white font-medium">{m.value}</span>
              </div>
              <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${m.value}%`, backgroundColor: m.color }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Per-Employee Breakdown */}
      <h3 className="text-sm font-medium text-slate-400 mb-2">Employee Breakdown</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-slate-500">
              <th className="text-left py-1.5 px-2">Employee</th>
              <th className="text-center py-1.5 px-2">Shifts</th>
              <th className="text-center py-1.5 px-2">Positions</th>
              <th className="text-center py-1.5 px-2">Pref Match</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(empStats).sort((a, b) => a[0].localeCompare(b[0])).map(([name, stats]) => (
              <tr key={name} className="border-t border-slate-700/50">
                <td className="py-1.5 px-2 text-white">{name.split(' ')[0]}</td>
                <td className="py-1.5 px-2 text-center text-slate-300">{stats.shifts}</td>
                <td className="py-1.5 px-2">
                  <div className="flex gap-0.5 justify-center flex-wrap">
                    {Object.entries(stats.positions).map(([pos, count]) => (
                      <span
                        key={pos}
                        className="px-1.5 py-0.5 rounded text-[10px]"
                        style={{ backgroundColor: (POSITION_COLORS[pos] || '#475569') + '30', color: POSITION_COLORS[pos] || '#94a3b8' }}
                      >
                        {pos} ×{count}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="py-1.5 px-2 text-center">
                  <span className={stats.prefMatches > 0 ? 'text-green-400' : 'text-slate-500'}>
                    {stats.prefMatches}/{stats.shifts}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
