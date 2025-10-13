package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"bakery-invoice-api/internal/services"
	"bakery-invoice-api/pkg/lambda"
)

// EmailHandler handles email-related HTTP requests
type EmailHandler struct {
	emailService services.EmailService
}

// NewEmailHandler creates a new email handler
func NewEmailHandler(emailService services.EmailService) *EmailHandler {
	return &EmailHandler{
		emailService: emailService,
	}
}

// SendReceiptRequest represents the request body for sending a receipt email
type SendReceiptRequest struct {
	ReceiptID      string `json:"receipt_id" binding:"required"`
	RecipientEmail string `json:"recipient_email" binding:"required,email"`
}

// SendBulkReceiptsRequest represents the request body for sending bulk receipt emails
type SendBulkReceiptsRequest struct {
	ReceiptIDs      []string `json:"receipt_ids" binding:"required,min=1"`
	RecipientEmails []string `json:"recipient_emails" binding:"required,min=1"`
}

// @Summary Send receipt email
// @Description Send a receipt via email
// @Tags email
// @Accept json
// @Produce json
// @Param request body SendReceiptRequest true "Email sending data"
// @Success 200 {object} map[string]string
// @Failure 400 {object} ErrorResponse
// @Failure 404 {object} ErrorResponse
// @Failure 500 {object} ErrorResponse
// @Router /email/send-receipt [post]
func (h *EmailHandler) SendReceipt(c *gin.Context) {
	var req SendReceiptRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Error:   "Invalid request body",
			Message: err.Error(),
		})
		return
	}

	// Validate UUID format
	if _, err := uuid.Parse(req.ReceiptID); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Error:   "Invalid receipt ID",
			Message: "Receipt ID must be a valid UUID",
		})
		return
	}

	err := h.emailService.SendReceiptEmail(c.Request.Context(), req.ReceiptID, req.RecipientEmail)
	if err != nil {
		if isNotFoundError(err) {
			c.JSON(http.StatusNotFound, ErrorResponse{
				Error:   "Receipt not found",
				Message: err.Error(),
			})
			return
		}
		if isValidationError(err) {
			c.JSON(http.StatusBadRequest, ErrorResponse{
				Error:   "Validation failed",
				Message: err.Error(),
			})
			return
		}
		c.JSON(http.StatusInternalServerError, ErrorResponse{
			Error:   "Failed to send email",
			Message: err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":         "Email sent successfully",
		"receipt_id":      req.ReceiptID,
		"recipient_email": req.RecipientEmail,
	})
}

// @Summary Send bulk receipt emails
// @Description Send multiple receipts via email to multiple recipients
// @Tags email
// @Accept json
// @Produce json
// @Param request body SendBulkReceiptsRequest true "Bulk email sending data"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} ErrorResponse
// @Failure 500 {object} ErrorResponse
// @Router /email/send-bulk [post]
func (h *EmailHandler) SendBulkReceipts(c *gin.Context) {
	var req SendBulkReceiptsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Error:   "Invalid request body",
			Message: err.Error(),
		})
		return
	}

	// Validate all receipt IDs
	for i, receiptID := range req.ReceiptIDs {
		if _, err := uuid.Parse(receiptID); err != nil {
			c.JSON(http.StatusBadRequest, ErrorResponse{
				Error:   "Invalid receipt ID",
				Message: "Receipt ID at index " + strconv.Itoa(i) + " must be a valid UUID",
			})
			return
		}
	}

	err := h.emailService.SendBulkReceiptEmails(c.Request.Context(), req.ReceiptIDs, req.RecipientEmails)
	if err != nil {
		if isValidationError(err) {
			c.JSON(http.StatusBadRequest, ErrorResponse{
				Error:   "Validation failed",
				Message: err.Error(),
			})
			return
		}
		c.JSON(http.StatusInternalServerError, ErrorResponse{
			Error:   "Failed to send bulk emails",
			Message: err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":         "Bulk emails sent successfully",
		"receipt_count":   len(req.ReceiptIDs),
		"recipient_count": len(req.RecipientEmails),
		"total_emails":    len(req.ReceiptIDs) * len(req.RecipientEmails),
	})
}

