package storage

import (
	"errors"
	"fmt"
)

// Common storage error types
var (
	ErrFileNotFound       = errors.New("file not found")
	ErrFileAlreadyExists  = errors.New("file already exists")
	ErrInvalidKey         = errors.New("invalid storage key")
	ErrInvalidData        = errors.New("invalid data")
	ErrStorageUnavailable = errors.New("storage service unavailable")
	ErrPermissionDenied   = errors.New("permission denied")
	ErrQuotaExceeded      = errors.New("storage quota exceeded")
	ErrNetworkError       = errors.New("network error")
	ErrTimeout            = errors.New("operation timeout")
)

// StorageError represents a storage operation error with additional context
type StorageError struct {
	Op        string // Operation that failed (e.g., "Store", "Retrieve")
	Key       string // Storage key involved in the operation
	Err       error  // Underlying error
	Retryable bool   // Whether the operation can be retried
}

func (e *StorageError) Error() string {
	if e.Key != "" {
		return fmt.Sprintf("storage %s operation failed for key '%s': %v", e.Op, e.Key, e.Err)
	}
	return fmt.Sprintf("storage %s operation failed: %v", e.Op, e.Err)
}

func (e *StorageError) Unwrap() error {
	return e.Err
}

// IsRetryable returns true if the error indicates a retryable condition
func (e *StorageError) IsRetryable() bool {
	return e.Retryable
}

// NewStorageError creates a new StorageError
func NewStorageError(op, key string, err error, retryable bool) *StorageError {
	return &StorageError{
		Op:        op,
		Key:       key,
		Err:       err,
		Retryable: retryable,
	}
}

// IsNotFound returns true if the error indicates a file was not found
func IsNotFound(err error) bool {
	var storageErr *StorageError
	if errors.As(err, &storageErr) {
		return errors.Is(storageErr.Err, ErrFileNotFound)
	}
	return errors.Is(err, ErrFileNotFound)
}

// IsAlreadyExists returns true if the error indicates a file already exists
func IsAlreadyExists(err error) bool {
	var storageErr *StorageError
	if errors.As(err, &storageErr) {
		return errors.Is(storageErr.Err, ErrFileAlreadyExists)
	}
	return errors.Is(err, ErrFileAlreadyExists)
}

// IsRetryable returns true if the error indicates a retryable condition
func IsRetryable(err error) bool {
	var storageErr *StorageError
	if errors.As(err, &storageErr) {
		return storageErr.IsRetryable()
	}

	// Check for common retryable errors
	return errors.Is(err, ErrStorageUnavailable) ||
		errors.Is(err, ErrNetworkError) ||
		errors.Is(err, ErrTimeout)
}
