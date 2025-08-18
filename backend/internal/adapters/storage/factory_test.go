package storage

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestFactory(t *testing.T) {
	factory := DefaultFactory()

	t.Run("CreateMockStorage", func(t *testing.T) {
		config := &StorageConfig{
			Type: "mock",
		}

		storage, err := factory.Create(config)
		if err != nil {
			t.Fatalf("Failed to create mock storage: %v", err)
		}
		defer storage.Close()

		// Test basic operation
		ctx := context.Background()
		err = storage.Store(ctx, "test.txt", []byte("test"), nil)
		if err != nil {
			t.Fatalf("Store failed: %v", err)
		}

		data, err := storage.Retrieve(ctx, "test.txt")
		if err != nil {
			t.Fatalf("Retrieve failed: %v", err)
		}

		if string(data) != "test" {
			t.Errorf("Data mismatch: got %q, want %q", string(data), "test")
		}
	})

	t.Run("CreateLocalStorage", func(t *testing.T) {
		// Create temporary directory
		tempDir, err := os.MkdirTemp("", "storage_test")
		if err != nil {
			t.Fatalf("Failed to create temp dir: %v", err)
		}
		defer os.RemoveAll(tempDir)

		config := &StorageConfig{
			Type:     "local",
			BasePath: tempDir,
		}

		storage, err := factory.Create(config)
		if err != nil {
			t.Fatalf("Failed to create local storage: %v", err)
		}
		defer storage.Close()

		// Test basic operation
		ctx := context.Background()
		err = storage.Store(ctx, "test.txt", []byte("test"), nil)
		if err != nil {
			t.Fatalf("Store failed: %v", err)
		}

		// Verify file exists on disk
		filePath := filepath.Join(tempDir, "test.txt")
		if _, err := os.Stat(filePath); os.IsNotExist(err) {
			t.Error("File should exist on disk")
		}

		data, err := storage.Retrieve(ctx, "test.txt")
		if err != nil {
			t.Fatalf("Retrieve failed: %v", err)
		}

		if string(data) != "test" {
			t.Errorf("Data mismatch: got %q, want %q", string(data), "test")
		}
	})

	t.Run("CreateLocalStorageWithURL", func(t *testing.T) {
		tempDir, err := os.MkdirTemp("", "storage_test")
		if err != nil {
			t.Fatalf("Failed to create temp dir: %v", err)
		}
		defer os.RemoveAll(tempDir)

		config := &StorageConfig{
			Type:     "local",
			BasePath: tempDir,
			Options: map[string]string{
				"base_url": "http://localhost:8080/files",
			},
		}

		storage, err := factory.Create(config)
		if err != nil {
			t.Fatalf("Failed to create local storage: %v", err)
		}
		defer storage.Close()

		// Store a file
		ctx := context.Background()
		err = storage.Store(ctx, "test.txt", []byte("test"), nil)
		if err != nil {
			t.Fatalf("Store failed: %v", err)
		}

		// Generate URL
		url, err := storage.GenerateURL(ctx, "test.txt", time.Hour)
		if err != nil {
			t.Fatalf("GenerateURL failed: %v", err)
		}

		expectedURL := "http://localhost:8080/files/test.txt"
		if url != expectedURL {
			t.Errorf("URL mismatch: got %q, want %q", url, expectedURL)
		}
	})

	t.Run("UnsupportedStorageType", func(t *testing.T) {
		config := &StorageConfig{
			Type: "unsupported",
		}

		_, err := factory.Create(config)
		if err == nil {
			t.Error("Should fail for unsupported storage type")
		}
	})

	t.Run("NilConfig", func(t *testing.T) {
		_, err := factory.Create(nil)
		if err == nil {
			t.Error("Should fail for nil config")
		}
	})

	t.Run("WithRetryConfig", func(t *testing.T) {
		retryConfig := &RetryConfig{
			MaxAttempts:   2,
			InitialDelay:  50 * time.Millisecond,
			BackoffFactor: 1.5,
		}

		factory := NewFactory(retryConfig)

		config := &StorageConfig{
			Type: "mock",
		}

		storage, err := factory.Create(config)
		if err != nil {
			t.Fatalf("Failed to create storage with retry: %v", err)
		}
		defer storage.Close()

		// Verify it's wrapped with retry logic
		if _, ok := storage.(*RetryableFileStorage); !ok {
			t.Error("Storage should be wrapped with retry logic")
		}
	})
}

func TestCreateFromConfig(t *testing.T) {
	config := &StorageConfig{
		Type: "mock",
	}

	storage, err := CreateFromConfig(config)
	if err != nil {
		t.Fatalf("CreateFromConfig failed: %v", err)
	}
	defer storage.Close()

	// Test basic operation
	ctx := context.Background()
	err = storage.Store(ctx, "test.txt", []byte("test"), nil)
	if err != nil {
		t.Fatalf("Store failed: %v", err)
	}
}

func TestMustCreate(t *testing.T) {
	t.Run("Success", func(t *testing.T) {
		config := &StorageConfig{
			Type: "mock",
		}

		storage := MustCreate(config)
		defer storage.Close()

		// Test basic operation
		ctx := context.Background()
		err := storage.Store(ctx, "test.txt", []byte("test"), nil)
		if err != nil {
			t.Fatalf("Store failed: %v", err)
		}
	})

	t.Run("Panic", func(t *testing.T) {
		defer func() {
			if r := recover(); r == nil {
				t.Error("MustCreate should panic on error")
			}
		}()

		config := &StorageConfig{
			Type: "unsupported",
		}

		MustCreate(config)
	})
}
