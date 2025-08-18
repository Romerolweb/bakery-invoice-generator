package models

import (
	"fmt"
	"strings"

	"github.com/google/uuid"
)

// LineItem represents a line item in a receipt
type LineItem struct {
	ID            string  `json:"id" db:"id" validate:"required,uuid"`
	ReceiptID     string  `json:"receipt_id" db:"receipt_id" validate:"required,uuid"`
	ProductID     string  `json:"product_id" db:"product_id" validate:"required,uuid"`
	ProductName   string  `json:"product_name" db:"product_name" validate:"required,min=1,max=255"`
	Description   *string `json:"description,omitempty" db:"description"`
	Quantity      int     `json:"quantity" db:"quantity" validate:"required,min=1"`
	UnitPrice     float64 `json:"unit_price" db:"unit_price" validate:"required,min=0"`
	LineTotal     float64 `json:"line_total" db:"line_total"`
	GSTApplicable bool    `json:"gst_applicable" db:"gst_applicable"`
	SortOrder     int     `json:"sort_order" db:"sort_order"`
}

// NewLineItem creates a new line item with generated ID
func NewLineItem(receiptID, productID string, product *Product, quantity int, sortOrder int) *LineItem {
	lineItem := &LineItem{
		ID:            uuid.New().String(),
		ReceiptID:     receiptID,
		ProductID:     productID,
		ProductName:   product.Name,
		Quantity:      quantity,
		UnitPrice:     product.UnitPrice,
		GSTApplicable: product.GSTApplicable,
		SortOrder:     sortOrder,
	}

	// Set description if product has one
	if product.Description != nil {
		lineItem.Description = product.Description
	}

	// Calculate line total
	lineItem.LineTotal = roundToTwoDecimals(product.UnitPrice * float64(quantity))

	return lineItem
}

// NewCustomLineItem creates a new line item with custom product details (for one-off items)
func NewCustomLineItem(receiptID, productName, description string, quantity int, unitPrice float64, gstApplicable bool, sortOrder int) *LineItem {
	lineItem := &LineItem{
		ID:            uuid.New().String(),
		ReceiptID:     receiptID,
		ProductID:     uuid.New().String(), // Generate a unique ID for custom items
		ProductName:   productName,
		Quantity:      quantity,
		UnitPrice:     unitPrice,
		GSTApplicable: gstApplicable,
		SortOrder:     sortOrder,
	}

	// Set description if provided
	if strings.TrimSpace(description) != "" {
		lineItem.Description = &description
	}

	// Calculate line total
	lineItem.LineTotal = roundToTwoDecimals(unitPrice * float64(quantity))

	return lineItem
}

// Validate validates the line item data
func (li *LineItem) Validate() error {
	if li.ID == "" {
		return fmt.Errorf("line item ID is required")
	}

	if li.ReceiptID == "" {
		return fmt.Errorf("receipt ID is required")
	}

	if li.ProductID == "" {
		return fmt.Errorf("product ID is required")
	}

	if strings.TrimSpace(li.ProductName) == "" {
		return fmt.Errorf("product name is required")
	}

	if len(li.ProductName) > 255 {
		return fmt.Errorf("product name cannot exceed 255 characters")
	}

	if li.Quantity <= 0 {
		return fmt.Errorf("quantity must be greater than 0")
	}

	if li.UnitPrice < 0 {
		return fmt.Errorf("unit price cannot be negative")
	}

	// Validate that line total matches quantity * unit price
	expectedTotal := roundToTwoDecimals(li.UnitPrice * float64(li.Quantity))
	if abs(li.LineTotal-expectedTotal) > 0.01 {
		return fmt.Errorf("line total does not match quantity * unit price")
	}

	return nil
}

// CalculateGSTAmount calculates the GST amount for this line item
func (li *LineItem) CalculateGSTAmount() float64 {
	if !li.GSTApplicable {
		return 0.0
	}
	return roundToTwoDecimals(li.LineTotal * 0.10) // 10% GST
}

// CalculateSubtotal calculates the subtotal (excluding GST) for this line item
func (li *LineItem) CalculateSubtotal() float64 {
	return li.LineTotal
}

// CalculateTotalIncGST calculates the total including GST for this line item
func (li *LineItem) CalculateTotalIncGST() float64 {
	return roundToTwoDecimals(li.LineTotal + li.CalculateGSTAmount())
}

// SetDescription sets the line item description
func (li *LineItem) SetDescription(description string) {
	if strings.TrimSpace(description) == "" {
		li.Description = nil
	} else {
		li.Description = &description
	}
}

// GetDescription returns the line item description or empty string if nil
func (li *LineItem) GetDescription() string {
	if li.Description == nil {
		return ""
	}
	return *li.Description
}

// UpdateQuantity updates the quantity and recalculates the line total
func (li *LineItem) UpdateQuantity(quantity int) error {
	if quantity <= 0 {
		return fmt.Errorf("quantity must be greater than 0")
	}

	li.Quantity = quantity
	li.LineTotal = roundToTwoDecimals(li.UnitPrice * float64(quantity))
	return nil
}

// UpdateUnitPrice updates the unit price and recalculates the line total
func (li *LineItem) UpdateUnitPrice(unitPrice float64) error {
	if unitPrice < 0 {
		return fmt.Errorf("unit price cannot be negative")
	}

	li.UnitPrice = unitPrice
	li.LineTotal = roundToTwoDecimals(unitPrice * float64(li.Quantity))
	return nil
}

// IsCustomItem returns true if this is a custom line item (not from a product catalog)
func (li *LineItem) IsCustomItem() bool {
	// This is a simple heuristic - in a real system you might have a flag or different ID pattern
	// For now, we'll assume custom items have a description that differs from standard products
	return li.Description != nil && *li.Description != ""
}

// GetDisplayText returns a formatted display text for the line item
func (li *LineItem) GetDisplayText() string {
	text := fmt.Sprintf("%s (x%d)", li.ProductName, li.Quantity)

	if li.Description != nil && *li.Description != "" {
		text += fmt.Sprintf(" - %s", *li.Description)
	}

	return text
}
