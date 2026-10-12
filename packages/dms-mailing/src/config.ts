export interface DmsMailingConfig {
  useHtmlRender?: boolean;
  /**
   * Public address of the API (`https://api.example.com`), as an e-mail
   * provider reaches it. The webhook URL the settings show starts with it;
   * without it, with the address the settings request came through.
   */
  publicApiUrl?: string;
}

const DEFAULTS: Required<DmsMailingConfig> = {
  useHtmlRender: true,
  publicApiUrl: "",
};

let current: Required<DmsMailingConfig> = DEFAULTS;

export function setConfig(config: DmsMailingConfig): void {
  current = { ...DEFAULTS, ...config };
}

export function getConfig(): Required<DmsMailingConfig> {
  return current;
}
