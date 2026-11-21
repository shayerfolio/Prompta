/** Variables are deliberately text-only. No expression evaluation takes place. */
const VARIABLE_PATTERN = /(?<!\{)\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}(?!\})/g;

export function detectVariables(content: string): string[] {
  return [...new Set([...content.matchAll(VARIABLE_PATTERN)].map(match => match[1]))];
}

export function fillVariables(content: string, values: Record<string, string>): string {
  return content.replace(VARIABLE_PATTERN, (placeholder, name: string) => {
    const value = Object.prototype.hasOwnProperty.call(values, name) ? values[name] : undefined;
    return typeof value === 'string' && value.trim().length > 0 ? value : placeholder;
  });
}
