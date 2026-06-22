import { relations } from "drizzle-orm/relations";
import { products, productPrices, stores, productTranslations, promotions, promotionProducts, storeTranslations, categories, categoryTranslations, banners, bannerTranslations, siteSettings, siteSettingTranslations, promotionTranslations, contentPages, contentPageTranslations, staticPages, staticPageTranslations } from "./schema";

export const productPricesRelations = relations(productPrices, ({one}) => ({
	product: one(products, {
		fields: [productPrices.productId],
		references: [products.id]
	}),
	store: one(stores, {
		fields: [productPrices.storeId],
		references: [stores.id]
	}),
}));

export const productsRelations = relations(products, ({one, many}) => ({
	productPrices: many(productPrices),
	productTranslations: many(productTranslations),
	promotionProducts: many(promotionProducts),
	category: one(categories, {
		fields: [products.categoryId],
		references: [categories.id]
	}),
}));

export const storesRelations = relations(stores, ({many}) => ({
	productPrices: many(productPrices),
	storeTranslations: many(storeTranslations),
}));

export const productTranslationsRelations = relations(productTranslations, ({one}) => ({
	product: one(products, {
		fields: [productTranslations.productId],
		references: [products.id]
	}),
}));

export const promotionProductsRelations = relations(promotionProducts, ({one}) => ({
	promotion: one(promotions, {
		fields: [promotionProducts.promotionId],
		references: [promotions.id]
	}),
	product: one(products, {
		fields: [promotionProducts.productId],
		references: [products.id]
	}),
}));

export const promotionsRelations = relations(promotions, ({many}) => ({
	promotionProducts: many(promotionProducts),
	promotionTranslations: many(promotionTranslations),
}));

export const storeTranslationsRelations = relations(storeTranslations, ({one}) => ({
	store: one(stores, {
		fields: [storeTranslations.storeId],
		references: [stores.id]
	}),
}));

export const categoryTranslationsRelations = relations(categoryTranslations, ({one}) => ({
	category: one(categories, {
		fields: [categoryTranslations.categoryId],
		references: [categories.id]
	}),
}));

export const categoriesRelations = relations(categories, ({many}) => ({
	categoryTranslations: many(categoryTranslations),
	products: many(products),
}));

export const bannerTranslationsRelations = relations(bannerTranslations, ({one}) => ({
	banner: one(banners, {
		fields: [bannerTranslations.bannerId],
		references: [banners.id]
	}),
}));

export const bannersRelations = relations(banners, ({many}) => ({
	bannerTranslations: many(bannerTranslations),
}));

export const siteSettingTranslationsRelations = relations(siteSettingTranslations, ({one}) => ({
	siteSetting: one(siteSettings, {
		fields: [siteSettingTranslations.siteSettingId],
		references: [siteSettings.id]
	}),
}));

export const siteSettingsRelations = relations(siteSettings, ({many}) => ({
	siteSettingTranslations: many(siteSettingTranslations),
}));

export const promotionTranslationsRelations = relations(promotionTranslations, ({one}) => ({
	promotion: one(promotions, {
		fields: [promotionTranslations.promotionId],
		references: [promotions.id]
	}),
}));

export const contentPageTranslationsRelations = relations(contentPageTranslations, ({one}) => ({
	contentPage: one(contentPages, {
		fields: [contentPageTranslations.pageId],
		references: [contentPages.id]
	}),
}));

export const contentPagesRelations = relations(contentPages, ({many}) => ({
	contentPageTranslations: many(contentPageTranslations),
}));

export const staticPageTranslationsRelations = relations(staticPageTranslations, ({one}) => ({
	staticPage: one(staticPages, {
		fields: [staticPageTranslations.pageId],
		references: [staticPages.id]
	}),
}));

export const staticPagesRelations = relations(staticPages, ({many}) => ({
	staticPageTranslations: many(staticPageTranslations),
}));