package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"bakery-invoice-api/internal/config"
	"bakery-invoice-api/internal/handlers"
	"bakery-invoice-api/pkg/server"

	"github.com/gin-gonic/gin"
	"github.com/sirupsen/logrus"
)

// @title Bakery Invoice API
// @version 1.0.1
// @description A professional invoice system for bakeries
// @termsOfService http://swagger.io/terms/

// @contact.name API Support
// @contact.url http://www.bakery-invoice.com/support
// @contact.email support@bakery-invoice.com

// @license.name MIT
// @license.url https://opensource.org/licenses/MIT

// @host localhost:8081
// @BasePath /api/v1

// @securityDefinitions.apikey BearerAuth
// @in header
// @name Authorization
// @description Type "Bearer" followed by a space and JWT token.

func main() {
	// Initialize logging first
	setupLogging()

	logrus.Info("Starting Bakery Invoice API Server")

	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		logrus.WithError(err).Fatal("Failed to load configuration")
	}

	// Configure logging based on config
	configureLogging(cfg)

	// Print configuration (with sensitive data masked)
	if cfg.IsDevelopment() {
		cfg.Print()
	}

	logrus.WithFields(logrus.Fields{
		"environment": cfg.Environment,
		"port":        cfg.Port,
		"database":    cfg.Database.Path,
	}).Info("Configuration loaded")

	// Initialize dependencies
	container, err := server.NewContainer(cfg)
	if err != nil {
		logrus.WithError(err).Fatal("Failed to initialize container")
	}
	defer func() {
		if err := container.Close(); err != nil {
			logrus.WithError(err).Error("Error closing container")
		}
	}()

	// Perform health check
	if err := container.HealthCheck(); err != nil {
		logrus.WithError(err).Warn("Health check failed, but continuing startup")
	}

	// Setup Gin mode
	if cfg.IsProduction() {
		gin.SetMode(gin.ReleaseMode)
	} else if cfg.IsTest() {
		gin.SetMode(gin.TestMode)
	} else {
		gin.SetMode(gin.DebugMode)
	}

	// Create router
	router := gin.New()

	// Setup middleware
	handlers.SetupMiddleware(router, container.AuthService)

	// Setup routes
	routerConfig := &handlers.RouterConfig{
		CustomerService: container.CustomerService,
		ProductService:  container.ProductService,
		ReceiptService:  container.ReceiptService,
		EmailService:    container.EmailService,
		AuthService:     container.AuthService,
	}
	handlers.SetupRoutes(router, routerConfig)

	// Setup development routes if in development mode
	if cfg.IsDevelopment() {
		handlers.SetupDevelopmentRoutes(router, routerConfig)
	}

	// Create HTTP server with timeouts
	srv := &http.Server{
		Addr:           cfg.GetServerAddress(),
		Handler:        router,
		ReadTimeout:    time.Duration(cfg.Server.ReadTimeout) * time.Second,
		WriteTimeout:   time.Duration(cfg.Server.WriteTimeout) * time.Second,
		IdleTimeout:    time.Duration(cfg.Server.IdleTimeout) * time.Second,
		MaxHeaderBytes: cfg.Server.MaxHeaderBytes,
	}

	// Start server in a goroutine
	go func() {
		logrus.WithFields(logrus.Fields{
			"address":       srv.Addr,
			"read_timeout":  srv.ReadTimeout,
			"write_timeout": srv.WriteTimeout,
		}).Info("Starting HTTP server")

		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logrus.WithError(err).Fatal("Failed to start server")
		}
	}()

	logrus.WithFields(logrus.Fields{
		"port":        cfg.Port,
		"environment": cfg.Environment,
		"swagger_url": fmt.Sprintf("http://localhost:%s/swagger/index.html", cfg.Port),
		"health_url":  fmt.Sprintf("http://localhost:%s/health", cfg.Port),
	}).Info("Server started successfully")

	// Wait for interrupt signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	logrus.Info("Shutting down server...")

	// Graceful shutdown with timeout
	shutdownTimeout := time.Duration(cfg.Server.ShutdownTimeout) * time.Second
	ctx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		logrus.WithError(err).Error("Server forced to shutdown")
	} else {
		logrus.Info("Server shutdown completed gracefully")
	}
}

// setupLogging initializes basic logging
func setupLogging() {
	logrus.SetFormatter(&logrus.JSONFormatter{
		TimestampFormat: time.RFC3339,
	})
	logrus.SetLevel(logrus.InfoLevel)
}

// configureLogging configures logging based on configuration
func configureLogging(cfg *config.Config) {
	// Set log level
	level, err := logrus.ParseLevel(cfg.Logging.Level)
	if err != nil {
		logrus.WithError(err).Warn("Invalid log level, using info")
		level = logrus.InfoLevel
	}
	logrus.SetLevel(level)

	// Set log format
	if cfg.Logging.Format == "text" {
		logrus.SetFormatter(&logrus.TextFormatter{
			FullTimestamp: true,
		})
	} else {
		logrus.SetFormatter(&logrus.JSONFormatter{
			TimestampFormat: time.RFC3339,
		})
	}

	// Set output
	switch cfg.Logging.Output {
	case "stderr":
		logrus.SetOutput(os.Stderr)
	case "stdout":
		logrus.SetOutput(os.Stdout)
	default:
		// For file output, you might want to implement log rotation
		logrus.SetOutput(os.Stdout)
	}

	logrus.WithFields(logrus.Fields{
		"level":  cfg.Logging.Level,
		"format": cfg.Logging.Format,
		"output": cfg.Logging.Output,
	}).Debug("Logging configured")
}
