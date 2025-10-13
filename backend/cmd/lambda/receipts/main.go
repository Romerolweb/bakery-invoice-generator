package main

import (
	"context"
	"log"

	"bakery-invoice-api/internal/config"
	"bakery-invoice-api/internal/handlers"
	"bakery-invoice-api/pkg/lambda"

	"github.com/aws/aws-lambda-go/events"
	awslambda "github.com/aws/aws-lambda-go/lambda"
)

var connectionManager *lambda.ConnectionManager

func init() {
	// Initialize connection manager for cold start optimization
	connectionManager = lambda.GetConnectionManager()

	// Pre-load configuration for faster cold starts
	cfg, err := config.GetOptimizedConfig()
	if err != nil {
		log.Printf("Warning: Failed to pre-load configuration: %v", err)
		return
	}

	// Initialize connection manager
	if err := connectionManager.Initialize(cfg); err != nil {
		log.Printf("Warning: Failed to initialize connection manager: %v", err)
	}
}

func handler(ctx context.Context, event events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	// Get container with connection reuse
	container, err := connectionManager.GetContainer(ctx)
	if err != nil {
		log.Printf("Failed to get container: %v", err)
		return events.APIGatewayProxyResponse{
			StatusCode: 500,
			Headers:    map[string]string{"Content-Type": "application/json"},
			Body:       `{"error": "Service unavailable"}`,
		}, nil
	}

	// Update last used timestamp for connection management
	connectionManager.UpdateLastUsed()

	req := &lambda.Request{
		Method:      event.HTTPMethod,
		Path:        event.Path,
		Headers:     event.Headers,
		QueryParams: event.QueryStringParameters,
		Body:        []byte(event.Body),
		PathParams:  event.PathParameters,
	}

	receiptHandler := handlers.NewReceiptHandler(container.ReceiptService)

	var resp *lambda.Response

	switch {
	case req.Method == "POST" && req.Path == "/api/v1/receipts":
		resp, err = receiptHandler.HandleCreate(ctx, req)
	case req.Method == "GET" && req.Path == "/api/v1/receipts":
		resp, err = receiptHandler.HandleList(ctx, req)
	case req.Method == "GET" && req.PathParams["id"] != "":
		resp, err = receiptHandler.HandleGet(ctx, req)
	case req.Method == "GET" && req.Path == "/api/v1/receipts/reports/sales":
		resp, err = receiptHandler.HandleSalesReport(ctx, req)
	default:
		resp = &lambda.Response{
			StatusCode: 404,
			Headers:    map[string]string{"Content-Type": "application/json"},
			Body:       []byte(`{"error": "Not found"}`),
		}
	}

	if err != nil {
		log.Printf("Handler error: %v", err)
		return events.APIGatewayProxyResponse{
			StatusCode: 500,
			Headers:    map[string]string{"Content-Type": "application/json"},
			Body:       `{"error": "Internal server error"}`,
		}, nil
	}

	return events.APIGatewayProxyResponse{
		StatusCode: resp.StatusCode,
		Headers:    resp.Headers,
		Body:       string(resp.Body),
	}, nil
}

func main() {
	awslambda.Start(handler)
}
