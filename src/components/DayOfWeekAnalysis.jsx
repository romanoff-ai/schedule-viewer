import { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

const DAYS_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function DayOfWeekAnalysis({ data }) {
  const chartData = useMemo(() => {
    const working = data.filter(r => r.isWorking);
    const byDay = {};
    const datesByDay = {};

    working.forEach(r => {
      const day = r.dayOfWeek;
      if (!byDay[day]) byDay[day] = 0;
      byDay[day]++;
      if (!datesByDay[day]) datesByDay[day] = new Set();
      datesByDay[day].add(r.date);
    });

    return DAYS_ORDER.map(day => ({
      day,
      totalShifts: byDay[day] || 0,
      avgStaffing: datesByDay[day] ? ((byDay[day] || 0) / datesByDay[day].size).toFixed(1) : '0',
      uniqueDays: datesByDay[day]?.size || 0,
    }));
  }, [data]);

  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 sm:p-6">
      <h2 className="text-lg font-semibold text-white mb-4">Day of Week Analysis</h2>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="day" tick={{ fill: '#94a3b8', fontSize: 12 }} />
          <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} />
          <Tooltip
            contentStyle={{ background: '#1e293b', border: '1px solid #475569', borderRadius: 8 }}
            labelStyle={{ color: '#f1f5f9' }}
            formatter={(value, name) => {
              if (name === 'totalShifts') return [value, 'Total Shifts'];
              return [value, 'Avg Staff/Day'];
            }}
          />
          <Bar dataKey="totalShifts" fill="#3b82f6" radius={[4, 4, 0, 0]} name="totalShifts" />
          <Bar dataKey="avgStaffing" fill="#22c55e" radius={[4, 4, 0, 0]} name="avgStaffing" />
        </BarChart>
      </ResponsiveContainer>
      <div className="flex gap-6 justify-center mt-3 text-xs text-slate-400">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-blue-500 inline-block" /> Total Shifts
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-green-500 inline-block" /> Avg Staff/Day
        </span>
      </div>
    </div>
  );
}
