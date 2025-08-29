# RxNav MCP Server

一个用于查询RxNav API的MCP（Model Context Protocol）服务器，专为药物术语标准化和药名归一化设计。

## 功能特性

- **药物名称搜索**: 通过药物名称搜索获取RxNorm标准化信息
- **通用名转换**: 实现商品名与通用名的相互转换
- **ATC分类查询**: 获取药物的ATC分类代码和层级信息
- **成分查询**: 获取药物的活性成分信息

## 可用工具

### 1. search_drug_by_name
通过药物名称搜索RxNorm概念信息。

**参数:**
- `drug_name` (string, 必需): 药物名称
- `limit` (number): 返回记录数限制 (1-50)

### 2. get_generic_name
获取药物的通用名信息。

**参数:**
- `drug_name` (string, 必需): 药物名称或RxCUI

### 3. get_brand_names
获取通用名对应的商品名列表。

**参数:**
- `generic_name` (string, 必需): 通用名

### 4. get_atc_classification
获取药物的ATC分类代码。

**参数:**
- `drug_identifier` (string, 必需): 药物名称或RxCUI

### 5. get_drug_ingredients
获取药物的活性成分信息。

**参数:**
- `drug_identifier` (string, 必需): 药物名称或RxCUI

## 安装和运行

### 本地开发

```bash
# 安装依赖
npm install

# 开发模式运行
npm run dev

# 构建
npm run build

# 生产模式运行
npm start
```

### Ubuntu服务器部署

#### 1. 环境准备

```bash
# 更新系统
sudo apt update && sudo apt upgrade -y

# 安装Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 验证安装
node --version
npm --version
```

#### 2. 部署MCP服务器

```bash
# 创建项目目录
mkdir -p ~/mcp-servers/rxnav
cd ~/mcp-servers/rxnav

# 上传项目文件（使用scp或git clone）
# 方法1: 使用git
git clone <your-repo-url> .

# 方法2: 使用scp从本地上传
# scp -r /path/to/mcp-rxnav/* user@your-server:~/mcp-servers/rxnav/

# 安装依赖
npm install

# 构建项目
npm run build

# 测试运行
npm start
```

#### 3. 使用PM2管理进程（推荐）

```bash
# 全局安装PM2
sudo npm install -g pm2

# 创建PM2配置文件
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'mcp-rxnav',
    script: 'dist/index.js',
    cwd: '/home/ubuntu/mcp-servers/rxnav',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production'
    }
  }]
}
EOF

# 启动服务
pm2 start ecosystem.config.js

# 设置开机自启
pm2 startup
pm2 save

# 查看状态
pm2 status
pm2 logs mcp-rxnav
```

#### 4. 配置防火墙（如果需要网络访问）

```bash
# 如果需要通过网络访问，可以配置nginx反向代理
sudo apt install nginx

# 创建nginx配置
sudo tee /etc/nginx/sites-available/mcp-rxnav << 'EOF'
server {
    listen 80;
    server_name your-domain.com;  # 替换为你的域名或IP
    
    location / {
        proxy_pass http://localhost:3000;  # 如果MCP服务器监听3000端口
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
EOF

# 启用站点
sudo ln -s /etc/nginx/sites-available/mcp-rxnav /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

## 远程调用配置

### 方法1: 通过SSH隧道

在客户端机器上创建SSH隧道：

```bash
# 创建SSH隧道，将本地端口转发到服务器
ssh -L 3000:localhost:3000 user@your-server-ip

# 然后在MCP客户端配置中使用 localhost:3000
```

### 方法2: 网络MCP服务器

如果需要通过网络直接访问，需要修改MCP服务器以支持网络传输：

```typescript
// 在src/index.ts中添加网络传输支持
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";

// 替换stdio传输为网络传输
const transport = new SSEServerTransport("/message", response);
```

### 方法3: 使用Docker部署

```bash
# 创建Dockerfile
cat > Dockerfile << 'EOF'
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY dist/ ./dist/
COPY src/ ./src/

EXPOSE 3000

CMD ["npm", "start"]
EOF

# 构建和运行
docker build -t mcp-openfda .
docker run -d -p 3000:3000 --name mcp-openfda-server mcp-openfda
```

## 使用示例

### 在Claude Desktop中配置

在Claude Desktop的配置文件中添加：

```json
{
  "mcpServers": {
    "rxnav": {
      "command": "node",
      "args": ["/path/to/mcp-rxnav/dist/index.js"],
      "env": {}
    }
  }
}
```

### 远程服务器配置

```json
{
  "mcpServers": {
    "rxnav": {
      "command": "ssh",
      "args": [
        "user@your-server-ip",
        "cd ~/mcp-servers/rxnav && node dist/index.js"
      ],
      "env": {}
    }
  }
}
```

## API使用示例

```javascript
// 搜索阿司匹林的信息
await search_drug_by_name({
  drug_name: "aspirin",
  limit: 5
});

// 获取Advil的通用名
await get_generic_name({
  drug_identifier: "Advil"
});

// 查询布洛芬的商品名
await get_brand_names({
  generic_name: "ibuprofen"
});

// 获取阿司匹林的ATC分类
await get_atc_classification({
  drug_identifier: "aspirin"
});

// 查询泰诺的活性成分
await get_drug_ingredients({
  drug_identifier: "Tylenol"
});
```

## 环境变量

- `RXNAV_DEBUG`: 设置为 `true` 启用详细日志记录

## 注意事项

1. **API限制**: RxNav API有速率限制，建议合理控制请求频率
2. **数据准确性**: 返回的数据仅供参考，不应作为医疗建议
3. **网络安全**: 如果部署在公网，请确保适当的安全措施
4. **日志监控**: 建议配置日志监控以跟踪API使用情况
5. **错误处理**: 服务器包含完整的错误处理和重试机制

## 故障排除

### 常见问题

1. **连接失败**: 检查网络连接和防火墙设置
2. **权限错误**: 确保Node.js进程有适当的文件权限
3. **端口冲突**: 检查端口是否被其他服务占用

### 日志查看

```bash
# PM2日志
pm2 logs mcp-openfda

# 系统日志
sudo journalctl -u nginx -f
```

## 许可证

MIT License
