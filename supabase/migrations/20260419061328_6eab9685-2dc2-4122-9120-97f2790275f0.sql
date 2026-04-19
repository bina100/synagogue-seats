-- Reset password for user נתן פוטש and require change on next login
UPDATE auth.users
SET encrypted_password = crypt('123456', gen_salt('bf'))
WHERE id = '6a4a389d-9d01-4438-a954-d5a508d45c56';

UPDATE public.profiles
SET requires_password_change = true
WHERE id = '62f6527e-b64c-4280-af64-503e691e44eb';