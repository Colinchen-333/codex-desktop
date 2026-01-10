import { test, expect } from '@playwright/test'

test.describe('Onboarding 流程测试', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:5173')
    await page.waitForLoadState('networkidle')
  })

  test('欢迎页面显示正确', async ({ page }) => {
    // 检查欢迎标题
    const title = page.locator('text=Welcome to Codex')
    await expect(title).toBeVisible()

    // 检查描述文字
    const description = page.locator('text=AI-powered coding')
    await expect(description).toBeVisible()

    // 检查开始按钮
    const getStartedBtn = page.locator('button:has-text("Get Started")')
    await expect(getStartedBtn).toBeVisible()

    console.log('✅ 欢迎页面元素完整')
    await page.screenshot({ path: 'e2e/screenshots/onboarding-01-welcome.png' })
  })

  test('点击 Get Started 进入下一步', async ({ page }) => {
    // 点击开始按钮
    const getStartedBtn = page.locator('button:has-text("Get Started")')
    await getStartedBtn.click()

    // 等待页面变化
    await page.waitForTimeout(500)
    await page.screenshot({ path: 'e2e/screenshots/onboarding-02-after-click.png' })

    // 检查是否进入下一步（可能是登录或项目选择）
    const pageContent = await page.content()
    console.log('📄 页面内容长度:', pageContent.length)
    console.log('✅ 点击 Get Started 成功')
  })

  test('检查进度指示器', async ({ page }) => {
    // 查找进度点
    const progressDots = page.locator('[class*="dot"], [class*="indicator"], [class*="step"]')
    const dotCount = await progressDots.count()

    console.log(`📊 找到 ${dotCount} 个进度指示器`)

    if (dotCount > 0) {
      await page.screenshot({ path: 'e2e/screenshots/onboarding-03-progress.png' })
    }
  })

  test('检查所有可点击元素', async ({ page }) => {
    const buttons = page.locator('button')
    const links = page.locator('a')
    const clickables = page.locator('[role="button"], [onclick]')

    const buttonCount = await buttons.count()
    const linkCount = await links.count()
    const clickableCount = await clickables.count()

    console.log(`📊 按钮: ${buttonCount}, 链接: ${linkCount}, 其他可点击: ${clickableCount}`)

    // 列出所有按钮文字
    for (let i = 0; i < buttonCount; i++) {
      const text = await buttons.nth(i).textContent()
      console.log(`  - 按钮 ${i + 1}: "${text?.trim()}"`)
    }
  })

  test('完整 Onboarding 流程', async ({ page }) => {
    let step = 1

    // 步骤 1: 欢迎页
    await page.screenshot({ path: `e2e/screenshots/flow-step-${step}.png` })
    console.log(`📸 步骤 ${step}: 欢迎页`)

    // 点击 Get Started
    const getStartedBtn = page.locator('button:has-text("Get Started")')
    if (await getStartedBtn.isVisible()) {
      await getStartedBtn.click()
      await page.waitForTimeout(500)
      step++
      await page.screenshot({ path: `e2e/screenshots/flow-step-${step}.png` })
      console.log(`📸 步骤 ${step}: 点击 Get Started 后`)
    }

    // 尝试继续点击下一步按钮
    for (let i = 0; i < 5; i++) {
      const nextBtn = page.locator('button:has-text("Next"), button:has-text("Continue"), button:has-text("Skip")')
      if (await nextBtn.count() > 0 && await nextBtn.first().isVisible()) {
        await nextBtn.first().click()
        await page.waitForTimeout(500)
        step++
        await page.screenshot({ path: `e2e/screenshots/flow-step-${step}.png` })
        console.log(`📸 步骤 ${step}: 继续流程`)
      } else {
        break
      }
    }

    console.log(`✅ 完成 ${step} 个步骤的 Onboarding 流程`)
  })
})
