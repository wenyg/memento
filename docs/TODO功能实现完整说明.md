# TODO 功能实现完整说明

## 最终实现方案

**TODO 视图显示在底部面板区域**，和终端、输出、端口等在同一位置。

## 核心功能

### 1. TODO 解析
- 支持标准 Markdown 任务列表：`- [ ]` 和 `- [x]`
- 支持多层级嵌套（通过缩进识别）
- 扩展属性：
  - `priority:H/M/L` - 优先级（高/中/低）
  - `project:项目名` - 项目分类
  - `due:YYYY-MM-DD` - 截止日期
  - `#标签` - 标签支持

### 2. 表格界面
- 7列显示：状态、优先级、内容、项目、标签、截止日期、文件
- 可排序（点击表头）
- 实时搜索
- 多维度过滤（状态、优先级、项目）
- 进度统计显示
- 截止日期颜色提示（逾期/今日/即将到期）

### 3. 交互功能
- 点击复选框切换完成状态
- 点击内容或文件跳转到源文件
- 自动刷新（文件变化时）

## 代码文件结构

### 新增文件
```
src/providers/todoWebviewProvider.ts  - TODO WebView 提供者
docs/TODO功能说明.md                  - 功能使用说明
docs/TODO_WebView使用说明.md          - WebView 详细说明
docs/TODO功能实现总结.md              - 实现总结
```

### 修改文件
```
src/types.ts                - 添加 TODO 类型定义
src/utils.ts                - 添加 TODO 解析和操作函数
src/providers/index.ts      - 导出 TodoWebviewProvider
src/extension.ts            - 注册 TODO WebView 提供者
src/commands.ts             - 添加 TODO 相关命令
package.json                - 配置视图容器和视图
```

## package.json 关键配置

### ViewsContainers（底部面板容器）
```json
"viewsContainers": {
  "panel": [
    {
      "id": "memento-todo-panel",
      "title": "Memento TODO",
      "icon": "$(checklist)"
    }
  ]
}
```

### Views（TODO 视图）
```json
"views": {
  "memento-todo-panel": [
    {
      "id": "mementoTodoView",
      "name": "TODO 列表",
      "type": "webview",
      "when": "workspaceFolderCount > 0"
    }
  ]
}
```

### Commands
```json
{
  "command": "memento.showTodoPanel",
  "title": "TODO List",
  "icon": "$(checklist)"
},
{
  "command": "memento.refreshTodo",
  "title": "Refresh TODO",
  "icon": "$(refresh)"
}
```

## 类型定义（src/types.ts）

```typescript
export enum TodoPriority {
    HIGH = 'H',
    MEDIUM = 'M',
    LOW = 'L',
    NONE = ''
}

export interface TodoItem {
    filePath: string;
    fileName: string;
    lineNumber: number;
    content: string;
    completed: boolean;
    level: number;
    tags: string[];
    project?: string;
    due?: string;
    priority: TodoPriority;
}
```

## 工具函数（src/utils.ts）

### parseTodoAttributes()
解析 TODO 行的扩展属性（标签、项目、截止日期、优先级）

### extractTodosFromFile()
从单个文件中提取所有 TODO 项

### extractTodosFromDirectory()
从整个目录递归提取所有 TODO 项

### toggleTodoStatus()
切换 TODO 的完成状态（更新文件）

## WebView 提供者（src/providers/todoWebviewProvider.ts）

### 主要方法
- `resolveWebviewView()` - 初始化 WebView
- `refresh()` - 刷新 TODO 数据
- `handleToggleTodo()` - 处理切换状态
- `handleOpenTodo()` - 处理跳转到文件
- `_getHtmlForWebview()` - 生成 HTML 界面

### HTML 界面特性
- 完整的 CSS 样式（适配 VSCode 主题）
- JavaScript 交互逻辑（排序、过滤、搜索）
- 前后端消息通信（postMessage）

## 使用方式

### 打开 TODO 面板
1. 点击底部面板的 **✓** (TODO) 图标
2. 或点击 Memento 侧边栏工具栏的 **✓** 按钮
3. 或使用命令面板：`Memento: TODO List`

### TODO 语法示例
```markdown
- [ ] 完成项目报告 #工作 project:Q4Report due:2025-11-01 priority:H
    - [x] 收集数据
    - [ ] 分析数据
    - [ ] 编写报告
- [ ] 学习 TypeScript #学习 priority:M
```

### 界面操作
- **搜索**：输入关键词实时过滤
- **过滤**：按状态/优先级/项目筛选
- **排序**：点击表头按列排序
- **切换状态**：点击复选框
- **跳转**：点击内容或文件名

## 文件监听

自动监听 `.md` 文件的变化：
- 文件创建 → 刷新
- 文件修改 → 刷新
- 文件删除 → 刷新

## 布局效果

```
┌─────────────────────────────────┐
│ 编辑器区域                        │
│ [代码文件]                        │
├─────────────────────────────────┤
│ 底部面板                          │
│ [终端][输出][问题][端口][✓TODO]   │
│ ┌───────────────────────────┐   │
│ │ 🔄刷新  [搜索] [过滤器]    │   │
│ │ 统计: 32 | 未完成: 25 ...  │   │
│ │ ─────────────────────────  │   │
│ │ │☑│[H]│内容│项目│标签│... │   │
│ └───────────────────────────┘   │
└─────────────────────────────────┘
```

## 注意事项

1. **底部面板容器** - 使用 `viewsContainers.panel` 配置
2. **WebView 类型** - 必须指定 `type: "webview"`
3. **消息通信** - 使用 `postMessage` 和 `onDidReceiveMessage`
4. **主题适配** - 使用 VSCode CSS 变量
5. **性能优化** - 前端处理过滤和排序

## 扩展可能性

- [ ] 支持按截止日期排序和提醒
- [ ] TODO 统计图表
- [ ] 导出功能
- [ ] 批量操作
- [ ] 自定义过滤规则
- [ ] 子任务进度自动计算

## 版本信息

- **首次实现**：v0.2.0
- **位置**：底部面板（和终端同级）
- **技术**：WebView + Panel Container

---

**重要提示**：此实现使用了 VSCode 的 Panel ViewContainer 功能，这是 GitLens 等扩展使用的标准方式。

