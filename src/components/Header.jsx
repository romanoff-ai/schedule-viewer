import { useState, useRef, useEffect } from 'react';
import { ALL_OUTLETS } from '../utils/dataProcessing';

const OUTLET_OPTIONS = ALL_OUTLETS;

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
  const [filtersCollapsed, setFiltersCollapsed] = useState(false);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [activePreset, setActivePreset] = useState(null);
  const dropdownRef = useRef(null);
  const lastScrollY = useRef(0);

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

  // Collapse header on scroll down, expand on scroll up
  // Don't auto-collapse while user has manually expanded filters
  useEffect(() => {
    function handleScroll() {
      const currentY = window.scrollY;
      if (filtersExpanded) {
        // User manually toggled filters open — don't fight them
        lastScrollY.current = currentY;
        return;
      }
      if (currentY > 100 && currentY > lastScrollY.current) {
        setFiltersCollapsed(true);
      } else if (currentY < lastScrollY.current - 10) {
        setFiltersCollapsed(false);
      }
      lastScrollY.current = currentY;
    }
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [filtersExpanded]);

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

  const showFilters = !filtersCollapsed || filtersExpanded;

  const activeFilterCount = [
    filters.employees.length > 0,
    (filters.workgroup && filters.workgroup !== 'All'),
    (filters.outlet && filters.outlet !== 'All'),
    filters.startDate,
    filters.endDate,
  ].filter(Boolean).length;

  const pageTitle = (!filters.workgroup || filters.workgroup === 'All')
    ? 'Schedule Analytics'
    : `${filters.workgroup} Schedule Analytics`;

  return (
    <header className="sticky top-0 z-50 bg-slate-900/95 backdrop-blur border-b border-slate-700/50 px-4 sm:px-6 transition-all duration-300">
      <div className="max-w-7xl mx-auto">

        {/* Always-visible title row */}
        <div className={`flex items-center justify-between transition-all duration-300 ${filtersCollapsed ? 'py-2' : 'pt-4 pb-0'}`}>
          <h1 className={`font-bold text-white transition-all duration-300 ${filtersCollapsed ? 'text-base sm:text-lg' : 'text-2xl sm:text-3xl'}`}>
            {pageTitle}
          </h1>

          {filtersCollapsed && (
            <button
              onClick={() => {
                setFiltersExpanded(prev => {
                  if (prev) {
                    // Closing — let scroll handler take over again
                    return false;
                  }
                  return true;
                });
              }}
              className="flex items-center gap-1.5 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-slate-200 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
              </svg>
              <span>Filters</span>
              {activeFilterCount > 0 && (
                <span className="bg-blue-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
              <svg
                className={`w-3 h-3 transition-transform duration-200 ${filtersExpanded ? 'rotate-180' : ''}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          )}
        </div>

        {/* Collapsible filter section */}
        <div
          className={`transition-all duration-300 ease-in-out ${
            showFilters ? 'max-h-[2000px] opacity-100 overflow-visible' : 'max-h-0 opacity-0 overflow-hidden'
          }`}
        >
          <div className="flex flex-wrap gap-3 items-end py-4">
            {/* Date range */}
            <div className="flex flex-col gap-2">
              <div className="flex gap-2 items-center">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Start Date</label>
                  <input
                    type="date"
                    value={filters.startDate || ''}
                    onChange={e => handleDateChange('startDate', e.target.value)}
                    className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">End Date</label>
                  <input
                    type="date"
                    value={filters.endDate || ''}
                    onChange={e => handleDateChange('endDate', e.target.value)}
                    className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              {/* Date range presets */}
              <div className="flex gap-1.5 flex-wrap">
                {DATE_PRESETS.map(preset => (
                  <button
                    key={preset}
                    onClick={() => applyPreset(preset)}
                    className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors border ${
                      activePreset === preset
                        ? 'bg-blue-600 border-blue-500 text-white'
                        : 'bg-slate-800 border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
                {(filters.startDate || filters.endDate) && (
                  <button
                    onClick={() => {
                      setActivePreset(null);
                      onFilterChange({ ...filters, startDate: '', endDate: '' });
                    }}
                    className="px-2.5 py-1 text-xs rounded-md font-medium transition-colors border bg-slate-800 border-slate-600 text-slate-500 hover:text-red-400 hover:border-red-500/50"
                  >
                    Clear
                  </button>
                )}
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

            {/* Workgroup — wrapping pill bar */}
            <div className="flex-1 min-w-0">
              <label className="block text-xs text-slate-400 mb-1">Workgroup</label>
              <div className="flex flex-wrap gap-2">
                {workgroupOptions.map(opt => (
                  <button
                    key={opt}
                    onClick={() => onFilterChange({ ...filters, workgroup: opt })}
                    className={`px-3 py-1.5 text-sm rounded-full whitespace-nowrap transition-colors border ${
                      (filters.workgroup || 'All') === opt
                        ? 'bg-blue-600 border-blue-500 text-white'
                        : 'bg-slate-800 border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white'
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Outlet filter — full-width scrollable row */}
          <div className="pb-4">
            <label className="block text-xs text-slate-400 mb-1">Outlet</label>
            <div className="overflow-x-auto scrollbar-hide">
              <div className="flex gap-1 min-w-max">
                {OUTLET_OPTIONS.map(opt => (
                  <button
                    key={opt}
                    onClick={() => onFilterChange({ ...filters, outlet: opt })}
                    className={`px-3 py-1.5 text-sm rounded-full whitespace-nowrap transition-colors border ${
                      (filters.outlet || 'All') === opt
                        ? 'bg-blue-600 border-blue-500 text-white'
                        : 'bg-slate-800 border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white'
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

      </div>
    </header>
  );
}
