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

// ReceiptHandler handles receipt-related HTTP requests
type ReceiptHandler struct {
	receiptService services.ReceiptService
}

// NewReceiptHandler creates a new receipt handler
func NewReceiptHandler(receiptService services.ReceiptService) *ReceiptHandler {
	return &ReceiptHandler{
		receiptService: receiptService,
	}
}

// @Summary Create a new receipt
// @Description Create a new receipt with GST calculations
// @Tags receipts
// @Accept json
// @Produce json
// @Param receipt body services.CreateReceiptRequest true "Receipt data"
// @Success 201 {object} models.Receipt
// @Failure 400 {object} ErrorResponse
// @Failure 500 {object} ErrorResponse
// @Router /receipts [post]
func (h *ReceiptHandler) CreateReceipt(c *gin.Context) {
	var req services.CreateReceiptRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Error:   "Invalid request body",
			Message: err.Error(),
		})
		return
	}

	receipt, err := h.receiptService.CreateReceipt(c.Request.Context(), &req)
	if err != nil {
		if isValidationError(err) {
			c.JSON(http.StatusBadRequest, ErrorResponse{
				Error:   "Validation failed",
				Message: err.Error(),
			})
			return
		}
		c.JSON(http.StatusInternalServerError, ErrorResponse{
			Error:   "Failed to create receipt",
			Message: err.Error(),
		})
		return
	}

	c.JSON(http.StatusCreated, receipt)
}

// @Summary List receipts
// @Description Get a list of receipts with optional filters
// @Tags receipts
// @Accept json
// @Produce json
// @Param customer_id query string false "Filter by customer ID"
// @Param payment_method query string false "Filter by payment method" Enums(cash, card, bank_transfer, other)
// @Param is_tax_invoice query bool false "Filter by tax invoice status"
// @Param gst_charged query bool false "Filter by GST charged status"
// @Param min_amount query number false "Minimum amount filter"
// @Param max_amount query number false "Maximum amount filter"
// @Param start_date query string false "Start date filter (RFC3339 format)"
// @Param end_date query string false "End date filter (RFC3339 format)"
// @Param limit query int false "Limit number of results" default(100)
// @Param offset query int false "Offset for pagination" default(0)
// @Success 200 {array} models.Receipt
// @Failure 400 {object} ErrorResponse
// @Failure 500 {object} ErrorResponse
// @Router /receipts [get]
func (h *ReceiptHandler) ListReceipts(c *gin.Context) {
	filters := &services.ReceiptFilters{}

	// Parse query parameters
	if customerID := c.Query("customer_id"); customerID != "" {
		if _, err := uuid.Parse(customerID); err == nil {
			filters.CustomerID = &customerID
		}
	}

	if paymentMethod := c.Query("payment_method"); paymentMethod != "" {
		pm := models.PaymentMethod(paymentMethod)
		filters.PaymentMethod = &pm
	}

	if isTaxInvoice := c.Query("is_tax_invoice"); isTaxInvoice != "" {
		if val, err := strconv.ParseBool(isTaxInvoice); err == nil {
			filters.IsTaxInvoice = &val
		}
	}

	if gstCharged := c.Query("gst_charged"); gstCharged != "" {
		if val, err := strconv.ParseBool(gstCharged); err == nil {
			filters.GSTCharged = &val
		}
	}

	if minAmount := c.Query("min_amount"); minAmount != "" {
		if val, err := strconv.ParseFloat(minAmount, 64); err == nil {
			filters.MinAmount = &val
		}
	}

	if maxAmount := c.Query("max_amount"); maxAmount != "" {
		if val, err := strconv.ParseFloat(maxAmount, 64); err == nil {
			filters.MaxAmount = &val
		}
	}

	if startDate := c.Query("start_date"); startDate != "" {
		if t, err := time.Parse(time.RFC3339, startDate); err == nil {
			filters.StartDate = &t
		}
	}

	if endDate := c.Query("end_date"); endDate != "" {
		if t, err := time.Parse(time.RFC3339, endDate); err == nil {
			filters.EndDate = &t
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

	receipts, err := h.receiptService.ListReceipts(c.Request.Context(), filters)
	if err != nil {
		c.JSON(http.StatusInternalServerError, ErrorResponse{
			Error:   "Failed to list receipts",
			Message: err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, receipts)
}

// @Summary Get a receipt
// @Description Get a receipt by ID with line items
// @Tags receipts
// @Accept json
// @Produce json
// @Param id path string true "Receipt ID"
// @Success 200 {object} models.Receipt
// @Failure 400 {object} ErrorResponse
// @Failure 404 {object} ErrorResponse
// @Failure 500 {object} ErrorResponse
// @Router /receipts/{id} [get]
func (h *ReceiptHandler) GetReceipt(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Error:   "Invalid request",
			Message: "Receipt ID is required",
		})
		return
	}

	// Validate UUID format
	if _, err := uuid.Parse(id); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Error:   "Invalid receipt ID",
			Message: "Receipt ID must be a valid UUID",
		})
		return
	}

	receipt, err := h.receiptService.GetReceipt(c.Request.Context(), id)
	if err != nil {
		if isNotFoundError(err) {
			c.JSON(http.StatusNotFound, ErrorResponse{
				Error:   "Receipt not found",
				Message: err.Error(),
			})
			return
		}
		c.JSON(http.StatusInternalServerError, ErrorResponse{
			Error:   "Failed to get receipt",
			Message: err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, receipt)
}

// @Summary Delete a receipt
// @Description Delete a receipt by ID
// @Tags receipts
// @Accept json
// @Produce json
// @Param id path string true "Receipt ID"
// @Success 204 "Receipt deleted successfully"
// @Failure 400 {object} ErrorResponse
// @Failure 404 {object} ErrorResponse
// @Failure 500 {object} ErrorResponse
// @Router /receipts/{id} [delete]
func (h *ReceiptHandler) DeleteReceipt(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Error:   "Invalid request",
			Message: "Receipt ID is required",
		})
		return
	}

	// Validate UUID format
	if _, err := uuid.Parse(id); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Error:   "Invalid receipt ID",
			Message: "Receipt ID must be a valid UUID",
		})
		return
	}

	err := h.receiptService.DeleteReceipt(c.Request.Context(), id)
	if err != nil {
		if isNotFoundError(err) {
			c.JSON(http.StatusNotFound, ErrorResponse{
				Error:   "Receipt not found",
				Message: err.Error(),
			})
			return
		}
		c.JSON(http.StatusInternalServerError, ErrorResponse{
			Error:   "Failed to delete receipt",
			Message: err.Error(),
		})
		return
	}

	c.Status(http.StatusNoContent)
}

