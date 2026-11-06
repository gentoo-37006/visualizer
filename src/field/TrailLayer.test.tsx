import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { TrailLayer } from "./TrailLayer";

it("alternates white dashes over a continuous black trail", () => {
  const html = renderToStaticMarkup(<TrailLayer poses={[{ x: 0, y: 0 }, { x: 36, y: 0 }]} viewport={{ width: 144, height: 144, padding: 0, border: 0 }} />);
  expect(html).toContain('stroke="#000000"');
  expect(html).toContain('stroke="#ffffff" stroke-dasharray="8 8"');
  expect(html.match(/points="72,72 108,72"/g)).toHaveLength(2);
});
