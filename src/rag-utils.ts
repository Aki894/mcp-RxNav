/**
 * 轻量级 RAG 工具库
 * 提供文本分块、检索排序、摘要生成等功能
 * 无外部依赖，适用于 MCP 服务端内嵌使用
 */

export interface TextChunk {
  id: string;
  text: string;
  source: string;
  metadata: Record<string, any>;
  score?: number;
}

export interface RAGResult {
  source: string;
  query?: string;
  drug?: string;
  condition?: string;
  top_chunks: TextChunk[];
  summary: string;
  citations: Array<{
    id: string;
    title?: string;
    type?: string;
  }>;
}

/**
 * 将长文本分块
 */
export function chunkText(
  text: string, 
  chunkSize: number = 1000, 
  overlap: number = 200,
  sourceId: string = '',
  metadata: Record<string, any> = {}
): TextChunk[] {
  if (!text || text.length === 0) return [];
  
  const chunks: TextChunk[] = [];
  let start = 0;
  let chunkIndex = 0;
  
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    let chunkText = text.slice(start, end);
    
    // 尝试在句号或换行处断开，避免截断句子
    if (end < text.length) {
      const lastPeriod = chunkText.lastIndexOf('.');
      const lastNewline = chunkText.lastIndexOf('\n');
      const breakPoint = Math.max(lastPeriod, lastNewline);
      
      if (breakPoint > chunkSize * 0.7) { // 至少保留70%的内容
        chunkText = chunkText.slice(0, breakPoint + 1);
      }
    }
    
    chunks.push({
      id: `${sourceId}_chunk_${chunkIndex}`,
      text: chunkText.trim(),
      source: sourceId,
      metadata: { ...metadata, chunkIndex, start, end: start + chunkText.length }
    });
    
    start += chunkText.length - overlap;
    chunkIndex++;
    
    // 防止无限循环
    if (start <= chunks[chunks.length - 1]?.metadata?.start) {
      start = chunks[chunks.length - 1].metadata.start + chunkSize;
    }
  }
  
  return chunks;
}

/**
 * 基于关键词重叠和 TF-IDF 的简版文本评分
 */
export function scoreChunkByQuery(
  chunk: TextChunk, 
  query: string, 
  extraKeywords: string[] = []
): number {
  const text = chunk.text.toLowerCase();
  const queryLower = query.toLowerCase();
  const allKeywords = [
    ...queryLower.split(/\s+/),
    ...extraKeywords.map(k => k.toLowerCase())
  ].filter(k => k.length > 2);
  
  let score = 0;
  
  // 关键词匹配得分
  for (const keyword of allKeywords) {
    const matches = (text.match(new RegExp(keyword, 'g')) || []).length;
    if (matches > 0) {
      // TF 权重：词频 * log(1 + 词长度)
      score += matches * Math.log(1 + keyword.length);
    }
  }
  
  // 查询短语完整匹配加分
  if (text.includes(queryLower)) {
    score += queryLower.length * 2;
  }
  
  // 文本长度归一化
  score = score / Math.sqrt(text.length);
  
  return score;
}

/**
 * 对文本块进行排序并选择 Top-K
 */
export function rankAndPickTop(
  chunks: TextChunk[], 
  query: string,
  topK: number = 5,
  extraKeywords: string[] = []
): TextChunk[] {
  // 计算每个块的得分
  const scoredChunks = chunks.map(chunk => ({
    ...chunk,
    score: scoreChunkByQuery(chunk, query, extraKeywords)
  }));
  
  // 按得分降序排序
  scoredChunks.sort((a, b) => (b.score || 0) - (a.score || 0));
  
  // 返回 Top-K
  return scoredChunks.slice(0, topK);
}

/**
 * 生成结构化摘要
 */
