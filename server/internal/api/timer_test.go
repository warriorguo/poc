package api_test

import (
	"context"
	"net/http"
	"testing"
	"time"

	"github.com/warriorguo/poc/server/internal/auth"
	"github.com/warriorguo/poc/server/internal/store"
)

type runningTimer struct {
	ProjectID string    `json:"projectId"`
	Date      string    `json:"date"`
	StartedAt time.Time `json:"startedAt"`
}

type stoppedTimer struct {
	Activity       store.Activity `json:"activity"`
	ElapsedMinutes int            `json:"elapsedMinutes"`
	Truncated      bool           `json:"truncated"`
}

func TestTimerIsNullWhenNothingRuns(t *testing.T) {
	handler, _ := newTestServer(t)
	c := &client{t: t, handler: handler}
	c.register(uniqueEmail("timer-idle"))

	response := c.do(http.MethodGet, "/api/timer", nil)
	if response.Code != http.StatusOK {
		t.Fatalf("got %d, want 200", response.Code)
	}
	// "Nothing running" is a normal state, so it must not read as an error.
	if body := response.Body.String(); body != "null\n" {
		t.Errorf("body %q, want null", body)
	}
}

func TestStartTimerThenReadItBack(t *testing.T) {
	handler, _ := newTestServer(t)
	c := &client{t: t, handler: handler}
	c.register(uniqueEmail("timer-start"))

	started := decode[runningTimer](t, c.do(http.MethodPost, "/api/timer/start",
		map[string]any{"projectId": "ozx", "date": "2026-09-13"}))
	if started.ProjectID != "ozx" || started.Date != "2026-09-13" {
		t.Fatalf("got %+v", started)
	}

	current := decode[runningTimer](t, c.do(http.MethodGet, "/api/timer", nil))
	if current.ProjectID != "ozx" {
		t.Errorf("running timer %+v", current)
	}
}

// The database primary key is what enforces this, not application logic.
func TestSecondTimerIsRefused(t *testing.T) {
	handler, _ := newTestServer(t)
	c := &client{t: t, handler: handler}
	c.register(uniqueEmail("timer-second"))

	c.do(http.MethodPost, "/api/timer/start", map[string]any{"projectId": "ozx", "date": "2026-09-13"})
	response := c.do(http.MethodPost, "/api/timer/start", map[string]any{"projectId": "reading", "date": "2026-09-13"})

	if response.Code != http.StatusConflict {
		t.Fatalf("got %d, want 409", response.Code)
	}
	// The first timer must survive the refusal.
	current := decode[runningTimer](t, c.do(http.MethodGet, "/api/timer", nil))
	if current.ProjectID != "ozx" {
		t.Errorf("refused start changed the running timer to %q", current.ProjectID)
	}
}

func TestStartTimerRejectsUnknownProject(t *testing.T) {
	handler, _ := newTestServer(t)
	c := &client{t: t, handler: handler}
	c.register(uniqueEmail("timer-unknown"))

	if response := c.do(http.MethodPost, "/api/timer/start",
		map[string]any{"projectId": "nope", "date": "2026-09-13"}); response.Code != http.StatusNotFound {
		t.Fatalf("got %d, want 404", response.Code)
	}
}

func TestStopTimerWritesATimerActivity(t *testing.T) {
	handler, st := newTestServer(t)
	c := &client{t: t, handler: handler}
	c.register(uniqueEmail("timer-stop"))
	c.do(http.MethodPost, "/api/timer/start", map[string]any{"projectId": "ozx", "date": "2026-09-13"})

	stopped := decode[stoppedTimer](t, c.do(http.MethodPost, "/api/timer/stop", map[string]any{"note": "combat"}))

	if stopped.Activity.Source != "timer" {
		t.Errorf("source %q, want timer", stopped.Activity.Source)
	}
	if stopped.Activity.Date != "2026-09-13" {
		t.Errorf("date %q, want the start date", stopped.Activity.Date)
	}
	// A sub-minute session still counts as one minute; the schema requires >= 1.
	if stopped.Activity.DurationMinutes != 1 {
		t.Errorf("duration %d, want 1", stopped.Activity.DurationMinutes)
	}
	if stopped.Truncated {
		t.Error("a short timer should not report truncation")
	}
	if stopped.Activity.Note == nil || *stopped.Activity.Note != "combat" {
		t.Errorf("note %v", stopped.Activity.Note)
	}

	// It reaches the month overview like any other activity.
	overview, err := st.MonthOverview(context.Background(), userIDFor(t, st, c), "2026-09")
	if err != nil {
		t.Fatalf("overview: %v", err)
	}
	if overview.Totals.ActualMinutes != 1 {
		t.Errorf("overview minutes %d, want 1", overview.Totals.ActualMinutes)
	}

	// And the timer is gone.
	if body := c.do(http.MethodGet, "/api/timer", nil).Body.String(); body != "null\n" {
		t.Errorf("timer still running after stop: %s", body)
	}
}

