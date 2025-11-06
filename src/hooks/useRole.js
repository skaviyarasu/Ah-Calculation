import { useState, useEffect } from 'react';
import { rbac, auth } from '../lib/supabase';

/**
 * Custom hook for role-based access control
 * Provides easy access to user role and permission checks
 */
export function useRole() {
  const [userRole, setUserRole] = useState('user');
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    checkRole();
  }, []);

  async function checkRole() {
    try {
      const user = await auth.getCurrentUser();
      if (!user) {
        setUserRole('user');
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      setCurrentUser(user);
      const role = await rbac.getUserRole(user.id);
      const admin = await rbac.isAdmin(user.id);
      
      setUserRole(role);
      setIsAdmin(admin);
    } catch (error) {
      console.error('Error checking role:', error);
      setUserRole('user');
      setIsAdmin(false);
    } finally {
      setLoading(false);
    }
  }

  async function hasPermission(permission, resource = null) {
    if (!currentUser) return false;
    try {
      return await rbac.hasPermission(currentUser.id, permission, resource);
    } catch (error) {
      console.error('Error checking permission:', error);
      return false;
    }
  }

  return {
    userRole,
    isAdmin,
    loading,
    currentUser,
    hasPermission,
    refresh: checkRole
  };
}

