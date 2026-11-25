# admin-create-user (Supabase Edge Function)

Creates portal user accounts. Public self-registration is switched off, so Admin Studio → **Register User** calls this function instead of the public sign-up.

- Only signed-in **administrators** can call it (checked against `user_roles`).
- The service-role key stays on the server (Supabase provides it to the function automatically).
- New accounts are created already confirmed, with the chosen roles. The `admin` role cannot be granted here.
- Optional: limit new accounts to company email domains with the secret `ALLOWED_EMAIL_DOMAINS`.

## Deploy (once)

**Option A: Supabase dashboard (no tools needed)**
1. Supabase Dashboard → your project → **Edge Functions** → **Deploy a new function** → **Via Editor**.
2. Name it exactly `admin-create-user`.
3. Replace the sample code with the contents of `index.ts` from this folder, then **Deploy**.
4. Leave **Verify JWT** switched on (the default).

**Option B: Supabase CLI**
```bash
npx supabase login
npx supabase functions deploy admin-create-user --project-ref <your-project-ref>
```

## Optional: company email domains only
Dashboard → Edge Functions → **Secrets** (or `npx supabase secrets set ...`):
```
ALLOWED_EMAIL_DOMAINS=yourcompany.com
```
Several domains: separate them with commas.

## Then switch off public sign-up
Supabase Dashboard → **Authentication** → **Sign In / Providers** → turn off **Allow new users to sign up**.
Accounts created by this function (and by **Authentication → Add user** in the dashboard) still work.
