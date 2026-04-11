// Outlet detection rules — derive which outlet the employee is working at
// Kappo Kappo is a separate outlet. "Mixologist" usually means Quill or Goldies.
const OUTLET_RULES = [
  { patterns: ['KAPPO'], outlet: 'Kappo Kappo' },
  { patterns: ['GOLDIES', "GOLDIE'S", 'GOLDIE&#39;S', "Goldie's"], outlet: 'Goldies' },
  { patterns: ['QUILL', 'Quill Room'], outlet: 'Quill' },
  { patterns: ['BNQT', 'BANQUET', 'BQT'], outlet: 'Banquet' },
  { patterns: ['PATIO BAR'], outlet: 'Peacock Patio' },
  // Mixologist without explicit venue — default to Quill
  { patterns: ['Mixologist'], outlet: 'Quill' },
];

// Workgroup → Outlet mapping (used when position is blank/generic + Evention confirms the shift)
const WORKGROUP_OUTLET_MAP = {
  'Goldies Mixologist': 'Goldies',
  'Peacock Bar': 'Peacock',
  'Quill Room': 'Quill',
  'Banquet Bartenders': 'Banquet',
  'Banquet': 'Banquet',
};

// Generic position values that don't tell us the specific station
const GENERIC_POSITIONS = new Set([
  '', 'PB BARTENDER', 'GOLDIES MIXOLOGIST', 'MIXOLOGIST',
  'BARTENDER', 'QUILL ROOM', 'PEACOCK BAR',
]);

// Position cleaning rules
const POSITION_MAP = [
  { patterns: ['BARTOP', 'BAR TOP', 'BAR'], clean: 'Bar Top' },
  { patterns: ['SVC WELL', 'SVC CWELL', 'svc well'], clean: 'Service Well' },
  { patterns: ['FLOOR', 'MID', 'MID / FLOOR'], clean: 'Floor' },
  { patterns: ['PATIO BAR'], clean: 'Patio Bar' },
  { patterns: ['KAPPO'], clean: 'Kappo' },
  { patterns: ['GOLDIES', "GOLDIE'S", 'GOLDIE&#39;S'], clean: 'Goldies' },
  { patterns: ['QUILL BAR', 'QUILL'], clean: 'Quill' },
  { patterns: ['CLOSER'], clean: 'Closer' },
  { patterns: ['SATELLITE BAR'], clean: 'Satellite Bar' },
  { patterns: ['EVENT'], clean: 'Event' },
  { patterns: ['Mixologist'], clean: 'Mixologist' },
  { patterns: ['PK BAR', 'PK'], clean: 'PK Bar' },
  { patterns: ['BARBACK'], clean: 'Barback' },
];

export function detectOutlet(raw) {
  if (!raw) return 'Peacock';
  const upper = raw.toUpperCase();
  for (const { patterns, outlet } of OUTLET_RULES) {
    for (const p of patterns) {
      if (upper.includes(p.toUpperCase())) {
        return outlet;
      }
    }
  }
  return 'Peacock';
}

export function cleanPosition(raw) {
  if (!raw) return 'Unassigned';

  // Handle comma-separated values like "BARTOP, PB Bartender" — extract the section part
  let toClean = raw;
  if (raw.includes(',')) {
    const section = raw.split(',')[0].trim();
    // Only use section if it's a meaningful station name (not just a role)
    if (section && !GENERIC_POSITIONS.has(section.toUpperCase())) {
      toClean = section;
    }
  }

  const upper = toClean.toUpperCase();
  for (const { patterns, clean } of POSITION_MAP) {
    for (const p of patterns) {
      if (upper === p.toUpperCase() || upper.startsWith(p.toUpperCase() + ' ') || upper.startsWith(p.toUpperCase() + '/')) {
        return clean;
      }
    }
  }
  if (upper.includes('TRAIN')) return 'Training';
  return 'Unassigned';
}

