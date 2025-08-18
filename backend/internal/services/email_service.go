package services

import (
	"context"
	"fmt"
	"html/template"
	"net/mail"
	"net/smtp"
	"strings"
	"time"

	"github.com/go-playground/validator/v10"
	"github.com/google/uuid"

	"bakery-invoice-api/internal/models"
	"bakery-invoice-api/internal/repositories"
)

// emailService implements the EmailService interface
type emailService struct {
	emailAuditRepo repositories.EmailAuditRepository
	receiptService ReceiptService
	validator      *validator.Validate
	smtpConfig     *SMTPConfig
	templateCache  map[string]*template.Template
}

// SMTPConfig holds SMTP configuration
type SMTPConfig struct {
	Host      string
	Port      int
	Username  string
	Password  string
	FromEmail string
	FromName  string
	UseTLS    bool
	UseSSL    bool
}

// NewEmailService creates a new email service instance
func NewEmailService(
	emailAuditRepo repositories.EmailAuditRepository,
	receiptService ReceiptService,
	smtpConfig *SMTPConfig,
) EmailService {
	return &emailService{
		emailAuditRepo: emailAuditRepo,
		receiptService: receiptService,
		validator:      validator.New(),
		smtpConfig:     smtpConfig,
		templateCache:  make(map[string]*template.Template),
	}
}

// SendReceiptEmail sends a receipt via email
func (s *emailService) SendReceiptEmail(ctx context.Context, receiptID string, recipientEmail string) error {
	if receiptID == "" {
		return fmt.Errorf("receipt ID cannot be empty")
	}

	if err := s.ValidateEmailAddress(ctx, recipientEmail); err != nil {
		return fmt.Errorf("invalid recipient email: %w", err)
	}

	// Get receipt (validate it exists)
	_, err := s.receiptService.GetReceipt(ctx, receiptID)
	if err != nil {
		return fmt.Errorf("failed to get receipt: %w", err)
	}

	// Create email audit record
	emailAudit := &models.EmailAudit{
		ID:             uuid.New().String(),
		ReceiptID:      receiptID,
		RecipientEmail: recipientEmail,
		Status:         models.EmailStatusPending,
		SentAt:         time.Now(),
		RetryCount:     0,
	}

	// Create audit record
	if err := s.emailAuditRepo.Create(ctx, emailAudit); err != nil {
		return fmt.Errorf("failed to create email audit record: %w", err)
	}

	// Render email content
	htmlContent, err := s.RenderReceiptEmailTemplate(ctx, receiptID, "receipt_email")
	if err != nil {
		s.updateEmailStatus(ctx, emailAudit.ID, models.EmailStatusFailed, fmt.Sprintf("Template rendering failed: %v", err))
		return fmt.Errorf("failed to render email template: %w", err)
	}

	// Send email
	if err := s.sendEmail(ctx, recipientEmail, "Receipt from "+s.smtpConfig.FromName, htmlContent, ""); err != nil {
		s.updateEmailStatus(ctx, emailAudit.ID, models.EmailStatusFailed, fmt.Sprintf("Email sending failed: %v", err))
		return fmt.Errorf("failed to send email: %w", err)
	}

	// Update audit record as sent
	s.updateEmailStatus(ctx, emailAudit.ID, models.EmailStatusSent, "")

	return nil
}

// SendBulkReceiptEmails sends multiple receipts via email
func (s *emailService) SendBulkReceiptEmails(ctx context.Context, receiptIDs []string, recipientEmails []string) error {
	if len(receiptIDs) == 0 {
		return fmt.Errorf("receipt IDs cannot be empty")
	}

	if len(recipientEmails) == 0 {
		return fmt.Errorf("recipient emails cannot be empty")
	}

	// Validate all email addresses first
	for _, email := range recipientEmails {
		if err := s.ValidateEmailAddress(ctx, email); err != nil {
			return fmt.Errorf("invalid recipient email %s: %w", email, err)
		}
	}

	var errors []string

	// Send each receipt to each recipient
	for _, receiptID := range receiptIDs {
		for _, email := range recipientEmails {
			if err := s.SendReceiptEmail(ctx, receiptID, email); err != nil {
				errors = append(errors, fmt.Sprintf("Failed to send receipt %s to %s: %v", receiptID, email, err))
			}
		}
	}

	if len(errors) > 0 {
		return fmt.Errorf("bulk email sending completed with errors: %s", strings.Join(errors, "; "))
	}

	return nil
}

