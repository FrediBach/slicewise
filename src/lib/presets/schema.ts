import { isJsonObject } from './document';
import { PresetError, type JsonObject, type JsonValue } from './types';

export type ValueSchema = {
  type?: 'object' | 'array' | 'number' | 'integer' | 'string' | 'boolean' | 'null';
  enum?: readonly JsonValue[];
  minimum?: number;
  maximum?: number;
  maxLength?: number;
  pattern?: string;
  properties?: Record<string, ValueSchema>;
  optional?: readonly string[];
  additionalProperties?: ValueSchema | false;
  items?: ValueSchema;
  minItems?: number;
  maxItems?: number;
  uniqueIds?: boolean;
  discriminator?: string;
  variants?: Record<string, ValueSchema>;
};

export const number = (minimum: number, maximum: number, integer = false): ValueSchema => ({
  type: integer ? 'integer' : 'number',
  minimum,
  maximum,
});
export const string = (maxLength = 256, pattern?: string): ValueSchema => ({
  type: 'string',
  maxLength,
  ...(pattern ? { pattern } : {}),
});
export const boolean: ValueSchema = { type: 'boolean' };
export const color = string(7, '^#[a-fA-F0-9]{6}$');
export const choice = (...values: JsonValue[]): ValueSchema => ({ enum: values });
export const object = (
  properties: Record<string, ValueSchema>,
  optional: string[] = [],
): ValueSchema => ({ type: 'object', properties, optional });
export const array = (
  items: ValueSchema,
  maxItems: number,
  minItems = 0,
  uniqueIds = false,
): ValueSchema => ({ type: 'array', items, maxItems, minItems, uniqueIds });
export const variant = (
  discriminator: string,
  variants: Record<string, ValueSchema>,
): ValueSchema => ({ discriminator, variants });

/** Returns a detached projection; unknown object properties stay only in the document. */
export function readSchema(schema: ValueSchema, value: unknown, path = 'settings'): JsonValue {
  const fail = (reason: string): never => {
    throw new PresetError('invalid', `${path}: ${reason}`);
  };
  if (schema.enum) {
    if (!schema.enum.some((candidate) => candidate === value)) fail('Unsupported value.');
    return value as JsonValue;
  }
  if (schema.discriminator) {
    const tag = isJsonObject(value) ? value[schema.discriminator] : undefined;
    if (typeof tag !== 'string' || !Object.hasOwn(schema.variants!, tag)) fail('Unsupported kind.');
    return readSchema(schema.variants![tag as string], value, path);
  }
  if (schema.type === 'null') {
    if (value !== null) fail('Expected null.');
    return null;
  }
  if (schema.type === 'boolean') {
    if (typeof value !== 'boolean') fail('Expected a boolean.');
    return value as boolean;
  }
  if (schema.type === 'string') {
    if (
      typeof value !== 'string' ||
      value.length > schema.maxLength! ||
      (schema.pattern && !new RegExp(schema.pattern).test(value))
    )
      fail('Invalid string.');
    return value as string;
  }
  if (schema.type === 'number' || schema.type === 'integer') {
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      value < schema.minimum! ||
      value > schema.maximum! ||
      (schema.type === 'integer' && !Number.isInteger(value))
    )
      fail(`Expected ${schema.type} between ${schema.minimum} and ${schema.maximum}.`);
    return value as number;
  }
  if (schema.type === 'array') {
    if (!Array.isArray(value) || value.length < schema.minItems! || value.length > schema.maxItems!)
      fail('Invalid array length.');
    const items = (value as unknown[]).map((item, index) =>
      readSchema(schema.items!, item, `${path}[${index}]`),
    );
    if (schema.uniqueIds) {
      const ids = items.map((item) => (isJsonObject(item) ? item.id : undefined));
      if (ids.some((id) => typeof id !== 'string' || !id) || new Set(ids).size !== ids.length)
        fail('Missing or duplicate item IDs.');
    }
    return items;
  }
  if (!isJsonObject(value)) fail('Expected an object.');
  const input = value as JsonObject;
  const result: JsonObject = {};
  for (const [key, child] of Object.entries(schema.properties ?? {})) {
    if (!Object.hasOwn(input, key) && schema.optional?.includes(key)) continue;
    result[key] = readSchema(child, input[key], `${path}.${key}`);
  }
  for (const key of Object.keys(input)) {
    if (Object.hasOwn(schema.properties ?? {}, key)) continue;
    if (schema.additionalProperties === false) fail(`Unsupported field ${key}.`);
    if (schema.additionalProperties)
      result[key] = readSchema(schema.additionalProperties, input[key], `${path}.${key}`);
  }
  return result;
}
