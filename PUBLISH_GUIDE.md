# Memento 扩展打包和发布指南

## 快速开始

### 1. 安装依赖

首先确保已安装所有依赖（包括 `@vscode/vsce`）：

```bash
npm install
```

### 2. 仅打包（本地测试）

如果只想打包扩展用于本地测试，使用：

```bash
# 使用脚本（推荐）
./scripts/package-only.sh

# 或使用 npm 命令
npm run package
```

这将生成一个 `.vsix` 文件，可以手动安装到 VSCode 中测试：

```bash
code --install-extension memento-x.x.x.vsix
```

### 3. 发布到 Marketplace

#### 准备工作

发布到 VSCode Marketplace 需要 Personal Access Token (PAT)。

**首次发布前需要：**

1. 访问 [Azure DevOps](https://dev.azure.com)
2. 创建一个 Personal Access Token（选择 Marketplace > Manage）
3. 设置环境变量：

```bash
# 临时设置（当前终端会话有效）
export VSCE_PAT=your_token_here

# 或永久设置（添加到 ~/.zshrc 或 ~/.bashrc）
echo 'export VSCE_PAT=your_token_here' >> ~/.zshrc
source ~/.zshrc
```

#### 发布流程

使用自动化脚本发布（推荐）：

```bash
# 发布 patch 版本（0.1.1 -> 0.1.2）
./scripts/publish.sh patch

# 发布 minor 版本（0.1.1 -> 0.2.0）
./scripts/publish.sh minor

# 发布 major 版本（0.1.1 -> 1.0.0）
./scripts/publish.sh major
```

脚本会自动：
1. ✅ 检查 Git 工作区状态
2. ✅ 运行代码检查（lint）
3. ✅ 编译 TypeScript
4. ✅ 打包扩展
5. ✅ 询问是否发布
6. ✅ 发布到 Marketplace（自动更新版本号）
7. ✅ 提交版本更新到 Git
8. ✅ 创建版本标签
9. ✅ 推送到远程仓库

## npm 脚本说明

`package.json` 中提供了以下脚本：

```json
{
  "scripts": {
    "package": "vsce package",              // 仅打包
    "publish": "vsce publish",              // 发布（不更新版本）
    "publish:patch": "vsce publish patch",  // 发布并更新 patch 版本
    "publish:minor": "vsce publish minor",  // 发布并更新 minor 版本
    "publish:major": "vsce publish major"   // 发布并更新 major 版本
  }
}
```

### 手动发布（不推荐）

如果不想使用自动化脚本，可以手动执行：

```bash
# 1. 运行检查
npm run lint

# 2. 编译
npm run compile

# 3. 打包
npm run package

# 4. 发布（会自动更新版本号）
npm run publish:patch  # 或 publish:minor / publish:major

# 5. 手动提交版本更新
git add package.json
git commit -m "chore: bump version to x.x.x"
git tag "vx.x.x"
git push origin main
git push origin vx.x.x
```

## 版本号规范

遵循 [语义化版本](https://semver.org/lang/zh-CN/)：

- **Patch (0.1.1 -> 0.1.2)**: 向后兼容的问题修复
- **Minor (0.1.1 -> 0.2.0)**: 向后兼容的新功能
- **Major (0.1.1 -> 1.0.0)**: 不向后兼容的重大变更

## 常见问题

### 1. 发布失败：未找到 Personal Access Token

```bash
export VSCE_PAT=your_token_here
```

### 2. 发布失败：权限不足

确保你的 PAT 具有 Marketplace 的 `Manage` 权限。

### 3. 打包文件过大

检查 `.vscodeignore` 文件，确保排除了不必要的文件（如 `node_modules`、`src`、`screenshots` 等）。

### 4. 查看已发布的扩展

访问：https://marketplace.visualstudio.com/items?itemName=wenyg.memento

### 5. 撤销已发布的版本

```bash
npx @vscode/vsce unpublish wenyg.memento@x.x.x
```

⚠️ **注意**：撤销操作不可逆，请谨慎使用。

## 最佳实践

1. ✅ 每次发布前先在本地测试
2. ✅ 确保 CHANGELOG.md 已更新
3. ✅ 确保所有测试通过
4. ✅ 确保 Git 工作区干净
5. ✅ 使用语义化版本号
6. ✅ 为每个版本创建 Git 标签
7. ✅ 在 GitHub 上创建 Release 页面

## 相关链接

- [VSCode 扩展发布文档](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
- [vsce 工具文档](https://github.com/microsoft/vscode-vsce)
- [Azure DevOps](https://dev.azure.com)
- [Marketplace 管理页面](https://marketplace.visualstudio.com/manage)

