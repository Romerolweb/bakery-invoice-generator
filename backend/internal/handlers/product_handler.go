package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"bakery-invoice-api/internal/services"
	"bakery-invoice-api/pkg/lambda"
)

// ProductHandler handles product-related HTTP requests
type ProductHandler struct {
	productService services.ProductService
}

// NewProductHandler creates a new product handler
func NewProductHandler(productService services.ProductService) *ProductHandler {
	return &ProductHandler{
		productService: productService,
	}
}

// @Summary Create a new product
// @Description Create a new product in the system
// @Tags products
// @Accept json
// @Produce json
// @Param product body services.CreateProductRequest true "Product data"
// @Success 201 {object} models.Product
// @Failure 400 {object} ErrorResponse
// @Failure 500 {object} ErrorResponse
// @Router /products [post]
func (h *ProductHandler) CreateProduct(c *gin.Context) {
	var req services.CreateProductRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Error:   "Invalid request body",
			Message: err.Error(),
		})
		return
	}

	product, err := h.productService.CreateProduct(c.Request.Context(), &req)
	if err != nil {
		if isValidationError(err) {
			c.JSON(http.StatusBadRequest, ErrorResponse{
				Error:   "Validation failed",
				Message: err.Error(),
			})
			return
		}
		c.JSON(http.StatusInternalServerError, ErrorResponse{
			Error:   "Failed to create product",
			Message: err.Error(),
		})
		return
	}

	c.JSON(http.StatusCreated, product)
}

