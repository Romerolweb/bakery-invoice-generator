package storage

import (
	"context"
	"fmt"
	"mime"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

// MockFileStorage is an in-memory implementation of FileStorage for testing
type MockFileStorage struct {
	mu    sync.RWMutex
	files map[string]*mockFile
}

type mockFile struct {
	data         []byte
	metadata     map[string]string
	contentType  string
	lastModified time.Time
	etag         string
}

// NewMockFileStorage creates a new MockFileStorage instance
func NewMockFileStorage() *MockFileStorage {
	return &MockFileStorage{
		files: make(map[string]*mockFile),
	}
}

// Store implements FileStorage.Store
func (m *MockFileStorage) Store(ctx context.Context, key string, data []byte, opts *StoreOptions) error {
	if key == "" {
		return NewStorageError("Store", key, ErrInvalidKey, false)
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	// Check if file exists and overwrite is not allowed
	if opts != nil && !opts.Overwrite {
		if _, exists := m.files[key]; exists {
			return NewStorageError("Store", key, ErrFileAlreadyExists, false)
		}
	}

	contentType := "application/octet-stream"
	if opts != nil && opts.ContentType != "" {
		contentType = opts.ContentType
	} else {
		// Try to determine from file extension
		if ct := mime.TypeByExtension(filepath.Ext(key)); ct != "" {
			contentType = ct
		}
	}

	var metadata map[string]string
	if opts != nil && opts.Metadata != nil {
		metadata = make(map[string]string)
		for k, v := range opts.Metadata {
			metadata[k] = v
		}
	}

	now := time.Now()
	m.files[key] = &mockFile{
		data:         append([]byte(nil), data...), // Copy data
		metadata:     metadata,
		contentType:  contentType,
		lastModified: now,
		etag:         fmt.Sprintf("%d-%d", len(data), now.Unix()),
	}

	return nil
}

// Retrieve implements FileStorage.Retrieve
func (m *MockFileStorage) Retrieve(ctx context.Context, key string) ([]byte, error) {
	if key == "" {
		return nil, NewStorageError("Retrieve", key, ErrInvalidKey, false)
	}

	m.mu.RLock()
	defer m.mu.RUnlock()

	file, exists := m.files[key]
	if !exists {
		return nil, NewStorageError("Retrieve", key, ErrFileNotFound, false)
	}

	// Return a copy of the data
	return append([]byte(nil), file.data...), nil
}

// Delete implements FileStorage.Delete
func (m *MockFileStorage) Delete(ctx context.Context, key string) error {
	if key == "" {
		return NewStorageError("Delete", key, ErrInvalidKey, false)
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	if _, exists := m.files[key]; !exists {
		return NewStorageError("Delete", key, ErrFileNotFound, false)
	}

	delete(m.files, key)
	return nil
}

// Exists implements FileStorage.Exists
func (m *MockFileStorage) Exists(ctx context.Context, key string) (bool, error) {
	if key == "" {
		return false, NewStorageError("Exists", key, ErrInvalidKey, false)
	}

	m.mu.RLock()
	defer m.mu.RUnlock()

	_, exists := m.files[key]
	return exists, nil
}

// GetMetadata implements FileStorage.GetMetadata
func (m *MockFileStorage) GetMetadata(ctx context.Context, key string) (*FileMetadata, error) {
	if key == "" {
		return nil, NewStorageError("GetMetadata", key, ErrInvalidKey, false)
	}

	m.mu.RLock()
	defer m.mu.RUnlock()

	file, exists := m.files[key]
	if !exists {
		return nil, NewStorageError("GetMetadata", key, ErrFileNotFound, false)
	}

	var metadata map[string]string
	if file.metadata != nil {
		metadata = make(map[string]string)
		for k, v := range file.metadata {
			metadata[k] = v
		}
	}

	return &FileMetadata{
		Key:          key,
		Size:         int64(len(file.data)),
		ContentType:  file.contentType,
		LastModified: file.lastModified,
		ETag:         file.etag,
		Metadata:     metadata,
	}, nil
}

// List implements FileStorage.List
func (m *MockFileStorage) List(ctx context.Context, opts *ListOptions) (*ListResult, error) {
	if opts == nil {
		opts = &ListOptions{}
	}

	m.mu.RLock()
	defer m.mu.RUnlock()

	var files []FileMetadata
	var count int
	maxResults := opts.MaxResults
	if maxResults <= 0 {
		maxResults = 1000 // Default limit
	}

	for key, file := range m.files {
		// Apply prefix filter
		if opts.Prefix != "" && !strings.HasPrefix(key, opts.Prefix) {
			continue
		}

		// Apply marker for pagination
		if opts.Marker != "" && key <= opts.Marker {
			continue
		}

		// Check if we've reached the limit
		if count >= maxResults {
			break
		}

		var metadata map[string]string
		if file.metadata != nil {
			metadata = make(map[string]string)
			for k, v := range file.metadata {
				metadata[k] = v
			}
		}

		files = append(files, FileMetadata{
			Key:          key,
			Size:         int64(len(file.data)),
			ContentType:  file.contentType,
			LastModified: file.lastModified,
			ETag:         file.etag,
			Metadata:     metadata,
		})
		count++
	}

	result := &ListResult{
		Files:       files,
		IsTruncated: count >= maxResults,
	}

	// Set next marker for pagination
	if result.IsTruncated && len(files) > 0 {
		result.NextMarker = files[len(files)-1].Key
	}

	return result, nil
}

// GenerateURL implements FileStorage.GenerateURL
func (m *MockFileStorage) GenerateURL(ctx context.Context, key string, expiry time.Duration) (string, error) {
	if key == "" {
		return "", NewStorageError("GenerateURL", key, ErrInvalidKey, false)
	}

	exists, err := m.Exists(ctx, key)
	if err != nil {
		return "", err
	}
	if !exists {
		return "", NewStorageError("GenerateURL", key, ErrFileNotFound, false)
	}

	// Return a mock URL
	return fmt.Sprintf("mock://storage/%s?expires=%d", key, time.Now().Add(expiry).Unix()), nil
}

// Copy implements FileStorage.Copy
func (m *MockFileStorage) Copy(ctx context.Context, srcKey, destKey string) error {
	if srcKey == "" {
		return NewStorageError("Copy", srcKey, ErrInvalidKey, false)
	}
	if destKey == "" {
		return NewStorageError("Copy", destKey, ErrInvalidKey, false)
	}

	// Read source file
	data, err := m.Retrieve(ctx, srcKey)
	if err != nil {
		return err
	}

	// Get source metadata
	srcMetadata, err := m.GetMetadata(ctx, srcKey)
	if err != nil {
		return err
	}

	// Store to destination
	return m.Store(ctx, destKey, data, &StoreOptions{
		ContentType: srcMetadata.ContentType,
		Metadata:    srcMetadata.Metadata,
		Overwrite:   true,
	})
}

// Move implements FileStorage.Move
func (m *MockFileStorage) Move(ctx context.Context, srcKey, destKey string) error {
	// Copy first
	if err := m.Copy(ctx, srcKey, destKey); err != nil {
		return err
	}

	// Delete source
	return m.Delete(ctx, srcKey)
}

// GetSize implements FileStorage.GetSize
func (m *MockFileStorage) GetSize(ctx context.Context, key string) (int64, error) {
	metadata, err := m.GetMetadata(ctx, key)
	if err != nil {
		return 0, err
	}
	return metadata.Size, nil
}

// Close implements FileStorage.Close
func (m *MockFileStorage) Close() error {
	m.mu.Lock()
	defer m.mu.Unlock()

	// Clear all files
	m.files = make(map[string]*mockFile)
	return nil
}

// Additional methods for testing

// Reset clears all stored files
func (m *MockFileStorage) Reset() {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.files = make(map[string]*mockFile)
}

// FileCount returns the number of stored files
func (m *MockFileStorage) FileCount() int {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return len(m.files)
}

// HasFile checks if a file exists (without error handling)
func (m *MockFileStorage) HasFile(key string) bool {
	m.mu.RLock()
	defer m.mu.RUnlock()
	_, exists := m.files[key]
	return exists
}
