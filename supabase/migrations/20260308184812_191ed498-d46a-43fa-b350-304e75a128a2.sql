
CREATE OR REPLACE FUNCTION public.create_seating_map(
  _synagogue_id uuid,
  _sections jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _old_section RECORD;
  _old_row RECORD;
  _sec jsonb;
  _row jsonb;
  _seat jsonb;
  _si int;
  _new_section_id uuid;
  _new_row_id uuid;
  _stats jsonb;
  _total_sections int := 0;
  _total_rows int := 0;
  _total_seats int := 0;
BEGIN
  -- Delete old map (cascade: seats → seat_rows → sections)
  FOR _old_section IN SELECT id FROM sections WHERE synagogue_id = _synagogue_id LOOP
    FOR _old_row IN SELECT id FROM seat_rows WHERE section_id = _old_section.id LOOP
      DELETE FROM absences WHERE seat_id IN (SELECT id FROM seats WHERE row_id = _old_row.id);
      DELETE FROM seats WHERE row_id = _old_row.id;
    END LOOP;
    DELETE FROM seat_rows WHERE section_id = _old_section.id;
  END LOOP;
  DELETE FROM sections WHERE synagogue_id = _synagogue_id;

  -- Create new map
  _si := 0;
  FOR _sec IN SELECT * FROM jsonb_array_elements(_sections) LOOP
    INSERT INTO sections (synagogue_id, name, sort_order)
    VALUES (_synagogue_id, _sec->>'name', _si)
    RETURNING id INTO _new_section_id;
    _total_sections := _total_sections + 1;

    FOR _row IN SELECT * FROM jsonb_array_elements(_sec->'rows') LOOP
      INSERT INTO seat_rows (section_id, row_number, seats_count)
      VALUES (_new_section_id, (_row->>'row_number')::int, (_row->>'seats_count')::int)
      RETURNING id INTO _new_row_id;
      _total_rows := _total_rows + 1;

      FOR _seat IN SELECT * FROM jsonb_array_elements(_row->'seats') LOOP
        INSERT INTO seats (row_id, seat_number, element_type)
        VALUES (
          _new_row_id,
          (_seat->>'seat_number')::int,
          NULLIF(_seat->>'element_type', '')
        );
        _total_seats := _total_seats + 1;
      END LOOP;
    END LOOP;

    _si := _si + 1;
  END LOOP;

  _stats := jsonb_build_object(
    'sections', _total_sections,
    'rows', _total_rows,
    'seats', _total_seats
  );

  RETURN _stats;
END;
$$;
