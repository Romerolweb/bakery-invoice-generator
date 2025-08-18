# Repository Layer

This package contains the repository interfaces and supporting types for the bakery invoice system, following Clean Architecture principles.

## Overview

The repository layer provides a clean abstraction over data persistence, making the system database-agnostic and easily testable. All repositories follow consistent patterns and provide both basic CRUD operations and business-specific query methods.

## Architecture

### Core Interfaces

- **BaseRepository[T]**: Generic interface providing common CRUD operations for all entities
- **RepositoryManager**: Central manager providing access to all repositories and transaction management
- **TransactionManager**: Handles database transactions across multiple repositories
- **QueryBuilderFactory**: Creates type-safe query builders for complex queries

### Entity-Specific Repositories

Each domain entity has its own repository interface with business-specific operations:

- **CustomerRepository**: Customer management with search, filtering, and business logic
- **ProductRepository**: Product catalog with categories, search, and popularity tracking
- **ReceiptRepository**: Receipt/invoice management with sales reporting and analytics
- **LineItemRepository**: Line item operations with product sales analysis
- **ProductCategoryRepository**: Category management with product counts
- **SellerProfileRepository**: Seller profile management (singleton pattern)
- **EmailAuditRepository**: Email delivery tracking and statistics

## Key Features

### Framework Agnostic Design

All interfaces are designed to work with any database or ORM:

```go
// Works with any database implementation
type CustomerRepository interface {
    BaseRepository[models.Customer]
    Search(ctx context.Context, query string, limit int) ([]*models.Customer, error)
    GetByEmail(ctx context.Context, email string) (*models.Customer, error)
    // ... other methods
}
```

### Transaction Support

Repositories support transactions for data consistency:

```go
// Execute multiple operations in a transaction
err := repoManager.WithTransaction(ctx, func(ctx context.Context) error {
    customer, err := repoManager.Customers().Create(ctx, newCustomer)
    if err != nil {
        return err
    }
    
    receipt, err := repoManager.Receipts().Create(ctx, newReceipt)
    if err != nil {
        return err
    }
    
    return nil
})
```

### Type-Safe Query Building

Complex queries can be built using type-safe query builders:

```go
// Build complex queries fluently
customers, err := queryFactory.Customer().
    ByType(models.CustomerTypeBusiness).
    WithABN().
    CreatedAfter(time.Now().AddDate(0, -1, 0)).
    OrderBy("created_at", "DESC").
    Limit(50).
    Find()
```

### Business-Specific Operations

Each repository provides methods tailored to business needs:

```go
// Get sales report for date range
report, err := receiptRepo.GetSalesReport(ctx, startDate, endDate)

// Get popular products
products, err := productRepo.GetPopularProducts(ctx, 10)

// Get customers with highest revenue
customers, err := receiptRepo.GetTopCustomersByRevenue(ctx, 20)
```

### Error Handling

Consistent error handling with detailed context:

```go
// Check for specific error types
if repositories.IsNotFound(err) {
    // Handle not found case
}

if repositories.IsDuplicate(err) {
    // Handle duplicate entry case
}
```

## Configuration

Repository behavior can be configured through the Config struct:

```go
config := &repositories.Config{
    Database: repositories.DatabaseConfig{
        Driver:      "sqlite",
        Path:        "data/bakery.db",
        WALMode:     true,
        ForeignKeys: true,
    },
    Pool: repositories.PoolConfig{
        MaxOpenConns:    25,
        MaxIdleConns:    5,
        ConnMaxLifetime: time.Hour,
    },
    Query: repositories.QueryConfig{
        DefaultLimit:       50,
        MaxLimit:           1000,
        Timeout:            time.Second * 30,
        SlowQueryThreshold: time.Second * 2,
    },
}
```

## Usage Examples

### Basic CRUD Operations

