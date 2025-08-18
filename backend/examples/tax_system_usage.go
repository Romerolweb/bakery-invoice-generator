package main

import (
	"context"
	"fmt"
	"log"
	"time"

	"bakery-invoice-api/internal/config"
	"bakery-invoice-api/internal/services"
)

// This file demonstrates how to use the tax system for different scenarios
func main() {
	ctx := context.Background()

	// Example 1: Australian Bakery with default GST settings
	fmt.Println("=== Example 1: Australian Bakery (Default GST) ===")
	australianBakeryExample(ctx)

	// Example 2: UK Bakery with VAT
	fmt.Println("\n=== Example 2: UK Bakery (VAT) ===")
	ukBakeryExample(ctx)

	// Example 3: Custom Tax Configuration
	fmt.Println("\n=== Example 3: Custom Tax Configuration ===")
	customTaxExample(ctx)

	// Example 4: Tax Compliance Validation
	fmt.Println("\n=== Example 4: Tax Compliance Validation ===")
	taxComplianceExample(ctx)

	// Example 5: Bakery Scenarios
	fmt.Println("\n=== Example 5: Bakery Business Scenarios ===")
	bakeryScenarios(ctx)

	// Example 6: Configuration Examples
	fmt.Println("\n=== Example 6: Configuration Examples ===")
	configurationExamples()
}

func australianBakeryExample(ctx context.Context) {
	// Create Australian tax service
	taxService, err := services.NewTaxServiceForCountry("AU")
	if err != nil {
		log.Printf("Error creating tax service: %v", err)
		return
	}

	// Example bakery purchase
	request := &services.CalculateReceiptRequest{
		LineItems: []services.ReceiptLineItem{
			{
				Quantity:      2,
				UnitPrice:     5.50,
				TaxApplicable: true,
				Description:   "Sourdough bread",
			},
			{
				Quantity:      1,
				UnitPrice:     25.00,
				TaxApplicable: true,
				Description:   "Birthday cake",
			},
			{
				Quantity:      3,
				UnitPrice:     3.50,
				TaxApplicable: false, // Basic bread items may be GST-free
				Description:   "Basic white bread",
			},
		},
		ForceTaxInvoice: false,
	}

	result, err := taxService.CalculateReceiptTotals(ctx, request)
	if err != nil {
		log.Printf("Error calculating totals: %v", err)
		return
	}

	fmt.Printf("Subtotal (excl GST): $%.2f\n", result.SubtotalExclTax)
	fmt.Printf("GST Amount: $%.2f\n", result.TaxAmount)
	fmt.Printf("Total (incl GST): $%.2f\n", result.TotalInclTax)
	fmt.Printf("Tax Invoice Required: %v\n", result.IsTaxInvoice)
	fmt.Printf("Tax Type: %s\n", result.TaxName)

	// Validate ABN
	abn := "51 824 753 556"
	if err := taxService.ValidateBusinessNumber(ctx, abn); err != nil {
		fmt.Printf("ABN %s is invalid: %v\n", abn, err)
	} else {
		fmt.Printf("ABN %s is valid\n", abn)
	}
}

func ukBakeryExample(ctx context.Context) {
	// Create UK tax service
	taxService, err := services.NewTaxServiceForCountry("GB")
	if err != nil {
		log.Printf("Error creating tax service: %v", err)
		return
	}

	// Example UK bakery purchase
	request := &services.CalculateReceiptRequest{
		LineItems: []services.ReceiptLineItem{
			{
				Quantity:      1,
				UnitPrice:     15.00,
				TaxApplicable: true,
				Description:   "Victoria sponge cake",
			},
			{
				Quantity:      4,
				UnitPrice:     2.50,
				TaxApplicable: true,
				Description:   "Scones",
			},
		},
		ForceTaxInvoice: false,
	}

	result, err := taxService.CalculateReceiptTotals(ctx, request)
	if err != nil {
		log.Printf("Error calculating totals: %v", err)
		return
	}

	fmt.Printf("Subtotal (excl VAT): £%.2f\n", result.SubtotalExclTax)
	fmt.Printf("VAT Amount: £%.2f\n", result.TaxAmount)
	fmt.Printf("Total (incl VAT): £%.2f\n", result.TotalInclTax)
	fmt.Printf("Tax Invoice Required: %v\n", result.IsTaxInvoice)
	fmt.Printf("Tax Type: %s\n", result.TaxName)

	// Get tax info
	info := taxService.GetTaxInfo(ctx)
	fmt.Printf("Tax Rate: %.1f%%\n", info.TaxRate*100)
	fmt.Printf("Tax Invoice Threshold: £%.2f\n", info.TaxInvoiceThreshold)
}

func customTaxExample(ctx context.Context) {
	// Create custom tax configuration
	taxConfig := &config.TaxSystemConfig{
		CountryCode:     "AU",
		CustomTaxRate:   0.12,  // 12% custom rate
		CustomThreshold: 50.00, // $50 custom threshold
	}

	taxService, err := taxConfig.CreateTaxService()
	if err != nil {
		log.Printf("Error creating custom tax service: %v", err)
		return
	}

	// Example with custom settings
	request := &services.CalculateReceiptRequest{
		LineItems: []services.ReceiptLineItem{
			{
				Quantity:      1,
				UnitPrice:     45.00,
				TaxApplicable: true,
				Description:   "Custom wedding cake",
			},
		},
		ForceTaxInvoice: false,
	}

	result, err := taxService.CalculateReceiptTotals(ctx, request)
	if err != nil {
		log.Printf("Error calculating totals: %v", err)
		return
	}

	fmt.Printf("Subtotal (excl tax): $%.2f\n", result.SubtotalExclTax)
	fmt.Printf("Tax Amount (12%%): $%.2f\n", result.TaxAmount)
	fmt.Printf("Total (incl tax): $%.2f\n", result.TotalInclTax)
	fmt.Printf("Tax Invoice Required (threshold $50): %v\n", result.IsTaxInvoice)
}

