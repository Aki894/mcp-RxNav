#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

// RxNav API parameter schemas
const DrugSearchParamsSchema = z.object({
  drug_name: z.string(),
  limit: z.coerce.number().int().min(1).max(50).optional().default(10),
});

const DrugIdentifierParamsSchema = z.object({
  drug_identifier: z.string(),
});

const GenericNameParamsSchema = z.object({
  generic_name: z.string(),
});

// RxNav API response interfaces
interface DrugInfo {
  rxcui: string;
  name: string;
  genericName?: string;
  brandNames?: string[];
  ingredients?: Ingredient[];
  atcCodes?: ATCCode[];
  termType: string;
}

interface ATCCode {
  code: string;
  name: string;
  level: number;
}

interface Ingredient {
  rxcui: string;
  name: string;
  strength?: string;
}

class RxNavServer {
  private server: Server;
  private baseUrl = "https://rxnav.nlm.nih.gov/REST";
  private maxRetries = 3;
  private retryDelay = 1000; // 1 second
  private enableLogging = process.env.RXNAV_DEBUG === 'true';

  constructor() {
    this.server = new Server(
      {
        name: "rxnav-drug-terminology",
        version: "0.1.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
    
    // Error handling
    this.server.onerror = (error) => {
      this.log("error", "MCP Server Error", error);
      console.error("[MCP Error]", error);
    };
    
    process.on("SIGINT", async () => {
      this.log("info", "Shutting down RxNav MCP server");
      await this.server.close();
      process.exit(0);
    });
    
    process.on("uncaughtException", (error) => {
      this.log("error", "Uncaught Exception", error);
      console.error("[Uncaught Exception]", error);
      process.exit(1);
    });
    
    process.on("unhandledRejection", (reason, promise) => {
      this.log("error", "Unhandled Rejection", { reason, promise });
      console.error("[Unhandled Rejection]", reason);
    });
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: "search_drug_by_name",
          description: "Search for drug information by name using RxNav API. Returns RxNorm concept information including RXCUI and related drug details.",
          inputSchema: {
            type: "object",
            properties: {
              drug_name: {
                type: "string",
                description: "Name of the drug to search for. Can be brand name, generic name, or ingredient name."
              },
              limit: {
                type: "number",
                description: "Maximum number of results to return",
                default: 10,
                minimum: 1,
                maximum: 50
              }
            },
            required: ["drug_name"]
          }
        },
        {
          name: "get_generic_name",
          description: "Get the generic name(s) for a given drug name or RxCUI. Converts brand names to their corresponding generic names.",
          inputSchema: {
            type: "object",
            properties: {
              drug_identifier: {
                type: "string",
                description: "Drug name (brand or generic) or RxCUI to get generic name for"
              }
            },
            required: ["drug_identifier"]
          }
        },
        {
          name: "get_brand_names",
          description: "Get brand names for a given generic drug name. Returns all commercial brand names associated with the generic drug.",
          inputSchema: {
            type: "object",
            properties: {
              generic_name: {
                type: "string",
                description: "Generic drug name to find brand names for"
              }
            },
            required: ["generic_name"]
          }
        },
        {
          name: "get_atc_classification",
          description: "Get ATC (Anatomical Therapeutic Chemical) classification codes for a given drug name or RxCUI. Returns WHO ATC classification hierarchy information.",
          inputSchema: {
            type: "object",
            properties: {
              drug_identifier: {
                type: "string",
                description: "Drug name (brand or generic) or RxCUI to get ATC classification for"
              }
            },
            required: ["drug_identifier"]
          }
        },
        {
          name: "get_drug_ingredients",
          description: "Get active ingredients for a given drug name or RxCUI. Returns ingredient information including strength and dosage form details.",
          inputSchema: {
            type: "object",
            properties: {
              drug_identifier: {
                type: "string",
                description: "Drug name (brand or generic) or RxCUI to get ingredients for"
              }
            },
            required: ["drug_identifier"]
          }
        }
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: rawArgs } = request.params;

      // Handle cases where arguments are double-encoded as a JSON string
      let args: any;
      if (typeof rawArgs === 'string') {
        try {
          args = JSON.parse(rawArgs);
        } catch (e) {
          throw new McpError(
            ErrorCode.InvalidParams,
            'Failed to parse arguments string: ' + (e as Error).message
          );
        }
      } else {
        args = rawArgs;
      }

      if (!args) {
        throw new McpError(
          ErrorCode.InvalidParams,
          "Missing arguments"
        );
      }

      try {
        this.log('info', `Executing tool: ${name}`, { arguments: args });
        
        switch (name) {
          case "search_drug_by_name":
            const searchParams = DrugSearchParamsSchema.parse(args);
            this.validateDrugIdentifier(searchParams.drug_name);
            return await this.searchDrugByName(searchParams.drug_name, searchParams.limit || 10);
          
          case "get_generic_name":
            const genericParams = DrugIdentifierParamsSchema.parse(args);
            this.validateDrugIdentifier(genericParams.drug_identifier);
            return await this.getGenericName(genericParams.drug_identifier);
          
          case "get_brand_names":
            const brandParams = GenericNameParamsSchema.parse(args);
            this.validateDrugIdentifier(brandParams.generic_name);
            return await this.getBrandNames(brandParams.generic_name);
          
          case "get_atc_classification":
            const atcParams = DrugIdentifierParamsSchema.parse(args);
            this.validateDrugIdentifier(atcParams.drug_identifier);
            return await this.getATCClassification(atcParams.drug_identifier);
          
          case "get_drug_ingredients":
            const ingredientParams = DrugIdentifierParamsSchema.parse(args);
            this.validateDrugIdentifier(ingredientParams.drug_identifier);
            return await this.getDrugIngredients(ingredientParams.drug_identifier);
          
          default:
            this.log('error', `Unknown tool requested: ${name}`);
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${name}`
            );
        }
      } catch (error) {
        this.log('error', `Tool execution failed: ${name}`, { 
          error: error instanceof Error ? error.message : String(error),
          arguments: args 
        });
        
        if (error instanceof McpError) {
          throw error;
        }
        
        // Handle Zod validation errors
        if (error && typeof error === 'object' && 'issues' in error) {
          const zodError = error as any;
          const issues = zodError.issues.map((issue: any) => 
            `${issue.path.join('.')}: ${issue.message}`
          ).join(', ');
          throw new McpError(
            ErrorCode.InvalidParams,
            `Parameter validation failed: ${issues}`
          );
        }
        
        throw new McpError(
          ErrorCode.InternalError,
          `Error executing tool ${name}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    });
  }

