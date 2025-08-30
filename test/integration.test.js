#!/usr/bin/env node

/**
 * RxNav MCP Server 集成测试
 * 
 * 这个测试文件验证所有RxNav工具的功能，使用常见药物进行端到端测试
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const serverPath = join(__dirname, '../dist/index.js');

class MCPTestClient {
  constructor() {
    this.requestId = 1;
  }

  async startServer() {
    console.log('🚀 启动 RxNav MCP 服务器...');
    
    this.serverProcess = spawn('node', [serverPath], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    this.serverProcess.stderr.on('data', (data) => {
      console.error('服务器错误:', data.toString());
    });

    // 等待服务器启动
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log('✅ 服务器启动成功');
  }

  async sendRequest(method, params = {}) {
    const request = {
      jsonrpc: "2.0",
      id: this.requestId++,
      method: method,
      params: params
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`请求超时: ${method}`));
      }, 30000);

      let responseData = '';
      
      const onData = (data) => {
        responseData += data.toString();
        
        // 尝试解析JSON响应
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
      
      // 发送请求
      this.serverProcess.stdin.write(JSON.stringify(request) + '\n');
    });
  }

  async callTool(toolName, args) {
    console.log(`🔧 调用工具: ${toolName}`, args);
    
    try {
      const result = await this.sendRequest('tools/call', {
        name: toolName,
        arguments: args
      });
      
      console.log(`✅ ${toolName} 成功`);
      return result;
    } catch (error) {
      console.error(`❌ ${toolName} 失败:`, error.message);
      throw error;
    }
  }

  async listTools() {
    console.log('📋 获取工具列表...');
    
    try {
      const result = await this.sendRequest('tools/list');
      console.log(`✅ 找到 ${result.tools.length} 个工具`);
      
      result.tools.forEach(tool => {
        console.log(`  - ${tool.name}: ${tool.description}`);
      });
      
      return result;
    } catch (error) {
      console.error('❌ 获取工具列表失败:', error.message);
      throw error;
    }
  }

  async stopServer() {
    if (this.serverProcess) {
      console.log('🛑 停止服务器...');
      this.serverProcess.kill();
      await new Promise(resolve => setTimeout(resolve, 1000));
      console.log('✅ 服务器已停止');
    }
  }
}

// 测试用例
const testCases = [
  {
    name: '药物名称搜索 - 阿司匹林',
    tool: 'search_drug_by_name',
    args: { drug_name: 'aspirin', limit: 5 },
    validate: (result) => {
      const content = JSON.parse(result.content[0].text);
      return content.drugs && content.drugs.length > 0;
    }
  },
  {
    name: '药物名称搜索 - 布洛芬',
    tool: 'search_drug_by_name',
    args: { drug_name: 'ibuprofen', limit: 3 },
    validate: (result) => {
      const content = JSON.parse(result.content[0].text);
      return content.drugs && content.drugs.length > 0;
    }
  },
  {
    name: '获取通用名 - Advil',
    tool: 'get_generic_name',
    args: { drug_identifier: 'Advil' },
    validate: (result) => {
      const content = JSON.parse(result.content[0].text);
      return content.generic_names && content.generic_names.length > 0;
    }
  },
  {
    name: '获取通用名 - Tylenol',
    tool: 'get_generic_name',
    args: { drug_identifier: 'Tylenol' },
    validate: (result) => {
      const content = JSON.parse(result.content[0].text);
      return content.generic_names && content.generic_names.length > 0;
    }
  },
  {
    name: '获取商品名 - ibuprofen',
    tool: 'get_brand_names',
    args: { generic_name: 'ibuprofen' },
    validate: (result) => {
      const content = JSON.parse(result.content[0].text);
      return content.brand_names && content.brand_names.length > 0;
    }
  },
  {
    name: '获取商品名 - acetaminophen',
    tool: 'get_brand_names',
    args: { generic_name: 'acetaminophen' },
    validate: (result) => {
      const content = JSON.parse(result.content[0].text);
      return content.brand_names && content.brand_names.length > 0;
    }
  },
  {
    name: 'ATC分类查询 - aspirin',
    tool: 'get_atc_classification',
    args: { drug_identifier: 'aspirin' },
    validate: (result) => {
      const content = JSON.parse(result.content[0].text);
      return content.atc_codes !== undefined; // 可能为空数组
    }
  },
  {
    name: 'ATC分类查询 - metformin',
    tool: 'get_atc_classification',
    args: { drug_identifier: 'metformin' },
    validate: (result) => {
      const content = JSON.parse(result.content[0].text);
      return content.atc_codes !== undefined;
    }
  },
  {
    name: '药物成分查询 - Tylenol',
    tool: 'get_drug_ingredients',
    args: { drug_identifier: 'Tylenol' },
    validate: (result) => {
      const content = JSON.parse(result.content[0].text);
      return content.ingredients && content.ingredients.length > 0;
    }
  },
  {
    name: '药物成分查询 - Advil',
    tool: 'get_drug_ingredients',
    args: { drug_identifier: 'Advil' },
    validate: (result) => {
      const content = JSON.parse(result.content[0].text);
      return content.ingredients && content.ingredients.length > 0;
    }
  }
];

// 错误处理测试用例
const errorTestCases = [
  {
    name: '无效药物名称',
    tool: 'search_drug_by_name',
    args: { drug_name: 'nonexistentdrug12345' },
    expectError: false, // 应该返回空结果而不是错误
    validate: (result) => {
      const content = JSON.parse(result.content[0].text);
      return content.drugs && content.drugs.length === 0;
    }
  },
  {
    name: '空药物名称',
    tool: 'search_drug_by_name',
    args: { drug_name: '' },
    expectError: true
  },
  {
    name: '无效限制参数',
    tool: 'search_drug_by_name',
    args: { drug_name: 'aspirin', limit: 100 },
    expectError: true
  }
];

async function runTests() {
  const client = new MCPTestClient();
  let passedTests = 0;
  let totalTests = 0;

  try {
    await client.startServer();
    
    // 测试工具列表
    console.log('\n=== 测试工具列表 ===');
    await client.listTools();
    
    // 运行功能测试
    console.log('\n=== 功能测试 ===');
    for (const testCase of testCases) {
      totalTests++;
      try {
        console.log(`\n🧪 测试: ${testCase.name}`);
        const result = await client.callTool(testCase.tool, testCase.args);
        
        if (testCase.validate(result)) {
          console.log(`✅ 验证通过: ${testCase.name}`);
          passedTests++;
          
          // 显示部分结果
          const content = JSON.parse(result.content[0].text);
          console.log(`   结果预览:`, JSON.stringify(content, null, 2).substring(0, 200) + '...');
        } else {
          console.log(`❌ 验证失败: ${testCase.name}`);
          console.log(`   结果:`, result);
        }
      } catch (error) {
        console.log(`❌ 测试失败: ${testCase.name} - ${error.message}`);
      }
    }
    
    // 运行错误处理测试
    console.log('\n=== 错误处理测试 ===');
    for (const testCase of errorTestCases) {
      totalTests++;
      try {
        console.log(`\n🧪 错误测试: ${testCase.name}`);
        const result = await client.callTool(testCase.tool, testCase.args);
        
        if (testCase.expectError) {
          console.log(`❌ 应该产生错误但没有: ${testCase.name}`);
        } else if (testCase.validate && testCase.validate(result)) {
          console.log(`✅ 错误处理正确: ${testCase.name}`);
          passedTests++;
        } else {
          console.log(`❌ 错误处理验证失败: ${testCase.name}`);
        }
      } catch (error) {
        if (testCase.expectError) {
          console.log(`✅ 正确捕获错误: ${testCase.name} - ${error.message}`);
          passedTests++;
        } else {
          console.log(`❌ 意外错误: ${testCase.name} - ${error.message}`);
        }
      }
    }
    
  } catch (error) {
    console.error('❌ 测试运行失败:', error);
  } finally {
    await client.stopServer();
  }

  // 测试结果总结
  console.log('\n=== 测试结果总结 ===');
  console.log(`总测试数: ${totalTests}`);
  console.log(`通过测试: ${passedTests}`);
  console.log(`失败测试: ${totalTests - passedTests}`);
  console.log(`成功率: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
  
  if (passedTests === totalTests) {
    console.log('🎉 所有测试通过！');
    process.exit(0);
  } else {
    console.log('⚠️  部分测试失败');
    process.exit(1);
  }
}

// 运行测试
console.log('🧪 RxNav MCP Server 集成测试');
console.log('================================');

runTests().catch(error => {
  console.error('❌ 测试执行失败:', error);
  process.exit(1);
});