# Snake Game Design

## Scope

Build a new, self-contained Snake game in this `snake-game-v2` repository. The current `snake-game` checkout is reference material only and must not be edited or copied. `context.md` supplies the product requirements and four-agent review workflow. The user has asked to implement it.

The unresolved decisions in `context.md` use these defaults: phones must be playable with on-screen direction controls; use a new, clean arcade visual style with no inherited assets; keep this repository separate from the prior checkout.

## Architecture

Use one Node.js process for static HTTP hosting and the multiplayer WebSocket server. Use plain browser JavaScript modules and CSS so there is no client build step. A small shared, pure game-rules module drives both local single-player ticks and server multiplayer ticks. `ws` is the only required runtime dependency. A QR code is optional; the app must display a usable LAN URL.

The page opens at mode selection. Single-player starts an in-browser game without a WebSocket connection. Multiplayer asks for a player name, connects to the current host URL, and shows a lobby. The first player is lobby host. The host can start once 2-4 players have joined. The server owns ticks, food, scores, collisions, elimination, countdown, and final result. Clients send only directional intent. State snapshots are broadcast after each authoritative tick.

## Rules and protocol

The board is a fixed grid; starting snakes have separate, safe spawn points. Single-player earns one point per food, dies at a wall or its own body, and can restart without refreshing. Multiplayer starts with a visible three-second countdown; no movement occurs before it ends. The last surviving snake wins. Simultaneous head-to-head collision eliminates all involved snakes. If all remaining snakes die in the same tick, show a draw. Moving into a cell vacated by a tail on that tick is allowed only when the tail actually moves; growth keeps its tail occupied.

Each WebSocket session is one player. Names are trimmed, limited to 20 visible characters, and escaped by rendering as text. Joins during countdown or play, and a fifth lobby member, receive a clear rejection. Only the current lobby host can start. Duplicate starts during countdown or play have no effect. At most one direction change per player per tick is accepted, and a reversal into the neck is rejected. Disconnect removes a lobby member or eliminates an active player. If the host disconnects, host ownership transfers to the earliest connected member. A match ending leaves connected users able to return to a lobby for a rematch; the server resets game state before the next start.

Messages are small JSON objects with explicit `type` fields; malformed or unknown messages are ignored or answered with a bounded error. The server validates every message and does not trust client-provided position, score, or identity. Serve only known static files from `public` and shared modules. Bind to `0.0.0.0` by default and print a local URL plus detected LAN URLs at startup. The UI displays the LAN join URL.

## UX and accessibility

Desktop supports arrow keys and WASD. Mobile uses large on-screen direction buttons with touch-friendly spacing. Mode selection, lobby, countdown, score, elimination, result, restart, and disconnection are visible states. The canvas or grid scales to narrow screens without hiding controls. Controls and status text have accessible labels; keyboard play must not depend on mouse focus after starting.

## Verification

Node's built-in test runner covers pure movement, scoring, reversal, growth/tail behavior, simultaneous collisions, lobby capacity/host transfer/start idempotence, and protocol validation. A browser flow check covers mode choice, local play/restart, and a 2-player lobby. Manual LAN access is checked where a second device is available; otherwise document the limitation. The reviewer and tester examine the same recorded commit, and only the accepted revision is integrated.

## 2026-09-13 approved feature addition

Both single-player start and restart show a visible 3-2-1 countdown and do not
move the snake before it ends. LAN keeps its server-authoritative three-second
countdown and receives the same prominent visual treatment. Both modes show
the current Lv. Every three foods eaten in a match increase speed and Lv: the
default movement interval starts at 150 ms, falls by 10 ms per level, and stops
at 70 ms/Lv 9. Single-player counts its own food; LAN uses the sum of all
players' scores, with the server controlling and broadcasting the interval.
Restart and rematch reset progression. Non-default test/server intervals remain
valid and never gain a level without a real speed increase.

Refresh the arcade effects for food, snake heads, countdown, and level changes.
Honor reduced-motion preference. Center the on-screen direction controls below
the board as a touch-friendly, Game Boy-style cross-shaped D-pad on desktop and
mobile, retaining accessible button labels.
