#!/usr/bin/env node
/**
 * OnTrack Schedule Scraper v2
 * - Incremental saves per workgroup
 * - Correct login flow
 * - Correct HTML parser
 */

import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CREDENTIALS = {
  username: 'kemp.marshall@gmail.com',
  password: 'FlowerPower69!'
};

const BASE_URL = 'https://heathandco.com';

// All workgroups discovered
const WORKGROUPS = [
  // The Peacock (27388)
  { id: '57484', name: 'Peacock-Mgmt', displayName: '1. Peacock Mgmt', deptId: '27388', deptName: 'The Peacock' },
  { id: '57485', name: 'Peacock-Hosts', displayName: '2. Peacock Hosts', deptId: '27388', deptName: 'The Peacock' },
  { id: '57487', name: 'Peacock-Servers', displayName: '4. Peacock Servers', deptId: '27388', deptName: 'The Peacock' },
  { id: '57488', name: 'Peacock-Bussers', displayName: '5. Peacock Bussers', deptId: '27388', deptName: 'The Peacock' },
  { id: '57489', name: 'Peacock-Runners', displayName: '6. Peacock Runners', deptId: '27388', deptName: 'The Peacock' },
  { id: '83769', name: 'Peacock-Barista', displayName: 'Peacock Barista', deptId: '27388', deptName: 'The Peacock' },
  // The Peacock Lounge (27409)
  { id: '65906', name: 'Peacock-Bar', displayName: 'Peacock Bar', deptId: '27409', deptName: 'The Peacock Lounge' },
  { id: '81129', name: 'Peacock-Barback', displayName: 'Peacock Barback', deptId: '27409', deptName: 'The Peacock Lounge' },
  { id: '81185', name: 'Peacock-Lounge-Manager', displayName: 'Peacock Lounge Manager', deptId: '27409', deptName: 'The Peacock Lounge' },
  // Banquet (27392)
  { id: '57427', name: 'Banquet-Captains', displayName: '1. Banquet Captains', deptId: '27392', deptName: 'Banquet' },
  { id: '57428', name: 'Banquet-Servers', displayName: '2. Banquet Servers', deptId: '27392', deptName: 'Banquet' },
  { id: '57429', name: 'Banquet-Housepersons', displayName: '3. Banquet Housepersons', deptId: '27392', deptName: 'Banquet' },
  { id: '57430', name: 'Banquet-Bartenders', displayName: '4. Banquet Bartenders', deptId: '27392', deptName: 'Banquet' },
  // Goldies (27394)
  { id: '65903', name: 'Goldies-Mixologist', displayName: '1. Goldies Mixologist', deptId: '27394', deptName: 'Goldies' },
  { id: '57444', name: 'Goldies-Runner', displayName: '2. Goldies Runner', deptId: '27394', deptName: 'Goldies' },
  { id: '57445', name: 'Goldies-Servers', displayName: '3. Goldies Servers', deptId: '27394', deptName: 'Goldies' },
  { id: '59280', name: 'Goldies-Host', displayName: '4. Goldies Host', deptId: '27394', deptName: 'Goldies' },
  // Quill Room (29070)
  { id: '65907', name: 'Quill-Room', displayName: 'Quill Room', deptId: '29070', deptName: 'Quill Room' },
];

const RESULTS_DIR = path.join(process.env.HOME, 'Projects/schedule-viewer/scrape-results');
const PUBLIC_DIR = path.join(process.env.HOME, 'Projects/schedule-viewer/public');