export const POSITION_COLORS = {
  'Bar Top': '#3b82f6',
  'Service Well': '#22c55e',
  'Floor': '#f97316',
  'Patio Bar': '#a855f7',
  'Kappo': '#ef4444',
  'Goldies': '#eab308',
  'Quill': '#06b6d4',
  'Closer': '#ec4899',
  'Event': '#f59e0b',
  'Peacock': '#60a5fa',
  'Banquet': '#8b5cf6',
  'Satellite Bar': '#14b8a6',
  'PK Bar': '#f472b6',
  'Barback': '#a78bfa',
  'Mixologist': '#34d399',
  'Training': '#64748b',
  'Unassigned': '#475569',
};

export const ALL_POSITIONS = Object.keys(POSITION_COLORS);

function normalizeDate(dateStr) {
  if (!dateStr) return dateStr;
  // If YYYY-MM-DD format, convert to MM/DD/YYYY
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [y, m, d] = dateStr.split('-');
    return `${m}/${d}/${y}`;
  }
  return dateStr;
}

export function parseDate(dateStr) {
  if (!dateStr) return new Date(NaN);
  // Handle YYYY-MM-DD format directly
  if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  const [m, d, y] = dateStr.split('/').map(Number);
  return new Date(y, m - 1, d);
}

export function formatDate(date) {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${m}/${d}/${date.getFullYear()}`;
}

function parseTime(timeStr) {
  if (!timeStr) return null;
  const match = timeStr.match(/^(\d+):(\d+)\s*([AP])/i);
  if (!match) return null;
  let hours = parseInt(match[1]);
  const minutes = parseInt(match[2]);
  const period = match[3].toUpperCase();
  if (period === 'P' && hours !== 12) hours += 12;
  if (period === 'A' && hours === 12) hours = 0;
  return hours + minutes / 60;
}

export function calculateHours(startTime, endTime) {
  const start = parseTime(startTime);
  const end = parseTime(endTime);
  if (start === null || end === null) return 0;
  let diff = end - start;
  if (diff <= 0) diff += 24;
  return diff;
}

export function isWorkingShift(record) {
  const sched = (record.schedule || '').trim().toLowerCase();
  // Not working if schedule is any off variant
  if (!sched) return false;
  if (/^off/i.test(sched) || /^req[.\s]*off/i.test(sched) || /^rto$/i.test(sched) || sched === 'off') return false;
  if (sched.startsWith('offpsnl') || sched.startsWith('offvac')) return false;
  if (sched === 'req off' || sched === 'req. off' || sched === 'req off' || sched === 'r/off') return false;
  // Working if schedule contains a time range pattern like "4:00 P - 1:00 A"
  return /\d+:\d+\s*[AP]/.test(record.schedule);
}

export function isWeekend(dateStr) {
  const date = parseDate(dateStr);
  const day = date.getDay();
  return day === 0 || day === 5 || day === 6; // Fri, Sat, Sun
}

export function getMonthKey(dateStr) {
  const normalized = normalizeDate(dateStr);
  if (!normalized) return 'unknown';
  const [m, , y] = normalized.split('/');
  return `${y}-${m.padStart(2, '0')}`;
}

export function getDayOfWeek(dateStr) {
  const date = parseDate(dateStr);
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()];
}

export function deduplicateData(rawData) {
  // DEDUP NOTE (2026-03-31): Cross-workgroup duplicates removed.
  // OnTrack lists employees in multiple workgroups simultaneously, causing the same
  // shift to appear 2-3x with identical date+times but different workgroups.
  // We keep the highest-priority workgroup entry and remove the rest.
  // If this causes data issues, check: was the employee actually working split shifts
  // across outlets on the same day with the same start/end times? (Rare but possible.)
  // Affected employees: Marshall Kemp (649), Juno Aldana (646), Dodd Bates (520),
  // Mario Lopez (518), Samantha Tellez (407), Michelle Lopez (363), and 7 others.
  // Total removed: ~5,260 records (14.6% of dataset).

  function workgroupPriority(wg) {
    const clean = cleanWorkgroupName(wg || '');
    if (clean === 'Peacock Bar') return 0;
    if (clean === 'Quill Room') return 1;
    if (clean === 'Goldies Mixologist') return 2;
    if (clean === 'Peacock Barback') return 3;
    if (clean === 'Peacock Hosts') return 4;
    if (clean === 'Peacock Servers') return 5;
    if (clean === 'Peacock Bussers') return 6;
    if (clean === 'Peacock Runners') return 7;
    return 99;
  }

  function prioritySort(records) {
    return [...records].sort((a, b) => workgroupPriority(a.workgroup) - workgroupPriority(b.workgroup));
  }

  // Group by person + date
  const byPersonDate = {};
  rawData.forEach(record => {
    const key = record.name + '|' + record.date;
    if (!byPersonDate[key]) byPersonDate[key] = [];
    byPersonDate[key].push(record);
  });

  const deduped = [];
  Object.values(byPersonDate).forEach(records => {
    if (records.length === 1) {
      deduped.push(records[0]);
      return;
    }

    // Group by time signature: (startTime + endTime) OR schedule text
    // This catches cross-workgroup dupes where same person has identical times
    // in different workgroups on the same date
    const byTimeSlot = {};
    records.forEach(r => {
      const start = (r.startTime || '').trim();
      const end = (r.endTime || '').trim();
      const sched = (r.schedule || '').trim();

      // Use start+end times as primary key if available, fall back to schedule text
      const timeKey = (start && end) ? `${start}|${end}` : sched;
      if (!byTimeSlot[timeKey]) byTimeSlot[timeKey] = [];
      byTimeSlot[timeKey].push(r);
    });

    // For each unique time slot, keep only the best one (priority order)
    const uniqueByTime = Object.values(byTimeSlot).map(group => prioritySort(group)[0]);

    // From the unique-time records, keep working shifts; if all off, keep one
    const working = uniqueByTime.filter(r => isWorkingShift(r));
    if (working.length > 0) {
      working.forEach(r => deduped.push(r));
    } else {
      deduped.push(prioritySort(uniqueByTime)[0]);
    }
  });

  return deduped;
}

// Build a lookup: schedName → Set of YYYY-MM-DD dates with Evention tip records
export function buildEventionLookup(eventionShifts, employeeMapping) {
  if (!eventionShifts || !employeeMapping) return {};
  const lookup = {}; // schedName → Set<dateStr>
  for (const [empId, mapping] of Object.entries(employeeMapping)) {
    const schedName = mapping.schedName;
    const shifts = eventionShifts[empId];
    if (!schedName || !shifts) continue;
    if (!lookup[schedName]) lookup[schedName] = new Set();
    for (const s of shifts) {
      if (s.date) lookup[schedName].add(s.date);
    }
  }
  return lookup;
}

export function processData(rawData, eventionLookup) {
  return rawData.map(record => {
    const normalizedDate = normalizeDate(record.date);
    const wg = cleanWorkgroupName(record.workgroup);
    let pos = cleanPosition(record.position);
    let outlet = detectOutlet(record.position);

    // If position is Unassigned, try to derive from workgroup + Evention verification
    if (pos === 'Unassigned' && wg && eventionLookup) {
      const derivedOutlet = WORKGROUP_OUTLET_MAP[wg];
      if (derivedOutlet) {
        // Check Evention data: does this employee have tip data for this date?
        const empDates = eventionLookup[record.name];
        // Convert schedule date to YYYY-MM-DD for Evention lookup
        const nd = normalizedDate; // MM/DD/YYYY
        let isoDate = null;
        if (nd) {
          const [m, d, y] = nd.split('/');
          isoDate = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
        }
        if (empDates && isoDate && empDates.has(isoDate)) {
          // Confirmed via Evention — assign the outlet as the position
          pos = derivedOutlet;
          outlet = derivedOutlet;
        }
        // else: no Evention data for this date → stays Unassigned
      }
    }

    return {
      ...record,
      date: normalizedDate,
      workgroup: wg,
      cleanPosition: pos,
      outlet: outlet,
      hours: calculateHours(record.startTime, record.endTime),
      parsedDate: parseDate(normalizedDate),
      isWorking: isWorkingShift(record),
      dayOfWeek: getDayOfWeek(normalizedDate),
      monthKey: getMonthKey(normalizedDate),
    };
  });
}

// Determine former employees: last record >90 days before dataset end
export function getFormerEmployees(data) {
  if (!data || !data.length) return new Set();
  const empLast = {};
  let maxDate = 0;
  data.forEach(r => {
    const d = parseDate(r.date).getTime();
    if (!empLast[r.name] || d > empLast[r.name]) empLast[r.name] = d;
    if (d > maxDate) maxDate = d;
  });
  const cutoff = maxDate - 90 * 24 * 60 * 60 * 1000;
  const former = new Set();
  Object.entries(empLast).forEach(([name, last]) => {
    if (last < cutoff) former.add(name);
  });
  return former;
}

// Outlet families: outlets that belong to the same workgroup family
// Peacock Bar workgroup covers both "Peacock" and "Peacock Patio" outlets
const WORKGROUP_OUTLET_FAMILIES = {
  'Peacock Bar': ['Peacock', 'Peacock Patio'],
};

export function outletMatchesWorkgroup(outlet, workgroup) {
  const family = WORKGROUP_OUTLET_FAMILIES[workgroup];
  if (family) return family.includes(outlet);
  return true; // no restriction for other workgroups
}

export function filterData(data, { startDate, endDate, employees, workgroup, outlet, hideFormer, formerEmployees }) {
  return data.filter(record => {
    if (hideFormer && formerEmployees && formerEmployees.has(record.name)) return false;
    if (startDate && record.parsedDate < startDate) return false;
    if (endDate && record.parsedDate > endDate) return false;
    if (employees.length > 0 && !employees.includes(record.name)) return false;
    if (workgroup && workgroup !== 'All') {
      // Strict workgroup match
      if (record.workgroup !== workgroup) return false;
    }
    if (outlet && outlet !== 'All' && record.outlet !== outlet) return false;
    return true;
  });
}

export function cleanWorkgroupName(wg) {
  if (!wg) return wg;
  // Strip leading numbers + dots: "1. Peacock Mgmt" → "Peacock Mgmt"
  return wg.replace(/^\d+\.\s*/, '').trim();
}

export function getUniqueWorkgroups(data) {
  if (!data || !data.length) return [];
  const wgs = new Set();
  data.forEach(r => { if (r.workgroup) wgs.add(cleanWorkgroupName(r.workgroup)); });
  return [...wgs].sort();
}

// Build a mapping of employee name → primary workgroup (most frequent)
export function getEmployeeWorkgroups(data) {
  if (!data || !data.length) return {};
  const counts = {}; // name → { workgroup → count }
  data.forEach(r => {
    if (!r.name || !r.workgroup) return;
    if (!counts[r.name]) counts[r.name] = {};
    const wg = cleanWorkgroupName(r.workgroup);
    counts[r.name][wg] = (counts[r.name][wg] || 0) + 1;
  });
  const result = {};
  Object.entries(counts).forEach(([name, wgs]) => {
    let best = null, max = 0;
    Object.entries(wgs).forEach(([wg, c]) => {
      if (c > max) { max = c; best = wg; }
    });
    if (best) result[name] = best;
  });
  return result;
}

export const ALL_OUTLETS = ['All', 'Peacock', 'Kappo Kappo', 'Goldies', 'Quill', 'Peacock Patio', 'Banquet'];

export const OUTLET_COLORS = {
  'Peacock': '#3b82f6',
  'Kappo Kappo': '#ef4444',
  'Goldies': '#eab308',
  'Quill': '#06b6d4',
  'Peacock Patio': '#a855f7',
  'Banquet': '#8b5cf6',
};
