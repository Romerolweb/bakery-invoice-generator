package models

import (
	"errors"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// TaxConfig defines the interface for different tax systems (GST, VAT, Sales Tax, etc.)
type TaxConfig interface {
	GetTaxRate() float64
	GetRegistrationThreshold() float64
	GetTaxInvoiceThreshold() float64
	GetTaxName() string
	GetCountryCode() string
	ValidateBusinessNumber(businessNumber string) error
	CalculateTax(amount float64, taxApplicable bool) float64
	IsTaxInvoiceRequired(totalAmount float64, forceTaxInvoice bool) bool
	GetRequiredTaxInvoiceFields() []string
}

// AustralianGSTConfig implements TaxConfig for Australian GST system
// Based on official ATO sources (ato.gov.au):
// - GST registration threshold: $75,000 turnover (as of 2024)
// - Tax invoice threshold: $82.50 AUD for ANY customer when GST registered
// - GST rate: 10% (0.10)
// - ABN format: 11 digits with specific validation algorithm
type AustralianGSTConfig struct{}

// GST rate as per ATO regulations - 10% on most goods and services
// Source: https://www.ato.gov.au/business/gst/gst-basics/
const AustralianGSTRate = 0.10

// GST registration threshold - businesses with turnover of $75,000 or more must register
// Source: https://www.ato.gov.au/business/gst/registering-for-gst/
const AustralianGSTRegistrationThreshold = 75000.00

// Tax invoice threshold - $82.50 AUD for ANY customer when GST registered
// Source: https://www.ato.gov.au/business/gst/tax-invoices/
const AustralianTaxInvoiceThreshold = 82.50

func (c *AustralianGSTConfig) GetTaxRate() float64 {
	return AustralianGSTRate
}

func (c *AustralianGSTConfig) GetRegistrationThreshold() float64 {
	return AustralianGSTRegistrationThreshold
}

func (c *AustralianGSTConfig) GetTaxInvoiceThreshold() float64 {
	return AustralianTaxInvoiceThreshold
}

func (c *AustralianGSTConfig) GetTaxName() string {
	return "GST"
}

func (c *AustralianGSTConfig) GetCountryCode() string {
	return "AU"
}

// ValidateBusinessNumber validates Australian Business Number (ABN)
// ABN format: 11 digits with specific check digit algorithm
// Source: https://www.ato.gov.au/business/registration/abn/
func (c *AustralianGSTConfig) ValidateBusinessNumber(abn string) error {
	if abn == "" {
		return nil // ABN is optional for individual customers
	}

	// Remove spaces and non-numeric characters
	cleanABN := regexp.MustCompile(`[^0-9]`).ReplaceAllString(abn, "")

	if len(cleanABN) != 11 {
		return errors.New("ABN must be 11 digits")
	}

	// Convert to slice of integers
	digits := make([]int, 11)
	for i, char := range cleanABN {
		digit, err := strconv.Atoi(string(char))
		if err != nil {
			return errors.New("ABN must contain only digits")
		}
		digits[i] = digit
	}

	// ABN validation algorithm as per ATO specifications
	// Subtract 1 from the first digit
	digits[0] -= 1
	if digits[0] < 0 {
		return errors.New("invalid ABN format")
	}

	// Multiply each digit by its weighting factor
	weights := []int{10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19}
	sum := 0
	for i, digit := range digits {
		sum += digit * weights[i]
	}

	// Check if sum is divisible by 89
	if sum%89 != 0 {
		return errors.New("invalid ABN check digit")
	}

	return nil
}

// CalculateTax calculates GST amount based on ATO rules
// GST is only applied when taxApplicable is true
// All monetary calculations are rounded to 2 decimal places as per ATO requirements
func (c *AustralianGSTConfig) CalculateTax(amount float64, taxApplicable bool) float64 {
	if !taxApplicable {
		return 0
	}

	// Calculate GST and round to 2 decimal places
	gst := amount * c.GetTaxRate()
	return roundMoney(gst)
}

// IsTaxInvoiceRequired determines if a tax invoice is required
// Based on ATO rules: tax invoice required for amounts ≥ $82.50 AUD or when forced
// Source: https://www.ato.gov.au/business/gst/tax-invoices/
func (c *AustralianGSTConfig) IsTaxInvoiceRequired(totalAmount float64, forceTaxInvoice bool) bool {
	return totalAmount >= c.GetTaxInvoiceThreshold() || forceTaxInvoice
}

// GetRequiredTaxInvoiceFields returns the mandatory fields for Australian tax invoices
// Based on ATO requirements for tax invoices
// Source: https://www.ato.gov.au/business/gst/tax-invoices/
func (c *AustralianGSTConfig) GetRequiredTaxInvoiceFields() []string {
	return []string{
		"seller_abn",           // Seller's ABN
		"invoice_date",         // Date of invoice
		"customer_details",     // Customer name and address
		"description_of_goods", // Description of goods/services
		"gst_amount",           // GST amount (if any)
		"total_amount",         // Total amount including GST
		"tax_invoice_label",    // Must be labeled as "Tax Invoice"
	}
}

// UKVATConfig implements TaxConfig for UK VAT system
type UKVATConfig struct{}

const UKVATRate = 0.20                   // 20% VAT rate
const UKVATRegistrationThreshold = 85000 // £85,000 registration threshold
const UKVATInvoiceThreshold = 250        // £250 VAT invoice threshold

func (c *UKVATConfig) GetTaxRate() float64 {
	return UKVATRate
}

func (c *UKVATConfig) GetRegistrationThreshold() float64 {
	return UKVATRegistrationThreshold
}

func (c *UKVATConfig) GetTaxInvoiceThreshold() float64 {
	return UKVATInvoiceThreshold
}

func (c *UKVATConfig) GetTaxName() string {
	return "VAT"
}

func (c *UKVATConfig) GetCountryCode() string {
	return "GB"
}

func (c *UKVATConfig) ValidateBusinessNumber(vatNumber string) error {
	if vatNumber == "" {
		return nil
	}

	// Basic UK VAT number validation (9 digits)
	cleanVAT := regexp.MustCompile(`[^0-9]`).ReplaceAllString(vatNumber, "")
	if len(cleanVAT) != 9 {
		return errors.New("UK VAT number must be 9 digits")
	}

	return nil
}

func (c *UKVATConfig) CalculateTax(amount float64, taxApplicable bool) float64 {
	if !taxApplicable {
		return 0
	}

	vat := amount * c.GetTaxRate()
	return roundMoney(vat)
}

func (c *UKVATConfig) IsTaxInvoiceRequired(totalAmount float64, forceTaxInvoice bool) bool {
	return totalAmount >= c.GetTaxInvoiceThreshold() || forceTaxInvoice
}

func (c *UKVATConfig) GetRequiredTaxInvoiceFields() []string {
	return []string{
		"vat_number",
		"invoice_date",
		"customer_details",
		"description_of_goods",
		"vat_amount",
		"total_amount",
	}
}

// USSalesTaxConfig implements TaxConfig for US Sales Tax system
type USSalesTaxConfig struct {
	StateRate float64 // Variable rate by state
}

func (c *USSalesTaxConfig) GetTaxRate() float64 {
	return c.StateRate
}

func (c *USSalesTaxConfig) GetRegistrationThreshold() float64 {
	return 100000 // Varies by state, $100k as example
}

func (c *USSalesTaxConfig) GetTaxInvoiceThreshold() float64 {
	return 0 // No specific threshold for US sales tax
}

func (c *USSalesTaxConfig) GetTaxName() string {
	return "Sales Tax"
}

func (c *USSalesTaxConfig) GetCountryCode() string {
	return "US"
}

func (c *USSalesTaxConfig) ValidateBusinessNumber(ein string) error {
	if ein == "" {
		return nil
	}

	// Basic EIN validation (XX-XXXXXXX format)
	einPattern := regexp.MustCompile(`^\d{2}-\d{7}$`)
	if !einPattern.MatchString(ein) {
		return errors.New("EIN must be in format XX-XXXXXXX")
	}

	return nil
}

func (c *USSalesTaxConfig) CalculateTax(amount float64, taxApplicable bool) float64 {
	if !taxApplicable {
		return 0
	}

	tax := amount * c.GetTaxRate()
	return roundMoney(tax)
}

func (c *USSalesTaxConfig) IsTaxInvoiceRequired(totalAmount float64, forceTaxInvoice bool) bool {
	return forceTaxInvoice // US doesn't have specific tax invoice requirements
}

func (c *USSalesTaxConfig) GetRequiredTaxInvoiceFields() []string {
	return []string{
		"business_license",
		"invoice_date",
		"customer_details",
		"description_of_goods",
		"tax_amount",
		"total_amount",
	}
}

// TaxConfigFactory creates tax configuration based on country code
func NewTaxConfig(countryCode string) (TaxConfig, error) {
	switch strings.ToUpper(countryCode) {
	case "AU", "AUS", "AUSTRALIA":
		return &AustralianGSTConfig{}, nil
	case "GB", "UK", "UNITED_KINGDOM":
		return &UKVATConfig{}, nil
	case "US", "USA", "UNITED_STATES":
		return &USSalesTaxConfig{StateRate: 0.08}, nil // Default 8% rate
	default:
		return nil, fmt.Errorf("unsupported country code: %s", countryCode)
	}
}

// roundMoney rounds monetary values to 2 decimal places as required by ATO
// This ensures all GST calculations comply with Australian tax regulations
func roundMoney(amount float64) float64 {
	if amount >= 0 {
		return float64(int(amount*100+0.5)) / 100
	}
	return float64(int(amount*100-0.5)) / 100
}

// TaxCalculationResult represents the result of tax calculations
type TaxCalculationResult struct {
	SubtotalExclTax float64   `json:"subtotal_excl_tax"`
	TaxAmount       float64   `json:"tax_amount"`
	TotalInclTax    float64   `json:"total_incl_tax"`
	IsTaxInvoice    bool      `json:"is_tax_invoice"`
	TaxName         string    `json:"tax_name"`
	CalculatedAt    time.Time `json:"calculated_at"`
}

// CalculateReceiptTotals calculates tax totals for a receipt using the specified tax config
func CalculateReceiptTotals(config TaxConfig, lineItems []LineItemCalculation, forceTaxInvoice bool) *TaxCalculationResult {
	var subtotalExclTax float64
	var totalTaxAmount float64

	// Calculate totals from line items
	for _, item := range lineItems {
		lineTotal := float64(item.Quantity) * item.UnitPrice
		subtotalExclTax += lineTotal

		if item.TaxApplicable {
			taxAmount := config.CalculateTax(lineTotal, true)
			totalTaxAmount += taxAmount
		}
	}

	// Round all monetary values
	subtotalExclTax = roundMoney(subtotalExclTax)
	totalTaxAmount = roundMoney(totalTaxAmount)
	totalInclTax := roundMoney(subtotalExclTax + totalTaxAmount)

	// Determine if tax invoice is required
	isTaxInvoice := config.IsTaxInvoiceRequired(totalInclTax, forceTaxInvoice)

	return &TaxCalculationResult{
		SubtotalExclTax: subtotalExclTax,
		TaxAmount:       totalTaxAmount,
		TotalInclTax:    totalInclTax,
		IsTaxInvoice:    isTaxInvoice,
		TaxName:         config.GetTaxName(),
		CalculatedAt:    time.Now().UTC(),
	}
}

// LineItemCalculation represents a line item for tax calculation
type LineItemCalculation struct {
	Quantity      int     `json:"quantity"`
	UnitPrice     float64 `json:"unit_price"`
	TaxApplicable bool    `json:"tax_applicable"`
}
