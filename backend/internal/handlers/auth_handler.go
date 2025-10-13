package handlers

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"bakery-invoice-api/internal/middleware"
)

// AuthHandler handles authentication-related HTTP requests
type AuthHandler struct {
	authService *middleware.AuthService
}

// NewAuthHandler creates a new authentication handler
func NewAuthHandler(authService *middleware.AuthService) *AuthHandler {
	return &AuthHandler{
		authService: authService,
	}
}

// LoginRequest represents the login request body
type LoginRequest struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
}

// LoginResponse represents the login response
type LoginResponse struct {
	Token     string    `json:"token"`
	ExpiresAt time.Time `json:"expires_at"`
	User      UserInfo  `json:"user"`
}

// UserInfo represents user information
type UserInfo struct {
	ID       string   `json:"id"`
	Username string   `json:"username"`
	Email    string   `json:"email"`
	Roles    []string `json:"roles"`
}

// RefreshTokenRequest represents the refresh token request
type RefreshTokenRequest struct {
	Token string `json:"token" binding:"required"`
}

// @Summary Login
// @Description Authenticate user and return JWT token
// @Tags auth
// @Accept json
// @Produce json
// @Param credentials body LoginRequest true "Login credentials"
// @Success 200 {object} LoginResponse
// @Failure 400 {object} ErrorResponse
// @Failure 401 {object} ErrorResponse
// @Failure 500 {object} ErrorResponse
// @Router /auth/login [post]
func (h *AuthHandler) Login(c *gin.Context) {
	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Error:   "Invalid request body",
			Message: err.Error(),
		})
		return
	}

	// TODO: Implement actual user authentication
	// For now, this is a placeholder that accepts any credentials
	// In a real implementation, you would:
	// 1. Validate credentials against a user database
	// 2. Hash and compare passwords
	// 3. Return appropriate error for invalid credentials

	// Mock user data (replace with actual user lookup)
	userID := "user-123"
	username := req.Username
	email := req.Username + "@bakery.com"
	roles := []string{string(middleware.RoleAdmin)} // Default to admin for demo

	// Generate JWT token
	token, err := h.authService.GenerateToken(userID, username, email, roles)
	if err != nil {
		c.JSON(http.StatusInternalServerError, ErrorResponse{
			Error:   "Failed to generate token",
			Message: err.Error(),
		})
		return
	}

	// Calculate expiration time
	expiresAt := time.Now().Add(24 * time.Hour) // Should match token duration

	response := LoginResponse{
		Token:     token,
		ExpiresAt: expiresAt,
		User: UserInfo{
			ID:       userID,
			Username: username,
			Email:    email,
			Roles:    roles,
		},
	}

	c.JSON(http.StatusOK, response)
}

// @Summary Refresh Token
// @Description Refresh an existing JWT token
// @Tags auth
// @Accept json
// @Produce json
// @Param token body RefreshTokenRequest true "Token to refresh"
// @Success 200 {object} LoginResponse
// @Failure 400 {object} ErrorResponse
// @Failure 401 {object} ErrorResponse
// @Failure 500 {object} ErrorResponse
// @Router /auth/refresh [post]
func (h *AuthHandler) RefreshToken(c *gin.Context) {
	var req RefreshTokenRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Error:   "Invalid request body",
			Message: err.Error(),
		})
		return
	}

	// Refresh the token
	newToken, err := h.authService.RefreshToken(req.Token)
	if err != nil {
		c.JSON(http.StatusUnauthorized, ErrorResponse{
			Error:   "Invalid or expired token",
			Message: err.Error(),
		})
		return
	}

	// Validate the new token to get user info
	claims, err := h.authService.ValidateToken(newToken)
	if err != nil {
		c.JSON(http.StatusInternalServerError, ErrorResponse{
			Error:   "Failed to validate new token",
			Message: err.Error(),
		})
		return
	}

	// Calculate expiration time
	expiresAt := time.Now().Add(24 * time.Hour) // Should match token duration

	response := LoginResponse{
		Token:     newToken,
		ExpiresAt: expiresAt,
		User: UserInfo{
			ID:       claims.UserID,
			Username: claims.Username,
			Email:    claims.Email,
			Roles:    claims.Roles,
		},
	}

	c.JSON(http.StatusOK, response)
}

// @Summary Logout
// @Description Logout user (client-side token removal)
// @Tags auth
// @Accept json
// @Produce json
// @Security BearerAuth
// @Success 200 {object} map[string]string
// @Failure 401 {object} ErrorResponse
// @Router /auth/logout [post]
func (h *AuthHandler) Logout(c *gin.Context) {
	// In a JWT-based system, logout is typically handled client-side
	// by removing the token from storage. However, we can log the logout
	// event for audit purposes.

	userID := c.GetString("user_id")
	username := c.GetString("username")

	// Log logout event (optional)
	// logrus.WithFields(logrus.Fields{
	//     "user_id":  userID,
	//     "username": username,
	// }).Info("User logged out")

	c.JSON(http.StatusOK, gin.H{
		"message":  "Logged out successfully",
		"user_id":  userID,
		"username": username,
	})
}

// @Summary Get Current User
// @Description Get information about the currently authenticated user
// @Tags auth
// @Accept json
// @Produce json
// @Security BearerAuth
// @Success 200 {object} UserInfo
// @Failure 401 {object} ErrorResponse
// @Router /auth/me [get]
func (h *AuthHandler) GetCurrentUser(c *gin.Context) {
	userID := c.GetString("user_id")
	username := c.GetString("username")
	email := c.GetString("email")
	rolesInterface, _ := c.Get("roles")

	roles, ok := rolesInterface.([]string)
	if !ok {
		roles = []string{}
	}

	user := UserInfo{
		ID:       userID,
		Username: username,
		Email:    email,
		Roles:    roles,
	}

	c.JSON(http.StatusOK, user)
}

// @Summary Validate Token
// @Description Validate a JWT token
// @Tags auth
// @Accept json
// @Produce json
// @Param token body RefreshTokenRequest true "Token to validate"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} ErrorResponse
// @Failure 401 {object} ErrorResponse
// @Router /auth/validate [post]
func (h *AuthHandler) ValidateToken(c *gin.Context) {
	var req RefreshTokenRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Error:   "Invalid request body",
			Message: err.Error(),
		})
		return
	}

	claims, err := h.authService.ValidateToken(req.Token)
	if err != nil {
		c.JSON(http.StatusUnauthorized, ErrorResponse{
			Error:   "Invalid or expired token",
			Message: err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"valid": true,
		"user": UserInfo{
			ID:       claims.UserID,
			Username: claims.Username,
			Email:    claims.Email,
			Roles:    claims.Roles,
		},
		"expires_at": claims.ExpiresAt.Time,
	})
}
