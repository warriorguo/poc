// Package auth holds password hashing and opaque session tokens.
package auth

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"unicode/utf8"

	"golang.org/x/crypto/bcrypt"
)

const (
	// SessionCookie is HttpOnly, so page scripts can never read it.
	SessionCookie = "tempo_session"
	MinPassword   = 10
	// bcrypt silently truncates beyond 72 bytes; reject instead of pretending.
	MaxPassword = 72
)

var ErrWeakPassword = errors.New("password does not meet requirements")

func HashPassword(password string) (string, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}
	return string(hash), nil
}

// CheckPassword reports whether the password matches. bcrypt's comparison is
// constant-time for a given hash.
func CheckPassword(hash, password string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil
}

// DummyHash is compared against when an email is unknown, so a missing account
// and a wrong password take the same time and are indistinguishable to a caller.
var DummyHash, _ = bcrypt.GenerateFromPassword([]byte("not-a-real-password"), bcrypt.DefaultCost)

func BurnPasswordTime(password string) {
	_ = bcrypt.CompareHashAndPassword(DummyHash, []byte(password))
}

func ValidatePassword(password string) error {
	if utf8.RuneCountInString(password) < MinPassword {
		return fmt.Errorf("%w: use at least %d characters", ErrWeakPassword, MinPassword)
	}
	if len(password) > MaxPassword {
		return fmt.Errorf("%w: use at most %d bytes", ErrWeakPassword, MaxPassword)
	}
	if strings.TrimSpace(password) == "" {
		return fmt.Errorf("%w: password cannot be blank", ErrWeakPassword)
	}
	return nil
}

// NewSessionToken returns 256 bits of randomness, URL-safe.
func NewSessionToken() (string, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(raw), nil
}

// NewUUID returns a random (version 4) UUID for row identifiers.
func NewUUID() (string, error) {
	raw := make([]byte, 16)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	raw[6] = (raw[6] & 0x0f) | 0x40
	raw[8] = (raw[8] & 0x3f) | 0x80
	h := hex.EncodeToString(raw)
	return fmt.Sprintf("%s-%s-%s-%s-%s", h[0:8], h[8:12], h[12:16], h[16:20], h[20:]), nil
}