export function summarizeChunks(
  chunks: TextChunk[], 
  options: {
    source: string;
    query?: string;
    drug?: string;
    condition?: string;
    maxLength?: number;
  }
): string {
  const { source, query, drug, condition, maxLength = 1200 } = options;
  
  if (chunks.length === 0) {
    return `未找到与查询相关的信息。查询: ${query || drug || condition || 'N/A'}`;
  }
  
  let summary = '';
  
  // 根据不同数据源定制摘要格式
  switch (source) {
    case 'clinicaltrials':
      summary = generateClinicalTrialsSummary(chunks, { query, drug, condition });
      break;
    case 'openfda':
      summary = generateOpenFDASummary(chunks, { query, drug, condition });
      break;
    case 'rxnav':
      summary = generateRxNavSummary(chunks, { query, drug, condition });
      break;
    default:
      summary = generateGenericSummary(chunks, { query, drug, condition });
  }
  
  // 长度控制
  if (summary.length > maxLength) {
    summary = summary.slice(0, maxLength - 3) + '...';
  }
  
  return summary;
}

function generateClinicalTrialsSummary(
  chunks: TextChunk[], 
  context: { query?: string; drug?: string; condition?: string }
): string {
  const { drug, condition, query } = context;
  
  let summary = `## 临床试验不良事件分析\n\n`;
  
  if (drug) summary += `**药物**: ${drug}\n`;
  if (condition) summary += `**适应症**: ${condition}\n`;
  if (query) summary += `**查询**: ${query}\n`;
  
  summary += `**数据来源**: ${chunks.length} 个临床试验片段\n\n`;
  
  // 提取关键信息
  const adverseEvents = new Set<string>();
  const studyIds = new Set<string>();
  let hasControlComparison = false;
  
  chunks.forEach(chunk => {
    // 提取研究 ID
    const nctMatch = chunk.text.match(/NCT\d+/g);
    if (nctMatch) {
      nctMatch.forEach(id => studyIds.add(id));
    }
    
    // 检测对照组比较
    if (chunk.text.toLowerCase().includes('placebo') || 
        chunk.text.toLowerCase().includes('control')) {
      hasControlComparison = true;
    }
    
    // 提取不良事件关键词
    const aeKeywords = ['adverse', 'side effect', 'toxicity', 'safety', '不良事件', '副作用'];
    aeKeywords.forEach(keyword => {
      if (chunk.text.toLowerCase().includes(keyword.toLowerCase())) {
        adverseEvents.add(keyword);
      }
    });
  });
  
  summary += `### 关键发现\n`;
  summary += `- 涉及研究数量: ${studyIds.size}\n`;
  summary += `- 包含对照组比较: ${hasControlComparison ? '是' : '否'}\n`;
  summary += `- 不良事件相关性: ${adverseEvents.size > 0 ? '是' : '否'}\n\n`;
  
  summary += `### 证据摘要\n`;
  chunks.slice(0, 3).forEach((chunk, idx) => {
    const preview = chunk.text.slice(0, 200).replace(/\n/g, ' ');
    summary += `${idx + 1}. ${preview}...\n\n`;
  });
  
  summary += `### 建议\n`;
  summary += `基于 ${chunks.length} 个相关片段的分析，建议进一步查看具体研究详情以获得完整的安全性评估。`;
  
  return summary;
}

function generateOpenFDASummary(
  chunks: TextChunk[], 
  context: { query?: string; drug?: string; condition?: string }
): string {
  const { drug, condition, query } = context;
  
  let summary = `## FDA 药物标签安全信息\n\n`;
  
  if (drug) summary += `**药物**: ${drug}\n`;
  if (condition) summary += `**适应症**: ${condition}\n`;
  if (query) summary += `**查询**: ${query}\n`;
  
  summary += `**数据来源**: ${chunks.length} 个 FDA 标签片段\n\n`;
  
  // 分类信息
  const categories = {
    warnings: 0,
    adverseReactions: 0,
    contraindications: 0,
    boxedWarning: 0
  };
  
  chunks.forEach(chunk => {
    const text = chunk.text.toLowerCase();
    if (text.includes('warning') || text.includes('警告')) categories.warnings++;
    if (text.includes('adverse') || text.includes('不良反应')) categories.adverseReactions++;
    if (text.includes('contraindication') || text.includes('禁忌')) categories.contraindications++;
    if (text.includes('boxed') || text.includes('黑框')) categories.boxedWarning++;
  });
  
  summary += `### 安全信息分类\n`;
  summary += `- 警告信息: ${categories.warnings} 条\n`;
  summary += `- 不良反应: ${categories.adverseReactions} 条\n`;
  summary += `- 禁忌症: ${categories.contraindications} 条\n`;
  summary += `- 黑框警告: ${categories.boxedWarning} 条\n\n`;
  
  summary += `### 重要安全信息\n`;
  chunks.slice(0, 3).forEach((chunk, idx) => {
    const preview = chunk.text.slice(0, 200).replace(/\n/g, ' ');
    summary += `${idx + 1}. ${preview}...\n\n`;
  });
  
  return summary;
}

