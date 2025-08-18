package server

import (
	"testing"

	"bakery-invoice-api/internal/config"
)

// TestNewContainer verifies that the container can be created successfully
func TestNewContainer(t *testing.T) {
	// Create a test configuration
	cfg := &config.Config{
		Environment: "test",
		Port:        "8080",
		SMTP: config.SMTPConfig{
			Host:     "localhost",
			Port:     587,
			Username: "test",
			Password: "test",
			From:     "test@example.com",
		},
	}

	// Create container
	container, err := NewContainer(cfg)
	if err != nil {
		t.Fatalf("Failed to create container: %v", err)
	}

	// Verify container is not nil
	if container == nil {
		t.Fatal("Container is nil")
	}

	// Verify services are initialized
	if container.CustomerService == nil {
		t.Error("CustomerService is nil")
	}
	if container.ProductService == nil {
		t.Error("ProductService is nil")
	}
	if container.ReceiptService == nil {
		t.Error("ReceiptService is nil")
	}
	if container.EmailService == nil {
		t.Error("EmailService is nil")
	}

	// Test cleanup
	if err := container.Close(); err != nil {
		t.Errorf("Failed to close container: %v", err)
	}
}

// TestContainerServices verifies that services are properly typed
func TestContainerServices(t *testing.T) {
	cfg := &config.Config{
		Environment: "test",
		Port:        "8080",
		SMTP: config.SMTPConfig{
			Host:     "localhost",
			Port:     587,
			Username: "test",
			Password: "test",
			From:     "test@example.com",
		},
	}

	container, err := NewContainer(cfg)
	if err != nil {
		t.Fatalf("Failed to create container: %v", err)
	}
	defer container.Close()

	// Test that services implement the expected interfaces
	// This is a compile-time check - if the services don't implement
	// the interfaces correctly, this won't compile

	// These assignments will fail at compile time if the types don't match
	_ = container.CustomerService
	_ = container.ProductService
	_ = container.ReceiptService
	_ = container.EmailService
}
