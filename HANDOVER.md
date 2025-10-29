# Memento 项目交接文档

> 本文档为 Memento 项目的开发交接文档，帮助后续开发者快速理解项目结构和进行功能开发。

## 📋 项目概述

Memento 是一个轻量级的 VSCode Markdown 笔记管理扩展，主要功能包括：
- 按时间排序的最近笔记列表
- 层级标签分类系统
- 日记和周报管理
- Front Matter 支持
- 可配置的文件过滤和模板系统

**技术栈**: TypeScript + VSCode Extension API + Node.js File System

## 📁 项目文件结构

```
src/
├── extension.ts          # 扩展入口文件
├── types.ts              # 全局类型定义
├── commands.ts           # 命令实现
├── config.ts             # 配置管理
├── utils.ts              # 工具函数
└── providers/            # 视图提供者
    ├── index.ts          # 导出所有提供者
    ├── base.ts           # 基础树节点类
    ├── mainTreeProvider.ts    # 主视图控制器
    ├── mdFilesProvider.ts     # 文件列表视图
    ├── tagTreeProvider.ts     # 标签树视图
    └── calendarProvider.ts    # 日历视图

package.json              # 扩展配置和命令定义
```

## 🗂️ 核心文件功能说明

### 1. `src/extension.ts` - 扩展入口
**作用**: VSCode 扩展的激活入口，负责初始化和资源管理

**核心功能**:
- `activate()` - 扩展激活时调用，注册所有命令和视图
- `setupFileWatcher()` - 设置文件监听器，自动刷新视图
- `deactivate()` - 扩展停用时清理资源

**何时修改**:
- 需要添加新的全局监听器
- 需要在扩展启动时执行初始化逻辑
- 需要添加全局的资源管理

### 2. `src/types.ts` - 类型定义
**作用**: 定义项目中所有的 TypeScript 接口和枚举

**核心类型**:
- `MdFileInfo` - Markdown 文件信息
- `FrontMatter` - Front Matter 数据结构
- `MementoConfig` - 配置接口
- `TagInfo` - 标签信息结构
- `ViewMode` - 视图模式枚举
- `CalendarItemType` - 日历项类型

**何时修改**:
- 添加新的数据结构
- 扩展现有接口的字段
- 添加新的视图模式

### 3. `src/commands.ts` - 命令实现
**作用**: 实现所有用户可触发的命令

**核心函数**:
- `openPeriodicNote()` - 打开日记/周报
- `createNote()` - 创建新笔记
- `fillFrontMatterDate()` - 填充 Front Matter 日期
- `registerCommands()` - 注册所有命令

**何时修改**:
- 添加新的用户命令
- 修改现有命令的行为
- 添加新的快捷操作

**命令注册流程**:
1. 在 `registerCommands()` 中使用 `vscode.commands.registerCommand()` 注册
2. 将命令添加到 `context.subscriptions`
3. 在 `package.json` 的 `contributes.commands` 中声明

### 4. `src/config.ts` - 配置管理
**作用**: 管理扩展的配置和默认值

**核心函数**:
- `getNotesRootPath()` - 获取笔记根目录
- `loadMementoConfig()` - 加载本地配置文件
- `saveMementoConfig()` - 保存配置到本地
- `resolveTemplatePath()` - 解析模板路径
- `getDefaultDailyTemplate()` - 获取默认日记模板
- `getDefaultWeeklyTemplate()` - 获取默认周报模板

**配置层级**:
1. VSCode 设置（`memento.notesPath`）- 全局笔记目录
2. 本地配置文件（`.memento/config.json`）- 项目级配置
3. 默认配置（`DEFAULT_CONFIG`）- 代码中的默认值

**何时修改**:
- 添加新的配置项
- 修改默认配置值
- 添加新的模板类型

### 5. `src/utils.ts` - 工具函数
**作用**: 提供通用的工具函数，特别是 Markdown 文件处理

