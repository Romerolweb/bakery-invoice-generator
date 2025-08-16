package main

import (
	"flag"
	"fmt"
	"path/filepath"

	"bakery-invoice-api/internal/database"

	"github.com/sirupsen/logrus"
)

func main() {
	var (
		dbPath         = flag.String("db", "./data/bakery.db", "Database file path")
		migrationsPath = flag.String("migrations", "./migrations", "Migrations directory path")
		action         = flag.String("action", "up", "Migration action: up, down, status, validate")
		verbose        = flag.Bool("verbose", false, "Enable verbose logging")
	)
	flag.Parse()

	// Setup logger
	logger := logrus.New()
	if *verbose {
		logger.SetLevel(logrus.DebugLevel)
	}

	// Get absolute paths
	absDBPath, err := filepath.Abs(*dbPath)
	if err != nil {
		logger.WithError(err).Fatal("Failed to get absolute database path")
	}

	absMigrationsPath, err := filepath.Abs(*migrationsPath)
	if err != nil {
		logger.WithError(err).Fatal("Failed to get absolute migrations path")
	}

	logger.WithFields(logrus.Fields{
		"db_path":         absDBPath,
		"migrations_path": absMigrationsPath,
		"action":          *action,
	}).Info("Starting migration tool")

	// Create connection manager
	config := &database.ConnectionConfig{
		DatabasePath:   absDBPath,
		MigrationsPath: absMigrationsPath,
		Logger:         logger,
	}

	connectionManager := database.NewConnectionManager(config)

	// Handle different actions
	switch *action {
	case "up":
		if err := runMigrationsUp(connectionManager); err != nil {
			logger.WithError(err).Fatal("Migration up failed")
		}
	case "down":
		if err := runMigrationsDown(connectionManager); err != nil {
			logger.WithError(err).Fatal("Migration down failed")
		}
	case "status":
		if err := showMigrationStatus(connectionManager); err != nil {
			logger.WithError(err).Fatal("Failed to get migration status")
		}
	case "validate":
		if err := validateSchema(connectionManager); err != nil {
			logger.WithError(err).Fatal("Schema validation failed")
		}
	default:
		logger.WithField("action", *action).Fatal("Unknown action. Use: up, down, status, validate")
	}

	logger.Info("Migration tool completed successfully")
}

func runMigrationsUp(cm *database.ConnectionManager) error {
	if err := cm.Connect(); err != nil {
		return fmt.Errorf("failed to connect to database: %w", err)
	}
	defer cm.Close()

	migrationManager := cm.GetMigrationManager()
	return migrationManager.RunMigrations()
}

func runMigrationsDown(cm *database.ConnectionManager) error {
	if err := cm.Connect(); err != nil {
		return fmt.Errorf("failed to connect to database: %w", err)
	}
	defer cm.Close()

	migrationManager := cm.GetMigrationManager()
	return migrationManager.RollbackMigration()
}

func showMigrationStatus(cm *database.ConnectionManager) error {
	if err := cm.Connect(); err != nil {
		return fmt.Errorf("failed to connect to database: %w", err)
	}
	defer cm.Close()

	migrationManager := cm.GetMigrationManager()
	status, err := migrationManager.GetMigrationStatus()
	if err != nil {
		return fmt.Errorf("failed to get migration status: %w", err)
	}

	fmt.Printf("Migration Status:\n")
	fmt.Printf("  Version: %d\n", status.Version)
	fmt.Printf("  Applied: %t\n", status.Applied)
	fmt.Printf("  Dirty: %t\n", status.Dirty)
	fmt.Printf("  Timestamp: %s\n", status.Timestamp.Format("2006-01-02 15:04:05"))

	return nil
}

func validateSchema(cm *database.ConnectionManager) error {
	if err := cm.Connect(); err != nil {
		return fmt.Errorf("failed to connect to database: %w", err)
	}
	defer cm.Close()

	migrationManager := cm.GetMigrationManager()
	if err := migrationManager.ValidateSchema(); err != nil {
		return fmt.Errorf("schema validation failed: %w", err)
	}

	fmt.Println("Schema validation passed successfully")
	return nil
}
