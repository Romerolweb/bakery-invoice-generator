package services

import (
	"context"
	"testing"
	"time"

	"bakery-invoice-api/internal/models"
)

func TestNewTaxService(t *testing.T) {
	config := &models.AustralianGSTConfig{}
	service := NewTaxService(config)

	if service == nil {
		t.Fatal("NewTaxService returned nil")
	}

	if service.config != config {
		t.Error("TaxService config not set correctly")
	}
}

func TestNewTaxServiceForCountry(t *testing.T) {
	tests := []struct {
		name        string
		countryCode string
		wantErr     bool
		expectedTax string
	}{
		{
			name:        "Australia",
			countryCode: "AU",
			wantErr:     false,
			expectedTax: "GST",
		},
		{
			name:        "United Kingdom",
			countryCode: "GB",
			wantErr:     false,
			expectedTax: "VAT",
		},
		{
			name:        "United States",
			countryCode: "US",
			wantErr:     false,
			expectedTax: "Sales Tax",
		},
		{
			name:        "Invalid country",
			countryCode: "INVALID",
			wantErr:     true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			service, err := NewTaxServiceForCountry(tt.countryCode)

			if tt.wantErr {
				if err == nil {
					t.Error("Expected error but got none")
				}
				return
			}

			if err != nil {
				t.Errorf("Unexpected error: %v", err)
				return
			}

			if service == nil {
				t.Fatal("Service is nil")
			}

			info := service.GetTaxInfo(context.Background())
			if info.TaxName != tt.expectedTax {
				t.Errorf("Expected tax name %s, got %s", tt.expectedTax, info.TaxName)
			}
		})
	}
}

