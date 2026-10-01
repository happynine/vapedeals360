-- Awin feed import: advertiser mappings, product external identities,
-- price/history tracking and import batches.
-- Additive only — does not alter existing stores / products / product_prices.
-- Safe to re-run (IF NOT EXISTS).

-- 1) Advertiser -> internal store / region / currency mapping (server-side).
CREATE TABLE IF NOT EXISTS public.awin_advertiser_mappings (
  advertiser_id   text PRIMARY KEY,
  advertiser_name text NOT NULL DEFAULT '',
  store_id        bigint NOT NULL REFERENCES public.stores (id),
  region          text NOT NULL,
  currency        text NOT NULL,
  is_active       boolean NOT NULL DEFAULT true,
  feed_url        text,
  notes           text NOT NULL DEFAULT '',
  first_seen_at   timestamptz,
  last_synced_at  timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_awin_adv_map_store
  ON public.awin_advertiser_mappings (store_id);

-- 2) One product may carry many external identities (same product across N
-- advertisers). Product-level fields remain single-sourced in products.
CREATE TABLE IF NOT EXISTS public.product_external_ids (
  id                   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id           bigint NOT NULL REFERENCES public.products (id) ON DELETE CASCADE,
  network              text NOT NULL DEFAULT 'awin',
  advertiser_id        text NOT NULL REFERENCES public.awin_advertiser_mappings (advertiser_id),
  aw_product_id        text NOT NULL DEFAULT '',
  merchant_product_id  text NOT NULL DEFAULT '',
  is_primary           boolean NOT NULL DEFAULT false,
  first_seen_at        timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_product_ext_awid
    UNIQUE (network, advertiser_id, aw_product_id)
);
CREATE INDEX IF NOT EXISTS idx_product_ext_product
  ON public.product_external_ids (product_id);
CREATE INDEX IF NOT EXISTS idx_product_ext_merchant_sku
  ON public.product_external_ids (merchant_product_id);
-- At most one primary identity per product.
CREATE UNIQUE INDEX IF NOT EXISTS uq_product_ext_one_primary
  ON public.product_external_ids (product_id)
  WHERE is_primary = true;

-- 4) Import/sync batch audit (created before history so FK can reference it).
CREATE TABLE IF NOT EXISTS public.awin_import_batches (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  mode               text NOT NULL,               -- 'mapping' | 'sync'
  source             text NOT NULL DEFAULT 'upload', -- 'upload' | 'auto_fetch'
  file_name          text NOT NULL DEFAULT '',
  advertisers_count  int NOT NULL DEFAULT 0,
  products_total     int NOT NULL DEFAULT 0,
  counts             jsonb NOT NULL DEFAULT '{}'::jsonb,
  status             text NOT NULL DEFAULT 'reported', -- 'reported' | 'applied'
  errors             jsonb NOT NULL DEFAULT '[]'::jsonb,
  started_at         timestamptz NOT NULL DEFAULT now(),
  finished_at        timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now()
);

-- 3) Append-only price / stock history.
CREATE TABLE IF NOT EXISTS public.product_price_history (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id      bigint NOT NULL REFERENCES public.products (id) ON DELETE CASCADE,
  store_id        bigint NOT NULL REFERENCES public.stores (id),
  region          text NOT NULL,
  currency        text NOT NULL,
  price           numeric(12,2),
  in_stock        boolean,
  event_type      text NOT NULL,
  price_prev      numeric(12,2),
  change_percent  numeric(6,2),
  batch_id        bigint REFERENCES public.awin_import_batches (id),
  captured_at     timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_price_history_lookup
  ON public.product_price_history (product_id, store_id, region, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_price_history_event
  ON public.product_price_history (event_type);
CREATE INDEX IF NOT EXISTS idx_price_history_batch
  ON public.product_price_history (batch_id);

-- Seed the known default mapping once the store exists; store 1 is already
-- present in production. Region/currency intentionally explicit.
INSERT INTO public.awin_advertiser_mappings
  (advertiser_id, advertiser_name, store_id, region, currency, is_active, first_seen_at)
VALUES
  ('50315', 'Shenzhen Vapesourcing Electronics Co.,Ltd.', 1, 'USA', 'USD', true, now())
ON CONFLICT (advertiser_id) DO NOTHING;
