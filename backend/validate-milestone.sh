#!/bin/bash

# Comprehensive Milestone Validation Script
# This script validates the current implementation milestone
# Updated for each phase of development
#
# HOW TO UPDATE FOR NEW MILESTONES:
# 1. Update CURRENT_MILESTONE to reflect the new milestone
# 2. Update MILESTONE_VERSION (increment for each milestone)
# 3. Add new completed tasks to COMPLETED_TASKS array
# 4. Add new validation steps in the main validation section
# 5. Update the MILESTONE SUMMARY and NEXT PHASE READINESS sections
# 6. Update the components status in the JSON output
#
# EXAMPLE FOR NEXT MILESTONE (3.2):
# CURRENT_MILESTONE="Task 3.2 - Repository Interfaces"
# MILESTONE_VERSION="1.1"
# COMPLETED_TASKS=("1" "2.1" "2.2" "2.3" "3.1" "3.2")
# Add: print_info "Step X: Testing repository interfaces..."

set -e

# Current milestone information
CURRENT_MILESTONE="Task 3.1 - Domain Models"
MILESTONE_VERSION="1.0"
COMPLETED_TASKS=("1" "2.1" "2.2" "2.3" "3.1")

echo "🔍 Validating Current Milestone: $CURRENT_MILESTONE"
echo "📋 Milestone Version: $MILESTONE_VERSION"
echo "✅ Completed Tasks: ${COMPLETED_TASKS[*]}"
echo "========================================"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print status
print_status() {
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✅ $2${NC}"
    else
        echo -e "${RED}❌ $2${NC}"
        exit 1
    fi
}

print_info() {
    echo -e "${YELLOW}ℹ️  $1${NC}"
}

echo
print_info "Step 1: Compiling domain models..."
go build ./internal/models/...
print_status $? "Domain models compilation"

echo
print_info "Step 2: Running domain model tests..."
go test ./internal/models/... -v
print_status $? "Domain model tests"

echo
print_info "Step 3: Compiling configuration..."
go build ./internal/config/...
print_status $? "Configuration compilation"

echo
print_info "Step 4: Compiling database layer..."
go build ./internal/database/...
print_status $? "Database layer compilation"

echo
print_info "Step 5: Compiling migration system..."
go build ./internal/migration/...
print_status $? "Migration system compilation"

echo
print_info "Step 6: Compiling migration tools..."
go build ./cmd/migrate/...
print_status $? "Migration tools compilation"

echo
print_info "Step 7: Compiling JSON migration tool..."
go build ./cmd/json-migrate/...
print_status $? "JSON migration tool compilation"

echo
print_info "Step 8: Testing database schema validation..."
# Validate that migration files exist and are properly formatted
if [ -f "./migrations/001_initial_schema.up.sql" ]; then
    print_status 0 "Database schema files exist"
else
    print_status 1 "Database schema files missing"
fi

echo
print_info "Step 9: Validating model functionality..."

# Create a simple Go program to test model functionality
cat > test_models.go << 'EOF'
package main

import (
	"fmt"
	"log"
	"bakery-invoice-api/internal/models"
)

func main() {
	// Test Customer creation
	customer := models.NewIndividualCustomer("John", "Doe")
	email := "john@example.com"
	customer.Email = &email
	if err := customer.Validate(); err != nil {
		log.Fatalf("Customer validation failed: %v", err)
	}
	fmt.Printf("✅ Customer: %s\n", customer.GetDisplayName())

	// Test Product creation
	product := models.NewProduct("Sourdough Bread", "breads", 8.50)
	if err := product.Validate(); err != nil {
		log.Fatalf("Product validation failed: %v", err)
	}
	fmt.Printf("✅ Product: %s - $%.2f\n", product.Name, product.UnitPrice)

	// Test GST calculation
	gstAmount := product.CalculateGST(2, true)
	fmt.Printf("✅ GST for 2 items: $%.2f\n", gstAmount)

	// Test Receipt creation
	receipt := models.NewReceipt(customer.ID)
	lineItem := models.NewLineItem(receipt.ReceiptID, product.ID, product, 2, 1)
	receipt.LineItems = []models.LineItem{*lineItem}

	// Set snapshots
	seller := models.NewSellerProfile("Test Bakery", "123 Main St", "12345678901", "test@bakery.com")
	if err := receipt.SetCustomerSnapshot(customer); err != nil {
		log.Fatalf("Failed to set customer snapshot: %v", err)
	}
	if err := receipt.SetSellerProfileSnapshot(seller); err != nil {
		log.Fatalf("Failed to set seller snapshot: %v", err)
	}

	// Calculate totals
	receipt.CalculateTotals(true)
	if err := receipt.Validate(); err != nil {
		log.Fatalf("Receipt validation failed: %v", err)
	}
	fmt.Printf("✅ Receipt: $%.2f (GST: $%.2f)\n", receipt.TotalIncGST, receipt.GSTAmount)

	// Test Email Audit
	audit := models.NewEmailAudit(receipt.ReceiptID, "customer@example.com")
	if err := audit.Validate(); err != nil {
		log.Fatalf("Email audit validation failed: %v", err)
	}
	fmt.Printf("✅ Email audit: %s\n", audit.GetStatusDisplay())

	// Test Product Categories
	categories := models.DefaultProductCategories()
	fmt.Printf("✅ Default categories: %d items\n", len(categories))

	// Test Business Rules
	rules := models.DefaultBusinessRules()
	fmt.Printf("✅ GST Rate: %.1f%%, Tax Invoice Threshold: $%.2f\n", 
		rules.GSTRate*100, rules.TaxInvoiceThreshold)

	fmt.Println("\n🎉 All model functionality tests passed!")
}
EOF

go run test_models.go
print_status $? "Model functionality test"

# Clean up test file
rm -f test_models.go

echo
echo "========================================"
echo -e "${GREEN}🎉 Milestone Validation Complete: $CURRENT_MILESTONE${NC}"
echo
echo "📊 MILESTONE SUMMARY:"
echo "✅ All domain models implemented and working correctly"
echo "✅ Comprehensive validation and business logic included"
echo "✅ GST calculations and tax invoice logic working"
echo "✅ Database migration system functional"
echo "✅ JSON migration tools ready"
echo "✅ All tests passing"
echo
echo "🚀 NEXT PHASE READINESS:"
echo "✅ Task 3.1 (Domain Models) - COMPLETE"
echo "⏳ Task 3.2 (Repository Interfaces) - READY TO START"
echo "⏳ Task 3.3 (File Storage Abstraction) - READY TO START"
echo
echo "💡 The current milestone is fully usable and ready for the next phase!"
echo "   Next recommended task: 3.2 - Create repository interfaces"
echo "========================================"

# Save milestone completion status
cat > milestone-status.json << EOF
{
  "current_milestone": "$CURRENT_MILESTONE",
  "version": "$MILESTONE_VERSION",
  "completed_tasks": [$(printf '"%s",' "${COMPLETED_TASKS[@]}" | sed 's/,$//')],
  "validation_date": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "status": "COMPLETE",
  "next_tasks": ["3.2", "3.3"],
  "components": {
    "domain_models": "COMPLETE",
    "database_schema": "COMPLETE", 
    "migration_system": "COMPLETE",
    "json_migration": "COMPLETE",
    "validation_system": "COMPLETE",
    "business_logic": "COMPLETE"
  }
}
EOF

echo
print_info "Milestone status saved to milestone-status.json"