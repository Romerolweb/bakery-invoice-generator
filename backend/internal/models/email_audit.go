package models

import (
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
)

// EmailStatus represents the status of an email delivery
type EmailStatus string

const (
	EmailStatusPending EmailStatus = "pending"
	EmailStatusSent    EmailStatus = "sent"
	EmailStatusFailed  EmailStatus = "failed"
	EmailStatusRetry   EmailStatus = "retry"
)

// EmailAudit represents an email delivery audit record
type EmailAudit struct {
	ID             string      `json:"id" db:"id" validate:"required,uuid"`
	ReceiptID      string      `json:"receipt_id" db:"receipt_id" validate:"required,uuid"`
	RecipientEmail string      `json:"recipient_email" db:"recipient_email" validate:"required,email"`
	SentAt         time.Time   `json:"sent_at" db:"sent_at"`
	Status         EmailStatus `json:"status" db:"status" validate:"required,oneof=pending sent failed retry"`
	ErrorMessage   *string     `json:"error_message,omitempty" db:"error_message"`
	RetryCount     int         `json:"retry_count" db:"retry_count"`
}

// NewEmailAudit creates a new email audit record with generated ID and timestamp
func NewEmailAudit(receiptID, recipientEmail string) *EmailAudit {
	return &EmailAudit{
		ID:             uuid.New().String(),
		ReceiptID:      receiptID,
		RecipientEmail: recipientEmail,
		SentAt:         time.Now(),
		Status:         EmailStatusPending,
		RetryCount:     0,
	}
}

// Validate validates the email audit data
func (ea *EmailAudit) Validate() error {
	if ea.ID == "" {
		return fmt.Errorf("email audit ID is required")
	}

	if ea.ReceiptID == "" {
		return fmt.Errorf("receipt ID is required")
	}

	if strings.TrimSpace(ea.RecipientEmail) == "" {
		return fmt.Errorf("recipient email is required")
	}

	if !isValidEmail(ea.RecipientEmail) {
		return fmt.Errorf("invalid recipient email format: %s", ea.RecipientEmail)
	}

	if ea.Status != EmailStatusPending && ea.Status != EmailStatusSent &&
		ea.Status != EmailStatusFailed && ea.Status != EmailStatusRetry {
		return fmt.Errorf("invalid email status: %s", ea.Status)
	}

	if ea.RetryCount < 0 {
		return fmt.Errorf("retry count cannot be negative")
	}

	return nil
}

// MarkAsSent marks the email as successfully sent
func (ea *EmailAudit) MarkAsSent() {
	ea.Status = EmailStatusSent
	ea.ErrorMessage = nil
	ea.SentAt = time.Now()
}

// MarkAsFailed marks the email as failed with an error message
func (ea *EmailAudit) MarkAsFailed(errorMessage string) {
	ea.Status = EmailStatusFailed
	ea.SetErrorMessage(errorMessage)
	ea.SentAt = time.Now()
}

// MarkForRetry marks the email for retry and increments the retry count
func (ea *EmailAudit) MarkForRetry(errorMessage string) {
	ea.Status = EmailStatusRetry
	ea.SetErrorMessage(errorMessage)
	ea.RetryCount++
	ea.SentAt = time.Now()
}

// SetErrorMessage sets the error message
func (ea *EmailAudit) SetErrorMessage(errorMessage string) {
	if strings.TrimSpace(errorMessage) == "" {
		ea.ErrorMessage = nil
	} else {
		ea.ErrorMessage = &errorMessage
	}
}

// GetErrorMessage returns the error message or empty string if nil
func (ea *EmailAudit) GetErrorMessage() string {
	if ea.ErrorMessage == nil {
		return ""
	}
	return *ea.ErrorMessage
}

// IsPending returns true if the email is pending
func (ea *EmailAudit) IsPending() bool {
	return ea.Status == EmailStatusPending
}

// IsSent returns true if the email was successfully sent
func (ea *EmailAudit) IsSent() bool {
	return ea.Status == EmailStatusSent
}

// IsFailed returns true if the email failed to send
func (ea *EmailAudit) IsFailed() bool {
	return ea.Status == EmailStatusFailed
}

// IsRetry returns true if the email is marked for retry
func (ea *EmailAudit) IsRetry() bool {
	return ea.Status == EmailStatusRetry
}

// CanRetry returns true if the email can be retried (not exceeded max retries)
func (ea *EmailAudit) CanRetry(maxRetries int) bool {
	return ea.RetryCount < maxRetries && (ea.IsFailed() || ea.IsRetry())
}

// GetStatusDisplay returns a human-readable status string
func (ea *EmailAudit) GetStatusDisplay() string {
	switch ea.Status {
	case EmailStatusPending:
		return "Pending"
	case EmailStatusSent:
		return "Sent"
	case EmailStatusFailed:
		return "Failed"
	case EmailStatusRetry:
		return fmt.Sprintf("Retry (%d)", ea.RetryCount)
	default:
		return string(ea.Status)
	}
}

// GetTimeSinceAttempt returns the duration since the last attempt
func (ea *EmailAudit) GetTimeSinceAttempt() time.Duration {
	return time.Since(ea.SentAt)
}

// ShouldRetryNow returns true if enough time has passed for a retry attempt
func (ea *EmailAudit) ShouldRetryNow(retryDelay time.Duration) bool {
	if !ea.IsRetry() {
		return false
	}
	return ea.GetTimeSinceAttempt() >= retryDelay
}

// GetNextRetryTime returns the time when the next retry should be attempted
func (ea *EmailAudit) GetNextRetryTime(retryDelay time.Duration) time.Time {
	return ea.SentAt.Add(retryDelay)
}