// @Summary Calculate receipt totals
// @Description Calculate totals for a receipt without creating it
// @Tags receipts
// @Accept json
// @Produce json
// @Param request body services.CalculateReceiptTotalsRequest true "Receipt calculation data"
// @Success 200 {object} services.ReceiptTotalsResult
// @Failure 400 {object} ErrorResponse
// @Failure 500 {object} ErrorResponse
// @Router /receipts/calculate [post]
func (h *ReceiptHandler) CalculateReceiptTotals(c *gin.Context) {
	var req services.CalculateReceiptTotalsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Error:   "Invalid request body",
			Message: err.Error(),
		})
		return
	}

	result, err := h.receiptService.CalculateReceiptTotals(c.Request.Context(), &req)
	if err != nil {
		if isValidationError(err) {
			c.JSON(http.StatusBadRequest, ErrorResponse{
				Error:   "Validation failed",
				Message: err.Error(),
			})
			return
		}
		c.JSON(http.StatusInternalServerError, ErrorResponse{
			Error:   "Failed to calculate receipt totals",
			Message: err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, result)
}

// @Summary Validate receipt for tax compliance
// @Description Validate a receipt for tax compliance
// @Tags receipts
// @Accept json
// @Produce json
// @Param id path string true "Receipt ID"
// @Success 200 {object} services.TaxComplianceResult
// @Failure 400 {object} ErrorResponse
// @Failure 404 {object} ErrorResponse
// @Failure 500 {object} ErrorResponse
// @Router /receipts/{id}/validate [get]
func (h *ReceiptHandler) ValidateReceiptForTaxCompliance(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Error:   "Invalid request",
			Message: "Receipt ID is required",
		})
		return
	}

	// Validate UUID format
	if _, err := uuid.Parse(id); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Error:   "Invalid receipt ID",
			Message: "Receipt ID must be a valid UUID",
		})
		return
	}

	result, err := h.receiptService.ValidateReceiptForTaxCompliance(c.Request.Context(), id)
	if err != nil {
		if isNotFoundError(err) {
			c.JSON(http.StatusNotFound, ErrorResponse{
				Error:   "Receipt not found",
				Message: err.Error(),
			})
			return
		}
		c.JSON(http.StatusInternalServerError, ErrorResponse{
			Error:   "Failed to validate receipt",
			Message: err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, result)
}

// @Summary Generate receipt PDF
// @Description Generate a PDF for a receipt
// @Tags receipts
// @Accept json
// @Produce application/pdf
// @Param id path string true "Receipt ID"
// @Success 200 {file} application/pdf
// @Failure 400 {object} ErrorResponse
// @Failure 404 {object} ErrorResponse
// @Failure 500 {object} ErrorResponse
// @Router /receipts/{id}/pdf [get]
func (h *ReceiptHandler) GeneratePDF(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Error:   "Invalid request",
			Message: "Receipt ID is required",
		})
		return
	}

	// Validate UUID format
	if _, err := uuid.Parse(id); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Error:   "Invalid receipt ID",
			Message: "Receipt ID must be a valid UUID",
		})
		return
	}

	pdfData, err := h.receiptService.GenerateReceiptPDF(c.Request.Context(), id)
	if err != nil {
		if isNotFoundError(err) {
			c.JSON(http.StatusNotFound, ErrorResponse{
				Error:   "Receipt not found",
				Message: err.Error(),
			})
			return
		}
		c.JSON(http.StatusInternalServerError, ErrorResponse{
			Error:   "Failed to generate PDF",
			Message: err.Error(),
		})
		return
	}

	c.Header("Content-Type", "application/pdf")
	c.Header("Content-Disposition", "attachment; filename=receipt-"+id+".pdf")
	c.Data(http.StatusOK, "application/pdf", pdfData)
}

