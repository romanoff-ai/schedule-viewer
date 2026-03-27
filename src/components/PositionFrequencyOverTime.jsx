import { useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { POSITION_COLORS, ALL_POSITIONS } from '../utils/dataProcessing';

export default function PositionFrequencyOverTime({ data }) {
  const { chartData, activePositions } = useMemo(() => {
    const working = data.filter(r => r.isWorking);
    const byMonth = {};
    working.forEach(r => {
      if (!byMonth[r.monthKey]) byMonth[r.monthKey] = {};
      byMonth[r.monthKey][r.cleanPosition] = (byMonth[r.monthKey][r.cleanPosition] || 0) + 1;
    });

    const months = Object.keys(byMonth).sort();
    const seen = new Set();
    const chartData = months.map(month => {
      const row = { month };
      ALL_POSITIONS.forEach(p => {
        if (byMonth[month][p]) {
          row[p] = byMonth[month][p];
          seen.add(p);
        }
      });
      return row;
    });

    return { chartData, activePositions: ALL_POSITIONS.filter(p => seen.has(p)) };
  }, [data]);

  const formatMonth = (val) => {
    const [y, m] = val.split('-');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[parseInt(m) - 1]} ${y.slice(2)}`;
  };

  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 sm:p-6">
      <h2 className="text-lg font-semibold text-white mb-4">Position Frequency Over Time</h2>
      <ResponsiveContainer width="100%" height={400}>
        <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis
            dataKey="month"
            tickFormatter={formatMonth}
            tick={{ fill: '#94a3b8', fontSize: 11 }}
            angle={-45}
            textAnchor="end"
            height={60}
          />
          <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} />
          <Tooltip
            contentStyle={{ background: '#1e293b', border: '1px solid #475569', borderRadius: 8 }}
            labelStyle={{ color: '#f1f5f9' }}
            labelFormatter={formatMonth}
            itemStyle={{ color: '#cbd5e1' }}
          />
          <Legend wrapperStyle={{ paddingTop: 10 }} />
          {activePositions.map(position => (
            <Line
              key={position}
              type="monotone"
              dataKey={position}
              stroke={POSITION_COLORS[position]}
              strokeWidth={2}
              dot={false}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
