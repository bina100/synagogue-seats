
-- Role enum
CREATE TYPE public.app_role AS ENUM ('super_admin', 'gabbai', 'member');

-- Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Synagogues table
CREATE TABLE public.synagogues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.synagogues ENABLE ROW LEVEL SECURITY;

-- User roles table (global roles like super_admin, plus synagogue-scoped roles)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  synagogue_id UUID REFERENCES public.synagogues(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role, synagogue_id)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Synagogue members table
CREATE TABLE public.synagogue_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  synagogue_id UUID NOT NULL REFERENCES public.synagogues(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(profile_id, synagogue_id)
);

ALTER TABLE public.synagogue_members ENABLE ROW LEVEL SECURITY;

-- Sections table (per synagogue)
CREATE TABLE public.sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  synagogue_id UUID NOT NULL REFERENCES public.synagogues(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.sections ENABLE ROW LEVEL SECURITY;

-- Seat rows table
CREATE TABLE public.seat_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id UUID NOT NULL REFERENCES public.sections(id) ON DELETE CASCADE,
  row_number INT NOT NULL,
  seats_count INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.seat_rows ENABLE ROW LEVEL SECURITY;

-- Seats table
CREATE TABLE public.seats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  row_id UUID NOT NULL REFERENCES public.seat_rows(id) ON DELETE CASCADE,
  seat_number INT NOT NULL,
  assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.seats ENABLE ROW LEVEL SECURITY;

-- Absences table
CREATE TABLE public.absences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  synagogue_id UUID NOT NULL REFERENCES public.synagogues(id) ON DELETE CASCADE,
  shabbat_date DATE NOT NULL,
  marked_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(profile_id, synagogue_id, shabbat_date)
);

ALTER TABLE public.absences ENABLE ROW LEVEL SECURITY;

-- ============ HELPER FUNCTIONS ============

-- Check if user has a specific global role
CREATE OR REPLACE FUNCTION public.has_role(_auth_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN profiles p ON p.id = ur.user_id
    WHERE p.auth_id = _auth_id AND ur.role = _role AND ur.synagogue_id IS NULL
  )
$$;

-- Check if user is gabbai of a specific synagogue
CREATE OR REPLACE FUNCTION public.is_gabbai_of(_auth_id UUID, _synagogue_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN profiles p ON p.id = ur.user_id
    WHERE p.auth_id = _auth_id AND ur.role = 'gabbai' AND ur.synagogue_id = _synagogue_id
  )
$$;

-- Check if user can manage a synagogue (super_admin or gabbai)
CREATE OR REPLACE FUNCTION public.can_manage_synagogue(_auth_id UUID, _synagogue_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_auth_id, 'super_admin') OR public.is_gabbai_of(_auth_id, _synagogue_id)
$$;

-- Check if user is member of a synagogue
CREATE OR REPLACE FUNCTION public.is_member_of(_auth_id UUID, _synagogue_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM synagogue_members sm
    JOIN profiles p ON p.id = sm.profile_id
    WHERE p.auth_id = _auth_id AND sm.synagogue_id = _synagogue_id
  )
$$;

-- Get profile ID from auth ID
CREATE OR REPLACE FUNCTION public.get_profile_id(_auth_id UUID)
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM profiles WHERE auth_id = _auth_id LIMIT 1
$$;

-- ============ RLS POLICIES ============

-- Profiles: anyone authenticated can read, users can update own
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth_id = auth.uid());
CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE TO authenticated USING (auth_id = auth.uid());

-- Synagogues: members can read, super_admin can create, managers can update/delete
CREATE POLICY "synagogues_select" ON public.synagogues FOR SELECT TO authenticated
  USING (public.is_member_of(auth.uid(), id) OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "synagogues_insert" ON public.synagogues FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "synagogues_update" ON public.synagogues FOR UPDATE TO authenticated
  USING (public.can_manage_synagogue(auth.uid(), id));
CREATE POLICY "synagogues_delete" ON public.synagogues FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

-- User roles: managers can manage, users can read own
CREATE POLICY "user_roles_select" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = public.get_profile_id(auth.uid()) OR (synagogue_id IS NOT NULL AND public.can_manage_synagogue(auth.uid(), synagogue_id)) OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "user_roles_insert" ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'super_admin') OR (synagogue_id IS NOT NULL AND public.is_gabbai_of(auth.uid(), synagogue_id)));
CREATE POLICY "user_roles_update" ON public.user_roles FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin') OR (synagogue_id IS NOT NULL AND public.is_gabbai_of(auth.uid(), synagogue_id)));
CREATE POLICY "user_roles_delete" ON public.user_roles FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin') OR (synagogue_id IS NOT NULL AND public.is_gabbai_of(auth.uid(), synagogue_id)));

