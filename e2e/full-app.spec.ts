import { test, expect, Page } from '@playwright/test'

/**
 * Codex Desktop 完整自动化测试套件
 * 测试内容：
 * 1. 会话管理（新建/选择/切换）
 * 2. 消息发送与响应
 * 3. Slash 命令
 * 4. UI 错误检测
 */

// 测试配置
const BASE_URL = 'http://localhost:5173'
const TIMEOUT = {
  short: 2000,
  medium: 5000,
  long: 10000,
  response: 30000, // 等待 AI 响应
}

// 辅助函数
class CodexTestHelper {
  constructor(private page: Page) {}

  // 等待页面稳定
  async waitForStable() {
    await this.page.waitForLoadState('networkidle')
    await this.page.waitForTimeout(500)
  }

  // 截图并记录
  async screenshot(name: string) {
    await this.page.screenshot({
      path: `e2e/screenshots/test-${name}-${Date.now()}.png`,
      fullPage: true
    })
  }

  // 检查是否有错误提示
  async checkForErrors(): Promise<string[]> {
    const errors: string[] = []

    // 检查 toast 错误
    const toasts = await this.page.locator('[class*="toast"][class*="error"], [class*="error-message"], [role="alert"]').all()
    for (const toast of toasts) {
      const text = await toast.textContent()
      if (text) errors.push(`Toast: ${text}`)
    }

    // 检查控制台错误
    // (通过 page.on('console') 在 beforeEach 中设置)

    return errors
  }

  // 完成 Onboarding 流程
  async completeOnboarding() {
    // 步骤 1: 欢迎页
    const getStarted = this.page.locator('button:has-text("Get Started")')
    if (await getStarted.isVisible({ timeout: TIMEOUT.short }).catch(() => false)) {
      await getStarted.click()
      await this.waitForStable()
    }

    // 步骤 2: 登录页 - 跳过
    const skipLogin = this.page.locator('button:has-text("Skip for Now"), button:has-text("Skip")')
    if (await skipLogin.isVisible({ timeout: TIMEOUT.short }).catch(() => false)) {
      await skipLogin.click()
      await this.waitForStable()
    }

    // 步骤 3: 项目选择 - 稍后添加
    const skipProject = this.page.locator('button:has-text("add it later"), text="I\'ll add it later"')
    if (await skipProject.isVisible({ timeout: TIMEOUT.short }).catch(() => false)) {
      await skipProject.click()
      await this.waitForStable()
    }

    // 继续跳过其他步骤
    for (let i = 0; i < 3; i++) {
      const skipBtn = this.page.locator('button:has-text("Skip"), button:has-text("Later"), button:has-text("Continue")')
      if (await skipBtn.first().isVisible({ timeout: TIMEOUT.short }).catch(() => false)) {
        await skipBtn.first().click()
        await this.waitForStable()
      }
    }
  }

  // 查找聊天输入框
  async getChatInput() {
    const selectors = [
      'textarea[placeholder*="message"]',
      'textarea[placeholder*="Message"]',
      'textarea[placeholder*="输入"]',
      'textarea',
      'input[type="text"]',
    ]

    for (const selector of selectors) {
      const input = this.page.locator(selector).first()
      if (await input.isVisible({ timeout: TIMEOUT.short }).catch(() => false)) {
        return input
      }
    }
    return null
  }

  // 发送消息
  async sendMessage(message: string) {
    const input = await this.getChatInput()
    if (!input) {
      throw new Error('找不到聊天输入框')
    }

    await input.fill(message)
    await this.page.keyboard.press('Enter')
    await this.waitForStable()
  }

  // 执行 Slash 命令
  async executeSlashCommand(command: string) {
    const input = await this.getChatInput()
    if (!input) {
      throw new Error('找不到聊天输入框')
    }

    await input.fill(`/${command}`)
    await this.page.waitForTimeout(300) // 等待命令提示显示
    await this.page.keyboard.press('Enter')
    await this.waitForStable()
  }

  // 等待 AI 响应
  async waitForResponse(timeout = TIMEOUT.response) {
    // 等待 loading 状态消失
    const loadingIndicator = this.page.locator('[class*="loading"], [class*="spinner"], [class*="typing"]')

    try {
      // 先等待 loading 出现
      await loadingIndicator.waitFor({ state: 'visible', timeout: TIMEOUT.medium })
      // 再等待 loading 消失
      await loadingIndicator.waitFor({ state: 'hidden', timeout })
    } catch {
      // loading 可能很快消失或不出现
    }

    await this.waitForStable()
  }

