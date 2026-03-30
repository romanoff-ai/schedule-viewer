import { useState, useMemo, useRef, useCallback } from 'react';
import { getFormerEmployees } from '../utils/dataProcessing';

// ---------- helpers ----------

const REQ_OFF_PATTERNS = ['req. off', 'req off', 'rto', 'r/off', 'offpsnl', 'offvac', 'req off'];

export function isRequestOff(record) {
  const s = (record.schedule || '').trim().toLowerCase();
  return REQ_OFF_PATTERNS.some(p => s.startsWith(p) || s.includes('\n' + p));
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function parseDate(dateStr) {
  const [m, d, y] = dateStr.split('/').map(Number);
  return new Date(y, m - 1, d);
}

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

// ---------- component ----------

export default function RequestOffsPage({ data }) {
  const [sortField, setSortField] = useState('total');
  const [sortDir, setSortDir] = useState('desc');
  const [selectedYear, setSelectedYear] = useState('all');
  const [heatmapEmployee, setHeatmapEmployee] = useState('all');
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [hideFormer, setHideFormer] = useState(true);
  const [hoveredCell, setHoveredCell] = useState(null); // { monthIdx, day, x, y, rect }
  const heatmapRef = useRef(null);

  const formerEmployees = useMemo(() => getFormerEmployees(data), [data]);

  // filter out former employees if toggle is on
  const activeData = useMemo(() => {
    if (!hideFormer) return data;
    return data.filter(r => !formerEmployees.has(r.name));
  }, [data, hideFormer, formerEmployees]);

  // all req-off records
  const reqOffRecords = useMemo(() => activeData.filter(isRequestOff), [activeData]);

  // available years
  const years = useMemo(() => {
    const ys = new Set(reqOffRecords.map(r => parseDate(r.date).getFullYear()));
    return Array.from(ys).sort();
  }, [reqOffRecords]);

  // all employees (from full dataset)
  const allEmployees = useMemo(() => {
    const names = [...new Set(activeData.map(r => r.name))].sort();
    return names;
  }, [activeData]);

  // ---- Frequency table data ----
  const tableData = useMemo(() => {
    const employees = [...new Set(data.map(r => r.name))];
    return employees.map(name => {
      const empAll = data.filter(r => r.name === name);
      const empReqOff = reqOffRecords.filter(r => r.name === name);
      const total = empReqOff.length;
      const totalShifts = empAll.length;
      const pct = totalShifts > 0 ? ((total / totalShifts) * 100).toFixed(1) : '0.0';

      // months with activity
      const months = new Set(empAll.map(r => {
        const d = parseDate(r.date);
        return `${d.getFullYear()}-${d.getMonth()}`;
      }));
      const avgPerMonth = months.size > 0 ? (total / months.size).toFixed(2) : '0.00';

      // most common dow
      const dowCounts = {};
      empReqOff.forEach(r => {
        const d = parseDate(r.date);
        const dow = DOW[d.getDay()];
        dowCounts[dow] = (dowCounts[dow] || 0) + 1;
      });
      const topDow = Object.keys(dowCounts).sort((a, b) => dowCounts[b] - dowCounts[a])[0] || '—';

      return { name, total, avgPerMonth: parseFloat(avgPerMonth), topDow, pct: parseFloat(pct), totalShifts };
    }).filter(e => e.total > 0 || e.totalShifts > 0);
  }, [data, reqOffRecords]);

  const sortedTable = useMemo(() => {
    return [...tableData].sort((a, b) => {
      let av = a[sortField], bv = b[sortField];
      if (typeof av === 'string') av = av.toLowerCase(), bv = bv.toLowerCase();
      return sortDir === 'asc' ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
    });
  }, [tableData, sortField, sortDir]);

  function handleSort(field) {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('desc'); }
  }

  // ---- Heat map data ----
  const heatmapData = useMemo(() => {
    let records = reqOffRecords;
    if (selectedYear !== 'all') records = records.filter(r => parseDate(r.date).getFullYear() === parseInt(selectedYear));
    if (heatmapEmployee !== 'all') records = records.filter(r => r.name === heatmapEmployee);

    // Build [month][day] = count
    const grid = {};
    records.forEach(r => {
      const d = parseDate(r.date);
      const m = d.getMonth();      // 0-11
      const day = d.getDate();     // 1-31
      if (!grid[m]) grid[m] = {};
      grid[m][day] = (grid[m][day] || 0) + 1;
    });
    return grid;
  }, [reqOffRecords, selectedYear, heatmapEmployee]);

  const heatmapMax = useMemo(() => {
    let max = 0;
    Object.values(heatmapData).forEach(m => Object.values(m).forEach(v => { if (v > max) max = v; }));
    return max || 1;
  }, [heatmapData]);

  // Full records for the hovered cell (for tooltip)
  const hoveredRecords = useMemo(() => {
    if (!hoveredCell) return [];
    let records = reqOffRecords;
    if (selectedYear !== 'all') records = records.filter(r => parseDate(r.date).getFullYear() === parseInt(selectedYear));
    if (heatmapEmployee !== 'all') records = records.filter(r => r.name === heatmapEmployee);
    return records.filter(r => {
      const d = parseDate(r.date);
      return d.getMonth() === hoveredCell.monthIdx && d.getDate() === hoveredCell.day;
    });
  }, [hoveredCell, reqOffRecords, selectedYear, heatmapEmployee]);

  function heatColor(count) {
    if (!count) return 'bg-slate-800 text-slate-700';
    if (count === 1) return 'bg-blue-950 text-blue-300';
    if (count === 2) return 'bg-blue-800 text-blue-200';
    if (count === 3) return 'bg-blue-600 text-white';
    if (count === 4) return 'bg-blue-500 text-white';
    return 'bg-blue-400 text-slate-900 font-bold';
  }

  // ---- Per-employee timeline ----
  const employeeTimeline = useMemo(() => {
    if (!selectedEmployee) return null;
    const records = reqOffRecords
      .filter(r => r.name === selectedEmployee)
      .map(r => {
        const d = parseDate(r.date);
        return { date: r.date, parsedDate: d, dow: DOW[d.getDay()], month: d.getMonth(), year: d.getFullYear() };
      })
      .sort((a, b) => a.parsedDate - b.parsedDate);

    // DOW breakdown
    const dowBreakdown = {};
    records.forEach(r => { dowBreakdown[r.dow] = (dowBreakdown[r.dow] || 0) + 1; });

    // Month breakdown
    const monthBreakdown = {};
    records.forEach(r => {
      const key = MONTHS[r.month];
      monthBreakdown[key] = (monthBreakdown[key] || 0) + 1;
    });

    return { records, dowBreakdown, monthBreakdown };
  }, [selectedEmployee, reqOffRecords]);

  const SortIcon = ({ field }) => {
    if (sortField !== field) return <span className="text-slate-600 ml-1">↕</span>;
    return <span className="text-blue-400 ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>;
  };

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">

      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Request Offs</h1>
          <p className="text-slate-400 text-sm mt-1">
            {reqOffRecords.length} total request-offs across {allEmployees.length} employees
          </p>
          {formerEmployees.size > 0 && (
            <label className="flex items-center gap-2 cursor-pointer text-slate-400 text-sm mt-2">
              <input
                type="checkbox"
                checked={hideFormer}
                onChange={e => setHideFormer(e.target.checked)}
                className="rounded"
              />
              Hide former employees ({[...formerEmployees].join(', ')})
            </label>
          )}
        </div>
        <div className="bg-slate-800 rounded-xl px-4 py-2 text-center">
          <div className="text-3xl font-bold text-blue-400">{reqOffRecords.length}</div>
          <div className="text-xs text-slate-400">All-Time Req. Offs</div>
        </div>
      </div>

      {/* ===== FREQUENCY TABLE ===== */}
      <div className="bg-slate-800 rounded-xl border border-slate-700">
        <div className="px-6 py-4 border-b border-slate-700">
          <h2 className="text-lg font-semibold text-white">Request-Off Frequency by Employee</h2>
          <p className="text-slate-400 text-sm">Click a column header to sort · Click an employee to see their timeline</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-400 text-xs uppercase">
                <th className="px-4 py-3 text-left cursor-pointer hover:text-white" onClick={() => handleSort('name')}>
                  Employee <SortIcon field="name" />
                </th>
                <th className="px-4 py-3 text-center cursor-pointer hover:text-white" onClick={() => handleSort('total')}>
                  Total Req. Offs <SortIcon field="total" />
                </th>
                <th className="px-4 py-3 text-center cursor-pointer hover:text-white" onClick={() => handleSort('avgPerMonth')}>
                  Avg / Month <SortIcon field="avgPerMonth" />
                </th>
                <th className="px-4 py-3 text-center cursor-pointer hover:text-white" onClick={() => handleSort('topDow')}>
                  Top Day <SortIcon field="topDow" />
                </th>
                <th className="px-4 py-3 text-center cursor-pointer hover:text-white" onClick={() => handleSort('pct')}>
                  % of Schedule <SortIcon field="pct" />
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedTable.map((emp, i) => (
                <tr
                  key={emp.name}
                  className={`border-t border-slate-700 cursor-pointer transition-colors ${
                    selectedEmployee === emp.name ? 'bg-blue-900/30' : i % 2 === 0 ? 'bg-slate-800 hover:bg-slate-750' : 'bg-slate-800/50 hover:bg-slate-750'
                  }`}
                  onClick={() => setSelectedEmployee(selectedEmployee === emp.name ? null : emp.name)}
                >
                  <td className="px-4 py-3 font-medium text-blue-400 hover:text-blue-300">{emp.name}</td>
                  <td className="px-4 py-3 text-center text-white font-semibold">{emp.total}</td>
                  <td className="px-4 py-3 text-center text-slate-300">{emp.avgPerMonth}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="px-2 py-0.5 rounded-full text-xs bg-slate-700 text-slate-300">{emp.topDow}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-16 bg-slate-700 rounded-full h-1.5">
                        <div
                          className="bg-blue-500 h-1.5 rounded-full"
                          style={{ width: `${Math.min(emp.pct * 2, 100)}%` }}
                        />
                      </div>
                      <span className="text-slate-300 text-xs w-10">{emp.pct}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ===== PER-EMPLOYEE TIMELINE (inline below table) ===== */}
      {selectedEmployee && employeeTimeline && (
        <div className="bg-slate-800 rounded-xl border border-blue-700">
          <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">{selectedEmployee} — Request-Off Timeline</h2>
              <p className="text-slate-400 text-sm">{employeeTimeline.records.length} total request-offs</p>
            </div>
            <button
              onClick={() => setSelectedEmployee(null)}
              className="text-slate-400 hover:text-white text-sm px-3 py-1 rounded bg-slate-700 hover:bg-slate-600"
            >
              Close ✕
            </button>
          </div>

          <div className="p-6 space-y-6">
            {/* Day of week breakdown */}
            <div>
              <h3 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wide">By Day of Week</h3>
              <div className="flex gap-3 flex-wrap">
                {DOW.map(d => {
                  const count = employeeTimeline.dowBreakdown[d] || 0;
                  const isTop = count === Math.max(...Object.values(employeeTimeline.dowBreakdown));
                  return (
                    <div key={d} className={`flex flex-col items-center px-3 py-2 rounded-lg ${isTop && count > 0 ? 'bg-blue-600' : 'bg-slate-700'}`}>
                      <span className="text-xs text-slate-400">{d}</span>
                      <span className={`text-xl font-bold ${isTop && count > 0 ? 'text-white' : 'text-slate-300'}`}>{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Month breakdown */}
            <div>
              <h3 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wide">By Month</h3>
              <div className="flex gap-2 flex-wrap">
                {MONTHS.map(m => {
                  const count = employeeTimeline.monthBreakdown[m] || 0;
                  const maxMonth = Math.max(...Object.values(employeeTimeline.monthBreakdown), 1);
                  return (
                    <div key={m} className="flex flex-col items-center bg-slate-700 rounded-lg px-2 py-2 min-w-[3rem]">
                      <span className="text-xs text-slate-400">{m}</span>
                      <div
                        className="w-full mt-1 rounded-sm bg-blue-500"
                        style={{ height: `${Math.max((count / maxMonth) * 40, count > 0 ? 4 : 0)}px` }}
                      />
                      <span className="text-xs text-slate-300 mt-1">{count || '—'}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Date list */}
            <div>
              <h3 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wide">All Dates</h3>
              <div className="flex gap-2 flex-wrap max-h-40 overflow-y-auto pr-1">
                {employeeTimeline.records.map((r, i) => (
                  <span
                    key={i}
                    className="px-2 py-1 rounded text-xs bg-slate-700 text-slate-300 font-mono whitespace-nowrap"
                  >
                    {r.date} <span className="text-slate-500">{r.dow}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== ANNUAL HEAT MAP ===== */}
      <div className="bg-slate-800 rounded-xl border border-slate-700">
        <div className="px-6 py-4 border-b border-slate-700 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-white">Annual Request-Off Heat Map</h2>
            <p className="text-slate-400 text-sm">Color intensity = number of employees who requested off that day</p>
          </div>
          <div className="flex gap-3">
            <select
              className="bg-slate-700 text-white text-sm rounded-lg px-3 py-2 border border-slate-600 focus:outline-none focus:border-blue-500"
              value={selectedYear}
              onChange={e => setSelectedYear(e.target.value)}
            >
              <option value="all">All Years</option>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <select
              className="bg-slate-700 text-white text-sm rounded-lg px-3 py-2 border border-slate-600 focus:outline-none focus:border-blue-500"
              value={heatmapEmployee}
              onChange={e => setHeatmapEmployee(e.target.value)}
            >
              <option value="all">All Employees</option>
              {allEmployees.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>
        </div>

        <div className="p-4 overflow-x-auto relative" ref={heatmapRef} onClick={e => {
          // dismiss popup when clicking outside a cell
          if (e.target === heatmapRef.current || e.target.closest('[data-heatcell]') === null) {
            setHoveredCell(null);
          }
        }}>
          {/* Legend */}
          <div className="flex items-center gap-2 mb-4 text-xs text-slate-400">
            <span>Low</span>
            <div className="flex gap-0.5">
              {[0, 1, 2, 3, 4, 5].map(v => (
                <div
                  key={v}
                  className={`w-5 h-4 rounded-sm ${
                    v === 0 ? 'bg-slate-800 border border-slate-700' :
                    v === 1 ? 'bg-blue-950' :
                    v === 2 ? 'bg-blue-800' :
                    v === 3 ? 'bg-blue-600' :
                    v === 4 ? 'bg-blue-500' : 'bg-blue-400'
                  }`}
                />
              ))}
            </div>
            <span>High</span>
            {heatmapMax > 0 && <span className="ml-2 text-slate-500">(max: {heatmapMax} employees)</span>}
          </div>

          <div className="min-w-max">
            {/* Month headers */}
            <div className="flex">
              <div className="w-8 shrink-0" />
              {MONTHS.map(m => (
                <div key={m} className="w-9 text-center text-xs text-slate-400 font-medium pb-1">{m}</div>
              ))}
            </div>

            {/* Day rows 1-31 */}
            {Array.from({ length: 31 }, (_, i) => i + 1).map(day => (
              <div key={day} className="flex items-center mb-0.5">
                <div className="w-8 shrink-0 text-xs text-slate-500 text-right pr-1">{day}</div>
                {MONTHS.map((m, mi) => {
                  // Check if day is valid for this month (use non-leap year for "all years")
                  const daysInMonth = getDaysInMonth(selectedYear !== 'all' ? parseInt(selectedYear) : 2024, mi);
                  if (day > daysInMonth) {
                    return <div key={m} className="w-9 h-6 mx-0.5" />;
                  }
                  const count = (heatmapData[mi] || {})[day] || 0;
                  const isHovered = hoveredCell && hoveredCell.monthIdx === mi && hoveredCell.day === day;
                  return (
                    <div
                      key={m}
                      data-heatcell="1"
                      onMouseEnter={count > 0 ? (e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const containerRect = heatmapRef.current.getBoundingClientRect();
                        setHoveredCell({ monthIdx: mi, day, cellRect: rect, containerRect });
                      } : undefined}
                      onMouseLeave={count > 0 ? () => setHoveredCell(null) : undefined}
                      onClick={count > 0 ? (e) => {
                        e.stopPropagation();
                        const rect = e.currentTarget.getBoundingClientRect();
                        const containerRect = heatmapRef.current.getBoundingClientRect();
                        setHoveredCell(prev =>
                          prev && prev.monthIdx === mi && prev.day === day
                            ? null
                            : { monthIdx: mi, day, cellRect: rect, containerRect }
                        );
                      } : undefined}
                      className={`w-8 h-6 mx-0.5 rounded-sm text-xs flex items-center justify-center transition-all select-none ${
                        count > 0 ? 'cursor-pointer' : 'cursor-default'
                      } ${isHovered ? 'ring-1 ring-white ring-offset-1 ring-offset-slate-900 scale-110 z-10' : ''} ${heatColor(count)}`}
                    >
                      {count > 0 ? count : ''}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Rich tooltip popup */}
          {hoveredCell && hoveredRecords.length > 0 && (() => {
            const { cellRect, containerRect } = hoveredCell;
            // Position relative to container
            const cellLeft = cellRect.left - containerRect.left;
            const cellTop = cellRect.top - containerRect.top;

            // Try to place to the right; flip left if near right edge
            const popupWidth = 260;
            const popupLeft = cellLeft + cellRect.width + 6 + containerRect.scrollLeft;
            const flipLeft = cellLeft + popupWidth + cellRect.width + 6 > containerRect.width;
            const left = flipLeft
              ? Math.max(0, cellLeft - popupWidth - 4)
              : popupLeft;

            const top = Math.max(0, cellTop - 8);

            const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
            const dateLabel = (() => {
              const year = selectedYear !== 'all'
                ? parseInt(selectedYear)
                : parseDate(hoveredRecords[0].date).getFullYear();
              return `${monthNames[hoveredCell.monthIdx]} ${hoveredCell.day}, ${year}`;
            })();

            return (
              <div
                data-heatcell="1"
                style={{ position: 'absolute', left, top, width: popupWidth, zIndex: 50 }}
                className="bg-slate-900 border border-slate-600 rounded-xl shadow-2xl p-3 pointer-events-none"
              >
                <div className="text-white font-semibold text-sm mb-1">{dateLabel}</div>
                <div className="text-blue-400 text-xs mb-2">{hoveredRecords.length} request{hoveredRecords.length !== 1 ? 's' : ''} off</div>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {hoveredRecords.map((r, i) => (
                    <div key={i} className="flex flex-col bg-slate-800 rounded-lg px-2 py-1.5">
                      <span className="text-white text-xs font-medium">{r.name}</span>
                      <div className="flex items-center justify-between mt-0.5">
                        <span className="text-slate-400 text-xs truncate max-w-[120px]">{r.outlet || r.workgroup || '—'}</span>
                        <span className="text-blue-300 text-xs font-mono ml-1 shrink-0">{(r.schedule || '').split('\n')[0]}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      </div>

    </main>
  );
}
