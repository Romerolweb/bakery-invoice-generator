package models

import (
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
)

// Product represents a product in the system
type Product struct {
	ID            string    `json:"id" db:"id" validate:"required,uuid"`
	Name          string    `json:"name" db:"name" validate:"required,min=1,max=255"`
	Description   *string   `json:"description,omitempty" db:"description"`
	Category      string    `json:"category" db:"category" validate:"required"`
	UnitPrice     float64   `json:"unit_price" db:"unit_price" validate:"required,min=0"`
	GSTApplicable bool      `json:"gst_applicable" db:"gst_applicable"`
	Active        bool      `json:"active" db:"active"`
	CreatedAt     time.Time `json:"created_at" db:"created_at"`
	UpdatedAt     time.Time `json:"updated_at" db:"updated_at"`
}

// NewProduct creates a new product with generated ID and timestamps
func NewProduct(name, category string, unitPrice float64) *Product {
	now := time.Now()
	return &Product{
		ID:            uuid.New().String(),
		Name:          name,
		Category:      category,
		UnitPrice:     unitPrice,
		GSTApplicable: true, // Default to GST applicable
		Active:        true, // Default to active
		CreatedAt:     now,
		UpdatedAt:     now,
	}
}

// Validate validates the product data
func (p *Product) Validate() error {
	if p.ID == "" {
		return fmt.Errorf("product ID is required")
	}

	if strings.TrimSpace(p.Name) == "" {
		return fmt.Errorf("product name is required")
	}

	if len(p.Name) > 255 {
		return fmt.Errorf("product name cannot exceed 255 characters")
	}

	if strings.TrimSpace(p.Category) == "" {
		return fmt.Errorf("product category is required")
	}

	if p.UnitPrice < 0 {
		return fmt.Errorf("unit price cannot be negative")
	}

	return nil
}

// CalculateGST calculates the GST amount for the given quantity
func (p *Product) CalculateGST(quantity int, includeGST bool) float64 {
	if !p.GSTApplicable || !includeGST {
		return 0.0
	}

	lineTotal := p.UnitPrice * float64(quantity)
	return roundToTwoDecimals(lineTotal * 0.10) // 10% GST
}

// CalculateLineTotal calculates the total for a line item including GST if applicable
func (p *Product) CalculateLineTotal(quantity int, includeGST bool) float64 {
	baseTotal := p.UnitPrice * float64(quantity)
	gstAmount := p.CalculateGST(quantity, includeGST)
	return roundToTwoDecimals(baseTotal + gstAmount)
}

// GetSearchableText returns text that can be used for searching
func (p *Product) GetSearchableText() string {
	var parts []string

	parts = append(parts, p.Name)
	parts = append(parts, p.Category)

	if p.Description != nil && *p.Description != "" {
		parts = append(parts, *p.Description)
	}

	return strings.Join(parts, " ")
}

// UpdateTimestamp updates the UpdatedAt timestamp
func (p *Product) UpdateTimestamp() {
	p.UpdatedAt = time.Now()
}

// IsActive returns true if the product is active
func (p *Product) IsActive() bool {
	return p.Active
}

// HasGST returns true if GST is applicable to this product
func (p *Product) HasGST() bool {
	return p.GSTApplicable
}

// SetDescription sets the product description
func (p *Product) SetDescription(description string) {
	if strings.TrimSpace(description) == "" {
		p.Description = nil
	} else {
		p.Description = &description
	}
}

// GetDescription returns the product description or empty string if nil
func (p *Product) GetDescription() string {
	if p.Description == nil {
		return ""
	}
	return *p.Description
}

// roundToTwoDecimals rounds a float64 to 2 decimal places
func roundToTwoDecimals(value float64) float64 {
	return float64(int(value*100+0.5)) / 100
}
