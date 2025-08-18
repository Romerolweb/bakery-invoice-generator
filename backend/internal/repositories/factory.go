package repositories

import (
	"context"
	"database/sql"
	"time"
)

// Factory creates repository implementations
type Factory interface {
	// CreateRepositoryManager creates a new repository manager with the given configuration
	CreateRepositoryManager(config *Config) (RepositoryManager, error)

	// CreateCustomerRepository creates a customer repository
	CreateCustomerRepository(db *sql.DB) CustomerRepository

	// CreateProductRepository creates a product repository
	CreateProductRepository(db *sql.DB) ProductRepository

	// CreateReceiptRepository creates a receipt repository
	CreateReceiptRepository(db *sql.DB) ReceiptRepository

	// CreateLineItemRepository creates a line item repository
	CreateLineItemRepository(db *sql.DB) LineItemRepository

	// CreateProductCategoryRepository creates a product category repository
	CreateProductCategoryRepository(db *sql.DB) ProductCategoryRepository

	// CreateSellerProfileRepository creates a seller profile repository
	CreateSellerProfileRepository(db *sql.DB) SellerProfileRepository

	// CreateEmailAuditRepository creates an email audit repository
	CreateEmailAuditRepository(db *sql.DB) EmailAuditRepository

	// CreateQueryBuilderFactory creates a query builder factory
	CreateQueryBuilderFactory(db *sql.DB) QueryBuilderFactory
}

// RepositoryFactory provides a concrete implementation of the Factory interface
type RepositoryFactory struct {
	driver string
}

// NewRepositoryFactory creates a new repository factory for the specified database driver
func NewRepositoryFactory(driver string) Factory {
	return &RepositoryFactory{
		driver: driver,
	}
}

// CreateRepositoryManager creates a new repository manager with the given configuration
func (f *RepositoryFactory) CreateRepositoryManager(config *Config) (RepositoryManager, error) {
	// This will be implemented by concrete implementations
	panic("not implemented")
}

// CreateCustomerRepository creates a customer repository
func (f *RepositoryFactory) CreateCustomerRepository(db *sql.DB) CustomerRepository {
	// This will be implemented by concrete implementations
	panic("not implemented")
}

// CreateProductRepository creates a product repository
func (f *RepositoryFactory) CreateProductRepository(db *sql.DB) ProductRepository {
	// This will be implemented by concrete implementations
	panic("not implemented")
}

// CreateReceiptRepository creates a receipt repository
func (f *RepositoryFactory) CreateReceiptRepository(db *sql.DB) ReceiptRepository {
	// This will be implemented by concrete implementations
	panic("not implemented")
}

// CreateLineItemRepository creates a line item repository
func (f *RepositoryFactory) CreateLineItemRepository(db *sql.DB) LineItemRepository {
	// This will be implemented by concrete implementations
	panic("not implemented")
}

// CreateProductCategoryRepository creates a product category repository
func (f *RepositoryFactory) CreateProductCategoryRepository(db *sql.DB) ProductCategoryRepository {
	// This will be implemented by concrete implementations
	panic("not implemented")
}

// CreateSellerProfileRepository creates a seller profile repository
func (f *RepositoryFactory) CreateSellerProfileRepository(db *sql.DB) SellerProfileRepository {
	// This will be implemented by concrete implementations
	panic("not implemented")
}

// CreateEmailAuditRepository creates an email audit repository
func (f *RepositoryFactory) CreateEmailAuditRepository(db *sql.DB) EmailAuditRepository {
	// This will be implemented by concrete implementations
	panic("not implemented")
}

// CreateQueryBuilderFactory creates a query builder factory
func (f *RepositoryFactory) CreateQueryBuilderFactory(db *sql.DB) QueryBuilderFactory {
	// This will be implemented by concrete implementations
	panic("not implemented")
}

// DatabaseConnection represents a database connection with additional metadata
type DatabaseConnection struct {
	DB     *sql.DB
	Driver string
	DSN    string
	Config *Config
}

// ConnectionManager manages database connections
type ConnectionManager interface {
	// Connect establishes a database connection
	Connect(ctx context.Context, config *Config) (*DatabaseConnection, error)

	// Close closes the database connection
	Close(conn *DatabaseConnection) error

	// Ping tests the database connection
	Ping(ctx context.Context, conn *DatabaseConnection) error

	// Stats returns connection statistics
	Stats(conn *DatabaseConnection) sql.DBStats

	// SetMaxOpenConns sets the maximum number of open connections
	SetMaxOpenConns(conn *DatabaseConnection, n int)

	// SetMaxIdleConns sets the maximum number of idle connections
	SetMaxIdleConns(conn *DatabaseConnection, n int)

	// SetConnMaxLifetime sets the maximum lifetime of connections
	SetConnMaxLifetime(conn *DatabaseConnection, d time.Duration)

	// SetConnMaxIdleTime sets the maximum idle time of connections
	SetConnMaxIdleTime(conn *DatabaseConnection, d time.Duration)
}