// @Summary List products
// @Description Get a list of products with optional filters
// @Tags products
// @Accept json
// @Produce json
// @Param category query string false "Filter by category"
// @Param active query bool false "Filter by active status"
// @Param gst_applicable query bool false "Filter by GST applicability"
// @Param min_price query number false "Minimum price filter"
// @Param max_price query number false "Maximum price filter"
// @Param created_after query string false "Filter by creation date (RFC3339 format)"
// @Param created_before query string false "Filter by creation date (RFC3339 format)"
// @Param limit query int false "Limit number of results" default(100)
// @Param offset query int false "Offset for pagination" default(0)
// @Success 200 {array} models.Product
// @Failure 400 {object} ErrorResponse
// @Failure 500 {object} ErrorResponse
// @Router /products [get]
func (h *ProductHandler) ListProducts(c *gin.Context) {
	filters := &services.ProductFilters{}

	// Parse query parameters
	if category := c.Query("category"); category != "" {
		filters.Category = &category
	}

	if active := c.Query("active"); active != "" {
		if val, err := strconv.ParseBool(active); err == nil {
			filters.Active = &val
		}
	}

	if gstApplicable := c.Query("gst_applicable"); gstApplicable != "" {
		if val, err := strconv.ParseBool(gstApplicable); err == nil {
			filters.GSTApplicable = &val
		}
	}

	if minPrice := c.Query("min_price"); minPrice != "" {
		if val, err := strconv.ParseFloat(minPrice, 64); err == nil {
			filters.MinPrice = &val
		}
	}

	if maxPrice := c.Query("max_price"); maxPrice != "" {
		if val, err := strconv.ParseFloat(maxPrice, 64); err == nil {
			filters.MaxPrice = &val
		}
	}

	if createdAfter := c.Query("created_after"); createdAfter != "" {
		if t, err := time.Parse(time.RFC3339, createdAfter); err == nil {
			filters.CreatedAfter = &t
		}
	}

	if createdBefore := c.Query("created_before"); createdBefore != "" {
		if t, err := time.Parse(time.RFC3339, createdBefore); err == nil {
			filters.CreatedBefore = &t
		}
	}

	if limit := c.Query("limit"); limit != "" {
		if val, err := strconv.Atoi(limit); err == nil && val > 0 {
			filters.Limit = val
		}
	}

	if offset := c.Query("offset"); offset != "" {
		if val, err := strconv.Atoi(offset); err == nil && val >= 0 {
			filters.Offset = val
		}
	}

	products, err := h.productService.ListProducts(c.Request.Context(), filters)
	if err != nil {
		c.JSON(http.StatusInternalServerError, ErrorResponse{
			Error:   "Failed to list products",
			Message: err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, products)
}

// @Summary Get a product
// @Description Get a product by ID
// @Tags products
// @Accept json
// @Produce json
// @Param id path string true "Product ID"
// @Success 200 {object} models.Product
// @Failure 400 {object} ErrorResponse
// @Failure 404 {object} ErrorResponse
// @Failure 500 {object} ErrorResponse
// @Router /products/{id} [get]
func (h *ProductHandler) GetProduct(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Error:   "Invalid request",
			Message: "Product ID is required",
		})
		return
	}

	// Validate UUID format
	if _, err := uuid.Parse(id); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Error:   "Invalid product ID",
			Message: "Product ID must be a valid UUID",
		})
		return
	}

	product, err := h.productService.GetProduct(c.Request.Context(), id)
	if err != nil {
		if isNotFoundError(err) {
			c.JSON(http.StatusNotFound, ErrorResponse{
				Error:   "Product not found",
				Message: err.Error(),
			})
			return
		}
		c.JSON(http.StatusInternalServerError, ErrorResponse{
			Error:   "Failed to get product",
			Message: err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, product)
}

// @Summary Update a product
// @Description Update an existing product
// @Tags products
// @Accept json
// @Produce json
// @Param id path string true "Product ID"
// @Param product body services.UpdateProductRequest true "Updated product data"
// @Success 200 {object} models.Product
// @Failure 400 {object} ErrorResponse
// @Failure 404 {object} ErrorResponse
// @Failure 500 {object} ErrorResponse
// @Router /products/{id} [put]
func (h *ProductHandler) UpdateProduct(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Error:   "Invalid request",
			Message: "Product ID is required",
		})
		return
	}

	// Validate UUID format
	if _, err := uuid.Parse(id); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Error:   "Invalid product ID",
			Message: "Product ID must be a valid UUID",
		})
		return
	}

	var req services.UpdateProductRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Error:   "Invalid request body",
			Message: err.Error(),
		})
		return
	}

	product, err := h.productService.UpdateProduct(c.Request.Context(), id, &req)
	if err != nil {
		if isNotFoundError(err) {
			c.JSON(http.StatusNotFound, ErrorResponse{
				Error:   "Product not found",
				Message: err.Error(),
			})
			return
		}
		if isValidationError(err) {
			c.JSON(http.StatusBadRequest, ErrorResponse{
				Error:   "Validation failed",
				Message: err.Error(),
			})
			return
		}
		c.JSON(http.StatusInternalServerError, ErrorResponse{
			Error:   "Failed to update product",
			Message: err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, product)
}

// @Summary Delete a product
// @Description Delete a product by ID
// @Tags products
// @Accept json
// @Produce json
// @Param id path string true "Product ID"
// @Success 204 "Product deleted successfully"
// @Failure 400 {object} ErrorResponse
// @Failure 404 {object} ErrorResponse
// @Failure 409 {object} ErrorResponse
// @Failure 500 {object} ErrorResponse
// @Router /products/{id} [delete]
func (h *ProductHandler) DeleteProduct(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Error:   "Invalid request",
			Message: "Product ID is required",
		})
		return
	}

	// Validate UUID format
	if _, err := uuid.Parse(id); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Error:   "Invalid product ID",
			Message: "Product ID must be a valid UUID",
		})
		return
	}

	err := h.productService.DeleteProduct(c.Request.Context(), id)
	if err != nil {
		if isNotFoundError(err) {
			c.JSON(http.StatusNotFound, ErrorResponse{
				Error:   "Product not found",
				Message: err.Error(),
			})
			return
		}
		if isConflictError(err) {
			c.JSON(http.StatusConflict, ErrorResponse{
				Error:   "Cannot delete product",
				Message: err.Error(),
			})
			return
		}
		c.JSON(http.StatusInternalServerError, ErrorResponse{
			Error:   "Failed to delete product",
			Message: err.Error(),
		})
		return
	}

	c.Status(http.StatusNoContent)
}

