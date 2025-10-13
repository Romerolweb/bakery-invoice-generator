package handlers

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"bakery-invoice-api/internal/models"
	"bakery-invoice-api/internal/services"
)

// CustomerHandler handles customer-related HTTP requests
type CustomerHandler struct {
	customerService services.CustomerService
}

// NewCustomerHandler creates a new customer handler
func NewCustomerHandler(customerService services.CustomerService) *CustomerHandler {
	return &CustomerHandler{
		customerService: customerService,
	}
}

// @Summary Create a new customer
// @Description Create a new customer in the system
// @Tags customers
// @Accept json
// @Produce json
// @Param customer body services.CreateCustomerRequest true "Customer data"
// @Success 201 {object} models.Customer
// @Failure 400 {object} ErrorResponse
// @Failure 500 {object} ErrorResponse
// @Router /customers [post]
func (h *CustomerHandler) CreateCustomer(c *gin.Context) {
	var req services.CreateCustomerRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Error:   "Invalid request body",
			Message: err.Error(),
		})
		return
	}

	customer, err := h.customerService.CreateCustomer(c.Request.Context(), &req)
	if err != nil {
		if isValidationError(err) {
			c.JSON(http.StatusBadRequest, ErrorResponse{
				Error:   "Validation failed",
				Message: err.Error(),
			})
			return
		}
		c.JSON(http.StatusInternalServerError, ErrorResponse{
			Error:   "Failed to create customer",
			Message: err.Error(),
		})
		return
	}

	c.JSON(http.StatusCreated, customer)
}

// @Summary List customers
// @Description Get a list of customers with optional filters
// @Tags customers
// @Accept json
// @Produce json
// @Param customer_type query string false "Filter by customer type" Enums(individual, business)
// @Param has_abn query bool false "Filter by ABN presence"
// @Param has_email query bool false "Filter by email presence"
// @Param created_after query string false "Filter by creation date (RFC3339 format)"
// @Param created_before query string false "Filter by creation date (RFC3339 format)"
// @Param limit query int false "Limit number of results" default(100)
// @Param offset query int false "Offset for pagination" default(0)
// @Success 200 {array} models.Customer
// @Failure 400 {object} ErrorResponse
// @Failure 500 {object} ErrorResponse
// @Router /customers [get]
func (h *CustomerHandler) ListCustomers(c *gin.Context) {
	filters := &services.CustomerFilters{}

	// Parse query parameters
	if customerType := c.Query("customer_type"); customerType != "" {
		ct := models.CustomerType(customerType)
		filters.CustomerType = &ct
	}

	if hasABN := c.Query("has_abn"); hasABN != "" {
		if val, err := strconv.ParseBool(hasABN); err == nil {
			filters.HasABN = &val
		}
	}

	if hasEmail := c.Query("has_email"); hasEmail != "" {
		if val, err := strconv.ParseBool(hasEmail); err == nil {
			filters.HasEmail = &val
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

	customers, err := h.customerService.ListCustomers(c.Request.Context(), filters)
	if err != nil {
		c.JSON(http.StatusInternalServerError, ErrorResponse{
			Error:   "Failed to list customers",
			Message: err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, customers)
}

// @Summary Get a customer
// @Description Get a customer by ID
// @Tags customers
// @Accept json
// @Produce json
// @Param id path string true "Customer ID"
// @Success 200 {object} models.Customer
// @Failure 400 {object} ErrorResponse
// @Failure 404 {object} ErrorResponse
// @Failure 500 {object} ErrorResponse
// @Router /customers/{id} [get]
func (h *CustomerHandler) GetCustomer(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Error:   "Invalid request",
			Message: "Customer ID is required",
		})
		return
	}

	// Validate UUID format
	if _, err := uuid.Parse(id); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Error:   "Invalid customer ID",
			Message: "Customer ID must be a valid UUID",
		})
		return
	}

	customer, err := h.customerService.GetCustomer(c.Request.Context(), id)
	if err != nil {
		if isNotFoundError(err) {
			c.JSON(http.StatusNotFound, ErrorResponse{
				Error:   "Customer not found",
				Message: err.Error(),
			})
			return
		}
		c.JSON(http.StatusInternalServerError, ErrorResponse{
			Error:   "Failed to get customer",
			Message: err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, customer)
}

// @Summary Update a customer
// @Description Update an existing customer
// @Tags customers
// @Accept json
// @Produce json
// @Param id path string true "Customer ID"
// @Param customer body services.UpdateCustomerRequest true "Updated customer data"
// @Success 200 {object} models.Customer
// @Failure 400 {object} ErrorResponse
// @Failure 404 {object} ErrorResponse
// @Failure 500 {object} ErrorResponse
// @Router /customers/{id} [put]
func (h *CustomerHandler) UpdateCustomer(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Error:   "Invalid request",
			Message: "Customer ID is required",
		})
		return
	}

	// Validate UUID format
	if _, err := uuid.Parse(id); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Error:   "Invalid customer ID",
			Message: "Customer ID must be a valid UUID",
		})
		return
	}

	var req services.UpdateCustomerRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Error:   "Invalid request body",
			Message: err.Error(),
		})
		return
	}

	customer, err := h.customerService.UpdateCustomer(c.Request.Context(), id, &req)
	if err != nil {
		if isNotFoundError(err) {
			c.JSON(http.StatusNotFound, ErrorResponse{
				Error:   "Customer not found",
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
			Error:   "Failed to update customer",
			Message: err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, customer)
}

// @Summary Delete a customer
// @Description Delete a customer by ID
// @Tags customers
// @Accept json
// @Produce json
// @Param id path string true "Customer ID"
// @Success 204 "Customer deleted successfully"
// @Failure 400 {object} ErrorResponse
// @Failure 404 {object} ErrorResponse
// @Failure 409 {object} ErrorResponse
// @Failure 500 {object} ErrorResponse
// @Router /customers/{id} [delete]
func (h *CustomerHandler) DeleteCustomer(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Error:   "Invalid request",
			Message: "Customer ID is required",
		})
		return
	}

	// Validate UUID format
	if _, err := uuid.Parse(id); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Error:   "Invalid customer ID",
			Message: "Customer ID must be a valid UUID",
		})
		return
	}

	err := h.customerService.DeleteCustomer(c.Request.Context(), id)
	if err != nil {
		if isNotFoundError(err) {
			c.JSON(http.StatusNotFound, ErrorResponse{
				Error:   "Customer not found",
				Message: err.Error(),
			})
			return
		}
		if isConflictError(err) {
			c.JSON(http.StatusConflict, ErrorResponse{
				Error:   "Cannot delete customer",
				Message: err.Error(),
			})
			return
		}
		c.JSON(http.StatusInternalServerError, ErrorResponse{
			Error:   "Failed to delete customer",
			Message: err.Error(),
		})
		return
	}

	c.Status(http.StatusNoContent)
}

