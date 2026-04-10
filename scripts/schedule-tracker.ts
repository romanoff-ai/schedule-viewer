#!/usr/bin/env npx tsx
/**
 * Daily Schedule Change Tracker
 * Scrapes OnTrack schedule via AJAX (cookies), compares against previous
 * snapshot, analyzes diffs with local Ollama Gemma 4, logs results.
 *
 * Usage:
 *   npx tsx scripts/schedule-tracker.ts              # full run
 *   npx tsx scripts/schedule-tracker.ts --test        # compare existing data against itself (expect 0 changes)
 *   npx tsx scripts/schedule-tracker.ts --force-snapshot  # save snapshot from cached data even if scrape fails
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// ─── Config ──────────────────────────────────────────────────────────────────

const OLLAMA_URL = 'http://localhost:11434';
const MODEL = 'gemma4:31b';
const OLLAMA_TIMEOUT = 5 * 60 * 1000; // 5 min
const ONTRACK_BASE = 'https://www.heathandco.com';
const AJAX_ENDPOINT = `${ONTRACK_BASE}/EmployeeAccess/DepartmentSchedule/Items`;
const SCRAPE_DELAY_MS = 200;
const SNAPSHOT_RETENTION_DAYS = 30;
const DAYS_AHEAD = 14;

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const DATA_PATH = join(PROJECT_ROOT, 'public', 'schedule-data.json');
const COOKIE_PATH = join(__dirname, 'schedule-tracker-cookies.json');
const SNAPSHOT_DIR = join(__dirname, 'schedule-snapshots');
const LOG_DIR = join(__dirname, 'schedule-logs');

const isTest = process.argv.includes('--test');
const forceSnapshot = process.argv.includes('--force-snapshot');

// ─── Workgroups to scrape ────────────────────────────────────────────────────

interface WorkgroupDef {
  workgroupId: string;
  workgroup: string;
  departmentId: string;
  department: string;
}

const WORKGROUPS: WorkgroupDef[] = [
  { workgroupId: '65906', workgroup: 'Peacock Bar', departmentId: '27409', department: 'The Peacock Lounge' },
  { workgroupId: '81129', workgroup: 'Peacock Barback', departmentId: '27409', department: 'The Peacock Lounge' },
  { workgroupId: '81185', workgroup: 'Peacock Lounge Manager', departmentId: '27409', department: 'The Peacock Lounge' },
  { workgroupId: '57484', workgroup: '1. Peacock Mgmt', departmentId: '27388', department: 'The Peacock' },
  { workgroupId: '57485', workgroup: '2. Peacock Hosts', departmentId: '27388', department: 'The Peacock' },
  { workgroupId: '57487', workgroup: '4. Peacock Servers', departmentId: '27388', department: 'The Peacock' },
  { workgroupId: '57488', workgroup: '5. Peacock Bussers', departmentId: '27388', department: 'The Peacock' },
  { workgroupId: '57489', workgroup: '6. Peacock Runners', departmentId: '27388', department: 'The Peacock' },
  { workgroupId: '57430', workgroup: '4. Banquet Bartenders', departmentId: '27392', department: 'Banquet' },
  { workgroupId: '57427', workgroup: '1. Banquet Captains', departmentId: '27392', department: 'Banquet' },
  { workgroupId: '57428', workgroup: '2. Banquet Servers', departmentId: '27392', department: 'Banquet' },
  { workgroupId: '65903', workgroup: '1. Goldies Mixologist', departmentId: '27394', department: 'Goldies' },
  { workgroupId: '57444', workgroup: '2. Goldies Runner', departmentId: '27394', department: 'Goldies' },
  { workgroupId: '59280', workgroup: "4. Goldie's Host", departmentId: '27394', department: 'Goldies' },
  { workgroupId: '65907', workgroup: 'Quill Room', departmentId: '29070', department: 'Quill Room' },
];

// ─── Types ───────────────────────────────────────────────────────────────────

interface ScheduleEntry {
  name: string;
  role: string;
  date: string;
  startTime: string;
  endTime: string;
  schedule: string;
  position: string;
  cellColor: string;
  workgroupId: string;
  workgroup: string;
  departmentId: string;
  department: string;
}

interface ShiftChange {
  name: string;
  date: string;
  workgroup?: string;
  before?: Partial<ScheduleEntry>;
  after?: Partial<ScheduleEntry>;
}

interface ChangeLog {
  date: string;
  comparedTo: string;
  totalChanges: number;
  added: ShiftChange[];
  removed: ShiftChange[];
  timeChanges: ShiftChange[];
  positionChanges: ShiftChange[];
  statusChanges: ShiftChange[];
  marshallImpacted: boolean;
  summary: string;
  rawDiff: { added: number; removed: number; timeChanges: number; positionChanges: number; statusChanges: number };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function ensureDir(dir: string) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function todayStr(): string {
  const d = new Date();
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }); // YYYY-MM-DD
}

function dateToOnTrackTimestamp(dateStr: string): number {
  // OnTrack encoding: Math.floor((new Date(y,m,d).getTime() - tz_offset) / 1000)
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return Math.floor((dt.getTime() - dt.getTimezoneOffset() * 60000) / 1000);
}

function getDatesAhead(days: number): string[] {
  const dates: string[] = [];
  const now = new Date();
  // Use Chicago time for "today"
  const chicagoNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
  for (let i = 0; i < days; i++) {
    const d = new Date(chicagoNow);
    d.setDate(d.getDate() + i);
    dates.push(d.toLocaleDateString('en-CA'));
  }
  return dates;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function shiftKey(entry: ScheduleEntry): string {
  return `${entry.name}|${entry.date}|${entry.workgroupId}`;
}

function isWorking(entry: ScheduleEntry): boolean {
  const s = (entry.schedule || '').toLowerCase();
  return s !== '' && s !== 'off' && s !== 'offpsnl' && s !== 'req. off' && !s.startsWith('off');
}

function isMarshall(name: string): boolean {
  const n = name.toLowerCase();
  return n.includes('marshall') || n.includes('kemp');
}

// ─── Cookie-based AJAX scrape ────────────────────────────────────────────────

interface CookieData {
  cookies: string;
  savedAt: string;
}

const CREDS_PATH = join(process.env.HOME || '~', '.openclaw', 'credentials.json');
const LOGIN_URL = 'https://www.heathandco.com/LaborProductivityTools/UserLogin.aspx';

function loadCookies(): string | null {
  try {
    if (!existsSync(COOKIE_PATH)) return null;
    const data: CookieData = JSON.parse(readFileSync(COOKIE_PATH, 'utf-8'));
    return data.cookies;
  } catch {
    return null;
  }
}

function saveCookies(cookies: string): void {
  writeFileSync(COOKIE_PATH, JSON.stringify({ cookies, savedAt: new Date().toISOString() }, null, 2));
}

/**
 * Login to OnTrack via HTTP POST and return auth cookies.
 * Performs a full ASP.NET WebForms login:
 * 1. GET login page -> extract __VIEWSTATE, __EVENTVALIDATION, __RequestVerificationToken, session cookies
 * 2. POST login form with credentials
 * 3. Extract auth cookies from Set-Cookie response headers
 */
