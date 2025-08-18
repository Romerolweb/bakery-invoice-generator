package models

import (
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
)

// PaymentMethod represents the payment method used
type PaymentMethod string

const (
	PaymentMethodCash         PaymentMethod = "cash"
	PaymentMethodCard         PaymentMethod = "card"
	PaymentMethodEFTPOS       PaymentMethod = "eftpos"
	PaymentMethodBankTransfer PaymentMethod = "bank_transfer"
	PaymentMethodOther        PaymentMethod = "other"
)

// Receipt represents a receipt/invoice in the system
type Receipt struct {
	ReceiptID             string        `json:"receipt_id" db:"receipt_id" validate:"required,uuid"`
	CustomerID            string        `json:"customer_id" db:"customer_id" validate:"required,uuid"`
	DateOfPurchase        time.Time     `json:"date_of_purchase" db:"date_of_purchase" validate:"required"`
	SubtotalExclGST       float64       `json:"subtotal_excl_gst" db:"subtotal_excl_gst"`
	GSTAmount             float64       `json:"gst_amount" db:"gst_amount"`
	TotalIncGST           float64       `json:"total_inc_gst" db:"total_inc_gst"`
	IsTaxInvoice          bool          `json:"is_tax_invoice" db:"is_tax_invoice"`
	PaymentMethod         PaymentMethod `json:"payment_method" db:"payment_method"`
	Notes                 *string       `json:"notes,omitempty" db:"notes"`
	SellerProfileSnapshot string        `json:"seller_profile_snapshot" db:"seller_profile_snapshot"`
	CustomerSnapshot      string        `json:"customer_snapshot" db:"customer_snapshot"`
	CreatedAt             time.Time     `json:"created_at" db:"created_at"`

	// Associations (not stored in database, loaded separately)
	LineItems []LineItem `json:"line_items,omitempty"`
}

// CustomerSnapshotData represents the customer data snapshot
type CustomerSnapshotData struct {
	ID           string       `json:"id"`
	CustomerType CustomerType `json:"customer_type"`
	FirstName    *string      `json:"first_name,omitempty"`
	LastName     *string      `json:"last_name,omitempty"`
	BusinessName *string      `json:"business_name,omitempty"`
	ABN          *string      `json:"abn,omitempty"`
	Email        *string      `json:"email,omitempty"`
	Phone        *string      `json:"phone,omitempty"`
	Address      *string      `json:"address,omitempty"`
}

// SellerProfileSnapshotData represents the seller profile data snapshot
type SellerProfileSnapshotData struct {
	Name            string  `json:"name"`
	BusinessAddress string  `json:"business_address"`
	ABNOrACN        string  `json:"abn_or_acn"`
	ContactEmail    string  `json:"contact_email"`
	Phone           *string `json:"phone,omitempty"`
	LogoURL         *string `json:"logo_url,omitempty"`
}

// NewReceipt creates a new receipt with generated ID and timestamp
func NewReceipt(customerID string) *Receipt {
	now := time.Now()
	return &Receipt{
		ReceiptID:      uuid.New().String(),
		CustomerID:     customerID,
		DateOfPurchase: now,
		PaymentMethod:  PaymentMethodCash, // Default to cash
		CreatedAt:      now,
	}
}

// Validate validates the receipt data
func (r *Receipt) Validate() error {
	if r.ReceiptID == "" {
		return fmt.Errorf("receipt ID is required")
	}

	if r.CustomerID == "" {
		return fmt.Errorf("customer ID is required")
	}

	if r.DateOfPurchase.IsZero() {
		return fmt.Errorf("date of purchase is required")
	}

	if r.SubtotalExclGST < 0 {
		return fmt.Errorf("subtotal cannot be negative")
	}

	if r.GSTAmount < 0 {
		return fmt.Errorf("GST amount cannot be negative")
	}

	if r.TotalIncGST < 0 {
		return fmt.Errorf("total cannot be negative")
	}

	// Validate that total = subtotal + GST (with small tolerance for rounding)
	expectedTotal := r.SubtotalExclGST + r.GSTAmount
	if abs(r.TotalIncGST-expectedTotal) > 0.01 {
		return fmt.Errorf("total amount does not match subtotal + GST")
	}

	return nil
}

