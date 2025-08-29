# OpenFDA MCP 服务器部署和故障排除指南

## 🚨 解决 MCP 连接超时问题

### 问题分析
你遇到的 "Request timed out" 错误通常由以下原因造成：
1. SSH连接配置问题
2. MCP服务器未正确启动
3. 权限问题
4. 网络连接问题

## 📋 完整部署步骤

### 1. 在Ubuntu服务器上部署

```bash
# 1. 连接到你的EC2服务器
ssh ubuntu@ec2-54-254-51-89.ap-southeast-1.compute.amazonaws.com

# 2. 创建项目目录
sudo mkdir -p /opt/mcp-openfda
sudo chown ubuntu:ubuntu /opt/mcp-openfda

# 3. 上传项目文件到服务器
# 方法A: 使用scp从本地上传
# scp -r /path/to/mcp-openfda/* ubuntu@ec2-54-254-51-89.ap-southeast-1.compute.amazonaws.com:/opt/mcp-openfda/

# 方法B: 使用git clone
cd /opt/mcp-openfda
# git clone <your-repo-url> .

# 4. 安装Node.js和依赖
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 5. 安装项目依赖
npm install

# 6. 构建项目
npm run build

# 7. 设置启动脚本权限
chmod +x start-mcp.sh

# 8. 测试MCP服务器
./start-mcp.sh test
```

### 2. 配置SSH密钥认证（重要）

```bash
# 在本地生成SSH密钥（如果还没有）
ssh-keygen -t rsa -b 4096 -C "your-email@example.com"

# 将公钥复制到服务器
ssh-copy-id ubuntu@ec2-54-254-51-89.ap-southeast-1.compute.amazonaws.com

# 测试无密码登录
ssh ubuntu@ec2-54-254-51-89.ap-southeast-1.compute.amazonaws.com "echo 'SSH连接成功'"
```

### 3. Claude Desktop配置

在Claude Desktop的配置文件中使用以下配置：

```json
{
  "mcpServers": {
    "openfda": {
      "command": "ssh",
      "args": [
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

## 🔧 故障排除步骤

### 步骤1: 验证SSH连接
```bash
# 测试基本SSH连接
ssh ubuntu@ec2-54-254-51-89.ap-southeast-1.compute.amazonaws.com "echo 'SSH连接正常'"

# 测试SSH执行远程命令
ssh ubuntu@ec2-54-254-51-89.ap-southeast-1.compute.amazonaws.com "cd /opt/mcp-openfda && ls -la"
```

### 步骤2: 检查MCP服务器状态
```bash
# 在服务器上检查MCP服务器
ssh ubuntu@ec2-54-254-51-89.ap-southeast-1.compute.amazonaws.com
cd /opt/mcp-openfda

# 检查构建是否成功
ls -la dist/

# 手动测试MCP服务器
echo '{"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}}' | node dist/index.js
```

### 步骤3: 检查权限和依赖
```bash
# 检查文件权限
ls -la /opt/mcp-openfda/
ls -la /opt/mcp-openfda/dist/

# 检查Node.js和npm版本
node --version
npm --version

# 重新安装依赖（如果需要）
cd /opt/mcp-openfda
rm -rf node_modules package-lock.json
npm install
npm run build
```

### 步骤4: 使用启动脚本
```bash
# 使用启动脚本管理MCP服务器
cd /opt/mcp-openfda

# 启动服务器
./start-mcp.sh start

# 检查状态
./start-mcp.sh status

# 查看日志
./start-mcp.sh logs

# 测试响应
./start-mcp.sh test
```

## 🔍 调试命令

### 详细调试SSH连接
```bash
# 使用详细模式连接SSH
ssh -v ubuntu@ec2-54-254-51-89.ap-southeast-1.compute.amazonaws.com

# 测试MCP命令执行
ssh ubuntu@ec2-54-254-51-89.ap-southeast-1.compute.amazonaws.com \
  "cd /opt/mcp-openfda && timeout 10 node dist/index.js"
```

### 检查网络和防火墙
```bash
# 在服务器上检查网络
ping -c 4 api.fda.gov

# 检查防火墙状态
sudo ufw status

# 如果需要，允许SSH连接
sudo ufw allow ssh
```

## 🚀 推荐的Claude Desktop配置

### 方法1: 直接SSH执行（推荐）
```json
{
  "mcpServers": {
    "openfda": {
      "command": "ssh",
      "args": [
        "-o", "ConnectTimeout=30",
        "-o", "ServerAliveInterval=60",
        "-o", "ServerAliveCountMax=3",
        "ubuntu@ec2-54-254-51-89.ap-southeast-1.compute.amazonaws.com",
        "cd /opt/mcp-openfda && node dist/index.js"
      ]
    }
  }
}
```

### 方法2: 使用启动脚本
```json
{
  "mcpServers": {
    "openfda": {
      "command": "ssh", 
      "args": [
        "ubuntu@ec2-54-254-51-89.ap-southeast-1.compute.amazonaws.com",
        "/opt/mcp-openfda/start-mcp.sh start && cd /opt/mcp-openfda && node dist/index.js"
      ]
    }
  }
}
```

## 📝 常见错误和解决方案

### 错误1: "Request timed out"
**原因**: SSH连接超时或MCP服务器响应慢
**解决**: 
- 检查SSH密钥配置
- 增加连接超时时间
- 确保MCP服务器正确构建

### 错误2: "Permission denied"
**原因**: SSH权限或文件权限问题
**解决**:
```bash
# 修复文件权限
sudo chown -R ubuntu:ubuntu /opt/mcp-openfda
chmod +x /opt/mcp-openfda/start-mcp.sh
```

### 错误3: "Module not found"
**原因**: 依赖未正确安装
**解决**:
```bash
cd /opt/mcp-openfda
rm -rf node_modules
npm install
npm run build
```

### 错误4: "Connection refused"
**原因**: 网络连接问题
**解决**:
- 检查EC2安全组设置
- 确保SSH端口(22)开放
- 检查网络连接

## 🎯 最终测试

完成部署后，运行以下测试确保一切正常：

```bash
# 1. 测试SSH连接
ssh ubuntu@ec2-54-254-51-89.ap-southeast-1.compute.amazonaws.com "echo 'SSH OK'"

# 2. 测试MCP服务器
ssh ubuntu@ec2-54-254-51-89.ap-southeast-1.compute.amazonaws.com \
  "cd /opt/mcp-openfda && echo '{\"jsonrpc\": \"2.0\", \"id\": 1, \"method\": \"tools/list\", \"params\": {}}' | timeout 10 node dist/index.js"

# 3. 重启Claude Desktop并测试MCP连接
```

如果所有测试都通过，你的MCP服务器应该能够正常工作了。
