# ✅ DO THIS NOW - Fix Old Supabase URL

## ✅ Step 1: Dev Server Restarted
The dev server has been restarted. It should now be running with the correct URL.

## 🔧 Step 2: Clear Browser Storage

**Open your browser and do ONE of these:**

### Option A: Browser Console (Fastest)
1. Open your app: `http://localhost:5173` (or whatever port Vite shows)
2. Press **F12** to open DevTools
3. Go to **Console** tab
4. Copy and paste this entire script:

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
console.log('✅ Cleared! Refreshing...');
setTimeout(() => location.reload(), 1000);
```

5. Press Enter
6. The page will auto-refresh

### Option B: Use the HTML Tool
1. Open `clear-auth.html` in your browser
2. Click "Clear All Supabase Auth"
3. Go back to your app and refresh

## ✅ Step 3: Verify It's Fixed

After clearing storage and refreshing, check the browser console. You should see:

```
🔍 Supabase URL from env: https://ccztkyejfkjamlutcjns.supabase.co
✅ Supabase client created with URL: https://ccztkyejfkjamlutcjns.supabase.co
✅ Correct URL detected: https://ccztkyejfkjamlutcjns.supabase.co
```

## 🎯 Step 4: Try Login

Now try logging in. The URL should be:
- ✅ `https://ccztkyejfkjamlutcjns.supabase.co/auth/v1/token?grant_type=password`
- ❌ NOT `https://aswjfohpdtbordfpdfqk.supabase.co/...`

## 📋 Summary

✅ `.env.local` - Already has correct URL  
✅ Dev server - Restarted  
⏳ Browser storage - **YOU NEED TO CLEAR THIS** (Step 2 above)

The code will automatically prevent the old URL from being used, but you need to clear the cached tokens first!

