import { renderContextBanner } from "../components/banner.js";
export function createTuiApp(deps) {
    const { input, renderer, theme, banners } = deps;
    const stack = [];
    let resolveRun = null;
    let cleanupRegistered = false;
    let cleanupHandlers = [];
    let resizeHandler;
    // `push()` peut être appelé avant `run()` (pattern `push(homeView); await run();`
    // de bootstrap.ts). Sans ce garde, ce premier push rendrait sur stdout AVANT que
    // `run()` n'ait activé le raw mode (`input.start()`) -- fenêtre pendant laquelle
    // le terminal est encore en mode cooked (ICRNL actif : un `\r` tapé/envoyé très
    // vite après l'affichage peut être livré comme `\n` non reconnu). `running`
    // retarde le tout premier rendu jusqu'à ce que `run()` ait démarré la boucle.
    let running = false;
    function topScene() {
        return stack[stack.length - 1];
    }
    function renderTop() {
        const top = topScene();
        if (top === undefined)
            return;
        const columns = deps.viewport?.().columns;
        if (columns !== undefined && columns < 60) {
            renderer.redraw((line) => {
                line("Terminal trop étroit pour le cockpit arka-norn.");
                line(`Largeur actuelle : ${columns} colonnes · minimum : 60.`);
                line("Agrandis la fenêtre ; l'écran se redessinera automatiquement.");
            });
            return;
        }
        renderer.redraw((line) => {
            const chrome = top.chrome ?? {};
            if (chrome.header !== false && banners?.header !== undefined) {
                for (const l of banners.header())
                    line(l);
            }
            if (chrome.contextBanner !== false && banners?.context !== undefined) {
                for (const l of renderContextBanner(banners.context(), theme))
                    line(l);
                line("");
            }
            const captured = [];
            const sceneRenderer = {
                begin: () => {
                    captured.length = 0;
                },
                line: (s) => {
                    captured.push(s);
                },
                commit: () => { },
                redraw: (fn) => {
                    captured.length = 0;
                    fn((s) => captured.push(s));
                },
                destroy: () => { },
                get lastFrameLines() {
                    return captured.length;
                },
            };
            top.render(sceneRenderer, theme);
            for (const l of captured)
                line(l);
        });
    }
    function dispatchKey(event) {
        if (event.kind === "interrupt") {
            stack.length = 0;
            finishRun();
            return;
        }
        const top = topScene();
        if (top === undefined) {
            finishRun();
            return;
        }
        const result = top.onKey(event);
        if (result === "pop") {
            stack.pop();
            if (stack.length === 0) {
                finishRun();
                return;
            }
        }
        renderTop();
    }
    function finishRun() {
        if (resolveRun !== null) {
            const r = resolveRun;
            resolveRun = null;
            r();
        }
    }
    function registerHandlers() {
        if (cleanupRegistered)
            return;
        cleanupRegistered = true;
        const onSignal = (signal) => {
            return () => {
                try {
                    input.stop();
                    renderer.destroy();
                }
                catch {
                    // best-effort during process teardown
                }
                if (signal === "SIGINT" || signal === "SIGTERM") {
                    process.exit(signal === "SIGINT" ? 130 : 143);
                }
            };
        };
        const handlers = [
            { signal: "SIGINT", handler: onSignal("SIGINT") },
            { signal: "SIGTERM", handler: onSignal("SIGTERM") },
            { signal: "exit", handler: onSignal("exit") },
        ];
        for (const { signal, handler } of handlers) {
            process.on(signal, handler);
        }
        cleanupHandlers = handlers;
        resizeHandler = () => renderTop();
        process.stdout.on("resize", resizeHandler);
    }
    function unregisterHandlers() {
        if (!cleanupRegistered)
            return;
        for (const { signal, handler } of cleanupHandlers) {
            process.off(signal, handler);
        }
        cleanupHandlers = [];
        if (resizeHandler !== undefined)
            process.stdout.off("resize", resizeHandler);
        resizeHandler = undefined;
        cleanupRegistered = false;
    }
    return {
        push(scene) {
            stack.push(scene);
            if (running)
                renderTop();
        },
        pop() {
            stack.pop();
            if (stack.length === 0) {
                finishRun();
                return;
            }
            if (running)
                renderTop();
        },
        topScene,
        redraw: renderTop,
        async run(opts = {}) {
            const registerSig = opts.registerProcessHandlers ?? true;
            running = true;
            input.start();
            if (registerSig)
                registerHandlers();
            const unsubKey = input.on(dispatchKey);
            try {
                renderTop();
                await new Promise((resolve) => {
                    resolveRun = resolve;
                    if (stack.length === 0) {
                        const r = resolveRun;
                        resolveRun = null;
                        r();
                    }
                });
            }
            finally {
                running = false;
                unsubKey();
                try {
                    input.stop();
                }
                catch {
                    // best-effort
                }
                try {
                    renderer.destroy();
                }
                catch {
                    // best-effort
                }
                unregisterHandlers();
            }
        },
    };
}
//# sourceMappingURL=tui-app.js.map