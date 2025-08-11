package server

import (
	"bakery-invoice-api/internal/config"
)

// Container holds all application dependencies
type Container struct {
	Config          *config.Config
	CustomerService interface{} // Will be replaced with actual service interfaces in later tasks
	ProductService  interface{} // Will be replaced with actual service interfaces in later tasks
	ReceiptService  interface{} // Will be replaced with actual service interfaces in later tasks
	EmailService    interface{} // Will be replaced with actual service interfaces in later tasks
}

// NewContainer creates a new dependency injection container
func NewContainer(cfg *config.Config) (*Container, error) {
	// TODO: Initialize database connection
	// TODO: Initialize storage provider
	// TODO: Initialize services
	// TODO: Initialize DAOs

	container := &Container{
		Config:          cfg,
		CustomerService: nil, // Will be initialized in later tasks
		ProductService:  nil, // Will be initialized in later tasks
		ReceiptService:  nil, // Will be initialized in later tasks
		EmailService:    nil, // Will be initialized in later tasks
	}

	return container, nil
}

// Close cleans up all resources
func (c *Container) Close() error {
	// TODO: Close database connections
	// TODO: Clean up other resources
	return nil
}
