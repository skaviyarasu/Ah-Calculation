# 🔍 Login URL Debugging Guide

## Where the Login URL is Formed

The login URL (`https://aswjfohpdtbordfpdfqk.supabase.co/auth/v1/token?grant_type=password`) is formed by the **Supabase JavaScript client** when you call `auth.signIn()`.

### Flow:

1. **Environment Variable** → `src/lib/supabase.js` line 4
   ```javascript
   const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
   ```

2. **Supabase Client Creation** → `src/lib/supabase.js` line 38-53
   ```javascript
   export const supabase = createClient(
     supabaseUrl || 'https://placeholder.supabase.co',
     supabaseAnonKey || 'placeholder-key',
     { auth: { ... } }
   )
   ```

3. **Login Call** → `src/lib/supabase.js` line 336
   ```javascript
   await supabase.auth.signInWithPassword({ email, password })
   ```

4. **Supabase SDK** → Internally constructs the URL as:
   ```
   {supabaseUrl}/auth/v1/token?grant_type=password
   ```

## Why You're Seeing the Old URL

The old URL appears because:

1. **Environment Variable Not Updated**: `.env.local` still has the old URL
2. **Dev Server Not Restarted**: Vite only reads `.env.local` on startup
3. **Cached Refresh Token**: Old token in localStorage contains the old URL
4. **Browser Cache**: Old auth state persisted in browser storage

## How to Fix

### Step 1: Check `.env.local` File

Open `.env.local` and verify it has:
```env
VITE_SUPABASE_URL=https://ccztkyejfkjamlutcjns.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key_here
```

### Step 2: Clear Browser Storage

Open browser console (F12) and run:
```javascript
// Clear all Supabase auth tokens
Object.keys(localStorage).forEach(key => {
  if (key.includes('supabase')) {
    localStorage.removeItem(key)
    console.log('Removed:', key)
  }
})
Object.keys(sessionStorage).forEach(key => {
  if (key.includes('supabase')) {
    sessionStorage.removeItem(key)
  }
})
console.log('✅ Cleared! Now refresh the page.')
```

### Step 3: Restart Dev Server

**IMPORTANT**: Vite only reads `.env.local` when the dev server starts!

1. Stop the dev server (Ctrl+C)
2. Start it again:
   ```bash
   npm run dev
   ```

### Step 4: Check Console Logs

After restarting, check the browser console. You should see:
```
🔍 Supabase URL from env: https://ccztkyejfkjamlutcjns.supabase.co
✅ Supabase client created with URL: https://ccztkyejfkjamlutcjns.supabase.co
```

If you see the old URL, the `.env.local` file is wrong or the dev server wasn't restarted.

## Debugging Steps

1. **Check what URL is being used**:
   - Open browser console
   - Look for: `🔍 Supabase URL from env: ...`
   - Look for: `🔐 Attempting login with Supabase URL: ...`

2. **If old URL appears in logs**:
   - Check `.env.local` file
   - Restart dev server
   - Clear browser storage

3. **If new URL in logs but old URL in network requests**:
   - There's a cached refresh token
   - Clear browser storage (Step 2)
   - Refresh the page

## Automatic Cleanup

The code now automatically:
- ✅ Clears old auth keys on page load
- ✅ Detects old URL in errors and clears auth state
- ✅ Logs the URL being used for debugging
- ✅ Throws clear error messages if old URL detected

## Verification

After fixing, verify:
1. Console shows new URL: `ccztkyejfkjamlutcjns.supabase.co`
2. Network tab shows requests to new URL
3. No `ERR_NAME_NOT_RESOLVED` errors
4. Login works successfully

