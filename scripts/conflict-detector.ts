#!/usr/bin/env npx tsx
/**
 * Schedule Conflict Detector
 * Detects clopens, >5 consecutive days, >40h weeks, and
 * "always closing" patterns. Sends to Ollama Gemma 4 for narrative summary.
 *
 * Usage:
 *   npx tsx scripts/conflict-detector.ts          # full run, current week
 *   npx tsx scripts/conflict-detector.ts --test    # dry run, no Ollama
 *   npx tsx scripts/conflict-detector.ts --weeks 4 # analyze last 4 weeks
 */

import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// ─── Config ──────────────────────────────────────────────────────────────────

const OLLAMA_URL = process.env.OLLAMA_HOST || 'http://169.254.202.173:11434';
const MODEL = 'gemma4:31b';
const OLLAMA_TIMEOUT = 20 * 60 * 1000;
const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const DATA_PATH = join(PROJECT_ROOT, 'public', 'schedule-data.json');
const LOG_DIR = join(__dirname, 'logs');

const isTest = process.argv.includes('--test');
const weeksArg = process.argv.findIndex(a => a === '--weeks');
const weeksBack = weeksArg !== -1 ? parseInt(process.argv[weeksArg + 1]) || 1 : 1;

// ─── Types ───────────────────────────────────────────────────────────────────

interface RawRecord {
  name: string; role: string; date: string;
  startTime: string; endTime: string; schedule: string;
  position: string; workgroup: string;
}

interface ProcessedRecord extends RawRecord {
  parsedDate: Date; isWorking: boolean; hours: number;
  startHour: number | null; endHour: number | null;
  isClosing: boolean; dayOfWeek: number;
}

interface Conflict {
  type: 'clopen' | 'consecutive' | 'overtime' | 'always-closing';
  severity: 'high' | 'medium' | 'low';
  employee: string;
  details: string;
  dates?: string;
}

// ─── Data Processing ─────────────────────────────────────────────────────────

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
  return end <= 4;
}

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

function processRecords(raw: RawRecord[]): ProcessedRecord[] {
  return raw.map(r => {
    const parsedDate = parseDate(r.date);
    return {
      ...r, parsedDate,
      isWorking: isWorkingShift(r.schedule),
      hours: calculateHours(r.startTime, r.endTime),
      startHour: parseTime(r.startTime),
      endHour: parseTime(r.endTime),
      isClosing: isClosingShift(r.schedule),
      dayOfWeek: parsedDate.getDay(),
    };
  });
}

// ─── Conflict Detection ──────────────────────────────────────────────────────

