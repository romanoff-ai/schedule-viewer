import { useMemo } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { POSITION_COLORS, OUTLET_COLORS } from '../utils/dataProcessing';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function EmployeeDetail({ data, employeeName, onClose }) {
  const empData = useMemo(() => {
    const shifts = data.filter(r => r.name === employeeName);
    const working = shifts.filter(r => r.isWorking);

    // Position breakdown
    const positionCounts = {};
    working.forEach(r => {
      positionCounts[r.cleanPosition] = (positionCounts[r.cleanPosition] || 0) + 1;
    });
    const positionBreakdown = Object.entries(positionCounts)
      .sort((a, b) => b[1] - a[1]);

    // Monthly calendar data
    const byMonth = {};
    shifts.forEach(r => {
      const key = r.monthKey;
      if (!byMonth[key]) byMonth[key] = [];
      byMonth[key].push(r);
    });

    // Total hours
    const totalHours = working.reduce((sum, r) => sum + r.hours, 0);

    // Day of week distribution
    const dayDist = {};
    working.forEach(r => {
      dayDist[r.dayOfWeek] = (dayDist[r.dayOfWeek] || 0) + 1;
    });

    // Average shift length
    const avgHours = working.length > 0 ? totalHours / working.length : 0;

    // Outlet breakdown
    const outletCounts = {};
    working.forEach(r => {
      outletCounts[r.outlet] = (outletCounts[r.outlet] || 0) + 1;
    });
    const outletBreakdown = Object.entries(outletCounts)
      .map(([outlet, count]) => ({ name: outlet, value: count }))
      .sort((a, b) => b.value - a.value);

    // Outlet timeline (per month)
    const outletByMonth = {};
    working.forEach(r => {
      if (!outletByMonth[r.monthKey]) outletByMonth[r.monthKey] = {};
      outletByMonth[r.monthKey][r.outlet] = (outletByMonth[r.monthKey][r.outlet] || 0) + 1;
    });

    return {
      totalShifts: working.length,
      totalHours,
      avgHours,
      positionBreakdown,
      outletBreakdown,
      outletByMonth,
      byMonth,
      dayDist,
      workgroup: shifts[0]?.workgroup || 'Unknown',
      role: shifts[0]?.role || 'Unknown',
    };
  }, [data, employeeName]);

  const monthKeys = Object.keys(empData.byMonth).sort().slice(-6); // Show last 6 months

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 flex items-start justify-center overflow-y-auto p-4 pt-8">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-slate-700">
          <div>
            <h2 className="text-xl font-bold text-white">{employeeName}</h2>
            <p className="text-sm text-slate-400">{empData.role} &middot; {empData.workgroup}</p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-2xl leading-none px-2"
          >
            &times;
          </button>
        </div>

        <div className="p-4 sm:p-6 space-y-6">
          {/* Stats row */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-slate-800 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-white">{empData.totalShifts}</div>
              <div className="text-xs text-slate-400">Total Shifts</div>
            </div>
            <div className="bg-slate-800 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-white">{empData.totalHours.toFixed(0)}</div>
              <div className="text-xs text-slate-400">Total Hours</div>
            </div>
            <div className="bg-slate-800 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-white">{empData.avgHours.toFixed(1)}</div>
              <div className="text-xs text-slate-400">Avg Hours/Shift</div>
            </div>
          </div>

          {/* Position breakdown */}
          <div>
            <h3 className="text-sm font-semibold text-slate-300 mb-2">Position Breakdown</h3>
            <div className="space-y-1.5">
              {empData.positionBreakdown.map(([position, count]) => {
                const pct = (count / empData.totalShifts * 100);
                return (
                  <div key={position} className="flex items-center gap-2">
                    <span className="text-xs text-slate-400 w-24 shrink-0">{position}</span>
                    <div className="flex-1 bg-slate-800 rounded-full h-5 overflow-hidden">
                      <div
                        className="h-full rounded-full flex items-center px-2"
                        style={{
                          width: `${Math.max(pct, 5)}%`,
                          backgroundColor: POSITION_COLORS[position] || '#475569',
                        }}
                      >
                        <span className="text-[10px] text-white font-medium whitespace-nowrap">
                          {count} ({pct.toFixed(0)}%)
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Outlet breakdown pie chart */}
          {empData.outletBreakdown.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-slate-300 mb-2">Outlet Breakdown</h3>
              <div className="flex items-center gap-4">
                <div className="w-40 h-40 shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={empData.outletBreakdown}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={65}
                        innerRadius={30}
                      >
                        {empData.outletBreakdown.map(entry => (
                          <Cell key={entry.name} fill={OUTLET_COLORS[entry.name] || '#475569'} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                        itemStyle={{ color: '#e2e8f0' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-1 text-xs">
                  {empData.outletBreakdown.map(entry => {
                    const pct = (entry.value / empData.totalShifts * 100).toFixed(0);
                    return (
                      <div key={entry.name} className="flex items-center gap-2">
                        <span className="inline-block w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: OUTLET_COLORS[entry.name] || '#475569' }} />
                        <span className="text-slate-300">{entry.name}</span>
                        <span className="text-slate-500">{entry.value} ({pct}%)</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Outlet timeline */}
          {Object.keys(empData.outletByMonth).length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-slate-300 mb-2">Outlet Over Time</h3>
              <div className="space-y-1">
                {Object.keys(empData.outletByMonth).sort().slice(-12).map(monthKey => {
                  const [year, month] = monthKey.split('-');
                  const outlets = empData.outletByMonth[monthKey];
                  const monthTotal = Object.values(outlets).reduce((s, v) => s + v, 0);
                  return (
                    <div key={monthKey} className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-400 w-14 shrink-0">
                        {MONTHS[parseInt(month) - 1]} {year.slice(2)}
                      </span>
                      <div className="flex-1 flex h-4 rounded overflow-hidden">
                        {Object.entries(outlets).sort((a, b) => b[1] - a[1]).map(([outlet, count]) => (
                          <div
                            key={outlet}
                            className="h-full"
                            style={{
                              width: `${(count / monthTotal) * 100}%`,
                              backgroundColor: OUTLET_COLORS[outlet] || '#475569',
                            }}
                            title={`${outlet}: ${count} shifts`}
                          />
                        ))}
                      </div>
                      <span className="text-[10px] text-slate-500 w-6 text-right">{monthTotal}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Recent months mini-calendar */}
          <div>
            <h3 className="text-sm font-semibold text-slate-300 mb-2">Recent Schedule (Last 6 Months)</h3>
            <div className="space-y-3">
              {monthKeys.map(monthKey => {
                const [year, month] = monthKey.split('-');
                const shifts = empData.byMonth[monthKey];
                const firstDay = new Date(parseInt(year), parseInt(month) - 1, 1).getDay();
                const daysInMonth = new Date(parseInt(year), parseInt(month), 0).getDate();
                const shiftsByDay = {};
                shifts.forEach(s => {
                  const day = parseInt(s.date.split('/')[1]);
                  shiftsByDay[day] = s;
                });

                return (
                  <div key={monthKey}>
                    <div className="text-xs text-slate-400 mb-1">
                      {MONTHS[parseInt(month) - 1]} {year}
                    </div>
                    <div className="grid grid-cols-7 gap-0.5 text-[10px]">
                      {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                        <div key={i} className="text-center text-slate-500 py-0.5">{d}</div>
                      ))}
                      {Array.from({ length: firstDay }, (_, i) => (
                        <div key={`empty-${i}`} />
                      ))}
                      {Array.from({ length: daysInMonth }, (_, i) => {
                        const day = i + 1;
                        const shift = shiftsByDay[day];
                        const isWorking = shift?.isWorking;
                        const color = isWorking
                          ? POSITION_COLORS[shift.cleanPosition] || '#475569'
                          : 'transparent';
                        const isOff = shift && !isWorking;
                        return (
                          <div
                            key={day}
                            className={`text-center py-0.5 rounded ${
                              isWorking ? 'text-white font-medium' : isOff ? 'text-slate-600' : 'text-slate-700'
                            }`}
                            style={isWorking ? { backgroundColor: color + '99' } : {}}
                            title={shift ? `${shift.status}${isWorking ? ` - ${shift.cleanPosition} (${shift.startTime}-${shift.endTime})` : ''}` : ''}
                          >
                            {day}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Day distribution */}
          <div>
            <h3 className="text-sm font-semibold text-slate-300 mb-2">Shifts by Day of Week</h3>
            <div className="flex gap-1">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => {
                const count = empData.dayDist[day] || 0;
                const max = Math.max(...Object.values(empData.dayDist), 1);
                const height = (count / max) * 60;
                return (
                  <div key={day} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full flex items-end justify-center" style={{ height: 60 }}>
                      <div
                        className="w-full max-w-[32px] bg-blue-500 rounded-t"
                        style={{ height: Math.max(height, 2) }}
                      />
                    </div>
                    <span className="text-[10px] text-slate-400">{day}</span>
                    <span className="text-[10px] text-slate-500">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
