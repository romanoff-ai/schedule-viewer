import { useState } from 'react';
import { POSITION_COLORS } from '../utils/dataProcessing';
import { SCHEDULABLE_POSITIONS } from '../utils/schedulerUtils';

const MEDAL_COLORS = {
  0: { bg: 'bg-yellow-900/40', text: 'text-yellow-400', border: 'border-yellow-700', label: '🥇' },
  1: { bg: 'bg-slate-600/40', text: 'text-slate-300', border: 'border-slate-500', label: '🥈' },
  2: { bg: 'bg-amber-900/40', text: 'text-amber-600', border: 'border-amber-800', label: '🥉' },
};

export default function PositionRankings({ rankings, onChange, employeeNames }) {
  const [expandedPosition, setExpandedPosition] = useState(null);

  const moveEmployee = (position, index, direction) => {
    const list = [...(rankings[position] || [])];
    const newIdx = index + direction;
    if (newIdx < 0 || newIdx >= list.length) return;
    [list[index], list[newIdx]] = [list[newIdx], list[index]];
    onChange({ ...rankings, [position]: list });
  };

  const addEmployee = (position, name) => {
    const list = [...(rankings[position] || [])];
    if (!list.includes(name)) {
      list.push(name);
      onChange({ ...rankings, [position]: list });
    }
  };

  const removeEmployee = (position, name) => {
    const list = (rankings[position] || []).filter(n => n !== name);
    onChange({ ...rankings, [position]: list });
  };

  const addAllEmployees = (position) => {
    const current = rankings[position] || [];
    const unranked = employeeNames.filter(n => !current.includes(n));
    onChange({ ...rankings, [position]: [...current, ...unranked] });
  };

  const clearRankings = (position) => {
    onChange({ ...rankings, [position]: [] });
  };

  return (
    <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Position Rankings</h2>
          <p className="text-xs text-slate-400 mt-1">
            Rank employees per position. #1 = most likely to be scheduled there.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {SCHEDULABLE_POSITIONS.map(position => {
          const ranked = rankings[position] || [];
          const unranked = employeeNames.filter(n => !ranked.includes(n));
          const isOpen = expandedPosition === position;
          const posColor = POSITION_COLORS[position] || '#6366f1';

          return (
            <div key={position} className="border border-slate-700 rounded-lg overflow-hidden">
              {/* Header */}
              <button
                onClick={() => setExpandedPosition(isOpen ? null : position)}
                className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-slate-700/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: posColor }}
                  />
                  <span className="text-white font-medium">{position}</span>
                  <span className="text-xs text-slate-500">
                    {ranked.length} ranked
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  {/* Preview top 3 */}
                  <div className="flex gap-1 flex-wrap">
                    {ranked.slice(0, 3).map((name, idx) => {
                      const medal = MEDAL_COLORS[idx];
                      return (
                        <span
                          key={name}
                          className={`text-xs px-2 py-0.5 rounded border ${medal.bg} ${medal.text} ${medal.border}`}
                        >
                          #{idx + 1} {name}
                        </span>
                      );
                    })}
                  </div>
                  <svg
                    className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>

              {/* Expanded Content */}
              {isOpen && (
                <div className="px-4 pb-4 border-t border-slate-700">
                  {/* Action buttons */}
                  <div className="flex gap-2 mt-3 mb-3">
                    <button
                      onClick={() => addAllEmployees(position)}
                      className="text-xs px-3 py-1.5 rounded bg-blue-600/20 text-blue-400 border border-blue-700 hover:bg-blue-600/30 transition-colors"
                    >
                      + Add All
                    </button>
                    <button
                      onClick={() => clearRankings(position)}
                      className="text-xs px-3 py-1.5 rounded bg-red-900/20 text-red-400 border border-red-800 hover:bg-red-900/30 transition-colors"
                    >
                      Clear All
                    </button>
                  </div>

                  {/* Ranked List */}
                  {ranked.length > 0 ? (
                    <div className="space-y-1 mb-3">
                      {ranked.map((name, idx) => {
                        const medal = MEDAL_COLORS[idx];
                        const rankNum = idx + 1;
                        return (
                          <div
                            key={name}
                            className="flex items-center gap-2 bg-slate-900/50 rounded px-3 py-2"
                          >
                            <span
                              className={`text-xs font-bold w-7 text-center rounded py-0.5 ${
                                medal
                                  ? `${medal.bg} ${medal.text}`
                                  : 'bg-slate-700 text-slate-400'
                              }`}
                            >
                              #{rankNum}
                            </span>
                            <span className="text-sm text-white flex-1">{name}</span>
                            <button
                              onClick={() => moveEmployee(position, idx, -1)}
                              disabled={idx === 0}
                              className="text-slate-500 hover:text-white disabled:opacity-30 text-xs"
                            >
                              ▲
                            </button>
                            <button
                              onClick={() => moveEmployee(position, idx, 1)}
                              disabled={idx === ranked.length - 1}
                              className="text-slate-500 hover:text-white disabled:opacity-30 text-xs"
                            >
                              ▼
                            </button>
                            <button
                              onClick={() => removeEmployee(position, name)}
                              className="text-red-400 hover:text-red-300 text-xs ml-1"
                            >
                              ✕
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 mb-3 italic">
                      No employees ranked yet. Add employees below.
                    </p>
                  )}

                  {/* Unranked Employees */}
                  {unranked.length > 0 && (
                    <div>
                      <label className="text-xs text-slate-500 block mb-2">
                        Unranked ({unranked.length})
                      </label>
                      <div className="flex flex-wrap gap-1">
                        {unranked.sort().map(name => (
                          <button
                            key={name}
                            onClick={() => addEmployee(position, name)}
                            className="text-xs px-2 py-1 rounded border border-slate-600 text-slate-400 hover:border-slate-400 hover:text-white transition-colors"
                          >
                            + {name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
