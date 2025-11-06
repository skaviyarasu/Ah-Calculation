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
        if (isFinite(value)) {
          cellDataArray.push({
            optimization_job_id: jobId,
            series_index: seriesIndex,
            parallel_index: parallelIndex,
            capacity_mah: value
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

  // Get all roles (admin only)
  async getAllRoles() {
    const { data, error } = await supabase
      .from('role_permissions')
      .select('role, permission, resource, description')
      .order('role')
      .order('permission')
    
    if (error) throw error
    return data
  },

  // Get all users with their roles (admin only)
  // This function now includes users from both user_roles table and battery_optimization_jobs table
  // to show all authenticated users, even if they don't have roles assigned yet
  async getAllUsersWithRoles() {
    // Get users with roles
    const { data: rolesData, error: rolesError } = await supabase
      .from('user_roles')
      .select(`
        id,
        user_id,
        role,
        assigned_by,
        created_at,
        updated_at
      `)
      .order('created_at', { ascending: false })
    
    if (rolesError) throw rolesError

    // Get all unique user IDs from jobs table (users who have created jobs)
    const { data: jobsData, error: jobsError } = await supabase
      .from('battery_optimization_jobs')
      .select('user_id, created_at')
      .order('created_at', { ascending: false })
    
    if (jobsError) throw jobsError

    // Combine user IDs from both sources
    const allUserIds = new Set()
    
    // Add users from roles
    if (rolesData) {
      rolesData.forEach(role => allUserIds.add(role.user_id))
    }
    
    // Add users from jobs
    if (jobsData) {
      jobsData.forEach(job => allUserIds.add(job.user_id))
    }

    // Create a map of user_id to their roles
    const userRolesMap = new Map()
    if (rolesData) {
      rolesData.forEach(role => {
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
    }

    // Convert to array format matching the original structure
    // For users without roles, create a placeholder entry
    const result = []
    allUserIds.forEach(userId => {
      const roles = userRolesMap.get(userId) || []
      if (roles.length > 0) {
        // User has roles, add all role entries
        result.push(...roles)
      } else {
        // User has no roles, add a single entry with null role info
        // This ensures the user appears in the UI even without roles
        result.push({
          id: null, // No role entry ID since user has no roles
          user_id: userId,
          role: null, // Indicates no role assigned
          assigned_by: null,
          created_at: null,
          updated_at: null
        })
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

// Inventory management helper functions
export const inventory = {
  // Get all inventory items
  async getAllItems() {
    const { data, error } = await supabase
      .from('inventory_items')
      .select('*')
      .order('item_name', { ascending: true })
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
        )
      `)
      .order('created_at', { ascending: false })
    
    if (filters.item_id) {
      query = query.eq('item_id', filters.item_id)
    }
    if (filters.transaction_type) {
      query = query.eq('transaction_type', filters.transaction_type)
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

  // Search items
  async searchItems(searchTerm) {
    const { data, error } = await supabase
      .from('inventory_items')
      .select('*')
      .or(`item_code.ilike.%${searchTerm}%,item_name.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%`)
      .order('item_name', { ascending: true })
    if (error) throw error
    return data
  }
}
