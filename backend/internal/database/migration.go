package database

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/golang-migrate/migrate/v4"
	"github.com/golang-migrate/migrate/v4/database/sqlite3"
	"github.com/golang-migrate/migrate/v4/source/file"
	_ "github.com/mattn/go-sqlite3"
	"github.com/sirupsen/logrus"
)

// MigrationManager handles database migrations
type MigrationManager struct {
	db             *sql.DB
	migrationsPath string
	logger         *logrus.Logger
}

// NewMigrationManager creates a new migration manager
func NewMigrationManager(db *sql.DB, migrationsPath string, logger *logrus.Logger) *MigrationManager {
	return &MigrationManager{
		db:             db,
		migrationsPath: migrationsPath,
		logger:         logger,
	}
}

// MigrationInfo contains information about a migration
type MigrationInfo struct {
	Version   uint
	Dirty     bool
	Applied   bool
	Timestamp time.Time
}

// RunMigrations executes all pending migrations
func (m *MigrationManager) RunMigrations() error {
	m.logger.Info("Starting database migrations...")

	// Create backup before running migrations
	if err := m.createBackup(); err != nil {
		m.logger.WithError(err).Warn("Failed to create backup before migration")
		// Continue with migration even if backup fails
	}

	// Initialize migrate instance
	migrate, err := m.initMigrate()
	if err != nil {
		return fmt.Errorf("failed to initialize migrate: %w", err)
	}
	defer migrate.Close()

	// Get current version
	currentVersion, dirty, err := migrate.Version()
	if err != nil && err.Error() != "no migration" {
		return fmt.Errorf("failed to get current migration version: %w", err)
	}

	if dirty {
		m.logger.Warn("Database is in dirty state, attempting to force version")
		if err := migrate.Force(int(currentVersion)); err != nil {
			return fmt.Errorf("failed to force migration version: %w", err)
		}
	}

	m.logger.WithField("current_version", currentVersion).Info("Current migration version")

	// Run migrations
	if err := migrate.Up(); err != nil && err.Error() != "no change" {
		return fmt.Errorf("failed to run migrations: %w", err)
	}

	// Get new version
	newVersion, _, err := migrate.Version()
	if err != nil && err.Error() != "no migration" {
		return fmt.Errorf("failed to get new migration version: %w", err)
	}

	m.logger.WithField("new_version", newVersion).Info("Migrations completed successfully")
	return nil
}

// RollbackMigration rolls back the last migration
func (m *MigrationManager) RollbackMigration() error {
	m.logger.Info("Rolling back last migration...")

	// Create backup before rollback
	if err := m.createBackup(); err != nil {
		m.logger.WithError(err).Warn("Failed to create backup before rollback")
	}

	migrate, err := m.initMigrate()
	if err != nil {
		return fmt.Errorf("failed to initialize migrate: %w", err)
	}
	defer migrate.Close()

	// Get current version
	currentVersion, _, err := migrate.Version()
	if err != nil {
		if err.Error() == "no migration" {
			return fmt.Errorf("no migrations to rollback")
		}
		return fmt.Errorf("failed to get current migration version: %w", err)
	}

	m.logger.WithField("current_version", currentVersion).Info("Rolling back from version")

	// Rollback one step
	if err := migrate.Steps(-1); err != nil {
		return fmt.Errorf("failed to rollback migration: %w", err)
	}

	// Get new version
	newVersion, _, err := migrate.Version()
	if err != nil && err.Error() != "no migration" {
		return fmt.Errorf("failed to get new migration version: %w", err)
	}

	m.logger.WithField("new_version", newVersion).Info("Rollback completed successfully")
	return nil
}

// GetMigrationStatus returns the current migration status
func (m *MigrationManager) GetMigrationStatus() (*MigrationInfo, error) {
	migrate, err := m.initMigrate()
	if err != nil {
		return nil, fmt.Errorf("failed to initialize migrate: %w", err)
	}
	defer migrate.Close()

	version, dirty, err := migrate.Version()
	if err != nil && err.Error() != "no migration" {
		return nil, fmt.Errorf("failed to get migration version: %w", err)
	}

	info := &MigrationInfo{
		Version:   version,
		Dirty:     dirty,
		Applied:   err == nil || err.Error() != "no migration",
		Timestamp: time.Now(),
	}

	return info, nil
}

// ValidateSchema validates the database schema against expected structure
func (m *MigrationManager) ValidateSchema() error {
	m.logger.Info("Validating database schema...")

	// List of expected tables (removed FTS tables)
	expectedTables := []string{
		"customers",
		"products",
		"product_categories",
		"receipts",
		"line_items",
		"seller_profile",
		"email_audit",
	}

	// Check if all expected tables exist
	for _, table := range expectedTables {
		var count int
		query := `SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?`
		if err := m.db.QueryRow(query, table).Scan(&count); err != nil {
			return fmt.Errorf("failed to check table %s: %w", table, err)
		}
		if count == 0 {
			return fmt.Errorf("expected table %s not found", table)
		}
	}

	// Validate foreign key constraints are enabled
	var fkEnabled int
	if err := m.db.QueryRow("PRAGMA foreign_keys").Scan(&fkEnabled); err != nil {
		return fmt.Errorf("failed to check foreign key status: %w", err)
	}
	if fkEnabled != 1 {
		m.logger.Warn("Foreign keys are not enabled")
	}

	m.logger.Info("Schema validation completed successfully")
	return nil
}

