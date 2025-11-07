import { useCallback, useEffect, useMemo, useState } from 'react'
import { auth, organization } from '../lib/supabase'

const STORAGE_PREFIX = 'duriyam.current_branch'

export function useBranch() {
  const [branches, setBranches] = useState([])
  const [currentBranch, setCurrentBranch] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [userId, setUserId] = useState(null)

  const persistSelection = useCallback((uid, branchId) => {
    if (!uid) return
    try {
      if (branchId) {
        window.localStorage.setItem(`${STORAGE_PREFIX}:${uid}`, branchId)
      } else {
        window.localStorage.removeItem(`${STORAGE_PREFIX}:${uid}`)
      }
    } catch (storageError) {
      console.warn('Could not persist branch selection:', storageError)
    }
  }, [])

  const loadBranches = useCallback(async () => {
    setLoading(true)
    try {
      const user = await auth.getCurrentUser()
      if (!user) {
        setUserId(null)
        setBranches([])
        setCurrentBranch(null)
        setError(null)
        return
      }

      setUserId(user.id)
      let branchData = await organization.getUserBranches(user.id)

      if (!branchData || branchData.length === 0) {
        try {
          const allBranches = await organization.getBranches()
          const defaultBranch = allBranches.find(branch => branch.is_default) || allBranches.find(branch => branch.code === 'MAIN') || allBranches[0] || null
          if (defaultBranch) {
            await organization.assignUserToBranch(user.id, defaultBranch.id, {
              is_primary: true,
              assignedBy: user.id
            })
            branchData = await organization.getUserBranches(user.id)
          }
        } catch (assignmentError) {
          console.warn('Could not auto-assign branch:', assignmentError)
        }
      }

      setBranches(branchData)

      const storedBranchId = (() => {
        try {
          return window.localStorage.getItem(`${STORAGE_PREFIX}:${user.id}`)
        } catch (storageError) {
          console.warn('Could not access stored branch selection:', storageError)
          return null
        }
      })()

      let branchToUse = null
      if (storedBranchId) {
        branchToUse = branchData.find((entry) => entry.branch_id === storedBranchId) || null
      }
      if (!branchToUse) {
        branchToUse = branchData.find((entry) => entry.is_primary) || branchData[0] || null
      }

      setCurrentBranch(branchToUse || null)
      if (branchToUse) {
        persistSelection(user.id, branchToUse.branch_id)
      }
      setError(null)
    } catch (err) {
      console.error('Error loading branches for user:', err)
      setError(err)
      setBranches([])
      setCurrentBranch(null)
    } finally {
      setLoading(false)
    }
  }, [persistSelection])

  useEffect(() => {
    loadBranches()
  }, [loadBranches])

  const selectBranch = useCallback((branchId) => {
    if (!branchId) return
    const branch = branches.find((entry) => entry.branch_id === branchId)
    if (!branch) return
    setCurrentBranch(branch)
    persistSelection(userId, branchId)
  }, [branches, persistSelection, userId])

  const summary = useMemo(() => {
    if (!currentBranch) return null
    return {
      id: currentBranch.branch_id,
      name: currentBranch.branch_name,
      code: currentBranch.branch_code,
      organizationName: currentBranch.organization_name,
      organizationCode: currentBranch.organization_code,
      isPrimary: currentBranch.is_primary
    }
  }, [currentBranch])

  return {
    branches,
    currentBranch: summary,
    rawCurrentBranch: currentBranch,
    loading,
    error,
    refresh: loadBranches,
    selectBranch
  }
}
