import { ALL_POSITIONS } from './dataProcessing';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const SCHEDULABLE_POSITIONS = ['Bar Top', 'Service Well', 'Floor', 'Patio Bar', 'Kappo', 'Goldies', 'Quill'];

export { DAYS, SCHEDULABLE_POSITIONS };

// --- Historical Analysis ---

export function analyzeEmployeeHistory(data) {
  const employees = {};

  for (const record of data) {
    if (!record.isWorking) continue;
    if (!employees[record.name]) {
      employees[record.name] = {
        name: record.name,
        role: record.role,
        workgroup: record.workgroup,
        shifts: [],
        positionCounts: {},
        dayOfWeekCounts: { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, Sun: 0 },
        weekSet: new Set(),
        outletSet: new Set(),
      };
    }
    const emp = employees[record.name];
    emp.shifts.push(record);
    const pos = record.cleanPosition;
    emp.positionCounts[pos] = (emp.positionCounts[pos] || 0) + 1;
    emp.dayOfWeekCounts[record.dayOfWeek] = (emp.dayOfWeekCounts[record.dayOfWeek] || 0) + 1;

    // Track weeks for avg shifts/week
    const d = record.parsedDate;
    const weekStart = new Date(d);
    weekStart.setDate(d.getDate() - d.getDay());
    emp.weekSet.add(`${weekStart.getFullYear()}-${weekStart.getMonth()}-${weekStart.getDate()}`);

    emp.outletSet.add(record.outlet);
  }

  const results = {};
  for (const [name, emp] of Object.entries(employees)) {
    const totalShifts = emp.shifts.length;
    const totalWeeks = Math.max(emp.weekSet.size, 1);
    const avgShiftsPerWeek = Math.round((totalShifts / totalWeeks) * 10) / 10;

    // Top positions (sorted by frequency)
    const sortedPositions = Object.entries(emp.positionCounts)
      .filter(([pos]) => SCHEDULABLE_POSITIONS.includes(pos))
      .sort((a, b) => b[1] - a[1])
      .map(([pos]) => pos);

    // Days with fewest shifts = likely days off
    const dayCounts = Object.entries(emp.dayOfWeekCounts).sort((a, b) => a[1] - b[1]);
    const minCount = dayCounts[0][1];
    const typicalDaysOff = dayCounts
      .filter(([, count]) => count <= minCount * 1.3)
      .map(([day]) => day)
      .slice(0, 2);

    // Cross-outlet
    const crossOutlet = emp.outletSet.size > 1;

    results[name] = {
      name,
      role: emp.role,
      workgroup: emp.workgroup,
      preferredPositions: sortedPositions.slice(0, 3),
      allPositionCounts: emp.positionCounts,
      maxShiftsPerWeek: Math.min(Math.round(avgShiftsPerWeek), 6),
      avgShiftsPerWeek,
      preferredDaysOff: typicalDaysOff,
      dayOfWeekCounts: emp.dayOfWeekCounts,
      crossOutletWilling: crossOutlet,
      totalShifts,
    };
  }
  return results;
}

// --- Default Preferences ---

export function buildDefaultPreferences(historyAnalysis) {
  const prefs = {};
  for (const [name, analysis] of Object.entries(historyAnalysis)) {
    prefs[name] = {
      name,
      role: analysis.role,
      workgroup: analysis.workgroup,
      preferredPositions: analysis.preferredPositions,
      maxShiftsPerWeek: analysis.maxShiftsPerWeek || 5,
      preferredDaysOff: analysis.preferredDaysOff,
      availability: DAYS.reduce((acc, day) => {
        acc[day] = !analysis.preferredDaysOff.includes(day);
        return acc;
      }, {}),
      crossOutletWilling: analysis.crossOutletWilling,
    };
  }
  return prefs;
}

// --- Default Template ---

