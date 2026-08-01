-- Seeds are applied by `supabase db reset` (see [db.seed] in supabase/config.toml).
-- Idempotent: every statement uses ON CONFLICT DO NOTHING, so re-running after a
-- partial reset is safe. The CLI executes this file verbatim (no env interpolation),
-- so the admin password below is a committed, documented DEV-ONLY default. It is
-- never a production secret; override it in production via Supabase Auth (see
-- apps/server/.env.example).

-- ---------------------------------------------------------------------------
-- 1. Single admin identity in local Auth (auth.users + auth.identities)
-- ---------------------------------------------------------------------------
-- Fixed UUIDs keep the seed deterministic so `admin_users` can reference the user
-- regardless of insertion order. bcrypt via pgcrypto matches GoTrue's hashing.

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
)
values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-000000000001',
  'authenticated',
  'authenticated',
  'admin@komyuter.ph',
  crypt('komyuter-admin-dev', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(),
  now(),
  '',
  '',
  '',
  ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id,
  user_id,
  provider_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
)
values (
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  format(
    '{"sub":"%s","email":"%s","email_verified":true,"phone_verified":false}',
    '00000000-0000-0000-0000-000000000001',
    'admin@komyuter.ph'
  )::jsonb,
  'email',
  now(),
  now(),
  now()
)
on conflict (provider_id, provider) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Gate the admin via admin_users
-- ---------------------------------------------------------------------------
insert into admin_users (user_id)
values ('00000000-0000-0000-0000-000000000001')
on conflict (user_id) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Default fare configuration (FR-015/FR-016)
-- ---------------------------------------------------------------------------
-- Exactly one row must be is_default; the seeded config satisfies that from day
-- one. Routes without an explicit fare_config_id fall back to this row.
insert into fare_configs (
  fare_config_id,
  label,
  base_fare,
  base_distance_km,
  rate_per_km,
  student_discount_pct,
  senior_discount_pct,
  is_default,
  is_active
)
values (
  'default',
  'LTFRB Default Fare',
  13.00,
  4.00,
  1.80,
  20.00,
  20.00,
  true,
  true
)
on conflict (fare_config_id) do nothing;
