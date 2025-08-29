#!/bin/bash

# OpenFDA MCP Server启动脚本
# 用于在Ubuntu服务器上启动MCP服务器

set -e

# 配置变量
MCP_DIR="/opt/mcp-openfda"
LOG_FILE="/var/log/mcp-openfda.log"
PID_FILE="/var/run/mcp-openfda.pid"

# 创建日志目录
sudo mkdir -p /var/log
sudo touch $LOG_FILE
sudo chmod 666 $LOG_FILE

# 函数：检查Node.js是否安装
check_nodejs() {
    if ! command -v node &> /dev/null; then
        echo "Node.js未安装，正在安装..."
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
        sudo apt-get install -y nodejs
    fi
    echo "Node.js版本: $(node --version)"
}

# 函数：安装依赖
install_dependencies() {
    cd $MCP_DIR
    if [ ! -d "node_modules" ]; then
        echo "安装依赖..."
        npm install
    fi
    
    # 构建项目
    if [ ! -d "dist" ] || [ "src/index.ts" -nt "dist/index.js" ]; then
        echo "构建项目..."
        npm run build
    fi
}

# 函数：启动MCP服务器
start_mcp() {
    cd $MCP_DIR
    
    # 检查是否已经在运行
    if [ -f $PID_FILE ]; then
        PID=$(cat $PID_FILE)
        if ps -p $PID > /dev/null 2>&1; then
            echo "MCP服务器已在运行 (PID: $PID)"
            return 0
        else
            rm -f $PID_FILE
        fi
    fi
    
    echo "启动OpenFDA MCP服务器..."
    echo "$(date): 启动MCP服务器" >> $LOG_FILE
    
    # 启动服务器并记录PID
    nohup node dist/index.js >> $LOG_FILE 2>&1 &
    echo $! > $PID_FILE
    
    echo "MCP服务器已启动 (PID: $!)"
    echo "日志文件: $LOG_FILE"
}

# 函数：停止MCP服务器
stop_mcp() {
    if [ -f $PID_FILE ]; then
        PID=$(cat $PID_FILE)
        if ps -p $PID > /dev/null 2>&1; then
            echo "停止MCP服务器 (PID: $PID)..."
            kill $PID
            rm -f $PID_FILE
            echo "MCP服务器已停止"
        else
            echo "MCP服务器未运行"
            rm -f $PID_FILE
        fi
    else
        echo "MCP服务器未运行"
    fi
}

# 函数：检查状态
status_mcp() {
    if [ -f $PID_FILE ]; then
        PID=$(cat $PID_FILE)
        if ps -p $PID > /dev/null 2>&1; then
            echo "MCP服务器正在运行 (PID: $PID)"
            return 0
        else
            echo "MCP服务器未运行 (PID文件存在但进程不存在)"
            rm -f $PID_FILE
            return 1
        fi
    else
        echo "MCP服务器未运行"
        return 1
    fi
}

# 主逻辑
case "${1:-start}" in
    start)
        check_nodejs
        install_dependencies
        start_mcp
        ;;
    stop)
        stop_mcp
        ;;
    restart)
        stop_mcp
        sleep 2
        check_nodejs
        install_dependencies
        start_mcp
        ;;
    status)
        status_mcp
        ;;
    logs)
        tail -f $LOG_FILE
        ;;
    test)
        # 测试MCP服务器是否响应
        echo "测试MCP服务器..."
        cd $MCP_DIR
        echo '{"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}}' | node dist/index.js
        ;;
    *)
        echo "用法: $0 {start|stop|restart|status|logs|test}"
        echo "  start   - 启动MCP服务器"
        echo "  stop    - 停止MCP服务器"
        echo "  restart - 重启MCP服务器"
        echo "  status  - 检查服务器状态"
        echo "  logs    - 查看日志"
        echo "  test    - 测试服务器响应"
        exit 1
        ;;
esac