export function buildDefaultTemplate(data) {
  const template = {};
  for (const day of DAYS) {
    template[day] = {};
  }

  // Count avg staff per position per day from historical data
  const dayPositionDates = {};
  for (const record of data) {
    if (!record.isWorking) continue;
    const pos = record.cleanPosition;
    if (!SCHEDULABLE_POSITIONS.includes(pos)) continue;
    const day = record.dayOfWeek;
    const dateKey = record.date;
    const key = `${day}|${pos}`;
    if (!dayPositionDates[key]) dayPositionDates[key] = new Set();
    dayPositionDates[key].add(`${dateKey}|${record.name}`);
  }

  // Count unique dates per day
  const dayDates = {};
  for (const record of data) {
    if (!record.isWorking) continue;
    const day = record.dayOfWeek;
    if (!dayDates[day]) dayDates[day] = new Set();
    dayDates[day].add(record.date);
  }

  for (const day of DAYS) {
    const numDates = dayDates[day] ? dayDates[day].size : 1;
    for (const pos of SCHEDULABLE_POSITIONS) {
      const key = `${day}|${pos}`;
      const count = dayPositionDates[key] ? dayPositionDates[key].size : 0;
      const avg = Math.round(count / numDates);
      if (avg > 0) {
        template[day][pos] = avg;
      }
    }
  }

  return template;
}

// --- Auto-Schedule Generator ---

export function generateSchedule(template, preferences, historicalData, weekStartDate) {
  const schedule = {};
  const employeeWeekShifts = {};
  const employeeLastPosition = {};

  // Pre-compute last position dates from history
  for (const record of historicalData) {
    if (!record.isWorking) continue;
    const key = `${record.name}|${record.cleanPosition}`;
    const existing = employeeLastPosition[key];
    if (!existing || record.parsedDate > existing) {
      employeeLastPosition[key] = record.parsedDate;
    }
  }

  const employeeNames = Object.keys(preferences);

  // Initialize shift counts
  for (const name of employeeNames) {
    employeeWeekShifts[name] = 0;
  }

  // Generate for each day of the week
  for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
    const day = DAYS[dayIdx];
    const dateObj = new Date(weekStartDate);
    // weekStartDate is Monday, so add dayIdx
    dateObj.setDate(dateObj.getDate() + dayIdx);
    const dateStr = formatDateShort(dateObj);

    const dayTemplate = template[day] || {};
    const dayAssignments = [];
    const assignedToday = new Set();

    // Collect all slots needed
    const slots = [];
    for (const [position, count] of Object.entries(dayTemplate)) {
      for (let i = 0; i < count; i++) {
        slots.push(position);
      }
    }

    // Sort slots by how hard they are to fill (fewer eligible employees first)
    slots.sort((a, b) => {
      const aEligible = employeeNames.filter(n => canAssign(n, a, day, preferences, assignedToday, employeeWeekShifts)).length;
      const bEligible = employeeNames.filter(n => canAssign(n, b, day, preferences, assignedToday, employeeWeekShifts)).length;
      return aEligible - bEligible;
    });

    for (const position of slots) {
      let bestEmployee = null;
      let bestScore = -Infinity;

      for (const name of employeeNames) {
        if (!canAssign(name, position, day, preferences, assignedToday, employeeWeekShifts)) continue;

        const score = scoreAssignment(
          name, position, day, preferences[name],
          employeeWeekShifts[name], employeeLastPosition, weekStartDate
        );

        if (score > bestScore) {
          bestScore = score;
          bestEmployee = name;
        }
      }

      if (bestEmployee) {
        dayAssignments.push({
          employee: bestEmployee,
          position,
          day,
          date: dateStr,
          time: getDefaultShiftTime(position, day),
        });
        assignedToday.add(bestEmployee);
        employeeWeekShifts[bestEmployee]++;
      } else {
        // Unassigned slot
        dayAssignments.push({
          employee: null,
          position,
          day,
          date: dateStr,
          time: getDefaultShiftTime(position, day),
        });
      }
    }

    schedule[day] = dayAssignments;
  }

  return schedule;
}

function canAssign(name, position, day, preferences, assignedToday, weekShifts) {
  const pref = preferences[name];
  if (!pref) return false;
  if (assignedToday.has(name)) return false;
  if (!pref.availability[day]) return false;
  if (weekShifts[name] >= pref.maxShiftsPerWeek) return false;

  // Check cross-outlet
  const outletPositions = ['Kappo', 'Goldies', 'Quill'];
  if (outletPositions.includes(position) && !pref.crossOutletWilling) return false;

  return true;
}