async function loginAndGetCookies(): Promise<string | null> {
  try {
    if (!existsSync(CREDS_PATH)) {
      console.error('❌ No credentials.json found at', CREDS_PATH);
      return null;
    }
    const creds = JSON.parse(readFileSync(CREDS_PATH, 'utf-8'));
    const hc = creds.heathandco;
    if (!hc?.username || !hc?.password) {
      console.error('❌ Missing heathandco username/password in credentials.json');
      return null;
    }

    console.log('   🔐 Logging in to OnTrack...');

    // Step 1: GET login page to get form tokens and initial cookies
    const getResp = await fetch(LOGIN_URL, { redirect: 'manual' });
    const loginHtml = await getResp.text();

    // Extract form fields
    const extractField = (name: string): string => {
      const re = new RegExp(`name="${name}"[^>]*value="([^"]*)"`);
      const m = loginHtml.match(re);
      return m ? m[1] : '';
    };

    const viewState = extractField('__VIEWSTATE');
    const viewStateGen = extractField('__VIEWSTATEGENERATOR');
    const eventValidation = extractField('__EVENTVALIDATION');
    const reqToken = extractField('__RequestVerificationToken');

    // Extract initial cookies from GET response
    const setCookieHeaders = getResp.headers.getSetCookie?.() || [];
    const initialCookies: Record<string, string> = {};
    for (const sc of setCookieHeaders) {
      const [nameVal] = sc.split(';');
      const eqIdx = nameVal.indexOf('=');
      if (eqIdx > 0) {
        initialCookies[nameVal.substring(0, eqIdx)] = nameVal.substring(eqIdx + 1);
      }
    }

    // Build cookie string for POST
    const postCookieStr = Object.entries(initialCookies).map(([k, v]) => `${k}=${v}`).join('; ');

    // Step 2: POST login form
    const formData = new URLSearchParams({
      '__VIEWSTATE': viewState,
      '__VIEWSTATEGENERATOR': viewStateGen,
      '__EVENTVALIDATION': eventValidation,
      '__RequestVerificationToken': reqToken,
      'UserID': hc.username,
      'Password': hc.password,
      'Login': 'Login',
    });

    const postResp = await fetch(LOGIN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': postCookieStr,
      },
      body: formData.toString(),
      redirect: 'manual',
    });

    if (postResp.status !== 302) {
      console.error(`❌ Login failed — expected 302, got ${postResp.status}`);
      return null;
    }

    // Extract auth cookies from POST response
    const postSetCookies = postResp.headers.getSetCookie?.() || [];
    const authCookies: Record<string, string> = { ...initialCookies };
    for (const sc of postSetCookies) {
      const [nameVal] = sc.split(';');
      const eqIdx = nameVal.indexOf('=');
      if (eqIdx > 0) {
        authCookies[nameVal.substring(0, eqIdx)] = nameVal.substring(eqIdx + 1);
      }
    }

    const cookieStr = Object.entries(authCookies).map(([k, v]) => `${k}=${v}`).join('; ');
    console.log(`   ✅ Login successful — ${Object.keys(authCookies).length} cookies obtained`);

    // Save for potential reuse
    saveCookies(cookieStr);
    return cookieStr;
  } catch (err: any) {
    console.error('❌ Login error:', err.message);
    return null;
  }
}

