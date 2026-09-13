package store

import "time"

// The JSON shapes below are the wire contract with src/types/tracker.ts.
// Field names are camelCase to match it exactly.

type User struct {
	ID           string    `json:"id"`
	Email        string    `json:"email"`
	PasswordHash string    `json:"-"`
	CreatedAt    time.Time `json:"createdAt"`
}

type Project struct {
	ID                     string `json:"id"`
	Name                   string `json:"name"`
	Color                  string `json:"color"`
	Icon                   string `json:"icon"`
	IntensityTargetMinutes int    `json:"intensityTargetMinutes"`
	IsArchived             bool   `json:"isArchived"`
	SortOrder              int    `json:"sortOrder"`
}

type Plan struct {
	ID             string  `json:"id"`
	ProjectID      string  `json:"projectId"`
	Date           string  `json:"date"`
	PlannedMinutes int     `json:"plannedMinutes"`
	Note           *string `json:"note,omitempty"`
}

type Activity struct {
	ID              string  `json:"id"`
	ProjectID       string  `json:"projectId"`
	Date            string  `json:"date"`
	DurationMinutes int     `json:"durationMinutes"`
	Note            *string `json:"note,omitempty"`
	Source          string  `json:"source"`
}

type ProjectDaySummary struct {
	ProjectID      string `json:"projectId"`
	PlannedMinutes int    `json:"plannedMinutes"`
	ActualMinutes  int    `json:"actualMinutes"`
	ActivityCount  int    `json:"activityCount"`
}

type DaySummary struct {
	Date     string              `json:"date"`
	Projects []ProjectDaySummary `json:"projects"`
}

type MonthTotals struct {
	PlannedMinutes int `json:"plannedMinutes"`
	ActualMinutes  int `json:"actualMinutes"`
	ActiveDays     int `json:"activeDays"`
}

type MonthOverview struct {
	Month    string                `json:"month"`
	Projects []Project             `json:"projects"`
	Days     map[string]DaySummary `json:"days"`
	Totals   MonthTotals           `json:"totals"`
}

type CreateActivityInput struct {
	ProjectID       string  `json:"projectId"`
	Date            string  `json:"date"`
	DurationMinutes int     `json:"durationMinutes"`
	Note            *string `json:"note,omitempty"`
}

type CreatePlanInput struct {
	ProjectID      string  `json:"projectId"`
	Date           string  `json:"date"`
	PlannedMinutes int     `json:"plannedMinutes"`
	Note           *string `json:"note,omitempty"`
}

// DefaultProjects seeds a newly registered account, replacing the first-run
// seeding the browser adapter did inside its schema upgrade.
var DefaultProjects = []Project{
	{ID: "ozx", Name: "OZX", Color: "#e4573d", Icon: "O", IntensityTargetMinutes: 90, SortOrder: 0},
	{ID: "workout", Name: "Workout", Color: "#1f8a62", Icon: "W", IntensityTargetMinutes: 60, SortOrder: 1},
	{ID: "reading", Name: "Reading", Color: "#bc8b19", Icon: "R", IntensityTargetMinutes: 45, SortOrder: 2},
	{ID: "english", Name: "English", Color: "#2879a8", Icon: "E", IntensityTargetMinutes: 45, SortOrder: 3},
}
