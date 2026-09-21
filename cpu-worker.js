// Run the existing Python search continuously in an independent interpreter.
import {loadPyodide} from "https://cdn.jsdelivr.net/pyodide/v314.0.4/full/pyodide.mjs";

let runtime;
const ready = (async () => {
    runtime = await loadPyodide();
    const response = await fetch(new URL("./cpu.zip", import.meta.url));
    if (!response.ok) throw new Error(`CPU package: HTTP ${response.status}`);
    runtime.unpackArchive(new Uint8Array(await response.arrayBuffer()), "zip", {extractDir: "/home/pyodide"});
    runtime.runPython("from othello.app.worker_search import choose");
    postMessage({type: "ready"});
})();
ready.catch(error => postMessage({type: "error", error: String(error)}));

self.onmessage = async ({data}) => {
    try {
        await ready;
        runtime.globals.set("request_json", JSON.stringify(data));
        // No frame timer, sleeps, or main-thread Python calls in this path.
        const result = runtime.runPython("choose(request_json)");
        postMessage(JSON.parse(result));
    } catch (error) {
        postMessage({id: data.id, error: String(error)});
    }
};
