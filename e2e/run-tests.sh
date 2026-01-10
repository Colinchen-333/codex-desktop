#!/bin/bash
# Codex Desktop 自动化测试脚本

set -e

echo "🚀 Codex Desktop 自动化测试"
echo "================================"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查开发服务器
check_server() {
    if curl -s -o /dev/null -w "%{http_code}" http://localhost:5173 | grep -q "200"; then
        echo -e "${GREEN}✓ 开发服务器已运行${NC}"
        return 0
    else
        echo -e "${YELLOW}⚠ 开发服务器未运行${NC}"
        return 1
    fi
}

# 启动开发服务器
start_server() {
    echo "📦 启动开发服务器..."
    npm run dev &
    DEV_PID=$!
    sleep 5

    if check_server; then
        echo "服务器 PID: $DEV_PID"
    else
        echo -e "${RED}✗ 服务器启动失败${NC}"
        exit 1
    fi
}

# 运行测试
run_tests() {
    echo ""
    echo "🧪 运行测试..."
    echo "--------------------------------"

    # 创建截图目录
    mkdir -p e2e/screenshots

    # 根据参数选择测试
    case "${1:-all}" in
        "onboarding")
            npx playwright test e2e/full-app.spec.ts --grep "Onboarding" --reporter=list
            ;;
        "session")
            npx playwright test e2e/full-app.spec.ts --grep "会话管理" --reporter=list
            ;;
        "message")
            npx playwright test e2e/full-app.spec.ts --grep "消息发送" --reporter=list
            ;;
        "slash")
            npx playwright test e2e/full-app.spec.ts --grep "Slash" --reporter=list
            ;;
        "ui")
            npx playwright test e2e/full-app.spec.ts --grep "UI 错误" --reporter=list
            ;;
        "all")
            npx playwright test e2e/full-app.spec.ts --reporter=list
            ;;
        "ui-mode")
            npx playwright test --ui
            ;;
        "headed")
            npx playwright test e2e/full-app.spec.ts --headed --reporter=list
            ;;
        *)
            echo "用法: $0 [onboarding|session|message|slash|ui|all|ui-mode|headed]"
            exit 1
            ;;
    esac
}

# 生成报告
generate_report() {
    echo ""
    echo "📊 生成测试报告..."
    npx playwright show-report
}

# 主流程
main() {
    echo "测试类型: ${1:-all}"
    echo ""

    # 检查或启动服务器
    if ! check_server; then
        start_server
        STARTED_SERVER=true
    fi

    # 运行测试
    run_tests "$1"
    TEST_RESULT=$?

    # 如果我们启动了服务器，清理它
    if [ "$STARTED_SERVER" = true ]; then
        echo ""
        echo "🧹 清理服务器进程..."
        kill $DEV_PID 2>/dev/null || true
    fi

    echo ""
    echo "================================"
    if [ $TEST_RESULT -eq 0 ]; then
        echo -e "${GREEN}✅ 测试完成${NC}"
    else
        echo -e "${RED}❌ 测试失败${NC}"
    fi

    exit $TEST_RESULT
}

# 帮助信息
if [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
    echo "用法: $0 [测试类型]"
    echo ""
    echo "测试类型:"
    echo "  onboarding  - 只测试 Onboarding 流程"
    echo "  session     - 只测试会话管理"
    echo "  message     - 只测试消息发送"
    echo "  slash       - 只测试 Slash 命令"
    echo "  ui          - 只测试 UI 错误检测"
    echo "  all         - 运行所有测试 (默认)"
    echo "  ui-mode     - 打开 Playwright UI 模式"
    echo "  headed      - 有头模式运行（可见浏览器）"
    echo ""
    echo "示例:"
    echo "  $0              # 运行所有测试"
    echo "  $0 slash        # 只测试 Slash 命令"
    echo "  $0 headed       # 有头模式查看测试过程"
    exit 0
fi

main "$1"
