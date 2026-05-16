import fs from 'fs';
import path from 'path';

const EXCLUDE_DIRS = ['node_modules', 'dist', '.git', '.gemini', 'scratch'];
const EXCLUDE_EXT = ['.png', '.jpg', '.jpeg', '.svg', '.webp', '.ico', '.map'];

function walkSync(currentDirPath, callback) {
    fs.readdirSync(currentDirPath).forEach(function (name) {
        var filePath = path.join(currentDirPath, name);
        var stat = fs.statSync(filePath);
        if (stat.isFile()) {
            callback(filePath, stat);
        } else if (stat.isDirectory() && !EXCLUDE_DIRS.includes(name)) {
            walkSync(filePath, callback);
        }
    });
}

function generateContext() {
    const rootDir = process.cwd();
    const outputFile = path.join(rootDir, 'llm-context.txt');
    
    let output = "# Project Codebase Context\n\n";
    
    // Add important root files
    const rootFiles = ['package.json', 'firestore.rules', 'storage.rules', 'server.ts', '.env.example'];
    
    rootFiles.forEach(file => {
        const fullPath = path.join(rootDir, file);
        if (fs.existsSync(fullPath)) {
            output += `\n\n## File: ${file}\n\`\`\`\n${fs.readFileSync(fullPath, 'utf8')}\n\`\`\`\n`;
        }
    });

    // Add src directory
    const srcDir = path.join(rootDir, 'src');
    if (fs.existsSync(srcDir)) {
        walkSync(srcDir, function(filePath, stat) {
            const ext = path.extname(filePath);
            if (!EXCLUDE_EXT.includes(ext)) {
                const relativePath = path.relative(rootDir, filePath);
                // Convert Windows backslashes to forward slashes for readability
                const normalizedPath = relativePath.split(path.sep).join('/');
                output += `\n\n## File: ${normalizedPath}\n\`\`\`\n${fs.readFileSync(filePath, 'utf8')}\n\`\`\`\n`;
            }
        });
    }

    fs.writeFileSync(outputFile, output);
    console.log(`Successfully generated context bundle at ${outputFile}`);
    console.log(`Total size: ${(fs.statSync(outputFile).size / 1024 / 1024).toFixed(2)} MB`);
}

generateContext();