func TestStopWithNoTimerRunning(t *testing.T) {
	handler, _ := newTestServer(t)
	c := &client{t: t, handler: handler}
	c.register(uniqueEmail("timer-nostop"))

	if response := c.do(http.MethodPost, "/api/timer/stop", nil); response.Code != http.StatusNotFound {
		t.Fatalf("got %d, want 404", response.Code)
	}
}

func TestDiscardTimerLogsNothing(t *testing.T) {
	handler, st := newTestServer(t)
	c := &client{t: t, handler: handler}
	c.register(uniqueEmail("timer-discard"))
	c.do(http.MethodPost, "/api/timer/start", map[string]any{"projectId": "ozx", "date": "2026-09-13"})

	if response := c.do(http.MethodDelete, "/api/timer", nil); response.Code != http.StatusNoContent {
		t.Fatalf("discard: got %d", response.Code)
	}

	overview, err := st.MonthOverview(context.Background(), userIDFor(t, st, c), "2026-09")
	if err != nil {
		t.Fatalf("overview: %v", err)
	}
	if overview.Totals.ActualMinutes != 0 {
		t.Errorf("discard wrote %d minutes", overview.Totals.ActualMinutes)
	}
	if response := c.do(http.MethodDelete, "/api/timer", nil); response.Code != http.StatusNotFound {
		t.Errorf("second discard: got %d, want 404", response.Code)
	}
}

// A timer left running overnight must not fail the CHECK constraint and lose
// the entry; it is capped and reported as truncated.
func TestOverlongTimerIsCappedNotLost(t *testing.T) {
	handler, st := newTestServer(t)
	c := &client{t: t, handler: handler}
	email := uniqueEmail("timer-overlong")
	c.register(email)
	userID := userIDFor(t, st, c)

	if _, err := st.StartTimer(context.Background(), userID, "ozx", "2026-09-13", nil); err != nil {
		t.Fatalf("start: %v", err)
	}

	id, _ := auth.NewUUID()
	// Stop 26 hours after the start, as if the timer ran overnight.
	stopped, err := st.StopTimer(context.Background(), id, userID, nil, time.Now().Add(26*time.Hour))
	if err != nil {
		t.Fatalf("stop: %v", err)
	}

	if !stopped.Truncated {
		t.Error("expected truncated to be reported")
	}
	if stopped.Activity.DurationMinutes != store.MaxEntryMinutes {
		t.Errorf("duration %d, want the %d cap", stopped.Activity.DurationMinutes, store.MaxEntryMinutes)
	}
	// The real elapsed time is still reported, so the UI can explain the gap.
	if stopped.ElapsedMinutes < 26*60-1 {
		t.Errorf("elapsed %d, want about %d", stopped.ElapsedMinutes, 26*60)
	}
}

func TestTimersAreScopedPerUser(t *testing.T) {
	handler, _ := newTestServer(t)

	alice := &client{t: t, handler: handler}
	alice.register(uniqueEmail("timer-alice"))
	alice.do(http.MethodPost, "/api/timer/start", map[string]any{"projectId": "ozx", "date": "2026-09-13"})

	bob := &client{t: t, handler: handler}
	bob.register(uniqueEmail("timer-bob"))

	if body := bob.do(http.MethodGet, "/api/timer", nil).Body.String(); body != "null\n" {
		t.Errorf("bob sees alice's timer: %s", body)
	}
	// Bob can still start his own while Alice's runs.
	if response := bob.do(http.MethodPost, "/api/timer/start",
		map[string]any{"projectId": "reading", "date": "2026-09-13"}); response.Code != http.StatusCreated {
		t.Errorf("bob blocked by alice's timer: %d", response.Code)
	}
}

func TestTimerRequiresAuthentication(t *testing.T) {
	handler, _ := newTestServer(t)
	anonymous := &client{t: t, handler: handler}
	for _, tc := range []struct{ method, path string }{
		{http.MethodGet, "/api/timer"},
		{http.MethodPost, "/api/timer/start"},
		{http.MethodPost, "/api/timer/stop"},
		{http.MethodDelete, "/api/timer"},
	} {
		if response := anonymous.do(tc.method, tc.path, nil); response.Code != http.StatusUnauthorized {
			t.Errorf("%s %s: got %d, want 401", tc.method, tc.path, response.Code)
		}
	}
}

// userIDFor reads the id of the account the client registered.
func userIDFor(t *testing.T, st *store.Store, c *client) string {
	t.Helper()
	response := c.do(http.MethodGet, "/api/auth/me", nil)
	account := decode[struct {
		Email string `json:"email"`
	}](t, response)
	user, err := st.UserByEmail(context.Background(), account.Email)
	if err != nil {
		t.Fatalf("look up user: %v", err)
	}
	return user.ID
}