**核心函数**:
- `parseFrontMatter()` - 解析 YAML Front Matter
- `extractTagsFromFile()` - 提取文件中的标签
- `extractFirstHeading()` - 提取文件标题
- `findMarkdownFiles()` - 扫描所有 Markdown 文件
- `findMarkdownFilesWithTags()` - 扫描文件并提取标签
- `shouldExcludeFolder()` - 检查是否应排除文件夹
- `getWeekNumber()` - 计算周数
- `fillFrontMatterDateForFile()` - 为单个文件填充日期

**何时修改**:
- 改进 Markdown 解析逻辑
- 添加新的文件扫描功能
- 修改标签提取规则
- 优化文件扫描性能

### 6. `src/providers/mainTreeProvider.ts` - 主视图控制器
**作用**: 管理不同视图模式的切换和显示

**核心功能**:
- 管理 4 种视图模式：FILES, TAGS, CALENDAR, SETTINGS
- 协调各个子 Provider 的刷新
- 实现设置视图的交互式配置

**何时修改**:
- 添加新的视图模式
- 修改设置项的显示和交互
- 改变视图切换逻辑

### 7. `src/providers/mdFilesProvider.ts` - 文件列表视图
**作用**: 提供按时间排序的文件列表

**核心功能**:
- 扫描所有 Markdown 文件
- 按创建时间（或 Front Matter date）排序
- 提供点击打开文件功能

**何时修改**:
- 修改文件排序逻辑
- 添加文件分组功能
- 改变文件显示格式

### 8. `src/providers/tagTreeProvider.ts` - 标签树视图
**作用**: 提供层级标签分类视图

**核心功能**:
- 构建标签树结构（支持 `/` 分隔的层级标签）
- 显示每个标签下的文件列表
- 支持标签展开/折叠

**何时修改**:
- 修改标签层级逻辑
- 添加标签统计功能
- 改变标签显示样式

### 9. `src/providers/calendarProvider.ts` - 日历视图
**作用**: 提供日记和周报的日历式管理

**核心功能**:
- 显示年份/周数的树形结构
- 快速创建和访问日记/周报
- 提供日期导航

**何时修改**:
- 添加月历视图
- 修改周数计算逻辑
- 添加日期跳转功能

### 10. `package.json` - 扩展配置
**作用**: VSCode 扩展的元数据和配置

**核心配置**:
- `contributes.commands` - 所有可用命令
- `contributes.views` - 视图容器定义
- `contributes.configuration` - 用户可配置项
- `contributes.menus` - 菜单和工具栏按钮

**何时修改**:
- 添加新命令需要在这里声明
- 添加新的配置项
- 修改视图图标和名称
- 添加右键菜单项

## 🎯 功能修改指南

### 添加新的命令

**涉及文件**:
1. `src/commands.ts` - 实现命令逻辑
2. `package.json` - 声明命令

**步骤**:
```typescript
// 1. 在 commands.ts 中实现命令
export async function myNewCommand(): Promise<void> {
    // 命令逻辑
}

// 2. 在 registerCommands() 中注册
const myCommandDisposable = vscode.commands.registerCommand('memento.myCommand', async () => {
    await myNewCommand();
    mainProvider.refresh();
});
context.subscriptions.push(myCommandDisposable);

// 3. 在 package.json 的 contributes.commands 中声明
{
  "command": "memento.myCommand",
  "title": "Memento: My New Command"
}
```

### 修改文件扫描逻辑

**涉及文件**: `src/utils.ts`

**核心函数**: `findMarkdownFiles()`, `findMarkdownFilesWithTags()`

**常见场景**:
- 添加新的排除规则 → 修改 `shouldExcludeFolder()`
- 改变排序方式 → 修改返回后的排序逻辑
- 添加文件过滤 → 在 `scanDirectory()` 中添加条件

### 修改标签提取逻辑

**涉及文件**: `src/utils.ts`

**核心函数**: `extractTagsFromFile()`

**常见场景**:
- 支持新的标签格式 → 修改正则表达式
- 改变标签优先级 → 调整 Front Matter 和正文标签的合并逻辑
- 添加标签过滤 → 在标签提取后添加过滤条件

### 添加新的视图模式

