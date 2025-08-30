# OpenFDA HTTP API 服务器

这是一个基于 OpenFDA 数据的 HTTP API 服务器，专为 open-webui 等前端应用设计。

## 快速开始

### 1. 安装依赖
```bash
npm install
```

### 2. 构建项目
```bash
npm run build
```

### 3. 启动 HTTP 服务器
```bash
npm run start:http
```

服务器将在 `http://localhost:3000` 启动。

### 4. 开发模式
```bash
npm run dev:http
```

## API 端点

### OpenAPI 规范
- `GET /openapi.json` - 获取 OpenAPI 3.0 规范文档

### 药品查询端点

#### 1. 搜索药品标签
```
GET /drug-labels?search=aspirin&limit=10
```

#### 2. 获取药物不良反应
```
GET /drug/ibuprofen/adverse-reactions?limit=3
```

#### 3. 获取药物警告信息
```
GET /drug/tylenol/warnings?limit=3
```

#### 4. 获取药物适应症
```
GET /drug/aspirin/indications?limit=3
```

#### 5. 健康检查
```
GET /health
```

## 在 open-webui 中配置

1. 打开 open-webui 管理面板
2. 进入 **Admin > OpenAPI Servers**
3. 添加新的 OpenAPI 服务器：
   - **URL**: `http://localhost:3000/openapi.json`
   - **Name**: `OpenFDA Drug Labels`
4. 保存配置

配置完成后，open-webui 将自动识别所有可用的药品查询功能。

## 示例请求

### 搜索阿司匹林相关信息
```bash
curl "http://localhost:3000/drug-labels?search=aspirin&limit=5"
```

### 获取布洛芬的不良反应
```bash
curl "http://localhost:3000/drug/ibuprofen/adverse-reactions?limit=3"
```

### 获取泰诺的警告信息
```bash
curl "http://localhost:3000/drug/tylenol/warnings?limit=3"
```

## 参数限制

为了防止返回数据过多影响 LLM 性能，所有端点都有以下限制：
- 搜索端点：最多返回 100 条记录
- 特定药物查询：最多返回 10 条记录
- 默认返回数量已优化为较小值

## 环境变量

- `PORT`: 服务器端口（默认：3000）

## 错误处理

所有端点都包含适当的错误处理：
- 400: 请求参数错误
- 500: 服务器内部错误

## 技术栈

- Express.js - Web 框架
- Zod - 参数验证
- CORS - 跨域支持
- TypeScript - 类型安全

## 与 MCP 服务器的关系

此 HTTP 服务器与现有的 MCP 服务器（`src/index.ts`）共享相同的核心逻辑，但提供了 REST API 接口而不是 MCP 协议接口。两个服务可以同时运行：

- MCP 服务器：用于 Claude Desktop、DeepSeek 等 MCP 客户端
- HTTP 服务器：用于 open-webui 等支持 OpenAPI 的应用
