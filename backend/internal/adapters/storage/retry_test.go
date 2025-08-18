package storage

import (
	"context"
	"errors"
	"testing"
	"time"
)

func TestWithRetry_Success(t *testing.T) {
	config := &RetryConfig{
		MaxAttempts:   3,
		InitialDelay:  10 * time.Millisecond,
		MaxDelay:      100 * time.Millisecond,
		BackoffFactor: 2.0,
		JitterEnabled: false,
	}

	attempts := 0
	operation := func(ctx context.Context) error {
		attempts++
		return nil // Success on first attempt
	}

	err := WithRetry(context.Background(), config, operation)
	if err != nil {
		t.Errorf("WithRetry() should succeed, got error: %v", err)
	}

	if attempts != 1 {
		t.Errorf("Expected 1 attempt, got %d", attempts)
	}
}

func TestWithRetry_SuccessAfterRetries(t *testing.T) {
	config := &RetryConfig{
		MaxAttempts:   3,
		InitialDelay:  10 * time.Millisecond,
		MaxDelay:      100 * time.Millisecond,
		BackoffFactor: 2.0,
		JitterEnabled: false,
	}

	attempts := 0
	operation := func(ctx context.Context) error {
		attempts++
		if attempts < 3 {
			return NewStorageError("test", "key", ErrNetworkError, true)
		}
		return nil // Success on third attempt
	}

	err := WithRetry(context.Background(), config, operation)
	if err != nil {
		t.Errorf("WithRetry() should succeed after retries, got error: %v", err)
	}

	if attempts != 3 {
		t.Errorf("Expected 3 attempts, got %d", attempts)
	}
}

func TestWithRetry_NonRetryableError(t *testing.T) {
	config := &RetryConfig{
		MaxAttempts:   3,
		InitialDelay:  10 * time.Millisecond,
		MaxDelay:      100 * time.Millisecond,
		BackoffFactor: 2.0,
		JitterEnabled: false,
	}

	attempts := 0
	nonRetryableErr := NewStorageError("test", "key", ErrFileNotFound, false)
	operation := func(ctx context.Context) error {
		attempts++
		return nonRetryableErr
	}

	err := WithRetry(context.Background(), config, operation)
	if err == nil {
		t.Error("WithRetry() should fail with non-retryable error")
	}

	if !errors.Is(err, nonRetryableErr) {
		t.Errorf("Expected original error, got: %v", err)
	}

	if attempts != 1 {
		t.Errorf("Expected 1 attempt for non-retryable error, got %d", attempts)
	}
}

func TestWithRetry_MaxAttemptsExceeded(t *testing.T) {
	config := &RetryConfig{
		MaxAttempts:   2,
		InitialDelay:  10 * time.Millisecond,
		MaxDelay:      100 * time.Millisecond,
		BackoffFactor: 2.0,
		JitterEnabled: false,
	}

	attempts := 0
	retryableErr := NewStorageError("test", "key", ErrNetworkError, true)
	operation := func(ctx context.Context) error {
		attempts++
		return retryableErr
	}

	err := WithRetry(context.Background(), config, operation)
	if err == nil {
		t.Error("WithRetry() should fail after max attempts")
	}

	if attempts != 2 {
		t.Errorf("Expected 2 attempts, got %d", attempts)
	}
}

func TestWithRetry_ContextCancellation(t *testing.T) {
	config := &RetryConfig{
		MaxAttempts:   5,
		InitialDelay:  100 * time.Millisecond,
		MaxDelay:      1 * time.Second,
		BackoffFactor: 2.0,
		JitterEnabled: false,
	}

	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()

	attempts := 0
	operation := func(ctx context.Context) error {
		attempts++
		return NewStorageError("test", "key", ErrNetworkError, true)
	}

	err := WithRetry(ctx, config, operation)
	if err == nil {
		t.Error("WithRetry() should fail due to context cancellation")
	}

	if !errors.Is(err, context.DeadlineExceeded) {
		t.Errorf("Expected context.DeadlineExceeded, got: %v", err)
	}

	// Should have attempted at least once
	if attempts < 1 {
		t.Errorf("Expected at least 1 attempt, got %d", attempts)
	}
}

func TestRetryConfig_calculateDelay(t *testing.T) {
	config := &RetryConfig{
		InitialDelay:  100 * time.Millisecond,
		MaxDelay:      1 * time.Second,
		BackoffFactor: 2.0,
		JitterEnabled: false,
	}

	tests := []struct {
		attempt     int
		expectedMin time.Duration
		expectedMax time.Duration
	}{
		{1, 100 * time.Millisecond, 100 * time.Millisecond},
		{2, 200 * time.Millisecond, 200 * time.Millisecond},
		{3, 400 * time.Millisecond, 400 * time.Millisecond},
		{4, 800 * time.Millisecond, 800 * time.Millisecond},
		{5, 1 * time.Second, 1 * time.Second}, // Capped at MaxDelay
	}

	for _, tt := range tests {
		t.Run(string(rune(tt.attempt)), func(t *testing.T) {
			delay := config.calculateDelay(tt.attempt)
			if delay < tt.expectedMin || delay > tt.expectedMax {
				t.Errorf("calculateDelay(%d) = %v, want between %v and %v",
					tt.attempt, delay, tt.expectedMin, tt.expectedMax)
			}
		})
	}
}

