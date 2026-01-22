// Run this in browser console (F12) to clear old Supabase auth
// Copy and paste this entire script into the browser console

(function() {
  console.log('🧹 Starting cleanup...');
  
  let count = 0;
  const cleared = [];
  
  // Clear localStorage
  Object.keys(localStorage).forEach(key => {
    if (key.includes('supabase') || key.includes('aswjfohpdtbordfpdfqk')) {
      localStorage.removeItem(key);
      cleared.push(`localStorage: ${key}`);
      count++;
    }
  });
  
  // Clear sessionStorage
  Object.keys(sessionStorage).forEach(key => {
    if (key.includes('supabase') || key.includes('aswjfohpdtbordfpdfqk')) {
      sessionStorage.removeItem(key);
      cleared.push(`sessionStorage: ${key}`);
      count++;
    }
  });
  
  if (count > 0) {
    console.log(`✅ Cleared ${count} auth keys:`);
    cleared.forEach(item => console.log('  -', item));
    console.log('🔄 Refreshing page in 2 seconds...');
    setTimeout(() => location.reload(), 2000);
  } else {
    console.log('✅ No old auth keys found. Storage is clean.');
    console.log('💡 If you still see the old URL, restart the dev server!');
  }
})();

