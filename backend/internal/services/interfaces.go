package services

import (
	"context"
	"time"

	"bakery-invoice-api/internal/models"
	"bakery-invoice-api/internal/repositories"
)

// CustomerService defines the interface for customer business logic operations
type CustomerService interface {
	// CRUD operations
	CreateCustomer(ctx context.Context, req *CreateCustomerRequest) (*models.Customer, error)
	GetCustomer(ctx context.Context, id string) (*models.Customer, error)
	UpdateCustomer(ctx context.Context, id string, req *UpdateCustomerRequest) (*models.Customer, error)
	DeleteCustomer(ctx context.Context, id string) error
	ListCustomers(ctx context.Context, filters *CustomerFilters) ([]*models.Customer, error)

	// Search operations
	SearchCustomers(ctx context.Context, query string, limit int) ([]*models.Customer, error)
	GetCustomerByEmail(ctx context.Context, email string) (*models.Customer, error)
	GetCustomersByPhone(ctx context.Context, phone string) ([]*models.Customer, error)

	// Business logic operations
	GetFrequentCustomers(ctx context.Context, limit int) ([]*models.Customer, error)
	GetRecentCustomers(ctx context.Context, since time.Duration) ([]*models.Customer, error)
	GetBusinessCustomers(ctx context.Context) ([]*models.Customer, error)
	GetIndividualCustomers(ctx context.Context) ([]*models.Customer, error)
	ValidateCustomerData(ctx context.Context, customer *models.Customer) error
	GetCustomerStatistics(ctx context.Context, customerID string) (*CustomerStatistics, error)
}

// ProductService defines the interface for product business logic operations
type ProductService interface {
	// CRUD operations
	CreateProduct(ctx context.Context, req *CreateProductRequest) (*models.Product, error)
	GetProduct(ctx context.Context, id string) (*models.Product, error)
	UpdateProduct(ctx context.Context, id string, req *UpdateProductRequest) (*models.Product, error)
	DeleteProduct(ctx context.Context, id string) error
	ListProducts(ctx context.Context, filters *ProductFilters) ([]*models.Product, error)

	// Search and category operations
	SearchProducts(ctx context.Context, query string, limit int) ([]*models.Product, error)
	GetProductsByCategory(ctx context.Context, category string) ([]*models.Product, error)
	AutocompleteProducts(ctx context.Context, prefix string, limit int) ([]*models.Product, error)
	GetProductCategories(ctx context.Context) ([]string, error)
	GetCategorySummary(ctx context.Context) (map[string]int64, error)

	// Business logic operations
	GetActiveProducts(ctx context.Context) ([]*models.Product, error)
	GetPopularProducts(ctx context.Context, limit int) ([]*models.Product, error)
	GetRecentProducts(ctx context.Context, since time.Duration) ([]*models.Product, error)
	ValidateProductData(ctx context.Context, product *models.Product) error
	CalculateProductGST(ctx context.Context, productID string, quantity int, includeGST bool) (float64, error)
	GetProductSalesData(ctx context.Context, productID string, startDate, endDate time.Time) (*ProductSalesData, error)
}

// ReceiptService defines the interface for receipt business logic operations
type ReceiptService interface {
	// CRUD operations
	CreateReceipt(ctx context.Context, req *CreateReceiptRequest) (*models.Receipt, error)
	GetReceipt(ctx context.Context, id string) (*models.Receipt, error)
	ListReceipts(ctx context.Context, filters *ReceiptFilters) ([]*models.Receipt, error)
	DeleteReceipt(ctx context.Context, id string) error

	// GST and tax calculations
	CalculateReceiptTotals(ctx context.Context, req *CalculateReceiptTotalsRequest) (*ReceiptTotalsResult, error)
	ValidateReceiptForTaxCompliance(ctx context.Context, receiptID string) (*TaxComplianceResult, error)
	DetermineIfTaxInvoiceRequired(ctx context.Context, totalAmount float64, customerID string, forceInvoice bool) (bool, error)

	// PDF generation and formatting
	GenerateReceiptPDF(ctx context.Context, receiptID string) ([]byte, error)
	GenerateReceiptHTML(ctx context.Context, receiptID string) (string, error)
	FormatReceiptForPrint(ctx context.Context, receiptID string) (*PrintableReceipt, error)

	// Business reporting
	GetSalesReport(ctx context.Context, startDate, endDate time.Time) (*repositories.SalesReport, error)
	GetDailySales(ctx context.Context, date time.Time) (*repositories.SalesSummary, error)
	GetMonthlySales(ctx context.Context, year int, month time.Month) (*repositories.SalesSummary, error)
	GetReceiptsByCustomer(ctx context.Context, customerID string, startDate, endDate time.Time) ([]*models.Receipt, error)
	GetTopCustomersByRevenue(ctx context.Context, limit int) ([]*repositories.CustomerRevenue, error)

	// Validation and business rules
	ValidateReceiptData(ctx context.Context, receipt *models.Receipt) error
	ValidateLineItems(ctx context.Context, lineItems []models.LineItem) error
}

