package database

import (
	"context"
	"database/sql"
	"fmt"
	"sync"
	"time"

	"bakery-invoice-api/internal/repositories"

	"github.com/sirupsen/logrus"
)

// Manager provides comprehensive database connection management
type Manager struct {
	mu              sync.RWMutex
	config          *repositories.Config
	logger          *logrus.Logger
	factory         *ConnectionFactory
	pool            *ConnectionPool
	migrationRunner *MigrationRunner
	isConnected     bool
	lastHealthCheck time.Time
	healthStatus    *repositories.HealthStatus
}

// NewManager creates a new database manager
func NewManager(config *repositories.Config, logger *logrus.Logger) *Manager {
	if logger == nil {
		logger = logrus.New()
	}

	return &Manager{
		config:  config,
		logger:  logger,
		factory: NewConnectionFactory(logger),
	}
}

// Connect establishes a database connection and initializes the system
func (m *Manager) Connect(ctx context.Context) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.isConnected {
		return fmt.Errorf("database already connected")
	}

	m.logger.Info("Connecting to database...")

	// Create database connection
	db, err := m.factory.CreateConnection(ctx, m.config)
	if err != nil {
		return fmt.Errorf("failed to create database connection: %w", err)
	}

	// Create connection pool
	m.pool = NewConnectionPool(db, m.config, m.logger)

	// Warm up the connection pool
	if err := m.pool.WarmUp(ctx); err != nil {
		m.pool.Close()
		return fmt.Errorf("failed to warm up connection pool: %w", err)
	}

	// Initialize migration runner if migrations are enabled
	if m.config.Migration.Enabled {
		m.migrationRunner = NewMigrationRunner(db, m.config, m.logger)

		// Run migrations if enabled
		if err := m.migrationRunner.RunMigrations(ctx); err != nil {
			m.pool.Close()
			return fmt.Errorf("failed to run migrations: %w", err)
		}
	}

	// Perform initial health check
	if err := m.pool.CheckHealth(ctx); err != nil {
		m.pool.Close()
		return fmt.Errorf("initial health check failed: %w", err)
	}

	m.isConnected = true
	m.lastHealthCheck = time.Now()
	m.logger.Info("Database connection established successfully")

	return nil
}

// Disconnect closes the database connection
func (m *Manager) Disconnect() error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if !m.isConnected {
		return nil
	}

	m.logger.Info("Disconnecting from database...")

	var err error
	if m.pool != nil {
		err = m.pool.Close()
		m.pool = nil
	}

	m.isConnected = false
	m.migrationRunner = nil
	m.healthStatus = nil

	if err != nil {
		m.logger.WithError(err).Error("Error during database disconnection")
		return fmt.Errorf("failed to disconnect from database: %w", err)
	}

	m.logger.Info("Database disconnected successfully")
	return nil
}

// GetDB returns the database connection
func (m *Manager) GetDB() *sql.DB {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if !m.isConnected || m.pool == nil {
		return nil
	}

	return m.pool.GetDB()
}

// GetPool returns the connection pool
func (m *Manager) GetPool() *ConnectionPool {
	m.mu.RLock()
	defer m.mu.RUnlock()

	return m.pool
}

// IsConnected returns true if the database is connected
func (m *Manager) IsConnected() bool {
	m.mu.RLock()
	defer m.mu.RUnlock()

	return m.isConnected
}

// CheckHealth performs a health check on the database connection
func (m *Manager) CheckHealth(ctx context.Context) error {
	m.mu.RLock()
	pool := m.pool
	m.mu.RUnlock()

	if pool == nil {
		return fmt.Errorf("database not connected")
	}

	err := pool.CheckHealth(ctx)

	m.mu.Lock()
	m.lastHealthCheck = time.Now()
	if err != nil {
		m.healthStatus = &repositories.HealthStatus{
			Healthy:      false,
			Message:      err.Error(),
			CheckedAt:    m.lastHealthCheck,
			ResponseTime: 0,
		}
	} else {
		m.healthStatus = pool.GetHealthStatus(ctx)
	}
	m.mu.Unlock()

	return err
}

// GetHealthStatus returns the current health status
func (m *Manager) GetHealthStatus(ctx context.Context) *repositories.HealthStatus {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if m.pool == nil {
		return &repositories.HealthStatus{
			Healthy:   false,
			Message:   "Database not connected",
			CheckedAt: time.Now(),
		}
	}

	// Return cached status if recent
	if m.healthStatus != nil && time.Since(m.lastHealthCheck) < time.Minute {
		return m.healthStatus
	}

	// Perform fresh health check
	go func() {
		m.CheckHealth(ctx)
	}()

	if m.healthStatus != nil {
		return m.healthStatus
	}

	return &repositories.HealthStatus{
		Healthy:   false,
		Message:   "Health status unknown",
		CheckedAt: time.Now(),
	}
}

