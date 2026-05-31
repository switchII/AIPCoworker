/**
 * 上下文优化模块 — 公共 API。
 *
 * 导出上下文优化工具和类型。
 */

export {
  optimizeToolResult,
  shouldOptimizeTool,
  type ContextOptimizerConfig,
} from './contextOptimizer'

export {
  ContextCompressor,
  createContextCompressor,
  estimateMessageTokens,
  shouldCompress,
  type ContextCompressorConfig,
  type CompressionStats,
} from './contextCompressor'
