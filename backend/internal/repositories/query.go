package repositories

import (
	"time"

	"bakery-invoice-api/internal/models"
)

// QueryBuilder provides a fluent interface for building complex queries
type QueryBuilder[T any] interface {
	// Where adds a WHERE condition
	Where(field string, operator string, value interface{}) QueryBuilder[T]

	// WhereIn adds a WHERE IN condition
	WhereIn(field string, values []interface{}) QueryBuilder[T]

	// WhereBetween adds a WHERE BETWEEN condition
	WhereBetween(field string, start, end interface{}) QueryBuilder[T]

	// WhereNull adds a WHERE IS NULL condition
	WhereNull(field string) QueryBuilder[T]

	// WhereNotNull adds a WHERE IS NOT NULL condition
	WhereNotNull(field string) QueryBuilder[T]

	// WhereLike adds a WHERE LIKE condition
	WhereLike(field string, pattern string) QueryBuilder[T]

	// OrderBy adds an ORDER BY clause
	OrderBy(field string, direction string) QueryBuilder[T]

	// Limit sets the LIMIT
	Limit(limit int) QueryBuilder[T]

	// Offset sets the OFFSET
	Offset(offset int) QueryBuilder[T]

	// GroupBy adds a GROUP BY clause
	GroupBy(fields ...string) QueryBuilder[T]

	// Having adds a HAVING clause
	Having(field string, operator string, value interface{}) QueryBuilder[T]

	// Join adds a JOIN clause
	Join(table string, on string) QueryBuilder[T]

	// LeftJoin adds a LEFT JOIN clause
	LeftJoin(table string, on string) QueryBuilder[T]

	// Find executes the query and returns results
	Find() ([]*T, error)

	// First executes the query and returns the first result
	First() (*T, error)

	// Count executes the query and returns the count
	Count() (int64, error)

	// Exists checks if any records match the query
	Exists() (bool, error)
}

// CustomerQueryBuilder provides customer-specific query building
type CustomerQueryBuilder interface {
	QueryBuilder[models.Customer]

	// ByType filters by customer type
	ByType(customerType models.CustomerType) CustomerQueryBuilder

	// ByEmail filters by email
	ByEmail(email string) CustomerQueryBuilder

	// ByPhone filters by phone
	ByPhone(phone string) CustomerQueryBuilder

	// WithABN filters customers that have an ABN
	WithABN() CustomerQueryBuilder

	// WithoutABN filters customers that don't have an ABN
	WithoutABN() CustomerQueryBuilder

	// CreatedAfter filters by creation date
	CreatedAfter(date time.Time) CustomerQueryBuilder

	// CreatedBefore filters by creation date
	CreatedBefore(date time.Time) CustomerQueryBuilder

	// Search performs full-text search
	Search(query string) CustomerQueryBuilder
}

// ProductQueryBuilder provides product-specific query building
type ProductQueryBuilder interface {
	QueryBuilder[models.Product]

	// ByCategory filters by category
	ByCategory(category string) ProductQueryBuilder

	// Active filters active products
	Active() ProductQueryBuilder

	// Inactive filters inactive products
	Inactive() ProductQueryBuilder

	// WithGST filters products with GST applicable
	WithGST() ProductQueryBuilder

	// WithoutGST filters products without GST applicable
	WithoutGST() ProductQueryBuilder

	// PriceRange filters by price range
	PriceRange(min, max float64) ProductQueryBuilder

	// CreatedAfter filters by creation date
	CreatedAfter(date time.Time) ProductQueryBuilder

	// CreatedBefore filters by creation date
	CreatedBefore(date time.Time) ProductQueryBuilder

	// Search performs full-text search
	Search(query string) ProductQueryBuilder

	// NameStartsWith filters by name prefix
	NameStartsWith(prefix string) ProductQueryBuilder
}

