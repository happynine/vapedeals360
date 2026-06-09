import { pgTable, serial, timestamp, index, unique, varchar, integer, boolean, foreignKey, numeric, text, jsonb } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"



export const healthCheck = pgTable("health_check", {
	id: serial().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

export const categories = pgTable("categories", {
	id: serial().primaryKey().notNull(),
	slug: varchar({ length: 100 }).notNull(),
	icon: varchar({ length: 255 }),
	sortOrder: integer("sort_order").default(0).notNull(),
	isActive: boolean("is_active").default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("categories_slug_idx").using("btree", table.slug.asc().nullsLast().op("text_ops")),
	unique("categories_slug_unique").on(table.slug),
]);

export const productPrices = pgTable("product_prices", {
	id: serial().primaryKey().notNull(),
	productId: integer("product_id").notNull(),
	storeId: integer("store_id").notNull(),
	currentPrice: numeric("current_price", { precision: 10, scale:  2 }).notNull(),
	originalPrice: numeric("original_price", { precision: 10, scale:  2 }),
	productUrl: text("product_url").notNull(),
	inStock: boolean("in_stock").default(true).notNull(),
	discountPercent: integer("discount_percent"),
	currency: varchar("currency", { length: 10 }).default("$"),
	region: varchar("region", { length: 50 }).default(""),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("pp_current_price_idx").using("btree", table.currentPrice.asc().nullsLast().op("numeric_ops")),
	index("pp_product_id_idx").using("btree", table.productId.asc().nullsLast().op("int4_ops")),
	index("pp_product_store_idx").using("btree", table.productId.asc().nullsLast().op("int4_ops"), table.storeId.asc().nullsLast().op("int4_ops")),
	index("pp_store_id_idx").using("btree", table.storeId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.productId],
			foreignColumns: [products.id],
			name: "product_prices_product_id_products_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.storeId],
			foreignColumns: [stores.id],
			name: "product_prices_store_id_stores_id_fk"
		}).onDelete("cascade"),
]);

export const productTranslations = pgTable("product_translations", {
	id: serial().primaryKey().notNull(),
	productId: integer("product_id").notNull(),
	language: varchar({ length: 10 }).notNull(),
	name: varchar({ length: 500 }).notNull(),
	description: text(),
	features: text(),
	specs: text(),
}, (table) => [
	index("pt_language_idx").using("btree", table.language.asc().nullsLast().op("text_ops")),
	index("pt_product_id_idx").using("btree", table.productId.asc().nullsLast().op("int4_ops")),
	index("pt_product_lang_idx").using("btree", table.productId.asc().nullsLast().op("int4_ops"), table.language.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.productId],
			foreignColumns: [products.id],
			name: "product_translations_product_id_products_id_fk"
		}).onDelete("cascade"),
]);

export const stores = pgTable("stores", {
	id: serial().primaryKey().notNull(),
	slug: varchar({ length: 100 }).notNull(),
	logoUrl: text("logo_url"),
		websiteUrl: text("website_url"),
		websiteUrls: jsonb("website_urls").$type<Array<{url: string; label?: string}>>().default([]).notNull(),
	regions: jsonb("regions").$type<Array<{region: string; currency: string}>>().default([]).notNull(),
	notes: text("notes").default(""),
	isActive: boolean("is_active").default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("stores_slug_idx").using("btree", table.slug.asc().nullsLast().op("text_ops")),
	unique("stores_slug_unique").on(table.slug),
]);

export const storeTranslations = pgTable("store_translations", {
	id: serial().primaryKey().notNull(),
	storeId: integer("store_id").notNull(),
	language: varchar({ length: 10 }).notNull(),
	name: varchar({ length: 255 }).notNull(),
}, (table) => [
	index("st_language_idx").using("btree", table.language.asc().nullsLast().op("text_ops")),
	index("st_store_id_idx").using("btree", table.storeId.asc().nullsLast().op("int4_ops")),
	index("st_store_lang_idx").using("btree", table.storeId.asc().nullsLast().op("int4_ops"), table.language.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.storeId],
			foreignColumns: [stores.id],
			name: "store_translations_store_id_stores_id_fk"
		}).onDelete("cascade"),
]);

