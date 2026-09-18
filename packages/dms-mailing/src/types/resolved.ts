import type { TextAlign } from "./blocks";

export interface ResolvedListRow {
  label: string;
  value: string;
}

export interface ResolvedHero {
  id: string;
  type: "hero";
  imageUrl: string;
  alt: string;
}

export interface ResolvedHeading {
  id: string;
  type: "heading";
  text: string;
  align: TextAlign;
  size: number;
}

export interface ResolvedParagraph {
  id: string;
  type: "paragraph";
  text: string;
  align: TextAlign;
}

export interface ResolvedCode {
  id: string;
  type: "code";
  text: string;
}

export interface ResolvedList {
  id: string;
  type: "list";
  rows: ResolvedListRow[];
}

export interface ResolvedTotal {
  id: string;
  type: "total";
  label: string;
  value: string;
}

export interface ResolvedButton {
  id: string;
  type: "button";
  text: string;
  href: string;
  align: TextAlign;
}

export interface ResolvedDivider {
  id: string;
  type: "divider";
}

export interface ResolvedFooter {
  id: string;
  type: "footer";
  text: string;
  unsubscribeLabel: string;
  preferencesLabel: string;
  unsubscribeUrl: string;
  preferencesUrl: string;
}

export type ResolvedBlock =
  | ResolvedHero
  | ResolvedHeading
  | ResolvedParagraph
  | ResolvedCode
  | ResolvedList
  | ResolvedTotal
  | ResolvedButton
  | ResolvedDivider
  | ResolvedFooter;

export interface ResolvedEmail {
  subject: string;
  preheader: string;
  blocks: ResolvedBlock[];
  missing: string[];
  hiddenBlockIds: string[];
}
