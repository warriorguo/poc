package api_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/warriorguo/poc/server/internal/api"
	"github.com/warriorguo/poc/server/internal/store"
)

// Tests run against a real PostgreSQL database: the queries, the CHECK
// constraints and the composite foreign keys are the thing under test, and a
// fake would not exercise any of them.
//
// Set TEMPO_TEST_DATABASE_URL to run. Without it the suite skips rather than
// failing, so `go test ./...` stays usable on a machine with no database.
func newTestServer(t *testing.T) (http.Handler, *store.Store) {
	t.Helper()

	dsn := os.Getenv("TEMPO_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEMPO_TEST_DATABASE_URL is not set")
	}

	ctx := context.Background()
	st, err := store.Open(ctx, dsn)
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	if err := st.Migrate(ctx); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	t.Cleanup(st.Close)

	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	return api.New(st, logger, false).Routes(), st
}

type client struct {
	t       *testing.T
	handler http.Handler
	cookie  *http.Cookie
	// bearer, when set, is sent instead of the cookie: an agent's credential.
	bearer string
}

func (c *client) do(method, path string, body any) *httptest.ResponseRecorder {
	c.t.Helper()

	var reader io.Reader
	if body != nil {
		encoded, err := json.Marshal(body)
		if err != nil {
			c.t.Fatalf("encode body: %v", err)
		}
		reader = bytes.NewReader(encoded)
	}

	request := httptest.NewRequest(method, path, reader)
	if body != nil {
		request.Header.Set("Content-Type", "application/json")
	}
	if c.bearer != "" {
		request.Header.Set("Authorization", "Bearer "+c.bearer)
	} else if c.cookie != nil {
		request.AddCookie(c.cookie)
	}

	recorder := httptest.NewRecorder()
	c.handler.ServeHTTP(recorder, request)

	for _, cookie := range recorder.Result().Cookies() {
		if cookie.Name == "tempo_session" {
			if cookie.MaxAge < 0 {
				c.cookie = nil
			} else {
				c.cookie = cookie
			}
		}
	}
	return recorder
}

// uniqueEmail keeps runs independent without truncating shared tables.
func uniqueEmail(prefix string) string {
	return fmt.Sprintf("%s-%d@example.test", prefix, time.Now().UnixNano())
}

func (c *client) register(email string) {
	c.t.Helper()
	response := c.do(http.MethodPost, "/api/auth/register", map[string]string{
		"email": email, "password": "a long enough password",
	})
	if response.Code != http.StatusCreated {
		c.t.Fatalf("register: got %d, body %s", response.Code, response.Body.String())
	}
}

func decode[T any](t *testing.T, response *httptest.ResponseRecorder) T {
	t.Helper()
	var target T
	if err := json.Unmarshal(response.Body.Bytes(), &target); err != nil {
		t.Fatalf("decode %s: %v", response.Body.String(), err)
	}
	return target
}

