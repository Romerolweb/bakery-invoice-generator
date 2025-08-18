package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"

	"bakery-invoice-api/internal/models"
	"bakery-invoice-api/internal/services"
)

// TaxSystemConfig holds configuration for the tax system
type TaxSystemConfig struct {
	CountryCode          string  `json:"country_code" env:"TAX_COUNTRY_CODE" default:"AU"`
	CustomTaxRate        float64 `json:"custom_tax_rate,omitempty" env:"TAX_CUSTOM_RATE"`
	CustomThreshold      float64 `json:"custom_threshold,omitempty" env:"TAX_CUSTOM_THRESHOLD"`
	ForceBusinessNumbers bool    `json:"force_business_numbers" env:"TAX_FORCE_BUSINESS_NUMBERS" default:"false"`
	EnableTaxValidation  bool    `json:"enable_tax_validation" env:"TAX_ENABLE_VALIDATION" default:"true"`
	DefaultTaxApplicable bool    `json:"default_tax_applicable" env:"TAX_DEFAULT_APPLICABLE" default:"true"`
}

// LoadTaxSystemConfig loads tax system configuration from environment variables
func LoadTaxSystemConfig() (*TaxSystemConfig, error) {
	config := &TaxSystemConfig{
		CountryCode:          getEnvWithDefault("TAX_COUNTRY_CODE", "AU"),
		ForceBusinessNumbers: getEnvBoolWithDefault("TAX_FORCE_BUSINESS_NUMBERS", false),
		EnableTaxValidation:  getEnvBoolWithDefault("TAX_ENABLE_VALIDATION", true),
		DefaultTaxApplicable: getEnvBoolWithDefault("TAX_DEFAULT_APPLICABLE", true),
	}

	// Load custom tax rate if specified
	if customRate := os.Getenv("TAX_CUSTOM_RATE"); customRate != "" {
		rate, err := strconv.ParseFloat(customRate, 64)
		if err != nil {
			return nil, fmt.Errorf("invalid TAX_CUSTOM_RATE: %w", err)
		}
		if rate < 0 || rate > 1 {
			return nil, fmt.Errorf("TAX_CUSTOM_RATE must be between 0 and 1, got %f", rate)
		}
		config.CustomTaxRate = rate
	}

	// Load custom threshold if specified
	if customThreshold := os.Getenv("TAX_CUSTOM_THRESHOLD"); customThreshold != "" {
		threshold, err := strconv.ParseFloat(customThreshold, 64)
		if err != nil {
			return nil, fmt.Errorf("invalid TAX_CUSTOM_THRESHOLD: %w", err)
		}
		if threshold < 0 {
			return nil, fmt.Errorf("TAX_CUSTOM_THRESHOLD must be non-negative, got %f", threshold)
		}
		config.CustomThreshold = threshold
	}

	return config, nil
}

// CreateTaxService creates a tax service based on the configuration
func (c *TaxSystemConfig) CreateTaxService() (*services.TaxService, error) {
	// Create base tax config for the country
	baseConfig, err := models.NewTaxConfig(c.CountryCode)
	if err != nil {
		return nil, fmt.Errorf("failed to create tax config for country %s: %w", c.CountryCode, err)
	}

	// Apply custom overrides if specified
	var finalConfig models.TaxConfig = baseConfig

	if c.CustomTaxRate > 0 || c.CustomThreshold > 0 {
		finalConfig = &CustomTaxConfig{
			baseConfig:      baseConfig,
			customTaxRate:   c.CustomTaxRate,
			customThreshold: c.CustomThreshold,
		}
	}

	return services.NewTaxService(finalConfig), nil
}

// ValidateConfig validates the tax system configuration
func (c *TaxSystemConfig) ValidateConfig() error {
	// Validate country code
	if c.CountryCode == "" {
		return fmt.Errorf("country code cannot be empty")
	}

	// Test that we can create a tax config for this country
	_, err := models.NewTaxConfig(c.CountryCode)
	if err != nil {
		return fmt.Errorf("unsupported country code %s: %w", c.CountryCode, err)
	}

	// Validate custom tax rate
	if c.CustomTaxRate < 0 || c.CustomTaxRate > 1 {
		return fmt.Errorf("custom tax rate must be between 0 and 1, got %f", c.CustomTaxRate)
	}

	// Validate custom threshold
	if c.CustomThreshold < 0 {
		return fmt.Errorf("custom threshold must be non-negative, got %f", c.CustomThreshold)
	}

	return nil
}

// GetSupportedCountries returns a list of supported country codes
func GetSupportedCountries() []CountryInfo {
	return []CountryInfo{
		{
			Code:           "AU",
			Name:           "Australia",
			TaxName:        "GST",
			TaxRate:        0.10,
			Currency:       "AUD",
			CurrencySymbol: "$",
		},
		{
			Code:           "GB",
			Name:           "United Kingdom",
			TaxName:        "VAT",
			TaxRate:        0.20,
			Currency:       "GBP",
			CurrencySymbol: "£",
		},
		{
			Code:           "US",
			Name:           "United States",
			TaxName:        "Sales Tax",
			TaxRate:        0.08, // Default rate, varies by state
			Currency:       "USD",
			CurrencySymbol: "$",
		},
	}
}

// CountryInfo contains information about a supported country's tax system
type CountryInfo struct {
	Code           string  `json:"code"`
	Name           string  `json:"name"`
	TaxName        string  `json:"tax_name"`
	TaxRate        float64 `json:"tax_rate"`
	Currency       string  `json:"currency"`
	CurrencySymbol string  `json:"currency_symbol"`
}

// CustomTaxConfig wraps a base tax config with custom overrides
type CustomTaxConfig struct {
	baseConfig      models.TaxConfig
	customTaxRate   float64
	customThreshold float64
}

