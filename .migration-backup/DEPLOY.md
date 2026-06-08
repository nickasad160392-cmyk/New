# Panduan Deploy ke Supabase + Vercel

## Langkah 1: Setup Database Supabase

1. Buka [supabase.com](https://supabase.com) → New Project
2. Catat **Database Password** yang dibuat
3. Masuk ke **SQL Editor** → New Query
4. Copy isi file `supabase-schema.sql` → paste → **Run**
5. Masuk ke **Project Settings** → **Database** → copy **Connection string (URI)**
   - Format: `postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres`

## Langkah 2: Deploy ke Vercel

### Opsi A — Via GitHub (Recommended)

1. Buat repository GitHub baru (misalnya `absensi-lwp`)
2. Upload folder `vercel-deploy/` ini sebagai root repository:
   ```
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/USERNAME/absensi-lwp.git
   git push -u origin main
   ```
3. Buka [vercel.com](https://vercel.com) → **Add New Project** → Import repository
4. Framework Preset: **Vite**
5. Root Directory: `.` (biarkan default)
6. Tambahkan **Environment Variables**:
   - `DATABASE_URL` = connection string Supabase (dari Langkah 1)
   - `JWT_SECRET` = string acak panjang (minimal 32 karakter)
7. Klik **Deploy**

### Opsi B — Via Vercel CLI

```bash
cd vercel-deploy
npm install -g vercel
vercel --prod
```
Ikuti prompt, lalu set env vars via dashboard Vercel.

## Langkah 3: Verifikasi

1. Buka URL Vercel yang diberikan (misalnya `https://absensi-lwp.vercel.app`)
2. Daftar akun pertama → akan jadi admin pertama (karena belum ada user)
3. **Jadikan admin**: Masuk ke Supabase → Table Editor → users → ubah `role` = `admin`

## Environment Variables yang Diperlukan

| Variable | Keterangan |
|----------|------------|
| `DATABASE_URL` | Connection string PostgreSQL Supabase |
| `JWT_SECRET` | Secret key untuk JWT (buat string acak panjang) |

## PWA — Install di HP

Setelah deploy, buka URL app di Chrome Android:
- Tap menu (3 titik) → **Add to Home Screen**

Di Safari iOS:
- Tap Share → **Add to Home Screen**

## Catatan Penting

- Selfie base64 disimpan langsung di database (kolom `check_in_selfie`). 
  Untuk produksi jangka panjang, pertimbangkan Supabase Storage.
- Vercel Serverless Function timeout: 10 detik (free tier).
- Supabase free tier: 500MB database, cukup untuk ratusan karyawan.
