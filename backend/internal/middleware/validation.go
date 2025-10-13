package middleware

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/go-playground/validator/v10"
	"github.com/sirupsen/logrus"
	"golang.org/x/time/rate"
)

// ValidationError represents a validation error with field details
type ValidationError struct {
	Field   string `json:"field"`
	Tag     string `json:"tag"`
	Value   string `json:"value"`
	Message string `json:"message"`
}

// ErrorResponse represents a standardized error response
type ErrorResponse struct {
	Error            string            `json:"error"`
	Message          string            `json:"message"`
	ValidationErrors []ValidationError `json:"validation_errors,omitempty"`
	RequestID        string            `json:"request_id,omitempty"`
	Timestamp        string            `json:"timestamp"`
}

// RequestValidation middleware for validating common request parameters
func RequestValidation() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Validate common query parameters
		if err := validateQueryParams(c); err != nil {
			c.JSON(http.StatusBadRequest, ErrorResponse{
				Error:     "Invalid query parameters",
				Message:   err.Error(),
				RequestID: c.GetString(RequestIDKey),
				Timestamp: time.Now().Format(time.RFC3339),
			})
			c.Abort()
			return
		}

		// Validate path parameters
		if err := validatePathParams(c); err != nil {
			c.JSON(http.StatusBadRequest, ErrorResponse{
				Error:     "Invalid path parameters",
				Message:   err.Error(),
				RequestID: c.GetString(RequestIDKey),
				Timestamp: time.Now().Format(time.RFC3339),
			})
			c.Abort()
			return
		}

		c.Next()
	}
}

// EnhancedErrorHandler provides comprehensive error handling
func EnhancedErrorHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Next()

		if len(c.Errors) > 0 {
			err := c.Errors.Last()
			requestID := c.GetString(RequestIDKey)

			// Log the error with context
			logrus.WithFields(logrus.Fields{
				"request_id": requestID,
				"method":     c.Request.Method,
				"path":       c.Request.URL.Path,
				"error":      err.Error(),
				"error_type": fmt.Sprintf("%d", err.Type),
				"user_id":    c.GetString("user_id"),
			}).Error("Request error")

			var response ErrorResponse
			response.RequestID = requestID
			response.Timestamp = time.Now().Format(time.RFC3339)

			switch err.Type {
			case gin.ErrorTypeBind:
				// Handle validation errors from binding
				if validationErrors, ok := err.Err.(validator.ValidationErrors); ok {
					response.Error = "Validation failed"
					response.Message = "Request validation failed"
					response.ValidationErrors = formatValidationErrors(validationErrors)
					c.JSON(http.StatusBadRequest, response)
				} else {
					response.Error = "Invalid request format"
					response.Message = err.Error()
					c.JSON(http.StatusBadRequest, response)
				}

			case gin.ErrorTypePublic:
				// Handle public errors (business logic errors)
				response.Error = "Request failed"
				response.Message = err.Error()
				c.JSON(http.StatusBadRequest, response)

			case gin.ErrorTypePrivate:
				// Handle internal errors (don't expose details)
				response.Error = "Internal server error"
				response.Message = "An internal error occurred"
				c.JSON(http.StatusInternalServerError, response)

			default:
				// Handle unknown errors
				response.Error = "Unknown error"
				response.Message = "An unexpected error occurred"
				c.JSON(http.StatusInternalServerError, response)
			}
		}
	}
}

// RateLimiter implements rate limiting middleware
func RateLimiter(requestsPerSecond float64, burstSize int) gin.HandlerFunc {
	limiter := rate.NewLimiter(rate.Limit(requestsPerSecond), burstSize)

	return func(c *gin.Context) {
		if !limiter.Allow() {
			logrus.WithFields(logrus.Fields{
				"client_ip":  c.ClientIP(),
				"path":       c.Request.URL.Path,
				"user_agent": c.Request.UserAgent(),
				"user_id":    c.GetString("user_id"),
			}).Warn("Rate limit exceeded")

			c.JSON(http.StatusTooManyRequests, ErrorResponse{
				Error:     "Rate limit exceeded",
				Message:   fmt.Sprintf("Too many requests. Limit: %.1f requests per second", requestsPerSecond),
				RequestID: c.GetString(RequestIDKey),
				Timestamp: time.Now().Format(time.RFC3339),
			})
			c.Abort()
			return
		}
		c.Next()
	}
}

// SecurityHeaders adds security headers to responses
func SecurityHeaders() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Security headers
		c.Header("X-Content-Type-Options", "nosniff")
		c.Header("X-Frame-Options", "DENY")
		c.Header("X-XSS-Protection", "1; mode=block")
		c.Header("Referrer-Policy", "strict-origin-when-cross-origin")
		c.Header("Content-Security-Policy", "default-src 'self'")

		// Remove server information
		c.Header("Server", "")

		c.Next()
	}
}

