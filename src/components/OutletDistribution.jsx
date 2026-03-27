import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { OUTLET_COLORS } from '../utils/dataProcessing';

const OUTLETS = Object.keys(OUTLET_COLORS);

export default function OutletDistribution({ data, onEmployeeClick }) {
  const { chartData, summaryRows } = useMemo(() => {
    const working = data.filter(r => r.isWorking);

    // Per-employee outlet counts
    const byEmployee = {};
    working.forEach(r => {
      if (!byEmployee[r.name]) byEmployee[r.name] = {};
      byEmployee[r.name][r.outlet] = (byEmployee[r.name][r.outlet] || 0) + 1;
    });

    const chart = Object.entries(byEmployee)
      .map(([name, outlets]) => {
        const total = Object.values(outlets).reduce((s, v) => s + v, 0);
        const entry = { name: name.split(' ')[0], fullName: name, total };
        OUTLETS.forEach(o => { entry[o] = outlets[o] || 0; });
        return entry;
      })
      .sort((a, b) => b.total - a.total);

    // Per-outlet summary
    const outletStats = {};
    const dateRange = new Set();
    working.forEach(r => {
      const o = r.outlet;
      if (!outletStats[o]) outletStats[o] = { shifts: 0, employees: new Set(), weeks: new Set() };
      outletStats[o].shifts++;
      outletStats[o].employees.add(r.name);
      // Week key for avg/week calc
      const weekStart = new Date(r.parsedDate);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      const wk = `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, '0')}-${String(weekStart.getDate()).padStart(2, '0')}`;
      outletStats[o].weeks.add(wk);
      dateRange.add(wk);
    });

    const totalWeeks = dateRange.size || 1;
    const summary = OUTLETS
      .filter(o => outletStats[o])
      .map(o => ({
        outlet: o,
        shifts: outletStats[o].shifts,
        avgPerWeek: (outletStats[o].shifts / totalWeeks).toFixed(1),
        uniqueEmployees: outletStats[o].employees.size,
      }));

    return { chartData: chart, summaryRows: summary };
  }, [data]);

  if (chartData.length === 0) return null;

  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 sm:p-6">
      <h2 className="text-lg font-semibold text-white mb-4">Outlet Distribution</h2>

      {/* Stacked bar chart */}
      <div className="w-full" style={{ height: Math.max(chartData.length * 32 + 60, 200) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
            <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 12 }} />
            <YAxis
              type="category"
              dataKey="name"
              width={70}
              tick={{ fill: '#cbd5e1', fontSize: 11 }}
            />
            <Tooltip
              contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
              labelStyle={{ color: '#f1f5f9' }}
              itemStyle={{ color: '#e2e8f0' }}
              labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName || ''}
            />
            <Legend
              wrapperStyle={{ fontSize: 11, color: '#94a3b8' }}
            />
            {OUTLETS.map(outlet => (
              <Bar
                key={outlet}
                dataKey={outlet}
                stackId="outlet"
                fill={OUTLET_COLORS[outlet]}
                cursor="pointer"
                onClick={(barData) => {
                  if (barData?.fullName) onEmployeeClick(barData.fullName);
                }}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Summary table */}
      <h3 className="text-sm font-semibold text-slate-300 mt-6 mb-2">Per-Outlet Summary</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700">
              <th className="text-left text-slate-400 font-medium py-2 pr-3">Outlet</th>
              <th className="text-right text-slate-400 font-medium py-2 px-3">Total Shifts</th>
              <th className="text-right text-slate-400 font-medium py-2 px-3">Avg/Week</th>
              <th className="text-right text-slate-400 font-medium py-2 px-3">Unique Employees</th>
            </tr>
          </thead>
          <tbody>
            {summaryRows.map(row => (
              <tr key={row.outlet} className="border-b border-slate-700/50">
                <td className="py-2 pr-3 text-slate-200 whitespace-nowrap flex items-center gap-2">
                  <span
                    className="inline-block w-3 h-3 rounded-sm shrink-0"
                    style={{ backgroundColor: OUTLET_COLORS[row.outlet] }}
                  />
                  {row.outlet}
                </td>
                <td className="py-2 px-3 text-right text-slate-300">{row.shifts}</td>
                <td className="py-2 px-3 text-right text-slate-300">{row.avgPerWeek}</td>
                <td className="py-2 px-3 text-right text-slate-300">{row.uniqueEmployees}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
