// Python owns command semantics. JavaScript serializes delivery and yields between steps.
import {loadPyodide} from "https://cdn.jsdelivr.net/pyodide/v314.0.4/full/pyodide.mjs";

let session;
let timer = null;
let failed = false;
let queue = Promise.resolve();

function stopTimer() {
    if (timer !== null) clearTimeout(timer);
    timer = null;
}
function drain() {
    for (let raw = session.poll(); raw; raw = session.poll()) postMessage(raw);
    if (session.closed) stopTimer();
}
function fail(error) {
    if (failed) return;
    failed = true;
    stopTimer();
    const errors = [error];
    if (session) {
        // Preserve the fatal Python notice before discarding its remaining state.
        try { drain(); } catch (failure) { errors.push(failure); }
        try { session.close(); } catch (failure) { errors.push(failure); }
        try { session.destroy(); } catch (failure) { errors.push(failure); }
        session = undefined;
    }
    postMessage({transport_error: errors.map(item => item.stack || String(item)).join("\n")});
}
const ready = (async () => {
    const runtime = await loadPyodide();
    const response = await fetch(new URL("./cpu.zip", import.meta.url));
    if (!response.ok) throw new Error("CPU package: HTTP " + response.status);
    runtime.unpackArchive(new Uint8Array(await response.arrayBuffer()), "zip",
        {extractDir: "/home/pyodide"});
    runtime.globals.set("_worker_session_id", new URL(import.meta.url).searchParams.get("session"));
    session = runtime.runPython(
        "from othello.execution.browser.worker import WorkerSession\n" +
        "from othello.execution.contracts import SessionId\n" +
        "_worker_session = WorkerSession(session_id=SessionId(int(_worker_session_id)))\n" +
        "del _worker_session_id\n_worker_session");
})();
ready.catch(fail);

function schedule() {
    if (failed || timer !== null || session.closed) return;
    timer = setTimeout(() => {
        timer = null;
        if (failed || session.closed) return;
        try {
            const worked = session.tick();
            drain();
            if (worked) schedule();
        } catch (error) { fail(error); }
    }, 0);
}
self.onmessage = ({data}) => {
    queue = queue.then(async () => {
        await ready;
        if (failed || session.closed) return;
        if (typeof data !== "string") throw new TypeError("Worker request must be a string");
        session.accept(data);
        drain();
        schedule();
    }).catch(fail);
    return queue;
};
self.onmessageerror = () => fail(new Error("Worker request could not be received"));
