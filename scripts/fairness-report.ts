#!/usr/bin/env npx tsx
/**
 * Fairness Report Generator
 * Reads schedule data, computes 7-metric fairness scores per employee,
 * sends stats to Ollama Gemma 4 for a natural-language management report.
 *
 * Usage:
 *   npx tsx scripts/fairness-report.ts          # full run, current week
 *   npx tsx scripts/fairness-report.ts --test    # dry run with sample data
 *   npx tsx scripts/fairness-report.ts --weeks 4 # analyze last 4 weeks
 */

import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// ─── Config ──────────────────────────────────────────────────────────────────

const OLLAMA_URL = 'http://localhost:11434';
const MODEL = 'gemma4:31b';
const OLLAMA_TIMEOUT = 5 * 60 * 1000; // 5 min
const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const DATA_PATH = join(PROJECT_ROOT, 'public', 'schedule-data.json');
const LOG_DIR = join(__dirname, 'logs');

const isTest = process.argv.includes('--test');
const weeksArg = process.argv.findIndex(a => a === '--weeks');
const weeksBack = weeksArg !== -1 ? parseInt(process.argv[weeksArg + 1]) || 1 : 1;

// ─── Types ───────────────────────────────────────────────────────────────────

interface RawRecord {
  name: string;
  role: string;
  date: string;
  startTime: string;
  endTime: string;
  schedule: string;
  position: string;
  workgroup: string;
}

interface ProcessedRecord extends RawRecord {
  parsedDate: Date;
  isWorking: boolean;
  hours: number;
  cleanPosition: string;
  outlet: string;
  dayOfWeek: number;
}

// ─── Data Processing (ported from src/utils/dataProcessing.js) ───────────────

const POSITION_MAP: { patterns: string[]; clean: string }[] = [
  { patterns: ['BARTOP', 'BAR TOP', 'BAR'], clean: 'Bar Top' },
  { patterns: ['SVC WELL', 'SVC CWELL'], clean: 'Service Well' },
  { patterns: ['FLOOR', 'MID', 'MID / FLOOR'], clean: 'Floor' },
  { patterns: ['PATIO BAR'], clean: 'Patio Bar' },
  { patterns: ['KAPPO'], clean: 'Kappo' },
  { patterns: ['GOLDIES', "GOLDIE'S"], clean: 'Goldies' },
  { patterns: ['QUILL'], clean: 'Quill' },
  { patterns: ['CLOSER'], clean: 'Closer' },
  { patterns: ['SATELLITE BAR'], clean: 'Satellite Bar' },
  { patterns: ['Mixologist'], clean: 'Mixologist' },
  { patterns: ['PK BAR', 'PK'], clean: 'PK Bar' },
  { patterns: ['BARBACK'], clean: 'Barback' },
];

const OUTLET_RULES: { patterns: string[]; outlet: string }[] = [
  { patterns: ['KAPPO'], outlet: 'Kappo Kappo' },
  { patterns: ['GOLDIES', "GOLDIE'S"], outlet: 'Goldies' },
  { patterns: ['QUILL'], outlet: 'Quill' },
  { patterns: ['BNQT', 'BANQUET', 'BQT'], outlet: 'Banquet' },
  { patterns: ['PATIO BAR'], outlet: 'Peacock Patio' },
  { patterns: ['Mixologist'], outlet: 'Quill' },
];

