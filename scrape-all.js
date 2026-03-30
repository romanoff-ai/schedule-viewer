#!/usr/bin/env node
// Scraper that runs HTTP requests via Node.js with session cookies from browser
// Usage: node scrape-all.js

const https = require('https');
const fs = require('fs');
const path = require('path');

// All workgroups found
const WORKGROUPS = [
  // The Peacock (27388)
  { workgroupId: 57484, departmentId: 27388, name: "1. Peacock Mgmt" },
  { workgroupId: 57485, departmentId: 27388, name: "2. Peacock Hosts" },
  { workgroupId: 57487, departmentId: 27388, name: "4. Peacock Servers" },
  { workgroupId: 57488, departmentId: 27388, name: "5. Peacock Bussers" },
  { workgroupId: 57489, departmentId: 27388, name: "6. Peacock Runners" },
  { workgroupId: 83769, departmentId: 27388, name: "Peacock Barista" },
  // The Peacock Lounge (27409) - already scraped
  // { workgroupId: 65906, departmentId: 27409, name: "Peacock Bar" },
  // { workgroupId: 81129, departmentId: 27409, name: "Peacock Barback" },
  { workgroupId: 81185, departmentId: 27409, name: "Peacock Lounge Manager" },
  // Banquet (27392)
  { workgroupId: 57427, departmentId: 27392, name: "1. Banquet Captains" },
  { workgroupId: 57428, departmentId: 27392, name: "2. Banquet Servers" },
  { workgroupId: 57429, departmentId: 27392, name: "3. Banquet Housepersons" },
  { workgroupId: 57430, departmentId: 27392, name: "4. Banquet Bartenders" },
  // Goldies (27394)
  { workgroupId: 65903, departmentId: 27394, name: "1. Goldies Mixologist" },
  { workgroupId: 57444, departmentId: 27394, name: "2. Goldies Runner" },
  { workgroupId: 57445, departmentId: 27394, name: "3. Goldies Servers" },
  { workgroupId: 59280, departmentId: 27394, name: "4. Goldie's Host" },
  // Quill Room (29070)
  { workgroupId: 65907, departmentId: 29070, name: "Quill Room" },
];

// Cookie from browser session - we'll set via env
const COOKIE = process.env.ONTRACK_COOKIE || '';

function encodeDate(y, m, d) {
  const dt = new Date(y, m, d);
  return Math.floor((dt.getTime() - dt.getTimezoneOffset() * 60000) / 1000);
}

function fetchUrl(url, cookie) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'heathandco.com',
      path: url,
      method: 'GET',
      headers: {
        'Cookie': cookie,
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Referer': 'https://heathandco.com/EmployeeAccess/DepartmentSchedule',
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

function parseHtml(html, workgroupName, dateStr) {
  const records = [];
  // Parse table rows from the schedule HTML
  // Pattern: employee rows with name, role, schedule
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
  
  let rowMatch;
  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const rowHtml = rowMatch[1];
    const cells = [];
    let cellMatch;
    const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    while ((cellMatch = cellRe.exec(rowHtml)) !== null) {
      // Strip HTML tags
      const text = cellMatch[1].replace(/<[^>]+>/g, '').trim();
      cells.push(text);
    }
    if (cells.length >= 2 && cells[0] && cells[0] !== 'Name') {
      records.push({
        name: cells[0] || '',
        role: cells[1] || '',
        date: dateStr,
        schedule: cells[2] || '',
        position: cells[3] || '',
        workgroup: workgroupName
      });
    }
  }
  return records;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  const dataPath = path.join(__dirname, 'public', 'schedule-data.json');
  const existing = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  
  // Build dedup set: name+date+workgroup
  const existingSet = new Set(existing.map(r => `${r.name}|${r.date}|${r.workgroup}`));
  console.log(`Existing records: ${existing.length}`);
  
  const allNew = [];
  const stats = {};
  
  // Get cookie from browser environment
  const cookie = COOKIE;
  if (!cookie) {
    console.error('ERROR: ONTRACK_COOKIE not set');
    process.exit(1);
  }
  
  for (const wg of WORKGROUPS) {
    console.log(`\nScraping: ${wg.name} (workgroupId=${wg.workgroupId})`);
    let wgCount = 0;
    
    // Jan 1, 2024 to Mar 29, 2026
    const startDate = new Date(2024, 0, 1);
    const endDate = new Date(2026, 2, 29);
    
    let current = new Date(startDate);
    while (current <= endDate) {
      const y = current.getFullYear();
      const m = current.getMonth();
      const d = current.getDate();
      const dateEncoded = encodeDate(y, m, d);
      const dateStr = `${String(m+1).padStart(2,'0')}/${String(d).padStart(2,'0')}/${y}`;
      const ts = Math.floor(Date.now() / 1000);
      
      const url = `/EmployeeAccess/DepartmentSchedule/Items?t=${ts}&date=${dateEncoded}&workgroupId=${wg.workgroupId}&departmentId=${wg.departmentId}`;
      
      try {
        const resp = await fetchUrl(url, cookie);
        if (resp.status === 200) {
          const records = parseHtml(resp.body, wg.name, dateStr);
          for (const r of records) {
            const key = `${r.name}|${r.date}|${r.workgroup}`;
            if (!existingSet.has(key)) {
              existingSet.add(key);
              allNew.push(r);
              wgCount++;
            }
          }
        } else if (resp.status === 302 || resp.status === 401) {
          console.error(`AUTH ERROR on ${dateStr} - session expired!`);
          process.exit(2);
        }
      } catch (err) {
        console.error(`Error on ${dateStr}: ${err.message}`);
      }
      
      await sleep(200);
      current.setDate(current.getDate() + 1);
    }
    
    stats[wg.name] = wgCount;
    console.log(`  → ${wgCount} new records`);
    
    // Save incrementally after each workgroup
    const merged = existing.concat(allNew);
    fs.writeFileSync(dataPath, JSON.stringify(merged, null, 2));
    console.log(`  → Saved (total: ${merged.length})`);
  }
  
  const finalMerged = existing.concat(allNew);
  fs.writeFileSync(dataPath, JSON.stringify(finalMerged, null, 2));
  
  console.log('\n=== FINAL STATS ===');
  console.log('New records by workgroup:');
  for (const [k, v] of Object.entries(stats)) {
    console.log(`  ${k}: ${v}`);
  }
  console.log(`Total new: ${allNew.length}`);
  console.log(`Grand total: ${finalMerged.length}`);
  
  // Save stats for reporting
  fs.writeFileSync('/tmp/scrape-stats.json', JSON.stringify({
    newRecords: allNew.length,
    totalRecords: finalMerged.length,
    byWorkgroup: stats,
    workgroups: WORKGROUPS.map(w => w.name)
  }, null, 2));
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
