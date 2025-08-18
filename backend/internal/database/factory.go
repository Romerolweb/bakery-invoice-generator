package database

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"bakery-invoice-api/internal/repositories"

	_ "github.com/mattn/go-sqlite3"
	"github.com/sirupsen/logrus"
)

// ConnectionFactory creates and manages database connections
type ConnectionFactory struct {
	logger *logrus.Logger
}

// NewConnectionFactory creates a new connection factory
func NewConnectionFactory(logger *logrus.Logger) *ConnectionFactory {
	if logger == nil {
		logger = logrus.New()
	}
	return &ConnectionFactory{
		logger: logger,
	}
}

// CreateConnection creates a new database connection based on the configuration
func (f *ConnectionFactory) CreateConnection(ctx context.Context, config *repositories.Config) (*sql.DB, error) {
	if err := config.Validate(); err != nil {
		return nil, fmt.Errorf("invalid configuration: %w", err)
	}

	switch config.Database.Driver {
	case "sqlite":
		return f.createSQLiteConnection(ctx, config)
	case "postgres", "postgresql":
		return f.createPostgreSQLConnection(ctx, config)
	case "mysql":
		return f.createMySQLConnection(ctx, config)
	default:
		return nil, fmt.Errorf("unsupported database driver: %s", config.Database.Driver)
	}
}

// createSQLiteConnection creates a SQLite database connection
func (f *ConnectionFactory) createSQLiteConnection(ctx context.Context, config *repositories.Config) (*sql.DB, error) {
	// Ensure database directory exists
	dbPath := config.Database.Path
	if dbPath == "" {
		dbPath = "data/bakery.db"
	}

	// Convert to absolute path
	absPath, err := filepath.Abs(dbPath)
	if err != nil {
		return nil, fmt.Errorf("failed to get absolute path: %w", err)
	}

	// Ensure directory exists
	dir := filepath.Dir(absPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create database directory: %w", err)
	}

	// Build SQLite connection string with options
	dsn := f.buildSQLiteDSN(absPath, config)

	f.logger.WithFields(logrus.Fields{
		"driver": "sqlite",
		"path":   absPath,
		"dsn":    dsn,
	}).Info("Creating SQLite connection")

	db, err := sql.Open("sqlite3", dsn)
	if err != nil {
		return nil, fmt.Errorf("failed to open SQLite database: %w", err)
	}

	// Configure connection pool
	f.configureConnectionPool(db, config)

	// Test connection
	if err := db.PingContext(ctx); err != nil {
		db.Close()
		return nil, fmt.Errorf("failed to ping SQLite database: %w", err)
	}

	// Apply SQLite-specific settings
	if err := f.applySQLiteSettings(ctx, db, config); err != nil {
		db.Close()
		return nil, fmt.Errorf("failed to apply SQLite settings: %w", err)
	}

	f.logger.WithField("path", absPath).Info("SQLite connection established")
	return db, nil
}

// buildSQLiteDSN builds a SQLite DSN with options
func (f *ConnectionFactory) buildSQLiteDSN(path string, config *repositories.Config) string {
	var options []string

	// Cache mode
	if config.Database.CacheSize != 0 {
		options = append(options, fmt.Sprintf("cache=shared"))
	}

	// WAL mode
	if config.Database.WALMode {
		options = append(options, "_journal_mode=WAL")
	} else if config.Database.JournalMode != "" {
		options = append(options, fmt.Sprintf("_journal_mode=%s", config.Database.JournalMode))
	}

	// Synchronous mode
	if config.Database.Synchronous != "" {
		options = append(options, fmt.Sprintf("_synchronous=%s", config.Database.Synchronous))
	}

	// Foreign keys
	if config.Database.ForeignKeys {
		options = append(options, "_foreign_keys=on")
	}

	// Busy timeout
	if config.Database.BusyTimeout > 0 {
		options = append(options, fmt.Sprintf("_busy_timeout=%d", config.Database.BusyTimeout))
	}

	if len(options) > 0 {
		return fmt.Sprintf("%s?%s", path, strings.Join(options, "&"))
	}

	return path
}

