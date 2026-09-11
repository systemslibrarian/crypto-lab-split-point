import { collude } from '../attack/collude';
import { tamperAnswer } from '../attack/tamper';
import { evaluateAll, evaluateLevel } from '../dpf/eval';
import { generateDpf } from '../dpf/gen';
import { expandSeed } from '../dpf/prg';
import { serializeKey, serializedKeyParts, toHex } from '../dpf/serialize';
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
  element('tree-alpha-verdict').textContent = String(state.alpha);
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

function renderMeter(domainBits: number): void {
  const domainSize = 2 ** domainBits;
  const key = generateDpf(0, domainBits)[0];
  const serialized = serializeKey(key);
  const parts = serializedKeyParts(domainBits);
  const chorBytes = domainSize / 8;
  element('key-byte-label').textContent = `${serialized.length.toLocaleString()} bytes`;
  element('chor-byte-label').textContent = `${chorBytes.toLocaleString()} bytes · ${domainSize.toLocaleString()} bits`;
  element('part-root').textContent = `${parts.rootMaterial} B`;
  element('part-levels').textContent = `${parts.correctionWords} B`;
  element('part-final').textContent = `${parts.finalCorrection} B`;
  const total = element('key-bytes');
  total.textContent = `${serialized.length} B`;
  total.dataset.count = String(serialized.length);
  element('size-formula').textContent = `17 + (17 × log₂ ${domainSize.toLocaleString()}) + 1 = ${parts.total} bytes`;
  element('meter-key-hex').textContent = toHex(serialized);
  const baseline = Math.max(chorBytes, serialized.length);
  element<HTMLElement>('dpf-bar').style.width = `${Math.max(3, (serialized.length / baseline) * 100)}%`;
  element<HTMLElement>('chor-bar').style.width = `${(chorBytes / baseline) * 100}%`;
}

function renderCollusion(enabled: boolean): void {
  const view = element('collusion-view');
  if (!enabled) {
    view.className = 'collusion-view';
    view.innerHTML = '<div class="verdict verdict-pass"><span class="status-mark" aria-hidden="true">1</span><span>ONE KEY ONLY · α remains hidden</span></div><p>A single expanded share contains many 0s and 1s but no distinguished target.</p>';
    return;
  }
  const serialized = state.keys.map(serializeKey) as unknown as readonly [Uint8Array, Uint8Array];
  const result = collude(serialized[0], serialized[1]);
  view.className = 'collusion-view collusion-alarm';
  view.innerHTML = `<div class="verdict verdict-alarm"><span class="status-mark" aria-hidden="true">!</span><span>SERVER SEES α = <strong>${result.alpha}</strong></span></div><div class="collusion-bits" role="list" aria-label="Point reconstructed by colluding server">${Array.from(result.reconstruction, (bit, index) => renderNode(bit, '', index, true)).join('')}</div><p>Broken assumption: one server now holds both keys and reconstructs the point function inside its own view.</p>`;
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
  const [answer0, honestAnswer1] = await Promise.all([
    serverAnswerProgressive(keys[0], shelf, updateProgress(progress0, percent0)),
    serverAnswerProgressive(keys[1], shelf, updateProgress(progress1, percent1))
  ]);
  const tampered = element<HTMLInputElement>('tamper-toggle').checked;
  const answer1 = tampered ? tamperAnswer(honestAnswer1) : honestAnswer1;
  const record = reconstruct(answer0, answer1);
  const expected = shelf[alpha];
  const matches = sameBytes(record, expected);

  element('privacy-verdicts').innerHTML = `<div class="mini-verdict" data-status="pass"><span class="status-mark" aria-hidden="true">1</span><span>Server 0 received one ${keys[0].length}-byte key</span></div><div class="mini-verdict" data-status="pass"><span class="status-mark" aria-hidden="true">1</span><span>Server 1 received one ${keys[1].length}-byte key</span></div><div class="mini-verdict" data-status="pass"><span class="status-mark" aria-hidden="true">1</span><span>Collusion remains off</span></div>`;
  element('retrieved-record').textContent = toHex(record);
  element('expected-record').textContent = toHex(expected);
  const verdict = element('record-verdict');
  verdict.className = `verdict ${matches ? 'verdict-pass' : 'verdict-alarm'}`;
  verdict.dataset.status = matches ? 'pass' : 'alarm';
  verdict.innerHTML = matches
    ? '<span class="status-mark" aria-hidden="true">1</span><span>RETRIEVED · byte-for-byte match with shelf[α]</span>'
    : '<span class="status-mark" aria-hidden="true">!</span><span>RETRIEVED — AND WRONG · no PIR authentication failure was raised</span>';
  element<HTMLElement>('pir-result').hidden = false;
  element('fetch-status').textContent = `Both full-domain folds completed in ${Math.round(performance.now() - started).toLocaleString()} ms.`;
  button.disabled = false;
}

export function boot(): void {
  renderTree();
  renderMeter(16);
  const zeroExpansion = expandSeed(new Uint8Array(16));
  element('zero-seed-proof').textContent = `L ${toHex(zeroExpansion.leftSeed).slice(0, 8)} · R ${toHex(zeroExpansion.rightSeed).slice(0, 8)}`;

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