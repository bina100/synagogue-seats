ALTER TABLE absences ADD COLUMN seat_id uuid REFERENCES seats(id);
ALTER TABLE absences DROP CONSTRAINT absences_profile_id_synagogue_id_shabbat_date_key;
ALTER TABLE absences ADD CONSTRAINT absences_profile_seat_date_key UNIQUE (profile_id, synagogue_id, shabbat_date, seat_id);