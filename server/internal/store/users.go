package store

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

// CreateUser registers an account and seeds its default projects in one
// transaction, so an account can never exist with no projects to log against.
func (s *Store) CreateUser(ctx context.Context, id, email, passwordHash string) (User, error) {
	email = NormalizeEmail(email)

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return User{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var user User
	err = tx.QueryRow(ctx,
		`INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3)
		 RETURNING id, email, password_hash, created_at`,
		id, email, passwordHash,
	).Scan(&user.ID, &user.Email, &user.PasswordHash, &user.CreatedAt)
	if err != nil {
		if isUniqueViolation(err) {
			return User{}, ErrConflict
		}
		return User{}, fmt.Errorf("insert user: %w", err)
	}

	for _, project := range DefaultProjects {
		_, err = tx.Exec(ctx,
			`INSERT INTO projects (user_id, id, name, color, icon, intensity_target_minutes, is_archived, sort_order)
			 VALUES ($1, $2, $3, $4, $5, $6, false, $7)`,
			user.ID, project.ID, project.Name, project.Color, project.Icon,
			project.IntensityTargetMinutes, project.SortOrder)
		if err != nil {
			return User{}, fmt.Errorf("seed project %s: %w", project.ID, err)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return User{}, err
	}
	return user, nil
}

func (s *Store) UserByEmail(ctx context.Context, email string) (User, error) {
	var user User
	err := s.pool.QueryRow(ctx,
		`SELECT id, email, password_hash, created_at FROM users WHERE email = $1`,
		NormalizeEmail(email),
	).Scan(&user.ID, &user.Email, &user.PasswordHash, &user.CreatedAt)
	if noRows(err) {
		return User{}, ErrNotFound
	}
	return user, err
}

func (s *Store) CreateSession(ctx context.Context, token, userID string, expiresAt time.Time) error {
	_, err := s.pool.Exec(ctx,
		`INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, $3)`,
		token, userID, expiresAt)
	return err
}

// UserBySession resolves a cookie to its owner, treating an expired session as
// absent. Expired rows are swept lazily by DeleteExpiredSessions.
func (s *Store) UserBySession(ctx context.Context, token string) (User, error) {
	var user User
	err := s.pool.QueryRow(ctx,
		`SELECT u.id, u.email, u.password_hash, u.created_at
		   FROM sessions s JOIN users u ON u.id = s.user_id
		  WHERE s.token = $1 AND s.expires_at > now()`,
		token,
	).Scan(&user.ID, &user.Email, &user.PasswordHash, &user.CreatedAt)
	if noRows(err) {
		return User{}, ErrNotFound
	}
	return user, err
}

func (s *Store) DeleteSession(ctx context.Context, token string) error {
	_, err := s.pool.Exec(ctx, `DELETE FROM sessions WHERE token = $1`, token)
	return err
}

func (s *Store) DeleteExpiredSessions(ctx context.Context) (int64, error) {
	tag, err := s.pool.Exec(ctx, `DELETE FROM sessions WHERE expires_at <= now()`)
	if err != nil {
		return 0, err
	}
	return tag.RowsAffected(), nil
}

// NormalizeEmail keeps lookup and uniqueness consistent: addresses are matched
// case-insensitively, so Andrew@x and andrew@x are one account.
func NormalizeEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

var _ = pgx.ErrNoRows
