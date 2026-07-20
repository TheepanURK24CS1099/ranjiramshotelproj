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

      // Primary
      content = content.replace(/bg-blue-600 text-white/g, 'bg-[#028174] text-white');
      content = content.replace(/hover:bg-blue-700/g, 'hover:bg-[#026c61]');
      content = content.replace(/focus:ring-blue-500/g, 'focus:ring-[#028174]');

      // Dangerous
      content = content.replace(/bg-red-600 hover:bg-red-700/g, 'bg-[#DC2626] hover:bg-[#B91C1C]');
      content = content.replace(/bg-red-600 text-white/g, 'bg-[#DC2626] text-white');

      // Reactivate
      content = content.replace(/bg-green-600 hover:bg-green-700/g, 'bg-[#0AB68B] hover:bg-[#089774]');

      // Cancel buttons
      content = content.replace(/px-4 py-2 border rounded hover:bg-gray-50/g, 'px-4 py-2 bg-white text-[#1F2937] border border-[#CBD5E1] rounded hover:bg-gray-50');

      // Badges
      // Replace bg-red-100 text-red-800 (inactive badge) with the warning colors
      content = content.replace(/bg-red-100 text-red-800/g, 'bg-[#FFE3B3] text-[#7C4A03]');

      // Disabled buttons
      content = content.replace(/disabled:opacity-50/g, 'disabled:bg-[#E5E7EB] disabled:text-[#64748B] disabled:opacity-100 disabled:border-transparent');

      // In dashboard page, text-orange-600 might be the one they saw as warning?
      // I'll leave orange-600 alone unless it's a badge. Wait, the user said "Warning badges only: #FFE3B3...".
      
      if (content !== origContent) {
        fs.writeFileSync(fullPath, content);
        console.log('Updated', fullPath);
      }
    }
  }
}

processDir(path.join(__dirname, 'apps/web/src'));
