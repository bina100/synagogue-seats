-- Fix sections SELECT to allow super_admin
DROP POLICY IF EXISTS "sections_select" ON public.sections;
CREATE POLICY "sections_select" ON public.sections FOR SELECT
  USING (is_member_of(auth.uid(), synagogue_id) OR has_role(auth.uid(), 'super_admin'));

-- Fix seat_rows SELECT to allow super_admin
DROP POLICY IF EXISTS "seat_rows_select" ON public.seat_rows;
CREATE POLICY "seat_rows_select" ON public.seat_rows FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM sections s
    WHERE s.id = seat_rows.section_id
    AND (is_member_of(auth.uid(), s.synagogue_id) OR has_role(auth.uid(), 'super_admin'))
  ));

-- Fix seats SELECT to allow super_admin
DROP POLICY IF EXISTS "seats_select" ON public.seats;
CREATE POLICY "seats_select" ON public.seats FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM seat_rows r
    JOIN sections s ON s.id = r.section_id
    WHERE r.id = seats.row_id
    AND (is_member_of(auth.uid(), s.synagogue_id) OR has_role(auth.uid(), 'super_admin'))
  ));
