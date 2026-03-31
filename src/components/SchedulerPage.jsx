import { useState, useEffect, useMemo } from 'react';
import EmployeePreferences from './EmployeePreferences';
import ShiftTemplates from './ShiftTemplates';
import ScheduleGrid from './ScheduleGrid';
import ScheduleQuality from './ScheduleQuality';
import PositionRankings from './PositionRankings';
import {
  analyzeEmployeeHistory,
  buildDefaultPreferences,
  buildDefaultTemplate,
  generateSchedule,
  scoreSchedule,
  getNextMonday,
  formatDateISO,
} from '../utils/schedulerUtils';

const PREFS_STORAGE_KEY = 'schedule-viewer-preferences';
const RANKINGS_STORAGE_KEY = 'schedule-viewer-rankings';

function loadStoredPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function savePrefs(prefs) {
  localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(prefs));
}

function loadStoredRankings() {
  try {
    const raw = localStorage.getItem(RANKINGS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveRankings(rankings) {
  localStorage.setItem(RANKINGS_STORAGE_KEY, JSON.stringify(rankings));
}

export default function SchedulerPage({ data }) {
  const [activeTab, setActiveTab] = useState('schedule');
  const [preferences, setPreferences] = useState(null);
  const [template, setTemplate] = useState(null);
  const [schedule, setSchedule] = useState(null);
  const [scores, setScores] = useState(null);
  const [weekStart, setWeekStart] = useState(() => getNextMonday());
  const [rankings, setRankings] = useState(() => loadStoredRankings() || {});

  // Analyze historical data
  const historyAnalysis = useMemo(() => {
    if (!data || data.length === 0) return {};
    return analyzeEmployeeHistory(data);
  }, [data]);

  // Initialize preferences from localStorage or history
  useEffect(() => {
    const stored = loadStoredPrefs();
    if (stored && Object.keys(stored).length > 0) {
      // Merge stored prefs with any new employees from history
      const defaults = buildDefaultPreferences(historyAnalysis);
      const merged = { ...defaults, ...stored };
      setPreferences(merged);
    } else {
      setPreferences(buildDefaultPreferences(historyAnalysis));
    }
  }, [historyAnalysis]);

  // Initialize template from history
  useEffect(() => {
    if (data && data.length > 0) {
      setTemplate(buildDefaultTemplate(data));
    }
  }, [data]);

  // Persist preferences
  const handlePreferencesChange = (newPrefs) => {
    setPreferences(newPrefs);
    savePrefs(newPrefs);
  };

  const handleRankingsChange = (newRankings) => {
    setRankings(newRankings);
    saveRankings(newRankings);
  };

  const handleGenerate = () => {
    if (!template || !preferences || !data) return;
    const newSchedule = generateSchedule(template, preferences, data, weekStart, rankings);
    setSchedule(newSchedule);
    setScores(scoreSchedule(newSchedule, preferences, data, rankings));
  };

  const handleScheduleChange = (newSchedule) => {
    setSchedule(newSchedule);
    if (preferences && data) {
      setScores(scoreSchedule(newSchedule, preferences, data, rankings));
    }
  };

  const handleWeekChange = (delta) => {
    const newDate = new Date(weekStart);
    newDate.setDate(newDate.getDate() + delta * 7);
    setWeekStart(newDate);
    setSchedule(null);
    setScores(null);
  };

  if (!preferences || !template) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-slate-400">Analyzing historical data...</div>
      </div>
    );
  }

  const weekEndDate = new Date(weekStart);
  weekEndDate.setDate(weekEndDate.getDate() + 6);

  const tabs = [
    { id: 'schedule', label: 'Schedule' },
    { id: 'rankings', label: 'Rankings' },
    { id: 'preferences', label: 'Preferences' },
    { id: 'templates', label: 'Templates' },
  ];

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Week selector + Generate button */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => handleWeekChange(-1)}
            className="w-8 h-8 rounded bg-slate-700 text-white hover:bg-slate-600 flex items-center justify-center"
          >
            ←
          </button>
          <div className="text-white font-medium">
            Week of {formatDateISO(weekStart)}
            <span className="text-slate-400 text-sm ml-2">to {formatDateISO(weekEndDate)}</span>
          </div>
          <button
            onClick={() => handleWeekChange(1)}
            className="w-8 h-8 rounded bg-slate-700 text-white hover:bg-slate-600 flex items-center justify-center"
          >
            →
          </button>
        </div>
        <button
          onClick={handleGenerate}
          className="bg-blue-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-blue-500 transition-colors shadow-lg shadow-blue-600/20"
        >
          Generate Schedule
        </button>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 bg-slate-800 rounded-lg p-1 w-fit">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-slate-700 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'schedule' && (
        <div className="space-y-6">
          <ScheduleGrid
            schedule={schedule}
            preferences={preferences}
            onScheduleChange={handleScheduleChange}
          />
          {scores && (
            <ScheduleQuality
              scores={scores}
              schedule={schedule}
              preferences={preferences}
            />
          )}
        </div>
      )}

      {activeTab === 'rankings' && (
        <PositionRankings
          rankings={rankings}
          onChange={handleRankingsChange}
          employeeNames={Object.keys(preferences).sort()}
        />
      )}

      {activeTab === 'preferences' && (
        <EmployeePreferences
          preferences={preferences}
          onChange={handlePreferencesChange}
          rankings={rankings}
        />
      )}

      {activeTab === 'templates' && (
        <ShiftTemplates
          template={template}
          onChange={setTemplate}
        />
      )}
    </main>
  );
}