// @Summary Search customers
// @Description Search customers by name, email, or phone
// @Tags customers
// @Accept json
// @Produce json
// @Param q query string true "Search query"
// @Param limit query int false "Limit number of results" default(50)
// @Success 200 {array} models.Customer
// @Failure 400 {object} ErrorResponse
// @Failure 500 {object} ErrorResponse
// @Router /customers/search [get]
func (h *CustomerHandler) SearchCustomers(c *gin.Context) {
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

	customers, err := h.customerService.SearchCustomers(c.Request.Context(), query, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, ErrorResponse{
			Error:   "Failed to search customers",
			Message: err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, customers)
}

// @Summary Get frequent customers
// @Description Get customers with the most receipts
// @Tags customers
// @Accept json
// @Produce json
// @Param limit query int false "Limit number of results" default(10)
// @Success 200 {array} models.Customer
// @Failure 500 {object} ErrorResponse
// @Router /customers/frequent [get]
func (h *CustomerHandler) GetFrequentCustomers(c *gin.Context) {
	limit := 10
	if limitStr := c.Query("limit"); limitStr != "" {
		if val, err := strconv.Atoi(limitStr); err == nil && val > 0 {
			limit = val
		}
	}

	customers, err := h.customerService.GetFrequentCustomers(c.Request.Context(), limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, ErrorResponse{
			Error:   "Failed to get frequent customers",
			Message: err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, customers)
}

// @Summary Get recent customers
// @Description Get customers created within the specified duration
// @Tags customers
// @Accept json
// @Produce json
// @Param since query string false "Duration (e.g., '24h', '7d', '30d')" default("30d")
// @Success 200 {array} models.Customer
// @Failure 400 {object} ErrorResponse
// @Failure 500 {object} ErrorResponse
// @Router /customers/recent [get]
func (h *CustomerHandler) GetRecentCustomers(c *gin.Context) {
	since := 30 * 24 * time.Hour // Default to 30 days
	if sinceStr := c.Query("since"); sinceStr != "" {
		if duration, err := time.ParseDuration(sinceStr); err == nil {
			since = duration
		}
	}

	customers, err := h.customerService.GetRecentCustomers(c.Request.Context(), since)
	if err != nil {
		c.JSON(http.StatusInternalServerError, ErrorResponse{
			Error:   "Failed to get recent customers",
			Message: err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, customers)
}

// @Summary Get customer statistics
// @Description Get statistics for a specific customer
// @Tags customers
// @Accept json
// @Produce json
// @Param id path string true "Customer ID"
// @Success 200 {object} services.CustomerStatistics
// @Failure 400 {object} ErrorResponse
// @Failure 404 {object} ErrorResponse
// @Failure 500 {object} ErrorResponse
// @Router /customers/{id}/statistics [get]
func (h *CustomerHandler) GetCustomerStatistics(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Error:   "Invalid request",
			Message: "Customer ID is required",
		})
		return
	}

	// Validate UUID format
	if _, err := uuid.Parse(id); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Error:   "Invalid customer ID",
			Message: "Customer ID must be a valid UUID",
		})
		return
	}

	stats, err := h.customerService.GetCustomerStatistics(c.Request.Context(), id)
	if err != nil {
		if isNotFoundError(err) {
			c.JSON(http.StatusNotFound, ErrorResponse{
				Error:   "Customer not found",
				Message: err.Error(),
			})
			return
		}
		c.JSON(http.StatusInternalServerError, ErrorResponse{
			Error:   "Failed to get customer statistics",
			Message: err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, stats)
}
