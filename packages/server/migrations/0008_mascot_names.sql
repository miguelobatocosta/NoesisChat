-- Phase 18: new default names that fit the new personalities. Only renames mascots still carrying
-- the old default, so a name the host already chose is never overwritten.
UPDATE users SET display_name = 'Avó Dores', name_key = 'avo dores'
  WHERE id = '0000000000000000000000MA04' AND display_name = 'Sr. Ferreira'
    AND NOT EXISTS (SELECT 1 FROM users WHERE name_key = 'avo dores');
UPDATE users SET display_name = 'Tio Pixel', name_key = 'tio pixel'
  WHERE id = '0000000000000000000000MA05' AND display_name = 'Pixel'
    AND NOT EXISTS (SELECT 1 FROM users WHERE name_key = 'tio pixel');
