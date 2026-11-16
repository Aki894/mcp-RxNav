# RxNav MCP Server

让 AI 助手检索药品概念、转换通用名与商品名、查询 ATC 分类和成分，并获取完整 RxNorm 概念信息。

[English](README.en.md) · [API](https://lhncbc.nlm.nih.gov/RxNav/APIs/RxNormAPIs.html) · [GitHub Issues](https://github.com/Aki894/mcp-RxNav/issues)

## 功能特性

- **`search_drug_by_name`**：按成分、通用名或商品名检索关联药品，返回 RxCUI、名称、术语类型及来源；数量限制对所有分组统一生效。
- **`get_generic_name`**：按药名或 RxCUI 获取关联成分和通用临床药品概念，按解析出的候选分别保留结果。
- **`get_brand_names`**：按通用名获取关联商品名、品牌药品及品牌包装，按候选 RxCUI 分组。
- **`get_atc_classification`**：查询 RxNorm 的 ATC 属性及 RxClass ATC 成员关系，保留分类代码、名称、层级及关联概念。
- **`get_drug_ingredients`**：查询成分概念、来源概念属性及上游可用的规格和剂型属性，保留全部名称候选。
- **`get_complete_drug_details`**：按 RxCUI 获取基本信息、所有属性、通用名、商品名、ATC 和成分，或按 fields 选择；请求失败明确返回错误。
- **`resolve_drug`**：通过精确或规范化名称匹配获取全部 RxCUI，不自动选择首个候选。

## 快速开始

需要 Git、Node.js 22 或更高版本及 npm，并能访问 `rxnav.nlm.nih.gov`。

```bash
git clone https://github.com/Aki894/mcp-RxNav.git
cd mcp-RxNav
npm ci
npm run build
```

### 配置 MCP 客户端

在支持 `mcpServers` 配置格式的客户端中加入以下条目，将入口替换为构建后的**绝对路径**：

```json
{
  "mcpServers": {
    "rxnav": {
      "command": "node",
      "args": [
        "/absolute/path/to/mcp-RxNav/dist/index.js"
      ]
    }
  }
}
```

Windows 可使用 `D:/mcp/mcp-RxNav/dist/index.js`，避免 JSON 反斜杠转义。若客户端找不到 `node`，将 `command` 改为 Node.js 可执行文件的绝对路径。保存后重新加载 MCP 连接，检查工具列表。其他客户端请按其格式填写相同的命令与参数。

服务器使用 **stdio**，由 MCP 客户端启动，无需端口或 HTTP 地址。直接在终端启动后等待标准输入属于正常行为。

无需 API 密钥或必填环境变量。

## 可用工具

当前提供 **7 个工具**。参数使用严格校验，拒绝未声明字段；字符串会去除首尾空格并拒绝控制字符。数字参数使用 JSON 数字，布尔参数使用 JSON 布尔值。下表的默认值、必填项和边界与服务实际公布的 schema 一致。

### `search_drug_by_name`

按成分、通用名或商品名检索关联药品，返回 RxCUI、名称、术语类型及来源；数量限制对所有分组统一生效。

| 参数 | 类型 | 必填 | 默认值 | 描述与范围 |
| --- | --- | --- | --- | --- |
| `drug_name` | string | 是 | `—` | 英文药物通用名、商品名或成分名。 长度为 1–200 个字符 |
| `limit` | integer | 否 | `10` | 本次最多返回的记录或统计桶数量。 ≥1; ≤50 |

调用示例（MCP `tools/call` 的参数）：

```json
{
  "name": "search_drug_by_name",
  "arguments": {
    "drug_name": "atorvastatin",
    "limit": 5
  }
}
```

### `get_generic_name`

按药名或 RxCUI 获取关联成分和通用临床药品概念，按解析出的候选分别保留结果。

| 参数 | 类型 | 必填 | 默认值 | 描述与范围 |
| --- | --- | --- | --- | --- |
| `drug_identifier` | string | 是 | `—` | 英文药物名称或纯数字 RxCUI；保留所有精确或规范化匹配候选。 长度为 1–200 个字符 |

调用示例（MCP `tools/call` 的参数）：

```json
{
  "name": "get_generic_name",
  "arguments": {
    "drug_identifier": "Lipitor"
  }
}
```

### `get_brand_names`

按通用名获取关联商品名、品牌药品及品牌包装，按候选 RxCUI 分组。

| 参数 | 类型 | 必填 | 默认值 | 描述与范围 |
| --- | --- | --- | --- | --- |
| `generic_name` | string | 是 | `—` | 英文通用药名或成分名。 长度为 1–200 个字符 |

调用示例（MCP `tools/call` 的参数）：

```json
{
  "name": "get_brand_names",
  "arguments": {
    "generic_name": "atorvastatin"
  }
}
```

### `get_atc_classification`

查询 RxNorm 的 ATC 属性及 RxClass ATC 成员关系，保留分类代码、名称、层级及关联概念。

| 参数 | 类型 | 必填 | 默认值 | 描述与范围 |
| --- | --- | --- | --- | --- |
| `drug_identifier` | string | 是 | `—` | 英文药物名称或纯数字 RxCUI；保留所有精确或规范化匹配候选。 长度为 1–200 个字符 |

调用示例（MCP `tools/call` 的参数）：

```json
{
  "name": "get_atc_classification",
  "arguments": {
    "drug_identifier": "83367"
  }
}
```

### `get_drug_ingredients`

查询成分概念、来源概念属性及上游可用的规格和剂型属性，保留全部名称候选。

| 参数 | 类型 | 必填 | 默认值 | 描述与范围 |
| --- | --- | --- | --- | --- |
| `drug_identifier` | string | 是 | `—` | 英文药物名称或纯数字 RxCUI；保留所有精确或规范化匹配候选。 长度为 1–200 个字符 |

调用示例（MCP `tools/call` 的参数）：

```json
{
  "name": "get_drug_ingredients",
  "arguments": {
    "drug_identifier": "617314"
  }
}
```

### `get_complete_drug_details`

按 RxCUI 获取基本信息、所有属性、通用名、商品名、ATC 和成分，或按 fields 选择；请求失败明确返回错误。

| 参数 | 类型 | 必填 | 默认值 | 描述与范围 |
| --- | --- | --- | --- | --- |
| `rxcui` | string | 是 | `—` | 纯数字 RxNorm 概念标识符。 |
| `fields` | string[] | 否 | `—` | 返回章节列表；省略或为空时返回全部，可选值见下方。 |

`fields` 可选值：

- `basic_info`
- `generic_names`
- `brand_names`
- `atc_codes`
- `ingredients`
- `properties`


调用示例（MCP `tools/call` 的参数）：

```json
{
  "name": "get_complete_drug_details",
  "arguments": {
    "rxcui": "617314",
    "fields": [
      "basic_info",
      "ingredients",
      "properties"
    ]
  }
}
```

### `resolve_drug`

通过精确或规范化名称匹配获取全部 RxCUI，不自动选择首个候选。

| 参数 | 类型 | 必填 | 默认值 | 描述与范围 |
| --- | --- | --- | --- | --- |
| `drug` | string | 是 | `—` | 英文药物名称。 长度为 1–200 个字符 |

调用示例（MCP `tools/call` 的参数）：

```json
{
  "name": "resolve_drug",
  "arguments": {
    "drug": "atorvastatin"
  }
}
```

## 返回结果与查询行为

MCP 响应的 `content` 中包含一个 `type: "text"` 项，其 `text` 是 JSON 字符串。所有成功结果均包含 `source` 和 `query_url`，分别标明数据源和主查询 URL。复合工具的其他请求链接在结果内保留。

| 工具 | 数据字段与行为 |
| --- | --- |
| `search_drug_by_name` | `query`、`total_found`、`returned_count`、`truncated` 和 `results`。每个结果保留上游概念字段，如 `rxcui`、`name`、`tty`、`synonym`，并附属性 API 的 `url`。 |
| `get_generic_name` | `matched_rxcuis` 与 `results[]`；各候选含 `rxcui`、`generic_names` 和关系请求 `query_url`。 |
| `get_brand_names` | `matched_rxcuis` 与 `results[]`；各候选含 `rxcui`、`brand_names` 和关系请求 `query_url`。 |
| `get_atc_classification` | `matched_rxcuis` 与 `results[]`；各候选含 `rxcui`、`atc_codes` 和 `query_urls`。分类项包含 `code`、`name`（可能为 null）、`level`、`source`、`relation`，RxClass 项还保留 `class_type` 与 `linked_concept`。 |
| `get_drug_ingredients` | `matched_rxcuis` 与 `results[]`；各候选含 `ingredients`、`basic_info`、完整 `properties` 和 `query_urls`。规格和剂型使用上游概念名及属性，不补造独立的成分剂量。 |
| `get_complete_drug_details` | `rxcui`、`complete_drug_details`、`query_urls`。详情包含所选章节；无有效概念属性时详情为 `null`。未指定 fields 或传空数组时返回所有六个章节。 |
| `resolve_drug` | `records[].id/url/content/metadata`；`id` 为字符串 RxCUI，`content` 格式为“输入药名: RxCUI 标识符”，元数据含 `rxcui`、`queried_name`、`match_mode`。 |

所有工具的数据源标记为 `rxnav`。名称未匹配时返回空候选或记录数组。`get_generic_name`、ATC 和成分工具接受名称或数字 ID；数字 ID 直接用于查询，未返回关系时数组为空。完整详情通过属性接口确认概念存在后再获取所选章节，某个上游请求失败会返回错误，不作为完整成功结果静默遗漏该部分。

### 名称匹配与关系范围

- 药品搜索使用 `/drugs.json`，返回与输入名称关联的药品概念。`limit` 对去重后的全部概念统一限制；`total_found` 是上游本次返回的去重数量，`truncated` 表示本地数量限制是否截取结果。
- 其他按名称查询的工具使用 `/rxcui.json?search=2`，先精确匹配，无结果时规范化匹配；所有候选分别查询，避免首个候选被当成唯一答案。`resolve_drug` 的 `match_mode=exact_or_normalized` 表示搜索策略。
- 通用概念范围为 IN、PIN、MIN、SCD、SCDF、SCDG；商品概念范围为 BN、SBD、BPCK；成分范围为 IN、PIN、MIN。返回来源概念的名称与术语类型，不将不同概念强行合并为一个名称。
- ATC 同时读取概念的 ATC 属性及 RxClass 的 ATC 关系。层级按有效代码长度 1／3／4／5／7 映射到 1–5 级；原始关系可指向相关成分或复方概念，查看 `linked_concept` 确认范围。没有上游分类时数组为空，不凭字符串生成缺失祖先分类。
- 此服务器对上游请求间隔至少 60 毫秒；其他进程共享 IP 时仍需共同控制调用频率。返回来源链接用于继续核对概念信息。

## 使用示例

连接后可以向助手提出：

> 搜索 atorvastatin 的药品概念，选定规格和剂型对应的 RxCUI 后，获取完整详情、成分和 ATC 分类，并附上来源链接。

返回信息用于检索与研究辅助；临床判断需结合具体产品、研究设计和个人情况，本项目不提供个人诊疗建议。

## 数据来源

每次调用访问 NLM 的 [RxNorm API](https://lhncbc.nlm.nih.gov/RxNav/APIs/RxNormAPIs.html)，ATC 另使用 [RxClass API](https://lhncbc.nlm.nih.gov/RxNav/APIs/api-RxClass.getClassByRxNormDrugId.html)。没有本地术语数据库或结果缓存。请遵循 [RxNav 使用条款](https://lhncbc.nlm.nih.gov/RxNav/TermsofService.html)。本项目使用 NLM 公开数据；NLM 不对本项目负责，也不提供背书或推荐。

## 错误处理与故障排查

工具执行失败时返回 `isError: true`，文本 JSON 结构如下：

```json
{"error":{"code":"invalid_arguments","message":"…","retryable":false}}
```

每次上游请求默认超时 30 秒，不自动重试；复合工具可能执行多次请求。`retryable` 提示调用方稍后是否适合重试。

| 情况 / 错误码 | 处理方法 |
| --- | --- |
| 工具缺失或连接关闭 | 确认 Node.js ≥22，执行构建，检查绝对路径，并重新加载客户端。 |
| `invalid_arguments` | 检查必填项、类型、范围及枚举，删除额外参数。 |
| `unknown_tool` | 重新加载工具列表并使用上文工具名。 |
| `network / timeout` | 检查服务器能否访问 rxnav.nlm.nih.gov，稍后重试。 |
| `http_429 / http_5xx` | 降低请求频率，等待上游恢复。 |
| `http_400 / http_401 / http_403` | 检查查询表达式、凭据及上游访问条件。 |
| `http_404` | 检查记录标识；搜索无匹配按各工具的空结果规则处理。 |
| `invalid_json / invalid_response` | 上游响应格式异常，持续出现时附错误码提交 Issue。 |
| `cancelled` | 客户端取消了请求，需要时重新发起。 |
| `internal / configuration` | 检查安装与本地改动，附运行环境和错误信息反馈。 |

## 从源码运行

```bash
npm run build
npm start
npm run dev
```

上述命令分别用于构建、启动构建产物和直接运行 TypeScript 源码。

## 反馈与许可证

通过 [GitHub Issues](https://github.com/Aki894/mcp-RxNav/issues) 反馈问题，请提供 Node.js 版本、MCP 客户端、工具参数及错误码，移除密钥和个人信息。

代码采用 [GPL-3.0](LICENSE)。数据来源条款单独适用。