func errorCode(t *testing.T, response *httptest.ResponseRecorder) string {
	t.Helper()
	var body struct {
		Error struct {
			Code string `json:"code"`
		} `json:"error"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode error %s: %v", response.Body.String(), err)
	}
	return body.Error.Code
}

func TestRegisterSeedsDefaultProjects(t *testing.T) {
	handler, _ := newTestServer(t)
	c := &client{t: t, handler: handler}
	c.register(uniqueEmail("seed"))

	projects := decode[[]store.Project](t, c.do(http.MethodGet, "/api/projects", nil))
	if len(projects) != len(store.DefaultProjects) {
		t.Fatalf("got %d projects, want %d", len(projects), len(store.DefaultProjects))
	}
	for i, want := range store.DefaultProjects {
		if projects[i].ID != want.ID {
			t.Errorf("project %d: got %q, want %q", i, projects[i].ID, want.ID)
		}
		if projects[i].SortOrder != want.SortOrder {
			t.Errorf("project %s: sort order %d, want %d", want.ID, projects[i].SortOrder, want.SortOrder)
		}
	}
}

func TestRegisterRejectsDuplicateEmail(t *testing.T) {
	handler, _ := newTestServer(t)
	email := uniqueEmail("dupe")

	first := &client{t: t, handler: handler}
	first.register(email)

	second := &client{t: t, handler: handler}
	response := second.do(http.MethodPost, "/api/auth/register", map[string]string{
		"email": email, "password": "a long enough password",
	})
	if response.Code != http.StatusConflict {
		t.Fatalf("got %d, want 409", response.Code)
	}
}

func TestRegisterRejectsWeakPassword(t *testing.T) {
	handler, _ := newTestServer(t)
	c := &client{t: t, handler: handler}
	response := c.do(http.MethodPost, "/api/auth/register", map[string]string{
		"email": uniqueEmail("weak"), "password": "short",
	})
	if response.Code != http.StatusBadRequest {
		t.Fatalf("got %d, want 400", response.Code)
	}
}

func TestLoginRejectsWrongPasswordAndUnknownAccountIdentically(t *testing.T) {
	handler, _ := newTestServer(t)
	email := uniqueEmail("login")
	registered := &client{t: t, handler: handler}
	registered.register(email)

	wrongPassword := (&client{t: t, handler: handler}).do(http.MethodPost, "/api/auth/login",
		map[string]string{"email": email, "password": "the wrong password"})
	unknownAccount := (&client{t: t, handler: handler}).do(http.MethodPost, "/api/auth/login",
		map[string]string{"email": uniqueEmail("ghost"), "password": "the wrong password"})

	if wrongPassword.Code != http.StatusUnauthorized || unknownAccount.Code != http.StatusUnauthorized {
		t.Fatalf("got %d and %d, want 401 for both", wrongPassword.Code, unknownAccount.Code)
	}
	// Identical bodies: the response must not reveal whether the account exists.
	if wrongPassword.Body.String() != unknownAccount.Body.String() {
		t.Errorf("responses differ:\n wrong password: %s\n unknown account: %s",
			wrongPassword.Body.String(), unknownAccount.Body.String())
	}
}

func TestLoginIsCaseInsensitiveOnEmail(t *testing.T) {
	handler, _ := newTestServer(t)
	email := uniqueEmail("Case")
	c := &client{t: t, handler: handler}
	c.register(email)

	response := (&client{t: t, handler: handler}).do(http.MethodPost, "/api/auth/login",
		map[string]string{"email": "  " + email + "  ", "password": "a long enough password"})
	if response.Code != http.StatusOK {
		t.Fatalf("got %d, want 200: %s", response.Code, response.Body.String())
	}
}

func TestDataEndpointsRequireASession(t *testing.T) {
	handler, _ := newTestServer(t)
	anonymous := &client{t: t, handler: handler}

	cases := []struct {
		method, path string
		body         any
	}{
		{http.MethodGet, "/api/projects", nil},
		{http.MethodGet, "/api/months/2026-09", nil},
		{http.MethodPost, "/api/activities", map[string]any{"projectId": "ozx", "date": "2026-09-13", "durationMinutes": 30}},
		{http.MethodPost, "/api/plans", map[string]any{"projectId": "ozx", "date": "2026-09-13", "plannedMinutes": 30}},
	}
	for _, tc := range cases {
		response := anonymous.do(tc.method, tc.path, tc.body)
		if response.Code != http.StatusUnauthorized {
			t.Errorf("%s %s: got %d, want 401", tc.method, tc.path, response.Code)
		}
		if code := errorCode(t, response); code != "UNAUTHENTICATED" {
			t.Errorf("%s %s: got code %q", tc.method, tc.path, code)
		}
	}
}

// The scoping test that matters most now the database is shared.
func TestOneUserCannotSeeAnother(t *testing.T) {
	handler, _ := newTestServer(t)

	alice := &client{t: t, handler: handler}
	alice.register(uniqueEmail("alice"))
	if response := alice.do(http.MethodPost, "/api/activities", map[string]any{
		"projectId": "ozx", "date": "2026-09-13", "durationMinutes": 90,
	}); response.Code != http.StatusCreated {
		t.Fatalf("alice create: %d %s", response.Code, response.Body.String())
	}

	bob := &client{t: t, handler: handler}
	bob.register(uniqueEmail("bob"))

	overview := decode[store.MonthOverview](t, bob.do(http.MethodGet, "/api/months/2026-09", nil))
	if overview.Totals.ActualMinutes != 0 {
		t.Fatalf("bob sees %d minutes of alice's work", overview.Totals.ActualMinutes)
	}
	if len(overview.Days) != 0 {
		t.Fatalf("bob sees %d of alice's days", len(overview.Days))
	}
}

func TestMonthAggregationGroupsByDateAndProject(t *testing.T) {
	handler, _ := newTestServer(t)
	c := &client{t: t, handler: handler}
	c.register(uniqueEmail("agg"))

	c.do(http.MethodPost, "/api/plans", map[string]any{"projectId": "ozx", "date": "2026-09-13", "plannedMinutes": 60})
	c.do(http.MethodPost, "/api/activities", map[string]any{"projectId": "ozx", "date": "2026-09-13", "durationMinutes": 25})
	c.do(http.MethodPost, "/api/activities", map[string]any{"projectId": "ozx", "date": "2026-09-13", "durationMinutes": 15})
	c.do(http.MethodPost, "/api/activities", map[string]any{"projectId": "reading", "date": "2026-09-14", "durationMinutes": 30})
	// A different month must not leak into the range.
	c.do(http.MethodPost, "/api/activities", map[string]any{"projectId": "ozx", "date": "2026-10-01", "durationMinutes": 45})

	overview := decode[store.MonthOverview](t, c.do(http.MethodGet, "/api/months/2026-09", nil))

	day := overview.Days["2026-09-13"]
	if len(day.Projects) != 1 {
		t.Fatalf("got %d project summaries, want 1: %+v", len(day.Projects), day)
	}
	got := day.Projects[0]
	want := store.ProjectDaySummary{ProjectID: "ozx", PlannedMinutes: 60, ActualMinutes: 40, ActivityCount: 2}
	if got != want {
		t.Errorf("got %+v, want %+v", got, want)
	}
	if overview.Totals.ActualMinutes != 70 {
		t.Errorf("actual minutes %d, want 70", overview.Totals.ActualMinutes)
	}
	if overview.Totals.ActiveDays != 2 {
		t.Errorf("active days %d, want 2", overview.Totals.ActiveDays)
	}
	if _, leaked := overview.Days["2026-10-01"]; leaked {
		t.Error("October leaked into the September overview")
	}
}

func TestValidationErrors(t *testing.T) {
	handler, _ := newTestServer(t)
	c := &client{t: t, handler: handler}
	c.register(uniqueEmail("valid"))

	cases := []struct {
		name     string
		body     map[string]any
		status   int
		wantCode string
	}{
		{"unknown project", map[string]any{"projectId": "nope", "date": "2026-09-13", "durationMinutes": 30}, http.StatusNotFound, "NOT_FOUND"},
		{"impossible date", map[string]any{"projectId": "ozx", "date": "2026-02-30", "durationMinutes": 30}, http.StatusBadRequest, "VALIDATION"},
		{"zero minutes", map[string]any{"projectId": "ozx", "date": "2026-09-13", "durationMinutes": 0}, http.StatusBadRequest, "VALIDATION"},
		{"too many minutes", map[string]any{"projectId": "ozx", "date": "2026-09-13", "durationMinutes": 1441}, http.StatusBadRequest, "VALIDATION"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			response := c.do(http.MethodPost, "/api/activities", tc.body)
			if response.Code != tc.status {
				t.Fatalf("got %d, want %d: %s", response.Code, tc.status, response.Body.String())
			}
			if code := errorCode(t, response); code != tc.wantCode {
				t.Errorf("got code %q, want %q", code, tc.wantCode)
			}
		})
	}
}

func TestBadMonthIsRejected(t *testing.T) {
	handler, _ := newTestServer(t)
	c := &client{t: t, handler: handler}
	c.register(uniqueEmail("month"))

	if response := c.do(http.MethodGet, "/api/months/september", nil); response.Code != http.StatusBadRequest {
		t.Fatalf("got %d, want 400", response.Code)
	}
}

func TestLogoutEndsTheSession(t *testing.T) {
	handler, _ := newTestServer(t)
	c := &client{t: t, handler: handler}
	c.register(uniqueEmail("logout"))

	if response := c.do(http.MethodGet, "/api/auth/me", nil); response.Code != http.StatusOK {
		t.Fatalf("me before logout: %d", response.Code)
	}
	if response := c.do(http.MethodPost, "/api/auth/logout", nil); response.Code != http.StatusNoContent {
		t.Fatalf("logout: %d", response.Code)
	}
	if response := c.do(http.MethodGet, "/api/auth/me", nil); response.Code != http.StatusUnauthorized {
		t.Fatalf("me after logout: %d, want 401", response.Code)
	}
}

func TestRevokedSessionIsRejected(t *testing.T) {
	handler, st := newTestServer(t)
	c := &client{t: t, handler: handler}
	c.register(uniqueEmail("revoked"))

	// Delete the row out from under the cookie, as another device signing out would.
	if err := st.DeleteSession(context.Background(), c.cookie.Value); err != nil {
		t.Fatalf("delete session: %v", err)
	}
	if response := c.do(http.MethodGet, "/api/projects", nil); response.Code != http.StatusUnauthorized {
		t.Fatalf("got %d, want 401", response.Code)
	}
}
