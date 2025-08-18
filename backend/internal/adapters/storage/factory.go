package storage

import (
	"fmt"
	"strings"
)

// StorageType represents the type of storage implementation
type StorageType string

const (
	StorageTypeLocal StorageType = "local"
	StorageTypeS3    StorageType = "s3"
	StorageTypeGCS   StorageType = "gcs"
	StorageTypeMock  StorageType = "mock"
)

// Factory creates FileStorage instances based on configuration
type Factory struct {
	retryConfig *RetryConfig
}

// NewFactory creates a new storage factory
func NewFactory(retryConfig *RetryConfig) *Factory {
	return &Factory{
		retryConfig: retryConfig,
	}
}

// Create creates a FileStorage instance based on the provided configuration
func (f *Factory) Create(config *StorageConfig) (FileStorage, error) {
	if config == nil {
		return nil, fmt.Errorf("storage config is required")
	}

	storageType := StorageType(strings.ToLower(config.Type))

	var storage FileStorage
	var err error

	switch storageType {
	case StorageTypeLocal:
		storage, err = f.createLocalStorage(config)
	case StorageTypeS3:
		storage, err = f.createS3Storage(config)
	case StorageTypeGCS:
		storage, err = f.createGCSStorage(config)
	case StorageTypeMock:
		storage, err = f.createMockStorage(config)
	default:
		return nil, fmt.Errorf("unsupported storage type: %s", config.Type)
	}

	if err != nil {
		return nil, fmt.Errorf("failed to create %s storage: %w", config.Type, err)
	}

	// Wrap with retry logic if configured
	if f.retryConfig != nil {
		storage = NewRetryableFileStorage(storage, f.retryConfig)
	}

	return storage, nil
}

// createLocalStorage creates a local filesystem storage implementation
func (f *Factory) createLocalStorage(config *StorageConfig) (FileStorage, error) {
	basePath := config.BasePath
	if basePath == "" {
		basePath = "./storage" // Default path
	}

	baseURL := config.Options["base_url"]

	if baseURL != "" {
		return NewLocalFileStorage(basePath, baseURL)
	}
	return NewLocalFileStorage(basePath)
}

// createS3Storage creates an AWS S3 storage implementation
func (f *Factory) createS3Storage(config *StorageConfig) (FileStorage, error) {
	// TODO: Implement S3 storage in future task
	return nil, fmt.Errorf("S3 storage not yet implemented")
}

// createGCSStorage creates a Google Cloud Storage implementation
func (f *Factory) createGCSStorage(config *StorageConfig) (FileStorage, error) {
	// TODO: Implement GCS storage in future task
	return nil, fmt.Errorf("GCS storage not yet implemented")
}

// createMockStorage creates a mock storage implementation for testing
func (f *Factory) createMockStorage(config *StorageConfig) (FileStorage, error) {
	return NewMockFileStorage(), nil
}

// DefaultFactory returns a factory with default retry configuration
func DefaultFactory() *Factory {
	return NewFactory(DefaultRetryConfig())
}

// CreateFromConfig is a convenience function to create storage from config
func CreateFromConfig(config *StorageConfig) (FileStorage, error) {
	factory := DefaultFactory()
	return factory.Create(config)
}

// MustCreate creates storage from config and panics on error (for testing)
func MustCreate(config *StorageConfig) FileStorage {
	storage, err := CreateFromConfig(config)
	if err != nil {
		panic(fmt.Sprintf("failed to create storage: %v", err))
	}
	return storage
}