// Generate all dates from Jan 1 2024 to Mar 29 2026
function generateDates() {
  const dates = [];
  const end = new Date(2026, 2, 29);
  let cur = new Date(2024, 0, 1);
  while (cur <= end) {
    dates.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

function encodeDate(d) {
  return Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 1000);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function request(urlStr, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const reqOptions = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method: options.method || 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        ...(options.headers || {})
      }
    };
    const req = https.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

function parseCookies(h) {
  if (!h) return {};
  const arr = Array.isArray(h) ? h : [h];
  const c = {};
  for (const hdr of arr) {
    const parts = hdr.split(';')[0].split('=');
    if (parts.length >= 2) c[parts[0].trim()] = parts.slice(1).join('=').trim();
  }
  return c;
}

function joinCookies(c) {
  return Object.entries(c).map(([k, v]) => `${k}=${v}`).join('; ');
}

let sessionCookies = {};

async function login() {
  console.log('Logging in to OnTrack...');
  sessionCookies = {};

  // Step 1: POST username to get session cookie
  const b1 = new URLSearchParams({
    Username: CREDENTIALS.username,
    RememberMe: 'false'
  }).toString();

  const r1 = await request(`${BASE_URL}/LaborProductivityTools/AppLogin/`, {
    method: 'POST',
    body: b1,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(b1)
    }
  });
  Object.assign(sessionCookies, parseCookies(r1.headers['set-cookie']));

  // Step 2: POST password
  const b2 = new URLSearchParams({
    Username: CREDENTIALS.username,
    Password: CREDENTIALS.password,
    RememberMe: 'false'
  }).toString();

  const r2 = await request(`${BASE_URL}/LaborProductivityTools/AppLogin/Password`, {
    method: 'POST',
    body: b2,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(b2),
      'Cookie': joinCookies(sessionCookies),
      'Referer': `${BASE_URL}/LaborProductivityTools/AppLogin/Password`
    }
  });
  Object.assign(sessionCookies, parseCookies(r2.headers['set-cookie']));

  // Step 3: Follow redirect to establish full session
  const r3 = await request(`${BASE_URL}/EmployeeAccess/`, {
    headers: { 'Cookie': joinCookies(sessionCookies) }
  });
  Object.assign(sessionCookies, parseCookies(r3.headers['set-cookie']));

  // Verify
  const verify = await request(`${BASE_URL}/EmployeeAccess/DepartmentSchedule`, {
    headers: { 'Cookie': joinCookies(sessionCookies) }
  });
  Object.assign(sessionCookies, parseCookies(verify.headers['set-cookie']));

  if (verify.body.includes('Logout')) {
    console.log('✅ Login successful');
    return true;
  }

  console.log('❌ Login failed');
  return false;
}

async function fetchScheduleItems(workgroupId, deptId, dateEncoded) {
  const now = Date.now();
  const url = `${BASE_URL}/EmployeeAccess/DepartmentSchedule/Items?t=${now}&date=${dateEncoded}&workgroupId=${workgroupId}&departmentId=${deptId}`;

  const resp = await request(url, {
    headers: {
      'Cookie': joinCookies(sessionCookies),
      'X-Requested-With': 'XMLHttpRequest',
      'Referer': `${BASE_URL}/EmployeeAccess/DepartmentSchedule`
    }
  });

  if (resp.headers['set-cookie']) {
    Object.assign(sessionCookies, parseCookies(resp.headers['set-cookie']));
  }

  // Session expired
  if (resp.status === 302 || resp.body.includes('/AppLogin/') || resp.body.includes('Object moved')) {
    console.log('\n  ⚠️  Session expired, re-logging in...');
    const ok = await login();
    if (!ok) throw new Error('Re-login failed');
    return fetchScheduleItems(workgroupId, deptId, dateEncoded);
  }

  return resp.body;
}

/**
 * Parse OnTrack schedule HTML into records
 * HTML format:
 * <td class="cell-padding">
 *   <div class="col-sm-6 div-padding">First Last (Role)</div>
 * </td>
 * <td data-cell-color="#..." class="cell-padding">
 *   <div class="col-sm-6 div-padding">10:00 A - 5:00 P\nPOSITION</div>
 * </td>
 */