// @Summary Generate receipt HTML
// @Description Generate HTML for a receipt
// @Tags receipts
// @Accept json
// @Produce text/html
// @Param id path string true "Receipt ID"
// @Success 200 {string} string "HTML content"
// @Failure 400 {object} ErrorResponse
// @Failure 404 {object} ErrorResponse
// @Failure 500 {object} ErrorResponse
// @Router /receipts/{id}/html [get]
func (h *ReceiptHandler) GenerateHTML(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Error:   "Invalid request",
			Message: "Receipt ID is required",
		})
		return
	}

	// Validate UUID format
	if _, err := uuid.Parse(id); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Error:   "Invalid receipt ID",
			Message: "Receipt ID must be a valid UUID",
		})
		return
	}

	htmlContent, err := h.receiptService.GenerateReceiptHTML(c.Request.Context(), id)
	if err != nil {
		if isNotFoundError(err) {
			c.JSON(http.StatusNotFound, ErrorResponse{
				Error:   "Receipt not found",
				Message: err.Error(),
			})
			return
		}
		c.JSON(http.StatusInternalServerError, ErrorResponse{
			Error:   "Failed to generate HTML",
			Message: err.Error(),
		})
		return
	}

	c.Header("Content-Type", "text/html")
	c.String(http.StatusOK, htmlContent)
}