// ReceiptQueryBuilder provides receipt-specific query building
type ReceiptQueryBuilder interface {
	QueryBuilder[models.Receipt]

	// ByCustomer filters by customer ID
	ByCustomer(customerID string) ReceiptQueryBuilder

	// ByDateRange filters by date range
	ByDateRange(start, end time.Time) ReceiptQueryBuilder

	// ByPaymentMethod filters by payment method
	ByPaymentMethod(method models.PaymentMethod) ReceiptQueryBuilder

	// TaxInvoicesOnly filters only tax invoices
	TaxInvoicesOnly() ReceiptQueryBuilder

	// WithGST filters receipts where GST was charged
	WithGST() ReceiptQueryBuilder

	// WithoutGST filters receipts where GST was not charged
	WithoutGST() ReceiptQueryBuilder

	// AmountAbove filters by minimum total amount
	AmountAbove(amount float64) ReceiptQueryBuilder

	// AmountBelow filters by maximum total amount
	AmountBelow(amount float64) ReceiptQueryBuilder

	// CreatedAfter filters by creation date
	CreatedAfter(date time.Time) ReceiptQueryBuilder

	// CreatedBefore filters by creation date
	CreatedBefore(date time.Time) ReceiptQueryBuilder

	// WithLineItems includes line items in the results
	WithLineItems() ReceiptQueryBuilder
}

// LineItemQueryBuilder provides line item-specific query building
type LineItemQueryBuilder interface {
	QueryBuilder[models.LineItem]

	// ByReceipt filters by receipt ID
	ByReceipt(receiptID string) LineItemQueryBuilder

	// ByProduct filters by product ID
	ByProduct(productID string) LineItemQueryBuilder

	// WithGST filters line items with GST applicable
	WithGST() LineItemQueryBuilder

	// WithoutGST filters line items without GST applicable
	WithoutGST() LineItemQueryBuilder

	// QuantityAbove filters by minimum quantity
	QuantityAbove(quantity int) LineItemQueryBuilder

	// PriceAbove filters by minimum unit price
	PriceAbove(price float64) LineItemQueryBuilder
}

// EmailAuditQueryBuilder provides email audit-specific query building
type EmailAuditQueryBuilder interface {
	QueryBuilder[models.EmailAudit]

	// ByReceipt filters by receipt ID
	ByReceipt(receiptID string) EmailAuditQueryBuilder

	// ByStatus filters by email status
	ByStatus(status models.EmailStatus) EmailAuditQueryBuilder

	// ByRecipient filters by recipient email
	ByRecipient(email string) EmailAuditQueryBuilder

	// SentAfter filters by sent date
	SentAfter(date time.Time) EmailAuditQueryBuilder

	// SentBefore filters by sent date
	SentBefore(date time.Time) EmailAuditQueryBuilder

	// WithRetries filters emails that have been retried
	WithRetries() EmailAuditQueryBuilder

	// MaxRetries filters by maximum retry count
	MaxRetries(maxRetries int) EmailAuditQueryBuilder

	// Failed filters failed emails
	Failed() EmailAuditQueryBuilder

	// Pending filters pending emails
	Pending() EmailAuditQueryBuilder

	// Sent filters successfully sent emails
	Sent() EmailAuditQueryBuilder
}

// QueryBuilderFactory creates query builders for different entity types
type QueryBuilderFactory interface {
	// Customer creates a customer query builder
	Customer() CustomerQueryBuilder

	// Product creates a product query builder
	Product() ProductQueryBuilder

	// Receipt creates a receipt query builder
	Receipt() ReceiptQueryBuilder

	// LineItem creates a line item query builder
	LineItem() LineItemQueryBuilder

	// EmailAudit creates an email audit query builder
	EmailAudit() EmailAuditQueryBuilder
}

// Pagination represents pagination parameters
type Pagination struct {
	Page     int   `json:"page"`
	PageSize int   `json:"page_size"`
	Offset   int   `json:"offset"`
	Total    int64 `json:"total"`
}

// PaginatedResult represents a paginated query result
type PaginatedResult[T any] struct {
	Data       []*T       `json:"data"`
	Pagination Pagination `json:"pagination"`
}

// PaginatedQuery extends QueryBuilder with pagination support
type PaginatedQuery[T any] interface {
	QueryBuilder[T]

	// Paginate executes the query with pagination
	Paginate(page, pageSize int) (*PaginatedResult[T], error)
}
