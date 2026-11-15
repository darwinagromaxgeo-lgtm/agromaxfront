const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const logo = fs.readFileSync(path.join(root, 'public/brand/agromax-compacto.png'));
if (logo.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('El logo de marca debe ser un PNG válido');
const output = path.join(root, 'src/shared/branding/logoData.ts');
const source = '// Generado por scripts/sync-brand-assets.cjs. Permite incluir el logo en PDF sin llamadas de red.\nexport default ' + JSON.stringify('data:image/png;base64,' + logo.toString('base64')) + ';\n';
if (!fs.existsSync(output) || fs.readFileSync(output, 'utf8') !== source) fs.writeFileSync(output, source);