async function scrapeAjax(cookies: string, dates: string[], workgroups: WorkgroupDef[]): Promise<ScheduleEntry[]> {
  const allEntries: ScheduleEntry[] = [];
  const now = Math.floor(Date.now() / 1000);

  for (const dateStr of dates) {
    const dateTs = dateToOnTrackTimestamp(dateStr);

    for (const wg of workgroups) {
      const url = `${AJAX_ENDPOINT}?t=${now}&date=${dateTs}&workgroupId=${wg.workgroupId}&departmentId=${wg.departmentId}`;

      try {
        const resp = await fetch(url, {
          headers: {
            'Cookie': cookies,
            'Accept': 'application/json, text/javascript, */*; q=0.01',
            'X-Requested-With': 'XMLHttpRequest',
          },
          redirect: 'manual',
        });

        if (resp.status === 401 || resp.status === 403 || resp.status === 302) {
          console.error(`❌ Auth failed (${resp.status}) — cookies expired`);
          return [];
        }

        if (!resp.ok) {
          console.warn(`⚠️  HTTP ${resp.status} for ${wg.workgroup} on ${dateStr}, skipping`);
          await sleep(SCRAPE_DELAY_MS);
          continue;
        }

        const html = await resp.text();

        // Check if we got redirected to login page
        if (html.includes('UserLogin') || html.includes('loginForm')) {
          console.error('❌ Redirected to login — cookies expired');
          return [];
        }

        // Parse the HTML table response
        const entries = parseScheduleHtml(html, dateStr, wg);
        allEntries.push(...entries);
      } catch (err: any) {
        console.warn(`⚠️  Fetch error for ${wg.workgroup} on ${dateStr}: ${err.message}`);
      }

      await sleep(SCRAPE_DELAY_MS);
    }
  }

  return allEntries;
}