function scoreAssignment(name, position, day, pref, currentWeekShifts, lastPositionMap, weekStartDate) {
  let score = 0;

  // Position preference (highest weight)
  const prefIdx = pref.preferredPositions.indexOf(position);
  if (prefIdx === 0) score += 100;
  else if (prefIdx === 1) score += 70;
  else if (prefIdx === 2) score += 40;
  else score += 10; // Can still work it, just not preferred

  // Rotation fairness — days since last working this position
  const key = `${name}|${position}`;
  const lastDate = lastPositionMap[key];
  if (lastDate) {
    const daysSince = Math.floor((weekStartDate - lastDate) / (1000 * 60 * 60 * 24));
    score += Math.min(daysSince * 2, 50); // Cap at 50
  } else {
    score += 30; // Never worked this position — moderate priority
  }

  // Workload balance — fewer shifts this week = higher priority
  score += (5 - currentWeekShifts) * 15;

  // Slight deterministic tiebreaker based on name hash
  score += (hashString(name + day + position) % 10) / 10;

  return score;
}

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + ch;
    hash |= 0;
  }
  return Math.abs(hash);
}

function getDefaultShiftTime(position, day) {
  const isWeekend = ['Fri', 'Sat'].includes(day);
  if (position === 'Kappo' || position === 'Goldies' || position === 'Quill') {
    return isWeekend ? '5:00 P - 1:00 A' : '5:00 P - 12:00 A';
  }
  return isWeekend ? '4:00 P - 2:00 A' : '4:00 P - 12:00 A';
}

function formatDateShort(date) {
  return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
}

// --- Schedule Quality Scoring ---

export function scoreSchedule(schedule, preferences, historicalData) {
  const assignments = Object.values(schedule).flat().filter(a => a.employee);

  if (assignments.length === 0) {
    return { rotation: 0, preference: 0, workload: 0, overall: 0 };
  }

  // 1. Preference satisfaction (0-100)
  let prefScore = 0;
  for (const a of assignments) {
    const pref = preferences[a.employee];
    if (!pref) continue;
    const idx = pref.preferredPositions.indexOf(a.position);
    if (idx === 0) prefScore += 100;
    else if (idx === 1) prefScore += 70;
    else if (idx === 2) prefScore += 40;
    else prefScore += 10;
  }
  const preference = Math.round(prefScore / assignments.length);

  // 2. Position rotation fairness (0-100) — how evenly positions are distributed
  const empPositions = {};
  for (const a of assignments) {
    if (!empPositions[a.employee]) empPositions[a.employee] = {};
    empPositions[a.employee][a.position] = (empPositions[a.employee][a.position] || 0) + 1;
  }
  let rotationScore = 0;
  let rotationCount = 0;
  for (const positions of Object.values(empPositions)) {
    const counts = Object.values(positions);
    if (counts.length <= 1) {
      rotationScore += 50; // Only one position this week, neutral
    } else {
      const max = Math.max(...counts);
      const min = Math.min(...counts);
      rotationScore += 100 - ((max - min) / max) * 100;
    }
    rotationCount++;
  }
  const rotation = rotationCount > 0 ? Math.round(rotationScore / rotationCount) : 0;

  // 3. Workload balance (0-100)
  const empShiftCounts = {};
  for (const a of assignments) {
    empShiftCounts[a.employee] = (empShiftCounts[a.employee] || 0) + 1;
  }
  const counts = Object.values(empShiftCounts);
  if (counts.length <= 1) {
    var workload = 100;
  } else {
    const avg = counts.reduce((s, c) => s + c, 0) / counts.length;
    const maxDev = Math.max(...counts.map(c => Math.abs(c - avg)));
    workload = Math.round(Math.max(0, 100 - maxDev * 20));
  }

  const overall = Math.round((preference + rotation + workload) / 3);

  return { rotation, preference, workload, overall };
}

// --- Utility: Get next Monday from a date ---

export function getNextMonday(fromDate = new Date()) {
  const d = new Date(fromDate);
  const day = d.getDay();
  const diff = day === 0 ? 1 : day === 1 ? 0 : 8 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function formatDateISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