// ResendFailedEmails resends failed emails with retry limit
func (s *emailService) ResendFailedEmails(ctx context.Context, maxRetries int) error {
	if maxRetries <= 0 {
		maxRetries = 3
	}

	// Get emails that need retry
	failedEmails, err := s.emailAuditRepo.GetEmailsForRetry(ctx, maxRetries)
	if err != nil {
		return fmt.Errorf("failed to get emails for retry: %w", err)
	}

	var errors []string

	for _, emailAudit := range failedEmails {
		// Increment retry count
		emailAudit.RetryCount++

		// Try to resend
		if err := s.SendReceiptEmail(ctx, emailAudit.ReceiptID, emailAudit.RecipientEmail); err != nil {
			errors = append(errors, fmt.Sprintf("Failed to resend email %s: %v", emailAudit.ID, err))

			// Update retry count
			s.updateEmailStatus(ctx, emailAudit.ID, models.EmailStatusFailed, fmt.Sprintf("Retry %d failed: %v", emailAudit.RetryCount, err))
		}
	}

	if len(errors) > 0 {
		return fmt.Errorf("resend failed emails completed with errors: %s", strings.Join(errors, "; "))
	}

	return nil
}

// RenderReceiptEmailTemplate renders an email template for a receipt
func (s *emailService) RenderReceiptEmailTemplate(ctx context.Context, receiptID string, templateName string) (string, error) {
	if receiptID == "" {
		return "", fmt.Errorf("receipt ID cannot be empty")
	}

	if templateName == "" {
		templateName = "receipt_email"
	}

	// Get receipt with full details
	printableReceipt, err := s.receiptService.FormatReceiptForPrint(ctx, receiptID)
	if err != nil {
		return "", fmt.Errorf("failed to format receipt for print: %w", err)
	}

	// Get or load template
	tmpl, err := s.getTemplate(templateName)
	if err != nil {
		return "", fmt.Errorf("failed to get template: %w", err)
	}

	// Prepare template data
	templateData := map[string]interface{}{
		"Receipt":          printableReceipt.Receipt,
		"CustomerSnapshot": printableReceipt.CustomerSnapshot,
		"SellerSnapshot":   printableReceipt.SellerSnapshot,
		"CurrentDate":      time.Now().Format("2006-01-02"),
		"CurrentTime":      time.Now().Format("15:04:05"),
	}

	// Render template
	var buf strings.Builder
	if err := tmpl.Execute(&buf, templateData); err != nil {
		return "", fmt.Errorf("failed to execute template: %w", err)
	}

	return buf.String(), nil
}

// GetAvailableTemplates returns available email templates
func (s *emailService) GetAvailableTemplates(ctx context.Context) ([]EmailTemplate, error) {
	// This would typically load from a database or file system
	// For now, return hardcoded templates
	templates := []EmailTemplate{
		{
			Name:        "receipt_email",
			Subject:     "Receipt from {{.SellerSnapshot.Name}}",
			HTMLContent: s.getDefaultReceiptTemplate(),
			TextContent: s.getDefaultReceiptTextTemplate(),
			Description: "Standard receipt email template",
		},
		{
			Name:        "tax_invoice_email",
			Subject:     "Tax Invoice from {{.SellerSnapshot.Name}}",
			HTMLContent: s.getDefaultTaxInvoiceTemplate(),
			TextContent: s.getDefaultTaxInvoiceTextTemplate(),
			Description: "Tax invoice email template",
		},
	}

	return templates, nil
}

