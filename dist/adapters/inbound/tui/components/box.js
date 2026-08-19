const TOP_LEFT = String.fromCharCode(0x250c);
const TOP_RIGHT = String.fromCharCode(0x2510);
const BOTTOM_LEFT = String.fromCharCode(0x2514);
const BOTTOM_RIGHT = String.fromCharCode(0x2518);
const HORIZONTAL = String.fromCharCode(0x2500);
const VERTICAL = String.fromCharCode(0x2502);
const IDENTITY = (s) => s;
function padEndVisible(value, width, stringWidth) {
    const missing = Math.max(0, width - stringWidth(value));
    return `${value}${" ".repeat(missing)}`;
}
export function box(lines, theme, options = {}) {
    const paddingX = options.paddingX ?? 2;
    const paddingY = options.paddingY ?? 0;
    const border = options.border ?? IDENTITY;
    const contentWidth = lines.reduce((max, line) => Math.max(max, theme.stringWidth(line)), 0);
    const innerWidth = contentWidth + paddingX * 2;
    const top = `${border(TOP_LEFT)}${border(HORIZONTAL.repeat(innerWidth))}${border(TOP_RIGHT)}`;
    const bottom = `${border(BOTTOM_LEFT)}${border(HORIZONTAL.repeat(innerWidth))}${border(BOTTOM_RIGHT)}`;
    const empty = `${border(VERTICAL)}${" ".repeat(innerWidth)}${border(VERTICAL)}`;
    const out = [top];
    for (let i = 0; i < paddingY; i += 1)
        out.push(empty);
    for (const line of lines) {
        out.push(`${border(VERTICAL)}${" ".repeat(paddingX)}${padEndVisible(line, contentWidth, theme.stringWidth)}${" ".repeat(paddingX)}${border(VERTICAL)}`);
    }
    for (let i = 0; i < paddingY; i += 1)
        out.push(empty);
    out.push(bottom);
    return out.join("\n");
}
export function titledBox(title, lines, theme, options = {}) {
    const paddingX = options.paddingX ?? 2;
    const paddingY = options.paddingY ?? 0;
    const border = options.border ?? IDENTITY;
    const contentWidth = lines.reduce((max, line) => Math.max(max, theme.stringWidth(line)), 0);
    const innerWidthFromContent = contentWidth + paddingX * 2;
    const titlePrefixRaw = `${HORIZONTAL} ${title} `;
    const titleWidth = theme.stringWidth(titlePrefixRaw);
    const innerWidth = Math.max(innerWidthFromContent, titleWidth);
    const contentAreaWidth = innerWidth - paddingX * 2;
    const titlePrefix = `${border(HORIZONTAL)} ${title} `;
    const remainingTop = Math.max(0, innerWidth - theme.stringWidth(titlePrefixRaw));
    const top = `${border(TOP_LEFT)}${titlePrefix}${border(HORIZONTAL.repeat(remainingTop))}${border(TOP_RIGHT)}`;
    const bottom = `${border(BOTTOM_LEFT)}${border(HORIZONTAL.repeat(innerWidth))}${border(BOTTOM_RIGHT)}`;
    const empty = `${border(VERTICAL)}${" ".repeat(innerWidth)}${border(VERTICAL)}`;
    const out = [top];
    for (let i = 0; i < paddingY; i += 1)
        out.push(empty);
    for (const line of lines) {
        out.push(`${border(VERTICAL)}${" ".repeat(paddingX)}${padEndVisible(line, contentAreaWidth, theme.stringWidth)}${" ".repeat(paddingX)}${border(VERTICAL)}`);
    }
    for (let i = 0; i < paddingY; i += 1)
        out.push(empty);
    out.push(bottom);
    return out.join("\n");
}
//# sourceMappingURL=box.js.map