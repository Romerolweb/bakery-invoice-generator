package repositories

import (
	"context"
	"time"

	"bakery-invoice-api/internal/models"
)

// BaseRepository defines common CRUD operations for all repositories
type BaseRepository[T any] interface {
	// Create creates a new entity
	Create(ctx context.Context, entity *T) error

	// GetByID retrieves an entity by its ID
	GetByID(ctx context.Context, id string) (*T, error)

	// Update updates an existing entity
	Update(ctx context.Context, entity *T) error

	// Delete deletes an entity by its ID
	Delete(ctx context.Context, id string) error

	// List retrieves entities with optional filters
	List(ctx context.Context, filters map[string]interface{}) ([]*T, error)

	// Count returns the total number of entities matching the filters
	Count(ctx context.Context, filters map[string]interface{}) (int64, error)

	// Exists checks if an entity with the given ID exists
	Exists(ctx context.Context, id string) (bool, error)
}

// CustomerRepository defines operations specific to customer management
type CustomerRepository interface {
	BaseRepository[models.Customer]

	// Search performs full-text search on customer data
	Search(ctx context.Context, query string, limit int) ([]*models.Customer, error)

	// GetByEmail retrieves a customer by email address
	GetByEmail(ctx context.Context, email string) (*models.Customer, error)

	// GetByPhone retrieves customers by phone number
	GetByPhone(ctx context.Context, phone string) ([]*models.Customer, error)

	// GetByType retrieves customers by type (individual/business)
	GetByType(ctx context.Context, customerType models.CustomerType) ([]*models.Customer, error)

	// GetBusinessCustomers retrieves all business customers
	GetBusinessCustomers(ctx context.Context) ([]*models.Customer, error)

	// GetIndividualCustomers retrieves all individual customers
	GetIndividualCustomers(ctx context.Context) ([]*models.Customer, error)

	// GetRecentCustomers retrieves customers created within the specified duration
	GetRecentCustomers(ctx context.Context, since time.Duration) ([]*models.Customer, error)

	// GetCustomersWithABN retrieves customers that have an ABN
	GetCustomersWithABN(ctx context.Context) ([]*models.Customer, error)

	// GetFrequentCustomers retrieves customers with the most receipts
	GetFrequentCustomers(ctx context.Context, limit int) ([]*models.Customer, error)
}

// ProductRepository defines operations specific to product management
type ProductRepository interface {
	BaseRepository[models.Product]

	// Search performs full-text search on product data
	Search(ctx context.Context, query string, limit int) ([]*models.Product, error)

	// GetByCategory retrieves products by category
	GetByCategory(ctx context.Context, category string) ([]*models.Product, error)

	// GetActiveProducts retrieves all active products
	GetActiveProducts(ctx context.Context) ([]*models.Product, error)

	// GetInactiveProducts retrieves all inactive products
	GetInactiveProducts(ctx context.Context) ([]*models.Product, error)

	// GetGSTApplicableProducts retrieves products that have GST applicable
	GetGSTApplicableProducts(ctx context.Context) ([]*models.Product, error)

	// GetProductsByPriceRange retrieves products within a price range
	GetProductsByPriceRange(ctx context.Context, minPrice, maxPrice float64) ([]*models.Product, error)

	// GetPopularProducts retrieves products ordered by frequency of use in receipts
	GetPopularProducts(ctx context.Context, limit int) ([]*models.Product, error)

	// GetRecentProducts retrieves products created within the specified duration
	GetRecentProducts(ctx context.Context, since time.Duration) ([]*models.Product, error)

	// AutocompleteByName provides autocomplete suggestions for product names
	AutocompleteByName(ctx context.Context, prefix string, limit int) ([]*models.Product, error)

	// GetCategorySummary returns product count by category
	GetCategorySummary(ctx context.Context) (map[string]int64, error)
}

