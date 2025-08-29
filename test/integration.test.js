// RxNav MCP服务器集成测试
const { spawn } = require('child_process');
const assert = require('assert');

class RxNavMCPTester {
  constructor() {
    this.testResults = [];
  }

  async runTest(testName, testFunction) {
    console.log(`\n🧪 运行测试: ${testName}`);
    try {
      await testFunction();
      console.log(`✅ ${testName} - 通过`);
      this.testResults.push({ name: testName, status: 'PASS' });
    } catch (error) {
      console.error(`❌ ${testName} - 失败: ${error.message}`);
      this.testResults.push({ name: testName, status: 'FAIL', error: error.message });
    }
  }

  async callTool(toolName, args) {
    return new Promise((resolve, reject) => {
      const child = spawn('node', ['dist/index.js'], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      const request = {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: toolName,
          arguments: args
        }
      };

      child.stdin.write(JSON.stringify(request) + '\n');
      child.stdin.end();

      let output = '';
      let errorOutput = '';

      child.stdout.on('data', (data) => {
        output += data.toString();
      });

      child.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      child.on('close', (code) => {
        try {
          const response = JSON.parse(output);
          if (response.error) {
            reject(new Error(`MCP Error: ${response.error.message}`));
          } else {
            resolve(response.re