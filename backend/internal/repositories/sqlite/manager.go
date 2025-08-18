package sqlite

import (
	"context"
	"database/sql"

	"bakery-invoice-api/internal/repositories"

	"github.com/sirupsen/logrus"
)

// SQLiteRepositoryManager implements the RepositoryManager interface for SQLite
type SQLiteRepositoryManager struct {
	db                  *sql.DB
	config              *repositories.Config
	logger              *logrus.Logger
	customerRepo        repositories.CustomerRepository
	productRepo         repositories.ProductRepository
	receiptRepo         repositories.ReceiptRepository
	lineItemRepo        repositories.LineItemRepository
	productCategoryRepo repositories.ProductCategoryRepository
	sellerProfileRepo   repositories.SellerProfileRepository
	emailAuditRepo      repositories.EmailAuditRepository
	transactionManager  repositories.TransactionManager
}

// NewSQLiteRepositoryManager creates a new SQLite repository manager
func NewSQLiteRepositoryManager(config *repositories.Config, logger *logrus.Logger) (repositories.RepositoryManager, error) {
	if logger == nil {
		logger = logrus.New()
	}

	// TODO: Initialize database connection from config
	// For now, this is a placeholder - the actual DB connection should be passed in
	var db *sql.DB

	manager := &SQLiteRepositoryManager{
		db:     db,
		config: config,
		logger: logger,
	}

	// Initialize repositories
	manager.customerRepo = NewCustomerRepository(db, logger)
	manager.productRepo = NewProductRepository(db, logger)
	manager.receiptRepo = NewReceiptRepository(db, logger)
	manager.lineItemRepo = NewLineItemRepository(db, logger)
	manager.productCategoryRepo = NewProductCategoryRepository(db, logger)
	manager.sellerProfileRepo = NewSellerProfileRepository(db, logger)
	manager.emailAuditRepo = NewEmailAuditRepository(db, logger)
	manager.transactionManager = NewSQLiteTransactionManager(db, logger)

	return manager, nil
}

// NewSQLiteRepositoryManagerWithDB creates a new SQLite repository manager with an existing database connection
func NewSQLiteRepositoryManagerWithDB(db *sql.DB, config *repositories.Config, logger *logrus.Logger) repositories.RepositoryManager {
	if logger == nil {
		logger = logrus.New()
	}

	manager := &SQLiteRepositoryManager{
		db:     db,
		config: config,
		logger: logger,
	}

	// Initialize repositories
	manager.customerRepo = NewCustomerRepository(db, logger)
	manager.productRepo = NewProductRepository(db, logger)
	manager.receiptRepo = NewReceiptRepository(db, logger)
	manager.lineItemRepo = NewLineItemRepository(db, logger)
	manager.productCategoryRepo = NewProductCategoryRepository(db, logger)
	manager.sellerProfileRepo = NewSellerProfileRepository(db, logger)
	manager.emailAuditRepo = NewEmailAuditRepository(db, logger)
	manager.transactionManager = NewSQLiteTransactionManager(db, logger)

	return manager
}

// BeginTransaction starts a new transaction
func (m *SQLiteRepositoryManager) BeginTransaction(ctx context.Context) (repositories.Transaction, error) {
	return m.transactionManager.BeginTransaction(ctx)
}

// WithTransaction executes a function within a transaction
func (m *SQLiteRepositoryManager) WithTransaction(ctx context.Context, fn func(ctx context.Context) error) error {
	return m.transactionManager.WithTransaction(ctx, fn)
}

// Customers returns the customer repository
func (m *SQLiteRepositoryManager) Customers() repositories.CustomerRepository {
	return m.customerRepo
}

// Products returns the product repository
func (m *SQLiteRepositoryManager) Products() repositories.ProductRepository {
	return m.productRepo
}

// Receipts returns the receipt repository
func (m *SQLiteRepositoryManager) Receipts() repositories.ReceiptRepository {
	return m.receiptRepo
}

// LineItems returns the line item repository
func (m *SQLiteRepositoryManager) LineItems() repositories.LineItemRepository {
	return m.lineItemRepo
}

// ProductCategories returns the product category repository
func (m *SQLiteRepositoryManager) ProductCategories() repositories.ProductCategoryRepository {
	return m.productCategoryRepo
}

// SellerProfile returns the seller profile repository
func (m *SQLiteRepositoryManager) SellerProfile() repositories.SellerProfileRepository {
	return m.sellerProfileRepo
}

// EmailAudit returns the email audit repository
func (m *SQLiteRepositoryManager) EmailAudit() repositories.EmailAuditRepository {
	return m.emailAuditRepo
}

// Close closes all repository connections
func (m *SQLiteRepositoryManager) Close() error {
	if m.db != nil {
		return m.db.Close()
	}
	return nil
}

// Health checks the health of the repository connections
func (m *SQLiteRepositoryManager) Health(ctx context.Context) error {
	if m.db == nil {
		return repositories.ConnectionError(repositories.ErrConnection)
	}

	// Test database connection
	if err := m.db.PingContext(ctx); err != nil {
		return repositories.ConnectionError(err)
	}

	// Test a simple query
	var result int
	if err := m.db.QueryRowContext(ctx, "SELECT 1").Scan(&result); err != nil {
		return repositories.ConnectionError(err)
	}

	if result != 1 {
		return repositories.ConnectionError(repositories.ErrConnection)
	}

	return nil
}