// ReceiptRepository defines operations specific to receipt management
type ReceiptRepository interface {
	BaseRepository[models.Receipt]

	// GetByCustomerID retrieves receipts for a specific customer
	GetByCustomerID(ctx context.Context, customerID string) ([]*models.Receipt, error)

	// GetByDateRange retrieves receipts within a date range
	GetByDateRange(ctx context.Context, startDate, endDate time.Time) ([]*models.Receipt, error)

	// GetByPaymentMethod retrieves receipts by payment method
	GetByPaymentMethod(ctx context.Context, paymentMethod models.PaymentMethod) ([]*models.Receipt, error)

	// GetTaxInvoices retrieves all receipts that are tax invoices
	GetTaxInvoices(ctx context.Context) ([]*models.Receipt, error)

	// GetReceiptsWithGST retrieves receipts where GST was charged
	GetReceiptsWithGST(ctx context.Context) ([]*models.Receipt, error)

	// GetReceiptsAboveAmount retrieves receipts with total above specified amount
	GetReceiptsAboveAmount(ctx context.Context, amount float64) ([]*models.Receipt, error)

	// GetDailySales retrieves sales summary for a specific date
	GetDailySales(ctx context.Context, date time.Time) (*SalesSummary, error)

	// GetMonthlySales retrieves sales summary for a specific month
	GetMonthlySales(ctx context.Context, year int, month time.Month) (*SalesSummary, error)

	// GetYearlySales retrieves sales summary for a specific year
	GetYearlySales(ctx context.Context, year int) (*SalesSummary, error)

	// GetSalesReport generates a comprehensive sales report for date range
	GetSalesReport(ctx context.Context, startDate, endDate time.Time) (*SalesReport, error)

	// GetRecentReceipts retrieves receipts created within the specified duration
	GetRecentReceipts(ctx context.Context, since time.Duration) ([]*models.Receipt, error)

	// GetReceiptsByCustomerWithDateRange retrieves customer receipts within date range
	GetReceiptsByCustomerWithDateRange(ctx context.Context, customerID string, startDate, endDate time.Time) ([]*models.Receipt, error)

	// GetTopCustomersByRevenue retrieves customers ordered by total revenue
	GetTopCustomersByRevenue(ctx context.Context, limit int) ([]*CustomerRevenue, error)
}

// LineItemRepository defines operations specific to line item management
type LineItemRepository interface {
	BaseRepository[models.LineItem]

	// GetByReceiptID retrieves all line items for a specific receipt
	GetByReceiptID(ctx context.Context, receiptID string) ([]*models.LineItem, error)

	// GetByProductID retrieves all line items for a specific product
	GetByProductID(ctx context.Context, productID string) ([]*models.LineItem, error)

	// DeleteByReceiptID deletes all line items for a specific receipt
	DeleteByReceiptID(ctx context.Context, receiptID string) error

	// GetProductSales retrieves sales data for products within date range
	GetProductSales(ctx context.Context, startDate, endDate time.Time) ([]*ProductSales, error)

	// GetTopSellingProducts retrieves products ordered by quantity sold
	GetTopSellingProducts(ctx context.Context, limit int, startDate, endDate time.Time) ([]*ProductSales, error)

	// GetProductRevenueReport generates revenue report by product
	GetProductRevenueReport(ctx context.Context, startDate, endDate time.Time) ([]*ProductRevenue, error)
}

// ProductCategoryRepository defines operations specific to product category management
type ProductCategoryRepository interface {
	BaseRepository[models.ProductCategory]

	// GetByName retrieves a category by name
	GetByName(ctx context.Context, name string) (*models.ProductCategory, error)

	// GetOrderedBySort retrieves categories ordered by sort order
	GetOrderedBySort(ctx context.Context) ([]*models.ProductCategory, error)

	// GetCategoriesWithProductCount retrieves categories with product counts
	GetCategoriesWithProductCount(ctx context.Context) ([]*CategoryWithCount, error)

	// UpdateSortOrder updates the sort order for multiple categories
	UpdateSortOrder(ctx context.Context, categoryOrders map[string]int) error
}

// SellerProfileRepository defines operations specific to seller profile management
type SellerProfileRepository interface {
	// Get retrieves the seller profile (singleton)
	Get(ctx context.Context) (*models.SellerProfile, error)

	// CreateOrUpdate creates or updates the seller profile
	CreateOrUpdate(ctx context.Context, profile *models.SellerProfile) error

	// Update updates the seller profile
	Update(ctx context.Context, profile *models.SellerProfile) error

	// Exists checks if a seller profile exists
	Exists(ctx context.Context) (bool, error)
}