// GetStats returns connection pool statistics
func (m *Manager) GetStats() sql.DBStats {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if m.pool == nil {
		return sql.DBStats{}
	}

	return m.pool.GetStats()
}

// LogStats logs current connection pool statistics
func (m *Manager) LogStats() {
	m.mu.RLock()
	pool := m.pool
	m.mu.RUnlock()

	if pool != nil {
		pool.LogStats()
	}
}

// RunMigrations runs database migrations
func (m *Manager) RunMigrations(ctx context.Context) error {
	m.mu.RLock()
	runner := m.migrationRunner
	m.mu.RUnlock()

	if runner == nil {
		return fmt.Errorf("migration runner not initialized")
	}

	return runner.RunMigrations(ctx)
}

// GetMigrationStatus returns the current migration status
func (m *Manager) GetMigrationStatus(ctx context.Context) ([]repositories.MigrationStatus, error) {
	m.mu.RLock()
	runner := m.migrationRunner
	m.mu.RUnlock()

	if runner == nil {
		return nil, fmt.Errorf("migration runner not initialized")
	}

	return runner.GetStatus(ctx)
}

// CreateBackup creates a database backup
func (m *Manager) CreateBackup(ctx context.Context, backupPath string) error {
	m.mu.RLock()
	db := m.GetDB()
	config := m.config
	m.mu.RUnlock()

	if db == nil {
		return fmt.Errorf("database not connected")
	}

	if !config.IsSQLite() {
		return fmt.Errorf("backup is currently only supported for SQLite databases")
	}

	return m.createSQLiteBackup(ctx, db, backupPath)
}

// createSQLiteBackup creates a SQLite database backup
func (m *Manager) createSQLiteBackup(ctx context.Context, db *sql.DB, backupPath string) error {
	m.logger.WithField("backup_path", backupPath).Info("Creating SQLite backup")

	// Use SQLite VACUUM INTO command for backup
	query := fmt.Sprintf("VACUUM INTO '%s'", backupPath)
	_, err := db.ExecContext(ctx, query)
	if err != nil {
		return fmt.Errorf("failed to create SQLite backup: %w", err)
	}

	m.logger.WithField("backup_path", backupPath).Info("SQLite backup created successfully")
	return nil
}

// StartHealthCheckMonitor starts a background health check monitor
func (m *Manager) StartHealthCheckMonitor(ctx context.Context, interval time.Duration) {
	if interval <= 0 {
		interval = time.Minute * 5 // Default 5 minutes
	}

	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()

		for {
			select {
			case <-ctx.Done():
				m.logger.Info("Health check monitor stopped")
				return
			case <-ticker.C:
				if err := m.CheckHealth(ctx); err != nil {
					m.logger.WithError(err).Warn("Health check failed")
				} else {
					m.logger.Debug("Health check passed")
				}
			}
		}
	}()

	m.logger.WithField("interval", interval).Info("Health check monitor started")
}

// StartStatsLogger starts a background statistics logger
func (m *Manager) StartStatsLogger(ctx context.Context, interval time.Duration) {
	if interval <= 0 {
		interval = time.Minute * 10 // Default 10 minutes
	}

	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()

		for {
			select {
			case <-ctx.Done():
				m.logger.Info("Stats logger stopped")
				return
			case <-ticker.C:
				m.LogStats()
			}
		}
	}()

	m.logger.WithField("interval", interval).Info("Stats logger started")
}

// Reconnect attempts to reconnect to the database
func (m *Manager) Reconnect(ctx context.Context) error {
	m.logger.Info("Attempting to reconnect to database")

	// Disconnect first
	if err := m.Disconnect(); err != nil {
		m.logger.WithError(err).Warn("Error during disconnect before reconnect")
	}

	// Wait a moment before reconnecting
	time.Sleep(time.Second)

	// Reconnect
	return m.Connect(ctx)
}

// WithTransaction executes a function within a database transaction
func (m *Manager) WithTransaction(ctx context.Context, fn func(tx *sql.Tx) error) error {
	db := m.GetDB()
	if db == nil {
		return fmt.Errorf("database not connected")
	}

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}

	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
			panic(r)
		}
	}()

	if err := fn(tx); err != nil {
		if rollbackErr := tx.Rollback(); rollbackErr != nil {
			m.logger.WithError(rollbackErr).Error("Failed to rollback transaction")
		}
		return err
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("failed to commit transaction: %w", err)
	}

	return nil
}

// Close closes the database manager
func (m *Manager) Close() error {
	return m.Disconnect()
}
