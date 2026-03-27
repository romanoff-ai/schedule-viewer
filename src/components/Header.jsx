import { useState, useRef, useEffect } from 'react';
import { ALL_OUTLETS } from '../utils/dataProcessing';

const WORKGROUP_OPTIONS = ['All', 'Bartenders', 'Barbacks'];
const OUTLET_OPTIONS = ALL_OUTLETS;

export default function Header({ allEmployees, filters, onFilterChange }) {
  const [empDropdownOpen, setEmpDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setEmpDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const toggleEmployee = (name) => {
    const current = filters.employees;
    const next = current.includes(name)
      ? current.filter(n => n !== name)
      : [...current, name];
    onFilterChange({ ...filters, employees: next });
  };

  const clearEmployees = () => {
    onFilterChange({ ...filters, employees: [] });
  };

  return (
    <header className="sticky top-0 z-50 bg-slate-900/95 backdrop-blur border-b border-slate-700/50 px-4 sm:px-6 py-4">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-2xl sm:text-3xl font-bold text-white mb-4">
          Peacock Bar Schedule Analytics
        </h1>
        <div className="flex flex-wrap gap-3 items-end">
          {/* Date range */}
          <div className="flex gap-2 items-center">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Start Date</label>
              <input
                type="date"
                value={filters.startDate || ''}
                onChange={e => onFilterChange({ ...filters, startDate: e.target.value })}
                className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">End Date</label>
              <input
                type="date"
                value={filters.endDate || ''}
                onChange={e => onFilterChange({ ...filters, endDate: e.target.value })}
                className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Employee multi-select */}
          <div className="relative" ref={dropdownRef}>
            <label className="block text-xs text-slate-400 mb-1">Employees</label>
            <button
              onClick={() => setEmpDropdownOpen(!empDropdownOpen)}
              className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-slate-200 min-w-[180px] text-left flex items-center justify-between gap-2"
            >
              <span className="truncate">
                {filters.employees.length === 0
                  ? 'All Employees'
                  : `${filters.employees.length} selected`}
              </span>
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {empDropdownOpen && (
              <div className="absolute top-full left-0 mt-1 bg-slate-800 border border-slate-600 rounded-lg shadow-xl py-1 w-56 max-h-64 overflow-y-auto z-50">
                {filters.employees.length > 0 && (
                  <button
                    onClick={clearEmployees}
                    className="w-full text-left px-3 py-1.5 text-xs text-blue-400 hover:bg-slate-700"
                  >
                    Clear all
                  </button>
                )}
                {allEmployees.map(name => (
                  <label
                    key={name}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-slate-700 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={filters.employees.includes(name)}
                      onChange={() => toggleEmployee(name)}
                      className="rounded border-slate-500 bg-slate-700 text-blue-500 focus:ring-blue-500"
                    />
                    <span className="text-slate-200">{name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Workgroup toggle */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">Workgroup</label>
            <div className="flex rounded-lg overflow-hidden border border-slate-600">
              {WORKGROUP_OPTIONS.map(opt => (
                <button
                  key={opt}
                  onClick={() => onFilterChange({ ...filters, workgroup: opt })}
                  className={`px-3 py-1.5 text-sm transition-colors ${
                    filters.workgroup === opt
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>

          {/* Outlet filter */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">Outlet</label>
            <div className="flex flex-wrap rounded-lg overflow-hidden border border-slate-600">
              {OUTLET_OPTIONS.map(opt => (
                <button
                  key={opt}
                  onClick={() => onFilterChange({ ...filters, outlet: opt })}
                  className={`px-3 py-1.5 text-sm transition-colors ${
                    (filters.outlet || 'All') === opt
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
