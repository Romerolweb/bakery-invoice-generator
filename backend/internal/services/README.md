# Services Package

This package contains the business logic layer for the bakery invoice system. It implements the service interfaces and provides the core business functionality.

## Architecture

The services layer follows the Clean Architecture pattern and acts as the business logic layer between the HTTP handlers and the data access layer (repositories).

## Services

### CustomerService
- **Purpose**: Manages customer-related business logic
- **Features**: CRUD operations, search, validation, statistics
- **Key Methods**: CreateCustomer, SearchCustomers, ValidateCustomerData
- **Business Rules**: ABN validation for business customers, email uniqueness

### ProductService  
- **Purpose**: Manages product catalog and categories
- **Features**: CRUD operations, search, autocomplete, category management
- **Key Methods**: CreateProduct, SearchProducts, GetPopularProducts
- **Business Rules**: Price validation, category management, GST applicability

### ReceiptService
- **Purpose**: Manages receipt creation and GST calculations
- **Features**: Receipt CRUD, GST calculations, tax compliance, reporting
- **Key Methods**: CreateReceipt, CalculateReceiptTotals, ValidateReceiptForTaxCompliance
- **Business Rules**: ATO-compliant GST calculations, tax invoice requirements

### EmailService
- **Purpose**: Manages email delivery for receipts
- **Features**: Email sending, template rendering, delivery tracking, retry logic
- **Key Methods**: SendReceiptEmail, RenderReceiptEmailTemplate, ResendFailedEmails
- **Business Rules**: Email validation, delivery tracking, retry mechanisms

### TaxService
- **Purpose**: Handles tax calculations and compliance (existing)
- **Features**: GST calculations, business number validation, tax compliance
- **Key Methods**: CalculateReceiptTotals, ValidateBusinessNumber
- **Business Rules**: ATO GST compliance, tax invoice thresholds

## Service Factory

The `ServiceContainer` provides dependency injection for all services:

```go
container, err := NewServiceContainer(repositoryContainer, &ServiceConfig{
    SMTPConfig: &SMTPConfig{
        Host: "smtp.example.com",
        Port: 587,
        // ... other SMTP settings
    },
    TaxConfig: &TaxConfig{
        CountryCode: "AU",
    },
})
```

## Error Handling

All services implement comprehensive error handling:
- Input validation using go-playground/validator
- Business rule validation
- Descriptive error messages with context
- Proper error wrapping for debugging

## Validation

Services use struct validation tags and custom validation:
- Required field validation
- Format validation (email, UUID, etc.)
- Business rule validation (ABN format, GST calculations)
- Range validation (positive numbers, string lengths)

## Testing

The services package includes comprehensive tests:
- Interface compliance tests
- Request/response type tests
- Business logic validation tests
- Integration with existing tax service tests

## Usage Example

```go
// Create service container
repos := repositories.NewRepositoryContainer(db, factory)
services, err := NewServiceContainer(repos, &ServiceConfig{
    SMTPConfig: smtpConfig,
    TaxConfig: &TaxConfig{CountryCode: "AU"},
})

// Use customer service
customer, err := services.CustomerService.CreateCustomer(ctx, &CreateCustomerRequest{
    CustomerType: models.CustomerTypeIndividual,
    FirstName:    stringPtr("John"),
    LastName:     stringPtr("Doe"),
    Email:        stringPtr("john@example.com"),
})

// Use receipt service with GST calculations
receipt, err := services.ReceiptService.CreateReceipt(ctx, &CreateReceiptRequest{
    CustomerID: customer.ID,
    LineItems: []CreateLineItemRequest{
        {ProductID: productID, Quantity: 2},
    },
    PaymentMethod: models.PaymentMethodCard,
})
```

## Dependencies

- `github.com/go-playground/validator/v10` - Request validation
- `github.com/google/uuid` - UUID generation
- Internal repositories package - Data access
- Internal models package - Domain models

## Configuration

Services can be configured through the ServiceConfig:
- SMTP settings for email service
- Tax configuration for different countries
- Validation rules and business logic parameters