package models

import (
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
)

// CustomerType represents the type of customer
type CustomerType string

const (
	CustomerTypeIndividual CustomerType = "individual"
	CustomerTypeBusiness   CustomerType = "business"
)

// Customer represents a customer in the system
type Customer struct {
	ID           string       `json:"id" db:"id" validate:"required,uuid"`
	CustomerType CustomerType `json:"customer_type" db:"customer_type" validate:"required,oneof=individual business"`
	FirstName    *string      `json:"first_name,omitempty" db:"first_name"`
	LastName     *string      `json:"last_name,omitempty" db:"last_name"`
	BusinessName *string      `json:"business_name,omitempty" db:"business_name"`
	ABN          *string      `json:"abn,omitempty" db:"abn"`
	Email        *string      `json:"email,omitempty" db:"email" validate:"omitempty,email"`
	Phone        *string      `json:"phone,omitempty" db:"phone"`
	Address      *string      `json:"address,omitempty" db:"address"`
	CreatedAt    time.Time    `json:"created_at" db:"created_at"`
	UpdatedAt    time.Time    `json:"updated_at" db:"updated_at"`
}

// NewCustomer creates a new customer with generated ID and timestamps
func NewCustomer(customerType CustomerType) *Customer {
	now := time.Now()
	return &Customer{
		ID:           uuid.New().String(),
		CustomerType: customerType,
		CreatedAt:    now,
		UpdatedAt:    now,
	}
}

// NewIndividualCustomer creates a new individual customer
func NewIndividualCustomer(firstName, lastName string) *Customer {
	customer := NewCustomer(CustomerTypeIndividual)
	customer.FirstName = &firstName
	customer.LastName = &lastName
	return customer
}

// NewBusinessCustomer creates a new business customer
func NewBusinessCustomer(businessName string) *Customer {
	customer := NewCustomer(CustomerTypeBusiness)
	customer.BusinessName = &businessName
	return customer
}

// Validate validates the customer data
func (c *Customer) Validate() error {
	if c.ID == "" {
		return fmt.Errorf("customer ID is required")
	}

	if c.CustomerType != CustomerTypeIndividual && c.CustomerType != CustomerTypeBusiness {
		return fmt.Errorf("invalid customer type: %s", c.CustomerType)
	}

	if c.CustomerType == CustomerTypeIndividual {
		if c.FirstName == nil || strings.TrimSpace(*c.FirstName) == "" {
			return fmt.Errorf("first name is required for individual customers")
		}
	}

	if c.CustomerType == CustomerTypeBusiness {
		if c.BusinessName == nil || strings.TrimSpace(*c.BusinessName) == "" {
			return fmt.Errorf("business name is required for business customers")
		}
	}

	// Validate email format if provided
	if c.Email != nil && *c.Email != "" {
		if !isValidEmail(*c.Email) {
			return fmt.Errorf("invalid email format: %s", *c.Email)
		}
	}

	return nil
}

// GetDisplayName returns the display name for the customer
func (c *Customer) GetDisplayName() string {
	if c.CustomerType == CustomerTypeBusiness && c.BusinessName != nil {
		return *c.BusinessName
	}

	var parts []string
	if c.FirstName != nil && *c.FirstName != "" {
		parts = append(parts, *c.FirstName)
	}
	if c.LastName != nil && *c.LastName != "" {
		parts = append(parts, *c.LastName)
	}

	if len(parts) > 0 {
		return strings.Join(parts, " ")
	}

	return "Unknown Customer"
}

// IsIndividual returns true if the customer is an individual
func (c *Customer) IsIndividual() bool {
	return c.CustomerType == CustomerTypeIndividual
}

// IsBusiness returns true if the customer is a business
func (c *Customer) IsBusiness() bool {
	return c.CustomerType == CustomerTypeBusiness
}

// HasABN returns true if the customer has an ABN
func (c *Customer) HasABN() bool {
	return c.ABN != nil && strings.TrimSpace(*c.ABN) != ""
}

// GetSearchableText returns text that can be used for searching
func (c *Customer) GetSearchableText() string {
	var parts []string

	if c.FirstName != nil && *c.FirstName != "" {
		parts = append(parts, *c.FirstName)
	}
	if c.LastName != nil && *c.LastName != "" {
		parts = append(parts, *c.LastName)
	}
	if c.BusinessName != nil && *c.BusinessName != "" {
		parts = append(parts, *c.BusinessName)
	}
	if c.Email != nil && *c.Email != "" {
		parts = append(parts, *c.Email)
	}
	if c.Phone != nil && *c.Phone != "" {
		parts = append(parts, *c.Phone)
	}

	return strings.Join(parts, " ")
}

// UpdateTimestamp updates the UpdatedAt timestamp
func (c *Customer) UpdateTimestamp() {
	c.UpdatedAt = time.Now()
}

// isValidEmail performs basic email validation
func isValidEmail(email string) bool {
	return strings.Contains(email, "@") && strings.Contains(email, ".")
}
