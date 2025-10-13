package middleware

import (
	"bytes"
	"fmt"
	"io"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/sirupsen/logrus"
)

// RequestIDKey is the key used to store request ID in context
const RequestIDKey = "request_id"

// CorrelationIDKey is the key used to store correlation ID in context
const CorrelationIDKey = "correlation_id"

// responseWriter wraps gin.ResponseWriter to capture response body
type responseWriter struct {
	gin.ResponseWriter
	body *bytes.Buffer
}

func (w *responseWriter) Write(b []byte) (int, error) {
	w.body.Write(b)
	return w.ResponseWriter.Write(b)
}

// RequestID middleware adds a unique request ID to each request
func RequestID() gin.HandlerFunc {
	return func(c *gin.Context) {
		requestID := c.GetHeader("X-Request-ID")
		if requestID == "" {
			requestID = uuid.New().String()
		}

		c.Set(RequestIDKey, requestID)
		c.Header("X-Request-ID", requestID)
		c.Next()
	}
}

// CorrelationID middleware adds correlation ID for distributed tracing
func CorrelationID() gin.HandlerFunc {
	return func(c *gin.Context) {
		correlationID := c.GetHeader("X-Correlation-ID")
		if correlationID == "" {
			correlationID = uuid.New().String()
		}

		c.Set(CorrelationIDKey, correlationID)
		c.Header("X-Correlation-ID", correlationID)
		c.Next()
	}
}

// StructuredLogger provides structured logging with request context
func StructuredLogger() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		path := c.Request.URL.Path
		raw := c.Request.URL.RawQuery

		// Capture request body for logging (be careful with large payloads)
		var requestBody []byte
		if c.Request.Body != nil && c.Request.ContentLength < 1024*10 { // Only log bodies < 10KB
			requestBody, _ = io.ReadAll(c.Request.Body)
			c.Request.Body = io.NopCloser(bytes.NewBuffer(requestBody))
		}

		// Wrap response writer to capture response body
		responseBodyWriter := &responseWriter{
			ResponseWriter: c.Writer,
			body:           bytes.NewBufferString(""),
		}
		c.Writer = responseBodyWriter

		c.Next()

		// Calculate latency
		latency := time.Since(start)

		// Get context values
		requestID := c.GetString(RequestIDKey)
		correlationID := c.GetString(CorrelationIDKey)
		userID := c.GetString("user_id")

		// Build log fields
		fields := logrus.Fields{
			"timestamp":      start.Format(time.RFC3339Nano),
			"request_id":     requestID,
			"correlation_id": correlationID,
			"method":         c.Request.Method,
			"path":           path,
			"status_code":    c.Writer.Status(),
			"latency_ms":     float64(latency.Nanoseconds()) / 1000000,
			"client_ip":      c.ClientIP(),
			"user_agent":     c.Request.UserAgent(),
			"content_length": c.Request.ContentLength,
			"response_size":  c.Writer.Size(),
		}

		if raw != "" {
			fields["query"] = raw
		}

		if userID != "" {
			fields["user_id"] = userID
		}

		// Add request body to logs for debugging (only for non-production)
		if gin.Mode() == gin.DebugMode && len(requestBody) > 0 {
			fields["request_body"] = string(requestBody)
		}

		// Add response body for errors (only for debugging)
		if gin.Mode() == gin.DebugMode && c.Writer.Status() >= 400 && responseBodyWriter.body.Len() < 1024 {
			fields["response_body"] = responseBodyWriter.body.String()
		}

		// Log based on status code
		switch {
		case c.Writer.Status() >= 500:
			logrus.WithFields(fields).Error("Server error")
		case c.Writer.Status() >= 400:
			logrus.WithFields(fields).Warn("Client error")
		case c.Writer.Status() >= 300:
			logrus.WithFields(fields).Info("Redirect")
		default:
			logrus.WithFields(fields).Info("Request completed")
		}
	}
}

// AuditLogger logs important business operations
func AuditLogger() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Only audit write operations
		if c.Request.Method == "GET" || c.Request.Method == "HEAD" || c.Request.Method == "OPTIONS" {
			c.Next()
			return
		}

		start := time.Now()
		c.Next()

		// Get context values
		requestID := c.GetString(RequestIDKey)
		userID := c.GetString("user_id")
		username := c.GetString("username")

		// Log audit trail for write operations
		fields := logrus.Fields{
			"audit":          true,
			"timestamp":      start.Format(time.RFC3339Nano),
			"request_id":     requestID,
			"user_id":        userID,
			"username":       username,
			"method":         c.Request.Method,
			"path":           c.Request.URL.Path,
			"status_code":    c.Writer.Status(),
			"client_ip":      c.ClientIP(),
			"user_agent":     c.Request.UserAgent(),
			"operation_time": time.Since(start).Milliseconds(),
		}

		// Add operation type based on path
		path := c.Request.URL.Path
		switch {
		case c.Request.Method == "POST":
			fields["operation"] = "CREATE"
		case c.Request.Method == "PUT" || c.Request.Method == "PATCH":
			fields["operation"] = "UPDATE"
		case c.Request.Method == "DELETE":
			fields["operation"] = "DELETE"
		}

		// Add resource type based on path
		switch {
		case contains(path, "/customers"):
			fields["resource_type"] = "customer"
		case contains(path, "/products"):
			fields["resource_type"] = "product"
		case contains(path, "/receipts"):
			fields["resource_type"] = "receipt"
		case contains(path, "/email"):
			fields["resource_type"] = "email"
		}

		// Extract resource ID from path if present
		if resourceID := extractResourceID(path); resourceID != "" {
			fields["resource_id"] = resourceID
		}

		logrus.WithFields(fields).Info("Audit log")
	}
}

