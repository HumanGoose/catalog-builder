import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

try {
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 20000 });
  await page.screenshot({ path: '/tmp/verify_01_initial.png' });
  console.log('✅ Page loaded');

  const allButtons = page.locator('button');
  const count = await allButtons.count();
  const labels = [];
  for (let i = 0; i < count; i++) {
    labels.push(await allButtons.nth(i).textContent());
  }
  console.log('All button texts:', labels.map(t => t.trim()).filter(Boolean).slice(0, 20));

  // Click catalog tab
  const catalogTab = page.getByRole('button', { name: /^catalog$/i });
  const exists = await catalogTab.count();
  console.log('Catalog tab exists:', exists > 0);
  
  if (exists > 0) {
    await catalogTab.click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: '/tmp/verify_02_catalog_tab.png' });
    console.log('✅ Clicked catalog tab');
    
    // Check for key UI elements
    const pptxLink = await page.locator('a, button').filter({ hasText: /PPTX/i }).count();
    const pdfLink = await page.locator('a, button').filter({ hasText: /PDF/i }).count();
    console.log('PPTX export button visible:', pptxLink);
    console.log('PDF export button visible:', pdfLink);
    
    const editSlideHeading = await page.locator('text=/Edit Slide/i').count();
    console.log('Edit Slide panel visible:', editSlideHeading);
    
    const refLabel = await page.locator('text=/Reference No/i').count();
    console.log('Reference No field visible:', refLabel);
    
    // Check for slide thumbnails (white background div with images)
    const slideCountText = await page.locator('text=/slides?/i').allTextContents();
    console.log('Slide count text:', slideCountText);

    // Wait for images to load in thumbnails
    await page.waitForTimeout(3000);
    await page.screenshot({ path: '/tmp/verify_03_catalog_loaded.png' });
    console.log('✅ Catalog fully loaded screenshot saved');
    
    // Check Save Changes button
    const saveBtn = await page.locator('button', { hasText: /Save Changes/i }).count();
    console.log('Save Changes button visible:', saveBtn);
    
    // Edit a field
    const refInput = page.locator('input').first();
    const inputCount = await page.locator('input').count();
    console.log('Input fields visible:', inputCount);
    
  } else {
    console.log('❌ Catalog tab NOT found');
    // Print all button texts for debugging
    console.log('Available buttons:', labels);
  }

} catch (err) {
  console.error('❌ Error:', err.message);
  await page.screenshot({ path: '/tmp/verify_error.png' }).catch(() => {});
} finally {
  await browser.close();
}
