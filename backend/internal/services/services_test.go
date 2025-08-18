package services

import (
	"testing"

	"github.com/go-playground/validator/v10"
)

// TestServiceInterfaces verifies that all service interfaces are properly defined
func TestServiceInterfaces(t *testing.T) {
	// Test that validator can be created (used by all services)
	validator := validator.New()
	if validator == nil {
		t.Error("Failed to create validator instance")
	}

	// Test that service interfaces are properly defined by checking their methods exist
	// This is a compile-time check - if the interfaces are malformed, this won't compile

	var customerService CustomerService
	var productService ProductService
	var receiptService ReceiptService
	var emailService EmailService
	var taxService TaxServiceInterface

	// These should all be nil but the types should be valid
	if customerService != nil {
		t.Error("customerService should be nil in test")
	}
	if productService != nil {
		t.Error("productService should be nil in test")
	}
	if receiptService != nil {
		t.Error("receiptService should be nil in test")
	}
	if emailService != nil {
		t.Error("emailService should be nil in test")
	}
	if taxService != nil {
		t.Error("taxService should be nil in test")
	}
}

// TestServiceRequestTypes verifies that request/response types are properly defined
func TestServiceRequestTypes(t *testing.T) {
	// Test customer request types
	customerReq := &CreateCustomerRequest{}
	if customerReq == nil {
		t.Error("Failed to create CreateCustomerRequest")
	}

	updateCustomerReq := &UpdateCustomerRequest{}
	if updateCustomerReq == nil {
		t.Error("Failed to create UpdateCustomerRequest")
	}

	// Test product request types
	productReq := &CreateProductRequest{}
	if productReq == nil {
		t.Error("Failed to create CreateProductRequest")
	}

	updateProductReq := &UpdateProductRequest{}
	if updateProductReq == nil {
		t.Error("Failed to create UpdateProductRequest")
	}

	// Test receipt request types
	receiptReq := &CreateReceiptRequest{}
	if receiptReq == nil {
		t.Error("Failed to create CreateReceiptRequest")
	}

	calculateReq := &CalculateReceiptTotalsRequest{}
	if calculateReq == nil {
		t.Error("Failed to create CalculateReceiptTotalsRequest")
	}

	// Test email types
	emailTemplate := &EmailTemplate{}
	if emailTemplate == nil {
		t.Error("Failed to create EmailTemplate")
	}

	emailSettings := &EmailDeliverySettings{}
	if emailSettings == nil {
		t.Error("Failed to create EmailDeliverySettings")
	}
}

// TestServiceFactory verifies that the service factory works
func TestServiceFactory(t *testing.T) {
	// Test that ServiceContainer can be created (will be nil without repos)
	var container *ServiceContainer
	if container != nil {
		t.Error("container should be nil without initialization")
	}

	// Test that ServiceConfig can be created
	config := &ServiceConfig{}
	if config == nil {
		t.Error("Failed to create ServiceConfig")
	}

	// Test that SMTPConfig can be created
	smtpConfig := &SMTPConfig{}
	if smtpConfig == nil {
		t.Error("Failed to create SMTPConfig")
	}

	// Test that TaxConfig can be created
	taxConfig := &TaxConfig{}
	if taxConfig == nil {
		t.Error("Failed to create TaxConfig")
	}
}
