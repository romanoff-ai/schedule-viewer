import { useState } from 'react';
import { POSITION_COLORS } from '../utils/dataProcessing';
import { DAYS, SCHEDULABLE_POSITIONS } from '../utils/schedulerUtils';

const STORAGE_KEY = 'schedule-viewer-templates';

function loadSavedTemplates() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveTemplates(templates) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
}

export default function ShiftTemplates({ template, onChange }) {
  const [savedTemplates, setSavedTemplates] = useState(loadSavedTemplates);
  const [saveName, setSaveName] = useState('');
  const [showSave, setShowSave] = useState(false);

  const updateCount = (day, position, delta) => {
    const current = template[day]?.[position] || 0;
    const next = Math.max(0, current + delta);
    const dayTemplate = { ...template[day] };
    if (next === 0) {
      delete dayTemplate[position];
    } else {
      dayTemplate[position] = next;
    }
    onChange({ ...template, [day]: dayTemplate });
  };

  const handleSave = () => {
    if (!saveName.trim()) return;
    const updated = { ...savedTemplates, [saveName.trim()]: template };
    setSavedTemplates(updated);
    saveTemplates(updated);
    setSaveName('');
    setShowSave(false);
  };

  const handleLoad = (name) => {
    const loaded = savedTemplates[name];
    if (loaded) onChange(loaded);
  };

  const handleDelete = (name) => {
    const updated = { ...savedTemplates };
    delete updated[name];
    setSavedTemplates(updated);
    saveTemplates(updated);
  };

  const totalSlots = DAYS.reduce((sum, day) => {
    return sum + Object.values(template[day] || {}).reduce((s, c) => s + c, 0);
  }, 0);

  return (
    <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white">
          Shift Templates
          <span className="text-sm text-slate-400 font-normal ml-2">{totalSlots} total slots/week</span>
        </h2>
        <div className="flex gap-2">
          {showSave ? (
            <div className="flex gap-1">
              <input
                value={saveName}
                onChange={e => setSaveName(e.target.value)}
                placeholder="Template name"
                className="bg-slate-900 text-white text-sm rounded px-2 py-1 border border-slate-600 focus:border-blue-500 outline-none w-32"
                onKeyDown={e => e.key === 'Enter' && handleSave()}
              />
              <button onClick={handleSave} className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-500">Save</button>
              <button onClick={() => setShowSave(false)} className="text-xs text-slate-400 px-2 py-1 hover:text-white">Cancel</button>
            </div>
          ) : (
            <button onClick={() => setShowSave(true)} className="text-xs bg-slate-700 text-slate-300 px-3 py-1.5 rounded hover:bg-slate-600">
              Save Template
            </button>
          )}
        </div>
      </div>

      {/* Saved Templates */}
      {Object.keys(savedTemplates).length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {Object.keys(savedTemplates).map(name => (
            <div key={name} className="flex items-center gap-1 bg-slate-900/50 rounded px-2 py-1">
              <button onClick={() => handleLoad(name)} className="text-xs text-blue-400 hover:text-blue-300">{name}</button>
              <button onClick={() => handleDelete(name)} className="text-xs text-slate-500 hover:text-red-400 ml-1">✕</button>
            </div>
          ))}
        </div>
      )}

      {/* Template Grid */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="text-left text-slate-400 font-medium py-2 px-2 w-28">Position</th>
              {DAYS.map(day => (
                <th key={day} className="text-center text-slate-400 font-medium py-2 px-1 w-16">{day}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SCHEDULABLE_POSITIONS.map(pos => (
              <tr key={pos} className="border-t border-slate-700/50">
                <td className="py-2 px-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: POSITION_COLORS[pos] }} />
                    <span className="text-white text-xs">{pos}</span>
                  </div>
                </td>
                {DAYS.map(day => {
                  const count = template[day]?.[pos] || 0;
                  return (
                    <td key={day} className="py-1 px-1 text-center">
                      <div className="flex items-center justify-center gap-0.5">
                        <button
                          onClick={() => updateCount(day, pos, -1)}
                          className="w-5 h-5 rounded text-slate-500 hover:text-white hover:bg-slate-700 flex items-center justify-center text-xs"
                        >
                          −
                        </button>
                        <span className={`w-5 text-center font-medium ${count > 0 ? 'text-white' : 'text-slate-600'}`}>
                          {count}
                        </span>
                        <button
                          onClick={() => updateCount(day, pos, 1)}
                          className="w-5 h-5 rounded text-slate-500 hover:text-white hover:bg-slate-700 flex items-center justify-center text-xs"
                        >
                          +
                        </button>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-600">
              <td className="py-2 px-2 text-slate-400 font-medium text-xs">Total</td>
              {DAYS.map(day => {
                const total = Object.values(template[day] || {}).reduce((s, c) => s + c, 0);
                return (
                  <td key={day} className="py-2 px-1 text-center text-slate-300 font-medium text-xs">{total}</td>
                );
              })}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
