// Barrel re-exports — each category lives in its own file.
// All existing imports of '../types/agent' continue to work unchanged.

export type {
  LLMProvider,
  ApiFormat,
  ModelInfo,
  ProviderInstance,
  ActiveModel,
  ModelCapability,
} from './llm'
export type { LLMConfig } from './llm'

export type { AgentDefinition, SkillDefinition } from './agent-def'

export type { PermissionMode, PermissionConfig, SafetyConfig } from './permission'

export type { MCPTransport, MCPServerConfig } from './integration'
export type { IMPlatform, CapabilityLevel, IMChannelConfig } from './integration'
export type { SearchProvider, SearchConfig } from './integration'
export type { NoticeTier, NoticeChannel, NoticeConfig } from './integration'

export type { ScheduleType, ScheduledTask, TriggerType, TriggerConfig } from './scheduler'

export type { MemoryType, MemoryEntry } from './system'
export type { ContextConfig, SoulConfig, UpdateConfig } from './system'
export type { SandboxConfig, LogLevel, LogConfig, CheckStatus, DiagnosticResult } from './system'

export type { MessageRole, ToolCallStatus, ToolCall, ChatMessage, Conversation } from './chat'

export type {
  TaskStatus, BlockStatus,
  ExecutionStep, WebSearchResult, ExecutionBlock, TaskRecord,
  PlanItemStatus, ExecutionMode, PlanItem,
} from './task'
