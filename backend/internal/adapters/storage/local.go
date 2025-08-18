package storage

import (
	"context"
	"fmt"
	"mime"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// LocalFileStorage implements FileStorage for local filesystem
type LocalFileStorage struct {
	basePath string
	baseURL  string // Optional base URL for generating URLs
}

// NewLocalFileStorage creates a new LocalFileStorage instance
func NewLocalFileStorage(basePath string, baseURL ...string) (*LocalFileStorage, error) {
	// Ensure base path exists
	if err := os.MkdirAll(basePath, 0755); err != nil {
		return nil, NewStorageError("NewLocalFileStorage", "", err, false)
	}

	// Convert to absolute path
	absPath, err := filepath.Abs(basePath)
	if err != nil {
		return nil, NewStorageError("NewLocalFileStorage", "", err, false)
	}

	var url string
	if len(baseURL) > 0 {
		url = strings.TrimSuffix(baseURL[0], "/")
	}

	return &LocalFileStorage{
		basePath: absPath,
		baseURL:  url,
	}, nil
}

// Store implements FileStorage.Store
func (l *LocalFileStorage) Store(ctx context.Context, key string, data []byte, opts *StoreOptions) error {
	if err := l.validateKey(key); err != nil {
		return NewStorageError("Store", key, err, false)
	}

	filePath := l.getFilePath(key)

	// Check if file exists and overwrite is not allowed
	if opts != nil && !opts.Overwrite {
		if _, err := os.Stat(filePath); err == nil {
			return NewStorageError("Store", key, ErrFileAlreadyExists, false)
		}
	}

	// Ensure directory exists
	dir := filepath.Dir(filePath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return NewStorageError("Store", key, err, true)
	}

	// Write file atomically by writing to temp file first
	tempPath := filePath + ".tmp"
	if err := os.WriteFile(tempPath, data, 0644); err != nil {
		return NewStorageError("Store", key, err, true)
	}

	// Atomic rename
	if err := os.Rename(tempPath, filePath); err != nil {
		os.Remove(tempPath) // Clean up temp file
		return NewStorageError("Store", key, err, true)
	}

	// Store metadata if provided
	if opts != nil && len(opts.Metadata) > 0 {
		if err := l.storeMetadata(key, opts.Metadata); err != nil {
			// Non-fatal error, file is already stored
			// Could log this error but don't fail the operation
		}
	}

	return nil
}

// Retrieve implements FileStorage.Retrieve
func (l *LocalFileStorage) Retrieve(ctx context.Context, key string) ([]byte, error) {
	if err := l.validateKey(key); err != nil {
		return nil, NewStorageError("Retrieve", key, err, false)
	}

	filePath := l.getFilePath(key)

	data, err := os.ReadFile(filePath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, NewStorageError("Retrieve", key, ErrFileNotFound, false)
		}
		return nil, NewStorageError("Retrieve", key, err, true)
	}

	return data, nil
}

// Delete implements FileStorage.Delete
func (l *LocalFileStorage) Delete(ctx context.Context, key string) error {
	if err := l.validateKey(key); err != nil {
		return NewStorageError("Delete", key, err, false)
	}

	filePath := l.getFilePath(key)

	err := os.Remove(filePath)
	if err != nil {
		if os.IsNotExist(err) {
			return NewStorageError("Delete", key, ErrFileNotFound, false)
		}
		return NewStorageError("Delete", key, err, true)
	}

	// Also remove metadata file if it exists
	metadataPath := l.getMetadataPath(key)
	os.Remove(metadataPath) // Ignore errors for metadata cleanup

	return nil
}

// Exists implements FileStorage.Exists
func (l *LocalFileStorage) Exists(ctx context.Context, key string) (bool, error) {
	if err := l.validateKey(key); err != nil {
		return false, NewStorageError("Exists", key, err, false)
	}

	filePath := l.getFilePath(key)

	_, err := os.Stat(filePath)
	if err != nil {
		if os.IsNotExist(err) {
			return false, nil
		}
		return false, NewStorageError("Exists", key, err, true)
	}

	return true, nil
}

// GetMetadata implements FileStorage.GetMetadata
func (l *LocalFileStorage) GetMetadata(ctx context.Context, key string) (*FileMetadata, error) {
	if err := l.validateKey(key); err != nil {
		return nil, NewStorageError("GetMetadata", key, err, false)
	}

	filePath := l.getFilePath(key)

	stat, err := os.Stat(filePath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, NewStorageError("GetMetadata", key, ErrFileNotFound, false)
		}
		return nil, NewStorageError("GetMetadata", key, err, true)
	}

	// Determine content type from file extension
	contentType := mime.TypeByExtension(filepath.Ext(key))
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	metadata := &FileMetadata{
		Key:          key,
		Size:         stat.Size(),
		ContentType:  contentType,
		LastModified: stat.ModTime(),
		ETag:         fmt.Sprintf("%d-%d", stat.Size(), stat.ModTime().Unix()),
	}

	// Load custom metadata if available
	if customMetadata, err := l.loadMetadata(key); err == nil {
		metadata.Metadata = customMetadata
	}

	return metadata, nil
}

