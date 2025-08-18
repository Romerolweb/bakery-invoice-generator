package sqlite

import (
	"database/sql"

	"bakery-invoice-api/internal/repositories"

	"github.com/sirupsen/logrus"
)

// SQLiteFactory implements the Factory interface for SQLite
type SQLiteFactory struct {
	logger *logrus.Logger
}

// NewSQLiteFactory creates a new SQLite repository factory
func NewSQLiteFactory(logger *logrus.Logger) repositories.Factory {
	if logger == nil {
		logger = logrus.New()
	}
	return &SQLiteFactory{
		logger: logger,
	}
}

// CreateRepositoryManager creates a new repository manager with the given configuration
func (f *SQLiteFactory) CreateRepositoryManager(config *repositories.Config) (repositories.RepositoryManager, error) {
	return NewSQLiteRepositoryManager(config, f.logger)
}

// CreateCustomerRepository creates a customer repository
func (f *SQLiteFactory) CreateCustomerRepository(db *sql.DB) repositories.CustomerRepository {
	return NewCustomerRepository(db, f.logger)
}

// CreateProductRepository creates a product repository
func (f *SQLiteFactory) CreateProductRepository(db *sql.DB) repositories.ProductRepository {
	return NewProductRepository(db, f.logger)
}

// CreateReceiptRepository creates a receipt repository
func (f *SQLiteFactory) CreateReceiptRepository(db *sql.DB) repositories.ReceiptRepository {
	return NewReceiptRepository(db, f.logger)
}

// CreateLineItemRepository creates a line item repository
func (f *SQLiteFactory) CreateLineItemRepository(db *sql.DB) repositories.LineItemRepository {
	return NewLineItemRepository(db, f.logger)
}

// CreateProductCategoryRepository creates a product category repository
func (f *SQLiteFactory) CreateProductCategoryRepository(db *sql.DB) repositories.ProductCategoryRepository {
	return NewProductCategoryRepository(db, f.logger)
}

// CreateSellerProfileRepository creates a seller profile repository
func (f *SQLiteFactory) CreateSellerProfileRepository(db *sql.DB) repositories.SellerProfileRepository {
	return NewSellerProfileRepository(db, f.logger)
}

// CreateEmailAuditRepository creates an email audit repository
func (f *SQLiteFactory) CreateEmailAuditRepository(db *sql.DB) repositories.EmailAuditRepository {
	return NewEmailAuditRepository(db, f.logger)
}

// CreateQueryBuilderFactory creates a query builder factory
func (f *SQLiteFactory) CreateQueryBuilderFactory(db *sql.DB) repositories.QueryBuilderFactory {
	return NewSQLiteQueryBuilderFactory(db, f.logger)
}
