---
name: AbsensiLWP stack
description: Tech stack and key config for the Absensi LWP attendance app
---

- Frontend: React+Vite artifact at /home/runner/workspace/artifacts/absensi-lwp, preview path /
- Backend: Express 5 at /home/runner/workspace/artifacts/api-server, binds port 8080
- DB: PostgreSQL + Drizzle ORM, schema at lib/db/src/schema/index.ts
- UI: Tailwind v4, wouter routing, @tanstack/react-query, sonner toasts
- Branding: gold #FACC15, dark #4A4435, cream #FBF9F3
- Office GPS: OFFICE_LAT=-8.128241, OFFICE_LNG=113.234113, MAX_DISTANCE_METERS=500
- Work start: 08:00 Jakarta, cycle: 7th to 6th of next month
- Face detection: face-api.js CDN weights (MODEL_URL = cdn.jsdelivr.net/.../face-api.js@0.22.2/weights)

**Why:** Reference this rather than re-reading multiple files to remember the project setup.
