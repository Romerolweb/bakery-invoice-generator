package sqlite

import (
	"context"
	"database/sql"

	"bakery-invoice-api/internal/repositories"

	"github.com/sirupsen/logrus"
)

// SQLiteTransaction implements the Transaction interface for SQLite
type SQLiteTransaction struct {
	tx     *sql.Tx
	ctx    context.Context
	logger *logrus.Logger
}

// NewSQLiteTransaction creates a new SQLite transaction
func NewSQLiteTransaction(tx *sql.Tx, ctx context.Context, logger *logrus.Logger) repositories.Transaction {
	if logger == nil {
		logger = logrus.New()
	}
	return &SQLiteTransaction{
		tx:     tx,
		ctx:    ctx,
		logger: logger,
	}
}

// Commit commits the transaction
func (t *SQLiteTransaction) Commit() error {
	err := t.tx.Commit()
	if err != nil {
		t.logger.WithError(err).Error("Failed to commit transaction")
		return repositories.TransactionError("commit", err)
	}
	t.logger.Debug("Transaction committed successfully")
	return nil
}

// Rollback rolls back the transaction
func (t *SQLiteTransaction) Rollback() error {
	err := t.tx.Rollback()
	if err != nil {
		t.logger.WithError(err).Error("Failed to rollback transaction")
		return repositories.TransactionError("rollback", err)
	}
	t.logger.Debug("Transaction rolled back successfully")
	return nil
}

// Context returns the transaction context
func (t *SQLiteTransaction) Context() context.Context {
	return t.ctx
}

// SQLiteTransactionManager implements the TransactionManager interface for SQLite
type SQLiteTransactionManager struct {
	db     *sql.DB
	logger *logrus.Logger
}

// NewSQLiteTransactionManager creates a new SQLite transaction manager
func NewSQLiteTransactionManager(db *sql.DB, logger *logrus.Logger) repositories.TransactionManager {
	if logger == nil {
		logger = logrus.New()
	}
	return &SQLiteTransactionManager{
		db:     db,
		logger: logger,
	}
}

// BeginTransaction starts a new transaction
func (tm *SQLiteTransactionManager) BeginTransaction(ctx context.Context) (repositories.Transaction, error) {
	tx, err := tm.db.BeginTx(ctx, nil)
	if err != nil {
		tm.logger.WithError(err).Error("Failed to begin transaction")
		return nil, repositories.TransactionError("begin", err)
	}

	tm.logger.Debug("Transaction started successfully")
	return NewSQLiteTransaction(tx, ctx, tm.logger), nil
}

// WithTransaction executes a function within a transaction
func (tm *SQLiteTransactionManager) WithTransaction(ctx context.Context, fn func(ctx context.Context) error) error {
	tx, err := tm.BeginTransaction(ctx)
	if err != nil {
		return err
	}

	// Ensure transaction is cleaned up
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
			panic(r) // Re-throw panic after cleanup
		}
	}()

	// Execute the function
	if err := fn(tx.Context()); err != nil {
		if rollbackErr := tx.Rollback(); rollbackErr != nil {
			tm.logger.WithError(rollbackErr).Error("Failed to rollback transaction after error")
		}
		return err
	}

	// Commit the transaction
	return tx.Commit()
}

// TransactionalSQLiteRepositoryManager provides transactional access to repositories
type TransactionalSQLiteRepositoryManager struct {
	tx                  *sql.Tx
	logger              *logrus.Logger
	customerRepo        repositories.CustomerRepository
	productRepo         repositories.ProductRepository
	receiptRepo         repositories.ReceiptRepository
	lineItemRepo        repositories.LineItemRepository
	productCategoryRepo repositories.ProductCategoryRepository
	sellerProfileRepo   repositories.SellerProfileRepository
	emailAuditRepo      repositories.EmailAuditRepository
}

// NewTransactionalSQLiteRepositoryManager creates a new transactional repository manager
func NewTransactionalSQLiteRepositoryManager(tx *sql.Tx, logger *logrus.Logger) repositories.TransactionalRepositories {
	if logger == nil {
		logger = logrus.New()
	}

	manager := &TransactionalSQLiteRepositoryManager{
		tx:     tx,
		logger: logger,
	}

	// Initialize repositories with the transaction
	// Note: These would need to be modified to accept *sql.Tx instead of *sql.DB
	// For now, this is a placeholder structure
	// manager.customerRepo = NewTransactionalCustomerRepository(tx, logger)
	// manager.productRepo = NewTransactionalProductRepository(tx, logger)
	// etc.

	return manager
}

// Customers returns the customer repository
func (m *TransactionalSQLiteRepositoryManager) Customers() repositories.CustomerRepository {
	return m.customerRepo
}

// Products returns the product repository
func (m *TransactionalSQLiteRepositoryManager) Products() repositories.ProductRepository {
	return m.productRepo
}

// Receipts returns the receipt repository
func (m *TransactionalSQLiteRepositoryManager) Receipts() repositories.ReceiptRepository {
	return m.receiptRepo
}

// LineItems returns the line item repository
func (m *TransactionalSQLiteRepositoryManager) LineItems() repositories.LineItemRepository {
	return m.lineItemRepo
}

// ProductCategories returns the product category repository
func (m *TransactionalSQLiteRepositoryManager) ProductCategories() repositories.ProductCategoryRepository {
	return m.productCategoryRepo
}

// SellerProfile returns the seller profile repository
func (m *TransactionalSQLiteRepositoryManager) SellerProfile() repositories.SellerProfileRepository {
	return m.sellerProfileRepo
}

// EmailAudit returns the email audit repository
func (m *TransactionalSQLiteRepositoryManager) EmailAudit() repositories.EmailAuditRepository {
	return m.emailAuditRepo
}
