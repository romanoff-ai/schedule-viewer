# OnTrack Scraping Reference

## AJAX Endpoint (internal, needs browser session)
GET /EmployeeAccess/DepartmentSchedule/Items
Params: t (current unix), date (target unix), workgroupId, departmentId

## Department/Workgroup IDs
| Department | ID |
|-----------|-----|
| The Peacock | 27388 |
| The Peacock Lounge | 27409 |
| Banquet | 27392 |
| Goldies | 27394 |
| Quill Room | 29070 |

| Workgroup | ID | Department |
|-----------|-----|------------|
| Peacock Bar (Bartenders) | 65906 | The Peacock Lounge (27409) |
| Peacock Barback | 81129 | The Peacock Lounge (27409) |
| Peacock Lounge Manager | 81185 | The Peacock Lounge (27409) |
| 1. Peacock Mgmt | TBD | The Peacock (27388) |
| 2. Peacock Hosts | TBD | The Peacock (27388) |
| 4. Peacock Servers | TBD | The Peacock (27388) |
| 5. Peacock Bussers | TBD | The Peacock (27388) |
| 6. Peacock Runners | TBD | The Peacock (27388) |
| Peacock Barista | TBD | The Peacock (27388) |

## Date Encoding
JavaScript: getTimestamp(date) = Math.floor((date.getTime() - date.getTimezoneOffset() * 60000) / 1000)

## Login
URL: https://www.heathandco.com/LaborProductivityTools/UserLogin.aspx
No CAPTCHA, no MFA. Simple username/password form.

## Data Table Structure
Each row: "Name (Role)" | "Time Range POSITION"
- Names: "Marshall Kemp (PB Bartender)"
- Shifts: "4:00 P - 1:00 A BARTOP"
- Off: "Off", "OffPsnl", "Req. Off"
- Position examples: BARTOP, SVC WELL, FLOOR, PATIO BAR, KAPPO, Mixologist

## Scraping Strategy
Use browser automation (jQuery datepicker + AJAX). For each date:
1. Set date via: $('#datepicker').datepicker('setDate', new Date(year, month-1, day))
2. Trigger: $('#datepicker').trigger('changeDate', {date: new Date(...)})
3. Wait for table to update
4. Parse table rows from div#scheduleTable

Or: call $.get() directly in page context to fetch Items endpoint
