import { collude } from '../attack/collude';
import { singleShareView } from '../attack/single-view';
import { tamperAnswer } from '../attack/tamper';
import { evaluateAll, evaluateLevel } from '../dpf/eval';
import { generateDpf } from '../dpf/gen';
import { expandSeed } from '../dpf/prg';
import { deserializeKey, serializeKey, serializedKeyParts, toHex } from '../dpf/serialize';
import type { DpfKey } from '../dpf/types';
import { createQuery, reconstruct } from '../pir/client';
import { createShelf } from '../pir/shelf';
import { serverAnswerProgressive } from '../pir/server';

const TREE_BITS = 4;
const SHELF_BITS = 16;
const SHELF_SIZE = 2 ** SHELF_BITS;

interface LabState {
  alpha: number;
  level: number;
  keys: readonly [DpfKey, DpfKey];
}

let state: LabState = { alpha: 11, level: TREE_BITS, keys: generateDpf(11, TREE_BITS) };
let shelf: Uint8Array[] | undefined;

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`missing required element #${id}`);
  return found as T;
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
}

function renderNode(bit: number, seedHex: string, index: number, combined: boolean): string {
  const lit = combined && bit === 1 ? ' node-lit' : '';
  const label = combined
    ? `Combined node ${index}, value ${bit}${bit === 1 ? ', secret point' : ''}`
    : `Share node ${index}, value ${bit}, seed prefix ${seedHex}`;
  return `<span class="tree-node${lit}" role="listitem" aria-label="${label}"><span class="node-bit">${bit}</span>${combined ? '' : `<span class="seed-prefix">${seedHex}</span>`}</span>`;
}

/**
 * The headline claim of exhibit 01. It is read off the XOR of both full leaf
 * expansions, never off the alpha the slider asked for: the lit index shown is
 * the one the two real keys actually reconstruct, and the verdict turns when
 * that index is not a single point at alpha.
 */
function renderTreeVerdict(leaves0: Uint8Array, leaves1: Uint8Array): void {
  const combined = leaves0.map((bit, index) => bit ^ leaves1[index]);
  const lit: number[] = [];
  combined.forEach((bit, index) => {
    if (bit === 1) lit.push(index);
  });
  const onePoint = lit.length === 1 && lit[0] === state.alpha;
  const verdict = element('tree-verdict');
  verdict.className = `verdict ${onePoint ? 'verdict-pass' : 'verdict-alarm'}`;
  verdict.dataset.status = onePoint ? 'pass' : 'alarm';
  if (onePoint) {
    verdict.innerHTML = `<span class="status-mark" aria-hidden="true">1</span><span>ONE LIT POINT AT \u03b1 = <strong id="tree-alpha-verdict">${lit[0]}</strong></span>`;
  } else if (lit.length === 1) {
    verdict.innerHTML = `<span class="status-mark" aria-hidden="true">!</span><span>POINT AT THE WRONG INDEX <strong id="tree-alpha-verdict">${lit[0]}</strong> \u00b7 \u03b1 = ${state.alpha}</span>`;
  } else {
    verdict.innerHTML = `<span class="status-mark" aria-hidden="true">!</span><span>NOT A POINT FUNCTION \u00b7 <strong id="tree-alpha-verdict">${lit.length}</strong> of ${combined.length} leaves lit</span>`;
  }
}

function renderTree(): void {
  const [key0, key1] = state.keys;
  const nodes0 = evaluateLevel(key0, state.level);
  const nodes1 = evaluateLevel(key1, state.level);
  const atLeaves = state.level === TREE_BITS;
  const bits0 = atLeaves ? evaluateAll(key0) : Uint8Array.from(nodes0, (node) => node.control);
  const bits1 = atLeaves ? evaluateAll(key1) : Uint8Array.from(nodes1, (node) => node.control);
  const xor = bits0.map((bit, index) => bit ^ bits1[index]);
  element<HTMLElement>('tree-zero').style.setProperty('--node-count', String(bits0.length));
  element<HTMLElement>('tree-one').style.setProperty('--node-count', String(bits1.length));
  element<HTMLElement>('tree-xor').style.setProperty('--node-count', String(xor.length));
  element('tree-zero').innerHTML = Array.from(bits0, (bit, index) =>
    renderNode(bit, toHex(nodes0[index].seed).slice(0, 8), index, false)
  ).join('');
  element('tree-one').innerHTML = Array.from(bits1, (bit, index) =>
    renderNode(bit, toHex(nodes1[index].seed).slice(0, 8), index, false)
  ).join('');
  element('tree-xor').innerHTML = Array.from(xor, (bit, index) => renderNode(bit, '', index, true)).join('');

  element<HTMLOutputElement>('step-value').value = `${state.level} / ${TREE_BITS}`;
  element<HTMLButtonElement>('step-back').disabled = state.level === 0;
  element<HTMLButtonElement>('step-next').disabled = state.level === TREE_BITS;
  renderTreeVerdict(evaluateAll(key0), evaluateAll(key1));
  element<HTMLOutputElement>('alpha-value').value = String(state.alpha);
  element('serialized-key-hex').textContent = toHex(serializeKey(key0));

  if (state.level === 0) {
    element('correction-seed').textContent = 'root seeds only';
    element('correction-bits').textContent = 't0 = 0 · t1 = 1';
  } else if (atLeaves) {
    element('correction-seed').textContent = `final correction ${key0.finalCorrection}`;
    element('correction-bits').textContent = 'leaf PRG output XOR correction';
  } else {
    const correction = key0.correctionWords[state.level - 1];
    element('correction-seed').textContent = `${toHex(correction.seed).slice(0, 24)}…`;
    element('correction-bits').textContent = `tL = ${correction.leftBit} · tR = ${correction.rightBit}`;
  }
}

