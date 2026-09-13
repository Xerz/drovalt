import { toProductUpdateRequest } from './client';
import type { DrovaApi, GameDetail } from './types';

export const OLD_EAC_PATH = String.raw`C:\Program Files (x86)\EasyAntiCheat`;
export const NEW_EAC_PATH = String.raw`C:\Program Files (x86)\EasyAntiCheat_EOS`;

/** Only replace complete list entries; never rewrite an arbitrary path prefix. */
export function replaceEacPath(value: string | null) {
  let matches = 0;
  let ambiguous = false;
  const escaped = OLD_EAC_PATH.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const entry = new RegExp(`^(\\s*)(["']?)(${escaped})(\\\\?)\\2(\\s*)$`, 'i');
  const occurrence = new RegExp(`${escaped}(?![a-z0-9_\\\\])`, 'i');
  // Respect quoted paths so a separator inside a folder name cannot create a match.
  const parts: string[] = [];
  let start = 0;
  let quote = '';
  for (let index = 0; index < (value?.length ?? 0); index += 1) {
    const char = value![index];
    if (char === quote) quote = '';
    else if (!quote && (char === '"' || char === "'")) quote = char;
    else if (!quote && /[;|,\r\n]/.test(char)) {
      parts.push(value!.slice(start, index), char);
      start = index + 1;
    }
  }
  if (value !== null) parts.push(value.slice(start));
  if (quote && occurrence.test(value ?? '')) ambiguous = true;
  const after =
    value === null
      ? null
      : parts
          .map((part) => {
            const match = entry.exec(part);
            if (match) {
              matches += 1;
              return `${match[1]}${match[2]}${NEW_EAC_PATH}${match[4]}${match[2]}${match[5]}`;
            }
            if (occurrence.test(part)) ambiguous = true;
            return part;
          })
          .join('');
  return { after: ambiguous ? value : after, matches, ambiguous };
}

export type EacFinding = {
  detail: GameDetail;
  source: 'default' | 'custom';
  before: string | null;
  after: string | null;
  ambiguous: boolean;
  unusedDefault: boolean;
};

export function inspectEacPaths(detail: GameDetail): EacFinding | null {
  const source = detail.allowedPaths === null ? 'default' : 'custom';
  const before = detail.allowedPaths ?? detail.defaultAllowedPaths;
  const active = replaceEacPath(before);
  const defaults = replaceEacPath(detail.defaultAllowedPaths);
  const unusedDefault =
    source === 'custom' && (defaults.matches > 0 || defaults.ambiguous);
  if (!active.matches && !active.ambiguous && !unusedDefault) return null;
  return {
    detail,
    source,
    before,
    after: active.matches && !active.ambiguous ? active.after : null,
    ambiguous: active.ambiguous,
    unusedDefault,
  };
}

export type EacScan = {
  findings: EacFinding[];
  errors: Array<{ productId: string; title: string }>;
  total: number;
};

export async function scanEacPaths(
  api: DrovaApi,
  stationId: string,
  onProgress: (completed: number, total: number) => void,
  onRead: (detail: GameDetail) => void,
): Promise<EacScan> {
  const products = await api.getProducts(stationId);
  const result: EacScan = { findings: [], errors: [], total: products.length };
  onProgress(0, products.length);
  for (const [index, product] of products.entries()) {
    try {
      const detail = await api.getProduct(stationId, product.productId);
      if (detail.productId !== product.productId)
        throw new Error('Unexpected game response.');
      onRead(detail);
      const finding = inspectEacPaths(detail);
      if (finding) result.findings.push(finding);
    } catch {
      result.errors.push({
        productId: product.productId,
        title: product.title,
      });
    }
    onProgress(index + 1, products.length);
  }
  return result;
}

export type EacOutcome = {
  productId: string;
  status: 'fixed' | 'skipped' | 'error';
  message: string;
};

export async function fixEacPath(
  api: DrovaApi,
  stationId: string,
  finding: EacFinding,
  onRead: (detail: GameDetail) => void,
): Promise<EacOutcome> {
  const productId = finding.detail.productId;
  const fresh = await api.getProduct(stationId, productId);
  if (fresh.productId !== productId)
    throw new Error('Unexpected game response.');
  onRead(fresh);
  const current = inspectEacPaths(fresh);
  if (
    fresh.allowedPaths !== finding.detail.allowedPaths ||
    (fresh.allowedPaths === null &&
      fresh.defaultAllowedPaths !== finding.detail.defaultAllowedPaths) ||
    !finding.after ||
    current?.after !== finding.after
  )
    return {
      productId,
      status: 'skipped',
      message: 'Пути изменились. Повторите проверку.',
    };

  const update = {
    productId,
    verified: fresh.verified,
    enabled: fresh.enabled,
    gamePath: fresh.gamePath,
    workPath: fresh.workPath,
    args: fresh.args,
    allowedPaths: finding.after,
  };
  // Apply the same verified-state validation in both live and demo modes.
  toProductUpdateRequest(stationId, update);
  await api.updateProduct(stationId, update);
  const readback = await api.getProduct(stationId, productId);
  if (readback.productId !== productId)
    throw new Error('Unexpected game response.');
  onRead(readback);
  if (
    readback.allowedPaths !== update.allowedPaths ||
    readback.gamePath !== update.gamePath ||
    readback.workPath !== update.workPath ||
    readback.args !== update.args ||
    readback.enabled !== update.enabled ||
    readback.verified !== update.verified
  ) {
    throw new Error(
      'Drova не подтвердил настройки. Повторите проверку перед следующей попыткой.',
    );
  }
  return { productId, status: 'fixed', message: 'Путь исправлен.' };
}

export async function fixEacPaths(
  api: DrovaApi,
  stationId: string,
  findings: EacFinding[],
  onOutcome: (outcome: EacOutcome) => void,
  onRead: (detail: GameDetail) => void,
): Promise<EacOutcome[]> {
  const outcomes: EacOutcome[] = [];
  for (const finding of findings) {
    let outcome: EacOutcome;
    try {
      outcome = await fixEacPath(api, stationId, finding, onRead);
    } catch {
      outcome = {
        productId: finding.detail.productId,
        status: 'error',
        message:
          'Не удалось подтвердить исправление. Операция остановлена; повторите проверку.',
      };
    }
    outcomes.push(outcome);
    onOutcome(outcome);
    if (outcome.status === 'error') break;
  }
  return outcomes;
}
