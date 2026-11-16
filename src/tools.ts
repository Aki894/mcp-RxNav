import {z} from "zod";
import {ApiError, getJson, type RequestOptions} from "./http.js";
import {catalog, identifier, invoke, object, optionalArray, optionalObject, rows, size, term, tool, type Row} from "./lib.js";

const nameQuery = z.object({drug_name: term.describe("English ingredient, generic, or brand name"), limit: size(50, 10).describe("Maximum concepts across all term-type groups, 1–50")}).strict();
const idQuery = z.object({drug_identifier: term.describe("Drug name or numeric RxCUI; all exact/normalized candidate IDs are preserved")}).strict();
const brandQuery = z.object({generic_name: term.describe("English generic drug or ingredient name")}).strict();
const sectionNames = ["basic_info", "generic_names", "brand_names", "atc_codes", "ingredients", "properties"] as const;
const details = z.object({rxcui: identifier.describe("Numeric RxNorm concept identifier"),
  fields: z.array(z.enum(sectionNames)).max(6).optional().describe("Requested sections; omitted or empty returns every section")}).strict();
const alias = z.object({drug: term.describe("English generic or brand name")}).strict();
const base = "https://rxnav.nlm.nih.gov/REST";
let nextRequest = 0;
async function request(path: string, params: Record<string, string>, options: RequestOptions) {
  const url = new URL(base + path);
  url.search = new URLSearchParams(params).toString();
  // Keep this server below the public service's 20 requests/second limit.
  const now = Date.now(), wait = Math.max(0, nextRequest - now);
  nextRequest = Math.max(now, nextRequest) + 60;
  if (wait) await new Promise(resolve => setTimeout(resolve, wait));
  return {url: url.href, data: object(await getJson(url, options))};
}
function concept(row: Row): Row {
  if (typeof row.rxcui !== "string" || !/^\d+$/.test(row.rxcui)) throw new ApiError("invalid_response", "Invalid RxCUI");
  return {...row, url: `${base}/rxcui/${row.rxcui}/properties.json`};
}
function flatten(group: unknown): Row[] {
  return rows(group).flatMap(g => rows(g.conceptProperties).map(p => concept({...p, tty: p.tty ?? g.tty})));
}
function unique(concepts: Row[]): Row[] {
  return [...new Map(concepts.map(c => [String(c.rxcui), c])).values()];
}
async function resolve(value: string, options: RequestOptions) {
  if (/^\d+$/.test(value)) return {ids: [value], url: `${base}/rxcui/${value}/properties.json`};
  const result = await request("/rxcui.json", {name: value, search: "2"}, options);
  const group = object(result.data.idGroup);
  const ids = optionalArray(group.rxnormId).map(id => {
    if (typeof id !== "string" || !/^\d+$/.test(id)) throw new ApiError("invalid_response", "Invalid RxCUI");
    return id;
  });
  return {ids: [...new Set(ids)], url: result.url};
}
async function properties(id: string, options: RequestOptions) {
  const result = await request(`/rxcui/${id}/properties.json`, {}, options);
  const value = result.data.properties == null ? null : concept(object(result.data.properties));
  if (value && value.rxcui !== id) throw new ApiError("invalid_response", "RxCUI does not match request");
  return {url: result.url, value};
}
async function related(id: string, tty: string, options: RequestOptions) {
  const result = await request(`/rxcui/${id}/related.json`, {tty}, options);
  return {url: result.url, concepts: unique(flatten(optionalObject(result.data.relatedGroup).conceptGroup))};
}
async function allProperties(id: string, options: RequestOptions) {
  const result = await request(`/rxcui/${id}/allProperties.json`, {prop: "all"}, options);
  return {url: result.url, values: rows(optionalObject(result.data.propConceptGroup).propConcept)};
}
function atcLevel(code: string): number | null {
  if (!/^[A-Z](?:\d{2}(?:[A-Z](?:[A-Z](?:\d{2})?)?)?)?$/.test(code)) return null;
  return ({1: 1, 3: 2, 4: 3, 5: 4, 7: 5} as Record<number, number>)[code.length] ?? null;
}
async function atc(id: string, options: RequestOptions) {
  const direct = await request(`/rxcui/${id}/property.json`, {propName: "ATC"}, options);
  const codes: Row[] = rows(optionalObject(direct.data.propConceptGroup).propConcept).flatMap(p => {
    if (typeof p.propValue !== "string") return [];
    return [{code: p.propValue, name: null, level: atcLevel(p.propValue), source: "RxNorm ATC property", relation: null}];
  });
  const classes = await request("/rxclass/class/byRxcui.json", {rxcui: id, relaSource: "ATC"}, options);
  for (const row of rows(optionalObject(classes.data.rxclassDrugInfoList).rxclassDrugInfo)) {
    const item = object(row.rxclassMinConceptItem);
    if (typeof item.classId !== "string") throw new ApiError("invalid_response", "Missing ATC class ID");
    codes.push({code: item.classId, name: item.className ?? null, level: atcLevel(item.classId),
      source: row.relaSource ?? "ATC", relation: row.rela ?? null,
      class_type: item.classType ?? null, linked_concept: row.minConcept ?? null});
  }
  return {codes: [...new Map(codes.map(c => [`${c.source}:${c.code}:${c.relation}`, c])).values()], urls: [direct.url, classes.url]};
}
async function nameSections(value: string, tty: string, field: string, options: RequestOptions) {
  const resolved = await resolve(value, options);
  const results: Row[] = [];
  for (const id of resolved.ids) {
    const result = await related(id, tty, options);
    results.push({rxcui: id, [field]: result.concepts, query_url: result.url});
  }
  return {source: "rxnav", query_url: resolved.url, query: value, matched_rxcuis: resolved.ids, results};
}

