import {
  Field,
  Index,
  RegisterTable,
  Table,
} from "@antelopejs/interface-database-decorators";
import { TENANT_SCHEMA_NAME } from "@antelopejs/interface-dms/constants";

export const MAILING_TEMPLATE_SLUGS_TABLE_NAME = "mailing_template_slugs";

/**
 * The template a slug belongs to. Its id derives from the tenant and the
 * slug, so the primary key is what keeps a slug to one template: the database
 * interface declares no unique secondary index, and two creations racing
 * past the free-slug check both insert their template, but only one claim.
 */
@RegisterTable(MAILING_TEMPLATE_SLUGS_TABLE_NAME, TENANT_SCHEMA_NAME)
export class MailingTemplateSlug extends Table {
  @Field("string")
  declare _id: string;

  @Field("string")
  declare slug: string;

  /** The template holding the slug; a deleted one leaves the claim free. */
  @Index()
  @Field("string")
  declare templateId: string;
}