function detectConflicts(working: ProcessedRecord[]): Conflict[] {
  const conflicts: Conflict[] = [];
  const byEmp: Record<string, ProcessedRecord[]> = {};
  working.forEach(r => {
    if (!byEmp[r.name]) byEmp[r.name] = [];
    byEmp[r.name].push(r);
  });

  const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;

  for (const [name, shifts] of Object.entries(byEmp)) {
    const sorted = [...shifts].sort((a, b) => a.parsedDate.getTime() - b.parsedDate.getTime());

    // ── 1. Clopens (close one night → open next morning) ─────────────────
    for (let i = 0; i < sorted.length - 1; i++) {
      const today = sorted[i];
      const tomorrow = sorted[i + 1];
      const dayDiff = (tomorrow.parsedDate.getTime() - today.parsedDate.getTime()) / 86400000;
      if (dayDiff !== 1) continue;

      // Today ends late (closing shift, end <= 4am) and tomorrow starts early (before 2pm)
      if (today.isClosing && tomorrow.startHour !== null && tomorrow.startHour < 14) {
        const gap = tomorrow.startHour + (24 - (today.endHour || 0));
        const severity = gap < 8 ? 'high' : gap < 10 ? 'medium' : 'low';
        if (gap < 12) {
          conflicts.push({
            type: 'clopen', severity, employee: name,
            details: `Close→Open with ~${gap.toFixed(1)}h gap. Closed ${today.schedule} on ${fmt(today.parsedDate)}, opens ${tomorrow.schedule} on ${fmt(tomorrow.parsedDate)}`,
            dates: `${fmt(today.parsedDate)}–${fmt(tomorrow.parsedDate)}`,
          });
        }
      }
    }

    // ── 2. Consecutive days (>5) ─────────────────────────────────────────
    const uniqueDates = [...new Set(sorted.map(r => r.parsedDate.getTime()))].sort((a, b) => a - b);
    let streak = 1, streakStart = 0;
    for (let i = 1; i < uniqueDates.length; i++) {
      if ((uniqueDates[i] - uniqueDates[i - 1]) / 86400000 === 1) {
        streak++;
      } else {
        if (streak > 5) {
          const start = new Date(uniqueDates[i - streak]);
          const end = new Date(uniqueDates[i - 1]);
          conflicts.push({
            type: 'consecutive',
            severity: streak >= 8 ? 'high' : streak >= 7 ? 'medium' : 'low',
            employee: name,
            details: `${streak} consecutive days without a day off`,
            dates: `${fmt(start)} – ${fmt(end)}`,
          });
        }
        streak = 1;
      }
    }
    // Check final streak
    if (streak > 5) {
      const start = new Date(uniqueDates[uniqueDates.length - streak]);
      const end = new Date(uniqueDates[uniqueDates.length - 1]);
      conflicts.push({
        type: 'consecutive',
        severity: streak >= 8 ? 'high' : streak >= 7 ? 'medium' : 'low',
        employee: name,
        details: `${streak} consecutive days without a day off`,
        dates: `${fmt(start)} – ${fmt(end)}`,
      });
    }

    // ── 3. Overtime weeks (>40h) ─────────────────────────────────────────
    // Group by ISO week
    const byWeek: Record<string, ProcessedRecord[]> = {};
    sorted.forEach(r => {
      const d = new Date(r.parsedDate);
      // Get Monday of the week
      const day = d.getDay();
      const mon = new Date(d);
      mon.setDate(mon.getDate() - ((day + 6) % 7));
      const weekKey = `${mon.getFullYear()}-${String(mon.getMonth() + 1).padStart(2, '0')}-${String(mon.getDate()).padStart(2, '0')}`;
      if (!byWeek[weekKey]) byWeek[weekKey] = [];
      byWeek[weekKey].push(r);
    });

    for (const [weekStart, weekShifts] of Object.entries(byWeek)) {
      const totalHours = weekShifts.reduce((s, r) => s + r.hours, 0);
      if (totalHours > 40) {
        conflicts.push({
          type: 'overtime',
          severity: totalHours > 50 ? 'high' : totalHours > 45 ? 'medium' : 'low',
          employee: name,
          details: `${totalHours.toFixed(1)}h in week of ${weekStart} (${weekShifts.length} shifts)`,
          dates: `Week of ${weekStart}`,
        });
      }
    }

    // ── 4. Always closing ────────────────────────────────────────────────
    const closingCount = sorted.filter(r => r.isClosing).length;
    const closingPct = sorted.length > 0 ? (closingCount / sorted.length) * 100 : 0;
    if (closingPct > 60 && closingCount >= 3) {
      conflicts.push({
        type: 'always-closing',
        severity: closingPct > 80 ? 'high' : closingPct > 70 ? 'medium' : 'low',
        employee: name,
        details: `Closing ${closingPct.toFixed(0)}% of shifts (${closingCount}/${sorted.length})`,
      });
    }
  }

  // Sort by severity
  const severityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
  conflicts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return conflicts;
}

// ─── Ollama ──────────────────────────────────────────────────────────────────

async function checkOllama(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch { return false; }
}

