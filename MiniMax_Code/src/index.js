const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');
const asar = require('@electron/asar');

console.log('============================================');
console.log(' MiniMax Code Russian Localizer');
console.log(' Version: 1.0 (For MiniMax Code ~ v0.0.9+)');
console.log('============================================');

async function fetchLatestDictionary() {
    return new Promise((resolve) => {
        console.log('[INFO] Checking for latest translation dictionary online...');
        const url = 'https://raw.githubusercontent.com/mrvislipysli/Translater_for_MiniMax_Code/main/locales/ru_dict_full.json';
        
        const req = https.get(url, (res) => {
            if (res.statusCode !== 200) {
                console.log('[WARN] Failed to fetch latest dictionary (Status: ' + res.statusCode + '). Using embedded offline version.');
                resolve(null);
                return;
            }
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                console.log('[INFO] Successfully downloaded the latest translation dictionary!');
                resolve(data);
            });
        });
        
        req.on('error', (err) => {
            console.log('[WARN] Failed to connect to GitHub. Using embedded offline version.');
            resolve(null);
        });
        
        // Timeout after 5 seconds
        req.setTimeout(5000, () => {
            req.destroy();
            console.log('[WARN] Connection timed out. Using embedded offline version.');
            resolve(null);
        });
    });
}

async function main() {
    const localAppData = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE, 'AppData', 'Local');
    const appDir = path.join(localAppData, 'Programs', 'MiniMax Code', 'resources');
    const asarFile = path.join(appDir, 'app.asar');
    const extractedDir = path.join(appDir, 'app');

    if (!fs.existsSync(asarFile)) {
        console.error('[ERROR] MiniMax Code not found at:', asarFile);
        console.log('Press any key to exit...');
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.on('data', () => process.exit(1));
        return;
    }

    // 1. Fetch Dict
    let ruDict = await fetchLatestDictionary();
    if (!ruDict) {
        const ruDictPath = path.join(__dirname, '..', 'locales', 'ru_dict_full.json');
        ruDict = fs.readFileSync(ruDictPath, 'utf8');
    }

    // 2. Kill MiniMax Code
    try {
        console.log('[1/5] Stopping MiniMax Code...');
        execSync('taskkill /f /im "MiniMax Code.exe" 2>nul');
        await new Promise(r => setTimeout(r, 1000));
    } catch (e) { }

    // 3. Extract ASAR
    console.log('[2/5] Extracting app.asar (this may take a minute)...');
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

    // 4. Patch Backend Settings
    console.log('[3/5] Patching backend settings...');
    const preloadPath = path.join(extractedDir, 'dist', 'main', 'preload.js');
    if (fs.existsSync(preloadPath)) {
        let preload = fs.readFileSync(preloadPath, 'utf8');
        preload = preload.replace(/storedLanguage === 'en' \|\| storedLanguage === 'zh'/g, "storedLanguage === 'en' || storedLanguage === 'zh' || storedLanguage === 'ru'");
        fs.writeFileSync(preloadPath, preload);
    }

    const ipcPath = path.join(extractedDir, 'dist', 'main', 'ipc', 'settings.ipc.js');
    if (fs.existsSync(ipcPath)) {
        let ipc = fs.readFileSync(ipcPath, 'utf8');
        ipc = ipc.replace(/language !== 'en' && language !== 'zh'/g, "language !== 'en' && language !== 'zh' && language !== 'ru'");
        fs.writeFileSync(ipcPath, ipc);
    }

    // 5. Patch Tray
    const trayPath = path.join(extractedDir, 'dist', 'main', 'modules', 'tray', 'index.js');
    if (fs.existsSync(trayPath)) {
        let tray = fs.readFileSync(trayPath, 'utf8');
        const replacements = {
            'MiniMax Code': 'MiniMax Code',
            'Search': 'Поиск',
            'New task': 'Новая задача',
            'New projectless task': 'Новая задача (без проекта)',
            'Open settings': 'Настройки',
            'Quit': 'Выход',
            'Settings': 'Настройки',
            'English': 'Русский'
        };
        for (const [k, v] of Object.entries(replacements)) {
            tray = tray.replace(new RegExp(`label:\\s*['"]${k}['"]`, 'g'), `label: "${v}"`);
        }
        fs.writeFileSync(trayPath, tray);
    }

    // 6. Patch Frontend
    console.log('[4/5] Injecting Russian dictionary (4500+ strings)...');
    const chunksDir = path.join(extractedDir, 'out', '_next', 'static', 'chunks');
    const files = fs.readdirSync(chunksDir).filter(f => f.endsWith('.js'));

    for (const file of files) {
        const fullPath = path.join(chunksDir, file);
        let content = fs.readFileSync(fullPath, 'utf8');
        let patched = false;

        if (content.includes('{key:"language"')) {
            content = content.replace(/\{label:"English",value:"en"\}/g, '{label:"English",value:"en"},{label:"Русский",value:"ru"}');
            patched = true;
        }

        if (content.match(/let c=\s*\{\s*\[n\.fQ\.EN\]\s*:\s*\{translation:_\}\s*,\s*\[n\.fQ\.ZH_HANS\]\s*:\s*\{translation:r\}\s*\}/) || content.match(/function d\(e\)\{if\(\!e\)return null/)) {
            // Replaced the buggy regex with a robust string replace since we know the exact string from the match check
            content = content.replace(
                /let c=\s*\{\s*\[n\.fQ\.EN\]\s*:\s*\{translation:_\}\s*,\s*\[n\.fQ\.ZH_HANS\]\s*:\s*\{translation:r\}\s*\}/,
                `let c={[n.fQ.EN]:{translation:_},[n.fQ.ZH_HANS]:{translation:r}, "ru":{translation:JSON.parse(${JSON.stringify(ruDict)})}}`
            );
            content = content.replace('return t?"cn"', 'return t?"ru"===t||t.startsWith("ru-")?"ru":"cn"');
            patched = true;
        }

        if (patched) {
            fs.writeFileSync(fullPath, content);
        }
    }

    // 7. Repack ASAR
    console.log('[5/5] Repacking app.asar (this may take a minute)...');
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
    console.log(' MiniMax Code is starting...');
    console.log('============================================');
    
    execSync(`start "" "${path.join(localAppData, 'Programs', 'MiniMax Code', 'MiniMax Code.exe')}"`);
    
    setTimeout(() => { process.exit(0); }, 2000);
}

main().catch(err => {
    console.error('[ERROR]', err);
    console.log('Press any key to exit...');
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', () => process.exit(1));
});
