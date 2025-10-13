package handlers

import (
	"github.com/gin-gonic/gin"
	swaggerFiles "github.com/swaggo/files"
	ginSwagger "github.com/swaggo/gin-swagger"

	"bakery-invoice-api/internal/middleware"
	"bakery-invoice-api/internal/services"
)

// RouterConfig holds configuration for setting up routes
type RouterConfig struct {
	CustomerService services.CustomerService
	ProductService  services.ProductService
	ReceiptService  services.ReceiptService
	EmailService    services.EmailService
	AuthService     *middleware.AuthService
}

// SetupRoutes configures all API routes
func SetupRoutes(router *gin.Engine, config *RouterConfig) {
	// Create handlers
	customerHandler := NewCustomerHandler(config.CustomerService)
	productHandler := NewProductHandler(config.ProductService)
	receiptHandler := NewReceiptHandler(config.ReceiptService)
	emailHandler := NewEmailHandler(config.EmailService)
	authHandler := NewAuthHandler(config.AuthService)

	// Swagger documentation
	router.GET("/swagger/*any", ginSwagger.WrapHandler(swaggerFiles.Handler))

	// Health check endpoint
	router.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{
			"status":  "healthy",
			"service": "bakery-invoice-api",
			"version": "1.0.0",
		})
	})

	// API v1 routes
	v1 := router.Group("/api/v1")
	{
		// Authentication routes (no auth required)
		auth := v1.Group("/auth")
		{
			auth.POST("/login", authHandler.Login)
			auth.POST("/refresh", authHandler.RefreshToken)
			auth.POST("/validate", authHandler.ValidateToken)

			// Protected auth routes
			authProtected := auth.Group("")
			authProtected.Use(middleware.Authentication(config.AuthService))
			{
				authProtected.POST("/logout", authHandler.Logout)
				authProtected.GET("/me", authHandler.GetCurrentUser)
			}
		}

		// Protected API routes
		api := v1.Group("")
		api.Use(middleware.Authentication(config.AuthService))
		{
			// Customer routes
			customers := api.Group("/customers")
			{
				customers.POST("", customerHandler.CreateCustomer)
				customers.GET("", customerHandler.ListCustomers)
				customers.GET("/search", customerHandler.SearchCustomers)
				customers.GET("/frequent", customerHandler.GetFrequentCustomers)
				customers.GET("/recent", customerHandler.GetRecentCustomers)
				customers.GET("/:id", customerHandler.GetCustomer)
				customers.PUT("/:id", customerHandler.UpdateCustomer)
				customers.DELETE("/:id", customerHandler.DeleteCustomer)
				customers.GET("/:id/statistics", customerHandler.GetCustomerStatistics)
			}

			// Product routes
			products := api.Group("/products")
			{
				products.POST("", productHandler.CreateProduct)
				products.GET("", productHandler.ListProducts)
				products.GET("/search", productHandler.SearchProducts)
				products.GET("/autocomplete", productHandler.AutocompleteProducts)
				products.GET("/categories", productHandler.ListCategories)
				products.GET("/categories/summary", productHandler.GetCategorySummary)
				products.GET("/popular", productHandler.GetPopularProducts)
				products.GET("/recent", productHandler.GetRecentProducts)
				products.GET("/:id", productHandler.GetProduct)
				products.PUT("/:id", productHandler.UpdateProduct)
				products.DELETE("/:id", productHandler.DeleteProduct)
				products.GET("/:id/sales", productHandler.GetProductSalesData)
			}

			// Receipt routes
			receipts := api.Group("/receipts")
			{
				receipts.POST("", receiptHandler.CreateReceipt)
				receipts.GET("", receiptHandler.ListReceipts)
				receipts.POST("/calculate", receiptHandler.CalculateReceiptTotals)
				receipts.GET("/:id", receiptHandler.GetReceipt)
				receipts.DELETE("/:id", receiptHandler.DeleteReceipt)
				receipts.GET("/:id/validate", receiptHandler.ValidateReceiptForTaxCompliance)
				receipts.GET("/:id/pdf", receiptHandler.GeneratePDF)
				receipts.GET("/:id/html", receiptHandler.GenerateHTML)
				receipts.GET("/customer/:customer_id", receiptHandler.GetReceiptsByCustomer)

				// Reporting routes
				reports := receipts.Group("/reports")
				{
					reports.GET("/sales", receiptHandler.GetSalesReport)
					reports.GET("/daily", receiptHandler.GetDailySales)
					reports.GET("/monthly", receiptHandler.GetMonthlySales)
					reports.GET("/top-customers", receiptHandler.GetTopCustomersByRevenue)
				}
			}

			// Email routes
			email := api.Group("/email")
			{
				email.POST("/send-receipt", emailHandler.SendReceipt)
				email.POST("/send-bulk", emailHandler.SendBulkReceipts)
				email.POST("/resend-failed", emailHandler.ResendFailedEmails)
				email.GET("/pending", emailHandler.GetPendingEmails)
				email.GET("/failed", emailHandler.GetFailedEmails)
				email.GET("/templates", emailHandler.GetAvailableTemplates)
				email.POST("/templates/validate", emailHandler.ValidateEmailTemplate)
				email.POST("/test-config", emailHandler.TestEmailConfiguration)
				email.GET("/settings", emailHandler.GetEmailDeliverySettings)
				email.PUT("/settings", emailHandler.UpdateEmailDeliverySettings)
				email.GET("/statistics", emailHandler.GetEmailStatistics)
				email.GET("/:id/status", emailHandler.GetEmailStatus)
				email.GET("/receipt/:receipt_id/history", emailHandler.GetEmailHistory)
			}
		}
	}
}

