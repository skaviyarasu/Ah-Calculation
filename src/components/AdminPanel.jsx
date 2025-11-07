import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { rbac, auth, organization } from '../lib/supabase';
import UserRegistration from './UserRegistration';
import {
  PERMISSION_MATRIX,
  PERMISSION_COLUMNS,
  ROLE_METADATA,
  PERMISSION_CONFIG_KEYS,
  makePermissionKey
} from '../constants/rolePermissionMatrix';

export default function AdminPanel() {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [rolePermissions, setRolePermissions] = useState({});
  const [roleCatalogMap, setRoleCatalogMap] = useState({});
  const [currentUser, setCurrentUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [assigningRole, setAssigningRole] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('users'); // 'users', 'roles', or 'register'
  const [userStats, setUserStats] = useState({ total: 0, admins: 0, regular: 0 });
  const [expandedUserId, setExpandedUserId] = useState(null);
  const [selectedRoleKey, setSelectedRoleKey] = useState('admin');
  const [rolePermissionsLoading, setRolePermissionsLoading] = useState(false);
  const [permissionBusyKey, setPermissionBusyKey] = useState(null);
  const [expandedPermissionRow, setExpandedPermissionRow] = useState(null);
  const [creatingRole, setCreatingRole] = useState(false);
  const [newRoleKey, setNewRoleKey] = useState('');
  const [newRoleLabel, setNewRoleLabel] = useState('');
  const [newRoleDescription, setNewRoleDescription] = useState('');
  const [assignRoleSelection, setAssignRoleSelection] = useState('user');
  const [usersLoading, setUsersLoading] = useState(false);
  const [organizationsList, setOrganizationsList] = useState([]);
  const [branchesList, setBranchesList] = useState([]);
  const [orgsLoading, setOrgsLoading] = useState(false);
  const [createOrgLoading, setCreateOrgLoading] = useState(false);
  const [createBranchLoading, setCreateBranchLoading] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const [newOrgCode, setNewOrgCode] = useState('');
  const [newOrgDescription, setNewOrgDescription] = useState('');
  const [newBranchOrgId, setNewBranchOrgId] = useState('');
  const [newBranchName, setNewBranchName] = useState('');
  const [newBranchCode, setNewBranchCode] = useState('');
  const [assignBranchSelection, setAssignBranchSelection] = useState('');
  const [assignBranchPrimary, setAssignBranchPrimary] = useState(false);
  const [branchAssignmentBusy, setBranchAssignmentBusy] = useState(false);

  const DEFAULT_ROLES = useMemo(() => ['admin', 'accountant', 'creator', 'verifier', 'user'], []);

  const processRolePermissionRows = (rows = [], catalogEntries = []) => {
    const catalogMap = catalogEntries.reduce((acc, entry) => {
      if (!entry?.role) return acc;
      acc[entry.role] = entry;
      return acc;
    }, {});
    setRoleCatalogMap(catalogMap);

    const grouped = {};
    rows.forEach((row) => {
      if (!row) return;
      const roleName = row.role || 'user';
      const key = makePermissionKey(row.permission, row.resource);
      if (!grouped[roleName]) grouped[roleName] = {};
      grouped[roleName][key] = row;
    });

    const roleSet = new Set(DEFAULT_ROLES);
    catalogEntries.forEach((entry) => {
      if (entry?.role) roleSet.add(entry.role);
    });
    rows.forEach((row) => {
      if (row?.role) roleSet.add(row.role);
    });

    const roleList = Array.from(roleSet).sort((a, b) => a.localeCompare(b));
    const normalised = roleList.reduce((acc, role) => {
      acc[role] = grouped[role] || {};
      return acc;
    }, {});

    setRoles(roleList);
    setRolePermissions(normalised);

    setSelectedRoleKey((prev) => {
      if (prev && roleList.includes(prev)) return prev;
      if (roleList.includes('admin')) return 'admin';
      return roleList[0] || 'admin';
    });
  };

  const refreshRolePermissions = async () => {
    const previousScroll = typeof window !== 'undefined' ? window.scrollY : 0;
    setRolePermissionsLoading(true);
    try {
      const { permissions, catalog } = await rbac.getAllRoles();
      processRolePermissionRows(permissions, catalog);
    } catch (error) {
      console.error('Error loading role permissions:', error);
      alert('Failed to load role permissions: ' + (error.message || 'Unknown error'));
    } finally {
      setRolePermissionsLoading(false);
      restoreScrollPosition(previousScroll);
    }
  };

  const restoreScrollPosition = useCallback((scrollY) => {
    if (typeof window === 'undefined') return;
    const safeY = Math.max(scrollY, 0);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.scrollTo({ top: safeY, left: 0, behavior: 'auto' });
      });
    });
  }, []);

  const updateUserStats = (usersData = []) => {
    const totalUsers = usersData.length;
    const admins = usersData.filter(user => user.roles.includes('admin')).length;
    const regular = Math.max(totalUsers - admins, 0);

    setUserStats({
      total: totalUsers,
      admins,
      regular
    });
  };

  const refreshUsersData = async () => {
    const previousScroll = typeof window !== 'undefined' ? window.scrollY : 0;
    setUsersLoading(true);
    try {
      const usersData = await rbac.getAllUsersWithRoles();
      setUsers(usersData);
      updateUserStats(usersData);
    } catch (error) {
      console.error('Error loading users:', error);
      alert('Failed to load users: ' + (error.message || 'Unknown error'));
    } finally {
      setUsersLoading(false);
      restoreScrollPosition(previousScroll);
    }
  };

  const loadOrganizationsAndBranches = async () => {
    setOrgsLoading(true);
    try {
      const [orgs, branches] = await Promise.all([
        organization.getOrganizations(),
        organization.getBranches()
      ]);
      setOrganizationsList(orgs);
      setBranchesList(branches);
      if (!newBranchOrgId && orgs.length > 0) {
        setNewBranchOrgId(orgs[0].id);
      }
    } catch (error) {
      console.error('Error loading organizations/branches:', error);
      alert('Failed to load organizations or branches: ' + (error.message || 'Unknown error'));
    } finally {
      setOrgsLoading(false);
    }
  };

  const TriStateCheckbox = ({ checked, indeterminate, onChange, disabled, title }) => {
    const checkboxRef = useRef(null);
    useEffect(() => {
      if (checkboxRef.current) {
        checkboxRef.current.indeterminate = indeterminate && !checked;
      }
    }, [indeterminate, checked]);

    return (
      <input
        type="checkbox"
        ref={checkboxRef}
        className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        title={title}
      />
    );
  };

  const dedupeEntries = (entries = []) => {
    const map = new Map();
    entries.forEach((entry) => {
      if (!entry?.permission) return;
      const key = makePermissionKey(entry.permission, entry.resource);
      if (!map.has(key)) {
        map.set(key, entry);
      }
    });
    return Array.from(map.values());
  };

  const selectedRolePermissions = rolePermissions[selectedRoleKey] || {};

  const hasEntry = (entry) => {
    if (!entry?.permission) return false;
    return Boolean(selectedRolePermissions[makePermissionKey(entry.permission, entry.resource)]);
  };

  const getFullEntries = (row) => {
    if (!row?.actions) return [];
    if (Array.isArray(row.actions.full) && row.actions.full.length > 0) {
      return row.actions.full;
    }

    const collected = [];
    Object.entries(row.actions).forEach(([key, value]) => {
      if (key === 'full' || !Array.isArray(value)) return;
      value.forEach((entry) => {
        if (!entry?.permission) return;
        if (entry.includeInFull === false) return;
        const entryKey = makePermissionKey(entry.permission, entry.resource);
        if (!collected.find((item) => makePermissionKey(item.permission, item.resource) === entryKey)) {
          collected.push(entry);
        }
      });
    });
    return collected;
  };

  const getEntriesForColumn = (row, columnKey) => {
    if (!row?.actions) return [];
    if (columnKey === 'full') {
      return getFullEntries(row);
    }
    const value = row.actions[columnKey];
    if (!Array.isArray(value)) return [];
    return value;
  };

  const makeBusyKey = (entries = [], enable) => {
    const keys = entries.map((entry) => makePermissionKey(entry.permission, entry.resource)).join('|');
    return `${selectedRoleKey}:${enable ? 'grant' : 'revoke'}:${keys}`;
  };

  const handlePermissionUpdate = async (entries = [], enable) => {
    const deduped = dedupeEntries(entries);
    if (!deduped.length) return;
    const busyKey = makeBusyKey(deduped, enable);
    setPermissionBusyKey(busyKey);
    try {
      if (enable) {
        await Promise.all(
          deduped.map((entry) =>
            rbac.grantRolePermission(selectedRoleKey, entry.permission, entry.resource, entry.description)
          )
        );
      } else {
        await Promise.all(
          deduped.map((entry) => rbac.revokeRolePermission(selectedRoleKey, entry.permission, entry.resource))
        );
      }
      await refreshRolePermissions();
    } catch (error) {
      console.error('Error updating permissions:', error);
      alert('Failed to update permissions: ' + (error.message || 'Unknown error'));
    } finally {
      setPermissionBusyKey(null);
    }
  };

  const permissionBusy = Boolean(permissionBusyKey);

  const isColumnChecked = (row, columnKey) => {
    const entries = getEntriesForColumn(row, columnKey);
    if (!entries.length) return false;
    return entries.every((entry) => hasEntry(entry));
  };

  const isColumnIndeterminate = (row, columnKey) => {
    const entries = getEntriesForColumn(row, columnKey);
    if (!entries.length) return false;
    const someEnabled = entries.some((entry) => hasEntry(entry));
    return someEnabled && !isColumnChecked(row, columnKey);
  };

  const activeCountForEntries = (entries = []) => entries.filter((entry) => hasEntry(entry)).length;

  const unmappedPermissions = useMemo(() => {
    const entries = Object.values(selectedRolePermissions || {});
    return entries.filter(
      (entry) => !PERMISSION_CONFIG_KEYS.has(makePermissionKey(entry.permission, entry.resource))
    );
  }, [selectedRolePermissions]);

  const getRoleLabel = (role) => {
    return (
      roleCatalogMap[role]?.label ||
      ROLE_METADATA[role]?.label ||
      role.charAt(0).toUpperCase() + role.slice(1)
    );
  };

  const selectedRoleMeta = roleCatalogMap[selectedRoleKey] || ROLE_METADATA[selectedRoleKey] || {
    label: getRoleLabel(selectedRoleKey),
    description: 'Configure module-level permissions for this role.'
  };

  useEffect(() => {
    checkAdminAccess();
    loadData();
  }, []);

  // Debug: Log active tab
  useEffect(() => {
    console.log('AdminPanel active tab:', activeTab);
  }, [activeTab]);

  useEffect(() => {
    setExpandedPermissionRow(null);
  }, [selectedRoleKey]);

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
    await Promise.all([refreshUsersData(), refreshRolePermissions(), loadOrganizationsAndBranches()]);
  }

  async function handleAssignRole(userId, role) {
    // Special validation for admin role assignment
    if (role === 'admin') {
      // Count existing admins
      const adminCount = users.filter(u => u.roles.includes('admin')).length;
      
      // Warn about admin privileges
      const adminWarning = `⚠️ WARNING: Admin Role Assignment\n\n` +
        `Admin users have full system access including:\n` +
        `- View and edit all user data\n` +
        `- Manage all user roles\n` +
        `- Bypass all workflow restrictions\n` +
        `- Delete any job\n\n` +
        `Current admin count: ${adminCount}\n\n` +
        `Admin access should be limited to trusted personnel only.\n\n` +
        `Are you absolutely sure you want to assign admin role to this user?`;
      
      if (!confirm(adminWarning)) return;
      
      // Double confirmation for admin
      if (!confirm('This is a FINAL confirmation. Assign admin role?')) return;
    } else {
      // Standard confirmation for other roles
      if (!confirm(`Assign role "${role}" to this user?`)) return;
    }

    setAssigningRole(true);
    try {
      const user = await auth.getCurrentUser();
      await rbac.assignRole(userId, role, user.id);
      alert(`Role "${role}" assigned successfully!`);
      await refreshUsersData();
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
      await refreshUsersData();
    } catch (error) {
      console.error('Error removing role:', error);
      alert('Failed to remove role: ' + (error.message || 'Unknown error'));
    }
  }

  const handleCreateRole = async (event) => {
    event.preventDefault();
    const slug = newRoleKey
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-_\s]/g, '')
      .replace(/\s+/g, '_');

    if (!slug) {
      alert('Please provide a valid role key (letters, numbers, dashes or underscores).');
      return;
    }

    if (roles.includes(slug)) {
      alert('This role already exists.');
      return;
    }

    setCreatingRole(true);
    try {
      const label = newRoleLabel.trim() || getRoleLabel(slug);
      await rbac.createRole(slug, label, newRoleDescription.trim() || null);
      setNewRoleKey('');
      setNewRoleLabel('');
      setNewRoleDescription('');
      await refreshRolePermissions();
      setSelectedRoleKey(slug);
      alert(`Role "${label}" created successfully.`);
    } catch (error) {
      console.error('Error creating role:', error);
      alert('Failed to create role: ' + (error.message || 'Unknown error'));
    } finally {
      setCreatingRole(false);
    }
  };

  const handleCreateOrganization = async (event) => {
    event.preventDefault();
    if (!newOrgName.trim()) {
      alert('Organization name is required.');
      return;
    }

    setCreateOrgLoading(true);
    try {
      await organization.createOrganization({
        name: newOrgName.trim(),
        code: newOrgCode.trim() || null,
        description: newOrgDescription.trim() || null
      });
      setNewOrgName('');
      setNewOrgCode('');
      setNewOrgDescription('');
      await loadOrganizationsAndBranches();
      alert('Organization created successfully.');
    } catch (error) {
      console.error('Error creating organization:', error);
      alert('Failed to create organization: ' + (error.message || 'Unknown error'));
    } finally {
      setCreateOrgLoading(false);
    }
  };

  const handleCreateBranch = async (event) => {
    event.preventDefault();
    if (!newBranchOrgId) {
      alert('Please select an organization for the branch.');
      return;
    }
    if (!newBranchName.trim()) {
      alert('Branch name is required.');
      return;
    }

    setCreateBranchLoading(true);
    try {
      await organization.createBranch({
        organization_id: newBranchOrgId,
        name: newBranchName.trim(),
        code: newBranchCode.trim() || null
      });
      setNewBranchName('');
      setNewBranchCode('');
      await loadOrganizationsAndBranches();
      alert('Branch created successfully.');
    } catch (error) {
      console.error('Error creating branch:', error);
      alert('Failed to create branch: ' + (error.message || 'Unknown error'));
    } finally {
      setCreateBranchLoading(false);
    }
  };

  const handleAssignBranchToUser = async (userId) => {
    if (!assignBranchSelection) {
      alert('Select a branch to assign.');
      return;
    }

    setBranchAssignmentBusy(true);
    try {
      const currentUser = await auth.getCurrentUser();
      await organization.assignUserToBranch(userId, assignBranchSelection, {
        is_primary: assignBranchPrimary,
        assignedBy: currentUser?.id || null
      });

      if (assignBranchPrimary) {
        await organization.setPrimaryBranch(userId, assignBranchSelection);
      }

      await refreshUsersData();
      setAssignBranchSelection('');
      setAssignBranchPrimary(false);
      alert('Branch assignment updated.');
    } catch (error) {
      console.error('Error assigning branch:', error);
      alert('Failed to assign branch: ' + (error.message || 'Unknown error'));
    } finally {
      setBranchAssignmentBusy(false);
    }
  };

  const handleRemoveBranchAssignment = async (mapId) => {
    if (!confirm('Remove this branch from the user?')) return;
    setBranchAssignmentBusy(true);
    try {
      await organization.removeUserBranch(mapId);
      await refreshUsersData();
      alert('Branch removed from user.');
    } catch (error) {
      console.error('Error removing branch:', error);
      alert('Failed to remove branch: ' + (error.message || 'Unknown error'));
    } finally {
      setBranchAssignmentBusy(false);
    }
  };

  const handleSetPrimaryBranch = async (userId, branchId) => {
    setBranchAssignmentBusy(true);
    try {
      await organization.setPrimaryBranch(userId, branchId);
      await refreshUsersData();
      alert('Primary branch updated.');
    } catch (error) {
      console.error('Error setting primary branch:', error);
      alert('Failed to update primary branch: ' + (error.message || 'Unknown error'));
    } finally {
      setBranchAssignmentBusy(false);
    }
  };

  // Calculate unique users from roles data
  // Filter users based on search query
  const filteredUsers = React.useMemo(() => {
    if (!searchQuery.trim()) return users;

    const query = searchQuery.toLowerCase().trim();
    return users.filter(user => 
      (user.full_name && user.full_name.toLowerCase().includes(query)) ||
      (user.email && user.email.toLowerCase().includes(query)) ||
      (user.id && user.id.toLowerCase().includes(query)) ||
      user.roles.some(role => role.toLowerCase().includes(query))
    );
  }, [users, searchQuery]);

  const usersSortedByName = React.useMemo(() => {
    return [...users].sort((a, b) => {
      const aLabel = (a.full_name || a.email || a.id || '').toLowerCase();
      const bLabel = (b.full_name || b.email || b.id || '').toLowerCase();
      return aLabel.localeCompare(bLabel);
    });
  }, [users]);

  const formatDateTime = (value) => {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleString();
  };

  const formatDate = (value) => {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleDateString();
  };

  const removalRolesForUser = (user) => user.roles || [];

  const assignableRoles = useMemo(() => {
    return roles.filter((role) => role !== 'admin');
  }, [roles]);

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
              onClick={() => setActiveTab('register')}
              className={`px-4 py-2 font-medium transition-colors ${
                activeTab === 'register'
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Register User
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
            <button
              onClick={() => setActiveTab('structures')}
              className={`px-4 py-2 font-medium transition-colors ${
                activeTab === 'structures'
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Org & Branches
            </button>
          </div>

          {/* User Registration Tab */}
          {activeTab === 'register' && (
            <div className="space-y-6 mt-6">
              <UserRegistration onUserCreated={loadData} />
            </div>
          )}

          {/* Organization & Branches Tab */}
          {activeTab === 'structures' && (
            <div className="space-y-6 mt-6">
              <div className="grid gap-6 lg:grid-cols-2">
                <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 space-y-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-xl font-semibold text-gray-900">Organizations</h2>
                      <p className="text-sm text-gray-500">Manage companies or franchises operating within Duriyam.</p>
                    </div>
                    {orgsLoading && (
                      <span className="text-xs text-gray-400 animate-pulse">Refreshing…</span>
                    )}
                  </div>

                  <form onSubmit={handleCreateOrganization} className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Organization Name *</label>
                      <input
                        value={newOrgName}
                        onChange={(e) => setNewOrgName(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                        placeholder="Duriyam Energy Pvt Ltd"
                        required
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Code</label>
                        <input
                          value={newOrgCode}
                          onChange={(e) => setNewOrgCode(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                          placeholder="HQ"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                        <input
                          value={newOrgDescription}
                          onChange={(e) => setNewOrgDescription(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                          placeholder="Head office / master franchise"
                        />
                      </div>
                    </div>
                    <button
                      type="submit"
                      disabled={createOrgLoading}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                    >
                      {createOrgLoading ? 'Creating…' : 'Add Organization'}
                    </button>
                  </form>

                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Existing Organizations</h3>
                    <ul className="space-y-2 max-h-64 overflow-y-auto pr-1">
                      {organizationsList.length === 0 && (
                        <li className="text-sm text-gray-500">No organizations yet. Create one above.</li>
                      )}
                      {organizationsList.map((org) => (
                        <li key={org.id} className="p-3 border border-gray-200 rounded-md flex justify-between items-center">
                          <div>
                            <div className="text-sm font-medium text-gray-900">{org.name}</div>
                            <div className="text-xs text-gray-500">
                              {org.code || 'No code'} • Created {formatDate(org.created_at) || 'recently'}
                            </div>
                          </div>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${org.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}>
                            {org.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 space-y-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-xl font-semibold text-gray-900">Branches</h2>
                      <p className="text-sm text-gray-500">Add outlets, service centers, or warehouses under each organization.</p>
                    </div>
                  </div>

                  <form onSubmit={handleCreateBranch} className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Organization *</label>
                      <select
                        value={newBranchOrgId}
                        onChange={(e) => setNewBranchOrgId(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                        required
                      >
                        {organizationsList.length === 0 && <option value="">Create an organization first</option>}
                        {organizationsList.map((org) => (
                          <option key={org.id} value={org.id}>
                            {org.name}
                            {org.code ? ` • ${org.code}` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Branch Name *</label>
                        <input
                          value={newBranchName}
                          onChange={(e) => setNewBranchName(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                          placeholder="Chennai Service Hub"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Code</label>
                        <input
                          value={newBranchCode}
                          onChange={(e) => setNewBranchCode(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                          placeholder="CHN"
                        />
                      </div>
                    </div>
                    <button
                      type="submit"
                      disabled={createBranchLoading || organizationsList.length === 0}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                    >
                      {createBranchLoading ? 'Creating…' : 'Add Branch'}
                    </button>
                  </form>

                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Branches</h3>
                    <ul className="space-y-2 max-h-64 overflow-y-auto pr-1">
                      {branchesList.length === 0 && (
                        <li className="text-sm text-gray-500">No branches yet.</li>
                      )}
                      {branchesList.map((branch) => (
                        <li key={branch.id} className="p-3 border border-gray-200 rounded-md">
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="text-sm font-medium text-gray-900">{branch.name}</div>
                              <div className="text-xs text-gray-500">
                                {branch.code || 'No code'} • {branch.organizations?.name || 'Unknown org'}
                              </div>
                            </div>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${branch.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}>
                              {branch.is_active ? 'Active' : 'Inactive'}
                            </span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* User Management Tab */}
          {activeTab === 'users' && (
            <div className="space-y-6">
              <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
                {/* Header */}
                <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 border-b">
                  <div>
                    <h2 className="text-2xl font-semibold text-gray-900">All Users</h2>
                    <p className="text-sm text-gray-500">Manage user roles and account access.</p>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <span className="px-3 py-1 bg-blue-50 text-blue-600 rounded-full font-medium">
                      Users: {filteredUsers.length} / {userStats.total}
                    </span>
                    <button
                      onClick={() => setActiveTab('register')}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md shadow-sm transition-colors"
                    >
                      Invite User
                    </button>
                    <button
                      onClick={refreshUsersData}
                      className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-100 transition-colors disabled:opacity-50"
                      disabled={usersLoading}
                    >
                      {usersLoading ? 'Refreshing…' : 'Refresh'}
                    </button>
                  </div>
                </div>

                {/* Search */}
                <div className="px-6 py-4 border-b bg-gray-50">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Search Users</label>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 relative">
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search by user ID or role"
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                        🔍
                      </span>
                    </div>
                    <span className="text-xs text-gray-500 hidden sm:block">Tip: paste a Supabase user UUID to locate quickly.</span>
                  </div>
                </div>

                {/* Table Header */}
                <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide bg-gray-50">
                  <div className="col-span-5">User Details</div>
                  <div className="col-span-3">Last Sign-In</div>
                  <div className="col-span-2">Roles</div>
                  <div className="col-span-2 text-right">Actions</div>
                </div>

                {/* Users */}
                {usersLoading ? (
                  <p className="text-gray-500 text-sm text-center py-8">Loading users…</p>
                ) : filteredUsers.length === 0 ? (
                  <p className="text-gray-500 text-sm text-center py-8">
                    {searchQuery ? 'No users found matching your search.' : 'No users found yet. Invite a user to get started.'}
                  </p>
                ) : (
                  <div className="divide-y divide-gray-200">
                    {filteredUsers.map((user) => {
                      const displayName = user.full_name?.trim() || (user.email ? user.email.split('@')[0] : 'Unnamed User');
                      const displayEmail = user.email || 'Email not available';
                      const initials = user.full_name
                        ? user.full_name.split(' ').filter(Boolean).map(part => part[0]).join('').slice(0, 2).toUpperCase()
                        : (user.email ? user.email.slice(0, 2).toUpperCase() : 'US');
                      const truncatedId = user.id ? `${user.id.substring(0, 8)}...${user.id.substring(user.id.length - 4)}` : '';
                      const isActive = !!user.last_sign_in_at;
                      const statusLabel = isActive ? 'Active' : 'Inactive';
                      const lastSignInLabel = formatDateTime(user.last_sign_in_at) || 'Never signed in';
                      const createdLabel = formatDate(user.created_at);
                      return (
                        <div key={user.id} className="px-6 py-4">
                          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                            <div className="md:col-span-5 flex items-center gap-4">
                              <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-semibold text-lg">
                                {initials}
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-gray-900">{displayName}</span>
                                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                                    {statusLabel}
                                  </span>
                                </div>
                                <div className="text-xs text-gray-600">{displayEmail}</div>
                                {truncatedId && <div className="text-xs font-mono text-gray-400 mt-1">{truncatedId}</div>}
                                <div className="mt-2 text-xs text-gray-500 md:hidden">
                                  Last sign-in: {lastSignInLabel}
                                </div>
                                {createdLabel && (
                                  <div className="text-xs text-gray-400 mt-1 md:hidden">
                                    Account created {createdLabel}
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="md:col-span-3">
                              <div className="text-sm text-gray-700">{lastSignInLabel}</div>
                              <div className="mt-1 text-xs text-gray-400">
                                {createdLabel ? `Account created ${createdLabel}` : 'Creation date unavailable'}
                              </div>
                            </div>

                            <div className="md:col-span-2 flex flex-wrap gap-2">
                              {user.roles.length > 0 ? (
                                user.roles.map((role) => (
                                  <span
                                    key={role}
                                    className={`px-3 py-1 rounded-full text-xs font-medium ${
                                      role === 'admin'
                                        ? 'bg-red-100 text-red-700 border border-red-200'
                                        : role === 'creator'
                                        ? 'bg-purple-100 text-purple-700 border border-purple-200'
                                        : role === 'verifier'
                                        ? 'bg-orange-100 text-orange-700 border border-orange-200'
                                        : 'bg-blue-100 text-blue-700 border border-blue-200'
                                    }`}
                                  >
                                    {role.toUpperCase()}
                                  </span>
                                ))
                              ) : (
                                <span className="px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200">
                                  STANDARD USER
                                </span>
                              )}
                            </div>

                            <div className="md:col-span-3 flex md:justify-end">
                              <button
                                onClick={() => {
                                  setExpandedUserId(prev => {
                                    const next = prev === user.id ? null : user.id;
                                    if (next === user.id) {
                                      setAssignBranchSelection('');
                                      setAssignBranchPrimary(false);
                                    }
                                    return next;
                                  });
                                }}
                                className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-md text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                              >
                                <span className="hidden sm:inline">Manage</span>
                                <span role="img" aria-label="settings">⚙️</span>
                              </button>
                            </div>
                          </div>

                          {expandedUserId === user.id && (
                            <div className="mt-4 bg-blue-50 border border-blue-100 rounded-lg p-4 space-y-3">
                              <div className="flex flex-wrap gap-2">
                                <span className="text-sm font-semibold text-blue-800">Assign Roles</span>
                                <span className="text-xs text-blue-500">(Current: {user.roles.length > 0 ? user.roles.join(', ') : 'None'})</span>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <button
                                  onClick={() => handleAssignRole(user.id, 'admin')}
                                  disabled={user.roles.includes('admin') || assigningRole || usersLoading}
                                  className="px-3 py-1.5 text-xs bg-red-600 text-white rounded-md hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-semibold"
                                  title="⚠️ Admin role grants full system access"
                                >
                                  {user.roles.includes('admin') ? 'Admin Assigned' : 'Assign Admin'}
                                </button>
                                {assignableRoles.map((role) => {
                                  const isAssigned = user.roles.includes(role);
                                  const label = getRoleLabel(role);
                                  return (
                                    <button
                                      key={`${user.id}-assign-${role}`}
                                      onClick={() => handleAssignRole(user.id, role)}
                                      disabled={isAssigned || assigningRole || usersLoading}
                                      className={`px-3 py-1.5 text-xs text-white rounded-md transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed ${
                                        role === 'creator'
                                          ? 'bg-purple-600 hover:bg-purple-700'
                                          : role === 'verifier'
                                          ? 'bg-orange-600 hover:bg-orange-700'
                                          : role === 'accountant'
                                          ? 'bg-emerald-600 hover:bg-emerald-700'
                                          : 'bg-blue-600 hover:bg-blue-700'
                                      }`}
                                    >
                                      {isAssigned ? `${label} Assigned` : `Assign ${label}`}
                                    </button>
                                  );
                                })}
                              </div>

                              {removalRolesForUser(user).length > 0 && (
                                <div className="pt-2 border-t border-blue-100">
                                  <span className="text-xs font-semibold text-blue-800">Remove Roles</span>
                                  <div className="mt-2 flex flex-wrap gap-2">
                                    {removalRolesForUser(user).map((role) => (
                                      <button
                                        key={`${user.id}-remove-${role}`}
                                        onClick={() => handleRemoveRole(user.id, role)}
                                        disabled={assigningRole || usersLoading}
                                        className="px-2.5 py-1 text-xs bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 disabled:bg-gray-300 disabled:text-gray-500 transition-colors"
                                      >
                                        Remove {getRoleLabel(role)}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}

                              <div className="pt-3 border-t border-blue-100 space-y-3">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-xs font-semibold text-blue-800 uppercase tracking-wide">Branch Assignments</span>
                                  {branchAssignmentBusy && <span className="text-[11px] text-blue-500 animate-pulse">Updating…</span>}
                                </div>
                                {user.branches?.length ? (
                                  <div className="flex flex-wrap gap-2">
                                    {user.branches.map((branch) => (
                                      <div
                                        key={branch.id}
                                        className="bg-white border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-900 shadow-sm flex flex-col gap-1"
                                      >
                                        <div className="font-semibold">
                                          {branch.branch_name || 'Unnamed Branch'}
                                          {branch.branch_code ? ` • ${branch.branch_code}` : ''}
                                        </div>
                                        <div className="text-[11px] text-blue-500">
                                          {branch.organization_name || 'No organization'}
                                        </div>
                                        <div className="flex gap-1">
                                          <button
                                            onClick={() => handleSetPrimaryBranch(user.id, branch.branch_id)}
                                            disabled={branchAssignmentBusy || branch.is_primary}
                                            className={`px-2 py-0.5 rounded-md border text-[11px] transition-colors ${
                                              branch.is_primary
                                                ? 'bg-green-100 border-green-200 text-green-700 cursor-default'
                                                : 'border-blue-200 text-blue-600 hover:bg-blue-100'
                                            }`}
                                          >
                                            {branch.is_primary ? 'Primary' : 'Set Primary'}
                                          </button>
                                          <button
                                            onClick={() => handleRemoveBranchAssignment(branch.id)}
                                            disabled={branchAssignmentBusy}
                                            className="px-2 py-0.5 rounded-md border border-red-200 text-red-600 hover:bg-red-100 text-[11px]"
                                          >
                                            Remove
                                          </button>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-xs text-blue-600">No branches assigned yet.</p>
                                )}

                                <div className="flex flex-col sm:flex-row gap-2">
                                  <div className="flex-1">
                                    <select
                                      value={assignBranchSelection}
                                      onChange={(e) => setAssignBranchSelection(e.target.value)}
                                      className="w-full px-3 py-2 border border-blue-200 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                                    >
                                      <option value="">Select branch…</option>
                                      {branchesList.map((branch) => (
                                        <option key={`assign-branch-${branch.id}`} value={branch.id}>
                                          {branch.name}
                                          {branch.organizations?.name ? ` • ${branch.organizations.name}` : ''}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                  <label className="inline-flex items-center gap-2 text-xs text-blue-700">
                                    <input
                                      type="checkbox"
                                      checked={assignBranchPrimary}
                                      onChange={(e) => setAssignBranchPrimary(e.target.checked)}
                                      className="rounded border-blue-300 text-blue-600 focus:ring-blue-500"
                                    />
                                    Mark as primary
                                  </label>
                                  <button
                                    onClick={() => handleAssignBranchToUser(user.id)}
                                    disabled={branchAssignmentBusy || !assignBranchSelection}
                                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-md transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                                  >
                                    Assign Branch
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Assign Role to New User */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h2 className="text-lg font-semibold text-blue-800 mb-3">Assign Role to New User</h2>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Select User
                    </label>
                    <select
                      value={selectedUser || ''}
                      onChange={(e) => setSelectedUser(e.target.value || null)}
                      className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    >
                      <option value="">Choose a user…</option>
                      {usersSortedByName.map((user) => (
                        <option key={user.id} value={user.id}>
                          {(user.full_name?.trim() || 'Unnamed User')}{' '}
                          {user.email ? `• ${user.email}` : ''}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-500 mt-2">
                      Tip: Register a new user in the “Register User” tab, click Refresh, and they will appear in this list.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Select Role
                    </label>
                    <select
                      value={assignRoleSelection}
                      onChange={(e) => setAssignRoleSelection(e.target.value)}
                      className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    >
                      {roles.map((role) => (
                        <option key={`assign-${role}`} value={role}>
                          {getRoleLabel(role)}
                        </option>
                      ))}
                    </select>
                    {assignRoleSelection === 'admin' && (
                      <div className="bg-red-50 border border-red-200 rounded p-2 text-xs text-red-700">
                        ⚠️ Admin access is restricted. Assign only to trusted personnel.
                      </div>
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={() => selectedUser && handleAssignRole(selectedUser, assignRoleSelection)}
                        disabled={!selectedUser || assigningRole || usersLoading}
                        className={`px-4 py-2 text-white rounded-md transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed ${
                          assignRoleSelection === 'admin'
                            ? 'bg-red-600 hover:bg-red-700'
                            : 'bg-blue-600 hover:bg-blue-700'
                        }`}
                      >
                        {assigningRole ? 'Assigning…' : `Assign ${getRoleLabel(assignRoleSelection)}`}
                      </button>
                      <button
                        onClick={() => {
                          setSelectedUser(null);
                          setAssignRoleSelection('user');
                        }}
                        className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-100"
                      >
                        Reset
                      </button>
                    </div>
                    <p className="text-xs text-gray-500">
                      💡 Tip: Users can hold multiple roles simultaneously (e.g., Creator + Verifier).
                    </p>
                  </div>
                  <p className="text-xs text-gray-600">
                    💡 Tip: Need a new account? Use “Invite User” above, then refresh this view to assign roles.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Role Permissions Tab */}
          {activeTab === 'roles' && (
            <div className="space-y-6">
              <form onSubmit={handleCreateRole} className="bg-blue-50 border border-blue-200 rounded-xl p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-blue-800">Create New Role</h2>
                    <p className="text-xs text-blue-600 mt-1">Define a new role and then toggle the permissions below.</p>
                  </div>
                  <button
                    type="submit"
                    disabled={creatingRole || !newRoleKey.trim()}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                  >
                    {creatingRole ? 'Creating…' : 'Create Role'}
                  </button>
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Role Key *</label>
                    <input
                      value={newRoleKey}
                      onChange={(e) => setNewRoleKey(e.target.value)}
                      placeholder="e.g., operations_manager"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                      required
                    />
                    <p className="text-[11px] text-gray-500 mt-1">Lowercase letters, numbers, dashes or underscores.</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Display Label</label>
                    <input
                      value={newRoleLabel}
                      onChange={(e) => setNewRoleLabel(e.target.value)}
                      placeholder="Operations Manager"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                    <input
                      value={newRoleDescription}
                      onChange={(e) => setNewRoleDescription(e.target.value)}
                      placeholder="Brief summary of responsibilities"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    />
                  </div>
                </div>
              </form>

              <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 space-y-6">
                <div className="grid gap-6 md:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Role Name</label>
                    <select
                      value={selectedRoleKey}
                      onChange={(e) => setSelectedRoleKey(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      {roles.map((role) => (
                        <option key={role} value={role}>
                          {getRoleLabel(role)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                    <textarea
                      value={selectedRoleMeta.description || ''}
                      readOnly
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-200 rounded-md bg-gray-50 text-sm text-gray-700"
                    />
                    <p className="text-xs text-gray-500 mt-2">Descriptions help administrators understand the intended scope for each role.</p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-4 text-sm">
                  <div className="text-gray-600">
                    Configure module, page, and functional access for <span className="font-semibold text-gray-800">{selectedRoleMeta.label || selectedRoleKey}</span>.
                  </div>
                  <button
                    onClick={refreshRolePermissions}
                    disabled={rolePermissionsLoading}
                    className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Refresh Permissions
                  </button>
                </div>

                {rolePermissionsLoading ? (
                  <div className="py-12 text-center text-sm text-gray-500">Loading permissions…</div>
                ) : (
                  <div className="space-y-6">
                    {PERMISSION_MATRIX.map((module) => (
                      <div key={module.module} className="border border-gray-200 rounded-lg overflow-hidden">
                        <div className="bg-gray-100 px-4 py-3 flex items-start justify-between gap-3">
                          <div>
                            <h3 className="text-sm font-semibold text-gray-700">{module.module}</h3>
                            {module.description && <p className="text-xs text-gray-500 mt-1">{module.description}</p>}
                          </div>
                          <div className="text-xs text-gray-500">{module.rows.length} sections</div>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-white">
                              <tr>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Particulars</th>
                                {PERMISSION_COLUMNS.map((column) => (
                                  <th
                                    key={`${module.module}-${column.key}`}
                                    className="px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-center"
                                  >
                                    {column.label}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200 text-sm">
                              {module.rows.map((row) => {
                                const rowKey = `${module.module}-${row.key}`;
                                const othersEntries = getEntriesForColumn(row, 'others');
                                const othersActive = activeCountForEntries(othersEntries);
                                const isRowExpanded = expandedPermissionRow === rowKey;

                                return (
                                  <React.Fragment key={rowKey}>
                                    <tr>
                                      <td className="px-4 py-3 font-medium text-gray-800">{row.label}</td>
                                      {PERMISSION_COLUMNS.map((column) => {
                                        const entries = getEntriesForColumn(row, column.key);
                                        const disabled = !entries.length || permissionBusy || rolePermissionsLoading;

                                        if (column.key === 'others') {
                                          return (
                                            <td key={`${rowKey}-${column.key}`} className="px-3 py-3 text-center">
                                              {entries.length === 0 ? (
                                                <span className="text-gray-300">—</span>
                                              ) : (
                                                <button
                                                  onClick={() => setExpandedPermissionRow(isRowExpanded ? null : rowKey)}
                                                  className={`text-xs font-medium underline ${othersActive ? 'text-blue-600' : 'text-gray-600'} hover:text-blue-700`}
                                                >
                                                  {othersActive > 0 ? `${othersActive}/${entries.length} selected` : 'More Permissions'}
                                                </button>
                                              )}
                                            </td>
                                          );
                                        }

                                        if (entries.length === 0) {
                                          return (
                                            <td key={`${rowKey}-${column.key}`} className="px-3 py-3 text-center text-gray-300">—</td>
                                          );
                                        }

                                        const checked = isColumnChecked(row, column.key);
                                        const indeterminate = isColumnIndeterminate(row, column.key);
                                        const title = entries.map((entry) => entry.label || entry.permission).join(', ');

                                        return (
                                          <td key={`${rowKey}-${column.key}`} className="px-3 py-3 text-center">
                                            <TriStateCheckbox
                                              checked={checked}
                                              indeterminate={indeterminate}
                                              onChange={(e) => handlePermissionUpdate(entries, e.target.checked)}
                                              disabled={disabled}
                                              title={title}
                                            />
                                          </td>
                                        );
                                      })}
                                    </tr>

                                    {isRowExpanded && othersEntries.length > 0 && (
                                      <tr className="bg-blue-50/80">
                                        <td colSpan={PERMISSION_COLUMNS.length + 1} className="px-6 py-4">
                                          <div className="space-y-3">
                                            <div className="text-xs font-semibold text-blue-800 uppercase tracking-wide">Additional Permissions</div>
                                            <div className="space-y-3">
                                              {othersEntries.map((entry) => {
                                                const entryKey = makePermissionKey(entry.permission, entry.resource);
                                                const entryChecked = hasEntry(entry);
                                                return (
                                                  <label key={entryKey} className="flex items-start gap-3">
                                                    <input
                                                      type="checkbox"
                                                      className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                      checked={entryChecked}
                                                      onChange={(e) => handlePermissionUpdate([entry], e.target.checked)}
                                                      disabled={permissionBusy || rolePermissionsLoading}
                                                    />
                                                    <div>
                                                      <div className="text-sm font-medium text-gray-800">{entry.label || entry.permission}</div>
                                                      <div className="text-xs text-gray-500 mt-1">
                                                        {entry.description || 'No description provided.'}
                                                        {entry.resource && <span className="ml-1 text-[11px] uppercase text-gray-400">({entry.resource})</span>}
                                                      </div>
                                                    </div>
                                                  </label>
                                                );
                                              })}
                                            </div>
                                          </div>
                                        </td>
                                      </tr>
                                    )}
                                  </React.Fragment>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {unmappedPermissions.length > 0 && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="text-yellow-500 mt-1">⚠️</div>
                      <div>
                        <h4 className="text-sm font-semibold text-yellow-800">Unmapped Permissions</h4>
                        <p className="text-xs text-yellow-700 mt-1">
                          These permissions exist for this role but are not linked to the matrix above. You can remove them or keep them for advanced scenarios.
                        </p>
                      </div>
                    </div>
                    <ul className="space-y-2 text-sm">
                      {unmappedPermissions.map((entry) => {
                        const entryKey = makePermissionKey(entry.permission, entry.resource);
                        return (
                          <li key={entryKey} className="flex items-start justify-between gap-3 bg-white border border-yellow-100 rounded-md p-3">
                            <div>
                              <div className="font-semibold text-gray-800">{entry.permission}</div>
                              {entry.resource && <div className="text-xs text-gray-500">Resource: {entry.resource}</div>}
                              {entry.description && <div className="text-xs text-gray-500 mt-1">{entry.description}</div>}
                            </div>
                            <button
                              onClick={() => handlePermissionUpdate([entry], false)}
                              className="text-xs text-red-600 hover:text-red-700"
                              disabled={permissionBusy || rolePermissionsLoading}
                            >
                              Remove
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Statistics */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 pt-4 border-t">
            <div className="text-center bg-gray-50 rounded-lg p-4">
              <div className="text-3xl font-bold text-gray-800">{userStats.total}</div>
              <div className="text-sm text-gray-600 mt-1">Total Users</div>
            </div>
            <div className="text-center bg-red-50 rounded-lg p-4 border-2 border-red-200">
              <div className="text-3xl font-bold text-red-600">{userStats.admins}</div>
              <div className="text-sm text-gray-600 mt-1">Admins</div>
              <div className="text-xs text-red-600 mt-1 font-medium">⚠️ Restricted</div>
            </div>
            <div className="text-center bg-purple-50 rounded-lg p-4">
              <div className="text-3xl font-bold text-purple-600">
                {users.filter(u => u.roles.includes('creator')).length}
              </div>
              <div className="text-sm text-gray-600 mt-1">Creators</div>
            </div>
            <div className="text-center bg-orange-50 rounded-lg p-4">
              <div className="text-3xl font-bold text-orange-600">
                {users.filter(u => u.roles.includes('verifier')).length}
              </div>
              <div className="text-sm text-gray-600 mt-1">Verifiers</div>
            </div>
            <div className="text-center bg-blue-50 rounded-lg p-4">
              <div className="text-3xl font-bold text-blue-600">
                {users.filter(u => u.roles.includes('user') || u.roles.length === 0).length}
              </div>
              <div className="text-sm text-gray-600 mt-1">Standard Users</div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