func TestRetryConfig_calculateDelayWithJitter(t *testing.T) {
	config := &RetryConfig{
		InitialDelay:  100 * time.Millisecond,
		MaxDelay:      1 * time.Second,
		BackoffFactor: 2.0,
		JitterEnabled: true,
	}

	// Test that jitter adds some randomness
	delays := make([]time.Duration, 10)
	for i := 0; i < 10; i++ {
		delays[i] = config.calculateDelay(2) // Second attempt
	}

	// Check that not all delays are identical (jitter should add variation)
	allSame := true
	for i := 1; i < len(delays); i++ {
		if delays[i] != delays[0] {
			allSame = false
			break
		}
	}

	if allSame {
		t.Error("With jitter enabled, delays should vary")
	}

	// Check that all delays are within reasonable bounds (base + up to 10% jitter)
	baseDelay := 200 * time.Millisecond // 100ms * 2^(2-1)
	minExpected := baseDelay
	maxExpected := baseDelay + time.Duration(float64(baseDelay)*0.1)

	for i, delay := range delays {
		if delay < minExpected || delay > maxExpected {
			t.Errorf("Delay %d = %v, expected between %v and %v",
				i, delay, minExpected, maxExpected)
		}
	}
}

func TestRetryableFileStorage_Store(t *testing.T) {
	mockStorage := NewMockFileStorage()
	config := &RetryConfig{
		MaxAttempts:   3,
		InitialDelay:  10 * time.Millisecond,
		MaxDelay:      100 * time.Millisecond,
		BackoffFactor: 2.0,
		JitterEnabled: false,
	}

	retryableStorage := NewRetryableFileStorage(mockStorage, config)
	defer retryableStorage.Close()

	ctx := context.Background()
	testKey := "test/file.txt"
	testData := []byte("test content")

	// Test successful store
	err := retryableStorage.Store(ctx, testKey, testData, nil)
	if err != nil {
		t.Errorf("Store() should succeed, got error: %v", err)
	}

	// Verify file was stored
	exists, err := retryableStorage.Exists(ctx, testKey)
	if err != nil {
		t.Errorf("Exists() error: %v", err)
	}
	if !exists {
		t.Error("File should exist after successful store")
	}
}

func TestRetryableFileStorage_Retrieve(t *testing.T) {
	mockStorage := NewMockFileStorage()
	config := &RetryConfig{
		MaxAttempts:   3,
		InitialDelay:  10 * time.Millisecond,
		MaxDelay:      100 * time.Millisecond,
		BackoffFactor: 2.0,
		JitterEnabled: false,
	}

	retryableStorage := NewRetryableFileStorage(mockStorage, config)
	defer retryableStorage.Close()

	ctx := context.Background()
	testKey := "test/file.txt"
	testData := []byte("test content")

	// Store test file
	err := retryableStorage.Store(ctx, testKey, testData, nil)
	if err != nil {
		t.Fatalf("Failed to store test file: %v", err)
	}

	// Test successful retrieve
	retrieved, err := retryableStorage.Retrieve(ctx, testKey)
	if err != nil {
		t.Errorf("Retrieve() should succeed, got error: %v", err)
	}

	if string(retrieved) != string(testData) {
		t.Errorf("Retrieved content = %s, want %s", retrieved, testData)
	}

	// Test retrieve non-existent file (should not retry)
	_, err = retryableStorage.Retrieve(ctx, "nonexistent.txt")
	if err == nil {
		t.Error("Retrieve() should fail for non-existent file")
	}
	if !IsNotFound(err) {
		t.Errorf("Expected NotFound error, got: %v", err)
	}
}

func TestIsRetryable(t *testing.T) {
	tests := []struct {
		name string
		err  error
		want bool
	}{
		{
			name: "retryable storage error",
			err:  NewStorageError("test", "key", ErrNetworkError, true),
			want: true,
		},
		{
			name: "non-retryable storage error",
			err:  NewStorageError("test", "key", ErrFileNotFound, false),
			want: false,
		},
		{
			name: "retryable base error",
			err:  ErrNetworkError,
			want: true,
		},
		{
			name: "non-retryable base error",
			err:  ErrFileNotFound,
			want: false,
		},
		{
			name: "generic error",
			err:  errors.New("generic error"),
			want: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := IsRetryable(tt.err); got != tt.want {
				t.Errorf("IsRetryable() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestDefaultRetryConfig(t *testing.T) {
	config := DefaultRetryConfig()

	if config.MaxAttempts <= 0 {
		t.Error("MaxAttempts should be positive")
	}

	if config.InitialDelay <= 0 {
		t.Error("InitialDelay should be positive")
	}

	if config.MaxDelay <= config.InitialDelay {
		t.Error("MaxDelay should be greater than InitialDelay")
	}

	if config.BackoffFactor <= 1.0 {
		t.Error("BackoffFactor should be greater than 1.0")
	}

	if len(config.RetryableErrors) == 0 {
		t.Error("RetryableErrors should not be empty")
	}
}
