package api_test

import (
	"net/http"
	"testing"

	"github.com/warriorguo/poc/server/internal/store"
)

func TestSlugify(t *testing.T) {
	cases := map[string]string{
		"Piano Practice": "piano-practice",
		"  OZX  ":        "ozx",
		"C++ / Rust!":    "c-rust",
		"日本語 study":      "study",
		"---":            "",
	}
	for input, want := range cases {
		if got := store.Slugify(input); got != want {
			t.Errorf("Slugify(%q) = %q, want %q", input, got, want)
		}
	}
}

func TestAPITokenAuthenticatesDataEndpoints(t *testing.T) {
	handler, _ := newTestServer(t)
	owner := &client{t: t, handler: handler}
	owner.register(uniqueEmail("token"))

	created := decode[struct {
		ID     string `json:"id"`
		Token  string `json:"token"`
		Prefix string `json:"prefix"`
	}](t, owner.do(http.MethodPost, "/api/tokens", map[string]any{"name": "claude"}))

	if created.Token == "" {
		t.Fatal("token secret was not returned")
	}
	if created.Prefix == "" || len(created.Prefix) >= len(created.Token) {
		t.Errorf("prefix %q should be a short display form of the secret", created.Prefix)
	}

	// A fresh client with no cookie, carrying only the bearer token.
	agent := &client{t: t, handler: handler, bearer: created.Token}
	projects := decode[[]store.Project](t, agent.do(http.MethodGet, "/api/projects", nil))
	if len(projects) != len(store.DefaultProjects) {
		t.Fatalf("agent saw %d projects, want %d", len(projects), len(store.DefaultProjects))
	}

	response := agent.do(http.MethodPost, "/api/activities", map[string]any{
		"projectId": "ozx", "date": "2026-09-13", "durationMinutes": 30,
	})
	if response.Code != http.StatusCreated {
		t.Fatalf("agent could not log time: %d %s", response.Code, response.Body.String())
	}
}

func TestTokenSecretIsNeverListed(t *testing.T) {
	handler, _ := newTestServer(t)
	owner := &client{t: t, handler: handler}
	owner.register(uniqueEmail("tokenlist"))
	created := decode[struct {
		Token  string `json:"token"`
		Prefix string `json:"prefix"`
	}](t, owner.do(http.MethodPost, "/api/tokens", map[string]any{"name": "chatgpt"}))

	body := owner.do(http.MethodGet, "/api/tokens", nil).Body.String()

	// The short prefix is deliberately shown so tokens are identifiable; the
	// secret itself must never come back after creation.
	if contains(body, created.Token) {
		t.Errorf("listing leaked the token secret: %s", body)
	}
	if !contains(body, created.Prefix) {
		t.Errorf("listing should show the prefix for identification: %s", body)
	}
	if len(created.Prefix) > 16 {
		t.Errorf("prefix %q reveals too much of the secret", created.Prefix)
	}
}

// A leaked token must not be able to mint more tokens or revoke its siblings.
func TestTokenCannotManageTokens(t *testing.T) {
	handler, _ := newTestServer(t)
	owner := &client{t: t, handler: handler}
	owner.register(uniqueEmail("escalate"))
	created := decode[struct {
		ID    string `json:"id"`
		Token string `json:"token"`
	}](t, owner.do(http.MethodPost, "/api/tokens", map[string]any{"name": "agent"}))

	agent := &client{t: t, handler: handler, bearer: created.Token}
	for _, tc := range []struct{ method, path string; body any }{
		{http.MethodPost, "/api/tokens", map[string]any{"name": "second"}},
		{http.MethodGet, "/api/tokens", nil},
		{http.MethodDelete, "/api/tokens/" + created.ID, nil},
	} {
		if response := agent.do(tc.method, tc.path, tc.body); response.Code != http.StatusUnauthorized {
			t.Errorf("%s %s with a bearer token: got %d, want 401", tc.method, tc.path, response.Code)
		}
	}
}

func TestRevokedTokenStopsWorking(t *testing.T) {
	handler, _ := newTestServer(t)
	owner := &client{t: t, handler: handler}
	owner.register(uniqueEmail("revoke"))
	created := decode[struct {
		ID    string `json:"id"`
		Token string `json:"token"`
	}](t, owner.do(http.MethodPost, "/api/tokens", map[string]any{"name": "agent"}))

	agent := &client{t: t, handler: handler, bearer: created.Token}
	if response := agent.do(http.MethodGet, "/api/projects", nil); response.Code != http.StatusOK {
		t.Fatalf("token should work before revocation: %d", response.Code)
	}

	if response := owner.do(http.MethodDelete, "/api/tokens/"+created.ID, nil); response.Code != http.StatusNoContent {
		t.Fatalf("revoke: %d %s", response.Code, response.Body.String())
	}
	if response := agent.do(http.MethodGet, "/api/projects", nil); response.Code != http.StatusUnauthorized {
		t.Fatalf("revoked token still works: %d", response.Code)
	}
}

func TestOneUsersTokenCannotReachAnothersData(t *testing.T) {
	handler, _ := newTestServer(t)

	alice := &client{t: t, handler: handler}
	alice.register(uniqueEmail("alice-token"))
	alice.do(http.MethodPost, "/api/activities", map[string]any{
		"projectId": "ozx", "date": "2026-09-13", "durationMinutes": 120,
	})

	bob := &client{t: t, handler: handler}
	bob.register(uniqueEmail("bob-token"))
	bobToken := decode[struct{ Token string `json:"token"` }](t,
		bob.do(http.MethodPost, "/api/tokens", map[string]any{"name": "bob agent"}))

	agent := &client{t: t, handler: handler, bearer: bobToken.Token}
	overview := decode[store.MonthOverview](t, agent.do(http.MethodGet, "/api/months/2026-09", nil))
	if overview.Totals.ActualMinutes != 0 {
		t.Fatalf("bob's token saw %d minutes of alice's work", overview.Totals.ActualMinutes)
	}
}

