<script setup lang="ts">
defineOptions({ name: 'MemoryTreeNode' })

interface TreeNode {
  name: string
  type: 'folder' | 'file'
  path: string
  children?: TreeNode[]
  createdAt?: string
  fileSize?: string
  content?: string
}

const props = defineProps<{
  item: TreeNode
  depth: number
  selectedPath: string
  expandedFolders: Set<string>
}>()

const emit = defineEmits<{
  select: [item: TreeNode]
  toggle: [path: string]
}>()

function isOpen(path: string): boolean {
  return props.expandedFolders.has(path)
}

function handleClick(item: TreeNode) {
  if (item.type === 'folder') {
    emit('toggle', item.path)
  } else {
    emit('select', item)
  }
}
</script>

<template>
  <div
    class="tree-node"
    :class="{
      'tree-node-active': item.type === 'file' && selectedPath === item.path,
    }"
    @click="handleClick(item)"
  >
    <div class="tree-node-main" :style="{ paddingLeft: (depth * 16 + 16) + 'px' }">
      <i
        v-if="item.type === 'folder'"
        :class="isOpen(item.path) ? 'fa-solid fa-folder-open' : 'fa-solid fa-folder'"
        class="tree-icon folder-icon"
      ></i>
      <i v-else class="fa-solid fa-file-lines tree-icon file-icon"></i>
      <span class="tree-name">{{ item.name }}</span>
      <span class="tree-time">{{ item.type === 'file' ? (item.createdAt || '') : '' }}</span>
      <span class="tree-size">{{ item.type === 'file' ? (item.fileSize || '') : '' }}</span>
    </div>
  </div>
  <template v-if="item.type === 'folder' && isOpen(item.path) && item.children">
    <MemoryTreeNode
      v-for="child in item.children"
      :key="child.path"
      :item="child"
      :depth="depth + 1"
      :selected-path="selectedPath"
      :expanded-folders="expandedFolders"
      @select="emit('select', $event)"
      @toggle="emit('toggle', $event)"
    />
  </template>
</template>

<style scoped>
.tree-node {
  cursor: pointer;
  transition: background 0.08s;
}
.tree-node:hover { background: #F8F8F8; }
.tree-node-active { background: #EEF2FF !important; }
.tree-node-active .tree-name { color: #4F46E5; font-weight: 500; }

.tree-node-main {
  display: flex;
  align-items: center;
  padding: 7px 16px 7px 0;
}

.tree-icon {
  width: 16px;
  text-align: center;
  margin-right: 8px;
  font-size: 13px;
  flex-shrink: 0;
}
.folder-icon { color: #F59E0B; }
.file-icon { color: #9CA3AF; }

.tree-name {
  flex: 1;
  font-size: 13px;
  color: #1A1A1A;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tree-time {
  width: 140px;
  font-size: 12px;
  color: #999;
  flex-shrink: 0;
  white-space: nowrap;
}

.tree-size {
  width: 80px;
  font-size: 12px;
  color: #999;
  flex-shrink: 0;
  white-space: nowrap;
}
</style>
