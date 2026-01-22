# Vercel + GitHub Auto-Deployment Setup

## How It Works
- Vercel automatically deploys when you push to GitHub
- Environment variables are set in **Vercel Dashboard** (not in GitHub)
- After setting variables, you need to trigger a new deployment

## Step 1: Set Environment Variables in Vercel

### Go to Vercel Dashboard:
1. Visit: https://vercel.com/dashboard
2. Click on your project
3. Go to **Settings** → **Environment Variables**

### Add Variables:

**Variable 1:**
- **Key**: `VITE_SUPABASE_URL`
- **Value**: `https://ccztkyejfkjamlutcjns.supabase.co`
- **Environments**: ✅ Production ✅ Preview ✅ Development
- Click **Save**

**Variable 2:**
- **Key**: `VITE_SUPABASE_ANON_KEY`
- **Value**: `sb_publishable_fBZ7xV-W48lKITHc9GKBPg_I95RU4I9`
- **Environments**: ✅ Production ✅ Preview ✅ Development
- Click **Save**

## Step 2: Trigger New Deployment

Since Vercel auto-deploys from GitHub, you have **two options**:

### Option A: Push a New Commit (Recommended)
```bash
# Make a small change (like updating a comment)
# Then commit and push
git add .
git commit -m "Trigger deployment with env vars"
git push
```
Vercel will automatically detect the push and deploy with the new environment variables.

### Option B: Manual Redeploy in Vercel
1. Go to **Deployments** tab in Vercel
2. Click **"..."** (three dots) on the latest deployment
3. Click **"Redeploy"**
4. Select the same branch (usually `main` or `master`)
5. Click **"Redeploy"**

## Important Notes

### ⚠️ Environment Variables Are NOT in GitHub
- **DO NOT** commit `.env.local` to GitHub (it's in `.gitignore`)
- Environment variables are set in **Vercel Dashboard only**
- Each environment (Production/Preview/Development) can have different values

### ✅ Variables Are Loaded at Build Time
- Environment variables are embedded during the build process
- You must redeploy after adding/changing variables
- Variables starting with `VITE_` are exposed to the client-side code

## Verify Deployment

After deployment completes:

1. Visit your Vercel deployment URL
2. Open browser console (F12)
3. Run:
```javascript
console.log('Supabase URL:', import.meta.env.VITE_SUPABASE_URL);
console.log('Has Key:', !!import.meta.env.VITE_SUPABASE_ANON_KEY);
```

Both should show values (not `undefined`).

## Quick Checklist

- [ ] Set `VITE_SUPABASE_URL` in Vercel Dashboard
- [ ] Set `VITE_SUPABASE_ANON_KEY` in Vercel Dashboard
- [ ] Selected all environments (Production, Preview, Development)
- [ ] Pushed a new commit OR manually redeployed
- [ ] Verified variables are loaded (check browser console)

## Troubleshooting

### Variables Not Working?
1. ✅ Check variable names start with `VITE_`
2. ✅ Verify you selected all environments
3. ✅ Check build logs in Vercel for errors
4. ✅ Make sure you redeployed after adding variables

### Still Getting "Failed to fetch"?
1. Check Supabase project is active
2. Verify URL and key are correct
3. Check browser console for specific errors
4. Verify CORS settings in Supabase

## Direct Links

- **Vercel Dashboard**: https://vercel.com/dashboard
- **Supabase API Settings**: https://supabase.com/dashboard/project/ccztkyejfkjamlutcjns/settings/api