// applySQLiteSettings applies SQLite-specific settings
func (f *ConnectionFactory) applySQLiteSettings(ctx context.Context, db *sql.DB, config *repositories.Config) error {
	settings := []string{}

	// Cache size
	if config.Database.CacheSize != 0 {
		settings = append(settings, fmt.Sprintf("PRAGMA cache_size = %d", config.Database.CacheSize))
	}

	// Temp store (memory for temporary tables)
	settings = append(settings, "PRAGMA temp_store = MEMORY")

	// Optimize for performance
	settings = append(settings, "PRAGMA optimize")

	// Execute settings
	for _, setting := range settings {
		if _, err := db.ExecContext(ctx, setting); err != nil {
			f.logger.WithError(err).WithField("setting", setting).Warn("Failed to apply SQLite setting")
		} else {
			f.logger.WithField("setting", setting).Debug("Applied SQLite setting")
		}
	}

	return nil
}

// createPostgreSQLConnection creates a PostgreSQL database connection
func (f *ConnectionFactory) createPostgreSQLConnection(ctx context.Context, config *repositories.Config) (*sql.DB, error) {
	// TODO: Implement PostgreSQL connection in future
	return nil, fmt.Errorf("PostgreSQL support not yet implemented")
}

// createMySQLConnection creates a MySQL database connection
func (f *ConnectionFactory) createMySQLConnection(ctx context.Context, config *repositories.Config) (*sql.DB, error) {
	// TODO: Implement MySQL connection in future
	return nil, fmt.Errorf("MySQL support not yet implemented")
}

// configureConnectionPool configures the database connection pool
func (f *ConnectionFactory) configureConnectionPool(db *sql.DB, config *repositories.Config) {
	db.SetMaxOpenConns(config.Pool.MaxOpenConns)
	db.SetMaxIdleConns(config.Pool.MaxIdleConns)
	db.SetConnMaxLifetime(config.Pool.ConnMaxLifetime)
	db.SetConnMaxIdleTime(config.Pool.ConnMaxIdleTime)

	f.logger.WithFields(logrus.Fields{
		"max_open_conns":     config.Pool.MaxOpenConns,
		"max_idle_conns":     config.Pool.MaxIdleConns,
		"conn_max_lifetime":  config.Pool.ConnMaxLifetime,
		"conn_max_idle_time": config.Pool.ConnMaxIdleTime,
	}).Debug("Configured connection pool")
}

// HealthChecker provides health checking capabilities for database connections
type HealthChecker struct {
	db     *sql.DB
	logger *logrus.Logger
}

// NewHealthChecker creates a new health checker
func NewHealthChecker(db *sql.DB, logger *logrus.Logger) *HealthChecker {
	if logger == nil {
		logger = logrus.New()
	}
	return &HealthChecker{
		db:     db,
		logger: logger,
	}
}

// CheckHealth performs a comprehensive health check
func (h *HealthChecker) CheckHealth(ctx context.Context) error {
	start := time.Now()
	defer func() {
		duration := time.Since(start)
		h.logger.WithField("duration", duration).Debug("Health check completed")
	}()

	// Basic ping test
	if err := h.db.PingContext(ctx); err != nil {
		return fmt.Errorf("ping failed: %w", err)
	}

	// Test a simple query
	var result int
	if err := h.db.QueryRowContext(ctx, "SELECT 1").Scan(&result); err != nil {
		return fmt.Errorf("test query failed: %w", err)
	}

	if result != 1 {
		return fmt.Errorf("test query returned unexpected result: %d", result)
	}

	return nil
}

