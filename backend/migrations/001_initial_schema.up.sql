-- Initial database schema for bakery invoice system

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
    
    -- Constraints
    CHECK (
        (customer_type = 'individual' AND first_name IS NOT NULL) OR
        (customer_type = 'business' AND business_name IS NOT NULL)
    )
);

-- Product categories lookup
CREATE TABLE product_categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    sort_order INTEGER DEFAULT 0
);

-- Products table with categories
CREATE TABLE products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL DEFAULT 'general',
    unit_price DECIMAL(10,2) NOT NULL,
    gst_applicable BOOLEAN NOT NULL DEFAULT true,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (category) REFERENCES product_categories(id)
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
    
    -- Snapshots (JSON columns)
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
    description TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    line_total DECIMAL(10,2) NOT NULL,
    gst_applicable BOOLEAN NOT NULL,
    sort_order INTEGER DEFAULT 0,
    
    FOREIGN KEY (receipt_id) REFERENCES receipts(receipt_id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id)
);

-- Seller profile table
CREATE TABLE seller_profile (
    id INTEGER PRIMARY KEY CHECK (id = 1), -- Singleton
    name TEXT NOT NULL,
    business_address TEXT NOT NULL,
    abn_or_acn TEXT NOT NULL,
    contact_email TEXT NOT NULL,
    phone TEXT,
    logo_url TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Email audit table
CREATE TABLE email_audit (
    id TEXT PRIMARY KEY,
    receipt_id TEXT NOT NULL,
    recipient_email TEXT NOT NULL,
    sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    status TEXT NOT NULL, -- 'sent', 'failed', 'pending'
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    
    FOREIGN KEY (receipt_id) REFERENCES receipts(receipt_id)
);

-- Indexes for performance
CREATE INDEX idx_receipts_customer_id ON receipts(customer_id);
CREATE INDEX idx_receipts_date ON receipts(date_of_purchase);
CREATE INDEX idx_line_items_receipt_id ON line_items(receipt_id);
CREATE INDEX idx_line_items_product_id ON line_items(product_id);
CREATE INDEX idx_email_audit_receipt_id ON email_audit(receipt_id);
CREATE INDEX idx_email_audit_status ON email_audit(status);

-- Full-text search tables
CREATE VIRTUAL TABLE customers_fts USING fts5(
    id, first_name, last_name, business_name, email, phone,
    content='customers'
);

CREATE VIRTUAL TABLE products_fts USING fts5(
    id, name, description, category,
    content='products'
);

-- Insert default product categories
INSERT INTO product_categories (id, name, description, sort_order) VALUES
    ('breads', 'Breads', 'All types of bread products', 1),
    ('cakes', 'Cakes', 'Cakes and celebration items', 2),
    ('pastries', 'Pastries', 'Pastries and sweet treats', 3),
    ('savory', 'Savory', 'Savory baked goods', 4),
    ('beverages', 'Beverages', 'Drinks and beverages', 5),
    ('general', 'General', 'General bakery items', 6);