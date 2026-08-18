import { beforeEach, describe, expect, it } from "vitest";
import { AUTON_DRAFT_STORAGE_KEY, loadAutonDraft, saveAutonDraft } from "../plannerStorage";
import { INITIAL_POINT_ID } from "../plannerConstants";
import type { PlannerSnapshot } from "../plannerTypes";

class MemoryStorage {
  private entries = new Map<string, string>();
  getItem(key: string) {
    return this.entries.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.entries.set(key, value);
  }
  removeItem(key: string) {
    this.entries.delete(key);
  }
}

beforeEach(() => {
  // plannerStorage guards on `typeof window`, so the module only reaches storage
  // once a window exists.
  Object.defineProperty(globalThis, "window", {
    value: { localStorage: new MemoryStorage() },
    configurable: true,
    writable: true,
  });
});

const store = (value: unknown) =>
  window.localStorage.setItem(
    AUTON_DRAFT_STORAGE_KEY,
    typeof value === "string" ? value : JSON.stringify(value)
  );

const startPoint = { id: INITIAL_POINT_ID, nx: 0.5, ny: 0.5, color: "#fff", locked: true, heading: 0 };

describe("auton draft persistence", () => {
  it("round trips a draft through storage", () => {
    const snapshot: PlannerSnapshot = {
      points: [
        startPoint,
        {
          id: "a",
          name: "toBasket",
          nx: 0.25,
          ny: 0.75,
          color: "#abc",
          locked: false,
          headingMode: "linear",
          startHeading: 10,
          endHeading: -20,
          linearStartT: 0.2,
          linearEndT: 0.8,
          controlPoints: [{ id: "c1", nx: 0.4, ny: 0.4 }],
          actionTriggers: [{ id: "t1", mode: "start", t: 0.5, actionName: "INTAKE" }],
        },
      ],
      sequenceItems: [
        { id: "s1", kind: "path", pointId: "a" },
        { id: "s2", kind: "action", name: "LIFT", mode: "run", timeout: 2 },
      ],
    };

    saveAutonDraft(snapshot);
    expect(loadAutonDraft()).toEqual(snapshot);
  });

  it("returns null rather than throwing on unusable storage", () => {
    store("{not json");
    expect(loadAutonDraft()).toBeNull();

    store({ points: "nope" });
    expect(loadAutonDraft()).toBeNull();

    store({ points: [] });
    expect(loadAutonDraft()).toBeNull();

    // If the stored start point is unusable it gets dropped, which would silently
    // promote a path point into the start slot. Callers assume points[0] is the
    // locked start pose, so the whole draft is refused instead.
    store({ points: [{ id: "start", nx: "nowhere", ny: 0.5 }, { id: "a", nx: 0.2, ny: 0.2 }] });
    expect(loadAutonDraft()).toBeNull();
  });

  it("drops points with unusable coordinates", () => {
    store({ points: [startPoint, { id: "a", nx: "left", ny: 0.5 }, { id: "b", nx: 0.2, ny: 0.2 }] });

    const draft = loadAutonDraft();
    expect(draft?.points.map((point) => point.id)).toEqual([INITIAL_POINT_ID, "b"]);
  });

  it("clamps out-of-range coordinates into the field", () => {
    store({ points: [startPoint, { id: "a", nx: 4, ny: -2 }] });

    const draft = loadAutonDraft();
    expect(draft?.points[1].nx).toBe(1);
    expect(draft?.points[1].ny).toBe(0);
  });

  it("keeps the sequence and the point list consistent", () => {
    store({
      points: [startPoint, { id: "orphan", nx: 0.25, ny: 0.25 }],
      sequenceItems: [
        { id: "s1", kind: "path", pointId: "ghost" },
        { id: "s2", kind: "action", name: "GRAB", mode: "run", timeout: 2 },
        { id: "s3", kind: "bogus" },
      ],
    });

    const draft = loadAutonDraft();
    // The dangling path item and the unknown kind are dropped, and the point
    // that no sequence item referenced gets one appended.
    expect(draft?.sequenceItems).toHaveLength(2);
    expect(draft?.sequenceItems[0]).toMatchObject({ kind: "action", name: "GRAB" });
    expect(draft?.sequenceItems[1]).toMatchObject({ kind: "path", pointId: "orphan" });
  });

  it("strips unknown fields instead of passing them through to state", () => {
    store({
      points: [startPoint, { id: "a", nx: 0.3, ny: 0.3, evil: "<script>", headingMode: "sideways" }],
      sequenceItems: [],
    });

    const point = loadAutonDraft()?.points[1] as Record<string, unknown>;
    expect(point).not.toHaveProperty("evil");
    expect(point).not.toHaveProperty("headingMode");
  });

  it("always restores the start point as locked and correctly identified", () => {
    store({ points: [{ ...startPoint, id: "wrong-id", locked: false }, { id: "a", nx: 0.3, ny: 0.3 }] });

    const draft = loadAutonDraft();
    expect(draft?.points[0].id).toBe(INITIAL_POINT_ID);
    expect(draft?.points[0].locked).toBe(true);
  });

  it("does not throw when storage refuses the write", () => {
    Object.defineProperty(globalThis, "window", {
      value: {
        localStorage: {
          getItem: () => null,
          removeItem: () => {},
          setItem: () => {
            throw new Error("QuotaExceededError");
          },
        },
      },
      configurable: true,
      writable: true,
    });

    // A full quota must never interrupt editing.
    expect(() => saveAutonDraft({ points: [startPoint], sequenceItems: [] })).not.toThrow();
  });
});
