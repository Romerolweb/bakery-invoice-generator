package storage

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestLocalFileStorage_Store(t *testing.T) {
	// Create temporary directory for testing
	tempDir, err := os.MkdirTemp("", "storage_test_*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	storage, err := NewLocalFileStorage(tempDir)
	if err != nil {
		t.Fatalf("Failed to create storage: %v", err)
	}
	defer storage.Close()

	ctx := context.Background()
	testData := []byte("test file content")
	testKey := "test/file.txt"

	tests := []struct {
		name    string
		key     string
		data    []byte
		opts    *StoreOptions
		wantErr bool
	}{
		{
			name:    "store valid file",
			key:     testKey,
			data:    testData,
			opts:    nil,
			wantErr: false,
		},
		{
			name:    "store with metadata",
			key:     "test/with-metadata.txt",
			data:    testData,
			opts:    &StoreOptions{Metadata: map[string]string{"author": "test"}},
			wantErr: false,
		},
		{
			name:    "store with content type",
			key:     "test/typed.json",
			data:    []byte(`{"test": true}`),
			opts:    &StoreOptions{ContentType: "application/json"},
			wantErr: false,
		},
		{
			name:    "invalid key with path traversal",
			key:     "../../../etc/passwd",
			data:    testData,
			opts:    nil,
			wantErr: true,
		},
		{
			name:    "empty key",
			key:     "",
			data:    testData,
			opts:    nil,
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := storage.Store(ctx, tt.key, tt.data, tt.opts)
			if (err != nil) != tt.wantErr {
				t.Errorf("Store() error = %v, wantErr %v", err, tt.wantErr)
				return
			}

			if !tt.wantErr {
				// Verify file was created
				exists, err := storage.Exists(ctx, tt.key)
				if err != nil {
					t.Errorf("Failed to check existence: %v", err)
				}
				if !exists {
					t.Errorf("File was not created")
				}

				// Verify content
				retrieved, err := storage.Retrieve(ctx, tt.key)
				if err != nil {
					t.Errorf("Failed to retrieve file: %v", err)
				}
				if string(retrieved) != string(tt.data) {
					t.Errorf("Retrieved content doesn't match: got %s, want %s", retrieved, tt.data)
				}
			}
		})
	}
}

func TestLocalFileStorage_StoreOverwrite(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "storage_test_*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	storage, err := NewLocalFileStorage(tempDir)
	if err != nil {
		t.Fatalf("Failed to create storage: %v", err)
	}
	defer storage.Close()

	ctx := context.Background()
	testKey := "test/overwrite.txt"
	originalData := []byte("original content")
	newData := []byte("new content")

	// Store original file
	err = storage.Store(ctx, testKey, originalData, nil)
	if err != nil {
		t.Fatalf("Failed to store original file: %v", err)
	}

	// Try to store without overwrite flag (should succeed by default)
	err = storage.Store(ctx, testKey, newData, nil)
	if err != nil {
		t.Errorf("Store without overwrite flag should succeed: %v", err)
	}

	// Store original again
	err = storage.Store(ctx, testKey, originalData, nil)
	if err != nil {
		t.Fatalf("Failed to store original file again: %v", err)
	}

	// Try to store with overwrite=false (should fail)
	err = storage.Store(ctx, testKey, newData, &StoreOptions{Overwrite: false})
	if err == nil {
		t.Error("Store with overwrite=false should fail when file exists")
	}
	if !IsAlreadyExists(err) {
		t.Errorf("Expected AlreadyExists error, got: %v", err)
	}

	// Store with overwrite=true (should succeed)
	err = storage.Store(ctx, testKey, newData, &StoreOptions{Overwrite: true})
	if err != nil {
		t.Errorf("Store with overwrite=true should succeed: %v", err)
	}

	// Verify new content
	retrieved, err := storage.Retrieve(ctx, testKey)
	if err != nil {
		t.Errorf("Failed to retrieve file: %v", err)
	}
	if string(retrieved) != string(newData) {
		t.Errorf("Content not updated: got %s, want %s", retrieved, newData)
	}
}

