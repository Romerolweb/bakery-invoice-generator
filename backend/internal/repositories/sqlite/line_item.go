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

// LineItemRepository implements the LineItemRepository interface for SQLite
type LineItemRepository struct {
	*BaseRepository[models.LineItem]
}

// NewLineItemRepository creates a new SQLite line item repository
func NewLineItemRepository(db *sql.DB, logger *logrus.Logger) repositories.LineItemRepository {
	return &LineItemRepository{
		BaseRepository: NewBaseRepository[models.LineItem](db, "line_items", logger),
	}
}

// Create creates a new line item
func (r *LineItemRepository) Create(ctx context.Context, lineItem *models.LineItem) error {
	if err := lineItem.Validate(); err != nil {
		return repositories.ValidationError("line_item", lineItem.ID, err)
	}

	query := `
		INSERT INTO line_items (
			id, receipt_id, product_id, product_name, description, quantity,
			unit_price, line_total, gst_applicable, sort_order
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`

	_, err := r.executeExec(ctx, "create", query,
		lineItem.ID,
		lineItem.ReceiptID,
		lineItem.ProductID,
		lineItem.ProductName,
		lineItem.Description,
		lineItem.Quantity,
		lineItem.UnitPrice,
		lineItem.LineTotal,
		lineItem.GSTApplicable,
		lineItem.SortOrder,
	)

	if err != nil {
		if strings.Contains(err.Error(), "UNIQUE constraint failed") {
			return repositories.DuplicateError("line_item", "id", lineItem.ID)
		}
		return err
	}

	return nil
}

// GetByID retrieves a line item by ID
func (r *LineItemRepository) GetByID(ctx context.Context, id string) (*models.LineItem, error) {
	if err := r.validateID(id); err != nil {
		return nil, err
	}

	query := `
		SELECT id, receipt_id, product_id, product_name, description, quantity,
			   unit_price, line_total, gst_applicable, sort_order
		FROM line_items 
		WHERE id = ?`

	row := r.executeQueryRow(ctx, "get_by_id", query, id)

	lineItem := &models.LineItem{}
	err := row.Scan(
		&lineItem.ID,
		&lineItem.ReceiptID,
		&lineItem.ProductID,
		&lineItem.ProductName,
		&lineItem.Description,
		&lineItem.Quantity,
		&lineItem.UnitPrice,
		&lineItem.LineTotal,
		&lineItem.GSTApplicable,
		&lineItem.SortOrder,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			return nil, repositories.NotFoundError("line_item", id)
		}
		return nil, repositories.NewRepositoryError("get_by_id", "line_item", id, err)
	}

	return lineItem, nil
}

// Update updates an existing line item
func (r *LineItemRepository) Update(ctx context.Context, lineItem *models.LineItem) error {
	if err := lineItem.Validate(); err != nil {
		return repositories.ValidationError("line_item", lineItem.ID, err)
	}

	query := `
		UPDATE line_items 
		SET receipt_id = ?, product_id = ?, product_name = ?, description = ?, quantity = ?,
			unit_price = ?, line_total = ?, gst_applicable = ?, sort_order = ?
		WHERE id = ?`

	result, err := r.executeExec(ctx, "update", query,
		lineItem.ReceiptID,
		lineItem.ProductID,
		lineItem.ProductName,
		lineItem.Description,
		lineItem.Quantity,
		lineItem.UnitPrice,
		lineItem.LineTotal,
		lineItem.GSTApplicable,
		lineItem.SortOrder,
		lineItem.ID,
	)

	if err != nil {
		return err
	}

	return r.checkRowsAffected(result, "update", lineItem.ID)
}

// Delete deletes a line item by ID
func (r *LineItemRepository) Delete(ctx context.Context, id string) error {
	if err := r.validateID(id); err != nil {
		return err
	}

	query := "DELETE FROM line_items WHERE id = ?"
	result, err := r.executeExec(ctx, "delete", query, id)
	if err != nil {
		return err
	}

	return r.checkRowsAffected(result, "delete", id)
}

