package lambda

import (
	"context"
	"sync"
	"time"

	"bakery-invoice-api/internal/config"
	"bakery-invoice-api/pkg/server"
)

// ConnectionManager manages database connections and service containers for Lambda functions
type ConnectionManager struct {
	container   *server.Container
	lastUsed    time.Time
	mu          sync.RWMutex
	initialized bool
	initOnce    sync.Once
	config      *config.Config
}

var (
	globalConnectionManager *ConnectionManager
	connectionManagerOnce   sync.Once
)

// GetConnectionManager returns the global connection manager instance
func GetConnectionManager() *ConnectionManager {
	connectionManagerOnce.Do(func() {
		globalConnectionManager = &ConnectionManager{}
	})
	return globalConnectionManager
}

// Initialize initializes the connection manager with configuration
func (cm *ConnectionManager) Initialize(cfg *config.Config) error {
	var initErr error
	cm.initOnce.Do(func() {
		cm.mu.Lock()
		defer cm.mu.Unlock()

		cm.config = cfg
		container, err := server.NewContainer(cfg)
		if err != nil {
			initErr = err
			return
		}

		cm.container = container
		cm.lastUsed = time.Now()
		cm.initialized = true
	})

	return initErr
}

// GetContainer returns the service container, initializing if necessary
func (cm *ConnectionManager) GetContainer(ctx context.Context) (*server.Container, error) {
	cm.mu.RLock()
	if cm.initialized && cm.container != nil {
		cm.lastUsed = time.Now()
		container := cm.container
		cm.mu.RUnlock()
		return container, nil
	}
	cm.mu.RUnlock()

	// Need to initialize
	if cm.config == nil {
		cfg, err := config.GetOptimizedConfig()
		if err != nil {
			return nil, err
		}
		if err := cm.Initialize(cfg); err != nil {
			return nil, err
		}
	}

	cm.mu.RLock()
	defer cm.mu.RUnlock()
	return cm.container, nil
}

// IsHealthy checks if the connection manager is healthy
func (cm *ConnectionManager) IsHealthy() bool {
	cm.mu.RLock()
	defer cm.mu.RUnlock()

	if !cm.initialized || cm.container == nil {
		return false
	}

	// Check if connection is stale (older than 5 minutes)
	return time.Since(cm.lastUsed) < 5*time.Minute
}

// Cleanup performs cleanup operations
func (cm *ConnectionManager) Cleanup() error {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	if cm.container != nil {
		// Close database connections and cleanup resources
		if err := cm.container.Close(); err != nil {
			return err
		}
		cm.container = nil
	}

	cm.initialized = false
	return nil
}

// UpdateLastUsed updates the last used timestamp
func (cm *ConnectionManager) UpdateLastUsed() {
	cm.mu.Lock()
	defer cm.mu.Unlock()
	cm.lastUsed = time.Now()
}
