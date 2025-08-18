package services

import (
	"fmt"

	"bakery-invoice-api/internal/repositories"
)

// ServiceContainer holds all service instances
type ServiceContainer struct {
	CustomerService CustomerService
	ProductService  ProductService
	ReceiptService  ReceiptService
	EmailService    EmailService
	TaxService      TaxServiceInterface
}

// ServiceConfig holds configuration for services
type ServiceConfig struct {
	SMTPConfig *SMTPConfig
	TaxConfig  *TaxConfig
}

// TaxConfig holds tax service configuration
type TaxConfig struct {
	CountryCode string
}

// NewServiceContainer creates a new service container with all services
func NewServiceContainer(repos *repositories.RepositoryContainer, config *ServiceConfig) (*ServiceContainer, error) {
	if repos == nil {
		return nil, fmt.Errorf("repository container cannot be nil")
	}

	if config == nil {
		config = &ServiceConfig{
			TaxConfig: &TaxConfig{
				CountryCode: "AU", // Default to Australia
			},
		}
	}

	// Create tax service
	taxService, err := NewTaxServiceForCountry(config.TaxConfig.CountryCode)
	if err != nil {
		return nil, fmt.Errorf("failed to create tax service: %w", err)
	}

	// Create customer service
	customerService := NewCustomerService(repos.CustomerRepo, repos.ReceiptRepo)

	// Create product service
	productService := NewProductService(repos.ProductRepo, repos.LineItemRepo)

	// Create receipt service
	receiptService := NewReceiptService(
		repos.ReceiptRepo,
		repos.CustomerRepo,
		repos.ProductRepo,
		repos.LineItemRepo,
		repos.SellerProfileRepo,
		taxService,
	)

	// Create email service
	var emailService EmailService
	if config.SMTPConfig != nil {
		emailService = NewEmailService(repos.EmailAuditRepo, receiptService, config.SMTPConfig)
	} else {
		// Create with default/empty SMTP config
		emailService = NewEmailService(repos.EmailAuditRepo, receiptService, &SMTPConfig{})
	}

	return &ServiceContainer{
		CustomerService: customerService,
		ProductService:  productService,
		ReceiptService:  receiptService,
		EmailService:    emailService,
		TaxService:      taxService,
	}, nil
}

// Validate validates that all services are properly initialized
func (sc *ServiceContainer) Validate() error {
	if sc.CustomerService == nil {
		return fmt.Errorf("customer service is nil")
	}
	if sc.ProductService == nil {
		return fmt.Errorf("product service is nil")
	}
	if sc.ReceiptService == nil {
		return fmt.Errorf("receipt service is nil")
	}
	if sc.EmailService == nil {
		return fmt.Errorf("email service is nil")
	}
	if sc.TaxService == nil {
		return fmt.Errorf("tax service is nil")
	}

	return nil
}

// Close performs cleanup for all services
func (sc *ServiceContainer) Close() error {
	// Services don't currently need cleanup, but this provides
	// a hook for future cleanup operations like closing connections
	return nil
}
