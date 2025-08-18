package database

import (
	"context"
	"database/sql"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"bakery-invoice-api/internal/repositories"

	"github.com/sirupsen/logrus"
)

// MigrationRunner handles database migrations
type MigrationRunner struct {
	db     *sql.DB
	config *repositories.Config
	logger *logrus.Logger
}

// NewMigrationRunner creates a new migration runner
func NewMigrationRunner(db *sql.DB, config *repositories.Config, logger *logrus.Logger) *MigrationRunner {
	if logger == nil {
		logger = logrus.New()
	}

	return &MigrationRunner{
		db:     db,
		config: config,
		logger: logger,
	}
}

// Migration represents a database migration
type Migration struct {
	Version   string
	Name      string
	UpSQL     string
	DownSQL   string
	Applied   bool
	AppliedAt *time.Time
}

// RunMigrations runs all pending migrations
func (r *MigrationRunner) RunMigrations(ctx context.Context) error {
	if !r.config.Migration.Enabled {
		r.logger.Info("Migrations are disabled")
		return nil
	}

	r.logger.Info("Running database migrations...")

	// Ensure migration table exists
	if err := r.ensureMigrationTable(ctx); err != nil {
		return fmt.Errorf("failed to ensure migration table: %w", err)
	}

	// Load migrations from filesystem
	migrations, err := r.loadMigrations()
	if err != nil {
		return fmt.Errorf("failed to load migrations: %w", err)
	}

	if len(migrations) == 0 {
		r.logger.Info("No migrations found")
		return nil
	}

	// Get applied migrations
	appliedMigrations, err := r.getAppliedMigrations(ctx)
	if err != nil {
		return fmt.Errorf("failed to get applied migrations: %w", err)
	}

	// Mark applied migrations
	for i := range migrations {
		if appliedTime, exists := appliedMigrations[migrations[i].Version]; exists {
			migrations[i].Applied = true
			migrations[i].AppliedAt = &appliedTime
		}
	}

	// Create backup if configured
	if r.config.Migration.BackupBeforeMigration {
		if err := r.createBackupBeforeMigration(ctx); err != nil {
			r.logger.WithError(err).Warn("Failed to create backup before migration")
		}
	}

	// Run pending migrations
	pendingCount := 0
	for _, migration := range migrations {
		if !migration.Applied {
			if err := r.runMigration(ctx, migration); err != nil {
				return fmt.Errorf("failed to run migration %s: %w", migration.Version, err)
			}
			pendingCount++
		}
	}

	if pendingCount > 0 {
		r.logger.WithField("count", pendingCount).Info("Successfully applied migrations")
	} else {
		r.logger.Info("No pending migrations")
	}

	return nil
}

// GetStatus returns the status of all migrations
func (r *MigrationRunner) GetStatus(ctx context.Context) ([]repositories.MigrationStatus, error) {
	// Load migrations from filesystem
	migrations, err := r.loadMigrations()
	if err != nil {
		return nil, fmt.Errorf("failed to load migrations: %w", err)
	}

	// Get applied migrations
	appliedMigrations, err := r.getAppliedMigrations(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get applied migrations: %w", err)
	}

	// Build status list
	var status []repositories.MigrationStatus
	for _, migration := range migrations {
		migrationStatus := repositories.MigrationStatus{
			Version: migration.Version,
			Name:    migration.Name,
			Applied: false,
		}

		if appliedTime, exists := appliedMigrations[migration.Version]; exists {
			migrationStatus.Applied = true
			migrationStatus.AppliedAt = &appliedTime
		}

		status = append(status, migrationStatus)
	}

	return status, nil
}

// ensureMigrationTable creates the migration table if it doesn't exist
func (r *MigrationRunner) ensureMigrationTable(ctx context.Context) error {
	tableName := r.config.Migration.Table
	if tableName == "" {
		tableName = "schema_migrations"
	}

	query := fmt.Sprintf(`
		CREATE TABLE IF NOT EXISTS %s (
			version TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		)
	`, tableName)

	_, err := r.db.ExecContext(ctx, query)
	if err != nil {
		return fmt.Errorf("failed to create migration table: %w", err)
	}

	return nil
}

