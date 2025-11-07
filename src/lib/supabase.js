import { createClient } from '@supabase/supabase-js'

// Supabase configuration
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Validate environment variables
if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Missing Supabase environment variables!')
  console.error('Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your environment variables.')
  console.error('Current values:', { supabaseUrl: !!supabaseUrl, supabaseAnonKey: !!supabaseAnonKey })
}

// Create Supabase client (will handle empty values gracefully)
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key'
)

// Database helper functions
export const db = {
  // Generate unique serial number (industry-standard format: AH-YYYYMMDD-XXXX)
  generateSerialNumber(sequenceNumber) {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    const sequence = String(sequenceNumber).padStart(4, '0')
    return `AH-${year}${month}${day}-${sequence}`
  },

  // Battery Optimization Jobs table operations
  async createJob(jobData) {
    // Generate unique serial number if not provided
    if (!jobData.serial_number) {
      // Get user's existing jobs to determine next sequence number
      const existingJobs = await this.getUserJobs(jobData.user_id)
      // Count jobs created today for same-day sequence
      const today = new Date().toISOString().split('T')[0]
      const todayJobs = existingJobs.filter(job => {
        const jobDate = job.created_at ? new Date(job.created_at).toISOString().split('T')[0] : null
        return jobDate === today
      })
      const nextSequence = todayJobs.length + 1
      jobData.serial_number = this.generateSerialNumber(nextSequence)
    }
    
    const { data, error } = await supabase
      .from('battery_optimization_jobs')
      .insert([jobData])
      .select()
      .single()
    
    if (error) throw error
    return data
  },

  async getUserJobs(userId) {
    const { data, error } = await supabase
      .from('battery_optimization_jobs')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
    
    if (error) throw error
    return data
  },

  async updateJob(jobId, updates) {
    const { data, error } = await supabase
      .from('battery_optimization_jobs')
      .update(updates)
      .eq('id', jobId)
      .select()
      .single()
    
    if (error) throw error
    return data
  },

  async deleteJob(jobId) {
    // Delete cell capacities first (due to foreign key constraint)
    await supabase
      .from('battery_cell_capacities')
      .delete()
      .eq('optimization_job_id', jobId)

    // Then delete the optimization job
    const { error } = await supabase
      .from('battery_optimization_jobs')
      .delete()
      .eq('id', jobId)
    
    if (error) throw error
    return true
  },

  // Battery Cell Capacities operations
  async saveCellData(jobId, gridData) {
    // First, delete existing cell capacities for this job
    await supabase
      .from('battery_cell_capacities')
      .delete()
      .eq('optimization_job_id', jobId)

    // Prepare cell capacity data for insertion
    const cellDataArray = []
    gridData.forEach((row, seriesIndex) => {
      row.forEach((value, parallelIndex) => {
        const cell = (value && typeof value === 'object') ? value : { ah: value }
        const capacity = Number.isFinite(cell?.ah) ? cell.ah : null
        const voltage = Number.isFinite(cell?.v) ? cell.v : null

        if (capacity !== null) {
          cellDataArray.push({
            optimization_job_id: jobId,
            series_index: seriesIndex,
            parallel_index: parallelIndex,
            capacity_mah: capacity,
            voltage: voltage
          })
        }
      })
    })

    if (cellDataArray.length > 0) {
      const { error } = await supabase
        .from('battery_cell_capacities')
        .insert(cellDataArray)
      
      if (error) throw error
    }
    
    return true
  },

  async getCellData(jobId) {
    const { data, error } = await supabase
      .from('battery_cell_capacities')
      .select('*')
      .eq('optimization_job_id', jobId)
      .order('series_index', { ascending: true })
      .order('parallel_index', { ascending: true })
    
    if (error) throw error
    return data
  },

  // Workflow functions
  async submitJobForReview(jobId) {
    const { data, error } = await supabase
      .rpc('submit_job_for_review', { job_id: jobId })
    
    if (error) throw error
    return data
  },

  async verifyJob(jobId, status, notes = null) {
    const { data, error } = await supabase
      .rpc('verify_job', {
        job_id: jobId,
        verification_status: status,
        notes: notes
      })
    
    if (error) throw error
    return data
  },

  async requestModification(jobId, notes) {
    const { data, error } = await supabase
      .rpc('request_modification', {
        job_id: jobId,
        notes: notes
      })
    
    if (error) throw error
    return data
  },

  // Get all jobs for review (for verifiers)
  async getJobsForReview() {
    const { data, error } = await supabase
      .from('battery_optimization_jobs')
      .select('*')
      .in('status', ['pending_review', 'approved', 'rejected', 'needs_modification'])
      .order('created_at', { ascending: false })
    
    if (error) throw error
    return data
  }
}

// Authentication helper functions
export const auth = {
  async signUp(email, password, userData) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: userData
      }
    })
    
    if (error) throw error
    return data
  },

  async signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    })
    
    if (error) throw error
    return data
  },

  async signOut() {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
    return true
  },

  async getCurrentUser() {
    const { data: { user } } = await supabase.auth.getUser()
    return user
  },

  async updateProfile(updates) {
    const { data, error } = await supabase.auth.updateUser({
      data: updates
    })
    
    if (error) throw error
    return data
  },

  // Listen to auth state changes
  onAuthStateChange(callback) {
    return supabase.auth.onAuthStateChange(callback)
  }
}

