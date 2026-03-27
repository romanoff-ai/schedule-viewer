#!/usr/bin/env node
/**
 * OnTrack Schedule Scraper v2
 * Connects to existing browser via CDP, fetches schedule data via AJAX.
 * Checkpoints every 7 days. Resumable.
 */
import puppeteer from 'puppeteer-core';
import fs from 'fs';

const CDP_URL = 'http://127.0.0.1:18800';
const OUTPUT_FILE = './ontrack-schedule-data.json';
const CHECKPOINT_FILE = './scrape-checkpoint.json';

const WORKGROUPS = [
  { id: '65906', name: 'Peacock Bar', dept: '27409' },
  { id: '81129', name: 'Peacock Barback', dept: '27409' },
];

async function main() {
  let allShifts = [];
  let resumeFrom = null;
  
  if (fs.existsSync(OUTPUT_FILE)) {
    allShifts = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
    console.log(`Loaded ${allShifts.length} existing records`);
  }
  if (fs.existsSync(CHECKPOINT_FILE)) {
    const cp = JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf8'));
    if (cp.lastDate && !cp.complete) {
      resumeFrom = cp.lastDate;
      console.log(`Resuming after: ${resumeFrom}`);
    }
  }

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

  const startDate = new Date(2023, 8, 1); // Sep 1 2023
  const endDate = new Date(); // today
  
  const effectiveStart = resumeFrom 
    ? new Date(new Date(resumeFrom).getTime() + 86400000) 
    : startDate;

  let dayCount = 0;
  for (let d = new Date(effectiveStart); d <= endDate; d.setDate(d.getDate() + 1)) {
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const yyyy = d.getFullYear();
    const dateStr = `${mm}/${dd}/${yyyy}`;

    for (const wg of WORKGROUPS) {
      try {
        // Fetch raw HTML and return it to Node for parsing
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

        // Parse HTML in Node (no regex serialization issues)
        const shifts = parseHTML(html, dateStr, wg.name);
        allShifts.push(...shifts);
      } catch (e) {
        console.error(`Error ${dateStr} ${wg.name}: ${e.message}`);
      }
    }

    dayCount++;
    if (dayCount % 7 === 0) {
      fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allShifts, null, 2));
      fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify({ lastDate: dateStr, totalRecords: allShifts.length }));
      console.log(`Checkpoint: ${dateStr} | ${allShifts.length} records | ${dayCount} days`);
    }
    if (dayCount % 3 === 0) {
      await new Promise(r => setTimeout(r, 300));
    }
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allShifts, null, 2));
  fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify({ lastDate: 'complete', totalRecords: allShifts.length, complete: true }));
  console.log(`\nDone! Total: ${allShifts.length} records over ${dayCount} days`);
  await browser.disconnect();
}

function parseHTML(html, dateStr, workgroupName) {
  const shifts = [];
  // Simple HTML parsing without DOMParser (Node side)
  // Each row: <tr>...<td>...Name (Role)...</td><td>...Schedule...</td></tr>
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
  let match;
  while ((match = rowRegex.exec(html)) !== null) {
    const rowHtml = match[1];
    const cells = [];
    const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/g;
    let cellMatch;
    while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
      // Strip HTML tags and get text
      const text = cellMatch[1].replace(/<[^>]+>/g, '').trim().replace(/\s+/g, ' ');
      cells.push(text);
    }
    if (cells.length < 2) continue;

    const nameCell = cells[0].trim();
    const schedCell = cells[1].trim();

    // Parse "Name (Role)"
    const parenIdx = nameCell.lastIndexOf('(');
    if (parenIdx === -1) continue;
    const name = nameCell.substring(0, parenIdx).trim();
    const role = nameCell.substring(parenIdx + 1).replace(')', '').trim();

    let startTime = null, endTime = null, position = null, status = 'working';

    if (/^Off/i.test(schedCell) || /^Req/i.test(schedCell)) {
      status = schedCell;
    } else {
      // "4:00 P - 1:00 A BARTOP" or "9:00 A - 5:00 P"
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

main().catch(e => { console.error(e); process.exit(1); });