// @Summary Resend failed emails
// @Description Resend emails that previously failed
// @Tags email
// @Accept json
// @Produce json
// @Param max_retries query int false "Maximum retry attempts" default(3)
// @Success 200 {object} map[string]string
// @Failure 500 {object} ErrorResponse
// @Router /email/resend-failed [post]
func (h *EmailHandler) ResendFailedEmails(c *gin.Context) {
	maxRetries := 3
	if maxRetriesStr := c.Query("max_retries"); maxRetriesStr != "" {
		if val, err := strconv.Atoi(maxRetriesStr); err == nil && val > 0 {
			maxRetries = val
		}
	}

	err := h.emailService.ResendFailedEmails(c.Request.Context(), maxRetries)
	if err != nil {
		c.JSON(http.StatusInternalServerError, ErrorResponse{
			Error:   "Failed to resend failed emails",
			Message: err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":     "Failed emails resent successfully",
		"max_retries": maxRetries,
	})
}

// @Summary Get email status
// @Description Get the status of an email
// @Tags email
// @Accept json
// @Produce json
// @Param id path string true "Email ID"
// @Success 200 {object} models.EmailAudit
// @Failure 400 {object} ErrorResponse
// @Failure 404 {object} ErrorResponse
// @Failure 500 {object} ErrorResponse
// @Router /email/{id}/status [get]
func (h *EmailHandler) GetEmailStatus(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Error:   "Invalid request",
			Message: "Email ID is required",
		})
		return
	}

	// Validate UUID format
	if _, err := uuid.Parse(id); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Error:   "Invalid email ID",
			Message: "Email ID must be a valid UUID",
		})
		return
	}

	emailAudit, err := h.emailService.GetEmailStatus(c.Request.Context(), id)
	if err != nil {
		if isNotFoundError(err) {
			c.JSON(http.StatusNotFound, ErrorResponse{
				Error:   "Email not found",
				Message: err.Error(),
			})
			return
		}
		c.JSON(http.StatusInternalServerError, ErrorResponse{
			Error:   "Failed to get email status",
			Message: err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, emailAudit)
}

// @Summary Get email history
// @Description Get email history for a receipt
// @Tags email
// @Accept json
// @Produce json
// @Param receipt_id path string true "Receipt ID"
// @Success 200 {array} models.EmailAudit
// @Failure 400 {object} ErrorResponse
// @Failure 500 {object} ErrorResponse
// @Router /email/receipt/{receipt_id}/history [get]
func (h *EmailHandler) GetEmailHistory(c *gin.Context) {
	receiptID := c.Param("receipt_id")
	if receiptID == "" {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Error:   "Invalid request",
			Message: "Receipt ID is required",
		})
		return
	}

	// Validate UUID format
	if _, err := uuid.Parse(receiptID); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Error:   "Invalid receipt ID",
			Message: "Receipt ID must be a valid UUID",
		})
		return
	}

	emails, err := h.emailService.GetEmailHistory(c.Request.Context(), receiptID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, ErrorResponse{
			Error:   "Failed to get email history",
			Message: err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, emails)
}

