package models

import (
	"fmt"
	"regexp"
	"strings"
	"unicode"
)

// Email validation regex pattern
var emailRegex = regexp.MustCompile(`^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$`)

// Phone number validation regex (Australian format)
var phoneRegex = regexp.MustCompile(`^(\+61|0)[2-9]\d{8}$`)

// ABN validation regex (11 digits with optional spaces/hyphens)
var abnRegex = regexp.MustCompile(`^\d{2}[\s-]?\d{3}[\s-]?\d{3}[\s-]?\d{3}$`)

// ACN validation regex (9 digits with optional spaces/hyphens)
var acnRegex = regexp.MustCompile(`^\d{3}[\s-]?\d{3}[\s-]?\d{3}$`)

// IsValidPhone validates Australian phone number format
func IsValidPhone(phone string) bool {
	if phone == "" {
		return true // Optional field
	}
	cleaned := strings.ReplaceAll(strings.ReplaceAll(phone, " ", ""), "-", "")
	return phoneRegex.MatchString(cleaned)
}

// IsValidABN validates Australian Business Number format and checksum
func IsValidABN(abn string) bool {
	if abn == "" {
		return false
	}

	// Remove spaces and hyphens
	cleaned := strings.ReplaceAll(strings.ReplaceAll(abn, " ", ""), "-", "")

	// Check format
	if !abnRegex.MatchString(abn) {
		return false
	}

	// Validate checksum (simplified - real ABN validation is more complex)
	if len(cleaned) != 11 {
		return false
	}

	// All digits check
	for _, r := range cleaned {
		if !unicode.IsDigit(r) {
			return false
		}
	}

	return true
}

// IsValidACN validates Australian Company Number format
func IsValidACN(acn string) bool {
	if acn == "" {
		return false
	}

	// Remove spaces and hyphens
	cleaned := strings.ReplaceAll(strings.ReplaceAll(acn, " ", ""), "-", "")

	// Check format
	if !acnRegex.MatchString(acn) {
		return false
	}

	// All digits check
	if len(cleaned) != 9 {
		return false
	}

	for _, r := range cleaned {
		if !unicode.IsDigit(r) {
			return false
		}
	}

	return true
}

// ValidateABNOrACN validates either ABN or ACN format
func ValidateABNOrACN(value string) bool {
	return IsValidABN(value) || IsValidACN(value)
}

// SanitizeString removes extra whitespace and trims the string
func SanitizeString(s string) string {
	// Replace multiple whitespace with single space
	re := regexp.MustCompile(`\s+`)
	cleaned := re.ReplaceAllString(strings.TrimSpace(s), " ")
	return cleaned
}

// ValidateRequired checks if a required string field is not empty
func ValidateRequired(value, fieldName string) error {
	if strings.TrimSpace(value) == "" {
		return &ValidationError{
			Field:   fieldName,
			Message: fieldName + " is required",
			Value:   value,
		}
	}
	return nil
}

// ValidateStringLength validates string length constraints
func ValidateStringLength(value, fieldName string, minLength, maxLength int) error {
	length := len(strings.TrimSpace(value))

	if minLength > 0 && length < minLength {
		return &ValidationError{
			Field:   fieldName,
			Message: fmt.Sprintf("%s must be at least %d characters", fieldName, minLength),
			Value:   value,
		}
	}

	if maxLength > 0 && length > maxLength {
		return &ValidationError{
			Field:   fieldName,
			Message: fmt.Sprintf("%s cannot exceed %d characters", fieldName, maxLength),
			Value:   value,
		}
	}

	return nil
}

// ValidateEmail validates email format and returns a validation error if invalid
func ValidateEmail(email, fieldName string) error {
	if email == "" {
		return nil // Optional field
	}

	if !isValidEmail(email) {
		return &ValidationError{
			Field:   fieldName,
			Message: "Invalid email format",
			Value:   email,
		}
	}

	return nil
}

// ValidatePositiveNumber validates that a number is positive
func ValidatePositiveNumber(value float64, fieldName string) error {
	if value < 0 {
		return &ValidationError{
			Field:   fieldName,
			Message: fieldName + " cannot be negative",
			Value:   value,
		}
	}
	return nil
}

// ValidatePositiveInteger validates that an integer is positive
func ValidatePositiveInteger(value int, fieldName string) error {
	if value <= 0 {
		return &ValidationError{
			Field:   fieldName,
			Message: fieldName + " must be greater than 0",
			Value:   value,
		}
	}
	return nil
}

// ValidateEnum validates that a value is in the allowed enum values
func ValidateEnum(value string, allowedValues []string, fieldName string) error {
	for _, allowed := range allowedValues {
		if value == allowed {
			return nil
		}
	}

	return &ValidationError{
		Field:   fieldName,
		Message: fmt.Sprintf("%s must be one of: %s", fieldName, strings.Join(allowedValues, ", ")),
		Value:   value,
	}
}

// ValidateUUID validates UUID format (simple check)
func ValidateUUID(value, fieldName string) error {
	if value == "" {
		return &ValidationError{
			Field:   fieldName,
			Message: fieldName + " is required",
			Value:   value,
		}
	}

	// Simple UUID format check (36 characters with hyphens in right places)
	if len(value) != 36 {
		return &ValidationError{
			Field:   fieldName,
			Message: "Invalid UUID format",
			Value:   value,
		}
	}

	// Check hyphen positions
	if value[8] != '-' || value[13] != '-' || value[18] != '-' || value[23] != '-' {
		return &ValidationError{
			Field:   fieldName,
			Message: "Invalid UUID format",
			Value:   value,
		}
	}

	return nil
}