// ValidateEmailTemplate validates an email template
func (s *emailService) ValidateEmailTemplate(ctx context.Context, templateContent string) error {
	if strings.TrimSpace(templateContent) == "" {
		return fmt.Errorf("template content cannot be empty")
	}

	// Try to parse the template
	_, err := template.New("test").Parse(templateContent)
	if err != nil {
		return fmt.Errorf("invalid template syntax: %w", err)
	}

	return nil
}

// GetEmailStatus retrieves the status of an email
func (s *emailService) GetEmailStatus(ctx context.Context, emailID string) (*models.EmailAudit, error) {
	if emailID == "" {
		return nil, fmt.Errorf("email ID cannot be empty")
	}

	emailAudit, err := s.emailAuditRepo.GetByID(ctx, emailID)
	if err != nil {
		return nil, fmt.Errorf("failed to get email status: %w", err)
	}

	return emailAudit, nil
}

// GetEmailHistory retrieves email history for a receipt
func (s *emailService) GetEmailHistory(ctx context.Context, receiptID string) ([]*models.EmailAudit, error) {
	if receiptID == "" {
		return nil, fmt.Errorf("receipt ID cannot be empty")
	}

	emails, err := s.emailAuditRepo.GetByReceiptID(ctx, receiptID)
	if err != nil {
		return nil, fmt.Errorf("failed to get email history: %w", err)
	}

	return emails, nil
}

// GetEmailStatistics retrieves email delivery statistics
func (s *emailService) GetEmailStatistics(ctx context.Context, startDate, endDate time.Time) (*repositories.EmailStatistics, error) {
	stats, err := s.emailAuditRepo.GetEmailStatistics(ctx, startDate, endDate)
	if err != nil {
		return nil, fmt.Errorf("failed to get email statistics: %w", err)
	}

	return stats, nil
}

// GetPendingEmails retrieves pending emails
func (s *emailService) GetPendingEmails(ctx context.Context) ([]*models.EmailAudit, error) {
	emails, err := s.emailAuditRepo.GetPendingEmails(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get pending emails: %w", err)
	}

	return emails, nil
}

// GetFailedEmails retrieves failed emails
func (s *emailService) GetFailedEmails(ctx context.Context) ([]*models.EmailAudit, error) {
	emails, err := s.emailAuditRepo.GetFailedEmails(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get failed emails: %w", err)
	}

	return emails, nil
}

// ValidateEmailAddress validates an email address
func (s *emailService) ValidateEmailAddress(ctx context.Context, email string) error {
	if strings.TrimSpace(email) == "" {
		return fmt.Errorf("email address cannot be empty")
	}

	_, err := mail.ParseAddress(email)
	if err != nil {
		return fmt.Errorf("invalid email address format: %w", err)
	}

	return nil
}

// TestEmailConfiguration tests the email configuration
func (s *emailService) TestEmailConfiguration(ctx context.Context) error {
	if s.smtpConfig == nil {
		return fmt.Errorf("SMTP configuration not set")
	}

	// Test SMTP connection
	addr := fmt.Sprintf("%s:%d", s.smtpConfig.Host, s.smtpConfig.Port)

	// Create auth if credentials provided
	var auth smtp.Auth
	if s.smtpConfig.Username != "" && s.smtpConfig.Password != "" {
		auth = smtp.PlainAuth("", s.smtpConfig.Username, s.smtpConfig.Password, s.smtpConfig.Host)
	}

	// Test connection
	client, err := smtp.Dial(addr)
	if err != nil {
		return fmt.Errorf("failed to connect to SMTP server: %w", err)
	}
	defer client.Close()

	// Test authentication if configured
	if auth != nil {
		if err := client.Auth(auth); err != nil {
			return fmt.Errorf("SMTP authentication failed: %w", err)
		}
	}

	return nil
}

