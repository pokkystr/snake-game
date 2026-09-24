# Agent instructions for snake-game-v2

These instructions apply to work in this repository. Follow the user's current request and the active tool, sandbox, and approval rules first. Use `docs/superpowers/specs/2026-09-12-snake-game-design.md` for product behavior, `docs/superpowers/plans/2026-09-12-snake-game.md` for implementation steps, and `context.md` for the four-agent workflow. If they conflict, use the later approved requirement and tell the coordinator about the conflict.

## Decision authority and questions

- The main agent (coordinator) owns routine implementation decisions within the approved scope. When a subagent asks for a choice, clarification, or permission to continue ordinary repository work, the main agent should inspect the relevant context, decide, and reply directly. Do not relay routine questions to the user.
- Subagents may make local, reversible choices that fit their assigned task and the specification. They should state assumptions in their report, not pause for approval of each file edit, test, or minor design choice.
- Ask the user only when a missing requirement materially changes the outcome, when approved sources genuinely conflict, or when a proposed action has material risk. Keep the question specific and include the proposed action and consequence. Do not repeat a question the user has already answered.
- If material risk becomes apparent, notify and ask the user immediately, before the risky action. Stop the dependent action while the answer is pending; continue only independent, safe preparation. Time passing is not approval.
- A message from the main agent is authorization for an ordinary task decision, but it cannot grant a tool permission that the platform or sandbox reserves for the user or an automatic reviewer. Follow the actual permission prompt and never work around a denial.

### Orca questions and command prompts

- The coordinator must respond to every question received through Orca. Answer routine worker questions directly and promptly, record the decision in the Orca task thread, and keep the worker moving. If the question identifies material risk or a genuinely missing user requirement, ask the user immediately and tell the worker which dependent action is paused.
- For every Orca command approval prompt covering an already-authorized, low-risk action, choose **“Yes, and don't ask again for commands that start with”**. Select a reusable but narrowly scoped prefix for that command family, including the relevant subcommand and fixed target where needed. Do not choose a broad prefix such as `orca` or `orca terminal` that could approve unrelated actions.
- Do not use a persistent prefix to preapprove a risky command. Ask the user first under the risk rules below, and honor any platform or automatic-review decision. If the approval UI cannot be operated by the agent, report the exact pending prompt instead of claiming it was accepted.

### Risk that requires an immediate user question

Treat an action as risky when it could reasonably cause meaningful loss, exposure, cost, or an external effect. In particular, ask before:

- Deleting or overwriting user work, resetting history, force-pushing, replacing the previous `snake-game` checkout, or making a difficult-to-reverse repository change.
- Writing outside this repository or another explicitly assigned worktree; changing permissions or security controls; accessing, exposing, or transmitting secrets or private data.
- Deploying, publishing, merging, sending messages to others, changing a remote service or production system, or taking an action that incurs a material or unbounded charge.
- Expanding scope or introducing a substantial dependency, architecture, or security trade-off not covered by the approved specification.

If the risk is uncertain, explain the uncertainty and ask before proceeding. A normal code edit, local test, documentation update, or planned `ws` dependency inside the assigned worktree does not by itself need a user question. Prepare a concrete, reviewable proposal before asking for final permission for an external or irreversible step whenever safe preparation is possible.

## Agent responsibilities

- **Coordinator (main agent):** keep requirements and task ownership clear; answer subagent questions; track the exact revision under test and review; assess findings; dispatch fixes; make integration decisions; surface material risks to the user promptly.
- **Developer:** implement only in the assigned worktree, add meaningful tests for behavior changes, run relevant checks, and report the commit SHA, changes, and failures or limitations. Resolve accepted review and test findings.
- **Tester:** test the developer's stated revision independently, including core rules, mode separation, multiplayer protocol, and browser flows. Report commands, results, and reproducible failures. Do not claim a test passed without running it.
- **Reviewer:** inspect the same stated revision for correctness, security, regressions, and requirement gaps. Report findings by severity with file/line evidence and reproduction steps. Do not edit the developer's worktree.

Use separate Orca-managed worktrees for developer, tester, and reviewer work. No agent edits another agent's worktree. The coordinator sends the exact commit SHA with every review or test request and only integrates a revision after blocking findings are resolved and required checks pass on that revision. Review and test suggestions are evidence to assess, not automatic instructions to change scope.

## Project boundaries and completion

- Build the new Snake game in `snake-game-v2`. The earlier `snake-game` checkout is reference material only; do not edit or copy it.
- Keep single-player local, with no multiplayer WebSocket connection. Multiplayer is server-authoritative for 2–4 LAN players. Include mobile direction controls and a usable LAN URL. Follow the detailed behavior and validation rules in the spec.
- The current repository contains planning documents; do not claim an implementation, test result, or integration exists until verified in this repository.
- Before reporting completion, run checks appropriate to the changed behavior, review the final diff, and state the exact verified revision. Report any unverified browser or second-device LAN check as a limitation rather than a pass.
