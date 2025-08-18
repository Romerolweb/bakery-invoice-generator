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

// customerService implements the CustomerService interface
type customerService struct {
	customerRepo repositories.CustomerRepository
	receiptRepo  repositories.ReceiptRepository
	validator    *validator.Validate
}

// NewCustomerService creates a new customer service instance
func NewCustomerService(customerRepo repositories.CustomerRepository, receiptRepo repositories.ReceiptRepository) CustomerService {
	return &customerService{
		customerRepo: customerRepo,
		receiptRepo:  receiptRepo,
		validator:    validator.New(),
	}
}

// CreateCustomer creates a new customer
func (s *customerService) CreateCustomer(ctx context.Context, req *CreateCustomerRequest) (*models.Customer, error) {
	if req == nil {
		return nil, fmt.Errorf("create customer request cannot be nil")
	}

	// Validate request
	if err := s.validator.Struct(req); err != nil {
		return nil, fmt.Errorf("validation failed: %w", err)
	}

	// Create customer model
	customer := models.NewCustomer(req.CustomerType)
	customer.FirstName = req.FirstName
	customer.LastName = req.LastName
	customer.BusinessName = req.BusinessName
	customer.ABN = req.ABN
	customer.Email = req.Email
	customer.Phone = req.Phone
	customer.Address = req.Address

	// Validate customer data
	if err := s.ValidateCustomerData(ctx, customer); err != nil {
		return nil, fmt.Errorf("customer validation failed: %w", err)
	}

	// Check for duplicate email if provided
	if customer.Email != nil && *customer.Email != "" {
		existing, err := s.customerRepo.GetByEmail(ctx, *customer.Email)
		if err == nil && existing != nil {
			return nil, fmt.Errorf("customer with email %s already exists", *customer.Email)
		}
	}

	// Create customer in repository
	if err := s.customerRepo.Create(ctx, customer); err != nil {
		return nil, fmt.Errorf("failed to create customer: %w", err)
	}

	return customer, nil
}

// GetCustomer retrieves a customer by ID
func (s *customerService) GetCustomer(ctx context.Context, id string) (*models.Customer, error) {
	if id == "" {
		return nil, fmt.Errorf("customer ID cannot be empty")
	}

	if _, err := uuid.Parse(id); err != nil {
		return nil, fmt.Errorf("invalid customer ID format: %w", err)
	}

	customer, err := s.customerRepo.GetByID(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("failed to get customer: %w", err)
	}

	return customer, nil
}

// UpdateCustomer updates an existing customer
func (s *customerService) UpdateCustomer(ctx context.Context, id string, req *UpdateCustomerRequest) (*models.Customer, error) {
	if id == "" {
		return nil, fmt.Errorf("customer ID cannot be empty")
	}

	if req == nil {
		return nil, fmt.Errorf("update customer request cannot be nil")
	}

	// Validate request
	if err := s.validator.Struct(req); err != nil {
		return nil, fmt.Errorf("validation failed: %w", err)
	}

	// Get existing customer
	customer, err := s.GetCustomer(ctx, id)
	if err != nil {
		return nil, err
	}

	// Update fields if provided
	if req.FirstName != nil {
		customer.FirstName = req.FirstName
	}
	if req.LastName != nil {
		customer.LastName = req.LastName
	}
	if req.BusinessName != nil {
		customer.BusinessName = req.BusinessName
	}
	if req.ABN != nil {
		customer.ABN = req.ABN
	}
	if req.Email != nil {
		// Check for duplicate email if changing
		if customer.Email == nil || *customer.Email != *req.Email {
			existing, err := s.customerRepo.GetByEmail(ctx, *req.Email)
			if err == nil && existing != nil && existing.ID != customer.ID {
				return nil, fmt.Errorf("customer with email %s already exists", *req.Email)
			}
		}
		customer.Email = req.Email
	}
	if req.Phone != nil {
		customer.Phone = req.Phone
	}
	if req.Address != nil {
		customer.Address = req.Address
	}

	// Update timestamp
	customer.UpdateTimestamp()

	// Validate updated customer data
	if err := s.ValidateCustomerData(ctx, customer); err != nil {
		return nil, fmt.Errorf("customer validation failed: %w", err)
	}

	// Update customer in repository
	if err := s.customerRepo.Update(ctx, customer); err != nil {
		return nil, fmt.Errorf("failed to update customer: %w", err)
	}

	return customer, nil
}