func TestCreateProjectFromNameAlone(t *testing.T) {
	handler, _ := newTestServer(t)
	c := &client{t: t, handler: handler}
	c.register(uniqueEmail("newproject"))

	project := decode[store.Project](t, c.do(http.MethodPost, "/api/projects",
		map[string]any{"name": "Piano Practice"}))

	if project.ID != "piano-practice" {
		t.Errorf("id %q, want piano-practice", project.ID)
	}
	if project.Icon != "P" {
		t.Errorf("icon %q, want P", project.Icon)
	}
	if project.IntensityTargetMinutes != 60 {
		t.Errorf("target %d, want the 60 default", project.IntensityTargetMinutes)
	}
	// Appended after the four seeded projects rather than colliding at 0.
	if project.SortOrder != 4 {
		t.Errorf("sortOrder %d, want 4", project.SortOrder)
	}

	if response := c.do(http.MethodPost, "/api/activities", map[string]any{
		"projectId": "piano-practice", "date": "2026-09-13", "durationMinutes": 30,
	}); response.Code != http.StatusCreated {
		t.Fatalf("cannot log against the new project: %d %s", response.Code, response.Body.String())
	}
}

func TestCreateProjectRejectsDuplicateAndBadFields(t *testing.T) {
	handler, _ := newTestServer(t)
	c := &client{t: t, handler: handler}
	c.register(uniqueEmail("badproject"))

	if response := c.do(http.MethodPost, "/api/projects", map[string]any{"name": "OZX"}); response.Code != http.StatusConflict {
		t.Errorf("duplicate id: got %d, want 409", response.Code)
	}
	for _, body := range []map[string]any{
		{"name": ""},
		{"name": "Bad colour", "color": "red"},
		{"name": "Bad icon", "icon": "ABCD"},
		{"name": "Bad target", "intensityTargetMinutes": 5000},
	} {
		if response := c.do(http.MethodPost, "/api/projects", body); response.Code != http.StatusBadRequest {
			t.Errorf("%v: got %d, want 400", body, response.Code)
		}
	}
}

func TestUpdateProjectPatchesOnlyGivenFields(t *testing.T) {
	handler, _ := newTestServer(t)
	c := &client{t: t, handler: handler}
	c.register(uniqueEmail("patch"))

	updated := decode[store.Project](t, c.do(http.MethodPatch, "/api/projects/ozx",
		map[string]any{"name": "OZX Game"}))

	if updated.Name != "OZX Game" {
		t.Errorf("name %q", updated.Name)
	}
	// Omitted fields must survive untouched.
	if updated.Color != "#e4573d" || updated.IntensityTargetMinutes != 90 || updated.Icon != "O" {
		t.Errorf("patch clobbered an omitted field: %+v", updated)
	}
}

func TestArchivedProjectLeavesTheOverviewAndRefusesEntries(t *testing.T) {
	handler, _ := newTestServer(t)
	c := &client{t: t, handler: handler}
	c.register(uniqueEmail("archive"))

	c.do(http.MethodPatch, "/api/projects/reading", map[string]any{"isArchived": true})

	overview := decode[store.MonthOverview](t, c.do(http.MethodGet, "/api/months/2026-09", nil))
	for _, p := range overview.Projects {
		if p.ID == "reading" {
			t.Error("archived project still appears in the month overview")
		}
	}
	if response := c.do(http.MethodPost, "/api/activities", map[string]any{
		"projectId": "reading", "date": "2026-09-13", "durationMinutes": 30,
	}); response.Code != http.StatusNotFound {
		t.Errorf("logging against an archived project: got %d, want 404", response.Code)
	}
}

// The guard that matters: a cascade delete would silently destroy logged hours.
func TestDeleteProjectRefusesWhenItHasEntries(t *testing.T) {
	handler, _ := newTestServer(t)
	c := &client{t: t, handler: handler}
	c.register(uniqueEmail("delete"))
	c.do(http.MethodPost, "/api/activities", map[string]any{
		"projectId": "ozx", "date": "2026-09-13", "durationMinutes": 45,
	})

	if response := c.do(http.MethodDelete, "/api/projects/ozx", nil); response.Code != http.StatusConflict {
		t.Fatalf("got %d, want 409", response.Code)
	}
	if response := c.do(http.MethodGet, "/api/projects", nil); !contains(response.Body.String(), "ozx") {
		t.Fatal("project was removed despite the refusal")
	}

	// An unused project deletes without ceremony.
	if response := c.do(http.MethodDelete, "/api/projects/english", nil); response.Code != http.StatusNoContent {
		t.Fatalf("unused project delete: got %d", response.Code)
	}
	// And purge is the explicit escape hatch.
	if response := c.do(http.MethodDelete, "/api/projects/ozx?purge=true", nil); response.Code != http.StatusNoContent {
		t.Fatalf("purge: got %d %s", response.Code, response.Body.String())
	}
	overview := decode[store.MonthOverview](t, c.do(http.MethodGet, "/api/months/2026-09", nil))
	if overview.Totals.ActualMinutes != 0 {
		t.Error("purge left the activity behind")
	}
}

func contains(haystack, needle string) bool {
	return len(haystack) >= len(needle) && (func() bool {
		for i := 0; i+len(needle) <= len(haystack); i++ {
			if haystack[i:i+len(needle)] == needle {
				return true
			}
		}
		return false
	})()
}