// @Summary Get email statistics
// @Description Get email delivery statistics
// @Tags email
// @Accept json
// @Produce json
// @Param start_date query string true "Start date (RFC3339 format)"
// @Param end_date query string true "End date (RFC3339 format)"
// @Success 200 {object} repositories.EmailStatistics
// @Failure 400 {object} ErrorResponse
// @Failure 500 {object} ErrorResponse
// @Router /email/statistics [get]
func (h *EmailHandler) GetEmailStatistics(c *gin.Context) {
	startDateStr := c.Query("start_date")
	endDateStr := c.Query("end_date")

	if startDateStr == "" || endDateStr == "" {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Error:   "Invalid request",
			Message: "Both start_date and end_date are required",
		})
		return
	}

	startDate, err := time.Parse(time.RFC3339, startDateStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Error:   "Invalid start_date",
			Message: "start_date must be in RFC3339 format",
		})
		return
	}

	endDate, err := time.Parse(time.RFC3339, endDateStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Error:   "Invalid end_date",
			Message: "end_date must be in RFC3339 format",
		})
		return
	}

	stats, err := h.emailService.GetEmailStatistics(c.Request.Context(), startDate, endDate)
	if err != nil {
		c.JSON(http.StatusInternalServerError, ErrorResponse{
			Error:   "Failed to get email statistics",
			Message: err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, stats)
}

// @Summary Get pending emails
// @Description Get emails that are pending delivery
// @Tags email
// @Accept json
// @Produce json
// @Success 200 {array} models.EmailAudit
// @Failure 500 {object} ErrorResponse
// @Router /email/pending [get]
func (h *EmailHandler) GetPendingEmails(c *gin.Context) {
	emails, err := h.emailService.GetPendingEmails(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, ErrorResponse{
			Error:   "Failed to get pending emails",
			Message: err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, emails)
}

// @Summary Get failed emails
// @Description Get emails that failed to deliver
// @Tags email
// @Accept json
// @Produce json
// @Success 200 {array} models.EmailAudit
// @Failure 500 {object} ErrorResponse
// @Router /email/failed [get]
func (h *EmailHandler) GetFailedEmails(c *gin.Context) {
	emails, err := h.emailService.GetFailedEmails(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, ErrorResponse{
			Error:   "Failed to get failed emails",
			Message: err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, emails)
}

// @Summary Get available email templates
// @Description Get all available email templates
// @Tags email
// @Accept json
// @Produce json
// @Success 200 {array} services.EmailTemplate
// @Failure 500 {object} ErrorResponse
// @Router /email/templates [get]
func (h *EmailHandler) GetAvailableTemplates(c *gin.Context) {
	templates, err := h.emailService.GetAvailableTemplates(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, ErrorResponse{
			Error:   "Failed to get email templates",
			Message: err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, templates)
}

// ValidateTemplateRequest represents the request body for template validation
type ValidateTemplateRequest struct {
	TemplateContent string `json:"template_content" binding:"required"`
}

// @Summary Validate email template
// @Description Validate an email template syntax
// @Tags email
// @Accept json
// @Produce json
// @Param request body ValidateTemplateRequest true "Template validation data"
// @Success 200 {object} map[string]string
// @Failure 400 {object} ErrorResponse
// @Failure 500 {object} ErrorResponse
// @Router /email/templates/validate [post]
func (h *EmailHandler) ValidateEmailTemplate(c *gin.Context) {
	var req ValidateTemplateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Error:   "Invalid request body",
			Message: err.Error(),
		})
		return
	}

	err := h.emailService.ValidateEmailTemplate(c.Request.Context(), req.TemplateContent)
	if err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Error:   "Template validation failed",
			Message: err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Template is valid",
	})
}

// @Summary Test email configuration
// @Description Test the email configuration
// @Tags email
// @Accept json
// @Produce json
// @Success 200 {object} map[string]string
// @Failure 500 {object} ErrorResponse
// @Router /email/test-config [post]
func (h *EmailHandler) TestEmailConfiguration(c *gin.Context) {
	err := h.emailService.TestEmailConfiguration(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, ErrorResponse{
			Error:   "Email configuration test failed",
			Message: err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Email configuration is valid",
	})
}