// initMigrate initializes the migrate instance
func (m *MigrationManager) initMigrate() (*migrate.Migrate, error) {
	// Create file source
	sourceURL := fmt.Sprintf("file://%s", m.migrationsPath)
	source, err := (&file.File{}).Open(sourceURL)
	if err != nil {
		return nil, fmt.Errorf("failed to open migration source: %w", err)
	}

	// Create database driver
	driver, err := sqlite3.WithInstance(m.db, &sqlite3.Config{})
	if err != nil {
		return nil, fmt.Errorf("failed to create database driver: %w", err)
	}

	// Create migrate instance
	migrate, err := migrate.NewWithInstance("file", source, "sqlite3", driver)
	if err != nil {
		return nil, fmt.Errorf("failed to create migrate instance: %w", err)
	}

	return migrate, nil
}

// createBackup creates a backup of the database before migrations
func (m *MigrationManager) createBackup() error {
	// Get database file path from connection
	rows, err := m.db.Query("PRAGMA database_list")
	if err != nil {
		return fmt.Errorf("failed to query database list: %w", err)
	}
	defer rows.Close()

	var seq int
	var name, dbPath string
	if !rows.Next() {
		return fmt.Errorf("no database found")
	}
	if err := rows.Scan(&seq, &name, &dbPath); err != nil {
		return fmt.Errorf("failed to scan database path: %w", err)
	}

	if dbPath == "" || dbPath == ":memory:" {
		m.logger.Info("Skipping backup for in-memory database")
		return nil
	}

	// Create backup filename with timestamp
	timestamp := time.Now().Format("20060102_150405")
	backupPath := fmt.Sprintf("%s.backup_%s", dbPath, timestamp)

	// Create backup directory if it doesn't exist
	backupDir := filepath.Dir(backupPath)
	if err := os.MkdirAll(backupDir, 0755); err != nil {
		return fmt.Errorf("failed to create backup directory: %w", err)
	}

	// Copy database file
	if err := m.copyFile(dbPath, backupPath); err != nil {
		return fmt.Errorf("failed to create backup: %w", err)
	}

	m.logger.WithField("backup_path", backupPath).Info("Database backup created")
	return nil
}

// copyFile copies a file from src to dst
func (m *MigrationManager) copyFile(src, dst string) error {
	sourceFile, err := os.Open(src)
	if err != nil {
		return err
	}
	defer sourceFile.Close()

	destFile, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer destFile.Close()

	_, err = destFile.ReadFrom(sourceFile)
	return err
}

// InitializeDatabase initializes the database and runs migrations
func InitializeDatabase(dbPath, migrationsPath string, logger *logrus.Logger) (*sql.DB, error) {
	logger.WithField("db_path", dbPath).Info("Initializing database")

	// Ensure database directory exists
	dbDir := filepath.Dir(dbPath)
	if err := os.MkdirAll(dbDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create database directory: %w", err)
	}

	// Open database connection
	db, err := sql.Open("sqlite3", dbPath+"?_foreign_keys=on&_journal_mode=WAL")
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	// Test connection
	if err := db.Ping(); err != nil {
		db.Close()
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	// Configure connection pool
	db.SetMaxOpenConns(1) // SQLite works best with single connection
	db.SetMaxIdleConns(1)
	db.SetConnMaxLifetime(time.Hour)

	// Run simple migration
	if err := runSimpleMigration(db, migrationsPath, logger); err != nil {
		db.Close()
		return nil, fmt.Errorf("failed to run migrations: %w", err)
	}

	logger.Info("Database initialized successfully")
	return db, nil
}

// runSimpleMigration runs a simple migration without external libraries
func runSimpleMigration(db *sql.DB, migrationsPath string, logger *logrus.Logger) error {
	// Check if schema_migrations table exists
	var count int
	err := db.QueryRow("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='schema_migrations'").Scan(&count)
	if err != nil {
		return fmt.Errorf("failed to check schema_migrations table: %w", err)
	}

	// Create schema_migrations table if it doesn't exist
	if count == 0 {
		_, err := db.Exec(`CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at DATETIME DEFAULT CURRENT_TIMESTAMP)`)
		if err != nil {
			return fmt.Errorf("failed to create schema_migrations table: %w", err)
		}
	}

	// Check if migration has been applied
	err = db.QueryRow("SELECT COUNT(*) FROM schema_migrations WHERE version = 1").Scan(&count)
	if err != nil {
		return fmt.Errorf("failed to check migration status: %w", err)
	}

	if count > 0 {
		logger.Info("Migration already applied")
		return nil
	}

	// Read and execute migration file
	migrationFile := filepath.Join(migrationsPath, "001_initial_schema.up.sql")
	content, err := os.ReadFile(migrationFile)
	if err != nil {
		return fmt.Errorf("failed to read migration file: %w", err)
	}

	// Execute migration
	_, err = db.Exec(string(content))
	if err != nil {
		return fmt.Errorf("failed to execute migration: %w", err)
	}

	// Record migration
	_, err = db.Exec("INSERT INTO schema_migrations (version) VALUES (1)")
	if err != nil {
		return fmt.Errorf("failed to record migration: %w", err)
	}

	logger.Info("Migration applied successfully")
	return nil
}
