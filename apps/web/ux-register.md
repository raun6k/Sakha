# Sakha UI/UX issue register

Source: application-wide assessment, 11 October 2026. Screenshots were representative, so each row names the recurring pattern and the concrete place it shows up in this checkout. Safeguards stay visible: uncertainty, evidence, consent, and the split between a proposal, an approval, and confirmed work.

Pinned visual system stays: evergreen sidebar, ivory canvas, serif headings, panorama greeting, seven Home sections, four primary destinations.

## Issues and solutions

| ID | Issue | Where it shows up | Solution |
| --- | --- | --- | --- |
| UX-01 | Pages open with a slogan instead of a job. A second banner repeats a motto under a heading that already explains the page. | `Banner` in `ui.tsx` (“Recorded context. Thoughtful decisions.”) on Agents, Ask, Farm, Plan, Alerts, Insights, Settings, Help, and each workspace. Home hero: “Healthier farms begin with clearer decisions.” Sidebar: “One farm. A clearer way forward.” | Remove the decorative banner. Keep one purpose sentence in the page heading. Home greeting stays; the line under it states the task. Sidebar keeps only the pause notice. |
| UX-02 | Primary, supporting, and technical content share the same visual weight. | Chart footers list unit, geography, resolution, completeness, baseline, and freshness status together (`evidence.tsx`). Plan cards lead with “revision {version}”. Alert rows lead with `role_key` and raw status. | Show the result and its limit first. Move resolution, coverage, baseline, and record version into a disclosure. |
| UX-03 | The same introduction, specialist list, and cross-links repeat down the page. | Home shows four specialist summaries and then nine specialist cards. Workspace and Ask rails repeat Plan, Insights, and Settings, which are already in the sidebar. | Compact Home specialist cards to a name and an action. Drop the extra rail links. Keep farm context, which is the summary people need beside a conversation. |
| UX-04 | Labels describe the implementation. | Buttons say “Source C01”. Help and consent say “A0”. Badges say `enabled`, `active`, `plan_proposal`. Alert copy says “an unavailable feed does not establish an all clear.” | Use the source’s name, “Ask Sakha”, and farmer-facing status words. Keep the safety meaning in plain language. Catalog IDs remain in the source dialog. |
| UX-05 | The directory asks people to pick a feature before they know the outcome. | Agents heading counts roles. Home specialist grid is a catalog. | Headings name the task: choose a specialist for a question, or ask Sakha for one view. Chat stays the default workspace tab. |
| UX-06 | Related work is split, and farm facts are asked for again. | Context already exists in My Farm and is summarized in the conversation rail. | Leave the summary in the rail with a link to the full record. Do not add a second full profile. Scenario tools on Chat stay behind the existing disclosure. |
| UX-07 | Results, limits, and system status read like diagnostics. | Empty alerts, chart gaps, and capability reasons. | Say what happened and what is still unknown. A missing alert is not an all-clear. A failed calculation stays unavailable. Consent and “does not record work” sentences stay in the dialogs tests already check. |

## Page purpose after this pass

| Page | Primary job |
| --- | --- |
| Home | See what needs a decision, then ask. |
| Ask Sakha | Ask one coordinated question. |
| Agents | Choose who should answer a kind of question. |
| Specialist | Ask, then open about, preferences, or history. |
| My Farm | Read and correct recorded facts. |
| Plan | Review a proposal, or see the plan you already approved. |
| Alerts | Read a warning and choose a next step. |
| Insights | Read rainfall and climate evidence, including its limits. |
| Activity | Tell suggestions, decisions, and completed work apart. |
| Settings | Control language, motion, consent, export, and deletion. |
| Help | Learn the limits, then open a source. |

## Plan

1. Shared language in `apps/web/src/services/labels.ts` for freshness, capability, alert status, record kind, role, and origin.
2. Remove decorative `Banner`s. Rewrite the purpose line where the old slogan was the only orientation.
3. Progressive disclosure for chart method, evidence buttons, specialist source IDs, and plan version.
4. Quiet the repeated specialist catalog and the repeated rail links.
5. Check the changed screens in the browser, then run the focused web tests that assert headings, tabs, and safeguard sentences.

## Explicitly unchanged

Seven Home sections, sidebar and mobile navigation, panorama, proposal/approval/completed-work separation, English-only UI, and source or model capability gates. Voice, photo analysis, and live market quotes stay unavailable rather than looking finished.
