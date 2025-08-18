package sqlite

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"

	"bakery-invoice-api/internal/models"
	"bakery-invoice-api/internal/repositories"

	"github.com/sirupsen/logrus"
)

// CustomerRepository implements the CustomerRepository interface for SQLite
type CustomerRepository struct {
	*BaseRepository[models.Customer]
}

// NewCustomerRepository creates a new SQLite customer repository
func NewCustomerRepository(db *sql.DB, logger *logrus.Logger) repositories.CustomerRepository {
	return &CustomerRepository{
		BaseRepository: NewBaseRepository[models.Customer](db, "customers", logger),
	}
}

// Create creates a new customer
func (r *CustomerRepository) Create(ctx context.Context, customer *models.Customer) error {
	if err := customer.Validate(); err != nil {
		return repositories.ValidationError("customer", customer.ID, err)
	}

	query := `
		INSERT INTO customers (
			id, customer_type, first_name, last_name, business_name, 
			abn, email, phone, address, created_at, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`

	_, err := r.executeExec(ctx, "create", query,
		customer.ID,
		customer.CustomerType,
		customer.FirstName,
		customer.LastName,
		customer.BusinessName,
		customer.ABN,
		customer.Email,
		customer.Phone,
		customer.Address,
		customer.CreatedAt,
		customer.UpdatedAt,
	)

	if err != nil {
		if strings.Contains(err.Error(), "UNIQUE constraint failed") {
			return repositories.DuplicateError("customer", "id", customer.ID)
		}
		return err
	}

	return nil
}

// GetByID retrieves a customer by ID
func (r *CustomerRepository) GetByID(ctx context.Context, id string) (*models.Customer, error) {
	if err := r.validateID(id); err != nil {
		return nil, err
	}

	query := `
		SELECT id, customer_type, first_name, last_name, business_name,
			   abn, email, phone, address, created_at, updated_at
		FROM customers 
		WHERE id = ?`

	row := r.executeQueryRow(ctx, "get_by_id", query, id)

	customer := &models.Customer{}
	err := row.Scan(
		&customer.ID,
		&customer.CustomerType,
		&customer.FirstName,
		&customer.LastName,
		&customer.BusinessName,
		&customer.ABN,
		&customer.Email,
		&customer.Phone,
		&customer.Address,
		&customer.CreatedAt,
		&customer.UpdatedAt,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			return nil, repositories.NotFoundError("customer", id)
		}
		return nil, repositories.NewRepositoryError("get_by_id", "customer", id, err)
	}

	return customer, nil
}

// Update updates an existing customer
func (r *CustomerRepository) Update(ctx context.Context, customer *models.Customer) error {
	if err := customer.Validate(); err != nil {
		return repositories.ValidationError("customer", customer.ID, err)
	}

	customer.UpdateTimestamp()

	query := `
		UPDATE customers 
		SET customer_type = ?, first_name = ?, last_name = ?, business_name = ?,
			abn = ?, email = ?, phone = ?, address = ?, updated_at = ?
		WHERE id = ?`

	result, err := r.executeExec(ctx, "update", query,
		customer.CustomerType,
		customer.FirstName,
		customer.LastName,
		customer.BusinessName,
		customer.ABN,
		customer.Email,
		customer.Phone,
		customer.Address,
		customer.UpdatedAt,
		customer.ID,
	)

	if err != nil {
		return err
	}

	return r.checkRowsAffected(result, "update", customer.ID)
}

// Delete deletes a customer by ID
func (r *CustomerRepository) Delete(ctx context.Context, id string) error {
	if err := r.validateID(id); err != nil {
		return err
	}

	query := "DELETE FROM customers WHERE id = ?"
	result, err := r.executeExec(ctx, "delete", query, id)
	if err != nil {
		return err
	}

	return r.checkRowsAffected(result, "delete", id)
}

