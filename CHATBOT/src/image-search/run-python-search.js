const { spawn } = require("child_process");
const path = require("path");
const { ROOT } = require("../config/paths");

const PYTHON_CANDIDATES = process.platform === "win32" ? ["python", "py"] : ["python3", "python"];

function spawnPython(args) {
    return new Promise((resolve, reject) => {
        const script = path.join(ROOT, "search_image.py");
        let index = 0;

        const tryNext = () => {
            if (index >= PYTHON_CANDIDATES.length) {
                reject(new Error("Khong tim thay python/python3 de chay search_image.py"));
                return;
            }

            const cmd = PYTHON_CANDIDATES[index++];
            const child = spawn(cmd, [script, ...args], {
                cwd: ROOT,
                windowsHide: true,
            });

            let stdout = "";
            let stderr = "";

            child.stdout.on("data", (chunk) => {
                stdout += chunk.toString();
            });
            child.stderr.on("data", (chunk) => {
                stderr += chunk.toString();
            });

            child.on("error", (err) => {
                if (err.code === "ENOENT") {
                    tryNext();
                    return;
                }
                reject(err);
            });

            child.on("close", (code) => {
                const text = stdout.trim();
                if (!text) {
                    reject(new Error(stderr.trim() || `Python thoat voi ma ${code}`));
                    return;
                }
                try {
                    resolve(JSON.parse(text));
                } catch (e) {
                    reject(new Error(stderr.trim() || text || e.message));
                }
            });
        };

        tryNext();
    });
}

function runImageSearchFromUrl(imageUrl) {
    return spawnPython(["--json-url", imageUrl]);
}

module.exports = { runImageSearchFromUrl };
