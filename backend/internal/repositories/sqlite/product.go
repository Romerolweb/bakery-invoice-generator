package sqlite

import (
	"context"
	"database/sql"
	"strings"
	"time"

	"bakery-invoice-api/internal/models"
	"bakery-invoice-api/internal/repositories"

	"github.com/sirupsen/logrus"
)

// ProductRepository implements the ProductRepository interface for SQLite
type ProductRepository struct {
	*BaseRepository[models.Product]
}

// NewProductRepository creates a new SQLite product repository
func NewProductRepository(db *sql.DB, logger *logrus.Logger) repositories.ProductRepository {
	return &ProductRepository{
		BaseRepository: NewBaseRepository[models.Product](db, "products", logger),
	}
}

// Create creates a new product
func (r *ProductRepository) Create(ctx context.Context, product *models.Product) error {
	if err := product.Validate(); err != nil {
		return repositories.ValidationError("product", product.ID, err)
	}

	query := `
		INSERT INTO products (
			id, name, description, category, unit_price, 
			gst_applicable, active, created_at, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`

	_, err := r.executeExec(ctx, "create", query,
		product.ID,
		product.Name,
		product.Description,
		product.Category,
		product.UnitPrice,
		product.GSTApplicable,
		product.Active,
		product.CreatedAt,
		product.UpdatedAt,
	)

	if err != nil {
		if strings.Contains(err.Error(), "UNIQUE constraint failed") {
			return repositories.DuplicateError("product", "id", product.ID)
		}
		return err
	}

	return nil
}

// GetByID retrieves a product by ID
func (r *ProductRepository) GetByID(ctx context.Context, id string) (*models.Product, error) {
	if err := r.validateID(id); err != nil {
		return nil, err
	}

	query := `
		SELECT id, name, description, category, unit_price,
			   gst_applicable, active, created_at, updated_at
		FROM products 
		WHERE id = ?`

	row := r.executeQueryRow(ctx, "get_by_id", query, id)

	product := &models.Product{}
	err := row.Scan(
		&product.ID,
		&product.Name,
		&product.Description,
		&product.Category,
		&product.UnitPrice,
		&product.GSTApplicable,
		&product.Active,
		&product.CreatedAt,
		&product.UpdatedAt,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			return nil, repositories.NotFoundError("product", id)
		}
		return nil, repositories.NewRepositoryError("get_by_id", "product", id, err)
	}

	return product, nil
}

// Update updates an existing product
func (r *ProductRepository) Update(ctx context.Context, product *models.Product) error {
	if err := product.Validate(); err != nil {
		return repositories.ValidationError("product", product.ID, err)
	}

	product.UpdateTimestamp()

	query := `
		UPDATE products 
		SET name = ?, description = ?, category = ?, unit_price = ?,
			gst_applicable = ?, active = ?, updated_at = ?
		WHERE id = ?`

	result, err := r.executeExec(ctx, "update", query,
		product.Name,
		product.Description,
		product.Category,
		product.UnitPrice,
		product.GSTApplicable,
		product.Active,
		product.UpdatedAt,
		product.ID,
	)

	if err != nil {
		return err
	}

	return r.checkRowsAffected(result, "update", product.ID)
}

// Delete deletes a product by ID
func (r *ProductRepository) Delete(ctx context.Context, id string) error {
	if err := r.validateID(id); err != nil {
		return err
	}

	query := "DELETE FROM products WHERE id = ?"
	result, err := r.executeExec(ctx, "delete", query, id)
	if err != nil {
		return err
	}

	return r.checkRowsAffected(result, "delete", id)
}

