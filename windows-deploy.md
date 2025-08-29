# Windows环境下使用AWS私钥部署OpenFDA MCP服务器

## 🔑 使用现有AWS私钥配置

### 1. 测试SSH连接

```powershell
# 测试SSH连接（使用你的AWS私钥）
ssh -i "C:\Users\Nanao\.ssh\aws.pem" ubuntu@ec2-54-254-51-89.ap-southeast-1.compute.amazonaws.com

# 测试执行远程命令
ssh -i "C:\Users\Nanao\.ssh\aws.pem" ubuntu@ec2-54-254-51-89.ap-southeast-1.compute.amazonaws.com "echo 'SSH连接成功'"
```

### 2. 在服务器上部署MCP项目

```powershell
# 连接到服务器
ssh -i "C:\Users\Nanao\.ssh\aws.pem" ubuntu@ec2-54-254-51-89.ap-southeast-1.compute.amazonaws.com

# 在服务器上执行以下命令：
sudo mkdir -p /opt/mcp-openfda
sudo chown ubuntu:ubuntu /opt/mcp-openfda
cd /opt/mcp-openfda

# 安装Node.js（如果未安装）
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 创建package.json
cat > package.json << 'EOF'
{
  "name": "mcp-openfda",
  "version": "0.1.0",
  "description": "MCP server for OpenFDA Drug Label API",
  "main": "dist/index.js",
  "type": "module",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.2.0",
    "zod": "^3.22.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.0.0"
  }
}
EOF

# 创建tsconfig.json
cat > tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "node",
    "allowSyntheticDefaultImports": true,
    "esModuleInterop": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
EOF

# 创建src目录
mkdir -p src
```

### 3. 上传MCP服务器代码

你可以选择以下方法之一：

#### 方法A: 使用scp上传文件
```powershell
# 从Windows上传文件到服务器
scp -i "C:\Users\Nanao\.ssh\aws.pem" "c:\Users\Nanao\Desktop\Documents\Commercial\temp\mcp-openfda\src\index.ts" ubuntu@ec2-54-254-51-89.ap-southeast-1.compute.amazonaws.com:/opt/mcp-openfda/src/

scp -i "C:\Users\Nanao\.ssh\aws.pem" "c:\Users\Nanao\Desktop\Documents\Commercial\temp\mcp-openfda\start-mcp.sh" ubuntu@ec2-54-254-51-89.ap-southeast-1.compute.amazonaws.com:/opt/mcp-openfda/
```

