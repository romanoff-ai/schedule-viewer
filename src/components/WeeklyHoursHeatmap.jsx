import { useMemo } from 'react';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function WeeklyHoursHeatmap({ data, onEmployeeClick }) {
  const { grid, employees, maxHours } = useMemo(() => {
    const working = data.filter(r => r.isWorking);
    const agg = {};
    working.forEach(r => {
      const key = `${r.name}|${r.dayOfWeek}`;
      if (!agg[key]) agg[key] = { total: 0, count: 0 };
      agg[key].total += r.hours;
      agg[key].count += 1;
    });

    const employeeSet = [...new Set(working.map(r => r.name))].sort();
    const grid = {};
    let maxHours = 0;
    employeeSet.forEach(name => {
      grid[name] = {};
      DAYS.forEach(day => {
        const key = `${name}|${day}`;
        const avg = agg[key] ? agg[key].total / agg[key].count : 0;
        grid[name][day] = avg;
        if (avg > maxHours) maxHours = avg;
      });
    });

    return { grid, employees: employeeSet, maxHours };
  }, [data]);

  const getColor = (value) => {
    if (value === 0) return 'bg-slate-800';
    const intensity = value / maxHours;
    if (intensity < 0.25) return 'bg-blue-900/60';
    if (intensity < 0.5) return 'bg-blue-700/70';
    if (intensity < 0.75) return 'bg-blue-500/80';
    return 'bg-blue-400';
  };

  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 sm:p-6">
      <h2 className="text-lg font-semibold text-white mb-4">Weekly Hours Heatmap</h2>
      <p className="text-xs text-slate-400 mb-3">Average hours worked per day of week</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="text-left text-slate-400 font-medium py-2 pr-3 min-w-[120px]">Employee</th>
              {DAYS.map(day => (
                <th key={day} className="text-center text-slate-400 font-medium py-2 px-1 w-16">{day}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {employees.map(name => (
              <tr
                key={name}
                className="hover:bg-slate-700/30 cursor-pointer"
                onClick={() => onEmployeeClick(name)}
              >
                <td className="py-1 pr-3 text-slate-300 text-xs sm:text-sm whitespace-nowrap">
                  {name}
                </td>
                {DAYS.map(day => {
                  const val = grid[name][day];
                  return (
                    <td key={day} className="py-1 px-1">
                      <div
                        className={`${getColor(val)} rounded h-8 flex items-center justify-center text-xs font-medium ${
                          val > 0 ? 'text-white' : 'text-slate-600'
                        }`}
                        title={`${name} - ${day}: ${val.toFixed(1)}h avg`}
                      >
                        {val > 0 ? val.toFixed(1) : ''}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