func TestTaxService_ValidateBusinessNumber(t *testing.T) {
	service, err := NewTaxServiceForCountry("AU")
	if err != nil {
		t.Fatal(err)
	}

	tests := []struct {
		name           string
		businessNumber string
		wantErr        bool
	}{
		{
			name:           "valid ABN",
			businessNumber: "51 824 753 556",
			wantErr:        false,
		},
		{
			name:           "invalid ABN",
			businessNumber: "51 824 753 557",
			wantErr:        true,
		},
		{
			name:           "empty ABN",
			businessNumber: "",
			wantErr:        false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := service.ValidateBusinessNumber(context.Background(), tt.businessNumber)
			if (err != nil) != tt.wantErr {
				t.Errorf("ValidateBusinessNumber() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}

func TestTaxService_CalculateReceiptTotals(t *testing.T) {
	service, err := NewTaxServiceForCountry("AU")
	if err != nil {
		t.Fatal(err)
	}

	tests := []struct {
		name             string
		request          *CalculateReceiptRequest
		wantErr          bool
		expectedSubtotal float64
		expectedTax      float64
		expectedTotal    float64
		expectedIsTax    bool
	}{
		{
			name: "single item with GST",
			request: &CalculateReceiptRequest{
				LineItems: []ReceiptLineItem{
					{
						Quantity:      1,
						UnitPrice:     100.00,
						TaxApplicable: true,
						Description:   "Test item",
					},
				},
				ForceTaxInvoice: false,
			},
			wantErr:          false,
			expectedSubtotal: 100.00,
			expectedTax:      10.00,
			expectedTotal:    110.00,
			expectedIsTax:    true,
		},
		{
			name: "multiple items mixed GST",
			request: &CalculateReceiptRequest{
				LineItems: []ReceiptLineItem{
					{
						Quantity:      2,
						UnitPrice:     25.00,
						TaxApplicable: true,
						Description:   "Taxable item",
					},
					{
						Quantity:      1,
						UnitPrice:     30.00,
						TaxApplicable: false,
						Description:   "Non-taxable item",
					},
				},
				ForceTaxInvoice: false,
			},
			wantErr:          false,
			expectedSubtotal: 80.00,
			expectedTax:      5.00,
			expectedTotal:    85.00,
			expectedIsTax:    true,
		},
		{
			name: "below threshold but forced",
			request: &CalculateReceiptRequest{
				LineItems: []ReceiptLineItem{
					{
						Quantity:      1,
						UnitPrice:     50.00,
						TaxApplicable: true,
						Description:   "Test item",
					},
				},
				ForceTaxInvoice: true,
			},
			wantErr:          false,
			expectedSubtotal: 50.00,
			expectedTax:      5.00,
			expectedTotal:    55.00,
			expectedIsTax:    true,
		},
		{
			name:    "nil request",
			request: nil,
			wantErr: true,
		},
		{
			name: "empty line items",
			request: &CalculateReceiptRequest{
				LineItems:       []ReceiptLineItem{},
				ForceTaxInvoice: false,
			},
			wantErr: true,
		},
		{
			name: "negative quantity",
			request: &CalculateReceiptRequest{
				LineItems: []ReceiptLineItem{
					{
						Quantity:      -1,
						UnitPrice:     100.00,
						TaxApplicable: true,
						Description:   "Test item",
					},
				},
				ForceTaxInvoice: false,
			},
			wantErr: true,
		},
		{
			name: "negative unit price",
			request: &CalculateReceiptRequest{
				LineItems: []ReceiptLineItem{
					{
						Quantity:      1,
						UnitPrice:     -100.00,
						TaxApplicable: true,
						Description:   "Test item",
					},
				},
				ForceTaxInvoice: false,
			},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := service.CalculateReceiptTotals(context.Background(), tt.request)

			if tt.wantErr {
				if err == nil {
					t.Error("Expected error but got none")
				}
				return
			}

			if err != nil {
				t.Errorf("Unexpected error: %v", err)
				return
			}

			if result == nil {
				t.Fatal("Result is nil")
			}

			if result.SubtotalExclTax != tt.expectedSubtotal {
				t.Errorf("SubtotalExclTax = %f, expected %f", result.SubtotalExclTax, tt.expectedSubtotal)
			}

			if result.TaxAmount != tt.expectedTax {
				t.Errorf("TaxAmount = %f, expected %f", result.TaxAmount, tt.expectedTax)
			}

			if result.TotalInclTax != tt.expectedTotal {
				t.Errorf("TotalInclTax = %f, expected %f", result.TotalInclTax, tt.expectedTotal)
			}

			if result.IsTaxInvoice != tt.expectedIsTax {
				t.Errorf("IsTaxInvoice = %v, expected %v", result.IsTaxInvoice, tt.expectedIsTax)
			}
		})
	}
}

func TestTaxService_GetTaxInvoiceRequirements(t *testing.T) {
	service, err := NewTaxServiceForCountry("AU")
	if err != nil {
		t.Fatal(err)
	}

	requirements := service.GetTaxInvoiceRequirements(context.Background())

	if requirements == nil {
		t.Fatal("Requirements is nil")
	}

	if requirements.TaxName != "GST" {
		t.Errorf("Expected tax name GST, got %s", requirements.TaxName)
	}

	if requirements.CountryCode != "AU" {
		t.Errorf("Expected country code AU, got %s", requirements.CountryCode)
	}

	if requirements.MinimumThreshold != 82.50 {
		t.Errorf("Expected threshold 82.50, got %f", requirements.MinimumThreshold)
	}

	if len(requirements.RequiredFields) == 0 {
		t.Error("Expected required fields but got none")
	}
}

func TestTaxService_GetTaxInfo(t *testing.T) {
	service, err := NewTaxServiceForCountry("AU")
	if err != nil {
		t.Fatal(err)
	}

	info := service.GetTaxInfo(context.Background())

	if info == nil {
		t.Fatal("Info is nil")
	}

	if info.TaxName != "GST" {
		t.Errorf("Expected tax name GST, got %s", info.TaxName)
	}

	if info.TaxRate != 0.10 {
		t.Errorf("Expected tax rate 0.10, got %f", info.TaxRate)
	}

	if info.CountryCode != "AU" {
		t.Errorf("Expected country code AU, got %s", info.CountryCode)
	}

	if info.RegistrationThreshold != 75000.00 {
		t.Errorf("Expected registration threshold 75000.00, got %f", info.RegistrationThreshold)
	}

	if info.TaxInvoiceThreshold != 82.50 {
		t.Errorf("Expected tax invoice threshold 82.50, got %f", info.TaxInvoiceThreshold)
	}
}

func TestTaxService_ValidateReceiptForTaxCompliance(t *testing.T) {
	service, err := NewTaxServiceForCountry("AU")
	if err != nil {
		t.Fatal(err)
	}

	tests := []struct {
		name              string
		request           *TaxComplianceValidationRequest
		wantErr           bool
		expectedCompliant bool
		expectedErrors    int
		expectedWarnings  int
	}{
		{
			name: "compliant tax invoice",
			request: &TaxComplianceValidationRequest{
				TotalAmount:            100.00,
				TaxAmount:              10.00,
				ForceTaxInvoice:        false,
				SellerBusinessNumber:   "51 824 753 556",
				CustomerBusinessNumber: "",
				CustomerName:           "John Doe",
				InvoiceDate:            time.Now(),
				LineItemDescriptions:   []string{"Test item"},
			},
			wantErr:           false,
			expectedCompliant: true,
			expectedErrors:    0,
			expectedWarnings:  0,
		},
		{
			name: "non-compliant - missing seller ABN for tax invoice",
			request: &TaxComplianceValidationRequest{
				TotalAmount:            100.00,
				TaxAmount:              10.00,
				ForceTaxInvoice:        false,
				SellerBusinessNumber:   "",
				CustomerBusinessNumber: "",
				CustomerName:           "John Doe",
				InvoiceDate:            time.Now(),
				LineItemDescriptions:   []string{"Test item"},
			},
			wantErr:           false,
			expectedCompliant: false,
			expectedErrors:    1,
			expectedWarnings:  0,
		},
		{
			name: "non-compliant - invalid seller ABN",
			request: &TaxComplianceValidationRequest{
				TotalAmount:            100.00,
				TaxAmount:              10.00,
				ForceTaxInvoice:        false,
				SellerBusinessNumber:   "51 824 753 557", // Invalid check digit
				CustomerBusinessNumber: "",
				CustomerName:           "John Doe",
				InvoiceDate:            time.Now(),
				LineItemDescriptions:   []string{"Test item"},
			},
			wantErr:           false,
			expectedCompliant: false,
			expectedErrors:    1,
			expectedWarnings:  0,
		},
		{
			name: "compliant regular receipt below threshold",
			request: &TaxComplianceValidationRequest{
				TotalAmount:            50.00,
				TaxAmount:              5.00,
				ForceTaxInvoice:        false,
				SellerBusinessNumber:   "51 824 753 556",
				CustomerBusinessNumber: "",
				CustomerName:           "John Doe",
				InvoiceDate:            time.Now(),
				LineItemDescriptions:   []string{"Test item"},
			},
			wantErr:           false,
			expectedCompliant: true,
			expectedErrors:    0,
			expectedWarnings:  1, // Warning about being below threshold
		},
		{
			name: "warning for amount close to threshold",
			request: &TaxComplianceValidationRequest{
				TotalAmount:            85.00, // Close to 82.50 threshold
				TaxAmount:              7.73,
				ForceTaxInvoice:        false,
				SellerBusinessNumber:   "51 824 753 556",
				CustomerBusinessNumber: "",
				CustomerName:           "John Doe",
				InvoiceDate:            time.Now(),
				LineItemDescriptions:   []string{"Test item"},
			},
			wantErr:           false,
			expectedCompliant: true,
			expectedErrors:    0,
			expectedWarnings:  1, // Warning about being close to threshold
		},
		{
			name:    "nil request",
			request: nil,
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := service.ValidateReceiptForTaxCompliance(context.Background(), tt.request)

			if tt.wantErr {
				if err == nil {
					t.Error("Expected error but got none")
				}
				return
			}

			if err != nil {
				t.Errorf("Unexpected error: %v", err)
				return
			}

			if result == nil {
				t.Fatal("Result is nil")
			}

			if result.IsCompliant != tt.expectedCompliant {
				t.Errorf("IsCompliant = %v, expected %v", result.IsCompliant, tt.expectedCompliant)
			}

			if len(result.Errors) != tt.expectedErrors {
				t.Errorf("Expected %d errors, got %d: %v", tt.expectedErrors, len(result.Errors), result.Errors)
			}

			if len(result.Warnings) != tt.expectedWarnings {
				t.Errorf("Expected %d warnings, got %d: %v", tt.expectedWarnings, len(result.Warnings), result.Warnings)
			}
		})
	}
}

func TestTaxService_GetCurrencySymbol(t *testing.T) {
	tests := []struct {
		countryCode    string
		expectedSymbol string
	}{
		{"AU", "$"},
		{"GB", "£"},
		{"US", "$"},
	}

	for _, tt := range tests {
		t.Run(tt.countryCode, func(t *testing.T) {
			service, err := NewTaxServiceForCountry(tt.countryCode)
			if err != nil {
				t.Fatal(err)
			}

			symbol := service.getCurrencySymbol()
			if symbol != tt.expectedSymbol {
				t.Errorf("Expected currency symbol %s, got %s", tt.expectedSymbol, symbol)
			}
		})
	}
}

// TestTaxService_RealWorldScenarios tests real-world bakery scenarios
func TestTaxService_RealWorldScenarios(t *testing.T) {
	service, err := NewTaxServiceForCountry("AU")
	if err != nil {
		t.Fatal(err)
	}

	scenarios := []struct {
		name        string
		description string
		request     *CalculateReceiptRequest
		expectedTax bool
	}{
		{
			name:        "small bakery purchase",
			description: "Customer buys a few items under tax invoice threshold",
			request: &CalculateReceiptRequest{
				LineItems: []ReceiptLineItem{
					{Quantity: 2, UnitPrice: 5.50, TaxApplicable: true, Description: "Sourdough bread"},
					{Quantity: 1, UnitPrice: 15.00, TaxApplicable: true, Description: "Birthday cake"},
					{Quantity: 3, UnitPrice: 3.50, TaxApplicable: true, Description: "Croissants"},
				},
				ForceTaxInvoice: false,
			},
			expectedTax: false, // Total: $36.50, below $82.50 threshold
		},
		{
			name:        "large catering order",
			description: "Business customer orders catering for event",
			request: &CalculateReceiptRequest{
				LineItems: []ReceiptLineItem{
					{Quantity: 10, UnitPrice: 25.00, TaxApplicable: true, Description: "Large celebration cakes"},
					{Quantity: 50, UnitPrice: 2.50, TaxApplicable: true, Description: "Individual pastries"},
					{Quantity: 20, UnitPrice: 4.00, TaxApplicable: true, Description: "Gourmet sandwiches"},
				},
				ForceTaxInvoice: false,
			},
			expectedTax: true, // Total: $455.00, well above threshold
		},
		{
			name:        "mixed taxable and non-taxable",
			description: "Purchase with both GST-applicable and GST-free items",
			request: &CalculateReceiptRequest{
				LineItems: []ReceiptLineItem{
					{Quantity: 1, UnitPrice: 50.00, TaxApplicable: true, Description: "Custom wedding cake"},
					{Quantity: 2, UnitPrice: 8.00, TaxApplicable: false, Description: "Basic bread (GST-free)"},
					{Quantity: 1, UnitPrice: 25.00, TaxApplicable: true, Description: "Decorated cupcakes"},
				},
				ForceTaxInvoice: false,
			},
			expectedTax: true, // Total: $91.00 (with GST), above threshold
		},
	}

	for _, scenario := range scenarios {
		t.Run(scenario.name, func(t *testing.T) {
			result, err := service.CalculateReceiptTotals(context.Background(), scenario.request)
			if err != nil {
				t.Errorf("Unexpected error: %v", err)
				return
			}

			if result.IsTaxInvoice != scenario.expectedTax {
				t.Errorf("Scenario '%s': expected tax invoice = %v, got %v (total: $%.2f)",
					scenario.description, scenario.expectedTax, result.IsTaxInvoice, result.TotalInclTax)
			}

			t.Logf("Scenario '%s': Subtotal: $%.2f, GST: $%.2f, Total: $%.2f, Tax Invoice: %v",
				scenario.description, result.SubtotalExclTax, result.TaxAmount, result.TotalInclTax, result.IsTaxInvoice)
		})
	}
}
