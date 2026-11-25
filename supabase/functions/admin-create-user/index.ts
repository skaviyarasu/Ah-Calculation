// Supabase Edge Function: admin-create-user
//
// Creates a user account for the portal. Public self-registration is switched off, so this is
// the only way to add users from the app (Admin Studio → Register User).
//
// - The caller must be signed in AND have the 'admin' role (checked against user_roles).
// - The service-role key never leaves the server: Supabase provides SUPABASE_URL,
//   SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY to every Edge Function automatically.
// - Optional secret ALLOWED_EMAIL_DOMAINS (e.g. "duriyam.com,duriyammotors.com") limits new
//   accounts to company email domains.
// - The 'admin' role cannot be granted here; assign it in Admin Studio (it asks for confirmation).
//
// Deploy: see README.md in this folder.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const MIN_PASSWORD = 8;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'Use POST.' });

  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // 1. Who is calling? (the caller's own session token)
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return json(401, { error: 'Sign in first.' });
  const asCaller = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: callerData, error: callerError } = await asCaller.auth.getUser();
  if (callerError || !callerData.user) return json(401, { error: 'Your session has expired. Sign in again.' });
  const callerId = callerData.user.id;

  // 2. Only administrators may create accounts.
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: adminRow, error: roleError } = await admin
    .from('user_roles')
    .select('role')
    .eq('user_id', callerId)
    .eq('role', 'admin')
    .maybeSingle();
  if (roleError) return json(500, { error: `Could not check your role: ${roleError.message}` });
  if (!adminRow) return json(403, { error: 'Only administrators can create user accounts.' });

  // 3. Validate the request.
  let body: { email?: unknown; password?: unknown; fullName?: unknown; roles?: unknown };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'Invalid request body.' });
  }
  const email = String(body.email ?? '').trim().toLowerCase();
  const password = String(body.password ?? '');
  const fullName = String(body.fullName ?? '').trim();
  const roles = Array.isArray(body.roles) ? [...new Set(body.roles.map((r) => String(r).trim()).filter(Boolean))] : [];

  if (!EMAIL_RE.test(email)) return json(400, { error: 'Enter a valid email address.' });
  if (password.length < MIN_PASSWORD) return json(400, { error: `The password must be at least ${MIN_PASSWORD} characters.` });
  if (!fullName) return json(400, { error: 'Full name is required.' });

  const allowedDomains = (Deno.env.get('ALLOWED_EMAIL_DOMAINS') ?? '')
    .split(',')
    .map((d) => d.trim().toLowerCase().replace(/^@/, ''))
    .filter(Boolean);
  if (allowedDomains.length && !allowedDomains.includes(email.split('@')[1])) {
    return json(400, { error: `Only company email addresses are allowed (${allowedDomains.map((d) => '@' + d).join(', ')}).` });
  }

  if (roles.includes('admin')) return json(400, { error: 'Assign the admin role in Admin Studio, not when creating the account.' });
  if (roles.length) {
    const { data: known, error: catalogError } = await admin.from('role_catalog').select('role').in('role', roles);
    if (catalogError) return json(500, { error: `Could not check the roles: ${catalogError.message}` });
    const unknown = roles.filter((r) => !(known ?? []).some((k) => k.role === r));
    if (unknown.length) return json(400, { error: `Unknown role(s): ${unknown.join(', ')}` });
  }

  // 4. Create the account (already confirmed: the admin vouches for the address).
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (createError || !created.user) {
    const msg = createError?.message ?? 'unknown error';
    return json(/already|exists|registered/i.test(msg) ? 409 : 400, { error: `Could not create the account: ${msg}` });
  }

  // 5. Assign the chosen roles.
  const failedRoles: string[] = [];
  for (const role of roles.filter((r) => r !== 'user')) {
    const { error } = await admin.from('user_roles').insert({ user_id: created.user.id, role, assigned_by: callerId });
    if (error) failedRoles.push(role);
  }

  return json(200, { id: created.user.id, email, roles, failedRoles });
});
