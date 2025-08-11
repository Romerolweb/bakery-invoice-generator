package config

import (
	"os"
	"strconv"

	"github.com/joho/godotenv"
	"github.com/spf13/viper"
)

// Config holds all configuration for the application
type Config struct {
	Environment string
	Port        string
	Database    DatabaseConfig
	Storage     StorageConfig
	SMTP        SMTPConfig
	JWT         JWTConfig
}

// DatabaseConfig holds database configuration
type DatabaseConfig struct {
	ConnectionString string
	MaxOpenConns     int
	MaxIdleConns     int
}

// StorageConfig holds file storage configuration
type StorageConfig struct {
	Type      string // "local" or "s3"
	LocalPath string
	S3Bucket  string
	S3Region  string
}

// SMTPConfig holds email configuration
type SMTPConfig struct {
	Host     string
	Port     int
	Username string
	Password string
	From     string
}

// JWTConfig holds JWT configuration
type JWTConfig struct {
	Secret      string
	ExpiryHours int
}

// Load loads configuration from environment variables and config files
func Load() (*Config, error) {
	// Load .env file if it exists
	_ = godotenv.Load()

	// Set up Viper
	viper.AutomaticEnv()
	viper.SetDefault("PORT", "8081")
	viper.SetDefault("ENVIRONMENT", "development")
	viper.SetDefault("DB_CONNECTION_STRING", "./data/bakery.db")
	viper.SetDefault("DB_MAX_OPEN_CONNS", 25)
	viper.SetDefault("DB_MAX_IDLE_CONNS", 25)
	viper.SetDefault("STORAGE_TYPE", "local")
	viper.SetDefault("STORAGE_LOCAL_PATH", "./data/files")
	viper.SetDefault("SMTP_PORT", 587)
	viper.SetDefault("JWT_EXPIRY_HOURS", 24)

	config := &Config{
		Environment: viper.GetString("ENVIRONMENT"),
		Port:        viper.GetString("PORT"),
		Database: DatabaseConfig{
			ConnectionString: viper.GetString("DB_CONNECTION_STRING"),
			MaxOpenConns:     viper.GetInt("DB_MAX_OPEN_CONNS"),
			MaxIdleConns:     viper.GetInt("DB_MAX_IDLE_CONNS"),
		},
		Storage: StorageConfig{
			Type:      viper.GetString("STORAGE_TYPE"),
			LocalPath: viper.GetString("STORAGE_LOCAL_PATH"),
			S3Bucket:  viper.GetString("S3_BUCKET"),
			S3Region:  viper.GetString("S3_REGION"),
		},
		SMTP: SMTPConfig{
			Host:     viper.GetString("SMTP_HOST"),
			Port:     viper.GetInt("SMTP_PORT"),
			Username: viper.GetString("SMTP_USERNAME"),
			Password: viper.GetString("SMTP_PASSWORD"),
			From:     viper.GetString("SMTP_FROM"),
		},
		JWT: JWTConfig{
			Secret:      viper.GetString("JWT_SECRET"),
			ExpiryHours: viper.GetInt("JWT_EXPIRY_HOURS"),
		},
	}

	return config, nil
}

// GetEnv gets an environment variable with a fallback value
func GetEnv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

// GetEnvAsInt gets an environment variable as integer with a fallback value
func GetEnvAsInt(key string, fallback int) int {
	if value := os.Getenv(key); value != "" {
		if intVal, err := strconv.Atoi(value); err == nil {
			return intVal
		}
	}
	return fallback
}

// GetEnvAsBool gets an environment variable as boolean with a fallback value
func GetEnvAsBool(key string, fallback bool) bool {
	if value := os.Getenv(key); value != "" {
		if boolVal, err := strconv.ParseBool(value); err == nil {
			return boolVal
		}
	}
	return fallback
}