// ContentTypeValidation validates request content types
func ContentTypeValidation(allowedTypes ...string) gin.HandlerFunc {
	if len(allowedTypes) == 0 {
		allowedTypes = []string{"application/json"}
	}

	return func(c *gin.Context) {
		// Skip validation for GET, HEAD, OPTIONS requests
		if c.Request.Method == "GET" || c.Request.Method == "HEAD" || c.Request.Method == "OPTIONS" {
			c.Next()
			return
		}

		contentType := c.GetHeader("Content-Type")
		if contentType == "" {
			c.JSON(http.StatusBadRequest, ErrorResponse{
				Error:     "Missing Content-Type header",
				Message:   "Content-Type header is required",
				RequestID: c.GetString(RequestIDKey),
				Timestamp: time.Now().Format(time.RFC3339),
			})
			c.Abort()
			return
		}

		// Extract main content type (ignore charset, boundary, etc.)
		mainType := strings.Split(contentType, ";")[0]
		mainType = strings.TrimSpace(mainType)

		allowed := false
		for _, allowedType := range allowedTypes {
			if mainType == allowedType {
				allowed = true
				break
			}
		}

		if !allowed {
			c.JSON(http.StatusUnsupportedMediaType, ErrorResponse{
				Error:     "Unsupported Content-Type",
				Message:   fmt.Sprintf("Content-Type '%s' is not supported. Allowed types: %v", mainType, allowedTypes),
				RequestID: c.GetString(RequestIDKey),
				Timestamp: time.Now().Format(time.RFC3339),
			})
			c.Abort()
			return
		}

		c.Next()
	}
}

// RequestSizeLimit limits the size of request bodies
func RequestSizeLimit(maxSize int64) gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.Request.ContentLength > maxSize {
			c.JSON(http.StatusRequestEntityTooLarge, ErrorResponse{
				Error:     "Request too large",
				Message:   fmt.Sprintf("Request body size (%d bytes) exceeds maximum allowed size (%d bytes)", c.Request.ContentLength, maxSize),
				RequestID: c.GetString(RequestIDKey),
				Timestamp: time.Now().Format(time.RFC3339),
			})
			c.Abort()
			return
		}

		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxSize)
		c.Next()
	}
}

// Helper functions

func validateQueryParams(c *gin.Context) error {
	// Validate common pagination parameters
	if limit := c.Query("limit"); limit != "" {
		if val, err := strconv.Atoi(limit); err != nil || val < 0 || val > 1000 {
			return fmt.Errorf("invalid limit parameter: must be a positive integer <= 1000")
		}
	}

	if offset := c.Query("offset"); offset != "" {
		if val, err := strconv.Atoi(offset); err != nil || val < 0 {
			return fmt.Errorf("invalid offset parameter: must be a non-negative integer")
		}
	}

	// Validate date parameters
	dateParams := []string{"start_date", "end_date", "created_after", "created_before", "date"}
	for _, param := range dateParams {
		if value := c.Query(param); value != "" {
			if _, err := time.Parse(time.RFC3339, value); err != nil {
				return fmt.Errorf("invalid %s parameter: must be in RFC3339 format", param)
			}
		}
	}

	// Validate boolean parameters
	boolParams := []string{"active", "gst_applicable", "has_abn", "has_email", "is_tax_invoice", "gst_charged", "force_tax_invoice"}
	for _, param := range boolParams {
		if value := c.Query(param); value != "" {
			if _, err := strconv.ParseBool(value); err != nil {
				return fmt.Errorf("invalid %s parameter: must be a boolean (true/false)", param)
			}
		}
	}

	// Validate numeric parameters
	numericParams := []string{"min_price", "max_price", "min_amount", "max_amount", "year", "month"}
	for _, param := range numericParams {
		if value := c.Query(param); value != "" {
			if _, err := strconv.ParseFloat(value, 64); err != nil {
				return fmt.Errorf("invalid %s parameter: must be a valid number", param)
			}
		}
	}

	return nil
}

func validatePathParams(c *gin.Context) error {
	// Validate UUID parameters
	uuidParams := []string{"id", "customer_id", "product_id", "receipt_id"}
	for _, param := range uuidParams {
		if value := c.Param(param); value != "" {
			if !isValidUUID(value) {
				return fmt.Errorf("invalid %s parameter: must be a valid UUID", param)
			}
		}
	}

	return nil
}

func isValidUUID(s string) bool {
	// Simple UUID validation - could use uuid.Parse for more thorough validation
	if len(s) != 36 {
		return false
	}

	for i, char := range s {
		if i == 8 || i == 13 || i == 18 || i == 23 {
			if char != '-' {
				return false
			}
		} else {
			if !((char >= '0' && char <= '9') || (char >= 'a' && char <= 'f') || (char >= 'A' && char <= 'F')) {
				return false
			}
		}
	}

	return true
}

func formatValidationErrors(validationErrors validator.ValidationErrors) []ValidationError {
	var errors []ValidationError

	for _, err := range validationErrors {
		var message string

		switch err.Tag() {
		case "required":
			message = fmt.Sprintf("%s is required", err.Field())
		case "email":
			message = fmt.Sprintf("%s must be a valid email address", err.Field())
		case "min":
			message = fmt.Sprintf("%s must be at least %s", err.Field(), err.Param())
		case "max":
			message = fmt.Sprintf("%s must be at most %s", err.Field(), err.Param())
		case "uuid":
			message = fmt.Sprintf("%s must be a valid UUID", err.Field())
		case "oneof":
			message = fmt.Sprintf("%s must be one of: %s", err.Field(), err.Param())
		default:
			message = fmt.Sprintf("%s is invalid", err.Field())
		}

		errors = append(errors, ValidationError{
			Field:   err.Field(),
			Tag:     err.Tag(),
			Value:   fmt.Sprintf("%v", err.Value()),
			Message: message,
		})
	}

	return errors
}
