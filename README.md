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
- **日报视图** - 日记、周报一键创建和管理
![日报视图](screenshots/report.png)




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

## 🔧 常见问题

**Q: 笔记不在工作区，如何搜索？**
A: 在设置中点击"在 VSCode 中打开笔记目录"，会在新窗口打开笔记目录，可使用 VSCode 全部功能。

**Q: 如何排除某些文件夹？**
A: 在设置视图 → 文件过滤中配置，支持通配符（如 `temp*`）。

**Q: 笔记不显示？**
A: 新打开或者新添加的笔记需要刷新后才能显示

## 📦 版本历史
### 0.1.1

- 优化日报视图

### 0.1.0
- ✅ 时间视图、标签视图、日历视图
- ✅ Front Matter 支持
- ✅ 新建笔记功能
- ✅ 日记周报系统
- ✅ 可视化设置界面

## 🤝 反馈与贡献

欢迎提交 Issue 和 PR！

仓库地址：[https://github.com/wenyg/memento](https://github.com/wenyg/memento)