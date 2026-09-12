# Snake Arena

Single-player Snake plus server-authoritative LAN multiplayer for 2-4 players,
built from scratch for `snake-game-v2`. One Node process hosts the web client
and the multiplayer WebSocket server. No client build step; `ws` is the only
runtime dependency.

## Requirements

- Node.js 20 or newer (developed and tested on Node 26)
- Any modern desktop or mobile browser

## Setup and launch

```sh
npm install
npm start
```

The server binds `0.0.0.0:3000` by default and prints its local and LAN URLs:

```
Local:   http://localhost:3000
LAN:     http://192.168.x.x:3000
```

Environment overrides: `PORT`, `SNAKE_COUNTDOWN_MS` (default 3000),
`SNAKE_TICK_MS` (default 150). The countdown override applies to LAN matches;
single-player always uses a three-second countdown.

## Modes and controls

Opening the page shows a mode choice.

**Single player** runs entirely in the browser; it never contacts the
multiplayer server. A visible 3-2-1 countdown starts each game and restart,
with no movement before it ends. Steer with arrow keys or WASD, or the centered
Game Boy-style d-pad on touch devices. Eat food to score and grow; hitting a
wall or a snake body ends the game. Restart returns to a fresh board without a
page refresh.

**LAN multiplayer**: every player opens the host's LAN URL on a device on the
same network, enters a name, and joins the lobby. The first player is the host.
The host presses Start once at least two players have joined (cap: 4). A
visible three-second countdown precedes movement. The server owns all ticks,
food, scores, levels, speed, and collisions; clients only send direction intent. Elimination
comes from walls, any snake body (including dead snakes), and simultaneous
head-to-head collisions. The last surviving snake wins; a mutual wipeout is a
draw. Disconnected players are removed from the lobby or eliminated from the
match; host ownership transfers to the earliest connected member. After a
result, the host can start a rematch with a reset game state.

Keyboard (arrows/WASD) works after starting without needing mouse focus, and
both modes include large touch d-pad controls that keep working on narrow
viewports. The multi screen displays the LAN join URLs fetched from `/config`.
QR codes are not generated; the URL is the supported join method.

Both modes start at **Lv 1**, moving every **150 ms**. Every three foods eaten
in the current game raises Lv and shortens the movement interval by 10 ms. The
speed caps at 70 ms (Lv 9). In LAN matches, all players share the level: the
server sums every snake's score and broadcasts the authoritative level and
speed. Restart or rematch resets both. The board highlights food and snake
heads; countdown and level-up animations honor the device's reduced-motion
setting. When `SNAKE_TICK_MS` is overridden, the level curve starts at that
interval and does not raise a level without an actual speed increase.

## Protocol summary

All WebSocket traffic goes to `/ws` as small JSON messages with a `type`
field (2 KB payload cap). Client-to-server: `join {name}`, `start`,
`direction {dir}`, `leave`. Server-to-client: `welcome {playerId, hostId}`,
`state {phase, hostId, players, countdownRemainingMs, game, result}`, and
bounded `error {code}` messages. Malformed JSON answers `malformed`, unknown
types answer `unknown_type`, and pre-join intent answers `not_joined`.
Rejections close the socket with a clear reason: full lobby (`lobby_full`,
4002), joining during countdown/play (`match_in_progress`, 4001). Names are
trimmed, capped at 20 characters, never trusted as identity, and rendered as
text only. Player identity, position, and score are server-issued; clients
cannot set them. Only the host's start takes effect; repeated starts during
countdown or play do nothing. The serialized `game` state includes `level` and
`tickMs`.

## Tests

```sh
npm test
```

- `test/game.test.js` - pure rules: movement, food/growth, wall/self/body
  collisions, simultaneous head-to-head, vacated-tail timing, last survivor,
  draws, reversal rejection, tick purity.
- `test/lobby.test.js` - joins and capacity, name rules, host election and
  transfer, host-only and idempotent start, countdown, per-tick direction cap,
  disconnect elimination, rematch reset.
- `test/protocol.test.js` - the real server over WebSocket: welcome/lobby
  handshake, full countdown-to-elimination match, late/fifth join rejection
  with close codes, malformed and unknown messages.
- `test/server.test.js` - static file whitelist, traversal rejection, and the
  `/config` LAN URL.
- `test/client.test.js` - DOM-free client logic: keyboard map, screen routing,
  solo play/restart with no WebSocket use, multiplayer client state handling,
  canvas rendering.
- `test/progression.test.js` - food thresholds, level cap, shared LAN scores,
  and custom tick intervals.
- `test/solo-countdown.test.js` - deterministic three-second countdown, restart,
  and timer rescheduling after a level-up.

## Known limitations

- Browser flow and visual checks can be done through Orca's embedded browser.
  A second physical device on the LAN is still needed to verify cross-device
  reachability.
- Cross-device LAN play depends on host firewall rules permitting inbound
  TCP on the chosen port.
