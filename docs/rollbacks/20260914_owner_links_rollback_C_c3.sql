-- Rollback C — C3 Hostaway listing-months (29 rows).
-- DRY-RUN ONLY. Do not execute against Production.
-- Soft-delete by idempotency manifest only. No DROP. No physical DELETE.

BEGIN;

WITH manifest(idempotency_key) AS (
  VALUES
    ('tamir_hostaway_412145_2024-10'),
    ('tamir_hostaway_412145_2024-11'),
    ('tamir_hostaway_412145_2024-12'),
    ('tamir_hostaway_412145_2025-01'),
    ('tamir_hostaway_412145_2025-02'),
    ('tamir_hostaway_412145_2025-03'),
    ('tamir_hostaway_412145_2025-04'),
    ('tamir_hostaway_412145_2025-05'),
    ('tamir_hostaway_412145_2025-06'),
    ('tamir_hostaway_412145_2026-05'),
    ('tamir_hostaway_412145_2026-06'),
    ('tamir_hostaway_412145_2026-07'),
    ('tamir_hostaway_412145_2026-08'),
    ('tamir_hostaway_412147_2024-07'),
    ('tamir_hostaway_412147_2024-08'),
    ('tamir_hostaway_412147_2024-09'),
    ('tamir_hostaway_412147_2024-10'),
    ('tamir_hostaway_412147_2024-11'),
    ('tamir_hostaway_412147_2024-12'),
    ('tamir_hostaway_412147_2025-01'),
    ('tamir_hostaway_412147_2025-02'),
    ('tamir_hostaway_412147_2025-03'),
    ('tamir_hostaway_412147_2025-04'),
    ('tamir_hostaway_412147_2025-05'),
    ('tamir_hostaway_412147_2025-06'),
    ('tamir_hostaway_412147_2026-05'),
    ('tamir_hostaway_412147_2026-06'),
    ('tamir_hostaway_412147_2026-07'),
    ('tamir_hostaway_412147_2026-08')
)
SELECT t.id, t.date, t.amount_eur, t.client_charge, t.k_note, t.is_deleted
FROM public.transactions t
JOIN manifest m
  ON t.k_note = m.idempotency_key OR t.notes = m.idempotency_key;

WITH manifest(idempotency_key) AS (
  VALUES
    ('tamir_hostaway_412145_2024-10'),
    ('tamir_hostaway_412145_2024-11'),
    ('tamir_hostaway_412145_2024-12'),
    ('tamir_hostaway_412145_2025-01'),
    ('tamir_hostaway_412145_2025-02'),
    ('tamir_hostaway_412145_2025-03'),
    ('tamir_hostaway_412145_2025-04'),
    ('tamir_hostaway_412145_2025-05'),
    ('tamir_hostaway_412145_2025-06'),
    ('tamir_hostaway_412145_2026-05'),
    ('tamir_hostaway_412145_2026-06'),
    ('tamir_hostaway_412145_2026-07'),
    ('tamir_hostaway_412145_2026-08'),
    ('tamir_hostaway_412147_2024-07'),
    ('tamir_hostaway_412147_2024-08'),
    ('tamir_hostaway_412147_2024-09'),
    ('tamir_hostaway_412147_2024-10'),
    ('tamir_hostaway_412147_2024-11'),
    ('tamir_hostaway_412147_2024-12'),
    ('tamir_hostaway_412147_2025-01'),
    ('tamir_hostaway_412147_2025-02'),
    ('tamir_hostaway_412147_2025-03'),
    ('tamir_hostaway_412147_2025-04'),
    ('tamir_hostaway_412147_2025-05'),
    ('tamir_hostaway_412147_2025-06'),
    ('tamir_hostaway_412147_2026-05'),
    ('tamir_hostaway_412147_2026-06'),
    ('tamir_hostaway_412147_2026-07'),
    ('tamir_hostaway_412147_2026-08')
)
UPDATE public.transactions t
   SET is_deleted = true
 WHERE COALESCE(t.is_deleted, false) = false
   AND (t.k_note IN (SELECT idempotency_key FROM manifest)
        OR t.notes IN (SELECT idempotency_key FROM manifest));

SELECT 'C dry-run: 29 Hostaway rows would be soft-deleted by idempotency manifest only' AS status;

ROLLBACK;
