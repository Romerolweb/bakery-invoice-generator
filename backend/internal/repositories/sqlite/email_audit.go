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

// EmailAuditRepository implements the EmailAuditRepository interface for SQLite
type EmailAuditRepository struct {
	*BaseRepository[models.EmailAudit]
}

// NewEmailAuditRepository creates a new SQLite email audit repository
func NewEmailAuditRepository(db *sql.DB, logger *logrus.Logger) repositories.EmailAuditRepository {
	return &EmailAuditRepository{
		BaseRepository: NewBaseRepository[models.EmailAudit](db, "email_audit", logger),
	}
}

// Create creates a new email audit record
func (r *EmailAuditRepository) Create(ctx context.Context, emailAudit *models.EmailAudit) error {
	if err := emailAudit.Validate(); err != nil {
		return repositories.ValidationError("email_audit", emailAudit.ID, err)
	}

	query := `
		INSERT INTO email_audit (
			id, receipt_id, recipient_email, sent_at, status, error_message, retry_count
		) VALUES (?, ?, ?, ?, ?, ?, ?)`

	_, err := r.executeExec(ctx, "create", query,
		emailAudit.ID,
		emailAudit.ReceiptID,
		emailAudit.RecipientEmail,
		emailAudit.SentAt,
		emailAudit.Status,
		emailAudit.ErrorMessage,
		emailAudit.RetryCount,
	)

	if err != nil {
		if strings.Contains(err.Error(), "UNIQUE constraint failed") {
			return repositories.DuplicateError("email_audit", "id", emailAudit.ID)
		}
		return err
	}

	return nil
}

// GetByID retrieves an email audit record by ID
func (r *EmailAuditRepository) GetByID(ctx context.Context, id string) (*models.EmailAudit, error) {
	if err := r.validateID(id); err != nil {
		return nil, err
	}

	query := `
		SELECT id, receipt_id, recipient_email, sent_at, status, error_message, retry_count
		FROM email_audit 
		WHERE id = ?`

	row := r.executeQueryRow(ctx, "get_by_id", query, id)

	emailAudit := &models.EmailAudit{}
	err := row.Scan(
		&emailAudit.ID,
		&emailAudit.ReceiptID,
		&emailAudit.RecipientEmail,
		&emailAudit.SentAt,
		&emailAudit.Status,
		&emailAudit.ErrorMessage,
		&emailAudit.RetryCount,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			return nil, repositories.NotFoundError("email_audit", id)
		}
		return nil, repositories.NewRepositoryError("get_by_id", "email_audit", id, err)
	}

	return emailAudit, nil
}

// Update updates an existing email audit record
func (r *EmailAuditRepository) Update(ctx context.Context, emailAudit *models.EmailAudit) error {
	if err := emailAudit.Validate(); err != nil {
		return repositories.ValidationError("email_audit", emailAudit.ID, err)
	}

	query := `
		UPDATE email_audit 
		SET receipt_id = ?, recipient_email = ?, sent_at = ?, status = ?, 
			error_message = ?, retry_count = ?
		WHERE id = ?`

	result, err := r.executeExec(ctx, "update", query,
		emailAudit.ReceiptID,
		emailAudit.RecipientEmail,
		emailAudit.SentAt,
		emailAudit.Status,
		emailAudit.ErrorMessage,
		emailAudit.RetryCount,
		emailAudit.ID,
	)

	if err != nil {
		return err
	}

	return r.checkRowsAffected(result, "update", emailAudit.ID)
}

// Delete deletes an email audit record by ID
func (r *EmailAuditRepository) Delete(ctx context.Context, id string) error {
	if err := r.validateID(id); err != nil {
		return err
	}

	query := "DELETE FROM email_audit WHERE id = ?"
	result, err := r.executeExec(ctx, "delete", query, id)
	if err != nil {
		return err
	}

	return r.checkRowsAffected(result, "delete", id)
}

