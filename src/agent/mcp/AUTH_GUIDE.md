# MCP 认证配置指南

## 概述

MCP (Model Context Protocol) 服务器支持多种认证方式，确保与需要身份验证的外部服务安全通信。

## 支持的认证方式

### 1. 无认证 (None)
适用于本地开发或不需要认证的公共 MCP 服务器。

### 2. Bearer Token
最常用的认证方式，适用于大多数现代 API。

**配置示例：**
- 认证方式：`Bearer Token`
- API Key / Token：`your_api_key_here`

**请求头格式：**
```
Authorization: Bearer your_api_key_here
```

**使用场景：**
- DashScope (通义千问)
- OpenAI
- Anthropic
- 其他支持 Bearer Token 的服务

### 3. API Key
自定义 Header 的 API Key 认证。

**配置示例：**
- 认证方式：`API Key`
- Header 名称：`X-API-Key` (或其他自定义名称)
- API Key：`your_api_key_here`

**请求头格式：**
```
X-API-Key: your_api_key_here
```

**使用场景：**
- 使用自定义 Header 名称的服务
- 某些云服务商的 API

### 4. Basic Auth
传统的用户名密码认证。

**配置示例：**
- 认证方式：`Basic Auth`
- API Key：`username:password` (格式：用户名:密码)

**请求头格式：**
```
Authorization: Basic base64(username:password)
```

**使用场景：**
- 传统 HTTP 认证
- 某些内部服务

## 配置步骤

### 在系统设置中配置

1. 打开 **设置** → **连接器与 MCP**
2. 点击 **添加 MCP 服务器**
3. 填写基本信息：
   - 服务器名称
   - 传输类型：选择 `HTTP`
   - URL：MCP 服务器地址

4. 配置认证：
   - 选择认证方式
   - 填写相应的认证信息

5. 点击 **测试连接** 验证配置
6. 保存配置

### 在 Agent 设置中配置

1. 打开 **Agent 设置** → **工具 & MCP**
2. 点击 **添加** MCP 服务器
3. 按照上述步骤配置

## 常见服务配置示例

### DashScope (通义千问)

```
服务器名称：DashScope MCP
传输类型：HTTP
URL：https://dashscope.aliyuncs.com/api/v1/mcp
认证方式：Bearer Token
API Key：your_dashscope_api_key
```

### OpenAI

```
服务器名称：OpenAI MCP
传输类型：HTTP
URL：https://api.openai.com/v1/mcp
认证方式：Bearer Token
API Key：your_openai_api_key
```

### 自定义 MCP 服务器

```
服务器名称：My Custom MCP
传输类型：HTTP
URL：http://localhost:3000/mcp
认证方式：API Key
Header 名称：X-API-Key
API Key：your_custom_api_key
```

## 安全建议

1. **保护 API Key**
   - 不要在代码或配置文件中硬编码 API Key
   - 使用环境变量或密钥管理器存储敏感信息
   - 定期轮换 API Key

2. **使用 HTTPS**
   - 生产环境始终使用 HTTPS 协议
   - 避免在 HTTP 连接中传输认证信息

3. **最小权限原则**
   - 为每个 MCP 服务器使用独立的 API Key
   - 限制 API Key 的权限范围
   - 定期审查和撤销不需要的权限

4. **监控和日志**
   - 启用 API 使用日志
   - 监控异常访问模式
   - 设置使用配额和警报

## 故障排查

### 连接测试失败

**问题：** 测试连接时收到 401 或 403 错误

**解决方案：**
1. 检查 API Key 是否正确
2. 确认认证方式与服务器要求匹配
3. 验证 API Key 未过期或被撤销
4. 检查服务器 URL 是否正确

### 工具调用失败

**问题：** MCP 服务器连接成功，但工具调用失败

**解决方案：**
1. 检查 API Key 是否有足够的权限
2. 确认服务器支持所请求的工具
3. 查看服务器日志获取详细错误信息
4. 验证请求参数格式正确

## 技术实现细节

### 请求头构建逻辑

```typescript
// 构建请求头
const headers: Record<string, string> = {
  'Content-Type': 'application/json',
}

// Bearer Token 认证
if (authType === 'bearer' && apiKey) {
  headers['Authorization'] = `Bearer ${apiKey}`
}

// API Key 认证
else if (authType === 'apikey' && apiKey) {
  const headerName = apiKeyHeader || 'X-API-Key'
  headers[headerName] = apiKey
}

// Basic Auth 认证
else if (authType === 'basic' && apiKey) {
  const encoded = btoa(apiKey)  // apiKey 格式: "username:password"
  headers['Authorization'] = `Basic ${encoded}`
}

// 合并自定义 headers
if (customHeaders) {
  Object.assign(headers, customHeaders)
}
```

## 更多信息

- [MCP 协议官方文档](https://modelcontextprotocol.io/)
- [JSON-RPC 2.0 规范](https://www.jsonrpc.org/specification)
- 项目文档：查看 `src/agent/mcp/` 目录下的源代码