// @Summary Get sales report
// @Description Generate a comprehensive sales report
// @Tags receipts
// @Accept json
// @Produce json
// @Param start_date query string true "Start date (RFC3339 format)"
// @Param end_date query string true "End date (RFC3339 format)"
// @Success 200 {object} repositories.SalesReport
// @Failure 400 {object} ErrorResponse
// @Failure 500 {object} ErrorResponse
// @Router /receipts/reports/sales [get]
func (h *ReceiptHandler) GetSalesReport(c *gin.Context) {
	startDateStr := c.Query("start_date")
	endDateStr := c.Query("end_date")

	if startDateStr == "" || endDateStr == "" {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Error:   "Invalid request",
			Message: "Both start_date and end_date are required",
		})
		return
	}

	startDate, err := time.Parse(time.RFC3339, startDateStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Error:   "Invalid start_date",
			Message: "start_date must be in RFC3339 format",
		})
		return
	}

	endDate, err := time.Parse(time.RFC3339, endDateStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Error:   "Invalid end_date",
			Message: "end_date must be in RFC3339 format",
		})
		return
	}

	report, err := h.receiptService.GetSalesReport(c.Request.Context(), startDate, endDate)
	if err != nil {
		c.JSON(http.StatusInternalServerError, ErrorResponse{
			Error:   "Failed to generate sales report",
			Message: err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, report)
}

// @Summary Get daily sales
// @Description Get sales summary for a specific date
// @Tags receipts
// @Accept json
// @Produce json
// @Param date query string true "Date (RFC3339 format)"
// @Success 200 {object} repositories.SalesSummary
// @Failure 400 {object} ErrorResponse
// @Failure 500 {object} ErrorResponse
// @Router /receipts/reports/daily [get]
func (h *ReceiptHandler) GetDailySales(c *gin.Context) {
	dateStr := c.Query("date")
	if dateStr == "" {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Error:   "Invalid request",
			Message: "Date is required",
		})
		return
	}

	date, err := time.Parse(time.RFC3339, dateStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Error:   "Invalid date",
			Message: "Date must be in RFC3339 format",
		})
		return
	}

	summary, err := h.receiptService.GetDailySales(c.Request.Context(), date)
	if err != nil {
		c.JSON(http.StatusInternalServerError, ErrorResponse{
			Error:   "Failed to get daily sales",
			Message: err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, summary)
}

// @Summary Get monthly sales
// @Description Get sales summary for a specific month
// @Tags receipts
// @Accept json
// @Produce json
// @Param year query int true "Year"
// @Param month query int true "Month (1-12)"
// @Success 200 {object} repositories.SalesSummary
// @Failure 400 {object} ErrorResponse
// @Failure 500 {object} ErrorResponse
// @Router /receipts/reports/monthly [get]
func (h *ReceiptHandler) GetMonthlySales(c *gin.Context) {
	yearStr := c.Query("year")
	monthStr := c.Query("month")

	if yearStr == "" || monthStr == "" {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Error:   "Invalid request",
			Message: "Both year and month are required",
		})
		return
	}

	year, err := strconv.Atoi(yearStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Error:   "Invalid year",
			Message: "Year must be a valid integer",
		})
		return
	}

	monthInt, err := strconv.Atoi(monthStr)
	if err != nil || monthInt < 1 || monthInt > 12 {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Error:   "Invalid month",
			Message: "Month must be an integer between 1 and 12",
		})
		return
	}

	month := time.Month(monthInt)

	summary, err := h.receiptService.GetMonthlySales(c.Request.Context(), year, month)
	if err != nil {
		c.JSON(http.StatusInternalServerError, ErrorResponse{
			Error:   "Failed to get monthly sales",
			Message: err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, summary)
}

// @Summary Get receipts by customer
// @Description Get receipts for a customer within date range
// @Tags receipts
// @Accept json
// @Produce json
// @Param customer_id path string true "Customer ID"
// @Param start_date query string false "Start date (RFC3339 format)"
// @Param end_date query string false "End date (RFC3339 format)"
// @Success 200 {array} models.Receipt
// @Failure 400 {object} ErrorResponse
// @Failure 500 {object} ErrorResponse
// @Router /receipts/customer/{customer_id} [get]
func (h *ReceiptHandler) GetReceiptsByCustomer(c *gin.Context) {
	customerID := c.Param("customer_id")
	if customerID == "" {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Error:   "Invalid request",
			Message: "Customer ID is required",
		})
		return
	}

	// Validate UUID format
	if _, err := uuid.Parse(customerID); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Error:   "Invalid customer ID",
			Message: "Customer ID must be a valid UUID",
		})
		return
	}

	// Parse date range (default to last 30 days)
	endDate := time.Now()
	startDate := endDate.AddDate(0, 0, -30)

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

	receipts, err := h.receiptService.GetReceiptsByCustomer(c.Request.Context(), customerID, startDate, endDate)
	if err != nil {
		c.JSON(http.StatusInternalServerError, ErrorResponse{
			Error:   "Failed to get receipts by customer",
			Message: err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, receipts)
}

// @Summary Get top customers by revenue
// @Description Get customers ordered by total revenue
// @Tags receipts
// @Accept json
// @Produce json
// @Param limit query int false "Limit number of results" default(10)
// @Success 200 {array} repositories.CustomerRevenue
// @Failure 500 {object} ErrorResponse
// @Router /receipts/reports/top-customers [get]
func (h *ReceiptHandler) GetTopCustomersByRevenue(c *gin.Context) {
	limit := 10
	if limitStr := c.Query("limit"); limitStr != "" {
		if val, err := strconv.Atoi(limitStr); err == nil && val > 0 {
			limit = val
		}
	}

	customers, err := h.receiptService.GetTopCustomersByRevenue(c.Request.Context(), limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, ErrorResponse{
			Error:   "Failed to get top customers by revenue",
			Message: err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, customers)
}
