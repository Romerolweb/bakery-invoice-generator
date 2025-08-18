package services

import (
	"context"
	"fmt"
	"time"

	"github.com/go-playground/validator/v10"
	"github.com/google/uuid"

	"bakery-invoice-api/internal/models"
	"bakery-invoice-api/internal/repositories"
)

// receiptService implements the ReceiptService interface
type receiptService struct {
	receiptRepo       repositories.ReceiptRepository
	customerRepo      repositories.CustomerRepository
	productRepo       repositories.ProductRepository
	lineItemRepo      repositories.LineItemRepository
	sellerProfileRepo repositories.SellerProfileRepository
	taxService        TaxServiceInterface
	validator         *validator.Validate
}

// NewReceiptService creates a new receipt service instance
func NewReceiptService(
	receiptRepo repositories.ReceiptRepository,
	customerRepo repositories.CustomerRepository,
	productRepo repositories.ProductRepository,
	lineItemRepo repositories.LineItemRepository,
	sellerProfileRepo repositories.SellerProfileRepository,
	taxService TaxServiceInterface,
) ReceiptService {
	return &receiptService{
		receiptRepo:       receiptRepo,
		customerRepo:      customerRepo,
		productRepo:       productRepo,
		lineItemRepo:      lineItemRepo,
		sellerProfileRepo: sellerProfileRepo,
		taxService:        taxService,
		validator:         validator.New(),
	}
}

// CreateReceipt creates a new receipt with GST calculations
func (s *receiptService) CreateReceipt(ctx context.Context, req *CreateReceiptRequest) (*models.Receipt, error) {
	if req == nil {
		return nil, fmt.Errorf("create receipt request cannot be nil")
	}

	// Validate request
	if err := s.validator.Struct(req); err != nil {
		return nil, fmt.Errorf("validation failed: %w", err)
	}

	// Validate line items
	if len(req.LineItems) == 0 {
		return nil, fmt.Errorf("receipt must have at least one line item")
	}

	// Get customer
	customer, err := s.customerRepo.GetByID(ctx, req.CustomerID)
	if err != nil {
		return nil, fmt.Errorf("failed to get customer: %w", err)
	}

	// Get seller profile
	sellerProfile, err := s.sellerProfileRepo.Get(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get seller profile: %w", err)
	}

	// Create receipt
	receipt := models.NewReceipt(req.CustomerID)
	receipt.PaymentMethod = req.PaymentMethod
	if req.Notes != nil {
		receipt.SetNotes(*req.Notes)
	}
	if req.DateOfPurchase != nil {
		receipt.DateOfPurchase = *req.DateOfPurchase
	}

	// Set snapshots
	if err := receipt.SetCustomerSnapshot(customer); err != nil {
		return nil, fmt.Errorf("failed to set customer snapshot: %w", err)
	}
	if err := receipt.SetSellerProfileSnapshot(sellerProfile); err != nil {
		return nil, fmt.Errorf("failed to set seller profile snapshot: %w", err)
	}

	// Create line items
	var lineItems []models.LineItem
	for i, lineItemReq := range req.LineItems {
		// Get product
		product, err := s.productRepo.GetByID(ctx, lineItemReq.ProductID)
		if err != nil {
			return nil, fmt.Errorf("failed to get product for line item %d: %w", i+1, err)
		}

		// Create line item
		lineItem := models.NewLineItem(receipt.ReceiptID, lineItemReq.ProductID, lineItemReq.Quantity)
		lineItem.ProductName = product.Name
		lineItem.UnitPrice = product.UnitPrice
		lineItem.GSTApplicable = product.GSTApplicable
		lineItem.SortOrder = i

		// Override unit price if provided
		if lineItemReq.UnitPrice != nil {
			lineItem.UnitPrice = *lineItemReq.UnitPrice
		}

		// Override description if provided
		if lineItemReq.Description != nil {
			lineItem.Description = lineItemReq.Description
		} else {
			lineItem.Description = &product.Name
		}

		// Calculate line total
		lineItem.LineTotal = lineItem.UnitPrice * float64(lineItem.Quantity)

		lineItems = append(lineItems, *lineItem)
	}

	receipt.LineItems = lineItems

	// Calculate totals
	receipt.CalculateTotals(sellerProfile.ChargeGST)

	// Determine if tax invoice is required
	isTaxInvoice, err := s.DetermineIfTaxInvoiceRequired(ctx, receipt.TotalIncGST, req.CustomerID, req.ForceTaxInvoice)
	if err != nil {
		return nil, fmt.Errorf("failed to determine tax invoice requirement: %w", err)
	}
	receipt.IsTaxInvoice = isTaxInvoice

	// Validate receipt
	if err := s.ValidateReceiptData(ctx, receipt); err != nil {
		return nil, fmt.Errorf("receipt validation failed: %w", err)
	}

	// Create receipt in repository
	if err := s.receiptRepo.Create(ctx, receipt); err != nil {
		return nil, fmt.Errorf("failed to create receipt: %w", err)
	}

	// Create line items in repository
	for _, lineItem := range lineItems {
		if err := s.lineItemRepo.Create(ctx, &lineItem); err != nil {
			return nil, fmt.Errorf("failed to create line item: %w", err)
		}
	}

	return receipt, nil
}

