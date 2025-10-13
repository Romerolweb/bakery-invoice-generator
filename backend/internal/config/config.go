package config

import (
	"fmt"
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
	Tax         TaxConfig
	Server      ServerConfig
	Logging     LoggingConfig
}

// DatabaseConfig holds database configuration
type DatabaseConfig struct {
	Path         string
	MaxOpenConns int
	MaxIdleConns int
	MaxLifetime  int // in seconds
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
	FromName string
	UseTLS   bool
	UseSSL   bool
}

// JWTConfig holds JWT configuration
type JWTConfig struct {
	Secret          string
	ExpirationHours int
	Issuer          string
}

// TaxConfig holds tax system configuration
type TaxConfig struct {
	CountryCode         string
	GSTRate             float64
	TaxInvoiceThreshold float64
	ChargeGST           bool
}

// ServerConfig holds server configuration
type ServerConfig struct {
	ReadTimeout     int // in seconds
	WriteTimeout    int // in seconds
	IdleTimeout     int // in seconds
	ShutdownTimeout int // in seconds
	MaxHeaderBytes  int
}

// LoggingConfig holds logging configuration
type LoggingConfig struct {
	Level      string
	Format     string // "json" or "text"
	Output     string // "stdout", "stderr", or file path
	MaxSize    int    // max size in MB
	MaxBackups int    // max number of backup files
	MaxAge     int    // max age in days
}

// Load loads configuration from environment variables and config files
func Load() (*Config, error) {
	// Load .env file if it exists
	_ = godotenv.Load()

	// Set up Viper
	viper.AutomaticEnv()

	// Set defaults
	setDefaults()

	config := &Config{
		Environment: viper.GetString("ENVIRONMENT"),
		Port:        viper.GetString("PORT"),
		Database: DatabaseConfig{
			Path:         viper.GetString("DB_PATH"),
			MaxOpenConns: viper.GetInt("DB_MAX_OPEN_CONNS"),
			MaxIdleConns: viper.GetInt("DB_MAX_IDLE_CONNS"),
			MaxLifetime:  viper.GetInt("DB_MAX_LIFETIME"),
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
			FromName: viper.GetString("SMTP_FROM_NAME"),
			UseTLS:   viper.GetBool("SMTP_USE_TLS"),
			UseSSL:   viper.GetBool("SMTP_USE_SSL"),
		},
		JWT: JWTConfig{
			Secret:          viper.GetString("JWT_SECRET"),
			ExpirationHours: viper.GetInt("JWT_EXPIRATION_HOURS"),
			Issuer:          viper.GetString("JWT_ISSUER"),
		},
		Tax: TaxConfig{
			CountryCode:         viper.GetString("TAX_COUNTRY_CODE"),
			GSTRate:             viper.GetFloat64("TAX_GST_RATE"),
			TaxInvoiceThreshold: viper.GetFloat64("TAX_INVOICE_THRESHOLD"),
			ChargeGST:           viper.GetBool("TAX_CHARGE_GST"),
		},
		Server: ServerConfig{
			ReadTimeout:     viper.GetInt("SERVER_READ_TIMEOUT"),
			WriteTimeout:    viper.GetInt("SERVER_WRITE_TIMEOUT"),
			IdleTimeout:     viper.GetInt("SERVER_IDLE_TIMEOUT"),
			ShutdownTimeout: viper.GetInt("SERVER_SHUTDOWN_TIMEOUT"),
			MaxHeaderBytes:  viper.GetInt("SERVER_MAX_HEADER_BYTES"),
		},
		Logging: LoggingConfig{
			Level:      viper.GetString("LOG_LEVEL"),
			Format:     viper.GetString("LOG_FORMAT"),
			Output:     viper.GetString("LOG_OUTPUT"),
			MaxSize:    viper.GetInt("LOG_MAX_SIZE"),
			MaxBackups: viper.GetInt("LOG_MAX_BACKUPS"),
			MaxAge:     viper.GetInt("LOG_MAX_AGE"),
		},
	}

	// Validate configuration
	if err := validateConfig(config); err != nil {
		return nil, err
	}

	return config, nil
}

