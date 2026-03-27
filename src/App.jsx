import { useState, useEffect, useMemo, useCallback } from 'react';
import { processData, filterData } from './utils/dataProcessing';
import Header from './components/Header';
import SummaryCards from './components/SummaryCards';
import PositionRotationChart from './components/PositionRotationChart';
import WeeklyHoursHeatmap from './components/WeeklyHoursHeatmap';
import EmployeeShiftDistribution from './components/EmployeeShiftDistribution';
import PositionFrequencyOverTime from './components/PositionFrequencyOverTime';
import FairnessScore from './components/FairnessScore';
import DayOfWeekAnalysis from './components/DayOfWeekAnalysis';
import OutletDistribution from './components/OutletDistribution';
import EmployeeDetail from './components/EmployeeDetail';

export default function App() {
  const [rawData, setRawData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    employees: [],
    workgroup: 'All',
    outlet: 'All',
  });
  const [selectedEmployee, setSelectedEmployee] = useState(null);

  useEffect(() => {
    fetch('/schedule-data.json')
      .then(r => r.json())
      .then(data => {
        setRawData(processData(data));
        setLoading(false);
      });
  }, []);

  const allEmployees = useMemo(() => {
    if (!rawData) return [];
    return [...new Set(rawData.map(r => r.name))].sort();
  }, [rawData]);

  const filteredData = useMemo(() => {
    if (!rawData) return [];
    return filterData(rawData, {
      startDate: filters.startDate ? new Date(filters.startDate + 'T00:00:00') : null,
      endDate: filters.endDate ? new Date(filters.endDate + 'T23:59:59') : null,
      employees: filters.employees,
      workgroup: filters.workgroup,
      outlet: filters.outlet,
    });
  }, [rawData, filters]);

  const handleEmployeeClick = useCallback((name) => {
    setSelectedEmployee(name);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-slate-400 text-lg">Loading schedule data...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900">
      <Header
        allEmployees={allEmployees}
        filters={filters}
        onFilterChange={setFilters}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        <SummaryCards data={filteredData} />
        <PositionRotationChart data={filteredData} onEmployeeClick={handleEmployeeClick} />
        <OutletDistribution data={filteredData} onEmployeeClick={handleEmployeeClick} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <DayOfWeekAnalysis data={filteredData} />
          <WeeklyHoursHeatmap data={filteredData} onEmployeeClick={handleEmployeeClick} />
        </div>

        <EmployeeShiftDistribution data={filteredData} onEmployeeClick={handleEmployeeClick} />
        <PositionFrequencyOverTime data={filteredData} />
        <FairnessScore data={filteredData} onEmployeeClick={handleEmployeeClick} />
      </main>

      {selectedEmployee && (
        <EmployeeDetail
          data={filteredData}
          employeeName={selectedEmployee}
          onClose={() => setSelectedEmployee(null)}
        />
      )}
    </div>
  );
}