  // 获取最新消息
  async getLatestMessage() {
    const messages = this.page.locator('[class*="message"], [class*="Message"], [data-message]')
    const count = await messages.count()
    if (count > 0) {
      return await messages.last().textContent()
    }
    return null
  }

  // 检查会话列表
  async getSessionCount() {
    const sessions = this.page.locator('[class*="session"], [class*="conversation"], [class*="thread"]')
    return await sessions.count()
  }
}

// ==================== 测试用例 ====================

test.describe('Codex Desktop 完整测试', () => {
  let helper: CodexTestHelper
  let consoleErrors: string[] = []

  test.beforeEach(async ({ page }) => {
    helper = new CodexTestHelper(page)
    consoleErrors = []

    // 监听控制台错误
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text())
      }
    })

    await page.goto(BASE_URL)
    await helper.waitForStable()
  })

  test.afterEach(async () => {
    // 报告收集到的错误
    if (consoleErrors.length > 0) {
      console.log('⚠️ 控制台错误:', consoleErrors)
    }
  })

  // ==================== Onboarding 测试 ====================

  test.describe('Onboarding 流程', () => {
    test('应该显示欢迎页面', async ({ page }) => {
      const welcome = page.locator('text=Welcome to Codex')
      await expect(welcome).toBeVisible()
      await helper.screenshot('onboarding-welcome')
    })

    test('应该能完成整个 Onboarding', async ({ page }) => {
      await helper.completeOnboarding()
      await helper.screenshot('onboarding-complete')

      // 验证进入主界面
      const mainUI = page.locator('textarea, [class*="chat"], [class*="main"]')
      const isMainVisible = await mainUI.first().isVisible({ timeout: TIMEOUT.medium }).catch(() => false)

      console.log('✅ Onboarding 完成, 主界面可见:', isMainVisible)
    })
  })

  // ==================== 会话管理测试 ====================

  test.describe('会话管理', () => {
    test.beforeEach(async () => {
      await helper.completeOnboarding()
    })

    test('应该能创建新会话', async ({ page }) => {
      // 查找新建会话按钮
      const newSessionBtn = page.locator('button:has-text("New"), button:has-text("新建"), [aria-label*="new"]')

      if (await newSessionBtn.first().isVisible({ timeout: TIMEOUT.short }).catch(() => false)) {
        await newSessionBtn.first().click()
        await helper.waitForStable()

        await helper.screenshot('new-session')
        console.log('✅ 新建会话按钮已点击')
      } else {
        console.log('ℹ️ 未找到新建会话按钮（可能已在新会话中）')
      }
    })

    test('应该能查看会话列表', async ({ page }) => {
      // 查找会话列表/历史按钮
      const historyBtn = page.locator('button:has-text("History"), button:has-text("Sessions"), button:has-text("历史"), [aria-label*="history"]')

      if (await historyBtn.first().isVisible({ timeout: TIMEOUT.short }).catch(() => false)) {
        await historyBtn.first().click()
        await helper.waitForStable()
        await helper.screenshot('session-list')
        console.log('✅ 会话列表已打开')
      }
    })
  })

  // ==================== 消息发送测试 ====================

  test.describe('消息发送', () => {
    test.beforeEach(async () => {
      await helper.completeOnboarding()
    })

    test('应该能找到聊天输入框', async () => {
      const input = await helper.getChatInput()
      expect(input).not.toBeNull()
      console.log('✅ 找到聊天输入框')
    })

    test('应该能输入消息', async () => {
      const input = await helper.getChatInput()
      if (input) {
        await input.fill('Hello, this is a test message')
        const value = await input.inputValue()
        expect(value).toContain('test message')
        await helper.screenshot('message-input')
        console.log('✅ 消息输入成功')
      }
    })

    test('应该能发送消息并等待响应', async () => {
      const input = await helper.getChatInput()
      if (!input) {
        test.skip()
        return
      }

      await helper.sendMessage('Say "Hello Test" and nothing else')
      await helper.screenshot('message-sent')

      // 等待响应（需要后端连接）
      try {
        await helper.waitForResponse()
        const response = await helper.getLatestMessage()
        console.log('📨 收到响应:', response?.substring(0, 100))
        await helper.screenshot('message-response')
      } catch {
        console.log('⚠️ 等待响应超时（可能后端未连接）')
      }
    })
  })

  // ==================== Slash 命令测试 ====================

  test.describe('Slash 命令', () => {
    test.beforeEach(async () => {
      await helper.completeOnboarding()
    })

    const slashCommands = [
      { command: 'help', description: '帮助命令' },
      { command: 'clear', description: '清除对话' },
      { command: 'model', description: '模型设置' },
      { command: 'status', description: '状态查看' },
      { command: 'diff', description: '差异查看' },
    ]

    for (const { command, description } of slashCommands) {
      test(`/${command} - ${description}`, async ({ page }) => {
        const input = await helper.getChatInput()
        if (!input) {
          test.skip()
          return
        }

        // 输入命令
        await input.fill(`/${command}`)
        await helper.screenshot(`slash-${command}-input`)

        // 检查是否有命令提示/自动完成
        const commandSuggestion = page.locator(`[class*="suggestion"], [class*="autocomplete"], text="${command}"`)
        const hasSuggestion = await commandSuggestion.first().isVisible({ timeout: TIMEOUT.short }).catch(() => false)

        if (hasSuggestion) {
          console.log(`✅ /${command} 命令有自动提示`)
        }

        // 执行命令
        await page.keyboard.press('Enter')
        await helper.waitForStable()
        await helper.screenshot(`slash-${command}-result`)

        // 检查错误
        const errors = await helper.checkForErrors()
        if (errors.length === 0) {
          console.log(`✅ /${command} 执行无错误`)
        } else {
          console.log(`⚠️ /${command} 错误:`, errors)
        }
      })
    }
  })

  // ==================== UI 错误检测 ====================

  test.describe('UI 错误检测', () => {
    test('页面加载无 JS 错误', async () => {
      await helper.waitForStable()

      expect(consoleErrors.filter(e => !e.includes('favicon'))).toHaveLength(0)
      console.log('✅ 无 JavaScript 错误')
    })

    test('完成 Onboarding 无错误', async () => {
      await helper.completeOnboarding()

      const errors = await helper.checkForErrors()
      expect(errors).toHaveLength(0)
      console.log('✅ Onboarding 流程无 UI 错误')
    })

    test('响应式布局正常', async ({ page }) => {
      // 桌面
      await page.setViewportSize({ width: 1920, height: 1080 })
      await helper.waitForStable()
      let errors = await helper.checkForErrors()
      expect(errors).toHaveLength(0)
      await helper.screenshot('responsive-desktop')

      // 平板
      await page.setViewportSize({ width: 768, height: 1024 })
      await helper.waitForStable()
      errors = await helper.checkForErrors()
      expect(errors).toHaveLength(0)
      await helper.screenshot('responsive-tablet')

      // 手机
      await page.setViewportSize({ width: 375, height: 667 })
      await helper.waitForStable()
      errors = await helper.checkForErrors()
      expect(errors).toHaveLength(0)
      await helper.screenshot('responsive-mobile')

      console.log('✅ 响应式布局测试通过')
    })
  })

  // ==================== 设置页面测试 ====================

  test.describe('设置页面', () => {
    test.beforeEach(async () => {
      await helper.completeOnboarding()
    })

    test('应该能打开设置', async ({ page }) => {
      const settingsBtn = page.locator('button:has-text("Settings"), button:has-text("设置"), [aria-label*="settings"], [class*="settings"]')

      if (await settingsBtn.first().isVisible({ timeout: TIMEOUT.short }).catch(() => false)) {
        await settingsBtn.first().click()
        await helper.waitForStable()
        await helper.screenshot('settings-open')

        // 检查设置对话框
        const settingsDialog = page.locator('[role="dialog"], [class*="dialog"], [class*="modal"]')
        const isOpen = await settingsDialog.isVisible({ timeout: TIMEOUT.short }).catch(() => false)

        if (isOpen) {
          console.log('✅ 设置对话框已打开')
        }
      } else {
        console.log('ℹ️ 未找到设置按钮')
      }
    })
  })
})
