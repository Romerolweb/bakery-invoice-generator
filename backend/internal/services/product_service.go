package services

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/go-playground/validator/v10"
	"github.com/google/uuid"

	"bakery-invoice-api/internal/models"
	"bakery-invoice-api/internal/repositories"
)

// productService implements the ProductService interface
type productService struct {
	productRepo  repositories.ProductRepository
	lineItemRepo repositories.LineItemRepository
	validator    *validator.Validate
}

// NewProductService creates a new product service instance
func NewProductService(productRepo repositories.ProductRepository, lineItemRepo repositories.LineItemRepository) ProductService {
	return &productService{
		productRepo:  productRepo,
		lineItemRepo: lineItemRepo,
		validator:    validator.New(),
	}
}

// CreateProduct creates a new product
func (s *productService) CreateProduct(ctx context.Context, req *CreateProductRequest) (*models.Product, error) {
	if req == nil {
		return nil, fmt.Errorf("create product request cannot be nil")
	}

	// Validate request
	if err := s.validator.Struct(req); err != nil {
		return nil, fmt.Errorf("validation failed: %w", err)
	}

	// Create product model
	product := models.NewProduct(req.Name, req.Category, req.UnitPrice)
	if req.Description != nil {
		product.SetDescription(*req.Description)
	}
	product.GSTApplicable = req.GSTApplicable
	product.Active = req.Active

	// Validate product data
	if err := s.ValidateProductData(ctx, product); err != nil {
		return nil, fmt.Errorf("product validation failed: %w", err)
	}

	// Create product in repository
	if err := s.productRepo.Create(ctx, product); err != nil {
		return nil, fmt.Errorf("failed to create product: %w", err)
	}

	return product, nil
}

// GetProduct retrieves a product by ID
func (s *productService) GetProduct(ctx context.Context, id string) (*models.Product, error) {
	if id == "" {
		return nil, fmt.Errorf("product ID cannot be empty")
	}

	if _, err := uuid.Parse(id); err != nil {
		return nil, fmt.Errorf("invalid product ID format: %w", err)
	}

	product, err := s.productRepo.GetByID(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("failed to get product: %w", err)
	}

	return product, nil
}

// UpdateProduct updates an existing product
func (s *productService) UpdateProduct(ctx context.Context, id string, req *UpdateProductRequest) (*models.Product, error) {
	if id == "" {
		return nil, fmt.Errorf("product ID cannot be empty")
	}

	if req == nil {
		return nil, fmt.Errorf("update product request cannot be nil")
	}

	// Validate request
	if err := s.validator.Struct(req); err != nil {
		return nil, fmt.Errorf("validation failed: %w", err)
	}

	// Get existing product
	product, err := s.GetProduct(ctx, id)
	if err != nil {
		return nil, err
	}

	// Update fields if provided
	if req.Name != nil {
		product.Name = *req.Name
	}
	if req.Description != nil {
		product.SetDescription(*req.Description)
	}
	if req.Category != nil {
		product.Category = *req.Category
	}
	if req.UnitPrice != nil {
		product.UnitPrice = *req.UnitPrice
	}
	if req.GSTApplicable != nil {
		product.GSTApplicable = *req.GSTApplicable
	}
	if req.Active != nil {
		product.Active = *req.Active
	}

	// Update timestamp
	product.UpdateTimestamp()

	// Validate updated product data
	if err := s.ValidateProductData(ctx, product); err != nil {
		return nil, fmt.Errorf("product validation failed: %w", err)
	}

	// Update product in repository
	if err := s.productRepo.Update(ctx, product); err != nil {
		return nil, fmt.Errorf("failed to update product: %w", err)
	}

	return product, nil
}

