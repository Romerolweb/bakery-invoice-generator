package models

import (
	"testing"
)

// TestCustomerCreation tests basic customer creation and validation
func TestCustomerCreation(t *testing.T) {
	// Test individual customer
	customer := NewIndividualCustomer("John", "Doe")
	if err := customer.Validate(); err != nil {
		t.Errorf("Individual customer validation failed: %v", err)
	}

	if customer.GetDisplayName() != "John Doe" {
		t.Errorf("Expected display name 'John Doe', got '%s'", customer.GetDisplayName())
	}

	// Test business customer
	businessCustomer := NewBusinessCustomer("Acme Corp")
	if err := businessCustomer.Validate(); err != nil {
		t.Errorf("Business customer validation failed: %v", err)
	}

	if businessCustomer.GetDisplayName() != "Acme Corp" {
		t.Errorf("Expected display name 'Acme Corp', got '%s'", businessCustomer.GetDisplayName())
	}
}

// TestProductCreation tests basic product creation and GST calculations
func TestProductCreation(t *testing.T) {
	product := NewProduct("Sourdough Bread", "breads", 8.50)
	if err := product.Validate(); err != nil {
		t.Errorf("Product validation failed: %v", err)
	}

	// Test GST calculation
	gstAmount := product.CalculateGST(2, true)
	expectedGST := 1.70 // (8.50 * 2) * 0.10 = 1.70
	if gstAmount != expectedGST {
		t.Errorf("Expected GST amount %.2f, got %.2f", expectedGST, gstAmount)
	}

	// Test line total calculation
	lineTotal := product.CalculateLineTotal(2, true)
	expectedTotal := 18.70 // (8.50 * 2) + 1.70 GST = 18.70
	if lineTotal != expectedTotal {
		t.Errorf("Expected line total %.2f, got %.2f", expectedTotal, lineTotal)
	}
}

// TestReceiptCreation tests receipt creation and calculations
func TestReceiptCreation(t *testing.T) {
	// Create test data
	customer := NewIndividualCustomer("Jane", "Smith")
	product1 := NewProduct("Croissant", "pastries", 4.50)
	product2 := NewProduct("Coffee", "beverages", 5.00)

	// Create receipt
	receipt := NewReceipt(customer.ID)

	// Add line items
	lineItem1 := NewLineItemFromProduct(receipt.ReceiptID, product1.ID, product1, 2, 1)
	lineItem2 := NewLineItemFromProduct(receipt.ReceiptID, product2.ID, product2, 1, 2)

	receipt.LineItems = []LineItem{*lineItem1, *lineItem2}

	// Set snapshots - seller charges GST
	seller := NewSellerProfile("Test Bakery", "123 Main St", "12345678901", "test@bakery.com")
	seller.SetGSTRegistration(true)
	seller.SetChargeGST(true)

	if err := receipt.SetCustomerSnapshot(customer); err != nil {
		t.Errorf("Failed to set customer snapshot: %v", err)
	}
	if err := receipt.SetSellerProfileSnapshot(seller); err != nil {
		t.Errorf("Failed to set seller snapshot: %v", err)
	}

	// Calculate totals with GST
	receipt.CalculateTotals(seller.ShouldChargeGST())

	// Validate calculations
	expectedSubtotal := 14.00 // (4.50 * 2) + (5.00 * 1) = 14.00
	expectedGST := 1.40       // 14.00 * 0.10 = 1.40
	expectedTotal := 15.40    // 14.00 + 1.40 = 15.40

	if receipt.SubtotalExclGST != expectedSubtotal {
		t.Errorf("Expected subtotal %.2f, got %.2f", expectedSubtotal, receipt.SubtotalExclGST)
	}

	if receipt.GSTAmount != expectedGST {
		t.Errorf("Expected GST %.2f, got %.2f", expectedGST, receipt.GSTAmount)
	}

	if receipt.TotalIncGST != expectedTotal {
		t.Errorf("Expected total %.2f, got %.2f", expectedTotal, receipt.TotalIncGST)
	}

	if !receipt.WasGSTCharged() {
		t.Error("Expected GST to be charged")
	}

	// Validate receipt
	if err := receipt.Validate(); err != nil {
		t.Errorf("Receipt validation failed: %v", err)
	}
}

// TestReceiptCreationNoGST tests receipt creation without GST
func TestReceiptCreationNoGST(t *testing.T) {
	// Create test data
	customer := NewIndividualCustomer("Jane", "Smith")
	product1 := NewProduct("Croissant", "pastries", 4.50)
	product2 := NewProduct("Coffee", "beverages", 5.00)

	// Create receipt
	receipt := NewReceipt(customer.ID)

	// Add line items
	lineItem1 := NewLineItemFromProduct(receipt.ReceiptID, product1.ID, product1, 2, 1)
	lineItem2 := NewLineItemFromProduct(receipt.ReceiptID, product2.ID, product2, 1, 2)

	receipt.LineItems = []LineItem{*lineItem1, *lineItem2}

	// Set snapshots - seller NOT registered for GST (under $75k threshold)
	seller := NewSellerProfile("Small Bakery", "123 Main St", "12345678901", "test@bakery.com")
	// seller.GSTRegistered defaults to false
	// seller.ChargeGST defaults to false

	if err := receipt.SetCustomerSnapshot(customer); err != nil {
		t.Errorf("Failed to set customer snapshot: %v", err)
	}
	if err := receipt.SetSellerProfileSnapshot(seller); err != nil {
		t.Errorf("Failed to set seller snapshot: %v", err)
	}

	// Calculate totals without GST
	receipt.CalculateTotals(seller.ShouldChargeGST())

	// Validate calculations - no GST should be charged
	expectedSubtotal := 14.00 // (4.50 * 2) + (5.00 * 1) = 14.00
	expectedGST := 0.00       // No GST
	expectedTotal := 14.00    // Same as subtotal

	if receipt.SubtotalExclGST != expectedSubtotal {
		t.Errorf("Expected subtotal %.2f, got %.2f", expectedSubtotal, receipt.SubtotalExclGST)
	}

	if receipt.GSTAmount != expectedGST {
		t.Errorf("Expected GST %.2f, got %.2f", expectedGST, receipt.GSTAmount)
	}

	if receipt.TotalIncGST != expectedTotal {
		t.Errorf("Expected total %.2f, got %.2f", expectedTotal, receipt.TotalIncGST)
	}

	if receipt.WasGSTCharged() {
		t.Error("Expected no GST to be charged")
	}

	if receipt.IsTaxInvoice {
		t.Error("Expected no tax invoice when GST not charged")
	}

	// Validate receipt
	if err := receipt.Validate(); err != nil {
		t.Errorf("Receipt validation failed: %v", err)
	}
}

