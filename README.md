# Memento

轻量级 Markdown 笔记管理插件，让你的笔记井井有条。

## ✨ 核心功能

- **最近笔记** - 按时间排序，快速访问最新笔记
![多视图](screenshots/main.png)
- **标签视图** - 支持多级标签（如 `#工作/项目`），自动分类
![标签视图](screenshots/tags.png)
  支持两种标签方式：
    - 正文中的 `#标签` 格式
    - Front Matter 中的 `tags` 字段

      ```yaml
      ---
      title: 我的笔记
      date: 2025-01-15
      tags: [工作, 项目/重要]
      ---
      ```
- **日报视图** - 日报、周报一键创建和管理
![日报视图](screenshots/report.png)
- **TODO 管理** - 强大的任务管理功能（底部面板视图，和终端同级）
  - 支持标准 Markdown 任务列表（`- [ ]` 和 `- [x]`）
  - 扩展属性：优先级（priority）、项目（project）、截止日期（due）、标签（#tag）
  - **底部面板表格视图**：
    - 显示在底部面板区域，和终端、端口等在同一位置
    - 清晰的表格布局，所有信息一目了然
    - 列排序功能（点击表头按优先级、截止日期等排序）
    - 实时搜索框，快速定位 TODO
    - 多维度过滤器（状态、优先级、项目）
    - 进度统计（总计/未完成/已完成/高优先级）
    - 截止日期颜色提示（红色=逾期，橙色=今日，绿色=即将到期）
  - 一键跳转到 TODO 所在文件和行
  - 复选框快速切换完成状态
  - 支持嵌套层级显示
  - 点击 Memento 侧边栏工具栏的 **✓** 按钮或底部面板的 TODO 图标打开
  - 可以和终端、输出等面板切换

  示例：
  ```markdown
  - [ ] 完成项目报告 #工作 project:Q4Report due:2025-11-01 priority:H
      - [x] 收集数据
      - [ ] 分析结果
  ```

## 📝 配置说明

![设置视图](screenshots/settings.png)

### 全局设置（VSCode 设置）
```json
{
  "memento.notesPath": "/Users/yourname/Documents/Notes"
}
```

### 日报模板变量
- `{{year}}` - 年份（4位）
- `{{month}}` - 月份（2位）
- `{{day}}` - 日期（2位）
- `{{week}}` - 周数（2位）
- `{{title}}` - 自动生成标题
- `{{date}}` - ISO 格式日期

## 🤝 反馈与贡献

欢迎提交 Issue 和 PR！

仓库地址：[https://github.com/wenyg/memento](https://github.com/wenyg/memento)