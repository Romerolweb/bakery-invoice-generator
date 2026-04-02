CREATE TABLE "customers" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_type" text NOT NULL,
	"first_name" text,
	"last_name" text,
	"business_name" text,
	"abn" text,
	"email" text,
	"phone" text,
	"address" text
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"unit_price" double precision NOT NULL,
	"gst_applicable" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receipt_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"receipt_id" text NOT NULL,
	"product_id" text NOT NULL,
	"description" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price" double precision NOT NULL,
	"line_total" double precision NOT NULL,
	"product_name" text NOT NULL,
	"gst_applicable" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receipts" (
	"receipt_id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"date_of_purchase" text NOT NULL,
	"subtotal_excl_gst" double precision NOT NULL,
	"gst_amount" double precision NOT NULL,
	"total_inc_gst" double precision NOT NULL,
	"is_tax_invoice" boolean NOT NULL,
	"seller_profile_snapshot" jsonb NOT NULL,
	"customer_snapshot" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seller_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"business_address" text NOT NULL,
	"abn_or_acn" text NOT NULL,
	"contact_email" text NOT NULL,
	"phone" text,
	"logo_url" text
);
--> statement-breakpoint
ALTER TABLE "receipt_items" ADD CONSTRAINT "receipt_items_receipt_id_receipts_receipt_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."receipts"("receipt_id") ON DELETE cascade ON UPDATE no action;