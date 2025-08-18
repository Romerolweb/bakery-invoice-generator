package repositories

import (
	"errors"
	"time"
)

// Config represents repository configuration
type Config struct {
	// Database configuration
	Database DatabaseConfig `json:"database" yaml:"database"`

	// Connection pool configuration
	Pool PoolConfig `json:"pool" yaml:"pool"`

	// Query configuration
	Query QueryConfig `json:"query" yaml:"query"`

	// Cache configuration
	Cache CacheConfig `json:"cache" yaml:"cache"`

	// Migration configuration
	Migration MigrationConfig `json:"migration" yaml:"migration"`
}

// DatabaseConfig represents database-specific configuration
type DatabaseConfig struct {
	// Driver specifies the database driver (sqlite, postgres, mysql)
	Driver string `json:"driver" yaml:"driver"`

	// DSN is the data source name / connection string
	DSN string `json:"dsn" yaml:"dsn"`

	// Path is the database file path (for SQLite)
	Path string `json:"path" yaml:"path"`

	// WAL mode for SQLite
	WALMode bool `json:"wal_mode" yaml:"wal_mode"`

	// Foreign key constraints
	ForeignKeys bool `json:"foreign_keys" yaml:"foreign_keys"`

	// Synchronous mode for SQLite
	Synchronous string `json:"synchronous" yaml:"synchronous"`

	// Journal mode for SQLite
	JournalMode string `json:"journal_mode" yaml:"journal_mode"`

	// Cache size for SQLite (in KB)
	CacheSize int `json:"cache_size" yaml:"cache_size"`

	// Busy timeout for SQLite (in milliseconds)
	BusyTimeout int `json:"busy_timeout" yaml:"busy_timeout"`
}

// PoolConfig represents connection pool configuration
type PoolConfig struct {
	// MaxOpenConns is the maximum number of open connections
	MaxOpenConns int `json:"max_open_conns" yaml:"max_open_conns"`

	// MaxIdleConns is the maximum number of idle connections
	MaxIdleConns int `json:"max_idle_conns" yaml:"max_idle_conns"`

	// ConnMaxLifetime is the maximum lifetime of a connection
	ConnMaxLifetime time.Duration `json:"conn_max_lifetime" yaml:"conn_max_lifetime"`

	// ConnMaxIdleTime is the maximum idle time of a connection
	ConnMaxIdleTime time.Duration `json:"conn_max_idle_time" yaml:"conn_max_idle_time"`
}

// QueryConfig represents query-specific configuration
type QueryConfig struct {
	// DefaultLimit is the default limit for list queries
	DefaultLimit int `json:"default_limit" yaml:"default_limit"`

	// MaxLimit is the maximum allowed limit for list queries
	MaxLimit int `json:"max_limit" yaml:"max_limit"`

	// Timeout is the default query timeout
	Timeout time.Duration `json:"timeout" yaml:"timeout"`

	// SlowQueryThreshold is the threshold for logging slow queries
	SlowQueryThreshold time.Duration `json:"slow_query_threshold" yaml:"slow_query_threshold"`

	// EnableQueryLogging enables query logging
	EnableQueryLogging bool `json:"enable_query_logging" yaml:"enable_query_logging"`

	// LogSlowQueries enables slow query logging
	LogSlowQueries bool `json:"log_slow_queries" yaml:"log_slow_queries"`
}

// CacheConfig represents cache configuration
type CacheConfig struct {
	// Enabled enables caching
	Enabled bool `json:"enabled" yaml:"enabled"`

	// TTL is the default cache TTL
	TTL time.Duration `json:"ttl" yaml:"ttl"`

	// MaxSize is the maximum cache size
	MaxSize int `json:"max_size" yaml:"max_size"`

	// CleanupInterval is the cache cleanup interval
	CleanupInterval time.Duration `json:"cleanup_interval" yaml:"cleanup_interval"`
}

// MigrationConfig represents migration configuration
type MigrationConfig struct {
	// Enabled enables automatic migrations
	Enabled bool `json:"enabled" yaml:"enabled"`

	// Path is the migration files path
	Path string `json:"path" yaml:"path"`

	// Table is the migration table name
	Table string `json:"table" yaml:"table"`

	// LockTimeout is the migration lock timeout
	LockTimeout time.Duration `json:"lock_timeout" yaml:"lock_timeout"`

	// BackupBeforeMigration creates a backup before running migrations
	BackupBeforeMigration bool `json:"backup_before_migration" yaml:"backup_before_migration"`
}

