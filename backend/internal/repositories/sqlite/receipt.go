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

// ReceiptRepository implements the ReceiptRepository interface for SQLite
type ReceiptRepository struct {
	*BaseRepository[models.Receipt]
}

// NewReceiptRepository creates a new SQLite receipt repository
func NewReceiptRepository(db *sql.DB, logger *logrus.Logger) repositories.ReceiptRepository {
	return &ReceiptRepository{
		BaseRepository: NewBaseRepository[models.Receipt](db, "receipts", logger),
	}
}

// Create creates a new receipt
func (r *ReceiptRepository) Create(ctx context.Context, receipt *models.Receipt) error {
	if err := receipt.Validate(); err != nil {
		return repositories.ValidationError("receipt", receipt.ReceiptID, err)
	}

	query := `
		INSERT INTO receipts (
			receipt_id, customer_id, date_of_purchase, subtotal_excl_gst, gst_amount,
			total_inc_gst, is_tax_invoice, gst_charged, payment_method, notes,
			seller_profile_snapshot, customer_snapshot, created_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`

	_, err := r.executeExec(ctx, "create", query,
		receipt.ReceiptID,
		receipt.CustomerID,
		receipt.DateOfPurchase,
		receipt.SubtotalExclGST,
		receipt.GSTAmount,
		receipt.TotalIncGST,
		receipt.IsTaxInvoice,
		receipt.GSTCharged,
		receipt.PaymentMethod,
		receipt.Notes,
		receipt.SellerProfileSnapshot,
		receipt.CustomerSnapshot,
		receipt.CreatedAt,
	)

	if err != nil {
		if strings.Contains(err.Error(), "UNIQUE constraint failed") {
			return repositories.DuplicateError("receipt", "receipt_id", receipt.ReceiptID)
		}
		return err
	}

	return nil
}

// GetByID retrieves a receipt by ID
func (r *ReceiptRepository) GetByID(ctx context.Context, id string) (*models.Receipt, error) {
	if err := r.validateID(id); err != nil {
		return nil, err
	}

	query := `
		SELECT receipt_id, customer_id, date_of_purchase, subtotal_excl_gst, gst_amount,
			   total_inc_gst, is_tax_invoice, gst_charged, payment_method, notes,
			   seller_profile_snapshot, customer_snapshot, created_at
		FROM receipts 
		WHERE receipt_id = ?`

	row := r.executeQueryRow(ctx, "get_by_id", query, id)

	receipt := &models.Receipt{}
	err := row.Scan(
		&receipt.ReceiptID,
		&receipt.CustomerID,
		&receipt.DateOfPurchase,
		&receipt.SubtotalExclGST,
		&receipt.GSTAmount,
		&receipt.TotalIncGST,
		&receipt.IsTaxInvoice,
		&receipt.GSTCharged,
		&receipt.PaymentMethod,
		&receipt.Notes,
		&receipt.SellerProfileSnapshot,
		&receipt.CustomerSnapshot,
		&receipt.CreatedAt,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			return nil, repositories.NotFoundError("receipt", id)
		}
		return nil, repositories.NewRepositoryError("get_by_id", "receipt", id, err)
	}

	return receipt, nil
}

// Update updates an existing receipt
func (r *ReceiptRepository) Update(ctx context.Context, receipt *models.Receipt) error {
	if err := receipt.Validate(); err != nil {
		return repositories.ValidationError("receipt", receipt.ReceiptID, err)
	}

	query := `
		UPDATE receipts 
		SET customer_id = ?, date_of_purchase = ?, subtotal_excl_gst = ?, gst_amount = ?,
			total_inc_gst = ?, is_tax_invoice = ?, gst_charged = ?, payment_method = ?, 
			notes = ?, seller_profile_snapshot = ?, customer_snapshot = ?
		WHERE receipt_id = ?`

	result, err := r.executeExec(ctx, "update", query,
		receipt.CustomerID,
		receipt.DateOfPurchase,
		receipt.SubtotalExclGST,
		receipt.GSTAmount,
		receipt.TotalIncGST,
		receipt.IsTaxInvoice,
		receipt.GSTCharged,
		receipt.PaymentMethod,
		receipt.Notes,
		receipt.SellerProfileSnapshot,
		receipt.CustomerSnapshot,
		receipt.ReceiptID,
	)

	if err != nil {
		return err
	}

	return r.checkRowsAffected(result, "update", receipt.ReceiptID)
}