// TestSellerProfile tests seller profile creation and validation
func TestSellerProfile(t *testing.T) {
	seller := NewSellerProfile("Test Bakery", "123 Main St\nSydney NSW 2000", "12345678901", "contact@testbakery.com")
	seller.SetPhone("02 9876 5432")

	if err := seller.Validate(); err != nil {
		t.Errorf("Seller profile validation failed: %v", err)
	}

	if !seller.HasPhone() {
		t.Error("Expected seller to have phone number")
	}

	if !seller.IsABN() {
		t.Error("Expected ABN format to be detected")
	}

	// Test GST functionality
	if seller.IsGSTRegistered() {
		t.Error("Expected seller to not be GST registered by default")
	}

	if seller.ShouldChargeGST() {
		t.Error("Expected seller to not charge GST by default")
	}

	// Test GST registration
	seller.SetGSTRegistration(true)
	if !seller.IsGSTRegistered() {
		t.Error("Expected seller to be GST registered after setting")
	}

	// Test charging GST
	if err := seller.SetChargeGST(true); err != nil {
		t.Errorf("Failed to set charge GST: %v", err)
	}

	if !seller.ShouldChargeGST() {
		t.Error("Expected seller to charge GST after setting")
	}

	// Test GST status message
	status := seller.GetGSTStatus()
	if status != "GST Registered - Charging GST" {
		t.Errorf("Expected 'GST Registered - Charging GST', got '%s'", status)
	}
}

// TestEmailAudit tests email audit functionality
func TestEmailAudit(t *testing.T) {
	audit := NewEmailAudit("receipt-123", "customer@example.com")

	if err := audit.Validate(); err != nil {
		t.Errorf("Email audit validation failed: %v", err)
	}

	if !audit.IsPending() {
		t.Error("Expected email audit to be pending initially")
	}

	// Mark as sent
	audit.MarkAsSent()
	if !audit.IsSent() {
		t.Error("Expected email audit to be marked as sent")
	}

	// Test retry functionality
	audit2 := NewEmailAudit("receipt-456", "customer2@example.com")
	audit2.MarkForRetry("SMTP connection failed")

	if !audit2.IsRetry() {
		t.Error("Expected email audit to be marked for retry")
	}

	if audit2.RetryCount != 1 {
		t.Errorf("Expected retry count 1, got %d", audit2.RetryCount)
	}
}

// TestValidationFunctions tests the validation utility functions
func TestValidationFunctions(t *testing.T) {
	// Test email validation
	if err := ValidateEmail("invalid-email", "email"); err == nil {
		t.Error("Expected email validation to fail for invalid email")
	}

	if err := ValidateEmail("valid@example.com", "email"); err != nil {
		t.Errorf("Expected email validation to pass for valid email: %v", err)
	}

	// Test positive number validation
	if err := ValidatePositiveNumber(-5.0, "price"); err == nil {
		t.Error("Expected positive number validation to fail for negative number")
	}

	if err := ValidatePositiveNumber(10.0, "price"); err != nil {
		t.Errorf("Expected positive number validation to pass: %v", err)
	}

	// Test required field validation
	if err := ValidateRequired("", "name"); err == nil {
		t.Error("Expected required validation to fail for empty string")
	}

	if err := ValidateRequired("John", "name"); err != nil {
		t.Errorf("Expected required validation to pass: %v", err)
	}
}

// TestBusinessRules tests business rule constants and calculations
func TestBusinessRules(t *testing.T) {
	rules := DefaultBusinessRules()

	if rules.GSTRate != 0.10 {
		t.Errorf("Expected GST rate 0.10, got %.2f", rules.GSTRate)
	}

	if rules.TaxInvoiceThreshold != 82.50 {
		t.Errorf("Expected tax invoice threshold 82.50, got %.2f", rules.TaxInvoiceThreshold)
	}
}

// TestProductCategories tests default product categories
func TestProductCategories(t *testing.T) {
	categories := DefaultProductCategories()

	if len(categories) == 0 {
		t.Error("Expected default product categories to be populated")
	}

	// Check that "breads" category exists
	found := false
	for _, cat := range categories {
		if cat.ID == "breads" && cat.Name == "Breads" {
			found = true
			break
		}
	}

	if !found {
		t.Error("Expected to find 'breads' category in default categories")
	}
}