// DefaultConfig returns a default repository configuration
func DefaultConfig() *Config {
	return &Config{
		Database: DatabaseConfig{
			Driver:      "sqlite",
			Path:        "data/bakery.db",
			WALMode:     true,
			ForeignKeys: true,
			Synchronous: "NORMAL",
			JournalMode: "WAL",
			CacheSize:   -64000, // 64MB
			BusyTimeout: 30000,  // 30 seconds
		},
		Pool: PoolConfig{
			MaxOpenConns:    25,
			MaxIdleConns:    5,
			ConnMaxLifetime: time.Hour,
			ConnMaxIdleTime: time.Minute * 15,
		},
		Query: QueryConfig{
			DefaultLimit:       50,
			MaxLimit:           1000,
			Timeout:            time.Second * 30,
			SlowQueryThreshold: time.Second * 2,
			EnableQueryLogging: false,
			LogSlowQueries:     true,
		},
		Cache: CacheConfig{
			Enabled:         false, // Disabled by default for simplicity
			TTL:             time.Minute * 15,
			MaxSize:         1000,
			CleanupInterval: time.Minute * 5,
		},
		Migration: MigrationConfig{
			Enabled:               true,
			Path:                  "migrations",
			Table:                 "schema_migrations",
			LockTimeout:           time.Minute * 5,
			BackupBeforeMigration: true,
		},
	}
}

// Validate validates the repository configuration
func (c *Config) Validate() error {
	if c.Database.Driver == "" {
		return errors.New("database driver is required")
	}

	if c.Database.Driver == "sqlite" && c.Database.Path == "" {
		return errors.New("database path is required for SQLite")
	}

	if c.Database.Driver != "sqlite" && c.Database.DSN == "" {
		return errors.New("database DSN is required for non-SQLite databases")
	}

	if c.Pool.MaxOpenConns <= 0 {
		return errors.New("max open connections must be greater than 0")
	}

	if c.Pool.MaxIdleConns < 0 {
		return errors.New("max idle connections cannot be negative")
	}

	if c.Pool.MaxIdleConns > c.Pool.MaxOpenConns {
		return errors.New("max idle connections cannot exceed max open connections")
	}

	if c.Query.DefaultLimit <= 0 {
		return errors.New("default limit must be greater than 0")
	}

	if c.Query.MaxLimit <= 0 {
		return errors.New("max limit must be greater than 0")
	}

	if c.Query.DefaultLimit > c.Query.MaxLimit {
		return errors.New("default limit cannot exceed max limit")
	}

	if c.Query.Timeout <= 0 {
		return errors.New("query timeout must be greater than 0")
	}

	if c.Cache.Enabled {
		if c.Cache.TTL <= 0 {
			return errors.New("cache TTL must be greater than 0")
		}

		if c.Cache.MaxSize <= 0 {
			return errors.New("cache max size must be greater than 0")
		}

		if c.Cache.CleanupInterval <= 0 {
			return errors.New("cache cleanup interval must be greater than 0")
		}
	}

	if c.Migration.Enabled {
		if c.Migration.Path == "" {
			return errors.New("migration path is required")
		}

		if c.Migration.Table == "" {
			return errors.New("migration table name is required")
		}

		if c.Migration.LockTimeout <= 0 {
			return errors.New("migration lock timeout must be greater than 0")
		}
	}

	return nil
}

// GetDSN returns the appropriate DSN for the database driver
func (c *Config) GetDSN() string {
	if c.Database.Driver == "sqlite" {
		return c.Database.Path
	}
	return c.Database.DSN
}

// IsSQLite returns true if the database driver is SQLite
func (c *Config) IsSQLite() bool {
	return c.Database.Driver == "sqlite"
}

// IsPostgreSQL returns true if the database driver is PostgreSQL
func (c *Config) IsPostgreSQL() bool {
	return c.Database.Driver == "postgres" || c.Database.Driver == "postgresql"
}

// IsMySQL returns true if the database driver is MySQL
func (c *Config) IsMySQL() bool {
	return c.Database.Driver == "mysql"
}
