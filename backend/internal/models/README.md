# Domain Models

This package contains all the domain models for the bakery invoice system. The models are designed to work with SQLite database and include comprehensive validation, business logic, and utility methods.

## Models Overview

### Core Business Models

#### Customer (`customer.go`)
- Represents individual and business customers
- Supports both individual customers (first/last name) and business customers (business name)
- Includes validation for customer type constraints
- Provides search functionality and display name generation
- Handles ABN validation for business customers

**Key Methods:**
- `NewIndividualCustomer()` - Creates individual customer
- `NewBusinessCustomer()` - Creates business customer
- `Validate()` - Validates customer data
- `GetDisplayName()` - Returns formatted display name
- `GetSearchableText()` - Returns text for search indexing

#### Product (`product.go`)
- Represents products/items sold by the bakery
- Includes category support and GST applicability
- Provides GST calculation methods
- Supports active/inactive status

**Key Methods:**
- `NewProduct()` - Creates new product
- `CalculateGST()` - Calculates GST amount for quantity
- `CalculateLineTotal()` - Calculates total including GST
- `GetSearchableText()` - Returns text for search indexing

#### Receipt (`receipt.go`)
- Represents invoices/receipts with comprehensive business logic
- Implements GST calculations and tax invoice determination
- Stores immutable snapshots of customer and seller data
- Supports multiple payment methods

**Key Methods:**
- `NewReceipt()` - Creates new receipt
- `CalculateTotals()` - Calculates subtotal, GST, and total
- `SetCustomerSnapshot()` - Stores customer data snapshot
- `SetSellerProfileSnapshot()` - Stores seller data snapshot
- `GetCustomerDisplayName()` - Gets customer name from snapshot

#### LineItem (`line_item.go`)
- Represents individual items on a receipt
- Supports both catalog products and custom items
- Includes quantity and pricing calculations
- Maintains product information snapshot

**Key Methods:**
- `NewLineItem()` - Creates line item from product
- `NewCustomLineItem()` - Creates custom line item
- `CalculateGSTAmount()` - Calculates GST for line item
- `UpdateQuantity()` - Updates quantity and recalculates totals

#### SellerProfile (`seller_profile.go`)
- Singleton model representing the bakery's business information
- Includes ABN/ACN validation and formatting
- Supports logo and contact information
- Used for tax invoice generation

**Key Methods:**
- `NewSellerProfile()` - Creates seller profile
- `IsABN()` / `IsACN()` - Detects ABN vs ACN format
- `GetABNOrACNFormatted()` - Returns formatted ABN/ACN
- `GetFormattedAddress()` - Returns formatted address

### Supporting Models

#### ProductCategory (`product_category.go`)
- Represents product categories for organization
- Includes default bakery categories (breads, cakes, pastries, etc.)
- Supports custom sort ordering

#### EmailAudit (`email_audit.go`)
- Tracks email delivery status and attempts
- Supports retry logic with exponential backoff
- Maintains delivery history for receipts

**Key Methods:**
- `MarkAsSent()` - Marks email as successfully sent
- `MarkAsFailed()` - Marks email as failed with error
- `MarkForRetry()` - Marks for retry and increments counter
- `CanRetry()` - Checks if retry is allowed

### Utility Types

#### Types (`types.go`)
- Common types and constants used across the system
- Business rules and configuration
- API response structures
- Pagination and filtering types

**Key Types:**
- `SalesSummary` - Aggregated sales reporting data
- `SearchFilters` - Common search and filter parameters
- `APIResponse` - Standard API response structure
- `ValidationError` - Validation error with field details
- `BusinessRules` - Business logic constants

#### Validation (`validation.go`)
- Utility functions for data validation
- Email, phone, ABN/ACN format validation
- String length and required field validation
- Enum and UUID validation

**Key Functions:**
- `ValidateEmail()` - Email format validation
- `ValidateABNOrACN()` - Australian business number validation
- `ValidateRequired()` - Required field validation
- `ValidatePositiveNumber()` - Positive number validation

## Business Logic Implementation

### GST Calculations
- 10% GST rate applied when both `include_gst` is true AND product has `gst_applicable: true`
- All monetary values rounded to 2 decimal places
- Tax invoices automatically generated for amounts ≥ $82.50 AUD

### Data Integrity
- Immutable receipt snapshots preserve customer and seller data at creation time
- Comprehensive validation ensures data consistency
- Foreign key relationships maintained through validation

### Search and Filtering
- Full-text search support through `GetSearchableText()` methods
- Category-based filtering for products
- Date range filtering for receipts

## Usage Examples

### Creating a Receipt
```go
// Create customer and products
customer := NewIndividualCustomer("John", "Doe")
product := NewProduct("Sourdough Bread", "breads", 8.50)

// Create receipt
receipt := NewReceipt(customer.ID)

// Add line items
lineItem := NewLineItem(receipt.ReceiptID, product.ID, product, 2, 1)
receipt.LineItems = []LineItem{*lineItem}

// Set snapshots
seller := NewSellerProfile("Bakery Name", "Address", "ABN", "email@bakery.com")
receipt.SetCustomerSnapshot(customer)
receipt.SetSellerProfileSnapshot(seller)

// Calculate totals
receipt.CalculateTotals(true) // true = include GST
```

### Validation
```go
// All models implement Validate() method
if err := customer.Validate(); err != nil {
    // Handle validation error
    log.Printf("Validation failed: %v", err)
}
```

## Database Integration

The models are designed to work with the SQLite schema defined in `migrations/001_initial_schema.up.sql`. Each model includes:

- Database field tags (`db:"field_name"`)
- JSON serialization tags (`json:"field_name"`)
- Validation tags (`validate:"rules"`)

## Testing

Comprehensive tests are provided in `models_test.go` covering:
- Model creation and validation
- Business logic calculations
- GST calculations and tax invoice rules
- Snapshot functionality
- Validation utilities

Run tests with:
```bash
go test ./internal/models/... -v
```