// CalculateTotals calculates and sets the subtotal, GST, and total amounts based on line items
func (r *Receipt) CalculateTotals(includeGST bool) {
	var subtotal, gstAmount float64

	for _, item := range r.LineItems {
		lineSubtotal := item.UnitPrice * float64(item.Quantity)
		subtotal += lineSubtotal

		if item.GSTApplicable && includeGST {
			gstAmount += roundToTwoDecimals(lineSubtotal * 0.10) // 10% GST
		}
	}

	r.SubtotalExclGST = roundToTwoDecimals(subtotal)
	r.GSTAmount = roundToTwoDecimals(gstAmount)
	r.TotalIncGST = roundToTwoDecimals(subtotal + gstAmount)

	// Determine if this should be a tax invoice
	r.IsTaxInvoice = r.TotalIncGST >= 82.50 || r.hasBusinessCustomer()
}

// SetCustomerSnapshot sets the customer snapshot from a Customer object
func (r *Receipt) SetCustomerSnapshot(customer *Customer) error {
	snapshot := CustomerSnapshotData{
		ID:           customer.ID,
		CustomerType: customer.CustomerType,
		FirstName:    customer.FirstName,
		LastName:     customer.LastName,
		BusinessName: customer.BusinessName,
		ABN:          customer.ABN,
		Email:        customer.Email,
		Phone:        customer.Phone,
		Address:      customer.Address,
	}

	data, err := json.Marshal(snapshot)
	if err != nil {
		return fmt.Errorf("failed to marshal customer snapshot: %w", err)
	}

	r.CustomerSnapshot = string(data)
	return nil
}

// GetCustomerSnapshot returns the customer snapshot data
func (r *Receipt) GetCustomerSnapshot() (*CustomerSnapshotData, error) {
	var snapshot CustomerSnapshotData
	if err := json.Unmarshal([]byte(r.CustomerSnapshot), &snapshot); err != nil {
		return nil, fmt.Errorf("failed to unmarshal customer snapshot: %w", err)
	}
	return &snapshot, nil
}

// SetSellerProfileSnapshot sets the seller profile snapshot from a SellerProfile object
func (r *Receipt) SetSellerProfileSnapshot(seller *SellerProfile) error {
	snapshot := SellerProfileSnapshotData{
		Name:            seller.Name,
		BusinessAddress: seller.BusinessAddress,
		ABNOrACN:        seller.ABNOrACN,
		ContactEmail:    seller.ContactEmail,
		Phone:           seller.Phone,
		LogoURL:         seller.LogoURL,
	}

	data, err := json.Marshal(snapshot)
	if err != nil {
		return fmt.Errorf("failed to marshal seller profile snapshot: %w", err)
	}

	r.SellerProfileSnapshot = string(data)
	return nil
}

// GetSellerProfileSnapshot returns the seller profile snapshot data
func (r *Receipt) GetSellerProfileSnapshot() (*SellerProfileSnapshotData, error) {
	var snapshot SellerProfileSnapshotData
	if err := json.Unmarshal([]byte(r.SellerProfileSnapshot), &snapshot); err != nil {
		return nil, fmt.Errorf("failed to unmarshal seller profile snapshot: %w", err)
	}
	return &snapshot, nil
}

// SetNotes sets the receipt notes
func (r *Receipt) SetNotes(notes string) {
	if notes == "" {
		r.Notes = nil
	} else {
		r.Notes = &notes
	}
}

// GetNotes returns the receipt notes or empty string if nil
func (r *Receipt) GetNotes() string {
	if r.Notes == nil {
		return ""
	}
	return *r.Notes
}

// hasBusinessCustomer checks if the customer is a business (from snapshot)
func (r *Receipt) hasBusinessCustomer() bool {
	snapshot, err := r.GetCustomerSnapshot()
	if err != nil {
		return false
	}
	return snapshot.CustomerType == CustomerTypeBusiness
}

// GetCustomerDisplayName returns the display name from the customer snapshot
func (r *Receipt) GetCustomerDisplayName() string {
	snapshot, err := r.GetCustomerSnapshot()
	if err != nil {
		return "Unknown Customer"
	}

	if snapshot.CustomerType == CustomerTypeBusiness && snapshot.BusinessName != nil {
		return *snapshot.BusinessName
	}

	var parts []string
	if snapshot.FirstName != nil && *snapshot.FirstName != "" {
		parts = append(parts, *snapshot.FirstName)
	}
	if snapshot.LastName != nil && *snapshot.LastName != "" {
		parts = append(parts, *snapshot.LastName)
	}

	if len(parts) > 0 {
		return fmt.Sprintf("%s", parts[0])
		if len(parts) > 1 {
			return fmt.Sprintf("%s %s", parts[0], parts[1])
		}
	}

	return "Unknown Customer"
}

// abs returns the absolute value of a float64
func abs(x float64) float64 {
	if x < 0 {
		return -x
	}
	return x
}