// @Summary Search products
// @Description Search products by name or description
// @Tags products
// @Accept json
// @Produce json
// @Param q query string true "Search query"
// @Param limit query int false "Limit number of results" default(50)
// @Success 200 {array} models.Product
// @Failure 400 {object} ErrorResponse
// @Failure 500 {object} ErrorResponse
// @Router /products/search [get]
func (h *ProductHandler) SearchProducts(c *gin.Context) {
	query := c.Query("q")
	if query == "" {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Error:   "Invalid request",
			Message: "Search query is required",
		})
		return
	}

	limit := 50
	if limitStr := c.Query("limit"); limitStr != "" {
		if val, err := strconv.Atoi(limitStr); err == nil && val > 0 {
			limit = val
		}
	}

	products, err := h.productService.SearchProducts(c.Request.Context(), query, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, ErrorResponse{
			Error:   "Failed to search products",
			Message: err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, products)
}

// @Summary Autocomplete products
// @Description Get product suggestions for autocomplete
// @Tags products
// @Accept json
// @Produce json
// @Param prefix query string true "Product name prefix"
// @Param limit query int false "Limit number of results" default(10)
// @Success 200 {array} models.Product
// @Failure 400 {object} ErrorResponse
// @Failure 500 {object} ErrorResponse
// @Router /products/autocomplete [get]
func (h *ProductHandler) AutocompleteProducts(c *gin.Context) {
	prefix := c.Query("prefix")
	if prefix == "" {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Error:   "Invalid request",
			Message: "Prefix is required",
		})
		return
	}

	limit := 10
	if limitStr := c.Query("limit"); limitStr != "" {
		if val, err := strconv.Atoi(limitStr); err == nil && val > 0 {
			limit = val
		}
	}

	products, err := h.productService.AutocompleteProducts(c.Request.Context(), prefix, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, ErrorResponse{
			Error:   "Failed to autocomplete products",
			Message: err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, products)
}

