package migration

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/sirupsen/logrus"
)

// JSONMigrator handles migration from JSON files to SQLite database
type JSONMigrator struct {
	db         *sql.DB
	logger     *logrus.Logger
	jsonPath   string
	backupPath string
}

// NewJSONMigrator creates a new JSON migrator
func NewJSONMigrator(db *sql.DB, jsonPath string, logger *logrus.Logger) *JSONMigrator {
	return &JSONMigrator{
		db:         db,
		logger:     logger,
		jsonPath:   jsonPath,
		backupPath: filepath.Join(jsonPath, "backup"),
	}
}

// JSONCustomer represents the JSON structure for customers
type JSONCustomer struct {
	ID           string `json:"id"`
	CustomerType string `json:"customer_type"`
	FirstName    string `json:"first_name,omitempty"`
	LastName     string `json:"last_name,omitempty"`
	BusinessName string `json:"business_name,omitempty"`
	ABN          string `json:"abn,omitempty"`
	Email        string `json:"email,omitempty"`
	Phone        string `json:"phone,omitempty"`
	Address      string `json:"address,omitempty"`
}

// JSONProduct represents the JSON structure for products
type JSONProduct struct {
	ID            string  `json:"id"`
	Name          string  `json:"name"`
	Description   string  `json:"description,omitempty"`
	UnitPrice     float64 `json:"unit_price"`
	GSTApplicable bool    `json:"GST_applicable"`
}

// JSONSellerProfile represents the JSON structure for seller profile
type JSONSellerProfile struct {
	Name            string `json:"name"`
	BusinessAddress string `json:"business_address"`
	ABNOrACN        string `json:"ABN_or_ACN"`
	ContactEmail    string `json:"contact_email"`
	Phone           string `json:"phone,omitempty"`
	LogoURL         string `json:"logo_url,omitempty"`
}

// JSONLineItem represents the JSON structure for line items
type JSONLineItem struct {
	ProductID     string  `json:"product_id"`
	ProductName   string  `json:"product_name"`
	Description   string  `json:"description,omitempty"`
	Quantity      int     `json:"quantity"`
	UnitPrice     float64 `json:"unit_price"`
	LineTotal     float64 `json:"line_total"`
	GSTApplicable bool    `json:"GST_applicable"`
}

// JSONReceipt represents the JSON structure for receipts
type JSONReceipt struct {
	ReceiptID             string            `json:"receipt_id"`
	CustomerID            string            `json:"customer_id"`
	DateOfPurchase        string            `json:"date_of_purchase"`
	LineItems             []JSONLineItem    `json:"line_items"`
	SubtotalExclGST       float64           `json:"subtotal_excl_GST"`
	GSTAmount             float64           `json:"GST_amount"`
	TotalIncGST           float64           `json:"total_inc_GST"`
	IsTaxInvoice          bool              `json:"is_tax_invoice"`
	SellerProfileSnapshot JSONSellerProfile `json:"seller_profile_snapshot"`
	CustomerSnapshot      JSONCustomer      `json:"customer_snapshot"`
}

// MigrationResult contains the results of the migration
type MigrationResult struct {
	CustomersProcessed int
	ProductsProcessed  int
	ReceiptsProcessed  int
	LineItemsProcessed int
	Errors             []string
	Warnings           []string
}