// Role-Based Access Control (RBAC) helper functions
export const rbac = {
  // Get user's role
  async getUserRole(userId) {
    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .order('role')
        .limit(1)
        .maybeSingle()
      
      if (error) {
        console.error('Error getting user role:', error)
        return 'user' // Default to 'user' role
      }
      
      return data?.role || 'user'
    } catch (error) {
      console.error('Exception getting user role:', error)
      return 'user'
    }
  },

  // Check if user has specific role
  async hasRole(userId, role) {
    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .eq('role', role)
        .maybeSingle()
      
      if (error) {
        console.error('Error checking role:', error)
        return false
      }
      
      return !!data
    } catch (error) {
      console.error('Exception checking role:', error)
      return false
    }
  },

  // Check if user is admin
  async isAdmin(userId) {
    const isAdmin = await this.hasRole(userId, 'admin')
    console.log(`Admin check for ${userId}:`, isAdmin)
    return isAdmin
  },

  // Check if user has permission
  async hasPermission(userId, permission, resource = null) {
    const { data, error } = await supabase
      .rpc('user_has_permission', {
        check_user_id: userId,
        check_permission: permission,
        check_resource: resource
      })
    
    if (error) {
      console.error('Error checking permission:', error)
      return false
    }
    
    return data || false
  },

  // Get all role permissions and catalog metadata (admin only)
  async getAllRoles() {
    const [permissionsResponse, catalogResponse] = await Promise.all([
      supabase
        .from('role_permissions')
        .select('role, permission, resource, description')
        .order('role')
        .order('permission'),
      supabase
        .from('role_catalog')
        .select('role, label, description, created_at, created_by')
        .order('role')
    ])

    if (permissionsResponse.error) throw permissionsResponse.error
    if (catalogResponse.error) throw catalogResponse.error

    return {
      permissions: permissionsResponse.data || [],
      catalog: catalogResponse.data || []
    }
  },

  async createRole(role, label, description = null) {
    const payload = {
      role,
      label: label || role,
      description: description || null
    }

    const { data, error } = await supabase
      .from('role_catalog')
      .insert(payload)
      .select()
      .single()

    if (error) throw error
    return data
  },

  // Get all users with their roles (admin only)
  // This function now includes users from both user_roles table and battery_optimization_jobs table
  // to show all authenticated users, even if they don't have roles assigned yet
  async getAllUsersWithRoles() {
    const [{ data: rolesData, error: rolesError }, { data: jobsData, error: jobsError }, directoryResponse, { data: branchAssignments, error: branchError }] = await Promise.all([
      supabase
        .from('user_roles')
        .select(`
          id,
          user_id,
          role,
          assigned_by,
          created_at,
          updated_at
        `)
        .order('created_at', { ascending: false }),
      supabase
        .from('battery_optimization_jobs')
        .select('user_id, created_at')
        .order('created_at', { ascending: false }),
      supabase.rpc('admin_get_all_users'),
      supabase
        .from('user_branch_map')
        .select(`
          id,
          user_id,
          branch_id,
          is_primary,
          created_at,
          branches:branch_id (
            id,
            name,
            code,
            organization_id,
            organizations:organization_id (
              id,
              name,
              code
            )
          )
        `)
    ])

    if (rolesError) throw rolesError
    if (jobsError) throw jobsError
    if (branchError) throw branchError

    let directoryData = null
    if (directoryResponse?.error) {
      console.warn('admin_get_all_users RPC error:', directoryResponse.error.message)
    } else {
      directoryData = directoryResponse?.data || []
    }

    const allUserIds = new Set()

    // Users from roles table
    rolesData?.forEach(role => allUserIds.add(role.user_id))

    // Users who created jobs (might not have explicit roles yet)
    jobsData?.forEach(job => allUserIds.add(job.user_id))

    // Users from directory (auth.users)
    directoryData?.forEach(user => allUserIds.add(user.user_id))

    // Map roles to users
    const userRolesMap = new Map()
    rolesData?.forEach(role => {
      if (!userRolesMap.has(role.user_id)) {
        userRolesMap.set(role.user_id, [])
      }
      userRolesMap.get(role.user_id).push({
        id: role.id,
        user_id: role.user_id,
        role: role.role,
        assigned_by: role.assigned_by,
        created_at: role.created_at,
        updated_at: role.updated_at
      })
    })

    // Map directory info to users (email, full name, etc.)
    const userDirectoryMap = new Map()
    directoryData?.forEach(user => {
      userDirectoryMap.set(user.user_id, {
        email: user.email,
        full_name: user.full_name,
        last_sign_in_at: user.last_sign_in,
        created_at: user.created_at
      })
    })

    // Map branches to users
    const userBranchMap = new Map()
    branchAssignments?.forEach(entry => {
      if (!entry?.user_id) return
      if (!userBranchMap.has(entry.user_id)) {
        userBranchMap.set(entry.user_id, [])
      }

      const branchDetails = entry.branches || {}
      const orgDetails = branchDetails.organizations || {}

      userBranchMap.get(entry.user_id).push({
        id: entry.id,
        branch_id: branchDetails.id,
        branch_name: branchDetails.name,
        branch_code: branchDetails.code,
        organization_id: branchDetails.organization_id,
        organization_name: orgDetails.name,
        organization_code: orgDetails.code,
        is_primary: entry.is_primary,
        created_at: entry.created_at
      })
    })

    // Preserve directory ordering first, then any remaining IDs
    const orderedIds = []
    directoryData?.forEach(user => {
      if (allUserIds.has(user.user_id)) {
        orderedIds.push(user.user_id)
      }
    })
    const remainingIds = [...allUserIds].filter(id => !orderedIds.includes(id))
    const combinedIds = [...orderedIds, ...remainingIds]

    const result = combinedIds.map(userId => {
      const roleEntries = userRolesMap.get(userId) || []
      const roles = roleEntries.map(r => r.role).filter(Boolean)
      const info = userDirectoryMap.get(userId) || {}
      const branches = userBranchMap.get(userId) || []

      const assignedAt = roleEntries.reduce((earliest, entry) => {
        if (!entry?.created_at) return earliest
        if (!earliest) return entry.created_at
        return entry.created_at < earliest ? entry.created_at : earliest
      }, null)

      const primaryRole = roles.includes('admin')
        ? 'admin'
        : roles[0] || 'user'

      const primaryBranch = branches.find(branch => branch.is_primary) || null

      return {
        id: userId,
        roles,
        assignments: roleEntries,
        assigned_at: assignedAt,
        email: info.email || null,
        full_name: info.full_name || null,
        last_sign_in_at: info.last_sign_in_at || null,
        created_at: info.created_at || null,
        primary_role: primaryRole,
        has_roles: roles.length > 0,
        branches,
        primary_branch: primaryBranch
      }
    })

    return result
  },

  // Assign role to user (admin only)
  async assignRole(userId, role, assignedBy) {
    const { data, error } = await supabase
      .from('user_roles')
      .upsert({
        user_id: userId,
        role: role,
        assigned_by: assignedBy
      }, {
        onConflict: 'user_id,role'
      })
      .select()
      .single()
    
    if (error) throw error
    return data
  },

  // Remove role from user (admin only)
  async removeRole(userId, role) {
    const { error } = await supabase
      .from('user_roles')
      .delete()
      .eq('user_id', userId)
      .eq('role', role)
    
    if (error) throw error
    return true
  },

  // Get all permissions for a role
  async getRolePermissions(role) {
    const { data, error } = await supabase
      .from('role_permissions')
      .select('*')
      .eq('role', role)
      .order('permission')
    
    if (error) throw error
    return data
  },

  async grantRolePermission(role, permission, resource = null, description = null) {
    const payload = {
      role,
      permission,
      resource,
      description: description ?? null
    }

    const { error } = await supabase
      .from('role_permissions')
      .upsert(payload, { onConflict: 'role,permission,resource' })

    if (error) throw error
    return true
  },

  async revokeRolePermission(role, permission, resource = null) {
    let query = supabase
      .from('role_permissions')
      .delete()
      .eq('role', role)
      .eq('permission', permission)

    if (resource === null || resource === undefined) {
      query = query.is('resource', null)
    } else {
      query = query.eq('resource', resource)
    }

    const { error } = await query
    if (error) throw error
    return true
  },

  // Get all users (admin only) - via auth.users but we'll use a different approach
  async getAllUsers() {
    // Note: Direct access to auth.users requires service role key
    // For now, we'll get users who have roles assigned
    const { data, error } = await supabase
      .from('user_roles')
      .select('user_id, role')
    
    if (error) throw error
    
    // Get unique user IDs
    const userIds = [...new Set(data.map(r => r.user_id))]
    
    // We can't directly query auth.users, so we'll return what we have
    return userIds.map(userId => {
      const userRoles = data.filter(r => r.user_id === userId).map(r => r.role)
      return {
        id: userId,
        roles: userRoles,
        primary_role: userRoles.includes('admin') ? 'admin' : userRoles[0] || 'user'
      }
    })
  },

  // Check if user has role
  async hasRole(userId, role) {
    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .eq('role', role)
        .maybeSingle()
      
      if (error) {
        console.error('Error checking role:', error)
        return false
      }
      
      return !!data
    } catch (error) {
      console.error('Exception checking role:', error)
      return false
    }
  },

  // Check if user is creator
  async isCreator(userId) {
    return await this.hasRole(userId, 'creator')
  },

  // Check if user is verifier
  async isVerifier(userId) {
    return await this.hasRole(userId, 'verifier')
  }
}

