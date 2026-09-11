# Split Point — build brief for `crypto-lab-split-point`

Save this file as `brief.md` at the root of `crypto-lab-split-point`. The binding spec is the copy of `_MASTER-TEMPLATE.md` in this repo (status 2026-08-02); this brief supplies only the demo-specific facts. Where the two touch, the template wins; where the template and the catalog `CLAUDE.md` touch, `CLAUDE.md` wins. If `audits/kickoff.md` is also present in this repo, it may be used instead of the prompt below — it reads `./brief.md` itself.

## Kickoff prompt — paste this, with the template in the repo

```text
Build a new Crypto Lab browser demo (Vite + TypeScript, static site, no backend).

Read _MASTER-TEMPLATE.md (copied into this repo — check audits/ and the repo root) in
full and treat it as the BINDING spec. Build to every standard in it, in this order:

  1. §1 Build — real crypto only (WebCrypto or a named, justified library; hand-roll
     the inspectable teaching parts; NEVER simulate or fake math). Runnable tests that
     actually pass, including spec KATs (state the count). Mount content at id="app";
     define --accent on :root.
  2. §3 Look — add the standard top bar (copy the header from any existing lab and
     adapt it) and the standardized hero (short-name <h1> + spec subtitle + "Why it
     matters" box beside it; title size capped at clamp(1.6rem,3.8vw,2.7rem)); theme
     contract; scripture footer; head/favicon. Do NOT invent a new header design and do
     NOT add a theme toggle — match the fleet's cl-topbar.
  3. §2 Teach — SHOW the one headline mechanism (animate/step it, never assert it in
     prose or raw hex); add a plain-language "what is this / why it matters" intro and a
     break-it-yourself interaction against the real crypto; no decorative/idle animation;
     pitch to a college newcomer while rewarding an expert (progressive disclosure).
  4. §4 Accessibility — wire the WCAG 2.1 AA gate and author to its checklist.
     `npm run build` then `npm run test:a11y` MUST pass with zero violations.
  5. §5 README (the standard sections) and §6 Deploy (Actions-based Pages, a11y-gated).
  6. §6.1 + §6.2 Dependency automation — REQUIRED, not optional. Ship
     .github/dependabot.yml with the grouped config, add the dependabot-auto-merge job
     to whichever workflow runs the gate on pull_request, and have that job dispatch the
     deploy after it merges. Also: the workflow must trigger on pull_request as well as
     push, the deploy job must be gated to `github.event_name != 'pull_request'`, the concurrency
     group must include ${{ github.ref }}, and the deploy workflow must accept
     workflow_dispatch. Omitting any of these is how a lab starts opening one pull request
     per dependency with no CI signal on any of them.

Hard rules: do NOT dumb down the crypto to make a visual simpler; honest scoping in-page
and in the README ("not production", what's real vs simulated, what it does NOT prove).
Do NOT weaken a gate to get a green run — no skipped tests, no lowered coverage threshold,
no disabled lint rule, no re-recorded a11y baseline, no continue-on-error. If a bump or a
change cannot pass honestly, leave it failing and say so.
When done, report a one-line summary with the test count, and confirm all four of
grouping / auto-merge / PR gate / workflow_dispatch are present.

The rest of ./brief.md — the §1 sections, hero copy, claims suite, negative claim,
pre-build verification and citations below the DEMO BRIEF — is part of this brief.
Read it in full before building; run its pre-build checks first and report them.

DEMO BRIEF:
NEW DEMO BRIEF
- Repo name:         crypto-lab-split-point
- Short name (H1):   Split Point
- Subtitle:          Function secret sharing · distributed point function · 2-server PIR
- One-liner:         Builds a Boyle–Gilboa–Ishai distributed point function whose two keys each look random yet evaluate to shares of a single 1 at a secret index, then uses it to fetch one record from a 65,536-record shelf with keys of a few hundred bytes instead of a 65,536-bit query.
- Concept to teach:  You can secret-share a function, not just a value. Two random-looking keys evaluate to shares of "1 at α, 0 elsewhere", so two servers can each fold the whole shelf against their share, neither learns α, and the key grows with log N, not N.
- Primitives/spec:   Tree-based DPF with early termination from Boyle, Gilboa, Ishai, "Function Secret Sharing: Improvements and Extensions", ACM CCS 2016; DPF definition and the PIR application from Gilboa & Ishai, "Distributed Point Functions and Their Applications", EUROCRYPT 2014 and Boyle, Gilboa, Ishai, "Function Secret Sharing", EUROCRYPT 2015; PRG from AES-128 (fixed-key Matyas–Meyer–Oseas or AES-CTR via WebCrypto — name the choice and why); 2-server XOR PIR baseline from Chor, Goldreich, Kushilevitz, Sudan, FOCS 1995 (as cited by Oblivious Shelf).
- Accent (--accent): #4CC9F0
- Favicon emoji:     📍
- In scope:          DPF Gen / Eval for domains 2^4 … 2^16 with the tree drawn at small sizes (seed, control bit and correction word per level, both keys side by side); full-domain EvalAll for the PIR; 2-server PIR: client Gen(α) → k0, k1; each server computes the XOR of records where its share evaluates to 1; client XORs the two answers; compute-both-sides against shelf[α]. A size meter measured on serialized keys: DPF key bytes versus the Chor query bits versus N, as N is stepped. Break-it-yourself: collusion toggle (one server holds both keys, evaluates both, XORs, and α lights up in its own view); tamper toggle (one server flips a bit in its answer).
- Non-goals:         Three or more servers; multi-point, interval and comparison FSS; incremental DPF / Poplar-style prefix counting (say on the page that the VDAF draft's IDPF is a different construction); verifiable DPF; malicious-secure PIR; query batching; single-server PIR (cross-link Shelf Oracle).
```

