package database

import (
	"database/sql"
	"fmt"
	"path/filepath"
	"time"

	_ "github.com/mattn/go-sqlite3"
	"github.com/sirupsen/logrus"
)

// ConnectionConfig holds database connection configuration
type ConnectionConfig struct {
	DatabasePath    string
	MigrationsPath  string
	MaxOpenConns    int
	MaxIdleConns    int
	ConnMaxLifetime time.Duration
	Logger          *logrus.Logger
}

// DefaultConnectionConfig returns a default configuration
func DefaultConnectionConfig() *ConnectionConfig {
	return &ConnectionConfig{
		DatabasePath:    "./data/bakery.db",
		MigrationsPath:  "./migrations",
		MaxOpenConns:    1, // SQLite works best with single connection
		MaxIdleConns:    1,
		ConnMaxLifetime: time.Hour,
		Logger:          logrus.New(),
	}
}

// ConnectionManager manages database connections
type ConnectionManager struct {
	config *ConnectionConfig
	db     *sql.DB
}

// NewConnectionManager creates a new connection manager
func NewConnectionManager(config *ConnectionConfig) *ConnectionManager {
	return &ConnectionManager{
		config: config,
	}
}

// Connect establishes a database connection and runs migrations
func (cm *ConnectionManager) Connect() error {
	if cm.db != nil {
		return fmt.Errorf("database connection already established")
	}

	// Get absolute paths
	dbPath, err := filepath.Abs(cm.config.DatabasePath)
	if err != nil {
		return fmt.Errorf("failed to get absolute database path: %w", err)
	}

	migrationsPath, err := filepath.Abs(cm.config.MigrationsPath)
	if err != nil {
		return fmt.Errorf("failed to get absolute migrations path: %w", err)
	}

	// Initialize database with migrations
	db, err := InitializeDatabase(dbPath, migrationsPath, cm.config.Logger)
	if err != nil {
		return fmt.Errorf("failed to initialize database: %w", err)
	}

	// Configure connection pool
	db.SetMaxOpenConns(cm.config.MaxOpenConns)
	db.SetMaxIdleConns(cm.config.MaxIdleConns)
	db.SetConnMaxLifetime(cm.config.ConnMaxLifetime)

	cm.db = db
	cm.config.Logger.WithField("db_path", dbPath).Info("Database connection established")
	return nil
}

// GetDB returns the database connection
func (cm *ConnectionManager) GetDB() *sql.DB {
	return cm.db
}

// Close closes the database connection
func (cm *ConnectionManager) Close() error {
	if cm.db == nil {
		return nil
	}

	err := cm.db.Close()
	cm.db = nil

	if err != nil {
		return fmt.Errorf("failed to close database connection: %w", err)
	}

	cm.config.Logger.Info("Database connection closed")
	return nil
}

// Ping tests the database connection
func (cm *ConnectionManager) Ping() error {
	if cm.db == nil {
		return fmt.Errorf("database connection not established")
	}

	if err := cm.db.Ping(); err != nil {
		return fmt.Errorf("database ping failed: %w", err)
	}

	return nil
}

// GetMigrationManager returns a migration manager for this connection
func (cm *ConnectionManager) GetMigrationManager() *MigrationManager {
	if cm.db == nil {
		return nil
	}

	return NewMigrationManager(cm.db, cm.config.MigrationsPath, cm.config.Logger)
}

// HealthCheck performs a comprehensive health check
func (cm *ConnectionManager) HealthCheck() error {
	if err := cm.Ping(); err != nil {
		return fmt.Errorf("ping failed: %w", err)
	}

	// Test a simple query
	var result int
	if err := cm.db.QueryRow("SELECT 1").Scan(&result); err != nil {
		return fmt.Errorf("test query failed: %w", err)
	}

	if result != 1 {
		return fmt.Errorf("test query returned unexpected result: %d", result)
	}

	// Check foreign keys are enabled
	var fkEnabled int
	if err := cm.db.QueryRow("PRAGMA foreign_keys").Scan(&fkEnabled); err != nil {
		return fmt.Errorf("failed to check foreign key status: %w", err)
	}

	if fkEnabled != 1 {
		return fmt.Errorf("foreign keys are not enabled")
	}

	return nil
}
