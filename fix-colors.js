const fs = require('fs');
const path = require('path');

function processDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      processDir(fullPath);
    } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      const origContent = content;

      // 1. Primary actions (bg-blue-600) -> bg-[#028174] text-white hover:bg-[#026c61]
      content = content.replace(/bg-blue-600 text-white/g, 'bg-[#028174] text-white');
      content = content.replace(/hover:bg-blue-700/g, 'hover:bg-[#026c61]');
      // (Also handle text-white bg-blue-600 if inverted)
      content = content.replace(/text-white bg-blue-600/g, 'text-white bg-[#028174]');

      // 2. Dangerous actions (bg-red-600) -> bg-[#DC2626] text-white
      content = content.replace(/bg-red-600 hover:bg-red-700/g, 'bg-[#DC2626] hover:bg-[#B91C1C]');
      content = content.replace(/bg-red-600 text-white/g, 'bg-[#DC2626] text-white');

      // 3. Reactivate actions (bg-green-600) -> bg-[#0AB68B] text-white
      content = content.replace(/bg-green-600 hover:bg-green-700/g, 'bg-[#0AB68B] hover:bg-[#089774]');
      
      // 4. Cancel buttons
      // "Cancel buttons: white background, #1F2937 text, #CBD5E1 border"
      // Current: className="px-4 py-2 border rounded hover:bg-gray-50"
      content = content.replace(/px-4 py-2 border rounded hover:bg-gray-50/g, 'px-4 py-2 bg-white text-[#1F2937] border border-[#CBD5E1] rounded hover:bg-gray-50');

      // 5. Warning badges only
      // If there's a warning badge, maybe text-orange-600? No, badge. Let's look for orange or yellow bg.
      // Wait, there's text-orange-600 in Dashboard. Let's replace it with warning colors.
      content = content.replace(/text-orange-600/g, 'text-[#7C4A03] bg-[#FFE3B3] px-2 py-1 rounded-full text-sm font-medium');

      // 6. Disabled buttons: #E5E7EB background with #64748B text
      // Current: disabled:opacity-50
      content = content.replace(/disabled:opacity-50/g, 'disabled:bg-[#E5E7EB] disabled:text-[#64748B] disabled:opacity-100');

      // 7. Focus rings for primary
      content = content.replace(/focus:ring-blue-500/g, 'focus:ring-[#028174]');

      if (content !== origContent) {
        fs.writeFileSync(fullPath, content);
        console.log('Updated', fullPath);
      }
    }
  }
}

processDir(path.join(__dirname, 'apps/web/src'));
