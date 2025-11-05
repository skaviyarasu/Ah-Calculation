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
  // Battery Optimization Jobs table operations
  async createJob(jobData) {
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
