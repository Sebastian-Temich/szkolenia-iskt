export type MailMessage = {
  inquiryId: string;
  requestId: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export type MailResult = {
  transport: "log" | "resend";
  id: string;
};

export interface MailAdapter {
  send(message: MailMessage): Promise<MailResult>;
}

export type MailLogEntry = {
  event: "mail.sent";
  inquiryId: string;
  requestId: string;
  transport: "log";
};

export type MailLogger = (entry: MailLogEntry) => void;

export function createLogMailAdapter(
  logger: MailLogger = console.info,
): MailAdapter {
  return {
    async send(message) {
      logger({
        event: "mail.sent",
        inquiryId: message.inquiryId,
        requestId: message.requestId,
        transport: "log",
      });

      return { transport: "log", id: `log:${message.requestId}` };
    },
  };
}
