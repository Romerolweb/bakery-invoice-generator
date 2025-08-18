package storage

import (
	"context"
	"math"
	"math/rand"
	"time"
)

// RetryConfig configures retry behavior for storage operations
type RetryConfig struct {
	MaxAttempts     int           `json:"max_attempts" yaml:"max_attempts"`
	InitialDelay    time.Duration `json:"initial_delay" yaml:"initial_delay"`
	MaxDelay        time.Duration `json:"max_delay" yaml:"max_delay"`
	BackoffFactor   float64       `json:"backoff_factor" yaml:"backoff_factor"`
	JitterEnabled   bool          `json:"jitter_enabled" yaml:"jitter_enabled"`
	RetryableErrors []string      `json:"retryable_errors" yaml:"retryable_errors"`
}

// DefaultRetryConfig returns a sensible default retry configuration
func DefaultRetryConfig() *RetryConfig {
	return &RetryConfig{
		MaxAttempts:   3,
		InitialDelay:  100 * time.Millisecond,
		MaxDelay:      5 * time.Second,
		BackoffFactor: 2.0,
		JitterEnabled: true,
		RetryableErrors: []string{
			"network error",
			"timeout",
			"storage unavailable",
			"temporary failure",
		},
	}
}

// RetryableOperation represents an operation that can be retried
type RetryableOperation func(ctx context.Context) error

// WithRetry executes an operation with retry logic
func WithRetry(ctx context.Context, config *RetryConfig, op RetryableOperation) error {
	if config == nil {
		config = DefaultRetryConfig()
	}

	var lastErr error

	for attempt := 1; attempt <= config.MaxAttempts; attempt++ {
		// Check context cancellation before each attempt
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		// Execute the operation
		err := op(ctx)
		if err == nil {
			return nil // Success
		}

		lastErr = err

		// Check if we should retry
		if attempt >= config.MaxAttempts || !IsRetryable(err) {
			break
		}

		// Calculate delay for next attempt
		delay := config.calculateDelay(attempt)

		// Wait before retrying, but respect context cancellation
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(delay):
			// Continue to next attempt
		}
	}

	return lastErr
}

// calculateDelay calculates the delay before the next retry attempt
func (c *RetryConfig) calculateDelay(attempt int) time.Duration {
	// Exponential backoff: delay = initial_delay * (backoff_factor ^ (attempt - 1))
	delay := float64(c.InitialDelay) * math.Pow(c.BackoffFactor, float64(attempt-1))

	// Cap at max delay
	if delay > float64(c.MaxDelay) {
		delay = float64(c.MaxDelay)
	}

	// Add jitter to prevent thundering herd
	if c.JitterEnabled {
		jitter := rand.Float64() * 0.1 * delay // Up to 10% jitter
		delay += jitter
	}

	return time.Duration(delay)
}

// RetryableFileStorage wraps a FileStorage implementation with retry logic
type RetryableFileStorage struct {
	storage FileStorage
	config  *RetryConfig
}

// NewRetryableFileStorage creates a new RetryableFileStorage
func NewRetryableFileStorage(storage FileStorage, config *RetryConfig) *RetryableFileStorage {
	if config == nil {
		config = DefaultRetryConfig()
	}

	return &RetryableFileStorage{
		storage: storage,
		config:  config,
	}
}

// Store implements FileStorage.Store with retry logic
func (r *RetryableFileStorage) Store(ctx context.Context, key string, data []byte, opts *StoreOptions) error {
	return WithRetry(ctx, r.config, func(ctx context.Context) error {
		return r.storage.Store(ctx, key, data, opts)
	})
}

// Retrieve implements FileStorage.Retrieve with retry logic
func (r *RetryableFileStorage) Retrieve(ctx context.Context, key string) ([]byte, error) {
	var result []byte
	err := WithRetry(ctx, r.config, func(ctx context.Context) error {
		data, err := r.storage.Retrieve(ctx, key)
		if err != nil {
			return err
		}
		result = data
		return nil
	})
	return result, err
}

// Delete implements FileStorage.Delete with retry logic
func (r *RetryableFileStorage) Delete(ctx context.Context, key string) error {
	return WithRetry(ctx, r.config, func(ctx context.Context) error {
		return r.storage.Delete(ctx, key)
	})
}

// Exists implements FileStorage.Exists with retry logic
func (r *RetryableFileStorage) Exists(ctx context.Context, key string) (bool, error) {
	var result bool
	err := WithRetry(ctx, r.config, func(ctx context.Context) error {
		exists, err := r.storage.Exists(ctx, key)
		if err != nil {
			return err
		}
		result = exists
		return nil
	})
	return result, err
}

// GetMetadata implements FileStorage.GetMetadata with retry logic
func (r *RetryableFileStorage) GetMetadata(ctx context.Context, key string) (*FileMetadata, error) {
	var result *FileMetadata
	err := WithRetry(ctx, r.config, func(ctx context.Context) error {
		metadata, err := r.storage.GetMetadata(ctx, key)
		if err != nil {
			return err
		}
		result = metadata
		return nil
	})
	return result, err
}

// List implements FileStorage.List with retry logic
func (r *RetryableFileStorage) List(ctx context.Context, opts *ListOptions) (*ListResult, error) {
	var result *ListResult
	err := WithRetry(ctx, r.config, func(ctx context.Context) error {
		listResult, err := r.storage.List(ctx, opts)
		if err != nil {
			return err
		}
		result = listResult
		return nil
	})
	return result, err
}

// GenerateURL implements FileStorage.GenerateURL with retry logic
func (r *RetryableFileStorage) GenerateURL(ctx context.Context, key string, expiry time.Duration) (string, error) {
	var result string
	err := WithRetry(ctx, r.config, func(ctx context.Context) error {
		url, err := r.storage.GenerateURL(ctx, key, expiry)
		if err != nil {
			return err
		}
		result = url
		return nil
	})
	return result, err
}

// Copy implements FileStorage.Copy with retry logic
func (r *RetryableFileStorage) Copy(ctx context.Context, srcKey, destKey string) error {
	return WithRetry(ctx, r.config, func(ctx context.Context) error {
		return r.storage.Copy(ctx, srcKey, destKey)
	})
}

// Move implements FileStorage.Move with retry logic
func (r *RetryableFileStorage) Move(ctx context.Context, srcKey, destKey string) error {
	return WithRetry(ctx, r.config, func(ctx context.Context) error {
		return r.storage.Move(ctx, srcKey, destKey)
	})
}

// GetSize implements FileStorage.GetSize with retry logic
func (r *RetryableFileStorage) GetSize(ctx context.Context, key string) (int64, error) {
	var result int64
	err := WithRetry(ctx, r.config, func(ctx context.Context) error {
		size, err := r.storage.GetSize(ctx, key)
		if err != nil {
			return err
		}
		result = size
		return nil
	})
	return result, err
}

// Close implements FileStorage.Close
func (r *RetryableFileStorage) Close() error {
	return r.storage.Close()
}
