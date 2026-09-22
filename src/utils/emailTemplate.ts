import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const emailDirectory = path.resolve(
  __dirname,
  "../templates/email"
);

export const renderEmailTemplate = async (
  template: string,
  variables: Record<string, string | number> = {}
) => {
  const headerPath = path.join(
    emailDirectory,
    "layouts/header.html"
  );

  const footerPath = path.join(
    emailDirectory,
    "layouts/footer.html"
  );

  const templatePath = path.join(
    emailDirectory,
    `${template}.html`
  );

  const [header, body, footer] =
    await Promise.all([
      fs.readFile(headerPath, "utf8"),
      fs.readFile(templatePath, "utf8"),
      fs.readFile(footerPath, "utf8"),
    ]);

  let html = header + body + footer;

  for (const [key, value] of Object.entries(variables)) {
    html = html.replaceAll(
      `{{${key}}}`,
      String(value)
    );
  }

  return html;
};