// Organization and branch helper functions
export const organization = {
  async getOrganizations() {
    const { data, error } = await supabase
      .from('organizations')
      .select('*')
      .order('name', { ascending: true })

    if (error) throw error
    return data || []
  },

  async createOrganization(payload) {
    const { data, error } = await supabase
      .from('organizations')
      .insert(payload)
      .select()
      .single()

    if (error) throw error
    return data
  },

  async updateOrganization(id, updates) {
    const { data, error } = await supabase
      .from('organizations')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data
  },

  async getBranches(organizationId = null) {
    let query = supabase
      .from('branches')
      .select(`
        *,
        organizations:organization_id (
          id,
          name,
          code
        )
      `)
      .order('name', { ascending: true })

    if (organizationId) {
      query = query.eq('organization_id', organizationId)
    }

    const { data, error } = await query
    if (error) throw error
    return data || []
  },

  async createBranch(payload) {
    const { data, error } = await supabase
      .from('branches')
      .insert(payload)
      .select(`
        *,
        organizations:organization_id (
          id,
          name,
          code
        )
      `)
      .single()

    if (error) throw error
    return data
  },

  async updateBranch(id, updates) {
    const { data, error } = await supabase
      .from('branches')
      .update(updates)
      .eq('id', id)
      .select(`
        *,
        organizations:organization_id (
          id,
          name,
          code
        )
      `)
      .single()

    if (error) throw error
    return data
  },

  async assignUserToBranch(userId, branchId, { is_primary = false, assignedBy = null } = {}) {
    const payload = {
      user_id: userId,
      branch_id: branchId,
      is_primary,
      assigned_by: assignedBy
    }

    const { data, error } = await supabase
      .from('user_branch_map')
      .upsert(payload, { onConflict: 'user_id,branch_id' })
      .select(`
        id,
        user_id,
        branch_id,
        is_primary,
        branches:branch_id (
          id,
          name,
          code,
          organization_id,
          organizations:organization_id (
            id,
            name,
            code
          )
        )
      `)
      .single()

    if (error) throw error
    return data
  },

  async removeUserBranch(mapId) {
    const { error } = await supabase
      .from('user_branch_map')
      .delete()
      .eq('id', mapId)

    if (error) throw error
    return true
  },

  async setPrimaryBranch(userId, branchId) {
    // Reset current primary flags
    const { error: resetError } = await supabase
      .from('user_branch_map')
      .update({ is_primary: false })
      .eq('user_id', userId)

    if (resetError) throw resetError

    const { data, error } = await supabase
      .from('user_branch_map')
      .update({ is_primary: true })
      .eq('user_id', userId)
      .eq('branch_id', branchId)
      .select()
      .single()

    if (error) throw error
    return data
  },

  async getUserBranches(userId) {
    const { data, error } = await supabase
      .from('user_branch_map')
      .select(`
        id,
        user_id,
        is_primary,
        branch_id,
        branches:branch_id (
          id,
          name,
          code,
          organization_id,
          organizations:organization_id (
            id,
            name,
            code
          )
        )
      `)
      .eq('user_id', userId)

    if (error) throw error
    return data || []
  }
}

