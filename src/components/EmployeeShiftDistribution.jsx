import { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { POSITION_COLORS, ALL_POSITIONS } from '../utils/dataProcessing';

export default function EmployeeShiftDistribution({ data, onEmployeeClick }) {
  const chartData = useMemo(() => {
    const working = data.filter(r => r.isWorking);
    const byEmployee = {};
    working.forEach(r => {
      if (!byEmployee[r.name]) byEmployee[r.name] = {};
      byEmployee[r.name][r.cleanPosition] = (byEmployee[r.name][r.cleanPosition] || 0) + 1;
    });
    return Object.entries(byEmployee)
      .map(([name, positions]) => {
        const total = Object.values(positions).reduce((a, b) => a + b, 0);
        return { name, ...positions, total };
      })
      .sort((a, b) => b.total - a.total);
  }, [data]);

  const activePositions = useMemo(() => {
    const seen = new Set();
    chartData.forEach(row => {
      ALL_POSITIONS.forEach(p => { if (row[p]) seen.add(p); });
    });
    return ALL_POSITIONS.filter(p => seen.has(p));
  }, [chartData]);

  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 sm:p-6">
      <h2 className="text-lg font-semibold text-white mb-4">Employee Shift Distribution</h2>
      <ResponsiveContainer width="100%" height={Math.max(300, chartData.length * 40)}>
        <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
          <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 12 }} />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fill: '#94a3b8', fontSize: 12 }}
            width={130}
          />
          <Tooltip
            contentStyle={{ background: '#1e293b', border: '1px solid #475569', borderRadius: 8 }}
            labelStyle={{ color: '#f1f5f9' }}
            itemStyle={{ color: '#cbd5e1' }}
          />
          <Legend wrapperStyle={{ paddingTop: 10 }} />
          {activePositions.map(position => (
            <Bar
              key={position}
              dataKey={position}
              stackId="positions"
              fill={POSITION_COLORS[position]}
              cursor="pointer"
              onClick={(barData) => {
                if (barData?.name) onEmployeeClick(barData.name);
              }}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
