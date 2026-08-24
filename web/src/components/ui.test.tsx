import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { I18nProvider } from "../i18n/i18n";
import { ErrorState } from "./ui";

describe("ErrorState", () => {
  it("explains an expired Web session instead of reporting a Project rejection", () => {
    const error = Object.assign(new Error("unauthorized"), { status: 401 });
    const html = renderToStaticMarkup(<I18nProvider initialLocale="en"><ErrorState error={error} /></I18nProvider>);
    expect(html).toContain("browser session has expired");
    expect(html).not.toContain("rejected the request");
  });
});
