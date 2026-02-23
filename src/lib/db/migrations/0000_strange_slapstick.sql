CREATE TABLE `customers` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_type` text NOT NULL,
	`first_name` text,
	`last_name` text,
	`business_name` text,
	`abn` text,
	`email` text,
	`phone` text,
	`address` text
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`unit_price` real NOT NULL,
	`gst_applicable` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `receipt_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`receipt_id` text NOT NULL,
	`product_id` text NOT NULL,
	`description` text NOT NULL,
	`quantity` integer NOT NULL,
	`unit_price` real NOT NULL,
	`line_total` real NOT NULL,
	`product_name` text NOT NULL,
	`gst_applicable` integer NOT NULL,
	FOREIGN KEY (`receipt_id`) REFERENCES `receipts`(`receipt_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `receipts` (
	`receipt_id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`date_of_purchase` text NOT NULL,
	`subtotal_excl_gst` real NOT NULL,
	`gst_amount` real NOT NULL,
	`total_inc_gst` real NOT NULL,
	`is_tax_invoice` integer NOT NULL,
	`seller_profile_snapshot` text NOT NULL,
	`customer_snapshot` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `seller_profiles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`business_address` text NOT NULL,
	`abn_or_acn` text NOT NULL,
	`contact_email` text NOT NULL,
	`phone` text,
	`logo_url` text
);
