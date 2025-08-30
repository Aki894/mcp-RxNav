#!/usr/bin/env node

/**
 * RxNav MCP Server 使用示例
 * 
 * 这个文件展示了如何使用RxNav MCP服务器的各种工具
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const serverPath = join(__dirname, '../dist/index.js');

class RxNavExample {
  constructor() {
    this.requestId = 1;
  }

  async startServer() {
    console.log('启动 RxNav MCP 服务器...');
    
    this.serverProcess = spawn('node', [serverPath], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // 等待服务器启动
    await new Promise(resolve => setTimeout(resolve, 2000));
    console.log('服务器启动成功\n');
  }

  async callTool(toolName, args) {
    const request = {
      jsonrpc: "2.0",
      id: this.requestId++,
      method: "tools/call",
      params: {
        name: toolName,
        arguments: args
      }
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`请求超时: ${toolName}`));
      }, 30000);

      let responseData = '';
      
      const onData = (data) => {
        responseData += data.toString();
        
        try {
          const lines = responseData.split('\n').filter(line => line.trim());
          for (const line of lines) {
            const response = JSON.parse(line);
            if (response.id === request.id) {
              clearTimeout(timeout);
              this.serverProcess.stdout.removeListener('data', onData);
              
              if (response.error) {
                reject(new Error(`MCP错误: ${response.error.message}`));
              } else {
                resolve(response.result);
              }
              return;
            }
          }
        } catch (e) {
          // 继续等待更多数据
        }
      };

      this.serverProcess.stdout.on('data', onData);
      this.serverProcess.stdin.write(JSON.stringify(request) + '\n');
    });
  }

  async stopServer() {
    if (this.serverProcess) {
      this.serverProcess.kill();
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  formatResult(result, title) {
    console.log(`\n=== ${title} ===`);
    const content = JSON.parse(result.content[0].text);
    console.log(JSON.stringify(content, null, 2));
    console.log('─'.repeat(50));
  }
}

async function runExamples() {
  const example = new RxNavExample();

  try {
    await example.startServer();

    console.log('🔍 RxNav MCP Server 使用示例');
    console.log('=' .repeat(50));

    // 示例1: 搜索常见药物
    console.log('\n📋 示例1: 药物名称搜索');
    
    let result = await example.callTool('search_drug_by_name', {
      drug_name: 'aspirin',
      limit: 3
    });
    example.formatResult(result, '阿司匹林搜索结果');

    result = await example.callTool('search_drug_by_name', {
      drug_name: 'ibuprofen',
      limit: 3
    });
    example.formatResult(result, '布洛芬搜索结果');

    // 示例2: 通用名转换
    console.log('\n🔄 示例2: 商品名转通用名');
    
    result = await example.callTool('get_generic_name', {
      drug_identifier: 'Advil'
    });
    example.formatResult(result, 'Advil的通用名');

    result = await example.callTool('get_generic_name', {
      drug_identifier: 'Tylenol'
    });
    example.formatResult(result, 'Tylenol的通用名');

    // 示例3: 获取商品名
    console.log('\n🏷️ 示例3: 通用名转商品名');
    
    result = await example.callTool('get_brand_names', {
      generic_name: 'ibuprofen'
    });
    example.formatResult(result, '布洛芬的商品名');

    result = await example.callTool('get_brand_names', {
      generic_name: 'acetaminophen'
    });
    example.formatResult(result, '对乙酰氨基酚的商品名');

    // 示例4: ATC分类查询
    console.log('\n🏥 示例4: ATC分类查询');
    
    result = await example.callTool('get_atc_classification', {
      drug_identifier: 'aspirin'
    });
    example.formatResult(result, '阿司匹林的ATC分类');

    result = await example.callTool('get_atc_classification', {
      drug_identifier: 'metformin'
    });
    example.formatResult(result, '二甲双胍的ATC分类');

    // 示例5: 药物成分查询
    console.log('\n🧪 示例5: 药物成分查询');
    
    result = await example.callTool('get_drug_ingredients', {
      drug_identifier: 'Tylenol'
    });
    example.formatResult(result, 'Tylenol的活性成分');

    result = await example.callTool('get_drug_ingredients', {
      drug_identifier: 'Advil'
    });
    example.formatResult(result, 'Advil的活性成分');

    // 示例6: 复杂药物查询
    console.log('\n💊 示例6: 复杂药物查询');
    
    result = await example.callTool('search_drug_by_name', {
      drug_name: 'lisinopril',
      limit: 5
    });
    example.formatResult(result, '赖诺普利搜索结果');

    result = await example.callTool('get_atc_classification', {
      drug_identifier: 'lisinopril'
    });
    example.formatResult(result, '赖诺普利的ATC分类');

    console.log('\n✅ 所有示例执行完成！');
    console.log('\n💡 使用提示:');
    console.log('- 药物名称可以是商品名、通用名或成分名');
    console.log('- 支持模糊匹配和拼写变体');
    console.log('- ATC分类提供WHO标准的药物分类信息');
    console.log('- 所有查询都基于RxNorm标准化数据库');

  } catch (error) {
    console.error('示例执行失败:', error);
  } finally {
    await example.stopServer();
  }
}

// 运行示例
runExamples().catch(error => {
  console.error('示例运行失败:', error);
  process.exit(1);
});