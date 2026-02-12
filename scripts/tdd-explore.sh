#!/usr/bin/env bash
# tdd-explore.sh — Automated TDD defect exploration loop
#
# Spawns Claude Code to explore a focus area of the codebase, hypothesize
# a bug, write a RED test, implement the fix, and verify GREEN.
#
# Usage:
#   ./scripts/tdd-explore.sh [rounds]    # default: 3 rounds
#
# Each round focuses on a different area to avoid duplicate findings.

set -euo pipefail
cd "$(dirname "$0")/.."

ROUNDS=${1:-3}
PROJECT_DIR=$(pwd)

FOCUS_AREAS=(
  "Store actions in src/stores/finder-store.ts — look for state consistency bugs: missing cleanup in actions, stale references after mutations, edge cases in columnPath/selections/multiSelections management, items that should update but don't propagate to childrenByParentId"
  "Component event handling in src/components/miller/miller-column.tsx and src/components/miller/miller-item.tsx — look for: keyboard handler edge cases, drag-and-drop race conditions, event propagation issues, virtualizer interaction bugs, focus management problems"
  "Hook interactions in src/hooks/ (use-create.ts, use-delete.ts, use-rename.ts, use-preview.ts, use-children.ts) and their interplay with the store — look for: fetch race conditions, optimistic update ordering, missing error handling paths, cache staleness, effects that don't clean up"
  "Preview panel in src/components/preview/preview-panel.tsx and src/hooks/use-preview.ts — look for: stale data display, loading state inconsistencies, cache invalidation gaps, component state vs store state conflicts"
  "Service layer in src/lib/notion-service.ts — look for: index consistency bugs in patchIndex methods, cache key mismatches, race conditions between concurrent patch operations, edge cases in hasChildren derivation"
)

echo "TDD Explore Loop — $ROUNDS rounds"
echo "Project: $PROJECT_DIR"
echo ""

for ((i=0; i<ROUNDS; i++)); do
  FOCUS_IDX=$((i % ${#FOCUS_AREAS[@]}))
  FOCUS="${FOCUS_AREAS[$FOCUS_IDX]}"
  ROUND=$((i + 1))

  echo "═══════════════════════════════════════════════"
  echo "Round $ROUND/$ROUNDS — Focus: ${FOCUS%%—*}"
  echo "═══════════════════════════════════════════════"
  echo ""

  claude --print -p "You are running a TDD defect exploration loop on the Notion Finder codebase at $PROJECT_DIR.

FOCUS AREA: $FOCUS

INSTRUCTIONS:
1. Read the focus files thoroughly. Also read the existing test file at src/stores/__tests__/finder-store-defects.test.ts to avoid duplicating already-tested defects.
2. Hypothesize a REAL bug (not style, not premature optimization). State your hypothesis clearly with the specific code path that fails.
3. Validate your reasoning — trace through the code to confirm the bug exists. If you can't confirm it, try another hypothesis.
4. Write a RED test that proves the defect. Append it to src/stores/__tests__/finder-store-defects.test.ts (or create a new test file if the defect is in a different layer).
5. Run the test to confirm it's RED: npx vitest run <test-file>
6. Implement the minimal fix.
7. Run the test again to confirm GREEN.
8. Run the full suite: npx vitest run — ensure no regressions (2 pre-existing failures in notion-service.test.ts are expected).
9. Stage and commit with a descriptive message.

RULES:
- Only fix REAL bugs that would affect users. No style fixes, no theoretical issues.
- If you can't find a real bug after thorough exploration, say so honestly — don't fabricate one.
- Each defect gets a CR-N identifier continuing from the existing sequence.
- Test names follow the pattern: Defect CR-N: <description>
- Commit message follows: Fix <description> + Co-Authored-By line."

  echo ""
  echo "Round $ROUND complete."
  echo ""
done

echo "All $ROUNDS rounds complete."
echo ""
echo "Review changes:"
echo "  git log --oneline -$ROUNDS"
echo "  git diff HEAD~$ROUNDS..HEAD --stat"