// GetEmailDeliverySettings retrieves email delivery settings
func (s *emailService) GetEmailDeliverySettings(ctx context.Context) (*EmailDeliverySettings, error) {
	if s.smtpConfig == nil {
		return nil, fmt.Errorf("SMTP configuration not set")
	}

	return &EmailDeliverySettings{
		SMTPHost:     s.smtpConfig.Host,
		SMTPPort:     s.smtpConfig.Port,
		SMTPUsername: s.smtpConfig.Username,
		SMTPPassword: "***", // Don't return actual password
		FromEmail:    s.smtpConfig.FromEmail,
		FromName:     s.smtpConfig.FromName,
		UseTLS:       s.smtpConfig.UseTLS,
		UseSSL:       s.smtpConfig.UseSSL,
	}, nil
}

// UpdateEmailDeliverySettings updates email delivery settings
func (s *emailService) UpdateEmailDeliverySettings(ctx context.Context, settings *EmailDeliverySettings) error {
	if settings == nil {
		return fmt.Errorf("settings cannot be nil")
	}

	// Validate settings
	if err := s.validator.Struct(settings); err != nil {
		return fmt.Errorf("validation failed: %w", err)
	}

	// Update SMTP config
	s.smtpConfig.Host = settings.SMTPHost
	s.smtpConfig.Port = settings.SMTPPort
	s.smtpConfig.Username = settings.SMTPUsername
	if settings.SMTPPassword != "***" { // Only update if not masked
		s.smtpConfig.Password = settings.SMTPPassword
	}
	s.smtpConfig.FromEmail = settings.FromEmail
	s.smtpConfig.FromName = settings.FromName
	s.smtpConfig.UseTLS = settings.UseTLS
	s.smtpConfig.UseSSL = settings.UseSSL

	// Test new configuration
	if err := s.TestEmailConfiguration(ctx); err != nil {
		return fmt.Errorf("new email configuration test failed: %w", err)
	}

	return nil
}

// Private helper methods

// sendEmail sends an email using SMTP
func (s *emailService) sendEmail(ctx context.Context, to, subject, htmlBody, textBody string) error {
	if s.smtpConfig == nil {
		return fmt.Errorf("SMTP configuration not set")
	}

	// Create message
	from := fmt.Sprintf("%s <%s>", s.smtpConfig.FromName, s.smtpConfig.FromEmail)

	msg := fmt.Sprintf("From: %s\r\n", from)
	msg += fmt.Sprintf("To: %s\r\n", to)
	msg += fmt.Sprintf("Subject: %s\r\n", subject)
	msg += "MIME-Version: 1.0\r\n"
	msg += "Content-Type: text/html; charset=UTF-8\r\n"
	msg += "\r\n"
	msg += htmlBody

	// Send email
	addr := fmt.Sprintf("%s:%d", s.smtpConfig.Host, s.smtpConfig.Port)

	var auth smtp.Auth
	if s.smtpConfig.Username != "" && s.smtpConfig.Password != "" {
		auth = smtp.PlainAuth("", s.smtpConfig.Username, s.smtpConfig.Password, s.smtpConfig.Host)
	}

	err := smtp.SendMail(addr, auth, s.smtpConfig.FromEmail, []string{to}, []byte(msg))
	if err != nil {
		return fmt.Errorf("failed to send email: %w", err)
	}

	return nil
}

// updateEmailStatus updates the status of an email audit record
func (s *emailService) updateEmailStatus(ctx context.Context, emailID string, status models.EmailStatus, errorMessage string) {
	emailAudit, err := s.emailAuditRepo.GetByID(ctx, emailID)
	if err != nil {
		return // Log error but don't fail
	}

	emailAudit.Status = status
	if errorMessage != "" {
		emailAudit.ErrorMessage = &errorMessage
	}

	s.emailAuditRepo.Update(ctx, emailAudit)
}