// Delete deletes a receipt by ID
func (r *ReceiptRepository) Delete(ctx context.Context, id string) error {
	if err := r.validateID(id); err != nil {
		return err
	}

	query := "DELETE FROM receipts WHERE receipt_id = ?"
	result, err := r.executeExec(ctx, "delete", query, id)
	if err != nil {
		return err
	}

	return r.checkRowsAffected(result, "delete", id)
}

// List retrieves receipts with optional filters
func (r *ReceiptRepository) List(ctx context.Context, filters map[string]interface{}) ([]*models.Receipt, error) {
	query := `
		SELECT receipt_id, customer_id, date_of_purchase, subtotal_excl_gst, gst_amount,
			   total_inc_gst, is_tax_invoice, gst_charged, payment_method, notes,
			   seller_profile_snapshot, customer_snapshot, created_at
		FROM receipts`

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

	var receipts []*models.Receipt
	for rows.Next() {
		receipt := &models.Receipt{}
		err := rows.Scan(
			&receipt.ReceiptID,
			&receipt.CustomerID,
			&receipt.DateOfPurchase,
			&receipt.SubtotalExclGST,
			&receipt.GSTAmount,
			&receipt.TotalIncGST,
			&receipt.IsTaxInvoice,
			&receipt.GSTCharged,
			&receipt.PaymentMethod,
			&receipt.Notes,
			&receipt.SellerProfileSnapshot,
			&receipt.CustomerSnapshot,
			&receipt.CreatedAt,
		)
		if err != nil {
			return nil, repositories.NewRepositoryError("list", "receipt", "", err)
		}
		receipts = append(receipts, receipt)
	}

	if err = rows.Err(); err != nil {
		return nil, repositories.NewRepositoryError("list", "receipt", "", err)
	}

	return receipts, nil
}

// Count returns the total number of receipts matching the filters
func (r *ReceiptRepository) Count(ctx context.Context, filters map[string]interface{}) (int64, error) {
	query := "SELECT COUNT(*) FROM receipts"

	whereClause, args := r.buildWhereClause(filters)
	if whereClause != "" {
		query += " " + whereClause
	}

	row := r.executeQueryRow(ctx, "count", query, args...)

	var count int64
	err := row.Scan(&count)
	if err != nil {
		return 0, repositories.NewRepositoryError("count", "receipt", "", err)
	}

	return count, nil
}