-- Synagogue members: members can read own synagogue members, managers can manage
CREATE POLICY "synagogue_members_select" ON public.synagogue_members FOR SELECT TO authenticated
  USING (public.is_member_of(auth.uid(), synagogue_id) OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "synagogue_members_insert" ON public.synagogue_members FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_synagogue(auth.uid(), synagogue_id));
CREATE POLICY "synagogue_members_update" ON public.synagogue_members FOR UPDATE TO authenticated
  USING (public.can_manage_synagogue(auth.uid(), synagogue_id));
CREATE POLICY "synagogue_members_delete" ON public.synagogue_members FOR DELETE TO authenticated
  USING (public.can_manage_synagogue(auth.uid(), synagogue_id) OR profile_id = public.get_profile_id(auth.uid()));

-- Sections: members can read, managers can manage
CREATE POLICY "sections_select" ON public.sections FOR SELECT TO authenticated
  USING (public.is_member_of(auth.uid(), synagogue_id));
CREATE POLICY "sections_insert" ON public.sections FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_synagogue(auth.uid(), synagogue_id));
CREATE POLICY "sections_update" ON public.sections FOR UPDATE TO authenticated
  USING (public.can_manage_synagogue(auth.uid(), synagogue_id));
CREATE POLICY "sections_delete" ON public.sections FOR DELETE TO authenticated
  USING (public.can_manage_synagogue(auth.uid(), synagogue_id));

-- Seat rows: inherit from section
CREATE POLICY "seat_rows_select" ON public.seat_rows FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM sections s WHERE s.id = section_id AND public.is_member_of(auth.uid(), s.synagogue_id)));
CREATE POLICY "seat_rows_insert" ON public.seat_rows FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM sections s WHERE s.id = section_id AND public.can_manage_synagogue(auth.uid(), s.synagogue_id)));
CREATE POLICY "seat_rows_update" ON public.seat_rows FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM sections s WHERE s.id = section_id AND public.can_manage_synagogue(auth.uid(), s.synagogue_id)));
CREATE POLICY "seat_rows_delete" ON public.seat_rows FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM sections s WHERE s.id = section_id AND public.can_manage_synagogue(auth.uid(), s.synagogue_id)));

-- Seats: inherit from row->section
CREATE POLICY "seats_select" ON public.seats FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM seat_rows r JOIN sections s ON s.id = r.section_id WHERE r.id = row_id AND public.is_member_of(auth.uid(), s.synagogue_id)));
CREATE POLICY "seats_insert" ON public.seats FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM seat_rows r JOIN sections s ON s.id = r.section_id WHERE r.id = row_id AND public.can_manage_synagogue(auth.uid(), s.synagogue_id)));
CREATE POLICY "seats_update" ON public.seats FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM seat_rows r JOIN sections s ON s.id = r.section_id WHERE r.id = row_id AND public.can_manage_synagogue(auth.uid(), s.synagogue_id)));
CREATE POLICY "seats_delete" ON public.seats FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM seat_rows r JOIN sections s ON s.id = r.section_id WHERE r.id = row_id AND public.can_manage_synagogue(auth.uid(), s.synagogue_id)));

-- Absences: members can manage own, managers can manage all in synagogue
CREATE POLICY "absences_select" ON public.absences FOR SELECT TO authenticated
  USING (profile_id = public.get_profile_id(auth.uid()) OR public.can_manage_synagogue(auth.uid(), synagogue_id));
CREATE POLICY "absences_insert" ON public.absences FOR INSERT TO authenticated
  WITH CHECK (profile_id = public.get_profile_id(auth.uid()) OR public.can_manage_synagogue(auth.uid(), synagogue_id));
CREATE POLICY "absences_delete" ON public.absences FOR DELETE TO authenticated
  USING (profile_id = public.get_profile_id(auth.uid()) OR public.can_manage_synagogue(auth.uid(), synagogue_id));

-- Trigger to auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (auth_id, username, full_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'username', COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'username'));
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
