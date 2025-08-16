package main

import (
	"context"

	"bakery-invoice-api/internal/config"
	"bakery-invoice-api/internal/handlers"
	"bakery-invoice-api/pkg/lambda"
	"bakery-invoice-api/pkg/server"

	"github.com/aws/aws-lambda-go/events"
	awslambda "github.com/aws/aws-lambda-go/lambda"
)

var container *server.Container

func init() {
	cfg, err := config.GetOptimizedConfig()
	if err != nil {
		panic("Failed to load configuration: " + err.Error())
	}

	container, err = server.NewContainer(cfg)
	if err != nil {
		panic("Failed to initialize container: " + err.Error())
	}
}

func handler(ctx context.Context, event events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
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
	var err error

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