// loadMigrations loads migrations from the filesystem
func (r *MigrationRunner) loadMigrations() ([]Migration, error) {
	migrationPath := r.config.Migration.Path
	if migrationPath == "" {
		migrationPath = "migrations"
	}

	// Check if migration directory exists
	if _, err := os.Stat(migrationPath); os.IsNotExist(err) {
		r.logger.WithField("path", migrationPath).Warn("Migration directory does not exist")
		return []Migration{}, nil
	}

	var migrations []Migration

	err := filepath.WalkDir(migrationPath, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}

		if d.IsDir() {
			return nil
		}

		// Only process .sql files
		if !strings.HasSuffix(path, ".sql") {
			return nil
		}

		// Parse migration filename (e.g., "001_create_users.up.sql" or "001_create_users.down.sql")
		filename := d.Name()
		if !strings.Contains(filename, ".up.sql") && !strings.Contains(filename, ".down.sql") {
			return nil
		}

		// Extract version and name
		parts := strings.Split(filename, "_")
		if len(parts) < 2 {
			r.logger.WithField("filename", filename).Warn("Invalid migration filename format")
			return nil
		}

		version := parts[0]
		nameWithSuffix := strings.Join(parts[1:], "_")

		var name string
		var isUp bool

		if strings.HasSuffix(nameWithSuffix, ".up.sql") {
			name = strings.TrimSuffix(nameWithSuffix, ".up.sql")
			isUp = true
		} else if strings.HasSuffix(nameWithSuffix, ".down.sql") {
			name = strings.TrimSuffix(nameWithSuffix, ".down.sql")
			isUp = false
		} else {
			return nil
		}

		// Read file content
		content, err := os.ReadFile(path)
		if err != nil {
			return fmt.Errorf("failed to read migration file %s: %w", path, err)
		}

		// Find or create migration
		var migration *Migration
		for i := range migrations {
			if migrations[i].Version == version && migrations[i].Name == name {
				migration = &migrations[i]
				break
			}
		}

		if migration == nil {
			migrations = append(migrations, Migration{
				Version: version,
				Name:    name,
			})
			migration = &migrations[len(migrations)-1]
		}

		// Set SQL content
		if isUp {
			migration.UpSQL = string(content)
		} else {
			migration.DownSQL = string(content)
		}

		return nil
	})

	if err != nil {
		return nil, fmt.Errorf("failed to walk migration directory: %w", err)
	}

	// Sort migrations by version
	sort.Slice(migrations, func(i, j int) bool {
		return migrations[i].Version < migrations[j].Version
	})

	r.logger.WithField("count", len(migrations)).Info("Loaded migrations")
	return migrations, nil
}

// getAppliedMigrations returns a map of applied migration versions to their applied times
func (r *MigrationRunner) getAppliedMigrations(ctx context.Context) (map[string]time.Time, error) {
	tableName := r.config.Migration.Table
	if tableName == "" {
		tableName = "schema_migrations"
	}

	query := fmt.Sprintf("SELECT version, applied_at FROM %s", tableName)
	rows, err := r.db.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to query applied migrations: %w", err)
	}
	defer rows.Close()

	appliedMigrations := make(map[string]time.Time)
	for rows.Next() {
		var version string
		var appliedAt time.Time

		if err := rows.Scan(&version, &appliedAt); err != nil {
			return nil, fmt.Errorf("failed to scan migration row: %w", err)
		}

		appliedMigrations[version] = appliedAt
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating migration rows: %w", err)
	}

	return appliedMigrations, nil
}