// Inventory management helper functions
export const inventory = {
  // Get all inventory items
  async getAllItems({ branchId } = {}) {
    let query = supabase
      .from('inventory_items')
      .select('*')
      .order('item_name', { ascending: true })

    if (branchId) {
      query = query.order('item_name', { ascending: true })
    }

    const { data, error } = await query
    if (error) throw error
    return data
  },

  // Get item by ID
  async getItemById(itemId) {
    const { data, error } = await supabase
      .from('inventory_items')
      .select('*')
      .eq('id', itemId)
      .single()
    if (error) throw error
    return data
  },

  // Generate serial number for inventory item
  async generateSerialNumber() {
    const { data, error } = await supabase.rpc('generate_inventory_serial_number')
    if (error) throw error
    return data
  },

  // Upload image to Supabase Storage
  async uploadImage(file, itemId) {
    const user = await auth.getCurrentUser()
    if (!user) throw new Error('User not authenticated')
    
    const fileExt = file.name.split('.').pop()
    const fileName = `${itemId || Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`
    const filePath = `inventory/${fileName}`
    
    const { error: uploadError } = await supabase.storage
      .from('inventory-images')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false
      })
    
    if (uploadError) throw uploadError
    
    // Get public URL
    const { data } = supabase.storage
      .from('inventory-images')
      .getPublicUrl(filePath)
    
    return data.publicUrl
  },

  // Delete image from Supabase Storage
  async deleteImage(imageUrl) {
    if (!imageUrl) return
    
    // Extract file path from URL
    const urlParts = imageUrl.split('/')
    const filePath = urlParts.slice(urlParts.indexOf('inventory')).join('/')
    
    const { error } = await supabase.storage
      .from('inventory-images')
      .remove([filePath])
    
    if (error) console.error('Error deleting image:', error)
  },

  // Create new inventory item
  async createItem(itemData) {
    const user = await auth.getCurrentUser()
    if (!user) throw new Error('User not authenticated')
    
    // Generate serial number if not provided
    if (!itemData.serial_number) {
      itemData.serial_number = await this.generateSerialNumber()
    }
    
    const { data, error } = await supabase
      .from('inventory_items')
      .insert([{
        ...itemData,
        created_by: user.id
      }])
      .select()
      .single()
    if (error) throw error
    return data
  },

  // Update inventory item
  async updateItem(itemId, updates) {
    const { data, error } = await supabase
      .from('inventory_items')
      .update(updates)
      .eq('id', itemId)
      .select()
      .single()
    if (error) throw error
    return data
  },

  // Delete inventory item
  async deleteItem(itemId) {
    const { error } = await supabase
      .from('inventory_items')
      .delete()
      .eq('id', itemId)
    if (error) throw error
  },

  // Get low stock items
  async getLowStockItems() {
    const { data, error } = await supabase.rpc('get_low_stock_items')
    if (error) throw error
    return data
  },

  async getBranchStock(branchId) {
    if (!branchId) return []
    const { data, error } = await supabase.rpc('get_branch_stock', {
      p_branch: branchId
    })
    if (error) throw error
    return data || []
  },

  // Create inventory transaction
  async createTransaction(transactionData) {
    const user = await auth.getCurrentUser()
    if (!user) throw new Error('User not authenticated')

    const { data, error } = await supabase
      .from('inventory_transactions')
      .insert([{
        ...transactionData,
        created_by: user.id
      }])
      .select()
      .single()
    if (error) throw error
    return data
  },

  // Get transactions for an item
  async getItemTransactions(itemId) {
    const { data, error } = await supabase
      .from('inventory_transactions')
      .select('*')
      .eq('item_id', itemId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return data
  },

  // Get all transactions
  async getAllTransactions(filters = {}) {
    let query = supabase
      .from('inventory_transactions')
      .select(`
        *,
        inventory_items (
          item_code,
          item_name,
          category
        ),
        inventory_locations!inventory_transactions_location_id_fkey (
          name,
          branch_id
        ),
        target_location:inventory_locations!inventory_transactions_target_location_id_fkey (
          name,
          branch_id
        )
      `)
      .order('created_at', { ascending: false })

    if (filters.item_id) {
      query = query.eq('item_id', filters.item_id)
    }
    if (filters.transaction_type) {
      query = query.eq('transaction_type', filters.transaction_type)
    }
    if (filters.branch_id) {
      query = query.eq('branch_id', filters.branch_id)
    }
    if (filters.location_id) {
      query = query.eq('location_id', filters.location_id)
    }
    if (filters.start_date) {
      query = query.gte('created_at', filters.start_date)
    }
    if (filters.end_date) {
      query = query.lte('created_at', filters.end_date)
    }

    const { data, error } = await query
    if (error) throw error
    return data
  },

  // Suppliers
  async getSuppliers() {
    const { data, error } = await supabase
      .from('inventory_suppliers')
      .select('*')
      .order('name', { ascending: true })
    if (error) throw error
    return data || []
  },

  async createSupplier(payload) {
    const user = await auth.getCurrentUser()
    if (!user) throw new Error('User not authenticated')

    const { data, error } = await supabase
      .from('inventory_suppliers')
      .insert([{ ...payload, created_by: user.id }])
      .select()
      .single()
    if (error) throw error
    return data
  },

  async updateSupplier(id, updates) {
    const { data, error } = await supabase
      .from('inventory_suppliers')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },

  // Locations
  async getLocations(branchId = null) {
    let query = supabase
      .from('inventory_locations')
      .select('*')
      .order('is_default', { ascending: false })
      .order('name', { ascending: true })

    if (branchId) {
      query = query.eq('branch_id', branchId)
    }

    const { data, error } = await query
    if (error) throw error
    return data || []
  },

  async createLocation(payload) {
    const user = await auth.getCurrentUser()
    if (!user) throw new Error('User not authenticated')

    const { data, error } = await supabase
      .from('inventory_locations')
      .insert([{ ...payload, created_by: user.id }])
      .select()
      .single()
    if (error) throw error
    return data
  },

  async setDefaultLocation(locationId, branchId) {
    if (!locationId || !branchId) return
    const { error: resetError } = await supabase
      .from('inventory_locations')
      .update({ is_default: false })
      .eq('branch_id', branchId)
    if (resetError) throw resetError

    const { data, error } = await supabase
      .from('inventory_locations')
      .update({ is_default: true })
      .eq('id', locationId)
      .select()
      .single()
    if (error) throw error
    return data
  },

  // Purchase orders
  async createPurchaseOrder(order, items) {
    const { data, error } = await supabase.rpc('create_purchase_order', {
      po_data: order,
      po_items: items
    })
    if (error) throw error
    return data
  },

  async getPurchaseOrders(filters = {}) {
    let query = supabase
      .from('purchase_orders')
      .select(`
        *,
        inventory_suppliers (
          id,
          name,
          code,
          phone,
          email
        ),
        inventory_locations!purchase_orders_location_id_fkey (
          id,
          name,
          branch_id
        )
      `)
      .order('created_at', { ascending: false })

    if (filters.branch_id) {
      query = query.eq('branch_id', filters.branch_id)
    }
    if (filters.status) {
      query = query.eq('status', filters.status)
    }

    const { data, error } = await query
    if (error) throw error
    return data || []
  },

  async getPurchaseOrderById(id) {
    const { data, error } = await supabase
      .from('purchase_orders')
      .select(`
        *,
        inventory_suppliers (
          id,
          name,
          code,
          phone,
          email
        ),
        inventory_locations!purchase_orders_location_id_fkey (
          id,
          name,
          branch_id
        ),
        purchase_order_items (
          id,
          item_id,
          quantity,
          unit_price,
          received_quantity,
          inventory_items (
            item_code,
            item_name,
            unit
          )
        )
      `)
      .eq('id', id)
      .single()
    if (error) throw error
    return data
  },

  // Goods receipts
  async recordGoodsReceipt(payload, items) {
    const { data, error } = await supabase.rpc('record_goods_receipt', {
      gr_data: payload,
      gr_items: items
    })
    if (error) throw error
    return data
  },

  async getGoodsReceipts(filters = {}) {
    let query = supabase
      .from('goods_receipts')
      .select(`
        *,
        purchase_orders:purchase_order_id (
          id,
          order_number,
          status
        ),
        inventory_locations!goods_receipts_location_id_fkey (
          id,
          name,
          branch_id
        )
      `)
      .order('created_at', { ascending: false })

    if (filters.branch_id) {
      query = query.eq('branch_id', filters.branch_id)
    }
    if (filters.purchase_order_id) {
      query = query.eq('purchase_order_id', filters.purchase_order_id)
    }

    const { data, error } = await query
    if (error) throw error
    return data || []
  },

  // Search items
  async searchItems(searchTerm) {
    const { data, error } = await supabase
      .from('inventory_items')
      .select('*')
      .or(`item_code.ilike.%${searchTerm}%,item_name.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%`)
      .order('item_name', { ascending: true })
    if (error) throw error
    return data
  },

  // ============================================
  // Sales & P&L Functions
  // ============================================

  // Create sales transaction
  async createSalesTransaction(salesData) {
    const user = await auth.getCurrentUser()
    if (!user) throw new Error('User not authenticated')

    // Get item cost method and calculate COGS
    const { data: item } = await supabase
      .from('inventory_items')
      .select('cost_method, average_cost, current_stock')
      .eq('id', salesData.item_id)
      .single()

    if (!item) throw new Error('Item not found')
    if (item.current_stock < salesData.quantity) {
      throw new Error('Insufficient stock')
    }

    // Calculate COGS based on cost method
    let unitCost = 0
    if (item.cost_method === 'fifo') {
      const { data: cogs } = await supabase.rpc('get_fifo_cogs', {
        p_item_id: salesData.item_id,
        p_quantity: salesData.quantity
      })
      unitCost = cogs / salesData.quantity
    } else if (item.cost_method === 'lifo') {
      const { data: cogs } = await supabase.rpc('get_lifo_cogs', {
        p_item_id: salesData.item_id,
        p_quantity: salesData.quantity
      })
      unitCost = cogs / salesData.quantity
    } else {
      // Weighted average
      unitCost = item.average_cost || 0
    }

    // Allocate cost layers
    await supabase.rpc('allocate_cost_layers_on_sale', {
      p_item_id: salesData.item_id,
      p_quantity: salesData.quantity,
      p_cost_method: item.cost_method
    })

    // Create sales transaction
    const { data, error } = await supabase
      .from('sales_transactions')
      .insert([{
        ...salesData,
        unit_cost: unitCost,
        created_by: user.id
      }])
      .select()
      .single()

    if (error) throw error

    // Create inventory transaction for stock reduction
    await this.createTransaction({
      item_id: salesData.item_id,
      transaction_type: 'out',
      quantity: salesData.quantity,
      reference_number: salesData.invoice_number || salesData.reference_number,
      reference_type: 'sale',
      notes: `Sale: ${salesData.customer_name || 'N/A'}`
    })

    return data
  },

  // Get all sales transactions
  async getAllSalesTransactions(filters = {}) {
    let query = supabase
      .from('sales_transactions')
      .select(`
        *,
        inventory_items (
          id,
          item_code,
          item_name,
          category
        )
      `)
      .order('transaction_date', { ascending: false })
      .order('created_at', { ascending: false })

    if (filters.startDate) {
      query = query.gte('transaction_date', filters.startDate)
    }
    if (filters.endDate) {
      query = query.lte('transaction_date', filters.endDate)
    }
    if (filters.itemId) {
      query = query.eq('item_id', filters.itemId)
    }

    const { data, error } = await query
    if (error) throw error
    return data || []
  },

  // Get periodic P&L report
  async getPeriodicPLReport(startDate, endDate) {
    const { data, error } = await supabase.rpc('get_periodic_pl_report', {
      p_start_date: startDate,
      p_end_date: endDate
    })
    if (error) throw error
    return data?.[0] || null
  },

  // Get P&L by item
  async getPLByItem(startDate, endDate) {
    const { data, error } = await supabase.rpc('get_pl_by_item', {
      p_start_date: startDate,
      p_end_date: endDate
    })
    if (error) throw error
    return data || []
  },

  // Update item cost method
  async updateItemCostMethod(itemId, costMethod) {
    const { data, error } = await supabase
      .from('inventory_items')
      .update({ cost_method: costMethod })
      .eq('id', itemId)
      .select()
      .single()
    if (error) throw error
    return data
  }
}

