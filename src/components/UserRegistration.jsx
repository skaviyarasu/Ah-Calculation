import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { auth, supabase } from '../lib/supabase';

export default function UserRegistration({ onUserCreated }) {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    fullName: '',
    initialRole: 'user' // Default role
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    // Clear errors when user types
    if (error) setError('');
    if (success) setSuccess('');
  };

  const validateForm = () => {
    if (!formData.email.trim()) {
      setError('Email is required');
      return false;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      setError('Please enter a valid email address');
      return false;
    }

    if (!formData.password) {
      setError('Password is required');
      return false;
    }

    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters long');
      return false;
    }

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return false;
    }

    if (!formData.fullName.trim()) {
      setError('Full name is required');
      return false;
    }

    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!validateForm()) {
      return;
    }

    setSubmitting(true);
    try {
      // Use regular signUp (admin.createUser requires service role key)
      // The user will be created in Supabase Auth
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: formData.email.trim(),
        password: formData.password,
        options: {
          data: {
            full_name: formData.fullName.trim()
          },
          email_redirect_to: window.location.origin
        }
      });

      if (signUpError) throw signUpError;

      if (!signUpData.user) {
        throw new Error('User creation failed - no user data returned');
      }

      // Assign initial role(s) if specified
      const currentUser = await auth.getCurrentUser();
      if (currentUser && formData.initialRole && formData.initialRole !== 'user') {
        const { rbac } = await import('../lib/supabase');
        
        // Handle multiple roles (e.g., "creator,verifier")
        const rolesToAssign = formData.initialRole.split(',').map(r => r.trim());
        
        for (const role of rolesToAssign) {
          if (role && role !== 'user') {
            try {
              await rbac.assignRole(signUpData.user.id, role, currentUser.id);
            } catch (roleError) {
              console.error(`Error assigning role ${role}:`, roleError);
              // Continue with other roles even if one fails
            }
          }
        }
      }

      setSuccess(`User registered successfully!\n\n` +
        `User ID: ${signUpData.user.id}\n` +
        `Email: ${formData.email}\n\n` +
        `Note: ${signUpData.user.email_confirmed_at 
          ? 'User can login immediately.' 
          : 'User needs to verify their email before they can login.\n\n' +
            'To enable immediate login, disable email confirmation in Supabase Dashboard → Authentication → Settings.'}`);

      // Reset form
      setFormData({
        email: '',
        password: '',
        confirmPassword: '',
        fullName: '',
        initialRole: 'user'
      });

      // Notify parent component
      if (onUserCreated) {
        onUserCreated();
      }
    } catch (error) {
      console.error('Registration error:', error);
      setError(error.message || 'Failed to register user. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <h2 className="text-2xl font-bold text-gray-800 mb-4">Register New User</h2>
      <p className="text-gray-600 mb-6">
        Create a new user account in Supabase. The user will be able to login immediately if email confirmation is disabled.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Full Name */}
        <div>
          <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 mb-2">
            Full Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            id="fullName"
            name="fullName"
            value={formData.fullName}
            onChange={handleChange}
            required
            className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Enter user's full name"
          />
        </div>

        {/* Email */}
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
            Email Address <span className="text-red-500">*</span>
          </label>
          <input
            type="email"
            id="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            required
            className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="user@example.com"
          />
        </div>

        {/* Password */}
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
            Password <span className="text-red-500">*</span>
          </label>
          <input
            type="password"
            id="password"
            name="password"
            value={formData.password}
            onChange={handleChange}
            required
            minLength={6}
            className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Minimum 6 characters"
          />
          <p className="text-xs text-gray-500 mt-1">Password must be at least 6 characters long</p>
        </div>

        {/* Confirm Password */}
        <div>
          <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-2">
            Confirm Password <span className="text-red-500">*</span>
          </label>
          <input
            type="password"
            id="confirmPassword"
            name="confirmPassword"
            value={formData.confirmPassword}
            onChange={handleChange}
            required
            minLength={6}
            className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Re-enter password"
          />
        </div>

        {/* Initial Role */}
        <div>
          <label htmlFor="initialRole" className="block text-sm font-medium text-gray-700 mb-2">
            Initial Role (Optional)
          </label>
          <select
            id="initialRole"
            name="initialRole"
            value={formData.initialRole}
            onChange={handleChange}
            className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="user">Standard User (No specific role)</option>
            <option value="creator">Creator (Can create jobs)</option>
            <option value="verifier">Verifier (Can review jobs)</option>
            <option value="creator,verifier">Creator + Verifier (Combined)</option>
          </select>
          <p className="text-xs text-gray-500 mt-1">
            You can assign or modify roles later from the User Management tab. Roles can be combined.
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-md p-3">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {/* Success Message */}
        {success && (
          <div className="bg-green-50 border border-green-200 rounded-md p-3">
            <p className="text-sm text-green-800 whitespace-pre-line">{success}</p>
          </div>
        )}

        {/* Submit Button */}
        <div className="flex gap-2 pt-4">
          <button
            type="submit"
            disabled={submitting}
            className={`px-6 py-2 rounded-md font-medium transition-colors ${
              submitting
                ? 'bg-gray-400 text-gray-200 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            {submitting ? 'Registering...' : 'Register User'}
          </button>
          <button
            type="button"
            onClick={() => {
              setFormData({
                email: '',
                password: '',
                confirmPassword: '',
                fullName: '',
                initialRole: 'user'
              });
              setError('');
              setSuccess('');
            }}
            className="px-6 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-md transition-colors"
          >
            Clear Form
          </button>
        </div>
      </form>

      {/* Info Box */}
      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-md p-4">
        <h3 className="text-sm font-semibold text-blue-800 mb-2">📝 Registration Notes:</h3>
        <ul className="text-xs text-blue-700 space-y-1 list-disc list-inside">
          <li>Users will be created in Supabase Authentication</li>
          <li>If email confirmation is enabled, users must verify their email before login</li>
          <li>If email confirmation is disabled, users can login immediately</li>
          <li>Initial role will be assigned automatically (you can change it later)</li>
          <li>Password requirements: Minimum 6 characters</li>
        </ul>
      </div>
    </div>
  );
}

