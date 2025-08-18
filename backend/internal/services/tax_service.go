package services

import (
	"context"
	"fmt"
	"time"

	"bakery-invoice-api/internal/models"
)

// TaxService handles tax-related business logic and calculations
type TaxService struct {
	config models.TaxConfig
}

// NewTaxService creates a new tax service with the specified configuration
func NewTaxService(config models.TaxConfig) *TaxService {
	return &TaxService{
		config: config,
	}
}

// NewTaxServiceForCountry creates a new tax service for the specified country
func NewTaxServiceForCountry(countryCode string) (*TaxService, error) {
	config, err := models.NewTaxConfig(countryCode)
	if err != nil {
		return nil, fmt.Errorf("failed to create tax config for country %s: %w", countryCode, err)
	}

	return &TaxService{
		config: config,
	}, nil
}

// ValidateBusinessNumber validates a business number using the current tax configuration
func (s *TaxService) ValidateBusinessNumber(ctx context.Context, businessNumber string) error {
	return s.config.ValidateBusinessNumber(businessNumber)
}

// CalculateReceiptTotals calculates tax totals for a receipt
func (s *TaxService) CalculateReceiptTotals(ctx context.Context, req *CalculateReceiptRequest) (*models.TaxCalculationResult, error) {
	if req == nil {
		return nil, fmt.Errorf("calculate receipt request cannot be nil")
	}

	if len(req.LineItems) == 0 {
		return nil, fmt.Errorf("receipt must have at least one line item")
	}

	// Convert request line items to calculation format
	lineItems := make([]models.LineItemCalculation, len(req.LineItems))
	for i, item := range req.LineItems {
		if item.Quantity <= 0 {
			return nil, fmt.Errorf("line item %d: quantity must be positive", i+1)
		}
		if item.UnitPrice < 0 {
			return nil, fmt.Errorf("line item %d: unit price cannot be negative", i+1)
		}

		lineItems[i] = models.LineItemCalculation{
			Quantity:      item.Quantity,
			UnitPrice:     item.UnitPrice,
			TaxApplicable: item.TaxApplicable,
		}
	}

	// Calculate totals using the tax configuration
	result := models.CalculateReceiptTotals(s.config, lineItems, req.ForceTaxInvoice)

	return result, nil
}

// GetTaxInvoiceRequirements returns the required fields for a tax invoice
func (s *TaxService) GetTaxInvoiceRequirements(ctx context.Context) *TaxInvoiceRequirements {
	return &TaxInvoiceRequirements{
		RequiredFields:   s.config.GetRequiredTaxInvoiceFields(),
		MinimumThreshold: s.config.GetTaxInvoiceThreshold(),
		TaxName:          s.config.GetTaxName(),
		CountryCode:      s.config.GetCountryCode(),
	}
}

// GetTaxInfo returns general tax information for the current configuration
func (s *TaxService) GetTaxInfo(ctx context.Context) *TaxInfo {
	return &TaxInfo{
		TaxName:               s.config.GetTaxName(),
		TaxRate:               s.config.GetTaxRate(),
		CountryCode:           s.config.GetCountryCode(),
		RegistrationThreshold: s.config.GetRegistrationThreshold(),
		TaxInvoiceThreshold:   s.config.GetTaxInvoiceThreshold(),
	}
}