**涉及文件**:
1. `src/types.ts` - 添加新的 `ViewMode` 枚举
2. `src/providers/` - 创建新的 Provider 类
3. `src/providers/mainTreeProvider.ts` - 添加视图切换逻辑
4. `src/commands.ts` - 添加视图切换命令
5. `package.json` - 添加视图切换按钮

### 修改 Front Matter 解析

**涉及文件**: `src/utils.ts`

**核心函数**: `parseFrontMatter()`

**常见场景**:
- 支持新的字段 → 直接在函数中解析，返回值会包含所有字段
- 改变数组解析逻辑 → 修改数组格式识别部分
- 添加类型验证 → 在解析后添加验证逻辑

### 修改模板系统

**涉及文件**: `src/config.ts`, `src/commands.ts`

**核心函数**: 
- `getDefaultDailyTemplate()` - 修改默认日记模板
- `getDefaultWeeklyTemplate()` - 修改默认周报模板
- `openPeriodicNote()` - 修改变量替换逻辑

**添加新的模板变量**:
```typescript
// 在 openPeriodicNote() 中添加新的变量替换
template = template
    .replace(/\{\{myVar\}\}/g, myValue)
    // ... 其他变量
```

### 修改设置界面

**涉及文件**: `src/providers/mainTreeProvider.ts`

**核心函数**: `getSettingsItems()`

**常见场景**:
- 添加新的设置项 → 在相应分类下添加新的 `CalendarItem`
- 添加新的设置分类 → 在根级别添加新的分类项
- 修改设置交互方式 → 修改 action 回调函数

## 🔄 数据流理解

### 文件扫描流程
```
用户打开扩展
    ↓
extension.ts: activate()
    ↓
MainTreeProvider 创建
    ↓
MdFilesProvider.getChildren()
    ↓
utils.ts: findMarkdownFiles()
    ↓
扫描目录 → 排除文件夹 → 提取标题 → 解析 Front Matter → 排序
    ↓
返回 MdFileInfo[] 数组
    ↓
转换为 TreeItem 显示在侧边栏
```

### 标签树构建流程
```
用户切换到标签视图
    ↓
TagTreeProvider.getChildren()
    ↓
utils.ts: findMarkdownFilesWithTags()
    ↓
扫描文件 → 提取标签（Front Matter + 正文）
    ↓
buildTagTree() 构建层级结构
    ↓
支持 '/' 分隔的层级标签
    ↓
显示标签树和文件列表
```

### 配置加载流程
```
需要配置时
    ↓
config.ts: loadMementoConfig()
    ↓
读取 .memento/config.json
    ↓
合并默认配置
    ↓
返回 MementoConfig 对象
```

### 命令执行流程
```
用户触发命令
    ↓
commands.ts: 命令函数执行
    ↓
调用 config/utils 函数
    ↓
执行业务逻辑（创建文件/修改配置等）
    ↓
mainProvider.refresh() 刷新视图
    ↓
相应 Provider 重新加载数据
    ↓
视图更新
```

## 🛠️ 常见开发任务

### 任务 1: 添加文件过滤功能
**需求**: 只显示包含特定标签的文件

**修改文件**: `src/providers/mdFilesProvider.ts`

**步骤**:
1. 在 `getChildren()` 中调用 `findMarkdownFilesWithTags()` 而不是 `findMarkdownFiles()`
2. 添加过滤逻辑：`files.filter(f => f.tags?.includes('目标标签'))`
3. 可选：在设置中添加过滤配置项

### 任务 2: 添加文件搜索功能
**需求**: 支持按标题/内容搜索文件

**修改文件**: 
- `src/commands.ts` - 添加搜索命令
- `src/utils.ts` - 添加搜索函数
- `package.json` - 注册命令

**步骤**:
1. 在 `utils.ts` 中添加 `searchMarkdownFiles()` 函数
2. 在 `commands.ts` 中添加 `searchNotes()` 命令
3. 使用 `vscode.window.showQuickPick()` 显示搜索结果

### 任务 3: 支持自定义排序方式
**需求**: 支持按标题/修改时间排序

**修改文件**:
- `src/types.ts` - 添加排序枚举
- `src/config.ts` - 添加排序配置
- `src/providers/mdFilesProvider.ts` - 修改排序逻辑