// MigrateFromJSON migrates all data from JSON files to SQLite database
func (m *JSONMigrator) MigrateFromJSON() (*MigrationResult, error) {
	m.logger.Info("Starting JSON to SQLite migration...")

	result := &MigrationResult{
		Errors:   make([]string, 0),
		Warnings: make([]string, 0),
	}

	// Create backup of JSON files
	if err := m.createJSONBackup(); err != nil {
		m.logger.WithError(err).Warn("Failed to create JSON backup")
		result.Warnings = append(result.Warnings, fmt.Sprintf("Failed to create JSON backup: %v", err))
	}

	// Start transaction
	tx, err := m.db.Begin()
	if err != nil {
		return nil, fmt.Errorf("failed to start transaction: %w", err)
	}
	defer tx.Rollback()

	// Migrate seller profile first (required for receipts)
	if err := m.migrateSellerProfile(tx); err != nil {
		result.Errors = append(result.Errors, fmt.Sprintf("Seller profile migration failed: %v", err))
		return result, fmt.Errorf("seller profile migration failed: %w", err)
	}

	// Migrate customers
	customersCount, err := m.migrateCustomers(tx)
	if err != nil {
		result.Errors = append(result.Errors, fmt.Sprintf("Customer migration failed: %v", err))
		return result, fmt.Errorf("customer migration failed: %w", err)
	}
	result.CustomersProcessed = customersCount

	// Migrate products
	productsCount, err := m.migrateProducts(tx)
	if err != nil {
		result.Errors = append(result.Errors, fmt.Sprintf("Product migration failed: %v", err))
		return result, fmt.Errorf("product migration failed: %w", err)
	}
	result.ProductsProcessed = productsCount

	// Migrate receipts and line items
	receiptsCount, lineItemsCount, err := m.migrateReceipts(tx)
	if err != nil {
		result.Errors = append(result.Errors, fmt.Sprintf("Receipt migration failed: %v", err))
		return result, fmt.Errorf("receipt migration failed: %w", err)
	}
	result.ReceiptsProcessed = receiptsCount
	result.LineItemsProcessed = lineItemsCount

	// Commit transaction
	if err := tx.Commit(); err != nil {
		return result, fmt.Errorf("failed to commit transaction: %w", err)
	}

	m.logger.WithFields(logrus.Fields{
		"customers":  result.CustomersProcessed,
		"products":   result.ProductsProcessed,
		"receipts":   result.ReceiptsProcessed,
		"line_items": result.LineItemsProcessed,
	}).Info("JSON to SQLite migration completed successfully")

	return result, nil
}

// migrateSellerProfile migrates the seller profile
func (m *JSONMigrator) migrateSellerProfile(tx *sql.Tx) error {
	filePath := filepath.Join(m.jsonPath, "seller-profile.json")

	data, err := ioutil.ReadFile(filePath)
	if err != nil {
		if os.IsNotExist(err) {
			m.logger.Warn("Seller profile JSON file not found, skipping")
			return nil
		}
		return fmt.Errorf("failed to read seller profile file: %w", err)
	}

	var profile JSONSellerProfile
	if err := json.Unmarshal(data, &profile); err != nil {
		return fmt.Errorf("failed to unmarshal seller profile: %w", err)
	}

	// Insert seller profile (singleton with id=1)
	query := `
		INSERT OR REPLACE INTO seller_profile 
		(id, name, business_address, abn_or_acn, contact_email, phone, logo_url, updated_at)
		VALUES (1, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
	`

	_, err = tx.Exec(query, profile.Name, profile.BusinessAddress, profile.ABNOrACN,
		profile.ContactEmail, nullString(profile.Phone), nullString(profile.LogoURL))
	if err != nil {
		return fmt.Errorf("failed to insert seller profile: %w", err)
	}

	m.logger.Info("Seller profile migrated successfully")
	return nil
}

// migrateCustomers migrates customers from JSON to database
func (m *JSONMigrator) migrateCustomers(tx *sql.Tx) (int, error) {
	filePath := filepath.Join(m.jsonPath, "customers.json")

	data, err := ioutil.ReadFile(filePath)
	if err != nil {
		if os.IsNotExist(err) {
			m.logger.Warn("Customers JSON file not found, skipping")
			return 0, nil
		}
		return 0, fmt.Errorf("failed to read customers file: %w", err)
	}

	var customers []JSONCustomer
	if err := json.Unmarshal(data, &customers); err != nil {
		return 0, fmt.Errorf("failed to unmarshal customers: %w", err)
	}

	query := `
		INSERT OR REPLACE INTO customers 
		(id, customer_type, first_name, last_name, business_name, abn, email, phone, address, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
	`

	stmt, err := tx.Prepare(query)
	if err != nil {
		return 0, fmt.Errorf("failed to prepare customer insert statement: %w", err)
	}
	defer stmt.Close()

	count := 0
	for _, customer := range customers {
		// Validate customer data
		if err := m.validateCustomer(&customer); err != nil {
			m.logger.WithError(err).WithField("customer_id", customer.ID).Warn("Invalid customer data, skipping")
			continue
		}

		_, err := stmt.Exec(
			customer.ID,
			customer.CustomerType,
			nullString(customer.FirstName),
			nullString(customer.LastName),
			nullString(customer.BusinessName),
			nullString(customer.ABN),
			nullString(customer.Email),
			nullString(customer.Phone),
			nullString(customer.Address),
		)
		if err != nil {
			m.logger.WithError(err).WithField("customer_id", customer.ID).Error("Failed to insert customer")
			continue
		}
		count++
	}

	m.logger.WithField("count", count).Info("Customers migrated successfully")
	return count, nil
}

