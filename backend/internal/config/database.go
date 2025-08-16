package config

import (
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"time"

	"bakery-invoice-api/internal/database"

	"github.com/sirupsen/logrus"
)

// DatabaseConfig holds database-specific configuration
type DatabaseConfig struct {
	Path            string        `mapstructure:"path"`
	MigrationsPath  string        `mapstructure:"migrations_path"`
	MaxOpenConns    int           `mapstructure:"max_open_conns"`
	MaxIdleConns    int           `mapstructure:"max_idle_conns"`
	ConnMaxLifetime time.Duration `mapstructure:"conn_max_lifetime"`
	AutoMigrate     bool          `mapstructure:"auto_migrate"`
	BackupEnabled   bool          `mapstructure:"backup_enabled"`
}

// DefaultDatabaseConfig returns default database configuration
func DefaultDatabaseConfig() *DatabaseConfig {
	return &DatabaseConfig{
		Path:            "./data/bakery.db",
		MigrationsPath:  "./migrations",
		MaxOpenConns:    1,
		MaxIdleConns:    1,
		ConnMaxLifetime: time.Hour,
		AutoMigrate:     true,
		BackupEnabled:   true,
	}
}

// LoadDatabaseConfigFromEnv loads database configuration from environment variables
func LoadDatabaseConfigFromEnv() *DatabaseConfig {
	config := DefaultDatabaseConfig()

	if path := os.Getenv("DB_PATH"); path != "" {
		config.Path = path
	}

	if migrationsPath := os.Getenv("DB_MIGRATIONS_PATH"); migrationsPath != "" {
		config.MigrationsPath = migrationsPath
	}

	if maxOpenConns := os.Getenv("DB_MAX_OPEN_CONNS"); maxOpenConns != "" {
		if val, err := strconv.Atoi(maxOpenConns); err == nil {
			config.MaxOpenConns = val
		}
	}

	if maxIdleConns := os.Getenv("DB_MAX_IDLE_CONNS"); maxIdleConns != "" {
		if val, err := strconv.Atoi(maxIdleConns); err == nil {
			config.MaxIdleConns = val
		}
	}

	if connMaxLifetime := os.Getenv("DB_CONN_MAX_LIFETIME"); connMaxLifetime != "" {
		if val, err := time.ParseDuration(connMaxLifetime); err == nil {
			config.ConnMaxLifetime = val
		}
	}

	if autoMigrate := os.Getenv("DB_AUTO_MIGRATE"); autoMigrate != "" {
		if val, err := strconv.ParseBool(autoMigrate); err == nil {
			config.AutoMigrate = val
		}
	}

	if backupEnabled := os.Getenv("DB_BACKUP_ENABLED"); backupEnabled != "" {
		if val, err := strconv.ParseBool(backupEnabled); err == nil {
			config.BackupEnabled = val
		}
	}

	return config
}

// Validate validates the database configuration
func (c *DatabaseConfig) Validate() error {
	if c.Path == "" {
		return fmt.Errorf("database path cannot be empty")
	}

	if c.MigrationsPath == "" {
		return fmt.Errorf("migrations path cannot be empty")
	}

	if c.MaxOpenConns < 1 {
		return fmt.Errorf("max open connections must be at least 1")
	}

	if c.MaxIdleConns < 1 {
		return fmt.Errorf("max idle connections must be at least 1")
	}

	if c.ConnMaxLifetime < time.Minute {
		return fmt.Errorf("connection max lifetime must be at least 1 minute")
	}

	// Check if migrations directory exists
	if _, err := os.Stat(c.MigrationsPath); os.IsNotExist(err) {
		return fmt.Errorf("migrations directory does not exist: %s", c.MigrationsPath)
	}

	return nil
}

// ToConnectionConfig converts DatabaseConfig to database.ConnectionConfig
func (c *DatabaseConfig) ToConnectionConfig(logger *logrus.Logger) *database.ConnectionConfig {
	return &database.ConnectionConfig{
		DatabasePath:    c.Path,
		MigrationsPath:  c.MigrationsPath,
		MaxOpenConns:    c.MaxOpenConns,
		MaxIdleConns:    c.MaxIdleConns,
		ConnMaxLifetime: c.ConnMaxLifetime,
		Logger:          logger,
	}
}

// EnsureDirectories creates necessary directories for database operation
func (c *DatabaseConfig) EnsureDirectories() error {
	// Ensure database directory exists
	dbDir := filepath.Dir(c.Path)
	if err := os.MkdirAll(dbDir, 0755); err != nil {
		return fmt.Errorf("failed to create database directory: %w", err)
	}

	// Ensure migrations directory exists (should already exist in repo)
	if _, err := os.Stat(c.MigrationsPath); os.IsNotExist(err) {
		return fmt.Errorf("migrations directory does not exist: %s", c.MigrationsPath)
	}

	return nil
}

// GetAbsolutePaths returns absolute paths for database and migrations
func (c *DatabaseConfig) GetAbsolutePaths() (string, string, error) {
	dbPath, err := filepath.Abs(c.Path)
	if err != nil {
		return "", "", fmt.Errorf("failed to get absolute database path: %w", err)
	}

	migrationsPath, err := filepath.Abs(c.MigrationsPath)
	if err != nil {
		return "", "", fmt.Errorf("failed to get absolute migrations path: %w", err)
	}

	return dbPath, migrationsPath, nil
}
