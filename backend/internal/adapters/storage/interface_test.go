package storage

import (
	"context"
	"testing"
	"time"
)

// TestFileStorageInterface tests the FileStorage interface using the mock implementation
func TestFileStorageInterface(t *testing.T) {
	ctx := context.Background()
	storage := NewMockFileStorage()
	defer storage.Close()

	// Test data
	testKey := "test/file.txt"
	testData := []byte("Hello, World!")
	testMetadata := map[string]string{
		"author": "test",
		"type":   "text",
	}

	t.Run("Store and Retrieve", func(t *testing.T) {
		// Store file
		err := storage.Store(ctx, testKey, testData, &StoreOptions{
			ContentType: "text/plain",
			Metadata:    testMetadata,
		})
		if err != nil {
			t.Fatalf("Store failed: %v", err)
		}

		// Retrieve file
		data, err := storage.Retrieve(ctx, testKey)
		if err != nil {
			t.Fatalf("Retrieve failed: %v", err)
		}

		if string(data) != string(testData) {
			t.Errorf("Retrieved data mismatch: got %q, want %q", string(data), string(testData))
		}
	})

	t.Run("Exists", func(t *testing.T) {
		exists, err := storage.Exists(ctx, testKey)
		if err != nil {
			t.Fatalf("Exists failed: %v", err)
		}
		if !exists {
			t.Error("File should exist")
		}

		exists, err = storage.Exists(ctx, "nonexistent")
		if err != nil {
			t.Fatalf("Exists failed: %v", err)
		}
		if exists {
			t.Error("File should not exist")
		}
	})

	t.Run("GetMetadata", func(t *testing.T) {
		metadata, err := storage.GetMetadata(ctx, testKey)
		if err != nil {
			t.Fatalf("GetMetadata failed: %v", err)
		}

		if metadata.Key != testKey {
			t.Errorf("Key mismatch: got %q, want %q", metadata.Key, testKey)
		}

		if metadata.Size != int64(len(testData)) {
			t.Errorf("Size mismatch: got %d, want %d", metadata.Size, len(testData))
		}

		if metadata.ContentType != "text/plain" {
			t.Errorf("ContentType mismatch: got %q, want %q", metadata.ContentType, "text/plain")
		}

		if metadata.Metadata["author"] != "test" {
			t.Errorf("Custom metadata mismatch: got %q, want %q", metadata.Metadata["author"], "test")
		}
	})

	t.Run("List", func(t *testing.T) {
		// Store additional files
		storage.Store(ctx, "test/file2.txt", []byte("test2"), nil)
		storage.Store(ctx, "other/file.txt", []byte("other"), nil)

		// List all files
		result, err := storage.List(ctx, &ListOptions{})
		if err != nil {
			t.Fatalf("List failed: %v", err)
		}

		if len(result.Files) < 3 {
			t.Errorf("Expected at least 3 files, got %d", len(result.Files))
		}

		// List with prefix
		result, err = storage.List(ctx, &ListOptions{Prefix: "test/"})
		if err != nil {
			t.Fatalf("List with prefix failed: %v", err)
		}

		if len(result.Files) != 2 {
			t.Errorf("Expected 2 files with prefix 'test/', got %d", len(result.Files))
		}
	})

	t.Run("Copy", func(t *testing.T) {
		srcKey := testKey
		destKey := "test/copy.txt"

		err := storage.Copy(ctx, srcKey, destKey)
		if err != nil {
			t.Fatalf("Copy failed: %v", err)
		}

		// Verify copy
		data, err := storage.Retrieve(ctx, destKey)
		if err != nil {
			t.Fatalf("Retrieve copy failed: %v", err)
		}

		if string(data) != string(testData) {
			t.Errorf("Copied data mismatch: got %q, want %q", string(data), string(testData))
		}
	})

	t.Run("Move", func(t *testing.T) {
		srcKey := "test/copy.txt"
		destKey := "test/moved.txt"

		err := storage.Move(ctx, srcKey, destKey)
		if err != nil {
			t.Fatalf("Move failed: %v", err)
		}

		// Verify source is gone
		exists, err := storage.Exists(ctx, srcKey)
		if err != nil {
			t.Fatalf("Exists check failed: %v", err)
		}
		if exists {
			t.Error("Source file should not exist after move")
		}

		// Verify destination exists
		exists, err = storage.Exists(ctx, destKey)
		if err != nil {
			t.Fatalf("Exists check failed: %v", err)
		}
		if !exists {
			t.Error("Destination file should exist after move")
		}
	})

	t.Run("GenerateURL", func(t *testing.T) {
		url, err := storage.GenerateURL(ctx, testKey, time.Hour)
		if err != nil {
			t.Fatalf("GenerateURL failed: %v", err)
		}

		if url == "" {
			t.Error("Generated URL should not be empty")
		}
	})

	t.Run("GetSize", func(t *testing.T) {
		size, err := storage.GetSize(ctx, testKey)
		if err != nil {
			t.Fatalf("GetSize failed: %v", err)
		}

		if size != int64(len(testData)) {
			t.Errorf("Size mismatch: got %d, want %d", size, len(testData))
		}
	})

	t.Run("Delete", func(t *testing.T) {
		err := storage.Delete(ctx, testKey)
		if err != nil {
			t.Fatalf("Delete failed: %v", err)
		}

		// Verify file is gone
		exists, err := storage.Exists(ctx, testKey)
		if err != nil {
			t.Fatalf("Exists check failed: %v", err)
		}
		if exists {
			t.Error("File should not exist after delete")
		}
	})

	t.Run("Error Cases", func(t *testing.T) {
		// Test invalid key
		err := storage.Store(ctx, "", []byte("test"), nil)
		if err == nil {
			t.Error("Store with empty key should fail")
		}

		// Test file not found
		_, err = storage.Retrieve(ctx, "nonexistent")
		if err == nil {
			t.Error("Retrieve nonexistent file should fail")
		}
		if !IsNotFound(err) {
			t.Error("Error should be NotFound")
		}

		// Test delete nonexistent
		err = storage.Delete(ctx, "nonexistent")
		if err == nil {
			t.Error("Delete nonexistent file should fail")
		}
		if !IsNotFound(err) {
			t.Error("Error should be NotFound")
		}
	})
}
