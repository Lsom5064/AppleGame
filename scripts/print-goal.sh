#!/bin/sh

set -eu

GOAL_FILE="${1:-goals/current-goal.md}"

if [ ! -f "$GOAL_FILE" ]; then
  echo "Goal file not found: $GOAL_FILE" >&2
  exit 1
fi

extract_section() {
  section_name="$1"

  awk -v target="$section_name" '
    BEGIN {
      capture = 0
    }
    $0 == "## " target {
      capture = 1
      next
    }
    /^## / && capture {
      exit
    }
    capture {
      print
    }
  ' "$GOAL_FILE" | sed '/^[[:space:]]*$/d'
}

normalize_text() {
  sed 's/^[-*][[:space:]]*//; s/`//g' | tr '\n' ' ' | awk '{$1=$1; print}'
}

strip_trailing_punctuation() {
  printf '%s' "$1" | sed 's/[[:space:]]*[.。]\{1,\}$//'
}

outcome="$(extract_section "Outcome" | normalize_text)"
verification="$(extract_section "Verification" | normalize_text)"
constraints="$(extract_section "Constraints" | normalize_text)"
boundaries="$(extract_section "Boundaries" | normalize_text)"
iteration_policy="$(extract_section "Iteration Policy" | normalize_text)"
blocked="$(extract_section "Blocked Stop Condition" | normalize_text)"

if [ -z "$outcome" ]; then
  echo "Outcome section is required in $GOAL_FILE" >&2
  exit 1
fi

printf '/goal %s' "$outcome"

if [ -n "$verification" ]; then
  printf ' verified by %s' "$verification"
fi

if [ -n "$constraints" ]; then
  printf ' while preserving %s' "$constraints"
fi

if [ -n "$boundaries" ]; then
  printf ' Use %s.' "$(strip_trailing_punctuation "$boundaries")"
fi

if [ -n "$iteration_policy" ]; then
  printf ' Between iterations, %s.' "$(strip_trailing_punctuation "$iteration_policy")"
fi

if [ -n "$blocked" ]; then
  printf ' If blocked or no valid path remains, %s.' "$(strip_trailing_punctuation "$blocked")"
fi

printf '\n'
