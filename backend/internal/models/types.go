package models

import (
	"time"
)

// Common constants
const (
	// GST rate for Australia
	GSTRate = 0.10 // 10%

	// Tax invoice threshold in AUD (GST must be shown on invoices >= $82.50)
	TaxInvoiceThreshold = 82.50

	// GST registration threshold in AUD (businesses with turnover >= $75,000 must register)
	GSTRegistrationThreshold = 75000.00

	// Maximum retry attempts for email delivery
	MaxEmailRetries = 3

	// Default email retry delay
	DefaultEmailRetryDelay = 5 * time.Minute
)

// SalesSummary represents aggregated sales data for reporting
type SalesSummary struct {
	Period         string          `json:"period"`
	StartDate      time.Time       `json:"start_date"`
	EndDate        time.Time       `json:"end_date"`
	TotalReceipts  int             `json:"total_receipts"`
	TotalRevenue   float64         `json:"total_revenue"`
	TotalGST       float64         `json:"total_gst"`
	TaxInvoices    int             `json:"tax_invoices"`
	AverageReceipt float64         `json:"average_receipt"`
	TopProducts    []ProductSales  `json:"top_products,omitempty"`
	TopCustomers   []CustomerSales `json:"top_customers,omitempty"`
}

// ProductSales represents product sales data for reporting
type ProductSales struct {
	ProductID    string  `json:"product_id"`
	ProductName  string  `json:"product_name"`
	Category     string  `json:"category"`
	QuantitySold int     `json:"quantity_sold"`
	TotalRevenue float64 `json:"total_revenue"`
}

// CustomerSales represents customer sales data for reporting
type CustomerSales struct {
	CustomerID     string    `json:"customer_id"`
	CustomerName   string    `json:"customer_name"`
	CustomerType   string    `json:"customer_type"`
	TotalPurchases int       `json:"total_purchases"`
	TotalSpent     float64   `json:"total_spent"`
	LastPurchase   time.Time `json:"last_purchase"`
}

// SearchFilters represents common search and filter parameters
type SearchFilters struct {
	Query     string     `json:"query,omitempty"`
	Category  string     `json:"category,omitempty"`
	StartDate *time.Time `json:"start_date,omitempty"`
	EndDate   *time.Time `json:"end_date,omitempty"`
	Active    *bool      `json:"active,omitempty"`
	Limit     int        `json:"limit,omitempty"`
	Offset    int        `json:"offset,omitempty"`
	SortBy    string     `json:"sort_by,omitempty"`
	SortOrder string     `json:"sort_order,omitempty"` // "asc" or "desc"
}

// PaginationResult represents paginated results
type PaginationResult struct {
	Total       int  `json:"total"`
	Limit       int  `json:"limit"`
	Offset      int  `json:"offset"`
	HasNext     bool `json:"has_next"`
	HasPrevious bool `json:"has_previous"`
}

// APIResponse represents a standard API response structure
type APIResponse struct {
	Success    bool              `json:"success"`
	Data       interface{}       `json:"data,omitempty"`
	Error      *APIError         `json:"error,omitempty"`
	Pagination *PaginationResult `json:"pagination,omitempty"`
	Timestamp  time.Time         `json:"timestamp"`
}

// APIError represents an API error response
type APIError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Details string `json:"details,omitempty"`
}

// ValidationError represents a validation error with field-specific details
type ValidationError struct {
	Field   string      `json:"field"`
	Message string      `json:"message"`
	Value   interface{} `json:"value,omitempty"`
}

// Error implements the error interface
func (ve *ValidationError) Error() string {
	return ve.Message
}

// BusinessRules contains business logic constants and rules
type BusinessRules struct {
	GSTRate                  float64
	TaxInvoiceThreshold      float64
	GSTRegistrationThreshold float64
	MaxLineItemsPerReceipt   int
	MaxReceiptAge            time.Duration
	RequiredCustomerFields   []string
	RequiredProductFields    []string
}

// DefaultBusinessRules returns the default business rules for the bakery
func DefaultBusinessRules() *BusinessRules {
	return &BusinessRules{
		GSTRate:                  GSTRate,
		TaxInvoiceThreshold:      TaxInvoiceThreshold,
		GSTRegistrationThreshold: GSTRegistrationThreshold,
		MaxLineItemsPerReceipt:   50,
		MaxReceiptAge:            365 * 24 * time.Hour, // 1 year
		RequiredCustomerFields:   []string{"customer_type"},
		RequiredProductFields:    []string{"name", "unit_price", "category"},
	}
}

// HealthCheck represents system health status
type HealthCheck struct {
	Status    string            `json:"status"`
	Timestamp time.Time         `json:"timestamp"`
	Version   string            `json:"version"`
	Services  map[string]string `json:"services"`
	Uptime    time.Duration     `json:"uptime"`
}

// AuditLog represents an audit log entry
type AuditLog struct {
	ID         string                 `json:"id"`
	UserID     string                 `json:"user_id,omitempty"`
	Action     string                 `json:"action"`
	Resource   string                 `json:"resource"`
	ResourceID string                 `json:"resource_id,omitempty"`
	Changes    map[string]interface{} `json:"changes,omitempty"`
	Timestamp  time.Time              `json:"timestamp"`
	IPAddress  string                 `json:"ip_address,omitempty"`
	UserAgent  string                 `json:"user_agent,omitempty"`
}
