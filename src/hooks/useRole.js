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

  // Inventory-specific permission checks
  const [canViewInventory, setCanViewInventory] = useState(false);
  const [canManageInventory, setCanManageInventory] = useState(false);

  useEffect(() => {
    async function checkInventoryPermissions() {
      if (!currentUser) {
        setCanViewInventory(false);
        setCanManageInventory(false);
        return;
      }
      try {
        const viewInventory = await rbac.hasPermission(currentUser.id, 'view_inventory', 'inventory');
        const addInventory = await rbac.hasPermission(currentUser.id, 'add_inventory_items', 'inventory');
        const editInventory = await rbac.hasPermission(currentUser.id, 'edit_inventory_items', 'inventory');
        setCanViewInventory(viewInventory);
        setCanManageInventory(addInventory || editInventory || isAdmin);
      } catch (error) {
        console.error('Error checking inventory permissions:', error);
        setCanViewInventory(false);
        setCanManageInventory(false);
      }
    }
    
    if (currentUser && !loading) {
      checkInventoryPermissions();
    }
  }, [currentUser, loading, isAdmin]);

  return {
    userRole,
    isAdmin,
    loading,
    currentUser,
    currentUserId: currentUser?.id || null,
    hasPermission,
    canViewInventory,
    canManageInventory,
    refresh: checkRole
  };
}

