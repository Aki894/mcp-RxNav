import {z} from "zod";
import {ApiError, type RequestOptions} from "./http.js";

export const term = z.string().trim().min(1).max(200).regex(/^[^\x00-\x1f]+$/, "Control characters are not allowed");
export const text = z.string().trim().min(1).max(4000).regex(/^[^\x00-\x1f]+$/);
export const identifier = z.string().trim().regex(/^\d+$/, "Expected a numeric RxCUI");
export const nct = z.string().trim().regex(/^NCT\d{8}$/, "Expected NCT followed by eight digits");
export const size = (max: number, fallback: number) => z.number().int().min(1).max(max).default(fallback);
export type Row = Record<string, unknown>;
export function object(value: unknown): Row {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ApiError("invalid_response", "Expected an upstream JSON object");
  return value as Row;
}
export function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new ApiError("invalid_response", "Expected an upstream array");
  return value;
}
export const optionalObject = (value: unknown): Row => value == null ? {} : object(value);
export const optionalArray = (value: unknown): unknown[] => value == null ? [] : array(value);
export const rows = (value: unknown): Row[] => optionalArray(value).map(object);
export const quote = (s: string) => '"' + s.replace(/[\\"]/g, " ") + '"';
export function select(row: Row, fields: string[]): Row {
  return Object.fromEntries(fields.filter(key => Object.hasOwn(row, key)).map(key => [key, row[key]]));
}
export interface ToolSpec {
  name: string; description: string; schema: z.ZodType;
  run: (args: unknown, options: RequestOptions) => Promise<unknown>;
}
export function tool<S extends z.ZodType>(name: string, description: string, schema: S,
  handler: (args: z.output<S>, options: RequestOptions) => Promise<unknown>): ToolSpec {
  return {name, description, schema, run: (args, options) => handler(schema.parse(args), options)};
}
export function catalog(specs: ToolSpec[]) {
  return specs.map(({name, description, schema}) => {
    const inputSchema = z.toJSONSchema(schema, {target: "draft-7", io: "input"});
    delete inputSchema.$schema;
    return {name, description, inputSchema: {...inputSchema, type: "object" as const},
      annotations: {readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true}};
  });
}
export function invoke(specs: ToolSpec[], name: string, args: unknown, options: RequestOptions = {}) {
  const entry = specs.find(t => t.name === name);
  if (!entry) throw new ApiError("unknown_tool", `Unknown tool: ${name}`);
  return entry.run(args, options);
}
