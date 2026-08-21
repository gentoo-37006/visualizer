# Auton Visualizer

A path planner for FTC autonomous routines, made for FTC-37006 Gentoo's MyreLib
auton framework. Drag paths around the field, watch the routine play back
against your robot's own motion constants, and export it as Kotlin you can paste
straight into your auton.

## Running it

```bash
npm install
npm run dev
```

`npm test`, `npm run lint` and `npm run build` all have to pass before a push to
`main` deploys — see [.github/workflows/deploy-gcp.yml](.github/workflows/deploy-gcp.yml).

Everything is a single client-side page. Your work in progress, imported
constants and poses all live in the browser's local storage, and the app
installs as a PWA and keeps working offline once it has loaded.

## Planning a routine

The sidebar holds the sequence in the order the robot runs it.

- **Start Pose** is where the robot is placed on the field. Set X, Y and heading
  by hand, or pick one of the `START_` poses you imported.
- **Add Path** appends a path that ends at a new point, offset from the last one
  so it is there to grab. Drag the point or any of its control points on the
  field, or type exact coordinates into the card.
- **Control Points** bend a path into a spline. Order matters: they are the
  intermediate Bézier points, in the order listed.
- **Heading** picks how the robot is turned along the path — `Constant` holds one
  angle, `Linear` sweeps between two (optionally only across part of the path),
  and `Tangential` faces along the direction of travel, optionally reversed.
- **Path Actions** fire an action partway through a path, at a fraction `t` of
  the way along it.
- **Add Action** inserts an action between paths. `Run` blocks for its timeout,
  `Start` and `Stop` do not.
- Drag cards to reorder the sequence. Deleting is shift-click, so a stray click
  cannot throw away a routine; the trash button in the header clears everything
  the same way. Shift-clicking a path's eye hides every *other* path, which is
  the quickest way to look at one path on a crowded field.

## Reading the timing

Playback estimates the routine from a trapezoidal motion profile built out of
the robot constants, so the numbers are only as good as the constants you
imported.

- The bar under the field plays the whole routine and colours each segment to
  match the path it belongs to.
- FTC's autonomous period is 30 seconds. Run past it and the total turns red
  with the overrun beside it, and a marker appears on the track at the moment
  the period ends — whatever is right of that marker never happens in a match.
- Each path card shows what that path costs, including the turn onto its start
  heading, which is the fastest way to find what to trim.
- Points are positioned by the robot's centre, so a point can sit legally on a
  wall with half the robot inside it. When the footprint crosses a wall the
  robot turns red on the field and the path carries a warning triangle.

## Kotlin import and export

The three page buttons in the header each import a `.kt` file, and the export
button writes back whichever page you are on — the auton or the start poses.
Constants are read-only in the planner, so there is nothing to export there.

**Constants** reads the robot's `WIDTH` and `LENGTH` and the tuned
`xVelocity`, `yVelocity`, `forwardZeroPowerAcceleration` and
`lateralZeroPowerAcceleration` values. Until you import them the planner falls
back to typical FTC drivetrain numbers and says so on that page.

**Start Poses** reads every `val START_… = Pose(…)`, including ones written in
terms of `Constants.HALF_WIDTH` / `Constants.HALF_LENGTH`, and offers them as
presets. Exported poses are written back in that same half-dimension form.

**Auton** round-trips the routine itself. A point that lands on an imported pose
is written as `Poses.START_…` rather than raw coordinates, so the generated code
keeps referring to your constants:

```kotlin
val toBasket = Path(
    Poses.START_BASKET,
    Pose(28.8, -14.4),
).linearHeading(0.0, 90.0)

val toPark = Path(
    Pose(28.8, -14.4),
    Pose(0.0, 0.0),
    Pose(-28.8, 14.4),
).tangentHeading()

autonSequence(Alliance.RED)
    .followPath(
        toBasket
            .startAt(0.5, Actions.LIFT)
    )
    .run(Actions.SCORE, 1.5)
    .followPath(toPark)
```

Importing that same shape back reconstructs the points, the control points, the
heading modes, the action ordering and the alliance.

## Field images

The field defaults to the current season's image and can be switched by
double-clicking an empty part of the field. A custom image can be uploaded
there too — it is downscaled and stored locally, and stretched over the square
144 × 144 inch field the same way the built-in presets are.