export const categoryTranslations = pgTable("category_translations", {
	id: serial().primaryKey().notNull(),
	categoryId: integer("category_id").notNull(),
	language: varchar({ length: 10 }).notNull(),
	name: varchar({ length: 255 }).notNull(),
}, (table) => [
	index("ct_category_id_idx").using("btree", table.categoryId.asc().nullsLast().op("int4_ops")),
	index("ct_category_lang_idx").using("btree", table.categoryId.asc().nullsLast().op("int4_ops"), table.language.asc().nullsLast().op("text_ops")),
	index("ct_language_idx").using("btree", table.language.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.categoryId],
			foreignColumns: [categories.id],
			name: "category_translations_category_id_categories_id_fk"
		}).onDelete("cascade"),
]);

export const clickEvents = pgTable("click_events", {
	id: serial().primaryKey().notNull(),
	sessionId: varchar("session_id", { length: 100 }).notNull(),
	eventType: varchar("event_type", { length: 50 }).notNull(),
	targetId: varchar("target_id", { length: 255 }),
	metadata: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("ce_created_at_idx").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	index("ce_event_type_idx").using("btree", table.eventType.asc().nullsLast().op("text_ops")),
	index("ce_session_id_idx").using("btree", table.sessionId.asc().nullsLast().op("text_ops")),
]);

export const bannerTranslations = pgTable("banner_translations", {
	id: serial().primaryKey().notNull(),
	bannerId: integer("banner_id").notNull(),
	language: varchar({ length: 10 }).notNull(),
	imageKey: text("image_key"),
	title: varchar({ length: 255 }),
	subtitle: varchar({ length: 500 }),
	mobileImageKey: text("mobile_image_key"),
}, (table) => [
	index("bt_banner_id_idx").using("btree", table.bannerId.asc().nullsLast().op("int4_ops")),
	index("bt_banner_lang_idx").using("btree", table.bannerId.asc().nullsLast().op("int4_ops"), table.language.asc().nullsLast().op("text_ops")),
	index("bt_language_idx").using("btree", table.language.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.bannerId],
			foreignColumns: [banners.id],
			name: "banner_translations_banner_id_banners_id_fk"
		}).onDelete("cascade"),
]);

export const products = pgTable("products", {
	id: serial().primaryKey().notNull(),
	slug: varchar({ length: 200 }).notNull(),
	categoryId: integer("category_id"),
	imageUrl: text("image_url"),
	images: text(),
	isActive: boolean("is_active").default(true).notNull(),
	isFeatured: boolean("is_featured").default(false).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }),
	salesRegion: text("sales_region").default('不限地区'),
}, (table) => [
	index("products_category_id_idx").using("btree", table.categoryId.asc().nullsLast().op("int4_ops")),
	index("products_is_active_idx").using("btree", table.isActive.asc().nullsLast().op("bool_ops")),
	index("products_is_featured_idx").using("btree", table.isFeatured.asc().nullsLast().op("bool_ops")),
	index("products_slug_idx").using("btree", table.slug.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.categoryId],
			foreignColumns: [categories.id],
			name: "products_category_id_categories_id_fk"
		}).onDelete("set null"),
	unique("products_slug_unique").on(table.slug),
]);

export const pageViews = pgTable("page_views", {
	id: serial().primaryKey().notNull(),
	sessionId: varchar("session_id", { length: 100 }).notNull(),
	page: varchar({ length: 255 }).notNull(),
	referrer: text(),
	ip: varchar({ length: 45 }),
	userAgent: text("user_agent"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("pv_created_at_idx").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	index("pv_ip_idx").using("btree", table.ip.asc().nullsLast().op("text_ops")),
	index("pv_page_idx").using("btree", table.page.asc().nullsLast().op("text_ops")),
	index("pv_session_id_idx").using("btree", table.sessionId.asc().nullsLast().op("text_ops")),
]);

export const siteSettingTranslations = pgTable("site_setting_translations", {
	id: serial().primaryKey().notNull(),
	siteSettingId: integer("site_setting_id").notNull(),
	language: varchar({ length: 10 }).notNull(),
	siteName: varchar("site_name", { length: 255 }).notNull(),
}, (table) => [
	index("sst_language_idx").using("btree", table.language.asc().nullsLast().op("text_ops")),
	index("sst_site_setting_id_idx").using("btree", table.siteSettingId.asc().nullsLast().op("int4_ops")),
	index("sst_site_setting_lang_idx").using("btree", table.siteSettingId.asc().nullsLast().op("int4_ops"), table.language.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.siteSettingId],
			foreignColumns: [siteSettings.id],
			name: "site_setting_translations_site_setting_id_site_settings_id_fk"
		}).onDelete("cascade"),
]);