// DeleteProduct deletes a product by ID
func (s *productService) DeleteProduct(ctx context.Context, id string) error {
	if id == "" {
		return fmt.Errorf("product ID cannot be empty")
	}

	// Check if product exists
	_, err := s.GetProduct(ctx, id)
	if err != nil {
		return err
	}

	// Check if product is used in any line items
	lineItems, err := s.lineItemRepo.GetByProductID(ctx, id)
	if err != nil {
		return fmt.Errorf("failed to check product usage: %w", err)
	}

	if len(lineItems) > 0 {
		return fmt.Errorf("cannot delete product that is used in receipts (%d line items found)", len(lineItems))
	}

	// Delete product
	if err := s.productRepo.Delete(ctx, id); err != nil {
		return fmt.Errorf("failed to delete product: %w", err)
	}

	return nil
}

// ListProducts retrieves products with optional filters
func (s *productService) ListProducts(ctx context.Context, filters *ProductFilters) ([]*models.Product, error) {
	if filters == nil {
		filters = &ProductFilters{}
	}

	// Set default limit if not specified
	if filters.Limit <= 0 {
		filters.Limit = 100
	}

	// Convert filters to repository format
	repoFilters := make(map[string]interface{})

	if filters.Category != nil {
		repoFilters["category"] = *filters.Category
	}
	if filters.Active != nil {
		repoFilters["active"] = *filters.Active
	}
	if filters.GSTApplicable != nil {
		repoFilters["gst_applicable"] = *filters.GSTApplicable
	}
	if filters.MinPrice != nil {
		repoFilters["min_price"] = *filters.MinPrice
	}
	if filters.MaxPrice != nil {
		repoFilters["max_price"] = *filters.MaxPrice
	}
	if filters.CreatedAfter != nil {
		repoFilters["created_after"] = *filters.CreatedAfter
	}
	if filters.CreatedBefore != nil {
		repoFilters["created_before"] = *filters.CreatedBefore
	}
	if filters.Limit > 0 {
		repoFilters["limit"] = filters.Limit
	}
	if filters.Offset > 0 {
		repoFilters["offset"] = filters.Offset
	}

	products, err := s.productRepo.List(ctx, repoFilters)
	if err != nil {
		return nil, fmt.Errorf("failed to list products: %w", err)
	}

	return products, nil
}

// SearchProducts performs full-text search on product data
func (s *productService) SearchProducts(ctx context.Context, query string, limit int) ([]*models.Product, error) {
	if strings.TrimSpace(query) == "" {
		return nil, fmt.Errorf("search query cannot be empty")
	}

	if limit <= 0 {
		limit = 50
	}

	products, err := s.productRepo.Search(ctx, query, limit)
	if err != nil {
		return nil, fmt.Errorf("failed to search products: %w", err)
	}

	return products, nil
}

// GetProductsByCategory retrieves products by category
func (s *productService) GetProductsByCategory(ctx context.Context, category string) ([]*models.Product, error) {
	if strings.TrimSpace(category) == "" {
		return nil, fmt.Errorf("category cannot be empty")
	}

	products, err := s.productRepo.GetByCategory(ctx, category)
	if err != nil {
		return nil, fmt.Errorf("failed to get products by category: %w", err)
	}

	return products, nil
}

// AutocompleteProducts provides autocomplete suggestions for product names
func (s *productService) AutocompleteProducts(ctx context.Context, prefix string, limit int) ([]*models.Product, error) {
	if strings.TrimSpace(prefix) == "" {
		return nil, fmt.Errorf("prefix cannot be empty")
	}

	if limit <= 0 {
		limit = 10
	}

	products, err := s.productRepo.AutocompleteByName(ctx, prefix, limit)
	if err != nil {
		return nil, fmt.Errorf("failed to autocomplete products: %w", err)
	}

	return products, nil
}

// GetProductCategories retrieves all unique product categories
func (s *productService) GetProductCategories(ctx context.Context) ([]string, error) {
	summary, err := s.productRepo.GetCategorySummary(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get category summary: %w", err)
	}

	categories := make([]string, 0, len(summary))
	for category := range summary {
		categories = append(categories, category)
	}

	return categories, nil
}