// GetReceipt retrieves a receipt by ID with line items
func (s *receiptService) GetReceipt(ctx context.Context, id string) (*models.Receipt, error) {
	if id == "" {
		return nil, fmt.Errorf("receipt ID cannot be empty")
	}

	if _, err := uuid.Parse(id); err != nil {
		return nil, fmt.Errorf("invalid receipt ID format: %w", err)
	}

	// Get receipt
	receipt, err := s.receiptRepo.GetByID(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("failed to get receipt: %w", err)
	}

	// Get line items
	lineItems, err := s.lineItemRepo.GetByReceiptID(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("failed to get line items: %w", err)
	}

	// Convert to models.LineItem slice
	receipt.LineItems = make([]models.LineItem, len(lineItems))
	for i, item := range lineItems {
		receipt.LineItems[i] = *item
	}

	return receipt, nil
}

// ListReceipts retrieves receipts with optional filters
func (s *receiptService) ListReceipts(ctx context.Context, filters *ReceiptFilters) ([]*models.Receipt, error) {
	if filters == nil {
		filters = &ReceiptFilters{}
	}

	// Set default limit if not specified
	if filters.Limit <= 0 {
		filters.Limit = 100
	}

	// Convert filters to repository format
	repoFilters := make(map[string]interface{})

	if filters.CustomerID != nil {
		repoFilters["customer_id"] = *filters.CustomerID
	}
	if filters.PaymentMethod != nil {
		repoFilters["payment_method"] = *filters.PaymentMethod
	}
	if filters.IsTaxInvoice != nil {
		repoFilters["is_tax_invoice"] = *filters.IsTaxInvoice
	}
	if filters.GSTCharged != nil {
		repoFilters["gst_charged"] = *filters.GSTCharged
	}
	if filters.MinAmount != nil {
		repoFilters["min_amount"] = *filters.MinAmount
	}
	if filters.MaxAmount != nil {
		repoFilters["max_amount"] = *filters.MaxAmount
	}
	if filters.StartDate != nil {
		repoFilters["start_date"] = *filters.StartDate
	}
	if filters.EndDate != nil {
		repoFilters["end_date"] = *filters.EndDate
	}
	if filters.Limit > 0 {
		repoFilters["limit"] = filters.Limit
	}
	if filters.Offset > 0 {
		repoFilters["offset"] = filters.Offset
	}

	receipts, err := s.receiptRepo.List(ctx, repoFilters)
	if err != nil {
		return nil, fmt.Errorf("failed to list receipts: %w", err)
	}

	// Load line items for each receipt
	for _, receipt := range receipts {
		lineItems, err := s.lineItemRepo.GetByReceiptID(ctx, receipt.ReceiptID)
		if err != nil {
			return nil, fmt.Errorf("failed to get line items for receipt %s: %w", receipt.ReceiptID, err)
		}

		receipt.LineItems = make([]models.LineItem, len(lineItems))
		for i, item := range lineItems {
			receipt.LineItems[i] = *item
		}
	}

	return receipts, nil
}

