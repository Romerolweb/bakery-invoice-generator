import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";
import type { Customer, SellerProfile } from "@/lib/types";

// --- Customers Table ---
export const customers = sqliteTable("customers", {
  id: text("id").primaryKey(), // UUID
  customer_type: text("customer_type", { enum: ["individual", "business"] }).notNull(),
  first_name: text("first_name"),
  last_name: text("last_name"),
  business_name: text("business_name"),
  abn: text("abn"),
  email: text("email"),
  phone: text("phone"),
  address: text("address"),
});

// --- Products Table ---
export const products = sqliteTable("products", {
  id: text("id").primaryKey(), // UUID
  name: text("name").notNull(),
  description: text("description"),
  unit_price: real("unit_price").notNull(),
  GST_applicable: integer("gst_applicable", { mode: "boolean" }).notNull(),
});

// --- Seller Profile Table ---
// Typically this app has one seller profile, but a table allows flexibility.
export const sellerProfiles = sqliteTable("seller_profiles", {
  id: integer("id").primaryKey({ autoIncrement: true }), // Simple ID for single row
  name: text("name").notNull(),
  business_address: text("business_address").notNull(),
  ABN_or_ACN: text("abn_or_acn").notNull(),
  contact_email: text("contact_email").notNull(),
  phone: text("phone"),
  logo_url: text("logo_url"),
});

// --- Receipts Table ---
export const receipts = sqliteTable("receipts", {
  receipt_id: text("receipt_id").primaryKey(), // UUID
  customer_id: text("customer_id").notNull(),
  date_of_purchase: text("date_of_purchase").notNull(), // ISO string
  subtotal_excl_GST: real("subtotal_excl_gst").notNull(),
  GST_amount: real("gst_amount").notNull(),
  total_inc_GST: real("total_inc_gst").notNull(),
  is_tax_invoice: integer("is_tax_invoice", { mode: "boolean" }).notNull(),

  // Snapshots stored as JSON
  seller_profile_snapshot: text("seller_profile_snapshot", { mode: "json" }).$type<SellerProfile>().notNull(),
  customer_snapshot: text("customer_snapshot", { mode: "json" }).$type<Customer>().notNull(),
});

// --- Receipt Items Table (Line Items) ---
export const receiptItems = sqliteTable("receipt_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  receipt_id: text("receipt_id").notNull().references(() => receipts.receipt_id, { onDelete: 'cascade' }),
  product_id: text("product_id").notNull(),
  description: text("description").notNull(),
  quantity: integer("quantity").notNull(),
  unit_price: real("unit_price").notNull(),
  line_total: real("line_total").notNull(),
  product_name: text("product_name").notNull(),
  GST_applicable: integer("gst_applicable", { mode: "boolean" }).notNull(),
});

// --- Relations ---
export const receiptsRelations = relations(receipts, ({ many }) => ({
  lineItems: many(receiptItems),
}));

export const receiptItemsRelations = relations(receiptItems, ({ one }) => ({
  receipt: one(receipts, {
    fields: [receiptItems.receipt_id],
    references: [receipts.receipt_id],
  }),
}));
