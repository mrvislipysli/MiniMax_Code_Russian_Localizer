const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const asar = require('@electron/asar');

console.log('============================================');
console.log(' MiniMax Design Russian Localizer');
console.log(' Version: 1.0');
console.log('============================================');

async function main() {
    const localAppData = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE, 'AppData', 'Local');
    const appDir = path.join(localAppData, 'com.minimax.hub.global', 'current', 'resources');
    const asarFile = path.join(appDir, 'app.asar');
    const extractedDir = path.join(appDir, 'app');

    if (!fs.existsSync(asarFile)) {
        console.error('[ERROR] MiniMax Design not found at:', asarFile);
        console.log('Press any key to exit...');
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.on('data', () => process.exit(1));
        return;
    }

    // 1. Fetch Dict (using offline fallback)
    const ruDictPath = path.join(__dirname, '..', 'locales', 'ru_dict.json');
    const ruDict = fs.readFileSync(ruDictPath, 'utf8');

    // 2. Kill MiniMax Design
    try {
        console.log('[1/4] Stopping MiniMax Design...');
        execSync('taskkill /f /im "MiniMax Design.exe" 2>nul');
        await new Promise(r => setTimeout(r, 1000));
    } catch (e) { }

    // 3. Extract ASAR
    console.log('[2/4] Extracting app.asar (this may take a minute)...');
    if (fs.existsSync(extractedDir)) {
        fs.rmSync(extractedDir, { recursive: true, force: true });
    }
    
    try {
        asar.extractAll(asarFile, extractedDir);
    } catch (err) {
        if (err.message && err.message.includes('Unable to extract some files:')) {
            console.log('[WARN] Some files could not be extracted (likely OS-specific binaries). Continuing...');
        } else {
            throw err;
        }
    }

    // 4. Patch Frontend
    console.log('[3/4] Injecting Russian dictionary...');
    const assetsDir = path.join(extractedDir, 'out', 'renderer', 'assets');
    const files = fs.readdirSync(assetsDir).filter(f => f.endsWith('.js'));

    for (const file of files) {
        const fullPath = path.join(assetsDir, file);
        let content = fs.readFileSync(fullPath, 'utf8');
        let patched = false;

        if (content.includes('value: "en", label: "English"')) {
            content = content.replace(/options:\s*\[\s*\{\s*value:\s*"en",\s*label:\s*"English"\s*\}\s*,\s*\{\s*value:\s*"zh",\s*label:\s*"中文"\s*\}\s*\]/, 'options: [{value:"en",label:"English"},{value:"zh",label:"中文"},{value:"ru",label:"Русский"}]');
            patched = true;
        }

        if (content.includes('config2.language === "en"')) {
            content = content.replace('config2.language === "en")', 'config2.language === "en" || config2.language === "ru")');
            patched = true;
        }

        if (content.match(/resources:\s*\{\s*en:\s*\{\s*translation:\s*[a-zA-Z0-9_$]+\s*\},\s*zh:\s*\{\s*translation:\s*[a-zA-Z0-9_$]+\s*\}\s*\}/)) {
            content = content.replace(
                /resources:\s*\{\s*en:\s*\{\s*translation:\s*[a-zA-Z0-9_$]+\s*\},\s*zh:\s*\{\s*translation:\s*[a-zA-Z0-9_$]+\s*\}\s*\}/,
                match => {
                    const idx = match.lastIndexOf('}');
                    return match.substring(0, idx) + `, ru: { translation: JSON.parse(${JSON.stringify(ruDict)}) } }`;
                }
            );
            patched = true;
        }

        if (patched) {
            fs.writeFileSync(fullPath, content);
        }
    }

    // 5. Repack ASAR
    console.log('[4/4] Repacking app.asar (this may take a minute)...');
    const backupAsar = path.join(appDir, 'app.asar.bak');
    if (!fs.existsSync(backupAsar)) {
        fs.copyFileSync(asarFile, backupAsar);
    }
    fs.rmSync(asarFile);
    await asar.createPackageWithOptions(extractedDir, asarFile, { unpack: "**/*.{node,dll,exe}" });

    console.log('Cleaning up temporary files...');
    fs.rmSync(extractedDir, { recursive: true, force: true });

    console.log('============================================');
    console.log(' DONE! The localization was successful.');
    console.log(' MiniMax Design is starting...');
    console.log('============================================');
    
    execSync(`start "" "${path.join(localAppData, 'com.minimax.hub.global', 'current', 'MiniMax Design.exe')}"`);
    
    setTimeout(() => { process.exit(0); }, 2000);
}

main().catch(err => {
    console.error('[ERROR]', err);
    console.log('Press any key to exit...');
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', () => process.exit(1));
});