// setDefaults sets default configuration values
func setDefaults() {
	// Server defaults
	viper.SetDefault("PORT", "8081")
	viper.SetDefault("ENVIRONMENT", "development")

	// Database defaults
	viper.SetDefault("DB_PATH", "./data/bakery.db")
	viper.SetDefault("DB_MAX_OPEN_CONNS", 25)
	viper.SetDefault("DB_MAX_IDLE_CONNS", 25)
	viper.SetDefault("DB_MAX_LIFETIME", 3600) // 1 hour

	// Storage defaults
	viper.SetDefault("STORAGE_TYPE", "local")
	viper.SetDefault("STORAGE_LOCAL_PATH", "./data/files")

	// SMTP defaults
	viper.SetDefault("SMTP_PORT", 587)
	viper.SetDefault("SMTP_FROM_NAME", "Bakery Invoice System")
	viper.SetDefault("SMTP_USE_TLS", true)
	viper.SetDefault("SMTP_USE_SSL", false)

	// JWT defaults
	viper.SetDefault("JWT_EXPIRATION_HOURS", 24)
	viper.SetDefault("JWT_ISSUER", "bakery-invoice-api")

	// Tax defaults (Australian GST)
	viper.SetDefault("TAX_COUNTRY_CODE", "AU")
	viper.SetDefault("TAX_GST_RATE", 0.10)           // 10%
	viper.SetDefault("TAX_INVOICE_THRESHOLD", 82.50) // AUD
	viper.SetDefault("TAX_CHARGE_GST", true)

	// Server timeout defaults
	viper.SetDefault("SERVER_READ_TIMEOUT", 30)          // 30 seconds
	viper.SetDefault("SERVER_WRITE_TIMEOUT", 30)         // 30 seconds
	viper.SetDefault("SERVER_IDLE_TIMEOUT", 120)         // 2 minutes
	viper.SetDefault("SERVER_SHUTDOWN_TIMEOUT", 30)      // 30 seconds
	viper.SetDefault("SERVER_MAX_HEADER_BYTES", 1048576) // 1MB

	// Logging defaults
	viper.SetDefault("LOG_LEVEL", "info")
	viper.SetDefault("LOG_FORMAT", "json")
	viper.SetDefault("LOG_OUTPUT", "stdout")
	viper.SetDefault("LOG_MAX_SIZE", 100)  // 100MB
	viper.SetDefault("LOG_MAX_BACKUPS", 3) // 3 backup files
	viper.SetDefault("LOG_MAX_AGE", 28)    // 28 days
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

// validateConfig validates the loaded configuration
func validateConfig(config *Config) error {
	// Validate required fields
	if config.JWT.Secret == "" {
		return fmt.Errorf("JWT_SECRET is required")
	}

	// Validate database configuration
	if config.Database.Path == "" {
		return fmt.Errorf("DB_PATH is required")
	}

	// Validate tax configuration
	if config.Tax.GSTRate < 0 || config.Tax.GSTRate > 1 {
		return fmt.Errorf("TAX_GST_RATE must be between 0 and 1")
	}

	if config.Tax.TaxInvoiceThreshold < 0 {
		return fmt.Errorf("TAX_INVOICE_THRESHOLD must be non-negative")
	}

	// Validate server timeouts
	if config.Server.ReadTimeout <= 0 {
		return fmt.Errorf("SERVER_READ_TIMEOUT must be positive")
	}

	if config.Server.WriteTimeout <= 0 {
		return fmt.Errorf("SERVER_WRITE_TIMEOUT must be positive")
	}

	// Validate logging configuration
	validLogLevels := []string{"debug", "info", "warn", "error", "fatal", "panic"}
	if !contains(validLogLevels, config.Logging.Level) {
		return fmt.Errorf("LOG_LEVEL must be one of: %v", validLogLevels)
	}

	validLogFormats := []string{"json", "text"}
	if !contains(validLogFormats, config.Logging.Format) {
		return fmt.Errorf("LOG_FORMAT must be one of: %v", validLogFormats)
	}

	return nil
}

// contains checks if a slice contains a string
func contains(slice []string, item string) bool {
	for _, s := range slice {
		if s == item {
			return true
		}
	}
	return false
}

// IsDevelopment returns true if running in development environment
func (c *Config) IsDevelopment() bool {
	return c.Environment == "development" || c.Environment == "dev"
}

// IsProduction returns true if running in production environment
func (c *Config) IsProduction() bool {
	return c.Environment == "production" || c.Environment == "prod"
}

// IsTest returns true if running in test environment
func (c *Config) IsTest() bool {
	return c.Environment == "test" || c.Environment == "testing"
}

// GetDatabaseURL returns the database connection URL
func (c *Config) GetDatabaseURL() string {
	return c.Database.Path
}

// GetServerAddress returns the server address
func (c *Config) GetServerAddress() string {
	return ":" + c.Port
}

// LoadFromFile loads configuration from a specific file
func LoadFromFile(configPath string) (*Config, error) {
	viper.SetConfigFile(configPath)

	if err := viper.ReadInConfig(); err != nil {
		return nil, fmt.Errorf("failed to read config file: %w", err)
	}

	return Load()
}

// LoadForEnvironment loads configuration for a specific environment
func LoadForEnvironment(env string) (*Config, error) {
	// Set environment before loading
	os.Setenv("ENVIRONMENT", env)

	// Try to load environment-specific config file
	configFile := fmt.Sprintf("config.%s.yaml", env)
	if _, err := os.Stat(configFile); err == nil {
		return LoadFromFile(configFile)
	}

	// Fall back to default loading
	return Load()
}

// Validate performs comprehensive configuration validation
func (c *Config) Validate() error {
	return validateConfig(c)
}

// Print prints the configuration (with sensitive data masked)
func (c *Config) Print() {
	fmt.Printf("Configuration:\n")
	fmt.Printf("  Environment: %s\n", c.Environment)
	fmt.Printf("  Port: %s\n", c.Port)
	fmt.Printf("  Database Path: %s\n", c.Database.Path)
	fmt.Printf("  Storage Type: %s\n", c.Storage.Type)
	fmt.Printf("  SMTP Host: %s\n", c.SMTP.Host)
	fmt.Printf("  SMTP Port: %d\n", c.SMTP.Port)
	fmt.Printf("  JWT Issuer: %s\n", c.JWT.Issuer)
	fmt.Printf("  Tax Country: %s\n", c.Tax.CountryCode)
	fmt.Printf("  GST Rate: %.2f%%\n", c.Tax.GSTRate*100)
	fmt.Printf("  Log Level: %s\n", c.Logging.Level)
	fmt.Printf("  Log Format: %s\n", c.Logging.Format)
}
