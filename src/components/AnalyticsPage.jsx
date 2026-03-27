import { useState, useMemo, useCallback } from 'react';
import { filterData } from '../utils/dataProcessing';
import Header from './Header';
import SummaryCards from './SummaryCards';
import PositionRotationChart from './PositionRotationChart';
import WeeklyHoursHeatmap from './WeeklyHoursHeatmap';
import EmployeeShiftDistribution from './EmployeeShiftDistribution';
import PositionFrequencyOverTime from './PositionFrequencyOverTime';
import FairnessScore from './FairnessScore';
import DayOfWeekAnalysis from './DayOfWeekAnalysis';
import OutletDistribution from './OutletDistribution';
import EmployeeDetail from './EmployeeDetail';

export default function AnalyticsPage({ data }) {
  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    employees: [],
    workgroup: 'All',
    outlet: 'All',
  });
  const [selectedEmployee, setSelectedEmployee] = useState(null);

  const allEmployees = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.map(r => r.name))].sort();
  }, [data]);

  const filteredData = useMemo(() => {
    if (!data) return [];
    return filterData(data, {
      startDate: filters.startDate ? new Date(filters.startDate + 'T00:00:00') : null,
      endDate: filters.endDate ? new Date(filters.endDate + 'T23:59:59') : null,
      employees: filters.employees,
      workgroup: filters.workgroup,
      outlet: filters.outlet,
    });
  }, [data, filters]);

  const handleEmployeeClick = useCallback((name) => {
    setSelectedEmployee(name);
  }, []);

  return (
    <>
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
    </>
  );
}