## Rules this brief follows — keep them while building

This brief asserts no counts about the catalog. Every "the catalog has / lacks X" sentence is written as a grep to run, because the author could not run it. Run each pre-build check and report the result before writing code. If a grep shows the headline mechanism is already taught by a live card, stop and report; do not build a duplicate.

In addition to this lab's own sections below:

1. Port: `grep -rhoE "localhost:[0-9]+" ../crypto-lab-*/playwright.config.ts | sort -u`, pick an unused port in 4600–4700, commit it (template §4.1). Never the Vite default 4173.
2. Accessibility gate: copy `e2e/gate.ts`, `contrast.ts`, `nontext.ts`, `nontext-baseline.ts`, `a11y.spec.ts` from `crypto-lab-schnorr-forge` and rewrite every lab-specific passage (§4.1). Do not copy the gate from any other lab.
3. Claims suite in `e2e/claims.spec.ts` (§4.1b), mutation discipline (§4.1c), and the negative claim with its evidence fixture (§4.1d). The twin-verdict wording in this brief is a shape, not a string to hard-code.
4. README per §5; deploy per §6 with `.github/dependabot.yml`, the auto-merge job, the deploy dispatch, `timeout-minutes` on the job, `LICENSE`, `.gitignore`.
5. After the lab is live: the catalog card, then the five checkers run from the catalog repo (`readme-sync`, `corpus-sync`, `concept-sync`, `theme-sync`, `fleet-sync`). That step is done in `crypto-lab/`, not here; do not edit shared catalog files from this repo.
6. Category placement below is a proposal. Check the live chip list and section list before adding a chip; if a proposed chip does not exist, report the resulting chip-bar split rather than creating it silently. If the catalog keeps a concept-coverage document, the new concept boundary is added there in the same commit as the card.
7. Each non-goal in the SCOPE list gets its one-line "what this isn't" note in the UI (§1).
8. No emoji anywhere in content; the favicon data-URI is the only sanctioned use.
9. Every hard citation below was checked against its primary source on 2026-09-10 except where marked "verify" — resolve those before the README cites them. Do not cite anything the README cannot link.

**Accent.** This lab's `--accent` is ``#4CC9F0``, assigned centrally for the seven-lab batch of 2026-09-10. The other six batch accents are reserved — do not use them:

| Lab | Repo | `--accent` |
|---|---|---|
| Hidden Bit | crypto-lab-hidden-bit | ``#E4572E`` |
| Privacy Pass | crypto-lab-privacy-pass | ``#F2C14E`` |
| Order Leak | crypto-lab-order-leak | ``#A06CD5`` |
| Proof Tally | crypto-lab-proof-tally | ``#7BE495`` |
| PQXDH Wire | crypto-lab-pqxdh-wire | ``#FF7EB6`` |
| Fold Gate | crypto-lab-fold-gate | ``#5E7CE2`` |

If `theme-sync` reports an adjacent-card collision after the card is placed, change this lab's accent, never the neighbour's, and record the change in the batch document.

## Hero