function regenerateTree(alpha: number, retire: boolean): void {
  if (alpha === state.alpha && retire) return;
  const previous = state.alpha;
  state = { alpha, level: TREE_BITS, keys: generateDpf(alpha, TREE_BITS) };
  if (retire) {
    const status = element('retirement');
    status.hidden = false;
    status.textContent = `Previous reconstruction for α = ${previous} retired; both keys were regenerated.`;
  }
  renderTree();
  renderCollusion(false);
  element<HTMLInputElement>('collusion-toggle').checked = false;
}

/**
 * Every number this page paints is a marked claim: `data-claim` names it and
 * `data-value` carries the machine-readable measurement behind the words, so a
 * rendered sentence and the value it states cannot drift apart unnoticed.
 */
function renderClaim(id: string, value: number, text: string): void {
  const node = element(id);
  node.dataset.value = String(value);
  node.textContent = text;
}

function renderMeter(domainBits: number): void {
  const domainSize = 2 ** domainBits;
  const key = generateDpf(0, domainBits)[0];
  const serialized = serializeKey(key);
  const parts = serializedKeyParts(domainBits);
  const chorBytes = domainSize / 8;
  const perLevel = parts.correctionWords / domainBits;
  renderClaim('key-byte-label', serialized.length, `${serialized.length.toLocaleString()} bytes`);
  renderClaim('chor-byte-label', chorBytes, `${chorBytes.toLocaleString()} bytes · ${domainSize.toLocaleString()} bits`);
  renderClaim('part-root', parts.rootMaterial, `${parts.rootMaterial} B`);
  renderClaim('part-levels', parts.correctionWords, `${parts.correctionWords} B`);
  renderClaim('part-final', parts.finalCorrection, `${parts.finalCorrection} B`);
  renderClaim('key-bytes', serialized.length, `${serialized.length} B`);
  renderClaim(
    'size-formula',
    parts.total,
    `${parts.rootMaterial} + (${perLevel} × log₂ ${domainSize.toLocaleString()}) + ${parts.finalCorrection} = ${parts.total} bytes`
  );
  element('meter-key-hex').textContent = toHex(serialized);
  const baseline = Math.max(chorBytes, serialized.length);
  element<HTMLElement>('dpf-bar').style.width = `${Math.max(3, (serialized.length / baseline) * 100)}%`;
  element<HTMLElement>('chor-bar').style.width = `${(chorBytes / baseline) * 100}%`;
}

function renderCollusion(enabled: boolean): void {
  const view = element('collusion-view');
  const serialized = state.keys.map(serializeKey) as unknown as readonly [Uint8Array, Uint8Array];
  if (!enabled) {
    const alone = singleShareView(serialized[0]);
    const hides = !alone.namesAPoint;
    view.className = 'collusion-view';
    view.innerHTML = `<div class="verdict ${hides ? 'verdict-pass' : 'verdict-alarm'}" data-verdict="single-share" data-status="${hides ? 'pass' : 'alarm'}"><span class="status-mark" aria-hidden="true">${hides ? '1' : '!'}</span><span>${hides ? `ONE KEY ONLY · k0 alone lights ${alone.lit} of ${alone.total} leaves, naming no point` : `ONE KEY ONLY · k0 alone lights exactly 1 of ${alone.total} leaves, so this share names a point by itself`}</span></div><p>A single expanded share contains many 0s and 1s but no distinguished target; only the XOR of both shares is a point function.</p>`;
    return;
  }
  const result = collude(serialized[0], serialized[1]);
  const recovered = result.alpha === state.alpha;
  view.className = 'collusion-view collusion-alarm';
  view.innerHTML = `<div class="verdict verdict-alarm" data-verdict="collusion-recovery" data-status="${recovered ? 'alarm' : 'mismatch'}"><span class="status-mark" aria-hidden="true">!</span><span>${recovered ? `SERVER SEES α = <strong>${result.alpha}</strong>` : `JOIN MISSED · the joined view reconstructed <strong>${result.alpha}</strong>, the client's α was ${state.alpha}`}</span></div><div class="collusion-bits" role="list" aria-label="Point reconstructed by colluding server">${Array.from(result.reconstruction, (bit, index) => renderNode(bit, '', index, true)).join('')}</div><p>Broken assumption: one server now holds both keys and reconstructs the point function inside its own view.</p>`;
}

