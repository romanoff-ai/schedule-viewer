import { useState, useRef, useEffect } from 'react';
import { ALL_OUTLETS } from '../utils/dataProcessing';

function getPresetDates(preset) {
  const today = new Date();
  const end = today.toISOString().split('T')[0];
  let startDate;
  switch (preset) {
    case '30D': {
      const d = new Date(today); d.setDate(d.getDate() - 30); startDate = d.toISOString().split('T')[0]; break;
    }
    case '60D': {
      const d = new Date(today); d.setDate(d.getDate() - 60); startDate = d.toISOString().split('T')[0]; break;
    }
    case '90D': {
      const d = new Date(today); d.setDate(d.getDate() - 90); startDate = d.toISOString().split('T')[0]; break;
    }
    case '6M': {
      const d = new Date(today); d.setMonth(d.getMonth() - 6); startDate = d.toISOString().split('T')[0]; break;
    }
    case '1Y': {
      const d = new Date(today); d.setFullYear(d.getFullYear() - 1); startDate = d.toISOString().split('T')[0]; break;
    }
    case '2Y': {
      const d = new Date(today); d.setFullYear(d.getFullYear() - 2); startDate = d.toISOString().split('T')[0]; break;
    }
    case 'YTD': {
      startDate = `${today.getFullYear()}-01-01`; break;
    }
    default: startDate = '';
  }
  return { startDate, endDate: end };
}

const DATE_PRESETS = ['30D', '60D', '90D', '6M', '1Y', '2Y', 'YTD'];

export default function Header({ allEmployees, allWorkgroups, filters, onFilterChange }) {
  const [empDropdownOpen, setEmpDropdownOpen] = useState(false);
  const [activePreset, setActivePreset] = useState(null);
  const dropdownRef = useRef(null);

  const workgroupOptions = ['All', ...(allWorkgroups || [])];

  // Close employee dropdown when clicking outside
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

  const handleDateChange = (key, value) => {
    setActivePreset(null);
    onFilterChange({ ...filters, [key]: value });
  };

  const applyPreset = (preset) => {
    const { startDate, endDate } = getPresetDates(preset);
    setActivePreset(preset);
    onFilterChange({ ...filters, startDate, endDate });
  };

  const clearAllFilters = () => {
    setActivePreset(null);
    onFilterChange({
      startDate: '',
      endDate: '',
      employees: [],
      workgroup: 'All',
      outlet: 'All',
    });
  };

  // Build active filter chips
  const activeChips = [];
  if (activePreset) {
    activeChips.push({ label: `Last ${activePreset}`, onClear: () => { setActivePreset(null); onFilterChange({ ...filters, startDate: '', endDate: '' }); } });
  } else if (filters.startDate || filters.endDate) {
    const range = [filters.startDate, filters.endDate].filter(Boolean).join(' → ');
    activeChips.push({ label: range, onClear: () => { setActivePreset(null); onFilterChange({ ...filters, startDate: '', endDate: '' }); } });
  }
  if (filters.outlet && filters.outlet !== 'All') {
    activeChips.push({ label: filters.outlet, onClear: () => onFilterChange({ ...filters, outlet: 'All' }) });
  }
  if (filters.workgroup && filters.workgroup !== 'All') {
    activeChips.push({ label: filters.workgroup, onClear: () => onFilterChange({ ...filters, workgroup: 'All' }) });
  }
  if (filters.employees.length > 0) {
    const label = filters.employees.length === 1 ? filters.employees[0] : `${filters.employees.length} employees`;
    activeChips.push({ label, onClear: clearEmployees });
  }

  const hasActiveFilters = activeChips.length > 0;

  const selectClasses = "bg-slate-800 border border-slate-600 rounded-lg px-2 py-1.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none cursor-pointer";

  return (
    <header className="sticky top-0 z-50 bg-slate-900/95 backdrop-blur border-b border-slate-700/50 px-4 sm:px-6">
      <div className="max-w-7xl mx-auto">

        {/* Filter bar — single row on desktop, wraps on mobile */}
        <div className="flex flex-wrap items-center gap-2 py-2">

          {/* Date inputs */}
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={filters.startDate || ''}
              onChange={e => handleDateChange('startDate', e.target.value)}
              className="bg-slate-800 border border-slate-600 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 w-[120px]"
            />
            <span className="text-slate-500 text-xs">–</span>
            <input
              type="date"
              value={filters.endDate || ''}
              onChange={e => handleDateChange('endDate', e.target.value)}
              className="bg-slate-800 border border-slate-600 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 w-[120px]"
            />
          </div>

          {/* Date presets */}
          <div className="flex items-center gap-1">
            {DATE_PRESETS.map(preset => (
              <button
                key={preset}
                onClick={() => applyPreset(preset)}
                className={`px-2 py-1 text-xs rounded-md font-medium transition-colors border ${
                  activePreset === preset
                    ? 'bg-blue-600 border-blue-500 text-white'
                    : 'bg-slate-800 border-slate-600 text-slate-400 hover:bg-slate-700 hover:text-white'
                }`}
              >
                {preset}
              </button>
            ))}
          </div>

          {/* Divider */}
          <div className="hidden lg:block w-px h-6 bg-slate-700" />

          {/* Outlet dropdown */}
          <select
            value={filters.outlet || 'All'}
            onChange={e => onFilterChange({ ...filters, outlet: e.target.value })}
            className={selectClasses}
          >
            {ALL_OUTLETS.map(opt => (
              <option key={opt} value={opt}>{opt === 'All' ? 'All Outlets' : opt}</option>
            ))}
          </select>

          {/* Workgroup dropdown */}
          <select
            value={filters.workgroup || 'All'}
            onChange={e => onFilterChange({ ...filters, workgroup: e.target.value })}
            className={selectClasses}
          >
            {workgroupOptions.map(opt => (
              <option key={opt} value={opt}>{opt === 'All' ? 'All Workgroups' : opt}</option>
            ))}
          </select>

          {/* Employee multi-select dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setEmpDropdownOpen(!empDropdownOpen)}
              className="bg-slate-800 border border-slate-600 rounded-lg px-2 py-1.5 text-sm text-slate-200 min-w-[140px] text-left flex items-center justify-between gap-1.5"
            >
              <span className="truncate text-xs">
                {filters.employees.length === 0
                  ? 'All Employees'
                  : `${filters.employees.length} selected`}
              </span>
              <svg className="w-3 h-3 shrink-0 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

          {/* Clear All */}
          {hasActiveFilters && (
            <button
              onClick={clearAllFilters}
              className="px-2.5 py-1.5 text-xs rounded-lg font-medium transition-colors border border-slate-600 bg-slate-800 text-slate-400 hover:text-red-400 hover:border-red-500/50"
            >
              Clear All
            </button>
          )}
        </div>

        {/* Active filter chips */}
        {activeChips.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pb-2 -mt-0.5">
            {activeChips.map((chip, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 bg-blue-600/20 text-blue-300 border border-blue-500/30 rounded-full px-2.5 py-0.5 text-xs"
              >
                {chip.label}
                <button
                  onClick={chip.onClear}
                  className="hover:text-white ml-0.5"
                  aria-label={`Clear ${chip.label}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

      </div>
    </header>
  );
}
