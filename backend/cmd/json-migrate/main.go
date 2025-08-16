package main

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"

	"bakery-invoice-api/internal/database"
	"bakery-invoice-api/internal/migration"

	"github.com/sirupsen/logrus"
)

func main() {
	var (
		dbPath      = flag.String("db", "./data/bakery.db", "Database file path")
		jsonPath    = flag.String("json", "../src/lib/data", "JSON files directory path")
		action      = flag.String("action", "migrate", "Action: migrate, validate, check")
		verbose     = flag.Bool("verbose", false, "Enable verbose logging")
		dryRun      = flag.Bool("dry-run", false, "Perform a dry run without making changes")
		forceBackup = flag.Bool("force-backup", false, "Force backup even if files already exist")
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

	absJSONPath, err := filepath.Abs(*jsonPath)
	if err != nil {
		logger.WithError(err).Fatal("Failed to get absolute JSON path")
	}

	logger.WithFields(logrus.Fields{
		"db_path":   absDBPath,
		"json_path": absJSONPath,
		"action":    *action,
		"dry_run":   *dryRun,
	}).Info("Starting JSON migration tool")

	// Handle different actions
	switch *action {
	case "check":
		if err := checkJSONFiles(absJSONPath, logger); err != nil {
			logger.WithError(err).Fatal("Failed to check JSON files")
		}
	case "migrate":
		if err := runMigration(absDBPath, absJSONPath, logger, *dryRun, *forceBackup); err != nil {
			logger.WithError(err).Fatal("Migration failed")
		}
	case "validate":
		if err := validateMigration(absDBPath, absJSONPath, logger); err != nil {
			logger.WithError(err).Fatal("Validation failed")
		}
	default:
		logger.WithField("action", *action).Fatal("Unknown action. Use: check, migrate, validate")
	}

	logger.Info("JSON migration tool completed successfully")
}

func checkJSONFiles(jsonPath string, logger *logrus.Logger) error {
	logger.Info("Checking for JSON files...")

	// Just check files without database connection
	migrator := migration.NewJSONMigrator(nil, jsonPath, logger)
	hasFiles, existingFiles := migrator.CheckJSONFilesExist()

	if !hasFiles {
		logger.Warn("No JSON files found for migration")
		fmt.Println("No JSON files found in the specified directory.")
		fmt.Printf("Checked directory: %s\n", jsonPath)
		fmt.Println("Expected files: customers.json, products.json, receipts.json, seller-profile.json")
		return nil
	}

	fmt.Printf("Found %d JSON files ready for migration:\n", len(existingFiles))
	for _, file := range existingFiles {
		fmt.Printf("  ✓ %s\n", file)

		// Get file info
		filePath := filepath.Join(jsonPath, file)
		if info, err := os.Stat(filePath); err == nil {
			fmt.Printf("    Size: %d bytes, Modified: %s\n",
				info.Size(), info.ModTime().Format("2006-01-02 15:04:05"))
		}
	}

	return nil
}

func runMigration(dbPath, jsonPath string, logger *logrus.Logger, dryRun, forceBackup bool) error {
	if dryRun {
		logger.Info("Performing dry run - no changes will be made")
		return checkJSONFiles(jsonPath, logger)
	}

	logger.Info("Starting JSON to SQLite migration...")

	// Initialize database directly
	db, err := database.InitializeDatabase(dbPath, "./migrations", logger)
	if err != nil {
		return fmt.Errorf("failed to initialize database: %w", err)
	}
	defer db.Close()

	// Create migrator
	migrator := migration.NewJSONMigrator(db, jsonPath, logger)

	// Check if JSON files exist
	hasFiles, existingFiles := migrator.CheckJSONFilesExist()
	if !hasFiles {
		logger.Warn("No JSON files found for migration")
		return fmt.Errorf("no JSON files found in directory: %s", jsonPath)
	}

	logger.WithField("files", existingFiles).Info("Found JSON files for migration")

	// Run migration
	result, err := migrator.MigrateFromJSON()
	if err != nil {
		return fmt.Errorf("migration failed: %w", err)
	}

	// Display results
	fmt.Printf("\n=== Migration Results ===\n")
	fmt.Printf("Customers processed: %d\n", result.CustomersProcessed)
	fmt.Printf("Products processed: %d\n", result.ProductsProcessed)
	fmt.Printf("Receipts processed: %d\n", result.ReceiptsProcessed)
	fmt.Printf("Line items processed: %d\n", result.LineItemsProcessed)

	if len(result.Warnings) > 0 {
		fmt.Printf("\nWarnings (%d):\n", len(result.Warnings))
		for _, warning := range result.Warnings {
			fmt.Printf("  ⚠ %s\n", warning)
		}
	}

	if len(result.Errors) > 0 {
		fmt.Printf("\nErrors (%d):\n", len(result.Errors))
		for _, errMsg := range result.Errors {
			fmt.Printf("  ✗ %s\n", errMsg)
		}
		return fmt.Errorf("migration completed with %d errors", len(result.Errors))
	}

	fmt.Printf("\n✅ Migration completed successfully!\n")

	// Run validation
	if err := migrator.ValidateMigration(); err != nil {
		logger.WithError(err).Warn("Post-migration validation failed")
		return fmt.Errorf("post-migration validation failed: %w", err)
	}

	return nil
}

func validateMigration(dbPath, jsonPath string, logger *logrus.Logger) error {
	logger.Info("Validating migration results...")

	// Initialize database connection
	config := &database.ConnectionConfig{
		DatabasePath:   dbPath,
		MigrationsPath: "./migrations",
		Logger:         logger,
	}

	connectionManager := database.NewConnectionManager(config)
	if err := connectionManager.Connect(); err != nil {
		return fmt.Errorf("failed to connect to database: %w", err)
	}
	defer connectionManager.Close()

	// Create migrator
	migrator := migration.NewJSONMigrator(connectionManager.GetDB(), jsonPath, logger)

	// Run validation
	if err := migrator.ValidateMigration(); err != nil {
		return fmt.Errorf("validation failed: %w", err)
	}

	fmt.Println("✅ Migration validation passed successfully!")
	return nil
}