/** Each server's own view of the query: what it holds, and how much it folded. */
function serverViewVerdict(
  marker: string,
  label: string,
  serializedKey: Uint8Array,
  expectedParty: number,
  expectedBytes: number,
  folded: number,
  scanned: number
): string {
  const party = deserializeKey(serializedKey).party;
  const blind = party === expectedParty && serializedKey.length === expectedBytes && folded > 1 && folded < scanned;
  const detail = blind
    ? `${label} · one party-${party} key of ${serializedKey.length} B · folded ${folded.toLocaleString()} of ${scanned.toLocaleString()} records`
    : `${label} · party-${party} key of ${serializedKey.length} B folded ${folded.toLocaleString()} of ${scanned.toLocaleString()} records — this view is not α-blind`;
  return `<div class="mini-verdict" data-verdict="${marker}" data-status="${blind ? 'pass' : 'alarm'}"><span class="status-mark" aria-hidden="true">${blind ? '1' : '!'}</span><span>${detail}</span></div>`;
}

function collusionStateVerdict(colluding: boolean): string {
  const detail = colluding
    ? 'Collusion is ON · one view holds both keys, so α is not hidden from it'
    : 'Collusion is off · neither key left its own server view';
  return `<div class="mini-verdict" data-verdict="collusion-state" data-status="${colluding ? 'alarm' : 'pass'}"><span class="status-mark" aria-hidden="true">${colluding ? '!' : '1'}</span><span>${detail}</span></div>`;
}

async function fetchFromShelf(): Promise<void> {
  const input = element<HTMLInputElement>('shelf-alpha');
  const alpha = Number(input.value);
  if (!Number.isInteger(alpha) || alpha < 0 || alpha >= SHELF_SIZE) {
    input.setAttribute('aria-invalid', 'true');
    element('fetch-status').textContent = `Rejected: α must be an integer from 0 to ${SHELF_SIZE - 1}.`;
    return;
  }
  input.removeAttribute('aria-invalid');
  const button = element<HTMLButtonElement>('fetch-record');
  button.disabled = true;
  const progress0 = element<HTMLProgressElement>('server-zero-progress');
  const progress1 = element<HTMLProgressElement>('server-one-progress');
  const percent0 = element<HTMLOutputElement>('server-zero-percent');
  const percent1 = element<HTMLOutputElement>('server-one-percent');
  progress0.value = 0;
  progress1.value = 0;
  percent0.value = '0%';
  percent1.value = '0%';
  element('fetch-status').textContent = 'Generating two keys and scanning both 65,536-record shares…';
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  const started = performance.now();
  shelf ??= createShelf(SHELF_SIZE);
  const keys = createQuery(alpha, SHELF_BITS);
  const updateProgress = (progress: HTMLProgressElement, output: HTMLOutputElement) =>
    (completed: number, total: number): void => {
      progress.value = completed;
      output.value = `${Math.round((completed / total) * 100)}%`;
    };
  const [fold0, fold1] = await Promise.all([
    serverAnswerProgressive(keys[0], shelf, updateProgress(progress0, percent0)),
    serverAnswerProgressive(keys[1], shelf, updateProgress(progress1, percent1))
  ]);
  const tampered = element<HTMLInputElement>('tamper-toggle').checked;
  const colluding = element<HTMLInputElement>('collusion-toggle').checked;
  const answer1 = tampered ? tamperAnswer(fold1.answer) : fold1.answer;
  let record: Uint8Array = new Uint8Array(0);
  let integrityError: string | undefined;
  try {
    record = reconstruct(fold0.answer, answer1);
  } catch (error) {
    integrityError = error instanceof Error ? error.message : String(error);
  }
  const expected = shelf[alpha];
  const matches = sameBytes(record, expected);
  const differing =
    record.length === expected.length
      ? expected.reduce((count, byte, index) => count + (byte === record[index] ? 0 : 1), 0)
      : expected.length;

  element<HTMLElement>('pir-awaiting').hidden = true;
  const expectedKeyBytes = serializedKeyParts(SHELF_BITS).total;
  element('privacy-verdicts').innerHTML = [
    serverViewVerdict('server-view-0', 'Server 0', keys[0], 0, expectedKeyBytes, fold0.foldedRecords, fold0.scannedRecords),
    serverViewVerdict('server-view-1', 'Server 1', keys[1], 1, expectedKeyBytes, fold1.foldedRecords, fold1.scannedRecords),
    collusionStateVerdict(colluding)
  ].join('');
  element('retrieved-record').textContent = toHex(record);
  element('expected-record').textContent = toHex(expected);
  const verdict = element('record-verdict');
  verdict.className = `verdict ${matches ? 'verdict-pass' : 'verdict-alarm'}`;
  verdict.dataset.status = matches ? 'pass' : 'alarm';
  verdict.innerHTML = matches
    ? `<span class="status-mark" aria-hidden="true">1</span><span>RETRIEVED · byte-for-byte match with shelf[α] across all ${expected.length} bytes</span>`
    : `<span class="status-mark" aria-hidden="true">!</span><span>RETRIEVED — AND WRONG · ${differing} of ${expected.length} bytes differ from shelf[α]; no PIR authentication failure was raised</span>`;
  renderIntegrityEvidence(tampered, matches, differing, expected.length, record.length, integrityError);
  element<HTMLElement>('pir-result').hidden = false;
  element('fetch-status').textContent = `Both full-domain folds completed in ${Math.round(performance.now() - started).toLocaleString()} ms.`;
  button.disabled = false;
}

