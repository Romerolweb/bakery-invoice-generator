package database

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"

	"bakery-invoice-api/internal/repositories"

	"github.com/sirupsen/logrus"
)

func TestManager_ConnectDisconnect(t *testing.T) {
	// Create temporary directory for test database
	tempDir, err := os.MkdirTemp("", "manager_test_*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	logger := logrus.New()
	logger.SetLevel(logrus.WarnLevel)

	config := &repositories.Config{
		Database: repositories.DatabaseConfig{
			Driver: "sqlite",
			Path:   filepath.Join(tempDir, "manager.db"),
		},
		Pool: repositories.PoolConfig{
			MaxOpenConns:    1,
			MaxIdleConns:    1,
			ConnMaxLifetime: time.Hour,
		},
		Query: repositories.QueryConfig{
			DefaultLimit: 50,
			MaxLimit:     1000,
			Timeout:      time.Second * 30,
		},
		Migration: repositories.MigrationConfig{
			Enabled: false, // Disable migrations for this test
		},
	}

	manager := NewManager(config, logger)

	// Test initial state
	if manager.IsConnected() {
		t.Error("Manager should not be connected initially")
	}

	if manager.GetDB() != nil {
		t.Error("GetDB() should return nil when not connected")
	}

	// Test connect
	ctx := context.Background()
	err = manager.Connect(ctx)
	if err != nil {
		t.Errorf("Connect() failed: %v", err)
	}

	if !manager.IsConnected() {
		t.Error("Manager should be connected after Connect()")
	}

	if manager.GetDB() == nil {
		t.Error("GetDB() should not return nil when connected")
	}

	// Test double connect (should fail)
	err = manager.Connect(ctx)
	if err == nil {
		t.Error("Connect() should fail when already connected")
	}

	// Test health check
	err = manager.CheckHealth(ctx)
	if err != nil {
		t.Errorf("CheckHealth() failed: %v", err)
	}

	status := manager.GetHealthStatus(ctx)
	if !status.Healthy {
		t.Errorf("Health status should be healthy, got: %s", status.Message)
	}

	// Test stats
	stats := manager.GetStats()
	if stats.MaxOpenConnections != config.Pool.MaxOpenConns {
		t.Errorf("MaxOpenConnections = %d, want %d",
			stats.MaxOpenConnections, config.Pool.MaxOpenConns)
	}

	// Test disconnect
	err = manager.Disconnect()
	if err != nil {
		t.Errorf("Disconnect() failed: %v", err)
	}

	if manager.IsConnected() {
		t.Error("Manager should not be connected after Disconnect()")
	}

	if manager.GetDB() != nil {
		t.Error("GetDB() should return nil after disconnect")
	}

	// Test double disconnect (should not fail)
	err = manager.Disconnect()
	if err != nil {
		t.Errorf("Double disconnect should not fail: %v", err)
	}
}

func TestManager_WithTransaction(t *testing.T) {
	// Create temporary directory for test database
	tempDir, err := os.MkdirTemp("", "transaction_test_*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	logger := logrus.New()
	logger.SetLevel(logrus.WarnLevel)

	config := &repositories.Config{
		Database: repositories.DatabaseConfig{
			Driver: "sqlite",
			Path:   filepath.Join(tempDir, "transaction.db"),
		},
		Pool: repositories.PoolConfig{
			MaxOpenConns: 1,
			MaxIdleConns: 1,
		},
		Query: repositories.QueryConfig{
			DefaultLimit: 50,
			MaxLimit:     1000,
			Timeout:      time.Second * 30,
		},
		Migration: repositories.MigrationConfig{
			Enabled: false,
		},
	}

	manager := NewManager(config, logger)
	ctx := context.Background()

	err = manager.Connect(ctx)
	if err != nil {
		t.Fatalf("Connect() failed: %v", err)
	}
	defer manager.Disconnect()

	// Create a test table
	_, err = manager.GetDB().ExecContext(ctx, `
		CREATE TABLE test_table (
			id INTEGER PRIMARY KEY,
			value TEXT
		)
	`)
	if err != nil {
		t.Fatalf("Failed to create test table: %v", err)
	}

	// Test successful transaction
	err = manager.WithTransaction(ctx, func(tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, "INSERT INTO test_table (value) VALUES (?)", "test1")
		if err != nil {
			return err
		}

		_, err = tx.ExecContext(ctx, "INSERT INTO test_table (value) VALUES (?)", "test2")
		return err
	})

	if err != nil {
		t.Errorf("WithTransaction() failed: %v", err)
	}

	// Verify data was committed
	var count int
	err = manager.GetDB().QueryRowContext(ctx, "SELECT COUNT(*) FROM test_table").Scan(&count)
	if err != nil {
		t.Errorf("Failed to count rows: %v", err)
	}

	if count != 2 {
		t.Errorf("Expected 2 rows, got %d", count)
	}

	// Test failed transaction (should rollback)
	err = manager.WithTransaction(ctx, func(tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, "INSERT INTO test_table (value) VALUES (?)", "test3")
		if err != nil {
			return err
		}

		// Force an error
		return fmt.Errorf("forced error")
	})

	if err == nil {
		t.Error("WithTransaction() should have failed")
	}

	// Verify data was rolled back (should still be 2 rows)
	err = manager.GetDB().QueryRowContext(ctx, "SELECT COUNT(*) FROM test_table").Scan(&count)
	if err != nil {
		t.Errorf("Failed to count rows after rollback: %v", err)
	}

	if count != 2 {
		t.Errorf("Expected 2 rows after rollback, got %d", count)
	}
}

