import { BasicDataModel } from "@antelopejs/interface-database-decorators";
import { MAILING_SEND_EVENTS_TABLE_NAME, MailingSendEvent } from "../tables";
import { SendModel } from "./sends.model";

type NewSendEvent = Omit<MailingSendEvent, "_id">;

const FIRST_ROW_OFFSET = 0;

export class SendEventModel extends BasicDataModel(
  MailingSendEvent,
  MAILING_SEND_EVENTS_TABLE_NAME,
) {
  async getBySend(sendId: string): Promise<MailingSendEvent[]> {
    return this.getBy("sendId", sendId);
  }

  /** Removes a late event if retention finished while its writer was paused. */
  async insertForActiveSend(event: NewSendEvent): Promise<boolean> {
    const [id] = await this.insert(event);
    const send = await new SendModel(this.database).get(event.sendId);
    if (send && !send.isRetiring) return true;
    await this.delete(id);
    return false;
  }

  /** Keyset pagination remains stable when overlapping sweeps delete earlier rows. */
  listAfter(after: string, size: number): Promise<MailingSendEvent[]> {
    return this.table
      .filter((row) => row.key("_id").gt(after))
      .orderBy("_id", "asc")
      .slice(FIRST_ROW_OFFSET, size)
      .run();
  }

  /**
   * Drops a send's whole history in one statement. Retention purges up to
   * 20 000 sends a night; deleting their events one row at a time turned that
   * into six figures of round-trips.
   */
  deleteBySend(sendId: string): Promise<number> {
    return this.table
      .filter((row) => row.key("sendId").eq(sendId))
      .delete()
      .run();
  }
}
