-- Data Correction: AVI â Yossi Villa Mazotos reclassification
-- Migration: 20260709_002_reclassify_avi_villa_mazotos
-- Applied: 2026-07-09
-- Approved by: Yossi (OQ-02)
--
-- ROW BEFORE:
--   id          : 372cf021-f659-480a-8647-98a84e718d67
--   date        : 2024-06-16
--   property    : Villa Mazotos
--   category    : JJ
--   subcategory : JJ Income
--   description : ××× × ×ª× ××××¡× ×¨××× ×××××× ××××××¡
--   payer       : AVI
--   payee       : Yossi
--   amount_eur  : 50,000.00
--   notes       : ???
--
-- PROBLEM:
--   AVI's â¬50,000 contribution to the Villa Mazotos partnership was recorded
--   as JJ Income. This is incorrect â it is AVI's partnership capital contribution
--   toward the Villa Mazotos property acquisition (AVI 50%, Yossi 25%, Jacob 25%).
--   Recording it as JJ Income inflates JJ's operating income by â¬50,000 and
--   misses AVI's capital contribution in the Purchase ledger.
--
-- CORRECTION:
--   category    : Purchase  (AVI contributing to property acquisition)
--   subcategory : Purchase Payment  (capital deployed toward purchase price)
--   notes       : updated with audit trail
--
-- PRESERVED (payer identity must never be normalized per Partner Capital Rule):
--   payer  = AVI   (AVI paid Yossi personally)
--   payee  = Yossi (received by Yossi on behalf of partnership)
--   amount = â¬50,000 (confirmed correct â original notes "???" reflected uncertainty
--                     about the amount; Yossi confirmed â¬50,000 not â¬30,000)

UPDATE transactions
SET
  category    = 'Purchase',
  subcategory = 'Purchase Payment',
  notes       = 'Reclassified 2026-07-09 (OQ-02, approved Yossi): AVI partnership capital contribution toward Villa Mazotos acquisition. Payer=AVI, Payee=Yossi (paid Yossi personally). Original notes: ???',
  updated_at  = NOW()
WHERE id = '372cf021-f659-480a-8647-98a84e718d67';

-- Verification: confirm the row is now in Purchase
-- SELECT id, category, subcategory, payer, payee, amount_eur, notes
-- FROM transactions
-- WHERE id = '372cf021-f659-480a-8647-98a84e718d67';
