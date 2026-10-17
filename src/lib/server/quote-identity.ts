import { createHash } from "node:crypto";
import type { IncomingFile } from "./types";
import type { QuoteInput } from "./schema";
type Fields = Pick<
  QuoteInput,
  | "locale"
  | "service"
  | "name"
  | "email"
  | "phone"
  | "message"
  | "company"
  | "dimensions"
  | "quantity"
  | "deadline"
  | "sourcePath"
>;
// Retain the original input identity across sanitization upgrades. This digest
// never grants access, never contains stored originals and is not sent to clients.
export function quotePayloadHash(data: Fields, files: IncomingFile[]) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        locale: data.locale,
        service: data.service,
        name: data.name,
        email: data.email,
        phone: data.phone,
        message: data.message,
        company: data.company,
        dimensions: data.dimensions,
        quantity: data.quantity,
        deadline: data.deadline,
        sourcePath: data.sourcePath,
        files: files.map((file) => ({
          name: file.name,
          mime: file.mime,
          hash:
            file.sourceHash ||
            createHash("sha256").update(file.bytes).digest("hex"),
        })),
      }),
    )
    .digest("hex");
}