// runMigration runs a single migration
func (r *MigrationRunner) runMigration(ctx context.Context, migration Migration) error {
	if migration.UpSQL == "" {
		return fmt.Errorf("migration %s has no up SQL", migration.Version)
	}

	r.logger.WithFields(logrus.Fields{
		"version": migration.Version,
		"name":    migration.Name,
	}).Info("Running migration")

	// Start transaction
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}

	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
			panic(r)
		}
	}()

	// Execute migration SQL
	if _, err := tx.ExecContext(ctx, migration.UpSQL); err != nil {
		tx.Rollback()
		return fmt.Errorf("failed to execute migration SQL: %w", err)
	}

	// Record migration as applied
	tableName := r.config.Migration.Table
	if tableName == "" {
		tableName = "schema_migrations"
	}

	insertQuery := fmt.Sprintf(
		"INSERT INTO %s (version, name, applied_at) VALUES (?, ?, ?)",
		tableName,
	)

	if _, err := tx.ExecContext(ctx, insertQuery, migration.Version, migration.Name, time.Now()); err != nil {
		tx.Rollback()
		return fmt.Errorf("failed to record migration: %w", err)
	}

	// Commit transaction
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("failed to commit migration transaction: %w", err)
	}

	r.logger.WithFields(logrus.Fields{
		"version": migration.Version,
		"name":    migration.Name,
	}).Info("Migration completed successfully")

	return nil
}

// createBackupBeforeMigration creates a backup before running migrations
func (r *MigrationRunner) createBackupBeforeMigration(ctx context.Context) error {
	if !r.config.IsSQLite() {
		r.logger.Info("Backup before migration is only supported for SQLite")
		return nil
	}

	// Generate backup filename with timestamp
	timestamp := time.Now().Format("20060102_150405")
	backupPath := fmt.Sprintf("%s.backup_%s", r.config.Database.Path, timestamp)

	r.logger.WithField("backup_path", backupPath).Info("Creating backup before migration")

	// Use SQLite VACUUM INTO command for backup
	query := fmt.Sprintf("VACUUM INTO '%s'", backupPath)
	_, err := r.db.ExecContext(ctx, query)
	if err != nil {
		return fmt.Errorf("failed to create backup: %w", err)
	}

	r.logger.WithField("backup_path", backupPath).Info("Backup created successfully")
	return nil
}

// RollbackMigration rolls back a specific migration (if down SQL is available)
func (r *MigrationRunner) RollbackMigration(ctx context.Context, version string) error {
	// Load migrations to find the one to rollback
	migrations, err := r.loadMigrations()
	if err != nil {
		return fmt.Errorf("failed to load migrations: %w", err)
	}

	var targetMigration *Migration
	for i := range migrations {
		if migrations[i].Version == version {
			targetMigration = &migrations[i]
			break
		}
	}

	if targetMigration == nil {
		return fmt.Errorf("migration %s not found", version)
	}

	if targetMigration.DownSQL == "" {
		return fmt.Errorf("migration %s has no down SQL", version)
	}

	// Check if migration is applied
	appliedMigrations, err := r.getAppliedMigrations(ctx)
	if err != nil {
		return fmt.Errorf("failed to get applied migrations: %w", err)
	}

	if _, exists := appliedMigrations[version]; !exists {
		return fmt.Errorf("migration %s is not applied", version)
	}

	r.logger.WithFields(logrus.Fields{
		"version": targetMigration.Version,
		"name":    targetMigration.Name,
	}).Info("Rolling back migration")

	// Start transaction
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}

	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
			panic(r)
		}
	}()

	// Execute rollback SQL
	if _, err := tx.ExecContext(ctx, targetMigration.DownSQL); err != nil {
		tx.Rollback()
		return fmt.Errorf("failed to execute rollback SQL: %w", err)
	}

	// Remove migration record
	tableName := r.config.Migration.Table
	if tableName == "" {
		tableName = "schema_migrations"
	}

	deleteQuery := fmt.Sprintf("DELETE FROM %s WHERE version = ?", tableName)
	if _, err := tx.ExecContext(ctx, deleteQuery, version); err != nil {
		tx.Rollback()
		return fmt.Errorf("failed to remove migration record: %w", err)
	}

	// Commit transaction
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("failed to commit rollback transaction: %w", err)
	}

	r.logger.WithFields(logrus.Fields{
		"version": targetMigration.Version,
		"name":    targetMigration.Name,
	}).Info("Migration rolled back successfully")

	return nil
}