// MigrationRunner handles database migrations
type MigrationRunner interface {
	// Run executes pending migrations
	Run(ctx context.Context, conn *DatabaseConnection, config *MigrationConfig) error

	// Rollback rolls back the last migration
	Rollback(ctx context.Context, conn *DatabaseConnection, config *MigrationConfig) error

	// Status returns the current migration status
	Status(ctx context.Context, conn *DatabaseConnection, config *MigrationConfig) ([]MigrationStatus, error)

	// Create creates a new migration file
	Create(name string, config *MigrationConfig) error
}

// MigrationStatus represents the status of a migration
type MigrationStatus struct {
	Version   string     `json:"version"`
	Name      string     `json:"name"`
	Applied   bool       `json:"applied"`
	AppliedAt *time.Time `json:"applied_at,omitempty"`
}

// HealthChecker provides health checking capabilities for repositories
type HealthChecker interface {
	// CheckHealth performs a health check on the repository
	CheckHealth(ctx context.Context) error

	// GetHealthStatus returns detailed health status
	GetHealthStatus(ctx context.Context) *HealthStatus
}

// HealthStatus represents the health status of a repository
type HealthStatus struct {
	Healthy      bool              `json:"healthy"`
	Message      string            `json:"message,omitempty"`
	Details      map[string]string `json:"details,omitempty"`
	CheckedAt    time.Time         `json:"checked_at"`
	ResponseTime time.Duration     `json:"response_time"`
}

// MetricsCollector collects repository metrics
type MetricsCollector interface {
	// RecordQuery records a query execution
	RecordQuery(operation string, duration time.Duration, err error)

	// RecordTransaction records a transaction
	RecordTransaction(operation string, duration time.Duration, err error)

	// GetMetrics returns current metrics
	GetMetrics() *Metrics

	// Reset resets all metrics
	Reset()
}

// Metrics represents repository metrics
type Metrics struct {
	Queries      QueryMetrics       `json:"queries"`
	Transactions TransactionMetrics `json:"transactions"`
	Connections  ConnectionMetrics  `json:"connections"`
	Errors       ErrorMetrics       `json:"errors"`
}

// QueryMetrics represents query-related metrics
type QueryMetrics struct {
	Total       int64            `json:"total"`
	Successful  int64            `json:"successful"`
	Failed      int64            `json:"failed"`
	AverageTime time.Duration    `json:"average_time"`
	SlowQueries int64            `json:"slow_queries"`
	ByOperation map[string]int64 `json:"by_operation"`
}

// TransactionMetrics represents transaction-related metrics
type TransactionMetrics struct {
	Total       int64         `json:"total"`
	Committed   int64         `json:"committed"`
	RolledBack  int64         `json:"rolled_back"`
	AverageTime time.Duration `json:"average_time"`
}

// ConnectionMetrics represents connection-related metrics
type ConnectionMetrics struct {
	Active  int `json:"active"`
	Idle    int `json:"idle"`
	Total   int `json:"total"`
	MaxOpen int `json:"max_open"`
	MaxIdle int `json:"max_idle"`
}

// ErrorMetrics represents error-related metrics
type ErrorMetrics struct {
	Total       int64            `json:"total"`
	ByType      map[string]int64 `json:"by_type"`
	ByOperation map[string]int64 `json:"by_operation"`
}

// RepositoryOptions provides options for repository creation
type RepositoryOptions struct {
	// EnableMetrics enables metrics collection
	EnableMetrics bool

	// EnableHealthChecks enables health checking
	EnableHealthChecks bool

	// EnableQueryLogging enables query logging
	EnableQueryLogging bool

	// EnableSlowQueryLogging enables slow query logging
	EnableSlowQueryLogging bool

	// MetricsCollector is a custom metrics collector
	MetricsCollector MetricsCollector

	// Logger is a custom logger
	Logger Logger
}

// Logger represents a logger interface for repositories
type Logger interface {
	// Debug logs a debug message
	Debug(msg string, fields ...interface{})

	// Info logs an info message
	Info(msg string, fields ...interface{})

	// Warn logs a warning message
	Warn(msg string, fields ...interface{})

	// Error logs an error message
	Error(msg string, fields ...interface{})

	// With returns a logger with additional fields
	With(fields ...interface{}) Logger
}