// @Summary Get email delivery settings
// @Description Get current email delivery settings
// @Tags email
// @Accept json
// @Produce json
// @Success 200 {object} services.EmailDeliverySettings
// @Failure 500 {object} ErrorResponse
// @Router /email/settings [get]
func (h *EmailHandler) GetEmailDeliverySettings(c *gin.Context) {
	settings, err := h.emailService.GetEmailDeliverySettings(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, ErrorResponse{
			Error:   "Failed to get email delivery settings",
			Message: err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, settings)
}

// @Summary Update email delivery settings
// @Description Update email delivery settings
// @Tags email
// @Accept json
// @Produce json
// @Param settings body services.EmailDeliverySettings true "Email delivery settings"
// @Success 200 {object} map[string]string
// @Failure 400 {object} ErrorResponse
// @Failure 500 {object} ErrorResponse
// @Router /email/settings [put]
func (h *EmailHandler) UpdateEmailDeliverySettings(c *gin.Context) {
	var settings services.EmailDeliverySettings
	if err := c.ShouldBindJSON(&settings); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Error:   "Invalid request body",
			Message: err.Error(),
		})
		return
	}

	err := h.emailService.UpdateEmailDeliverySettings(c.Request.Context(), &settings)
	if err != nil {
		if isValidationError(err) {
			c.JSON(http.StatusBadRequest, ErrorResponse{
				Error:   "Validation failed",
				Message: err.Error(),
			})
			return
		}
		c.JSON(http.StatusInternalServerError, ErrorResponse{
			Error:   "Failed to update email delivery settings",
			Message: err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Email delivery settings updated successfully",
	})
}

// Lambda-compatible handler methods

// HandleSendReceipt handles receipt email sending for Lambda
func (h *EmailHandler) HandleSendReceipt(ctx context.Context, req *lambda.Request) (*lambda.Response, error) {
	var sendReq SendReceiptRequest
	if err := json.Unmarshal(req.Body, &sendReq); err != nil {
		return &lambda.Response{
			StatusCode: http.StatusBadRequest,
			Headers:    map[string]string{"Content-Type": "application/json"},
			Body:       []byte(`{"error": "Invalid request body", "message": "` + err.Error() + `"}`),
		}, nil
	}

	// Validate UUID format
	if _, err := uuid.Parse(sendReq.ReceiptID); err != nil {
		return &lambda.Response{
			StatusCode: http.StatusBadRequest,
			Headers:    map[string]string{"Content-Type": "application/json"},
			Body:       []byte(`{"error": "Invalid receipt ID", "message": "Receipt ID must be a valid UUID"}`),
		}, nil
	}

	emailAudit, err := h.emailService.SendReceiptEmail(ctx, sendReq.ReceiptID, sendReq.RecipientEmail)
	if err != nil {
		if isNotFoundError(err) {
			return &lambda.Response{
				StatusCode: http.StatusNotFound,
				Headers:    map[string]string{"Content-Type": "application/json"},
				Body:       []byte(`{"error": "Receipt not found", "message": "` + err.Error() + `"}`),
			}, nil
		}
		if isValidationError(err) {
			return &lambda.Response{
				StatusCode: http.StatusBadRequest,
				Headers:    map[string]string{"Content-Type": "application/json"},
				Body:       []byte(`{"error": "Validation failed", "message": "` + err.Error() + `"}`),
			}, nil
		}
		return &lambda.Response{
			StatusCode: http.StatusInternalServerError,
			Headers:    map[string]string{"Content-Type": "application/json"},
			Body:       []byte(`{"error": "Failed to send receipt email", "message": "` + err.Error() + `"}`),
		}, nil
	}

	responseBody, err := json.Marshal(emailAudit)
	if err != nil {
		return &lambda.Response{
			StatusCode: http.StatusInternalServerError,
			Headers:    map[string]string{"Content-Type": "application/json"},
			Body:       []byte(`{"error": "Failed to marshal response"}`),
		}, nil
	}

	return &lambda.Response{
		StatusCode: http.StatusOK,
		Headers:    map[string]string{"Content-Type": "application/json"},
		Body:       responseBody,
	}, nil
}