// DeleteCustomer deletes a customer by ID
func (s *customerService) DeleteCustomer(ctx context.Context, id string) error {
	if id == "" {
		return fmt.Errorf("customer ID cannot be empty")
	}

	// Check if customer exists
	_, err := s.GetCustomer(ctx, id)
	if err != nil {
		return err
	}

	// Check if customer has receipts
	receipts, err := s.receiptRepo.GetByCustomerID(ctx, id)
	if err != nil {
		return fmt.Errorf("failed to check customer receipts: %w", err)
	}

	if len(receipts) > 0 {
		return fmt.Errorf("cannot delete customer with existing receipts (%d receipts found)", len(receipts))
	}

	// Delete customer
	if err := s.customerRepo.Delete(ctx, id); err != nil {
		return fmt.Errorf("failed to delete customer: %w", err)
	}

	return nil
}

// ListCustomers retrieves customers with optional filters
func (s *customerService) ListCustomers(ctx context.Context, filters *CustomerFilters) ([]*models.Customer, error) {
	if filters == nil {
		filters = &CustomerFilters{}
	}

	// Set default limit if not specified
	if filters.Limit <= 0 {
		filters.Limit = 100
	}

	// Convert filters to repository format
	repoFilters := make(map[string]interface{})

	if filters.CustomerType != nil {
		repoFilters["customer_type"] = *filters.CustomerType
	}
	if filters.HasABN != nil {
		if *filters.HasABN {
			repoFilters["abn_not_null"] = true
		} else {
			repoFilters["abn_null"] = true
		}
	}
	if filters.HasEmail != nil {
		if *filters.HasEmail {
			repoFilters["email_not_null"] = true
		} else {
			repoFilters["email_null"] = true
		}
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

	customers, err := s.customerRepo.List(ctx, repoFilters)
	if err != nil {
		return nil, fmt.Errorf("failed to list customers: %w", err)
	}

	return customers, nil
}

// SearchCustomers performs full-text search on customer data
func (s *customerService) SearchCustomers(ctx context.Context, query string, limit int) ([]*models.Customer, error) {
	if strings.TrimSpace(query) == "" {
		return nil, fmt.Errorf("search query cannot be empty")
	}

	if limit <= 0 {
		limit = 50
	}

	customers, err := s.customerRepo.Search(ctx, query, limit)
	if err != nil {
		return nil, fmt.Errorf("failed to search customers: %w", err)
	}

	return customers, nil
}

// GetCustomerByEmail retrieves a customer by email address
func (s *customerService) GetCustomerByEmail(ctx context.Context, email string) (*models.Customer, error) {
	if strings.TrimSpace(email) == "" {
		return nil, fmt.Errorf("email cannot be empty")
	}

	customer, err := s.customerRepo.GetByEmail(ctx, email)
	if err != nil {
		return nil, fmt.Errorf("failed to get customer by email: %w", err)
	}

	return customer, nil
}

// GetCustomersByPhone retrieves customers by phone number
func (s *customerService) GetCustomersByPhone(ctx context.Context, phone string) ([]*models.Customer, error) {
	if strings.TrimSpace(phone) == "" {
		return nil, fmt.Errorf("phone cannot be empty")
	}

	customers, err := s.customerRepo.GetByPhone(ctx, phone)
	if err != nil {
		return nil, fmt.Errorf("failed to get customers by phone: %w", err)
	}

	return customers, nil
}

// GetFrequentCustomers retrieves customers with the most receipts
func (s *customerService) GetFrequentCustomers(ctx context.Context, limit int) ([]*models.Customer, error) {
	if limit <= 0 {
		limit = 10
	}

	customers, err := s.customerRepo.GetFrequentCustomers(ctx, limit)
	if err != nil {
		return nil, fmt.Errorf("failed to get frequent customers: %w", err)
	}

	return customers, nil
}

// GetRecentCustomers retrieves customers created within the specified duration
func (s *customerService) GetRecentCustomers(ctx context.Context, since time.Duration) ([]*models.Customer, error) {
	if since <= 0 {
		since = 30 * 24 * time.Hour // Default to 30 days
	}

	customers, err := s.customerRepo.GetRecentCustomers(ctx, since)
	if err != nil {
		return nil, fmt.Errorf("failed to get recent customers: %w", err)
	}

	return customers, nil
}

// GetBusinessCustomers retrieves all business customers
func (s *customerService) GetBusinessCustomers(ctx context.Context) ([]*models.Customer, error) {
	customers, err := s.customerRepo.GetBusinessCustomers(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get business customers: %w", err)
	}

	return customers, nil
}

// GetIndividualCustomers retrieves all individual customers
func (s *customerService) GetIndividualCustomers(ctx context.Context) ([]*models.Customer, error) {
	customers, err := s.customerRepo.GetIndividualCustomers(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get individual customers: %w", err)
	}

	return customers, nil
}

// ValidateCustomerData validates customer data according to business rules
func (s *customerService) ValidateCustomerData(ctx context.Context, customer *models.Customer) error {
	if customer == nil {
		return fmt.Errorf("customer cannot be nil")
	}

	// Use model's built-in validation
	if err := customer.Validate(); err != nil {
		return err
	}

	// Additional business rule validations
	if customer.CustomerType == models.CustomerTypeBusiness {
		// Business customers should have business name
		if customer.BusinessName == nil || strings.TrimSpace(*customer.BusinessName) == "" {
			return fmt.Errorf("business name is required for business customers")
		}

		// Validate ABN format if provided
		if customer.ABN != nil && *customer.ABN != "" {
			if err := s.validateABN(*customer.ABN); err != nil {
				return fmt.Errorf("invalid ABN: %w", err)
			}
		}
	}

	if customer.CustomerType == models.CustomerTypeIndividual {
		// Individual customers should have first name
		if customer.FirstName == nil || strings.TrimSpace(*customer.FirstName) == "" {
			return fmt.Errorf("first name is required for individual customers")
		}
	}

	return nil
}

// GetCustomerStatistics retrieves statistics for a specific customer
func (s *customerService) GetCustomerStatistics(ctx context.Context, customerID string) (*CustomerStatistics, error) {
	if customerID == "" {
		return nil, fmt.Errorf("customer ID cannot be empty")
	}

	// Verify customer exists
	_, err := s.GetCustomer(ctx, customerID)
	if err != nil {
		return nil, err
	}

	// Get customer receipts
	receipts, err := s.receiptRepo.GetByCustomerID(ctx, customerID)
	if err != nil {
		return nil, fmt.Errorf("failed to get customer receipts: %w", err)
	}

	stats := &CustomerStatistics{
		TotalReceipts: int64(len(receipts)),
	}

	if len(receipts) == 0 {
		return stats, nil
	}

	// Calculate statistics
	var totalRevenue float64
	var firstPurchase, lastPurchase time.Time
	productCounts := make(map[string]int)

	for i, receipt := range receipts {
		totalRevenue += receipt.TotalIncGST

		if i == 0 {
			firstPurchase = receipt.DateOfPurchase
			lastPurchase = receipt.DateOfPurchase
		} else {
			if receipt.DateOfPurchase.Before(firstPurchase) {
				firstPurchase = receipt.DateOfPurchase
			}
			if receipt.DateOfPurchase.After(lastPurchase) {
				lastPurchase = receipt.DateOfPurchase
			}
		}

		// Count products (would need line items for this)
		for _, lineItem := range receipt.LineItems {
			productCounts[lineItem.ProductID]++
		}
	}

	stats.TotalRevenue = totalRevenue
	stats.AverageReceipt = totalRevenue / float64(len(receipts))
	stats.FirstPurchase = firstPurchase
	stats.LastPurchase = lastPurchase

	// Get favorite products (top 5)
	type productCount struct {
		productID string
		count     int
	}
	var productList []productCount
	for productID, count := range productCounts {
		productList = append(productList, productCount{productID, count})
	}

	// Sort by count (simple bubble sort for small lists)
	for i := 0; i < len(productList)-1; i++ {
		for j := 0; j < len(productList)-i-1; j++ {
			if productList[j].count < productList[j+1].count {
				productList[j], productList[j+1] = productList[j+1], productList[j]
			}
		}
	}

	// Take top 5
	maxProducts := 5
	if len(productList) < maxProducts {
		maxProducts = len(productList)
	}
	for i := 0; i < maxProducts; i++ {
		stats.FavoriteProducts = append(stats.FavoriteProducts, productList[i].productID)
	}

	return stats, nil
}

// validateABN validates Australian Business Number format
func (s *customerService) validateABN(abn string) error {
	// Remove spaces and hyphens
	abn = strings.ReplaceAll(abn, " ", "")
	abn = strings.ReplaceAll(abn, "-", "")

	// ABN should be 11 digits
	if len(abn) != 11 {
		return fmt.Errorf("ABN must be 11 digits")
	}

	// Check if all characters are digits
	for _, char := range abn {
		if char < '0' || char > '9' {
			return fmt.Errorf("ABN must contain only digits")
		}
	}

	// ABN checksum validation (simplified)
	weights := []int{10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19}
	sum := 0

	for i, char := range abn {
		digit := int(char - '0')
		if i == 0 {
			digit -= 1 // Subtract 1 from first digit
		}
		sum += digit * weights[i]
	}

	if sum%89 != 0 {
		return fmt.Errorf("invalid ABN checksum")
	}

	return nil
}
