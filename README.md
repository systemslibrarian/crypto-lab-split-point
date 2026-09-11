# Split Point

## What It Is

Split Point is an interactive implementation of the two-party distributed point function (DPF) from Boyle, Gilboa, and Ishai and its application to two-server XOR private information retrieval (PIR). A client splits the function “return 1 only at index α” into two compact keys. Each server expands one key over the public shelf, folds the selected record shares, and returns one answer; XORing the answers recovers `shelf[α]` without either non-colluding server receiving α.

The teaching implementation supports domains from $2^4$ through $2^{16}$. Its pseudorandom generator uses real AES-128-CTR from the audited `@noble/ciphers` library. The synchronous library API keeps every tree step inspectable in the browser; it is not simulated math. This is not production cryptography: the TypeScript favors inspection over side-channel resistance, has not received a security audit, and keeps ephemeral keys only in browser memory.

## Exhibits

1. **Tree Microscope** — step two real DPF evaluations level by level, inspect their seed/control state, and XOR the leaf rows into one lit point at α.
2. **Private Shelf** — generate two fresh keys, have two independent server functions scan 65,536 deterministic 16-byte records, and compare the reconstructed record with `shelf[α]`.
3. **Query Scale** — compare one measured serialized DPF key with the full-domain Chor XOR query and verify that the displayed key parts sum to the measured total.
4. **Collusion** — deliberately give both keys to one server and watch α become visible inside that server’s view.
5. **Tampering** — flip one bit in a server answer. Every privacy condition still passes, but the client retrieves the wrong record because this PIR does not authenticate answers.

## When to Use It

Use a DPF when two non-colluding parties need compact additive or XOR shares of a point function, including two-server PIR and some private measurement protocols. The construction trades communication for server work: each server still evaluates over the full domain.

Do **not** use this demo as a cryptographic library or deploy this exact PIR where servers may collude. Do not use it when malicious servers must be detected; this construction provides query privacy, not answer integrity. It also does not implement multi-point, interval, comparison, incremental, verifiable, batched, single-server, or three-party FSS/PIR.

## Live Demo

[Open Split Point on GitHub Pages](https://systemslibrarian.github.io/crypto-lab-split-point/).

Move α and regenerate the two trees, step backward through their expansion, fetch a record from the full 65,536-record shelf, compare key sizes, and turn on the collusion or tamper fixtures.

## What Can Go Wrong

- **Server collusion:** either key alone hides α; both keys reconstruct the point function and reveal it.
- **Malicious answers:** a server can corrupt the record without triggering a protocol failure. The page’s `shelf[α]` comparison is an external teaching oracle, not a PIR authentication mechanism.
- **Malformed inputs:** out-of-domain α, invalid key lengths/control bits, a shelf with the wrong shape, and mismatched server-answer lengths are rejected with named causes.
- **Implementation leakage:** this inspectable TypeScript does not claim constant-time execution or side-channel resistance.
- **Work remains linear:** compact queries do not make the server scan sublinear; both servers evaluate the entire shelf.

## Real-World Usage

Distributed point functions are a compact foundation for two-server PIR and function secret sharing. The line of work starts with Gilboa and Ishai’s DPF formulation and PIR application, continues through Boyle, Gilboa, and Ishai’s FSS constructions and improved early-termination DPF, and appears as a building block in private telemetry and measurement systems. The VDAF draft’s incremental DPF is a different construction and is not implemented here.

Primary sources:

- [Gilboa & Ishai, “Distributed Point Functions and Their Applications,” EUROCRYPT 2014](https://doi.org/10.1007/978-3-642-55220-5_26)
- [Boyle, Gilboa & Ishai, “Function Secret Sharing,” EUROCRYPT 2015](https://doi.org/10.1007/978-3-662-46803-6_20)
- [Boyle, Gilboa & Ishai, “Function Secret Sharing: Improvements and Extensions”](https://eprint.iacr.org/2018/707)
- [Chor, Goldreich, Kushilevitz & Sudan, “Private Information Retrieval,” FOCS 1995](https://doi.org/10.1109/SFCS.1995.492461)

## How to Run Locally

Requires Node.js 20 or newer.

```bash
npm install
npm run dev
```

Vite prints the local development URL. To exercise the production artifact and all gates:

```bash
npm test
npm run build
npx playwright install --with-deps chromium
npm run test:a11y
```

## Related Demos

- [Shelf Oracle](https://systemslibrarian.github.io/crypto-lab-shelf-oracle/) — the single-server PIR boundary this lab deliberately does not cross.
- [Oblivious Shelf](https://systemslibrarian.github.io/crypto-lab-oblivious-shelf/) — private shelf access and the full-length XOR-query baseline.
- [Patron Shield](https://systemslibrarian.github.io/crypto-lab-patron-shield/) — privacy vocabulary around a reader and a catalog.

## Build & Verify

The repository has **31 automated checks**: 19 Vitest unit/property tests and 12 Playwright browser tests. Unit tests cover every supported domain size, independent point-vector reconstruction, single-point versus full-domain evaluation, strict serialization, server API isolation, progressive and synchronous PIR reconstruction, record widths beyond one AES block, malformed inputs, collusion, and answer tampering. Current measured core coverage is 94.82% statements, 96.39% lines, 97.72% functions, and 88.88% branches.

There are **0 published known-answer tests** for this exact randomized BGI tree-DPF variant: a search of the primary paper and appendices found proofs and algorithms but no fixed seed/key/output vectors. No vectors were invented. Correctness instead uses randomized properties at every supported domain size plus an independent naive point vector compared leaf by leaf.

The Playwright suite builds before serving and checks the production bundle on the fleet-unique port `4698`. It includes rendered mathematical claims, honest/tampered/colluding flows, retirement and no-op behavior, `[hidden]` containment, desktop/mobile reflow, axe WCAG 2.1 A/AA, arithmetic text contrast, and per-side non-text control contrast. GitHub Pages deploys only after unit, build, and browser gates pass.

## Performance

At $N = 65{,}536$, one serialized key is 290 bytes in this teaching encoding:

$$
17 + 17\log_2 N + 1 = 290\text{ bytes}
$$

The Chor XOR baseline sends $N$ bits, or 8,192 bytes. DPF communication grows as $O(\lambda \log N)$ while each server’s `EvalAll` and shelf fold remain $O(N)$. Exact browser timing depends on the device and is reported after every fetch rather than presented as a benchmark.

---

*One of the browser demos in the [Crypto Lab](https://crypto-lab.systemslibrarian.dev/) suite.*

*"So whether you eat or drink or whatever you do, do it all for the glory of God." — 1 Corinthians 10:31*