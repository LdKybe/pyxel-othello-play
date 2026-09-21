// Python owns the search; one timer yields between bounded slices.
import {loadPyodide} from "https://cdn.jsdelivr.net/pyodide/v314.0.4/full/pyodide.mjs";

let session;
let timer = null;
let current = null;
let failed = false;
const fail = error => {
    failed = true;
    postMessage({type:"error", game_id:current?.game_id ?? 0,
        revision:current?.revision ?? 0, message:String(error)});
};
const ready = (async () => {
    const runtime = await loadPyodide();
    const response = await fetch(new URL("./cpu.zip", import.meta.url));
    if (!response.ok) throw new Error(`CPU package: HTTP ${response.status}`);
    runtime.unpackArchive(new Uint8Array(await response.arrayBuffer()), "zip", {extractDir:"/home/pyodide"});
    session = runtime.runPython("from othello.app.worker_search import WorkerSession\nWorkerSession()");
    postMessage({type:"ready"});
})();
ready.catch(fail);

function schedule() {
    if (failed || timer !== null || session.phase === "READY" || session.phase === "CLOSED") return;
    timer = setTimeout(() => {
        timer = null;
        if (failed) return;
        try {
            const raw = session.tick();
            if (raw) postMessage(JSON.parse(raw));
            schedule();
        } catch (error) { fail(error); }
    }, 0);
}
self.onmessage = async ({data}) => {
    try {
        await ready;
        if (failed) return;
        current = data;
        if (data.type === "start") session.start(JSON.stringify(data));
        else if (data.type === "update") session.update(JSON.stringify(data));
        else throw new Error("Unknown request type");
        schedule();
    } catch (error) { fail(error); }
};
