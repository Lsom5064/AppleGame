import { SCORE_MODE } from "../constants";

export function calculateSelectionScore(selectedCount: number): number {
  if (selectedCount <= 0) {
    return 0;
  }

  switch (SCORE_MODE) {
    case "removed_apples":
      return selectedCount;
    default:
      return 1;
  }
}