// List retrieves email audit records with optional filters
func (r *EmailAuditRepository) List(ctx context.Context, filters map[string]interface{}) ([]*models.EmailAudit, error) {
	query := `
		SELECT id, receipt_id, recipient_email, sent_at, status, error_message, retry_count
		FROM email_audit`

	whereClause, args := r.buildWhereClause(filters)
	if whereClause != "" {
		query += " " + whereClause
	}

	query += " ORDER BY sent_at DESC"

	rows, err := r.executeQuery(ctx, "list", query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var emailAudits []*models.EmailAudit
	for rows.Next() {
		emailAudit := &models.EmailAudit{}
		err := rows.Scan(
			&emailAudit.ID,
			&emailAudit.ReceiptID,
			&emailAudit.RecipientEmail,
			&emailAudit.SentAt,
			&emailAudit.Status,
			&emailAudit.ErrorMessage,
			&emailAudit.RetryCount,
		)
		if err != nil {
			return nil, repositories.NewRepositoryError("list", "email_audit", "", err)
		}
		emailAudits = append(emailAudits, emailAudit)
	}

	if err = rows.Err(); err != nil {
		return nil, repositories.NewRepositoryError("list", "email_audit", "", err)
	}

	return emailAudits, nil
}

// Count returns the total number of email audit records matching the filters
func (r *EmailAuditRepository) Count(ctx context.Context, filters map[string]interface{}) (int64, error) {
	query := "SELECT COUNT(*) FROM email_audit"

	whereClause, args := r.buildWhereClause(filters)
	if whereClause != "" {
		query += " " + whereClause
	}

	row := r.executeQueryRow(ctx, "count", query, args...)

	var count int64
	err := row.Scan(&count)
	if err != nil {
		return 0, repositories.NewRepositoryError("count", "email_audit", "", err)
	}

	return count, nil
}

// GetByReceiptID retrieves email audit records for a specific receipt
func (r *EmailAuditRepository) GetByReceiptID(ctx context.Context, receiptID string) ([]*models.EmailAudit, error) {
	if err := r.validateID(receiptID); err != nil {
		return nil, err
	}

	query := `
		SELECT id, receipt_id, recipient_email, sent_at, status, error_message, retry_count
		FROM email_audit 
		WHERE receipt_id = ?
		ORDER BY sent_at DESC`

	rows, err := r.executeQuery(ctx, "get_by_receipt", query, receiptID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var emailAudits []*models.EmailAudit
	for rows.Next() {
		emailAudit := &models.EmailAudit{}
		err := rows.Scan(
			&emailAudit.ID,
			&emailAudit.ReceiptID,
			&emailAudit.RecipientEmail,
			&emailAudit.SentAt,
			&emailAudit.Status,
			&emailAudit.ErrorMessage,
			&emailAudit.RetryCount,
		)
		if err != nil {
			return nil, repositories.NewRepositoryError("get_by_receipt", "email_audit", "", err)
		}
		emailAudits = append(emailAudits, emailAudit)
	}

	if err = rows.Err(); err != nil {
		return nil, repositories.NewRepositoryError("get_by_receipt", "email_audit", "", err)
	}

	return emailAudits, nil
}

// GetByStatus retrieves email audit records by status
func (r *EmailAuditRepository) GetByStatus(ctx context.Context, status models.EmailStatus) ([]*models.EmailAudit, error) {
	query := `
		SELECT id, receipt_id, recipient_email, sent_at, status, error_message, retry_count
		FROM email_audit 
		WHERE status = ?
		ORDER BY sent_at DESC`

	rows, err := r.executeQuery(ctx, "get_by_status", query, status)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var emailAudits []*models.EmailAudit
	for rows.Next() {
		emailAudit := &models.EmailAudit{}
		err := rows.Scan(
			&emailAudit.ID,
			&emailAudit.ReceiptID,
			&emailAudit.RecipientEmail,
			&emailAudit.SentAt,
			&emailAudit.Status,
			&emailAudit.ErrorMessage,
			&emailAudit.RetryCount,
		)
		if err != nil {
			return nil, repositories.NewRepositoryError("get_by_status", "email_audit", "", err)
		}
		emailAudits = append(emailAudits, emailAudit)
	}

	if err = rows.Err(); err != nil {
		return nil, repositories.NewRepositoryError("get_by_status", "email_audit", "", err)
	}

	return emailAudits, nil
}

// GetByRecipientEmail retrieves email audit records for a specific recipient
func (r *EmailAuditRepository) GetByRecipientEmail(ctx context.Context, email string) ([]*models.EmailAudit, error) {
	if strings.TrimSpace(email) == "" {
		return []*models.EmailAudit{}, nil
	}

	query := `
		SELECT id, receipt_id, recipient_email, sent_at, status, error_message, retry_count
		FROM email_audit 
		WHERE recipient_email = ?
		ORDER BY sent_at DESC`

	rows, err := r.executeQuery(ctx, "get_by_recipient", query, email)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var emailAudits []*models.EmailAudit
	for rows.Next() {
		emailAudit := &models.EmailAudit{}
		err := rows.Scan(
			&emailAudit.ID,
			&emailAudit.ReceiptID,
			&emailAudit.RecipientEmail,
			&emailAudit.SentAt,
			&emailAudit.Status,
			&emailAudit.ErrorMessage,
			&emailAudit.RetryCount,
		)
		if err != nil {
			return nil, repositories.NewRepositoryError("get_by_recipient", "email_audit", "", err)
		}
		emailAudits = append(emailAudits, emailAudit)
	}

	if err = rows.Err(); err != nil {
		return nil, repositories.NewRepositoryError("get_by_recipient", "email_audit", "", err)
	}

	return emailAudits, nil
}

// GetPendingEmails retrieves emails that are pending or need retry
func (r *EmailAuditRepository) GetPendingEmails(ctx context.Context) ([]*models.EmailAudit, error) {
	query := `
		SELECT id, receipt_id, recipient_email, sent_at, status, error_message, retry_count
		FROM email_audit 
		WHERE status = ?
		ORDER BY sent_at ASC`

	rows, err := r.executeQuery(ctx, "get_pending", query, models.EmailStatusPending)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var emailAudits []*models.EmailAudit
	for rows.Next() {
		emailAudit := &models.EmailAudit{}
		err := rows.Scan(
			&emailAudit.ID,
			&emailAudit.ReceiptID,
			&emailAudit.RecipientEmail,
			&emailAudit.SentAt,
			&emailAudit.Status,
			&emailAudit.ErrorMessage,
			&emailAudit.RetryCount,
		)
		if err != nil {
			return nil, repositories.NewRepositoryError("get_pending", "email_audit", "", err)
		}
		emailAudits = append(emailAudits, emailAudit)
	}

	if err = rows.Err(); err != nil {
		return nil, repositories.NewRepositoryError("get_pending", "email_audit", "", err)
	}

	return emailAudits, nil
}

// GetFailedEmails retrieves emails that failed to send
func (r *EmailAuditRepository) GetFailedEmails(ctx context.Context) ([]*models.EmailAudit, error) {
	query := `
		SELECT id, receipt_id, recipient_email, sent_at, status, error_message, retry_count
		FROM email_audit 
		WHERE status = ?
		ORDER BY sent_at DESC`

	rows, err := r.executeQuery(ctx, "get_failed", query, models.EmailStatusFailed)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var emailAudits []*models.EmailAudit
	for rows.Next() {
		emailAudit := &models.EmailAudit{}
		err := rows.Scan(
			&emailAudit.ID,
			&emailAudit.ReceiptID,
			&emailAudit.RecipientEmail,
			&emailAudit.SentAt,
			&emailAudit.Status,
			&emailAudit.ErrorMessage,
			&emailAudit.RetryCount,
		)
		if err != nil {
			return nil, repositories.NewRepositoryError("get_failed", "email_audit", "", err)
		}
		emailAudits = append(emailAudits, emailAudit)
	}

	if err = rows.Err(); err != nil {
		return nil, repositories.NewRepositoryError("get_failed", "email_audit", "", err)
	}

	return emailAudits, nil
}

// GetEmailsForRetry retrieves emails that should be retried
func (r *EmailAuditRepository) GetEmailsForRetry(ctx context.Context, maxRetries int) ([]*models.EmailAudit, error) {
	query := `
		SELECT id, receipt_id, recipient_email, sent_at, status, error_message, retry_count
		FROM email_audit 
		WHERE status = ? AND retry_count < ?
		ORDER BY sent_at ASC`

	rows, err := r.executeQuery(ctx, "get_for_retry", query, models.EmailStatusFailed, maxRetries)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var emailAudits []*models.EmailAudit
	for rows.Next() {
		emailAudit := &models.EmailAudit{}
		err := rows.Scan(
			&emailAudit.ID,
			&emailAudit.ReceiptID,
			&emailAudit.RecipientEmail,
			&emailAudit.SentAt,
			&emailAudit.Status,
			&emailAudit.ErrorMessage,
			&emailAudit.RetryCount,
		)
		if err != nil {
			return nil, repositories.NewRepositoryError("get_for_retry", "email_audit", "", err)
		}
		emailAudits = append(emailAudits, emailAudit)
	}

	if err = rows.Err(); err != nil {
		return nil, repositories.NewRepositoryError("get_for_retry", "email_audit", "", err)
	}

	return emailAudits, nil
}

// GetEmailStatistics retrieves email delivery statistics
func (r *EmailAuditRepository) GetEmailStatistics(ctx context.Context, startDate, endDate time.Time) (*repositories.EmailStatistics, error) {
	query := `
		SELECT 
			COUNT(*) as total_sent,
			COUNT(CASE WHEN status = ? THEN 1 END) as total_failed,
			COUNT(CASE WHEN status = ? THEN 1 END) as total_pending,
			SUM(retry_count) as total_retries
		FROM email_audit 
		WHERE sent_at >= ? AND sent_at <= ?`

	row := r.executeQueryRow(ctx, "get_statistics", query,
		models.EmailStatusFailed, models.EmailStatusPending, startDate, endDate)

	stats := &repositories.EmailStatistics{
		Period:    "custom",
		StartDate: startDate,
		EndDate:   endDate,
	}

	err := row.Scan(
		&stats.TotalSent,
		&stats.TotalFailed,
		&stats.TotalPending,
		&stats.TotalRetries,
	)

	if err != nil {
		return nil, repositories.NewRepositoryError("get_statistics", "email_audit", "", err)
	}

	// Calculate success rate
	if stats.TotalSent > 0 {
		successfulSent := stats.TotalSent - stats.TotalFailed - stats.TotalPending
		stats.SuccessRate = float64(successfulSent) / float64(stats.TotalSent) * 100
	}

	return stats, nil
}

// GetRecentEmailActivity retrieves recent email activity
func (r *EmailAuditRepository) GetRecentEmailActivity(ctx context.Context, since time.Duration) ([]*models.EmailAudit, error) {
	cutoffTime := time.Now().Add(-since)

	query := `
		SELECT id, receipt_id, recipient_email, sent_at, status, error_message, retry_count
		FROM email_audit 
		WHERE sent_at >= ?
		ORDER BY sent_at DESC`

	rows, err := r.executeQuery(ctx, "get_recent_activity", query, cutoffTime)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var emailAudits []*models.EmailAudit
	for rows.Next() {
		emailAudit := &models.EmailAudit{}
		err := rows.Scan(
			&emailAudit.ID,
			&emailAudit.ReceiptID,
			&emailAudit.RecipientEmail,
			&emailAudit.SentAt,
			&emailAudit.Status,
			&emailAudit.ErrorMessage,
			&emailAudit.RetryCount,
		)
		if err != nil {
			return nil, repositories.NewRepositoryError("get_recent_activity", "email_audit", "", err)
		}
		emailAudits = append(emailAudits, emailAudit)
	}

	if err = rows.Err(); err != nil {
		return nil, repositories.NewRepositoryError("get_recent_activity", "email_audit", "", err)
	}

	return emailAudits, nil
}

// CleanupOldRecords removes old email audit records
func (r *EmailAuditRepository) CleanupOldRecords(ctx context.Context, olderThan time.Duration) (int64, error) {
	cutoffTime := time.Now().Add(-olderThan)

	query := "DELETE FROM email_audit WHERE sent_at < ?"
	result, err := r.executeExec(ctx, "cleanup", query, cutoffTime)
	if err != nil {
		return 0, err
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return 0, repositories.NewRepositoryError("cleanup", "email_audit", "", err)
	}

	return rowsAffected, nil
}