async function generateSummary(conflicts: Conflict[], dateRange: string): Promise<string> {
  const bySeverity = {
    high: conflicts.filter(c => c.severity === 'high'),
    medium: conflicts.filter(c => c.severity === 'medium'),
    low: conflicts.filter(c => c.severity === 'low'),
  };

  const byType = {
    clopen: conflicts.filter(c => c.type === 'clopen'),
    consecutive: conflicts.filter(c => c.type === 'consecutive'),
    overtime: conflicts.filter(c => c.type === 'overtime'),
    'always-closing': conflicts.filter(c => c.type === 'always-closing'),
  };

  const prompt = `You are a scheduling analyst for a hospitality venue (bar/restaurant). Analyze these schedule conflicts and write a management summary with severity ratings.

## Date Range: ${dateRange}
## Total Conflicts: ${conflicts.length}
## By Severity: ${bySeverity.high.length} HIGH, ${bySeverity.medium.length} MEDIUM, ${bySeverity.low.length} LOW

## Clopens (Close→Open, ${byType.clopen.length} found):
${byType.clopen.length > 0 ? byType.clopen.map(c => `- [${c.severity.toUpperCase()}] ${c.employee}: ${c.details}`).join('\n') : 'None'}

## Consecutive Days >5 (${byType.consecutive.length} found):
${byType.consecutive.length > 0 ? byType.consecutive.map(c => `- [${c.severity.toUpperCase()}] ${c.employee}: ${c.details} (${c.dates})`).join('\n') : 'None'}

## Overtime >40h/week (${byType.overtime.length} found):
${byType.overtime.length > 0 ? byType.overtime.map(c => `- [${c.severity.toUpperCase()}] ${c.employee}: ${c.details}`).join('\n') : 'None'}

## Always Closing (${byType['always-closing'].length} found):
${byType['always-closing'].length > 0 ? byType['always-closing'].map(c => `- [${c.severity.toUpperCase()}] ${c.employee}: ${c.details}`).join('\n') : 'None'}

Write a conflict report with:
1. **Summary** (2-3 sentences — how healthy is this schedule?)
2. **Critical Issues** (HIGH severity — must fix immediately)
3. **Watch Items** (MEDIUM — fix when possible)
4. **Minor Notes** (LOW — awareness only)
5. **Top 3 Actions** (specific fixes with employee names)

Be direct. Use employee names. Keep it concise. This is for bar management — professional but human tone.`;

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
  console.log(`🔍 Schedule Conflict Detector ${isTest ? '(TEST MODE)' : ''}`);

  if (!isTest) {
    console.log('Checking Ollama...');
    const ok = await checkOllama();
    if (!ok) { console.error('❌ Ollama is not running at', OLLAMA_URL); process.exit(1); }
    console.log('✅ Ollama is running');
  }

  console.log('Loading schedule data...');
  if (!existsSync(DATA_PATH)) { console.error('❌ No data file at', DATA_PATH); process.exit(1); }
  const raw: RawRecord[] = JSON.parse(readFileSync(DATA_PATH, 'utf-8'));
  console.log(`  Loaded ${raw.length} raw records`);

  const deduped = deduplicateData(raw);
  console.log(`  After dedup: ${deduped.length} records`);

  const processed = processRecords(deduped);

  // Filter to date range
  const now = new Date();
  const endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - weeksBack * 7);

  let filtered = processed.filter(r =>
    r.isWorking && r.parsedDate >= startDate && r.parsedDate <= endDate
  );

  let dateRange = `${startDate.toLocaleDateString()} – ${endDate.toLocaleDateString()}`;
  console.log(`  Date range: ${dateRange} (${weeksBack} week${weeksBack > 1 ? 's' : ''})`);
  console.log(`  Working shifts in range: ${filtered.length}`);

  if (filtered.length === 0) {
    // Fallback: use all data
    console.log('  ⚠️ No recent shifts found. Using full dataset.');
    filtered = processed.filter(r => r.isWorking);
    const dates = filtered.map(r => r.parsedDate.getTime()).sort((a, b) => a - b);
    if (dates.length === 0) { console.error('❌ No working shifts in dataset'); process.exit(1); }
    dateRange = `${new Date(dates[0]).toLocaleDateString()} – ${new Date(dates[dates.length - 1]).toLocaleDateString()}`;
  }

  console.log(`\nDetecting conflicts across ${filtered.length} shifts...`);
  const conflicts = detectConflicts(filtered);

  const high = conflicts.filter(c => c.severity === 'high').length;
  const medium = conflicts.filter(c => c.severity === 'medium').length;
  const low = conflicts.filter(c => c.severity === 'low').length;

  console.log(`\n🚨 Conflicts Found: ${conflicts.length}`);
  console.log(`   HIGH: ${high} | MEDIUM: ${medium} | LOW: ${low}`);
  console.log(`   Clopens: ${conflicts.filter(c => c.type === 'clopen').length}`);
  console.log(`   Consecutive >5: ${conflicts.filter(c => c.type === 'consecutive').length}`);
  console.log(`   Overtime >40h: ${conflicts.filter(c => c.type === 'overtime').length}`);
  console.log(`   Always Closing: ${conflicts.filter(c => c.type === 'always-closing').length}`);

  // Top 5 high-severity
  if (high > 0) {
    console.log('\n🔴 Top HIGH conflicts:');
    conflicts.filter(c => c.severity === 'high').slice(0, 5).forEach(c =>
      console.log(`   [${c.type}] ${c.employee}: ${c.details}`)
    );
  }

  // Generate narrative
  let narrative = '';
  if (isTest) {
    narrative = '[TEST MODE] Narrative generation skipped. Conflict detection completed successfully.';
    console.log('\n📝 Test mode — skipping Ollama narrative generation');
  } else {
    console.log('\n📝 Generating conflict summary via Gemma 4...');
    narrative = await generateSummary(conflicts, dateRange);
    console.log('✅ Narrative generated');
  }

  // Write output
  mkdirSync(LOG_DIR, { recursive: true });
  const today = new Date().toISOString().split('T')[0];
  const output = {
    generatedAt: new Date().toISOString(),
    dateRange,
    summary: { total: conflicts.length, high, medium, low },
    byType: {
      clopens: conflicts.filter(c => c.type === 'clopen').length,
      consecutive: conflicts.filter(c => c.type === 'consecutive').length,
      overtime: conflicts.filter(c => c.type === 'overtime').length,
      alwaysClosing: conflicts.filter(c => c.type === 'always-closing').length,
    },
    conflicts,
    narrative,
  };

  const outPath = join(LOG_DIR, `conflicts-${today}.json`);
  writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`\n✅ Report written to ${outPath}`);
}

main().catch(err => {
  console.error('❌ Fatal error:', err.message || err);
  process.exit(1);
});
