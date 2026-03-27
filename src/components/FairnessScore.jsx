import { useMemo } from 'react';

export default function FairnessScore({ data, onEmployeeClick }) {
  const rows = useMemo(() => {
    const working = data.filter(r => r.isWorking);
    const byEmployee = {};
    working.forEach(r => {
      if (!byEmployee[r.name]) {
        byEmployee[r.name] = { total: 0, weekend: 0, positions: new Set() };
      }
      byEmployee[r.name].total++;
      const day = r.parsedDate.getDay();
      if (day === 0 || day === 5 || day === 6) byEmployee[r.name].weekend++;
      if (r.cleanPosition !== 'Unassigned') byEmployee[r.name].positions.add(r.cleanPosition);
    });

    return Object.entries(byEmployee)
      .map(([name, stats]) => {
        const weekendPct = stats.total > 0 ? (stats.weekend / stats.total * 100) : 0;
        const variety = stats.positions.size;
        return {
          name,
          total: stats.total,
          weekend: stats.weekend,
          weekendPct,
          variety,
        };
      })
      .sort((a, b) => b.total - a.total);
  }, [data]);

  const avgVariety = rows.length > 0 ? rows.reduce((s, r) => s + r.variety, 0) / rows.length : 0;
  const avgWeekendPct = rows.length > 0 ? rows.reduce((s, r) => s + r.weekendPct, 0) / rows.length : 0;

  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 sm:p-6">
      <h2 className="text-lg font-semibold text-white mb-4">Schedule Fairness Score</h2>
      <p className="text-xs text-slate-400 mb-3">Weekend = Fri/Sat/Sun. Highlights show imbalances vs team average.</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700">
              <th className="text-left text-slate-400 font-medium py-2 pr-3">Employee</th>
              <th className="text-right text-slate-400 font-medium py-2 px-3">Total Shifts</th>
              <th className="text-right text-slate-400 font-medium py-2 px-3">Weekend Shifts</th>
              <th className="text-right text-slate-400 font-medium py-2 px-3">Weekend %</th>
              <th className="text-right text-slate-400 font-medium py-2 px-3">Position Variety</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const highWeekend = row.weekendPct > avgWeekendPct + 10;
              const lowVariety = row.variety < avgVariety - 1 && row.variety > 0;
              return (
                <tr
                  key={row.name}
                  className="border-b border-slate-700/50 hover:bg-slate-700/30 cursor-pointer"
                  onClick={() => onEmployeeClick(row.name)}
                >
                  <td className="py-2 pr-3 text-slate-200 whitespace-nowrap">{row.name}</td>
                  <td className="py-2 px-3 text-right text-slate-300">{row.total}</td>
                  <td className="py-2 px-3 text-right text-slate-300">{row.weekend}</td>
                  <td className={`py-2 px-3 text-right ${highWeekend ? 'text-amber-400 font-semibold' : 'text-slate-300'}`}>
                    {row.weekendPct.toFixed(1)}%
                  </td>
                  <td className={`py-2 px-3 text-right ${lowVariety ? 'text-red-400 font-semibold' : 'text-slate-300'}`}>
                    {row.variety} positions
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
