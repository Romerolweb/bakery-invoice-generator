package storage

import (
	"context"
	"time"
)

// FileMetadata represents metadata about a stored file
type FileMetadata struct {
	Key          string            `json:"key"`
	Size         int64             `json:"size"`
	ContentType  string            `json:"content_type"`
	LastModified time.Time         `json:"last_modified"`
	ETag         string            `json:"etag,omitempty"`
	Metadata     map[string]string `json:"metadata,omitempty"`
}

// ListOptions provides options for listing files
type ListOptions struct {
	Prefix     string `json:"prefix,omitempty"`
	MaxResults int    `json:"max_results,omitempty"`
	Marker     string `json:"marker,omitempty"` // For pagination
}

// ListResult represents the result of a list operation
type ListResult struct {
	Files       []FileMetadata `json:"files"`
	NextMarker  string         `json:"next_marker,omitempty"` // For pagination
	IsTruncated bool           `json:"is_truncated"`
}

// StoreOptions provides options for storing files
type StoreOptions struct {
	ContentType string            `json:"content_type,omitempty"`
	Metadata    map[string]string `json:"metadata,omitempty"`
	Overwrite   bool              `json:"overwrite,omitempty"`
}

// FileStorage provides an abstraction for file operations
// This interface supports both local filesystem and cloud storage implementations
type FileStorage interface {
	// Store saves a file and returns the storage key
	// The key can be used to retrieve the file later
	Store(ctx context.Context, key string, data []byte, opts *StoreOptions) error

	// Retrieve gets a file by its storage key
	Retrieve(ctx context.Context, key string) ([]byte, error)

	// Delete removes a file by its storage key
	Delete(ctx context.Context, key string) error

	// Exists checks if a file exists at the given key
	Exists(ctx context.Context, key string) (bool, error)

	// GetMetadata returns metadata for a file
	GetMetadata(ctx context.Context, key string) (*FileMetadata, error)

	// List returns files matching the given options
	List(ctx context.Context, opts *ListOptions) (*ListResult, error)

	// GenerateURL creates a temporary access URL for a file
	// This is useful for cloud storage providers that support signed URLs
	// For local storage, this might return a local file path or HTTP URL
	GenerateURL(ctx context.Context, key string, expiry time.Duration) (string, error)

	// Copy copies a file from one key to another
	Copy(ctx context.Context, srcKey, destKey string) error

	// Move moves a file from one key to another (copy + delete)
	Move(ctx context.Context, srcKey, destKey string) error

	// GetSize returns the size of a file in bytes
	GetSize(ctx context.Context, key string) (int64, error)

	// Close cleans up any resources used by the storage implementation
	Close() error
}

// StorageConfig represents configuration for storage providers
type StorageConfig struct {
	Type     string            `json:"type" yaml:"type"`           // "local", "s3", "gcs", etc.
	BasePath string            `json:"base_path" yaml:"base_path"` // For local storage
	Bucket   string            `json:"bucket" yaml:"bucket"`       // For cloud storage
	Region   string            `json:"region" yaml:"region"`       // For cloud storage
	Options  map[string]string `json:"options" yaml:"options"`     // Provider-specific options
}
