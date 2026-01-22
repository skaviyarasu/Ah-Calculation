# Deployment Guide - AH Balancer

## 🚀 Deployment Checklist

### 1. Environment Variables

**CRITICAL:** You must set environment variables in your deployment platform!

Required variables:
```env
VITE_SUPABASE_URL=https://ccztkyejfkjamlutcjns.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key_here
```

### 2. Platform-Specific Setup

#### Vercel (GitHub Auto-Deployment)
**Note**: If Vercel auto-deploys from GitHub, environment variables are still set in Vercel Dashboard.

1. Go to your project on Vercel Dashboard
2. Click **Settings** tab → **Environment Variables** (left sidebar)
3. Click **"Add New"** and add:
   - **Name**: `VITE_SUPABASE_URL`
   - **Value**: `https://ccztkyejfkjamlutcjns.supabase.co`
   - **Environments**: Select Production, Preview, and Development (all three)
   - Click **Save**
4. Add second variable:
   - **Name**: `VITE_SUPABASE_ANON_KEY`
   - **Value**: `sb_publishable_fBZ7xV-W48lKITHc9GKBPg_I95RU4I9`
   - **Environments**: Select Production, Preview, and Development (all three)
   - Click **Save**
5. **IMPORTANT**: Trigger a new deployment:
   - **Option A**: Push a new commit to GitHub (Vercel will auto-deploy)
   - **Option B**: Go to **Deployments** tab → Click **"..."** on latest deployment → **Redeploy**
   
   ⚠️ **You MUST redeploy after adding environment variables!** Variables are loaded at build time.

#### Netlify
1. Go to Site Settings → Build & Deploy → Environment
2. Add both variables above
3. Redeploy

#### Other Platforms
- Set environment variables before building
- Ensure variables are prefixed with `VITE_` (Vite requirement)

### 3. Build Process

```bash
npm install
npm run build
```

The `dist/` folder contains your production build.

### 4. Common Issues

#### Blank Screen After Deployment

**Cause:** Missing environment variables

**Solution:**
1. Check browser console (F12) for errors
2. Verify environment variables are set in deployment platform
3. Ensure variables start with `VITE_`
4. Redeploy after setting variables

#### Authentication Not Working

**Cause:** Supabase URL or key incorrect

**Solution:**
1. Verify Supabase credentials in `.env.local` (local) and deployment platform (production)
2. Check Supabase Dashboard → Settings → API
3. Ensure RLS policies are enabled

#### Database Errors

**Cause:** Schema not set up or RLS blocking access

**Solution:**
1. Run `database/01_battery_optimization_schema.sql` in Supabase SQL Editor
2. Verify RLS policies are active
3. Check user authentication is working

### 5. Testing Production Build Locally

```bash
npm run build
npm run preview
```

Then test at `http://localhost:4173` (or shown port)

### 6. Debugging

#### Check Browser Console
- Open DevTools (F12)
- Look for errors in Console tab
- Check Network tab for failed requests

#### Common Error Messages

**"Missing Supabase environment variables"**
→ Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`

**"Failed to fetch"**
→ Check Supabase URL and network connectivity

**"Invalid API key"**
→ Verify Supabase anon key is correct

### 7. Database Setup

Before first deployment:
1. Run `database/01_battery_optimization_schema.sql` in Supabase
2. Verify tables exist: `battery_optimization_jobs`, `battery_cell_capacities`
3. Check RLS policies are enabled

### 8. Post-Deployment Verification

✅ App loads without errors
✅ Login/Register form displays
✅ Can create account
✅ Can login
✅ Can save/load jobs
✅ Data persists in Supabase

## 🔒 Security Notes

- Never commit `.env.local` to git
- Use environment variables in deployment platform
- Keep Supabase keys secure
- RLS ensures data isolation per user