// HandleSendBulk handles bulk email sending for Lambda
func (h *EmailHandler) HandleSendBulk(ctx context.Context, req *lambda.Request) (*lambda.Response, error) {
	var bulkReq SendBulkEmailRequest
	if err := json.Unmarshal(req.Body, &bulkReq); err != nil {
		return &lambda.Response{
			StatusCode: http.StatusBadRequest,
			Headers:    map[string]string{"Content-Type": "application/json"},
			Body:       []byte(`{"error": "Invalid request body", "message": "` + err.Error() + `"}`),
		}, nil
	}

	// Validate receipt IDs
	for _, receiptID := range bulkReq.ReceiptIDs {
		if _, err := uuid.Parse(receiptID); err != nil {
			return &lambda.Response{
				StatusCode: http.StatusBadRequest,
				Headers:    map[string]string{"Content-Type": "application/json"},
				Body:       []byte(`{"error": "Invalid receipt ID", "message": "Receipt ID ` + receiptID + ` must be a valid UUID"}`),
			}, nil
		}
	}

	results, err := h.emailService.SendBulkReceiptEmails(ctx, bulkReq.ReceiptIDs, bulkReq.RecipientEmails)
	if err != nil {
		return &lambda.Response{
			StatusCode: http.StatusInternalServerError,
			Headers:    map[string]string{"Content-Type": "application/json"},
			Body:       []byte(`{"error": "Failed to send bulk emails", "message": "` + err.Error() + `"}`),
		}, nil
	}

	responseBody, err := json.Marshal(results)
	if err != nil {
		return &lambda.Response{
			StatusCode: http.StatusInternalServerError,
			Headers:    map[string]string{"Content-Type": "application/json"},
			Body:       []byte(`{"error": "Failed to marshal response"}`),
		}, nil
	}

	return &lambda.Response{
		StatusCode: http.StatusOK,
		Headers:    map[string]string{"Content-Type": "application/json"},
		Body:       responseBody,
	}, nil
}

// HandleGetStatus handles email status retrieval for Lambda
func (h *EmailHandler) HandleGetStatus(ctx context.Context, req *lambda.Request) (*lambda.Response, error) {
	id := req.PathParams["id"]
	if id == "" {
		return &lambda.Response{
			StatusCode: http.StatusBadRequest,
			Headers:    map[string]string{"Content-Type": "application/json"},
			Body:       []byte(`{"error": "Invalid request", "message": "Email ID is required"}`),
		}, nil
	}

	// Validate UUID format
	if _, err := uuid.Parse(id); err != nil {
		return &lambda.Response{
			StatusCode: http.StatusBadRequest,
			Headers:    map[string]string{"Content-Type": "application/json"},
			Body:       []byte(`{"error": "Invalid email ID", "message": "Email ID must be a valid UUID"}`),
		}, nil
	}

	emailAudit, err := h.emailService.GetEmailStatus(ctx, id)
	if err != nil {
		if isNotFoundError(err) {
			return &lambda.Response{
				StatusCode: http.StatusNotFound,
				Headers:    map[string]string{"Content-Type": "application/json"},
				Body:       []byte(`{"error": "Email not found", "message": "` + err.Error() + `"}`),
			}, nil
		}
		return &lambda.Response{
			StatusCode: http.StatusInternalServerError,
			Headers:    map[string]string{"Content-Type": "application/json"},
			Body:       []byte(`{"error": "Failed to get email status", "message": "` + err.Error() + `"}`),
		}, nil
	}

	responseBody, err := json.Marshal(emailAudit)
	if err != nil {
		return &lambda.Response{
			StatusCode: http.StatusInternalServerError,
			Headers:    map[string]string{"Content-Type": "application/json"},
			Body:       []byte(`{"error": "Failed to marshal response"}`),
		}, nil
	}

	return &lambda.Response{
		StatusCode: http.StatusOK,
		Headers:    map[string]string{"Content-Type": "application/json"},
		Body:       responseBody,
	}, nil
}
