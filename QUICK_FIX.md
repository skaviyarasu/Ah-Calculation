# 🚀 Quick Fix for Old Supabase URL Issue

## Immediate Steps (Do These Now)

### Step 1: Verify `.env.local` File

Open `.env.local` and make sure it has:
```env
VITE_SUPABASE_URL=https://ccztkyejfkjamlutcjns.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key_here
```

**If the URL is still `aswjfohpdtbordfpdfqk.supabase.co`, change it to `ccztkyejfkjamlutcjns.supabase.co`**

### Step 2: Clear Browser Storage

**Option A: Use the HTML tool**
1. Open `clear-auth.html` in your browser
2. Click "Clear All Supabase Auth"
3. Refresh your app

**Option B: Browser Console**
1. Open your app in browser
2. Press F12 to open DevTools
3. Go to Console tab
4. Paste and run:
```javascript
Object.keys(localStorage).forEach(k => {
  if (k.includes('supabase') || k.includes('aswjfohpdtbordfpdfqk')) {
    localStorage.removeItem(k);
    console.log('Removed:', k);
  }
});
Object.keys(sessionStorage).forEach(k => {
  if (k.includes('supabase') || k.includes('aswjfohpdtbordfpdfqk')) {
    sessionStorage.removeItem(k);
  }
});
console.log('✅ Cleared! Refresh the page.');
```

### Step 3: Restart Dev Server

**IMPORTANT**: Vite only reads `.env.local` when the server starts!

1. Stop the current dev server (Ctrl+C in terminal)
2. Start it again:
   ```bash
   npm run dev
   ```

### Step 4: Verify

After restarting, check the browser console. You should see:
- ✅ `🔍 Supabase URL from env: https://ccztkyejfkjamlutcjns.supabase.co`
- ✅ `✅ Supabase client created with URL: ...`
- ✅ `✅ Correct URL detected: ...`

If you still see the old URL, the `.env.local` file wasn't updated or the server wasn't restarted.

## What Changed in the Code

The code now:
- ✅ Automatically clears old auth keys on page load
- ✅ Logs the URL being used (check console)
- ✅ Detects old URL errors and clears auth state
- ✅ Shows clear error messages if old URL detected

## Still Having Issues?

1. **Check `.env.local`** - Make sure URL is correct
2. **Restart dev server** - This is critical!
3. **Clear browser storage** - Use the steps above
4. **Check console logs** - Look for the debug messages
5. **Hard refresh** - Ctrl+Shift+R (or Cmd+Shift+R on Mac)

