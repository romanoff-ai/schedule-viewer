import { useMemo } from 'react';

export default function SummaryCards({ data }) {
  const stats = useMemo(() => {
    const working = data.filter(r => r.isWorking);
    const totalShifts = working.length;

    // Average shifts per week
    if (working.length === 0) {
      return { totalShifts: 0, avgPerWeek: '0', mostCommon: 'N/A', uniqueEmployees: 0 };
    }

    const dates = working.map(r => r.parsedDate.getTime());
    const minDate = Math.min(...dates);
    const maxDate = Math.max(...dates);
    const rawWeeks = (maxDate - minDate) / (7 * 24 * 60 * 60 * 1000);
    const weeks = isFinite(rawWeeks) && rawWeeks > 0 ? rawWeeks : 0;
    const avgPerWeek = weeks === 0 ? '—' : (totalShifts / weeks).toFixed(1);

    // Most common position
    const posCounts = {};
    working.forEach(r => {
      if (r.cleanPosition !== 'Unassigned') {
        posCounts[r.cleanPosition] = (posCounts[r.cleanPosition] || 0) + 1;
      }
    });
    const mostCommon = Object.entries(posCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Unassigned';

    const uniqueEmployees = new Set(working.map(r => r.name)).size;

    return { totalShifts, avgPerWeek, mostCommon, uniqueEmployees };
  }, [data]);

  const cards = [
    { label: 'Total Shifts', value: stats.totalShifts.toLocaleString(), icon: '📊' },
    { label: 'Avg Shifts/Week', value: stats.avgPerWeek, icon: '📅' },
    { label: 'Most Common Position', value: stats.mostCommon, icon: '🎯' },
    { label: 'Unique Employees', value: stats.uniqueEmployees, icon: '👥' },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map(card => (
        <div
          key={card.label}
          className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 sm:p-5"
        >
          <div className="text-2xl mb-2">{card.icon}</div>
          <div className="text-2xl sm:text-3xl font-bold text-white">{card.value}</div>
          <div className="text-sm text-slate-400 mt-1">{card.label}</div>
        </div>
      ))}
    </div>
  );
}
