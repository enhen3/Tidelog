import { existsSync, readFileSync } from 'node:fs';

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
const versions = JSON.parse(readFileSync('versions.json', 'utf8'));

const errors = [];

for (const file of ['main.js', 'manifest.json', 'styles.css']) {
    if (!existsSync(file)) errors.push(`Missing release asset: ${file}`);
}

if (packageJson.version !== manifest.version) {
    errors.push(`package.json version ${packageJson.version} does not match manifest.json version ${manifest.version}`);
}

if (!versions[manifest.version]) {
    errors.push(`versions.json does not contain ${manifest.version}`);
}

if (versions[manifest.version] !== manifest.minAppVersion) {
    errors.push(`versions.json maps ${manifest.version} to ${versions[manifest.version]}, expected ${manifest.minAppVersion}`);
}

if (!manifest.description.endsWith('.')) {
    errors.push('manifest.json description must end with a period.');
}

if (manifest.description.length > 250) {
    errors.push('manifest.json description must be 250 characters or fewer.');
}

if (manifest.id.includes('obsidian')) {
    errors.push('manifest.json id must not contain "obsidian".');
}

if (errors.length > 0) {
    for (const error of errors) {
        console.error(`✗ ${error}`);
    }
    process.exit(1);
}

console.log('✓ Release assets and metadata are ready.');
