package sqlite

import (
	"context"
	"database/sql"
	"strings"

	"bakery-invoice-api/internal/models"
	"bakery-invoice-api/internal/repositories"

	"github.com/sirupsen/logrus"
)

// ProductCategoryRepository implements the ProductCategoryRepository interface for SQLite
type ProductCategoryRepository struct {
	*BaseRepository[models.ProductCategory]
}

// NewProductCategoryRepository creates a new SQLite product category repository
func NewProductCategoryRepository(db *sql.DB, logger *logrus.Logger) repositories.ProductCategoryRepository {
	return &ProductCategoryRepository{
		BaseRepository: NewBaseRepository[models.ProductCategory](db, "product_categories", logger),
	}
}

// Create creates a new product category
func (r *ProductCategoryRepository) Create(ctx context.Context, category *models.ProductCategory) error {
	if err := category.Validate(); err != nil {
		return repositories.ValidationError("product_category", category.ID, err)
	}

	query := `
		INSERT INTO product_categories (id, name, description, sort_order)
		VALUES (?, ?, ?, ?)`

	_, err := r.executeExec(ctx, "create", query,
		category.ID,
		category.Name,
		category.Description,
		category.SortOrder,
	)

	if err != nil {
		if strings.Contains(err.Error(), "UNIQUE constraint failed") {
			return repositories.DuplicateError("product_category", "name", category.Name)
		}
		return err
	}

	return nil
}

// GetByID retrieves a product category by ID
func (r *ProductCategoryRepository) GetByID(ctx context.Context, id string) (*models.ProductCategory, error) {
	if err := r.validateID(id); err != nil {
		return nil, err
	}

	query := `
		SELECT id, name, description, sort_order
		FROM product_categories 
		WHERE id = ?`

	row := r.executeQueryRow(ctx, "get_by_id", query, id)

	category := &models.ProductCategory{}
	err := row.Scan(
		&category.ID,
		&category.Name,
		&category.Description,
		&category.SortOrder,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			return nil, repositories.NotFoundError("product_category", id)
		}
		return nil, repositories.NewRepositoryError("get_by_id", "product_category", id, err)
	}

	return category, nil
}

// Update updates an existing product category
func (r *ProductCategoryRepository) Update(ctx context.Context, category *models.ProductCategory) error {
	if err := category.Validate(); err != nil {
		return repositories.ValidationError("product_category", category.ID, err)
	}

	query := `
		UPDATE product_categories 
		SET name = ?, description = ?, sort_order = ?
		WHERE id = ?`

	result, err := r.executeExec(ctx, "update", query,
		category.Name,
		category.Description,
		category.SortOrder,
		category.ID,
	)

	if err != nil {
		return err
	}

	return r.checkRowsAffected(result, "update", category.ID)
}

// Delete deletes a product category by ID
func (r *ProductCategoryRepository) Delete(ctx context.Context, id string) error {
	if err := r.validateID(id); err != nil {
		return err
	}

	query := "DELETE FROM product_categories WHERE id = ?"
	result, err := r.executeExec(ctx, "delete", query, id)
	if err != nil {
		return err
	}

	return r.checkRowsAffected(result, "delete", id)
}

// List retrieves product categories with optional filters
func (r *ProductCategoryRepository) List(ctx context.Context, filters map[string]interface{}) ([]*models.ProductCategory, error) {
	query := `
		SELECT id, name, description, sort_order
		FROM product_categories`

	whereClause, args := r.buildWhereClause(filters)
	if whereClause != "" {
		query += " " + whereClause
	}

	query += " ORDER BY sort_order ASC, name ASC"

	rows, err := r.executeQuery(ctx, "list", query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var categories []*models.ProductCategory
	for rows.Next() {
		category := &models.ProductCategory{}
		err := rows.Scan(
			&category.ID,
			&category.Name,
			&category.Description,
			&category.SortOrder,
		)
		if err != nil {
			return nil, repositories.NewRepositoryError("list", "product_category", "", err)
		}
		categories = append(categories, category)
	}

	if err = rows.Err(); err != nil {
		return nil, repositories.NewRepositoryError("list", "product_category", "", err)
	}

	return categories, nil
}

// Count returns the total number of product categories matching the filters
func (r *ProductCategoryRepository) Count(ctx context.Context, filters map[string]interface{}) (int64, error) {
	query := "SELECT COUNT(*) FROM product_categories"

	whereClause, args := r.buildWhereClause(filters)
	if whereClause != "" {
		query += " " + whereClause
	}

	row := r.executeQueryRow(ctx, "count", query, args...)

	var count int64
	err := row.Scan(&count)
	if err != nil {
		return 0, repositories.NewRepositoryError("count", "product_category", "", err)
	}

	return count, nil
}

// GetByName retrieves a category by name
func (r *ProductCategoryRepository) GetByName(ctx context.Context, name string) (*models.ProductCategory, error) {
	if strings.TrimSpace(name) == "" {
		return nil, repositories.NewRepositoryError("get_by_name", "product_category", "", repositories.ErrInvalidID)
	}

	query := `
		SELECT id, name, description, sort_order
		FROM product_categories 
		WHERE name = ?`

	row := r.executeQueryRow(ctx, "get_by_name", query, name)

	category := &models.ProductCategory{}
	err := row.Scan(
		&category.ID,
		&category.Name,
		&category.Description,
		&category.SortOrder,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			return nil, repositories.NotFoundError("product_category", name)
		}
		return nil, repositories.NewRepositoryError("get_by_name", "product_category", name, err)
	}

	return category, nil
}