// ValidateReceiptForTaxCompliance validates a receipt for tax compliance
func (s *TaxService) ValidateReceiptForTaxCompliance(ctx context.Context, req *TaxComplianceValidationRequest) (*TaxComplianceValidationResult, error) {
	if req == nil {
		return nil, fmt.Errorf("validation request cannot be nil")
	}

	result := &TaxComplianceValidationResult{
		IsCompliant: true,
		Errors:      []string{},
		Warnings:    []string{},
	}

	// Validate business number if provided
	if req.SellerBusinessNumber != "" {
		if err := s.config.ValidateBusinessNumber(req.SellerBusinessNumber); err != nil {
			result.IsCompliant = false
			result.Errors = append(result.Errors, fmt.Sprintf("Invalid seller business number: %v", err))
		}
	}

	if req.CustomerBusinessNumber != "" {
		if err := s.config.ValidateBusinessNumber(req.CustomerBusinessNumber); err != nil {
			result.IsCompliant = false
			result.Errors = append(result.Errors, fmt.Sprintf("Invalid customer business number: %v", err))
		}
	}

	// Check if tax invoice is required
	isTaxInvoiceRequired := s.config.IsTaxInvoiceRequired(req.TotalAmount, req.ForceTaxInvoice)

	if isTaxInvoiceRequired {
		// Validate required tax invoice fields
		requiredFields := s.config.GetRequiredTaxInvoiceFields()

		for _, field := range requiredFields {
			switch field {
			case "seller_abn", "vat_number", "business_license":
				if req.SellerBusinessNumber == "" {
					result.IsCompliant = false
					result.Errors = append(result.Errors, fmt.Sprintf("Tax invoice requires seller business number (%s)", field))
				}
			case "invoice_date":
				if req.InvoiceDate.IsZero() {
					result.IsCompliant = false
					result.Errors = append(result.Errors, "Tax invoice requires invoice date")
				}
			case "customer_details":
				if req.CustomerName == "" {
					result.IsCompliant = false
					result.Errors = append(result.Errors, "Tax invoice requires customer name")
				}
			case "description_of_goods":
				if len(req.LineItemDescriptions) == 0 {
					result.IsCompliant = false
					result.Errors = append(result.Errors, "Tax invoice requires description of goods/services")
				}
			case "gst_amount", "vat_amount", "tax_amount":
				if req.TaxAmount < 0 {
					result.IsCompliant = false
					result.Errors = append(result.Errors, "Tax invoice requires valid tax amount")
				}
			case "total_amount":
				if req.TotalAmount <= 0 {
					result.IsCompliant = false
					result.Errors = append(result.Errors, "Tax invoice requires valid total amount")
				}
			}
		}

		// Add warning if close to threshold
		threshold := s.config.GetTaxInvoiceThreshold()
		if req.TotalAmount >= threshold && req.TotalAmount < threshold*1.1 {
			result.Warnings = append(result.Warnings, fmt.Sprintf("Amount is close to tax invoice threshold of %s%.2f", s.getCurrencySymbol(), threshold))
		}
	} else {
		// Add info about tax invoice threshold
		threshold := s.config.GetTaxInvoiceThreshold()
		if req.TotalAmount > 0 && req.TotalAmount < threshold {
			result.Warnings = append(result.Warnings, fmt.Sprintf("Tax invoice not required (amount below %s%.2f threshold)", s.getCurrencySymbol(), threshold))
		}
	}

	return result, nil
}

// getCurrencySymbol returns the appropriate currency symbol for the tax configuration
func (s *TaxService) getCurrencySymbol() string {
	switch s.config.GetCountryCode() {
	case "AU":
		return "$"
	case "GB":
		return "£"
	case "US":
		return "$"
	default:
		return "$"
	}
}

// CalculateReceiptRequest represents a request to calculate receipt totals
type CalculateReceiptRequest struct {
	LineItems       []ReceiptLineItem `json:"line_items" validate:"required,min=1"`
	ForceTaxInvoice bool              `json:"force_tax_invoice"`
}

// ReceiptLineItem represents a line item in a receipt calculation
type ReceiptLineItem struct {
	Quantity      int     `json:"quantity" validate:"required,min=1"`
	UnitPrice     float64 `json:"unit_price" validate:"required,min=0"`
	TaxApplicable bool    `json:"tax_applicable"`
	Description   string  `json:"description" validate:"required"`
}

// TaxInvoiceRequirements contains the requirements for tax invoices
type TaxInvoiceRequirements struct {
	RequiredFields   []string `json:"required_fields"`
	MinimumThreshold float64  `json:"minimum_threshold"`
	TaxName          string   `json:"tax_name"`
	CountryCode      string   `json:"country_code"`
}

// TaxInfo contains general tax information
type TaxInfo struct {
	TaxName               string  `json:"tax_name"`
	TaxRate               float64 `json:"tax_rate"`
	CountryCode           string  `json:"country_code"`
	RegistrationThreshold float64 `json:"registration_threshold"`
	TaxInvoiceThreshold   float64 `json:"tax_invoice_threshold"`
}

// TaxComplianceValidationRequest represents a request to validate tax compliance
type TaxComplianceValidationRequest struct {
	TotalAmount            float64   `json:"total_amount"`
	TaxAmount              float64   `json:"tax_amount"`
	ForceTaxInvoice        bool      `json:"force_tax_invoice"`
	SellerBusinessNumber   string    `json:"seller_business_number"`
	CustomerBusinessNumber string    `json:"customer_business_number"`
	CustomerName           string    `json:"customer_name"`
	InvoiceDate            time.Time `json:"invoice_date"`
	LineItemDescriptions   []string  `json:"line_item_descriptions"`
}

// TaxComplianceValidationResult represents the result of tax compliance validation
type TaxComplianceValidationResult struct {
	IsCompliant bool     `json:"is_compliant"`
	Errors      []string `json:"errors"`
	Warnings    []string `json:"warnings"`
}

// TaxServiceInterface defines the interface for tax services
type TaxServiceInterface interface {
	ValidateBusinessNumber(ctx context.Context, businessNumber string) error
	CalculateReceiptTotals(ctx context.Context, req *CalculateReceiptRequest) (*models.TaxCalculationResult, error)
	GetTaxInvoiceRequirements(ctx context.Context) *TaxInvoiceRequirements
	GetTaxInfo(ctx context.Context) *TaxInfo
	ValidateReceiptForTaxCompliance(ctx context.Context, req *TaxComplianceValidationRequest) (*TaxComplianceValidationResult, error)
}
