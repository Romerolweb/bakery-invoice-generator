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
	// Convert API Gateway event to generic request
	req := &lambda.Request{
		Method:      event.HTTPMethod,
		Path:        event.Path,
		Headers:     event.Headers,
		QueryParams: event.QueryStringParameters,
		Body:        []byte(event.Body),
		PathParams:  event.PathParameters,
	}

	// Initialize customer handler
	customerHandler := handlers.NewCustomerHandler(container.CustomerService)

	// Route the request
	var resp *lambda.Response
	var err error

	switch {
	case req.Method == "POST" && req.Path == "/api/v1/customers":
		resp, err = customerHandler.HandleCreate(ctx, req)
	case req.Method == "GET" && req.Path == "/api/v1/customers":
		resp, err = customerHandler.HandleList(ctx, req)
	case req.Method == "GET" && req.PathParams["id"] != "":
		resp, err = customerHandler.HandleGet(ctx, req)
	case req.Method == "PUT" && req.PathParams["id"] != "":
		resp, err = customerHandler.HandleUpdate(ctx, req)
	case req.Method == "DELETE" && req.PathParams["id"] != "":
		resp, err = customerHandler.HandleDelete(ctx, req)
	case req.Method == "GET" && req.Path == "/api/v1/customers/search":
		resp, err = customerHandler.HandleSearch(ctx, req)
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
