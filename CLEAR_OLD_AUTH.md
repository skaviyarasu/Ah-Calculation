# Clear Old Supabase Auth State

## Problem
The old Supabase URL `https://aswjfohpdtbordfpdfqk.supabase.co` is cached in browser localStorage, causing refresh token errors.

## Quick Fix: Clear Browser Storage

### Option 1: Browser Console (Immediate Fix)
Open browser console (F12) and run:

```javascript
// Clear all Supabase auth tokens
const keys = Object.keys(localStorage);
keys.forEach(key => {
  if (key.includes('supabase') || key.includes('aswjfohpdtbordfpdfqk')) {
    localStorage.removeItem(key);
    console.log('Removed:', key);
  }
});

// Clear sessionStorage too
const sessionKeys = Object.keys(sessionStorage);
sessionKeys.forEach(key => {
  if (key.includes('supabase') || key.includes('aswjfohpdtbordfpdfqk')) {
    sessionStorage.removeItem(key);
    console.log('Removed from session:', key);
  }
});

console.log('✅ Old auth state cleared! Please refresh the page.');
```

### Option 2: Clear All Site Data
1. Open browser DevTools (F12)
2. Go to **Application** tab (Chrome) or **Storage** tab (Firefox)
3. Click **Clear site data** or **Clear storage**
4. Check **Local storage** and **Session storage**
5. Click **Clear site data**
6. Refresh the page

### Option 3: Browser Settings
1. Open browser settings
2. Go to **Privacy** → **Clear browsing data**
3. Select **Cached images and files** and **Cookies and site data**
4. Choose time range: **Last hour** or **All time**
5. Click **Clear data**
6. Refresh the page

## Automatic Fix (Already Added)
The code now automatically clears old auth state when it detects the URL has changed. This happens:
- On page load
- When Supabase client is initialized
- If errors occur with the old URL

## After Clearing
1. Refresh the page
2. The app will use the new URL: `https://ccztkyejfkjamlutcjns.supabase.co`
3. You may need to log in again (old session is cleared)

## Verify It's Fixed
After clearing, check browser console - you should see:
- No more `ERR_NAME_NOT_RESOLVED` errors
- Requests going to `ccztkyejfkjamlutcjns.supabase.co` (not the old URL)
- Successful authentication