// PerformanceMonitor logs slow requests and performance metrics
func PerformanceMonitor(slowThreshold time.Duration) gin.HandlerFunc {
	if slowThreshold == 0 {
		slowThreshold = 1 * time.Second // Default threshold
	}

	return func(c *gin.Context) {
		start := time.Now()
		c.Next()
		latency := time.Since(start)

		// Log slow requests
		if latency > slowThreshold {
			requestID := c.GetString(RequestIDKey)
			userID := c.GetString("user_id")

			logrus.WithFields(logrus.Fields{
				"performance_alert": true,
				"request_id":        requestID,
				"user_id":           userID,
				"method":            c.Request.Method,
				"path":              c.Request.URL.Path,
				"latency_ms":        float64(latency.Nanoseconds()) / 1000000,
				"threshold_ms":      float64(slowThreshold.Nanoseconds()) / 1000000,
				"status_code":       c.Writer.Status(),
			}).Warn("Slow request detected")
		}

		// Log performance metrics periodically (could be sent to monitoring system)
		if latency > 100*time.Millisecond { // Log requests over 100ms
			requestID := c.GetString(RequestIDKey)

			logrus.WithFields(logrus.Fields{
				"metrics":      true,
				"request_id":   requestID,
				"method":       c.Request.Method,
				"path":         c.Request.URL.Path,
				"latency_ms":   float64(latency.Nanoseconds()) / 1000000,
				"status_code":  c.Writer.Status(),
				"memory_usage": getMemoryUsage(), // Could implement memory tracking
			}).Debug("Performance metrics")
		}
	}
}

// ErrorTracker logs and tracks errors for monitoring
func ErrorTracker() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Next()

		// Track errors
		if len(c.Errors) > 0 {
			requestID := c.GetString(RequestIDKey)
			correlationID := c.GetString(CorrelationIDKey)
			userID := c.GetString("user_id")

			for _, err := range c.Errors {
				fields := logrus.Fields{
					"error_tracking": true,
					"request_id":     requestID,
					"correlation_id": correlationID,
					"user_id":        userID,
					"method":         c.Request.Method,
					"path":           c.Request.URL.Path,
					"error_type":     fmt.Sprintf("%d", err.Type),
					"error_message":  err.Error(),
					"status_code":    c.Writer.Status(),
					"client_ip":      c.ClientIP(),
					"user_agent":     c.Request.UserAgent(),
				}

				// Add stack trace for internal errors
				if err.Type == gin.ErrorTypePrivate {
					fields["stack_trace"] = fmt.Sprintf("%+v", err.Err)
				}

				logrus.WithFields(fields).Error("Error tracked")
			}
		}

		// Track HTTP errors
		if c.Writer.Status() >= 400 {
			requestID := c.GetString(RequestIDKey)
			userID := c.GetString("user_id")

			fields := logrus.Fields{
				"http_error":  true,
				"request_id":  requestID,
				"user_id":     userID,
				"method":      c.Request.Method,
				"path":        c.Request.URL.Path,
				"status_code": c.Writer.Status(),
				"client_ip":   c.ClientIP(),
				"user_agent":  c.Request.UserAgent(),
			}

			if c.Writer.Status() >= 500 {
				logrus.WithFields(fields).Error("HTTP server error")
			} else {
				logrus.WithFields(fields).Warn("HTTP client error")
			}
		}
	}
}

// Helper functions

func contains(s, substr string) bool {
	return len(s) >= len(substr) && (s[:len(substr)] == substr || s[len(s)-len(substr):] == substr)
}

func extractResourceID(path string) string {
	// Simple extraction - could be more sophisticated
	parts := splitPath(path)
	for i, part := range parts {
		if isUUID(part) {
			return part
		}
		// Look for ID patterns
		if i > 0 && (parts[i-1] == "customers" || parts[i-1] == "products" || parts[i-1] == "receipts") {
			return part
		}
	}
	return ""
}

func splitPath(path string) []string {
	var parts []string
	current := ""
	for _, char := range path {
		if char == '/' {
			if current != "" {
				parts = append(parts, current)
				current = ""
			}
		} else {
			current += string(char)
		}
	}
	if current != "" {
		parts = append(parts, current)
	}
	return parts
}

func isUUID(s string) bool {
	_, err := uuid.Parse(s)
	return err == nil
}

func getMemoryUsage() string {
	// Placeholder - could implement actual memory usage tracking
	return "N/A"
}
