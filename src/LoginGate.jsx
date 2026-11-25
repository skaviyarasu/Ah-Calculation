import React, { useEffect, useState } from 'react';
import { auth, supabase, inventory } from './lib/supabase';

export default function LoginGate({ children }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true); // Start with loading true
  
  // Form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Initialize Supabase authentication
useEffect(() => {
    // Check if Supabase is properly configured
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseAnonKey || supabaseUrl.includes('placeholder')) {
      console.error('Supabase not configured. Please set environment variables.');
      setLoading(false);
      return;
    }

    // Clear old auth state if URL changed (one-time cleanup)
    const currentUrlPattern = supabaseUrl.replace(/https?:\/\//, '').replace(/\/$/, '')
    
    // Clear any localStorage keys that don't match current URL
    const storageKeys = Object.keys(localStorage)
    storageKeys.forEach(key => {
      if (key.includes('supabase') && key.includes('supabase.co') && !key.includes(currentUrlPattern)) {
        localStorage.removeItem(key)
      }
    })
    // Clear sessionStorage too
    const sessionKeys = Object.keys(sessionStorage)
    sessionKeys.forEach(key => {
      if (key.includes('supabase') && key.includes('supabase.co') && !key.includes(currentUrlPattern)) {
        sessionStorage.removeItem(key)
      }
    })

    // Get initial session
    supabase.auth.getSession().then(async ({ data: { session }, error }) => {
      if (error) {
        console.error('Session error:', error);
        // If error is due to old URL or network issues, clear and retry
        if (error.message?.includes('ERR_NAME_NOT_RESOLVED') || error.message?.includes('Failed to fetch')) {
          console.log('🔄 Clearing auth state due to connection error')
          await supabase.auth.signOut()
        }
      }
      setIsAuthenticated(!!session);
      setCurrentUser(session?.user ?? null);
      setLoading(false);
    }).catch((error) => {
      console.error('Failed to get session:', error);
      // Clear auth state on connection errors
      if (error.message?.includes('ERR_NAME_NOT_RESOLVED') || error.message?.includes('Failed to fetch')) {
        supabase.auth.signOut().catch(() => {})
      }
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      setIsAuthenticated(!!session);
      setCurrentUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription?.unsubscribe();
}, []);

  async function handleLogin(e) {
    e.preventDefault();
    if (!email.trim() || !password) {
      alert('Please enter both email and password');
      return;
    }

    setSubmitting(true);
    try {
      await auth.signIn(email, password);
      // Success handled by auth state change listener
    } catch (error) {
      console.error('Login error:', error);
      alert(error.message || 'Login failed. Please check your credentials.');
    }
    setSubmitting(false);
  }

  // Show loading spinner while checking authentication
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 p-6">
        <div className="bg-white rounded-2xl shadow-xl p-8 text-center border border-gray-200">
          <div className="flex flex-col items-center gap-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            <div>
              <p className="text-gray-700 font-medium mb-1">Verifying Authentication</p>
              <p className="text-sm text-gray-500">Checking your session...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 p-6">
        <div className="bg-white max-w-md w-full rounded-2xl shadow-xl p-8 space-y-6 border border-gray-200">
          <div className="text-center">
            <div className="mb-4">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-3">
                <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              AH Balancer
            </h1>
            <p className="text-gray-600 text-sm">Sign in to access your battery optimization tools</p>
            <div className="mt-3 flex items-center justify-center gap-2 text-xs text-gray-500">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <span>Protected Access</span>
            </div>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter your email"
                required
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter your password"
                required
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className={`w-full py-3 px-4 rounded-xl font-medium transition-colors ${
                submitting
                  ? 'bg-gray-400 text-gray-200 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              {submitting ? 'Signing in...' : 'Sign In'}
            </button>
</form>

          <p className="text-center text-xs text-gray-500">
            Accounts are created by an administrator. Contact your administrator if you need access.
          </p>
        </div>
</div>
);
}

  // Authenticated: the app shell (Genie sidebar) shows the user and Sign out.
  return <>{children}</>;
}