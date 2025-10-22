import { parse as parseYaml } from 'yaml';

export interface FrontMatterResult<TMeta = unknown> {
  attributes: TMeta;
  body: string;
}

const FRONT_MATTER_REGEX = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?/;

export function parseFrontMatter<TMeta = unknown>(source: string): FrontMatterResult<TMeta> {
  const match = source.match(FRONT_MATTER_REGEX);

  if (!match) {
    return { attributes: {} as TMeta, body: source };
  }

  const [, yamlSource] = match;
  const body = source.slice(match[0].length);
  const attributes = (yamlSource ? parseYaml(yamlSource) : {}) as TMeta;

  return { attributes, body };
}
