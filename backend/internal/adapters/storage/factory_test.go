package storage

import (
	"context"
	"os"
	"testing"
)

func TestFactory_CreateLocalStorage(t *testing.T) {
	factory := DefaultFactory()

	tempDir, err := os.MkdirTemp("", "factory_test_*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	tests := []struct {
		name    string
		config  *StorageConfig
		wantErr bool
	}{
		{
			name: "valid local storage config",
			config: &StorageConfig{
				Type:     "local",
				BasePath: tempDir,
			},
			wantErr: false,
		},
		{
			name: "local storage with base URL",
			config: &StorageConfig{
				Type:     "local",
				BasePath: tempDir,
				Options:  map[string]string{"base_url": "http://localhost:8080/files"},
			},
			wantErr: false,
		},
		{
			name: "local storage with default path",
			config: &StorageConfig{
				Type: "local",
			},
			wantErr: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			storage, err := factory.Create(tt.config)
			if (err != nil) != tt.wantErr {
				t.Errorf("Create() error = %v, wantErr %v", err, tt.wantErr)
				return
			}

			if !tt.wantErr {
				if storage == nil {
					t.Error("Create() returned nil storage")
					return
				}

				// Test basic functionality
				ctx := context.Background()
				testKey := "test/file.txt"
				testData := []byte("test content")

				err = storage.Store(ctx, testKey, testData, nil)
				if err != nil {
					t.Errorf("Failed to store test file: %v", err)
				}

				exists, err := storage.Exists(ctx, testKey)
				if err != nil {
					t.Errorf("Failed to check existence: %v", err)
				}
				if !exists {
					t.Error("File should exist after store")
				}

				storage.Close()
			}
		})
	}
}

func TestFactory_CreateMockStorage(t *testing.T) {
	factory := DefaultFactory()

	config := &StorageConfig{
		Type: "mock",
	}

	storage, err := factory.Create(config)
	if err != nil {
		t.Errorf("Create() error = %v", err)
		return
	}

	if storage == nil {
		t.Error("Create() returned nil storage")
		return
	}

	// Test that it's actually a mock storage (wrapped in retry logic)
	retryableStorage, ok := storage.(*RetryableFileStorage)
	if !ok {
		t.Error("Expected RetryableFileStorage wrapper")
		return
	}

	// The underlying storage should be MockFileStorage
	// We can't easily access it due to the wrapper, but we can test functionality
	ctx := context.Background()
	testKey := "test/file.txt"
	testData := []byte("test content")

	err = retryableStorage.Store(ctx, testKey, testData, nil)
	if err != nil {
		t.Errorf("Failed to store test file: %v", err)
	}

	exists, err := retryableStorage.Exists(ctx, testKey)
	if err != nil {
		t.Errorf("Failed to check existence: %v", err)
	}
	if !exists {
		t.Error("File should exist after store")
	}

	storage.Close()
}

func TestFactory_CreateUnsupportedStorage(t *testing.T) {
	factory := DefaultFactory()

	config := &StorageConfig{
		Type: "unsupported",
	}

	storage, err := factory.Create(config)
	if err == nil {
		t.Error("Create() should fail for unsupported storage type")
	}
	if storage != nil {
		t.Error("Create() should return nil storage for unsupported type")
	}
}

func TestFactory_CreateS3Storage(t *testing.T) {
	factory := DefaultFactory()

	config := &StorageConfig{
		Type:   "s3",
		Bucket: "test-bucket",
		Region: "us-east-1",
	}

	storage, err := factory.Create(config)
	if err == nil {
		t.Error("Create() should fail for unimplemented S3 storage")
	}
	if storage != nil {
		t.Error("Create() should return nil storage for unimplemented type")
	}
}

func TestFactory_CreateGCSStorage(t *testing.T) {
	factory := DefaultFactory()

	config := &StorageConfig{
		Type:   "gcs",
		Bucket: "test-bucket",
	}

	storage, err := factory.Create(config)
	if err == nil {
		t.Error("Create() should fail for unimplemented GCS storage")
	}
	if storage != nil {
		t.Error("Create() should return nil storage for unimplemented type")
	}
}

func TestFactory_CreateWithNilConfig(t *testing.T) {
	factory := DefaultFactory()

	storage, err := factory.Create(nil)
	if err == nil {
		t.Error("Create() should fail with nil config")
	}
	if storage != nil {
		t.Error("Create() should return nil storage with nil config")
	}
}

func TestFactory_WithoutRetryConfig(t *testing.T) {
	factory := NewFactory(nil) // No retry config

	tempDir, err := os.MkdirTemp("", "factory_test_*")
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
		t.Errorf("Create() error = %v", err)
		return
	}

	if storage == nil {
		t.Error("Create() returned nil storage")
		return
	}

	// Without retry config, should still wrap with retry (using default config)
	// The factory always wraps with retry logic
	if storage == nil {
		t.Error("Storage should not be nil")
	}

	storage.Close()
}

func TestCreateFromConfig(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "factory_test_*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	config := &StorageConfig{
		Type:     "local",
		BasePath: tempDir,
	}

	storage, err := CreateFromConfig(config)
	if err != nil {
		t.Errorf("CreateFromConfig() error = %v", err)
		return
	}

	if storage == nil {
		t.Error("CreateFromConfig() returned nil storage")
		return
	}

	// Test basic functionality
	ctx := context.Background()
	testKey := "test/file.txt"
	testData := []byte("test content")

	err = storage.Store(ctx, testKey, testData, nil)
	if err != nil {
		t.Errorf("Failed to store test file: %v", err)
	}

	storage.Close()
}

func TestMustCreate(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "factory_test_*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	// Test successful creation
	config := &StorageConfig{
		Type:     "local",
		BasePath: tempDir,
	}

	storage := MustCreate(config)
	if storage == nil {
		t.Error("MustCreate() returned nil storage")
	}
	storage.Close()

	// Test panic on failure
	defer func() {
		if r := recover(); r == nil {
			t.Error("MustCreate() should panic on invalid config")
		}
	}()

	invalidConfig := &StorageConfig{
		Type: "unsupported",
	}

	MustCreate(invalidConfig) // Should panic
}