```go
// Create a new customer
customer := models.NewIndividualCustomer("John", "Doe")
customer.Email = stringPtr("john@example.com")

err := customerRepo.Create(ctx, customer)
if err != nil {
    return fmt.Errorf("failed to create customer: %w", err)
}

// Get customer by ID
customer, err := customerRepo.GetByID(ctx, customerID)
if err != nil {
    if repositories.IsNotFound(err) {
        return fmt.Errorf("customer not found")
    }
    return fmt.Errorf("failed to get customer: %w", err)
}

// Update customer
customer.Phone = stringPtr("+61400000000")
err = customerRepo.Update(ctx, customer)
if err != nil {
    return fmt.Errorf("failed to update customer: %w", err)
}
```

### Search and Filtering

```go
// Search customers by text
customers, err := customerRepo.Search(ctx, "john doe", 10)

// Get business customers
businessCustomers, err := customerRepo.GetBusinessCustomers(ctx)

// Get products by category
products, err := productRepo.GetByCategory(ctx, "breads")

// Get receipts in date range
receipts, err := receiptRepo.GetByDateRange(ctx, startDate, endDate)
```

### Analytics and Reporting

```go
// Get sales summary for the month
summary, err := receiptRepo.GetMonthlySales(ctx, 2024, time.January)

// Get top-selling products
topProducts, err := lineItemRepo.GetTopSellingProducts(ctx, 10, startDate, endDate)

// Get customer revenue ranking
topCustomers, err := receiptRepo.GetTopCustomersByRevenue(ctx, 20)

// Get email delivery statistics
emailStats, err := emailAuditRepo.GetEmailStatistics(ctx, startDate, endDate)
```

### Transaction Management

```go
// Create receipt with line items in a transaction
err := repoManager.WithTransaction(ctx, func(ctx context.Context) error {
    // Create receipt
    receipt := models.NewReceipt(customerID)
    err := repoManager.Receipts().Create(ctx, receipt)
    if err != nil {
        return err
    }
    
    // Create line items
    for i, item := range lineItems {
        lineItem := models.NewLineItem(receipt.ReceiptID, item.ProductID, product, item.Quantity, i)
        err := repoManager.LineItems().Create(ctx, lineItem)
        if err != nil {
            return err
        }
    }
    
    return nil
})
```

## Implementation Notes

### Database Agnostic

The interfaces are designed to work with any database:
- SQLite for local/development use
- PostgreSQL for production deployments
- MySQL for legacy system integration

### Serverless Ready

All operations use context and are stateless, making them suitable for serverless deployments:
- AWS Lambda functions
- Google Cloud Functions
- Azure Functions

### Testing Support

Interfaces make testing easy with mock implementations:

```go
type MockCustomerRepository struct {
    customers map[string]*models.Customer
}

func (m *MockCustomerRepository) Create(ctx context.Context, customer *models.Customer) error {
    m.customers[customer.ID] = customer
    return nil
}

func (m *MockCustomerRepository) GetByID(ctx context.Context, id string) (*models.Customer, error) {
    customer, exists := m.customers[id]
    if !exists {
        return nil, repositories.NotFoundError("customer", id)
    }
    return customer, nil
}
```

### Performance Considerations

- Connection pooling for optimal database performance
- Query timeout configuration to prevent long-running queries
- Slow query logging for performance monitoring
- Optional caching layer for frequently accessed data

## Next Steps

1. **Implementation**: Create concrete implementations for SQLite, PostgreSQL, and MySQL
2. **Testing**: Develop comprehensive test suites for all repository operations
3. **Caching**: Implement optional caching layer for improved performance
4. **Monitoring**: Add metrics collection and health checking capabilities
5. **Documentation**: Generate API documentation from interface definitions

## Related Files

- `interfaces.go` - Core repository interfaces
- `transaction.go` - Transaction management interfaces
- `query.go` - Query builder interfaces
- `errors.go` - Repository error definitions
- `config.go` - Configuration structures
- `factory.go` - Factory interfaces for creating repositories