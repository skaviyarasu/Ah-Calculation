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
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('users'); // 'users' or 'roles'
  const [userStats, setUserStats] = useState({ total: 0, admins: 0, regular: 0 });

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

      // Calculate stats
      const usersByRole = usersData.reduce((acc, userRole) => {
        if (!acc[userRole.user_id]) {
          acc[userRole.user_id] = [];
        }
        acc[userRole.user_id].push(userRole);
        return acc;
      }, {});

      const uniqueUsers = Object.keys(usersByRole);
      const admins = uniqueUsers.filter(userId => 
        usersByRole[userId].some(ur => ur.role === 'admin')
      );

      setUserStats({
        total: uniqueUsers.length,
        admins: admins.length,
        regular: uniqueUsers.length - admins.length
      });
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

  // Calculate unique users from roles data
  const uniqueUsers = React.useMemo(() => {
    const usersByRole = users.reduce((acc, userRole) => {
      if (!acc[userRole.user_id]) {
        acc[userRole.user_id] = [];
      }
      // Add all role entries (including null roles which indicate user exists but has no roles)
      acc[userRole.user_id].push(userRole);
      return acc;
    }, {});

    return Object.keys(usersByRole).map(userId => {
      const roleEntries = usersByRole[userId];
      // Filter out null roles and get actual roles
      const actualRoles = roleEntries.map(ur => ur.role).filter(Boolean);
      
      return {
        id: userId,
        roles: actualRoles,
        assigned_at: roleEntries.find(ur => ur.created_at)?.created_at,
        assigned_by: roleEntries.find(ur => ur.assigned_by)?.assigned_by,
        hasRoles: actualRoles.length > 0
      };
    });
  }, [users]);

  // Filter users based on search query
  const filteredUsers = React.useMemo(() => {
    if (!searchQuery.trim()) return uniqueUsers;

    const query = searchQuery.toLowerCase().trim();
    return uniqueUsers.filter(user => 
      user.id.toLowerCase().includes(query) ||
      user.roles.some(role => role.toLowerCase().includes(query))
    );
  }, [uniqueUsers, searchQuery]);

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
              <p className="text-gray-600 mt-1">User & Role Management System</p>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full font-medium">
                Admin
              </span>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 border-b">
            <button
              onClick={() => setActiveTab('users')}
              className={`px-4 py-2 font-medium transition-colors ${
                activeTab === 'users'
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              User Management
            </button>
            <button
              onClick={() => setActiveTab('roles')}
              className={`px-4 py-2 font-medium transition-colors ${
                activeTab === 'roles'
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Role Permissions
            </button>
          </div>

          {/* User Management Tab */}
          {activeTab === 'users' && (
            <div className="space-y-6">
              {/* Search and Filter */}
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex gap-4 items-end">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Search Users
                    </label>
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search by User ID or Role..."
                      className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <button
                    onClick={loadData}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
                  >
                    Refresh
                  </button>
                </div>
              </div>

              {/* Users List */}
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold text-gray-800">
                    Users & Roles ({filteredUsers.length})
                  </h2>
                </div>
              
                {filteredUsers.length === 0 ? (
                  <p className="text-gray-500 text-sm text-center py-8">
                    {searchQuery ? 'No users found matching your search.' : 'No users with roles found.'}
                  </p>
                ) : (
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {filteredUsers.map((user) => (
                      <div
                        key={user.id}
                        className="bg-white border rounded-lg p-4 hover:border-blue-300 transition-colors"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="mb-2">
                              <div className="font-mono text-sm font-semibold text-gray-800 mb-1">
                                {user.id.substring(0, 8)}...{user.id.substring(user.id.length - 4)}
                              </div>
                              <div className="text-xs text-gray-500">
                                {user.assigned_at && `Role assigned: ${new Date(user.assigned_at).toLocaleDateString()}`}
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-2 mb-2">
                              {user.roles.length > 0 ? (
                                user.roles.map((role) => (
                                  <span
                                    key={role}
                                    className={`px-3 py-1 rounded-full text-xs font-medium ${
                                      role === 'admin'
                                        ? 'bg-red-100 text-red-800 border border-red-200'
                                        : role === 'creator'
                                        ? 'bg-purple-100 text-purple-800 border border-purple-200'
                                        : role === 'verifier'
                                        ? 'bg-orange-100 text-orange-800 border border-orange-200'
                                        : 'bg-blue-100 text-blue-800 border border-blue-200'
                                    }`}
                                  >
                                    {role.toUpperCase()}
                                  </span>
                                ))
                              ) : (
                                <span className="px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200">
                                  NO ROLES
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2 ml-4">
                            <button
                              onClick={() => handleAssignRole(user.id, 'admin')}
                              disabled={user.roles.includes('admin') || assigningRole}
                              className="px-3 py-1.5 text-xs bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                              title="Assign Admin Role"
                            >
                              Make Admin
                            </button>
                            <button
                              onClick={() => handleRemoveRole(user.id, 'admin')}
                              disabled={!user.roles.includes('admin') || assigningRole}
                              className="px-3 py-1.5 text-xs bg-red-600 text-white rounded-md hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                              title="Remove Admin Role"
                            >
                              Remove Admin
                            </button>
                            <button
                              onClick={() => handleAssignRole(user.id, 'creator')}
                              disabled={user.roles.includes('creator') || assigningRole}
                              className="px-3 py-1.5 text-xs bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                              title="Assign Creator Role"
                            >
                              Make Creator
                            </button>
                            <button
                              onClick={() => handleAssignRole(user.id, 'verifier')}
                              disabled={user.roles.includes('verifier') || assigningRole}
                              className="px-3 py-1.5 text-xs bg-orange-600 text-white rounded-md hover:bg-orange-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                              title="Assign Verifier Role"
                            >
                              Make Verifier
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Assign Role to New User */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h2 className="text-lg font-semibold text-blue-800 mb-3">Assign Role to New User</h2>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      User ID (UUID)
                    </label>
                    <input
                      type="text"
                      value={selectedUser || ''}
                      onChange={(e) => setSelectedUser(e.target.value)}
                      placeholder="Enter user UUID from Supabase Dashboard"
                      className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => selectedUser && handleAssignRole(selectedUser, 'admin')}
                      disabled={!selectedUser || assigningRole}
                      className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                    >
                      {assigningRole ? 'Assigning...' : 'Assign Admin Role'}
                    </button>
                    <button
                      onClick={() => selectedUser && handleAssignRole(selectedUser, 'creator')}
                      disabled={!selectedUser || assigningRole}
                      className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-md transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                    >
                      {assigningRole ? 'Assigning...' : 'Assign Creator Role'}
                    </button>
                    <button
                      onClick={() => selectedUser && handleAssignRole(selectedUser, 'verifier')}
                      disabled={!selectedUser || assigningRole}
                      className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-md transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                    >
                      {assigningRole ? 'Assigning...' : 'Assign Verifier Role'}
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
                    💡 Tip: Find user ID from Supabase Dashboard → Authentication → Users
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Role Permissions Tab */}
          {activeTab === 'roles' && (
            <div className="space-y-6">
              <div className="bg-gray-50 rounded-lg p-4">
                <h2 className="text-xl font-semibold text-gray-800 mb-4">Role Permissions</h2>
                
                <div className="grid md:grid-cols-2 gap-6">
                  {/* Admin Permissions */}
                  <div>
                    <h3 className="font-semibold text-red-800 mb-3 flex items-center gap-2">
                      <span className="px-2 py-1 bg-red-100 text-red-800 rounded text-xs">ADMIN</span>
                      Admin Role
                    </h3>
                    <ul className="space-y-2 text-sm">
                      {permissions.filter(p => p.role === 'admin').map((perm) => (
                        <li key={perm.id} className="flex items-start gap-2 bg-white p-2 rounded border">
                          <span className="text-green-600 mt-0.5">✓</span>
                          <div className="flex-1">
                            <span className="font-medium text-gray-800">{perm.permission}</span>
                            {perm.resource && (
                              <span className="text-gray-500 ml-2">• {perm.resource}</span>
                            )}
                            {perm.description && (
                              <div className="text-xs text-gray-500 mt-1">{perm.description}</div>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* User Permissions */}
                  <div>
                    <h3 className="font-semibold text-blue-800 mb-3 flex items-center gap-2">
                      <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">USER</span>
                      Standard User Role
                    </h3>
                    <ul className="space-y-2 text-sm">
                      {permissions.filter(p => p.role === 'user').map((perm) => (
                        <li key={perm.id} className="flex items-start gap-2 bg-white p-2 rounded border">
                          <span className="text-green-600 mt-0.5">✓</span>
                          <div className="flex-1">
                            <span className="font-medium text-gray-800">{perm.permission}</span>
                            {perm.resource && (
                              <span className="text-gray-500 ml-2">• {perm.resource}</span>
                            )}
                            {perm.description && (
                              <div className="text-xs text-gray-500 mt-1">{perm.description}</div>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Statistics */}
          <div className="grid grid-cols-3 gap-4 pt-4 border-t">
            <div className="text-center bg-gray-50 rounded-lg p-4">
              <div className="text-3xl font-bold text-gray-800">{userStats.total}</div>
              <div className="text-sm text-gray-600 mt-1">Total Users</div>
            </div>
            <div className="text-center bg-red-50 rounded-lg p-4">
              <div className="text-3xl font-bold text-red-600">{userStats.admins}</div>
              <div className="text-sm text-gray-600 mt-1">Administrators</div>
            </div>
            <div className="text-center bg-blue-50 rounded-lg p-4">
              <div className="text-3xl font-bold text-blue-600">{userStats.regular}</div>
              <div className="text-sm text-gray-600 mt-1">Standard Users</div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

