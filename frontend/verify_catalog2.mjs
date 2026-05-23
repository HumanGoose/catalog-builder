import { chromium } from 'playwright';

const browser = await chromium.launch({ 
  headless: true,
  executablePath: '/root/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

try {
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 20000 });
  await page.screenshot({ path: '/tmp/verify_01_initial.png' });
  console.log('✅ Page loaded');

  const allButtons = page.locator('button');
  const count = await allButtons.count();
  const labels = [];
  for (let i = 0; i < Math.min(count, 15); i++) {
    labels.push((await allButtons.nth(i).textContent()).trim());
  }
  console.log('Button texts:', labels.filter(Boolean));

  const catalogTab = page.getByRole('button', { name: /^catalog$/i });
  const exists = await catalogTab.count();
  console.log('Catalog tab exists:', exists > 0);
  
  if (exists > 0) {
    await catalogTab.click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: '/tmp/verify_02_catalog_tab.png' });
    console.log('✅ Clicked catalog tab');
    
    const pptxCount = await page.locator('text=/PPTX/i').count();
    const pdfCount = await page.locator('text=/PDF/i').count();
    console.log('↓ PPTX button visible:', pptxCount > 0);
    console.log('↓ PDF button visible:', pdfCount > 0);
    
    const editSlide = await page.locator('text=/Edit Slide/i').count();
    console.log('Edit Slide panel visible:', editSlide > 0);
    
    const refNoField = await page.locator('text=/Reference No/i').count();
    console.log('Reference No. label visible:', refNoField > 0);
    
    const inputCount = await page.locator('input').count();
    console.log('Input fields in edit panel:', inputCount);
    
    const slideTexts = await page.locator('p:text-matches("\\d+ slides?")').allTextContents();
    console.log('Slide count text:', slideTexts);
    
    // Wait for images
    await page.waitForTimeout(3000);
    await page.screenshot({ path: '/tmp/verify_03_catalog_full.png' });
    console.log('✅ Final catalog screenshot saved');
    
  } else {
    console.log('❌ Catalog tab NOT found');
    console.log('Available buttons:', labels);
  }

} catch (err) {
  console.error('❌ Error:', err.message);
  await page.screenshot({ path: '/tmp/verify_error.png' }).catch(() => {});
} finally {
  await browser.close();
}
