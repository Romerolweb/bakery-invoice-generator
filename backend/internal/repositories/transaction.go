package repositories

import (
	"context"
)

// Transaction represents a database transaction that can be used across multiple repositories
type Transaction interface {
	// Commit commits the transaction
	Commit() error

	// Rollback rolls back the transaction
	Rollback() error

	// Context returns the transaction context
	Context() context.Context
}

// TransactionManager manages database transactions
type TransactionManager interface {
	// BeginTransaction starts a new transaction
	BeginTransaction(ctx context.Context) (Transaction, error)

	// WithTransaction executes a function within a transaction
	WithTransaction(ctx context.Context, fn func(ctx context.Context) error) error
}

// TransactionalRepositories provides access to all repositories within a transaction context
type TransactionalRepositories interface {
	// Customers returns the customer repository
	Customers() CustomerRepository

	// Products returns the product repository
	Products() ProductRepository

	// Receipts returns the receipt repository
	Receipts() ReceiptRepository

	// LineItems returns the line item repository
	LineItems() LineItemRepository

	// ProductCategories returns the product category repository
	ProductCategories() ProductCategoryRepository

	// SellerProfile returns the seller profile repository
	SellerProfile() SellerProfileRepository

	// EmailAudit returns the email audit repository
	EmailAudit() EmailAuditRepository
}

// RepositoryManager provides access to all repositories and transaction management
type RepositoryManager interface {
	TransactionManager
	TransactionalRepositories

	// Close closes all repository connections
	Close() error

	// Health checks the health of the repository connections
	Health(ctx context.Context) error
}
