# Snake Game Implementation Plan

> **For agentic workers:** Execute each task with test-first changes and report the exact commit reviewed. The Orca coordinator assigns implementation, review, and tests to separate OpenCode worktrees.

**Goal:** Deliver selectable local single-player Snake and server-authoritative LAN multiplayer for 2-4 players.

**Architecture:** A Node HTTP/WebSocket process serves a plain JavaScript client. Shared pure rules run local solo ticks and authoritative server ticks. The lobby owns sessions and match phases; clients render snapshots and send direction intent.

**Tech Stack:** Node.js 20+, ES modules, `ws`, Node `node:test`, HTML/CSS/Canvas or DOM grid.

**Spec:** `docs/superpowers/specs/2026-09-12-snake-game-design.md`

## Global constraints

- Keep work in `snake-game-v2`; never edit or copy the earlier checkout.
- Single-player must not join a multiplayer lobby or open a WebSocket.
- Multiplayer supports 2, 3, and 4 players on one LAN; the server alone changes authoritative match state.
- Mobile direction controls are required.
- No custom QR encoder is needed; show the LAN URL at minimum.
- Implement disconnect, full-lobby, invalid-direction, and repeated-start behavior as defined by the spec.
- Every behavior change starts with a failing test, followed by the minimal implementation and a passing test.

---

### Task 1: Game rules

**Files:** Create `shared/game.js`, `test/game.test.js`, and the minimal `package.json` needed to run tests.

**Interface:** Export a pure game creation function, a direction validator, and one tick function. The state must expose board dimensions, snakes, food, phase, scores, and survivor/result data. Use one documented state shape for local and server callers.

- [ ] Write tests first for forward movement, food and growth, wall/self/body collisions, simultaneous head collision, vacated tail, and last-survivor or draw outcomes. For each case, assert the state after one tick rather than checking internal helpers.
- [ ] Run `npm test -- test/game.test.js` and record the expected failures from missing behavior.
- [ ] Implement the smallest pure rule functions to pass those tests, including safe deterministic spawn positions for four players.
- [ ] Run the game tests and commit the rule module and its tests.

### Task 2: Lobby and protocol

**Files:** Create `server/lobby.js`, `server/index.js`, `test/lobby.test.js`, `test/protocol.test.js`; update `package.json` and lockfile.

**Interface:** The lobby accepts join, start, direction, disconnect, and timed tick events. HTTP serves the app and a small public config containing the browser-reachable LAN URL. WebSocket messages use explicit `type` fields; snapshots contain the complete phase and public player state.

- [ ] Write tests for 2-4 joins, fifth/late rejection, name bounds, host transfer, host-only start, duplicate start, countdown, disconnect elimination, direction validation, and malformed/unknown messages.
- [ ] Run the relevant tests and confirm they fail for missing lobby/protocol behavior.
- [ ] Implement `ws` sessions with per-connection identities and server-owned game state; send snapshots on state changes and ticks. Keep messages bounded and never interpolate a name into HTML.
- [ ] Run all server tests and commit the server and protocol changes.

### Task 3: Browser flows

**Files:** Create `public/index.html`, `public/styles.css`, `public/app.js`, `public/single.js`, `public/multi.js`, and any small rendering module needed. Add a browser flow test if the chosen test tooling permits it.

**Interface:** Opening `/` shows a mode choice. Solo creates only local state. Multiplayer joins by name via WebSocket and renders lobby, countdown, match, and result. Both modes expose keyboard and touch direction controls.

- [ ] Write a failing browser or isolated client-state test for mode selection and solo restart; verify it fails before implementation. Add a multiplayer flow test for join/start/snapshot rendering where practical.
- [ ] Implement the page with responsive board, visible state text, accessible controls, score display, and LAN URL. Render names as text.
- [ ] Exercise both flows locally in a browser, including touch-sized controls and a narrow viewport; fix findings with a failing test when they represent behavior bugs.
- [ ] Run tests and commit client changes.

### Task 4: Documentation and final checks

**Files:** Create `README.md`; update tests and code only for verified gaps.

- [ ] Document Node setup, install, launch, controls, LAN URL joining, mobile controls, and test commands.
- [ ] Run `npm test` and any browser flow checks on the exact commit delivered to review and test agents.
- [ ] Give the coordinator the commit SHA, changed-file summary, command results, and any manual-check limitation.

### Independent acceptance on one revision

- [ ] Reviewer reports prioritized findings with file/line references and reproduction steps against A2's exact SHA.
- [ ] Tester executes meaningful automated and manual checks against the same SHA, without editing A2's worktree.
- [ ] Developer fixes blocking findings on a new SHA; reviewer and tester recheck that SHA.
- [ ] Coordinator integrates only the accepted revision and reports any unverified LAN-device check explicitly.