// @Summary List product categories
// @Description Get all product categories
// @Tags products
// @Accept json
// @Produce json
// @Success 200 {array} string
// @Failure 500 {object} ErrorResponse
// @Router /products/categories [get]
func (h *ProductHandler) ListCategories(c *gin.Context) {
	categories, err := h.productService.GetProductCategories(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, ErrorResponse{
			Error:   "Failed to get categories",
			Message: err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, categories)
}

// @Summary Get category summary
// @Description Get product count by category
// @Tags products
// @Accept json
// @Produce json
// @Success 200 {object} map[string]int64
// @Failure 500 {object} ErrorResponse
// @Router /products/categories/summary [get]
func (h *ProductHandler) GetCategorySummary(c *gin.Context) {
	summary, err := h.productService.GetCategorySummary(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, ErrorResponse{
			Error:   "Failed to get category summary",
			Message: err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, summary)
}

// @Summary Get popular products
// @Description Get products ordered by frequency of use
// @Tags products
// @Accept json
// @Produce json
// @Param limit query int false "Limit number of results" default(10)
// @Success 200 {array} models.Product
// @Failure 500 {object} ErrorResponse
// @Router /products/popular [get]
func (h *ProductHandler) GetPopularProducts(c *gin.Context) {
	limit := 10
	if limitStr := c.Query("limit"); limitStr != "" {
		if val, err := strconv.Atoi(limitStr); err == nil && val > 0 {
			limit = val
		}
	}

	products, err := h.productService.GetPopularProducts(c.Request.Context(), limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, ErrorResponse{
			Error:   "Failed to get popular products",
			Message: err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, products)
}

// @Summary Get recent products
// @Description Get products created within the specified duration
// @Tags products
// @Accept json
// @Produce json
// @Param since query string false "Duration (e.g., '24h', '7d', '30d')" default("30d")
// @Success 200 {array} models.Product
// @Failure 400 {object} ErrorResponse
// @Failure 500 {object} ErrorResponse
// @Router /products/recent [get]
func (h *ProductHandler) GetRecentProducts(c *gin.Context) {
	since := 30 * 24 * time.Hour // Default to 30 days
	if sinceStr := c.Query("since"); sinceStr != "" {
		if duration, err := time.ParseDuration(sinceStr); err == nil {
			since = duration
		}
	}

	products, err := h.productService.GetRecentProducts(c.Request.Context(), since)
	if err != nil {
		c.JSON(http.StatusInternalServerError, ErrorResponse{
			Error:   "Failed to get recent products",
			Message: err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, products)
}

// @Summary Get product sales data
// @Description Get sales data for a specific product
// @Tags products
// @Accept json
// @Produce json
// @Param id path string true "Product ID"
// @Param start_date query string false "Start date (RFC3339 format)"
// @Param end_date query string false "End date (RFC3339 format)"
// @Success 200 {object} services.ProductSalesData
// @Failure 400 {object} ErrorResponse
// @Failure 404 {object} ErrorResponse
// @Failure 500 {object} ErrorResponse
// @Router /products/{id}/sales [get]
func (h *ProductHandler) GetProductSalesData(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Error:   "Invalid request",
			Message: "Product ID is required",
		})
		return
	}

	// Validate UUID format
	if _, err := uuid.Parse(id); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Error:   "Invalid product ID",
			Message: "Product ID must be a valid UUID",
		})
		return
	}

	// Parse date range
	startDate := time.Now().AddDate(0, -1, 0) // Default to 1 month ago
	endDate := time.Now()

	if startDateStr := c.Query("start_date"); startDateStr != "" {
		if t, err := time.Parse(time.RFC3339, startDateStr); err == nil {
			startDate = t
		}
	}

	if endDateStr := c.Query("end_date"); endDateStr != "" {
		if t, err := time.Parse(time.RFC3339, endDateStr); err == nil {
			endDate = t
		}
	}

	salesData, err := h.productService.GetProductSalesData(c.Request.Context(), id, startDate, endDate)
	if err != nil {
		if isNotFoundError(err) {
			c.JSON(http.StatusNotFound, ErrorResponse{
				Error:   "Product not found",
				Message: err.Error(),
			})
			return
		}
		c.JSON(http.StatusInternalServerError, ErrorResponse{
			Error:   "Failed to get product sales data",
			Message: err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, salesData)
}

// Lambda-compatible handler methods

// HandleCreate handles product creation for Lambda
func (h *ProductHandler) HandleCreate(ctx context.Context, req *lambda.Request) (*lambda.Response, error) {
	var createReq services.CreateProductRequest
	if err := json.Unmarshal(req.Body, &createReq); err != nil {
		return &lambda.Response{
			StatusCode: http.StatusBadRequest,
			Headers:    map[string]string{"Content-Type": "application/json"},
			Body:       []byte(`{"error": "Invalid request body", "message": "` + err.Error() + `"}`),
		}, nil
	}

	product, err := h.productService.CreateProduct(ctx, &createReq)
	if err != nil {
		if isValidationError(err) {
			return &lambda.Response{
				StatusCode: http.StatusBadRequest,
				Headers:    map[string]string{"Content-Type": "application/json"},
				Body:       []byte(`{"error": "Validation failed", "message": "` + err.Error() + `"}`),
			}, nil
		}
		return &lambda.Response{
			StatusCode: http.StatusInternalServerError,
			Headers:    map[string]string{"Content-Type": "application/json"},
			Body:       []byte(`{"error": "Failed to create product", "message": "` + err.Error() + `"}`),
		}, nil
	}

	responseBody, err := json.Marshal(product)
	if err != nil {
		return &lambda.Response{
			StatusCode: http.StatusInternalServerError,
			Headers:    map[string]string{"Content-Type": "application/json"},
			Body:       []byte(`{"error": "Failed to marshal response"}`),
		}, nil
	}

	return &lambda.Response{
		StatusCode: http.StatusCreated,
		Headers:    map[string]string{"Content-Type": "application/json"},
		Body:       responseBody,
	}, nil
}

// HandleList handles product listing for Lambda
func (h *ProductHandler) HandleList(ctx context.Context, req *lambda.Request) (*lambda.Response, error) {
	filters := &services.ProductFilters{}

	// Parse query parameters
	if category := req.QueryParams["category"]; category != "" {
		filters.Category = &category
	}

	if activeStr := req.QueryParams["active"]; activeStr != "" {
		if val, err := strconv.ParseBool(activeStr); err == nil {
			filters.Active = &val
		}
	}

	if gstApplicableStr := req.QueryParams["gst_applicable"]; gstApplicableStr != "" {
		if val, err := strconv.ParseBool(gstApplicableStr); err == nil {
			filters.GSTApplicable = &val
		}
	}

	if minPriceStr := req.QueryParams["min_price"]; minPriceStr != "" {
		if val, err := strconv.ParseFloat(minPriceStr, 64); err == nil {
			filters.MinPrice = &val
		}
	}

	if maxPriceStr := req.QueryParams["max_price"]; maxPriceStr != "" {
		if val, err := strconv.ParseFloat(maxPriceStr, 64); err == nil {
			filters.MaxPrice = &val
		}
	}

	if createdAfter := req.QueryParams["created_after"]; createdAfter != "" {
		if t, err := time.Parse(time.RFC3339, createdAfter); err == nil {
			filters.CreatedAfter = &t
		}
	}

	if createdBefore := req.QueryParams["created_before"]; createdBefore != "" {
		if t, err := time.Parse(time.RFC3339, createdBefore); err == nil {
			filters.CreatedBefore = &t
		}
	}

	limit := 100
	if limitStr := req.QueryParams["limit"]; limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {
			limit = l
		}
	}
	filters.Limit = &limit

	offset := 0
	if offsetStr := req.QueryParams["offset"]; offsetStr != "" {
		if o, err := strconv.Atoi(offsetStr); err == nil && o >= 0 {
			offset = o
		}
	}
	filters.Offset = &offset

	products, err := h.productService.ListProducts(ctx, filters)
	if err != nil {
		return &lambda.Response{
			StatusCode: http.StatusInternalServerError,
			Headers:    map[string]string{"Content-Type": "application/json"},
			Body:       []byte(`{"error": "Failed to list products", "message": "` + err.Error() + `"}`),
		}, nil
	}

	responseBody, err := json.Marshal(products)
	if err != nil {
		return &lambda.Response{
			StatusCode: http.StatusInternalServerError,
			Headers:    map[string]string{"Content-Type": "application/json"},
			Body:       []byte(`{"error": "Failed to marshal response"}`),
		}, nil
	}

	return &lambda.Response{
		StatusCode: http.StatusOK,
		Headers:    map[string]string{"Content-Type": "application/json"},
		Body:       responseBody,
	}, nil
}