// SetupMiddleware configures global middleware
func SetupMiddleware(router *gin.Engine, authService *middleware.AuthService) {
	// Request ID and correlation ID
	router.Use(middleware.RequestID())
	router.Use(middleware.CorrelationID())

	// CORS
	router.Use(middleware.CORS())

	// Security headers
	router.Use(middleware.SecurityHeaders())

	// Request size limit (10MB)
	router.Use(middleware.RequestSizeLimit(10 * 1024 * 1024))

	// Content type validation for POST/PUT requests
	router.Use(middleware.ContentTypeValidation("application/json"))

	// Request validation
	router.Use(middleware.RequestValidation())

	// Rate limiting (100 requests per second, burst of 200)
	router.Use(middleware.RateLimiter(100, 200))

	// Structured logging
	router.Use(middleware.StructuredLogger())

	// Performance monitoring (log requests over 1 second)
	router.Use(middleware.PerformanceMonitor(1000))

	// Audit logging
	router.Use(middleware.AuditLogger())

	// Error tracking
	router.Use(middleware.ErrorTracker())

	// Enhanced error handling
	router.Use(middleware.EnhancedErrorHandler())
}

// SetupDevelopmentRoutes adds development-only routes
func SetupDevelopmentRoutes(router *gin.Engine, config *RouterConfig) {
	dev := router.Group("/dev")
	{
		// Generate demo token for testing
		dev.POST("/token", func(c *gin.Context) {
			token, err := config.AuthService.GenerateToken(
				"demo-user",
				"demo",
				"demo@bakery.com",
				[]string{string(middleware.RoleAdmin)},
			)
			if err != nil {
				c.JSON(500, gin.H{"error": err.Error()})
				return
			}
			c.JSON(200, gin.H{"token": token})
		})

		// Configuration info
		dev.GET("/config", func(c *gin.Context) {
			c.JSON(200, gin.H{
				"supported_countries": []gin.H{
					{"code": "AU", "name": "Australia", "tax": "GST", "rate": 0.10},
					{"code": "GB", "name": "United Kingdom", "tax": "VAT", "rate": 0.20},
					{"code": "US", "name": "United States", "tax": "Sales Tax", "rate": 0.08},
					{"code": "COL", "name": "Colombia", "tax": "IVA", "rate": 0.19},
				},
				"api_version": "1.0.1",
				"swagger_url": "/swagger/index.html",
			})
		})
	}
}
