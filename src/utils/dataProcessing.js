// Outlet detection rules — derive which outlet the employee is working at
// Kappo Kappo is a separate outlet. "Mixologist" usually means Quill or Goldies.
const OUTLET_RULES = [
  { patterns: ['KAPPO'], outlet: 'Kappo Kappo' },
  { patterns: ['GOLDIES', "GOLDIE'S", 'GOLDIE&#39;S', "Goldie's"], outlet: 'Goldies' },
  { patterns: ['QUILL', 'Quill Room'], outlet: 'Quill' },
  { patterns: ['BNQT', 'BANQUET', 'BQT'], outlet: 'Banquet' },
  { patterns: ['PATIO BAR'], outlet: 'Peacock (Patio)' },
  // Mixologist without explicit venue → Quill/Goldies (can't distinguish — mark as Lounge)
  { patterns: ['Mixologist'], outlet: 'Quill/Goldies' },
];

// Position cleaning rules
const POSITION_MAP = [
  { patterns: ['BARTOP', 'BAR TOP', 'BAR'], clean: 'Bar Top' },
  { patterns: ['SVC WELL', 'SVC CWELL', 'svc well'], clean: 'Service Well' },
  { patterns: ['FLOOR', 'MID', 'MID / FLOOR'], clean: 'Floor' },
  { patterns: ['PATIO BAR'], clean: 'Patio Bar' },
  { patterns: ['KAPPO'], clean: 'Kappo' },
  { patterns: ['GOLDIES', "GOLDIE'S", 'GOLDIE&#39;S'], clean: 'Goldies' },
  { patterns: ['QUILL'], clean: 'Quill' },
  { patterns: ['CLOSER'], clean: 'Closer' },
  { patterns: ['SATELLITE BAR'], clean: 'Satellite Bar' },
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
  const upper = raw.toUpperCase();
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
  'Training': '#64748b',
  'Unassigned': '#475569',
};

export const ALL_POSITIONS = Object.keys(POSITION_COLORS);

export function parseDate(dateStr) {
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
  return record.status === 'working' && record.startTime && record.endTime;
}

export function isWeekend(dateStr) {
  const date = parseDate(dateStr);
  const day = date.getDay();
  return day === 0 || day === 5 || day === 6; // Fri, Sat, Sun
}

export function getMonthKey(dateStr) {
  const [m, , y] = dateStr.split('/');
  return `${y}-${m.padStart(2, '0')}`;
}

export function getDayOfWeek(dateStr) {
  const date = parseDate(dateStr);
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()];
}

export function processData(rawData) {
  return rawData.map(record => ({
    ...record,
    cleanPosition: cleanPosition(record.position),
    outlet: detectOutlet(record.position),
    hours: calculateHours(record.startTime, record.endTime),
    parsedDate: parseDate(record.date),
    isWorking: isWorkingShift(record),
    dayOfWeek: getDayOfWeek(record.date),
    monthKey: getMonthKey(record.date),
  }));
}

export function filterData(data, { startDate, endDate, employees, workgroup, outlet }) {
  return data.filter(record => {
    if (startDate && record.parsedDate < startDate) return false;
    if (endDate && record.parsedDate > endDate) return false;
    if (employees.length > 0 && !employees.includes(record.name)) return false;
    if (workgroup === 'Bartenders' && record.workgroup !== 'Peacock Bar') return false;
    if (workgroup === 'Barbacks' && record.workgroup !== 'Peacock Barback') return false;
    if (outlet && outlet !== 'All' && record.outlet !== outlet) return false;
    return true;
  });
}

export const ALL_OUTLETS = ['All', 'Peacock', 'Kappo Kappo', 'Goldies', 'Quill', 'Quill/Goldies', 'Peacock (Patio)', 'Banquet'];

export const OUTLET_COLORS = {
  'Peacock': '#3b82f6',
  'Kappo Kappo': '#ef4444',
  'Goldies': '#eab308',
  'Quill': '#06b6d4',
  'Quill/Goldies': '#14b8a6',
  'Peacock (Patio)': '#a855f7',
  'Banquet': '#8b5cf6',
};