// HandleGet handles product retrieval for Lambda
func (h *ProductHandler) HandleGet(ctx context.Context, req *lambda.Request) (*lambda.Response, error) {
	id := req.PathParams["id"]
	if id == "" {
		return &lambda.Response{
			StatusCode: http.StatusBadRequest,
			Headers:    map[string]string{"Content-Type": "application/json"},
			Body:       []byte(`{"error": "Invalid request", "message": "Product ID is required"}`),
		}, nil
	}

	// Validate UUID format
	if _, err := uuid.Parse(id); err != nil {
		return &lambda.Response{
			StatusCode: http.StatusBadRequest,
			Headers:    map[string]string{"Content-Type": "application/json"},
			Body:       []byte(`{"error": "Invalid product ID", "message": "Product ID must be a valid UUID"}`),
		}, nil
	}

	product, err := h.productService.GetProduct(ctx, id)
	if err != nil {
		if isNotFoundError(err) {
			return &lambda.Response{
				StatusCode: http.StatusNotFound,
				Headers:    map[string]string{"Content-Type": "application/json"},
				Body:       []byte(`{"error": "Product not found", "message": "` + err.Error() + `"}`),
			}, nil
		}
		return &lambda.Response{
			StatusCode: http.StatusInternalServerError,
			Headers:    map[string]string{"Content-Type": "application/json"},
			Body:       []byte(`{"error": "Failed to get product", "message": "` + err.Error() + `"}`),
		}, nil
	}

	responseBody, err := json.Marshal(product)
	if err != nil {
		return &lambda.Response{
			StatusCode: http.StatusInternalServerError,
			Headers:    map[string]string{"Content-Type": "application/json"},
			Body:       []byte(`{"error": "Failed to marshal response"}`),
		}, nil
	}

	return &lambda.Response{
		StatusCode: http.StatusOK,
		Headers:    map[string]string{"Content-Type": "application/json"},
		Body:       responseBody,
	}, nil
}

