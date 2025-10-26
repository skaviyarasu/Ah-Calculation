import React, { useEffect, useState } from 'react';

// Constants
const AUTH_KEY = 'ahv_auth_user';
const USERS_KEY = 'ahv_users';

// Simple password hashing function (for demo - use proper hashing in production)
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + 'ahv_salt_2024');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export default function LoginGate({ children }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [isLogin, setIsLogin] = useState(true);
  
  // Form states
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // Initialize users storage and check authentication
  useEffect(() => {
    // Initialize users storage if it doesn't exist
    if (!localStorage.getItem(USERS_KEY)) {
      localStorage.setItem(USERS_KEY, JSON.stringify({}));
    }
    
    // Check if user is already authenticated
    const storedUser = localStorage.getItem(AUTH_KEY);
    if (storedUser) {
      const user = JSON.parse(storedUser);
      setCurrentUser(user);
      setIsAuthenticated(true);
    }
  }, []);

  async function handleLogin(e) {
    e.preventDefault();
    if (!username.trim() || !password) {
      alert('Please enter both username and password');
      return;
    }

    setLoading(true);
    try {
      const users = JSON.parse(localStorage.getItem(USERS_KEY) || '{}');
      const user = users[username.toLowerCase()];
      
      if (!user) {
        alert('User not found. Please register first.');
        setLoading(false);
        return;
      }

      const passwordHash = await hashPassword(password);
      if (user.passwordHash === passwordHash) {
        const userSession = {
          username: user.username,
          loginTime: new Date().toISOString()
        };
        
        localStorage.setItem(AUTH_KEY, JSON.stringify(userSession));
        setCurrentUser(userSession);
        setIsAuthenticated(true);
      } else {
        alert('Invalid password');
      }
    } catch (error) {
      console.error('Login error:', error);
      alert('Login failed. Please try again.');
    }
    setLoading(false);
  }

  async function handleRegister(e) {
    e.preventDefault();
    if (!username.trim() || !password || !confirmPassword) {
      alert('Please fill in all fields');
      return;
    }

    if (password !== confirmPassword) {
      alert('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      alert('Password must be at least 6 characters long');
      return;
    }

    setLoading(true);
    try {
      const users = JSON.parse(localStorage.getItem(USERS_KEY) || '{}');
      
      if (users[username.toLowerCase()]) {
        alert('Username already exists. Please choose a different username.');
        setLoading(false);
        return;
      }

      const passwordHash = await hashPassword(password);
      const newUser = {
        username: username.trim(),
        passwordHash,
        createdAt: new Date().toISOString()
      };

      users[username.toLowerCase()] = newUser;
      localStorage.setItem(USERS_KEY, JSON.stringify(users));
      
      alert('Registration successful! Please login with your credentials.');
      setIsLogin(true);
      setUsername('');
      setPassword('');
      setConfirmPassword('');
    } catch (error) {
      console.error('Registration error:', error);
      alert('Registration failed. Please try again.');
    }
    setLoading(false);
  }

  function logout() {
    localStorage.removeItem(AUTH_KEY);
    setIsAuthenticated(false);
    setCurrentUser(null);
    setUsername('');
    setPassword('');
    setConfirmPassword('');
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 p-6">
        <div className="bg-white max-w-md w-full rounded-2xl shadow-lg p-6 space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-800 mb-2">
              AH Balancer
            </h1>
            <p className="text-gray-600">
              {isLogin ? 'Sign in to your account' : 'Create new account'}
            </p>
          </div>

          <div className="flex bg-gray-100 rounded-xl p-1">
            <button
              onClick={() => setIsLogin(true)}
              className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                isLogin 
                  ? 'bg-white text-gray-900 shadow-sm' 
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Login
            </button>
            <button
              onClick={() => setIsLogin(false)}
              className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                !isLogin 
                  ? 'bg-white text-gray-900 shadow-sm' 
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Register
            </button>
          </div>

          <form onSubmit={isLogin ? handleLogin : handleRegister} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter your username"
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

            {!isLogin && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Confirm Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Confirm your password"
                  required
                />
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className={`w-full py-3 px-4 rounded-xl font-medium transition-colors ${
                loading
                  ? 'bg-gray-400 text-gray-200 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              {loading ? 'Processing...' : isLogin ? 'Sign In' : 'Create Account'}
            </button>
          </form>

          {!isLogin && (
            <div className="text-center">
              <p className="text-xs text-gray-500">
                Password must be at least 6 characters long
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="fixed top-3 right-3 flex items-center gap-3">
        <span className="text-sm text-gray-600">
          Welcome, <strong>{currentUser?.username}</strong>
        </span>
        <button 
          onClick={logout} 
          className="text-sm border border-red-300 hover:border-red-400 rounded-lg px-3 py-1 bg-white hover:bg-red-50 text-red-600 transition-colors"
        >
          Logout
        </button>
      </div>
      {children}
    </div>
  );
}