function parseScheduleHtml(html: string, dateStr: string, wg: WorkgroupDef): ScheduleEntry[] {
  const entries: ScheduleEntry[] = [];

  // The AJAX response returns table rows with employee schedule data
  // Pattern: <td>Name (Role)</td><td style="background-color:#HEX">Schedule Info</td>
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;

  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const rowHtml = rowMatch[1];
    const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    const cells: string[] = [];
    let cellMatch;

    while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
      cells.push(cellMatch[1].replace(/<[^>]+>/g, '').trim());
    }

    if (cells.length < 2) continue;

    // First cell: "Name (Role)"
    const nameRoleMatch = cells[0].match(/^(.+?)\s*\(([^)]+)\)$/);
    if (!nameRoleMatch) continue;

    const name = nameRoleMatch[1].trim();
    const role = nameRoleMatch[2].trim();

    // Second cell: schedule info — could be "Off", "4:00 P - 1:00 A BARTOP", etc.
    const scheduleText = cells[1] || '';

    // Extract background color
    const colorMatch = rowHtml.match(/background-color:\s*(#[0-9A-Fa-f]{6})/);
    const cellColor = colorMatch ? colorMatch[1] : '#FFFFFF';

    // Parse schedule text
    let startTime = '';
    let endTime = '';
    let schedule = scheduleText;
    let position = '';

    const timeMatch = scheduleText.match(/(\d+:\d+\s*[AP])\s*-\s*(\d+:\d+\s*[AP])\s*(.*)/i);
    if (timeMatch) {
      startTime = timeMatch[1].trim();
      endTime = timeMatch[2].trim();
      position = timeMatch[3].trim();
      schedule = `${startTime} - ${endTime}`;
    }

    entries.push({
      name, role, date: dateStr, startTime, endTime,
      schedule, position, cellColor,
      workgroupId: wg.workgroupId, workgroup: wg.workgroup,
      departmentId: wg.departmentId, department: wg.department,
    });
  }

  return entries;
}

// ─── Snapshot management ─────────────────────────────────────────────────────

function saveSnapshot(date: string, data: ScheduleEntry[]) {
  ensureDir(SNAPSHOT_DIR);
  const path = join(SNAPSHOT_DIR, `${date}.json`);
  writeFileSync(path, JSON.stringify(data, null, 2));
  console.log(`📸 Saved snapshot: ${path} (${data.length} entries)`);

  // Prune old snapshots
  const files = readdirSync(SNAPSHOT_DIR).filter(f => f.endsWith('.json')).sort();
  while (files.length > SNAPSHOT_RETENTION_DAYS) {
    const old = files.shift()!;
    unlinkSync(join(SNAPSHOT_DIR, old));
    console.log(`🗑️  Pruned old snapshot: ${old}`);
  }
}

function loadSnapshot(date: string): ScheduleEntry[] | null {
  const path = join(SNAPSHOT_DIR, `${date}.json`);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf-8'));
}

function findPreviousSnapshot(beforeDate: string): { date: string; data: ScheduleEntry[] } | null {
  ensureDir(SNAPSHOT_DIR);
  const files = readdirSync(SNAPSHOT_DIR)
    .filter(f => f.endsWith('.json') && f < `${beforeDate}.json`)
    .sort()
    .reverse();

  if (files.length === 0) return null;
  const date = files[0].replace('.json', '');
  const data = JSON.parse(readFileSync(join(SNAPSHOT_DIR, files[0]), 'utf-8'));
  return { date, data };
}

// ─── Diff engine ─────────────────────────────────────────────────────────────

