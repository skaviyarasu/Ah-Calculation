# Setting Environment Variables in Vercel

## Quick Steps

### 1. Go to Your Vercel Project
1. Visit: https://vercel.com/dashboard
2. Find and click on your project (Ah-Calculation or similar name)

### 2. Navigate to Settings
1. Click on **"Settings"** tab (top navigation)
2. Click on **"Environment Variables"** in the left sidebar

### 3. Add Environment Variables
Add these two variables:

#### Variable 1: `VITE_SUPABASE_URL`
- **Name**: `VITE_SUPABASE_URL`
- **Value**: `https://ccztkyejfkjamlutcjns.supabase.co`
- **Environment**: Select **Production**, **Preview**, and **Development** (all three)
- Click **"Save"**

#### Variable 2: `VITE_SUPABASE_ANON_KEY`
- **Name**: `VITE_SUPABASE_ANON_KEY`
- **Value**: `sb_publishable_fBZ7xV-W48lKITHc9GKBPg_I95RU4I9`
- **Environment**: Select **Production**, **Preview**, and **Development** (all three)
- Click **"Save"**

### 4. Redeploy Your Application
After adding environment variables:
1. Go to **"Deployments"** tab
2. Click the **"..."** (three dots) menu on the latest deployment
3. Click **"Redeploy"**
4. Or push a new commit to trigger a new deployment

## Important Notes

### ⚠️ Critical Points:
1. **Variable names MUST start with `VITE_`** - This is required for Vite to expose them to the client
2. **Redeploy after adding variables** - Environment variables are only loaded during build time
3. **Select all environments** - Make sure to check Production, Preview, and Development

### 🔍 Verify Variables Are Set:
After redeploying, you can verify in the browser console:
```javascript
console.log('Supabase URL:', import.meta.env.VITE_SUPABASE_URL);
console.log('Has Key:', !!import.meta.env.VITE_SUPABASE_ANON_KEY);
```

## Step-by-Step with Screenshots Guide

### Step 1: Access Project Settings
```
Vercel Dashboard → Your Project → Settings Tab
```

### Step 2: Find Environment Variables
```
Settings → Environment Variables (left sidebar)
```

### Step 3: Add Variables
Click **"Add New"** button and fill in:

**First Variable:**
- Key: `VITE_SUPABASE_URL`
- Value: `https://ccztkyejfkjamlutcjns.supabase.co`
- Environments: ✅ Production ✅ Preview ✅ Development

**Second Variable:**
- Key: `VITE_SUPABASE_ANON_KEY`
- Value: `sb_publishable_fBZ7xV-W48lKITHc9GKBPg_I95RU4I9`
- Environments: ✅ Production ✅ Preview ✅ Development

### Step 4: Redeploy
```
Deployments Tab → Latest Deployment → ... Menu → Redeploy
```

## Alternative: Using Vercel CLI

If you prefer command line:

```bash
# Install Vercel CLI (if not installed)
npm i -g vercel

# Login to Vercel
vercel login

# Add environment variables
vercel env add VITE_SUPABASE_URL production
# Enter: https://ccztkyejfkjamlutcjns.supabase.co

vercel env add VITE_SUPABASE_ANON_KEY production
# Enter: sb_publishable_fBZ7xV-W48lKITHc9GKBPg_I95RU4I9

# Redeploy
vercel --prod
```

## Troubleshooting

### Variables Not Working?
1. ✅ Check variable names start with `VITE_`
2. ✅ Verify you selected all environments (Production, Preview, Development)
3. ✅ Redeploy after adding variables
4. ✅ Check build logs for any errors

### Still Getting "Failed to fetch"?
1. Check Supabase project is active (not paused)
2. Verify the URL and key are correct
3. Check browser console for specific error messages
4. Verify CORS settings in Supabase Dashboard

## Direct Links

- Vercel Dashboard: https://vercel.com/dashboard
- Your Supabase Project: https://supabase.com/dashboard/project/ccztkyejfkjamlutcjns/settings/api