func (c *CustomTaxConfig) GetTaxRate() float64 {
	if c.customTaxRate > 0 {
		return c.customTaxRate
	}
	return c.baseConfig.GetTaxRate()
}

func (c *CustomTaxConfig) GetRegistrationThreshold() float64 {
	return c.baseConfig.GetRegistrationThreshold()
}

func (c *CustomTaxConfig) GetTaxInvoiceThreshold() float64 {
	if c.customThreshold > 0 {
		return c.customThreshold
	}
	return c.baseConfig.GetTaxInvoiceThreshold()
}

func (c *CustomTaxConfig) GetTaxName() string {
	return c.baseConfig.GetTaxName()
}

func (c *CustomTaxConfig) GetCountryCode() string {
	return c.baseConfig.GetCountryCode()
}

func (c *CustomTaxConfig) ValidateBusinessNumber(businessNumber string) error {
	return c.baseConfig.ValidateBusinessNumber(businessNumber)
}

func (c *CustomTaxConfig) CalculateTax(amount float64, taxApplicable bool) float64 {
	if !taxApplicable {
		return 0
	}

	// Use custom tax rate if specified
	rate := c.GetTaxRate()
	tax := amount * rate
	return roundMoney(tax)
}

func (c *CustomTaxConfig) IsTaxInvoiceRequired(totalAmount float64, forceTaxInvoice bool) bool {
	threshold := c.GetTaxInvoiceThreshold()
	return totalAmount >= threshold || forceTaxInvoice
}

func (c *CustomTaxConfig) GetRequiredTaxInvoiceFields() []string {
	return c.baseConfig.GetRequiredTaxInvoiceFields()
}

// roundMoney rounds monetary values to 2 decimal places
func roundMoney(amount float64) float64 {
	return float64(int(amount*100+0.5)) / 100
}

// Helper functions for environment variable parsing
func getEnvWithDefault(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func getEnvBoolWithDefault(key string, defaultValue bool) bool {
	if value := os.Getenv(key); value != "" {
		switch strings.ToLower(value) {
		case "true", "1", "yes", "on":
			return true
		case "false", "0", "no", "off":
			return false
		}
	}
	return defaultValue
}

// TaxConfigurationGuide provides guidance for configuring the tax system
type TaxConfigurationGuide struct {
	EnvironmentVariables []EnvVarInfo    `json:"environment_variables"`
	Examples             []ConfigExample `json:"examples"`
	SupportedCountries   []CountryInfo   `json:"supported_countries"`
}

// EnvVarInfo describes an environment variable for tax configuration
type EnvVarInfo struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Default     string `json:"default"`
	Example     string `json:"example"`
	Required    bool   `json:"required"`
}

// ConfigExample provides example configurations for different scenarios
type ConfigExample struct {
	Name        string            `json:"name"`
	Description string            `json:"description"`
	EnvVars     map[string]string `json:"env_vars"`
}

// GetTaxConfigurationGuide returns comprehensive configuration guidance
func GetTaxConfigurationGuide() *TaxConfigurationGuide {
	return &TaxConfigurationGuide{
		EnvironmentVariables: []EnvVarInfo{
			{
				Name:        "TAX_COUNTRY_CODE",
				Description: "Country code for tax system (AU, GB, US)",
				Default:     "AU",
				Example:     "AU",
				Required:    false,
			},
			{
				Name:        "TAX_CUSTOM_RATE",
				Description: "Custom tax rate (0.0 to 1.0). Overrides country default.",
				Default:     "",
				Example:     "0.15",
				Required:    false,
			},
			{
				Name:        "TAX_CUSTOM_THRESHOLD",
				Description: "Custom tax invoice threshold amount. Overrides country default.",
				Default:     "",
				Example:     "100.00",
				Required:    false,
			},
			{
				Name:        "TAX_FORCE_BUSINESS_NUMBERS",
				Description: "Require business numbers for all tax invoices",
				Default:     "false",
				Example:     "true",
				Required:    false,
			},
			{
				Name:        "TAX_ENABLE_VALIDATION",
				Description: "Enable business number validation",
				Default:     "true",
				Example:     "false",
				Required:    false,
			},
			{
				Name:        "TAX_DEFAULT_APPLICABLE",
				Description: "Default value for tax applicable on new products",
				Default:     "true",
				Example:     "false",
				Required:    false,
			},
		},
		Examples: []ConfigExample{
			{
				Name:        "Australian Bakery (Default)",
				Description: "Standard Australian GST configuration for bakeries",
				EnvVars: map[string]string{
					"TAX_COUNTRY_CODE": "AU",
				},
			},
			{
				Name:        "UK Bakery",
				Description: "UK VAT configuration",
				EnvVars: map[string]string{
					"TAX_COUNTRY_CODE": "GB",
				},
			},
			{
				Name:        "US Bakery (California)",
				Description: "US Sales Tax with California rate",
				EnvVars: map[string]string{
					"TAX_COUNTRY_CODE": "US",
					"TAX_CUSTOM_RATE":  "0.0875", // 8.75% CA sales tax
				},
			},
			{
				Name:        "Custom Tax System",
				Description: "Custom tax rate and threshold for special jurisdictions",
				EnvVars: map[string]string{
					"TAX_COUNTRY_CODE":           "AU",
					"TAX_CUSTOM_RATE":            "0.12",  // 12% custom rate
					"TAX_CUSTOM_THRESHOLD":       "50.00", // $50 threshold
					"TAX_FORCE_BUSINESS_NUMBERS": "true",
				},
			},
		},
		SupportedCountries: GetSupportedCountries(),
	}
}
