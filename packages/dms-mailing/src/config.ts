export interface DmsMailingConfig {
  useHtmlRender?: boolean;
}

const DEFAULTS: Required<DmsMailingConfig> = { useHtmlRender: true };

let current: Required<DmsMailingConfig> = DEFAULTS;

export function setConfig(config: DmsMailingConfig): void {
  current = { ...DEFAULTS, ...config };
}

export function getConfig(): Required<DmsMailingConfig> {
  return current;
}
