export interface DmsMailingConfig {
  useHtmlRender?: boolean;
  /**
   * Most bytes the attachments of one send add up to, before the provider's
   * own limit lowers it. 10 MiB by default: base64 grows it by a third, which
   * keeps the message under the 20 to 25 MB most mail servers accept.
   */
  maxAttachmentBytes?: number;
  /** Most files one send carries. */
  maxAttachments?: number;
}

const MIB = 1024 * 1024;

const DEFAULTS: Required<DmsMailingConfig> = {
  useHtmlRender: true,
  maxAttachmentBytes: 10 * MIB,
  maxAttachments: 10,
};

let current: Required<DmsMailingConfig> = DEFAULTS;

export function setConfig(config: DmsMailingConfig): void {
  current = { ...DEFAULTS, ...config };
}

export function getConfig(): Required<DmsMailingConfig> {
  return current;
}
