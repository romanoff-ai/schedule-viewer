import { useState, useRef } from 'react';
import { POSITION_COLORS } from '../utils/dataProcessing';
import { DAYS } from '../utils/schedulerUtils';

export default function ScheduleGrid({ schedule, preferences, onScheduleChange }) {
  const [dragItem, setDragItem] = useState(null);
  const dragOverRef = useRef(null);

  if (!schedule || Object.keys(schedule).length === 0) {
    return (
      <div className="bg-slate-800 rounded-xl p-8 border border-slate-700 text-center">
        <p className="text-slate-400">No schedule generated yet. Click "Generate Schedule" to create one.</p>
      </div>
    );
  }

  // Build employee-centric view
  const employees = new Set();
  const unassigned = [];
  for (const day of DAYS) {
    for (const a of (schedule[day] || [])) {
      if (a.employee) employees.add(a.employee);
      else unassigned.push(a);
    }
  }
  const sortedEmployees = [...employees].sort();

  // Build lookup: day → employee → assignment
  const lookup = {};
  for (const day of DAYS) {
    lookup[day] = {};
    for (const a of (schedule[day] || [])) {
      if (a.employee) {
        lookup[day][a.employee] = a;
      }
    }
  }

  // Detect conflicts
  const conflicts = detectConflicts(schedule, preferences);

  const handleDragStart = (day, employee) => {
    setDragItem({ day, employee });
  };

  const handleDragOver = (e, day, employee) => {
    e.preventDefault();
    dragOverRef.current = { day, employee };
  };

  const handleDrop = (e, targetDay, targetEmployee) => {
    e.preventDefault();
    if (!dragItem || !onScheduleChange) return;
    if (dragItem.day !== targetDay) return; // Only swap within same day

    const srcAssignment = lookup[dragItem.day]?.[dragItem.employee];
    const dstAssignment = lookup[targetDay]?.[targetEmployee];

    if (!srcAssignment) return;

    const newSchedule = { ...schedule };
    const dayAssignments = [...newSchedule[targetDay]];

    // Swap the employees between the two assignments
    const srcIdx = dayAssignments.findIndex(
      a => a.employee === dragItem.employee && a.position === srcAssignment.position
    );
    const dstIdx = dstAssignment
      ? dayAssignments.findIndex(a => a.employee === targetEmployee && a.position === dstAssignment.position)
      : -1;

    if (srcIdx >= 0 && dstIdx >= 0) {
      // Swap positions
      const tmpPos = dayAssignments[srcIdx].position;
      const tmpTime = dayAssignments[srcIdx].time;
      dayAssignments[srcIdx] = { ...dayAssignments[srcIdx], position: dayAssignments[dstIdx].position, time: dayAssignments[dstIdx].time };
      dayAssignments[dstIdx] = { ...dayAssignments[dstIdx], position: tmpPos, time: tmpTime };
    }

    newSchedule[targetDay] = dayAssignments;
    onScheduleChange(newSchedule);
    setDragItem(null);
  };

  const copyToClipboard = () => {
    let text = '';
    for (const day of DAYS) {
      const assignments = schedule[day] || [];
      if (assignments.length === 0) continue;
      const dateStr = assignments[0]?.date || day;
      text += `${day} (${dateStr})\n`;
      for (const a of assignments) {
        text += `  ${a.position}: ${a.employee || 'UNASSIGNED'} ${a.time}\n`;
      }
      text += '\n';
    }
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700">
      <div className="flex items-center justify-between p-4 border-b border-slate-700">
        <h2 className="text-lg font-semibold text-white">Weekly Schedule</h2>
        <button
          onClick={copyToClipboard}
          className="text-xs bg-slate-700 text-slate-300 px-3 py-1.5 rounded hover:bg-slate-600 transition-colors"
        >
          Copy to Clipboard
        </button>
      </div>

      {/* Conflict Warnings */}
      {conflicts.length > 0 && (
        <div className="px-4 py-2 border-b border-slate-700">
          {conflicts.map((c, i) => (
            <div key={i} className="flex items-center gap-2 text-xs text-amber-400 py-0.5">
              <span>⚠</span>
              <span>{c}</span>
            </div>
          ))}
        </div>
      )}

      {/* Schedule Grid */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="text-left text-slate-400 font-medium py-3 px-4 w-36 sticky left-0 bg-slate-800 z-10">Employee</th>
              {DAYS.map(day => {
                const dayAssignments = schedule[day] || [];
                const date = dayAssignments[0]?.date || '';
                return (
                  <th key={day} className="text-center text-slate-400 font-medium py-3 px-2 min-w-[120px]">
                    <div>{day}</div>
                    {date && <div className="text-xs text-slate-500 font-normal">{date}</div>}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sortedEmployees.map(emp => (
              <tr key={emp} className="border-t border-slate-700/50 hover:bg-slate-700/20">
                <td className="py-2 px-4 sticky left-0 bg-slate-800 z-10">
                  <span className="text-white text-xs font-medium">{emp.split(' ')[0]}</span>
                </td>
                {DAYS.map(day => {
                  const assignment = lookup[day]?.[emp];
                  return (
                    <td
                      key={day}
                      className="py-1 px-1 text-center"
                      draggable={!!assignment}
                      onDragStart={() => handleDragStart(day, emp)}
                      onDragOver={(e) => handleDragOver(e, day, emp)}
                      onDrop={(e) => handleDrop(e, day, emp)}
                    >
                      {assignment ? (
                        <div
                          className="rounded px-2 py-1.5 cursor-grab active:cursor-grabbing mx-auto"
                          style={{
                            backgroundColor: (POSITION_COLORS[assignment.position] || '#475569') + '20',
                            borderLeft: `3px solid ${POSITION_COLORS[assignment.position] || '#475569'}`,
                          }}
                        >
                          <div className="text-xs font-medium" style={{ color: POSITION_COLORS[assignment.position] }}>
                            {assignment.position}
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5">{assignment.time}</div>
                        </div>
                      ) : (
                        <div className="text-slate-700 text-xs py-2">—</div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}

            {/* Unassigned Slots */}
            {unassigned.length > 0 && (
              <tr className="border-t-2 border-red-900/50">
                <td className="py-2 px-4 sticky left-0 bg-slate-800 z-10">
                  <span className="text-red-400 text-xs font-medium">Unassigned</span>
                </td>
                {DAYS.map(day => {
                  const dayUnassigned = (schedule[day] || []).filter(a => !a.employee);
                  return (
                    <td key={day} className="py-1 px-1 text-center">
                      {dayUnassigned.map((a, i) => (
                        <div
                          key={i}
                          className="rounded px-2 py-1.5 mx-auto mb-1 bg-red-900/20 border-l-3"
                          style={{ borderLeft: '3px solid #ef4444' }}
                        >
                          <div className="text-xs text-red-400 font-medium">{a.position}</div>
                          <div className="text-[10px] text-red-500/60">{a.time}</div>
                        </div>
                      ))}
                    </td>
                  );
                })}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function detectConflicts(schedule, preferences) {
  const warnings = [];
  const weekShifts = {};

  for (const day of DAYS) {
    for (const a of (schedule[day] || [])) {
      if (!a.employee) continue;
      weekShifts[a.employee] = (weekShifts[a.employee] || 0) + 1;

      const pref = preferences[a.employee];
      if (pref && pref.preferredDaysOff.includes(day)) {
        warnings.push(`${a.employee} is scheduled on ${day} (requested day off)`);
      }
    }
  }

  for (const [name, count] of Object.entries(weekShifts)) {
    const pref = preferences[name];
    if (pref && count > pref.maxShiftsPerWeek) {
      warnings.push(`${name} has ${count} shifts (max: ${pref.maxShiftsPerWeek})`);
    }
  }

  return warnings;
}