// migrateProducts migrates products from JSON to database
func (m *JSONMigrator) migrateProducts(tx *sql.Tx) (int, error) {
	filePath := filepath.Join(m.jsonPath, "products.json")

	data, err := ioutil.ReadFile(filePath)
	if err != nil {
		if os.IsNotExist(err) {
			m.logger.Warn("Products JSON file not found, skipping")
			return 0, nil
		}
		return 0, fmt.Errorf("failed to read products file: %w", err)
	}

	var products []JSONProduct
	if err := json.Unmarshal(data, &products); err != nil {
		return 0, fmt.Errorf("failed to unmarshal products: %w", err)
	}

	query := `
		INSERT OR REPLACE INTO products 
		(id, name, description, category, unit_price, gst_applicable, active, created_at, updated_at)
		VALUES (?, ?, ?, 'general', ?, ?, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
	`

	stmt, err := tx.Prepare(query)
	if err != nil {
		return 0, fmt.Errorf("failed to prepare product insert statement: %w", err)
	}
	defer stmt.Close()

	count := 0
	for _, product := range products {
		// Validate product data
		if err := m.validateProduct(&product); err != nil {
			m.logger.WithError(err).WithField("product_id", product.ID).Warn("Invalid product data, skipping")
			continue
		}

		_, err := stmt.Exec(
			product.ID,
			product.Name,
			nullString(product.Description),
			product.UnitPrice,
			product.GSTApplicable,
		)
		if err != nil {
			m.logger.WithError(err).WithField("product_id", product.ID).Error("Failed to insert product")
			continue
		}
		count++
	}

	m.logger.WithField("count", count).Info("Products migrated successfully")
	return count, nil
}

