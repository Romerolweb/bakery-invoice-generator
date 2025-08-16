-- Initial database schema for bakery invoice system
-- Migration: 001_initial_schema.up.sql

-- Enable foreign key constraints
PRAGMA foreign_keys = ON;

-- Customers table
CREATE TABLE customers (
    id TEXT PRIMARY KEY,
    customer_type TEXT NOT NULL CHECK (customer_type IN ('individual', 'business')),
    first_name TEXT,
    last_name TEXT,
    business_name TEXT,
    abn TEXT,
    email TEXT,
    phone TEXT,
    address TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints to ensure required fields based on customer type
    CHECK (
        (customer_type = 'individual' AND first_name IS NOT NULL) OR
        (customer_type = 'business' AND business_name IS NOT NULL)
    )
);

-- Products table
CREATE TABLE products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL DEFAULT 'general',
    unit_price DECIMAL(10,2) NOT NULL,
    gst_applicable BOOLEAN NOT NULL DEFAULT true,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Product categories lookup table
CREATE TABLE product_categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Receipts table
CREATE TABLE receipts (
    receipt_id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL,
    date_of_purchase DATETIME NOT NULL,
    subtotal_excl_gst DECIMAL(10,2) NOT NULL,
    gst_amount DECIMAL(10,2) NOT NULL,
    total_inc_gst DECIMAL(10,2) NOT NULL,
    is_tax_invoice BOOLEAN NOT NULL,
    payment_method TEXT DEFAULT 'cash',
    notes TEXT,
    
    -- Snapshots stored as JSON text
    seller_profile_snapshot TEXT NOT NULL, -- JSON
    customer_snapshot TEXT NOT NULL,       -- JSON
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (customer_id) REFERENCES customers(id)
);

-- Line items table
CREATE TABLE line_items (
    id TEXT PRIMARY KEY,
    receipt_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    product_name TEXT NOT NULL,
    description TEXT,
    quantity INTEGER NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    line_total DECIMAL(10,2) NOT NULL,
    gst_applicable BOOLEAN NOT NULL,
    sort_order INTEGER DEFAULT 0,
    
    FOREIGN KEY (receipt_id) REFERENCES receipts(receipt_id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id)
);

-- Seller profile table (singleton pattern)
CREATE TABLE seller_profile (
    id INTEGER PRIMARY KEY CHECK (id = 1), -- Enforce singleton
    name TEXT NOT NULL,
    business_address TEXT NOT NULL,
    abn_or_acn TEXT NOT NULL,
    contact_email TEXT NOT NULL,
    phone TEXT,
    logo_url TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Email audit table for tracking email deliveries
CREATE TABLE email_audit (
    id TEXT PRIMARY KEY,
    receipt_id TEXT NOT NULL,
    recipient_email TEXT NOT NULL,
    sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    status TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'pending', 'retry')),
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    
    FOREIGN KEY (receipt_id) REFERENCES receipts(receipt_id)
);

-- Performance indexes
CREATE INDEX idx_customers_type ON customers(customer_type);
CREATE INDEX idx_customers_email ON customers(email);
CREATE INDEX idx_customers_phone ON customers(phone);
CREATE INDEX idx_customers_business_name ON customers(business_name);
CREATE INDEX idx_customers_last_name ON customers(last_name);

CREATE INDEX idx_products_name ON products(name);
CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_products_active ON products(active);
CREATE INDEX idx_products_gst_applicable ON products(gst_applicable);

CREATE INDEX idx_receipts_customer_id ON receipts(customer_id);
CREATE INDEX idx_receipts_date ON receipts(date_of_purchase);
CREATE INDEX idx_receipts_is_tax_invoice ON receipts(is_tax_invoice);
CREATE INDEX idx_receipts_total ON receipts(total_inc_gst);

CREATE INDEX idx_line_items_receipt_id ON line_items(receipt_id);
CREATE INDEX idx_line_items_product_id ON line_items(product_id);
CREATE INDEX idx_line_items_product_name ON line_items(product_name);

CREATE INDEX idx_email_audit_receipt_id ON email_audit(receipt_id);
CREATE INDEX idx_email_audit_status ON email_audit(status);
CREATE INDEX idx_email_audit_sent_at ON email_audit(sent_at);

-- Full-text search tables for enhanced search capabilities
CREATE VIRTUAL TABLE customers_fts USING fts5(
    id UNINDEXED,
    first_name,
    last_name,
    business_name,
    email,
    phone,
    address,
    content='customers',
    content_rowid='rowid'
);

CREATE VIRTUAL TABLE products_fts USING fts5(
    id UNINDEXED,
    name,
    description,
    category,
    content='products',
    content_rowid='rowid'
);

-- Triggers to keep FTS tables in sync
CREATE TRIGGER customers_fts_insert AFTER INSERT ON customers BEGIN
    INSERT INTO customers_fts(rowid, id, first_name, last_name, business_name, email, phone, address)
    VALUES (NEW.rowid, NEW.id, NEW.first_name, NEW.last_name, NEW.business_name, NEW.email, NEW.phone, NEW.address);
END;

CREATE TRIGGER customers_fts_delete AFTER DELETE ON customers BEGIN
    DELETE FROM customers_fts WHERE rowid = OLD.rowid;
END;

CREATE TRIGGER customers_fts_update AFTER UPDATE ON customers BEGIN
    DELETE FROM customers_fts WHERE rowid = OLD.rowid;
    INSERT INTO customers_fts(rowid, id, first_name, last_name, business_name, email, phone, address)
    VALUES (NEW.rowid, NEW.id, NEW.first_name, NEW.last_name, NEW.business_name, NEW.email, NEW.phone, NEW.address);
END;

CREATE TRIGGER products_fts_insert AFTER INSERT ON products BEGIN
    INSERT INTO products_fts(rowid, id, name, description, category)
    VALUES (NEW.rowid, NEW.id, NEW.name, NEW.description, NEW.category);
END;

CREATE TRIGGER products_fts_delete AFTER DELETE ON products BEGIN
    DELETE FROM products_fts WHERE rowid = OLD.rowid;
END;

CREATE TRIGGER products_fts_update AFTER UPDATE ON products BEGIN
    DELETE FROM products_fts WHERE rowid = OLD.rowid;
    INSERT INTO products_fts(rowid, id, name, description, category)
    VALUES (NEW.rowid, NEW.id, NEW.name, NEW.description, NEW.category);
END;

-- Trigger to automatically update updated_at timestamps
CREATE TRIGGER customers_updated_at AFTER UPDATE ON customers BEGIN
    UPDATE customers SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER products_updated_at AFTER UPDATE ON products BEGIN
    UPDATE products SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER seller_profile_updated_at AFTER UPDATE ON seller_profile BEGIN
    UPDATE seller_profile SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Insert default product categories
INSERT INTO product_categories (id, name, description, sort_order) VALUES
    ('breads', 'Breads', 'Fresh baked breads and loaves', 1),
    ('cakes', 'Cakes', 'Custom and ready-made cakes', 2),
    ('pastries', 'Pastries', 'Sweet and savory pastries', 3),
    ('desserts', 'Desserts', 'Individual desserts and treats', 4),
    ('beverages', 'Beverages', 'Hot and cold drinks', 5),
    ('general', 'General', 'Miscellaneous items', 99);