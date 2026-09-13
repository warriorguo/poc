package api

import (
	"errors"
	"net/http"
	"regexp"
	"strings"

	"github.com/warriorguo/poc/server/internal/store"
)

const (
	maxProjectNameLength = 60
	maxProjectIDLength   = 40
)

var (
	colorPattern     = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)
	projectIDPattern = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,39}$`)
)

type createProjectRequest struct {
	ID                     string `json:"id,omitempty"`
	Name                   string `json:"name"`
	Color                  string `json:"color,omitempty"`
	Icon                   string `json:"icon,omitempty"`
	IntensityTargetMinutes int    `json:"intensityTargetMinutes,omitempty"`
	SortOrder              int    `json:"sortOrder,omitempty"`
}

// validateProjectFields returns a human-readable problem, or "" when valid.
func validateProjectFields(name, color, icon string, target int) string {
	if name == "" || len(name) > maxProjectNameLength {
		return "Give the project a name of 1 to 60 characters."
	}
	if !colorPattern.MatchString(color) {
		return "Colour must be a six-digit hex value such as #e4573d."
	}
	if count := len([]rune(icon)); count < 1 || count > 2 {
		return "Icon must be one or two characters."
	}
	if target < 1 || target > maxEntryMinutes {
		return "The intensity target must be between 1 and 1440 minutes."
	}
	return ""
}

func (s *Server) handleCreateProject(w http.ResponseWriter, r *http.Request, user store.User) {
	var body createProjectRequest
	if err := decodeJSON(r, &body); err != nil {
		s.writeError(w, http.StatusBadRequest, codeValidation, "Send at least a name for the project.")
		return
	}

	name := strings.TrimSpace(body.Name)
	// Sensible defaults so an agent can create a project from a name alone.
	color := strings.TrimSpace(body.Color)
	if color == "" {
		color = "#77766e"
	}
	icon := strings.TrimSpace(body.Icon)
	if icon == "" && name != "" {
		icon = strings.ToUpper(string([]rune(name)[0]))
	}
	target := body.IntensityTargetMinutes
	if target == 0 {
		target = 60
	}

	if problem := validateProjectFields(name, color, icon, target); problem != "" {
		s.writeError(w, http.StatusBadRequest, codeValidation, problem)
		return
	}

	id := strings.TrimSpace(body.ID)
	if id == "" {
		id = store.Slugify(name)
	}
	if !projectIDPattern.MatchString(id) {
		s.writeError(w, http.StatusBadRequest, codeValidation,
			"The project id must be lowercase letters, digits and hyphens, up to 40 characters.")
		return
	}

	project, err := s.store.CreateProject(r.Context(), user.ID, store.Project{
		ID: id, Name: name, Color: color, Icon: icon,
		IntensityTargetMinutes: target, SortOrder: body.SortOrder,
	})
	if errors.Is(err, store.ErrConflict) {
		s.writeError(w, http.StatusConflict, codeConflict,
			"A project with that id already exists. Choose a different id.")
		return
	}
	if err != nil {
		s.writeInternal(w, "create project", err)
		return
	}
	s.writeJSON(w, http.StatusCreated, project)
}

func (s *Server) handleUpdateProject(w http.ResponseWriter, r *http.Request, user store.User) {
	var patch store.ProjectPatch
	if err := decodeJSON(r, &patch); err != nil {
		s.writeError(w, http.StatusBadRequest, codeValidation, "Send at least one field to change.")
		return
	}

	current, err := s.store.GetProject(r.Context(), user.ID, r.PathValue("id"))
	if errors.Is(err, store.ErrNotFound) {
		s.writeError(w, http.StatusNotFound, codeNotFound, "That project does not exist.")
		return
	}
	if err != nil {
		s.writeInternal(w, "read project", err)
		return
	}

	// Validate the result of applying the patch, not the patch alone.
	name, color, icon, target := current.Name, current.Color, current.Icon, current.IntensityTargetMinutes
	if patch.Name != nil {
		name = strings.TrimSpace(*patch.Name)
		patch.Name = &name
	}
	if patch.Color != nil {
		color = strings.TrimSpace(*patch.Color)
		patch.Color = &color
	}
	if patch.Icon != nil {
		icon = strings.TrimSpace(*patch.Icon)
		patch.Icon = &icon
	}
	if patch.IntensityTargetMinutes != nil {
		target = *patch.IntensityTargetMinutes
	}
	if problem := validateProjectFields(name, color, icon, target); problem != "" {
		s.writeError(w, http.StatusBadRequest, codeValidation, problem)
		return
	}

	project, err := s.store.UpdateProject(r.Context(), user.ID, current.ID, patch)
	if errors.Is(err, store.ErrNotFound) {
		s.writeError(w, http.StatusNotFound, codeNotFound, "That project does not exist.")
		return
	}
	if err != nil {
		s.writeInternal(w, "update project", err)
		return
	}
	s.writeJSON(w, http.StatusOK, project)
}

func (s *Server) handleDeleteProject(w http.ResponseWriter, r *http.Request, user store.User) {
	purge := r.URL.Query().Get("purge") == "true"

	err := s.store.DeleteProject(r.Context(), user.ID, r.PathValue("id"), purge)
	if errors.Is(err, store.ErrProjectInUse) {
		s.writeError(w, http.StatusConflict, codeConflict,
			"That project has recorded plans or activities. Archive it instead, or pass ?purge=true to delete the entries with it.")
		return
	}
	if errors.Is(err, store.ErrNotFound) {
		s.writeError(w, http.StatusNotFound, codeNotFound, "That project does not exist.")
		return
	}
	if err != nil {
		s.writeInternal(w, "delete project", err)
		return
	}
	s.writeJSON(w, http.StatusNoContent, nil)
}
