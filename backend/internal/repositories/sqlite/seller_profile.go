package sqlite

import (
	"context"
	"database/sql"

	"bakery-invoice-api/internal/models"
	"bakery-invoice-api/internal/repositories"

	"github.com/sirupsen/logrus"
)

// SellerProfileRepository implements the SellerProfileRepository interface for SQLite
type SellerProfileRepository struct {
	db     *sql.DB
	logger *logrus.Logger
}

// NewSellerProfileRepository creates a new SQLite seller profile repository
func NewSellerProfileRepository(db *sql.DB, logger *logrus.Logger) repositories.SellerProfileRepository {
	if logger == nil {
		logger = logrus.New()
	}
	return &SellerProfileRepository{
		db:     db,
		logger: logger,
	}
}

// Get retrieves the seller profile (singleton)
func (r *SellerProfileRepository) Get(ctx context.Context) (*models.SellerProfile, error) {
	query := `
		SELECT id, name, business_address, abn_or_acn, contact_email, phone,
			   logo_url, gst_registered, charge_gst, updated_at
		FROM seller_profile 
		WHERE id = 1`

	row := r.db.QueryRowContext(ctx, query)

	profile := &models.SellerProfile{}
	err := row.Scan(
		&profile.ID,
		&profile.Name,
		&profile.BusinessAddress,
		&profile.ABNOrACN,
		&profile.ContactEmail,
		&profile.Phone,
		&profile.LogoURL,
		&profile.GSTRegistered,
		&profile.ChargeGST,
		&profile.UpdatedAt,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			return nil, repositories.NotFoundError("seller_profile", "1")
		}
		return nil, repositories.NewRepositoryError("get", "seller_profile", "1", err)
	}

	return profile, nil
}

// CreateOrUpdate creates or updates the seller profile
func (r *SellerProfileRepository) CreateOrUpdate(ctx context.Context, profile *models.SellerProfile) error {
	if err := profile.Validate(); err != nil {
		return repositories.ValidationError("seller_profile", "1", err)
	}

	// Always set ID to 1 (singleton)
	profile.ID = 1
	profile.UpdateTimestamp()

	// Try to update first
	updateQuery := `
		UPDATE seller_profile 
		SET name = ?, business_address = ?, abn_or_acn = ?, contact_email = ?,
			phone = ?, logo_url = ?, gst_registered = ?, charge_gst = ?, updated_at = ?
		WHERE id = 1`

	result, err := r.db.ExecContext(ctx, updateQuery,
		profile.Name,
		profile.BusinessAddress,
		profile.ABNOrACN,
		profile.ContactEmail,
		profile.Phone,
		profile.LogoURL,
		profile.GSTRegistered,
		profile.ChargeGST,
		profile.UpdatedAt,
	)

	if err != nil {
		return repositories.NewRepositoryError("update", "seller_profile", "1", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return repositories.NewRepositoryError("update", "seller_profile", "1", err)
	}

	// If no rows were affected, the record doesn't exist, so create it
	if rowsAffected == 0 {
		insertQuery := `
			INSERT INTO seller_profile (
				id, name, business_address, abn_or_acn, contact_email,
				phone, logo_url, gst_registered, charge_gst, updated_at
			) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)`

		_, err = r.db.ExecContext(ctx, insertQuery,
			profile.Name,
			profile.BusinessAddress,
			profile.ABNOrACN,
			profile.ContactEmail,
			profile.Phone,
			profile.LogoURL,
			profile.GSTRegistered,
			profile.ChargeGST,
			profile.UpdatedAt,
		)

		if err != nil {
			return repositories.NewRepositoryError("create", "seller_profile", "1", err)
		}
	}

	return nil
}

// Update updates the seller profile
func (r *SellerProfileRepository) Update(ctx context.Context, profile *models.SellerProfile) error {
	if err := profile.Validate(); err != nil {
		return repositories.ValidationError("seller_profile", "1", err)
	}

	// Always set ID to 1 (singleton)
	profile.ID = 1
	profile.UpdateTimestamp()

	query := `
		UPDATE seller_profile 
		SET name = ?, business_address = ?, abn_or_acn = ?, contact_email = ?,
			phone = ?, logo_url = ?, gst_registered = ?, charge_gst = ?, updated_at = ?
		WHERE id = 1`

	result, err := r.db.ExecContext(ctx, query,
		profile.Name,
		profile.BusinessAddress,
		profile.ABNOrACN,
		profile.ContactEmail,
		profile.Phone,
		profile.LogoURL,
		profile.GSTRegistered,
		profile.ChargeGST,
		profile.UpdatedAt,
	)

	if err != nil {
		return repositories.NewRepositoryError("update", "seller_profile", "1", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return repositories.NewRepositoryError("update", "seller_profile", "1", err)
	}

	if rowsAffected == 0 {
		return repositories.NotFoundError("seller_profile", "1")
	}

	return nil
}

// Exists checks if a seller profile exists
func (r *SellerProfileRepository) Exists(ctx context.Context) (bool, error) {
	query := "SELECT 1 FROM seller_profile WHERE id = 1 LIMIT 1"

	var exists int
	err := r.db.QueryRowContext(ctx, query).Scan(&exists)
	if err != nil {
		if err == sql.ErrNoRows {
			return false, nil
		}
		return false, repositories.NewRepositoryError("exists", "seller_profile", "1", err)
	}

	return exists == 1, nil
}
