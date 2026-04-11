import { useState } from 'react';
import { POSITION_COLORS } from '../utils/dataProcessing';
import { SCHEDULABLE_POSITIONS } from '../utils/schedulerUtils';

const MEDAL_COLORS = {
  0: { bg: 'bg-yellow-900/40', text: 'text-yellow-400', border: 'border-yellow-700', label: '🥇' },
  1: { bg: 'bg-slate-600/40', text: 'text-slate-300', border: 'border-slate-500', label: '🥈' },
  2: { bg: 'bg-amber-900/40', text: 'text-amber-600', border: 'border-amber-800', label: '🥉' },
};

const WORKGROUP_STYLES = {
  'Peacock Bar':        { bg: 'bg-blue-500/20',   border: 'border-blue-500/50',   text: 'text-blue-300',   dot: 'bg-blue-400' },
  'Goldies Mixologist': { bg: 'bg-amber-500/20',  border: 'border-amber-500/50',  text: 'text-amber-300',  dot: 'bg-amber-400' },
  'Quill Room':         { bg: 'bg-purple-500/20', border: 'border-purple-500/50', text: 'text-purple-300', dot: 'bg-purple-400' },
  'Banquet Bartenders': { bg: 'bg-green-500/20',  border: 'border-green-500/50',  text: 'text-green-300',  dot: 'bg-green-400' },
  'Peacock Barback':    { bg: 'bg-orange-500/20', border: 'border-orange-500/50', text: 'text-orange-300', dot: 'bg-orange-400' },
};

const DEFAULT_STYLE = { bg: '', border: 'border-slate-600', text: 'text-slate-400', dot: 'bg-slate-500' };

function getWgStyle(workgroup) {
  if (!workgroup) return DEFAULT_STYLE;
  // Try exact match first, then partial
  if (WORKGROUP_STYLES[workgroup]) return WORKGROUP_STYLES[workgroup];
  const lower = workgroup.toLowerCase();
  if (lower.includes('barback')) return WORKGROUP_STYLES['Peacock Barback'];
  if (lower.includes('banquet')) return WORKGROUP_STYLES['Banquet Bartenders'];
  return DEFAULT_STYLE;
}

// Legend items — only show workgroups that actually appear
const LEGEND_ORDER = ['Peacock Bar', 'Goldies Mixologist', 'Quill Room', 'Banquet Bartenders', 'Peacock Barback'];

export default function PositionRankings({ rankings, onChange, employeeNames, employeeWorkgroups = {} }) {
  const [expandedPosition, setExpandedPosition] = useState(null);
  const [viewModes, setViewModes] = useState({}); // position → 'all' | 'byJob'
  const [collapsedGroups, setCollapsedGroups] = useState({}); // 'position|workgroup' → bool

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

  const toggleGroupCollapse = (key) => {
    setCollapsedGroups(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const renderUnrankedBubble = (name, position) => {
    const wg = employeeWorkgroups[name];
    const style = getWgStyle(wg);
    return (
      <button
        key={name}
        onClick={() => addEmployee(position, name)}
        className={`text-xs px-2 py-1 rounded border ${style.border} ${style.text} ${style.bg} hover:brightness-125 transition-colors flex items-center gap-1.5`}
      >
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${style.dot}`} />
        + {name}
      </button>
    );
  };

  const renderUnrankedSection = (unranked, position) => {
    const mode = viewModes[position] || 'all';

    // Group by workgroup for counts + byJob view
    const grouped = {};
    unranked.forEach(name => {
      const wg = employeeWorkgroups[name] || 'Other';
      if (!grouped[wg]) grouped[wg] = [];
      grouped[wg].push(name);
    });
    // Sort each group
    Object.values(grouped).forEach(arr => arr.sort());

    // Which legend items are present?
    const presentWgs = LEGEND_ORDER.filter(wg => grouped[wg] && grouped[wg].length > 0);
    const hasOther = Object.keys(grouped).some(wg => !LEGEND_ORDER.includes(wg));

    return (
      <div>
        {/* Header with toggle */}
        <div className="flex items-center gap-3 mb-2">
          <label className="text-xs text-slate-500">
            Unranked ({unranked.length})
          </label>
          <div className="flex rounded-md overflow-hidden border border-slate-600">
            <button
              onClick={() => setViewModes(prev => ({ ...prev, [position]: 'all' }))}
              className={`text-[10px] px-2 py-0.5 transition-colors ${
                mode === 'all'
                  ? 'bg-slate-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-300'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setViewModes(prev => ({ ...prev, [position]: 'byJob' }))}
              className={`text-[10px] px-2 py-0.5 transition-colors border-l border-slate-600 ${
                mode === 'byJob'
                  ? 'bg-slate-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-300'
              }`}
            >
              By Job Code
            </button>
          </div>
        </div>

        {mode === 'all' ? (
          <>
            {/* Legend */}
            {presentWgs.length > 0 && (
              <div className="flex flex-wrap gap-x-3 gap-y-1 mb-2">
                {presentWgs.map(wg => {
                  const s = WORKGROUP_STYLES[wg];
                  return (
                    <span key={wg} className="flex items-center gap-1 text-[10px] text-slate-400">
                      <span className={`w-2 h-2 rounded-full ${s.dot}`} />
                      {wg}
                    </span>
                  );
                })}
                {hasOther && (
                  <span className="flex items-center gap-1 text-[10px] text-slate-400">
                    <span className="w-2 h-2 rounded-full bg-slate-500" />
                    Other
                  </span>
                )}
              </div>
            )}
            <div className="flex flex-wrap gap-1">
              {unranked.sort().map(name => renderUnrankedBubble(name, position))}
            </div>
          </>
        ) : (
          /* By Job Code view */
          <div className="space-y-2">
            {[...LEGEND_ORDER, ...Object.keys(grouped).filter(wg => !LEGEND_ORDER.includes(wg)).sort()].map(wg => {
              const members = grouped[wg];
              if (!members || members.length === 0) return null;
              const collapseKey = `${position}|${wg}`;
              const isCollapsed = collapsedGroups[collapseKey];
              const style = getWgStyle(wg);
              return (
                <div key={wg} className={`rounded-lg border ${style.border} overflow-hidden`}>
                  <button
                    onClick={() => toggleGroupCollapse(collapseKey)}
                    className={`w-full px-3 py-2 flex items-center justify-between text-left ${style.bg} hover:brightness-110 transition-colors`}
                  >
                    <span className={`text-xs font-medium ${style.text} flex items-center gap-2`}>
                      <span className={`w-2 h-2 rounded-full ${style.dot}`} />
                      {wg} ({members.length})
                    </span>
                    <svg
                      className={`w-3 h-3 ${style.text} transition-transform ${isCollapsed ? '' : 'rotate-180'}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {!isCollapsed && (
                    <div className="px-3 py-2 flex flex-wrap gap-1">
                      {members.map(name => renderUnrankedBubble(name, position))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
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
                  {unranked.length > 0 && renderUnrankedSection(unranked, position)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