// GetByCustomerID retrieves receipts for a specific customer
func (r *ReceiptRepository) GetByCustomerID(ctx context.Context, customerID string) ([]*models.Receipt, error) {
	if err := r.validateID(customerID); err != nil {
		return nil, err
	}

	query := `
		SELECT receipt_id, customer_id, date_of_purchase, subtotal_excl_gst, gst_amount,
			   total_inc_gst, is_tax_invoice, gst_charged, payment_method, notes,
			   seller_profile_snapshot, customer_snapshot, created_at
		FROM receipts 
		WHERE customer_id = ?
		ORDER BY created_at DESC`

	rows, err := r.executeQuery(ctx, "get_by_customer", query, customerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var receipts []*models.Receipt
	for rows.Next() {
		receipt := &models.Receipt{}
		err := rows.Scan(
			&receipt.ReceiptID,
			&receipt.CustomerID,
			&receipt.DateOfPurchase,
			&receipt.SubtotalExclGST,
			&receipt.GSTAmount,
			&receipt.TotalIncGST,
			&receipt.IsTaxInvoice,
			&receipt.GSTCharged,
			&receipt.PaymentMethod,
			&receipt.Notes,
			&receipt.SellerProfileSnapshot,
			&receipt.CustomerSnapshot,
			&receipt.CreatedAt,
		)
		if err != nil {
			return nil, repositories.NewRepositoryError("get_by_customer", "receipt", "", err)
		}
		receipts = append(receipts, receipt)
	}

	if err = rows.Err(); err != nil {
		return nil, repositories.NewRepositoryError("get_by_customer", "receipt", "", err)
	}

	return receipts, nil
}

// GetByDateRange retrieves receipts within a date range
func (r *ReceiptRepository) GetByDateRange(ctx context.Context, startDate, endDate time.Time) ([]*models.Receipt, error) {
	query := `
		SELECT receipt_id, customer_id, date_of_purchase, subtotal_excl_gst, gst_amount,
			   total_inc_gst, is_tax_invoice, gst_charged, payment_method, notes,
			   seller_profile_snapshot, customer_snapshot, created_at
		FROM receipts 
		WHERE date_of_purchase >= ? AND date_of_purchase <= ?
		ORDER BY date_of_purchase DESC`

	rows, err := r.executeQuery(ctx, "get_by_date_range", query, startDate, endDate)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var receipts []*models.Receipt
	for rows.Next() {
		receipt := &models.Receipt{}
		err := rows.Scan(
			&receipt.ReceiptID,
			&receipt.CustomerID,
			&receipt.DateOfPurchase,
			&receipt.SubtotalExclGST,
			&receipt.GSTAmount,
			&receipt.TotalIncGST,
			&receipt.IsTaxInvoice,
			&receipt.GSTCharged,
			&receipt.PaymentMethod,
			&receipt.Notes,
			&receipt.SellerProfileSnapshot,
			&receipt.CustomerSnapshot,
			&receipt.CreatedAt,
		)
		if err != nil {
			return nil, repositories.NewRepositoryError("get_by_date_range", "receipt", "", err)
		}
		receipts = append(receipts, receipt)
	}

	if err = rows.Err(); err != nil {
		return nil, repositories.NewRepositoryError("get_by_date_range", "receipt", "", err)
	}

	return receipts, nil
}

// GetByPaymentMethod retrieves receipts by payment method
func (r *ReceiptRepository) GetByPaymentMethod(ctx context.Context, paymentMethod models.PaymentMethod) ([]*models.Receipt, error) {
	query := `
		SELECT receipt_id, customer_id, date_of_purchase, subtotal_excl_gst, gst_amount,
			   total_inc_gst, is_tax_invoice, gst_charged, payment_method, notes,
			   seller_profile_snapshot, customer_snapshot, created_at
		FROM receipts 
		WHERE payment_method = ?
		ORDER BY created_at DESC`

	rows, err := r.executeQuery(ctx, "get_by_payment_method", query, paymentMethod)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var receipts []*models.Receipt
	for rows.Next() {
		receipt := &models.Receipt{}
		err := rows.Scan(
			&receipt.ReceiptID,
			&receipt.CustomerID,
			&receipt.DateOfPurchase,
			&receipt.SubtotalExclGST,
			&receipt.GSTAmount,
			&receipt.TotalIncGST,
			&receipt.IsTaxInvoice,
			&receipt.GSTCharged,
			&receipt.PaymentMethod,
			&receipt.Notes,
			&receipt.SellerProfileSnapshot,
			&receipt.CustomerSnapshot,
			&receipt.CreatedAt,
		)
		if err != nil {
			return nil, repositories.NewRepositoryError("get_by_payment_method", "receipt", "", err)
		}
		receipts = append(receipts, receipt)
	}

	if err = rows.Err(); err != nil {
		return nil, repositories.NewRepositoryError("get_by_payment_method", "receipt", "", err)
	}

	return receipts, nil
}

// GetTaxInvoices retrieves all receipts that are tax invoices
func (r *ReceiptRepository) GetTaxInvoices(ctx context.Context) ([]*models.Receipt, error) {
	query := `
		SELECT receipt_id, customer_id, date_of_purchase, subtotal_excl_gst, gst_amount,
			   total_inc_gst, is_tax_invoice, gst_charged, payment_method, notes,
			   seller_profile_snapshot, customer_snapshot, created_at
		FROM receipts 
		WHERE is_tax_invoice = true
		ORDER BY created_at DESC`

	rows, err := r.executeQuery(ctx, "get_tax_invoices", query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var receipts []*models.Receipt
	for rows.Next() {
		receipt := &models.Receipt{}
		err := rows.Scan(
			&receipt.ReceiptID,
			&receipt.CustomerID,
			&receipt.DateOfPurchase,
			&receipt.SubtotalExclGST,
			&receipt.GSTAmount,
			&receipt.TotalIncGST,
			&receipt.IsTaxInvoice,
			&receipt.GSTCharged,
			&receipt.PaymentMethod,
			&receipt.Notes,
			&receipt.SellerProfileSnapshot,
			&receipt.CustomerSnapshot,
			&receipt.CreatedAt,
		)
		if err != nil {
			return nil, repositories.NewRepositoryError("get_tax_invoices", "receipt", "", err)
		}
		receipts = append(receipts, receipt)
	}

	if err = rows.Err(); err != nil {
		return nil, repositories.NewRepositoryError("get_tax_invoices", "receipt", "", err)
	}

	return receipts, nil
}

// GetReceiptsWithGST retrieves receipts where GST was charged
func (r *ReceiptRepository) GetReceiptsWithGST(ctx context.Context) ([]*models.Receipt, error) {
	query := `
		SELECT receipt_id, customer_id, date_of_purchase, subtotal_excl_gst, gst_amount,
			   total_inc_gst, is_tax_invoice, gst_charged, payment_method, notes,
			   seller_profile_snapshot, customer_snapshot, created_at
		FROM receipts 
		WHERE gst_charged = true
		ORDER BY created_at DESC`

	rows, err := r.executeQuery(ctx, "get_with_gst", query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var receipts []*models.Receipt
	for rows.Next() {
		receipt := &models.Receipt{}
		err := rows.Scan(
			&receipt.ReceiptID,
			&receipt.CustomerID,
			&receipt.DateOfPurchase,
			&receipt.SubtotalExclGST,
			&receipt.GSTAmount,
			&receipt.TotalIncGST,
			&receipt.IsTaxInvoice,
			&receipt.GSTCharged,
			&receipt.PaymentMethod,
			&receipt.Notes,
			&receipt.SellerProfileSnapshot,
			&receipt.CustomerSnapshot,
			&receipt.CreatedAt,
		)
		if err != nil {
			return nil, repositories.NewRepositoryError("get_with_gst", "receipt", "", err)
		}
		receipts = append(receipts, receipt)
	}

	if err = rows.Err(); err != nil {
		return nil, repositories.NewRepositoryError("get_with_gst", "receipt", "", err)
	}

	return receipts, nil
}

// GetReceiptsAboveAmount retrieves receipts with total above specified amount
func (r *ReceiptRepository) GetReceiptsAboveAmount(ctx context.Context, amount float64) ([]*models.Receipt, error) {
	query := `
		SELECT receipt_id, customer_id, date_of_purchase, subtotal_excl_gst, gst_amount,
			   total_inc_gst, is_tax_invoice, gst_charged, payment_method, notes,
			   seller_profile_snapshot, customer_snapshot, created_at
		FROM receipts 
		WHERE total_inc_gst > ?
		ORDER BY total_inc_gst DESC`

	rows, err := r.executeQuery(ctx, "get_above_amount", query, amount)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var receipts []*models.Receipt
	for rows.Next() {
		receipt := &models.Receipt{}
		err := rows.Scan(
			&receipt.ReceiptID,
			&receipt.CustomerID,
			&receipt.DateOfPurchase,
			&receipt.SubtotalExclGST,
			&receipt.GSTAmount,
			&receipt.TotalIncGST,
			&receipt.IsTaxInvoice,
			&receipt.GSTCharged,
			&receipt.PaymentMethod,
			&receipt.Notes,
			&receipt.SellerProfileSnapshot,
			&receipt.CustomerSnapshot,
			&receipt.CreatedAt,
		)
		if err != nil {
			return nil, repositories.NewRepositoryError("get_above_amount", "receipt", "", err)
		}
		receipts = append(receipts, receipt)
	}

	if err = rows.Err(); err != nil {
		return nil, repositories.NewRepositoryError("get_above_amount", "receipt", "", err)
	}

	return receipts, nil
}

// GetDailySales retrieves sales summary for a specific date
func (r *ReceiptRepository) GetDailySales(ctx context.Context, date time.Time) (*repositories.SalesSummary, error) {
	startOfDay := time.Date(date.Year(), date.Month(), date.Day(), 0, 0, 0, 0, date.Location())
	endOfDay := startOfDay.Add(24 * time.Hour).Add(-time.Nanosecond)

	return r.getSalesSummary(ctx, "daily", startOfDay, endOfDay)
}

// GetMonthlySales retrieves sales summary for a specific month
func (r *ReceiptRepository) GetMonthlySales(ctx context.Context, year int, month time.Month) (*repositories.SalesSummary, error) {
	startOfMonth := time.Date(year, month, 1, 0, 0, 0, 0, time.UTC)
	endOfMonth := startOfMonth.AddDate(0, 1, 0).Add(-time.Nanosecond)

	return r.getSalesSummary(ctx, "monthly", startOfMonth, endOfMonth)
}

// GetYearlySales retrieves sales summary for a specific year
func (r *ReceiptRepository) GetYearlySales(ctx context.Context, year int) (*repositories.SalesSummary, error) {
	startOfYear := time.Date(year, 1, 1, 0, 0, 0, 0, time.UTC)
	endOfYear := startOfYear.AddDate(1, 0, 0).Add(-time.Nanosecond)

	return r.getSalesSummary(ctx, "yearly", startOfYear, endOfYear)
}

// getSalesSummary is a helper method to get sales summary for a date range
func (r *ReceiptRepository) getSalesSummary(ctx context.Context, period string, startDate, endDate time.Time) (*repositories.SalesSummary, error) {
	query := `
		SELECT 
			COUNT(*) as total_receipts,
			COALESCE(SUM(total_inc_gst), 0) as total_revenue,
			COALESCE(SUM(gst_amount), 0) as total_gst,
			COALESCE(AVG(total_inc_gst), 0) as average_receipt,
			COUNT(CASE WHEN is_tax_invoice = true THEN 1 END) as tax_invoice_count
		FROM receipts 
		WHERE date_of_purchase >= ? AND date_of_purchase <= ?`

	row := r.executeQueryRow(ctx, "get_sales_summary", query, startDate, endDate)

	summary := &repositories.SalesSummary{
		Period:    period,
		StartDate: startDate,
		EndDate:   endDate,
	}

	err := row.Scan(
		&summary.TotalReceipts,
		&summary.TotalRevenue,
		&summary.TotalGST,
		&summary.AverageReceipt,
		&summary.TaxInvoiceCount,
	)

	if err != nil {
		return nil, repositories.NewRepositoryError("get_sales_summary", "receipt", "", err)
	}

	// Get payment method breakdown
	paymentQuery := `
		SELECT payment_method, COUNT(*) 
		FROM receipts 
		WHERE date_of_purchase >= ? AND date_of_purchase <= ?
		GROUP BY payment_method`

	rows, err := r.executeQuery(ctx, "get_payment_methods", paymentQuery, startDate, endDate)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	summary.PaymentMethods = make(map[models.PaymentMethod]int64)
	for rows.Next() {
		var method models.PaymentMethod
		var count int64
		err := rows.Scan(&method, &count)
		if err != nil {
			return nil, repositories.NewRepositoryError("get_payment_methods", "receipt", "", err)
		}
		summary.PaymentMethods[method] = count
	}

	if err = rows.Err(); err != nil {
		return nil, repositories.NewRepositoryError("get_payment_methods", "receipt", "", err)
	}

	return summary, nil
}

// GetSalesReport generates a comprehensive sales report for date range
func (r *ReceiptRepository) GetSalesReport(ctx context.Context, startDate, endDate time.Time) (*repositories.SalesReport, error) {
	// Get main summary
	summary, err := r.getSalesSummary(ctx, "custom", startDate, endDate)
	if err != nil {
		return nil, err
	}

	report := &repositories.SalesReport{
		Summary: summary,
	}

	// TODO: Implement additional report components (daily sales, top products, top customers, category sales)
	// This would require joins with line_items and products tables

	return report, nil
}

// GetRecentReceipts retrieves receipts created within the specified duration
func (r *ReceiptRepository) GetRecentReceipts(ctx context.Context, since time.Duration) ([]*models.Receipt, error) {
	cutoffTime := time.Now().Add(-since)

	query := `
		SELECT receipt_id, customer_id, date_of_purchase, subtotal_excl_gst, gst_amount,
			   total_inc_gst, is_tax_invoice, gst_charged, payment_method, notes,
			   seller_profile_snapshot, customer_snapshot, created_at
		FROM receipts 
		WHERE created_at >= ?
		ORDER BY created_at DESC`

	rows, err := r.executeQuery(ctx, "get_recent", query, cutoffTime)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var receipts []*models.Receipt
	for rows.Next() {
		receipt := &models.Receipt{}
		err := rows.Scan(
			&receipt.ReceiptID,
			&receipt.CustomerID,
			&receipt.DateOfPurchase,
			&receipt.SubtotalExclGST,
			&receipt.GSTAmount,
			&receipt.TotalIncGST,
			&receipt.IsTaxInvoice,
			&receipt.GSTCharged,
			&receipt.PaymentMethod,
			&receipt.Notes,
			&receipt.SellerProfileSnapshot,
			&receipt.CustomerSnapshot,
			&receipt.CreatedAt,
		)
		if err != nil {
			return nil, repositories.NewRepositoryError("get_recent", "receipt", "", err)
		}
		receipts = append(receipts, receipt)
	}

	if err = rows.Err(); err != nil {
		return nil, repositories.NewRepositoryError("get_recent", "receipt", "", err)
	}

	return receipts, nil
}

// GetReceiptsByCustomerWithDateRange retrieves customer receipts within date range
func (r *ReceiptRepository) GetReceiptsByCustomerWithDateRange(ctx context.Context, customerID string, startDate, endDate time.Time) ([]*models.Receipt, error) {
	if err := r.validateID(customerID); err != nil {
		return nil, err
	}

	query := `
		SELECT receipt_id, customer_id, date_of_purchase, subtotal_excl_gst, gst_amount,
			   total_inc_gst, is_tax_invoice, gst_charged, payment_method, notes,
			   seller_profile_snapshot, customer_snapshot, created_at
		FROM receipts 
		WHERE customer_id = ? AND date_of_purchase >= ? AND date_of_purchase <= ?
		ORDER BY date_of_purchase DESC`

	rows, err := r.executeQuery(ctx, "get_by_customer_date_range", query, customerID, startDate, endDate)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var receipts []*models.Receipt
	for rows.Next() {
		receipt := &models.Receipt{}
		err := rows.Scan(
			&receipt.ReceiptID,
			&receipt.CustomerID,
			&receipt.DateOfPurchase,
			&receipt.SubtotalExclGST,
			&receipt.GSTAmount,
			&receipt.TotalIncGST,
			&receipt.IsTaxInvoice,
			&receipt.GSTCharged,
			&receipt.PaymentMethod,
			&receipt.Notes,
			&receipt.SellerProfileSnapshot,
			&receipt.CustomerSnapshot,
			&receipt.CreatedAt,
		)
		if err != nil {
			return nil, repositories.NewRepositoryError("get_by_customer_date_range", "receipt", "", err)
		}
		receipts = append(receipts, receipt)
	}

	if err = rows.Err(); err != nil {
		return nil, repositories.NewRepositoryError("get_by_customer_date_range", "receipt", "", err)
	}

	return receipts, nil
}

// GetTopCustomersByRevenue retrieves customers ordered by total revenue
func (r *ReceiptRepository) GetTopCustomersByRevenue(ctx context.Context, limit int) ([]*repositories.CustomerRevenue, error) {
	query := `
		SELECT 
			r.customer_id,
			COALESCE(SUM(r.total_inc_gst), 0) as total_revenue,
			COUNT(r.receipt_id) as total_receipts,
			COALESCE(AVG(r.total_inc_gst), 0) as average_receipt,
			MAX(r.date_of_purchase) as last_purchase
		FROM receipts r
		GROUP BY r.customer_id
		ORDER BY total_revenue DESC
		LIMIT ?`

	rows, err := r.executeQuery(ctx, "get_top_customers", query, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var customers []*repositories.CustomerRevenue
	for rows.Next() {
		customer := &repositories.CustomerRevenue{}
		err := rows.Scan(
			&customer.CustomerID,
			&customer.TotalRevenue,
			&customer.TotalReceipts,
			&customer.AverageReceipt,
			&customer.LastPurchase,
		)
		if err != nil {
			return nil, repositories.NewRepositoryError("get_top_customers", "receipt", "", err)
		}
		customers = append(customers, customer)
	}

	if err = rows.Err(); err != nil {
		return nil, repositories.NewRepositoryError("get_top_customers", "receipt", "", err)
	}

	return customers, nil
}
