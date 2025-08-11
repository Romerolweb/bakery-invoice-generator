package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"bakery-invoice-api/internal/config"
	"bakery-invoice-api/internal/handlers"
	"bakery-invoice-api/internal/middleware"
	"bakery-invoice-api/pkg/server"

	"github.com/gin-gonic/gin"
	swaggerFiles "github.com/swaggo/files"
	ginSwagger "github.com/swaggo/gin-swagger"
)

// @title Bakery Invoice API
// @version 1.0
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
	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Failed to load configuration: %v", err)
	}

	// Initialize dependencies
	container, err := server.NewContainer(cfg)
	if err != nil {
		log.Fatalf("Failed to initialize container: %v", err)
	}
	defer container.Close()

	// Setup Gin router
	if cfg.Environment == "production" {
		gin.SetMode(gin.ReleaseMode)
	}

	router := gin.New()
	router.Use(gin.Logger())
	router.Use(gin.Recovery())

	// Add middleware
	router.Use(middleware.CORS())
	router.Use(middleware.ErrorHandler())
	router.Use(middleware.RequestLogger())

	// Health check endpoint
	router.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status":    "healthy",
			"timestamp": time.Now().UTC(),
			"version":   "1.0.0",
		})
	})

	// API routes
	v1 := router.Group("/api/v1")
	{
		// Initialize handlers
		customerHandler := handlers.NewCustomerHandler(container.CustomerService)
		productHandler := handlers.NewProductHandler(container.ProductService)
		receiptHandler := handlers.NewReceiptHandler(container.ReceiptService)
		emailHandler := handlers.NewEmailHandler(container.EmailService)

		// Customer routes
		customers := v1.Group("/customers")
		{
			customers.POST("", customerHandler.CreateCustomer)
			customers.GET("", customerHandler.ListCustomers)
			customers.GET("/:id", customerHandler.GetCustomer)
			customers.PUT("/:id", customerHandler.UpdateCustomer)
			customers.DELETE("/:id", customerHandler.DeleteCustomer)
			customers.GET("/search", customerHandler.SearchCustomers)
		}

		// Product routes
		products := v1.Group("/products")
		{
			products.POST("", productHandler.CreateProduct)
			products.GET("", productHandler.ListProducts)
			products.GET("/:id", productHandler.GetProduct)
			products.PUT("/:id", productHandler.UpdateProduct)
			products.DELETE("/:id", productHandler.DeleteProduct)
			products.GET("/search", productHandler.SearchProducts)
			products.GET("/categories", productHandler.ListCategories)
		}

		// Receipt routes
		receipts := v1.Group("/receipts")
		{
			receipts.POST("", receiptHandler.CreateReceipt)
			receipts.GET("", receiptHandler.ListReceipts)
			receipts.GET("/:id", receiptHandler.GetReceipt)
			receipts.GET("/:id/pdf", receiptHandler.GeneratePDF)
			receipts.GET("/reports/sales", receiptHandler.GetSalesReport)
		}

		// Email routes
		email := v1.Group("/email")
		{
			email.POST("/send-receipt", emailHandler.SendReceipt)
			email.POST("/send-bulk", emailHandler.SendBulkReceipts)
			email.GET("/status/:id", emailHandler.GetEmailStatus)
		}
	}

	// Swagger documentation
	router.GET("/swagger/*any", ginSwagger.WrapHandler(swaggerFiles.Handler))

	// Start server
	srv := &http.Server{
		Addr:    ":" + cfg.Port,
		Handler: router,
	}

	// Graceful shutdown
	go func() {
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Failed to start server: %v", err)
		}
	}()

	log.Printf("Server started on port %s", cfg.Port)

	// Wait for interrupt signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down server...")

	// Graceful shutdown with timeout
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		log.Fatalf("Server forced to shutdown: %v", err)
	}

	log.Println("Server exited")
}
