import { useState } from 'react';
import { POSITION_COLORS } from '../utils/dataProcessing';
import { DAYS, SCHEDULABLE_POSITIONS, OUTLETS } from '../utils/schedulerUtils';

const SHIFT_OPTIONS = ['AM', 'PM', 'Either'];

export default function EmployeePreferences({ preferences, onChange, rankings = {} }) {
  const [expanded, setExpanded] = useState(null);

  const allNames = Object.keys(preferences).sort();
  const bartenders = allNames.filter(n => (preferences[n].role || '').includes('Bartender'));
  const barbacks = allNames.filter(n => (preferences[n].role || '').includes('Barback'));
  // Any role that's neither goes in bartenders by default
  const others = allNames.filter(n => !bartenders.includes(n) && !barbacks.includes(n));
  const bartenderList = [...bartenders, ...others];

  const updatePref = (name, field, value) => {
    onChange({
      ...preferences,
      [name]: { ...preferences[name], [field]: value },
    });
  };

  const movePosition = (name, position, direction) => {
    const pref = preferences[name];
    const list = [...pref.preferredPositions];
    const idx = list.indexOf(position);
    if (idx < 0) return;
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= list.length) return;
    [list[idx], list[newIdx]] = [list[newIdx], list[idx]];
    updatePref(name, 'preferredPositions', list);
  };

  const togglePosition = (name, position) => {
    const pref = preferences[name];
    const list = [...pref.preferredPositions];
    const idx = list.indexOf(position);
    if (idx >= 0) {
      list.splice(idx, 1);
    } else {
      list.push(position);
    }
    updatePref(name, 'preferredPositions', list);
  };

  const toggleOutlet = (name, outlet) => {
    const pref = preferences[name];
    const outlets = [...(pref.trainedOutlets || ['Peacock'])];
    const idx = outlets.indexOf(outlet);
    if (idx >= 0) outlets.splice(idx, 1);
    else outlets.push(outlet);
    updatePref(name, 'trainedOutlets', outlets);
  };

  const toggleDayOff = (name, day) => {
    const pref = preferences[name];
    const days = [...pref.preferredDaysOff];
    const idx = days.indexOf(day);
    if (idx >= 0) days.splice(idx, 1);
    else days.push(day);
    updatePref(name, 'preferredDaysOff', days);
    updatePref(name, 'availability', {
      ...pref.availability,
      [day]: idx >= 0,
    });
  };

  const setShiftTimePref = (name, day, value) => {
    const pref = preferences[name];
    const current = pref.shiftTimePrefs || {};
    updatePref(name, 'shiftTimePrefs', { ...current, [day]: value });
  };

  const renderEmployeeCard = (name) => {
    const pref = preferences[name];
    const isOpen = expanded === name;
    return (
      <div key={name} className="border border-slate-700 rounded-lg overflow-hidden">
        <button
          onClick={() => setExpanded(isOpen ? null : name)}
          className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-slate-700/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <span className="text-white font-medium">{name}</span>
            <span className="text-xs text-slate-400">{pref.role}</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex gap-1 flex-wrap">
              {pref.preferredPositions.slice(0, 3).map(pos => (
                <span
                  key={pos}
                  className="text-xs px-2 py-0.5 rounded"
                  style={{ backgroundColor: POSITION_COLORS[pos] + '30', color: POSITION_COLORS[pos] }}
                >
                  {pos}
                </span>
              ))}
              {(pref.trainedOutlets || ['Peacock']).filter(o => o !== 'Peacock').map(outlet => (
                <span
                  key={outlet}
                  className="text-xs px-2 py-0.5 rounded bg-emerald-900/40 text-emerald-400 border border-emerald-800"
                >
                  {outlet}
                </span>
              ))}
            </div>
            <svg className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </button>

        {isOpen && (
          <div className="px-4 pb-4 space-y-4 border-t border-slate-700">
            {/* Manager Rankings Summary */}
            {(() => {
              const empRankings = [];
              for (const [pos, list] of Object.entries(rankings)) {
                const idx = (list || []).indexOf(name);
                if (idx >= 0) empRankings.push({ pos, rank: idx + 1 });
              }
              empRankings.sort((a, b) => a.rank - b.rank);
              if (empRankings.length > 0) {
                return (
                  <div className="pt-3">
                    <label className="text-sm text-slate-400 block mb-2">Manager Rankings</label>
                    <div className="flex flex-wrap gap-1">
                      {empRankings.map(({ pos, rank }) => (
                        <span
                          key={pos}
                          className={`text-xs px-2 py-1 rounded border ${
                            rank === 1 ? 'bg-yellow-900/40 text-yellow-400 border-yellow-700' :
                            rank === 2 ? 'bg-slate-600/40 text-slate-300 border-slate-500' :
                            rank === 3 ? 'bg-amber-900/40 text-amber-600 border-amber-800' :
                            'bg-slate-800 text-slate-400 border-slate-700'
                          }`}
                        >
                          #{rank} {pos}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              }
              return null;
            })()}
            {/* Preferred Positions */}
            <div className="pt-3">
              <label className="text-sm text-slate-400 block mb-2">Preferred Positions (drag to rank)</label>
              <div className="space-y-1">
                {pref.preferredPositions.map((pos, idx) => (
                  <div key={pos} className="flex items-center gap-2 bg-slate-900/50 rounded px-3 py-2">
                    <span className="text-xs text-slate-500 w-6">#{idx + 1}</span>
                    <span
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: POSITION_COLORS[pos] }}
                    />
                    <span className="text-sm text-white flex-1">{pos}</span>
                    <button
                      onClick={() => movePosition(name, pos, -1)}
                      disabled={idx === 0}
                      className="text-slate-500 hover:text-white disabled:opacity-30 text-xs"
                    >
                      ▲
                    </button>
                    <button
                      onClick={() => movePosition(name, pos, 1)}
                      disabled={idx === pref.preferredPositions.length - 1}
                      className="text-slate-500 hover:text-white disabled:opacity-30 text-xs"
                    >
                      ▼
                    </button>
                    <button
                      onClick={() => togglePosition(name, pos)}
                      className="text-red-400 hover:text-red-300 text-xs ml-1"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-1 mt-2">
                {SCHEDULABLE_POSITIONS.filter(p => !pref.preferredPositions.includes(p)).map(pos => (
                  <button
                    key={pos}
                    onClick={() => togglePosition(name, pos)}
                    className="text-xs px-2 py-1 rounded border border-slate-600 text-slate-400 hover:border-slate-400 hover:text-white transition-colors"
                  >
                    + {pos}
                  </button>
                ))}
              </div>
            </div>

            {/* Max Shifts */}
            <div>
              <label className="text-sm text-slate-400 block mb-2">Max Shifts/Week</label>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => updatePref(name, 'maxShiftsPerWeek', Math.max(1, pref.maxShiftsPerWeek - 1))}
                  className="w-8 h-8 rounded bg-slate-700 text-white hover:bg-slate-600 flex items-center justify-center"
                >
                  −
                </button>
                <span className="text-white font-medium w-8 text-center">{pref.maxShiftsPerWeek}</span>
                <button
                  onClick={() => updatePref(name, 'maxShiftsPerWeek', Math.min(7, pref.maxShiftsPerWeek + 1))}
                  className="w-8 h-8 rounded bg-slate-700 text-white hover:bg-slate-600 flex items-center justify-center"
                >
                  +
                </button>
              </div>
            </div>

            {/* Days Off / Availability + Shift Time Preference */}
            <div>
              <label className="text-sm text-slate-400 block mb-2">Availability & Shift Preference</label>
              <div className="flex gap-2 flex-wrap">
                {DAYS.map(day => {
                  const isOff = pref.preferredDaysOff.includes(day);
                  const shiftPref = (pref.shiftTimePrefs || {})[day] || 'Either';
                  return (
                    <div key={day} className="flex flex-col items-center gap-1">
                      <button
                        onClick={() => toggleDayOff(name, day)}
                        className={`w-10 h-10 rounded text-xs font-medium transition-colors ${
                          isOff
                            ? 'bg-red-900/40 text-red-400 border border-red-800'
                            : 'bg-green-900/30 text-green-400 border border-green-800'
                        }`}
                      >
                        {day}
                      </button>
                      {!isOff && (
                        <div className="flex flex-col gap-0.5">
                          {SHIFT_OPTIONS.map(opt => (
                            <button
                              key={opt}
                              onClick={() => setShiftTimePref(name, day, opt)}
                              className={`text-[10px] px-1.5 py-0.5 rounded transition-colors leading-tight ${
                                shiftPref === opt
                                  ? opt === 'AM'
                                    ? 'bg-amber-700/60 text-amber-300 border border-amber-600'
                                    : opt === 'PM'
                                    ? 'bg-indigo-700/60 text-indigo-300 border border-indigo-600'
                                    : 'bg-slate-600 text-slate-300 border border-slate-500'
                                  : 'bg-slate-800 text-slate-500 border border-slate-700 hover:border-slate-500 hover:text-slate-300'
                              }`}
                            >
                              {opt}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-slate-500 mt-2">Click day to toggle availability. When available, set AM/PM/Either preference.</p>
            </div>

            {/* Trained Outlets */}
            <div>
              <label className="text-sm text-slate-400 block mb-2">Trained Outlets</label>
              <div className="flex flex-wrap gap-2">
                {OUTLETS.map(outlet => {
                  const isChecked = (pref.trainedOutlets || ['Peacock']).includes(outlet);
                  const isPeacock = outlet === 'Peacock';
                  return (
                    <button
                      key={outlet}
                      onClick={() => !isPeacock && toggleOutlet(name, outlet)}
                      disabled={isPeacock}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
                        isChecked
                          ? 'bg-emerald-900/40 text-emerald-400 border-emerald-700'
                          : 'bg-slate-900/50 text-slate-500 border-slate-700 hover:border-slate-500'
                      } ${isPeacock ? 'opacity-70 cursor-default' : 'cursor-pointer'}`}
                    >
                      {isChecked ? '✓ ' : ''}{outlet}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-slate-500 mt-1">Peacock is default for all staff</p>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
      <h2 className="text-lg font-semibold text-white mb-4">Employee Preferences</h2>

      {/* Bartenders Section */}
      {bartenderList.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-base">🍸</span>
            <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Bartenders</h3>
            <span className="text-xs text-slate-500">({bartenderList.length})</span>
          </div>
          <div className="space-y-2">
            {bartenderList.map(name => renderEmployeeCard(name))}
          </div>
        </div>
      )}

      {/* Barbacks Section */}
      {barbacks.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-base">🧹</span>
            <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Barbacks</h3>
            <span className="text-xs text-slate-500">({barbacks.length})</span>
          </div>
          <div className="space-y-2">
            {barbacks.map(name => renderEmployeeCard(name))}
          </div>
        </div>
      )}
    </div>
  );
}
