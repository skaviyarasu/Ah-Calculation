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
    const { data, error } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .order('role')
      .limit(1)
      .single()
    
    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
      console.error('Error getting user role:', error)
      return 'user' // Default to 'user' role
    }
    
    return data?.role || 'user'
  },

  // Check if user has specific role
  async hasRole(userId, role) {
    const userRole = await this.getUserRole(userId)
    return userRole === role
  },

  // Check if user is admin
  async isAdmin(userId) {
    return await this.hasRole(userId, 'admin')
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
  async getAllUsersWithRoles() {
    const { data, error } = await supabase
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
    
    if (error) throw error
    return data
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
  }
}