- Title: `Split Point`
- Subtitle: `Function secret sharing · DPF · 2-server PIR`
- Description: Watch two random-looking key trees unfold level by level, XOR their leaves into a single lit point, and use that point to pull one book off a 65,536-book shelf with a query smaller than one page.
- Why it matters: Two-server PIR was already private; it was also a query as long as the whole catalog. Function secret sharing is what made "which record did you read" hideable at the size of real collections, and it is the building block the CFRG's private-measurement work reaches for.

## §1 sections

**SCOPE** — as in the brief.

**SECURITY / CORRECTNESS INVARIANTS**
1. Correctness: for random α at every supported domain size, EvalAll(k0) XOR EvalAll(k1) equals the unit vector at α (property test).
2. Each server module receives exactly one key; a test asserts the server function's inputs.
3. Sizes on the meter are measured on serialized keys; the page also shows the formula and a claims test asserts the two agree.
4. No test vectors are invented. Search for published KATs for this exact DPF variant before building; if none is found, say so on the page and in Build & Verify, and rely on the property test plus an independent re-derivation (a naive O(N) sharing of the point function compared leaf by leaf).
5. Collusion and tamper modes never default; both marked BROKEN with their "what this isn't" lines.
6. Fail-closed: α outside the domain, a wrong-length server answer, and a malformed key are rejected with the cause named.

**ARCHITECTURE** — `src/dpf/{prg,gen,eval,serialize}.ts`, `src/pir/{server,client}.ts`, `src/attack/{collude,tamper}.ts`, `src/ui/`.

**UI** — Central metaphor: two trees and a third row. k0 and k1 unfold from their roots side by side, each leaf row random-looking; beneath them a third row is the XOR, with exactly one lit leaf. A slider moves α and the lit leaf follows while both trees above stay noise. "Fetch" runs the PIR: each server's XOR-fold animates across the shelf, the client XORs the two answers, the record appears and is compared with shelf[α]. The size meter steps N. Collusion and tamper toggles.

**VISUAL SEMANTICS** — The lit leaf is the mechanism and appears only in the XOR row — except in collusion mode, where it appears inside a server's own view with ALARM styling ("SERVER SEES α"). Tamper mode: the retrieved record renders ALARM with the twin verdict "RETRIEVED — AND WRONG". The size meter is neutral. Icon + text + colour throughout.

**EDGE CASES** — α outside the domain (reject); domain of size 1 (refuse; degenerate); an all-zero seed (allowed; shown); server answer of the wrong length (fail-closed); collusion with one key only (nothing leaks — show it); early-termination boundary when the record width exceeds the PRG block.

**EXTENSION SEAMS** — multi-point DPF; distributed comparison functions for range queries; verifiable DPF; k > 2 servers.

## Claims suite and negative claim

`e2e/claims.spec.ts`: parse α, the retrieved record and shelf[α] and assert equality on the honest path; for small domains parse both leaf rows, XOR them in the test and assert a single 1 at α; parse the displayed key byte count and the serialized hex dump and assert they agree; assert the formula-derived size equals the measured size; parts-sum: seeds + per-level correction words + final correction = total bytes; retirement when α changes; no-op guard; `[hidden]` probe.

**Negative claim (§4.1d):** "This two-server PIR hides which record is read; it does not authenticate what is returned. A server that flips one bit corrupts the record, and no check on this page fails." **Fixture:** tamper toggle on; both single-key views still random-looking, collusion off, reconstruction completes — every privacy verdict green — and the record differs from shelf[α] → "RETRIEVED — AND WRONG". Delete the text, or make the tamper a no-op inside the fixture, and the test fails.

## Pre-build verification

- Grep card copy for `DPF`, `function secret sharing`, `point function`. Read Oblivious Shelf and Patron Shield for the shelf / patron vocabulary and reuse it; do not import their code.
- Confirm the PRG choice against the BGI16 paper's requirements (output length 2(λ + 1) bits per node) and state it.
- Proposed section: Privacy & Advanced. Proposed chip: PRIVACY (MPC & THRESHOLD is the alternative). Verify.

## Citations (checked)

Gilboa & Ishai, "Distributed Point Functions and Their Applications", EUROCRYPT 2014. Boyle, Gilboa, Ishai, "Function Secret Sharing", EUROCRYPT 2015. Boyle, Gilboa, Ishai, "Function Secret Sharing: Improvements and Extensions", ACM CCS 2016. Chor, Goldreich, Kushilevitz, Sudan, "Private Information Retrieval", FOCS 1995.

---

*"So whether you eat or drink or whatever you do, do it all for the glory of God." — 1 Corinthians 10:31*