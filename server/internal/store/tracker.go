package store

import (
	"context"
	"fmt"
	"sort"
	"time"
)

const isoDate = "2006-01-02"

func (s *Store) ListProjects(ctx context.Context, userID string) ([]Project, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, name, color, icon, intensity_target_minutes, is_archived, sort_order
		   FROM projects WHERE user_id = $1 ORDER BY sort_order, name`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	projects := []Project{}
	for rows.Next() {
		var p Project
		if err := rows.Scan(&p.ID, &p.Name, &p.Color, &p.Icon, &p.IntensityTargetMinutes, &p.IsArchived, &p.SortOrder); err != nil {
			return nil, err
		}
		projects = append(projects, p)
	}
	return projects, rows.Err()
}

// MonthBounds turns "2026-09" into the half-open range [2026-09-01, 2026-10-01).
func MonthBounds(month string) (time.Time, time.Time, error) {
	start, err := time.Parse("2006-01", month)
	if err != nil {
		return time.Time{}, time.Time{}, fmt.Errorf("invalid month %q", month)
	}
	return start, start.AddDate(0, 1, 0), nil
}

// MonthOverview aggregates plans and activities per (date, project) in SQL over
// the (user_id, date) index, rather than reading the month and grouping in Go.
func (s *Store) MonthOverview(ctx context.Context, userID, month string) (MonthOverview, error) {
	start, end, err := MonthBounds(month)
	if err != nil {
		return MonthOverview{}, err
	}

	projects, err := s.ListProjects(ctx, userID)
	if err != nil {
		return MonthOverview{}, err
	}
	visible := make([]Project, 0, len(projects))
	for _, p := range projects {
		if !p.IsArchived {
			visible = append(visible, p)
		}
	}

	rows, err := s.pool.Query(ctx, `
		SELECT entry.date,
		       entry.project_id,
		       SUM(entry.planned)::int  AS planned_minutes,
		       SUM(entry.actual)::int   AS actual_minutes,
		       SUM(entry.sessions)::int AS activity_count
		  FROM (
		        SELECT date, project_id, planned_minutes AS planned, 0 AS actual, 0 AS sessions
		          FROM plans
		         WHERE user_id = $1 AND date >= $2 AND date < $3
		        UNION ALL
		        SELECT date, project_id, 0, duration_minutes, 1
		          FROM activities
		         WHERE user_id = $1 AND date >= $2 AND date < $3
		       ) AS entry
		 GROUP BY entry.date, entry.project_id
		 ORDER BY entry.date, entry.project_id`,
		userID, start, end)
	if err != nil {
		return MonthOverview{}, err
	}
	defer rows.Close()

	days := map[string]DaySummary{}
	totals := MonthTotals{}
	activeDays := map[string]struct{}{}

	for rows.Next() {
		var date time.Time
		var summary ProjectDaySummary
		if err := rows.Scan(&date, &summary.ProjectID, &summary.PlannedMinutes, &summary.ActualMinutes, &summary.ActivityCount); err != nil {
			return MonthOverview{}, err
		}
		key := date.Format(isoDate)
		day := days[key]
		day.Date = key
		day.Projects = append(day.Projects, summary)
		days[key] = day

		totals.PlannedMinutes += summary.PlannedMinutes
		totals.ActualMinutes += summary.ActualMinutes
		if summary.ActualMinutes > 0 {
			activeDays[key] = struct{}{}
		}
	}
	if err := rows.Err(); err != nil {
		return MonthOverview{}, err
	}
	totals.ActiveDays = len(activeDays)

	// The client renders project blocks in the order given; keep it stable.
	for key, day := range days {
		sort.Slice(day.Projects, func(a, b int) bool { return day.Projects[a].ProjectID < day.Projects[b].ProjectID })
		days[key] = day
	}

	return MonthOverview{Month: month, Projects: visible, Days: days, Totals: totals}, nil
}

// projectExists reports whether the project is usable by this user. A project
// belonging to somebody else is reported exactly like one that does not exist.
func (s *Store) projectExists(ctx context.Context, userID, projectID string) (bool, error) {
	var exists bool
	err := s.pool.QueryRow(ctx,
		`SELECT EXISTS (SELECT 1 FROM projects WHERE user_id = $1 AND id = $2 AND NOT is_archived)`,
		userID, projectID).Scan(&exists)
	return exists, err
}

func (s *Store) CreateActivity(ctx context.Context, id, userID string, in CreateActivityInput) (Activity, error) {
	ok, err := s.projectExists(ctx, userID, in.ProjectID)
	if err != nil {
		return Activity{}, err
	}
	if !ok {
		return Activity{}, ErrNotFound
	}

	_, err = s.pool.Exec(ctx,
		`INSERT INTO activities (id, user_id, project_id, date, duration_minutes, note, source)
		 VALUES ($1, $2, $3, $4, $5, $6, 'manual')`,
		id, userID, in.ProjectID, in.Date, in.DurationMinutes, in.Note)
	if err != nil {
		return Activity{}, fmt.Errorf("insert activity: %w", err)
	}
	return Activity{
		ID: id, ProjectID: in.ProjectID, Date: in.Date,
		DurationMinutes: in.DurationMinutes, Note: in.Note, Source: "manual",
	}, nil
}

func (s *Store) CreatePlan(ctx context.Context, id, userID string, in CreatePlanInput) (Plan, error) {
	ok, err := s.projectExists(ctx, userID, in.ProjectID)
	if err != nil {
		return Plan{}, err
	}
	if !ok {
		return Plan{}, ErrNotFound
	}

	_, err = s.pool.Exec(ctx,
		`INSERT INTO plans (id, user_id, project_id, date, planned_minutes, note)
		 VALUES ($1, $2, $3, $4, $5, $6)`,
		id, userID, in.ProjectID, in.Date, in.PlannedMinutes, in.Note)
	if err != nil {
		return Plan{}, fmt.Errorf("insert plan: %w", err)
	}
	return Plan{ID: id, ProjectID: in.ProjectID, Date: in.Date, PlannedMinutes: in.PlannedMinutes, Note: in.Note}, nil
}