func TestManager_Reconnect(t *testing.T) {
	// Create temporary directory for test database
	tempDir, err := os.MkdirTemp("", "reconnect_test_*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	logger := logrus.New()
	logger.SetLevel(logrus.WarnLevel)

	config := &repositories.Config{
		Database: repositories.DatabaseConfig{
			Driver: "sqlite",
			Path:   filepath.Join(tempDir, "reconnect.db"),
		},
		Pool: repositories.PoolConfig{
			MaxOpenConns: 1,
			MaxIdleConns: 1,
		},
		Query: repositories.QueryConfig{
			DefaultLimit: 50,
			MaxLimit:     1000,
			Timeout:      time.Second * 30,
		},
		Migration: repositories.MigrationConfig{
			Enabled: false,
		},
	}

	manager := NewManager(config, logger)
	ctx := context.Background()

	// Initial connect
	err = manager.Connect(ctx)
	if err != nil {
		t.Fatalf("Initial connect failed: %v", err)
	}

	if !manager.IsConnected() {
		t.Error("Manager should be connected")
	}

	// Test reconnect
	err = manager.Reconnect(ctx)
	if err != nil {
		t.Errorf("Reconnect() failed: %v", err)
	}

	if !manager.IsConnected() {
		t.Error("Manager should be connected after reconnect")
	}

	// Test functionality after reconnect
	err = manager.CheckHealth(ctx)
	if err != nil {
		t.Errorf("Health check failed after reconnect: %v", err)
	}

	manager.Disconnect()
}

func TestManager_CreateBackup(t *testing.T) {
	// Create temporary directory for test database
	tempDir, err := os.MkdirTemp("", "backup_test_*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	logger := logrus.New()
	logger.SetLevel(logrus.WarnLevel)

	config := &repositories.Config{
		Database: repositories.DatabaseConfig{
			Driver: "sqlite",
			Path:   filepath.Join(tempDir, "backup.db"),
		},
		Pool: repositories.PoolConfig{
			MaxOpenConns: 1,
			MaxIdleConns: 1,
		},
		Query: repositories.QueryConfig{
			DefaultLimit: 50,
			MaxLimit:     1000,
			Timeout:      time.Second * 30,
		},
		Migration: repositories.MigrationConfig{
			Enabled: false,
		},
	}

	manager := NewManager(config, logger)
	ctx := context.Background()

	err = manager.Connect(ctx)
	if err != nil {
		t.Fatalf("Connect() failed: %v", err)
	}
	defer manager.Disconnect()

	// Create some test data
	_, err = manager.GetDB().ExecContext(ctx, `
		CREATE TABLE test_backup (
			id INTEGER PRIMARY KEY,
			data TEXT
		)
	`)
	if err != nil {
		t.Fatalf("Failed to create test table: %v", err)
	}

	_, err = manager.GetDB().ExecContext(ctx,
		"INSERT INTO test_backup (data) VALUES (?)", "test data")
	if err != nil {
		t.Fatalf("Failed to insert test data: %v", err)
	}

	// Create backup
	backupPath := filepath.Join(tempDir, "backup_copy.db")
	err = manager.CreateBackup(ctx, backupPath)
	if err != nil {
		t.Errorf("CreateBackup() failed: %v", err)
	}

	// Verify backup file exists
	if _, err := os.Stat(backupPath); os.IsNotExist(err) {
		t.Error("Backup file was not created")
	}

	// TODO: Could verify backup content by opening it as a separate database
}

func TestManager_HealthCheckMonitor(t *testing.T) {
	// Create temporary directory for test database
	tempDir, err := os.MkdirTemp("", "monitor_test_*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	logger := logrus.New()
	logger.SetLevel(logrus.WarnLevel)

	config := &repositories.Config{
		Database: repositories.DatabaseConfig{
			Driver: "sqlite",
			Path:   filepath.Join(tempDir, "monitor.db"),
		},
		Pool: repositories.PoolConfig{
			MaxOpenConns: 1,
			MaxIdleConns: 1,
		},
		Query: repositories.QueryConfig{
			DefaultLimit: 50,
			MaxLimit:     1000,
			Timeout:      time.Second * 30,
		},
		Migration: repositories.MigrationConfig{
			Enabled: false,
		},
	}

	manager := NewManager(config, logger)
	ctx, cancel := context.WithTimeout(context.Background(), time.Second*2)
	defer cancel()

	err = manager.Connect(ctx)
	if err != nil {
		t.Fatalf("Connect() failed: %v", err)
	}
	defer manager.Disconnect()

	// Start health check monitor with short interval
	manager.StartHealthCheckMonitor(ctx, time.Millisecond*100)

	// Wait for a few health checks to run
	time.Sleep(time.Millisecond * 300)

	// The test passes if no panics occur and the context cancellation works
}

func TestManager_StatsLogger(t *testing.T) {
	// Create temporary directory for test database
	tempDir, err := os.MkdirTemp("", "stats_test_*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	logger := logrus.New()
	logger.SetLevel(logrus.WarnLevel)

	config := &repositories.Config{
		Database: repositories.DatabaseConfig{
			Driver: "sqlite",
			Path:   filepath.Join(tempDir, "stats.db"),
		},
		Pool: repositories.PoolConfig{
			MaxOpenConns: 1,
			MaxIdleConns: 1,
		},
		Query: repositories.QueryConfig{
			DefaultLimit: 50,
			MaxLimit:     1000,
			Timeout:      time.Second * 30,
		},
		Migration: repositories.MigrationConfig{
			Enabled: false,
		},
	}

	manager := NewManager(config, logger)
	ctx, cancel := context.WithTimeout(context.Background(), time.Second*2)
	defer cancel()

	err = manager.Connect(ctx)
	if err != nil {
		t.Fatalf("Connect() failed: %v", err)
	}
	defer manager.Disconnect()

	// Start stats logger with short interval
	manager.StartStatsLogger(ctx, time.Millisecond*100)

	// Wait for a few stats logs
	time.Sleep(time.Millisecond * 300)

	// The test passes if no panics occur and the context cancellation works
}
