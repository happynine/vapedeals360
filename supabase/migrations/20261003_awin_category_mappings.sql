-- Persist Awin category -> internal category mappings.
-- Two scopes:
--   advertiser_id = NULL  -> global default (applies to every advertiser)
--   advertiser_id = 'xxx' -> per-advertiser override (wins over global)
-- Additive only; safe to re-run.

CREATE TABLE IF NOT EXISTS public.awin_category_mappings (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  advertiser_id   text REFERENCES public.awin_advertiser_mappings (advertiser_id) ON DELETE CASCADE,
  feed_category   text NOT NULL,
  category_slug   text NOT NULL REFERENCES public.categories (slug),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- At most one mapping per (advertiser scope, feed category). NULLs are treated
-- as distinct by a plain UNIQUE, so use a unique index with COALESCE.
CREATE UNIQUE INDEX IF NOT EXISTS uq_awin_cat_scope
  ON public.awin_category_mappings (COALESCE(advertiser_id, '__global__'), feed_category);

CREATE INDEX IF NOT EXISTS idx_awin_cat_advertiser
  ON public.awin_category_mappings (advertiser_id);