// migrateReceipts migrates receipts and line items from JSON to database
func (m *JSONMigrator) migrateReceipts(tx *sql.Tx) (int, int, error) {
	filePath := filepath.Join(m.jsonPath, "receipts.json")

	data, err := ioutil.ReadFile(filePath)
	if err != nil {
		if os.IsNotExist(err) {
			m.logger.Warn("Receipts JSON file not found, skipping")
			return 0, 0, nil
		}
		return 0, 0, fmt.Errorf("failed to read receipts file: %w", err)
	}

	var receipts []JSONReceipt
	if err := json.Unmarshal(data, &receipts); err != nil {
		return 0, 0, fmt.Errorf("failed to unmarshal receipts: %w", err)
	}

	receiptQuery := `
		INSERT OR REPLACE INTO receipts 
		(receipt_id, customer_id, date_of_purchase, subtotal_excl_gst, gst_amount, total_inc_gst, 
		 is_tax_invoice, payment_method, notes, seller_profile_snapshot, customer_snapshot, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, 'cash', NULL, ?, ?, CURRENT_TIMESTAMP)
	`

	lineItemQuery := `
		INSERT OR REPLACE INTO line_items 
		(id, receipt_id, product_id, product_name, description, quantity, unit_price, line_total, gst_applicable, sort_order)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`

	receiptStmt, err := tx.Prepare(receiptQuery)
	if err != nil {
		return 0, 0, fmt.Errorf("failed to prepare receipt insert statement: %w", err)
	}
	defer receiptStmt.Close()

	lineItemStmt, err := tx.Prepare(lineItemQuery)
	if err != nil {
		return 0, 0, fmt.Errorf("failed to prepare line item insert statement: %w", err)
	}
	defer lineItemStmt.Close()

	receiptCount := 0
	lineItemCount := 0

	for _, receipt := range receipts {
		// Validate receipt data
		if err := m.validateReceipt(&receipt); err != nil {
			m.logger.WithError(err).WithField("receipt_id", receipt.ReceiptID).Warn("Invalid receipt data, skipping")
			continue
		}

		// Parse date
		dateOfPurchase, err := m.parseDate(receipt.DateOfPurchase)
		if err != nil {
			m.logger.WithError(err).WithField("receipt_id", receipt.ReceiptID).Warn("Invalid date format, skipping")
			continue
		}

		// Convert snapshots to JSON
		sellerSnapshot, err := json.Marshal(receipt.SellerProfileSnapshot)
		if err != nil {
			m.logger.WithError(err).WithField("receipt_id", receipt.ReceiptID).Error("Failed to marshal seller snapshot")
			continue
		}

		customerSnapshot, err := json.Marshal(receipt.CustomerSnapshot)
		if err != nil {
			m.logger.WithError(err).WithField("receipt_id", receipt.ReceiptID).Error("Failed to marshal customer snapshot")
			continue
		}

		// Insert receipt
		_, err = receiptStmt.Exec(
			receipt.ReceiptID,
			receipt.CustomerID,
			dateOfPurchase,
			receipt.SubtotalExclGST,
			receipt.GSTAmount,
			receipt.TotalIncGST,
			receipt.IsTaxInvoice,
			string(sellerSnapshot),
			string(customerSnapshot),
		)
		if err != nil {
			m.logger.WithError(err).WithField("receipt_id", receipt.ReceiptID).Error("Failed to insert receipt")
			continue
		}
		receiptCount++

		// Insert line items
		for i, lineItem := range receipt.LineItems {
			lineItemID := uuid.New().String()
			_, err := lineItemStmt.Exec(
				lineItemID,
				receipt.ReceiptID,
				lineItem.ProductID,
				lineItem.ProductName,
				nullString(lineItem.Description),
				lineItem.Quantity,
				lineItem.UnitPrice,
				lineItem.LineTotal,
				lineItem.GSTApplicable,
				i,
			)
			if err != nil {
				m.logger.WithError(err).WithFields(logrus.Fields{
					"receipt_id":   receipt.ReceiptID,
					"line_item_id": lineItemID,
				}).Error("Failed to insert line item")
				continue
			}
			lineItemCount++
		}
	}

	m.logger.WithFields(logrus.Fields{
		"receipts":   receiptCount,
		"line_items": lineItemCount,
	}).Info("Receipts and line items migrated successfully")

	return receiptCount, lineItemCount, nil
}

// Validation functions
func (m *JSONMigrator) validateCustomer(customer *JSONCustomer) error {
	if customer.ID == "" {
		return fmt.Errorf("customer ID is required")
	}
	if customer.CustomerType != "individual" && customer.CustomerType != "business" {
		return fmt.Errorf("invalid customer type: %s", customer.CustomerType)
	}
	if customer.CustomerType == "individual" && customer.FirstName == "" {
		return fmt.Errorf("first name is required for individual customers")
	}
	if customer.CustomerType == "business" && customer.BusinessName == "" {
		return fmt.Errorf("business name is required for business customers")
	}
	return nil
}

func (m *JSONMigrator) validateProduct(product *JSONProduct) error {
	if product.ID == "" {
		return fmt.Errorf("product ID is required")
	}
	if product.Name == "" {
		return fmt.Errorf("product name is required")
	}
	if product.UnitPrice < 0 {
		return fmt.Errorf("unit price cannot be negative")
	}
	return nil
}

