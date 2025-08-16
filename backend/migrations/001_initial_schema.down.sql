-- Rollback script for initial database schema
-- Migration: 001_initial_schema.down.sql

-- Drop triggers first
DROP TRIGGER IF EXISTS customers_updated_at;
DROP TRIGGER IF EXISTS products_updated_at;
DROP TRIGGER IF EXISTS seller_profile_updated_at;

DROP TRIGGER IF EXISTS customers_fts_insert;
DROP TRIGGER IF EXISTS customers_fts_delete;
DROP TRIGGER IF EXISTS customers_fts_update;

DROP TRIGGER IF EXISTS products_fts_insert;
DROP TRIGGER IF EXISTS products_fts_delete;
DROP TRIGGER IF EXISTS products_fts_update;

-- Drop FTS tables
DROP TABLE IF EXISTS customers_fts;
DROP TABLE IF EXISTS products_fts;

-- Drop main tables (order matters due to foreign keys)
DROP TABLE IF EXISTS email_audit;
DROP TABLE IF EXISTS line_items;
DROP TABLE IF EXISTS receipts;
DROP TABLE IF EXISTS seller_profile;
DROP TABLE IF EXISTS product_categories;
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS customers;