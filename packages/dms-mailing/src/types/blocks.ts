/**
 * The block tree and template content are part of the public interface: the
 * editor, the engine and every consumer of `SendTemplate` must agree on one
 * shape, so they are declared in the interface package and only re-exported
 * here.
 */
export type {
  Block,
  BlockBase,
  BlockType,
  ButtonBlock,
  CodeBlock,
  Condition,
  ConditionOperator,
  DividerBlock,
  FooterBlock,
  HeadingBlock,
  HeroBlock,
  IfBlock,
  ListBlock,
  LocaleContent,
  ParagraphBlock,
  TemplateContent,
  TextAlign,
  TotalBlock,
  VariableDefinition,
  VariableType,
} from "@antelopejs/interface-dms-mailing";

/** Internal to the module: templates are never exposed by status. */
export type TemplateStatus = "draft" | "live" | "archived";