/**
 * The §4.1d negative claim, stated as evidence from this run rather than as
 * standing prose. `unexercised` is the honest reading when nothing was altered;
 * `contradicted` is what shows if a tampered run still reconstructs shelf[α],
 * which would mean the page did not demonstrate the missing check at all.
 */
function renderIntegrityEvidence(
  tampered: boolean,
  matches: boolean,
  differing: number,
  width: number,
  recovered: number,
  integrityError: string | undefined
): void {
  const claim = element('negative-claim');
  const evidence = element('integrity-evidence');
  if (!tampered) {
    claim.dataset.status = 'unexercised';
    evidence.textContent = 'Not exercised on this run: no answer was altered, so the protocol was never asked to catch one.';
    return;
  }
  if (integrityError !== undefined) {
    claim.dataset.status = 'contradicted';
    evidence.textContent = `Reconstruction refused the altered answer (${integrityError}). That is a length check, not authentication.`;
    return;
  }
  if (matches) {
    claim.dataset.status = 'contradicted';
    evidence.textContent = 'Server 1 altered its answer and the reconstruction still matched shelf[α], so this run does not demonstrate the missing check.';
    return;
  }
  claim.dataset.status = 'alarm';
  evidence.textContent = `Exercised: server 1 flipped one bit, reconstruct() returned ${recovered} bytes and raised nothing, and ${differing} of ${width} bytes now differ from shelf[α].`;
}

export function boot(): void {
  renderTree();
  renderCollusion(false);
  renderMeter(16);
  const zeroExpansion = expandSeed(new Uint8Array(16));
  element('zero-seed-proof').textContent = `L ${toHex(zeroExpansion.leftSeed).slice(0, 8)} · R ${toHex(zeroExpansion.rightSeed).slice(0, 8)}`;
  // The PRG's node width used to be painted as the constant "2(λ + 1) bits".
  // It is a measurement of the real expansion, so it is rendered as one.
  const nodeWidthBits = (zeroExpansion.leftSeed.length + zeroExpansion.rightSeed.length) * 8 + 2;
  renderClaim('prg-width', nodeWidthBits, `AES-128-CTR → 2(λ + 1) = ${nodeWidthBits} bits per node`);

  element<HTMLInputElement>('alpha-range').addEventListener('input', (event) => {
    regenerateTree(Number((event.currentTarget as HTMLInputElement).value), true);
  });
  element('new-keys').addEventListener('click', () => regenerateTree(state.alpha, false));
  element('step-back').addEventListener('click', () => {
    state.level = Math.max(0, state.level - 1);
    renderTree();
  });
  element('step-next').addEventListener('click', () => {
    state.level = Math.min(TREE_BITS, state.level + 1);
    renderTree();
  });
  element<HTMLSelectElement>('size-domain').addEventListener('change', (event) => {
    renderMeter(Number((event.currentTarget as HTMLSelectElement).value));
  });
  element('fetch-record').addEventListener('click', () => void fetchFromShelf());
  element<HTMLInputElement>('collusion-toggle').addEventListener('change', (event) => {
    renderCollusion((event.currentTarget as HTMLInputElement).checked);
  });
}