export const siteSettings = pgTable("site_settings", {
	id: serial().primaryKey().notNull(),
	logoUrl: text("logo_url"),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }),
});

export const banners = pgTable("banners", {
	id: serial().primaryKey().notNull(),
	imageKey: text("image_key"),
	linkUrl: text("link_url"),
	sortOrder: integer("sort_order").default(0).notNull(),
	isActive: boolean("is_active").default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }),
	mobileImageKey: text("mobile_image_key"),
}, (table) => [
	index("banners_is_active_idx").using("btree", table.isActive.asc().nullsLast().op("bool_ops")),
	index("banners_sort_order_idx").using("btree", table.sortOrder.asc().nullsLast().op("int4_ops")),
]);

export const socialLinks = pgTable("social_links", {
	id: serial().primaryKey().notNull(),
	platform: varchar({ length: 100 }).notNull(),
	url: text().notNull(),
	icon: varchar({ length: 50 }),
	sortOrder: integer("sort_order").default(0).notNull(),
	isActive: boolean("is_active").default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("sl_platform_idx").using("btree", table.platform.asc().nullsLast().op("text_ops")),
]);

export const contactMessages = pgTable("contact_messages", {
	id: serial().primaryKey().notNull(),
	name: varchar({ length: 255 }).notNull(),
	email: varchar({ length: 255 }).notNull(),
	subject: varchar({ length: 500 }).notNull(),
	message: text().notNull(),
	isRead: boolean("is_read").default(false),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const contentPages = pgTable("content_pages", {
	id: serial().primaryKey().notNull(),
	type: varchar({ length: 20 }).notNull(),
	coverImage: text("cover_image"),
	slug: varchar({ length: 255 }).notNull(),
	sortOrder: integer("sort_order").default(0).notNull(),
	isPublished: boolean("is_published").default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("cp_slug_idx").using("btree", table.slug.asc().nullsLast().op("text_ops")),
	index("cp_type_idx").using("btree", table.type.asc().nullsLast().op("text_ops")),
]);

export const staticPages = pgTable("static_pages", {
	id: serial().primaryKey().notNull(),
	slug: varchar({ length: 100 }).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }),
	isPublished: boolean("is_published").default(false).notNull(),
}, (table) => [
	index("sp_slug_idx").using("btree", table.slug.asc().nullsLast().op("text_ops")),
]);

export const contentPageTranslations = pgTable("content_page_translations", {
	id: serial().primaryKey().notNull(),
	pageId: integer("page_id").notNull(),
	language: varchar({ length: 10 }).notNull(),
	title: varchar({ length: 500 }).notNull(),
	content: text(),
}, (table) => [
	index("cpt_page_id_idx").using("btree", table.pageId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.pageId],
			foreignColumns: [contentPages.id],
			name: "content_page_translations_page_id_fkey"
		}).onDelete("cascade"),
]);

export const staticPageTranslations = pgTable("static_page_translations", {
	id: serial().primaryKey().notNull(),
	pageId: integer("page_id").notNull(),
	language: varchar({ length: 10 }).notNull(),
	content: text(),
	draftContent: text("draft_content"),
}, (table) => [
	index("spt_page_id_idx").using("btree", table.pageId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.pageId],
			foreignColumns: [staticPages.id],
			name: "static_page_translations_page_id_fkey"
		}).onDelete("cascade"),
]);

export const languages = pgTable("languages", {
	id: serial().primaryKey().notNull(),
	code: varchar({ length: 10 }).notNull(),
	name: varchar({ length: 100 }).notNull(),
	isActive: boolean("is_active").default(true).notNull(),
	isHidden: boolean("is_hidden").default(false).notNull(),
	sortOrder: integer("sort_order").default(0).notNull(),
}, (table) => [
	unique("languages_code_unique").on(table.code),
]);

export const categoryDescriptions = pgTable("category_descriptions", {
	id: serial().primaryKey().notNull(),
	categoryKey: varchar("category_key", { length: 50 }).notNull(),
	language: varchar({ length: 10 }).notNull(),
	description: text(),
}, (table) => [
	index("cd_category_key_idx").using("btree", table.categoryKey.asc().nullsLast().op("text_ops")),
]);
