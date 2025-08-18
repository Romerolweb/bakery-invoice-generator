package models

import (
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
)

// ProductCategory represents a product category in the system
type ProductCategory struct {
	ID          string    `json:"id" db:"id" validate:"required,uuid"`
	Name        string    `json:"name" db:"name" validate:"required,min=1,max=100"`
	Description *string   `json:"description,omitempty" db:"description"`
	SortOrder   int       `json:"sort_order" db:"sort_order"`
	CreatedAt   time.Time `json:"created_at" db:"created_at"`
}

// NewProductCategory creates a new product category with generated ID and timestamp
func NewProductCategory(name string, sortOrder int) *ProductCategory {
	return &ProductCategory{
		ID:        uuid.New().String(),
		Name:      name,
		SortOrder: sortOrder,
		CreatedAt: time.Now(),
	}
}

// Validate validates the product category data
func (pc *ProductCategory) Validate() error {
	if pc.ID == "" {
		return fmt.Errorf("product category ID is required")
	}

	if strings.TrimSpace(pc.Name) == "" {
		return fmt.Errorf("product category name is required")
	}

	if len(pc.Name) > 100 {
		return fmt.Errorf("product category name cannot exceed 100 characters")
	}

	return nil
}

// SetDescription sets the category description
func (pc *ProductCategory) SetDescription(description string) {
	if strings.TrimSpace(description) == "" {
		pc.Description = nil
	} else {
		pc.Description = &description
	}
}

// GetDescription returns the category description or empty string if nil
func (pc *ProductCategory) GetDescription() string {
	if pc.Description == nil {
		return ""
	}
	return *pc.Description
}

// DefaultProductCategories returns the default product categories for a bakery
func DefaultProductCategories() []*ProductCategory {
	return []*ProductCategory{
		{
			ID:          "breads",
			Name:        "Breads",
			Description: stringPtr("Fresh baked breads and loaves"),
			SortOrder:   1,
			CreatedAt:   time.Now(),
		},
		{
			ID:          "cakes",
			Name:        "Cakes",
			Description: stringPtr("Custom and ready-made cakes"),
			SortOrder:   2,
			CreatedAt:   time.Now(),
		},
		{
			ID:          "pastries",
			Name:        "Pastries",
			Description: stringPtr("Sweet and savory pastries"),
			SortOrder:   3,
			CreatedAt:   time.Now(),
		},
		{
			ID:          "desserts",
			Name:        "Desserts",
			Description: stringPtr("Individual desserts and treats"),
			SortOrder:   4,
			CreatedAt:   time.Now(),
		},
		{
			ID:          "beverages",
			Name:        "Beverages",
			Description: stringPtr("Hot and cold drinks"),
			SortOrder:   5,
			CreatedAt:   time.Now(),
		},
		{
			ID:          "general",
			Name:        "General",
			Description: stringPtr("Miscellaneous items"),
			SortOrder:   99,
			CreatedAt:   time.Now(),
		},
	}
}

// stringPtr returns a pointer to the given string
func stringPtr(s string) *string {
	return &s
}
