package store

import (
	"context"
	"time"
)

type APIToken struct {
	ID         string     `json:"id"`
	Name       string     `json:"name"`
	Prefix     string     `json:"prefix"`
	CreatedAt  time.Time  `json:"createdAt"`
	LastUsedAt *time.Time `json:"lastUsedAt,omitempty"`
	ExpiresAt  *time.Time `json:"expiresAt,omitempty"`
}

func (s *Store) CreateAPIToken(ctx context.Context, id, userID, name, tokenHash, prefix string, expiresAt *time.Time) (APIToken, error) {
	var token APIToken
	err := s.pool.QueryRow(ctx,
		`INSERT INTO api_tokens (id, user_id, name, token_hash, prefix, expires_at)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 RETURNING id, name, prefix, created_at, last_used_at, expires_at`,
		id, userID, name, tokenHash, prefix, expiresAt,
	).Scan(&token.ID, &token.Name, &token.Prefix, &token.CreatedAt, &token.LastUsedAt, &token.ExpiresAt)
	if isUniqueViolation(err) {
		return APIToken{}, ErrConflict
	}
	return token, err
}

func (s *Store) ListAPITokens(ctx context.Context, userID string) ([]APIToken, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, name, prefix, created_at, last_used_at, expires_at
		   FROM api_tokens WHERE user_id = $1 ORDER BY created_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	tokens := []APIToken{}
	for rows.Next() {
		var token APIToken
		if err := rows.Scan(&token.ID, &token.Name, &token.Prefix, &token.CreatedAt, &token.LastUsedAt, &token.ExpiresAt); err != nil {
			return nil, err
		}
		tokens = append(tokens, token)
	}
	return tokens, rows.Err()
}

// UserByAPIToken resolves a bearer token, treating an expired one as absent.
// last_used_at is updated in the same statement so a lookup stays one round trip.
func (s *Store) UserByAPIToken(ctx context.Context, tokenHash string) (User, error) {
	var user User
	err := s.pool.QueryRow(ctx, `
		UPDATE api_tokens
		   SET last_used_at = now()
		 WHERE token_hash = $1
		   AND (expires_at IS NULL OR expires_at > now())
		RETURNING (SELECT id FROM users WHERE users.id = api_tokens.user_id),
		          (SELECT email FROM users WHERE users.id = api_tokens.user_id),
		          (SELECT created_at FROM users WHERE users.id = api_tokens.user_id)`,
		tokenHash,
	).Scan(&user.ID, &user.Email, &user.CreatedAt)
	if noRows(err) {
		return User{}, ErrNotFound
	}
	return user, err
}

// DeleteAPIToken is scoped by user, so one account cannot revoke another's token.
func (s *Store) DeleteAPIToken(ctx context.Context, userID, id string) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM api_tokens WHERE user_id = $1 AND id = $2`, userID, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}