// ============================================
// ACCOUNTING SYSTEM API FUNCTIONS
// ============================================

export const accounting = {
  // ============================================
  // CONTACTS (Customers & Vendors)
  // ============================================

  async getAllContacts(filters = {}) {
    let query = supabase
      .from('contacts')
      .select('*')
      .order('created_at', { ascending: false })

    if (filters.contact_type) {
      query = query.eq('contact_type', filters.contact_type)
    }
    if (filters.status) {
      query = query.eq('status', filters.status)
    }

    const { data, error } = await query
    if (error) throw error
    return data || []
  },

  async getContactById(contactId) {
    const { data, error } = await supabase
      .from('contacts')
      .select('*')
      .eq('id', contactId)
      .single()
    if (error) throw error
    return data
  },

  async createContact(contactData) {
    const user = await auth.getCurrentUser()
    if (!user) throw new Error('User not authenticated')

    const { data, error } = await supabase
      .from('contacts')
      .insert([{
        ...contactData,
        created_by: user.id
      }])
      .select()
      .single()
    if (error) throw error
    return data
  },

  async updateContact(contactId, updates) {
    const { data, error } = await supabase
      .from('contacts')
      .update(updates)
      .eq('id', contactId)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async deleteContact(contactId) {
    const { error } = await supabase
      .from('contacts')
      .delete()
      .eq('id', contactId)
    if (error) throw error
  },

  // ============================================
  // ESTIMATES
  // ============================================

  async generateEstimateNumber() {
    const { data, error } = await supabase.rpc('generate_estimate_number')
    if (error) throw error
    return data
  },

  async createEstimate(estimateData) {
    const user = await auth.getCurrentUser()
    if (!user) throw new Error('User not authenticated')

    // Generate estimate number if not provided
    if (!estimateData.estimate_number) {
      estimateData.estimate_number = await this.generateEstimateNumber()
    }

    const { data, error } = await supabase
      .from('estimates')
      .insert([{
        ...estimateData,
        created_by: user.id
      }])
      .select()
      .single()
    if (error) throw error
    return data
  },

  async addEstimateItem(estimateId, itemData) {
    const { data, error } = await supabase
      .from('estimate_items')
      .insert([{
        ...itemData,
        estimate_id: estimateId
      }])
      .select()
      .single()
    if (error) throw error
    return data
  },

  async getAllEstimates(filters = {}) {
    let query = supabase
      .from('estimates')
      .select(`
        *,
        contacts (
          id,
          company_name,
          contact_name,
          email,
          phone
        )
      `)
      .order('estimate_date', { ascending: false })
      .order('created_at', { ascending: false })

    if (filters.customer_id) {
      query = query.eq('customer_id', filters.customer_id)
    }
    if (filters.status) {
      query = query.eq('status', filters.status)
    }

    const { data, error } = await query
    if (error) throw error
    return data || []
  },

  async getEstimateWithItems(estimateId) {
    const { data: estimate, error: estimateError } = await supabase
      .from('estimates')
      .select(`
        *,
        contacts (*),
        estimate_items (
          *,
          inventory_items (
            item_code,
            item_name,
            unit
          )
        )
      `)
      .eq('id', estimateId)
      .single()

    if (estimateError) throw estimateError
    return estimate
  },

  // ============================================
  // INVOICES
  // ============================================

  async generateInvoiceNumber() {
    const { data, error } = await supabase.rpc('generate_invoice_number')
    if (error) throw error
    return data
  },

  async createInvoice(invoiceData) {
    const user = await auth.getCurrentUser()
    if (!user) throw new Error('User not authenticated')

    // Generate invoice number if not provided
    if (!invoiceData.invoice_number) {
      invoiceData.invoice_number = await this.generateInvoiceNumber()
    }

    const { data, error } = await supabase
      .from('invoices')
      .insert([{
        ...invoiceData,
        created_by: user.id
      }])
      .select()
      .single()
    if (error) throw error
    return data
  },

  async addInvoiceItem(invoiceId, itemData) {
    const { data, error } = await supabase
      .from('invoice_items')
      .insert([{
        ...itemData,
        invoice_id: invoiceId
      }])
      .select()
      .single()
    if (error) throw error
    return data
  },

  async getInvoiceWithItems(invoiceId) {
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .select(`
        *,
        contacts (*),
        invoice_items (
          *,
          inventory_items (
            item_code,
            item_name,
            unit
          )
        ),
        invoice_payments (*)
      `)
      .eq('id', invoiceId)
      .single()

    if (invoiceError) throw invoiceError
    return invoice
  },

  async getAllInvoices(filters = {}) {
    let query = supabase
      .from('invoices')
      .select(`
        *,
        contacts (
          id,
          company_name,
          contact_name,
          email,
          phone
        )
      `)
      .order('invoice_date', { ascending: false })
      .order('created_at', { ascending: false })

    if (filters.customer_id) {
      query = query.eq('customer_id', filters.customer_id)
    }
    if (filters.status) {
      query = query.eq('status', filters.status)
    }
    if (filters.start_date) {
      query = query.gte('invoice_date', filters.start_date)
    }
    if (filters.end_date) {
      query = query.lte('invoice_date', filters.end_date)
    }

    const { data, error } = await query
    if (error) throw error
    return data || []
  },

  async updateInvoice(invoiceId, updates) {
    const { data, error } = await supabase
      .from('invoices')
      .update(updates)
      .eq('id', invoiceId)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async recordInvoicePayment(paymentData) {
    const user = await auth.getCurrentUser()
    if (!user) throw new Error('User not authenticated')

    const { data, error } = await supabase
      .from('invoice_payments')
      .insert([{
        ...paymentData,
        created_by: user.id
      }])
      .select()
      .single()
    if (error) throw error
    return data
  },

  async getAccountsReceivable() {
    const { data, error } = await supabase.rpc('get_accounts_receivable_summary')
    if (error) throw error
    return data || []
  },

  // ============================================
  // PURCHASE ORDERS & BILLS
  // ============================================

  async generatePONumber() {
    const { data, error } = await supabase.rpc('generate_po_number')
    if (error) throw error
    return data
  },

  async generateBillNumber() {
    const { data, error } = await supabase.rpc('generate_bill_number')
    if (error) throw error
    return data
  },

  async createPurchaseOrder(poData) {
    const user = await auth.getCurrentUser()
    if (!user) throw new Error('User not authenticated')

    if (!poData.po_number) {
      poData.po_number = await this.generatePONumber()
    }

    const { data, error } = await supabase
      .from('purchase_orders')
      .insert([{
        ...poData,
        created_by: user.id
      }])
      .select()
      .single()
    if (error) throw error
    return data
  },

  async addPurchaseOrderItem(poId, itemData) {
    const { data, error } = await supabase
      .from('purchase_order_items')
      .insert([{
        ...itemData,
        po_id: poId
      }])
      .select()
      .single()
    if (error) throw error
    return data
  },

  async getAllPurchaseOrders(filters = {}) {
    let query = supabase
      .from('purchase_orders')
      .select(`
        *,
        contacts (
          id,
          company_name,
          contact_name,
          email,
          phone
        )
      `)
      .order('po_date', { ascending: false })

    if (filters.vendor_id) {
      query = query.eq('vendor_id', filters.vendor_id)
    }
    if (filters.status) {
      query = query.eq('status', filters.status)
    }

    const { data, error } = await query
    if (error) throw error
    return data || []
  },

  async createBill(billData) {
    const user = await auth.getCurrentUser()
    if (!user) throw new Error('User not authenticated')

    if (!billData.bill_number) {
      billData.bill_number = await this.generateBillNumber()
    }

    const { data, error } = await supabase
      .from('bills')
      .insert([{
        ...billData,
        created_by: user.id
      }])
      .select()
      .single()
    if (error) throw error
    return data
  },

  async addBillItem(billId, itemData) {
    const { data, error } = await supabase
      .from('bill_items')
      .insert([{
        ...itemData,
        bill_id: billId
      }])
      .select()
      .single()
    if (error) throw error
    return data
  },

  async getAllBills(filters = {}) {
    let query = supabase
      .from('bills')
      .select(`
        *,
        contacts (
          id,
          company_name,
          contact_name,
          email,
          phone
        )
      `)
      .order('bill_date', { ascending: false })

    if (filters.vendor_id) {
      query = query.eq('vendor_id', filters.vendor_id)
    }
    if (filters.status) {
      query = query.eq('status', filters.status)
    }

    const { data, error } = await query
    if (error) throw error
    return data || []
  },

  async recordBillPayment(paymentData) {
    const user = await auth.getCurrentUser()
    if (!user) throw new Error('User not authenticated')

    const { data, error } = await supabase
      .from('bill_payments')
      .insert([{
        ...paymentData,
        created_by: user.id
      }])
      .select()
      .single()
    if (error) throw error
    return data
  },

  async getAccountsPayable() {
    const { data, error } = await supabase.rpc('get_accounts_payable_summary')
    if (error) throw error
    return data || []
  },

  // ============================================
  // BANKING
  // ============================================

  async getAllBankAccounts() {
    const { data, error } = await supabase
      .from('bank_accounts')
      .select('*')
      .order('account_name', { ascending: true })
    if (error) throw error
    return data || []
  },

  async createBankAccount(accountData) {
    const user = await auth.getCurrentUser()
    if (!user) throw new Error('User not authenticated')

    const { data, error } = await supabase
      .from('bank_accounts')
      .insert([{
        ...accountData,
        created_by: user.id
      }])
      .select()
      .single()
    if (error) throw error
    return data
  },

  async getBankTransactions(filters = {}) {
    let query = supabase
      .from('bank_transactions')
      .select(`
        *,
        bank_accounts (
          account_name,
          bank_name
        )
      `)
      .order('transaction_date', { ascending: false })

    if (filters.bank_account_id) {
      query = query.eq('bank_account_id', filters.bank_account_id)
    }
    if (filters.start_date) {
      query = query.gte('transaction_date', filters.start_date)
    }
    if (filters.end_date) {
      query = query.lte('transaction_date', filters.end_date)
    }

    const { data, error } = await query
    if (error) throw error
    return data || []
  },

  async createBankTransaction(transactionData) {
    const user = await auth.getCurrentUser()
    if (!user) throw new Error('User not authenticated')

    const { data, error } = await supabase
      .from('bank_transactions')
      .insert([{
        ...transactionData,
        created_by: user.id
      }])
      .select()
      .single()
    if (error) throw error
    return data
  },

  // ============================================
  // TAX MANAGEMENT
  // ============================================

  async getAllTaxRates() {
    const { data, error } = await supabase
      .from('tax_rates')
      .select('*')
      .eq('is_active', true)
      .order('tax_name', { ascending: true })
    if (error) throw error
    return data || []
  },

  async createTaxRate(taxData) {
    const { data, error } = await supabase
      .from('tax_rates')
      .insert([taxData])
      .select()
      .single()
    if (error) throw error
    return data
  },

  async getAllTaxCategories() {
    const { data, error } = await supabase
      .from('tax_categories')
      .select(`
        *,
        tax_rates (*)
      `)
      .order('category_name', { ascending: true })
    if (error) throw error
    return data || []
  }
}