// List retrieves customers with optional filters
func (r *CustomerRepository) List(ctx context.Context, filters map[string]interface{}) ([]*models.Customer, error) {
	query := `
		SELECT id, customer_type, first_name, last_name, business_name,
			   abn, email, phone, address, created_at, updated_at
		FROM customers`

	whereClause, args := r.buildWhereClause(filters)
	if whereClause != "" {
		query += " " + whereClause
	}

	query += " ORDER BY created_at DESC"

	rows, err := r.executeQuery(ctx, "list", query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var customers []*models.Customer
	for rows.Next() {
		customer := &models.Customer{}
		err := rows.Scan(
			&customer.ID,
			&customer.CustomerType,
			&customer.FirstName,
			&customer.LastName,
			&customer.BusinessName,
			&customer.ABN,
			&customer.Email,
			&customer.Phone,
			&customer.Address,
			&customer.CreatedAt,
			&customer.UpdatedAt,
		)
		if err != nil {
			return nil, repositories.NewRepositoryError("list", "customer", "", err)
		}
		customers = append(customers, customer)
	}

	if err = rows.Err(); err != nil {
		return nil, repositories.NewRepositoryError("list", "customer", "", err)
	}

	return customers, nil
}

// Count returns the total number of customers matching the filters
func (r *CustomerRepository) Count(ctx context.Context, filters map[string]interface{}) (int64, error) {
	query := "SELECT COUNT(*) FROM customers"

	whereClause, args := r.buildWhereClause(filters)
	if whereClause != "" {
		query += " " + whereClause
	}

	row := r.executeQueryRow(ctx, "count", query, args...)

	var count int64
	err := row.Scan(&count)
	if err != nil {
		return 0, repositories.NewRepositoryError("count", "customer", "", err)
	}

	return count, nil
}

// Search performs full-text search on customer data
func (r *CustomerRepository) Search(ctx context.Context, query string, limit int) ([]*models.Customer, error) {
	if strings.TrimSpace(query) == "" {
		return []*models.Customer{}, nil
	}

	searchQuery := `
		SELECT c.id, c.customer_type, c.first_name, c.last_name, c.business_name,
			   c.abn, c.email, c.phone, c.address, c.created_at, c.updated_at
		FROM customers c
		JOIN customers_fts fts ON c.id = fts.id
		WHERE customers_fts MATCH ?
		ORDER BY rank
		LIMIT ?`

	rows, err := r.executeQuery(ctx, "search", searchQuery, query, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var customers []*models.Customer
	for rows.Next() {
		customer := &models.Customer{}
		err := rows.Scan(
			&customer.ID,
			&customer.CustomerType,
			&customer.FirstName,
			&customer.LastName,
			&customer.BusinessName,
			&customer.ABN,
			&customer.Email,
			&customer.Phone,
			&customer.Address,
			&customer.CreatedAt,
			&customer.UpdatedAt,
		)
		if err != nil {
			return nil, repositories.NewRepositoryError("search", "customer", "", err)
		}
		customers = append(customers, customer)
	}

	if err = rows.Err(); err != nil {
		return nil, repositories.NewRepositoryError("search", "customer", "", err)
	}

	return customers, nil
}

// GetByEmail retrieves a customer by email address
func (r *CustomerRepository) GetByEmail(ctx context.Context, email string) (*models.Customer, error) {
	if strings.TrimSpace(email) == "" {
		return nil, repositories.NewRepositoryError("get_by_email", "customer", "", repositories.ErrInvalidID)
	}

	query := `
		SELECT id, customer_type, first_name, last_name, business_name,
			   abn, email, phone, address, created_at, updated_at
		FROM customers 
		WHERE email = ?`

	row := r.executeQueryRow(ctx, "get_by_email", query, email)

	customer := &models.Customer{}
	err := row.Scan(
		&customer.ID,
		&customer.CustomerType,
		&customer.FirstName,
		&customer.LastName,
		&customer.BusinessName,
		&customer.ABN,
		&customer.Email,
		&customer.Phone,
		&customer.Address,
		&customer.CreatedAt,
		&customer.UpdatedAt,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			return nil, repositories.NotFoundError("customer", fmt.Sprintf("email:%s", email))
		}
		return nil, repositories.NewRepositoryError("get_by_email", "customer", email, err)
	}

	return customer, nil
}

// GetByPhone retrieves customers by phone number
func (r *CustomerRepository) GetByPhone(ctx context.Context, phone string) ([]*models.Customer, error) {
	if strings.TrimSpace(phone) == "" {
		return []*models.Customer{}, nil
	}

	query := `
		SELECT id, customer_type, first_name, last_name, business_name,
			   abn, email, phone, address, created_at, updated_at
		FROM customers 
		WHERE phone = ?
		ORDER BY created_at DESC`

	rows, err := r.executeQuery(ctx, "get_by_phone", query, phone)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var customers []*models.Customer
	for rows.Next() {
		customer := &models.Customer{}
		err := rows.Scan(
			&customer.ID,
			&customer.CustomerType,
			&customer.FirstName,
			&customer.LastName,
			&customer.BusinessName,
			&customer.ABN,
			&customer.Email,
			&customer.Phone,
			&customer.Address,
			&customer.CreatedAt,
			&customer.UpdatedAt,
		)
		if err != nil {
			return nil, repositories.NewRepositoryError("get_by_phone", "customer", "", err)
		}
		customers = append(customers, customer)
	}

	if err = rows.Err(); err != nil {
		return nil, repositories.NewRepositoryError("get_by_phone", "customer", "", err)
	}

	return customers, nil
}

// GetByType retrieves customers by type (individual/business)
func (r *CustomerRepository) GetByType(ctx context.Context, customerType models.CustomerType) ([]*models.Customer, error) {
	query := `
		SELECT id, customer_type, first_name, last_name, business_name,
			   abn, email, phone, address, created_at, updated_at
		FROM customers 
		WHERE customer_type = ?
		ORDER BY created_at DESC`

	rows, err := r.executeQuery(ctx, "get_by_type", query, customerType)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var customers []*models.Customer
	for rows.Next() {
		customer := &models.Customer{}
		err := rows.Scan(
			&customer.ID,
			&customer.CustomerType,
			&customer.FirstName,
			&customer.LastName,
			&customer.BusinessName,
			&customer.ABN,
			&customer.Email,
			&customer.Phone,
			&customer.Address,
			&customer.CreatedAt,
			&customer.UpdatedAt,
		)
		if err != nil {
			return nil, repositories.NewRepositoryError("get_by_type", "customer", "", err)
		}
		customers = append(customers, customer)
	}

	if err = rows.Err(); err != nil {
		return nil, repositories.NewRepositoryError("get_by_type", "customer", "", err)
	}

	return customers, nil
}

// GetBusinessCustomers retrieves all business customers
func (r *CustomerRepository) GetBusinessCustomers(ctx context.Context) ([]*models.Customer, error) {
	return r.GetByType(ctx, models.CustomerTypeBusiness)
}

// GetIndividualCustomers retrieves all individual customers
func (r *CustomerRepository) GetIndividualCustomers(ctx context.Context) ([]*models.Customer, error) {
	return r.GetByType(ctx, models.CustomerTypeIndividual)
}

// GetRecentCustomers retrieves customers created within the specified duration
func (r *CustomerRepository) GetRecentCustomers(ctx context.Context, since time.Duration) ([]*models.Customer, error) {
	cutoffTime := time.Now().Add(-since)

	query := `
		SELECT id, customer_type, first_name, last_name, business_name,
			   abn, email, phone, address, created_at, updated_at
		FROM customers 
		WHERE created_at >= ?
		ORDER BY created_at DESC`

	rows, err := r.executeQuery(ctx, "get_recent", query, cutoffTime)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var customers []*models.Customer
	for rows.Next() {
		customer := &models.Customer{}
		err := rows.Scan(
			&customer.ID,
			&customer.CustomerType,
			&customer.FirstName,
			&customer.LastName,
			&customer.BusinessName,
			&customer.ABN,
			&customer.Email,
			&customer.Phone,
			&customer.Address,
			&customer.CreatedAt,
			&customer.UpdatedAt,
		)
		if err != nil {
			return nil, repositories.NewRepositoryError("get_recent", "customer", "", err)
		}
		customers = append(customers, customer)
	}

	if err = rows.Err(); err != nil {
		return nil, repositories.NewRepositoryError("get_recent", "customer", "", err)
	}

	return customers, nil
}

// GetCustomersWithABN retrieves customers that have an ABN
func (r *CustomerRepository) GetCustomersWithABN(ctx context.Context) ([]*models.Customer, error) {
	query := `
		SELECT id, customer_type, first_name, last_name, business_name,
			   abn, email, phone, address, created_at, updated_at
		FROM customers 
		WHERE abn IS NOT NULL AND abn != ''
		ORDER BY created_at DESC`

	rows, err := r.executeQuery(ctx, "get_with_abn", query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var customers []*models.Customer
	for rows.Next() {
		customer := &models.Customer{}
		err := rows.Scan(
			&customer.ID,
			&customer.CustomerType,
			&customer.FirstName,
			&customer.LastName,
			&customer.BusinessName,
			&customer.ABN,
			&customer.Email,
			&customer.Phone,
			&customer.Address,
			&customer.CreatedAt,
			&customer.UpdatedAt,
		)
		if err != nil {
			return nil, repositories.NewRepositoryError("get_with_abn", "customer", "", err)
		}
		customers = append(customers, customer)
	}

	if err = rows.Err(); err != nil {
		return nil, repositories.NewRepositoryError("get_with_abn", "customer", "", err)
	}

	return customers, nil
}

// GetFrequentCustomers retrieves customers with the most receipts
func (r *CustomerRepository) GetFrequentCustomers(ctx context.Context, limit int) ([]*models.Customer, error) {
	query := `
		SELECT c.id, c.customer_type, c.first_name, c.last_name, c.business_name,
			   c.abn, c.email, c.phone, c.address, c.created_at, c.updated_at
		FROM customers c
		LEFT JOIN receipts r ON c.id = r.customer_id
		GROUP BY c.id
		ORDER BY COUNT(r.receipt_id) DESC, c.created_at DESC
		LIMIT ?`

	rows, err := r.executeQuery(ctx, "get_frequent", query, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var customers []*models.Customer
	for rows.Next() {
		customer := &models.Customer{}
		err := rows.Scan(
			&customer.ID,
			&customer.CustomerType,
			&customer.FirstName,
			&customer.LastName,
			&customer.BusinessName,
			&customer.ABN,
			&customer.Email,
			&customer.Phone,
			&customer.Address,
			&customer.CreatedAt,
			&customer.UpdatedAt,
		)
		if err != nil {
			return nil, repositories.NewRepositoryError("get_frequent", "customer", "", err)
		}
		customers = append(customers, customer)
	}

	if err = rows.Err(); err != nil {
		return nil, repositories.NewRepositoryError("get_frequent", "customer", "", err)
	}

	return customers, nil
}
