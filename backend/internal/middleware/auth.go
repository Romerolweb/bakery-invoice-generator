package middleware

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/sirupsen/logrus"
)

// UserRole represents user roles in the system
type UserRole string

const (
	RoleAdmin    UserRole = "admin"
	RoleOperator UserRole = "operator"
	RoleViewer   UserRole = "viewer"
)

// Claims represents JWT claims
type Claims struct {
	UserID   string   `json:"user_id"`
	Username string   `json:"username"`
	Email    string   `json:"email"`
	Roles    []string `json:"roles"`
	jwt.RegisteredClaims
}

// AuthConfig holds authentication configuration
type AuthConfig struct {
	JWTSecret     string
	TokenDuration time.Duration
	Issuer        string
}

// AuthService handles authentication operations
type AuthService struct {
	config *AuthConfig
}

// NewAuthService creates a new authentication service
func NewAuthService(config *AuthConfig) *AuthService {
	if config.TokenDuration == 0 {
		config.TokenDuration = 24 * time.Hour // Default to 24 hours
	}
	if config.Issuer == "" {
		config.Issuer = "bakery-invoice-api"
	}
	return &AuthService{config: config}
}

// GenerateToken generates a JWT token for a user
func (a *AuthService) GenerateToken(userID, username, email string, roles []string) (string, error) {
	claims := &Claims{
		UserID:   userID,
		Username: username,
		Email:    email,
		Roles:    roles,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(a.config.TokenDuration)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			NotBefore: jwt.NewNumericDate(time.Now()),
			Issuer:    a.config.Issuer,
			Subject:   userID,
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString([]byte(a.config.JWTSecret))
	if err != nil {
		return "", fmt.Errorf("failed to sign token: %w", err)
	}

	return tokenString, nil
}

// ValidateToken validates a JWT token and returns the claims
func (a *AuthService) ValidateToken(tokenString string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return []byte(a.config.JWTSecret), nil
	})

	if err != nil {
		return nil, fmt.Errorf("failed to parse token: %w", err)
	}

	if claims, ok := token.Claims.(*Claims); ok && token.Valid {
		return claims, nil
	}

	return nil, fmt.Errorf("invalid token")
}

// RefreshToken generates a new token with extended expiration
func (a *AuthService) RefreshToken(tokenString string) (string, error) {
	claims, err := a.ValidateToken(tokenString)
	if err != nil {
		return "", fmt.Errorf("invalid token for refresh: %w", err)
	}

	// Generate new token with same claims but extended expiration
	return a.GenerateToken(claims.UserID, claims.Username, claims.Email, claims.Roles)
}

// Authentication middleware that validates JWT tokens
func Authentication(authService *AuthService) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.JSON(http.StatusUnauthorized, gin.H{
				"error": "Authorization header is required",
			})
			c.Abort()
			return
		}

		// Extract token from "Bearer <token>" format
		tokenParts := strings.Split(authHeader, " ")
		if len(tokenParts) != 2 || tokenParts[0] != "Bearer" {
			c.JSON(http.StatusUnauthorized, gin.H{
				"error": "Invalid authorization header format. Expected: Bearer <token>",
			})
			c.Abort()
			return
		}

		tokenString := tokenParts[1]
		claims, err := authService.ValidateToken(tokenString)
		if err != nil {
			logrus.WithFields(logrus.Fields{
				"error": err.Error(),
				"path":  c.Request.URL.Path,
			}).Warn("Token validation failed")

			c.JSON(http.StatusUnauthorized, gin.H{
				"error": "Invalid or expired token",
			})
			c.Abort()
			return
		}

		// Store user information in context
		c.Set("user_id", claims.UserID)
		c.Set("username", claims.Username)
		c.Set("email", claims.Email)
		c.Set("roles", claims.Roles)
		c.Set("claims", claims)

		logrus.WithFields(logrus.Fields{
			"user_id":  claims.UserID,
			"username": claims.Username,
			"path":     c.Request.URL.Path,
		}).Debug("User authenticated successfully")

		c.Next()
	}
}