// DeleteReceipt deletes a receipt and its line items
func (s *receiptService) DeleteReceipt(ctx context.Context, id string) error {
	if id == "" {
		return fmt.Errorf("receipt ID cannot be empty")
	}

	// Check if receipt exists
	_, err := s.GetReceipt(ctx, id)
	if err != nil {
		return err
	}

	// Delete line items first
	if err := s.lineItemRepo.DeleteByReceiptID(ctx, id); err != nil {
		return fmt.Errorf("failed to delete line items: %w", err)
	}

	// Delete receipt
	if err := s.receiptRepo.Delete(ctx, id); err != nil {
		return fmt.Errorf("failed to delete receipt: %w", err)
	}

	return nil
}

// CalculateReceiptTotals calculates totals for a receipt without creating it
func (s *receiptService) CalculateReceiptTotals(ctx context.Context, req *CalculateReceiptTotalsRequest) (*ReceiptTotalsResult, error) {
	if req == nil {
		return nil, fmt.Errorf("calculate receipt totals request cannot be nil")
	}

	// Validate request
	if err := s.validator.Struct(req); err != nil {
		return nil, fmt.Errorf("validation failed: %w", err)
	}

	// Validate customer exists
	_, err := s.customerRepo.GetByID(ctx, req.CustomerID)
	if err != nil {
		return nil, fmt.Errorf("failed to get customer: %w", err)
	}

	// Get seller profile
	sellerProfile, err := s.sellerProfileRepo.Get(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get seller profile: %w", err)
	}

	var lineItemTotals []LineItemTotal
	var subtotalExclGST, gstAmount float64

	// Calculate each line item
	for _, lineItemReq := range req.LineItems {
		// Get product
		product, err := s.productRepo.GetByID(ctx, lineItemReq.ProductID)
		if err != nil {
			return nil, fmt.Errorf("failed to get product %s: %w", lineItemReq.ProductID, err)
		}

		// Calculate line totals
		lineSubtotal := product.UnitPrice * float64(lineItemReq.Quantity)
		lineGST := 0.0
		if product.GSTApplicable && sellerProfile.ChargeGST {
			lineGST = roundToTwoDecimals(lineSubtotal * 0.10) // 10% GST
		}
		lineTotal := lineSubtotal + lineGST

		lineItemTotals = append(lineItemTotals, LineItemTotal{
			ProductID:     product.ID,
			Quantity:      lineItemReq.Quantity,
			UnitPrice:     product.UnitPrice,
			LineSubtotal:  roundToTwoDecimals(lineSubtotal),
			GSTAmount:     lineGST,
			LineTotal:     roundToTwoDecimals(lineTotal),
			GSTApplicable: product.GSTApplicable,
		})

		subtotalExclGST += lineSubtotal
		gstAmount += lineGST
	}

	totalIncGST := subtotalExclGST + gstAmount

	// Determine if tax invoice is required
	isTaxInvoice, err := s.DetermineIfTaxInvoiceRequired(ctx, totalIncGST, req.CustomerID, req.ForceTaxInvoice)
	if err != nil {
		return nil, fmt.Errorf("failed to determine tax invoice requirement: %w", err)
	}

	return &ReceiptTotalsResult{
		SubtotalExclGST: roundToTwoDecimals(subtotalExclGST),
		GSTAmount:       roundToTwoDecimals(gstAmount),
		TotalIncGST:     roundToTwoDecimals(totalIncGST),
		IsTaxInvoice:    isTaxInvoice,
		GSTCharged:      gstAmount > 0,
		LineItemTotals:  lineItemTotals,
	}, nil
}

