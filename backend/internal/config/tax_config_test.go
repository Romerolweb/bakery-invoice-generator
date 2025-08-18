package config

import (
	"os"
	"testing"
)

func TestLoadTaxSystemConfig(t *testing.T) {
	// Save original environment
	originalEnv := make(map[string]string)
	envVars := []string{
		"TAX_COUNTRY_CODE",
		"TAX_CUSTOM_RATE",
		"TAX_CUSTOM_THRESHOLD",
		"TAX_FORCE_BUSINESS_NUMBERS",
		"TAX_ENABLE_VALIDATION",
		"TAX_DEFAULT_APPLICABLE",
	}

	for _, key := range envVars {
		originalEnv[key] = os.Getenv(key)
		os.Unsetenv(key)
	}

	// Restore environment after test
	defer func() {
		for key, value := range originalEnv {
			if value != "" {
				os.Setenv(key, value)
			} else {
				os.Unsetenv(key)
			}
		}
	}()

	tests := []struct {
		name    string
		envVars map[string]string
		wantErr bool
		check   func(*TaxSystemConfig) error
	}{
		{
			name:    "default configuration",
			envVars: map[string]string{},
			wantErr: false,
			check: func(config *TaxSystemConfig) error {
				if config.CountryCode != "AU" {
					t.Errorf("Expected default country code AU, got %s", config.CountryCode)
				}
				if config.ForceBusinessNumbers != false {
					t.Errorf("Expected default ForceBusinessNumbers false, got %v", config.ForceBusinessNumbers)
				}
				if config.EnableTaxValidation != true {
					t.Errorf("Expected default EnableTaxValidation true, got %v", config.EnableTaxValidation)
				}
				if config.DefaultTaxApplicable != true {
					t.Errorf("Expected default DefaultTaxApplicable true, got %v", config.DefaultTaxApplicable)
				}
				return nil
			},
		},
		{
			name: "custom configuration",
			envVars: map[string]string{
				"TAX_COUNTRY_CODE":           "GB",
				"TAX_CUSTOM_RATE":            "0.15",
				"TAX_CUSTOM_THRESHOLD":       "100.00",
				"TAX_FORCE_BUSINESS_NUMBERS": "true",
				"TAX_ENABLE_VALIDATION":      "false",
				"TAX_DEFAULT_APPLICABLE":     "false",
			},
			wantErr: false,
			check: func(config *TaxSystemConfig) error {
				if config.CountryCode != "GB" {
					t.Errorf("Expected country code GB, got %s", config.CountryCode)
				}
				if config.CustomTaxRate != 0.15 {
					t.Errorf("Expected custom tax rate 0.15, got %f", config.CustomTaxRate)
				}
				if config.CustomThreshold != 100.00 {
					t.Errorf("Expected custom threshold 100.00, got %f", config.CustomThreshold)
				}
				if config.ForceBusinessNumbers != true {
					t.Errorf("Expected ForceBusinessNumbers true, got %v", config.ForceBusinessNumbers)
				}
				if config.EnableTaxValidation != false {
					t.Errorf("Expected EnableTaxValidation false, got %v", config.EnableTaxValidation)
				}
				if config.DefaultTaxApplicable != false {
					t.Errorf("Expected DefaultTaxApplicable false, got %v", config.DefaultTaxApplicable)
				}
				return nil
			},
		},
		{
			name: "invalid custom rate - too high",
			envVars: map[string]string{
				"TAX_CUSTOM_RATE": "1.5",
			},
			wantErr: true,
		},
		{
			name: "invalid custom rate - negative",
			envVars: map[string]string{
				"TAX_CUSTOM_RATE": "-0.1",
			},
			wantErr: true,
		},
		{
			name: "invalid custom rate - not a number",
			envVars: map[string]string{
				"TAX_CUSTOM_RATE": "invalid",
			},
			wantErr: true,
		},
		{
			name: "invalid custom threshold - negative",
			envVars: map[string]string{
				"TAX_CUSTOM_THRESHOLD": "-50.00",
			},
			wantErr: true,
		},
		{
			name: "invalid custom threshold - not a number",
			envVars: map[string]string{
				"TAX_CUSTOM_THRESHOLD": "invalid",
			},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Set environment variables
			for key, value := range tt.envVars {
				os.Setenv(key, value)
			}

			config, err := LoadTaxSystemConfig()

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

			if config == nil {
				t.Fatal("Config is nil")
			}

			if tt.check != nil {
				if err := tt.check(config); err != nil {
					t.Errorf("Check failed: %v", err)
				}
			}

			// Clean up environment variables
			for key := range tt.envVars {
				os.Unsetenv(key)
			}
		})
	}
}

