import fs from "fs";
import path from "path";

const safeReadUtf8 = (filePath, maxBytes = 2 * 1024 * 1024) => {
    try {
        const s = fs.statSync(filePath);
        if (!s.isFile() || s.size > maxBytes) return null;
        return fs.readFileSync(filePath, "utf-8");
    } catch {
        return null;
    }
};

export const parseGenericDataFlow = (repoDir, ext, filePaths) => {
    const routes = [];
    
    for (const abs of filePaths) {
        const content = safeReadUtf8(abs);
        if (!content) continue;

        const lines = content.split(/\r?\n/);

        // Python (Flask/FastAPI/Django)
        if (ext === ".py") {
            let currentRoutePath = null;
            let currentMethod = "GET";

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                
                // FastAPI / Flask
                let m = line.match(/^@(app|router|bp)\.(get|post|put|delete|patch|route)\(['"]([^'"]+)['"]/i);
                if (m) {
                    currentMethod = m[2].toUpperCase() === "ROUTE" ? "GET" : m[2].toUpperCase();
                    currentRoutePath = m[3];
                    continue;
                }

                // Django
                let mDjango = line.match(/^path\(['"]([^'"]+)['"]/i);
                if (mDjango) {
                    currentMethod = "ALL";
                    currentRoutePath = mDjango[1];
                    // attempt to find view name later on the same line
                    let viewMatch = line.match(/,\s*([\w\.]+)/);
                    if (viewMatch) {
                        routes.push({
                            method: currentMethod,
                            path: currentRoutePath,
                            routeFile: abs,
                            handlers: [{ name: viewMatch[1], controllerFile: abs }]
                        });
                        currentRoutePath = null;
                        continue;
                    }
                }
                
                if (currentRoutePath && line.startsWith("def ")) {
                    const funcMatch = line.match(/^def\s+([a-zA-Z0-9_]+)/);
                    if (funcMatch) {
                        routes.push({
                            method: currentMethod,
                            path: currentRoutePath,
                            routeFile: abs,
                            handlers: [{ name: funcMatch[1], controllerFile: abs }]
                        });
                        currentRoutePath = null;
                    }
                }
            }
        }
        
        // Java Spring Boot
        if (ext === ".java") {
            let classRoutePrefix = "";
            let currentRoutePath = null;
            let currentMethod = "GET";

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                
                let mClass = line.match(/^@RequestMapping\(['"]([^'"]+)['"]/i);
                if (mClass && !line.includes("method")) {
                    classRoutePrefix = mClass[1];
                }

                let mRoute = line.match(/^@(Get|Post|Put|Delete|Patch)Mapping\(['"]([^'"]+)['"]/i);
                if (mRoute) {
                    currentMethod = mRoute[1].toUpperCase();
                    currentRoutePath = mRoute[2];
                }

                if (currentRoutePath && line.match(/(?:public|private|protected)\s+.*?([a-zA-Z0-9_]+)\s*\(/)) {
                    const funcMatch = line.match(/(?:public|private|protected)\s+.*?([a-zA-Z0-9_]+)\s*\(/);
                    const finalPath = classRoutePrefix + (currentRoutePath.startsWith("/") ? currentRoutePath : "/" + currentRoutePath);
                    routes.push({
                        method: currentMethod,
                        path: finalPath.replace(/\/\//g, "/"),
                        routeFile: abs,
                        handlers: [{ name: funcMatch[1], controllerFile: abs }]
                    });
                    currentRoutePath = null;
                }
            }
        }

        // Go (Gin/Mux/Chi)
        if (ext === ".go") {
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                let m = line.match(/(GET|POST|PUT|DELETE|PATCH)\(['"]([^'"]+)['"],\s*([\w\.]+)/i);
                if (m) {
                    routes.push({
                        method: m[1].toUpperCase(),
                        path: m[2],
                        routeFile: abs,
                        handlers: [{ name: m[3], controllerFile: abs }]
                    });
                } else {
                    let mStd = line.match(/HandleFunc\(['"]([^'"]+)['"],\s*([\w\.]+)/i);
                    if (mStd) {
                        routes.push({
                            method: "ALL",
                            path: mStd[1],
                            routeFile: abs,
                            handlers: [{ name: m[2], controllerFile: abs }]
                        });
                    }
                }
            }
        }
    }

    return routes;
};