// ValidateReceiptForTaxCompliance validates a receipt for tax compliance
func (s *receiptService) ValidateReceiptForTaxCompliance(ctx context.Context, receiptID string) (*TaxComplianceResult, error) {
	if receiptID == "" {
		return nil, fmt.Errorf("receipt ID cannot be empty")
	}

	// Get receipt
	receipt, err := s.GetReceipt(ctx, receiptID)
	if err != nil {
		return nil, err
	}

	// Get customer and seller snapshots
	customerSnapshot, err := receipt.GetCustomerSnapshot()
	if err != nil {
		return nil, fmt.Errorf("failed to get customer snapshot: %w", err)
	}

	sellerSnapshot, err := receipt.GetSellerProfileSnapshot()
	if err != nil {
		return nil, fmt.Errorf("failed to get seller snapshot: %w", err)
	}

	result := &TaxComplianceResult{
		IsCompliant:  true,
		IsTaxInvoice: receipt.IsTaxInvoice,
		Errors:       []string{},
		Warnings:     []string{},
	}

	if receipt.IsTaxInvoice {
		result.TaxInvoiceReason = "Tax invoice required"
		result.RequiredFields = []string{
			"seller_abn", "customer_details", "invoice_date",
			"description_of_goods", "gst_amount", "total_amount",
		}

		// Check required fields
		if sellerSnapshot.ABNOrACN == "" {
			result.IsCompliant = false
			result.MissingFields = append(result.MissingFields, "seller_abn")
			result.Errors = append(result.Errors, "Seller ABN/ACN is required for tax invoices")
		}

		if customerSnapshot.CustomerType == models.CustomerTypeBusiness &&
			(customerSnapshot.BusinessName == nil || *customerSnapshot.BusinessName == "") {
			result.IsCompliant = false
			result.MissingFields = append(result.MissingFields, "customer_business_name")
			result.Errors = append(result.Errors, "Customer business name is required for business customers")
		}

		if receipt.GSTAmount <= 0 {
			result.IsCompliant = false
			result.Errors = append(result.Errors, "GST amount must be greater than zero for tax invoices")
		}

		if len(receipt.LineItems) == 0 {
			result.IsCompliant = false
			result.MissingFields = append(result.MissingFields, "line_items")
			result.Errors = append(result.Errors, "Tax invoices must have line items with descriptions")
		}
	}

	return result, nil
}

// DetermineIfTaxInvoiceRequired determines if a tax invoice is required
func (s *receiptService) DetermineIfTaxInvoiceRequired(ctx context.Context, totalAmount float64, customerID string, forceInvoice bool) (bool, error) {
	if forceInvoice {
		return true, nil
	}

	// Get seller profile to check if GST is charged
	sellerProfile, err := s.sellerProfileRepo.Get(ctx)
	if err != nil {
		return false, fmt.Errorf("failed to get seller profile: %w", err)
	}

	// No tax invoice if seller doesn't charge GST
	if !sellerProfile.ChargeGST {
		return false, nil
	}

	// Tax invoice required if total >= $82.50 AUD (ATO requirement)
	if totalAmount >= 82.50 {
		return true, nil
	}

	// Get customer to check if business customer
	customer, err := s.customerRepo.GetByID(ctx, customerID)
	if err != nil {
		return false, fmt.Errorf("failed to get customer: %w", err)
	}

	// Tax invoice required for business customers (optional business rule)
	if customer.CustomerType == models.CustomerTypeBusiness {
		return true, nil
	}

	return false, nil
}

// GenerateReceiptPDF generates a PDF for a receipt
func (s *receiptService) GenerateReceiptPDF(ctx context.Context, receiptID string) ([]byte, error) {
	// This would integrate with a PDF generation library
	// For now, return an error indicating it's not implemented
	return nil, fmt.Errorf("PDF generation not implemented yet")
}

// GenerateReceiptHTML generates HTML for a receipt
func (s *receiptService) GenerateReceiptHTML(ctx context.Context, receiptID string) (string, error) {
	// This would generate HTML using templates
	// For now, return an error indicating it's not implemented
	return "", fmt.Errorf("HTML generation not implemented yet")
}

