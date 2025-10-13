package server

import (
	"bakery-invoice-api/internal/config"
	"bakery-invoice-api/internal/database"
	"bakery-invoice-api/internal/middleware"
	"bakery-invoice-api/internal/repositories"
	"bakery-invoice-api/internal/repositories/sqlite"
	"bakery-invoice-api/internal/services"
	"database/sql"
	"fmt"
	"time"

	"gorm.io/gorm"
)

// Container holds all application dependencies
type Container struct {
	Config          *config.Config
	CustomerService services.CustomerService
	ProductService  services.ProductService
	ReceiptService  services.ReceiptService
	EmailService    services.EmailService
	AuthService     *middleware.AuthService

	// Internal dependencies
	db           *gorm.DB
	sqlDB        *sql.DB
	repositories *repositories.RepositoryContainer
	services     *services.ServiceContainer
}

// NewContainer creates a new dependency injection container
func NewContainer(cfg *config.Config) (*Container, error) {
	// Initialize database connection
	db, err := database.NewConnection(&database.Config{
		DatabasePath: cfg.Database.Path,
		MaxOpenConns: cfg.Database.MaxOpenConns,
		MaxIdleConns: cfg.Database.MaxIdleConns,
		MaxLifetime:  time.Duration(cfg.Database.MaxLifetime) * time.Second,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to initialize database: %w", err)
	}

	// Get underlying SQL DB for connection management
	sqlDB, err := db.DB()
	if err != nil {
		return nil, fmt.Errorf("failed to get underlying SQL DB: %w", err)
	}

	// Initialize repositories with database connection
	repoManager := sqlite.NewRepositoryManager(db)
	repos, err := repoManager.GetRepositoryContainer()
	if err != nil {
		return nil, fmt.Errorf("failed to create repository container: %w", err)
	}

	// Initialize authentication service
	authConfig := &middleware.AuthConfig{
		JWTSecret:     cfg.JWT.Secret,
		TokenDuration: time.Duration(cfg.JWT.ExpirationHours) * time.Hour,
		Issuer:        cfg.JWT.Issuer,
	}
	authService := middleware.NewAuthService(authConfig)

	// Create service configuration
	serviceConfig := &services.ServiceConfig{
		SMTPConfig: &services.SMTPConfig{
			Host:      cfg.SMTP.Host,
			Port:      cfg.SMTP.Port,
			Username:  cfg.SMTP.Username,
			Password:  cfg.SMTP.Password,
			FromEmail: cfg.SMTP.From,
			FromName:  cfg.SMTP.FromName,
			UseTLS:    cfg.SMTP.UseTLS,
			UseSSL:    cfg.SMTP.UseSSL,
		},
		TaxConfig: &services.TaxConfig{
			CountryCode: cfg.Tax.CountryCode,
		},
	}

	// Initialize services
	serviceContainer, err := services.NewServiceContainer(repos, serviceConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to create service container: %w", err)
	}

	container := &Container{
		Config:          cfg,
		CustomerService: serviceContainer.CustomerService,
		ProductService:  serviceContainer.ProductService,
		ReceiptService:  serviceContainer.ReceiptService,
		EmailService:    serviceContainer.EmailService,
		AuthService:     authService,
		db:              db,
		sqlDB:           sqlDB,
		repositories:    repos,
		services:        serviceContainer,
	}

	return container, nil
}

// Close cleans up all resources
func (c *Container) Close() error {
	var errors []error

	// Close services
	if c.services != nil {
		if err := c.services.Close(); err != nil {
			errors = append(errors, fmt.Errorf("failed to close services: %w", err))
		}
	}

	// Close database connections
	if c.sqlDB != nil {
		if err := c.sqlDB.Close(); err != nil {
			errors = append(errors, fmt.Errorf("failed to close SQL database: %w", err))
		}
	}

	// Return combined errors if any
	if len(errors) > 0 {
		return fmt.Errorf("errors during container cleanup: %v", errors)
	}

	return nil
}

// HealthCheck performs a health check on all container dependencies
func (c *Container) HealthCheck() error {
	// Check database connection
	if err := c.sqlDB.Ping(); err != nil {
		return fmt.Errorf("database health check failed: %w", err)
	}

	// Check email service configuration (if configured)
	if c.Config.SMTP.Host != "" {
		if err := c.EmailService.TestEmailConfiguration(nil); err != nil {
			return fmt.Errorf("email service health check failed: %w", err)
		}
	}

	return nil
}

// GetDB returns the GORM database instance
func (c *Container) GetDB() *gorm.DB {
	return c.db
}

// GetSQLDB returns the underlying SQL database instance
func (c *Container) GetSQLDB() *sql.DB {
	return c.sqlDB
}

// GetRepositories returns the repository container
func (c *Container) GetRepositories() *repositories.RepositoryContainer {
	return c.repositories
}

// Container now uses real SQLite repository implementations
// All mock repositories have been replaced with actual database-backed implementations
