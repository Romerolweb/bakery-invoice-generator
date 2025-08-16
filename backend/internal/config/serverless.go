package config

import (
	"context"
	"os"
	"sync"
)

// ServerlessConfig holds serverless-specific configuration
type ServerlessConfig struct {
	IsLambda     bool
	FunctionName string
	Region       string
	Stage        string
}

// Global serverless configuration
var (
	serverlessConfig *ServerlessConfig
	serverlessOnce   sync.Once
)

// GetServerlessConfig returns the serverless configuration
func GetServerlessConfig() *ServerlessConfig {
	serverlessOnce.Do(func() {
		serverlessConfig = &ServerlessConfig{
			IsLambda:     isRunningInLambda(),
			FunctionName: os.Getenv("AWS_LAMBDA_FUNCTION_NAME"),
			Region:       os.Getenv("AWS_REGION"),
			Stage:        GetEnv("STAGE", "dev"),
		}
	})
	return serverlessConfig
}

// isRunningInLambda detects if the application is running in AWS Lambda
func isRunningInLambda() bool {
	return os.Getenv("AWS_LAMBDA_FUNCTION_NAME") != ""
}

// IsServerlessMode returns true if running in serverless mode
func IsServerlessMode() bool {
	return GetServerlessConfig().IsLambda
}

// GetDeploymentMode returns the current deployment mode
func GetDeploymentMode() string {
	if IsServerlessMode() {
		return "serverless"
	}
	return "server"
}

// AdaptConfigForServerless modifies configuration for serverless deployment
func AdaptConfigForServerless(ctx context.Context, config *Config) *Config {
	if !IsServerlessMode() {
		return config
	}

	// Adapt database configuration for serverless
	if config.Database.ConnectionString == "./data/bakery.db" {
		// In serverless mode, use a different database strategy
		// This could be RDS, or a shared SQLite file in EFS
		if rdsEndpoint := os.Getenv("RDS_ENDPOINT"); rdsEndpoint != "" {
			config.Database.ConnectionString = buildRDSConnectionString()
		} else {
			// Use EFS mounted SQLite for serverless
			config.Database.ConnectionString = "/mnt/efs/bakery.db"
		}
	}

	// Adapt storage configuration for serverless
	if config.Storage.Type == "local" {
		// Force S3 storage in serverless mode
		config.Storage.Type = "s3"
		if config.Storage.S3Bucket == "" {
			config.Storage.S3Bucket = GetEnv("S3_BUCKET", "bakery-invoice-files")
		}
		if config.Storage.S3Region == "" {
			config.Storage.S3Region = GetEnv("AWS_REGION", "us-east-1")
		}
	}

	return config
}

// buildRDSConnectionString constructs RDS connection string from environment variables
func buildRDSConnectionString() string {
	host := os.Getenv("RDS_ENDPOINT")
	port := GetEnv("RDS_PORT", "5432")
	dbname := GetEnv("RDS_DB_NAME", "bakery_invoice")
	user := os.Getenv("RDS_USERNAME")
	password := os.Getenv("RDS_PASSWORD")

	return "host=" + host + " port=" + port + " user=" + user + " password=" + password + " dbname=" + dbname + " sslmode=require"
}

// GetOptimizedConfig returns configuration optimized for the current deployment mode
func GetOptimizedConfig() (*Config, error) {
	config, err := Load()
	if err != nil {
		return nil, err
	}

	// Apply serverless adaptations if needed
	config = AdaptConfigForServerless(context.Background(), config)

	return config, nil
}