// HandleUpdate handles product update for Lambda
func (h *ProductHandler) HandleUpdate(ctx context.Context, req *lambda.Request) (*lambda.Response, error) {
	id := req.PathParams["id"]
	if id == "" {
		return &lambda.Response{
			StatusCode: http.StatusBadRequest,
			Headers:    map[string]string{"Content-Type": "application/json"},
			Body:       []byte(`{"error": "Invalid request", "message": "Product ID is required"}`),
		}, nil
	}

	// Validate UUID format
	if _, err := uuid.Parse(id); err != nil {
		return &lambda.Response{
			StatusCode: http.StatusBadRequest,
			Headers:    map[string]string{"Content-Type": "application/json"},
			Body:       []byte(`{"error": "Invalid product ID", "message": "Product ID must be a valid UUID"}`),
		}, nil
	}

	var updateReq services.UpdateProductRequest
	if err := json.Unmarshal(req.Body, &updateReq); err != nil {
		return &lambda.Response{
			StatusCode: http.StatusBadRequest,
			Headers:    map[string]string{"Content-Type": "application/json"},
			Body:       []byte(`{"error": "Invalid request body", "message": "` + err.Error() + `"}`),
		}, nil
	}

	product, err := h.productService.UpdateProduct(ctx, id, &updateReq)
	if err != nil {
		if isNotFoundError(err) {
			return &lambda.Response{
				StatusCode: http.StatusNotFound,
				Headers:    map[string]string{"Content-Type": "application/json"},
				Body:       []byte(`{"error": "Product not found", "message": "` + err.Error() + `"}`),
			}, nil
		}
		if isValidationError(err) {
			return &lambda.Response{
				StatusCode: http.StatusBadRequest,
				Headers:    map[string]string{"Content-Type": "application/json"},
				Body:       []byte(`{"error": "Validation failed", "message": "` + err.Error() + `"}`),
			}, nil
		}
		return &lambda.Response{
			StatusCode: http.StatusInternalServerError,
			Headers:    map[string]string{"Content-Type": "application/json"},
			Body:       []byte(`{"error": "Failed to update product", "message": "` + err.Error() + `"}`),
		}, nil
	}

	responseBody, err := json.Marshal(product)
	if err != nil {
		return &lambda.Response{
			StatusCode: http.StatusInternalServerError,
			Headers:    map[string]string{"Content-Type": "application/json"},
			Body:       []byte(`{"error": "Failed to marshal response"}`),
		}, nil
	}

	return &lambda.Response{
		StatusCode: http.StatusOK,
		Headers:    map[string]string{"Content-Type": "application/json"},
		Body:       responseBody,
	}, nil
}

