# File Storage Abstraction

This package provides a flexible file storage abstraction that supports multiple storage backends with built-in retry mechanisms and error handling.

## Features

- **Multiple Storage Backends**: Local filesystem, AWS S3 (future), Google Cloud Storage (future)
- **Retry Mechanism**: Configurable exponential backoff with jitter
- **Error Handling**: Comprehensive error types with retry classification
- **Metadata Support**: Store and retrieve custom metadata with files
- **Temporary URLs**: Generate time-limited access URLs (useful for cloud storage)
- **Factory Pattern**: Easy switching between storage implementations
- **Thread-Safe**: All implementations are safe for concurrent use

## Quick Start

```go
package main

import (
    "context"
    "log"
    
    "bakery-invoice-api/internal/adapters/storage"
)

func main() {
    // Create storage configuration
    config := &storage.StorageConfig{
        Type:     "local",
        BasePath: "./data/files",
        Options: map[string]string{
            "base_url": "http://localhost:8080/files",
        },
    }
    
    // Create storage instance
    store, err := storage.CreateFromConfig(config)
    if err != nil {
        log.Fatal(err)
    }
    defer store.Close()
    
    ctx := context.Background()
    
    // Store a file
    data := []byte("Hello, World!")
    err = store.Store(ctx, "greeting.txt", data, &storage.StoreOptions{
        ContentType: "text/plain",
        Metadata: map[string]string{
            "author": "system",
        },
    })
    if err != nil {
        log.Fatal(err)
    }
    
    // Retrieve the file
    retrieved, err := store.Retrieve(ctx, "greeting.txt")
    if err != nil {
        log.Fatal(err)
    }
    
    log.Printf("Retrieved: %s", string(retrieved))
}
```

## Storage Backends

### Local Filesystem

```go
config := &storage.StorageConfig{
    Type:     "local",
    BasePath: "/path/to/storage",
    Options: map[string]string{
        "base_url": "http://localhost:8080/files", // Optional
    },
}
```

### Mock Storage (for testing)

```go
config := &storage.StorageConfig{
    Type: "mock",
}
```

### AWS S3 (Future Implementation)

```go
config := &storage.StorageConfig{
    Type:   "s3",
    Bucket: "my-bucket",
    Region: "us-east-1",
    Options: map[string]string{
        "access_key": "...",
        "secret_key": "...",
    },
}
```

## Interface

The `FileStorage` interface provides the following methods:

```go
type FileStorage interface {
    // Basic operations
    Store(ctx context.Context, key string, data []byte, opts *StoreOptions) error
    Retrieve(ctx context.Context, key string) ([]byte, error)
    Delete(ctx context.Context, key string) error
    Exists(ctx context.Context, key string) (bool, error)
    
    // Metadata operations
    GetMetadata(ctx context.Context, key string) (*FileMetadata, error)
    List(ctx context.Context, opts *ListOptions) (*ListResult, error)
    
    // Advanced operations
    GenerateURL(ctx context.Context, key string, expiry time.Duration) (string, error)
    Copy(ctx context.Context, srcKey, destKey string) error
    Move(ctx context.Context, srcKey, destKey string) error
    GetSize(ctx context.Context, key string) (int64, error)
    
    // Cleanup
    Close() error
}
```

## Error Handling

The package provides structured error handling with retry classification:

```go
// Check error types
if storage.IsNotFound(err) {
    // Handle file not found
}

if storage.IsRetryable(err) {
    // Error can be retried
}

// Custom error with context
err := storage.NewStorageError("Store", "myfile.txt", originalErr, true)
```

## Retry Configuration

Configure retry behavior for resilient operations:

```go
retryConfig := &storage.RetryConfig{
    MaxAttempts:     3,
    InitialDelay:    100 * time.Millisecond,
    MaxDelay:        5 * time.Second,
    BackoffFactor:   2.0,
    JitterEnabled:   true,
}

factory := storage.NewFactory(retryConfig)
store, err := factory.Create(config)
```

## Testing

The package includes comprehensive tests and a mock implementation:

```go
// Use mock storage in tests
mockStorage := storage.NewMockFileStorage()
defer mockStorage.Close()

// Test operations
err := mockStorage.Store(ctx, "test.txt", []byte("test"), nil)
// ... assertions
```

Run tests:

```bash
go test -v ./internal/adapters/storage/
```

## Thread Safety

All storage implementations are thread-safe and can be used concurrently from multiple goroutines. The retry mechanism also handles concurrent operations correctly.

## Best Practices

1. **Always use context**: Pass appropriate context for cancellation and timeouts
2. **Handle errors properly**: Check for specific error types using the provided helper functions
3. **Use meaningful keys**: Structure your file keys hierarchically (e.g., "receipts/2024/01/receipt-123.pdf")
4. **Set appropriate metadata**: Include content type and custom metadata for better file management
5. **Close resources**: Always call `Close()` when done with a storage instance
6. **Configure retries**: Set appropriate retry configuration based on your use case

## Future Enhancements

- AWS S3 implementation
- Google Cloud Storage implementation
- Azure Blob Storage implementation
- Encryption at rest
- Compression support
- Batch operations
- Streaming support for large files