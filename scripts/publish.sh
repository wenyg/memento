#!/bin/bash

# VSCode 扩展打包发布脚本
# 用法: ./scripts/publish.sh [patch|minor|major]

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 获取版本类型，默认为 patch
VERSION_TYPE=${1:-patch}

# 验证版本类型
if [[ ! "$VERSION_TYPE" =~ ^(patch|minor|major)$ ]]; then
    echo -e "${RED}错误: 版本类型必须是 patch, minor 或 major${NC}"
    exit 1
fi

echo -e "${GREEN}=== Memento 扩展发布流程 ===${NC}"
echo ""

# 1. 检查工作区是否干净
echo -e "${YELLOW}检查 Git 工作区状态...${NC}"
if [[ -n $(git status -s) ]]; then
    echo -e "${RED}警告: 工作区有未提交的更改${NC}"
    git status -s
    read -p "是否继续? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# 2. 运行测试和 lint
echo -e "${YELLOW}运行代码检查...${NC}"
npm run lint

# 3. 编译项目
echo -e "${YELLOW}编译 TypeScript...${NC}"
npm run compile

# 4. 打包扩展
echo -e "${YELLOW}打包扩展 (不更新版本)...${NC}"
npm run package

# 5. 询问是否发布
echo ""
echo -e "${GREEN}打包完成！${NC}"
read -p "是否发布到 VSCode Marketplace? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}已取消发布${NC}"
    exit 0
fi

# 6. 检查是否有 Personal Access Token
if [[ -z "${VSCE_PAT}" ]]; then
    echo -e "${RED}错误: 未设置 VSCE_PAT 环境变量${NC}"
    echo "请先设置 Personal Access Token:"
    echo "export VSCE_PAT=your_token_here"
    exit 1
fi

# 7. 发布扩展并自动更新版本
echo -e "${YELLOW}发布扩展 (版本类型: $VERSION_TYPE)...${NC}"
npm run publish:$VERSION_TYPE

# 8. 获取新版本号
NEW_VERSION=$(node -p "require('./package.json').version")

# 9. 提交版本更新
echo -e "${YELLOW}提交版本更新...${NC}"
git add package.json
git commit -m "chore: bump version to $NEW_VERSION"
git tag "v$NEW_VERSION"

# 10. 推送到远程
echo -e "${YELLOW}推送到远程仓库...${NC}"
git push origin main
git push origin "v$NEW_VERSION"

echo ""
echo -e "${GREEN}=== 发布完成！===${NC}"
echo -e "版本: ${GREEN}v$NEW_VERSION${NC}"
echo -e "Marketplace: ${GREEN}https://marketplace.visualstudio.com/items?itemName=wenyg.memento${NC}"