// getTemplate gets or loads a template
func (s *emailService) getTemplate(templateName string) (*template.Template, error) {
	// Check cache first
	if tmpl, exists := s.templateCache[templateName]; exists {
		return tmpl, nil
	}

	// Load template (this would typically load from file or database)
	var templateContent string
	switch templateName {
	case "receipt_email":
		templateContent = s.getDefaultReceiptTemplate()
	case "tax_invoice_email":
		templateContent = s.getDefaultTaxInvoiceTemplate()
	default:
		return nil, fmt.Errorf("template not found: %s", templateName)
	}

	// Parse template
	tmpl, err := template.New(templateName).Parse(templateContent)
	if err != nil {
		return nil, fmt.Errorf("failed to parse template: %w", err)
	}

	// Cache template
	s.templateCache[templateName] = tmpl

	return tmpl, nil
}

// Default template content (these would typically be loaded from files)

func (s *emailService) getDefaultReceiptTemplate() string {
	return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Receipt from {{.SellerSnapshot.Name}}</title>
</head>
<body>
    <h1>Receipt</h1>
    <p>Thank you for your purchase!</p>
    
    <h2>Receipt Details</h2>
    <p><strong>Receipt ID:</strong> {{.Receipt.ReceiptID}}</p>
    <p><strong>Date:</strong> {{.Receipt.DateOfPurchase.Format "2006-01-02 15:04:05"}}</p>
    <p><strong>Customer:</strong> {{.CustomerSnapshot.FirstName}} {{.CustomerSnapshot.LastName}}</p>
    
    <h2>Items</h2>
    <table border="1" style="border-collapse: collapse; width: 100%;">
        <tr>
            <th>Description</th>
            <th>Quantity</th>
            <th>Unit Price</th>
            <th>Total</th>
        </tr>
        {{range .Receipt.LineItems}}
        <tr>
            <td>{{.Description}}</td>
            <td>{{.Quantity}}</td>
            <td>${{printf "%.2f" .UnitPrice}}</td>
            <td>${{printf "%.2f" .LineTotal}}</td>
        </tr>
        {{end}}
    </table>
    
    <h2>Totals</h2>
    <p><strong>Subtotal (excl GST):</strong> ${{printf "%.2f" .Receipt.SubtotalExclGST}}</p>
    <p><strong>GST:</strong> ${{printf "%.2f" .Receipt.GSTAmount}}</p>
    <p><strong>Total (inc GST):</strong> ${{printf "%.2f" .Receipt.TotalIncGST}}</p>
    
    <hr>
    <p>{{.SellerSnapshot.Name}}<br>
    {{.SellerSnapshot.BusinessAddress}}<br>
    ABN: {{.SellerSnapshot.ABNOrACN}}</p>
</body>
</html>
`
}

func (s *emailService) getDefaultReceiptTextTemplate() string {
	return `
Receipt from {{.SellerSnapshot.Name}}

Thank you for your purchase!

Receipt Details:
Receipt ID: {{.Receipt.ReceiptID}}
Date: {{.Receipt.DateOfPurchase.Format "2006-01-02 15:04:05"}}
Customer: {{.CustomerSnapshot.FirstName}} {{.CustomerSnapshot.LastName}}

Items:
{{range .Receipt.LineItems}}
{{.Description}} - Qty: {{.Quantity}} - ${{printf "%.2f" .UnitPrice}} - Total: ${{printf "%.2f" .LineTotal}}
{{end}}

Totals:
Subtotal (excl GST): ${{printf "%.2f" .Receipt.SubtotalExclGST}}
GST: ${{printf "%.2f" .Receipt.GSTAmount}}
Total (inc GST): ${{printf "%.2f" .Receipt.TotalIncGST}}

{{.SellerSnapshot.Name}}
{{.SellerSnapshot.BusinessAddress}}
ABN: {{.SellerSnapshot.ABNOrACN}}
`
}

func (s *emailService) getDefaultTaxInvoiceTemplate() string {
	return s.getDefaultReceiptTemplate() // Same as receipt for now
}

func (s *emailService) getDefaultTaxInvoiceTextTemplate() string {
	return s.getDefaultReceiptTextTemplate() // Same as receipt for now
}
