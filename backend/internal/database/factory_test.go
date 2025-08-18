package database

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

	"bakery-invoice-api/internal/repositories"

	"github.com/sirupsen/logrus"
)

func TestConnectionFactory_CreateSQLiteConnection(t *testing.T) {
	// Create temporary directory for test database
	tempDir, err := os.MkdirTemp("", "db_test_*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	logger := logrus.New()
	logger.SetLevel(logrus.WarnLevel) // Reduce noise in tests

	factory := NewConnectionFactory(logger)

	tests := []struct {
		name    string
		config  *repositories.Config
		wantErr bool
	}{
		{
			name: "valid SQLite config",
			config: &repositories.Config{
				Database: repositories.DatabaseConfig{
					Driver:      "sqlite",
					Path:        filepath.Join(tempDir, "test.db"),
					WALMode:     true,
					ForeignKeys: true,
					Synchronous: "NORMAL",
					CacheSize:   -2000,
					BusyTimeout: 30000,
				},
				Pool: repositories.PoolConfig{
					MaxOpenConns:    1,
					MaxIdleConns:    1,
					ConnMaxLifetime: time.Hour,
					ConnMaxIdleTime: time.Minute * 15,
				},
				Query: repositories.QueryConfig{
					DefaultLimit:       50,
					MaxLimit:           1000,
					Timeout:            time.Second * 30,
					SlowQueryThreshold: time.Second * 2,
				},
			},
			wantErr: false,
		},
		{
			name: "SQLite with default settings",
			config: &repositories.Config{
				Database: repositories.DatabaseConfig{
					Driver: "sqlite",
					Path:   filepath.Join(tempDir, "default.db"),
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
			},
			wantErr: false,
		},
		{
			name: "invalid database driver",
			config: &repositories.Config{
				Database: repositories.DatabaseConfig{
					Driver: "invalid",
					Path:   filepath.Join(tempDir, "invalid.db"),
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
			},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx := context.Background()

			db, err := factory.CreateConnection(ctx, tt.config)
			if (err != nil) != tt.wantErr {
				t.Errorf("CreateConnection() error = %v, wantErr %v", err, tt.wantErr)
				return
			}

			if !tt.wantErr {
				if db == nil {
					t.Error("CreateConnection() returned nil database")
					return
				}

				// Test basic functionality
				if err := db.PingContext(ctx); err != nil {
					t.Errorf("Failed to ping database: %v", err)
				}

				// Test a simple query
				var result int
				if err := db.QueryRowContext(ctx, "SELECT 1").Scan(&result); err != nil {
					t.Errorf("Failed to execute test query: %v", err)
				}

				if result != 1 {
					t.Errorf("Test query returned %d, expected 1", result)
				}

				// Check connection pool settings
				stats := db.Stats()
				if stats.MaxOpenConnections != tt.config.Pool.MaxOpenConns {
					t.Errorf("MaxOpenConnections = %d, want %d",
						stats.MaxOpenConnections, tt.config.Pool.MaxOpenConns)
				}

				db.Close()
			}
		})
	}
}

func TestConnectionFactory_BuildSQLiteDSN(t *testing.T) {
	logger := logrus.New()
	logger.SetLevel(logrus.WarnLevel)

	factory := NewConnectionFactory(logger)

	tests := []struct {
		name     string
		path     string
		config   *repositories.Config
		expected string
	}{
		{
			name: "basic path",
			path: "/tmp/test.db",
			config: &repositories.Config{
				Database: repositories.DatabaseConfig{},
			},
			expected: "/tmp/test.db",
		},
		{
			name: "with WAL mode",
			path: "/tmp/test.db",
			config: &repositories.Config{
				Database: repositories.DatabaseConfig{
					WALMode: true,
				},
			},
			expected: "/tmp/test.db?_journal_mode=WAL",
		},
		{
			name: "with foreign keys",
			path: "/tmp/test.db",
			config: &repositories.Config{
				Database: repositories.DatabaseConfig{
					ForeignKeys: true,
				},
			},
			expected: "/tmp/test.db?_foreign_keys=on",
		},
		{
			name: "with multiple options",
			path: "/tmp/test.db",
			config: &repositories.Config{
				Database: repositories.DatabaseConfig{
					WALMode:     true,
					ForeignKeys: true,
					Synchronous: "NORMAL",
					BusyTimeout: 30000,
					CacheSize:   -2000,
				},
			},
			expected: "/tmp/test.db?cache=shared&_journal_mode=WAL&_synchronous=NORMAL&_foreign_keys=on&_busy_timeout=30000",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := factory.buildSQLiteDSN(tt.path, tt.config)

			// For complex DSNs, just check that all expected parts are present
			if tt.name == "with multiple options" {
				expectedParts := []string{
					"/tmp/test.db",
					"cache=shared",
					"_journal_mode=WAL",
					"_synchronous=NORMAL",
					"_foreign_keys=on",
					"_busy_timeout=30000",
				}

				for _, part := range expectedParts {
					if !contains(result, part) {
						t.Errorf("DSN %s does not contain expected part %s", result, part)
					}
				}
			} else {
				if result != tt.expected {
					t.Errorf("buildSQLiteDSN() = %s, want %s", result, tt.expected)
				}
			}
		})
	}
}

func TestHealthChecker(t *testing.T) {
	// Create temporary database
	tempDir, err := os.MkdirTemp("", "health_test_*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	logger := logrus.New()
	logger.SetLevel(logrus.WarnLevel)

	factory := NewConnectionFactory(logger)
	config := &repositories.Config{
		Database: repositories.DatabaseConfig{
			Driver: "sqlite",
			Path:   filepath.Join(tempDir, "health.db"),
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
	}

	ctx := context.Background()
	db, err := factory.CreateConnection(ctx, config)
	if err != nil {
		t.Fatalf("Failed to create connection: %v", err)
	}
	defer db.Close()

	checker := NewHealthChecker(db, logger)

	// Test health check
	err = checker.CheckHealth(ctx)
	if err != nil {
		t.Errorf("CheckHealth() failed: %v", err)
	}

	// Test health status
	status := checker.GetHealthStatus(ctx)
	if status == nil {
		t.Error("GetHealthStatus() returned nil")
		return
	}

	if !status.Healthy {
		t.Errorf("Health status should be healthy, got: %s", status.Message)
	}

	if status.Details == nil {
		t.Error("Health status details should not be nil")
	}

	// Check that some expected details are present
	expectedDetails := []string{
		"open_connections",
		"in_use",
		"idle",
	}

	for _, detail := range expectedDetails {
		if _, exists := status.Details[detail]; !exists {
			t.Errorf("Health status missing expected detail: %s", detail)
		}
	}
}

func TestConnectionPool(t *testing.T) {
	// Create temporary database
	tempDir, err := os.MkdirTemp("", "pool_test_*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	logger := logrus.New()
	logger.SetLevel(logrus.WarnLevel)

	factory := NewConnectionFactory(logger)
	config := &repositories.Config{
		Database: repositories.DatabaseConfig{
			Driver: "sqlite",
			Path:   filepath.Join(tempDir, "pool.db"),
		},
		Pool: repositories.PoolConfig{
			MaxOpenConns:    5,
			MaxIdleConns:    2,
			ConnMaxLifetime: time.Hour,
			ConnMaxIdleTime: time.Minute * 15,
		},
		Query: repositories.QueryConfig{
			DefaultLimit: 50,
			MaxLimit:     1000,
			Timeout:      time.Second * 30,
		},
	}

	ctx := context.Background()
	db, err := factory.CreateConnection(ctx, config)
	if err != nil {
		t.Fatalf("Failed to create connection: %v", err)
	}

	pool := NewConnectionPool(db, config, logger)
	defer pool.Close()

	// Test basic functionality
	if pool.GetDB() != db {
		t.Error("GetDB() returned different database instance")
	}

	// Test ping
	if err := pool.Ping(ctx); err != nil {
		t.Errorf("Ping() failed: %v", err)
	}

	// Test health check
	if err := pool.CheckHealth(ctx); err != nil {
		t.Errorf("CheckHealth() failed: %v", err)
	}

	// Test stats
	stats := pool.GetStats()
	if stats.MaxOpenConnections != config.Pool.MaxOpenConns {
		t.Errorf("MaxOpenConnections = %d, want %d",
			stats.MaxOpenConnections, config.Pool.MaxOpenConns)
	}

	// Test warm up
	if err := pool.WarmUp(ctx); err != nil {
		t.Errorf("WarmUp() failed: %v", err)
	}

	// Test health status
	status := pool.GetHealthStatus(ctx)
	if !status.Healthy {
		t.Errorf("Pool should be healthy, got: %s", status.Message)
	}
}

// Helper function to check if a string contains a substring
func contains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(substr) == 0 ||
		(len(s) > len(substr) && (s[:len(substr)] == substr ||
			s[len(s)-len(substr):] == substr ||
			containsSubstring(s, substr))))
}

func containsSubstring(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