function generateRxNavSummary(
  chunks: TextChunk[], 
  context: { query?: string; drug?: string; condition?: string }
): string {
  const { drug, condition, query } = context;
  
  let summary = `## RxNav 药物术语信息\n\n`;
  
  if (drug) summary += `**药物**: ${drug}\n`;
  if (condition) summary += `**适应症**: ${condition}\n`;
  if (query) summary += `**查询**: ${query}\n`;
  
  summary += `**数据来源**: ${chunks.length} 个 RxNav 术语片段\n\n`;
  
  // 提取 RxCUI 和分类信息
  const rxcuis = new Set<string>();
  const atcCodes = new Set<string>();
  
  chunks.forEach(chunk => {
    // 提取 RxCUI
    const rxcuiMatch = chunk.text.match(/rxcui["\s:]+(\d+)/gi);
    if (rxcuiMatch) {
      rxcuiMatch.forEach(match => {
        const id = match.match(/\d+/);
        if (id) rxcuis.add(id[0]);
      });
    }
    
    // 提取 ATC 代码
    const atcMatch = chunk.text.match(/[A-Z]\d{2}[A-Z]{2}\d{2}/g);
    if (atcMatch) {
      atcMatch.forEach(code => atcCodes.add(code));
    }
  });
  
  summary += `### 术语信息统计\n`;
  summary += `- RxCUI 标识符: ${rxcuis.size} 个\n`;
  summary += `- ATC 分类代码: ${atcCodes.size} 个\n\n`;
  
  summary += `### 药物术语详情\n`;
  chunks.slice(0, 3).forEach((chunk, idx) => {
    const preview = chunk.text.slice(0, 200).replace(/\n/g, ' ');
    summary += `${idx + 1}. ${preview}...\n\n`;
  });
  
  return summary;
}

function generateGenericSummary(
  chunks: TextChunk[], 
  context: { query?: string; drug?: string; condition?: string }
): string {
  const { drug, condition, query } = context;
  
  let summary = `## 信息摘要\n\n`;
  
  if (drug) summary += `**药物**: ${drug}\n`;
  if (condition) summary += `**适应症**: ${condition}\n`;
  if (query) summary += `**查询**: ${query}\n`;
  
  summary += `**相关片段**: ${chunks.length} 个\n\n`;
  
  summary += `### 主要内容\n`;
  chunks.slice(0, 5).forEach((chunk, idx) => {
    const preview = chunk.text.slice(0, 150).replace(/\n/g, ' ');
    summary += `${idx + 1}. ${preview}...\n\n`;
  });
  
  return summary;
}

/**
 * 提取引用信息
 */
export function extractCitations(chunks: TextChunk[]): Array<{
  id: string;
  title?: string;
  type?: string;
}> {
  const citations: Array<{ id: string; title?: string; type?: string }> = [];
  const seenIds = new Set<string>();
  
  chunks.forEach(chunk => {
    // 提取 NCT ID
    const nctMatches = chunk.text.match(/NCT\d+/g);
    if (nctMatches) {
      nctMatches.forEach(nctId => {
        if (!seenIds.has(nctId)) {
          citations.push({ id: nctId, type: 'clinical_trial' });
          seenIds.add(nctId);
        }
      });
    }
    
    // 提取 RxCUI
    const rxcuiMatches = chunk.text.match(/rxcui["\s:]+(\d+)/gi);
    if (rxcuiMatches) {
      rxcuiMatches.forEach(match => {
        const id = match.match(/\d+/);
        if (id && !seenIds.has(id[0])) {
          citations.push({ id: id[0], type: 'rxnorm' });
          seenIds.add(id[0]);
        }
      });
    }
    
    // 使用 chunk 的 source 作为备选引用
    if (!seenIds.has(chunk.source)) {
      citations.push({ 
        id: chunk.source, 
        type: chunk.metadata?.type || 'document',
        title: chunk.metadata?.title 
      });
      seenIds.add(chunk.source);
    }
  });
  
  return citations;
}
