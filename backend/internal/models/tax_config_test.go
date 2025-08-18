package models

import (
	"testing"
	"time"
)

func TestAustralianGSTConfig_GetTaxRate(t *testing.T) {
	config := &AustralianGSTConfig{}

	expected := 0.10
	actual := config.GetTaxRate()

	if actual != expected {
		t.Errorf("Expected GST rate %f, got %f", expected, actual)
	}
}

func TestAustralianGSTConfig_GetRegistrationThreshold(t *testing.T) {
	config := &AustralianGSTConfig{}

	expected := 75000.00
	actual := config.GetRegistrationThreshold()

	if actual != expected {
		t.Errorf("Expected registration threshold %f, got %f", expected, actual)
	}
}

func TestAustralianGSTConfig_GetTaxInvoiceThreshold(t *testing.T) {
	config := &AustralianGSTConfig{}

	expected := 82.50
	actual := config.GetTaxInvoiceThreshold()

	if actual != expected {
		t.Errorf("Expected tax invoice threshold %f, got %f", expected, actual)
	}
}

func TestAustralianGSTConfig_ValidateBusinessNumber(t *testing.T) {
	config := &AustralianGSTConfig{}

	tests := []struct {
		name    string
		abn     string
		wantErr bool
	}{
		{
			name:    "valid ABN with spaces",
			abn:     "51 824 753 556",
			wantErr: false,
		},
		{
			name:    "valid ABN without spaces",
			abn:     "51824753556",
			wantErr: false,
		},
		{
			name:    "empty ABN (allowed for individuals)",
			abn:     "",
			wantErr: false,
		},
		{
			name:    "invalid ABN - too short",
			abn:     "5182475355",
			wantErr: true,
		},
		{
			name:    "invalid ABN - too long",
			abn:     "518247535567",
			wantErr: true,
		},
		{
			name:    "invalid ABN - contains letters",
			abn:     "51824753ABC",
			wantErr: true,
		},
		{
			name:    "invalid ABN - wrong check digit",
			abn:     "51824753557",
			wantErr: true,
		},
		{
			name:    "another valid ABN",
			abn:     "53 004 085 616",
			wantErr: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := config.ValidateBusinessNumber(tt.abn)
			if (err != nil) != tt.wantErr {
				t.Errorf("ValidateBusinessNumber() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}

func TestAustralianGSTConfig_CalculateTax(t *testing.T) {
	config := &AustralianGSTConfig{}

	tests := []struct {
		name          string
		amount        float64
		taxApplicable bool
		expected      float64
	}{
		{
			name:          "GST applicable - simple amount",
			amount:        100.00,
			taxApplicable: true,
			expected:      10.00,
		},
		{
			name:          "GST not applicable",
			amount:        100.00,
			taxApplicable: false,
			expected:      0.00,
		},
		{
			name:          "GST applicable - amount with rounding",
			amount:        33.33,
			taxApplicable: true,
			expected:      3.33,
		},
		{
			name:          "GST applicable - small amount",
			amount:        1.00,
			taxApplicable: true,
			expected:      0.10,
		},
		{
			name:          "GST applicable - zero amount",
			amount:        0.00,
			taxApplicable: true,
			expected:      0.00,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			actual := config.CalculateTax(tt.amount, tt.taxApplicable)
			if actual != tt.expected {
				t.Errorf("CalculateTax() = %f, expected %f", actual, tt.expected)
			}
		})
	}
}

func TestAustralianGSTConfig_IsTaxInvoiceRequired(t *testing.T) {
	config := &AustralianGSTConfig{}

	tests := []struct {
		name            string
		totalAmount     float64
		forceTaxInvoice bool
		expected        bool
	}{
		{
			name:            "amount above threshold",
			totalAmount:     100.00,
			forceTaxInvoice: false,
			expected:        true,
		},
		{
			name:            "amount exactly at threshold",
			totalAmount:     82.50,
			forceTaxInvoice: false,
			expected:        true,
		},
		{
			name:            "amount below threshold",
			totalAmount:     50.00,
			forceTaxInvoice: false,
			expected:        false,
		},
		{
			name:            "amount below threshold but forced",
			totalAmount:     50.00,
			forceTaxInvoice: true,
			expected:        true,
		},
		{
			name:            "zero amount but forced",
			totalAmount:     0.00,
			forceTaxInvoice: true,
			expected:        true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			actual := config.IsTaxInvoiceRequired(tt.totalAmount, tt.forceTaxInvoice)
			if actual != tt.expected {
				t.Errorf("IsTaxInvoiceRequired() = %v, expected %v", actual, tt.expected)
			}
		})
	}
}

func TestAustralianGSTConfig_GetRequiredTaxInvoiceFields(t *testing.T) {
	config := &AustralianGSTConfig{}

	fields := config.GetRequiredTaxInvoiceFields()

	expectedFields := []string{
		"seller_abn",
		"invoice_date",
		"customer_details",
		"description_of_goods",
		"gst_amount",
		"total_amount",
		"tax_invoice_label",
	}

	if len(fields) != len(expectedFields) {
		t.Errorf("Expected %d fields, got %d", len(expectedFields), len(fields))
	}

	for i, expected := range expectedFields {
		if i >= len(fields) || fields[i] != expected {
			t.Errorf("Expected field %d to be %s, got %s", i, expected, fields[i])
		}
	}
}

func TestUKVATConfig(t *testing.T) {
	config := &UKVATConfig{}

	// Test basic properties
	if config.GetTaxRate() != 0.20 {
		t.Errorf("Expected UK VAT rate 0.20, got %f", config.GetTaxRate())
	}

	if config.GetTaxName() != "VAT" {
		t.Errorf("Expected tax name VAT, got %s", config.GetTaxName())
	}

	if config.GetCountryCode() != "GB" {
		t.Errorf("Expected country code GB, got %s", config.GetCountryCode())
	}

	// Test VAT number validation
	tests := []struct {
		vatNumber string
		wantErr   bool
	}{
		{"123456789", false},
		{"", false},          // Empty is allowed
		{"12345678", true},   // Too short
		{"1234567890", true}, // Too long
		{"12345678A", true},  // Contains letter
	}

	for _, tt := range tests {
		err := config.ValidateBusinessNumber(tt.vatNumber)
		if (err != nil) != tt.wantErr {
			t.Errorf("ValidateBusinessNumber(%s) error = %v, wantErr %v", tt.vatNumber, err, tt.wantErr)
		}
	}
}

func TestUSSalesTaxConfig(t *testing.T) {
	config := &USSalesTaxConfig{StateRate: 0.08}

	// Test basic properties
	if config.GetTaxRate() != 0.08 {
		t.Errorf("Expected US sales tax rate 0.08, got %f", config.GetTaxRate())
	}

	if config.GetTaxName() != "Sales Tax" {
		t.Errorf("Expected tax name 'Sales Tax', got %s", config.GetTaxName())
	}

	if config.GetCountryCode() != "US" {
		t.Errorf("Expected country code US, got %s", config.GetCountryCode())
	}

	// Test EIN validation
	tests := []struct {
		ein     string
		wantErr bool
	}{
		{"12-3456789", false},
		{"", false},           // Empty is allowed
		{"123456789", true},   // Wrong format
		{"12-345678", true},   // Too short
		{"12-34567890", true}, // Too long
	}

	for _, tt := range tests {
		err := config.ValidateBusinessNumber(tt.ein)
		if (err != nil) != tt.wantErr {
			t.Errorf("ValidateBusinessNumber(%s) error = %v, wantErr %v", tt.ein, err, tt.wantErr)
		}
	}
}

func TestNewTaxConfig(t *testing.T) {
	tests := []struct {
		countryCode string
		wantType    string
		wantErr     bool
	}{
		{"AU", "AustralianGSTConfig", false},
		{"AUS", "AustralianGSTConfig", false},
		{"AUSTRALIA", "AustralianGSTConfig", false},
		{"GB", "UKVATConfig", false},
		{"UK", "UKVATConfig", false},
		{"UNITED_KINGDOM", "UKVATConfig", false},
		{"US", "USSalesTaxConfig", false},
		{"USA", "USSalesTaxConfig", false},
		{"UNITED_STATES", "USSalesTaxConfig", false},
		{"INVALID", "", true},
		{"", "", true},
	}

	for _, tt := range tests {
		t.Run(tt.countryCode, func(t *testing.T) {
			config, err := NewTaxConfig(tt.countryCode)

			if tt.wantErr {
				if err == nil {
					t.Errorf("NewTaxConfig() expected error for country code %s", tt.countryCode)
				}
				return
			}

			if err != nil {
				t.Errorf("NewTaxConfig() unexpected error: %v", err)
				return
			}

			if config == nil {
				t.Errorf("NewTaxConfig() returned nil config")
				return
			}

			// Verify the correct type was returned by checking country code
			switch tt.wantType {
			case "AustralianGSTConfig":
				if config.GetCountryCode() != "AU" {
					t.Errorf("Expected Australian config, got country code %s", config.GetCountryCode())
				}
			case "UKVATConfig":
				if config.GetCountryCode() != "GB" {
					t.Errorf("Expected UK config, got country code %s", config.GetCountryCode())
				}
			case "USSalesTaxConfig":
				if config.GetCountryCode() != "US" {
					t.Errorf("Expected US config, got country code %s", config.GetCountryCode())
				}
			}
		})
	}
}

func TestRoundMoney(t *testing.T) {
	tests := []struct {
		name     string
		amount   float64
		expected float64
	}{
		{
			name:     "already rounded",
			amount:   10.50,
			expected: 10.50,
		},
		{
			name:     "round up",
			amount:   10.556,
			expected: 10.56,
		},
		{
			name:     "round down",
			amount:   10.554,
			expected: 10.55,
		},
		{
			name:     "round exactly half up",
			amount:   10.555,
			expected: 10.56,
		},
		{
			name:     "zero",
			amount:   0.0,
			expected: 0.0,
		},
		{
			name:     "negative amount",
			amount:   -10.556,
			expected: -10.56,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			actual := roundMoney(tt.amount)
			if actual != tt.expected {
				t.Errorf("roundMoney(%f) = %f, expected %f", tt.amount, actual, tt.expected)
			}
		})
	}
}

func TestCalculateReceiptTotals(t *testing.T) {
	config := &AustralianGSTConfig{}

	tests := []struct {
		name             string
		lineItems        []LineItemCalculation
		forceTaxInvoice  bool
		expectedSubtotal float64
		expectedTax      float64
		expectedTotal    float64
		expectedIsTax    bool
	}{
		{
			name: "single item with GST",
			lineItems: []LineItemCalculation{
				{Quantity: 1, UnitPrice: 100.00, TaxApplicable: true},
			},
			forceTaxInvoice:  false,
			expectedSubtotal: 100.00,
			expectedTax:      10.00,
			expectedTotal:    110.00,
			expectedIsTax:    true, // Above $82.50 threshold
		},
		{
			name: "single item without GST",
			lineItems: []LineItemCalculation{
				{Quantity: 1, UnitPrice: 50.00, TaxApplicable: false},
			},
			forceTaxInvoice:  false,
			expectedSubtotal: 50.00,
			expectedTax:      0.00,
			expectedTotal:    50.00,
			expectedIsTax:    false, // Below threshold and no GST
		},
		{
			name: "multiple items mixed GST",
			lineItems: []LineItemCalculation{
				{Quantity: 2, UnitPrice: 25.00, TaxApplicable: true},  // $50 with $5 GST
				{Quantity: 1, UnitPrice: 30.00, TaxApplicable: false}, // $30 no GST
			},
			forceTaxInvoice:  false,
			expectedSubtotal: 80.00,
			expectedTax:      5.00,
			expectedTotal:    85.00,
			expectedIsTax:    true, // Above $82.50 threshold
		},
		{
			name: "below threshold but forced tax invoice",
			lineItems: []LineItemCalculation{
				{Quantity: 1, UnitPrice: 50.00, TaxApplicable: true},
			},
			forceTaxInvoice:  true,
			expectedSubtotal: 50.00,
			expectedTax:      5.00,
			expectedTotal:    55.00,
			expectedIsTax:    true, // Forced tax invoice
		},
		{
			name: "exactly at threshold",
			lineItems: []LineItemCalculation{
				{Quantity: 1, UnitPrice: 75.00, TaxApplicable: true},
			},
			forceTaxInvoice:  false,
			expectedSubtotal: 75.00,
			expectedTax:      7.50,
			expectedTotal:    82.50,
			expectedIsTax:    true, // Exactly at threshold
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := CalculateReceiptTotals(config, tt.lineItems, tt.forceTaxInvoice)

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

			if result.TaxName != "GST" {
				t.Errorf("TaxName = %s, expected GST", result.TaxName)
			}

			// Check that CalculatedAt is recent (within last minute)
			if time.Since(result.CalculatedAt) > time.Minute {
				t.Errorf("CalculatedAt is too old: %v", result.CalculatedAt)
			}
		})
	}
}

// TestABNValidationWithRealExamples tests ABN validation with real Australian business numbers
func TestABNValidationWithRealExamples(t *testing.T) {
	config := &AustralianGSTConfig{}

	// These are publicly available ABNs from the ATO website examples
	validABNs := []string{
		"51 824 753 556", // Example from ATO website
		"53 004 085 616", // Another ATO example
		"11 222 333 444", // Calculated valid ABN
	}

	for _, abn := range validABNs {
		t.Run("valid_"+abn, func(t *testing.T) {
			err := config.ValidateBusinessNumber(abn)
			if err != nil {
				t.Errorf("Expected ABN %s to be valid, got error: %v", abn, err)
			}
		})
	}
}

// TestGSTCalculationAccuracy tests GST calculations for accuracy with various amounts
func TestGSTCalculationAccuracy(t *testing.T) {
	config := &AustralianGSTConfig{}

	tests := []struct {
		name     string
		amount   float64
		expected float64
	}{
		{"$1.00", 1.00, 0.10},
		{"$10.00", 10.00, 1.00},
		{"$33.33", 33.33, 3.33},
		{"$99.99", 99.99, 10.00}, // Rounded from 9.999
		{"$0.01", 0.01, 0.00},    // Rounded from 0.001
		{"$0.05", 0.05, 0.01},    // Rounded from 0.005
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			actual := config.CalculateTax(tt.amount, true)
			if actual != tt.expected {
				t.Errorf("GST on %s: expected %f, got %f", tt.name, tt.expected, actual)
			}
		})
	}
}