// FormatReceiptForPrint formats a receipt for printing
func (s *receiptService) FormatReceiptForPrint(ctx context.Context, receiptID string) (*PrintableReceipt, error) {
	receipt, err := s.GetReceipt(ctx, receiptID)
	if err != nil {
		return nil, err
	}

	customerSnapshot, err := receipt.GetCustomerSnapshot()
	if err != nil {
		return nil, fmt.Errorf("failed to get customer snapshot: %w", err)
	}

	sellerSnapshot, err := receipt.GetSellerProfileSnapshot()
	if err != nil {
		return nil, fmt.Errorf("failed to get seller snapshot: %w", err)
	}

	return &PrintableReceipt{
		Receipt:          receipt,
		FormattedHTML:    "", // Would be generated from template
		PrintCSS:         "", // Would be loaded from CSS file
		CustomerSnapshot: customerSnapshot,
		SellerSnapshot:   sellerSnapshot,
	}, nil
}

// GetSalesReport generates a comprehensive sales report
func (s *receiptService) GetSalesReport(ctx context.Context, startDate, endDate time.Time) (*repositories.SalesReport, error) {
	report, err := s.receiptRepo.GetSalesReport(ctx, startDate, endDate)
	if err != nil {
		return nil, fmt.Errorf("failed to get sales report: %w", err)
	}

	return report, nil
}

// GetDailySales retrieves sales summary for a specific date
func (s *receiptService) GetDailySales(ctx context.Context, date time.Time) (*repositories.SalesSummary, error) {
	summary, err := s.receiptRepo.GetDailySales(ctx, date)
	if err != nil {
		return nil, fmt.Errorf("failed to get daily sales: %w", err)
	}

	return summary, nil
}

// GetMonthlySales retrieves sales summary for a specific month
func (s *receiptService) GetMonthlySales(ctx context.Context, year int, month time.Month) (*repositories.SalesSummary, error) {
	summary, err := s.receiptRepo.GetMonthlySales(ctx, year, month)
	if err != nil {
		return nil, fmt.Errorf("failed to get monthly sales: %w", err)
	}

	return summary, nil
}

// GetReceiptsByCustomer retrieves receipts for a customer within date range
func (s *receiptService) GetReceiptsByCustomer(ctx context.Context, customerID string, startDate, endDate time.Time) ([]*models.Receipt, error) {
	if customerID == "" {
		return nil, fmt.Errorf("customer ID cannot be empty")
	}

	receipts, err := s.receiptRepo.GetReceiptsByCustomerWithDateRange(ctx, customerID, startDate, endDate)
	if err != nil {
		return nil, fmt.Errorf("failed to get receipts by customer: %w", err)
	}

	return receipts, nil
}

// GetTopCustomersByRevenue retrieves customers ordered by total revenue
func (s *receiptService) GetTopCustomersByRevenue(ctx context.Context, limit int) ([]*repositories.CustomerRevenue, error) {
	if limit <= 0 {
		limit = 10
	}

	customers, err := s.receiptRepo.GetTopCustomersByRevenue(ctx, limit)
	if err != nil {
		return nil, fmt.Errorf("failed to get top customers by revenue: %w", err)
	}

	return customers, nil
}

// ValidateReceiptData validates receipt data according to business rules
func (s *receiptService) ValidateReceiptData(ctx context.Context, receipt *models.Receipt) error {
	if receipt == nil {
		return fmt.Errorf("receipt cannot be nil")
	}

	// Use model's built-in validation
	if err := receipt.Validate(); err != nil {
		return err
	}

	// Additional business rule validations
	if len(receipt.LineItems) == 0 {
		return fmt.Errorf("receipt must have at least one line item")
	}

	return nil
}

// ValidateLineItems validates line items according to business rules
func (s *receiptService) ValidateLineItems(ctx context.Context, lineItems []models.LineItem) error {
	if len(lineItems) == 0 {
		return fmt.Errorf("at least one line item is required")
	}

	for i, item := range lineItems {
		if err := item.Validate(); err != nil {
			return fmt.Errorf("line item %d validation failed: %w", i+1, err)
		}

		if item.Quantity <= 0 {
			return fmt.Errorf("line item %d: quantity must be positive", i+1)
		}

		if item.UnitPrice < 0 {
			return fmt.Errorf("line item %d: unit price cannot be negative", i+1)
		}
	}

	return nil
}

// roundToTwoDecimals rounds a float64 to 2 decimal places
func roundToTwoDecimals(value float64) float64 {
	return float64(int(value*100+0.5)) / 100
}