func TestLocalFileStorage_Retrieve(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "storage_test_*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	storage, err := NewLocalFileStorage(tempDir)
	if err != nil {
		t.Fatalf("Failed to create storage: %v", err)
	}
	defer storage.Close()

	ctx := context.Background()
	testData := []byte("test file content")
	testKey := "test/file.txt"

	// Store test file
	err = storage.Store(ctx, testKey, testData, nil)
	if err != nil {
		t.Fatalf("Failed to store test file: %v", err)
	}

	tests := []struct {
		name    string
		key     string
		want    []byte
		wantErr bool
	}{
		{
			name:    "retrieve existing file",
			key:     testKey,
			want:    testData,
			wantErr: false,
		},
		{
			name:    "retrieve non-existent file",
			key:     "nonexistent.txt",
			want:    nil,
			wantErr: true,
		},
		{
			name:    "invalid key",
			key:     "",
			want:    nil,
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := storage.Retrieve(ctx, tt.key)
			if (err != nil) != tt.wantErr {
				t.Errorf("Retrieve() error = %v, wantErr %v", err, tt.wantErr)
				return
			}

			if !tt.wantErr {
				if string(got) != string(tt.want) {
					t.Errorf("Retrieve() = %v, want %v", got, tt.want)
				}
			} else if tt.key == "nonexistent.txt" && !IsNotFound(err) {
				t.Errorf("Expected NotFound error, got: %v", err)
			}
		})
	}
}

func TestLocalFileStorage_Delete(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "storage_test_*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	storage, err := NewLocalFileStorage(tempDir)
	if err != nil {
		t.Fatalf("Failed to create storage: %v", err)
	}
	defer storage.Close()

	ctx := context.Background()
	testData := []byte("test file content")
	testKey := "test/file.txt"

	// Store test file
	err = storage.Store(ctx, testKey, testData, nil)
	if err != nil {
		t.Fatalf("Failed to store test file: %v", err)
	}

	// Verify file exists
	exists, err := storage.Exists(ctx, testKey)
	if err != nil {
		t.Fatalf("Failed to check existence: %v", err)
	}
	if !exists {
		t.Fatal("Test file should exist")
	}

	// Delete file
	err = storage.Delete(ctx, testKey)
	if err != nil {
		t.Errorf("Delete() error = %v", err)
	}

	// Verify file no longer exists
	exists, err = storage.Exists(ctx, testKey)
	if err != nil {
		t.Errorf("Failed to check existence after delete: %v", err)
	}
	if exists {
		t.Error("File should not exist after delete")
	}

	// Try to delete non-existent file
	err = storage.Delete(ctx, "nonexistent.txt")
	if err == nil {
		t.Error("Delete of non-existent file should fail")
	}
	if !IsNotFound(err) {
		t.Errorf("Expected NotFound error, got: %v", err)
	}
}

func TestLocalFileStorage_List(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "storage_test_*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	storage, err := NewLocalFileStorage(tempDir)
	if err != nil {
		t.Fatalf("Failed to create storage: %v", err)
	}
	defer storage.Close()

	ctx := context.Background()
	testData := []byte("test content")

	// Store test files
	testFiles := []string{
		"file1.txt",
		"file2.txt",
		"subdir/file3.txt",
		"subdir/file4.txt",
		"other/file5.txt",
	}

	for _, key := range testFiles {
		err = storage.Store(ctx, key, testData, nil)
		if err != nil {
			t.Fatalf("Failed to store test file %s: %v", key, err)
		}
	}

	tests := []struct {
		name          string
		opts          *ListOptions
		wantCount     int
		wantPrefix    string
		wantTruncated bool
	}{
		{
			name:          "list all files",
			opts:          nil,
			wantCount:     5,
			wantPrefix:    "",
			wantTruncated: false,
		},
		{
			name:          "list with prefix",
			opts:          &ListOptions{Prefix: "subdir/"},
			wantCount:     2,
			wantPrefix:    "subdir/",
			wantTruncated: false,
		},
		{
			name:          "list with limit",
			opts:          &ListOptions{MaxResults: 2},
			wantCount:     2,
			wantPrefix:    "",
			wantTruncated: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := storage.List(ctx, tt.opts)
			if err != nil {
				t.Errorf("List() error = %v", err)
				return
			}

			if len(result.Files) != tt.wantCount {
				t.Errorf("List() returned %d files, want %d", len(result.Files), tt.wantCount)
			}

			if result.IsTruncated != tt.wantTruncated {
				t.Errorf("List() IsTruncated = %v, want %v", result.IsTruncated, tt.wantTruncated)
			}

			// Check prefix filtering
			if tt.wantPrefix != "" {
				for _, file := range result.Files {
					if !strings.HasPrefix(file.Key, tt.wantPrefix) {
						t.Errorf("File %s doesn't match prefix %s", file.Key, tt.wantPrefix)
					}
				}
			}
		})
	}
}

