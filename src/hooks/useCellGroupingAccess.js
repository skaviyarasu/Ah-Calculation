import { useEffect, useState } from 'react';
import { cellGrouping } from '../lib/supabase';

/**
 * Cell grouping access for the signed-in user:
 *   canManageRules    - upload/publish LFP/NMC YAML rules (admin)
 *   canProcessReports - process grading reports (operator, admin)
 * Admins always get both, even before migration 19 has been run.
 */
export function useCellGroupingAccess(isAdmin, roleLoading) {
  const [access, setAccess] = useState({ canManageRules: false, canProcessReports: false });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (roleLoading) return;
    let cancelled = false;
    (async () => {
      try {
        const fromDb = await cellGrouping.getAccess();
        if (!cancelled) {
          setAccess({
            canManageRules: isAdmin || fromDb.canManageRules,
            canProcessReports: isAdmin || fromDb.canProcessReports
          });
        }
      } catch (error) {
        console.error('Error checking cell grouping access:', error);
        if (!cancelled) setAccess({ canManageRules: isAdmin, canProcessReports: isAdmin });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, roleLoading]);

  return { ...access, loading };
}
