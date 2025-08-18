package repositories

import (
	"errors"
	"fmt"
)

// Common repository errors
var (
	// ErrNotFound is returned when an entity is not found
	ErrNotFound = errors.New("entity not found")

	// ErrDuplicateEntry is returned when trying to create a duplicate entity
	ErrDuplicateEntry = errors.New("duplicate entry")

	// ErrInvalidID is returned when an invalid ID is provided
	ErrInvalidID = errors.New("invalid ID")

	// ErrValidation is returned when entity validation fails
	ErrValidation = errors.New("validation error")

	// ErrTransaction is returned when a transaction operation fails
	ErrTransaction = errors.New("transaction error")

	// ErrConnection is returned when database connection fails
	ErrConnection = errors.New("database connection error")

	// ErrConstraint is returned when a database constraint is violated
	ErrConstraint = errors.New("constraint violation")

	// ErrConcurrency is returned when a concurrency conflict occurs
	ErrConcurrency = errors.New("concurrency conflict")

	// ErrTimeout is returned when an operation times out
	ErrTimeout = errors.New("operation timeout")

	// ErrUnsupported is returned when an unsupported operation is attempted
	ErrUnsupported = errors.New("unsupported operation")
)

// RepositoryError represents a repository-specific error with additional context
type RepositoryError struct {
	Op      string // Operation that failed
	Entity  string // Entity type
	ID      string // Entity ID (if applicable)
	Err     error  // Underlying error
	Message string // Human-readable message
}

// Error implements the error interface
func (e *RepositoryError) Error() string {
	if e.Message != "" {
		return e.Message
	}

	if e.ID != "" {
		return fmt.Sprintf("%s %s operation failed for ID %s: %v", e.Entity, e.Op, e.ID, e.Err)
	}

	return fmt.Sprintf("%s %s operation failed: %v", e.Entity, e.Op, e.Err)
}

// Unwrap returns the underlying error
func (e *RepositoryError) Unwrap() error {
	return e.Err
}

// Is checks if the error matches the target error
func (e *RepositoryError) Is(target error) bool {
	return errors.Is(e.Err, target)
}

// NewRepositoryError creates a new repository error
func NewRepositoryError(op, entity, id string, err error) *RepositoryError {
	return &RepositoryError{
		Op:     op,
		Entity: entity,
		ID:     id,
		Err:    err,
	}
}

// NewRepositoryErrorWithMessage creates a new repository error with a custom message
func NewRepositoryErrorWithMessage(op, entity, id, message string, err error) *RepositoryError {
	return &RepositoryError{
		Op:      op,
		Entity:  entity,
		ID:      id,
		Err:     err,
		Message: message,
	}
}

// NotFoundError creates a "not found" repository error
func NotFoundError(entity, id string) *RepositoryError {
	return &RepositoryError{
		Op:      "get",
		Entity:  entity,
		ID:      id,
		Err:     ErrNotFound,
		Message: fmt.Sprintf("%s with ID %s not found", entity, id),
	}
}

// DuplicateError creates a "duplicate entry" repository error
func DuplicateError(entity, field, value string) *RepositoryError {
	return &RepositoryError{
		Op:      "create",
		Entity:  entity,
		Err:     ErrDuplicateEntry,
		Message: fmt.Sprintf("%s with %s '%s' already exists", entity, field, value),
	}
}

// ValidationError creates a "validation" repository error
func ValidationError(entity, id string, err error) *RepositoryError {
	return &RepositoryError{
		Op:      "validate",
		Entity:  entity,
		ID:      id,
		Err:     ErrValidation,
		Message: fmt.Sprintf("validation failed for %s: %v", entity, err),
	}
}

// ConstraintError creates a "constraint violation" repository error
func ConstraintError(entity, constraint string, err error) *RepositoryError {
	return &RepositoryError{
		Op:      "constraint",
		Entity:  entity,
		Err:     ErrConstraint,
		Message: fmt.Sprintf("constraint violation for %s (%s): %v", entity, constraint, err),
	}
}

// TransactionError creates a "transaction" repository error
func TransactionError(op string, err error) *RepositoryError {
	return &RepositoryError{
		Op:      op,
		Entity:  "transaction",
		Err:     ErrTransaction,
		Message: fmt.Sprintf("transaction %s failed: %v", op, err),
	}
}

// ConnectionError creates a "connection" repository error
func ConnectionError(err error) *RepositoryError {
	return &RepositoryError{
		Op:      "connect",
		Entity:  "database",
		Err:     ErrConnection,
		Message: fmt.Sprintf("database connection failed: %v", err),
	}
}

// IsNotFound checks if an error is a "not found" error
func IsNotFound(err error) bool {
	var repoErr *RepositoryError
	if errors.As(err, &repoErr) {
		return errors.Is(repoErr.Err, ErrNotFound)
	}
	return errors.Is(err, ErrNotFound)
}

// IsDuplicate checks if an error is a "duplicate entry" error
func IsDuplicate(err error) bool {
	var repoErr *RepositoryError
	if errors.As(err, &repoErr) {
		return errors.Is(repoErr.Err, ErrDuplicateEntry)
	}
	return errors.Is(err, ErrDuplicateEntry)
}

// IsValidation checks if an error is a "validation" error
func IsValidation(err error) bool {
	var repoErr *RepositoryError
	if errors.As(err, &repoErr) {
		return errors.Is(repoErr.Err, ErrValidation)
	}
	return errors.Is(err, ErrValidation)
}

// IsConstraint checks if an error is a "constraint violation" error
func IsConstraint(err error) bool {
	var repoErr *RepositoryError
	if errors.As(err, &repoErr) {
		return errors.Is(repoErr.Err, ErrConstraint)
	}
	return errors.Is(err, ErrConstraint)
}

// IsTransaction checks if an error is a "transaction" error
func IsTransaction(err error) bool {
	var repoErr *RepositoryError
	if errors.As(err, &repoErr) {
		return errors.Is(repoErr.Err, ErrTransaction)
	}
	return errors.Is(err, ErrTransaction)
}

// IsConnection checks if an error is a "connection" error
func IsConnection(err error) bool {
	var repoErr *RepositoryError
	if errors.As(err, &repoErr) {
		return errors.Is(repoErr.Err, ErrConnection)
	}
	return errors.Is(err, ErrConnection)
}