function parseOnTrackHTML(html, date, workgroupId, workgroupName, deptId, deptName) {
  if (!html || html.trim() === '' || html.includes('No schedule shifts found')) {
    return [];
  }

  const records = [];

  // Extract all table rows
  // Each row has: name cell + schedule cell
  const rowPattern = /<tr>([\s\S]*?)<\/tr>/g;
  let rowMatch;

  while ((rowMatch = rowPattern.exec(html)) !== null) {
    const rowHtml = rowMatch[1];

    // Extract cells
    const cellPattern = /<td[^>]*>([\s\S]*?)<\/td>/g;
    const cells = [];
    let cellMatch;
    while ((cellMatch = cellPattern.exec(rowHtml)) !== null) {
      // Strip HTML tags and clean up text
      const text = cellMatch[1]
        .replace(/<[^>]+>/g, '\n')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&nbsp;/g, ' ')
        .split('\n')
        .map(s => s.trim())
        .filter(s => s.length > 0);
      cells.push(text);
    }

    if (cells.length < 2) continue;

    // First cell = employee name(s)
    // Second cell = schedule info
    const nameLine = cells[0][0] || '';
    const schedLine = cells[1][0] || '';

    if (!nameLine || nameLine === 'Name') continue; // skip header

    // Parse name - format: "First Last (Role)" or "First Last"
    const nameMatch = nameLine.match(/^(.+?)(?:\s*\([^)]+\))?$/);
    if (!nameMatch) continue;

    const fullName = nameMatch[1].trim();
    const roleMatch = nameLine.match(/\(([^)]+)\)/);
    const role = roleMatch ? roleMatch[1].trim() : '';

    // Parse schedule - format: "10:00 A - 5:00 P" or "OffPsnl" etc
    let startTime = '';
    let endTime = '';
    let position = '';

    // Get color from the cell (for off/holiday detection)
    const colorMatch = rowHtml.match(/data-cell-color="([^"]+)"/);
    const cellColor = colorMatch ? colorMatch[1] : '';

    // Parse time range
    const timeMatch = schedLine.match(/(\d{1,2}:\d{2}\s*[AP])\s*[-–]\s*(\d{1,2}:\d{2}\s*[AP])/i);
    if (timeMatch) {
      startTime = timeMatch[1].trim();
      endTime = timeMatch[2].trim();
    }

    // Get position (second line of schedule cell if it exists)
    if (cells[1].length > 1) {
      position = cells[1].slice(1).join(', ');
    }

    records.push({
      name: fullName,
      role: role,
      date: date,
      startTime: startTime,
      endTime: endTime,
      schedule: schedLine,
      position: position,
      cellColor: cellColor,
      workgroupId: workgroupId,
      workgroup: workgroupName,
      departmentId: deptId,
      department: deptName
    });
  }

  return records;
}

async function scrapeWorkgroup(wg, allDates, wgIndex, totalWgs) {
  const outFile = path.join(RESULTS_DIR, `${wg.name}.json`);

  // Check if already done
  if (fs.existsSync(outFile)) {
    const existing = JSON.parse(fs.readFileSync(outFile, 'utf8'));
    console.log(`[${wgIndex + 1}/${totalWgs}] ${wg.displayName}: Already done (${existing.length} records). Skipping.`);
    return existing;
  }

  console.log(`\n[${wgIndex + 1}/${totalWgs}] Scraping: ${wg.displayName} (wg:${wg.id} dept:${wg.deptId})`);

  const records = [];
  let errorCount = 0;
  let consecutiveErrors = 0;

  for (let i = 0; i < allDates.length; i++) {
    const d = allDates[i];
    const encoded = encodeDate(d);
    const dateStr = d.toISOString().split('T')[0];

    try {
      const html = await fetchScheduleItems(wg.id, wg.deptId, encoded);
      const dayRecords = parseOnTrackHTML(html, dateStr, wg.id, wg.displayName, wg.deptId, wg.deptName);
      records.push(...dayRecords);
      consecutiveErrors = 0;

      if (i % 50 === 0) {
        const pct = Math.round((i / allDates.length) * 100);
        process.stdout.write(`  [${pct}%] ${i}/${allDates.length} dates | ${records.length} records\r`);
      }
    } catch (err) {
      errorCount++;
      consecutiveErrors++;
      if (consecutiveErrors >= 5) {
        console.log(`\n  ⚠️  ${consecutiveErrors} consecutive errors, re-logging in...`);
        await login();
        consecutiveErrors = 0;
        // Retry this date
        i--;
        await sleep(1000);
      }
    }

    await sleep(200);
  }

  process.stdout.write('\n');
  console.log(`  ✅ Complete: ${records.length} records (${errorCount} errors)`);

  // Save immediately to disk
  fs.writeFileSync(outFile, JSON.stringify(records, null, 2));
  console.log(`  💾 Saved: ${outFile}`);

  return records;
}