function cleanPosition(raw: string): string {
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

function detectOutlet(raw: string): string {
  if (!raw) return 'Peacock';
  const upper = raw.toUpperCase();
  for (const { patterns, outlet } of OUTLET_RULES) {
    for (const p of patterns) {
      if (upper.includes(p.toUpperCase())) return outlet;
    }
  }
  return 'Peacock';
}

function parseTime(timeStr: string): number | null {
  if (!timeStr) return null;
  const match = timeStr.match(/^(\d+):(\d+)\s*([AP])/i);
  if (!match) return null;
  let h = parseInt(match[1]);
  const min = parseInt(match[2]);
  const p = match[3].toUpperCase();
  if (p === 'P' && h !== 12) h += 12;
  if (p === 'A' && h === 12) h = 0;
  return h + min / 60;
}

function calculateHours(startTime: string, endTime: string): number {
  const start = parseTime(startTime);
  const end = parseTime(endTime);
  if (start === null || end === null) return 0;
  let diff = end - start;
  if (diff <= 0) diff += 24;
  return diff;
}

function isWorkingShift(sched: string): boolean {
  if (!sched) return false;
  const s = sched.trim().toLowerCase();
  if (/^off/i.test(s) || /^req[.\s]*off/i.test(s) || s === 'rto' || s === 'off') return false;
  if (s.startsWith('offpsnl') || s.startsWith('offvac')) return false;
  if (s === 'req off' || s === 'req. off' || s === 'r/off') return false;
  return /\d+:\d+\s*[AP]/i.test(sched);
}

function parseDate(dateStr: string): Date {
  if (!dateStr) return new Date(NaN);
  if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  const [m, d, y] = dateStr.split('/').map(Number);
  return new Date(y, m - 1, d);
}

function isClosingShift(schedule: string): boolean {
  const match = schedule.match(/\d+:\d+\s*[AP]\s*-\s*(\d+:\d+\s*[AP])/i);
  if (!match) return false;
  const end = parseTime(match[1].trim());
  if (end === null) return false;
  return end <= 4; // 1am-4am = closing
}

const US_HOLIDAYS = [
  { month: 1, day: 1 }, { month: 7, day: 4 }, { month: 11, day: 27 },
  { month: 12, day: 24 }, { month: 12, day: 25 }, { month: 12, day: 31 },
  { month: 5, day: 26 }, { month: 9, day: 1 },
];

function isHoliday(d: Date): boolean {
  if (isNaN(d.getTime())) return false;
  const m = d.getMonth() + 1, day = d.getDate();
  return US_HOLIDAYS.some(h => h.month === m && h.day === day);
}

const DAY_VALUE: Record<number, number> = { 5: 5, 6: 5, 4: 4, 0: 3 };
const POSITION_VALUE: Record<string, number> = {
  'Bar Top': 5, 'Service Well': 4, 'Closer': 3, 'Floor': 2,
  'Barback': 1, 'Satellite Bar': 3, 'Patio Bar': 3,
};
const OUTLET_VALUE: Record<string, number> = {
  'Peacock': 5, 'Quill': 4, 'Goldies': 3, 'Banquet': 2,
  'Peacock Patio': 3, 'Kappo Kappo': 2,
};

function shiftPrimeValue(r: ProcessedRecord): number {
  const dayV = DAY_VALUE[r.dayOfWeek] ?? 2;
  const posV = POSITION_VALUE[r.cleanPosition] ?? 2;
  const outV = OUTLET_VALUE[r.outlet] ?? 2;
  return dayV * posV * outV;
}

// ─── Dedup (same logic as frontend) ──────────────────────────────────────────

function cleanWorkgroupName(wg: string): string {
  return (wg || '').replace(/^\d+\.\s*/, '').trim();
}

function workgroupPriority(wg: string): number {
  const clean = cleanWorkgroupName(wg);
  const order = ['Peacock Bar', 'Quill Room', 'Goldies Mixologist', 'Peacock Barback',
    'Peacock Hosts', 'Peacock Servers', 'Peacock Bussers', 'Peacock Runners'];
  const idx = order.indexOf(clean);
  return idx >= 0 ? idx : 99;
}

function deduplicateData(rawData: RawRecord[]): RawRecord[] {
  const byPersonDate: Record<string, RawRecord[]> = {};
  rawData.forEach(r => {
    const key = r.name + '|' + r.date;
    if (!byPersonDate[key]) byPersonDate[key] = [];
    byPersonDate[key].push(r);
  });

  const deduped: RawRecord[] = [];
  for (const records of Object.values(byPersonDate)) {
    if (records.length === 1) { deduped.push(records[0]); continue; }
    const byTimeSlot: Record<string, RawRecord[]> = {};
    records.forEach(r => {
      const timeKey = (r.startTime && r.endTime) ? `${r.startTime.trim()}|${r.endTime.trim()}` : r.schedule.trim();
      if (!byTimeSlot[timeKey]) byTimeSlot[timeKey] = [];
      byTimeSlot[timeKey].push(r);
    });
    const unique = Object.values(byTimeSlot).map(g =>
      [...g].sort((a, b) => workgroupPriority(a.workgroup) - workgroupPriority(b.workgroup))[0]
    );
    const working = unique.filter(r => isWorkingShift(r.schedule));
    if (working.length > 0) working.forEach(r => deduped.push(r));
    else deduped.push([...unique].sort((a, b) => workgroupPriority(a.workgroup) - workgroupPriority(b.workgroup))[0]);
  }
  return deduped;
}

// ─── Process ─────────────────────────────────────────────────────────────────

function processRecords(raw: RawRecord[]): ProcessedRecord[] {
  return raw.map(r => {
    const parsedDate = parseDate(r.date);
    return {
      ...r,
      parsedDate,
      isWorking: isWorkingShift(r.schedule),
      hours: calculateHours(r.startTime, r.endTime),
      cleanPosition: cleanPosition(r.position),
      outlet: detectOutlet(r.position),
      dayOfWeek: parsedDate.getDay(),
    };
  });
}

// ─── Scoring (matching FairnessScore.jsx) ────────────────────────────────────

function scoreDistribution(values: number[]): number {
  if (values.length < 2) return 100;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (mean === 0) return 100;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  const cv = Math.sqrt(variance) / mean;
  return Math.max(0, Math.round(100 - cv * 100));
}

function pctScore(values: number[], targetPct: number): number {
  if (values.length < 2) return 100;
  const diffs = values.map(v => Math.abs(v - targetPct));
  const avgDiff = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  return Math.max(0, Math.round(100 - avgDiff * 2));
}

interface EmployeeStats {
  name: string;
  totalShifts: number;
  weekendPct: number;
  closingPct: number;
  positionVariety: number;
  positions: string[];
  holidayCount: number;
  totalHours: number;
  avgPrimeValue: number;
  maxConsecutiveDays: number;
  consecutiveRange: string;
}

function computeFairness(working: ProcessedRecord[]) {
  const byEmp: Record<string, ProcessedRecord[]> = {};
  working.forEach(r => {
    if (!byEmp[r.name]) byEmp[r.name] = [];
    byEmp[r.name].push(r);
  });

  const empNames = Object.keys(byEmp);
  const employeeStats: EmployeeStats[] = [];

  const weekendPcts: number[] = [];
  const closingPcts: number[] = [];
  const posVarieties: number[] = [];
  const holidayCounts: number[] = [];
  const totalHoursArr: number[] = [];
  const avgPrimeValues: number[] = [];

  for (const name of empNames) {
    const shifts = byEmp[name];
    const weekendCount = shifts.filter(r => [0, 5, 6].includes(r.dayOfWeek)).length;
    const weekendPct = shifts.length > 0 ? (weekendCount / shifts.length) * 100 : 0;
    const closingCount = shifts.filter(r => isClosingShift(r.schedule)).length;
    const closingPct = shifts.length > 0 ? (closingCount / shifts.length) * 100 : 0;
    const posSet = new Set(shifts.map(r => r.cleanPosition).filter(p => p && p !== 'Unassigned'));
    const posVariety = posSet.size;
    const holidayCount = shifts.filter(r => isHoliday(r.parsedDate)).length;
    const totalHours = shifts.reduce((s, r) => s + r.hours, 0);
    const primeTotal = shifts.reduce((s, r) => s + shiftPrimeValue(r), 0);
    const avgPrime = shifts.length > 0 ? primeTotal / shifts.length : 0;

    // Consecutive days
    const dates = [...new Set(shifts.map(r => r.parsedDate.getTime()))].sort((a, b) => a - b);
    let maxStreak = 1, streak = 1, streakStart = 0, bestStart = 0;
    for (let i = 1; i < dates.length; i++) {
      if ((dates[i] - dates[i - 1]) / 86400000 === 1) {
        streak++;
        if (streak > maxStreak) { maxStreak = streak; bestStart = i - streak + 1; }
      } else { streak = 1; }
    }
    const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;
    const range = dates.length > 0 && maxStreak >= 5
      ? `${fmt(new Date(dates[bestStart]))} – ${fmt(new Date(dates[bestStart + maxStreak - 1]))}`
      : '';

    weekendPcts.push(weekendPct);
    closingPcts.push(closingPct);
    posVarieties.push(posVariety);
    holidayCounts.push(holidayCount);
    totalHoursArr.push(totalHours);
    avgPrimeValues.push(avgPrime);

    employeeStats.push({
      name, totalShifts: shifts.length,
      weekendPct: +weekendPct.toFixed(1),
      closingPct: +closingPct.toFixed(1),
      positionVariety: posVariety,
      positions: [...posSet],
      holidayCount, totalHours: +totalHours.toFixed(1),
      avgPrimeValue: +avgPrime.toFixed(1),
      maxConsecutiveDays: maxStreak,
      consecutiveRange: range,
    });
  }

  const idealWeekendPct = weekendPcts.reduce((a, b) => a + b, 0) / weekendPcts.length;
  const idealClosingPct = closingPcts.reduce((a, b) => a + b, 0) / closingPcts.length;

  const metrics = {
    weekendShare: { score: pctScore(weekendPcts, idealWeekendPct), weight: 25, avgPct: +idealWeekendPct.toFixed(1) },
    positionRotation: { score: scoreDistribution(posVarieties), weight: 20, avgVariety: +(posVarieties.reduce((a, b) => a + b, 0) / posVarieties.length).toFixed(1) },
    closingShifts: { score: pctScore(closingPcts, idealClosingPct), weight: 15, avgPct: +idealClosingPct.toFixed(1) },
    holidayCoverage: { score: scoreDistribution(holidayCounts), weight: 10 },
    hoursEquity: { score: scoreDistribution(totalHoursArr), weight: 15 },
    primeShiftAccess: { score: scoreDistribution(avgPrimeValues), weight: 15 },
  };

  const overallScore = Math.round(
    metrics.weekendShare.score * 0.25 +
    metrics.positionRotation.score * 0.20 +
    metrics.closingShifts.score * 0.15 +
    metrics.holidayCoverage.score * 0.10 +
    metrics.hoursEquity.score * 0.15 +
    metrics.primeShiftAccess.score * 0.15
  );

  const consecutiveAlerts = employeeStats
    .filter(e => e.maxConsecutiveDays >= 6)
    .map(e => ({ name: e.name, streak: e.maxConsecutiveDays, range: e.consecutiveRange }));

  return { overallScore, metrics, employeeStats, consecutiveAlerts, employeeCount: empNames.length };
}

// ─── Ollama ──────────────────────────────────────────────────────────────────

async function checkOllama(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch { return false; }
}

async function generateNarrative(stats: ReturnType<typeof computeFairness>, dateRange: string): Promise<string> {
  const prompt = `You are a scheduling analyst for a hospitality venue (bar/restaurant). Generate a concise, actionable weekly fairness report for management.

## Date Range: ${dateRange}
## Overall Fairness Score: ${stats.overallScore}/100
## Employees Analyzed: ${stats.employeeCount}

## Metric Scores (0-100, higher = fairer):
- Weekend Share (25% weight): ${stats.metrics.weekendShare.score} — avg ${stats.metrics.weekendShare.avgPct}% of shifts are weekends
- Position Rotation (20%): ${stats.metrics.positionRotation.score} — avg ${stats.metrics.positionRotation.avgVariety} positions/person
- Closing Shifts (15%): ${stats.metrics.closingShifts.score} — avg ${stats.metrics.closingShifts.avgPct}% of shifts are closes
- Holiday Coverage (10%): ${stats.metrics.holidayCoverage.score}
- Hours Equity (15%): ${stats.metrics.hoursEquity.score}
- Prime Shift Access (15%): ${stats.metrics.primeShiftAccess.score}

## Employee Data (sorted by total hours):
${stats.employeeStats
  .sort((a, b) => b.totalHours - a.totalHours)
  .map(e => `- ${e.name}: ${e.totalShifts} shifts, ${e.totalHours}h, weekend ${e.weekendPct}%, closing ${e.closingPct}%, positions: ${e.positions.join('/')}, holidays: ${e.holidayCount}, prime value: ${e.avgPrimeValue}`)
  .join('\n')}

## Consecutive Day Alerts (6+ days without break):
${stats.consecutiveAlerts.length > 0
  ? stats.consecutiveAlerts.map(a => `- ${a.name}: ${a.streak} consecutive days (${a.range})`).join('\n')
  : 'None'}

Write a management report with:
1. **Executive Summary** (2-3 sentences on overall fairness)
2. **Key Concerns** (who's getting disproportionate workload, who hasn't had weekends off, who always closes)
3. **Bright Spots** (what's working well)
4. **Recommendations** (3-5 specific, actionable changes)

Be direct and specific. Use employee names. This is for bar management, not corporate — keep the tone professional but human.`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT);

  try {
    const res = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, prompt, stream: false }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`Ollama returned ${res.status}: ${await res.text()}`);
    const data = await res.json() as { response: string };
    return data.response;
  } catch (err: any) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') throw new Error('Ollama timed out after 5 minutes');
    throw err;
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`🔍 Fairness Report Generator ${isTest ? '(TEST MODE)' : ''}`);

  // Check Ollama
  if (!isTest) {
    console.log('Checking Ollama...');
    const ok = await checkOllama();
    if (!ok) { console.error('❌ Ollama is not running at', OLLAMA_URL); process.exit(1); }
    console.log('✅ Ollama is running');
  }

  // Load data
  console.log('Loading schedule data...');
  if (!existsSync(DATA_PATH)) { console.error('❌ No data file at', DATA_PATH); process.exit(1); }
  const raw: RawRecord[] = JSON.parse(readFileSync(DATA_PATH, 'utf-8'));
  console.log(`  Loaded ${raw.length} raw records`);

  // Dedup
  const deduped = deduplicateData(raw);
  console.log(`  After dedup: ${deduped.length} records`);

  // Process
  const processed = processRecords(deduped);

  // Filter to date range
  const now = new Date();
  const endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - weeksBack * 7);

  const filtered = processed.filter(r =>
    r.isWorking && r.parsedDate >= startDate && r.parsedDate <= endDate
  );

  const dateRange = `${startDate.toLocaleDateString()} – ${endDate.toLocaleDateString()}`;
  console.log(`  Date range: ${dateRange} (${weeksBack} week${weeksBack > 1 ? 's' : ''})`);
  console.log(`  Working shifts in range: ${filtered.length}`);

  if (filtered.length === 0) {
    // Try last 4 weeks as fallback
    const fallbackStart = new Date(endDate);
    fallbackStart.setDate(fallbackStart.getDate() - 28);
    const fallback = processed.filter(r => r.isWorking && r.parsedDate >= fallbackStart && r.parsedDate <= endDate);
    if (fallback.length === 0) {
      // Use all data
      console.log('  ⚠️ No recent shifts found. Using full dataset for analysis.');
      const allWorking = processed.filter(r => r.isWorking);
      const dates = allWorking.map(r => r.parsedDate.getTime()).sort((a, b) => a - b);
      const actualStart = new Date(dates[0]);
      const actualEnd = new Date(dates[dates.length - 1]);
      return runAnalysis(allWorking,
        `${actualStart.toLocaleDateString()} – ${actualEnd.toLocaleDateString()}`);
    }
    return runAnalysis(fallback,
      `${fallbackStart.toLocaleDateString()} – ${endDate.toLocaleDateString()}`);
  }

  return runAnalysis(filtered, dateRange);
}