export const specs = [
  tool("search_drug_by_name", "Search drug products associated with an ingredient, generic, or brand name. Returns RxCUIs, names, term types, and source links with a global result limit.", nameQuery, async (p, options) => {
    const result = await request("/drugs.json", {name: p.drug_name}, options);
    const concepts = unique(flatten(object(result.data.drugGroup).conceptGroup));
    return {source: "rxnav", query_url: result.url, query: p.drug_name, total_found: concepts.length,
      returned_count: Math.min(concepts.length, p.limit), truncated: concepts.length > p.limit, results: concepts.slice(0, p.limit)};
  }),
  tool("get_generic_name", "Get related ingredient and generic clinical concepts for a drug name or RxCUI. Preserves every exact/normalized name candidate instead of selecting the first.", idQuery,
    (p, options) => nameSections(p.drug_identifier, "IN PIN MIN SCD SCDF SCDG", "generic_names", options)),
  tool("get_brand_names", "Get related brand names, branded products, and branded packs for a generic name, grouped by resolved RxCUI.", brandQuery,
    (p, options) => nameSections(p.generic_name, "BN SBD BPCK", "brand_names", options)),
  tool("get_atc_classification", "Get ATC properties and RxClass ATC memberships for all resolved drug candidates. Preserves classification source, class names, levels, and links.", idQuery, async (p, options) => {
    const resolved = await resolve(p.drug_identifier, options), results: Row[] = [];
    for (const id of resolved.ids) {
      const data = await atc(id, options);
      results.push({rxcui: id, atc_codes: data.codes, query_urls: data.urls});
    }
    return {source: "rxnav", query_url: resolved.url, matched_rxcuis: resolved.ids, results};
  }),
  tool("get_drug_ingredients", "Get ingredient concepts, source concept properties, and strength/dose-form attributes when supplied upstream. Keeps multiple name candidates separate.", idQuery, async (p, options) => {
    const resolved = await resolve(p.drug_identifier, options), results: Row[] = [];
    for (const id of resolved.ids) {
      const ingredient = await related(id, "IN PIN MIN", options), info = await properties(id, options), attrs = await allProperties(id, options);
      results.push({rxcui: id, ingredients: ingredient.concepts, basic_info: info.value, properties: attrs.values,
        query_urls: [ingredient.url, info.url, attrs.url]});
    }
    return {source: "rxnav", query_url: resolved.url, matched_rxcuis: resolved.ids, results};
  }),
  tool("get_complete_drug_details", "Get complete concept properties, generic/brand relations, ATC classifications, and ingredients by RxCUI, or select sections. Upstream section failures are reported as errors rather than silently omitted.", details, async (p, options) => {
    const wanted = new Set(p.fields?.length ? p.fields : sectionNames);
    const info = await properties(p.rxcui, options);
    if (!info.value) return {source: "rxnav", query_url: info.url, rxcui: p.rxcui, complete_drug_details: null};
    const data: Row = {rxcui: p.rxcui}, urls: string[] = [info.url];
    if (wanted.has("basic_info")) data.basic_info = info.value;
    if (wanted.has("properties")) {const v = await allProperties(p.rxcui, options); data.properties = v.values; urls.push(v.url);}
    for (const [field, tty] of [["generic_names", "IN PIN MIN SCD SCDF SCDG"], ["brand_names", "BN SBD BPCK"], ["ingredients", "IN PIN MIN"]]) {
      if (wanted.has(field as typeof sectionNames[number])) {const v = await related(p.rxcui, tty, options); data[field] = v.concepts; urls.push(v.url);}
    }
    if (wanted.has("atc_codes")) {const v = await atc(p.rxcui, options); data.atc_codes = v.codes; urls.push(...v.urls);}
    return {source: "rxnav", query_url: info.url, rxcui: p.rxcui, complete_drug_details: data, query_urls: urls};
  }),
  tool("resolve_drug", "ADR-Synthesizer compatible exact-or-normalized name resolution to RxCUIs. Preserves all matches without fetching properties or automatically resolving ambiguity.", alias, async (p, options) => {
    const result = await request("/rxcui.json", {name: p.drug, search: "2"}, options);
    const ids = optionalArray(object(result.data.idGroup).rxnormId);
    const records = ids.map(id => {
      if (typeof id !== "string" || !/^\d+$/.test(id)) throw new ApiError("invalid_response", "Invalid RxCUI");
      return {id, url: `${base}/rxcui/${id}/properties.json`, content: `${p.drug}: RxCUI ${id}`,
        metadata: {rxcui: id, queried_name: p.drug, match_mode: "exact_or_normalized"}};
    });
    return {source: "rxnav", query_url: result.url, records};
  }),
];
export const definitions = catalog(specs);
export const execute = (name: string, args: unknown, options: RequestOptions = {}) => invoke(specs, name, args, options);