// HandleDelete handles product deletion for Lambda
func (h *ProductHandler) HandleDelete(ctx context.Context, req *lambda.Request) (*lambda.Response, error) {
	id := req.PathParams["id"]
	if id == "" {
		return &lambda.Response{
			StatusCode: http.StatusBadRequest,
			Headers:    map[string]string{"Content-Type": "application/json"},
			Body:       []byte(`{"error": "Invalid request", "message": "Product ID is required"}`),
		}, nil
	}

	// Validate UUID format
	if _, err := uuid.Parse(id); err != nil {
		return &lambda.Response{
			StatusCode: http.StatusBadRequest,
			Headers:    map[string]string{"Content-Type": "application/json"},
			Body:       []byte(`{"error": "Invalid product ID", "message": "Product ID must be a valid UUID"}`),
		}, nil
	}

	err := h.productService.DeleteProduct(ctx, id)
	if err != nil {
		if isNotFoundError(err) {
			return &lambda.Response{
				StatusCode: http.StatusNotFound,
				Headers:    map[string]string{"Content-Type": "application/json"},
				Body:       []byte(`{"error": "Product not found", "message": "` + err.Error() + `"}`),
			}, nil
		}
		return &lambda.Response{
			StatusCode: http.StatusInternalServerError,
			Headers:    map[string]string{"Content-Type": "application/json"},
			Body:       []byte(`{"error": "Failed to delete product", "message": "` + err.Error() + `"}`),
		}, nil
	}

	return &lambda.Response{
		StatusCode: http.StatusNoContent,
		Headers:    map[string]string{"Content-Type": "application/json"},
		Body:       []byte(`{"message": "Product deleted successfully"}`),
	}, nil
}

// HandleSearch handles product search for Lambda
func (h *ProductHandler) HandleSearch(ctx context.Context, req *lambda.Request) (*lambda.Response, error) {
	query := req.QueryParams["q"]
	if query == "" {
		return &lambda.Response{
			StatusCode: http.StatusBadRequest,
			Headers:    map[string]string{"Content-Type": "application/json"},
			Body:       []byte(`{"error": "Invalid request", "message": "Search query is required"}`),
		}, nil
	}

	limit := 50
	if limitStr := req.QueryParams["limit"]; limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 && l <= 100 {
			limit = l
		}
	}

	products, err := h.productService.SearchProducts(ctx, query, limit)
	if err != nil {
		return &lambda.Response{
			StatusCode: http.StatusInternalServerError,
			Headers:    map[string]string{"Content-Type": "application/json"},
			Body:       []byte(`{"error": "Failed to search products", "message": "` + err.Error() + `"}`),
		}, nil
	}

	responseBody, err := json.Marshal(products)
	if err != nil {
		return &lambda.Response{
			StatusCode: http.StatusInternalServerError,
			Headers:    map[string]string{"Content-Type": "application/json"},
			Body:       []byte(`{"error": "Failed to marshal response"}`),
		}, nil
	}

	return &lambda.Response{
		StatusCode: http.StatusOK,
		Headers:    map[string]string{"Content-Type": "application/json"},
		Body:       responseBody,
	}, nil
}

// HandleListCategories handles category listing for Lambda
func (h *ProductHandler) HandleListCategories(ctx context.Context, req *lambda.Request) (*lambda.Response, error) {
	categories, err := h.productService.GetProductCategories(ctx)
	if err != nil {
		return &lambda.Response{
			StatusCode: http.StatusInternalServerError,
			Headers:    map[string]string{"Content-Type": "application/json"},
			Body:       []byte(`{"error": "Failed to get categories", "message": "` + err.Error() + `"}`),
		}, nil
	}

	responseBody, err := json.Marshal(categories)
	if err != nil {
		return &lambda.Response{
			StatusCode: http.StatusInternalServerError,
			Headers:    map[string]string{"Content-Type": "application/json"},
			Body:       []byte(`{"error": "Failed to marshal response"}`),
		}, nil
	}

	return &lambda.Response{
		StatusCode: http.StatusOK,
		Headers:    map[string]string{"Content-Type": "application/json"},
		Body:       responseBody,
	}, nil
}