// EmailService defines the interface for email operations
type EmailService interface {
	// Email sending operations
	SendReceiptEmail(ctx context.Context, receiptID string, recipientEmail string) error
	SendBulkReceiptEmails(ctx context.Context, receiptIDs []string, recipientEmails []string) error
	ResendFailedEmails(ctx context.Context, maxRetries int) error

	// Template operations
	RenderReceiptEmailTemplate(ctx context.Context, receiptID string, templateName string) (string, error)
	GetAvailableTemplates(ctx context.Context) ([]EmailTemplate, error)
	ValidateEmailTemplate(ctx context.Context, templateContent string) error

	// Email delivery tracking
	GetEmailStatus(ctx context.Context, emailID string) (*models.EmailAudit, error)
	GetEmailHistory(ctx context.Context, receiptID string) ([]*models.EmailAudit, error)
	GetEmailStatistics(ctx context.Context, startDate, endDate time.Time) (*repositories.EmailStatistics, error)
	GetPendingEmails(ctx context.Context) ([]*models.EmailAudit, error)
	GetFailedEmails(ctx context.Context) ([]*models.EmailAudit, error)

	// Email configuration and validation
	ValidateEmailAddress(ctx context.Context, email string) error
	TestEmailConfiguration(ctx context.Context) error
	GetEmailDeliverySettings(ctx context.Context) (*EmailDeliverySettings, error)
	UpdateEmailDeliverySettings(ctx context.Context, settings *EmailDeliverySettings) error
}

// Request and response types for service operations

// Customer service types
type CreateCustomerRequest struct {
	CustomerType models.CustomerType `json:"customer_type" validate:"required,oneof=individual business"`
	FirstName    *string             `json:"first_name,omitempty"`
	LastName     *string             `json:"last_name,omitempty"`
	BusinessName *string             `json:"business_name,omitempty"`
	ABN          *string             `json:"abn,omitempty"`
	Email        *string             `json:"email,omitempty" validate:"omitempty,email"`
	Phone        *string             `json:"phone,omitempty"`
	Address      *string             `json:"address,omitempty"`
}

type UpdateCustomerRequest struct {
	FirstName    *string `json:"first_name,omitempty"`
	LastName     *string `json:"last_name,omitempty"`
	BusinessName *string `json:"business_name,omitempty"`
	ABN          *string `json:"abn,omitempty"`
	Email        *string `json:"email,omitempty" validate:"omitempty,email"`
	Phone        *string `json:"phone,omitempty"`
	Address      *string `json:"address,omitempty"`
}

type CustomerFilters struct {
	CustomerType  *models.CustomerType `json:"customer_type,omitempty"`
	HasABN        *bool                `json:"has_abn,omitempty"`
	HasEmail      *bool                `json:"has_email,omitempty"`
	CreatedAfter  *time.Time           `json:"created_after,omitempty"`
	CreatedBefore *time.Time           `json:"created_before,omitempty"`
	Limit         int                  `json:"limit,omitempty"`
	Offset        int                  `json:"offset,omitempty"`
}

type CustomerStatistics struct {
	TotalReceipts    int64     `json:"total_receipts"`
	TotalRevenue     float64   `json:"total_revenue"`
	AverageReceipt   float64   `json:"average_receipt"`
	LastPurchase     time.Time `json:"last_purchase"`
	FirstPurchase    time.Time `json:"first_purchase"`
	FavoriteProducts []string  `json:"favorite_products"`
}

// Product service types
type CreateProductRequest struct {
	Name          string  `json:"name" validate:"required,min=1,max=255"`
	Description   *string `json:"description,omitempty"`
	Category      string  `json:"category" validate:"required"`
	UnitPrice     float64 `json:"unit_price" validate:"required,min=0"`
	GSTApplicable bool    `json:"gst_applicable"`
	Active        bool    `json:"active"`
}

type UpdateProductRequest struct {
	Name          *string  `json:"name,omitempty" validate:"omitempty,min=1,max=255"`
	Description   *string  `json:"description,omitempty"`
	Category      *string  `json:"category,omitempty"`
	UnitPrice     *float64 `json:"unit_price,omitempty" validate:"omitempty,min=0"`
	GSTApplicable *bool    `json:"gst_applicable,omitempty"`
	Active        *bool    `json:"active,omitempty"`
}

type ProductFilters struct {
	Category      *string    `json:"category,omitempty"`
	Active        *bool      `json:"active,omitempty"`
	GSTApplicable *bool      `json:"gst_applicable,omitempty"`
	MinPrice      *float64   `json:"min_price,omitempty"`
	MaxPrice      *float64   `json:"max_price,omitempty"`
	CreatedAfter  *time.Time `json:"created_after,omitempty"`
	CreatedBefore *time.Time `json:"created_before,omitempty"`
	Limit         int        `json:"limit,omitempty"`
	Offset        int        `json:"offset,omitempty"`
}