func taxComplianceExample(ctx context.Context) {
	taxService, err := services.NewTaxServiceForCountry("AU")
	if err != nil {
		log.Printf("Error creating tax service: %v", err)
		return
	}

	// Example compliance validation
	validationRequest := &services.TaxComplianceValidationRequest{
		TotalAmount:            100.00,
		TaxAmount:              10.00,
		ForceTaxInvoice:        false,
		SellerBusinessNumber:   "51 824 753 556",
		CustomerBusinessNumber: "",
		CustomerName:           "John Doe",
		InvoiceDate:            time.Now(),
		LineItemDescriptions:   []string{"Birthday cake", "Cupcakes"},
	}

	validationResult, err := taxService.ValidateReceiptForTaxCompliance(ctx, validationRequest)
	if err != nil {
		log.Printf("Error validating compliance: %v", err)
		return
	}

	fmt.Printf("Compliance Status: %v\n", validationResult.IsCompliant)
	if len(validationResult.Errors) > 0 {
		fmt.Println("Compliance Errors:")
		for _, error := range validationResult.Errors {
			fmt.Printf("  - %s\n", error)
		}
	}
	if len(validationResult.Warnings) > 0 {
		fmt.Println("Compliance Warnings:")
		for _, warning := range validationResult.Warnings {
			fmt.Printf("  - %s\n", warning)
		}
	}

	// Get tax invoice requirements
	requirements := taxService.GetTaxInvoiceRequirements(ctx)
	fmt.Printf("Tax Invoice Threshold: $%.2f\n", requirements.MinimumThreshold)
	fmt.Println("Required Fields for Tax Invoice:")
	for _, field := range requirements.RequiredFields {
		fmt.Printf("  - %s\n", field)
	}
}

func bakeryScenarios(ctx context.Context) {
	taxService, err := services.NewTaxServiceForCountry("AU")
	if err != nil {
		log.Printf("Error creating tax service: %v", err)
		return
	}

	scenarios := []struct {
		name        string
		description string
		items       []services.ReceiptLineItem
	}{
		{
			name:        "Morning Rush",
			description: "Typical morning customer buying coffee and pastry",
			items: []services.ReceiptLineItem{
				{Quantity: 1, UnitPrice: 4.50, TaxApplicable: true, Description: "Large coffee"},
				{Quantity: 1, UnitPrice: 3.50, TaxApplicable: true, Description: "Croissant"},
			},
		},
		{
			name:        "Birthday Party Order",
			description: "Customer ordering for a birthday party",
			items: []services.ReceiptLineItem{
				{Quantity: 1, UnitPrice: 45.00, TaxApplicable: true, Description: "Custom birthday cake"},
				{Quantity: 12, UnitPrice: 3.50, TaxApplicable: true, Description: "Cupcakes"},
				{Quantity: 2, UnitPrice: 8.00, TaxApplicable: false, Description: "Basic bread loaves"},
			},
		},
		{
			name:        "Corporate Catering",
			description: "Large corporate catering order",
			items: []services.ReceiptLineItem{
				{Quantity: 50, UnitPrice: 4.50, TaxApplicable: true, Description: "Gourmet sandwiches"},
				{Quantity: 30, UnitPrice: 2.50, TaxApplicable: true, Description: "Individual pastries"},
				{Quantity: 5, UnitPrice: 25.00, TaxApplicable: true, Description: "Large celebration cakes"},
			},
		},
	}

	for _, scenario := range scenarios {
		fmt.Printf("\n--- %s ---\n", scenario.name)
		fmt.Printf("Description: %s\n", scenario.description)

		request := &services.CalculateReceiptRequest{
			LineItems:       scenario.items,
			ForceTaxInvoice: false,
		}

		result, err := taxService.CalculateReceiptTotals(ctx, request)
		if err != nil {
			log.Printf("Error calculating totals: %v", err)
			continue
		}

		fmt.Printf("Subtotal: $%.2f\n", result.SubtotalExclTax)
		fmt.Printf("GST: $%.2f\n", result.TaxAmount)
		fmt.Printf("Total: $%.2f\n", result.TotalInclTax)
		fmt.Printf("Tax Invoice Required: %v\n", result.IsTaxInvoice)

		if result.IsTaxInvoice {
			fmt.Println("⚠️  Tax invoice required - ensure all mandatory fields are included")
		} else {
			fmt.Println("ℹ️  Regular receipt sufficient")
		}
	}
}

func configurationExamples() {
	// Get configuration guide
	guide := config.GetTaxConfigurationGuide()

	fmt.Println("Supported Countries:")
	for _, country := range guide.SupportedCountries {
		fmt.Printf("  %s (%s): %s %.1f%% - %s\n",
			country.Name,
			country.Code,
			country.TaxName,
			country.TaxRate*100,
			country.CurrencySymbol,
		)
	}

	fmt.Println("\nEnvironment Variables:")
	for _, envVar := range guide.EnvironmentVariables {
		fmt.Printf("  %s: %s\n", envVar.Name, envVar.Description)
		if envVar.Default != "" {
			fmt.Printf("    Default: %s\n", envVar.Default)
		}
		if envVar.Example != "" {
			fmt.Printf("    Example: %s\n", envVar.Example)
		}
	}

	fmt.Println("\nConfiguration Examples:")
	for _, example := range guide.Examples {
		fmt.Printf("\n  %s:\n", example.Name)
		fmt.Printf("    %s\n", example.Description)
		for key, value := range example.EnvVars {
			fmt.Printf("    %s=%s\n", key, value)
		}
	}
}
