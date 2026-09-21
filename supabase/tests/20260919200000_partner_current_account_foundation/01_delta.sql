-- Isolated extras for 20260919200000. Disposable DB only. No Tamir. No Production UUIDs.

INSERT INTO lifecycle.entity_identity (id, canonical_name, entity_type, status)
VALUES
  ('81818181-8181-4818-8818-818181818181', 'Partner North', 'partner', 'active'),
  ('82828282-8282-4828-8828-828282828282', 'Partner South', 'partner', 'active'),
  ('83838383-8383-4838-8838-838383838383', 'Partner Inactive', 'partner', 'inactive')
ON CONFLICT (id) DO NOTHING;