func TestTaxSystemConfig_CreateTaxService(t *testing.T) {
	tests := []struct {
		name    string
		config  *TaxSystemConfig
		wantErr bool
	}{
		{
			name: "valid Australian config",
			config: &TaxSystemConfig{
				CountryCode: "AU",
			},
			wantErr: false,
		},
		{
			name: "valid UK config",
			config: &TaxSystemConfig{
				CountryCode: "GB",
			},
			wantErr: false,
		},
		{
			name: "valid US config",
			config: &TaxSystemConfig{
				CountryCode: "US",
			},
			wantErr: false,
		},
		{
			name: "invalid country code",
			config: &TaxSystemConfig{
				CountryCode: "INVALID",
			},
			wantErr: true,
		},
		{
			name: "config with custom overrides",
			config: &TaxSystemConfig{
				CountryCode:     "AU",
				CustomTaxRate:   0.12,
				CustomThreshold: 50.00,
			},
			wantErr: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			service, err := tt.config.CreateTaxService()

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
		})
	}
}

func TestTaxSystemConfig_ValidateConfig(t *testing.T) {
	tests := []struct {
		name    string
		config  *TaxSystemConfig
		wantErr bool
	}{
		{
			name: "valid config",
			config: &TaxSystemConfig{
				CountryCode:     "AU",
				CustomTaxRate:   0.12,
				CustomThreshold: 50.00,
			},
			wantErr: false,
		},
		{
			name: "empty country code",
			config: &TaxSystemConfig{
				CountryCode: "",
			},
			wantErr: true,
		},
		{
			name: "invalid country code",
			config: &TaxSystemConfig{
				CountryCode: "INVALID",
			},
			wantErr: true,
		},
		{
			name: "invalid custom tax rate - too high",
			config: &TaxSystemConfig{
				CountryCode:   "AU",
				CustomTaxRate: 1.5,
			},
			wantErr: true,
		},
		{
			name: "invalid custom tax rate - negative",
			config: &TaxSystemConfig{
				CountryCode:   "AU",
				CustomTaxRate: -0.1,
			},
			wantErr: true,
		},
		{
			name: "invalid custom threshold - negative",
			config: &TaxSystemConfig{
				CountryCode:     "AU",
				CustomThreshold: -50.00,
			},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.config.ValidateConfig()

			if tt.wantErr {
				if err == nil {
					t.Error("Expected error but got none")
				}
			} else {
				if err != nil {
					t.Errorf("Unexpected error: %v", err)
				}
			}
		})
	}
}

func TestGetSupportedCountries(t *testing.T) {
	countries := GetSupportedCountries()

	if len(countries) == 0 {
		t.Fatal("No supported countries returned")
	}

	// Check that we have the expected countries
	expectedCodes := []string{"AU", "GB", "US"}
	foundCodes := make(map[string]bool)

	for _, country := range countries {
		foundCodes[country.Code] = true

		// Validate country info
		if country.Name == "" {
			t.Errorf("Country %s has empty name", country.Code)
		}
		if country.TaxName == "" {
			t.Errorf("Country %s has empty tax name", country.Code)
		}
		if country.TaxRate <= 0 {
			t.Errorf("Country %s has invalid tax rate: %f", country.Code, country.TaxRate)
		}
		if country.Currency == "" {
			t.Errorf("Country %s has empty currency", country.Code)
		}
		if country.CurrencySymbol == "" {
			t.Errorf("Country %s has empty currency symbol", country.Code)
		}
	}

	for _, expectedCode := range expectedCodes {
		if !foundCodes[expectedCode] {
			t.Errorf("Expected country code %s not found", expectedCode)
		}
	}
}

func TestCustomTaxConfig(t *testing.T) {
	// Create a base Australian config
	baseConfig := &mockTaxConfig{
		taxRate:     0.10,
		threshold:   82.50,
		taxName:     "GST",
		countryCode: "AU",
	}

	// Create custom config with overrides
	customConfig := &CustomTaxConfig{
		baseConfig:      baseConfig,
		customTaxRate:   0.15,
		customThreshold: 100.00,
	}

	// Test custom tax rate override
	if customConfig.GetTaxRate() != 0.15 {
		t.Errorf("Expected custom tax rate 0.15, got %f", customConfig.GetTaxRate())
	}

	// Test custom threshold override
	if customConfig.GetTaxInvoiceThreshold() != 100.00 {
		t.Errorf("Expected custom threshold 100.00, got %f", customConfig.GetTaxInvoiceThreshold())
	}

	// Test that base config values are used when no override
	if customConfig.GetTaxName() != "GST" {
		t.Errorf("Expected tax name GST, got %s", customConfig.GetTaxName())
	}

	if customConfig.GetCountryCode() != "AU" {
		t.Errorf("Expected country code AU, got %s", customConfig.GetCountryCode())
	}

	// Test tax calculation with custom rate
	tax := customConfig.CalculateTax(100.00, true)
	expected := 15.00 // 100 * 0.15
	if tax != expected {
		t.Errorf("Expected tax %f, got %f", expected, tax)
	}

	// Test tax invoice requirement with custom threshold
	if !customConfig.IsTaxInvoiceRequired(100.00, false) {
		t.Error("Expected tax invoice to be required for amount at custom threshold")
	}

	if customConfig.IsTaxInvoiceRequired(99.99, false) {
		t.Error("Expected tax invoice not to be required for amount below custom threshold")
	}
}

