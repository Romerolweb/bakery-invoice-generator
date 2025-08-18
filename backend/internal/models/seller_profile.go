package models

import (
	"fmt"
	"strings"
	"time"
)

// SellerProfile represents the seller/business profile (singleton)
type SellerProfile struct {
	ID              int       `json:"id" db:"id" validate:"required,eq=1"`
	Name            string    `json:"name" db:"name" validate:"required,min=1,max=255"`
	BusinessAddress string    `json:"business_address" db:"business_address" validate:"required,min=1,max=500"`
	ABNOrACN        string    `json:"abn_or_acn" db:"abn_or_acn" validate:"required,min=1,max=50"`
	ContactEmail    string    `json:"contact_email" db:"contact_email" validate:"required,email"`
	Phone           *string   `json:"phone,omitempty" db:"phone"`
	LogoURL         *string   `json:"logo_url,omitempty" db:"logo_url"`
	GSTRegistered   bool      `json:"gst_registered" db:"gst_registered"`
	ChargeGST       bool      `json:"charge_gst" db:"charge_gst"`
	UpdatedAt       time.Time `json:"updated_at" db:"updated_at"`
}

// NewSellerProfile creates a new seller profile with default ID (1) and timestamp
func NewSellerProfile(name, businessAddress, abnOrACN, contactEmail string) *SellerProfile {
	return &SellerProfile{
		ID:              1, // Singleton - always ID 1
		Name:            name,
		BusinessAddress: businessAddress,
		ABNOrACN:        abnOrACN,
		ContactEmail:    contactEmail,
		GSTRegistered:   false, // Default to not GST registered (under $75k threshold)
		ChargeGST:       false, // Default to not charging GST
		UpdatedAt:       time.Now(),
	}
}

// Validate validates the seller profile data
func (sp *SellerProfile) Validate() error {
	if sp.ID != 1 {
		return fmt.Errorf("seller profile ID must be 1 (singleton)")
	}

	if strings.TrimSpace(sp.Name) == "" {
		return fmt.Errorf("seller name is required")
	}

	if len(sp.Name) > 255 {
		return fmt.Errorf("seller name cannot exceed 255 characters")
	}

	if strings.TrimSpace(sp.BusinessAddress) == "" {
		return fmt.Errorf("business address is required")
	}

	if len(sp.BusinessAddress) > 500 {
		return fmt.Errorf("business address cannot exceed 500 characters")
	}

	if strings.TrimSpace(sp.ABNOrACN) == "" {
		return fmt.Errorf("ABN or ACN is required")
	}

	if len(sp.ABNOrACN) > 50 {
		return fmt.Errorf("ABN or ACN cannot exceed 50 characters")
	}

	if strings.TrimSpace(sp.ContactEmail) == "" {
		return fmt.Errorf("contact email is required")
	}

	if !isValidEmail(sp.ContactEmail) {
		return fmt.Errorf("invalid contact email format: %s", sp.ContactEmail)
	}

	// Validate phone if provided
	if sp.Phone != nil && strings.TrimSpace(*sp.Phone) == "" {
		sp.Phone = nil // Convert empty string to nil
	}

	// Validate logo URL if provided
	if sp.LogoURL != nil && strings.TrimSpace(*sp.LogoURL) == "" {
		sp.LogoURL = nil // Convert empty string to nil
	}

	return nil
}

// SetPhone sets the phone number
func (sp *SellerProfile) SetPhone(phone string) {
	if strings.TrimSpace(phone) == "" {
		sp.Phone = nil
	} else {
		sp.Phone = &phone
	}
}

// GetPhone returns the phone number or empty string if nil
func (sp *SellerProfile) GetPhone() string {
	if sp.Phone == nil {
		return ""
	}
	return *sp.Phone
}

// SetLogoURL sets the logo URL
func (sp *SellerProfile) SetLogoURL(logoURL string) {
	if strings.TrimSpace(logoURL) == "" {
		sp.LogoURL = nil
	} else {
		sp.LogoURL = &logoURL
	}
}