async function runAnalysis(working: ProcessedRecord[], dateRange: string) {
  console.log(`\nAnalyzing ${working.length} shifts across ${dateRange}...`);

  const stats = computeFairness(working);

  console.log(`\n📊 Overall Fairness Score: ${stats.overallScore}/100`);
  console.log(`   Weekend Share: ${stats.metrics.weekendShare.score}`);
  console.log(`   Position Rotation: ${stats.metrics.positionRotation.score}`);
  console.log(`   Closing Shifts: ${stats.metrics.closingShifts.score}`);
  console.log(`   Holiday Coverage: ${stats.metrics.holidayCoverage.score}`);
  console.log(`   Hours Equity: ${stats.metrics.hoursEquity.score}`);
  console.log(`   Prime Shift Access: ${stats.metrics.primeShiftAccess.score}`);

  if (stats.consecutiveAlerts.length > 0) {
    console.log(`\n⚠️  Consecutive Day Alerts:`);
    stats.consecutiveAlerts.forEach(a => console.log(`   ${a.name}: ${a.streak} days (${a.range})`));
  }

  // Generate narrative
  let narrative = '';
  if (isTest) {
    narrative = '[TEST MODE] Narrative generation skipped. Stats computed successfully.';
    console.log('\n📝 Test mode — skipping Ollama narrative generation');
  } else {
    console.log('\n📝 Generating narrative via Gemma 4...');
    narrative = await generateNarrative(stats, dateRange);
    console.log('✅ Narrative generated');
  }

  // Write output
  mkdirSync(LOG_DIR, { recursive: true });
  const today = new Date().toISOString().split('T')[0];
  const output = {
    generatedAt: new Date().toISOString(),
    dateRange,
    overallScore: stats.overallScore,
    metrics: stats.metrics,
    employeeStats: stats.employeeStats,
    consecutiveAlerts: stats.consecutiveAlerts,
    narrative,
  };

  const outPath = join(LOG_DIR, `fairness-report-${today}.json`);
  writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`\n✅ Report written to ${outPath}`);
}

main().catch(err => {
  console.error('❌ Fatal error:', err.message || err);
  process.exit(1);
});
