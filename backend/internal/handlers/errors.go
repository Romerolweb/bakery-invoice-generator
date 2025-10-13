package handlers

import (
	"strings"
)

// ErrorResponse represents a standard error response
type ErrorResponse struct {
	Error   string `json:"error"`
	Message string `json:"message"`
}

// isValidationError checks if an error is a validation error
func isValidationError(err error) bool {
	if err == nil {
		return false
	}
	errMsg := strings.ToLower(err.Error())
	return strings.Contains(errMsg, "validation") ||
		strings.Contains(errMsg, "invalid") ||
		strings.Contains(errMsg, "required") ||
		strings.Contains(errMsg, "format")
}

// isNotFoundError checks if an error is a not found error
func isNotFoundError(err error) bool {
	if err == nil {
		return false
	}
	errMsg := strings.ToLower(err.Error())
	return strings.Contains(errMsg, "not found") ||
		strings.Contains(errMsg, "does not exist") ||
		strings.Contains(errMsg, "no rows")
}

// isConflictError checks if an error is a conflict error
func isConflictError(err error) bool {
	if err == nil {
		return false
	}
	errMsg := strings.ToLower(err.Error())
	return strings.Contains(errMsg, "cannot delete") ||
		strings.Contains(errMsg, "already exists") ||
		strings.Contains(errMsg, "conflict") ||
		strings.Contains(errMsg, "constraint")
}

// isDuplicateError checks if an error is a duplicate error
func isDuplicateError(err error) bool {
	if err == nil {
		return false
	}
	errMsg := strings.ToLower(err.Error())
	return strings.Contains(errMsg, "duplicate") ||
		strings.Contains(errMsg, "already exists") ||
		strings.Contains(errMsg, "unique constraint")
}
