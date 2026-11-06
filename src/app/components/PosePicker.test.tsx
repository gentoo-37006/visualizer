import { describe, expect, it } from "vitest";
import { parsePoseCoordinates } from "./PosePicker";

describe("manual pose input", () => {
  it("parses both coordinates atomically", () => {
    expect(parsePoseCoordinates("-12.2, -59.0")).toEqual({ x: -12.2, y: -59 });
    expect(parsePoseCoordinates("(12, -23, 45)", true)).toEqual({ x: 12, y: -23, heading: 45 });
  });
  it("rejects incomplete and invalid values", () => {
    for (const text of ["12,", "12", "Infinity,0", "1,2,3", "1x,2", "1,,2"]) expect(parsePoseCoordinates(text)).toBeNull();
    expect(parsePoseCoordinates("1,2", true)).toBeNull();
  });
});
