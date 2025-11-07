-- ============================================
-- Migration: Create Organizations & Branches
-- ============================================
-- Version: 16
-- Purpose: Introduce hierarchical org/branch data
--          and user-to-branch mappings for RBAC
-- ============================================

-- Helper: ensure pgcrypto extension for UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- 1. ORGANIZATIONS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT UNIQUE,
  description TEXT,
  email TEXT,
  phone TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  state TEXT,
  postal_code TEXT,
  country TEXT DEFAULT 'IN',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  created_by UUID REFERENCES auth.users(id)
);

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view organizations" ON organizations;
DROP POLICY IF EXISTS "Admins manage organizations" ON organizations;

CREATE POLICY "Anyone can view organizations" ON organizations
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins manage organizations" ON organizations
  FOR ALL USING (is_current_user_admin());

-- ============================================
-- 2. BRANCHES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT,
  email TEXT,
  phone TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  state TEXT,
  postal_code TEXT,
  country TEXT DEFAULT 'IN',
  latitude NUMERIC,
  longitude NUMERIC,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  created_by UUID REFERENCES auth.users(id)
);

ALTER TABLE branches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view branches" ON branches;
DROP POLICY IF EXISTS "Admins manage branches" ON branches;

CREATE POLICY "Anyone can view branches" ON branches
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins manage branches" ON branches
  FOR ALL USING (is_current_user_admin());

-- Useful indexes
CREATE INDEX IF NOT EXISTS branches_org_id_idx ON branches(organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS branches_org_code_idx ON branches(organization_id, code) WHERE code IS NOT NULL;

-- ============================================
-- 3. USER BRANCH MAP
-- ============================================

CREATE TABLE IF NOT EXISTS user_branch_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  is_primary BOOLEAN DEFAULT FALSE,
  assigned_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE(user_id, branch_id)
);

ALTER TABLE user_branch_map ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own branch map" ON user_branch_map;
DROP POLICY IF EXISTS "Admins view all branch map" ON user_branch_map;
DROP POLICY IF EXISTS "Admins manage branch map" ON user_branch_map;

CREATE POLICY "Users view own branch map" ON user_branch_map
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins view all branch map" ON user_branch_map
  FOR SELECT USING (
    auth.uid() = user_id OR is_current_user_admin()
  );

CREATE POLICY "Admins manage branch map" ON user_branch_map
  FOR ALL USING (is_current_user_admin());

CREATE INDEX IF NOT EXISTS user_branch_map_user_idx ON user_branch_map(user_id);
CREATE INDEX IF NOT EXISTS user_branch_map_branch_idx ON user_branch_map(branch_id);

-- ============================================
-- 4. UPDATED_AT TRIGGER SUPPORT
-- ============================================

CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc', now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS organizations_set_updated_at ON organizations;
CREATE TRIGGER organizations_set_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS branches_set_updated_at ON branches;
CREATE TRIGGER branches_set_updated_at
  BEFORE UPDATE ON branches
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS user_branch_map_set_updated_at ON user_branch_map;
CREATE TRIGGER user_branch_map_set_updated_at
  BEFORE UPDATE ON user_branch_map
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- ============================================
-- 5. SEED DEFAULT ORGANIZATION / BRANCH PLACEHOLDERS
-- ============================================

INSERT INTO organizations (name, code)
VALUES ('Duriyam HQ', 'HQ')
ON CONFLICT (code) DO NOTHING;

INSERT INTO branches (organization_id, name, code)
SELECT id, 'Primary Branch', 'MAIN'
FROM organizations
WHERE code = 'HQ'
AND NOT EXISTS (
  SELECT 1 FROM branches b
  WHERE b.organization_id = organizations.id
    AND b.code = 'MAIN'
);

-- ============================================
-- 6. COMPLETION
-- ============================================

SELECT 'organizations_and_branches_ready' AS status;