func TestLocalFileStorage_GetMetadata(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "storage_test_*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	storage, err := NewLocalFileStorage(tempDir)
	if err != nil {
		t.Fatalf("Failed to create storage: %v", err)
	}
	defer storage.Close()

	ctx := context.Background()
	testData := []byte("test file content")
	testKey := "test/file.txt"
	customMetadata := map[string]string{"author": "test", "version": "1.0"}

	// Store file with metadata
	err = storage.Store(ctx, testKey, testData, &StoreOptions{
		ContentType: "text/plain",
		Metadata:    customMetadata,
	})
	if err != nil {
		t.Fatalf("Failed to store test file: %v", err)
	}

	// Get metadata
	metadata, err := storage.GetMetadata(ctx, testKey)
	if err != nil {
		t.Errorf("GetMetadata() error = %v", err)
		return
	}

	// Verify metadata
	if metadata.Key != testKey {
		t.Errorf("Metadata.Key = %s, want %s", metadata.Key, testKey)
	}

	if metadata.Size != int64(len(testData)) {
		t.Errorf("Metadata.Size = %d, want %d", metadata.Size, len(testData))
	}

	// Content type might include charset, so check if it starts with the expected type
	if !strings.HasPrefix(metadata.ContentType, "text/plain") {
		t.Errorf("Metadata.ContentType = %s, want text/plain (or with charset)", metadata.ContentType)
	}

	if metadata.Metadata == nil {
		t.Error("Metadata.Metadata is nil")
	} else {
		for k, v := range customMetadata {
			if metadata.Metadata[k] != v {
				t.Errorf("Metadata.Metadata[%s] = %s, want %s", k, metadata.Metadata[k], v)
			}
		}
	}

	// Test non-existent file
	_, err = storage.GetMetadata(ctx, "nonexistent.txt")
	if err == nil {
		t.Error("GetMetadata for non-existent file should fail")
	}
	if !IsNotFound(err) {
		t.Errorf("Expected NotFound error, got: %v", err)
	}
}

func TestLocalFileStorage_CopyMove(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "storage_test_*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	storage, err := NewLocalFileStorage(tempDir)
	if err != nil {
		t.Fatalf("Failed to create storage: %v", err)
	}
	defer storage.Close()

	ctx := context.Background()
	testData := []byte("test file content")
	srcKey := "source/file.txt"
	copyKey := "copy/file.txt"
	moveKey := "move/file.txt"

	// Store source file
	err = storage.Store(ctx, srcKey, testData, nil)
	if err != nil {
		t.Fatalf("Failed to store source file: %v", err)
	}

	// Test Copy
	err = storage.Copy(ctx, srcKey, copyKey)
	if err != nil {
		t.Errorf("Copy() error = %v", err)
	}

	// Verify both files exist
	srcExists, _ := storage.Exists(ctx, srcKey)
	copyExists, _ := storage.Exists(ctx, copyKey)

	if !srcExists {
		t.Error("Source file should still exist after copy")
	}
	if !copyExists {
		t.Error("Copy file should exist after copy")
	}

	// Verify copy content
	copyData, err := storage.Retrieve(ctx, copyKey)
	if err != nil {
		t.Errorf("Failed to retrieve copy: %v", err)
	}
	if string(copyData) != string(testData) {
		t.Error("Copy content doesn't match original")
	}

	// Test Move
	err = storage.Move(ctx, srcKey, moveKey)
	if err != nil {
		t.Errorf("Move() error = %v", err)
	}

	// Verify source is gone, move exists
	srcExists, _ = storage.Exists(ctx, srcKey)
	moveExists, _ := storage.Exists(ctx, moveKey)

	if srcExists {
		t.Error("Source file should not exist after move")
	}
	if !moveExists {
		t.Error("Move file should exist after move")
	}

	// Verify move content
	moveData, err := storage.Retrieve(ctx, moveKey)
	if err != nil {
		t.Errorf("Failed to retrieve moved file: %v", err)
	}
	if string(moveData) != string(testData) {
		t.Error("Moved content doesn't match original")
	}
}