// GetLogoURL returns the logo URL or empty string if nil
func (sp *SellerProfile) GetLogoURL() string {
	if sp.LogoURL == nil {
		return ""
	}
	return *sp.LogoURL
}

// UpdateTimestamp updates the UpdatedAt timestamp
func (sp *SellerProfile) UpdateTimestamp() {
	sp.UpdatedAt = time.Now()
}

// HasLogo returns true if a logo URL is set
func (sp *SellerProfile) HasLogo() bool {
	return sp.LogoURL != nil && strings.TrimSpace(*sp.LogoURL) != ""
}

// HasPhone returns true if a phone number is set
func (sp *SellerProfile) HasPhone() bool {
	return sp.Phone != nil && strings.TrimSpace(*sp.Phone) != ""
}

// GetFormattedAddress returns the business address formatted for display
func (sp *SellerProfile) GetFormattedAddress() string {
	// Simple formatting - replace newlines with commas for single-line display
	return strings.ReplaceAll(sp.BusinessAddress, "\n", ", ")
}

// IsABN returns true if the ABN/ACN field appears to be an ABN (11 digits)
func (sp *SellerProfile) IsABN() bool {
	// Simple check for ABN format (11 digits)
	cleaned := strings.ReplaceAll(strings.ReplaceAll(sp.ABNOrACN, " ", ""), "-", "")
	return len(cleaned) == 11 && isNumeric(cleaned)
}

// IsACN returns true if the ABN/ACN field appears to be an ACN (9 digits)
func (sp *SellerProfile) IsACN() bool {
	// Simple check for ACN format (9 digits)
	cleaned := strings.ReplaceAll(strings.ReplaceAll(sp.ABNOrACN, " ", ""), "-", "")
	return len(cleaned) == 9 && isNumeric(cleaned)
}

// GetABNOrACNFormatted returns the ABN/ACN with standard formatting
func (sp *SellerProfile) GetABNOrACNFormatted() string {
	cleaned := strings.ReplaceAll(strings.ReplaceAll(sp.ABNOrACN, " ", ""), "-", "")

	if len(cleaned) == 11 && isNumeric(cleaned) {
		// Format as ABN: XX XXX XXX XXX
		return fmt.Sprintf("%s %s %s %s", cleaned[0:2], cleaned[2:5], cleaned[5:8], cleaned[8:11])
	} else if len(cleaned) == 9 && isNumeric(cleaned) {
		// Format as ACN: XXX XXX XXX
		return fmt.Sprintf("%s %s %s", cleaned[0:3], cleaned[3:6], cleaned[6:9])
	}

	// Return as-is if not standard format
	return sp.ABNOrACN
}

// SetGSTRegistration sets the GST registration status
func (sp *SellerProfile) SetGSTRegistration(registered bool) {
	sp.GSTRegistered = registered
	// If not registered, cannot charge GST
	if !registered {
		sp.ChargeGST = false
	}
	sp.UpdateTimestamp()
}

// SetChargeGST sets whether to charge GST (only if GST registered)
func (sp *SellerProfile) SetChargeGST(charge bool) error {
	if charge && !sp.GSTRegistered {
		return fmt.Errorf("cannot charge GST when not GST registered")
	}
	sp.ChargeGST = charge
	sp.UpdateTimestamp()
	return nil
}

// IsGSTRegistered returns true if the business is registered for GST
func (sp *SellerProfile) IsGSTRegistered() bool {
	return sp.GSTRegistered
}

// ShouldChargeGST returns true if GST should be charged on transactions
func (sp *SellerProfile) ShouldChargeGST() bool {
	return sp.GSTRegistered && sp.ChargeGST
}

// GetGSTStatus returns a human-readable GST status
func (sp *SellerProfile) GetGSTStatus() string {
	if !sp.GSTRegistered {
		return "Not GST Registered (Annual turnover under $75,000)"
	}
	if sp.ChargeGST {
		return "GST Registered - Charging GST"
	}
	return "GST Registered - Not Charging GST"
}

// isNumeric checks if a string contains only digits
func isNumeric(s string) bool {
	for _, r := range s {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}
