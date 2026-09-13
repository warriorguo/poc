package store

import (
	"context"
	"errors"
	"math"
	"time"
)

// MaxEntryMinutes mirrors the CHECK constraint on activities.
const MaxEntryMinutes = 1440

// ErrTimerRunning is returned when a second timer would be started.
var ErrTimerRunning = errors.New("a timer is already running")

type RunningTimer struct {
	ProjectID string    `json:"projectId"`
	Date      string    `json:"date"`
	StartedAt time.Time `json:"startedAt"`
	Note      *string   `json:"note,omitempty"`
}

// StoppedTimer reports the activity that was written, and whether the elapsed
// time had to be capped.
type StoppedTimer struct {
	Activity       Activity `json:"activity"`
	ElapsedMinutes int      `json:"elapsedMinutes"`
	Truncated      bool     `json:"truncated"`
}

func (s *Store) RunningTimer(ctx context.Context, userID string) (RunningTimer, error) {
	var timer RunningTimer
	var date time.Time
	err := s.pool.QueryRow(ctx,
		`SELECT project_id, date, started_at, note FROM running_timers WHERE user_id = $1`, userID,
	).Scan(&timer.ProjectID, &date, &timer.StartedAt, &timer.Note)
	if noRows(err) {
		return RunningTimer{}, ErrNotFound
	}
	timer.Date = date.Format(isoDate)
	return timer, err
}

func (s *Store) StartTimer(ctx context.Context, userID, projectID, date string, note *string) (RunningTimer, error) {
	ok, err := s.projectExists(ctx, userID, projectID)
	if err != nil {
		return RunningTimer{}, err
	}
	if !ok {
		return RunningTimer{}, ErrNotFound
	}

	var timer RunningTimer
	var stored time.Time
	err = s.pool.QueryRow(ctx,
		`INSERT INTO running_timers (user_id, project_id, date, note) VALUES ($1, $2, $3, $4)
		 RETURNING project_id, date, started_at, note`,
		userID, projectID, date, note,
	).Scan(&timer.ProjectID, &stored, &timer.StartedAt, &timer.Note)
	if isUniqueViolation(err) {
		// The primary key rejected a second timer.
		return RunningTimer{}, ErrTimerRunning
	}
	if err != nil {
		return RunningTimer{}, err
	}
	timer.Date = stored.Format(isoDate)
	return timer, nil
}

// StopTimer converts the running timer into an activity, in one transaction so
// a crash cannot leave the timer deleted without its entry written.
func (s *Store) StopTimer(ctx context.Context, activityID, userID string, note *string, now time.Time) (StoppedTimer, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return StoppedTimer{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var projectID string
	var date time.Time
	var startedAt time.Time
	var startNote *string
	err = tx.QueryRow(ctx,
		`DELETE FROM running_timers WHERE user_id = $1
		 RETURNING project_id, date, started_at, note`, userID,
	).Scan(&projectID, &date, &startedAt, &startNote)
	if noRows(err) {
		return StoppedTimer{}, ErrNotFound
	}
	if err != nil {
		return StoppedTimer{}, err
	}

	if note == nil {
		note = startNote
	}

	// Round to the nearest minute, but never to zero: the schema requires at
	// least 1, and a short session is still a session.
	elapsed := int(math.Round(now.Sub(startedAt).Minutes()))
	if elapsed < 1 {
		elapsed = 1
	}
	duration, truncated := elapsed, false
	if duration > MaxEntryMinutes {
		// A timer left running overnight would otherwise fail the CHECK
		// constraint and lose the entry entirely.
		duration, truncated = MaxEntryMinutes, true
	}

	endedAt := now
	_, err = tx.Exec(ctx,
		`INSERT INTO activities (id, user_id, project_id, date, duration_minutes, note, source, started_at, ended_at)
		 VALUES ($1, $2, $3, $4, $5, $6, 'timer', $7, $8)`,
		activityID, userID, projectID, date, duration, note, startedAt, endedAt)
	if err != nil {
		return StoppedTimer{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return StoppedTimer{}, err
	}

	return StoppedTimer{
		Activity: Activity{
			ID: activityID, ProjectID: projectID, Date: date.Format(isoDate),
			DurationMinutes: duration, Note: note, Source: "timer",
		},
		ElapsedMinutes: elapsed,
		Truncated:      truncated,
	}, nil
}

func (s *Store) DiscardTimer(ctx context.Context, userID string) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM running_timers WHERE user_id = $1`, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}
