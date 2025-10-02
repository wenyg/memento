# Memento

Memento 是一个轻量级的 Markdown 笔记管理插件，专为 VSCode 设计。它提供了多种视图来组织和查看你的笔记，支持标签分类、时间排序和日记/周报功能。

## 功能特性

### 📁 多视图笔记管理

#### 时间视图
- 按创建时间排序显示所有 Markdown 文件
- 最新笔记显示在最上方
- 显示文件标题（优先读取 Front Matter 或第一个标题）

#### 标签视图
- 自动提取笔记中的标签（支持 `#tag` 格式）
- 支持多级标签层级（如 `#parent/child`）
- 按标签分组显示笔记
- 支持 Front Matter 中的 `tags` 字段

#### 日历视图
- 快速创建和访问今日日记
- 快速创建和访问本周周报
- 查看最近的日记和周报历史记录
- 支持自定义文件命名格式和模板

### ✨ Front Matter 支持

优先从 YAML Front Matter 读取笔记元数据：

```yaml
---
title: 笔记标题
date: 2025-01-15
tags: [工作, 项目/重要]
---
```

支持的字段：
- `title`: 笔记标题
- `date`: 笔记日期
- `tags`: 标签（支持数组格式：`[tag1, tag2]` 或多行格式）

### 📝 日记与周报功能

#### 快速创建
- 命令：`Memento: 打开今天的日记`
- 命令：`Memento: 打开本周的周报`
- 如果文件已存在则直接打开，否则基于模板创建

#### 自定义配置
支持完全自定义文件命名和模板，通过配置文件 `.memento/config.json` 设置：

```json
{
  "dailyNotesPath": "daily",
  "dailyNoteFileNameFormat": "{{year}}-{{month}}-{{day}}.md",
  "dailyNoteTemplatePath": "templates/daily.md",
  "weeklyNotesPath": "weekly",
  "weeklyNoteFileNameFormat": "{{year}}-W{{week}}.md",
  "weeklyNoteTemplatePath": "templates/weekly.md"
}
```

支持的模板变量：
- `{{year}}`: 年份（4位）
- `{{month}}`: 月份（2位，补零）
- `{{day}}`: 日期（2位，补零）
- `{{week}}`: 周数（2位，补零）
- `{{title}}`: 自动生成的标题
- `{{date}}`: ISO 格式日期

### 🔧 智能过滤

支持文件夹过滤，避免扫描不必要的目录：

```json
{
  "excludeFolders": ["node_modules", ".git", "temp*"]
}
```

- 支持通配符匹配（如 `temp*`）
- 自动排除所有隐藏文件夹（以 `.` 开头）

### 🎯 便捷操作

- 右键菜单：在资源管理器中显示文件
- 工具栏快速切换：时间视图、标签视图、日历视图
- 刷新按钮：手动刷新视图

## 安装使用

### 安装
1. 在 VSCode 扩展市场搜索 "Memento"
2. 点击安装
3. 重启 VSCode

### 基础配置

#### 设置笔记根目录
在 VSCode 设置中配置 `memento.notesPath`：

1. 打开设置：`Cmd+,` (macOS) 或 `Ctrl+,` (Windows/Linux)
2. 搜索 `memento.notesPath`
3. 输入你的笔记根目录的绝对路径（留空则使用当前工作区）

示例：
```json
{
  "memento.notesPath": "/Users/yourname/Documents/Notes"
}
```

#### 高级配置
在笔记根目录下创建 `.memento/config.json` 文件进行高级配置：

```json
{
  "excludeFolders": ["node_modules", ".git", "drafts", "temp*"],
  "dailyNotesPath": "journal/daily",
  "dailyNoteFileNameFormat": "{{year}}-{{month}}-{{day}}.md",
  "dailyNoteTemplatePath": "templates/daily-template.md",
  "weeklyNotesPath": "journal/weekly",
  "weeklyNoteFileNameFormat": "{{year}}-W{{week}}.md",
  "weeklyNoteTemplatePath": "templates/weekly-template.md"
}
```

所有配置项都是可选的，未配置的项将使用默认值。

### 创建模板文件

在笔记目录下创建模板文件，例如 `templates/daily-template.md`：

```markdown
---
title: {{title}}
date: {{date}}
tags: [日记]
---

# {{title}}

## 今日计划


## 今日总结


## 其他记录

```

## 配置项说明

### VSCode 设置

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `memento.notesPath` | string | `""` | 笔记根目录的绝对路径（留空则使用当前工作区） |

### 配置文件 (`.memento/config.json`)

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `excludeFolders` | string[] | `["node_modules", ".git"]` | 排除的文件夹列表，支持通配符 |
| `dailyNotesPath` | string | `"daily"` | 日记存储路径（相对或绝对路径） |
| `dailyNoteFileNameFormat` | string | `"{{year}}-{{month}}-{{day}}.md"` | 日记文件名格式 |
| `dailyNoteTemplatePath` | string | `""` | 日记模板文件路径（相对或绝对路径） |
| `weeklyNotesPath` | string | `"weekly"` | 周报存储路径（相对或绝对路径） |
| `weeklyNoteFileNameFormat` | string | `"{{year}}-W{{week}}.md"` | 周报文件名格式 |
| `weeklyNoteTemplatePath` | string | `""` | 周报模板文件路径（相对或绝对路径） |

## 使用技巧

### 标签最佳实践
- 使用 `#标签` 格式在正文中添加标签
- 使用 `/` 创建多级标签：`#项目/重要`
- 在 Front Matter 中定义标签以避免在正文中显示

### 日记和周报
- 将日记和周报放在同一目录也可以，插件会根据文件名格式自动过滤
- 建议使用模板保持笔记格式一致
- 模板路径支持相对路径（相对于笔记根目录）

### Front Matter 工具
使用命令 `Memento: 填充 Front Matter Date 字段` 可以批量为没有日期的笔记添加 Front Matter date 字段（基于文件创建时间）。

## 常见问题

### Q: 笔记不在工作区中，能使用 VSCode 的搜索功能吗？
A: 可以。设置 `memento.notesPath` 后，插件会提示你将笔记目录添加到工作区，这样就可以使用 VSCode 的所有原生功能（搜索、文件管理等）。

### Q: 如何自定义文件夹排除规则？
A: 在 `.memento/config.json` 中配置 `excludeFolders` 字段，支持通配符匹配。

### Q: 模板文件可以使用相对路径吗？
A: 可以。相对路径是相对于笔记根目录的。例如配置 `"dailyNoteTemplatePath": "templates/daily.md"`，实际路径为 `{笔记根目录}/templates/daily.md`。

### Q: 日记和周报可以放在同一个文件夹吗？
A: 可以。插件会根据文件名格式自动过滤和区分日记和周报。

## 版本历史

### 0.0.1 (初始版本)

- ✅ 时间视图：按创建时间显示笔记
- ✅ 标签视图：支持多级标签层级
- ✅ 日历视图：日记和周报管理
- ✅ Front Matter 支持
- ✅ 文件夹过滤配置
- ✅ 自定义笔记根目录
- ✅ 模板系统
- ✅ 文件配置系统

## 反馈与贡献

如有问题或建议，欢迎反馈！

## 许可证

MIT
