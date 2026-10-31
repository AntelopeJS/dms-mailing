import { CustomComponent } from "@antelopejs/interface-dms/base/custom";
import {
  DataType,
  RegisterDataType,
} from "@antelopejs/interface-dms/base/data-types";
import { TEMPLATE_CATEGORIES_TYPE_ID } from "../constants";
import { categoriesSchema } from "../validation/settings.schema";

/**
 * The tenant's template categories as a settings field — a repeatable list of
 * {id, label, icon} that no built-in DataType models: the input is ours.
 */
@RegisterDataType(TEMPLATE_CATEGORIES_TYPE_ID)
export class TemplateCategoriesType extends DataType {
  constructor() {
    super([], undefined, {});
  }

  protected defaultInputComponent() {
    return CustomComponent("MailingCategoriesInput")
      .options(this.options)
      .serializeSync();
  }

  getValidation() {
    return categoriesSchema;
  }
}
