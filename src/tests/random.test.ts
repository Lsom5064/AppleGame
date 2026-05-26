import { describe, expect, it } from "vitest";
import { createSeededRandom } from "../utils/random";

describe("createSeededRandom", () => {
  it("returns the same sequence for the same seed", () => {
    const left = createSeededRandom("room-1:0");
    const right = createSeededRandom("room-1:0");

    const leftValues = Array.from({ length: 5 }, () => left());
    const rightValues = Array.from({ length: 5 }, () => right());

    expect(leftValues).toEqual(rightValues);
  });

  it("returns different sequences for different seeds", () => {
    const left = createSeededRandom("room-1:0");
    const right = createSeededRandom("room-1:1");

    expect(Array.from({ length: 3 }, () => left())).not.toEqual(
      Array.from({ length: 3 }, () => right())
    );
  });
});