// EmailAuditRepository defines operations specific to email audit management
type EmailAuditRepository interface {
	BaseRepository[models.EmailAudit]

	// GetByReceiptID retrieves email audit records for a specific receipt
	GetByReceiptID(ctx context.Context, receiptID string) ([]*models.EmailAudit, error)

	// GetByStatus retrieves email audit records by status
	GetByStatus(ctx context.Context, status models.EmailStatus) ([]*models.EmailAudit, error)

	// GetByRecipientEmail retrieves email audit records for a specific recipient
	GetByRecipientEmail(ctx context.Context, email string) ([]*models.EmailAudit, error)

	// GetPendingEmails retrieves emails that are pending or need retry
	GetPendingEmails(ctx context.Context) ([]*models.EmailAudit, error)

	// GetFailedEmails retrieves emails that failed to send
	GetFailedEmails(ctx context.Context) ([]*models.EmailAudit, error)

	// GetEmailsForRetry retrieves emails that should be retried
	GetEmailsForRetry(ctx context.Context, maxRetries int) ([]*models.EmailAudit, error)

	// GetEmailStatistics retrieves email delivery statistics
	GetEmailStatistics(ctx context.Context, startDate, endDate time.Time) (*EmailStatistics, error)

	// GetRecentEmailActivity retrieves recent email activity
	GetRecentEmailActivity(ctx context.Context, since time.Duration) ([]*models.EmailAudit, error)

	// CleanupOldRecords removes old email audit records
	CleanupOldRecords(ctx context.Context, olderThan time.Duration) (int64, error)
}

// Supporting types for repository operations

// SalesSummary represents sales data for a period
type SalesSummary struct {
	Period          string                         `json:"period"`
	StartDate       time.Time                      `json:"start_date"`
	EndDate         time.Time                      `json:"end_date"`
	TotalReceipts   int64                          `json:"total_receipts"`
	TotalRevenue    float64                        `json:"total_revenue"`
	TotalGST        float64                        `json:"total_gst"`
	AverageReceipt  float64                        `json:"average_receipt"`
	TaxInvoiceCount int64                          `json:"tax_invoice_count"`
	PaymentMethods  map[models.PaymentMethod]int64 `json:"payment_methods"`
}

// SalesReport represents a comprehensive sales report
type SalesReport struct {
	Summary       *SalesSummary      `json:"summary"`
	DailySales    []*SalesSummary    `json:"daily_sales"`
	TopProducts   []*ProductSales    `json:"top_products"`
	TopCustomers  []*CustomerRevenue `json:"top_customers"`
	CategorySales []*CategorySales   `json:"category_sales"`
}

// ProductSales represents sales data for a product
type ProductSales struct {
	ProductID    string  `json:"product_id"`
	ProductName  string  `json:"product_name"`
	Category     string  `json:"category"`
	QuantitySold int64   `json:"quantity_sold"`
	Revenue      float64 `json:"revenue"`
	TimesOrdered int64   `json:"times_ordered"`
}

// ProductRevenue represents revenue data for a product
type ProductRevenue struct {
	ProductID    string  `json:"product_id"`
	ProductName  string  `json:"product_name"`
	Category     string  `json:"category"`
	TotalRevenue float64 `json:"total_revenue"`
	TotalGST     float64 `json:"total_gst"`
	QuantitySold int64   `json:"quantity_sold"`
	AveragePrice float64 `json:"average_price"`
}

// CustomerRevenue represents revenue data for a customer
type CustomerRevenue struct {
	CustomerID     string    `json:"customer_id"`
	CustomerName   string    `json:"customer_name"`
	CustomerType   string    `json:"customer_type"`
	TotalRevenue   float64   `json:"total_revenue"`
	TotalReceipts  int64     `json:"total_receipts"`
	AverageReceipt float64   `json:"average_receipt"`
	LastPurchase   time.Time `json:"last_purchase"`
}

// CategorySales represents sales data for a product category
type CategorySales struct {
	Category     string  `json:"category"`
	Revenue      float64 `json:"revenue"`
	QuantitySold int64   `json:"quantity_sold"`
	ProductCount int64   `json:"product_count"`
}

// CategoryWithCount represents a category with its product count
type CategoryWithCount struct {
	*models.ProductCategory
	ProductCount int64 `json:"product_count"`
}

// EmailStatistics represents email delivery statistics
type EmailStatistics struct {
	Period       string    `json:"period"`
	StartDate    time.Time `json:"start_date"`
	EndDate      time.Time `json:"end_date"`
	TotalSent    int64     `json:"total_sent"`
	TotalFailed  int64     `json:"total_failed"`
	TotalPending int64     `json:"total_pending"`
	TotalRetries int64     `json:"total_retries"`
	SuccessRate  float64   `json:"success_rate"`
}