  private async makeRxNavRequest(endpoint: string, retryCount = 0): Promise<any> {
    const url = `${this.baseUrl}${endpoint}`;
    
    this.log('info', `Making RxNav API request`, { url, attempt: retryCount + 1 });
    
    try {
      // Create AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        this.log('warn', 'Request timeout, aborting', { url });
        controller.abort();
      }, 30000); // 30 seconds timeout
      
      const startTime = Date.now();
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'RxNav-MCP-Server/0.1.0'
        },
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      const duration = Date.now() - startTime;
      
      this.log('info', `RxNav API response received`, { 
        url, 
        status: response.status, 
        duration: `${duration}ms` 
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        const errorMessage = `RxNav API error (${response.status}): ${errorText}`;
        this.log('error', errorMessage, { url, status: response.status });
        throw new Error(errorMessage);
      }

      const data = await response.json();
      this.log('info', `RxNav API request successful`, { 
        url, 
        hasData: !!data,
        duration: `${duration}ms`
      });
      
      return data;
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log('error', `RxNav API request failed (attempt ${retryCount + 1})`, { 
        url, 
        error: errorMessage,
        retryCount 
      });
      
      // Retry logic for network errors
      if (retryCount < this.maxRetries && this.isRetryableError(error)) {
        const delay = this.retryDelay * Math.pow(2, retryCount); // Exponential backoff
        this.log('info', `Retrying request after delay`, { url, delay: `${delay}ms` });
        await this.sleep(delay);
        return this.makeRxNavRequest(endpoint, retryCount + 1);
      }
      
      // Final failure
      this.log('error', `RxNav API request failed permanently`, { 
        url, 
        totalAttempts: retryCount + 1,
        error: errorMessage 
      });
      
      throw new McpError(
        ErrorCode.InternalError,
        `RxNav API request failed after ${retryCount + 1} attempts: ${errorMessage}`
      );
    }
  }

  private isRetryableError(error: any): boolean {
    // Retry on network errors, timeouts, and 5xx server errors
    return error.code === 'ECONNRESET' || 
           error.code === 'ETIMEDOUT' || 
           error.message.includes('timeout') ||
           (error.message.includes('500') || error.message.includes('502') || 
            error.message.includes('503') || error.message.includes('504'));
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private log(level: 'info' | 'warn' | 'error', message: string, data?: any): void {
    if (!this.enableLogging && level !== 'error') return;
    
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      ...(data && { data })
    };
    
    if (level === 'error') {
      console.error(`[${timestamp}] [${level.toUpperCase()}] ${message}`, data || '');
    } else if (this.enableLogging) {
      console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`, data || '');
    }
  }

  private validateDrugIdentifier(identifier: string): void {
    if (!identifier || typeof identifier !== 'string') {
      throw new McpError(
        ErrorCode.InvalidParams,
        "Drug identifier must be a non-empty string"
      );
    }
    
    if (identifier.trim().length === 0) {
      throw new McpError(
        ErrorCode.InvalidParams,
        "Drug identifier cannot be empty or whitespace only"
      );
    }
    
    if (identifier.length > 200) {
      throw new McpError(
        ErrorCode.InvalidParams,
        "Drug identifier is too long (maximum 200 characters)"
      );
    }
  }

  private async getGenericName(drugIdentifier: string) {
    try {
      // First, try to get RxCUI if drugIdentifier is a drug name
      let rxcui = drugIdentifier;
      
      // Check if drugIdentifier is already an RxCUI (numeric)
      if (!/^\d+$/.test(drugIdentifier)) {
        // It's a drug name, need to find RxCUI first
        const searchEndpoint = `/drugs.json?name=${encodeURIComponent(drugIdentifier)}`;
        const searchData = await this.makeRxNavRequest(searchEndpoint);
        
        if (!searchData.drugGroup || !searchData.drugGroup.conceptGroup) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  query: drugIdentifier,
                  message: "No drug found matching the identifier",
                  generic_names: []
                }, null, 2)
              }
            ]
          };
        }
        
        // Get the first available RxCUI
        for (const group of searchData.drugGroup.conceptGroup) {
          if (group.conceptProperties && group.conceptProperties.length > 0) {
            rxcui = group.conceptProperties[0].rxcui;
            break;
          }
        }
      }
      
      // Now get related concepts to find generic names (IN = Ingredient, PIN = Precise Ingredient)
      const relatedEndpoint = `/rxcui/${rxcui}/related.json?tty=IN+PIN`;
      const relatedData = await this.makeRxNavRequest(relatedEndpoint);
      
      const genericNames: Array<{rxcui: string, name: string, termType: string}> = [];
      
      if (relatedData.relatedGroup && relatedData.relatedGroup.conceptGroup) {
        for (const group of relatedData.relatedGroup.conceptGroup) {
          if (group.conceptProperties) {
            for (const concept of group.conceptProperties) {
              genericNames.push({
                rxcui: concept.rxcui,
                name: concept.name,
                termType: concept.tty
              });
            }
          }
        }
      }
      
      // If no generic names found through related concepts, try to get properties
      if (genericNames.length === 0) {
        const propsEndpoint = `/rxcui/${rxcui}/allProperties.json?prop=all`;
        const propsData = await this.makeRxNavRequest(propsEndpoint);
        
        if (propsData.propConceptGroup && propsData.propConceptGroup.propConcept) {
          for (const prop of propsData.propConceptGroup.propConcept) {
            if (prop.propName === 'RxNorm Name' || prop.propName === 'Generic Name') {
              genericNames.push({
                rxcui: rxcui,
                name: prop.propValue,
                termType: 'GENERIC'
              });
            }
          }
        }
      }
      
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              query: drugIdentifier,
              rxcui: rxcui,
              generic_names: genericNames,
              total_found: genericNames.length
            }, null, 2)
          }
        ]
      };
      
    } catch (error) {
      console.error("Error getting generic name:", error);
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to get generic name for "${drugIdentifier}": ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private async getBrandNames(genericName: string) {
    try {
      // First, search for the generic drug to get its RxCUI
      const searchEndpoint = `/drugs.json?name=${encodeURIComponent(genericName)}`;
      const searchData = await this.makeRxNavRequest(searchEndpoint);
      
      if (!searchData.drugGroup || !searchData.drugGroup.conceptGroup) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                query: genericName,
                message: "No generic drug found matching the name",
                brand_names: []
              }, null, 2)
            }
          ]
        };
      }
      
      // Find the generic ingredient RxCUI (look for IN or PIN term types)
      let genericRxcui = null;
      for (const group of searchData.drugGroup.conceptGroup) {
        if (group.tty === 'IN' || group.tty === 'PIN') {
          if (group.conceptProperties && group.conceptProperties.length > 0) {
            genericRxcui = group.conceptProperties[0].rxcui;
            break;
          }
        }
      }
      
      // If no specific generic found, use the first available RxCUI
      if (!genericRxcui) {
        for (const group of searchData.drugGroup.conceptGroup) {
          if (group.conceptProperties && group.conceptProperties.length > 0) {
            genericRxcui = group.conceptProperties[0].rxcui;
            break;
          }
        }
      }
      
      if (!genericRxcui) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                query: genericName,
                message: "Could not find RxCUI for the generic drug",
                brand_names: []
              }, null, 2)
            }
          ]
        };
      }
      
      // Get related brand names (SBD = Semantic Branded Drug, BPCK = Branded Pack)
      const relatedEndpoint = `/rxcui/${genericRxcui}/related.json?tty=SBD+BPCK+BN`;
      const relatedData = await this.makeRxNavRequest(relatedEndpoint);
      
      const brandNames: Array<{rxcui: string, name: string, termType: string}> = [];
      
      if (relatedData.relatedGroup && relatedData.relatedGroup.conceptGroup) {
        for (const group of relatedData.relatedGroup.conceptGroup) {
          if (group.conceptProperties) {
            for (const concept of group.conceptProperties) {
              brandNames.push({
                rxcui: concept.rxcui,
                name: concept.name,
                termType: concept.tty
              });
            }
          }
        }
      }
      
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              query: genericName,
              generic_rxcui: genericRxcui,
              brand_names: brandNames,
              total_found: brandNames.length
            }, null, 2)
          }
        ]
      };
      
    } catch (error) {
      console.error("Error getting brand names:", error);
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to get brand names for "${genericName}": ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private async getATCClassification(drugIdentifier: string) {
    try {
      // First, try to get RxCUI if drugIdentifier is a drug name
      let rxcui = drugIdentifier;
      
      // Check if drugIdentifier is already an RxCUI (numeric)
      if (!/^\d+$/.test(drugIdentifier)) {
        // It's a drug name, need to find RxCUI first
        const searchEndpoint = `/drugs.json?name=${encodeURIComponent(drugIdentifier)}`;
        const searchData = await this.makeRxNavRequest(searchEndpoint);
        
        if (!searchData.drugGroup || !searchData.drugGroup.conceptGroup) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  query: drugIdentifier,
                  message: "No drug found matching the identifier",
                  atc_codes: []
                }, null, 2)
              }
            ]
          };
        }
        
        // Get the first available RxCUI
        for (const group of searchData.drugGroup.conceptGroup) {
          if (group.conceptProperties && group.conceptProperties.length > 0) {
            rxcui = group.conceptProperties[0].rxcui;
            break;
          }
        }
      }
      
      // Get ATC properties for the RxCUI
      const atcEndpoint = `/rxcui/${rxcui}/property.json?propName=ATC`;
      const atcData = await this.makeRxNavRequest(atcEndpoint);
      
      const atcCodes: Array<{code: string, name?: string, level: number}> = [];
      
      if (atcData.propConceptGroup && atcData.propConceptGroup.propConcept) {
        for (const prop of atcData.propConceptGroup.propConcept) {
          if (prop.propName === 'ATC') {
            const atcCode = prop.propValue;
            const level = this.getATCLevel(atcCode);
            atcCodes.push({
              code: atcCode,
              level: level,
              name: this.getATCLevelName(level)
            });
          }
        }
      }
      
      // If no ATC codes found directly, try to get them through related ingredients
      if (atcCodes.length === 0) {
        const relatedEndpoint = `/rxcui/${rxcui}/related.json?tty=IN+PIN`;
        const relatedData = await this.makeRxNavRequest(relatedEndpoint);
        
        if (relatedData.relatedGroup && relatedData.relatedGroup.conceptGroup) {
          for (const group of relatedData.relatedGroup.conceptGroup) {
            if (group.conceptProperties) {
              for (const concept of group.conceptProperties) {
                // Try to get ATC for each ingredient
                const ingredientATCEndpoint = `/rxcui/${concept.rxcui}/property.json?propName=ATC`;
                try {
                  const ingredientATCData = await this.makeRxNavRequest(ingredientATCEndpoint);
                  
                  if (ingredientATCData.propConceptGroup && ingredientATCData.propConceptGroup.propConcept) {
                    for (const prop of ingredientATCData.propConceptGroup.propConcept) {
                      if (prop.propName === 'ATC') {
                        const atcCode = prop.propValue;
                        const level = this.getATCLevel(atcCode);
                        atcCodes.push({
                          code: atcCode,
                          level: level,
                          name: this.getATCLevelName(level)
                        });
                      }
                    }
                  }
                } catch (error) {
                  // Continue if individual ingredient ATC lookup fails
                  console.log(`Failed to get ATC for ingredient ${concept.rxcui}: ${error}`);
                }
              }
            }
          }
        }
      }
      
      // Remove duplicates
      const uniqueATCCodes = atcCodes.filter((code, index, self) => 
        index === self.findIndex(c => c.code === code.code)
      );
      
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              query: drugIdentifier,
              rxcui: rxcui,
              atc_codes: uniqueATCCodes,
              total_found: uniqueATCCodes.length
            }, null, 2)
          }
        ]
      };
      
    } catch (error) {
      console.error("Error getting ATC classification:", error);
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to get ATC classification for "${drugIdentifier}": ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private getATCLevel(atcCode: string): number {
    // ATC codes have different levels based on their length
    // Level 1: 1 character (Anatomical main group)
    // Level 2: 2 characters (Therapeutic subgroup)
    // Level 3: 3 characters (Pharmacological subgroup)
    // Level 4: 4 characters (Chemical subgroup)
    // Level 5: 7 characters (Chemical substance)
    
    if (!atcCode) return 0;
    
    const length = atcCode.length;
    if (length === 1) return 1;
    if (length === 2) return 2;
    if (length === 3) return 3;
    if (length === 4) return 4;
    if (length === 7) return 5;
    
    return 0; // Unknown level
  }

  private getATCLevelName(level: number): string {
    switch (level) {
      case 1: return "Anatomical main group";
      case 2: return "Therapeutic subgroup";
      case 3: return "Pharmacological subgroup";
      case 4: return "Chemical subgroup";
      case 5: return "Chemical substance";
      default: return "Unknown level";
    }
  }

  private async getDrugIngredients(drugIdentifier: string) {
    try {
      // First, try to get RxCUI if drugIdentifier is a drug name
      let rxcui = drugIdentifier;
      
      // Check if drugIdentifier is already an RxCUI (numeric)
      if (!/^\d+$/.test(drugIdentifier)) {
        // It's a drug name, need to find RxCUI first
        const searchEndpoint = `/drugs.json?name=${encodeURIComponent(drugIdentifier)}`;
        const searchData = await this.makeRxNavRequest(searchEndpoint);
        
        if (!searchData.drugGroup || !searchData.drugGroup.conceptGroup) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  query: drugIdentifier,
                  message: "No drug found matching the identifier",
                  ingredients: []
                }, null, 2)
              }
            ]
          };
        }
        
        // Get the first available RxCUI
        for (const group of searchData.drugGroup.conceptGroup) {
          if (group.conceptProperties && group.conceptProperties.length > 0) {
            rxcui = group.conceptProperties[0].rxcui;
            break;
          }
        }
      }
      
      // Get related ingredients (IN = Ingredient, PIN = Precise Ingredient)
      const relatedEndpoint = `/rxcui/${rxcui}/related.json?tty=IN+PIN`;
      const relatedData = await this.makeRxNavRequest(relatedEndpoint);
      
      const ingredients: Array<{
        rxcui: string, 
        name: string, 
        termType: string,
        strength?: string,
        dosageForm?: string
      }> = [];
      
      if (relatedData.relatedGroup && relatedData.relatedGroup.conceptGroup) {
        for (const group of relatedData.relatedGroup.conceptGroup) {
          if (group.conceptProperties) {
            for (const concept of group.conceptProperties) {
              const ingredient: {
                rxcui: string, 
                name: string, 
                termType: string,
                strength?: string,
                dosageForm?: string
              } = {
                rxcui: concept.rxcui,
                name: concept.name,
                termType: concept.tty
              };
              
              // Try to get additional properties like strength
              try {
                const propsEndpoint = `/rxcui/${concept.rxcui}/allProperties.json?prop=all`;
                const propsData = await this.makeRxNavRequest(propsEndpoint);
                
                if (propsData.propConceptGroup && propsData.propConceptGroup.propConcept) {
                  for (const prop of propsData.propConceptGroup.propConcept) {
                    if (prop.propName === 'Strength') {
                      ingredient.strength = prop.propValue;
                    } else if (prop.propName === 'Dose Form') {
                      ingredient.dosageForm = prop.propValue;
                    }
                  }
                }
              } catch (error) {
                // Continue if properties lookup fails
                console.log(`Failed to get properties for ingredient ${concept.rxcui}: ${error}`);
              }
              
              ingredients.push(ingredient);
            }
          }
        }
      }
      
      // If no ingredients found through related concepts, try to get them through allRelated
      if (ingredients.length === 0) {
        const allRelatedEndpoint = `/rxcui/${rxcui}/allrelated.json`;
        const allRelatedData = await this.makeRxNavRequest(allRelatedEndpoint);
        
        if (allRelatedData.allRelatedGroup && allRelatedData.allRelatedGroup.conceptGroup) {
          for (const group of allRelatedData.allRelatedGroup.conceptGroup) {
            if ((group.tty === 'IN' || group.tty === 'PIN') && group.conceptProperties) {
              for (const concept of group.conceptProperties) {
                ingredients.push({
                  rxcui: concept.rxcui,
                  name: concept.name,
                  termType: concept.tty
                });
              }
            }
          }
        }
      }
      
      // Remove duplicates based on rxcui
      const uniqueIngredients = ingredients.filter((ingredient, index, self) => 
        index === self.findIndex(i => i.rxcui === ingredient.rxcui)
      );
      
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              query: drugIdentifier,
              rxcui: rxcui,
              ingredients: uniqueIngredients,
              total_found: uniqueIngredients.length
            }, null, 2)
          }
        ]
      };
      
    } catch (error) {
      console.error("Error getting drug ingredients:", error);
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to get ingredients for "${drugIdentifier}": ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private async searchDrugByName(drugName: string, limit: number) {
    try {
      // Use RxNav drugs API to search for drug by name
      const endpoint = `/drugs.json?name=${encodeURIComponent(drugName)}`;
      const data = await this.makeRxNavRequest(endpoint);
      
      if (!data.drugGroup || !data.drugGroup.conceptGroup) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                query: drugName,
                message: "No drugs found matching the search criteria",
                results: []
              }, null, 2)
            }
          ]
        };
      }

      // Process and format the results
      const results: DrugInfo[] = [];
      
      for (const group of data.drugGroup.conceptGroup) {
        if (group.conceptProperties) {
          for (const concept of group.conceptProperties.slice(0, limit)) {
            const drugInfo: DrugInfo = {
              rxcui: concept.rxcui,
              name: concept.name,
              termType: concept.tty || group.tty,
            };
            
            // Add synonym if available
            if (concept.synonym) {
              drugInfo.name = `${concept.name} (${concept.synonym})`;
            }
            
            results.push(drugInfo);
          }
        }
      }

      // Limit results to requested number
      const limitedResults = results.slice(0, limit);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              query: drugName,
              total_found: results.length,
              returned_count: limitedResults.length,
              results: limitedResults
            }, null, 2)
          }
        ]
      };
      
    } catch (error) {
      console.error("Error searching drug by name:", error);
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to search for drug "${drugName}": ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("RxNav Drug Terminology MCP server running on stdio");
  }
}

const server = new RxNavServer();
server.run().catch(console.error);
