-- Awin commission flag per price row.
-- Existing manually-entered prices default to false (无偿 / no commission);
-- rows created from an Awin import are inserted with true.
ALTER TABLE public.product_prices
  ADD COLUMN IF NOT EXISTS has_commission boolean NOT NULL DEFAULT false;

-- Same flag on promotion product store prices.
ALTER TABLE public.promotion_product_prices
  ADD COLUMN IF NOT EXISTS has_commission boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.product_prices.has_commission IS
  'true = affiliate link earns commission (imported from Awin); false = manually added, no commission';
COMMENT ON COLUMN public.promotion_product_prices.has_commission IS
  'true = affiliate link earns commission (imported from Awin); false = manually added, no commission';
