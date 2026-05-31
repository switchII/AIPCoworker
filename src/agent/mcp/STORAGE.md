# MCP 配置本地存储说明

## 📁 存储位置

MCP 服务器配置保存在用户主目录下的 `~/.aipcowork/mcp/servers.json` 文件中。

### 目录结构

```
~/.aipcowork/
├── memory/              # 记忆模块数据
│   ├── goals.md
│   ├── preferences.md
│   └── conversations/
├── mcp/                 # MCP 配置目录 (新增)
│   └── servers.json     # MCP 服务器配置文件
└── ...
```

## 📄 文件格式

`servers.json` 文件包含一个 MCP 服务器配置数组，格式如下：

```json
[
  {
    "id": "mcp-1234567890",
    "name": "DashScope MCP",
    "transport": "http",
    "url": "https://dashscope.aliyuncs.com/api/v1/mcp",
    "headers": {},
    "authType": "bearer",
    "apiKey": "sk-xxxxxxxxxxxxxxxx",
    "apiKeyHeader": "Authorization",
    "enabled": true,
    "timeout": 30000
  },
  {
    "id": "mcp-1234567891",
    "name": "Local File MCP",
    "transport": "stdio",
    "command": "node",
    "args": ["/path/to/mcp-server.js"],
    "env": {},
    "enabled": true,
    "timeout": 30000
  }
]
```

## 🔧 配置字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | ✅ | 服务器唯一标识，格式：`mcp-{timestamp}` |
| `name` | string | ✅ | 服务器名称，用于 UI 显示 |
| `transport` | string | ✅ | 传输类型：`http` 或 `stdio` |
| `url` | string | HTTP | HTTP 传输的服务器 URL |
| `command` | string | stdio | stdio 传输的命令（如 `node`, `python`） |
| `args` | string[] | stdio | 命令参数数组 |
| `env` | object | ❌ | 环境变量键值对 |
| `headers` | object | ❌ | 自定义 HTTP 头 |
| `authType` | string | ❌ | 认证类型：`none`, `bearer`, `apikey`, `basic` |
| `apiKey` | string | ❌ | API 密钥或 Token |
| `apiKeyHeader` | string | ❌ | API Key 的 HTTP 头名称（如 `X-API-Key`） |
| `enabled` | boolean | ✅ | 是否启用该服务器 |
| `timeout` | number | ✅ | 请求超时时间（毫秒） |

## 🔄 自动保存机制

MCP 配置会在以下操作时自动保存到本地文件：

1. **添加服务器** - 调用 `store.addMCPServer()`
2. **更新服务器** - 调用 `store.updateMCPServer()`
3. **删除服务器** - 调用 `store.removeMCPServer()`
4. **切换启用状态** - 调用 `store.toggleMCPServer()`

所有操作都会立即写入 `~/.aipcowork/mcp/servers.json`，无需手动保存。

## 📖 加载机制

应用启动时（`useAgentStore` 初始化），会自动调用 `loadMCPServers()` 从本地文件加载 MCP 配置：

```typescript
// 在 agentStore.ts 中
// 初始化加载
loadState()
loadMCPServers()  // 加载 MCP 配置
```

如果文件不存在，会返回空数组 `[]`，不会报错。

## 🛠️ Tauri 后端命令

### `save_mcp_servers(config_json: String)`

保存 MCP 服务器配置到本地文件。

**参数：**
- `config_json`: JSON 字符串格式的服务器配置数组

**返回：**
- 成功：`Ok(())`
- 失败：`Err("错误信息")`

### `load_mcp_servers()`

从本地文件加载 MCP 服务器配置。

**返回：**
- 成功：`Ok(json_string)` - JSON 格式的服务器配置数组
- 失败：`Err("错误信息")`
- 文件不存在：`Ok("[]")` - 返回空数组

## 💡 使用示例

### 在 Vue 组件中使用

```vue
<script setup lang="ts">
import { useAgentStore } from '../stores/agentStore'

const store = useAgentStore()

// 添加 MCP 服务器（自动保存）
function addServer() {
  store.addMCPServer({
    id: `mcp-${Date.now()}`,
    name: 'My MCP Server',
    transport: 'http',
    url: 'https://example.com/mcp',
    authType: 'bearer',
    apiKey: 'sk-xxx',
    enabled: true,
    timeout: 30000
  })
}

// 更新服务器（自动保存）
function updateServer(id: string) {
  store.updateMCPServer(id, {
    name: 'Updated Name',
    enabled: false
  })
}

// 删除服务器（自动保存）
function deleteServer(id: string) {
  store.removeMCPServer(id)
}

// 切换启用状态（自动保存）
function toggleServer(id: string) {
  store.toggleMCPServer(id)
}
</script>
```

### 手动加载/保存（通常不需要）

```typescript
const store = useAgentStore()

// 手动重新加载配置
await store.loadMCPServers()

// 手动保存配置（通常在自动保存失败时使用）
await store.saveMCPServers()
```

## 🔒 安全性说明

1. **API Key 存储**：API Key 以明文形式存储在本地 JSON 文件中
2. **文件权限**：建议设置文件权限为仅当前用户可读（`600` 或 `rw-------`）
3. **不上传云端**：配置仅保存在本地，不会上传到任何云端服务
4. **备份建议**：定期备份 `~/.aipcowork/mcp/` 目录以防数据丢失

## 🐛 故障排查

### 配置未保存

1. 检查控制台日志，查找 `[MCP] 保存服务器配置失败` 错误
2. 确认 `~/.aipcowork/mcp/` 目录是否有写权限
3. 检查磁盘空间是否充足

### 配置未加载

1. 检查控制台日志，查找 `[MCP] 加载服务器配置失败` 错误
2. 确认 `~/.aipcowork/mcp/servers.json` 文件格式正确
3. 尝试手动删除损坏的 JSON 文件，重新配置

### 文件位置

- **Windows**: `C:\Users\{用户名}\.aipcowork\mcp\servers.json`
- **macOS/Linux**: `~/.aipcowork/mcp/servers.json`

## 📊 与记忆模块的对比

| 特性 | 记忆模块 | MCP 配置 |
|------|----------|----------|
| 存储位置 | `~/.aipcowork/memory/` | `~/.aipcowork/mcp/` |
| 文件格式 | Markdown (`.md`) | JSON (`.json`) |
| 文件数量 | 多个文件 | 单个文件 |
| 编辑方式 | 文件树 + 编辑器 | 设置界面 |
| 自动保存 | ✅ | ✅ |
| 后端命令 | `read_memory_tree`, `write_memory_file` | `load_mcp_servers`, `save_mcp_servers` |

## 🎯 最佳实践

1. **定期备份**：定期备份 `~/.aipcowork/mcp/servers.json`
2. **敏感信息**：生产环境建议使用环境变量而非硬编码 API Key
3. **版本管理**：可以将配置文件纳入版本控制（但需要忽略敏感字段）
4. **测试连接**：添加服务器后使用"测试连接"功能验证配置
5. **按需启用**：只启用需要的 MCP 服务器，减少资源消耗