func TestGetTaxConfigurationGuide(t *testing.T) {
	guide := GetTaxConfigurationGuide()

	if guide == nil {
		t.Fatal("Configuration guide is nil")
	}

	if len(guide.EnvironmentVariables) == 0 {
		t.Error("No environment variables in guide")
	}

	if len(guide.Examples) == 0 {
		t.Error("No examples in guide")
	}

	if len(guide.SupportedCountries) == 0 {
		t.Error("No supported countries in guide")
	}

	// Validate environment variables
	for _, envVar := range guide.EnvironmentVariables {
		if envVar.Name == "" {
			t.Error("Environment variable has empty name")
		}
		if envVar.Description == "" {
			t.Error("Environment variable has empty description")
		}
	}

	// Validate examples
	for _, example := range guide.Examples {
		if example.Name == "" {
			t.Error("Example has empty name")
		}
		if example.Description == "" {
			t.Error("Example has empty description")
		}
		if len(example.EnvVars) == 0 {
			t.Error("Example has no environment variables")
		}
	}
}

func TestGetEnvHelpers(t *testing.T) {
	// Test getEnvWithDefault
	os.Setenv("TEST_VAR", "test_value")
	defer os.Unsetenv("TEST_VAR")

	if getEnvWithDefault("TEST_VAR", "default") != "test_value" {
		t.Error("getEnvWithDefault should return environment value")
	}

	if getEnvWithDefault("NONEXISTENT_VAR", "default") != "default" {
		t.Error("getEnvWithDefault should return default for nonexistent var")
	}

	// Test getEnvBoolWithDefault
	testCases := []struct {
		value    string
		expected bool
	}{
		{"true", true},
		{"1", true},
		{"yes", true},
		{"on", true},
		{"TRUE", true},
		{"false", false},
		{"0", false},
		{"no", false},
		{"off", false},
		{"FALSE", false},
		{"invalid", true}, // Should return default for invalid values
	}

	for _, tc := range testCases {
		os.Setenv("TEST_BOOL_VAR", tc.value)
		result := getEnvBoolWithDefault("TEST_BOOL_VAR", true)
		if result != tc.expected {
			t.Errorf("getEnvBoolWithDefault(%s) = %v, expected %v", tc.value, result, tc.expected)
		}
	}

	os.Unsetenv("TEST_BOOL_VAR")

	// Test default value when env var doesn't exist
	if getEnvBoolWithDefault("NONEXISTENT_BOOL_VAR", false) != false {
		t.Error("getEnvBoolWithDefault should return default for nonexistent var")
	}
}

// mockTaxConfig is a simple mock implementation for testing
type mockTaxConfig struct {
	taxRate     float64
	threshold   float64
	taxName     string
	countryCode string
}

func (m *mockTaxConfig) GetTaxRate() float64 {
	return m.taxRate
}

func (m *mockTaxConfig) GetRegistrationThreshold() float64 {
	return 75000.00
}

func (m *mockTaxConfig) GetTaxInvoiceThreshold() float64 {
	return m.threshold
}

func (m *mockTaxConfig) GetTaxName() string {
	return m.taxName
}

func (m *mockTaxConfig) GetCountryCode() string {
	return m.countryCode
}

func (m *mockTaxConfig) ValidateBusinessNumber(businessNumber string) error {
	return nil
}

func (m *mockTaxConfig) CalculateTax(amount float64, taxApplicable bool) float64 {
	if !taxApplicable {
		return 0
	}
	return roundMoney(amount * m.taxRate)
}

func (m *mockTaxConfig) IsTaxInvoiceRequired(totalAmount float64, forceTaxInvoice bool) bool {
	return totalAmount >= m.threshold || forceTaxInvoice
}

func (m *mockTaxConfig) GetRequiredTaxInvoiceFields() []string {
	return []string{"test_field"}
}