// GetOrderedBySort retrieves categories ordered by sort order
func (r *ProductCategoryRepository) GetOrderedBySort(ctx context.Context) ([]*models.ProductCategory, error) {
	query := `
		SELECT id, name, description, sort_order
		FROM product_categories 
		ORDER BY sort_order ASC, name ASC`

	rows, err := r.executeQuery(ctx, "get_ordered", query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var categories []*models.ProductCategory
	for rows.Next() {
		category := &models.ProductCategory{}
		err := rows.Scan(
			&category.ID,
			&category.Name,
			&category.Description,
			&category.SortOrder,
		)
		if err != nil {
			return nil, repositories.NewRepositoryError("get_ordered", "product_category", "", err)
		}
		categories = append(categories, category)
	}

	if err = rows.Err(); err != nil {
		return nil, repositories.NewRepositoryError("get_ordered", "product_category", "", err)
	}

	return categories, nil
}

// GetCategoriesWithProductCount retrieves categories with product counts
func (r *ProductCategoryRepository) GetCategoriesWithProductCount(ctx context.Context) ([]*repositories.CategoryWithCount, error) {
	query := `
		SELECT pc.id, pc.name, pc.description, pc.sort_order, COUNT(p.id) as product_count
		FROM product_categories pc
		LEFT JOIN products p ON pc.name = p.category AND p.active = true
		GROUP BY pc.id, pc.name, pc.description, pc.sort_order
		ORDER BY pc.sort_order ASC, pc.name ASC`

	rows, err := r.executeQuery(ctx, "get_with_count", query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var categoriesWithCount []*repositories.CategoryWithCount
	for rows.Next() {
		categoryWithCount := &repositories.CategoryWithCount{
			ProductCategory: &models.ProductCategory{},
		}
		err := rows.Scan(
			&categoryWithCount.ProductCategory.ID,
			&categoryWithCount.ProductCategory.Name,
			&categoryWithCount.ProductCategory.Description,
			&categoryWithCount.ProductCategory.SortOrder,
			&categoryWithCount.ProductCount,
		)
		if err != nil {
			return nil, repositories.NewRepositoryError("get_with_count", "product_category", "", err)
		}
		categoriesWithCount = append(categoriesWithCount, categoryWithCount)
	}

	if err = rows.Err(); err != nil {
		return nil, repositories.NewRepositoryError("get_with_count", "product_category", "", err)
	}

	return categoriesWithCount, nil
}

// UpdateSortOrder updates the sort order for multiple categories
func (r *ProductCategoryRepository) UpdateSortOrder(ctx context.Context, categoryOrders map[string]int) error {
	if len(categoryOrders) == 0 {
		return nil
	}

	// Start a transaction for batch updates
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return repositories.TransactionError("begin", err)
	}
	defer tx.Rollback()

	query := "UPDATE product_categories SET sort_order = ? WHERE id = ?"
	stmt, err := tx.PrepareContext(ctx, query)
	if err != nil {
		return repositories.NewRepositoryError("prepare_update_sort", "product_category", "", err)
	}
	defer stmt.Close()

	for categoryID, sortOrder := range categoryOrders {
		_, err := stmt.ExecContext(ctx, sortOrder, categoryID)
		if err != nil {
			return repositories.NewRepositoryError("update_sort_order", "product_category", categoryID, err)
		}
	}

	if err := tx.Commit(); err != nil {
		return repositories.TransactionError("commit", err)
	}

	return nil
}