### 任务 4: 添加文件统计功能
**需求**: 显示文件数量、标签数量等统计

**修改文件**:
- `src/utils.ts` - 添加统计函数
- `src/providers/mainTreeProvider.ts` - 在设置中显示统计

### 任务 5: 支持导出功能
**需求**: 导出笔记为 PDF/HTML

**修改文件**:
- `src/commands.ts` - 添加导出命令
- 可能需要添加新的依赖包（如 markdown-pdf）

## ⚠️ 开发注意事项

### 1. 异步操作
所有文件操作都是异步的，必须使用 `async/await` 并添加错误处理：

```typescript
try {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    // 处理内容
} catch (error) {
    console.error('Error reading file:', error);
    vscode.window.showErrorMessage('读取文件失败');
}
```

### 2. 视图刷新
修改数据后必须刷新视图：

```typescript
// 在 Provider 中
this._onDidChangeTreeData.fire();

// 或者在命令中
mainProvider.refresh();
```

### 3. 路径处理
始终使用 `path.join()` 而不是字符串拼接：

```typescript
// 正确
const fullPath = path.join(notesPath, relativePath);

// 错误
const fullPath = notesPath + '/' + relativePath; // 在 Windows 上会出错
```

### 4. 配置更新
修改配置后要保存到文件：

```typescript
const newConfig = { ...config, newField: newValue };
await saveMementoConfig(notesPath, newConfig);
```

### 5. 命令注册
所有 disposable 对象都必须添加到 `context.subscriptions`：

```typescript
const disposable = vscode.commands.registerCommand('memento.myCommand', handler);
context.subscriptions.push(disposable); // 必须添加，否则内存泄漏
```

### 6. 文件编码
所有文件操作都使用 UTF-8 编码：

```typescript
await fs.promises.readFile(filePath, 'utf-8');
await fs.promises.writeFile(filePath, content, 'utf-8');
```

### 7. 正则表达式
支持 Unicode 字符（中文）：

```typescript
// 使用 \p{L} 匹配任何 Unicode 字母
const regex = /#([\p{L}\p{N}_\-\/]+)/gu;
```

### 8. 错误提示
使用 VSCode 的通知 API 显示错误：

```typescript
vscode.window.showErrorMessage('操作失败');
vscode.window.showInformationMessage('✓ 操作成功');
vscode.window.showWarningMessage('注意：...');
```

## 🧪 测试和调试

### 本地测试
1. 按 `F5` 启动调试
2. 在新窗口中打开测试笔记目录
3. 查看 Debug Console 的日志输出

### 日志输出
在代码中添加日志：

```typescript
console.log('Debug info:', variable);
console.error('Error:', error);
```

### 断点调试
在 VSCode 中设置断点，按 `F5` 启动调试模式

### 打包测试
```bash
npm run compile    # 编译 TypeScript
npm run package    # 打包成 .vsix
```

## 📦 发布流程

```bash
# 更新版本号
npm run publish:patch   # 0.1.0 -> 0.1.1
npm run publish:minor   # 0.1.0 -> 0.2.0
npm run publish:major   # 0.1.0 -> 1.0.0

# 或手动发布
vsce publish
```

## 📚 相关资源

- [VSCode Extension API](https://code.visualstudio.com/api)
- [TreeDataProvider 文档](https://code.visualstudio.com/api/extension-guides/tree-view)
- [Front Matter 规范](https://jekyllrb.com/docs/front-matter/)
- [项目 GitHub](https://github.com/wenyg/memento)

## 🤝 开发建议

1. **保持一致性**: 遵循现有的代码风格和命名规范
2. **注释清晰**: 为复杂逻辑添加注释
3. **错误处理**: 所有异步操作都要有 try-catch
4. **用户体验**: 提供清晰的错误提示和成功反馈
5. **性能优化**: 大量文件时考虑缓存和懒加载
6. **向后兼容**: 修改配置结构时保持向后兼容

## 📝 更新日志

查看 `CHANGELOG.md` 了解版本更新历史。

---

**最后更新**: 2025-10-29
**维护者**: Memento Team

