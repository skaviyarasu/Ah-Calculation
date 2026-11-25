-- ============================================
-- Migration: Cell Grouping - office network only
-- ============================================
-- Version: 20
-- Purpose:
--   Group cells (reading the published grouping rules) works only from the office
--   network, identified by its public static IP. Administrators are exempt so they
--   can always manage the list (e.g. when the ISP changes the office IP).
--
--   * cell_grouping_office_ips: allowed office IPs / ranges (admins manage them).
--     While the list is EMPTY the restriction is OFF (nothing is blocked); adding
--     the first IP switches it on.
--   * request_client_ip(): the caller's public IP as seen by the Supabase API.
--   * cell_grouping_office_status(): what the app shows ("office only", detected IP).
--   * The SELECT policy on cell_grouping_rules now also requires the office network
--     (or an admin).
--
-- Instructions: Supabase Dashboard -> SQL Editor -> New query -> paste -> Run.
-- Safe to run more than once. Requires migration 19.
-- ============================================

-- 1. Allowed office IPs --------------------------------------------------
CREATE TABLE IF NOT EXISTS cell_grouping_office_ips (
  ip_range CIDR PRIMARY KEY,           -- e.g. 203.0.113.10/32 (one address) or 203.0.113.0/29
  label TEXT,                          -- e.g. 'Namakkal plant - main line'
  created_by UUID REFERENCES auth.users(id) DEFAULT auth.uid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE cell_grouping_office_ips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Office IPs managed by admins" ON cell_grouping_office_ips;
CREATE POLICY "Office IPs managed by admins" ON cell_grouping_office_ips
  FOR ALL USING (is_current_user_admin()) WITH CHECK (is_current_user_admin());

-- 2. Caller's public IP ---------------------------------------------------
-- The Supabase API runs behind Cloudflare, which sets cf-connecting-ip to the address
-- the request really came from (a client cannot choose it). If the header is missing or
-- not an IP address, the result is NULL and the caller counts as "not in the office".
CREATE OR REPLACE FUNCTION request_client_ip()
RETURNS INET AS $$
DECLARE
  headers JSON := NULLIF(current_setting('request.headers', true), '')::json;
  raw TEXT := trim(COALESCE(headers ->> 'cf-connecting-ip', ''));
BEGIN
  IF raw = '' THEN
    RETURN NULL;
  END IF;
  RETURN raw::inet;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE SET search_path = public;

-- 3. Is this request from the office? ------------------------------------
CREATE OR REPLACE FUNCTION cell_grouping_request_from_office()
RETURNS BOOLEAN AS $$
DECLARE
  configured BOOLEAN;
  ip INET;
BEGIN
  SELECT EXISTS (SELECT 1 FROM cell_grouping_office_ips) INTO configured;
  IF NOT configured THEN
    RETURN TRUE;                       -- restriction not switched on yet
  END IF;
  ip := request_client_ip();
  IF ip IS NULL THEN
    RETURN FALSE;                      -- unknown origin: treat as outside the office
  END IF;
  RETURN EXISTS (SELECT 1 FROM cell_grouping_office_ips WHERE ip <<= ip_range);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

GRANT EXECUTE ON FUNCTION cell_grouping_request_from_office() TO authenticated;

-- 4. Status for the app ---------------------------------------------------
-- ip_headers (admins only): the IP-related request headers the database receives, to check
-- that the office IP is detected correctly before switching the restriction on.
CREATE OR REPLACE FUNCTION cell_grouping_office_status()
RETURNS JSON AS $$
  SELECT json_build_object(
    'configured', EXISTS (SELECT 1 FROM cell_grouping_office_ips),
    'from_office', cell_grouping_request_from_office(),
    'is_admin', is_current_user_admin(),
    'client_ip', host(request_client_ip()),
    'ip_headers', CASE WHEN is_current_user_admin() THEN (
      SELECT json_object_agg(key, value)
      FROM json_each_text(NULLIF(current_setting('request.headers', true), '')::json)
      WHERE key IN ('cf-connecting-ip', 'x-forwarded-for', 'x-real-ip', 'true-client-ip', 'x-client-ip')
    ) END
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

GRANT EXECUTE ON FUNCTION cell_grouping_office_status() TO authenticated;

-- 5. Rules are only readable from the office (admins exempt) -------------
DROP POLICY IF EXISTS "Rules readable by processors and managers" ON cell_grouping_rules;
CREATE POLICY "Rules readable by processors and managers" ON cell_grouping_rules
  FOR SELECT USING (
    is_current_user_admin()
    OR (
      cell_grouping_request_from_office()
      AND (
        current_user_has_any_permission('process_grading_reports', 'cell_grouping')
        OR current_user_has_any_permission('manage_grouping_rules', 'cell_grouping')
      )
    )
  );

COMMENT ON TABLE cell_grouping_office_ips IS 'Public IPs/ranges of the office network. Group cells works only from these (admins exempt). Empty = restriction off.';

SELECT 'cell grouping office network ready' AS status;
