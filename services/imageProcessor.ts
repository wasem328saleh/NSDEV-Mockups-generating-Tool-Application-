
import { LogoEffects } from '../types';

export const imageProcessor = {
  async applyLogo(mockupBase64: string, logoBase64: string, effects: LogoEffects): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = mockupBase64;
      img.onload = () => {
        const logo = new Image();
        logo.src = logoBase64;
        logo.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (!ctx) return reject('No context');

          canvas.width = img.width;
          canvas.height = img.height;

          // 1. Draw Mockup
          ctx.drawImage(img, 0, 0);

          // 2. Calculate Logo Dimensions based on target scale (responsive to image size)
          // effects.size represents % of the shorter edge
          const baseDim = Math.min(img.width, img.height);
          const logoW = baseDim * (effects.size / 100);
          const logoH = (logo.height / logo.width) * logoW;

          // 3. Calculate Position
          let x = 0, y = 0;
          const padding = baseDim * 0.05; // 5% responsive padding

          switch (effects.position) {
            case 'top-left': x = padding; y = padding; break;
            case 'top-center': x = (img.width - logoW) / 2; y = padding; break;
            case 'top-right': x = img.width - logoW - padding; y = padding; break;
            case 'middle-left': x = padding; y = (img.height - logoH) / 2; break;
            case 'middle-center': x = (img.width - logoW) / 2; y = (img.height - logoH) / 2; break;
            case 'middle-right': x = img.width - logoW - padding; y = (img.height - logoH) / 2; break;
            case 'bottom-left': x = padding; y = img.height - logoH - padding; break;
            case 'bottom-center': x = (img.width - logoW) / 2; y = img.height - logoH - padding; break;
            case 'bottom-right': x = img.width - logoW - padding; y = img.height - logoH - padding; break;
          }

          ctx.save();
          
          // 4. Transform (Rotation)
          ctx.translate(x + logoW / 2, y + logoH / 2);
          ctx.rotate((effects.rotation * Math.PI) / 180);
          ctx.translate(-(x + logoW / 2), -(y + logoH / 2));

          // 5. Apply Shadow (Soft outer shadow for realism)
          if (effects.shadow.enabled || true) { // Enabled by default for professional look
            ctx.shadowBlur = effects.shadow.enabled ? effects.shadow.blur : 15;
            ctx.shadowColor = effects.shadow.enabled ? effects.shadow.color : 'rgba(0,0,0,0.4)';
            ctx.shadowOffsetX = effects.shadow.enabled ? effects.shadow.offset.x : 5;
            ctx.shadowOffsetY = effects.shadow.enabled ? effects.shadow.offset.y : 5;
          }

          // 6. Glow Effect
          if (effects.glow.enabled) {
            ctx.shadowBlur = effects.glow.strength;
            ctx.shadowColor = effects.glow.color;
          }

          // 7. Opacity
          ctx.globalAlpha = effects.opacity / 100;

          // 8. Draw Logo
          ctx.drawImage(logo, x, y, logoW, logoH);

          // 9. Border
          if (effects.border.enabled) {
            ctx.strokeStyle = effects.border.color;
            ctx.lineWidth = effects.border.width;
            ctx.strokeRect(x, y, logoW, logoH);
          }

          ctx.restore();
          resolve(canvas.toDataURL('image/png'));
        };
        logo.onerror = reject;
      };
      img.onerror = reject;
    });
  }
};
