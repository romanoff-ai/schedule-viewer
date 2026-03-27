#!/usr/bin/env node
/**
 * Targeted re-scrape for missing/sparse date ranges.
 * Connects to existing browser via CDP, fetches schedule data,
 * merges with existing records (deduplicates).
 */
import puppeteer from 'puppeteer-core';
import fs from 'fs';

const CDP_URL = 'http://127.0.0.1:18800';
const OUTPUT_FILE = './ontrack-schedule-data.json';

const WORKGROUPS = [
  { id: '65906', name: 'Peacock Bar', dept: '27409' },
  { id: '81129', name: 'Peacock Barback', dept: '27409' },
];

// Date ranges to re-scrape
const RANGES = [
  { start: new Date(2023, 8, 1), end: new Date(2023, 11, 31) },  // Sep 1 - Dec 31 2023
  { start: new Date(2026, 0, 1), end: new Date(2026, 2, 27) },   // Jan 1 - Mar 27 2026
];

function parseHTML(html, dateStr, workgroupName) {
  const shifts = [];
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
  let match;
  while ((match = rowRegex.exec(html)) !== null) {
    const rowHtml = match[1];
    const cells = [];
    const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/g;
    let cellMatch;
    while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
      const text = cellMatch[1].replace(/<[^>]+>/g, '').trim().replace(/\s+/g, ' ');
      cells.push(text);
    }
    if (cells.length < 2) continue;

    const nameCell = cells[0].trim();
    const schedCell = cells[1].trim();

    const parenIdx = nameCell.lastIndexOf('(');
    if (parenIdx === -1) continue;
    const name = nameCell.substring(0, parenIdx).trim();
    const role = nameCell.substring(parenIdx + 1).replace(')', '').trim();

    let startTime = null, endTime = null, position = null, status = 'working';

    if (/^Off/i.test(schedCell) || /^Req/i.test(schedCell)) {
      status = schedCell;
    } else {
      const timeMatch = schedCell.match(/^(\d+:\d+\s*[AP])\s*-\s*(\d+:\d+\s*[AP])\s*(.*)?$/);
      if (timeMatch) {
        startTime = timeMatch[1].trim();
        endTime = timeMatch[2].trim();
        const rest = (timeMatch[3] || '').trim();
        position = rest || null;
      }
    }

    shifts.push({ name, role, date: dateStr, startTime, endTime, position, status, workgroup: workgroupName });
  }
  return shifts;
}

function dedupKey(r) {
  return `${r.name}|${r.date}|${r.workgroup}|${r.startTime || ''}|${r.endTime || ''}|${r.status}`;
}

async function main() {
  // Load existing data
  let existing = [];
  if (fs.existsSync(OUTPUT_FILE)) {
    existing = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
    console.log(`Loaded ${existing.length} existing records`);
  }

  // Build dedup set from existing
  const seen = new Set(existing.map(dedupKey));

  // Connect to browser
  const browser = await puppeteer.connect({ browserURL: CDP_URL });
  const pages = await browser.pages();
  let page = pages.find(p => p.url().includes('heathandco.com'));
  if (!page) {
    console.error('No OnTrack tab found. Please log in first.');
    process.exit(1);
  }
  console.log(`Connected to: ${page.url()}`);

  if (!page.url().includes('DepartmentSchedule')) {
    await page.goto('https://www.heathandco.com/EmployeeAccess/DepartmentSchedule/', { waitUntil: 'networkidle0', timeout: 30000 });
  }

  let newCount = 0;
  let totalFetched = 0;
  let errorCount = 0;

  for (const range of RANGES) {
    console.log(`\nScraping: ${range.start.toDateString()} → ${range.end.toDateString()}`);
    let dayCount = 0;

    for (let d = new Date(range.start); d <= range.end; d.setDate(d.getDate() + 1)) {
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const yyyy = d.getFullYear();
      const dateStr = `${mm}/${dd}/${yyyy}`;

      for (const wg of WORKGROUPS) {
        try {
          const html = await page.evaluate(async (dateStr, wgId, deptId) => {
            const [m, day, y] = dateStr.split('/').map(Number);
            const date = new Date(y, m - 1, day);
            const ts = Math.floor((date.getTime() - date.getTimezoneOffset() * 60000) / 1000);
            const now = Math.floor(Date.now() / 1000);
            const resp = await fetch(
              '/EmployeeAccess/DepartmentSchedule/Items?t=' + now + '&date=' + ts + '&workgroupId=' + wgId + '&departmentId=' + deptId
            );
            return await resp.text();
          }, dateStr, wg.id, wg.dept);

          const shifts = parseHTML(html, dateStr, wg.name);
          totalFetched += shifts.length;

          for (const s of shifts) {
            const key = dedupKey(s);
            if (!seen.has(key)) {
              existing.push(s);
              seen.add(key);
              newCount++;
            }
          }
        } catch (e) {
          errorCount++;
          console.error(`Error ${dateStr} ${wg.name}: ${e.message}`);
        }
      }

      dayCount++;
      if (dayCount % 7 === 0) {
        console.log(`  ${dateStr} | fetched so far: ${totalFetched} | new: ${newCount} | errors: ${errorCount}`);
      }
      // Throttle slightly
      if (dayCount % 3 === 0) {
        await new Promise(r => setTimeout(r, 200));
      }
    }
  }

  // Save merged data
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(existing, null, 2));
  console.log(`\n=== DONE ===`);
  console.log(`Total fetched from server: ${totalFetched}`);
  console.log(`New records added: ${newCount}`);
  console.log(`Errors: ${errorCount}`);
  console.log(`Total records now: ${existing.length}`);

  // Summary by year-month
  const toISO = s => { const [m,d,y] = s.split('/'); return y+'-'+m+'-'+d; };
  const byYM = {};
  existing.forEach(r => { const ym = toISO(r.date).slice(0, 7); byYM[ym] = (byYM[ym] || 0) + 1; });
  console.log('\nRecords by month:');
  Object.keys(byYM).sort().forEach(k => console.log(`  ${k}: ${byYM[k]}`));

  await browser.disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
