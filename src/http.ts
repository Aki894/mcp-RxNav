#!/usr/bin/env node

import express, { Request, Response } from 'express';
import cors from 'cors';
import { z } from 'zod';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Reuse schemas from index.ts
const DrugLabelSearchParamsSchema = z.object({
  search: z.string().optional(),
  count: z.string().optional(),
  skip: z.coerce.number().int().min(0).optional().default(0),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
});

const DrugQueryParamsSchema = z.object({
  drug_name: z.string(),
  limit: z.coerce.number().int().min(1).max(5).optional().default(3),
});

type DrugLabelSearchParams = z.infer<typeof DrugLabelSearchParamsSchema>;

interface OpenFDAResponse {
  meta: {
    disclaimer: string;
    terms: string;
    license: string;
    last_updated: string;
    results: {
      skip: number;
      limit: number;
      total: number;
    };
  };
  results: any[];
}

class OpenFDAHTTPServer {
  private app: express.Application;
  private baseUrl = "https://api.fda.gov/drug/label.json";

  constructor() {
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware() {
    this.app.use(cors());
    this.app.use(express.json());
  }

  private async makeRequest(params: DrugLabelSearchParams): Promise<OpenFDAResponse> {
    const url = new URL(this.baseUrl);
    
    if (params.search) {
      url.searchParams.set("search", params.search);
    }
    if (params.count) {
      url.searchParams.set("count", params.count);
    }
    if (params.skip) {
      url.searchParams.set("skip", params.skip.toString());
    }
    if (params.limit) {
      url.searchParams.set("limit", params.limit.toString());
    }

    const response = await fetch(url.toString());
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenFDA API error (${response.status}): ${errorText}`);
    }

    return await response.json();
  }

  private setupRoutes() {
    // OpenAPI specification endpoint
    this.app.get('/openapi.json', (req: Request, res: Response) => {
      const openApiSpec = {
        openapi: "3.0.3",
        info: {
          title: "OpenFDA Drug Labels API",
          description: "FDA药品标签信息查询API，基于OpenFDA数据源",
          version: "0.1.0"
        },
        servers: [
          { url: "http://localhost:3000", description: "本地开发服务器" }
        ],
        paths: {
          "/drug-labels": {
            get: {
              summary: "搜索FDA药品标签",
              description: "根据搜索条件查询药品标签信息",
              parameters: [
                {
                  name: "search",
                  in: "query",
                  description: "搜索查询，如药品名称、活性成分等",
                  schema: { type: "string" },
                  example: "aspirin"
                },
                {
                  name: "count",
                  in: "query", 
                  description: "按字段统计结果",
                  schema: { type: "string" },
                  example: "openfda.manufacturer_name.exact"
                },
                {
                  name: "skip",
                  in: "query",
                  description: "跳过的记录数（分页）",
                  schema: { type: "integer", minimum: 0, default: 0 }
                },
                {
                  name: "limit",
                  in: "query",
                  description: "返回记录数限制",
                  schema: { type: "integer", minimum: 1, maximum: 100, default: 10 }
                }
              ],
              responses: {
                "200": {
                  description: "成功返回药品标签数据",
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {
                          meta: { type: "object" },
                          results_count: { type: "integer" },
                          results: { type: "array" }
                        }
                      }
                    }
                  }
                },
                "400": { description: "请求参数错误" },
                "500": { description: "服务器内部错误" }
              }
            }
          },
          "/drug/{name}/adverse-reactions": {
            get: {
              summary: "获取药物不良反应",
              description: "查询指定药物的不良反应和禁忌症信息",
              parameters: [
                {
                  name: "name",
                  in: "path",
                  required: true,
                  description: "药物名称",
                  schema: { type: "string" },
                  example: "ibuprofen"
                },
                {
                  name: "limit",
                  in: "query",
                  description: "返回记录数限制",
                  schema: { type: "integer", minimum: 1, maximum: 10, default: 3 }
                }
              ],
              responses: {
                "200": { description: "成功返回不良反应数据" },
                "400": { description: "请求参数错误" },
                "500": { description: "服务器内部错误" }
              }
            }
          },
          "/drug/{name}/warnings": {
            get: {
              summary: "获取药物警告信息",
              description: "查询指定药物的警告、注意事项和黑框警告",
              parameters: [
                {
                  name: "name",
                  in: "path",
                  required: true,
                  description: "药物名称",
                  schema: { type: "string" },
                  example: "tylenol"
                },
                {
                  name: "limit",
                  in: "query",
                  description: "返回记录数限制",
                  schema: { type: "integer", minimum: 1, maximum: 10, default: 3 }
                }
              ],
              responses: {
                "200": { description: "成功返回警告信息数据" },
                "400": { description: "请求参数错误" },
                "500": { description: "服务器内部错误" }
              }
            }
          },
          "/drug/{name}/indications": {
            get: {
              summary: "获取药物适应症",
              description: "查询指定药物的适应症和用法信息",
              parameters: [
                {
                  name: "name",
                  in: "path",
                  required: true,
                  description: "药物名称",
                  schema: { type: "string" },
                  example: "aspirin"
                },
                {
                  name: "limit",
                  in: "query",
                  description: "返回记录数限制",
                  schema: { type: "integer", minimum: 1, maximum: 10, default: 3 }
                }
              ],
              responses: {
                "200": { description: "成功返回适应症数据" },
                "400": { description: "请求参数错误" },
                "500": { description: "服务器内部错误" }
              }
            }
          }
        }
      };
      
      res.json(openApiSpec);
    });

    // Drug labels search endpoint
    this.app.get('/drug-labels', async (req: Request, res: Response) => {
      try {
        const params = DrugLabelSearchParamsSchema.parse(req.query);
        const data = await this.makeRequest(params);
        
        res.json({
          meta: data.meta,
          results_count: data.results?.length || 0,
          results: data.results || []
        });
      } catch (error) {
        console.error('Error in /drug-labels:', error);
        res.status(400).json({ 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
      }
    });

    // Drug adverse reactions endpoint
    this.app.get('/drug/:name/adverse-reactions', async (req: Request, res: Response) => {
      try {
        const { name } = req.params;
        const { limit = 3 } = req.query;
        
        const parsedLimit = z.coerce.number().int().min(1).max(10).parse(limit);
        
        const searchQuery = `openfda.brand_name:"${name}" OR openfda.generic_name:"${name}" OR openfda.substance_name:"${name}"`;
        
        const data = await this.makeRequest({
          search: searchQuery,
          limit: parsedLimit,
          skip: 0
        });

        const adverseReactions = data.results?.map(result => ({
          drug_name: result.openfda?.brand_name?.[0] || result.openfda?.generic_name?.[0] || "Unknown",
          manufacturer: result.openfda?.manufacturer_name?.[0] || "Unknown",
          adverse_reactions: result.adverse_reactions || [],
          contraindications: result.contraindications || []
        })) || [];

        res.json({
          query: name,
          total_results: data.meta?.results?.total || 0,
          adverse_reactions_data: adverseReactions
        });
      } catch (error) {
        console.error('Error in /drug/:name/adverse-reactions:', error);
        res.status(400).json({ 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
      }
    });

    // Drug warnings endpoint
    this.app.get('/drug/:name/warnings', async (req: Request, res: Response) => {
      try {
        const { name } = req.params;
        const { limit = 3 } = req.query;
        
        const parsedLimit = z.coerce.number().int().min(1).max(10).parse(limit);
        
        const searchQuery = `openfda.brand_name:"${name}" OR openfda.generic_name:"${name}" OR openfda.substance_name:"${name}"`;
        
        const data = await this.makeRequest({
          search: searchQuery,
          limit: parsedLimit,
          skip: 0
        });

        const warnings = data.results?.map(result => ({
          drug_name: result.openfda?.brand_name?.[0] || result.openfda?.generic_name?.[0] || "Unknown",
          manufacturer: result.openfda?.manufacturer_name?.[0] || "Unknown",
          warnings: result.warnings || [],
          precautions: result.precautions || [],
          boxed_warning: result.boxed_warning || []
        })) || [];

        res.json({
          query: name,
          total_results: data.meta?.results?.total || 0,
          warnings_data: warnings
        });
      } catch (error) {
        console.error('Error in /drug/:name/warnings:', error);
        res.status(400).json({ 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
      }
    });

    // Drug indications endpoint
    this.app.get('/drug/:name/indications', async (req: Request, res: Response) => {
      try {
        const { name } = req.params;
        const { limit = 3 } = req.query;
        
        const parsedLimit = z.coerce.number().int().min(1).max(10).parse(limit);
        
        const searchQuery = `openfda.brand_name:"${name}" OR openfda.generic_name:"${name}" OR openfda.substance_name:"${name}"`;
        
        const data = await this.makeRequest({
          search: searchQuery,
          limit: parsedLimit,
          skip: 0
        });

        const indications = data.results?.map(result => ({
          drug_name: result.openfda?.brand_name?.[0] || result.openfda?.generic_name?.[0] || "Unknown",
          manufacturer: result.openfda?.manufacturer_name?.[0] || "Unknown", 
          indications_and_usage: result.indications_and_usage || [],
          dosage_and_administration: result.dosage_and_administration || []
        })) || [];

        res.json({
          query: name,
          total_results: data.meta?.results?.total || 0,
          indications_data: indications
        });
      } catch (error) {
        console.error('Error in /drug/:name/indications:', error);
        res.status(400).json({ 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
      }
    });

    // Health check endpoint
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });
  }

  public start(port: number = 3000) {
    this.app.listen(port, () => {
      console.log(`OpenFDA HTTP Server running on http://localhost:${port}`);
      console.log(`OpenAPI specification available at: http://localhost:${port}/openapi.json`);
    });
  }
}

// ES module compatibility for direct execution
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Start server if this file is run directly
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const server = new OpenFDAHTTPServer();
  const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;
  server.start(port);
}

export default OpenFDAHTTPServer;
