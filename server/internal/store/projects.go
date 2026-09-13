package store

import (
	"context"
	"fmt"
	"strings"
)

type ProjectPatch struct {
	Name                   *string `json:"name,omitempty"`
	Color                  *string `json:"color,omitempty"`
	Icon                   *string `json:"icon,omitempty"`
	IntensityTargetMinutes *int    `json:"intensityTargetMinutes,omitempty"`
	SortOrder              *int    `json:"sortOrder,omitempty"`
	IsArchived             *bool   `json:"isArchived,omitempty"`
}

// ErrProjectInUse is returned when deleting a project would cascade into
// plans or activities the user has already recorded.
var ErrProjectInUse = fmt.Errorf("project has entries")

func (s *Store) CreateProject(ctx context.Context, userID string, project Project) (Project, error) {
	// Place a new project last unless the caller chose a position.
	if project.SortOrder == 0 {
		var next int
		err := s.pool.QueryRow(ctx,
			`SELECT COALESCE(MAX(sort_order) + 1, 0) FROM projects WHERE user_id = $1`, userID).Scan(&next)
		if err != nil {
			return Project{}, err
		}
		project.SortOrder = next
	}

	_, err := s.pool.Exec(ctx,
		`INSERT INTO projects (user_id, id, name, color, icon, intensity_target_minutes, is_archived, sort_order)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
		userID, project.ID, project.Name, project.Color, project.Icon,
		project.IntensityTargetMinutes, project.IsArchived, project.SortOrder)
	if isUniqueViolation(err) {
		return Project{}, ErrConflict
	}
	if err != nil {
		return Project{}, fmt.Errorf("insert project: %w", err)
	}
	return project, nil
}

func (s *Store) GetProject(ctx context.Context, userID, id string) (Project, error) {
	var p Project
	err := s.pool.QueryRow(ctx,
		`SELECT id, name, color, icon, intensity_target_minutes, is_archived, sort_order
		   FROM projects WHERE user_id = $1 AND id = $2`, userID, id,
	).Scan(&p.ID, &p.Name, &p.Color, &p.Icon, &p.IntensityTargetMinutes, &p.IsArchived, &p.SortOrder)
	if noRows(err) {
		return Project{}, ErrNotFound
	}
	return p, err
}

// UpdateProject applies only the fields present in the patch. COALESCE keeps
// absent fields at their current value, so a patch cannot blank a field by
// omitting it.
func (s *Store) UpdateProject(ctx context.Context, userID, id string, patch ProjectPatch) (Project, error) {
	var p Project
	err := s.pool.QueryRow(ctx, `
		UPDATE projects
		   SET name                     = COALESCE($3, name),
		       color                    = COALESCE($4, color),
		       icon                     = COALESCE($5, icon),
		       intensity_target_minutes = COALESCE($6, intensity_target_minutes),
		       sort_order               = COALESCE($7, sort_order),
		       is_archived              = COALESCE($8, is_archived)
		 WHERE user_id = $1 AND id = $2
		RETURNING id, name, color, icon, intensity_target_minutes, is_archived, sort_order`,
		userID, id, patch.Name, patch.Color, patch.Icon,
		patch.IntensityTargetMinutes, patch.SortOrder, patch.IsArchived,
	).Scan(&p.ID, &p.Name, &p.Color, &p.Icon, &p.IntensityTargetMinutes, &p.IsArchived, &p.SortOrder)
	if noRows(err) {
		return Project{}, ErrNotFound
	}
	return p, err
}

// DeleteProject refuses to cascade over recorded work unless purge is set.
// The foreign keys would otherwise delete logged hours silently.
func (s *Store) DeleteProject(ctx context.Context, userID, id string, purge bool) error {
	if !purge {
		var entries int
		err := s.pool.QueryRow(ctx, `
			SELECT (SELECT COUNT(*) FROM plans      WHERE user_id = $1 AND project_id = $2)
			     + (SELECT COUNT(*) FROM activities WHERE user_id = $1 AND project_id = $2)`,
			userID, id).Scan(&entries)
		if err != nil {
			return err
		}
		if entries > 0 {
			return ErrProjectInUse
		}
	}

	tag, err := s.pool.Exec(ctx, `DELETE FROM projects WHERE user_id = $1 AND id = $2`, userID, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// Slugify derives a project id from its name: lowercase, alphanumerics kept,
// everything else collapsed to a single hyphen.
func Slugify(name string) string {
	var builder strings.Builder
	lastWasHyphen := true
	for _, r := range strings.ToLower(strings.TrimSpace(name)) {
		switch {
		case (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9'):
			builder.WriteRune(r)
			lastWasHyphen = false
		default:
			if !lastWasHyphen {
				builder.WriteRune('-')
				lastWasHyphen = true
			}
		}
	}
	return strings.Trim(builder.String(), "-")
}