#### 方法B: 直接在服务器上创建文件
```bash
# 在SSH连接中创建index.ts文件
cat > src/index.ts << 'EOF'
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

const DrugLabelSearchParamsSchema = z.object({
  search: z.string().optional(),
  count: z.string().optional(),
  skip: z.number().optional(),
  limit: z.number().optional()
});

type DrugLabelSearchParams = z.infer<typeof DrugLabelSearchParamsSchema>;

const DrugQueryParamsSchema = z.object({
  drug_name: z.string(),
  limit: z.number().optional()
});

type DrugQueryParams = z.infer<typeof DrugQueryParamsSchema>;

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

class OpenFDAServer {
  private server: Server;
  private baseUrl = "https://api.fda.gov/drug/label.json";

  constructor() {
    this.server = new Server(
      {
        name: "openfda-drug-label",
        version: "0.1.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
    
    this.server.onerror = (error) => console.error("[MCP Error]", error);
    process.on("SIGINT", async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: "search_drug_labels",
          description: "Search FDA drug labels using OpenFDA API",
          inputSchema: {
            type: "object",
            properties: {
              search: {
                type: "string",
                description: "Search query"
              },
              limit: {
                type: "number",
                description: "Maximum number of records",
                default: 10
              }
            }
          }
        },
        {
          name: "get_drug_adverse_reactions",
          description: "Get adverse reactions for a drug",
          inputSchema: {
            type: "object",
            properties: {
              drug_name: {
                type: "string",
                description: "Name of the drug"
              },
              limit: {
                type: "number",
                description: "Maximum number of records",
                default: 5
              }
            },
            required: ["drug_name"]
          }
        }
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      if (!args) {
        throw new McpError(ErrorCode.InvalidParams, "Missing arguments");
      }

      try {
        switch (name) {
          case "search_drug_labels":
            const searchParams = DrugLabelSearchParamsSchema.parse(args);
            return await this.searchDrugLabels(searchParams);
          
          case "get_drug_adverse_reactions":
            const adverseParams = DrugQueryParamsSchema.parse(args);
            return await this.getDrugAdverseReactions(adverseParams.drug_name, adverseParams.limit || 5);
          
          default:
            throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
        }
      } catch (error) {
        if (error instanceof McpError) {
          throw error;
        }
        throw new McpError(ErrorCode.InternalError, `Error: ${error}`);
      }
    });
  }

  private async makeRequest(params: DrugLabelSearchParams): Promise<OpenFDAResponse> {
    const url = new URL(this.baseUrl);
    
    if (params.search) {
      url.searchParams.set("search", params.search);
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

  private async searchDrugLabels(params: DrugLabelSearchParams) {
    const data = await this.makeRequest(params);
    
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            meta: data.meta,
            results_count: data.results?.length || 0,
            results: data.results || []
          }, null, 2)
        }
      ]
    };
  }

  private async getDrugAdverseReactions(drugName: string, limit: number) {
    const searchQuery = `openfda.brand_name:"${drugName}" OR openfda.generic_name:"${drugName}"`;
    
    const data = await this.makeRequest({
      search: searchQuery,
      limit: limit
    });

    const adverseReactions = data.results?.map(result => ({
      drug_name: result.openfda?.brand_name?.[0] || result.openfda?.generic_name?.[0] || "Unknown",
      adverse_reactions: result.adverse_reactions || []
    })) || [];

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            query: drugName,
            adverse_reactions_data: adverseReactions
          }, null, 2)
        }
      ]
    };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("OpenFDA Drug Label MCP server running on stdio");
  }
}

const server = new OpenFDAServer();
server.run().catch(console.error);
EOF
```

### 4. 构建和测试

```bash
# 在服务器上继续执行
npm install
npm run build

# 测试MCP服务器
echo '{"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}}' | node dist/index.js
```

## 📋 Claude Desktop配置

将以下配置添加到Claude Desktop的配置文件中：

```json
{
  "mcpServers": {
    "openfda": {
      "command": "ssh",
      "args": [
        "-i", "C:\\Users\\Nanao\\.ssh\\aws.pem",
        "-o", "ConnectTimeout=30",
        "-o", "ServerAliveInterval=60",
        "-o", "ServerAliveCountMax=3",
        "-o", "StrictHostKeyChecking=no",
        "ubuntu@ec2-54-254-51-89.ap-southeast-1.compute.amazonaws.com",
        "cd /opt/mcp-openfda && node dist/index.js"
      ],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

## 🧪 测试步骤

### 1. 测试SSH连接
```powershell
ssh -i "C:\Users\Nanao\.ssh\aws.pem" ubuntu@ec2-54-254-51-89.ap-southeast-1.compute.amazonaws.com "echo 'SSH连接正常'"
```

### 2. 测试MCP服务器
```powershell
ssh -i "C:\Users\Nanao\.ssh\aws.pem" ubuntu@ec2-54-254-51-89.ap-southeast-1.compute.amazonaws.com "cd /opt/mcp-openfda && echo '{\"jsonrpc\": \"2.0\", \"id\": 1, \"method\": \"tools/list\", \"params\": {}}' | node dist/index.js"
```

### 3. 测试完整MCP命令
```powershell
ssh -i "C:\Users\Nanao\.ssh\aws.pem" -o ConnectTimeout=30 ubuntu@ec2-54-254-51-89.ap-southeast-1.compute.amazonaws.com "cd /opt/mcp-openfda && node dist/index.js"
```

如果所有测试都通过，重启Claude Desktop并测试MCP连接。
