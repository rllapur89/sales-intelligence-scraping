/**
 * Post-build script: Fix <base href> for Electron compatibility
 * 
 * Electron uses file:// protocol, which requires <base href> to be "./"
 * instead of "/" to resolve relative paths correctly.
 */

const fs = require('fs');
const path = require('path');

const indexPath = path.join(__dirname, '..', 'dist', 'electron', 'browser', 'index.html');

try {
  let html = fs.readFileSync(indexPath, 'utf-8');
  
  // Replace <base href="/"> with <base href="./">
  html = html.replace(/<base href="\/">/g, '<base href="./">');
  
  fs.writeFileSync(indexPath, html, 'utf-8');
  console.log('✅ Fixed <base href> for Electron compatibility');
} catch (error) {
  console.error('❌ Error fixing Electron base href:', error.message);
  process.exit(1);
}
