package sqlite

import (
	"context"
	"database/sql"
	"os"
	"path/filepath"
	"testing"

	"bakery-invoice-api/internal/models"

	_ "github.com/mattn/go-sqlite3"
	"github.com/sirupsen/logrus"
)

func setupTestDB(t *testing.T) (*sql.DB, func()) {
	tempDir, err := os.MkdirTemp("", "sqlite_test_*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}

	dbPath := filepath.Join(tempDir, "test.db")
	db, err := sql.Open("sqlite3", dbPath+"?_foreign_keys=on")
	if err != nil {
		t.Fatalf("Failed to open database: %v", err)
	}

	// Create customers table
	_, err = db.Exec(`
		CREATE TABLE customers (
			id TEXT PRIMARY KEY,
			customer_type TEXT NOT NULL,
			first_name TEXT,
			last_name TEXT,
			business_name TEXT,
			abn TEXT,
			email TEXT,
			phone TEXT,
			address TEXT,
			created_at DATETIME NOT NULL,
			updated_at DATETIME NOT NULL
		)
	`)
	if err != nil {
		t.Fatalf("Failed to create customers table: %v", err)
	}

	cleanup := func() {
		db.Close()
		os.RemoveAll(tempDir)
	}

	return db, cleanup
}

func TestCustomerRepository_Create(t *testing.T) {
	db, cleanup := setupTestDB(t)
	defer cleanup()

	logger := logrus.New()
	logger.SetLevel(logrus.WarnLevel)

	repo := NewCustomerRepository(db, logger)
	ctx := context.Background()

	customer := models.NewIndividualCustomer("John", "Doe")
	customer.Email = stringPtr("john.doe@example.com")

	err := repo.Create(ctx, customer)
	if err != nil {
		t.Errorf("Create() failed: %v", err)
	}

	// Verify customer was created
	retrieved, err := repo.GetByID(ctx, customer.ID)
	if err != nil {
		t.Errorf("GetByID() failed: %v", err)
	}

	if retrieved.ID != customer.ID {
		t.Errorf("Retrieved customer ID = %s, want %s", retrieved.ID, customer.ID)
	}

	if *retrieved.FirstName != *customer.FirstName {
		t.Errorf("Retrieved customer FirstName = %s, want %s", *retrieved.FirstName, *customer.FirstName)
	}

	if *retrieved.Email != *customer.Email {
		t.Errorf("Retrieved customer Email = %s, want %s", *retrieved.Email, *customer.Email)
	}
}

func TestCustomerRepository_GetByEmail(t *testing.T) {
	db, cleanup := setupTestDB(t)
	defer cleanup()

	logger := logrus.New()
	logger.SetLevel(logrus.WarnLevel)

	repo := NewCustomerRepository(db, logger)
	ctx := context.Background()

	customer := models.NewIndividualCustomer("Jane", "Smith")
	customer.Email = stringPtr("jane.smith@example.com")

	err := repo.Create(ctx, customer)
	if err != nil {
		t.Fatalf("Create() failed: %v", err)
	}

	// Test GetByEmail
	retrieved, err := repo.GetByEmail(ctx, *customer.Email)
	if err != nil {
		t.Errorf("GetByEmail() failed: %v", err)
	}

	if retrieved.ID != customer.ID {
		t.Errorf("Retrieved customer ID = %s, want %s", retrieved.ID, customer.ID)
	}

	// Test non-existent email
	_, err = repo.GetByEmail(ctx, "nonexistent@example.com")
	if err == nil {
		t.Error("GetByEmail() should fail for non-existent email")
	}
}

func TestCustomerRepository_List(t *testing.T) {
	db, cleanup := setupTestDB(t)
	defer cleanup()

	logger := logrus.New()
	logger.SetLevel(logrus.WarnLevel)

	repo := NewCustomerRepository(db, logger)
	ctx := context.Background()

	// Create test customers
	customer1 := models.NewIndividualCustomer("Alice", "Johnson")
	customer2 := models.NewBusinessCustomer("ACME Corp")

	err := repo.Create(ctx, customer1)
	if err != nil {
		t.Fatalf("Create() failed for customer1: %v", err)
	}

	err = repo.Create(ctx, customer2)
	if err != nil {
		t.Fatalf("Create() failed for customer2: %v", err)
	}

	// Test List all
	customers, err := repo.List(ctx, nil)
	if err != nil {
		t.Errorf("List() failed: %v", err)
	}

	if len(customers) != 2 {
		t.Errorf("List() returned %d customers, want 2", len(customers))
	}

	// Test List with filter
	filters := map[string]interface{}{
		"customer_type": models.CustomerTypeIndividual,
	}

	customers, err = repo.List(ctx, filters)
	if err != nil {
		t.Errorf("List() with filter failed: %v", err)
	}

	if len(customers) != 1 {
		t.Errorf("List() with filter returned %d customers, want 1", len(customers))
	}

	if customers[0].CustomerType != models.CustomerTypeIndividual {
		t.Errorf("Filtered customer type = %s, want %s", customers[0].CustomerType, models.CustomerTypeIndividual)
	}
}

func TestCustomerRepository_Update(t *testing.T) {
	db, cleanup := setupTestDB(t)
	defer cleanup()

	logger := logrus.New()
	logger.SetLevel(logrus.WarnLevel)

	repo := NewCustomerRepository(db, logger)
	ctx := context.Background()

	customer := models.NewIndividualCustomer("Bob", "Wilson")
	customer.Email = stringPtr("bob.wilson@example.com")

	err := repo.Create(ctx, customer)
	if err != nil {
		t.Fatalf("Create() failed: %v", err)
	}

	// Update customer
	customer.Email = stringPtr("bob.wilson.updated@example.com")
	customer.Phone = stringPtr("555-1234")

	err = repo.Update(ctx, customer)
	if err != nil {
		t.Errorf("Update() failed: %v", err)
	}

	// Verify update
	retrieved, err := repo.GetByID(ctx, customer.ID)
	if err != nil {
		t.Errorf("GetByID() after update failed: %v", err)
	}

	if *retrieved.Email != *customer.Email {
		t.Errorf("Updated email = %s, want %s", *retrieved.Email, *customer.Email)
	}

	if *retrieved.Phone != *customer.Phone {
		t.Errorf("Updated phone = %s, want %s", *retrieved.Phone, *customer.Phone)
	}
}

func TestCustomerRepository_Delete(t *testing.T) {
	db, cleanup := setupTestDB(t)
	defer cleanup()

	logger := logrus.New()
	logger.SetLevel(logrus.WarnLevel)

	repo := NewCustomerRepository(db, logger)
	ctx := context.Background()

	customer := models.NewIndividualCustomer("Charlie", "Brown")

	err := repo.Create(ctx, customer)
	if err != nil {
		t.Fatalf("Create() failed: %v", err)
	}

	// Verify customer exists
	exists, err := repo.Exists(ctx, customer.ID)
	if err != nil {
		t.Errorf("Exists() failed: %v", err)
	}
	if !exists {
		t.Error("Customer should exist before delete")
	}

	// Delete customer
	err = repo.Delete(ctx, customer.ID)
	if err != nil {
		t.Errorf("Delete() failed: %v", err)
	}

	// Verify customer no longer exists
	exists, err = repo.Exists(ctx, customer.ID)
	if err != nil {
		t.Errorf("Exists() after delete failed: %v", err)
	}
	if exists {
		t.Error("Customer should not exist after delete")
	}

	// Verify GetByID fails
	_, err = repo.GetByID(ctx, customer.ID)
	if err == nil {
		t.Error("GetByID() should fail for deleted customer")
	}
}

func TestCustomerRepository_Count(t *testing.T) {
	db, cleanup := setupTestDB(t)
	defer cleanup()

	logger := logrus.New()
	logger.SetLevel(logrus.WarnLevel)

	repo := NewCustomerRepository(db, logger)
	ctx := context.Background()

	// Initial count should be 0
	count, err := repo.Count(ctx, nil)
	if err != nil {
		t.Errorf("Count() failed: %v", err)
	}
	if count != 0 {
		t.Errorf("Initial count = %d, want 0", count)
	}

	// Create customers
	customer1 := models.NewIndividualCustomer("Test1", "User1")
	customer2 := models.NewBusinessCustomer("Test Business")

	err = repo.Create(ctx, customer1)
	if err != nil {
		t.Fatalf("Create() failed for customer1: %v", err)
	}

	err = repo.Create(ctx, customer2)
	if err != nil {
		t.Fatalf("Create() failed for customer2: %v", err)
	}

	// Count all customers
	count, err = repo.Count(ctx, nil)
	if err != nil {
		t.Errorf("Count() failed: %v", err)
	}
	if count != 2 {
		t.Errorf("Total count = %d, want 2", count)
	}

	// Count with filter
	filters := map[string]interface{}{
		"customer_type": models.CustomerTypeIndividual,
	}

	count, err = repo.Count(ctx, filters)
	if err != nil {
		t.Errorf("Count() with filter failed: %v", err)
	}
	if count != 1 {
		t.Errorf("Filtered count = %d, want 1", count)
	}
}

// Helper function to create string pointer
func stringPtr(s string) *string {
	return &s
}
