import React from 'react';
import { createRoot } from 'react-dom/client';
import MainApp from './MainApp.jsx';
import LoginGate from './LoginGate.jsx';
import './index.css';

// Error boundary fallback
function ErrorFallback({ error }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-6">
      <div className="bg-white max-w-md w-full rounded-2xl shadow-xl p-8 text-center border border-red-200">
        <div className="text-red-600 mb-4">
          <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Application Error</h1>
        <p className="text-gray-600 mb-4">Something went wrong. Please check the console for details.</p>
        {error && (
          <details className="text-left bg-gray-50 p-4 rounded-lg text-sm text-gray-700">
            <summary className="cursor-pointer font-medium mb-2">Error Details</summary>
            <pre className="whitespace-pre-wrap">{error.message}</pre>
          </details>
        )}
        <button
          onClick={() => window.location.reload()}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Reload Page
        </button>
      </div>
    </div>
  );
}

function Root() {
  try {
    return (
      <React.StrictMode>
        <LoginGate>
          <MainApp />
        </LoginGate>
      </React.StrictMode>
    );
  } catch (error) {
    console.error('Root component error:', error);
    return <ErrorFallback error={error} />;
  }
}

// Render with error handling
const rootElement = document.getElementById('root');
if (!rootElement) {
  console.error('Root element not found!');
  document.body.innerHTML = '<div style="padding: 20px; text-align: center;"><h1>Error: Root element not found</h1><p>Please check your HTML file.</p></div>';
} else {
  try {
    const root = createRoot(rootElement);
    root.render(<Root />);
  } catch (error) {
    console.error('Failed to render app:', error);
    rootElement.innerHTML = `
      <div style="padding: 20px; text-align: center; color: red;">
        <h1>Failed to Initialize Application</h1>
        <p>${error.message}</p>
        <p style="margin-top: 20px; color: #666;">Check the browser console for more details.</p>
      </div>
    `;
  }
}