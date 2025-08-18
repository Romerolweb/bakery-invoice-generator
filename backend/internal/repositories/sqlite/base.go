package sqlite

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"

	"bakery-invoice-api/internal/repositories"

	"github.com/sirupsen/logrus"
)

// BaseRepository provides common functionality for all SQLite repositories
type BaseRepository[T any] struct {
	db     *sql.DB
	table  string
	logger *logrus.Logger
}

// NewBaseRepository creates a new base repository
func NewBaseRepository[T any](db *sql.DB, table string, logger *logrus.Logger) *BaseRepository[T] {
	if logger == nil {
		logger = logrus.New()
	}
	return &BaseRepository[T]{
		db:     db,
		table:  table,
		logger: logger,
	}
}

// Create creates a new entity
func (r *BaseRepository[T]) Create(ctx context.Context, entity *T) error {
	// This will be implemented by concrete repositories
	return repositories.ErrUnsupported
}

// GetByID retrieves an entity by its ID
func (r *BaseRepository[T]) GetByID(ctx context.Context, id string) (*T, error) {
	// This will be implemented by concrete repositories
	return nil, repositories.ErrUnsupported
}

// Update updates an existing entity
func (r *BaseRepository[T]) Update(ctx context.Context, entity *T) error {
	// This will be implemented by concrete repositories
	return repositories.ErrUnsupported
}

// Delete deletes an entity by its ID
func (r *BaseRepository[T]) Delete(ctx context.Context, id string) error {
	// This will be implemented by concrete repositories
	return repositories.ErrUnsupported
}

// List retrieves entities with optional filters
func (r *BaseRepository[T]) List(ctx context.Context, filters map[string]interface{}) ([]*T, error) {
	// This will be implemented by concrete repositories
	return nil, repositories.ErrUnsupported
}

// Count returns the total number of entities matching the filters
func (r *BaseRepository[T]) Count(ctx context.Context, filters map[string]interface{}) (int64, error) {
	// This will be implemented by concrete repositories
	return 0, repositories.ErrUnsupported
}

// Exists checks if an entity with the given ID exists
func (r *BaseRepository[T]) Exists(ctx context.Context, id string) (bool, error) {
	query := fmt.Sprintf("SELECT 1 FROM %s WHERE id = ? LIMIT 1", r.table)

	var exists int
	err := r.db.QueryRowContext(ctx, query, id).Scan(&exists)
	if err != nil {
		if err == sql.ErrNoRows {
			return false, nil
		}
		return false, repositories.NewRepositoryError("exists", r.table, id, err)
	}

	return exists == 1, nil
}

// buildWhereClause builds a WHERE clause from filters
func (r *BaseRepository[T]) buildWhereClause(filters map[string]interface{}) (string, []interface{}) {
	if len(filters) == 0 {
		return "", nil
	}

	var conditions []string
	var args []interface{}

	for field, value := range filters {
		conditions = append(conditions, fmt.Sprintf("%s = ?", field))
		args = append(args, value)
	}

	return "WHERE " + strings.Join(conditions, " AND "), args
}

// logQuery logs a query with its execution time
func (r *BaseRepository[T]) logQuery(operation string, query string, args []interface{}, duration time.Duration, err error) {
	fields := logrus.Fields{
		"operation": operation,
		"table":     r.table,
		"query":     query,
		"args":      args,
		"duration":  duration,
	}

	if err != nil {
		fields["error"] = err.Error()
		r.logger.WithFields(fields).Error("Query failed")
	} else {
		r.logger.WithFields(fields).Debug("Query executed")
	}
}

// executeQuery executes a query and logs the result
func (r *BaseRepository[T]) executeQuery(ctx context.Context, operation, query string, args ...interface{}) (*sql.Rows, error) {
	start := time.Now()
	rows, err := r.db.QueryContext(ctx, query, args...)
	duration := time.Since(start)

	r.logQuery(operation, query, args, duration, err)

	if err != nil {
		return nil, repositories.NewRepositoryError(operation, r.table, "", err)
	}

	return rows, nil
}

// executeQueryRow executes a single-row query and logs the result
func (r *BaseRepository[T]) executeQueryRow(ctx context.Context, operation, query string, args ...interface{}) *sql.Row {
	start := time.Now()
	row := r.db.QueryRowContext(ctx, query, args...)
	duration := time.Since(start)

	r.logQuery(operation, query, args, duration, nil)

	return row
}

// executeExec executes a non-query statement and logs the result
func (r *BaseRepository[T]) executeExec(ctx context.Context, operation, query string, args ...interface{}) (sql.Result, error) {
	start := time.Now()
	result, err := r.db.ExecContext(ctx, query, args...)
	duration := time.Since(start)

	r.logQuery(operation, query, args, duration, err)

	if err != nil {
		return nil, repositories.NewRepositoryError(operation, r.table, "", err)
	}

	return result, nil
}

// checkRowsAffected checks if the expected number of rows were affected
func (r *BaseRepository[T]) checkRowsAffected(result sql.Result, operation, id string) error {
	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return repositories.NewRepositoryError(operation, r.table, id, err)
	}

	if rowsAffected == 0 {
		return repositories.NotFoundError(r.table, id)
	}

	return nil
}

// validateID validates that an ID is not empty
func (r *BaseRepository[T]) validateID(id string) error {
	if strings.TrimSpace(id) == "" {
		return repositories.NewRepositoryError("validate", r.table, id, repositories.ErrInvalidID)
	}
	return nil
}