// Authorization middleware that checks user roles
func Authorization(requiredRoles ...string) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Skip authorization if no roles are required
		if len(requiredRoles) == 0 {
			c.Next()
			return
		}

		// Get user roles from context
		rolesInterface, exists := c.Get("roles")
		if !exists {
			c.JSON(http.StatusUnauthorized, gin.H{
				"error": "User roles not found in context",
			})
			c.Abort()
			return
		}

		userRoles, ok := rolesInterface.([]string)
		if !ok {
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "Invalid roles format in context",
			})
			c.Abort()
			return
		}

		// Check if user has any of the required roles
		hasRequiredRole := false
		for _, requiredRole := range requiredRoles {
			for _, userRole := range userRoles {
				if userRole == requiredRole {
					hasRequiredRole = true
					break
				}
			}
			if hasRequiredRole {
				break
			}
		}

		if !hasRequiredRole {
			userID, _ := c.Get("user_id")
			logrus.WithFields(logrus.Fields{
				"user_id":        userID,
				"user_roles":     userRoles,
				"required_roles": requiredRoles,
				"path":           c.Request.URL.Path,
			}).Warn("Authorization failed - insufficient permissions")

			c.JSON(http.StatusForbidden, gin.H{
				"error":          "Insufficient permissions",
				"required_roles": requiredRoles,
			})
			c.Abort()
			return
		}

		logrus.WithFields(logrus.Fields{
			"user_id":        c.GetString("user_id"),
			"required_roles": requiredRoles,
			"path":           c.Request.URL.Path,
		}).Debug("Authorization successful")

		c.Next()
	}
}

// OptionalAuthentication middleware that validates JWT tokens but doesn't require them
func OptionalAuthentication(authService *AuthService) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			// No token provided, continue without authentication
			c.Next()
			return
		}

		// Extract token from "Bearer <token>" format
		tokenParts := strings.Split(authHeader, " ")
		if len(tokenParts) != 2 || tokenParts[0] != "Bearer" {
			// Invalid format, continue without authentication
			c.Next()
			return
		}

		tokenString := tokenParts[1]
		claims, err := authService.ValidateToken(tokenString)
		if err != nil {
			// Invalid token, continue without authentication
			logrus.WithFields(logrus.Fields{
				"error": err.Error(),
				"path":  c.Request.URL.Path,
			}).Debug("Optional token validation failed")
			c.Next()
			return
		}

		// Store user information in context
		c.Set("user_id", claims.UserID)
		c.Set("username", claims.Username)
		c.Set("email", claims.Email)
		c.Set("roles", claims.Roles)
		c.Set("claims", claims)

		c.Next()
	}
}

// GetUserFromContext extracts user information from gin context
func GetUserFromContext(c *gin.Context) (userID, username, email string, roles []string, ok bool) {
	userIDInterface, exists := c.Get("user_id")
	if !exists {
		return "", "", "", nil, false
	}

	userIDStr, ok := userIDInterface.(string)
	if !ok {
		return "", "", "", nil, false
	}

	usernameInterface, _ := c.Get("username")
	emailInterface, _ := c.Get("email")
	rolesInterface, _ := c.Get("roles")

	usernameStr, _ := usernameInterface.(string)
	emailStr, _ := emailInterface.(string)

	if rolesSlice, ok := rolesInterface.([]string); ok {
		roles = rolesSlice
	}

	return userIDStr, usernameStr, emailStr, roles, true
}

// HasRole checks if the current user has a specific role
func HasRole(c *gin.Context, role string) bool {
	_, _, _, roles, ok := GetUserFromContext(c)
	if !ok {
		return false
	}

	for _, userRole := range roles {
		if userRole == role {
			return true
		}
	}
	return false
}

// IsAdmin checks if the current user has admin role
func IsAdmin(c *gin.Context) bool {
	return HasRole(c, string(RoleAdmin))
}

// IsOperator checks if the current user has operator role
func IsOperator(c *gin.Context) bool {
	return HasRole(c, string(RoleOperator))
}

// IsViewer checks if the current user has viewer role
func IsViewer(c *gin.Context) bool {
	return HasRole(c, string(RoleViewer))
}
