import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  varchar,
  timestamp,
  boolean,
  integer,
  numeric,
  index,
  serial,
} from "drizzle-orm/pg-core";

// System table - DO NOT DELETE
export const healthCheck = pgTable("health_check", {
  id: serial().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow(),
});

// Categories
export const categories = pgTable(
  "categories",
  {
    id: serial().primaryKey(),
    slug: varchar("slug", { length: 100 }).notNull().unique(),
    icon: varchar("icon", { length: 255 }),
    sort_order: integer("sort_order").default(0).notNull(),
    is_active: boolean("is_active").default(true).notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [index("categories_slug_idx").on(table.slug)]
);

// Category translations (multi-language)
export const categoryTranslations = pgTable(
  "category_translations",
  {
    id: serial().primaryKey(),
    category_id: integer("category_id").notNull().references(() => categories.id, { onDelete: "cascade" }),
    language: varchar("language", { length: 10 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
  },
  (table) => [
    index("ct_category_id_idx").on(table.category_id),
    index("ct_language_idx").on(table.language),
    index("ct_category_lang_idx").on(table.category_id, table.language),
  ]
);

// Stores / Merchants
export const stores = pgTable(
  "stores",
  {
    id: serial().primaryKey(),
    slug: varchar("slug", { length: 100 }).notNull().unique(),
    logo_url: text("logo_url"),
    website_url: text("website_url"),
    is_active: boolean("is_active").default(true).notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [index("stores_slug_idx").on(table.slug)]
);

// Store translations
export const storeTranslations = pgTable(
  "store_translations",
  {
    id: serial().primaryKey(),
    store_id: integer("store_id").notNull().references(() => stores.id, { onDelete: "cascade" }),
    language: varchar("language", { length: 10 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
  },
  (table) => [
    index("st_store_id_idx").on(table.store_id),
    index("st_language_idx").on(table.language),
    index("st_store_lang_idx").on(table.store_id, table.language),
  ]
);

// Products
export const products = pgTable(
  "products",
  {
    id: serial().primaryKey(),
    slug: varchar("slug", { length: 200 }).notNull().unique(),
    category_id: integer("category_id").references(() => categories.id, { onDelete: "set null" }),
    image_url: text("image_url"),
    images: text("images"), // JSON array of image URLs
    is_active: boolean("is_active").default(true).notNull(),
    is_featured: boolean("is_featured").default(false).notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    index("products_slug_idx").on(table.slug),
    index("products_category_id_idx").on(table.category_id),
    index("products_is_active_idx").on(table.is_active),
    index("products_is_featured_idx").on(table.is_featured),
  ]
);

// Product translations
export const productTranslations = pgTable(
  "product_translations",
  {
    id: serial().primaryKey(),
    product_id: integer("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
    language: varchar("language", { length: 10 }).notNull(),
    name: varchar("name", { length: 500 }).notNull(),
    description: text("description"),
    features: text("features"), // JSON array of feature strings
    specs: text("specs"), // JSON object of spec key-value pairs
  },
  (table) => [
    index("pt_product_id_idx").on(table.product_id),
    index("pt_language_idx").on(table.language),
    index("pt_product_lang_idx").on(table.product_id, table.language),
  ]
);

// Banners
export const banners = pgTable(
  "banners",
  {
    id: serial().primaryKey(),
    image_key: text("image_key"), // S3 object key for the banner image
    link_url: text("link_url"), // optional click-through URL
    sort_order: integer("sort_order").default(0).notNull(),
    is_active: boolean("is_active").default(true).notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    index("banners_is_active_idx").on(table.is_active),
    index("banners_sort_order_idx").on(table.sort_order),
  ]
);

// Banner translations (multi-language)
export const bannerTranslations = pgTable(
  "banner_translations",
  {
    id: serial().primaryKey(),
    banner_id: integer("banner_id").notNull().references(() => banners.id, { onDelete: "cascade" }),
    language: varchar("language", { length: 10 }).notNull(),
    image_key: text("image_key"), // language-specific banner image key
    title: varchar("title", { length: 255 }),
    subtitle: varchar("subtitle", { length: 500 }),
  },
  (table) => [
    index("bt_banner_id_idx").on(table.banner_id),
    index("bt_language_idx").on(table.language),
    index("bt_banner_lang_idx").on(table.banner_id, table.language),
  ]
);

// Product prices per store
export const productPrices = pgTable(
  "product_prices",
  {
    id: serial().primaryKey(),
    product_id: integer("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
    store_id: integer("store_id").notNull().references(() => stores.id, { onDelete: "cascade" }),
    current_price: numeric("current_price", { precision: 10, scale: 2 }).notNull(),
    original_price: numeric("original_price", { precision: 10, scale: 2 }),
    product_url: text("product_url").notNull(),
    in_stock: boolean("in_stock").default(true).notNull(),
    discount_percent: integer("discount_percent"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    index("pp_product_id_idx").on(table.product_id),
    index("pp_store_id_idx").on(table.store_id),
    index("pp_product_store_idx").on(table.product_id, table.store_id),
    index("pp_current_price_idx").on(table.current_price),
  ]
);

// Site Settings (logo, site name, etc.)
export const siteSettings = pgTable(
  "site_settings",
  {
    id: serial().primaryKey(),
    logo_url: text("logo_url"),
    updated_at: timestamp("updated_at", { withTimezone: true }),
  }
);

// Site Setting translations (multi-language site name)
export const siteSettingTranslations = pgTable(
  "site_setting_translations",
  {
    id: serial().primaryKey(),
    site_setting_id: integer("site_setting_id").notNull().references(() => siteSettings.id, { onDelete: "cascade" }),
    language: varchar("language", { length: 10 }).notNull(),
    site_name: varchar("site_name", { length: 255 }).notNull(),
  },
  (table) => [
    index("sst_site_setting_id_idx").on(table.site_setting_id),
    index("sst_language_idx").on(table.language),
    index("sst_site_setting_lang_idx").on(table.site_setting_id, table.language),
  ]
);

// Social Links
export const socialLinks = pgTable(
  "social_links",
  {
    id: serial().primaryKey(),
    platform: varchar("platform", { length: 100 }).notNull(),
    url: text("url").notNull(),
    icon: varchar("icon", { length: 50 }),
    sort_order: integer("sort_order").default(0).notNull(),
    is_active: boolean("is_active").default(true).notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    index("sl_platform_idx").on(table.platform),
  ]
);

// Page Views (analytics)
export const pageViews = pgTable(
  "page_views",
  {
    id: serial().primaryKey(),
    session_id: varchar("session_id", { length: 100 }).notNull(),
    page: varchar("page", { length: 255 }).notNull(),
    referrer: text("referrer"),
    ip: varchar("ip", { length: 45 }),
    user_agent: text("user_agent"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("pv_session_id_idx").on(table.session_id),
    index("pv_page_idx").on(table.page),
    index("pv_created_at_idx").on(table.created_at),
    index("pv_ip_idx").on(table.ip),
  ]
);

// Click Events (analytics)
export const clickEvents = pgTable(
  "click_events",
  {
    id: serial().primaryKey(),
    session_id: varchar("session_id", { length: 100 }).notNull(),
    event_type: varchar("event_type", { length: 50 }).notNull(),
    target_id: varchar("target_id", { length: 255 }),
    metadata: text("metadata"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("ce_session_id_idx").on(table.session_id),
    index("ce_event_type_idx").on(table.event_type),
    index("ce_created_at_idx").on(table.created_at),
  ]
);