// GetHealthStatus returns detailed health status
func (h *HealthChecker) GetHealthStatus(ctx context.Context) *repositories.HealthStatus {
	start := time.Now()
	status := &repositories.HealthStatus{
		CheckedAt: start,
		Details:   make(map[string]string),
	}

	// Perform health check
	err := h.CheckHealth(ctx)
	status.ResponseTime = time.Since(start)

	if err != nil {
		status.Healthy = false
		status.Message = err.Error()
		return status
	}

	status.Healthy = true
	status.Message = "Database is healthy"

	// Get connection stats
	stats := h.db.Stats()
	status.Details["open_connections"] = fmt.Sprintf("%d", stats.OpenConnections)
	status.Details["in_use"] = fmt.Sprintf("%d", stats.InUse)
	status.Details["idle"] = fmt.Sprintf("%d", stats.Idle)
	status.Details["wait_count"] = fmt.Sprintf("%d", stats.WaitCount)
	status.Details["wait_duration"] = stats.WaitDuration.String()
	status.Details["max_idle_closed"] = fmt.Sprintf("%d", stats.MaxIdleClosed)
	status.Details["max_idle_time_closed"] = fmt.Sprintf("%d", stats.MaxIdleTimeClosed)
	status.Details["max_lifetime_closed"] = fmt.Sprintf("%d", stats.MaxLifetimeClosed)

	return status
}

// ConnectionPool provides advanced connection pool management
type ConnectionPool struct {
	db     *sql.DB
	config *repositories.Config
	logger *logrus.Logger
	health *HealthChecker
}

// NewConnectionPool creates a new connection pool
func NewConnectionPool(db *sql.DB, config *repositories.Config, logger *logrus.Logger) *ConnectionPool {
	if logger == nil {
		logger = logrus.New()
	}

	return &ConnectionPool{
		db:     db,
		config: config,
		logger: logger,
		health: NewHealthChecker(db, logger),
	}
}

// GetDB returns the underlying database connection
func (p *ConnectionPool) GetDB() *sql.DB {
	return p.db
}

// GetStats returns connection pool statistics
func (p *ConnectionPool) GetStats() sql.DBStats {
	return p.db.Stats()
}

// CheckHealth performs a health check
func (p *ConnectionPool) CheckHealth(ctx context.Context) error {
	return p.health.CheckHealth(ctx)
}

// GetHealthStatus returns detailed health status
func (p *ConnectionPool) GetHealthStatus(ctx context.Context) *repositories.HealthStatus {
	return p.health.GetHealthStatus(ctx)
}

// Close closes the connection pool
func (p *ConnectionPool) Close() error {
	if p.db == nil {
		return nil
	}

	err := p.db.Close()
	if err != nil {
		p.logger.WithError(err).Error("Failed to close database connection")
		return fmt.Errorf("failed to close database connection: %w", err)
	}

	p.logger.Info("Database connection pool closed")
	return nil
}

// Ping tests the database connection
func (p *ConnectionPool) Ping(ctx context.Context) error {
	return p.db.PingContext(ctx)
}

// LogStats logs current connection pool statistics
func (p *ConnectionPool) LogStats() {
	stats := p.GetStats()
	p.logger.WithFields(logrus.Fields{
		"open_connections":     stats.OpenConnections,
		"in_use":               stats.InUse,
		"idle":                 stats.Idle,
		"wait_count":           stats.WaitCount,
		"wait_duration":        stats.WaitDuration,
		"max_idle_closed":      stats.MaxIdleClosed,
		"max_idle_time_closed": stats.MaxIdleTimeClosed,
		"max_lifetime_closed":  stats.MaxLifetimeClosed,
	}).Info("Connection pool statistics")
}

// WarmUp warms up the connection pool by creating initial connections
func (p *ConnectionPool) WarmUp(ctx context.Context) error {
	// Create a few connections to warm up the pool
	warmupConns := p.config.Pool.MaxIdleConns
	if warmupConns <= 0 {
		warmupConns = 1
	}

	for i := 0; i < warmupConns; i++ {
		if err := p.Ping(ctx); err != nil {
			return fmt.Errorf("failed to warm up connection %d: %w", i+1, err)
		}
	}

	p.logger.WithField("connections", warmupConns).Info("Connection pool warmed up")
	return nil
}
