# Fresh Build Context: Snake Game with Four Orca Agents

Status: Proposed plan; no new agents or worktrees have been started by this document.
Updated: 2026-09-12 (Asia/Bangkok)

## Assumptions and objective

This plan assumes "build from scratch" means a new Snake Game implementation, using the current project's product goals as requirements but not copying its implementation or overwriting its working tree. The fourth agent is Codex, acting as coordinator. The other three agents use OpenCode.

Deliver a playable single-player Snake game and a LAN multiplayer game for up to four players. The product must present a mode choice before starting either path.

## Required behavior

- Single-player starts locally without joining a multiplayer lobby. The player can steer, score, lose, and restart.
- Multiplayer allows 2-4 players on the same LAN to enter names and join a lobby. The host starts a match after at least two players join.
- Multiplayer has a visible countdown, server-authoritative movement and collisions, elimination on wall or snake collision, and a clear last-survivor result.
- Players can reach the host through a LAN URL; a QR code may be provided using a maintained library rather than a new custom encoder.
- Both modes have usable keyboard controls and a layout that works on desktop and mobile. Mobile controls should be included if mobile play is a requirement rather than merely mobile viewing.
- Disconnects, full lobbies, invalid direction changes, and repeated start requests must have defined behavior.

## Agent assignments

| Agent | Runtime | Ownership | Deliverable |
| --- | --- | --- | --- |
| A1: Coordinator | Codex | Freeze requirements, create the task plan, dispatch work in Orca, track the exact revision under review, integrate accepted changes, and report status to the user. | Scope, acceptance criteria, task state, integration decision, final handoff. |
| A2: Developer | OpenCode | Implement the game, server, client, mode selection, and minimal project scripts in an isolated worktree. Resolve accepted findings. | Working implementation and a concise change report. |
| A3: Reviewer | OpenCode | Review A2's exact revision for correctness, security, regressions, and requirement gaps. Do not edit A2's worktree. | Findings ordered by severity with file/line references and reproduction steps. |
| A4: Tester | OpenCode | Build meaningful automated and manual checks against the same revision A3 reviews. Keep test edits in a separate worktree. | Test cases, results, failures, and reproduction steps. |

## Orca workflow

1. A1 creates a fresh Orca-managed repository or clean baseline, then gives A2, A3, and A4 separate worktrees. No agent writes into another agent's worktree.
2. A1 gives all agents the same requirements and acceptance criteria. A3 and A4 may prepare review and test checklists while A2 implements.
3. A2 delivers a specific revision and a short summary. A1 records that revision and dispatches it to A3 and A4 in parallel through Orca.
4. A3 reports findings; A4 reports test results. A1 deduplicates issues and sends actionable fixes to A2 with priority and evidence.
5. A2 delivers a new revision. A3 and A4 recheck changed behavior and affected cases against that new revision. Repeat until blocking findings are resolved.
6. A1 integrates only the accepted revision and reports what works, what was checked, and any remaining risks.

Use Orca's structured task and message flow for assignments, questions, and completion reports. Record the revision identifier in every review and test request so reports cannot silently refer to different code. A1 is the only agent that changes scope or declares a release ready.

## Definition of done

- Both modes can be selected and played end to end.
- Multiplayer behavior matches the server-authoritative rules and works with 2, 3, and 4 players.
- Automated checks cover core game rules, the mode boundary, and multiplayer protocol behavior; manual checks cover the user flow and LAN access where available.
- A3 has no unresolved blocking findings, and A4's required checks pass on the same final revision.
- The README explains setup, launch, controls, LAN joining, and test commands.

## Open decisions before implementation

- Confirm whether mobile devices must be able to control the snake or only display the game.
- Confirm the desired visual direction and whether the new build should retain any assets or UI from the current project.
- Confirm whether the final result should replace the current `snake-game` checkout or stay as a separate project until accepted. The safe default is separate until accepted.

## Relation to the current project

The existing implementation and its agent history are summarized in `context.md`. Treat that file as reference material only. Its reported integration result and known QR encoder failure are not evidence that a fresh build has passed any checks.