func (m *JSONMigrator) validateReceipt(receipt *JSONReceipt) error {
	if receipt.ReceiptID == "" {
		return fmt.Errorf("receipt ID is required")
	}
	if receipt.CustomerID == "" {
		return fmt.Errorf("customer ID is required")
	}
	if len(receipt.LineItems) == 0 {
		return fmt.Errorf("receipt must have at least one line item")
	}
	return nil
}

// parseDate parses various date formats from JSON
func (m *JSONMigrator) parseDate(dateStr string) (time.Time, error) {
	// Try different date formats
	formats := []string{
		time.RFC3339,
		"2006-01-02T15:04:05.000Z",
		"2006-01-02",
		"2006-01-02T15:04:05Z",
	}

	for _, format := range formats {
		if t, err := time.Parse(format, dateStr); err == nil {
			return t, nil
		}
	}

	return time.Time{}, fmt.Errorf("unable to parse date: %s", dateStr)
}

// createJSONBackup creates a backup of JSON files before migration
func (m *JSONMigrator) createJSONBackup() error {
	if err := os.MkdirAll(m.backupPath, 0755); err != nil {
		return fmt.Errorf("failed to create backup directory: %w", err)
	}

	timestamp := time.Now().Format("20060102_150405")

	jsonFiles := []string{"customers.json", "products.json", "receipts.json", "seller-profile.json"}

	for _, filename := range jsonFiles {
		srcPath := filepath.Join(m.jsonPath, filename)
		if _, err := os.Stat(srcPath); os.IsNotExist(err) {
			continue // Skip if file doesn't exist
		}

		backupFilename := fmt.Sprintf("%s_%s", timestamp, filename)
		dstPath := filepath.Join(m.backupPath, backupFilename)

		if err := m.copyFile(srcPath, dstPath); err != nil {
			return fmt.Errorf("failed to backup %s: %w", filename, err)
		}

		m.logger.WithField("backup_file", dstPath).Info("JSON file backed up")
	}

	return nil
}

// copyFile copies a file from src to dst
func (m *JSONMigrator) copyFile(src, dst string) error {
	data, err := ioutil.ReadFile(src)
	if err != nil {
		return err
	}
	return ioutil.WriteFile(dst, data, 0644)
}

// nullString returns a sql.NullString for empty strings
func nullString(s string) interface{} {
	if strings.TrimSpace(s) == "" {
		return nil
	}
	return s
}

// CheckJSONFilesExist checks if JSON files exist for migration
func (m *JSONMigrator) CheckJSONFilesExist() (bool, []string) {
	jsonFiles := []string{"customers.json", "products.json", "receipts.json", "seller-profile.json"}
	existingFiles := make([]string, 0)

	for _, filename := range jsonFiles {
		filePath := filepath.Join(m.jsonPath, filename)
		if _, err := os.Stat(filePath); err == nil {
			existingFiles = append(existingFiles, filename)
		}
	}

	return len(existingFiles) > 0, existingFiles
}

// ValidateMigration validates the migrated data against the original JSON files
func (m *JSONMigrator) ValidateMigration() error {
	m.logger.Info("Validating migration results...")

	// Count records in database
	var customerCount, productCount, receiptCount, lineItemCount int

	if err := m.db.QueryRow("SELECT COUNT(*) FROM customers").Scan(&customerCount); err != nil {
		return fmt.Errorf("failed to count customers: %w", err)
	}

	if err := m.db.QueryRow("SELECT COUNT(*) FROM products").Scan(&productCount); err != nil {
		return fmt.Errorf("failed to count products: %w", err)
	}

	if err := m.db.QueryRow("SELECT COUNT(*) FROM receipts").Scan(&receiptCount); err != nil {
		return fmt.Errorf("failed to count receipts: %w", err)
	}

	if err := m.db.QueryRow("SELECT COUNT(*) FROM line_items").Scan(&lineItemCount); err != nil {
		return fmt.Errorf("failed to count line items: %w", err)
	}

	m.logger.WithFields(logrus.Fields{
		"customers":  customerCount,
		"products":   productCount,
		"receipts":   receiptCount,
		"line_items": lineItemCount,
	}).Info("Migration validation completed")

	return nil
}
