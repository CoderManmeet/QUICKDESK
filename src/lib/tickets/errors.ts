/** A problem the user can fix. The message is safe to show in the UI. */
export class TicketError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TicketError";
  }
}
