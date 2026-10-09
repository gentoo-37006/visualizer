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
- **Add Path** appends a path that ends at a new point, starting where the
  previous one is until you place it. Type exact coordinates into the card, or
  drag it on the field — a new point sits exactly on the one before it, and the
  newer of the two is the one on top that takes the drag.
- **Segments** divide a `Path` into uninterrupted curves. Each path starts with
  one segment, and its last segment defines the path endpoint. Segments can be
  reordered and the robot only stops after the final one.
- **Segment type** is selected separately for every segment. `Linear` connects
  its start and end directly; `Spline` exposes two local cubic Bézier handles.
  At a spline-to-spline join the handles mirror each other. At a linear-to-spline
  join, the spline handle is fixed to the linear tangent, preserving C1 continuity.
- **Heading** picks how the robot is turned along the path — `Constant` holds one
  angle, `Linear` sweeps between two (optionally only across part of the path),
  and `Tangential` faces along the direction of travel, optionally reversed.
- **Path Actions** fire an action partway through a path, at a fraction `t` of
  the way along it.
- **Add Action** inserts an action between paths. `Run` blocks for its timeout;
  `Submit` and `Remove` do not.
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

The three page buttons in the header each import a `.kt` file. Export only
applies to the auton: constants and start poses are things the planner reads
from your codebase, not things it writes back, so the button is disabled on
those pages.

**Constants** reads the robot's `WIDTH` and `LENGTH` and the tuned
`xVelocity`, `yVelocity`, `forwardZeroPowerAcceleration` and
`lateralZeroPowerAcceleration` values. Until you import them the planner falls
back to typical FTC drivetrain numbers and says so on that page.

**Start Poses** reads every `val START_… = Pose(…)`, including ones written in
terms of `Constants.HALF_WIDTH` / `Constants.HALF_LENGTH`, and offers them as
presets for the start pose.

**Auton** round-trips the routine itself. A point that lands on an imported pose
is written as `Poses.START_…` rather than raw coordinates, so the generated code
keeps referring to your constants:

```kotlin
val toBasket = Path(
    Spline(
        Poses.START_BASKET,
        Pose(9.6, -4.8),
        Pose(19.2, -9.6),
        Pose(28.8, -14.4),
    ),
).linearHeading(0.0, 90.0)

val toPark = Path(
    Linear(
        Pose(28.8, -14.4),
        Pose(0.0, 0.0),
    ),
    Spline(
        Pose(0.0, 0.0),
        Pose(-9.6, 4.8),
        Pose(-19.2, 9.6),
        Pose(-28.8, 14.4),
    ),
).tangentHeading()

autonSequence(Alliance.RED)
    .path(
        toBasket
            .submitAt(0.5, Actions.LIFT)
    )
    .run(Actions.SCORE, 1.5)
    .path(toPark)
```

Importing that same shape back reconstructs the paths, their segments, the
heading modes, the action ordering and the alliance.

Each `Path` is one uninterrupted pathchain containing one or more `Linear` or
`Spline` curves. A `Linear` has its start and end pose. A cubic `Spline` has its
start, two local control poses and its end. Consecutive curves share an endpoint,
and the robot does not stop between them.

## Field images

The field defaults to the current season's image and can be switched by
double-clicking an empty part of the field. A custom image can be uploaded
there too — it is downscaled and stored locally, and stretched over the square
144 × 144 inch field the same way the built-in presets are.

## Live tracker

The planner and tracker share the React components in `src/field`: the viewport,
robot footprint, path curves, and movement trail. These components accept field
coordinates in inches and headings in degrees clockwise from +y. They have no
Next.js, telemetry, or simulation dependencies. Planner editing handles remain
in `PlannerHandles`; the tracker owns its polling and connection state separately.

Build the standalone tracker, including React, CSS, field images, and the robot
image, with:

```bash
npm ci
npm run build:tracker
```

The output is `dist/tracker`. To update the version packaged in the sibling
robot project:

```bash
npm run build:tracker -- ../biobuzz-2027/myrelib/src/main/assets/field-viewer
```

After a full `yb push teamcode`, connect to the Control Hub's Wi-Fi and open
`http://192.168.43.1:8080/visualizer/`. The Hub serves every asset locally; the page
does not need internet access, Next.js, or ADB. Robot-code changes can continue
to use Sloth after that initial installation. Viewer/bridge changes need another
full install. The `/visualizer` route renders the same tracker in the development app;
it expects a same-origin `/yb/pose` feed.

The robot-side implementation, bundled assets, and tests belong to `myrelib`.
Its stable web-handler namespace stays outside the hot-swapped framework
namespace. `BaseRobot` owns feed sessions and `MotionController` publishes poses.

The read-only `/yb/pose` endpoint returns version-1 snapshots with a session ID,
sequence number, active flag, opmode name, sample age in milliseconds, nullable
`{x, y, heading}` pose, and nullable `{width, length}` robot dimensions. The
viewer polls without overlapping requests at up to 20 Hz, keeps at most 30
seconds/600 trail samples, and resets the trail when a new opmode starts.
It distinguishes idle, unavailable, stale, disconnected, and paused feeds.
Live tracking displays the robot's localization estimate; it does not update
localization or command movement. All tracker responses bypass browser caching.
