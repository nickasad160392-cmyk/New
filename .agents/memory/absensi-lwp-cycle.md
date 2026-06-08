---
name: AbsensiLWP cycle logic
description: How the monthly attendance cycle is calculated and summarized
---

Cycle period: 7th of month to 6th of next month.
getCycleStart(): if today's Jakarta day < 7, use month-2 7th; else use month-1 7th.

presentDays in cycle-summary = hadir + terlambat + lembur (terlambat IS counted as present).
lateDays = terlambat only.

**Why:** Business rule — even if late, the employee still showed up and should count as present.
**How to apply:** Keep this in backend cycle-summary route AND in frontend display logic.