// GetCategorySummary retrieves product count by category
func (s *productService) GetCategorySummary(ctx context.Context) (map[string]int64, error) {
	summary, err := s.productRepo.GetCategorySummary(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get category summary: %w", err)
	}

	return summary, nil
}

// GetActiveProducts retrieves all active products
func (s *productService) GetActiveProducts(ctx context.Context) ([]*models.Product, error) {
	products, err := s.productRepo.GetActiveProducts(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get active products: %w", err)
	}

	return products, nil
}

// GetPopularProducts retrieves products ordered by frequency of use in receipts
func (s *productService) GetPopularProducts(ctx context.Context, limit int) ([]*models.Product, error) {
	if limit <= 0 {
		limit = 10
	}

	products, err := s.productRepo.GetPopularProducts(ctx, limit)
	if err != nil {
		return nil, fmt.Errorf("failed to get popular products: %w", err)
	}

	return products, nil
}

// GetRecentProducts retrieves products created within the specified duration
func (s *productService) GetRecentProducts(ctx context.Context, since time.Duration) ([]*models.Product, error) {
	if since <= 0 {
		since = 30 * 24 * time.Hour // Default to 30 days
	}

	products, err := s.productRepo.GetRecentProducts(ctx, since)
	if err != nil {
		return nil, fmt.Errorf("failed to get recent products: %w", err)
	}

	return products, nil
}

// ValidateProductData validates product data according to business rules
func (s *productService) ValidateProductData(ctx context.Context, product *models.Product) error {
	if product == nil {
		return fmt.Errorf("product cannot be nil")
	}

	// Use model's built-in validation
	if err := product.Validate(); err != nil {
		return err
	}

	// Additional business rule validations
	if product.UnitPrice < 0 {
		return fmt.Errorf("unit price cannot be negative")
	}

	// Validate category (could be extended with allowed categories)
	if strings.TrimSpace(product.Category) == "" {
		return fmt.Errorf("category cannot be empty")
	}

	// Validate name uniqueness within category (optional business rule)
	// This could be implemented if required by business rules

	return nil
}

// CalculateProductGST calculates GST for a product with given quantity
func (s *productService) CalculateProductGST(ctx context.Context, productID string, quantity int, includeGST bool) (float64, error) {
	if productID == "" {
		return 0, fmt.Errorf("product ID cannot be empty")
	}

	if quantity <= 0 {
		return 0, fmt.Errorf("quantity must be positive")
	}

	// Get product
	product, err := s.GetProduct(ctx, productID)
	if err != nil {
		return 0, err
	}

	// Calculate GST using product method
	gstAmount := product.CalculateGST(quantity, includeGST)
	return gstAmount, nil
}

// GetProductSalesData retrieves sales data for a specific product
func (s *productService) GetProductSalesData(ctx context.Context, productID string, startDate, endDate time.Time) (*ProductSalesData, error) {
	if productID == "" {
		return nil, fmt.Errorf("product ID cannot be empty")
	}

	// Verify product exists
	product, err := s.GetProduct(ctx, productID)
	if err != nil {
		return nil, err
	}

	// Get product sales from line items repository
	salesData, err := s.lineItemRepo.GetProductSales(ctx, startDate, endDate)
	if err != nil {
		return nil, fmt.Errorf("failed to get product sales: %w", err)
	}

	// Find data for this specific product
	for _, data := range salesData {
		if data.ProductID == productID {
			return &ProductSalesData{
				ProductID:    data.ProductID,
				TotalSold:    data.QuantitySold,
				TotalRevenue: data.Revenue,
				TimesOrdered: data.TimesOrdered,
				AveragePrice: data.Revenue / float64(data.QuantitySold),
				LastSold:     time.Now(), // This would need to be calculated from actual data
			}, nil
		}
	}

	// Return empty data if no sales found
	return &ProductSalesData{
		ProductID:    product.ID,
		TotalSold:    0,
		TotalRevenue: 0,
		TimesOrdered: 0,
		AveragePrice: product.UnitPrice,
		LastSold:     time.Time{},
	}, nil
}
