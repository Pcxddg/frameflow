-- Allow authenticated users to insert their own profile row.
-- The trigger handle_new_profile (security definer) normally handles this,
-- but if it fails or the user was created before the trigger existed,
-- the frontend ensureProfile() needs to be able to upsert.
drop policy if exists "profiles_insert_self" on public.profiles;
create policy "profiles_insert_self" on public.profiles
for insert with check (id = auth.uid());