// List implements FileStorage.List
func (l *LocalFileStorage) List(ctx context.Context, opts *ListOptions) (*ListResult, error) {
	if opts == nil {
		opts = &ListOptions{}
	}

	var files []FileMetadata
	var count int
	maxResults := opts.MaxResults
	if maxResults <= 0 {
		maxResults = 1000 // Default limit
	}

	err := filepath.Walk(l.basePath, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}

		// Skip directories and metadata files
		if info.IsDir() || strings.HasSuffix(path, ".metadata") {
			return nil
		}

		// Convert absolute path to relative key
		relPath, err := filepath.Rel(l.basePath, path)
		if err != nil {
			return err
		}

		// Normalize path separators for cross-platform compatibility
		key := filepath.ToSlash(relPath)

		// Apply prefix filter
		if opts.Prefix != "" && !strings.HasPrefix(key, opts.Prefix) {
			return nil
		}

		// Apply marker for pagination
		if opts.Marker != "" && key <= opts.Marker {
			return nil
		}

		// Check if we've reached the limit
		if count >= maxResults {
			return filepath.SkipDir // Stop walking
		}

		// Determine content type
		contentType := mime.TypeByExtension(filepath.Ext(key))
		if contentType == "" {
			contentType = "application/octet-stream"
		}

		metadata := FileMetadata{
			Key:          key,
			Size:         info.Size(),
			ContentType:  contentType,
			LastModified: info.ModTime(),
			ETag:         fmt.Sprintf("%d-%d", info.Size(), info.ModTime().Unix()),
		}

		// Load custom metadata if available
		if customMetadata, err := l.loadMetadata(key); err == nil {
			metadata.Metadata = customMetadata
		}

		files = append(files, metadata)
		count++

		return nil
	})

	if err != nil {
		return nil, NewStorageError("List", "", err, true)
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
func (l *LocalFileStorage) GenerateURL(ctx context.Context, key string, expiry time.Duration) (string, error) {
	if err := l.validateKey(key); err != nil {
		return "", NewStorageError("GenerateURL", key, err, false)
	}

	// Check if file exists
	exists, err := l.Exists(ctx, key)
	if err != nil {
		return "", err
	}
	if !exists {
		return "", NewStorageError("GenerateURL", key, ErrFileNotFound, false)
	}

	if l.baseURL != "" {
		// Return HTTP URL if base URL is configured
		return fmt.Sprintf("%s/%s", l.baseURL, key), nil
	}

	// Return file:// URL for local access
	filePath := l.getFilePath(key)
	return fmt.Sprintf("file://%s", filePath), nil
}

// Copy implements FileStorage.Copy
func (l *LocalFileStorage) Copy(ctx context.Context, srcKey, destKey string) error {
	if err := l.validateKey(srcKey); err != nil {
		return NewStorageError("Copy", srcKey, err, false)
	}
	if err := l.validateKey(destKey); err != nil {
		return NewStorageError("Copy", destKey, err, false)
	}

	// Read source file
	data, err := l.Retrieve(ctx, srcKey)
	if err != nil {
		return err
	}

	// Store to destination
	return l.Store(ctx, destKey, data, &StoreOptions{Overwrite: true})
}

// Move implements FileStorage.Move
func (l *LocalFileStorage) Move(ctx context.Context, srcKey, destKey string) error {
	// Copy first
	if err := l.Copy(ctx, srcKey, destKey); err != nil {
		return err
	}

	// Delete source
	return l.Delete(ctx, srcKey)
}

// GetSize implements FileStorage.GetSize
func (l *LocalFileStorage) GetSize(ctx context.Context, key string) (int64, error) {
	metadata, err := l.GetMetadata(ctx, key)
	if err != nil {
		return 0, err
	}
	return metadata.Size, nil
}

// Close implements FileStorage.Close
func (l *LocalFileStorage) Close() error {
	// No resources to clean up for local storage
	return nil
}

// Helper methods

func (l *LocalFileStorage) validateKey(key string) error {
	if key == "" {
		return ErrInvalidKey
	}

	// Prevent directory traversal attacks
	if strings.Contains(key, "..") || strings.HasPrefix(key, "/") {
		return ErrInvalidKey
	}

	return nil
}

func (l *LocalFileStorage) getFilePath(key string) string {
	return filepath.Join(l.basePath, filepath.FromSlash(key))
}

func (l *LocalFileStorage) getMetadataPath(key string) string {
	return l.getFilePath(key) + ".metadata"
}

func (l *LocalFileStorage) storeMetadata(key string, metadata map[string]string) error {
	if len(metadata) == 0 {
		return nil
	}

	metadataPath := l.getMetadataPath(key)

	// Simple key=value format for metadata
	var lines []string
	for k, v := range metadata {
		lines = append(lines, fmt.Sprintf("%s=%s", k, v))
	}

	content := strings.Join(lines, "\n")
	return os.WriteFile(metadataPath, []byte(content), 0644)
}

func (l *LocalFileStorage) loadMetadata(key string) (map[string]string, error) {
	metadataPath := l.getMetadataPath(key)

	data, err := os.ReadFile(metadataPath)
	if err != nil {
		return nil, err
	}

	metadata := make(map[string]string)
	lines := strings.Split(string(data), "\n")

	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}

		parts := strings.SplitN(line, "=", 2)
		if len(parts) == 2 {
			metadata[parts[0]] = parts[1]
		}
	}

	return metadata, nil
}
