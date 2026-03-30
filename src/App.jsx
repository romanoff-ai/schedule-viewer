import { useState, useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import { processData, deduplicateData } from './utils/dataProcessing';
import NavBar from './components/NavBar';
import AnalyticsPage from './components/AnalyticsPage';
import SchedulerPage from './components/SchedulerPage';
import RequestOffsPage from './components/RequestOffsPage';

export default function App() {
  const [rawData, setRawData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/schedule-data.json')
      .then(r => r.json())
      .then(data => {
        setRawData(processData(deduplicateData(data)));
        setLoading(false);
      });
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
      <NavBar />
      <Routes>
        <Route path="/" element={<AnalyticsPage data={rawData} />} />
        <Route path="/scheduler" element={<SchedulerPage data={rawData} />} />
        <Route path="/request-offs" element={<RequestOffsPage data={rawData} />} />
      </Routes>
    </div>
  );
}
