import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { rbac, auth, supabase } from '../lib/supabase';

export default function AdminPanel() {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [assigningRole, setAssigningRole] = useState(false);
  const [searchEmail, setSearchEmail] = useState('');
  const [searchResults, setSearchResults] = useState([]);

  useEffect(() => {
    checkAdminAccess();
    loadData();
  }, []);

  async function checkAdminAccess() {
    try {
      const user = await auth.getCurrentUser();
      if (!user) {
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      setCurrentUser(user);
      const admin = await rbac.isAdmin(user.id);
      setIsAdmin(admin);
      setLoading(false);
    } catch (error) {
      console.error('Error checking admin access:', error);
      setIsAdmin(false);
      setLoading(false);
    }
  }

  async function loadData() {
    try {
      const [usersData, rolesData] = await Promise.all([
        rbac.getAllUsersWithRoles(),
        rbac.getAllRoles()
      ]);

      setUsers(usersData);
      setRoles(rolesData);
      
      // Get permissions for both roles
      const [adminPerms, userPerms] = await Promise.all([
        rbac.getRolePermissions('admin'),
        rbac.getRolePermissions('user')
      ]);
      setPermissions([...adminPerms, ...userPerms]);
    } catch (error) {
      console.error('Error loading admin data:', error);
      alert('Failed to load admin data: ' + (error.message || 'Unknown error'));
    }
  }

  async function handleAssignRole(userId, role) {
    if (!confirm(`Assign role "${role}" to this user?`)) return;

    setAssigningRole(true);
    try {
      const user = await auth.getCurrentUser();
      await rbac.assignRole(userId, role, user.id);
      alert('Role assigned successfully!');
      await loadData();
    } catch (error) {
      console.error('Error assigning role:', error);
      alert('Failed to assign role: ' + (error.message || 'Unknown error'));
    }
    setAssigningRole(false);
  }

  async function handleRemoveRole(userId, role) {
    if (!confirm(`Remove role "${role}" from this user?`)) return;

    try {
      await rbac.removeRole(userId, role);
      alert('Role removed successfully!');
      await loadData();
    } catch (error) {
      console.error('Error removing role:', error);
      alert('Failed to remove role: ' + (error.message || 'Unknown error'));
    }
  }

  async function searchUserByEmail() {
    if (!searchEmail.trim()) {
      setSearchResults([]);
      return;
    }

    try {
      // Search in user_roles table for users
      // Note: We can't directly search auth.users, so we'll work with what we have
      const { data, error } = await supabase
        .from('user_roles')
        .select('user_id, role')
        .limit(100);

      if (error) throw error;

      // For now, we'll show users with roles
      // In production, you might want to store emails in a separate table
      setSearchResults(data || []);
    } catch (error) {
      console.error('Error searching users:', error);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Checking admin access...</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center border border-red-200">
          <div className="text-red-600 mb-4">
            <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h1>
          <p className="text-gray-600 mb-4">You do not have admin privileges to access this panel.</p>
          <p className="text-sm text-gray-500">Only administrators can manage user roles and permissions.</p>
        </div>
      </div>
    );
  }

  // Group users by user_id
  const usersByRole = users.reduce((acc, userRole) => {
    if (!acc[userRole.user_id]) {
      acc[userRole.user_id] = [];
    }
    acc[userRole.user_id].push(userRole);
    return acc;
  }, {});

  const uniqueUsers = Object.keys(usersByRole).map(userId => ({
    id: userId,
    roles: usersByRole[userId].map(ur => ur.role),
    assigned_at: usersByRole[userId][0]?.created_at
  }));

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-lg shadow-lg p-6 space-y-6"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b pb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-800">Admin Panel</h1>
              <p className="text-gray-600 mt-1">Role-Based Access Control Management</p>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full font-medium">
                Admin
              </span>
            </div>
          </div>

          {/* Role Management Section */}
          <div className="grid md:grid-cols-2 gap-6">
            {/* Users with Roles */}
            <div className="bg-gray-50 rounded-lg p-4">
              <h2 className="text-xl font-semibold text-gray-800 mb-4">Users & Roles</h2>
              
              {uniqueUsers.length === 0 ? (
                <p className="text-gray-500 text-sm">No users with roles found.</p>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {uniqueUsers.map((user) => (
                    <div
                      key={user.id}
                      className="bg-white border rounded-lg p-3 hover:border-blue-300 transition-colors"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex-1">
                          <div className="font-mono text-xs text-gray-500 mb-1">
                            {user.id.substring(0, 8)}...
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {user.roles.map((role) => (
                              <span
                                key={role}
                                className={`px-2 py-1 rounded text-xs font-medium ${
                                  role === 'admin'
                                    ? 'bg-red-100 text-red-800'
                                    : 'bg-blue-100 text-blue-800'
                                }`}
                              >
                                {role}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <button
                            onClick={() => handleAssignRole(user.id, 'admin')}
                            disabled={user.roles.includes('admin') || assigningRole}
                            className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                            title="Assign Admin Role"
                          >
                            +Admin
                          </button>
                          <button
                            onClick={() => handleRemoveRole(user.id, 'admin')}
                            disabled={!user.roles.includes('admin') || assigningRole}
                            className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                            title="Remove Admin Role"
                          >
                            -Admin
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Permissions Overview */}
            <div className="bg-gray-50 rounded-lg p-4">
              <h2 className="text-xl font-semibold text-gray-800 mb-4">Role Permissions</h2>
              
              <div className="space-y-4">
                {/* Admin Permissions */}
                <div>
                  <h3 className="font-semibold text-red-800 mb-2">Admin Role</h3>
                  <ul className="space-y-1 text-sm">
                    {permissions.filter(p => p.role === 'admin').map((perm) => (
                      <li key={perm.id} className="flex items-start gap-2">
                        <span className="text-green-600">✓</span>
                        <div>
                          <span className="font-medium">{perm.permission}</span>
                          {perm.resource && (
                            <span className="text-gray-500"> • {perm.resource}</span>
                          )}
                          {perm.description && (
                            <div className="text-xs text-gray-500">{perm.description}</div>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* User Permissions */}
                <div className="border-t pt-4">
                  <h3 className="font-semibold text-blue-800 mb-2">User Role</h3>
                  <ul className="space-y-1 text-sm">
                    {permissions.filter(p => p.role === 'user').map((perm) => (
                      <li key={perm.id} className="flex items-start gap-2">
                        <span className="text-green-600">✓</span>
                        <div>
                          <span className="font-medium">{perm.permission}</span>
                          {perm.resource && (
                            <span className="text-gray-500"> • {perm.resource}</span>
                          )}
                          {perm.description && (
                            <div className="text-xs text-gray-500">{perm.description}</div>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* Assign Role to New User */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h2 className="text-lg font-semibold text-blue-800 mb-3">Assign Role to User</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  User ID (UUID)
                </label>
                <input
                  type="text"
                  value={selectedUser || ''}
                  onChange={(e) => setSelectedUser(e.target.value)}
                  placeholder="Enter user UUID"
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => selectedUser && handleAssignRole(selectedUser, 'admin')}
                  disabled={!selectedUser || assigningRole}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  {assigningRole ? 'Assigning...' : 'Assign Admin Role'}
                </button>
                <button
                  onClick={() => selectedUser && handleAssignRole(selectedUser, 'user')}
                  disabled={!selectedUser || assigningRole}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  {assigningRole ? 'Assigning...' : 'Assign User Role'}
                </button>
              </div>
              <p className="text-xs text-gray-600">
                Tip: Find user ID from Supabase Dashboard → Authentication → Users
              </p>
            </div>
          </div>

          {/* Statistics */}
          <div className="grid grid-cols-3 gap-4 pt-4 border-t">
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-800">{uniqueUsers.length}</div>
              <div className="text-sm text-gray-600">Total Users</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">
                {uniqueUsers.filter(u => u.roles.includes('admin')).length}
              </div>
              <div className="text-sm text-gray-600">Admins</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">
                {uniqueUsers.filter(u => !u.roles.includes('admin')).length}
              </div>
              <div className="text-sm text-gray-600">Standard Users</div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