// List retrieves products with optional filters
func (r *ProductRepository) List(ctx context.Context, filters map[string]interface{}) ([]*models.Product, error) {
	query := `
		SELECT id, name, description, category, unit_price,
			   gst_applicable, active, created_at, updated_at
		FROM products`

	whereClause, args := r.buildWhereClause(filters)
	if whereClause != "" {
		query += " " + whereClause
	}

	query += " ORDER BY name ASC"

	rows, err := r.executeQuery(ctx, "list", query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var products []*models.Product
	for rows.Next() {
		product := &models.Product{}
		err := rows.Scan(
			&product.ID,
			&product.Name,
			&product.Description,
			&product.Category,
			&product.UnitPrice,
			&product.GSTApplicable,
			&product.Active,
			&product.CreatedAt,
			&product.UpdatedAt,
		)
		if err != nil {
			return nil, repositories.NewRepositoryError("list", "product", "", err)
		}
		products = append(products, product)
	}

	if err = rows.Err(); err != nil {
		return nil, repositories.NewRepositoryError("list", "product", "", err)
	}

	return products, nil
}

// Count returns the total number of products matching the filters
func (r *ProductRepository) Count(ctx context.Context, filters map[string]interface{}) (int64, error) {
	query := "SELECT COUNT(*) FROM products"

	whereClause, args := r.buildWhereClause(filters)
	if whereClause != "" {
		query += " " + whereClause
	}

	row := r.executeQueryRow(ctx, "count", query, args...)

	var count int64
	err := row.Scan(&count)
	if err != nil {
		return 0, repositories.NewRepositoryError("count", "product", "", err)
	}

	return count, nil
}

// Search performs full-text search on product data
func (r *ProductRepository) Search(ctx context.Context, query string, limit int) ([]*models.Product, error) {
	if strings.TrimSpace(query) == "" {
		return []*models.Product{}, nil
	}

	searchQuery := `
		SELECT p.id, p.name, p.description, p.category, p.unit_price,
			   p.gst_applicable, p.active, p.created_at, p.updated_at
		FROM products p
		JOIN products_fts fts ON p.id = fts.id
		WHERE products_fts MATCH ?
		ORDER BY rank
		LIMIT ?`

	rows, err := r.executeQuery(ctx, "search", searchQuery, query, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var products []*models.Product
	for rows.Next() {
		product := &models.Product{}
		err := rows.Scan(
			&product.ID,
			&product.Name,
			&product.Description,
			&product.Category,
			&product.UnitPrice,
			&product.GSTApplicable,
			&product.Active,
			&product.CreatedAt,
			&product.UpdatedAt,
		)
		if err != nil {
			return nil, repositories.NewRepositoryError("search", "product", "", err)
		}
		products = append(products, product)
	}

	if err = rows.Err(); err != nil {
		return nil, repositories.NewRepositoryError("search", "product", "", err)
	}

	return products, nil
}

// GetByCategory retrieves products by category
func (r *ProductRepository) GetByCategory(ctx context.Context, category string) ([]*models.Product, error) {
	query := `
		SELECT id, name, description, category, unit_price,
			   gst_applicable, active, created_at, updated_at
		FROM products 
		WHERE category = ?
		ORDER BY name ASC`

	rows, err := r.executeQuery(ctx, "get_by_category", query, category)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var products []*models.Product
	for rows.Next() {
		product := &models.Product{}
		err := rows.Scan(
			&product.ID,
			&product.Name,
			&product.Description,
			&product.Category,
			&product.UnitPrice,
			&product.GSTApplicable,
			&product.Active,
			&product.CreatedAt,
			&product.UpdatedAt,
		)
		if err != nil {
			return nil, repositories.NewRepositoryError("get_by_category", "product", "", err)
		}
		products = append(products, product)
	}

	if err = rows.Err(); err != nil {
		return nil, repositories.NewRepositoryError("get_by_category", "product", "", err)
	}

	return products, nil
}

// GetActiveProducts retrieves all active products
func (r *ProductRepository) GetActiveProducts(ctx context.Context) ([]*models.Product, error) {
	query := `
		SELECT id, name, description, category, unit_price,
			   gst_applicable, active, created_at, updated_at
		FROM products 
		WHERE active = true
		ORDER BY name ASC`

	rows, err := r.executeQuery(ctx, "get_active", query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var products []*models.Product
	for rows.Next() {
		product := &models.Product{}
		err := rows.Scan(
			&product.ID,
			&product.Name,
			&product.Description,
			&product.Category,
			&product.UnitPrice,
			&product.GSTApplicable,
			&product.Active,
			&product.CreatedAt,
			&product.UpdatedAt,
		)
		if err != nil {
			return nil, repositories.NewRepositoryError("get_active", "product", "", err)
		}
		products = append(products, product)
	}

	if err = rows.Err(); err != nil {
		return nil, repositories.NewRepositoryError("get_active", "product", "", err)
	}

	return products, nil
}

// GetInactiveProducts retrieves all inactive products
func (r *ProductRepository) GetInactiveProducts(ctx context.Context) ([]*models.Product, error) {
	query := `
		SELECT id, name, description, category, unit_price,
			   gst_applicable, active, created_at, updated_at
		FROM products 
		WHERE active = false
		ORDER BY name ASC`

	rows, err := r.executeQuery(ctx, "get_inactive", query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var products []*models.Product
	for rows.Next() {
		product := &models.Product{}
		err := rows.Scan(
			&product.ID,
			&product.Name,
			&product.Description,
			&product.Category,
			&product.UnitPrice,
			&product.GSTApplicable,
			&product.Active,
			&product.CreatedAt,
			&product.UpdatedAt,
		)
		if err != nil {
			return nil, repositories.NewRepositoryError("get_inactive", "product", "", err)
		}
		products = append(products, product)
	}

	if err = rows.Err(); err != nil {
		return nil, repositories.NewRepositoryError("get_inactive", "product", "", err)
	}

	return products, nil
}

// GetGSTApplicableProducts retrieves products that have GST applicable
func (r *ProductRepository) GetGSTApplicableProducts(ctx context.Context) ([]*models.Product, error) {
	query := `
		SELECT id, name, description, category, unit_price,
			   gst_applicable, active, created_at, updated_at
		FROM products 
		WHERE gst_applicable = true
		ORDER BY name ASC`

	rows, err := r.executeQuery(ctx, "get_gst_applicable", query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var products []*models.Product
	for rows.Next() {
		product := &models.Product{}
		err := rows.Scan(
			&product.ID,
			&product.Name,
			&product.Description,
			&product.Category,
			&product.UnitPrice,
			&product.GSTApplicable,
			&product.Active,
			&product.CreatedAt,
			&product.UpdatedAt,
		)
		if err != nil {
			return nil, repositories.NewRepositoryError("get_gst_applicable", "product", "", err)
		}
		products = append(products, product)
	}

	if err = rows.Err(); err != nil {
		return nil, repositories.NewRepositoryError("get_gst_applicable", "product", "", err)
	}

	return products, nil
}

// GetProductsByPriceRange retrieves products within a price range
func (r *ProductRepository) GetProductsByPriceRange(ctx context.Context, minPrice, maxPrice float64) ([]*models.Product, error) {
	query := `
		SELECT id, name, description, category, unit_price,
			   gst_applicable, active, created_at, updated_at
		FROM products 
		WHERE unit_price >= ? AND unit_price <= ?
		ORDER BY unit_price ASC, name ASC`

	rows, err := r.executeQuery(ctx, "get_by_price_range", query, minPrice, maxPrice)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var products []*models.Product
	for rows.Next() {
		product := &models.Product{}
		err := rows.Scan(
			&product.ID,
			&product.Name,
			&product.Description,
			&product.Category,
			&product.UnitPrice,
			&product.GSTApplicable,
			&product.Active,
			&product.CreatedAt,
			&product.UpdatedAt,
		)
		if err != nil {
			return nil, repositories.NewRepositoryError("get_by_price_range", "product", "", err)
		}
		products = append(products, product)
	}

	if err = rows.Err(); err != nil {
		return nil, repositories.NewRepositoryError("get_by_price_range", "product", "", err)
	}

	return products, nil
}

// GetPopularProducts retrieves products ordered by frequency of use in receipts
func (r *ProductRepository) GetPopularProducts(ctx context.Context, limit int) ([]*models.Product, error) {
	query := `
		SELECT p.id, p.name, p.description, p.category, p.unit_price,
			   p.gst_applicable, p.active, p.created_at, p.updated_at
		FROM products p
		LEFT JOIN line_items li ON p.id = li.product_id
		GROUP BY p.id
		ORDER BY COUNT(li.id) DESC, p.name ASC
		LIMIT ?`

	rows, err := r.executeQuery(ctx, "get_popular", query, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var products []*models.Product
	for rows.Next() {
		product := &models.Product{}
		err := rows.Scan(
			&product.ID,
			&product.Name,
			&product.Description,
			&product.Category,
			&product.UnitPrice,
			&product.GSTApplicable,
			&product.Active,
			&product.CreatedAt,
			&product.UpdatedAt,
		)
		if err != nil {
			return nil, repositories.NewRepositoryError("get_popular", "product", "", err)
		}
		products = append(products, product)
	}

	if err = rows.Err(); err != nil {
		return nil, repositories.NewRepositoryError("get_popular", "product", "", err)
	}

	return products, nil
}

// GetRecentProducts retrieves products created within the specified duration
func (r *ProductRepository) GetRecentProducts(ctx context.Context, since time.Duration) ([]*models.Product, error) {
	cutoffTime := time.Now().Add(-since)

	query := `
		SELECT id, name, description, category, unit_price,
			   gst_applicable, active, created_at, updated_at
		FROM products 
		WHERE created_at >= ?
		ORDER BY created_at DESC`

	rows, err := r.executeQuery(ctx, "get_recent", query, cutoffTime)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var products []*models.Product
	for rows.Next() {
		product := &models.Product{}
		err := rows.Scan(
			&product.ID,
			&product.Name,
			&product.Description,
			&product.Category,
			&product.UnitPrice,
			&product.GSTApplicable,
			&product.Active,
			&product.CreatedAt,
			&product.UpdatedAt,
		)
		if err != nil {
			return nil, repositories.NewRepositoryError("get_recent", "product", "", err)
		}
		products = append(products, product)
	}

	if err = rows.Err(); err != nil {
		return nil, repositories.NewRepositoryError("get_recent", "product", "", err)
	}

	return products, nil
}

// AutocompleteByName provides autocomplete suggestions for product names
func (r *ProductRepository) AutocompleteByName(ctx context.Context, prefix string, limit int) ([]*models.Product, error) {
	if strings.TrimSpace(prefix) == "" {
		return []*models.Product{}, nil
	}

	query := `
		SELECT id, name, description, category, unit_price,
			   gst_applicable, active, created_at, updated_at
		FROM products 
		WHERE name LIKE ? AND active = true
		ORDER BY name ASC
		LIMIT ?`

	searchPattern := prefix + "%"
	rows, err := r.executeQuery(ctx, "autocomplete", query, searchPattern, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var products []*models.Product
	for rows.Next() {
		product := &models.Product{}
		err := rows.Scan(
			&product.ID,
			&product.Name,
			&product.Description,
			&product.Category,
			&product.UnitPrice,
			&product.GSTApplicable,
			&product.Active,
			&product.CreatedAt,
			&product.UpdatedAt,
		)
		if err != nil {
			return nil, repositories.NewRepositoryError("autocomplete", "product", "", err)
		}
		products = append(products, product)
	}

	if err = rows.Err(); err != nil {
		return nil, repositories.NewRepositoryError("autocomplete", "product", "", err)
	}

	return products, nil
}

// GetCategorySummary returns product count by category
func (r *ProductRepository) GetCategorySummary(ctx context.Context) (map[string]int64, error) {
	query := `
		SELECT category, COUNT(*) as count
		FROM products
		WHERE active = true
		GROUP BY category
		ORDER BY category ASC`

	rows, err := r.executeQuery(ctx, "get_category_summary", query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	summary := make(map[string]int64)
	for rows.Next() {
		var category string
		var count int64
		err := rows.Scan(&category, &count)
		if err != nil {
			return nil, repositories.NewRepositoryError("get_category_summary", "product", "", err)
		}
		summary[category] = count
	}

	if err = rows.Err(); err != nil {
		return nil, repositories.NewRepositoryError("get_category_summary", "product", "", err)
	}

	return summary, nil
}
