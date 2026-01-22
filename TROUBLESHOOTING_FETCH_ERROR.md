# Troubleshooting "Failed to fetch" Error

## Common Causes

### 1. **Dev Server Not Running**
The dev server might have stopped. Restart it:
```bash
npm run dev
```

### 2. **Network Connectivity**
- Check your internet connection
- Try accessing Supabase dashboard: https://supabase.com/dashboard/project/ccztkyejfkjamlutcjns
- Check if Supabase project is active (not paused)

### 3. **Environment Variables Not Loaded**
After creating/updating `.env.local`, you MUST restart the dev server:
1. Stop the server (Ctrl+C)
2. Run `npm run dev` again

### 4. **CORS Issues**
If you see CORS errors in the browser console:
- Check Supabase Dashboard → Settings → API
- Ensure your local URL is allowed (usually `http://localhost:5173`)

### 5. **Supabase Project Paused**
Free tier projects pause after inactivity:
- Go to Supabase Dashboard
- Check if project status is "Active"
- If paused, click "Resume" or "Restore"

### 6. **Invalid API Key**
Verify your API key is correct:
- Go to Supabase Dashboard → Settings → API
- Copy the **anon/public** key (not the service_role key)
- Update `.env.local` with the correct key

## Quick Fixes

### Step 1: Restart Dev Server
```bash
# Stop current server (Ctrl+C)
npm run dev
```

### Step 2: Verify Environment Variables
Check `.env.local` exists and has correct values:
```env
VITE_SUPABASE_URL=https://ccztkyejfkjamlutcjns.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_fBZ7xV-W48lKITHc9GKBPg_I95RU4I9
```

### Step 3: Check Browser Console
Open browser DevTools (F12) and check:
- **Console tab**: Look for specific error messages
- **Network tab**: Check if requests to Supabase are failing
- Look for red error entries

### Step 4: Test Supabase Connection
In browser console, test:
```javascript
// Check if Supabase client is configured
console.log('Supabase URL:', import.meta.env.VITE_SUPABASE_URL);
console.log('Has Key:', !!import.meta.env.VITE_SUPABASE_ANON_KEY);
```

## Check Supabase Project Status

1. Go to: https://supabase.com/dashboard/project/ccztkyejfkjamlutcjns
2. Check project status (should be "Active")
3. Go to Settings → API
4. Verify URL and keys match your `.env.local`

## Still Not Working?

1. **Clear browser cache** and hard refresh (Ctrl+Shift+R)
2. **Check browser console** for specific error messages
3. **Try incognito/private mode** to rule out extensions
4. **Check Supabase logs**: Dashboard → Logs → API Logs

## Common Error Messages

- **"Failed to fetch"** → Network/CORS issue
- **"Invalid API key"** → Wrong key in `.env.local`
- **"Project not found"** → Wrong URL in `.env.local`
- **"CORS error"** → Supabase CORS settings need update