func TestLocalFileStorage_GenerateURL(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "storage_test_*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	// Test without base URL
	storage1, err := NewLocalFileStorage(tempDir)
	if err != nil {
		t.Fatalf("Failed to create storage: %v", err)
	}
	defer storage1.Close()

	// Test with base URL
	storage2, err := NewLocalFileStorage(tempDir, "http://localhost:8080/files")
	if err != nil {
		t.Fatalf("Failed to create storage with base URL: %v", err)
	}
	defer storage2.Close()

	ctx := context.Background()
	testData := []byte("test content")
	testKey := "test/file.txt"

	// Store test file
	err = storage1.Store(ctx, testKey, testData, nil)
	if err != nil {
		t.Fatalf("Failed to store test file: %v", err)
	}

	// Test URL generation without base URL (should return file:// URL)
	url1, err := storage1.GenerateURL(ctx, testKey, time.Hour)
	if err != nil {
		t.Errorf("GenerateURL() error = %v", err)
	}
	if !strings.HasPrefix(url1, "file://") {
		t.Errorf("Expected file:// URL, got: %s", url1)
	}

	// Test URL generation with base URL (should return HTTP URL)
	url2, err := storage2.GenerateURL(ctx, testKey, time.Hour)
	if err != nil {
		t.Errorf("GenerateURL() error = %v", err)
	}
	expectedURL := "http://localhost:8080/files/" + testKey
	if url2 != expectedURL {
		t.Errorf("Expected %s, got: %s", expectedURL, url2)
	}

	// Test non-existent file
	_, err = storage1.GenerateURL(ctx, "nonexistent.txt", time.Hour)
	if err == nil {
		t.Error("GenerateURL for non-existent file should fail")
	}
	if !IsNotFound(err) {
		t.Errorf("Expected NotFound error, got: %v", err)
	}
}

func TestLocalFileStorage_AtomicOperations(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "storage_test_*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	storage, err := NewLocalFileStorage(tempDir)
	if err != nil {
		t.Fatalf("Failed to create storage: %v", err)
	}
	defer storage.Close()

	ctx := context.Background()
	testKey := "test/atomic.txt"
	testData := []byte("atomic test content")

	// Store file
	err = storage.Store(ctx, testKey, testData, nil)
	if err != nil {
		t.Fatalf("Failed to store file: %v", err)
	}

	// Verify no temporary files are left behind
	filePath := filepath.Join(tempDir, "test", "atomic.txt")
	tempPath := filePath + ".tmp"

	if _, err := os.Stat(tempPath); err == nil {
		t.Error("Temporary file should not exist after successful store")
	}

	// Verify actual file exists and has correct content
	if _, err := os.Stat(filePath); err != nil {
		t.Errorf("Actual file should exist: %v", err)
	}

	retrieved, err := storage.Retrieve(ctx, testKey)
	if err != nil {
		t.Errorf("Failed to retrieve file: %v", err)
	}
	if string(retrieved) != string(testData) {
		t.Error("Retrieved content doesn't match stored content")
	}
}
