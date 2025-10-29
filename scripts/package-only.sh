#!/bin/bash

# VSCode 扩展仅打包脚本（不发布）
# 用法: ./scripts/package-only.sh

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Memento 扩展打包 ===${NC}"
echo ""

# 1. 运行 lint
echo -e "${YELLOW}运行代码检查...${NC}"
npm run lint

# 2. 编译项目
echo -e "${YELLOW}编译 TypeScript...${NC}"
npm run compile

# 3. 打包扩展
echo -e "${YELLOW}打包扩展...${NC}"
npm run package

# 4. 显示结果
echo ""
echo -e "${GREEN}=== 打包完成！===${NC}"

# 查找最新的 .vsix 文件
VSIX_FILE=$(ls -t memento-*.vsix 2>/dev/null | head -n 1)
if [[ -n "$VSIX_FILE" ]]; then
    FILE_SIZE=$(du -h "$VSIX_FILE" | cut -f1)
    echo -e "文件: ${GREEN}$VSIX_FILE${NC}"
    echo -e "大小: ${GREEN}$FILE_SIZE${NC}"
    echo ""
    echo "可以通过以下方式安装测试:"
    echo -e "${YELLOW}code --install-extension $VSIX_FILE${NC}"
else
    echo -e "${RED}错误: 未找到 .vsix 文件${NC}"
    exit 1
fi