async function main() {
  console.log('=== OnTrack Full Scraper v2 ===');
  console.log(`Workgroups: ${WORKGROUPS.length}`);
  console.log(`Results dir: ${RESULTS_DIR}`);

  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  fs.mkdirSync(PUBLIC_DIR, { recursive: true });

  // Login
  const loggedIn = await login();
  if (!loggedIn) {
    console.error('Failed to login. Exiting.');
    process.exit(1);
  }

  const allDates = generateDates();
  console.log(`Date range: ${allDates[0].toISOString().split('T')[0]} → ${allDates[allDates.length-1].toISOString().split('T')[0]} (${allDates.length} days)\n`);

  const allResults = [];
  const summary = [];

  for (let i = 0; i < WORKGROUPS.length; i++) {
    const wg = WORKGROUPS[i];
    const records = await scrapeWorkgroup(wg, allDates, i, WORKGROUPS.length);
    allResults.push(...records);
    summary.push({ workgroup: wg.displayName, dept: wg.deptName, count: records.length });

    // Write progress summary
    fs.writeFileSync(
      path.join(RESULTS_DIR, 'progress.json'),
      JSON.stringify({ completedWorkgroups: i + 1, totalWorkgroups: WORKGROUPS.length, summary, totalRecords: allResults.length }, null, 2)
    );
  }

  console.log('\n=== All workgroups scraped ===');
  console.log('Summary:');
  summary.forEach(s => console.log(`  ${s.dept} / ${s.workgroup}: ${s.count} records`));
  console.log(`Total: ${allResults.length} records`);

  // Merge with existing schedule-data.json
  const scheduleFile = path.join(PUBLIC_DIR, 'schedule-data.json');
  let existing = [];
  if (fs.existsSync(scheduleFile)) {
    try {
      const raw = fs.readFileSync(scheduleFile, 'utf8');
      existing = JSON.parse(raw);
      console.log(`\nExisting data: ${existing.length} records`);
    } catch (e) {
      console.log('Could not read existing schedule-data.json, starting fresh');
    }
  }

  // Dedup on name+date+workgroup
  const seen = new Set();
  const merged = [];

  const addRecord = (r) => {
    const key = `${r.name}|${r.date}|${r.workgroup || r.workgroupId}|${r.startTime || ''}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(r);
    }
  };

  // Add new records first (they take precedence)
  for (const r of allResults) addRecord(r);
  // Add existing records that weren't in new data
  for (const r of existing) addRecord(r);

  console.log(`Merged total: ${merged.length} records`);

  // Sort by date then name
  merged.sort((a, b) => {
    if (a.date < b.date) return -1;
    if (a.date > b.date) return 1;
    return (a.name || '').localeCompare(b.name || '');
  });

  fs.writeFileSync(scheduleFile, JSON.stringify(merged, null, 2));
  console.log(`\n✅ Saved merged data: ${scheduleFile}`);

  // Print employees of interest
  const targetEmployees = ['Nick', 'Ian', 'Emily', 'Michelle', 'KC'];
  console.log('\n--- Employees of Interest ---');
  for (const target of targetEmployees) {
    const found = [...new Set(merged.filter(r => r.name && r.name.includes(target)).map(r => r.name))];
    console.log(`  ${target}: ${found.length > 0 ? found.join(', ') : 'not found'}`);
  }

  // Output JSON summary for the calling process
  const result = {
    totalWorkgroups: WORKGROUPS.length,
    summary,
    totalRecords: merged.length,
    newRecords: allResults.length
  };
  
  fs.writeFileSync(path.join(RESULTS_DIR, 'final-summary.json'), JSON.stringify(result, null, 2));
  console.log('\nDone! Summary saved to scrape-results/final-summary.json');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