// List retrieves line items with optional filters
func (r *LineItemRepository) List(ctx context.Context, filters map[string]interface{}) ([]*models.LineItem, error) {
	query := `
		SELECT id, receipt_id, product_id, product_name, description, quantity,
			   unit_price, line_total, gst_applicable, sort_order
		FROM line_items`

	whereClause, args := r.buildWhereClause(filters)
	if whereClause != "" {
		query += " " + whereClause
	}

	query += " ORDER BY sort_order ASC, id ASC"

	rows, err := r.executeQuery(ctx, "list", query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var lineItems []*models.LineItem
	for rows.Next() {
		lineItem := &models.LineItem{}
		err := rows.Scan(
			&lineItem.ID,
			&lineItem.ReceiptID,
			&lineItem.ProductID,
			&lineItem.ProductName,
			&lineItem.Description,
			&lineItem.Quantity,
			&lineItem.UnitPrice,
			&lineItem.LineTotal,
			&lineItem.GSTApplicable,
			&lineItem.SortOrder,
		)
		if err != nil {
			return nil, repositories.NewRepositoryError("list", "line_item", "", err)
		}
		lineItems = append(lineItems, lineItem)
	}

	if err = rows.Err(); err != nil {
		return nil, repositories.NewRepositoryError("list", "line_item", "", err)
	}

	return lineItems, nil
}

// Count returns the total number of line items matching the filters
func (r *LineItemRepository) Count(ctx context.Context, filters map[string]interface{}) (int64, error) {
	query := "SELECT COUNT(*) FROM line_items"

	whereClause, args := r.buildWhereClause(filters)
	if whereClause != "" {
		query += " " + whereClause
	}

	row := r.executeQueryRow(ctx, "count", query, args...)

	var count int64
	err := row.Scan(&count)
	if err != nil {
		return 0, repositories.NewRepositoryError("count", "line_item", "", err)
	}

	return count, nil
}

// GetByReceiptID retrieves all line items for a specific receipt
func (r *LineItemRepository) GetByReceiptID(ctx context.Context, receiptID string) ([]*models.LineItem, error) {
	if err := r.validateID(receiptID); err != nil {
		return nil, err
	}

	query := `
		SELECT id, receipt_id, product_id, product_name, description, quantity,
			   unit_price, line_total, gst_applicable, sort_order
		FROM line_items 
		WHERE receipt_id = ?
		ORDER BY sort_order ASC, id ASC`

	rows, err := r.executeQuery(ctx, "get_by_receipt", query, receiptID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var lineItems []*models.LineItem
	for rows.Next() {
		lineItem := &models.LineItem{}
		err := rows.Scan(
			&lineItem.ID,
			&lineItem.ReceiptID,
			&lineItem.ProductID,
			&lineItem.ProductName,
			&lineItem.Description,
			&lineItem.Quantity,
			&lineItem.UnitPrice,
			&lineItem.LineTotal,
			&lineItem.GSTApplicable,
			&lineItem.SortOrder,
		)
		if err != nil {
			return nil, repositories.NewRepositoryError("get_by_receipt", "line_item", "", err)
		}
		lineItems = append(lineItems, lineItem)
	}

	if err = rows.Err(); err != nil {
		return nil, repositories.NewRepositoryError("get_by_receipt", "line_item", "", err)
	}

	return lineItems, nil
}

// GetByProductID retrieves all line items for a specific product
func (r *LineItemRepository) GetByProductID(ctx context.Context, productID string) ([]*models.LineItem, error) {
	if err := r.validateID(productID); err != nil {
		return nil, err
	}

	query := `
		SELECT id, receipt_id, product_id, product_name, description, quantity,
			   unit_price, line_total, gst_applicable, sort_order
		FROM line_items 
		WHERE product_id = ?
		ORDER BY receipt_id ASC, sort_order ASC`

	rows, err := r.executeQuery(ctx, "get_by_product", query, productID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var lineItems []*models.LineItem
	for rows.Next() {
		lineItem := &models.LineItem{}
		err := rows.Scan(
			&lineItem.ID,
			&lineItem.ReceiptID,
			&lineItem.ProductID,
			&lineItem.ProductName,
			&lineItem.Description,
			&lineItem.Quantity,
			&lineItem.UnitPrice,
			&lineItem.LineTotal,
			&lineItem.GSTApplicable,
			&lineItem.SortOrder,
		)
		if err != nil {
			return nil, repositories.NewRepositoryError("get_by_product", "line_item", "", err)
		}
		lineItems = append(lineItems, lineItem)
	}

	if err = rows.Err(); err != nil {
		return nil, repositories.NewRepositoryError("get_by_product", "line_item", "", err)
	}

	return lineItems, nil
}

// DeleteByReceiptID deletes all line items for a specific receipt
func (r *LineItemRepository) DeleteByReceiptID(ctx context.Context, receiptID string) error {
	if err := r.validateID(receiptID); err != nil {
		return err
	}

	query := "DELETE FROM line_items WHERE receipt_id = ?"
	_, err := r.executeExec(ctx, "delete_by_receipt", query, receiptID)
	if err != nil {
		return err
	}

	// Note: We don't check rows affected here because it's valid to have zero line items
	return nil
}

// GetProductSales retrieves sales data for products within date range
func (r *LineItemRepository) GetProductSales(ctx context.Context, startDate, endDate time.Time) ([]*repositories.ProductSales, error) {
	query := `
		SELECT 
			li.product_id,
			li.product_name,
			COALESCE(p.category, 'unknown') as category,
			SUM(li.quantity) as quantity_sold,
			SUM(li.line_total) as revenue,
			COUNT(DISTINCT li.receipt_id) as times_ordered
		FROM line_items li
		JOIN receipts r ON li.receipt_id = r.receipt_id
		LEFT JOIN products p ON li.product_id = p.id
		WHERE r.date_of_purchase >= ? AND r.date_of_purchase <= ?
		GROUP BY li.product_id, li.product_name, p.category
		ORDER BY revenue DESC`

	rows, err := r.executeQuery(ctx, "get_product_sales", query, startDate, endDate)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var productSales []*repositories.ProductSales
	for rows.Next() {
		sales := &repositories.ProductSales{}
		err := rows.Scan(
			&sales.ProductID,
			&sales.ProductName,
			&sales.Category,
			&sales.QuantitySold,
			&sales.Revenue,
			&sales.TimesOrdered,
		)
		if err != nil {
			return nil, repositories.NewRepositoryError("get_product_sales", "line_item", "", err)
		}
		productSales = append(productSales, sales)
	}

	if err = rows.Err(); err != nil {
		return nil, repositories.NewRepositoryError("get_product_sales", "line_item", "", err)
	}

	return productSales, nil
}

// GetTopSellingProducts retrieves products ordered by quantity sold
func (r *LineItemRepository) GetTopSellingProducts(ctx context.Context, limit int, startDate, endDate time.Time) ([]*repositories.ProductSales, error) {
	query := `
		SELECT 
			li.product_id,
			li.product_name,
			COALESCE(p.category, 'unknown') as category,
			SUM(li.quantity) as quantity_sold,
			SUM(li.line_total) as revenue,
			COUNT(DISTINCT li.receipt_id) as times_ordered
		FROM line_items li
		JOIN receipts r ON li.receipt_id = r.receipt_id
		LEFT JOIN products p ON li.product_id = p.id
		WHERE r.date_of_purchase >= ? AND r.date_of_purchase <= ?
		GROUP BY li.product_id, li.product_name, p.category
		ORDER BY quantity_sold DESC, revenue DESC
		LIMIT ?`

	rows, err := r.executeQuery(ctx, "get_top_selling", query, startDate, endDate, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var productSales []*repositories.ProductSales
	for rows.Next() {
		sales := &repositories.ProductSales{}
		err := rows.Scan(
			&sales.ProductID,
			&sales.ProductName,
			&sales.Category,
			&sales.QuantitySold,
			&sales.Revenue,
			&sales.TimesOrdered,
		)
		if err != nil {
			return nil, repositories.NewRepositoryError("get_top_selling", "line_item", "", err)
		}
		productSales = append(productSales, sales)
	}

	if err = rows.Err(); err != nil {
		return nil, repositories.NewRepositoryError("get_top_selling", "line_item", "", err)
	}

	return productSales, nil
}

// GetProductRevenueReport generates revenue report by product
func (r *LineItemRepository) GetProductRevenueReport(ctx context.Context, startDate, endDate time.Time) ([]*repositories.ProductRevenue, error) {
	query := `
		SELECT 
			li.product_id,
			li.product_name,
			COALESCE(p.category, 'unknown') as category,
			SUM(li.line_total) as total_revenue,
			SUM(CASE WHEN li.gst_applicable = true AND r.gst_charged = true 
				THEN li.line_total * 0.10 ELSE 0 END) as total_gst,
			SUM(li.quantity) as quantity_sold,
			AVG(li.unit_price) as average_price
		FROM line_items li
		JOIN receipts r ON li.receipt_id = r.receipt_id
		LEFT JOIN products p ON li.product_id = p.id
		WHERE r.date_of_purchase >= ? AND r.date_of_purchase <= ?
		GROUP BY li.product_id, li.product_name, p.category
		ORDER BY total_revenue DESC`

	rows, err := r.executeQuery(ctx, "get_product_revenue", query, startDate, endDate)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var productRevenue []*repositories.ProductRevenue
	for rows.Next() {
		revenue := &repositories.ProductRevenue{}
		err := rows.Scan(
			&revenue.ProductID,
			&revenue.ProductName,
			&revenue.Category,
			&revenue.TotalRevenue,
			&revenue.TotalGST,
			&revenue.QuantitySold,
			&revenue.AveragePrice,
		)
		if err != nil {
			return nil, repositories.NewRepositoryError("get_product_revenue", "line_item", "", err)
		}
		productRevenue = append(productRevenue, revenue)
	}

	if err = rows.Err(); err != nil {
		return nil, repositories.NewRepositoryError("get_product_revenue", "line_item", "", err)
	}

	return productRevenue, nil
}