type ProductSalesData struct {
	ProductID    string    `json:"product_id"`
	TotalSold    int64     `json:"total_sold"`
	TotalRevenue float64   `json:"total_revenue"`
	TimesOrdered int64     `json:"times_ordered"`
	AveragePrice float64   `json:"average_price"`
	LastSold     time.Time `json:"last_sold"`
}

// Receipt service types
type CreateReceiptRequest struct {
	CustomerID      string                  `json:"customer_id" validate:"required,uuid"`
	LineItems       []CreateLineItemRequest `json:"line_items" validate:"required,min=1"`
	PaymentMethod   models.PaymentMethod    `json:"payment_method" validate:"required"`
	Notes           *string                 `json:"notes,omitempty"`
	ForceTaxInvoice bool                    `json:"force_tax_invoice"`
	DateOfPurchase  *time.Time              `json:"date_of_purchase,omitempty"`
}

type CreateLineItemRequest struct {
	ProductID   string   `json:"product_id" validate:"required,uuid"`
	Quantity    int      `json:"quantity" validate:"required,min=1"`
	UnitPrice   *float64 `json:"unit_price,omitempty"`  // Optional override
	Description *string  `json:"description,omitempty"` // Optional override
}

type ReceiptFilters struct {
	CustomerID    *string               `json:"customer_id,omitempty"`
	PaymentMethod *models.PaymentMethod `json:"payment_method,omitempty"`
	IsTaxInvoice  *bool                 `json:"is_tax_invoice,omitempty"`
	GSTCharged    *bool                 `json:"gst_charged,omitempty"`
	MinAmount     *float64              `json:"min_amount,omitempty"`
	MaxAmount     *float64              `json:"max_amount,omitempty"`
	StartDate     *time.Time            `json:"start_date,omitempty"`
	EndDate       *time.Time            `json:"end_date,omitempty"`
	Limit         int                   `json:"limit,omitempty"`
	Offset        int                   `json:"offset,omitempty"`
}

type CalculateReceiptTotalsRequest struct {
	LineItems       []CalculateLineItemRequest `json:"line_items" validate:"required,min=1"`
	CustomerID      string                     `json:"customer_id" validate:"required,uuid"`
	ForceTaxInvoice bool                       `json:"force_tax_invoice"`
}

type CalculateLineItemRequest struct {
	ProductID string `json:"product_id" validate:"required,uuid"`
	Quantity  int    `json:"quantity" validate:"required,min=1"`
}

type ReceiptTotalsResult struct {
	SubtotalExclGST float64         `json:"subtotal_excl_gst"`
	GSTAmount       float64         `json:"gst_amount"`
	TotalIncGST     float64         `json:"total_inc_gst"`
	IsTaxInvoice    bool            `json:"is_tax_invoice"`
	GSTCharged      bool            `json:"gst_charged"`
	LineItemTotals  []LineItemTotal `json:"line_item_totals"`
}

type LineItemTotal struct {
	ProductID     string  `json:"product_id"`
	Quantity      int     `json:"quantity"`
	UnitPrice     float64 `json:"unit_price"`
	LineSubtotal  float64 `json:"line_subtotal"`
	GSTAmount     float64 `json:"gst_amount"`
	LineTotal     float64 `json:"line_total"`
	GSTApplicable bool    `json:"gst_applicable"`
}

type TaxComplianceResult struct {
	IsCompliant      bool     `json:"is_compliant"`
	RequiredFields   []string `json:"required_fields"`
	MissingFields    []string `json:"missing_fields"`
	Errors           []string `json:"errors"`
	Warnings         []string `json:"warnings"`
	IsTaxInvoice     bool     `json:"is_tax_invoice"`
	TaxInvoiceReason string   `json:"tax_invoice_reason"`
}

type PrintableReceipt struct {
	Receipt          *models.Receipt                   `json:"receipt"`
	FormattedHTML    string                            `json:"formatted_html"`
	PrintCSS         string                            `json:"print_css"`
	CustomerSnapshot *models.CustomerSnapshotData      `json:"customer_snapshot"`
	SellerSnapshot   *models.SellerProfileSnapshotData `json:"seller_snapshot"`
}

// Email service types
type EmailTemplate struct {
	Name        string `json:"name"`
	Subject     string `json:"subject"`
	HTMLContent string `json:"html_content"`
	TextContent string `json:"text_content"`
	Description string `json:"description"`
}

type EmailDeliverySettings struct {
	SMTPHost     string `json:"smtp_host"`
	SMTPPort     int    `json:"smtp_port"`
	SMTPUsername string `json:"smtp_username"`
	SMTPPassword string `json:"smtp_password"`
	FromEmail    string `json:"from_email"`
	FromName     string `json:"from_name"`
	UseTLS       bool   `json:"use_tls"`
	UseSSL       bool   `json:"use_ssl"`
}
