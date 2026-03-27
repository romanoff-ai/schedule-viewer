// OnTrack Schedule Scraper — runs via browser evaluate
// This script fetches schedule data for a date range using the internal AJAX endpoint

const WORKGROUPS = [
  { id: '65906', name: 'Peacock Bar', dept: '27409' },
  { id: '81129', name: 'Peacock Barback', dept: '27409' },
];

function getTimestamp(date) {
  return Math.floor((date.getTime() - date.getTimezoneOffset() * 60000) / 1000);
}

async function scrapeDate(dateStr, workgroup) {
  const [month, day, year] = dateStr.split('/').map(Number);
  const date = new Date(year, month - 1, day);
  const ts = getTimestamp(date);
  const now = Math.floor(Date.now() / 1000);
  
  const url = `/EmployeeAccess/DepartmentSchedule/Items?t=${now}&date=${ts}&workgroupId=${workgroup.id}&departmentId=${workgroup.dept}`;
  
  const response = await fetch(url);
  const html = await response.text();
  
  // Parse HTML table
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const rows = doc.querySelectorAll('table tbody tr');
  
  const shifts = [];
  rows.forEach(row => {
    const cells = row.querySelectorAll('td');
    if (cells.length < 2) return;
    
    const nameCell = cells[0].textContent.trim();
    const schedCell = cells[1].textContent.trim();
    
    // Parse name and role: "Marshall Kemp (PB Bartender)"
    const nameMatch = nameCell.match(/^(.+?)\s*\((.+?)\)$/);
    if (!nameMatch) return;
    
    const name = nameMatch[1].trim();
    const role = nameMatch[2].trim();
    
    // Parse schedule: "4:00 P - 1:00 A BARTOP" or "Off" or "OffPsnl"
    let startTime = null, endTime = null, position = null, status = 'working';
    
    if (/^Off/.test(schedCell) || /^Req\. Off/.test(schedCell)) {
      status = schedCell;
    } else {
      const timeMatch = schedCell.match(/^(\d+:\d+\s*[AP])\s*-\s*(\d+:\d+\s*[AP])\s*(.*)?$/);
      if (timeMatch) {
        startTime = timeMatch[1].trim();
        endTime = timeMatch[2].trim();
        position = timeMatch[3] ? timeMatch[3].trim() : null;
      }
    }
    
    shifts.push({ name, role, date: dateStr, startTime, endTime, position, status, workgroup: workgroup.name });
  });
  
  return shifts;
}

// Export for use
window.__scrapeDate = scrapeDate;
window.__WORKGROUPS = WORKGROUPS;