function compareSnapshots(today: ScheduleEntry[], yesterday: ScheduleEntry[]): Omit<ChangeLog, 'date' | 'comparedTo' | 'summary'> {
  const added: ShiftChange[] = [];
  const removed: ShiftChange[] = [];
  const timeChanges: ShiftChange[] = [];
  const positionChanges: ShiftChange[] = [];
  const statusChanges: ShiftChange[] = [];

  const todayMap = new Map<string, ScheduleEntry>();
  const yesterdayMap = new Map<string, ScheduleEntry>();

  for (const e of today) todayMap.set(shiftKey(e), e);
  for (const e of yesterday) yesterdayMap.set(shiftKey(e), e);

  // Check for added & changed
  for (const [key, curr] of todayMap) {
    const prev = yesterdayMap.get(key);
    if (!prev) {
      // New entry
      if (isWorking(curr)) {
        added.push({ name: curr.name, date: curr.date, workgroup: curr.workgroup, after: curr });
      }
      continue;
    }

    const currWorking = isWorking(curr);
    const prevWorking = isWorking(prev);

    // Status change (Off ↔ Working)
    if (currWorking !== prevWorking) {
      statusChanges.push({
        name: curr.name, date: curr.date, workgroup: curr.workgroup,
        before: { schedule: prev.schedule, startTime: prev.startTime, endTime: prev.endTime },
        after: { schedule: curr.schedule, startTime: curr.startTime, endTime: curr.endTime },
      });
      continue;
    }

    if (!currWorking) continue; // Both off, no change

    // Time change
    if (curr.startTime !== prev.startTime || curr.endTime !== prev.endTime) {
      timeChanges.push({
        name: curr.name, date: curr.date, workgroup: curr.workgroup,
        before: { startTime: prev.startTime, endTime: prev.endTime },
        after: { startTime: curr.startTime, endTime: curr.endTime },
      });
    }

    // Position change
    if (curr.position !== prev.position && (curr.position || prev.position)) {
      positionChanges.push({
        name: curr.name, date: curr.date, workgroup: curr.workgroup,
        before: { position: prev.position },
        after: { position: curr.position },
      });
    }
  }

  // Check for removed
  for (const [key, prev] of yesterdayMap) {
    if (!todayMap.has(key) && isWorking(prev)) {
      removed.push({ name: prev.name, date: prev.date, workgroup: prev.workgroup, before: prev });
    }
  }

  const totalChanges = added.length + removed.length + timeChanges.length + positionChanges.length + statusChanges.length;
  const marshallImpacted = [...added, ...removed, ...timeChanges, ...positionChanges, ...statusChanges]
    .some(c => isMarshall(c.name));

  return {
    totalChanges, added, removed, timeChanges, positionChanges, statusChanges,
    marshallImpacted,
    rawDiff: {
      added: added.length, removed: removed.length,
      timeChanges: timeChanges.length, positionChanges: positionChanges.length,
      statusChanges: statusChanges.length,
    },
  };
}

// ─── Ollama analysis ─────────────────────────────────────────────────────────

async function checkOllama(): Promise<boolean> {
  try {
    const resp = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(5000) });
    if (!resp.ok) return false;
    const data = await resp.json() as { models: { name: string }[] };
    return data.models?.some(m => m.name.includes('gemma4')) ?? false;
  } catch {
    return false;
  }
}

async function analyzeWithGemma(diff: Omit<ChangeLog, 'date' | 'comparedTo' | 'summary'>): Promise<string> {
  const prompt = `Here are the schedule changes between yesterday and today for a hospitality venue (The Peacock, Goldies, Quill Room, Banquet departments).

Summary: ${diff.totalChanges} total changes — ${diff.rawDiff.added} added, ${diff.rawDiff.removed} removed, ${diff.rawDiff.timeChanges} time changes, ${diff.rawDiff.positionChanges} position changes, ${diff.rawDiff.statusChanges} status changes.

${diff.added.length > 0 ? `ADDED SHIFTS:\n${diff.added.map(c => `  ${c.name} on ${c.date} (${c.workgroup}): ${c.after?.schedule || c.after?.startTime + '-' + c.after?.endTime}`).join('\n')}` : ''}
${diff.removed.length > 0 ? `REMOVED SHIFTS:\n${diff.removed.map(c => `  ${c.name} on ${c.date} (${c.workgroup}): was ${c.before?.schedule || c.before?.startTime + '-' + c.before?.endTime}`).join('\n')}` : ''}
${diff.timeChanges.length > 0 ? `TIME CHANGES:\n${diff.timeChanges.map(c => `  ${c.name} on ${c.date} (${c.workgroup}): ${c.before?.startTime}-${c.before?.endTime} → ${c.after?.startTime}-${c.after?.endTime}`).join('\n')}` : ''}
${diff.positionChanges.length > 0 ? `POSITION CHANGES:\n${diff.positionChanges.map(c => `  ${c.name} on ${c.date} (${c.workgroup}): ${c.before?.position} → ${c.after?.position}`).join('\n')}` : ''}
${diff.statusChanges.length > 0 ? `STATUS CHANGES:\n${diff.statusChanges.map(c => `  ${c.name} on ${c.date} (${c.workgroup}): "${c.before?.schedule}" → "${c.after?.schedule}"`).join('\n')}` : ''}

Summarize what changed in plain English. Be concise (2-4 paragraphs max).
Highlight anything that affects Marshall (employee name containing 'Marshall' or 'Kemp').
Flag any suspicious patterns (e.g., someone's shifts all getting removed, many last-minute changes).`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT);

    const resp = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, prompt, stream: false }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!resp.ok) {
      console.warn(`⚠️  Ollama returned ${resp.status}`);
      return `[Ollama error: HTTP ${resp.status}]`;
    }

    const data = await resp.json() as { response: string };
    return data.response?.trim() || '[Empty Ollama response]';
  } catch (err: any) {
    if (err.name === 'AbortError') return '[Ollama timed out after 5 minutes]';
    return `[Ollama error: ${err.message}]`;
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🗓️  Schedule Change Tracker — ${todayStr()}`);
  console.log(`   Mode: ${isTest ? 'TEST' : forceSnapshot ? 'FORCE-SNAPSHOT' : 'LIVE'}\n`);

  ensureDir(SNAPSHOT_DIR);
  ensureDir(LOG_DIR);

  const today = todayStr();
  let todayData: ScheduleEntry[];

  if (isTest) {
    // Test mode: use existing schedule-data.json
    console.log('📂 Loading existing schedule-data.json for test...');
    todayData = JSON.parse(readFileSync(DATA_PATH, 'utf-8'));
    console.log(`   Loaded ${todayData.length} entries`);

    // In test mode, save as today and compare against itself
    saveSnapshot(today, todayData);

    // Compare against itself — should be 0 changes
    const diff = compareSnapshots(todayData, todayData);
    console.log(`\n📊 Test Results: ${diff.totalChanges} changes (expected: 0)`);

    if (diff.totalChanges === 0) {
      console.log('✅ PASS — diff engine produces 0 changes when comparing identical data');
    } else {
      console.error('❌ FAIL — diff engine found phantom changes!');
      console.error(JSON.stringify(diff.rawDiff, null, 2));
    }

    // Also save a change log for the test
    const log: ChangeLog = {
      date: today, comparedTo: today,
      ...diff,
      summary: 'Test run — compared data against itself. 0 changes expected.',
    };
    const logPath = join(LOG_DIR, `changes-${today}.json`);
    writeFileSync(logPath, JSON.stringify(log, null, 2));
    console.log(`📝 Log saved: ${logPath}`);
    return;
  }

  // Live mode: try AJAX scrape
  let cookies = loadCookies();
  let scraped = false;
  const dates = getDatesAhead(DAYS_AHEAD);

  // Try saved cookies first
  if (cookies) {
    console.log('🍪 Found saved cookies, attempting AJAX scrape...');
    console.log(`   Scraping ${dates.length} days × ${WORKGROUPS.length} workgroups = ${dates.length * WORKGROUPS.length} requests`);

    todayData = await scrapeAjax(cookies, dates, WORKGROUPS);

    if (todayData.length > 0) {
      scraped = true;
      console.log(`✅ Scraped ${todayData.length} entries`);
    } else {
      console.warn('⚠️  Saved cookies failed — attempting fresh login...');
    }
  }

  // If saved cookies failed or missing, do a fresh login
  if (!scraped) {
    cookies = await loginAndGetCookies();
    if (cookies) {
      console.log(`   Scraping ${dates.length} days × ${WORKGROUPS.length} workgroups = ${dates.length * WORKGROUPS.length} requests`);
      todayData = await scrapeAjax(cookies, dates, WORKGROUPS);
      if (todayData.length > 0) {
        scraped = true;
        console.log(`✅ Scraped ${todayData.length} entries`);
      } else {
        console.warn('⚠️  Scrape returned 0 entries even after fresh login');
      }
    }
  }

  if (!scraped) {
    if (forceSnapshot) {
      console.log('📂 Force-snapshot: loading from schedule-data.json...');
      todayData = JSON.parse(readFileSync(DATA_PATH, 'utf-8'));
      console.log(`   Loaded ${todayData.length} entries`);
    } else {
      console.error('❌ Could not scrape schedule. Check credentials in ~/.openclaw/credentials.json');
      console.error('   Or use --force-snapshot to save from cached data.');
      process.exit(1);
    }
  }

  // Save snapshot
  saveSnapshot(today, todayData!);

  // Find previous snapshot
  const prev = findPreviousSnapshot(today);
  if (!prev) {
    console.log('\n📌 First run — no previous snapshot to compare against.');
    console.log('   Run again tomorrow (or with different data) to see changes.');
    return;
  }

  console.log(`\n🔍 Comparing ${today} vs ${prev.date}...`);
  const diff = compareSnapshots(todayData!, prev.data);

  console.log(`\n📊 Results:`);
  console.log(`   Total changes: ${diff.totalChanges}`);
  console.log(`   Added: ${diff.rawDiff.added} | Removed: ${diff.rawDiff.removed}`);
  console.log(`   Time: ${diff.rawDiff.timeChanges} | Position: ${diff.rawDiff.positionChanges} | Status: ${diff.rawDiff.statusChanges}`);
  console.log(`   Marshall impacted: ${diff.marshallImpacted ? '⚠️  YES' : '✅ No'}`);

  // Ollama analysis
  let summary = 'No schedule changes detected.';
  if (diff.totalChanges > 0) {
    const ollamaOk = await checkOllama();
    if (ollamaOk) {
      console.log('\n🤖 Analyzing with Gemma 4...');
      summary = await analyzeWithGemma(diff);
      console.log(`\n💬 Summary:\n${summary}`);
    } else {
      console.warn('⚠️  Ollama not available — skipping LLM analysis');
      summary = `${diff.totalChanges} changes detected. ${diff.rawDiff.added} shifts added, ${diff.rawDiff.removed} removed, ${diff.rawDiff.timeChanges} time changes, ${diff.rawDiff.positionChanges} position changes, ${diff.rawDiff.statusChanges} status changes.${diff.marshallImpacted ? ' ⚠️ Marshall is affected.' : ''}`;
    }
  } else {
    console.log('\n✅ No schedule changes detected.');
  }

  // Save change log
  const log: ChangeLog = {
    date: today, comparedTo: prev.date,
    ...diff,
    summary,
  };
  const logPath = join(LOG_DIR, `changes-${today}.json`);
  writeFileSync(logPath, JSON.stringify(log, null, 2));
  console.log(`\n📝 Log saved: ${logPath}`);
}

main().catch(err => {
  console.error('💥 Fatal error:', err);
  process.exit(1);
});
